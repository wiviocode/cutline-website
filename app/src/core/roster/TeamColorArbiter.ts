/**
 * Maps model-reported jersey colours onto the two configured teams.
 *
 * This is the most-depended-on stage in the pipeline. Getting it wrong misassigns players to the
 * opposing team, which is why the prompt is emphatic that `jersey_color` must describe the jersey
 * *body panel* and not its trim.
 */

import { Roster, type Team } from "./Roster";

/**
 * Colours that read as the same side. Kept deliberately small: this requires an exact
 * team-colour match rather than perceptual nearest-neighbour, because a loose match silently
 * produces confidently wrong team attribution.
 */
export const COLOUR_SYNONYMS: Record<string, Set<string>> = {
  white:  new Set(["white", "cream", "ivory", "silver"]),
  black:  new Set(["black", "charcoal"]),
  blue:   new Set(["blue", "navy", "royal", "royalblue", "navyblue"]),
  red:    new Set(["red", "crimson", "scarlet", "maroon"]),
  green:  new Set(["green", "forest", "kelly"]),
  yellow: new Set(["yellow", "gold", "goldenrod"]),
  orange: new Set(["orange"]),
  purple: new Set(["purple", "violet"]),
  grey:   new Set(["grey", "gray", "graphite"]),
  pink:   new Set(["pink"]),
  brown:  new Set(["brown"]),
};

export const TeamColorArbiter = {
  /**
   * Fold a reported colour onto its family: "navy" and "royal" are both "blue". Public because
   * setup has to validate the two teams against the *same* rule the matcher uses — "blue"
   * against "navy" looks like two teams and resolves to one.
   */
  canonical(raw: string): string {
    const c = raw.trim().toLowerCase();
    for (const key of Object.keys(COLOUR_SYNONYMS)) if (COLOUR_SYNONYMS[key].has(c)) return key;
    return c;
  },

  /** Whether two kit colours would be indistinguishable to the matcher. */
  sameFamily(a: string, b: string): boolean {
    return TeamColorArbiter.canonical(a) === TeamColorArbiter.canonical(b);
  },

  /** Resolve a reported jersey colour to a team, or null when it matches neither side or both. */
  team(roster: Roster, color: string): Team | null {
    const c = TeamColorArbiter.canonical(color);
    if (!c) return null;
    const m1 = TeamColorArbiter.canonical(roster.team1.uniformColor) === c;
    const m2 = TeamColorArbiter.canonical(roster.team2.uniformColor) === c;
    // An exact match on both sides is not a match at all — refuse rather than guess.
    if (m1 && !m2) return roster.team1;
    if (m2 && !m1) return roster.team2;
    return null;
  },

  /**
   * Resolve the subject team for a scene-fallback caption.
   *
   * The model supplies `subject_team_color`, but it is overridden when `nearby_player_colors`
   * majority-votes for a different side — the array describes the actual subjects, whereas the
   * single colour is more easily thrown by background jerseys.
   */
  subjectTeam(roster: Roster, declared: string | null | undefined, nearby: string[]): { team: Team | null; overridden: boolean } {
    const declaredTeam = declared ? TeamColorArbiter.team(roster, declared) : null;
    if (nearby.length === 0) return { team: declaredTeam, overridden: false };

    const tally = new Map<string, number>();
    for (const color of nearby.slice(0, 12)) { // prompt caps the array at 12
      const t = TeamColorArbiter.team(roster, color);
      if (t) tally.set(t.id, (tally.get(t.id) ?? 0) + 1);
    }
    let winnerID: string | null = null, count = 0;
    for (const [id, n] of tally) if (n > count) { winnerID = id; count = n; }
    if (!winnerID || count * 2 <= nearby.length) return { team: declaredTeam, overridden: false }; // strict majority
    const winner = Roster.team(roster, winnerID);
    if (!winner) return { team: declaredTeam, overridden: false };
    const overridden = declaredTeam != null && declaredTeam.id !== winner.id;
    return { team: winner, overridden };
  },
};
