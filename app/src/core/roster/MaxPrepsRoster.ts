/**
 * The roster MaxPreps embeds in its own page.
 *
 * A MaxPreps roster page is a Next.js app, and `__NEXT_DATA__` carries `athleteData`: one row
 * per athlete as a positional array — first name, last name, grade, jersey number, an offensive
 * position, a defensive position, a combined "RB, MLB", the full name, the class. Reading it is
 * instant and free, where sending the page to a model takes ten seconds and a few cents, and it
 * keeps both positions, which the model path used to collapse to one.
 *
 * The columns are unnamed, so every row is checked against itself before it is believed: the
 * full-name column must equal first plus last, and the combined-positions column must be made of
 * the two position columns. A page whose layout has changed fails those checks and falls back to
 * the model, rather than yielding a roster with the columns shifted.
 */

import type { ImportedPlayer } from "./RosterImporter";
import { Positions } from "./Positions";

/** Column positions as observed on maxpreps.com in the 2026 season. */
const COL = { first: 5, last: 6, grade: 7, jersey: 8, position1: 12, position2: 13, positions: 32, fullName: 33, classYear: 36 };

export const MaxPrepsRoster = {
  /** Players from the page's embedded data, or null when the page has none the parser trusts. */
  parse(html: string, sport: string): ImportedPlayer[] | null {
    const rows = MaxPrepsRoster.athleteRows(html);
    if (!rows) return null;
    const players: ImportedPlayer[] = [];
    for (const row of rows) {
      const p = MaxPrepsRoster.player(row, sport);
      if (!p) return null; // one row the parser cannot vouch for means the layout is not the one it knows
      players.push(p);
    }
    return players.length ? players : null;
  },

  athleteRows(html: string): unknown[][] | null {
    const open = html.indexOf('<script id="__NEXT_DATA__"');
    if (open < 0) return null;
    const start = html.indexOf(">", open);
    const close = html.indexOf("</script>", start + 1);
    if (start < 0 || close < 0) return null;
    let root: unknown;
    try { root = JSON.parse(html.slice(start + 1, close)); } catch { return null; }
    const data = ((root as Record<string, unknown>)?.props as Record<string, unknown>)?.pageProps as Record<string, unknown> | undefined;
    const rows = data?.athleteData;
    if (!Array.isArray(rows) || !rows.length || !rows.every((r) => Array.isArray(r))) return null;
    return rows as unknown[][];
  },

  /** One row, believed only when its columns agree with one another. */
  player(row: unknown[], sport: string): ImportedPlayer | null {
    const text = (i: number) => { const v = row[i]; return typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : ""; };
    const first = text(COL.first), last = text(COL.last), full = text(COL.fullName);
    if (!first && !last) return null;
    if (full && full !== `${first} ${last}`.trim()) return null;
    const p1 = text(COL.position1), p2 = text(COL.position2), combined = text(COL.positions);
    const pieces = Positions.split(combined);
    if (combined && ![p1, p2].filter(Boolean).every((p) => pieces.includes(p))) return null;
    const printed = combined || [p1, p2].filter(Boolean).join(", ");
    const parsed = Positions.parse(printed, sport);
    return {
      jerseyNumber: text(COL.jersey),
      firstName: first,
      lastName: last,
      position: parsed.position,
      side: parsed.side === "unknown" ? null : parsed.side,
      secondaryPosition: parsed.secondary?.position ?? null,
      secondarySide: parsed.secondary?.side ?? null,
      classYear: text(COL.classYear) || null,
    };
  },
};
