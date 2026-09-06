// The relay, against a fake network: who it answers, what it refuses to read, and what it
// hands back. It sits on the origin that holds the user's key, so every one of these is a rule
// about what can and cannot come through that origin.

import { describe, it, expect } from "vitest";
import { createRelay, checkTarget, isPublicIP, RateLimiter, CALLER_HEADER, type RelayDeps } from "../../api/fetch";

const APP = { [CALLER_HEADER]: "1" };
const req = (qs: string, headers: Record<string, string> = APP) => new Request(`https://www.cutline.photo/api/fetch?${qs}`, { headers });
const page = (body: string, type = "text/html; charset=utf-8", status = 200, headers: Record<string, string> = {}) =>
  new Response(body, { status, headers: { "content-type": type, ...headers } });
type Routes = Record<string, (url: string) => Response | Promise<Response>>;
const net = (routes: Routes): RelayDeps["fetch"] => async (input) => {
  const url = String(input);
  const key = Object.keys(routes).find((k) => url.startsWith(k));
  if (!key) throw new Error("no route for " + url);
  return routes[key](url);
};
const dns = (table: Record<string, string[]>): RelayDeps["lookup"] => async (host) => {
  if (!(host in table)) throw new Error("ENOTFOUND");
  return table[host];
};
const relay = (routes: Routes, table: Record<string, string[]>, extra: Partial<RelayDeps> = {}) =>
  createRelay({ fetch: net(routes), lookup: dns(table), ...extra });

const PUBLIC = ["151.101.1.1"];

describe("Who the relay answers", () => {
  const routes: Routes = { "https://www.maxpreps.com/": () => page("<html>roster</html>") };
  const table = { "www.maxpreps.com": PUBLIC };

  it("answers only a request carrying the app's header", async () => {
    const r = relay(routes, table);
    expect((await r(req("url=https://www.maxpreps.com/x", {}))).status).toBe(403);
    expect((await r(req("ping=1", {}))).status).toBe(403);
    expect((await r(req("url=https://www.maxpreps.com/x", { [CALLER_HEADER]: "yes" }))).status).toBe(403);
    expect((await r(req("ping=1"))).status).toBe(200);
    const ok = await r(req("url=https://www.maxpreps.com/x"));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ url: "https://www.maxpreps.com/x", text: "<html>roster</html>", contentType: "text/html; charset=utf-8" });
    expect(ok.headers.get("cache-control")).toBe("no-store");
  });

  it("gives each caller a fixed number of reads in a window, then a 429", async () => {
    let t = 0;
    const lim = new RateLimiter(3, 1000, () => t);
    expect([lim.allow("a"), lim.allow("a"), lim.allow("a"), lim.allow("a")]).toEqual([true, true, true, false]);
    expect(lim.allow("b")).toBe(true);
    t = 1001;
    expect(lim.allow("a")).toBe(true);

    const r = relay(routes, table, { limiter: new RateLimiter(1, 60_000) });
    const ip = { ...APP, "x-forwarded-for": "203.0.113.9, 10.0.0.1" };
    expect((await r(req("url=https://www.maxpreps.com/x", ip))).status).toBe(200);
    expect((await r(req("url=https://www.maxpreps.com/x", ip))).status).toBe(429);
    expect((await r(req("url=https://www.maxpreps.com/x", { ...APP, "x-forwarded-for": "198.51.100.7" }))).status).toBe(200);
    // A ping is not a read.
    expect((await r(req("ping=1", ip))).status).toBe(200);
  });

  it("answers GET and nothing else", async () => {
    const r = relay(routes, table);
    const post = new Request("https://www.cutline.photo/api/fetch?url=https://www.maxpreps.com/x", { method: "POST", headers: APP });
    expect((await r(post)).status).toBe(405);
  });
});

