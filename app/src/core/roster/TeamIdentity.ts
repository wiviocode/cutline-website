/**
 * Who a team is, read off their own page rather than typed in — and the colour mapping that
 * turns published brand hexes into the matcher's vocabulary.
 */

import { APState } from "../caption/USState";

export interface TeamIdentity {
  /** "Millard South" */
  schoolName: string;
  /** "Patriots" */
  mascot?: string | null;
  city?: string | null;
  /** AP-abbreviated, ready for a caption: "Neb.", not "NE" or "Nebraska". */
  state?: string | null;
  /** Remote logo, before it is cached locally. */
  logoURL?: string | null;
  /** School colours as published, most prominent first: `["CC0022", "FFFFFF"]`. */
  colorHexes: string[];
  /** What the page said it was — "Boys", "Girls" — so a mismatch can be reported. */
  reportedGender?: string | null;
  sportSeason?: string | null;
  sourceURL?: string | null;
  rosterURL?: string | null;
}

export const TeamIdentity = {
  make(p: Partial<TeamIdentity> & { schoolName: string }): TeamIdentity {
    return { colorHexes: [], ...p };
  },
  /** "Millard South Patriots" — what the setup screen puts in the team field. */
  fullName(t: TeamIdentity): string {
    return t.mascot ? `${t.schoolName} ${t.mascot}` : t.schoolName;
  },
  /**
   * School colours mapped onto the matcher's vocabulary, most prominent first. These are
   * **brand** colours, not always the kit worn in a given game — useful as a starting point,
   * never as the final answer.
   */
  colorNames(t: TeamIdentity): string[] {
    return t.colorHexes.map(HexColour.familyName).filter((n): n is string => n != null);
  },
  suggestedKitColour(t: TeamIdentity): string | null {
    return TeamIdentity.colorNames(t)[0] ?? null;
  },
  apState: APState.apStyle,
};

export const HexColour = {
  /** Parse `"CC0022"` or `"#cc0022"`. Blank or padding-only values are rejected rather than parsed as black. */
  components(hex: string): { r: number; g: number; b: number } | null {
    const s = hex.trim().replace(/#/g, "");
    if (s.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(s)) return null;
    const v = parseInt(s, 16);
    return { r: ((v >> 16) & 0xff) / 255, g: ((v >> 8) & 0xff) / 255, b: (v & 0xff) / 255 };
  },

  /**
   * Fold a hex colour onto one of the arbiter's families. Classified in HSL rather than by
   * nearest RGB distance, because the decision that matters is "which colour word would a person
   * use", and that tracks hue: navy and royal are far apart in RGB and both plainly blue.
   */
  familyName(hex: string): string | null {
    const c = HexColour.components(hex);
    if (!c) return null;
    const { r, g, b } = c;
    const maxV = Math.max(r, g, b), minV = Math.min(r, g, b);
    const lightness = (maxV + minV) / 2;
    const delta = maxV - minV;
    if (delta < 0.10) {
      if (lightness > 0.85) return "white";
      if (lightness < 0.16) return "black";
      return "grey";
    }
    if (lightness > 0.93) return "white";
    if (lightness < 0.10) return "black";
    let hue: number;
    if (maxV === r) hue = (g - b) / delta;
    else if (maxV === g) hue = 2 + (b - r) / delta;
    else hue = 4 + (r - g) / delta;
    hue *= 60;
    if (hue < 0) hue += 360;
    if (hue < 15 || hue >= 345) return "red";
    if (hue < 40) return lightness < 0.35 ? "brown" : "orange";
    // The orange/yellow line sits at 40 deg, measured rather than guessed.
    if (hue < 70) return "yellow";
    if (hue < 170) return "green";
    if (hue < 255) return "blue";
    if (hue < 290) return "purple";
    if (hue < 330) return lightness > 0.65 ? "pink" : "purple";
    return "red";
  },
};
