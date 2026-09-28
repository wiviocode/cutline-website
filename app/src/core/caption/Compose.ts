/**
 * The finished caption: the model's clause with its tokens rendered in the desk's house style,
 * followed by the game, the date, the place and the credit.
 *
 * Rendering is local and instant, which is the point: correcting who {P2} is during review
 * rewrites the caption without another request.
 */

import { Team, Player, Matchup, type Matchup as MatchupT, type TeamKey } from "../roster/Roster";
import type { Observation, Subject } from "../vision/Observation";
import type { Identity } from "../vision/Identify";
import { Sports, type SportID, type Gender, type Level } from "../sports/Sports";
import { Styles, WireDate, type CaptionStyle } from "./Styles";
import { TeamNoun } from "../text/TeamNoun";
import { Article } from "../text/Article";
import { USState } from "../text/USState";

/** Placeholder a desk searches for when a visible athlete could not be named. */
export const UNIDENTIFIED = "XXXXX";

export type UnnamedMode = "placeholder" | "describe";

export interface CaptionContext {
  style: CaptionStyle;
  sport: SportID;
  gender: Gender;
  level: Level;
  matchup: MatchupT | null;
  /** A meet's name: "Nebraska Class A state cross country championships". */
  eventName?: string;
  venue?: string;
  city?: string;
  state?: string;
  captureDate?: Date | null;
  photographer?: string;
  house?: string;
  unnamed: UnnamedMode;
}

export interface Composed {
  caption: string;
  /** The clause alone, rendered — what the review screen shows as "the play". */
  body: string;
  named: TeamKey[];
}

export const Compose = {
  caption(obs: Observation, ids: Identity[], ctx: CaptionContext): Composed {
    const named = new Set<TeamKey>();
    const body = renderClause(obs, ids, ctx, named);
    const tail = ctx.matchup ? gameTail(body, obs, ctx, named) : meetTail(body, obs, ctx);
    return { caption: tidy(tail), body, named: [...named] };
  },

  /** One subject as the caption names them, for chips and pickers in review. */
  reference(s: Subject, id: Identity | undefined, ctx: CaptionContext): string {
    return renderSubject(s, id, ctx, new Set());
  },

  player(p: Player, team: Team, style: CaptionStyle, side: Identity["side"] = null): string {
    return playerReference(p, team, style, side);
  },
};

// ---------------------------------------------------------------- the clause

