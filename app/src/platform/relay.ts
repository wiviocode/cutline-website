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
    throw new Error(detail);
  }
  const j = (await res.json()) as { url: string; text: string };
  if (!j.text) throw new Error("That page came back empty.");
  return { url: j.url, text: j.text };
}

export async function relayAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL.replace(/app\/$/, "")}api/fetch?ping=1`, { headers: RELAY_HEADERS });
    return res.ok;
  } catch { return false; }
}
