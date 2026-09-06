/**
 * A relay for reading a public web page — the one thing a browser page cannot do for itself.
 *
 * GET /api/fetch?url=<https://…>           → { url, text, contentType }   (text only, 2 MB cap)
 * GET /api/fetch?url=<https://…>&raw=1     → the bytes of an image, with its content type (logos)
 * GET /api/fetch?ping=1                    → 200
 *
 * It reads and returns. It sends no cookies and keeps nothing. Because it sits on the app's own
 * domain, it is careful about who it answers and what it hands back:
 *
 *  - It answers only the app. Every request must carry the `x-cutline-relay` header. A page on
 *    another origin cannot send a custom header without a preflight this relay never grants,
 *    so a stray tab, a typed address, an image tag or another site gets a 403.
 *  - It reads only public addresses. The hostname is resolved first, and every address it
 *    resolves to must be public — loopback, private, link-local, carrier-grade NAT and the cloud
 *    metadata range are refused, in IPv4 and in IPv6 including the mapped and NAT64 forms — and
 *    each redirect is checked the same way before it is followed. (The address is resolved once
 *    here and once again by the fetch; a name that changes its answer between the two is the
 *    residual risk, and the reason the function reaches nothing private in the first place.)
 *  - Raw mode returns only images, under `Content-Security-Policy: sandbox`, so nothing fetched
 *    through here can ever run as a page on this origin — the origin that holds the user's key.
 *    Text mode returns only text.
 *  - Each caller gets sixty reads in ten minutes.
 *
 * No photographs, captions or keys ever pass through here.
 */

import { lookup as dnsLookup } from "node:dns/promises";

/** A slow athletics site is the common case; the platform's default ten seconds was not enough. */
export const maxDuration = 20;

const MAX_TEXT_BYTES = 2_000_000;
const MAX_RAW_BYTES = 4_000_000;
const TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 5;
const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 10 * 60 * 1000;
/** The header the app sends. Kept as a literal in the app too — it must never import this file. */
export const CALLER_HEADER = "x-cutline-relay";
const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}

// ---- addresses ----

/** A dotted quad to its four octets, or null. The URL parser has already normalised shorthand. */
export function parseIPv4(s: string): number[] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s);
  if (!m) return null;
  const o = m.slice(1).map(Number);
  return o.every((n) => n <= 255) ? o : null;
}

/** An IPv6 address to its sixteen bytes, or null. Handles `::` and an IPv4 tail. */
export function parseIPv6(s: string): number[] | null {
  let str = s.trim();
  if (str.startsWith("[") && str.endsWith("]")) str = str.slice(1, -1);
  const zone = str.indexOf("%");
  if (zone >= 0) str = str.slice(0, zone);
  if (!/^[0-9a-fA-F:.]+$/.test(str)) return null;
  const halves = str.split("::");
  if (halves.length > 2) return null;
  const groups = (part: string): number[] | null => {
    if (part === "") return [];
    const out: number[] = [];
    const items = part.split(":");
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.includes(".")) {
        if (i !== items.length - 1) return null;
        const v4 = parseIPv4(it);
        if (!v4) return null;
        out.push((v4[0] << 8) | v4[1], (v4[2] << 8) | v4[3]);
      } else {
        if (!/^[0-9a-fA-F]{1,4}$/.test(it)) return null;
        out.push(parseInt(it, 16));
      }
    }
    return out;
  };
  const head = groups(halves[0]);
  const tail = halves.length === 2 ? groups(halves[1]) : [];
  if (!head || !tail) return null;
  let words: number[];
  if (halves.length === 2) {
    const fill = 8 - head.length - tail.length;
    if (fill < 1) return null;
    words = [...head, ...new Array<number>(fill).fill(0), ...tail];
  } else {
    if (head.length !== 8) return null;
    words = head;
  }
  const bytes: number[] = [];
  for (const w of words) bytes.push(w >> 8, w & 0xff);
  return bytes;
}

/** Everything a request from a cloud function must never reach. */
export function isPublicIPv4(o: number[]): boolean {
  const [a, b, c] = o;
  if (a === 0 || a === 10 || a === 127) return false;                 // this host, private, loopback
  if (a === 100 && b >= 64 && b <= 127) return false;                 // carrier-grade NAT
  if (a === 169 && b === 254) return false;                           // link-local, and cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return false;                  // private
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false;     // IETF, documentation
  if (a === 192 && b === 168) return false;                           // private
  if (a === 198 && (b === 18 || b === 19)) return false;              // benchmarking
  if (a === 198 && b === 51 && c === 100) return false;               // documentation
  if (a === 203 && b === 0 && c === 113) return false;                // documentation
  if (a >= 224) return false;                                         // multicast, reserved, broadcast
  return true;
}