function renderClause(obs: Observation, ids: Identity[], ctx: CaptionContext, named: Set<TeamKey>): string {
  let clause = obs.clause.trim().replace(/[.\s]+$/, "");
  if (!clause) clause = fallbackClause(obs);
  // The tail says "before the game" from the timing; the model saying it too would double it.
  clause = clause.replace(/,?\s+(?:before|after|during)\s+the\s+(?:game|match|meet|contest)\b/gi, "").trim();
  const pieces: string[] = [];
  let last = 0;
  let prevTeam: TeamKey | null = null; // the team of the named player just before, if the last token was one
  const athleteTeams = new Set<TeamKey>(); // the sides of the athletes already in the sentence
  const coachTeams = new Set<TeamKey>();
  for (const m of clause.matchAll(/\{(P\d+|A|B|A:players|B:players|venue)\}/g)) {
    let before = clause.slice(last, m.index);
    const token = m[1];
    let rendered = renderToken(token, obs, ids, ctx, named);
    const team = namedPlayerTeam(token, ids);
    if (team && ctx.matchup) {
      const t = Matchup.team(ctx.matchup, team);
      const listed = team === prevTeam && /^\s*(,\s*)?(and\s+)?$/.test(before);
      // Only this side is in the sentence so far: a teammate needs no school again.
      const onlySide = athleteTeams.size === 1 && athleteTeams.has(team);
      if (listed || onlySide) {
        for (const prefix of [`${teamName(t, ctx.style)} `, `${possessive(t.school)} `]) {
          if (!rendered.startsWith(prefix)) continue;
          rendered = rendered.slice(prefix.length);
          // "celebrates with teammate Logan Jazbec (22)" where there is no position to lead with.
          const name = ids.find((i) => i.subjectId === token)?.player;
          if (!listed && name && rendered.startsWith(Player.fullName(name))) rendered = `teammate ${rendered}`;
          break;
        }
      }
    }
    // "{P1} celebrates with {A:players}": the players are the subject's teammates.
    if ((token === "A:players" || token === "B:players") && ctx.matchup) {
      const k = token[0] as TeamKey;
      if (athleteTeams.size === 1 && athleteTeams.has(k)) rendered = "teammates";
      else if (!athleteTeams.size && coachTeams.size === 1 && coachTeams.has(k)) rendered = "players";
      if (rendered === "teammates" || rendered === "players") before = before.replace(/\bthe\s+$/i, "");
    }
    const subject = obs.subjects.find((x) => x.id === token);
    const side = ids.find((i) => i.subjectId === token)?.teamKey ?? (subject?.team === "A" || subject?.team === "B" ? subject.team : null);
    if (subject && side) (subject.kind === "athlete" ? athleteTeams : subject.kind === "coach" ? coachTeams : new Set<TeamKey>()).add(side);
    prevTeam = team;
    // "a {A} coach" → "an Indiana coach": the article agrees with what the token became.
    const art = /(^|\s)(a|an|A|An)\s+$/.exec(before);
    if (art && rendered) {
      const fixed = Article.indefinite(rendered);
      const cap = art[2][0] === "A";
      before = before.slice(0, art.index + art[1].length) + (cap ? fixed[0].toUpperCase() + fixed.slice(1) : fixed) + " ";
    }
    // A reference that starts with its own article ("a Bowling Green player") after one the
    // model wrote is doubled; keep the model's.
    if (art && /^(a|an|the)\s/i.test(rendered)) rendered = rendered.replace(/^(a|an|the)\s/i, "");
    // "with the {B:players}" would give "with the members of the Elkhorn Antlers".
    if (/^members of /i.test(rendered)) before = before.replace(/\bthe\s+$/i, "");
    pieces.push(before, rendered);
    last = m.index! + m[0].length;
  }
  pieces.push(clause.slice(last));
  return pieces.join("").replace(/\s{2,}/g, " ").trim();
}

function namedPlayerTeam(token: string, ids: Identity[]): TeamKey | null {
  const id = ids.find((i) => i.subjectId === token);
  return id?.player && id.teamKey ? id.teamKey : null;
}

function renderToken(token: string, obs: Observation, ids: Identity[], ctx: CaptionContext, named: Set<TeamKey>): string {
  if (token === "venue") return ctx.venue?.trim() || genericVenue(ctx.sport, ctx.level);
  if (token === "A" || token === "B") {
    if (!ctx.matchup) return "";
    named.add(token);
    return teamName(Matchup.team(ctx.matchup, token), ctx.style);
  }
  if (token === "A:players" || token === "B:players") {
    const key = token[0] as TeamKey;
    if (!ctx.matchup) return "Athletes";
    named.add(key);
    return groupLabel(Matchup.team(ctx.matchup, key), ctx.style);
  }
  const s = obs.subjects.find((x) => x.id === token);
  if (!s) return "a player";
  return renderSubject(s, ids.find((i) => i.subjectId === token), ctx, named);
}