describe("What the relay refuses to read", () => {
  it("knows a private address in either family", () => {
    const priv = ["10.0.0.1", "127.0.0.1", "169.254.169.254", "172.16.5.5", "172.31.255.255", "192.168.1.1", "100.64.0.1", "100.127.9.9", "0.0.0.0",
      "192.0.0.1", "192.0.2.7", "198.18.0.1", "198.51.100.4", "203.0.113.2", "224.0.0.1", "240.0.0.1", "255.255.255.255",
      "::1", "::", "fc00::1", "fd12:3456::1", "fe80::1", "ff02::1", "::ffff:10.0.0.1", "::ffff:127.0.0.1", "::ffff:169.254.169.254",
      "64:ff9b::7f00:1", "2002:0a00:0001::", "2001:db8::1"];
    for (const ip of priv) expect(isPublicIP(ip), ip).toBe(false);
    const pub = ["8.8.8.8", "151.101.1.1", "172.32.0.1", "100.128.0.1", "2606:4700::1111", "::ffff:8.8.8.8", "2002:0808:0808::", "64:ff9b::808:808", "2a00:1450:4009::1"];
    for (const ip of pub) expect(isPublicIP(ip), ip).toBe(true);
    expect(isPublicIP("not an address")).toBe(false);
    expect(isPublicIP("1.2.3")).toBe(false);
    expect(isPublicIP("1:2:3:4:5:6:7:8:9")).toBe(false);
  });

  it("refuses addresses that cannot be a public web page before any lookup", () => {
    const why = (u: string) => { const r = checkTarget(u); return r.ok ? "ok" : r.reason; };
    expect(why("ftp://x.example/")).toMatch(/http/);
    expect(why("file:///etc/passwd")).toMatch(/http/);
    expect(why("javascript:alert(1)")).toMatch(/http/);
    expect(why("http://user:pw@x.example/")).toMatch(/password/);
    expect(why("http://x.example:8080/")).toMatch(/ports/);
    expect(why("http://x.example:22/")).toMatch(/ports/);
    expect(why("http://localhost/")).toMatch(/public/);
    expect(why("http://foo.localhost/")).toMatch(/public/);
    expect(why("http://printer.local/")).toMatch(/public/);
    expect(why("http://metadata.internal/")).toMatch(/public/);
    expect(why("http://[::1]/")).toMatch(/public/);
    expect(why("http://[fe80::1]/")).toMatch(/public/);
    expect(why("http://127.1/")).toMatch(/public/);           // the URL parser normalises it to 127.0.0.1
    expect(why("http://0x7f.0.0.1/")).toMatch(/public/);      // and this
    expect(why("http://169.254.169.254/latest/")).toMatch(/public/);
    expect(why("http://10.0.0.5/")).toMatch(/public/);
    expect(why("nonsense")).toMatch(/web address/);
    expect(why("")).toMatch(/web address/);
    expect(why("https://www.maxpreps.com:443/x")).toBe("ok");
    expect(why("http://huskers.com/sports/soccer/roster")).toBe("ok");
    expect(why("https://8.8.8.8/")).toBe("ok");
  });

  it("resolves the name first and refuses one that points inside", async () => {
    const r = relay({ "http://": () => page("secret") }, { "evil.example": ["10.0.0.5"], "mixed.example": ["151.101.1.1", "127.0.0.1"], "v6.example": ["fd00::1"], "fine.example": PUBLIC });
    for (const h of ["evil.example", "mixed.example", "v6.example"]) {
      const res = await r(req(`url=http://${h}/`));
      expect(res.status, h).toBe(400);
      expect((await res.json()).error).toMatch(/public/);
    }
    const gone = await r(req("url=http://nowhere.example/"));
    expect(gone.status).toBe(400);
    expect((await gone.json()).error).toMatch(/could not be found/);
    expect((await r(req("url=http://fine.example/"))).status).toBe(200);
  });

  it("checks every redirect the same way, and gives up after five", async () => {
    const routes: Routes = {
      "https://a.example/inside": () => page("", "text/html", 302, { location: "http://10.0.0.9/admin" }),
      "https://a.example/insideName": () => page("", "text/html", 302, { location: "https://evil.example/" }),
      "https://a.example/scheme": () => page("", "text/html", 302, { location: "file:///etc/passwd" }),
      "https://a.example/hop": () => page("", "text/html", 301, { location: "/landed" }),
      "https://a.example/landed": () => page("<p>here</p>"),
      "https://a.example/loop": () => page("", "text/html", 302, { location: "https://a.example/loop" }),
      "https://a.example/nowhere": () => page("", "text/html", 302),
    };
    const r = relay(routes, { "a.example": PUBLIC, "evil.example": ["192.168.0.2"] });
    expect((await r(req("url=https://a.example/inside"))).status).toBe(400);
    expect((await r(req("url=https://a.example/insideName"))).status).toBe(400);
    expect((await r(req("url=https://a.example/scheme"))).status).toBe(400);
    const landed = await r(req("url=https://a.example/hop"));
    expect(landed.status).toBe(200);
    expect(await landed.json()).toMatchObject({ url: "https://a.example/landed", text: "<p>here</p>" });
    const loop = await r(req("url=https://a.example/loop"));
    expect(loop.status).toBe(502);
    expect((await loop.json()).error).toMatch(/too many times/);
    expect((await r(req("url=https://a.example/nowhere"))).status).toBe(502);
  });
});

