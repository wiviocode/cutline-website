/**
 * Assembles a finished caption from a vision observation, the roster, and the shoot's metadata.
 *
 * The vision model deliberately returns no prose — it is forbidden from writing names, teams,
 * dates, or locations. Everything a reader recognises as a caption is produced here.
 *
 * Stage order is fixed: roster matching → prepend/IPTC base → colour arbitration, with colour
 * arbitration also consulted inside matching.
 */

import { Roster, Team, type Team as TeamT } from "../roster/Roster";
import { RosterMatcher, type Match } from "../roster/RosterMatcher";
import { TeamColorArbiter } from "../roster/TeamColorArbiter";
import { isSceneFallback, type VisionPlayer, type VisionResult, type Interaction } from "../vision/VisionResult";
import { EventDescription, type CompositionContext, type Sport } from "./CompositionContext";
import { WireStyle, WireDate } from "./WireStyle";
import { USState } from "./USState";
import { SceneFallback } from "./SceneFallback";
import { PlayerReference } from "./PlayerReference";
import { Cleanup } from "./Cleanup";
import { PrependComposer, type ComposerWarning } from "./PrependComposer";

export interface ComposerOutput {
  caption: string;
  warnings: ComposerWarning[];
  /** Players that appeared in the observation but not in the caption. */
  suppressedPlayerCount: number;
}

interface Resolved { observation: VisionPlayer; match: Match | null }

export const CaptionComposer = {
  compose(vision: VisionResult, context: CompositionContext): ComposerOutput {
    const warnings: ComposerWarning[] = [];
    const namedTeamIDs = new Set<string>();

    const body = isSceneFallback(vision.sceneType) || vision.players.length === 0
      ? composeSceneFallback(vision, context, namedTeamIDs, warnings)
      : composePlayerCaption(vision, context, namedTeamIDs, warnings);

    const suppressed = Math.max(0, vision.players.length - countRendered(vision, context));
    if (suppressed > 0) warnings.push("filtered_non_participants");

    let caption = applyTail(body, context, namedTeamIDs, warnings);
    if (context.mode === "prependToBase") caption = PrependComposer.apply(caption, context, warnings);
    caption = Cleanup.tidy(caption);
    if (context.appendCredit && context.iptc.rights) caption += ` ${context.iptc.rights}`;

    return { caption, warnings, suppressedPlayerCount: suppressed };
  },
};

// ---- Player captions ----

function composePlayerCaption(vision: VisionResult, context: CompositionContext,
                              namedTeamIDs: Set<string>, warnings: ComposerWarning[]): string {
  const matcher = new RosterMatcher(context.roster, context.sport);
  const resolved: Resolved[] = vision.players.map((player) => {
    const r = matcher.match(player.jerseyNumber, player.jerseyColor, player.action);
    return { observation: player, match: r.ok ? r.match : null };
  });

  const usable = resolved.filter((r) =>
    r.match != null || context.fallback === "markUnidentified" || context.fallback === "describeWithoutName");
  // Only the placeholder path is a warning. Describing a player without a name is the intended
  // outcome of rosterless captioning, not a degraded one.
  if (context.fallback === "markUnidentified" && usable.some((r) => r.match == null)) warnings.push("unidentified_placeholder");
  if (usable.length === 0) return fallbackActionSentence(vision);

  // An interaction names exactly two players in a single relational clause.
  if (vision.interaction) {
    const sentence = composeInteraction(vision.interaction, resolved, context, namedTeamIDs);
    if (sentence) return sentence;
  }

  // A group action must not span both teams: "reach for a loose ball" is only coherent when the
  // subjects are teammates.
  if (vision.groupAction && usable.length >= 3) {
    const teams = new Set(usable.filter((r) => r.match).map((r) => r.match!.team.id));
    if (teams.size > 1) {
      warnings.push("group_action_dropped_mixed_teams");
    } else {
      const names = usable.map((r) => render(r, context, namedTeamIDs));
      return `${list(names)} ${vision.groupAction.phrase}`;
    }
  }

  if (usable.length === 1) {
    const one = usable[0];
    const verb = one.observation.action || vision.primaryAction;
    return `${render(one, context, namedTeamIDs)} ${verb}`;
  }
  return list(usable.map((r) => `${render(r, context, namedTeamIDs)} ${r.observation.action}`));
}