export function isPublicIP(ip: string): boolean {
  const v4 = parseIPv4(ip);
  if (v4) return isPublicIPv4(v4);
  const b = parseIPv6(ip);
  if (!b) return false;
  const zeroUpTo = (n: number) => b.slice(0, n).every((x) => x === 0);
  if (zeroUpTo(15) && (b[15] === 0 || b[15] === 1)) return false;                                   // :: and ::1
  if (zeroUpTo(10) && b[10] === 0xff && b[11] === 0xff) return isPublicIPv4(b.slice(12));            // ::ffff:a.b.c.d
  if (b[0] === 0x00 && b[1] === 0x64 && b[2] === 0xff && b[3] === 0x9b && b.slice(4, 12).every((x) => x === 0)) return isPublicIPv4(b.slice(12)); // 64:ff9b::/96 NAT64
  if (b[0] === 0x20 && b[1] === 0x02) return isPublicIPv4(b.slice(2, 6));                           // 2002::/16 carries an IPv4
  if ((b[0] & 0xfe) === 0xfc) return false;                                                         // fc00::/7 unique local
  if (b[0] === 0xfe && (b[1] & 0xc0) === 0x80) return false;                                        // fe80::/10 link-local
  if (b[0] === 0xff) return false;                                                                  // multicast
  if (b[0] === 0x20 && b[1] === 0x01 && b[2] === 0x0d && b[3] === 0xb8) return false;               // documentation
  return true;
}

/** The rules a target must pass before its name is even looked up. */
export function checkTarget(raw: string): { ok: true; url: URL } | { ok: false; reason: string } {
  let u: URL;
  try { u = new URL(raw); } catch { return { ok: false, reason: "that is not a web address" }; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return { ok: false, reason: "only http(s) addresses can be read" };
  if (u.username || u.password) return { ok: false, reason: "an address with a password in it cannot be read" };
  if (u.port && u.port !== "80" && u.port !== "443") return { ok: false, reason: "only the standard web ports can be read" };
  const h = u.hostname.toLowerCase();
  const notPublic = { ok: false as const, reason: "only public addresses can be read" };
  if (!h || h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".arpa") || h.endsWith(".home")) return notPublic;
  if (h.startsWith("[") || h.includes(":")) return notPublic; // IPv6 literals are not athletics sites
  const v4 = parseIPv4(h);
  if (v4 && !isPublicIPv4(v4)) return notPublic;
  return { ok: true, url: u };
}

// ---- callers ----

export function callerAllowed(request: Request): boolean {
  return request.headers.get(CALLER_HEADER) === "1";
}

function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim() || "unknown";
  return request.headers.get("x-real-ip") ?? "local";
}

/** A sliding window per caller. Per instance, so best effort — enough to blunt a loop. */
export class RateLimiter {
  private readonly hits = new Map<string, number[]>();
  constructor(private readonly limit: number, private readonly windowMs: number, private readonly now: () => number = Date.now) {}

  allow(key: string): boolean {
    const t = this.now();
    const floor = t - this.windowMs;
    const list = (this.hits.get(key) ?? []).filter((x) => x > floor);
    if (list.length >= this.limit) { this.hits.set(key, list); return false; }
    list.push(t);
    this.hits.set(key, list);
    if (this.hits.size > 10_000) this.hits.clear(); // a flood from many addresses must not grow without bound
    return true;
  }
}

// ---- the relay ----

export interface RelayDeps {
  fetch: (input: string, init?: RequestInit) => Promise<Response>;
  /** Every address a hostname resolves to. Throws when it does not resolve. */
  lookup: (hostname: string) => Promise<string[]>;
  now: () => number;
  timeoutMs: number;
  limiter: RateLimiter;
}

const isTextual = (kind: string) =>
  kind.startsWith("text/") || kind === "application/xhtml+xml" || kind === "application/xml" || kind === "application/json" || kind === "application/rss+xml";

async function readCapped(res: Response, max: number): Promise<Uint8Array> {
  const reader = res.body?.getReader();
  if (!reader) return new Uint8Array(0);
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    chunks.push(value);
    if (total >= max) { await reader.cancel().catch(() => {}); break; }
  }
  const bytes = new Uint8Array(Math.min(total, max));
  let o = 0;
  for (const c of chunks) { const n = Math.min(c.byteLength, bytes.length - o); bytes.set(c.subarray(0, n), o); o += n; if (o >= bytes.length) break; }
  return bytes;
}