function renderSubject(s: Subject, id: Identity | undefined, ctx: CaptionContext, named: Set<TeamKey>): string {
  const teamKey = id?.teamKey ?? (s.team === "A" || s.team === "B" ? s.team : null);
  const side = teamKey && ctx.matchup ? Matchup.team(ctx.matchup, teamKey) : null;
  // A side with no name yet is no help to a caption: the player is named without it.
  const team = side?.school.trim() ? side : null;
  if (id?.player && !team && ctx.matchup) {
    const n = formatNumber(id.player.number, ctx.style);
    return `${Player.fullName(id.player)}${n ? ` ${n}` : ""}`;
  }

  // A coach named from the staff list, whatever kind of subject the reading called them.
  if (id?.player?.role === "staff" && team) {
    named.add(teamKey!);
    return staffReference(id.player, team, ctx.style);
  }

  if (s.kind !== "athlete") {
    const role = nonAthleteNoun(s);
    if (team) {
      named.add(teamKey!);
      const mod = teamModifier(team, ctx.style);
      return `${Article.before(mod)}${mod} ${role}`;
    }
    return `${Article.before(role)}${role}`;
  }

  // A meet: the entry list names the athlete and their school.
  if (!ctx.matchup) {
    const e = id?.entry;
    if (e) {
      // A bib identifies the runner to the app; desks do not print it.
      if (Styles.usesOfTheTeamForm(ctx.style)) return e.school ? `${e.name} of ${e.school}` : e.name;
      return e.school ? `${possessive(e.school)} ${e.name}` : e.name;
    }
    const school = s.uniformText ? titleCase(s.uniformText) : "";
    const noun = athleteNoun(ctx.sport);
    if (ctx.unnamed === "placeholder") return school ? `${school} ${UNIDENTIFIED}` : UNIDENTIFIED;
    return school ? `${Article.before(school)}${school} ${noun}` : `${Article.before(noun)}${noun}`;
  }

  if (team) named.add(teamKey!);
  if (id?.player && team) return playerReference(id.player, team, ctx.style, id.side);

  // Visible but not named. A partly read number helps the desk find the player — unless a digit
  // of it is unknown, which would print as "(?1)".
  const number = s.clarity === "partial" && !s.number.includes("?") ? s.number : "";
  if (ctx.unnamed === "describe") {
    if (!team) return "a player";
    const mod = teamModifier(team, ctx.style);
    const num = formatNumber(number, ctx.style);
    return `${Article.before(mod)}${mod} player${num ? ` ${num}` : ""}`;
  }
  const num = formatNumber(number, ctx.style);
  if (!team) return num ? `${UNIDENTIFIED} ${num}` : UNIDENTIFIED;
  if (Styles.usesOfTheTeamForm(ctx.style)) return `${UNIDENTIFIED}${num ? ` ${num}` : ""} of ${Team.withArticle(team)}`;
  // Hurrdat names a player with the team singular — "Waverly Viking XXXXX", as it would a named one.
  const label = Styles.usesSingularTeamBeforeName(ctx.style) ? TeamNoun.singularTeamLabel(team.school, team.nickname) ?? Team.fullName(team) : teamName(team, ctx.style);
  return `${label} ${UNIDENTIFIED}${num ? ` ${num}` : ""}`;
}

/** "Nebraska wide receiver Jacory Barney Jr. (2)", "Waverly Viking Gracie Lauenstein (3)", "Jane Doe #5 of the Iowa Hawkeyes". */
function playerReference(p: Player, team: Team, style: CaptionStyle, side: Identity["side"]): string {
  const name = Player.fullName(p);
  const number = formatNumber(p.number, style);
  const tail = number ? ` ${number}` : "";
  if (style === "simple") return `${name}${tail}`;
  if (Styles.usesOfTheTeamForm(style)) return `${name}${tail} of ${Team.withArticle(team)}`;
  if (Styles.usesSingularTeamBeforeName(style)) {
    const label = TeamNoun.singularTeamLabel(team.school, team.nickname) ?? Team.fullName(team);
    return `${label} ${name}${tail}`;
  }
  const position = Player.positionFor(p, side);
  const teamLabel = teamName(team, style);
  if (Styles.includesPosition(style) && position) return `${teamLabel} ${position} ${name}${tail}`;
  // No position on the roster (common in high school): "Syracuse's Logan Jazbec (22)".
  return `${possessive(team.school)} ${name}${tail}`;
}

/**
 * A coach always carries the title: "Nebraska head coach Dani Busboom Kelly", "Waverly Vikings
 * head coach Terri Neujahr", "head coach Mike Schall of the North Carolina Tar Heels".
 */
function staffReference(p: Player, team: Team, style: CaptionStyle): string {
  const name = Player.fullName(p);
  const title = p.position || "coach";
  if (style === "simple") return `${title} ${name}`;
  if (Styles.usesOfTheTeamForm(style)) return `${title} ${name} of ${Team.withArticle(team)}`;
  const label = Styles.usesSingularTeamBeforeName(style) ? Team.fullName(team) : teamName(team, style);
  return `${label} ${title} ${name}`;
}