describe("What the relay hands back", () => {
  const table = { "site.example": PUBLIC };

  it("raw mode returns only an image, sandboxed so it can never run as a page here", async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const r = relay({
      "https://site.example/logo.png": () => new Response(png, { headers: { "content-type": "image/png" } }),
      "https://site.example/logo.svg": () => new Response("<svg/>", { headers: { "content-type": "image/svg+xml; charset=utf-8" } }),
      "https://site.example/page": () => page("<script>steal()</script>"),
      "https://site.example/untyped": () => new Response(png),
    }, table);
    const img = await r(req("raw=1&url=https://site.example/logo.png"));
    expect(img.status).toBe(200);
    expect(img.headers.get("content-type")).toBe("image/png");
    expect(img.headers.get("content-security-policy")).toBe("sandbox");
    expect(img.headers.get("x-content-type-options")).toBe("nosniff");
    expect(img.headers.get("cache-control")).toContain("max-age");
    expect(new Uint8Array(await img.arrayBuffer())).toEqual(png);
    const svg = await r(req("raw=1&url=https://site.example/logo.svg"));
    expect(svg.headers.get("content-type")).toBe("image/svg+xml");
    expect(svg.headers.get("content-security-policy")).toBe("sandbox");
    const html = await r(req("raw=1&url=https://site.example/page"));
    expect(html.status).toBe(415);
    expect(html.headers.get("content-type")).toBe("application/json");
    expect((await r(req("raw=1&url=https://site.example/untyped"))).status).toBe(415);
  });

  it("text mode returns only text, and truncates at the cap", async () => {
    const big = "x".repeat(2_500_000);
    const r = relay({
      "https://site.example/zip": () => new Response(new Uint8Array(10), { headers: { "content-type": "application/zip" } }),
      "https://site.example/img": () => new Response(new Uint8Array(10), { headers: { "content-type": "image/png" } }),
      "https://site.example/big": () => page(big),
      "https://site.example/json": () => new Response("{}", { headers: { "content-type": "application/json" } }),
      "https://site.example/untyped": () => new Response(new Uint8Array([104, 105])),
    }, table);
    expect((await r(req("url=https://site.example/zip"))).status).toBe(415);
    expect((await r(req("url=https://site.example/img"))).status).toBe(415);
    const t = await (await r(req("url=https://site.example/big"))).json();
    expect(t.text.length).toBe(2_000_000);
    expect((await r(req("url=https://site.example/json"))).status).toBe(200);
    // No content type at all is tolerated: some hand-made school sites send none.
    expect(await (await r(req("url=https://site.example/untyped"))).json()).toMatchObject({ text: "hi" });
  });

  it("gives up on a site that does not answer", async () => {
    const hanging: RelayDeps["fetch"] = (_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
    });
    const r = createRelay({ fetch: hanging, lookup: dns(table), timeoutMs: 30 });
    const res = await r(req("url=https://site.example/slow"));
    expect(res.status).toBe(504);
    expect((await res.json()).error).toMatch(/took too long/);
  });

  it("reports an upstream error status without passing its body through", async () => {
    const r = relay({ "https://site.example/missing": () => page("<h1>nope</h1>", "text/html", 404) }, table);
    const res = await r(req("url=https://site.example/missing"));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toMatch(/HTTP 404/);
    expect(JSON.stringify(body)).not.toContain("nope");
  });

  it("wants a url", async () => {
    const r = relay({}, table);
    expect((await r(req(""))).status).toBe(400);
    expect((await r(req("url="))).status).toBe(400);
  });
});
