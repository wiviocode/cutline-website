/**
 * The filename convention, as a pattern the photographer can change.
 *
 * No wire service publishes one. So there is nothing to hard-code except the one convention
 * that *was* published: Hurrdat's, which is the default here. Everyone else's desk gets a
 * pattern they can type.
 */

import { HDSNaming, type Fixture } from "./HDSNaming";

export const NamingPattern = {
  /** `JSP20230909_FB_NU_v_OS_0001.jpg` — the HDS convention, unchanged. */
  hurrdat: "{initials}{date}_{sport}_{team}_{vs}_{opponent}_{seq}",

  /** Every token, with what it stands for. Order is the order they are offered in. */
  tokens: [
    { token: "{initials}", meaning: "your initials" },
    { token: "{date}",     meaning: "the capture date, YYYYMMDD" },
    { token: "{sport}",    meaning: "the sport code — FB, VB, WSOC" },
    { token: "{team}",     meaning: "the team you covered" },
    { token: "{opponent}", meaning: "the other team" },
    { token: "{vs}",       meaning: "v when they hosted, at when they travelled" },
    { token: "{home}",     meaning: "the home team" },
    { token: "{away}",     meaning: "the visiting team" },
    { token: "{seq}",      meaning: "the frame number, 0001" },
  ],

  /** Any `{token}` in the pattern that this does not understand — a typo the photographer wants to know about. */
  unknownTokens(pattern: string): string[] {
    const known = new Set(NamingPattern.tokens.map((t) => t.token));
    return (pattern.match(/\{[^}]*\}/g) ?? []).filter((t) => !known.has(t));
  },

  /** Fill the pattern in for one frame. */
  stem(pattern: string, fixture: Fixture, sequence: number): string {
    const covered = HDSNaming.schoolCode(fixture.covered).code;
    const opponent = HDSNaming.schoolCode(fixture.opponent).code;
    const values: Record<string, string> = {
      "{initials}": fixture.initials,
      "{date}": HDSNaming.dateStamp(fixture.date),
      "{sport}": fixture.sportCode,
      "{team}": covered,
      "{opponent}": opponent,
      "{vs}": fixture.coveredIsHome ? "v" : "at",
      "{home}": fixture.coveredIsHome ? covered : opponent,
      "{away}": fixture.coveredIsHome ? opponent : covered,
      "{seq}": String(Math.max(sequence, 0)).padStart(4, "0"),
    };
    let out = pattern;
    for (const [token, value] of Object.entries(values)) out = out.split(token).join(value);
    return sanitised(out);
  },

  filename(pattern: string, fixture: Fixture, sequence: number, extension: string): string {
    const stem = NamingPattern.stem(pattern, fixture, sequence);
    return extension ? `${stem}.${extension.toLowerCase()}` : stem;
  },
};

/**
 * Make a typed pattern safe to write to disk. A separator becomes an underscore rather than
 * being dropped, so two frames cannot collapse onto one name.
 */
function sanitised(stem: string): string {
  let out = stem;
  for (const bad of ["/", ":", "\\", "\0"]) out = out.split(bad).join("_");
  out = out.trim();
  while (out.startsWith(".")) out = out.slice(1);
  return out || "frame";
}