/** How a team is named as a noun: AP "Nebraska"; others "the Gretna Dragons" is left to callers. */
function teamName(t: Team, style: CaptionStyle): string {
  return Styles.namesNickname(style) ? Team.fullName(t) : t.school;
}

/** Before a noun: "a Nebraska coach", "a Waverly Vikings assistant". */
function teamModifier(t: Team, style: CaptionStyle): string {
  return teamName(t, style);
}

/** "Nebraska players", "Members of the Waverly Vikings". */
function groupLabel(t: Team, style: CaptionStyle): string {
  if (Styles.namesNickname(style) && t.nickname) return `members of ${Team.withArticle(t)}`;
  return `${t.school} players`;
}

function nonAthleteNoun(s: Subject): string {
  const role = s.role.trim().toLowerCase();
  switch (s.kind) {
    case "coach": return /coach/.test(role) ? role : "coach";
    case "official": return /(referee|umpire|official|judge|line)/.test(role) ? role : "official";
    case "fan": return "fan";
    case "performer": return role || "performer";
    default: return role || "person";
  }
}

function athleteNoun(sport: SportID): string {
  return sport === "crossCountry" ? "runner" : sport === "trackAndField" ? "athlete" : "player";
}

function genericVenue(sport: SportID, level: Level): string {
  if (sport === "basketball" || sport === "volleyball") return level.kind === "highSchool" ? "the gym" : "the arena";
  if (sport === "baseball" || sport === "softball") return "the ballpark";
  if (sport === "crossCountry") return "the course";
  return "the stadium";
}

function fallbackClause(obs: Observation): string {
  switch (obs.scene) {
    case "crowd": return "Fans watch";
    case "wide": return "A general view of {venue}";
    case "celebration": return obs.subjects.length ? "{P1} celebrates" : "Players celebrate";
    default: return obs.subjects.length ? "{P1} competes" : "Game action";
  }
}

// ---------------------------------------------------------------- the tail

function timingWord(obs: Observation): string {
  return obs.timing === "before" ? "before" : obs.timing === "after" ? "after" : "during";
}

/** "an NCAA college football game", "a high school volleyball match". */
function eventNoun(ctx: CaptionContext): string {
  const level = ctx.level.kind === "college" && Styles.namesGoverningBody(ctx.style) && ctx.level.body
    ? `${ctx.level.body} ${ctx.level.qualifier}` : ctx.level.qualifier;
  const phrase = `${level} ${Sports.eventPhrase(ctx.sport)}`;
  return `${Article.before(phrase)}${phrase}`;
}

function dateText(ctx: CaptionContext): string {
  return ctx.captureDate ? WireDate.text(ctx.captureDate, Styles.monthForm(ctx.style)) : "";
}

function placeText(ctx: CaptionContext): string {
  const city = (ctx.city ?? "").trim();
  const typed = (ctx.state ?? "").trim();
  const form = Styles.stateForm(ctx.style);
  const state = typed ? USState.written(typed, form) : "";
  const parts = [city, state].filter(Boolean);
  if (form === "postal" && parts.length) parts.push("USA");
  return parts.join(", ");
}

function dateline(ctx: CaptionContext): string {
  if (!Styles.hasDateline(ctx.style) || !ctx.captureDate) return "";
  const city = (ctx.city ?? "").trim().toUpperCase();
  const state = ctx.state ? USState.written(ctx.state, "postal").toUpperCase() : "";
  const where = [city, state].filter(Boolean).join(", ");
  return where ? `${where} - ${WireDate.datelineDate(ctx.captureDate)}: ` : "";
}