function composeInteraction(interaction: Interaction, resolved: Resolved[], context: CompositionContext,
                            namedTeamIDs: Set<string>): string | null {
  const find = (number: string, color: string) =>
    resolved.find((r) => r.observation.jerseyNumber === number && r.observation.jerseyColor === color)
    ?? resolved.find((r) => r.observation.jerseyNumber === number);
  const subject = find(interaction.subjectJerseyNumber, interaction.subjectJerseyColor);
  const target = find(interaction.targetJerseyNumber, interaction.targetJerseyColor);
  if (!subject || !target || !interaction.phrase) return null;
  return `${render(subject, context, namedTeamIDs)} ${interaction.phrase} ${render(target, context, namedTeamIDs)}`;
}

// ---- Scene captions ----

function composeSceneFallback(vision: VisionResult, context: CompositionContext,
                              namedTeamIDs: Set<string>, warnings: ComposerWarning[]): string {
  if (context.event) return composeEventScene(vision, context);

  const { team, overridden } = TeamColorArbiter.subjectTeam(context.roster, vision.subjectTeamColor, vision.nearbyPlayerColors);
  if (overridden) warnings.push("subject_team_color_overruled");
  if (team) namedTeamIDs.add(team.id);

  const phrase0 = vision.sceneDescription.trim();

  // A wide view never has a subject of its own — the venue is the subject.
  if (vision.sceneType === "wide_view") {
    return SceneFallback.standaloneOpening("wide_view", context.iptc.venue) ?? fallbackActionSentence(vision);
  }

  const subject = SceneFallback.subject(vision.sceneType, team, context.style, context.isProfessionalLeague);

  // Prefer "<subject> <phrase>" whenever both are available. The standalone opening is a
  // fallback for when the model supplied no phrase — using it alongside one produces a doubled
  // verb, e.g. "Players celebrate huddle together".
  if (subject && phrase0) return `${subject.text} ${phrase0}`;
  const standalone = SceneFallback.standaloneOpening(vision.sceneType, context.iptc.venue);
  if (standalone) return standalone;
  if (!subject) return fallbackActionSentence(vision);

  const phrase = phrase0 || SceneFallback.defaultPhrase(vision.sceneType) || vision.primaryAction;
  return phrase ? `${subject.text} ${phrase}` : subject.text;
}

function fallbackActionSentence(vision: VisionResult): string {
  const action = vision.primaryAction || "game action";
  return action[0].toUpperCase() + action.slice(1);
}

/** A scene at an event with no teams: crowd, officials, a wide view of the course. */
function composeEventScene(vision: VisionResult, context: CompositionContext): string {
  const phrase = vision.sceneDescription.trim();
  if (vision.sceneType === "wide_view") {
    return SceneFallback.standaloneOpening("wide_view", context.iptc.venue) ?? (phrase || "The scene");
  }
  const subject = SceneFallback.subject(vision.sceneType, null, context.style, context.isProfessionalLeague);
  if (subject && phrase) return `${subject.text} ${phrase}`;
  const standalone = SceneFallback.standaloneOpening(vision.sceneType, context.iptc.venue);
  if (standalone) return standalone;
  if (!subject) {
    if (phrase) return phrase;
    const noun = context.event ? EventDescription.noun(context.event) : "competitor";
    return `${noun[0].toUpperCase() + noun.slice(1)}s compete`;
  }
  const fallbackPhrase = SceneFallback.defaultPhrase(vision.sceneType) ?? "";
  return fallbackPhrase ? `${subject.text} ${fallbackPhrase}` : subject.text;
}

// ---- The parts each desk writes its own way ----

function dateText(context: CompositionContext): string {
  if (context.captureDate) return WireDate.text(context.captureDate, WireStyle.monthForm(context.style));
  // No capture date to work from — fall back to whatever was handed in, which is in AP's form.
  return context.iptc.dateText ?? "";
}

/** "Lincoln, Neb." or "Lincoln, Nebraska" or "Lincoln, NE, USA", by desk. */
function placeText(context: CompositionContext): string {
  const city = (context.iptc.city ?? "").trim();
  const typed = (context.iptc.state ?? context.iptc.country ?? "").trim();
  const state = typed ? USState.written(typed, WireStyle.stateForm(context.style)) : "";
  const parts = [city, state].filter((p) => p.length > 0);
  // Imagn closes the location token with the country, always.
  if (WireStyle.stateForm(context.style) === "postal" && parts.length) parts.push("USA");
  return parts.join(", ");
}

