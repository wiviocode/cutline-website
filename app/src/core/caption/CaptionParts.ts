/**
 * Locating the player names inside a finished caption.
 *
 * Correcting an identification should be one click on the wrong name, not retyping a sentence.
 * The names are found by searching the caption for roster players rather than by having the
 * composer emit spans — which still works on a caption a person has since edited by hand.
 */

import { Roster, RosterPlayer, type Team } from "../roster/Roster";

export interface CaptionSpan {
  id: number;
  text: string;
  /** The roster player this run names, or null when it is ordinary caption text. */
  player: RosterPlayer | null;
  team: Team | null;
}

export const CaptionParts = {
  /**
   * Split a caption into alternating plain and player-name runs. Longest names first: "Anna Mae
   * Carter" must win over a teammate called "Anna Mae".
   */
  split(caption: string, roster: Roster): CaptionSpan[] {
    if (!caption) return [];
    const hits: { start: number; end: number; player: RosterPlayer }[] = [];
    const byLength = [...roster.players].sort((a, b) => RosterPlayer.fullName(b).length - RosterPlayer.fullName(a).length);
    for (const player of byLength) {
      const name = RosterPlayer.fullName(player).trim();
      if (name.length <= 1) continue;
      let from = 0;
      while (from < caption.length) {
        const at = caption.indexOf(name, from);
        if (at < 0) break;
        const end = at + name.length;
        const overlaps = hits.some((h) => h.start < end && at < h.end);
        if (!overlaps && isWholeWord(caption, at, end)) hits.push({ start: at, end, player });
        from = end;
      }
    }
    if (hits.length === 0) return [{ id: 0, text: caption, player: null, team: null }];
    hits.sort((a, b) => a.start - b.start);

    const spans: CaptionSpan[] = [];
    let cursor = 0, next = 0;
    for (const hit of hits) {
      if (cursor < hit.start) spans.push({ id: next++, text: caption.slice(cursor, hit.start), player: null, team: null });
      spans.push({ id: next++, text: caption.slice(hit.start, hit.end), player: hit.player, team: Roster.teamOf(roster, hit.player) });
      cursor = hit.end;
    }
    if (cursor < caption.length) spans.push({ id: next++, text: caption.slice(cursor), player: null, team: null });
    return spans;
  },

  /**
   * Break a plain run into pieces a wrapping layout can put on separate lines. Each piece keeps
   * the space that followed it, so reassembling the pieces gives back the original exactly.
   */
  wrappablePieces(text: string): string[] {
    const pieces: string[] = [];
    let current = "";
    let startedWord = false;
    for (const ch of text) {
      current += ch;
      if (ch === " " || ch === " ") {
        if (startedWord) { pieces.push(current); current = ""; startedWord = false; }
      } else {
        startedWord = true;
      }
    }
    if (current) pieces.push(current);
    return pieces;
  },
};

const isWordChar = (c: string | undefined) => !!c && /[\p{L}\p{N}]/u.test(c);

/** A name must not match inside a longer word; a possessive "Lewis's" still counts. */
function isWholeWord(text: string, start: number, end: number): boolean {
  if (start > 0 && isWordChar(text[start - 1])) return false;
  if (end < text.length && isWordChar(text[end])) return false;
  return true;
}
