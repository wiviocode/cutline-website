/**
 * Reading a desk's own event headline back: "Nebraska Football v Bowling Green State University
 * - 2026-09-12", "Waverly Girls Volleyball v Gretna - 2026-09-24". An ingest template often writes
 * one into every frame before Cutline sees the folder, and it names the sport and both teams.
 */

import type { Gender, SportID } from "./Sports";

export interface HeadlineGuess {
  home: string;
  away: string;
  sport: SportID | null;
  gender: Gender | null;
  /** "Girls" and "Boys" are high school; "Women's" and "Men's" college. */
  level: "highSchool" | "college" | null;
}

const SPORT_WORDS: [RegExp, SportID][] = [
  [/football/i, "football"], [/basketball/i, "basketball"], [/volleyball/i, "volleyball"], [/soccer/i, "soccer"],
  [/softball/i, "softball"], [/baseball/i, "baseball"], [/cross[- ]country/i, "crossCountry"], [/track/i, "trackAndField"],
];

export function parseHeadline(headline: string): HeadlineGuess | null {
  const h = headline.replace(/\s+-\s+\d{4}-\d{2}-\d{2}\s*$/, "").trim();
  const m = /^(.+?)\s+v(?:s\.?)?\s+(.+)$/i.exec(h);
  if (!m) return null;
  const left = m[1].trim(), away = m[2].trim();
  const hit = SPORT_WORDS.find(([re]) => re.test(left));
  if (!hit) return null;
  const idx = left.search(/\b(men'?s|women'?s|boys'?|girls'?)?\s*(football|basketball|volleyball|soccer|softball|baseball|cross[- ]country|track)/i);
  const home = (idx > 0 ? left.slice(0, idx) : left).trim();
  const gender: Gender | null = /\b(women'?s|girls'?)\b/i.test(left) ? "womens" : /\b(men'?s|boys'?)\b/i.test(left) ? "mens" : null;
  if (!home || !away) return null;
  const level = /\b(girls|boys)\b/i.test(left) ? "highSchool" : /\b(women|men)/i.test(left) ? "college" : null;
  return { home, away, sport: hit[1], gender, level };
}