/** Icon leads with "LINCOLN, NE - SEPTEMBER 14:". */
function dateline(context: CompositionContext): string {
  if (!WireStyle.hasDateline(context.style)) return "";
  const city = (context.iptc.city ?? "").trim().toUpperCase();
  const typed = (context.iptc.state ?? "").trim();
  const state = typed ? USState.written(typed, "postal").toUpperCase() : "";
  const where = [city, state].filter((p) => p.length > 0).join(", ");
  if (!context.captureDate || !where) return "";
  return `${where} - ${WireDate.datelineDate(context.captureDate)}: `;
}

/** Imagn writes a record, not a sentence: a leading date and location token, the play, and a mandatory credit. */
function imagnRecord(body: string, gameClause: string, teamClause: string, context: CompositionContext): string {
  let sentence = body;
  if (teamClause) sentence += ` ${teamClause}`;
  if (gameClause) sentence += ` ${gameClause}`;
  if (context.iptc.venue) sentence += ` at ${context.iptc.venue}`;
  if (!sentence.endsWith(".")) sentence += ".";

  const lead: string[] = [];
  const date = dateText(context); if (date) lead.push(date);
  const place = placeText(context); if (place) lead.push(place);
  let out = lead.length ? lead.join("; ") + "; " + sentence : sentence;
  const credit = WireStyle.creditLine(context.style, context.photographer);
  if (credit) out += ` ${credit}`;
  return out;
}

function applyTail(body: string, context: CompositionContext, namedTeamIDs: Set<string>,
                   warnings: ComposerWarning[]): string {
  if (context.style === "imagnImages" && !context.iptc.country) warnings.push("imagn_country_missing");

  // An event replaces the whole "a <level> <sport> game between …" construction.
  if (context.event) {
    const c = EventDescription.clause(context.event);
    const clause = c ? `during ${c}` : "";
    if (WireStyle.datesAreAppositive(context.style)) return appositiveTail(body, clause, "", context);
    const parts = [body];
    if (clause) parts.push(clause);
    if (WireStyle.namesVenue(context.style) && context.iptc.venue) parts.push(`at ${context.iptc.venue}`);
    const date = dateText(context); if (date) parts.push(`on ${date}`);
    const place = placeText(context); if (place) parts.push(`in ${place}`);
    let sentence = dateline(context) + parts.join(" ");
    if (!sentence.endsWith(".")) sentence += ".";
    const credit = WireStyle.creditLine(context.style, context.photographer);
    if (credit) sentence += ` ${credit}`;
    return sentence;
  }

  const t1 = context.roster.team1, t2 = context.roster.team2;
  const level = context.iptc.leagueLevel ? `${WireStyle.levelQualifier(context.style, context.iptc.leagueLevel)} ` : "";
  const gameClause = `during ${article(level ? level : sportNoun(context.sport))}${level}${sportNoun(context.sport)} game`;

  let teamClause = "";
  switch (namedTeamIDs.size) {
    case 0: teamClause = `between ${Team.withArticle(t1)} and ${Team.withArticle(t2)}`; break;
    case 1: {
      const other = [t1, t2].find((t) => !namedTeamIDs.has(t.id));
      if (other) teamClause = `against ${Team.withArticle(other)}`;
      break;
    }
    default: break; // both already named inline
  }

  if (WireStyle.isDelimitedRecord(context.style)) return imagnRecord(body, gameClause, teamClause, context);
  if (WireStyle.datesAreAppositive(context.style)) return appositiveTail(body, gameClause, teamClause, context);

  // Getty and Icon: the play, the opponent, the ground, then the date and the city.
  const clause = teamClause ? `${gameClause} ${teamClause}` : gameClause;
  const parts = [body, clause];
  if (WireStyle.namesVenue(context.style) && context.iptc.venue) parts.push(`at ${context.iptc.venue}`);
  const date = dateText(context); if (date) parts.push(`on ${date}`);
  const place = placeText(context); if (place) parts.push(`in ${place}`);
  let sentence = dateline(context) + parts.join(" ");
  if (!sentence.endsWith(".")) sentence += ".";
  const credit = WireStyle.creditLine(context.style, context.photographer);
  if (credit) sentence += ` ${credit}`;
  return sentence;
}

