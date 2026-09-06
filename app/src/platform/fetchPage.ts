/**
 * Fetching a team's page.
 *
 * The one thing a page cannot do for itself is read another site: athletics sites do not serve
 * CORS headers, so the browser refuses. A small relay at `/api/fetch` reads the page and hands
 * back its text — it holds nothing and sends nothing else. When the relay is unreachable (a
 * static deployment, or offline), the user can paste the page's text instead, and extraction
 * runs on that exactly as it would have.
 */

import { RosterImporter } from "@core/roster/RosterImporter";

/**
 * The relay answers only requests carrying this header. A page on another origin cannot add a
 * custom header without a preflight the relay never grants, which is what keeps a relay on the
 * app's own domain from being everyone's. The name is a literal here on purpose: the app must
 * never import the relay's module, which reaches for Node's resolver.
 */
export const RELAY_HEADERS: Record<string, string> = { "x-cutline-relay": "1" };

export interface FetchedPage { url: string; text: string; contentType: string }

export class FetchError extends Error {
  constructor(message: string, public readonly status?: number) { super(message); this.name = "FetchError"; }
}

export async function fetchPage(url: string): Promise<FetchedPage> {
  const res = await fetch(`/api/fetch?url=${encodeURIComponent(url)}`, { headers: { accept: "application/json", ...RELAY_HEADERS } });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try { const j = await res.json(); if (j?.error) detail = j.error; } catch { /* plain */ }
    throw new FetchError(detail, res.status);
  }
  const j = (await res.json()) as { url: string; text: string; contentType: string };
  if (!j.text) throw new FetchError("That page came back empty.");
  return j;
}

/** A logo, through the same relay, as a blob. Anything implausibly large is refused. */
export async function fetchLogo(url: string): Promise<{ blob: Blob; extension: string } | null> {
  const res = await fetch(`/api/fetch?raw=1&url=${encodeURIComponent(url)}`, { headers: RELAY_HEADERS });
  if (!res.ok) return null;
  const blob = await res.blob();
  if (!blob.size || blob.size > 4_000_000) return null;
  const type = blob.type || res.headers.get("content-type") || "";
  const extension = type.includes("gif") ? "gif" : type.includes("svg") ? "svg" : type.includes("jpeg") ? "jpg" : type.includes("webp") ? "webp" : "png";
  return { blob, extension };
}

/** Whether the relay answers at all — decides whether to offer a URL field or only paste. */
export async function relayAvailable(): Promise<boolean> {
  try {
    const res = await fetch("/api/fetch?ping=1", { method: "GET", headers: RELAY_HEADERS });
    return res.ok;
  } catch { return false; }
}

export { RosterImporter };
