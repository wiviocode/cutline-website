/**
 * Resolves a `(jerseyNumber, jerseyColor)` observation to a named roster player.
 *
 * Three rules distinguish this from a naive number lookup:
 *
 *  1. **Colour-locked** — the number is looked up *within* the team implied by jersey colour,
 *     so `#5 in blue` can never match `#5` on the red roster.
 *  2. **Fuzzy correction** — a near-miss number is corrected against the roster, but only when
 *     the correction is unambiguous.
 *  3. **Offense-aware** — in football, a number carried by both an offensive and a defensive
 *     player is resolved from the action verb.
 */

import { Roster, type RosterPlayer, type Team } from "./Roster";
import { TeamColorArbiter } from "./TeamColorArbiter";

export interface Match {
  player: RosterPlayer;
  team: Team;
  /** True when the jersey number was corrected rather than matched exactly. */
  wasFuzzy: boolean;
}

export type MatchFailure =
  | { kind: "unreadableNumber" }
  | { kind: "colorUnresolved"; number: string; color: string }
  | { kind: "notOnRoster"; number: string; team: string }
  | { kind: "ambiguousFuzzy"; number: string }
  | { kind: "ambiguousDuplicate"; number: string; team: string };

export type MatchResult = { ok: true; match: Match } | { ok: false; failure: MatchFailure };

const DEFENSIVE_VERBS = ["tackle", "sack", "intercept", "break up", "defend", "cover", "blitz", "strip", "recover"];

export class RosterMatcher {
  constructor(public readonly roster: Roster, public readonly sport: string) {}

  match(rawNumber: string, color: string, action = ""): MatchResult {
    const number = normalise(rawNumber);
    if (!number) return { ok: false, failure: { kind: "unreadableNumber" } };

    const team = TeamColorArbiter.team(this.roster, color);
    if (!team) return { ok: false, failure: { kind: "colorUnresolved", number, color } };

    const squad = Roster.players(this.roster, team.id);
    const exact = squad.filter((p) => normalise(p.jerseyNumber) === number);

    if (exact.length === 0) return this.fuzzy(number, squad, team);
    if (exact.length === 1) return { ok: true, match: { player: exact[0], team, wasFuzzy: false } };
    return this.resolveDuplicate(exact, number, team, action);
  }

  /** Football rosters routinely reuse a number across offense and defense. The action verb decides. */
  private resolveDuplicate(candidates: RosterPlayer[], number: string, team: Team, action: string): MatchResult {
    if (this.sport !== "football") return { ok: false, failure: { kind: "ambiguousDuplicate", number, team: team.name } };
    const wanted = RosterMatcher.impliesDefense(action) ? "defense" : "offense";
    const sided = candidates.filter((p) => p.side === wanted);
    if (sided.length === 1) return { ok: true, match: { player: sided[0], team, wasFuzzy: false } };
    return { ok: false, failure: { kind: "ambiguousDuplicate", number, team: team.name } };
  }

  static impliesDefense(action: string): boolean {
    const a = action.toLowerCase();
    return DEFENSIVE_VERBS.some((v) => a.includes(v));
  }

  /**
   * Correct a misread number against the squad, accepting only an unambiguous single candidate.
   * Anything ambiguous is refused so the caption says nothing rather than something wrong.
   */
  private fuzzy(number: string, squad: RosterPlayer[], team: Team): MatchResult {
    const candidates = squad.filter((p) => RosterMatcher.isPlausibleMisread(number, normalise(p.jerseyNumber)));
    if (candidates.length === 1) return { ok: true, match: { player: candidates[0], team, wasFuzzy: true } };
    if (candidates.length > 1) return { ok: false, failure: { kind: "ambiguousFuzzy", number } };
    return { ok: false, failure: { kind: "notOnRoster", number, team: team.name } };
  }

  static isPlausibleMisread(observed: string, actual: string): boolean {
    if (observed === actual || !observed || !actual) return false;
    // A hidden leading digit: "7" seen, "17" actual. Leading zeros are excluded: "0" and "00"
    // are different numbers and must never be substituted for one another.
    if (actual.length === observed.length + 1 && actual.endsWith(observed) && actual[0] !== "0") return true;
    // Single-position confusion between visually similar digits.
    if (observed.length !== actual.length) return false;
    const pairs = [["0", "3"], ["5", "6"], ["3", "8"], ["1", "7"], ["6", "8"]];
    const diffs: [string, string][] = [];
    for (let i = 0; i < observed.length; i++) if (observed[i] !== actual[i]) diffs.push([observed[i], actual[i]]);
    if (diffs.length !== 1) return false;
    const [a, b] = diffs[0];
    return pairs.some(([x, y]) => (a === x && b === y) || (a === y && b === x));
  }
}

/** `00` and `0` are different numbers; leading zeros are significant and preserved. */
function normalise(n: string): string { return n.trim(); }