function gameTail(body: string, obs: Observation, ctx: CaptionContext, named: Set<TeamKey>): string {
  const m = ctx.matchup!;
  const style = ctx.style;
  const nameWithArticle = (t: Team) => (Styles.namesNickname(style) ? Team.withArticle(t) : t.school);
  const known = (t: Team) => !!t.school.trim();
  let teamClause = "";
  if (named.size === 0 && known(m.a) && known(m.b)) teamClause = `between ${nameWithArticle(m.a)} and ${nameWithArticle(m.b)}`;
  else if (named.size === 1) {
    const other = Matchup.team(m, Matchup.other([...named][0]));
    if (known(other)) teamClause = `against ${nameWithArticle(other)}`;
  }

  // "during a timeout in an NCAA college football game", not "during … during" (Hurrdat keeps its
  // own template there); "before taking the field ahead of", not "before … before".
  const word = timingWord(obs);
  const timing = word === "during" && /\bduring\b/i.test(body) && !Styles.opponentPrecedesGameClause(style) ? "in"
    : word === "before" && /\bbefore\b/i.test(body) ? "ahead of"
    : word === "after" && /\bafter\b/i.test(body) ? "following"
    : word;

  const gameClause = `${timing} ${eventNoun(ctx)}`;
  return assemble(body, gameClause, teamClause, ctx);
}

function meetTail(body: string, obs: Observation, ctx: CaptionContext): string {
  const name = ctx.eventName?.trim();
  const gameClause = name ? `${timingWord(obs)} ${/^the\s/i.test(name) ? name : `the ${name}`}` : `${timingWord(obs)} ${eventNoun(ctx)}`;
  return assemble(body, gameClause, "", ctx);
}

function assemble(body: string, gameClause: string, teamClause: string, ctx: CaptionContext): string {
  const style = ctx.style;
  const credit = Styles.creditLine(style, ctx.photographer, ctx.house);
  const venue = ctx.venue?.trim();
  const date = dateText(ctx);
  const place = placeText(ctx);

  if (Styles.isDelimitedRecord(style)) {
    let sentence = [body, teamClause, gameClause].filter(Boolean).join(" ");
    if (venue) sentence += ` at ${venue}`;
    sentence = end(sentence);
    const lead = [date, place].filter(Boolean);
    return [lead.length ? `${lead.join("; ")}; ${sentence}` : sentence, credit].filter(Boolean).join(" ");
  }

  if (Styles.datesAreAppositive(style)) {
    let s = Styles.opponentPrecedesGameClause(style)
      ? [body, teamClause, gameClause].filter(Boolean).join(" ")
      : [body, gameClause, teamClause].filter(Boolean).join(" ");
    const weekday = Styles.includesWeekday(style) && ctx.captureDate ? WireDate.weekday(ctx.captureDate) : "";
    if (date) s += weekday ? `, ${weekday}, ${date}` : `, ${date}`;
    if (Styles.namesVenue(style) && venue) {
      s += `${date ? "," : ""} at ${venue}`;
      if (place) s += ` in ${place}`;
    } else if (place) {
      s += `${date ? "," : ""} in ${place}`;
    }
    return [end(s), credit].filter(Boolean).join(" ");
  }

  // Getty and Icon: the play, the opponent, the ground, then "on" the date and the city.
  const parts = [body, gameClause, teamClause].filter(Boolean);
  if (Styles.namesVenue(style) && venue) parts.push(`at ${venue}`);
  if (date) parts.push(`on ${date}`);
  if (place) parts.push(`in ${place}`);
  return [end(dateline(ctx) + parts.join(" ")), credit].filter(Boolean).join(" ");
}

// ---------------------------------------------------------------- helpers

function formatNumber(n: string, style: CaptionStyle, leadingSpace = false): string {
  if (!n) return "";
  const s = Styles.jerseyNumberIsParenthesised(style) ? `(${n})` : `#${n}`;
  return leadingSpace ? ` ${s}` : s;
}

function possessive(name: string): string {
  const t = name.trim();
  return /s$/i.test(t) ? `${t}'` : `${t}'s`;
}

function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

/** "Neb." already ends the sentence; a second stop would give "Neb..". */
function end(s: string): string {
  const t = s.trim();
  return /[.!?]$/.test(t) ? t : `${t}.`;
}

function tidy(s: string): string {
  let out = s.replace(/\s{2,}/g, " ").replace(/\s+([,.;])/g, "$1").trim();
  if (out && out[0] !== out[0].toUpperCase()) out = out[0].toUpperCase() + out.slice(1);
  return out;
}
