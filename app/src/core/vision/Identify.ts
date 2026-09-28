/**
 * Turning what the model saw into who it was — checked against the roster in code.
 *
 * The model reads the digits and proposes a roster line; nothing it proposes is believed until
 * the digits and the team agree with the roster. The outcome for each subject is one of three:
 *
 *  - confirmed — every digit plainly read, and exactly one player on that team wears it (or the
 *    model's choice settles a number football's two units share);
 *  - likely    — the right player on the evidence, but something is soft: a digit was partly
 *    hidden, the team came from the number rather than the uniform, a near-miss was corrected,
 *    or the identity was carried over from the next frame of the same burst;
 *  - unknown   — no digits, or digits that match nobody. The caption says so rather than guess.
 *
 * Everything but confirmed is flagged for review.
 */

import { Player, Matchup, Team, type Matchup as MatchupT, type PlayerSide, type TeamKey } from "../roster/Roster";
import type { Observation, Subject } from "./Observation";
import type { MeetEntry } from "./Prompt";

export type IDStatus = "confirmed" | "likely" | "unknown";
export type IDSource = "model" | "fuzzy" | "sequence" | "face" | "note" | "manual" | "none";

export interface Identity {
  subjectId: string;
  /** The side the subject plays for, when known. */
  teamKey: TeamKey | null;
  player: Player | null;
  /** A meet entry, for a sport without teams. */
  entry: MeetEntry | null;
  status: IDStatus;
  source: IDSource;
  /** Why it came out this way, in words for the review screen. */
  reason: string;
  /** Football: the unit this play puts the player on, which picks a two-way player's position. */
  side: PlayerSide | null;
  /** Other players it could be, for the correction picker. */
  alternatives: Player[];
}

/** What the photographer set by hand, which outranks everything. */
export interface ManualID {
  teamKey: TeamKey | null;
  /** A roster player's id, or null for "not on the roster / leave unnamed". */
  playerID: string | null;
  /** The player's number and name when it was set, so it survives the roster being read again. */
  number?: string;
  name?: string;
}

export interface IdentifyContext {
  matchup: MatchupT | null;
  entries?: MeetEntry[];
  unitSport: boolean;
  /** The photographer's note for this frame, which can name a player the photograph does not show a number for. */
  note?: string;
}

