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
    { token: "{alt}",      meaning: "who and what, from the alt text — Nebraska-setter-Bergen-Reilly-sets-the-ball" },
  ],

  /** Whether the pattern puts the alt text in the name. */
  usesAlt(pattern: string): boolean { return pattern.includes("{alt}"); },

  /** The pattern with the alt text added at the end, or taken out with its separator. */
  withAlt(pattern: string, on: boolean): string {
    if (on) return NamingPattern.usesAlt(pattern) ? pattern : `${pattern}_{alt}`;
    return pattern.replace(/[_\-\s]?\{alt\}/g, "");
  },

  /**
   * Alt text as a piece of a filename: plain letters and digits, words joined by hyphens (the
   * pattern's own separator is the underscore), cut at a word under the limit so a name stays
   * short enough for every desk's system.
   */
  slug(text: string, limit = 60): string {
    const words = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/['’]/g, "")
      .replace(/[^A-Za-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
    let out = "";
    for (const w of words) {
      const next = out ? `${out}-${w}` : w;
      if (next.length > limit) break;
      out = next;
    }
    return out || words[0]?.slice(0, limit) || "";
  },

  /** Any `{token}` in the pattern that this does not understand — a typo the photographer wants to know about. */
  unknownTokens(pattern: string): string[] {
    const known = new Set(NamingPattern.tokens.map((t) => t.token));
    return (pattern.match(/\{[^}]*\}/g) ?? []).filter((t) => !known.has(t));
  },

  /** Fill the pattern in for one frame. */
  stem(pattern: string, fixture: Fixture, sequence: number, alt = ""): string {
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
      "{alt}": NamingPattern.slug(alt),
    };
    // A frame with no alt text yet loses the token and its separator, not leaves "_0001_.jpg".
    let out = values["{alt}"] ? pattern : pattern.replace(/[_\-\s]?\{alt\}/g, "");
    for (const [token, value] of Object.entries(values)) out = out.split(token).join(value);
    return sanitised(out);
  },

  filename(pattern: string, fixture: Fixture, sequence: number, extension: string, alt = ""): string {
    const stem = NamingPattern.stem(pattern, fixture, sequence, alt);
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