/** The relay with its network injected, so it can be tested against a fake one. */
export function createRelay(deps: Partial<RelayDeps> = {}): (request: Request) => Promise<Response> {
  const fetchImpl = deps.fetch ?? ((input, init) => fetch(input, init));
  const lookup = deps.lookup ?? (async (host) => (await dnsLookup(host, { all: true, verbatim: true })).map((a) => a.address));
  const now = deps.now ?? Date.now;
  const timeoutMs = deps.timeoutMs ?? TIMEOUT_MS;
  const limiter = deps.limiter ?? new RateLimiter(RATE_LIMIT, RATE_WINDOW_MS, now);

  /** Null when every address behind the name is public; otherwise why not. */
  const resolvePublic = async (host: string): Promise<string | null> => {
    if (parseIPv4(host)) return null; // a literal was checked already
    let addresses: string[];
    try { addresses = await lookup(host); } catch { return `${host} could not be found`; }
    if (!addresses.length) return `${host} could not be found`;
    if (addresses.some((a) => !isPublicIP(a))) return "only public addresses can be read";
    return null;
  };

  return async function GET(request: Request): Promise<Response> {
    if (request.method !== "GET") return json({ error: "GET only" }, 405);
    if (!callerAllowed(request)) return json({ error: "this relay answers only Cutline" }, 403);
    const q = new URL(request.url).searchParams;
    if (q.get("ping")) return json({ ok: true });
    if (!limiter.allow(clientKey(request))) return json({ error: "too many reads in a short time — wait a few minutes" }, 429);

    const target = q.get("url");
    if (!target) return json({ error: "url is required" }, 400);
    const raw = !!q.get("raw");
    const first = checkTarget(target);
    if (!first.ok) return json({ error: first.reason }, 400);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let u = first.url;
    try {
      let upstream: Response | null = null;
      for (let hop = 0; ; hop++) {
        const bad = await resolvePublic(u.hostname);
        if (bad) return json({ error: bad }, 400);
        const res = await fetchImpl(u.toString(), {
          headers: { "user-agent": USER_AGENT, accept: raw ? "image/*,*/*;q=0.5" : "text/html,application/xhtml+xml,*/*;q=0.5" },
          redirect: "manual",
          signal: controller.signal,
        });
        if (res.status >= 300 && res.status < 400) {
          const location = res.headers.get("location");
          await res.body?.cancel().catch(() => {});
          if (!location) return json({ error: `HTTP ${res.status} from ${u.host}` }, 502);
          if (hop >= MAX_REDIRECTS) return json({ error: `${u.host} redirected too many times` }, 502);
          let next: URL;
          try { next = new URL(location, u); } catch { return json({ error: `${u.host} redirected somewhere unreadable` }, 502); }
          const check = checkTarget(next.toString());
          if (!check.ok) return json({ error: check.reason }, 400);
          u = check.url;
          continue;
        }
        upstream = res;
        break;
      }
      if (!upstream.ok) { await upstream.body?.cancel().catch(() => {}); return json({ error: `HTTP ${upstream.status} from ${u.host}` }, 502); }
      const contentType = (upstream.headers.get("content-type") ?? "").toLowerCase();
      const kind = contentType.split(";")[0].trim();
      if (raw && !kind.startsWith("image/")) { await upstream.body?.cancel().catch(() => {}); return json({ error: "that address is not an image" }, 415); }
      if (!raw && kind && !isTextual(kind)) { await upstream.body?.cancel().catch(() => {}); return json({ error: "that address is not a web page" }, 415); }

      const bytes = await readCapped(upstream, raw ? MAX_RAW_BYTES : MAX_TEXT_BYTES);
      if (raw) {
        return new Response(bytes as unknown as BodyInit, { status: 200, headers: {
          "content-type": kind,
          "cache-control": "public, max-age=86400",
          // Never a page on this origin, whatever the bytes are.
          "content-security-policy": "sandbox",
          "x-content-type-options": "nosniff",
        } });
      }
      const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
      return json({ url: u.toString(), text, contentType });
    } catch (e) {
      const aborted = (e as Error).name === "AbortError";
      return json({ error: aborted ? `${u.host} took too long to answer` : `could not reach ${u.host}` }, 504);
    } finally {
      clearTimeout(timer);
    }
  };
}

export const GET = createRelay();
