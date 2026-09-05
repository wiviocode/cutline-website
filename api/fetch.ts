/**
 * A relay for reading a public web page — the one thing a browser page cannot do for itself.
 *
 * GET /api/fetch?url=<https://…>           → { url, text, contentType }   (text only, 2 MB cap)
 * GET /api/fetch?url=<https://…>&raw=1     → the bytes, with the upstream content type (logos)
 * GET /api/fetch?ping=1                    → 200
 *
 * It reads and returns. It sends no cookies, keeps nothing, and refuses anything that is not a
 * public http(s) address. No photographs, captions or keys ever pass through here.
 */

const MAX_BYTES = 2_000_000;
const TIMEOUT_MS = 15_000;
const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}

function isPublicHTTP(u: URL): boolean {
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  const h = u.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return false;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) {
    const [a, b] = h.split(".").map(Number);
    if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return false;
  }
  if (h.includes(":")) return false; // IPv6 literals are not athletics sites
  return true;
}

export async function GET(request: Request): Promise<Response> {
  const q = new URL(request.url).searchParams;
  if (q.get("ping")) return json({ ok: true });

  const target = q.get("url");
  if (!target) return json({ error: "url is required" }, 400);
  let u: URL;
  try { u = new URL(target); } catch { return json({ error: "that is not a web address" }, 400); }
  if (!isPublicHTTP(u)) return json({ error: "only public http(s) addresses can be read" }, 400);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const upstream = await fetch(u.toString(), {
      headers: { "user-agent": USER_AGENT, accept: q.get("raw") ? "image/*,*/*" : "text/html,application/xhtml+xml,*/*" },
      redirect: "follow",
      signal: controller.signal,
    });
    if (!upstream.ok) return json({ error: `HTTP ${upstream.status} from ${u.host}` }, 502);
    const contentType = upstream.headers.get("content-type") ?? "";
    const reader = upstream.body?.getReader();
    if (!reader) return json({ error: "empty response" }, 502);
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > (q.get("raw") ? 4_000_000 : MAX_BYTES)) { reader.cancel(); break; }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total > 0 ? Math.min(total, q.get("raw") ? 4_000_000 : MAX_BYTES) : 0);
    let o = 0;
    for (const c of chunks) { const n = Math.min(c.byteLength, bytes.length - o); bytes.set(c.subarray(0, n), o); o += n; if (o >= bytes.length) break; }

    if (q.get("raw")) {
      return new Response(bytes, { status: 200, headers: { "content-type": contentType || "application/octet-stream", "cache-control": "public, max-age=86400" } });
    }
    const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    return json({ url: upstream.url, text, contentType });
  } catch (e) {
    const aborted = (e as Error).name === "AbortError";
    return json({ error: aborted ? `${u.host} took too long to answer` : `could not reach ${u.host}` }, 504);
  } finally {
    clearTimeout(timer);
  }
}