export const Identify = {
  all(obs: Observation, ctx: IdentifyContext, manual: Record<string, ManualID> = {}): Identity[] {
    const ids = obs.subjects.map((s) => Identify.one(s, obs.clause, ctx, manual[s.id]));
    // One person cannot be two subjects. When two resolve to the same player, the better-read
    // one keeps the name — a set-by-hand one always wins — and the other is left unnamed.
    const rank = (i: Identity) => (i.source === "manual" ? 3 : i.status === "confirmed" ? 2 : i.status === "likely" ? 1 : 0);
    for (let a = 0; a < ids.length; a++) {
      for (let b = a + 1; b < ids.length; b++) {
        const x = ids[a], y = ids[b];
        if (!x.player || x.player !== y.player) continue;
        const loser = rank(y) > rank(x) ? x : y;
        const i = ids.indexOf(loser);
        ids[i] = { ...loser, player: null, status: "unknown", source: "none", alternatives: [], reason: `Same number as ${loser === x ? y.subjectId : x.subjectId}; not named twice` };
      }
    }
    return ids;
  },

  one(s: Subject, clause: string, ctx: IdentifyContext, manual?: ManualID): Identity {
    const base: Identity = { subjectId: s.id, teamKey: null, player: null, entry: null, status: "unknown", source: "none", reason: "", side: null, alternatives: [] };
    const side = ctx.unitSport ? impliedSide(s, clause) : null;

    if (manual) {
      const team = manual.teamKey && ctx.matchup ? Matchup.team(ctx.matchup, manual.teamKey) : null;
      // A player, or a coach from the staff list.
      const people = team ? [...team.players, ...(team.staff ?? [])] : [];
      const player = team && manual.playerID
        ? people.find((p) => p.id === manual.playerID)
          ?? people.find((p) => p.number === (manual.number ?? "") && Player.fullName(p) === manual.name) ?? null
        : null;
      return { ...base, teamKey: manual.teamKey, player, status: player ? "confirmed" : "unknown", source: "manual", reason: player ? "Set by hand" : "Left unnamed by hand", side };
    }

    // A meet: bibs against the entry list.
    if (!ctx.matchup) {
      if (s.kind !== "athlete") return { ...base, status: "confirmed", reason: "Not an athlete" };
      const entry = s.number ? ctx.entries?.find((e) => e.bib === s.number) ?? null : null;
      if (!entry) return { ...base, reason: s.number ? `Bib ${s.number} is not on the entry list` : "No bib visible" };
      return { ...base, entry, status: s.clarity === "clear" ? "confirmed" : "likely", source: "model", reason: s.clarity === "clear" ? `Bib ${s.number} read clearly` : `Bib ${s.number} partly visible` };
    }

    const m = ctx.matchup;
    const declared: TeamKey | null = s.team === "A" || s.team === "B" ? s.team : null;

    if (s.kind !== "athlete") {
      return { ...base, teamKey: declared, status: "confirmed", reason: "Not an athlete" };
    }
    // The photographer said who it is ("the hitter is Adriano, #3") and the reading agrees on whom.
    const noted = namedInNote(s, m, declared, ctx.note);
    if (noted) return { ...base, teamKey: noted.k, player: noted.p, side, source: "note", status: "confirmed", reason: "Named in your note" };
    if (!s.number || s.clarity === "hidden") {
      // A college nameplate can name a player whose number is turned away.
      const plated = declared ? byNameplate(Matchup.team(m, declared).players, s.uniformText) : [];
      if (plated.length === 1) {
        return { ...base, teamKey: declared, player: plated[0], side, source: "model", status: "likely", reason: `Named by the nameplate "${s.uniformText}"; number not visible` };
      }
      return { ...base, teamKey: declared, side, reason: declared ? "Number not visible" : "Number and team not visible" };
    }

    // "1?" — a digit is there but unreadable. The roster numbers that fit are the candidates.
    const wild = s.number.includes("?");
    const fits = (n: string) => n.length === s.number.length && [...s.number].every((c, i) => c === "?" || c === n[i]);
    const numbered = (t: Team) => (wild ? t.players.filter((p) => fits(p.number)) : Team.byNumber(t, s.number));
    const shown = wild ? `#${s.number.replace(/\?/g, "_")}` : `#${s.number}`;

    // Which team: the uniform when the model was sure of it; otherwise the number, if only one
    // side has it.
    let teamKey = declared;
    let teamFromNumber = false;
    if (!teamKey) {
      const onA = numbered(m.a).length > 0, onB = numbered(m.b).length > 0;
      if (onA !== onB) { teamKey = onA ? "A" : "B"; teamFromNumber = true; }
      else return { ...base, side, reason: onA ? `Both teams have a ${shown}; the uniform did not say which` : `${shown} is on neither roster` };
    }
    const team = Matchup.team(m, teamKey);
    const exact = numbered(team);
    const chosen = parseChoice(s.player);
    const plate = byNameplate(team.players, s.uniformText);

    if (wild) {
      const people = distinctPeople(exact);
      const byPlate = plate.length === 1 && (people.includes(plate[0]) || !people.length) ? plate[0] : null;
      if (byPlate) return { ...base, teamKey, player: byPlate, side, source: "model", status: "likely", alternatives: people.filter((p) => p !== byPlate), reason: `Read ${shown}; the nameplate reads "${s.uniformText}"` };
      if (people.length === 1) return { ...base, teamKey, player: people[0], side, source: "model", status: "likely", reason: `Read ${shown}; #${people[0].number} is the only player who fits` };
      const pick = chosen ? people.find((p) => nameMatches(p, chosen.name)) : undefined;
      const alternatives = pick ? [pick, ...people.filter((p) => p !== pick)] : people;
      return { ...base, teamKey, side, alternatives, reason: people.length ? `Read ${shown}; ${people.length} players fit` : `${shown} fits nobody on the ${Team.fullName(team)} roster` };
    }

    if (exact.length === 1) {
      // A nameplate that names someone else outranks a number read at an angle.
      if (plate.length === 1 && plate[0] !== exact[0]) {
        return { ...base, teamKey, player: plate[0], side, source: "model", status: "likely", alternatives: [exact[0]],
          reason: `Number read as #${s.number}, but the nameplate reads "${s.uniformText}" (#${plate[0].number})` };
      }
      const soft = s.clarity !== "clear" || teamFromNumber;
      return {
        ...base, teamKey, player: exact[0], side, source: "model",
        status: soft ? "likely" : "confirmed",
        reason: teamFromNumber ? `Team taken from the number (#${s.number} is only on one roster)` : s.clarity === "clear" ? `#${s.number} read clearly` : `#${s.number} partly visible`,
      };
    }

    if (exact.length > 1) {
      // A number shared across football's units, or a roster listing a player twice.
      const samePerson = exact.every((p) => Player.fullName(p).toLowerCase() === Player.fullName(exact[0]).toLowerCase());
      if (samePerson) return { ...base, teamKey, player: exact[0], side, source: "model", status: s.clarity === "clear" && !teamFromNumber ? "confirmed" : "likely", reason: `#${s.number} read clearly` };
      // The nameplate settles it outright.
      const plated = byNameplate(exact, s.uniformText);
      if (plated.length === 1) {
        return { ...base, teamKey, player: plated[0], side, source: "model", status: s.clarity === "clear" ? "confirmed" : "likely", alternatives: exact.filter((p) => p !== plated[0]),
          reason: `#${s.number} is shared; the nameplate reads "${s.uniformText}"` };
      }
      // The model's pick, from the play. Believable, but a person should glance at it — unless
      // the unit the play implies agrees with it.
      const byChoice = chosen ? exact.filter((p) => nameMatches(p, chosen.name)) : [];
      if (byChoice.length === 1) {
        const agrees = !!side && Player.playsOn(byChoice[0], side) && exact.filter((p) => Player.playsOn(p, side)).length === 1;
        return { ...base, teamKey, player: byChoice[0], side, source: "model", status: s.clarity === "clear" && agrees ? "confirmed" : "likely", alternatives: exact.filter((p) => p !== byChoice[0]),
          reason: agrees ? `#${s.number} is shared; the play puts them on ${sideWord(side!)}` : `#${s.number} is shared; chosen from the play — check` };
      }
      const bySide = side ? exact.filter((p) => Player.playsOn(p, side)) : [];
      if (bySide.length === 1) {
        return { ...base, teamKey, player: bySide[0], side, source: "model", status: "likely", alternatives: exact.filter((p) => p !== bySide[0]),
          reason: `#${s.number} is shared; the ${side === "defense" ? "defensive" : side === "offense" ? "offensive" : "special teams"} player chosen from the play` };
      }
      return { ...base, teamKey, side, alternatives: exact, reason: `${exact.length} players on ${Team.fullName(team)} wear #${s.number}` };
    }

    // Nobody on the team wears it. A near miss is corrected only when the reading was soft and
    // exactly one player is a plausible misread; otherwise the candidates go to review.
    const near = team.players.filter((p) => Identify.isPlausibleMisread(s.number, p.number));
    if (plate.length === 1) {
      return { ...base, teamKey, player: plate[0], side, source: "fuzzy", status: "likely", alternatives: near.filter((p) => p !== plate[0]),
        reason: `#${s.number} is not on the roster; the nameplate reads "${s.uniformText}" (#${plate[0].number})` };
    }
    if (s.clarity === "partial" && near.length === 1) {
      return { ...base, teamKey, player: near[0], side, source: "fuzzy", status: "likely", reason: `Read #${s.number}, partly hidden; #${near[0].number} is the only close match` };
    }
    return { ...base, teamKey, side, alternatives: near, reason: `#${s.number} is not on the ${Team.fullName(team)} roster` };
  },

  /**
   * Digits that are commonly misread for one another, or a leading digit hidden by a fold or an
   * arm. "0" and "00" are different numbers and never stand in for each other.
   */
  isPlausibleMisread(observed: string, actual: string): boolean {
    if (!observed || !actual || observed === actual) return false;
    if (actual.length === observed.length + 1 && actual[0] !== "0" && (actual.endsWith(observed) || actual.startsWith(observed))) return true;
    if (observed.length !== actual.length) return false;
    const pairs = ["03", "08", "38", "56", "58", "68", "17", "14", "47", "69", "29"];
    let diffs = 0, ok = true;
    for (let i = 0; i < observed.length; i++) {
      if (observed[i] === actual[i]) continue;
      diffs++;
      const pair = [observed[i], actual[i]].sort().join("");
      if (!pairs.includes(pair)) ok = false;
    }
    return diffs === 1 && ok;
  },

  /** Needs a person's eyes before it is filed. */
  needsReview(ids: Identity[]): boolean {
    return ids.some((i) => i.status !== "confirmed");
  },
};

