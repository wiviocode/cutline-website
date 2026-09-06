/**
 * Resolves a `(jerseyNumber, jerseyColor)` observation to a named roster player.
 *
 * Three rules distinguish this from a naive number lookup:
 *
 *  1. **Colour-locked** — the number is looked up *within* the team implied by jersey colour,
 *     so `#5 in blue` can never match `#5` on the red roster.
 *  2. **Fuzzy correction** — a near-miss number is corrected against the roster, but only when
 *     the correction is unambiguous.
 *  3. **Unit-aware** — in football, the unit the photograph shows decides between two players who
 *     share a number, and which of a two-way player's positions the caption prints. The unit is
 *     the model's own call when it made one, else the ball, else the verb.
 */

import { Roster, RosterPlayer, type Team, type PlayerSide } from "./Roster";
import { TeamColorArbiter } from "./TeamColorArbiter";

export interface Match {
  player: RosterPlayer;
  team: Team;
  /** True when the jersey number was corrected rather than matched exactly. */
  wasFuzzy: boolean;
  /** The unit the play put this player on, when the observation says. Picks a two-way player's position. */
  impliedSide: PlayerSide | null;
}

export type MatchFailure =
  | { kind: "unreadableNumber" }
  | { kind: "colorUnresolved"; number: string; color: string }
  | { kind: "notOnRoster"; number: string; team: string }
  | { kind: "ambiguousFuzzy"; number: string }
  | { kind: "ambiguousDuplicate"; number: string; team: string };

export type MatchResult = { ok: true; match: Match } | { ok: false; failure: MatchFailure };

/** What a player is doing when they are on defence, as the vision model phrases it. */
const DEFENSIVE_VERBS = [
  "tackle", "sack", "intercept", "break up", "breaks up", "defend", "cover", "blitz", "strip", "recover", "pressure",
  "pursue", "chase", "wrap up", "wraps up", "bring down", "brings down", "drag down", "drags down", "knock", "deflect",
  "swat", "bat down", "bats down", "stuff", "jam", "rush the quarterback", "rushes the quarterback", "rushes the passer",
  "chases down", "closes in", "hit the", "hits the", "block a kick", "blocks a kick", "blocks a punt", "blocks the kick",
  "forces a fumble", "force a fumble", "wraps", "grabs the ball carrier", "reaches for the runner", "dive at", "dives at",
];
/** And on offence. Checked second, so "intercepts a pass" is defence before "pass" is offence. */
const OFFENSIVE_VERBS = [
  "throw", "pass", "hand off", "hands off", "handoff", "catch", "receiv", "run with", "runs with", "carr", "rush", "dive for",
  "dives for", "stretch", "scor", "spike", "hurdle", "stiff-arm", "stiff arm", "break a tackle", "breaks a tackle",
  "break free", "breaks free", "scramble", "drop back", "drops back", "look downfield", "looks downfield", "take the snap",
  "takes the snap", "snap", "block for", "blocks for", "leap over", "leaps over", "lunge", "reach for the end zone",
  "reaches for the end zone", "reaches the end zone", "crosses the goal line", "touchdown", "juke", "cut", "sprint", "elude",
];

export class RosterMatcher {
  constructor(public readonly roster: Roster, public readonly sport: string) {}

  /**
   * `action`, `flags` and `unit` come straight from the vision observation. Only football reads
   * them; everywhere else the unit is null and a shared number stays ambiguous.
   */
  match(rawNumber: string, color: string, action = "", flags: string[] = [], unit: string | null = null): MatchResult {
    const number = normalise(rawNumber);
    if (!number) return { ok: false, failure: { kind: "unreadableNumber" } };

    const team = TeamColorArbiter.team(this.roster, color);
    if (!team) return { ok: false, failure: { kind: "colorUnresolved", number, color } };

    const squad = Roster.players(this.roster, team.id);
    const exact = squad.filter((p) => normalise(p.jerseyNumber) === number);
    const side = this.sport === "football" ? RosterMatcher.impliedSide(action, flags, unit) : null;

    if (exact.length === 0) return this.fuzzy(number, squad, team, side);
    if (exact.length === 1) return { ok: true, match: { player: exact[0], team, wasFuzzy: false, impliedSide: side } };
    return this.resolveDuplicate(exact, number, team, side);
  }

  /**
   * Football rosters reuse a number across offence and defence. The unit the play shows decides;
   * two rows that are the same person (a two-way player listed twice) are never ambiguous.
   */
  private resolveDuplicate(candidates: RosterPlayer[], number: string, team: Team, side: PlayerSide | null): MatchResult {
    const samePerson = candidates.every((p) => RosterPlayer.fullName(p).toLowerCase() === RosterPlayer.fullName(candidates[0]).toLowerCase());
    if (this.sport !== "football" && !samePerson) return { ok: false, failure: { kind: "ambiguousDuplicate", number, team: team.name } };
    const sided = side ? candidates.filter((p) => RosterPlayer.playsOn(p, side)) : [];
    if (sided.length === 1) return { ok: true, match: { player: sided[0], team, wasFuzzy: false, impliedSide: side } };
    if (samePerson) return { ok: true, match: { player: sided[0] ?? candidates[0], team, wasFuzzy: false, impliedSide: side } };
    return { ok: false, failure: { kind: "ambiguousDuplicate", number, team: team.name } };
  }

  /**
   * Which unit an observed player is on. The model's explicit call wins; then possession — a
   * player flagged with the ball is on offence unless the verb says they took it away; then the
   * verb. Null when nothing in the observation says.
   */
  static impliedSide(action: string, flags: string[] = [], unit: string | null = null): PlayerSide | null {
    const u = (unit ?? "").trim().toLowerCase().replace(/[\s_-]+/g, "");
    if (u === "offense" || u === "offence") return "offense";
    if (u === "defense" || u === "defence") return "defense";
    if (u === "specialteams") return "specialTeams";
    const a = action.toLowerCase();
    const defensive = DEFENSIVE_VERBS.some((v) => a.includes(v));
    if (defensive) return "defense";
    const hasBall = flags.some((f) => /ball_carrier|has_ball/i.test(f));
    if (hasBall) return "offense";
    if (OFFENSIVE_VERBS.some((v) => a.includes(v))) return "offense";
    return null;
  }

  /** Kept for callers that only want the old yes/no. */
  static impliesDefense(action: string): boolean {
    return RosterMatcher.impliedSide(action) === "defense";
  }

  /**
   * Correct a misread number against the squad, accepting only an unambiguous single candidate.
   * Anything ambiguous is refused so the caption says nothing rather than something wrong.
   */
  private fuzzy(number: string, squad: RosterPlayer[], team: Team, side: PlayerSide | null): MatchResult {
    const candidates = squad.filter((p) => RosterMatcher.isPlausibleMisread(number, normalise(p.jerseyNumber)));
    if (candidates.length === 1) return { ok: true, match: { player: candidates[0], team, wasFuzzy: true, impliedSide: side } };
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
