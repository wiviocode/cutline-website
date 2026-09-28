/**
 * Reading another site's page — the one thing a browser page cannot do for itself. A small relay
 * on this site (/api/fetch) reads public pages and hands back their text, slimmed to what a
 * roster reader needs. When it cannot be reached, the photographer pastes the page instead.
 */

import type { FetchedPage } from "@core/roster/RosterImport";

/** The relay answers only requests carrying this header, which another origin cannot send. */
export const RELAY_HEADERS: Record<string, string> = { "x-cutline-relay": "1" };

export async function fetchPage(url: string): Promise<FetchedPage> {
  const res = await fetch(`${import.meta.env.BASE_URL.replace(/app\/$/, "")}api/fetch?url=${encodeURIComponent(url)}`, { headers: { accept: "application/json", ...RELAY_HEADERS } });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try { const j = await res.json(); if (j?.error) detail = j.error; } catch { /* plain */ }
    throw new Error(plainly(detail));
  }
  const j = (await res.json()) as { url: string; text: string };
  if (!j.text) throw new Error("That page came back empty.");
  return { url: j.url, text: j.text };
}

/** "HTTP 404 from huskers.com", said the way a photographer needs it. */
function plainly(detail: string): string {
  const m = /^HTTP (\d{3}) from (.+)$/.exec(detail);
  if (!m) return detail;
  const [, code, host] = m;
  if (code === "404" || code === "410") return `${host} has no page at that address. Check the link, or open the roster in your browser and use Paste.`;
  if (code === "401" || code === "403" || code === "429") return `${host} would not let the page be read automatically. Open the roster in your browser, copy it and use Paste.`;
  if (code.startsWith("5")) return `${host} could not serve the page just now (${code}). Try again in a moment, or paste the roster.`;
  return `${host} answered ${code}. Check the link, or paste the roster.`;
}

export async function relayAvailable(): Promise<boolean> {

  try {
    const res = await fetch(`${import.meta.env.BASE_URL.replace(/app\/$/, "")}api/fetch?ping=1`, { headers: RELAY_HEADERS });
    return res.ok;
  } catch { return false; }
}