/** A roster can list one person twice; count people, not rows. */
function distinctPeople(players: Player[]): Player[] {
  const seen = new Map<string, Player>();
  for (const p of players) {
    const k = `${p.number}|${Player.fullName(p).toLowerCase()}`;
    if (!seen.has(k)) seen.set(k, p);
  }
  return [...seen.values()];
}

function sideWord(side: PlayerSide): string {
  return side === "offense" ? "offense" : side === "defense" ? "defense" : side === "specialTeams" ? "special teams" : "the field";
}

function parseChoice(player: string): { number: string; name: string } | null {
  const m = /^\s*#?(\d{1,3})\s+(.+?)\s*(\(.*\))?\s*$/.exec(player);
  return m ? { number: m[1], name: m[2] } : player.trim() ? { number: "", name: player.trim() } : null;
}

/**
 * Players whose last name is printed in the uniform lettering — "SCOBY", "Q. LEWIS", "BARNEY JR".
 * School names and short fragments are ignored: only a whole last name of three letters or more
 * counts.
 */
function byNameplate(players: Player[], lettering: string): Player[] {
  const words = lettering.toUpperCase().replace(/[^A-Z' -]/g, " ").split(/[\s.]+/).filter((w) => w.length >= 3);
  if (!words.length) return [];
  const text = ` ${words.join(" ")} `;
  return players.filter((p) => {
    const last = p.lastName.toUpperCase().replace(/\s+(JR|SR|II|III|IV|V)\.?$/, "").replace(/[^A-Z' -]/g, "").trim();
    return last.length >= 3 && text.includes(` ${last} `);
  });
}

/**
 * The roster player the reading pointed this subject at, when the photographer's note names
 * them too — by last name or by "#number". The note alone never names anyone: the model has to
 * have tied it to this subject.
 */
function namedInNote(s: Subject, m: MatchupT, declared: TeamKey | null, note: string | undefined): { p: Player; k: TeamKey } | null {
  const text = note?.trim().toLowerCase();
  const chosen = text ? parseChoice(s.player) : null;
  if (!text || !chosen) return null;
  const keys: TeamKey[] = declared ? [declared] : ["A", "B"];
  const found = keys.flatMap((k) => Matchup.team(m, k).players.filter((p) => (chosen.number ? p.number === chosen.number : true) && nameMatches(p, chosen.name)).map((p) => ({ p, k })));
  if (found.length !== 1) return null;
  const { p } = found[0];
  const last = p.lastName.toLowerCase().replace(/\s+(jr|sr|ii|iii|iv|v)\.?$/, "");
  const byName = last.length >= 3 && text.includes(last);
  const byNumber = !!p.number && new RegExp(`(#|\\bno\\.?\\s?|\\bnumber\\s)${p.number}(?!\\d)`).test(text);
  return byName || byNumber ? found[0] : null;
}

function nameMatches(p: Player, name: string): boolean {

  const n = name.toLowerCase();
  return n.includes(p.lastName.toLowerCase()) && (!p.firstName || n.includes(p.firstName.toLowerCase().slice(0, 3)));
}

const DEFENSE = /\b(tackl|sack|intercept|break(s)? up|defend|cover|blitz|strip|pursu|chas|rush(es)? the (passer|quarterback)|pass rush|deflect|bat(s)? down|safety|linebacker|cornerback|defensive)/i;
const OFFENSE = /\b(ball carrier|carr(y|ies)|rush(es|ing)? (for|up)|throw|pass(es)? (to|downfield)|passer|quarterback|hand(s)? off|catch|receiv|run(s)? with|scor|touchdown|stiff-arm|hurdle|takes? the snap|snap|block(s|er|ing)? for|lead block|offensive)/i;
const SPECIAL = /\b(kick(s|er)?\b|punt|field goal|extra point|long snap|returner|returns? (a|the) (kick|punt))/i;

/** Football's unit, from the subject's role and the clause about them. */
function impliedSide(s: Subject, clause: string): PlayerSide | null {
  const own = s.role;
  if (SPECIAL.test(own)) return "specialTeams";
  if (DEFENSE.test(own)) return "defense";
  if (OFFENSE.test(own)) return "offense";
  // The clause: the verb right after this subject's token.
  const m = new RegExp(`\\{${s.id}\\}\\s+([^{]{0,40})`).exec(clause);
  const verb = m?.[1] ?? "";
  if (SPECIAL.test(verb)) return "specialTeams";
  if (DEFENSE.test(verb)) return "defense";
  if (OFFENSE.test(verb)) return "offense";
  return null;
}