/**
 * Hurrdat's template, from their style guide: "… during a college football game, Saturday,
 * Sept. 14, 2021, in Lincoln, Neb. Photo by John Peterson." With a weekday the date is set off
 * by a comma after "game"; without one it runs straight on. The venue, when known, is
 * introduced with "at" before the "in <city>" clause.
 */
function appositiveTail(body: string, gameClause: string, teamClause: string, context: CompositionContext): string {
  let sentence = body;
  if (WireStyle.opponentPrecedesGameClause(context.style)) {
    if (teamClause) sentence += ` ${teamClause}`;
    sentence += ` ${gameClause}`;
  } else {
    sentence += ` ${gameClause}`;
    if (teamClause) sentence += ` ${teamClause}`;
  }
  const date = dateText(context);
  const weekday = WireStyle.includesWeekday(context.style) ? (context.weekday ?? "") : "";
  if (date) sentence += weekday ? `, ${weekday}, ${date}` : ` ${date}`;

  const place = placeText(context);
  if (WireStyle.namesVenue(context.style) && context.iptc.venue) {
    sentence += date ? `, at ${context.iptc.venue}` : ` at ${context.iptc.venue}`;
    if (place) sentence += ` in ${place}`;
  } else if (place) {
    sentence += date ? `, in ${place}` : ` in ${place}`;
  }
  // "Neb." already ends the sentence; a second full stop would give "Neb..".
  if (!sentence.endsWith(".")) sentence += ".";
  const credit = WireStyle.creditLine(context.style, context.photographer);
  if (credit) sentence += ` ${credit}`;
  return sentence;
}

/**
 * "a" or "an", by how the next word is *said*. Initialisms are the exception that matters: NCAA
 * is read "en-see-ay-ay", so it takes "an" despite starting with a consonant.
 */
function article(next: string): string {
  const word = next.toLowerCase();
  const f = word[0];
  if (!f) return "a ";
  if (["ncaa", "nfl", "nba", "nhl", "mls"].some((p) => word.startsWith(p))) return "an ";
  return "aeiou".includes(f) ? "an " : "a ";
}

function sportNoun(s: Sport): string {
  switch (s) {
    case "trackAndField": return "track and field";
    case "crossCountry":  return "cross country";
    case "autoRacing":    return "auto racing";
    case "horseRacing":   return "horse racing";
    default:              return s;
  }
}

// ---- Helpers ----

function render(r: Resolved, context: CompositionContext, namedTeamIDs: Set<string>): string {
  // An event has no sides, so there is no team to record as named.
  if (context.event) return renderText(r, context);
  if (r.match) namedTeamIDs.add(r.match.team.id);
  else {
    const t = TeamColorArbiter.team(context.roster, r.observation.jerseyColor);
    if (t) namedTeamIDs.add(t.id);
  }
  return renderText(r, context);
}

function renderText(r: Resolved, context: CompositionContext): string {
  if (context.event) {
    return PlayerReference.renderParticipant(r.observation.jerseyNumber, EventDescription.noun(context.event), context.style);
  }
  if (r.match) return PlayerReference.render(r.match, context.style, context.isProfessionalLeague);
  const team: TeamT | null = TeamColorArbiter.team(context.roster, r.observation.jerseyColor);
  if (context.fallback === "describeWithoutName") {
    return PlayerReference.renderDescriptive(r.observation.jerseyNumber, team, context.style);
  }
  return PlayerReference.renderUnidentified(r.observation.jerseyNumber, team, context.style, context.isProfessionalLeague);
}

function countRendered(vision: VisionResult, context: CompositionContext): number {
  if (isSceneFallback(vision.sceneType)) return 0;
  const matcher = new RosterMatcher(context.roster, context.sport);
  return vision.players.filter((p) => {
    if (matcher.match(p.jerseyNumber, p.jerseyColor, p.action).ok) return true;
    return context.fallback === "markUnidentified" || context.fallback === "describeWithoutName";
  }).length;
}

function list(items: string[]): string {
  switch (items.length) {
    case 0: return "";
    case 1: return items[0];
    case 2: return `${items[0]} and ${items[1]}`;
    default: return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
  }
}

export { Roster };
