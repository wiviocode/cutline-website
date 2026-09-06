/**
 * Renders a matched player into the form the selected house style requires.
 *
 *  - Getty          — `FirstName LastName #5 of the Kentucky Wildcats`, never a position
 *  - Getty (paren)  — as above with `(5)`
 *  - AP / Imagn     — `Kentucky guard Otega Oweh (00)`
 *  - Simple         — `Otega Oweh (00)`
 */

import { Team, RosterPlayer } from "../roster/Roster";
import type { Match } from "../roster/RosterMatcher";
import { TeamNoun } from "./TeamNoun";
import { Article } from "./Article";
import { WireStyle } from "./WireStyle";
import type { CaptionStyle } from "./CompositionContext";

/** Placeholder emitted when an athlete is visible but unmatched. */
export const UNIDENTIFIED_TOKEN = "XXXXX";

export const PlayerReference = {
  render(match: Match, style: CaptionStyle, _professional: boolean): string {
    const number = formatNumber(match.player.jerseyNumber, style);
    const name = RosterPlayer.fullName(match.player);

    if (WireStyle.usesOfTheTeamForm(style)) return `${name} ${number} of ${Team.withArticle(match.team)}`;

    // The mascot is included for both college and pro when naming players — verified against
    // 19 shipped captions ("Kansas State Wildcats guard Nate Johnson (34)").
    const teamLabel = Team.fullName(match.team);
    const parts = [teamLabel];
    // A two-way player is named by the unit the photograph shows: the linebacker making the
    // tackle, the running back carrying the ball, one roster row.
    const position = RosterPlayer.positionFor(match.player, match.impliedSide);
    if (WireStyle.includesPosition(style) && position) parts.push(position);
    parts.push(name);

    if (style === "simple") return `${name} ${number}`;

    // Hurrdat writes the team singular ahead of the name. When the nickname has no usable
    // singular ("Fighting Irish"), the plural team name is used unchanged.
    if (WireStyle.usesSingularTeamBeforeName(style)) {
      const label = TeamNoun.singularTeamLabel(match.team.name, match.team.nickname) ?? Team.fullName(match.team);
      return `${label} ${name} ${number}`;
    }
    // The AP form is team, position, name. A roster that gives no position — most high-school
    // rosters — would leave "Syracuse Rockets Logan Jazbec", so the school takes the possessive
    // instead: "Syracuse's Logan Jazbec (22)".
    if (WireStyle.includesPosition(style) && !position) return `${PlayerReference.possessive(match.team.name)} ${name} ${number}`;
    return `${parts.join(" ")} ${number}`;
  },

  /** "Nebraska's", "Texas'" — AP adds only the apostrophe to a proper name ending in s. */
  possessive(name: string): string {
    return /s$/i.test(name.trim()) ? `${name.trim()}'` : `${name.trim()}'s`;
  },

  /**
   * Describe an athlete by team and number, without a name. Used by rosterless captioning:
   * "a Nebraska Cornhusker (2)" is a complete and factual reference on its own.
   */
  renderDescriptive(number: string, team: Team | null, style: CaptionStyle): string {
    const formatted = formatNumber(number, style);
    if (!team) return formatted ? `a player ${formatted}` : "a player";
    const full = Team.fullName(team);
    const a = Article.before(full);

    if (WireStyle.usesOfTheTeamForm(style)) {
      if (!formatted) {
        return Team.takesDefiniteArticle(team) ? `a player of ${Team.withArticle(team)}` : `${a}${full} player`;
      }
      return Team.takesDefiniteArticle(team)
        ? `a player ${formatted} of ${Team.withArticle(team)}`
        : `${a}${full} player ${formatted}`;
    }

    // "a Nebraska Cornhusker (2)", "an Army Black Knight (7)"; where the nickname has no
    // singular, "a Notre Dame Fighting Irish player (2)".
    const singular = TeamNoun.singularTeamLabel(team.name, team.nickname);
    if (singular) return formatted ? `${a}${singular} ${formatted}` : `${a}${singular}`;
    return formatted ? `${a}${full} player ${formatted}` : `${a}${full} player`;
  },

  /** Describe a competitor at an event with no teams: "a rider (12)". */
  renderParticipant(number: string, noun: string, style: CaptionStyle): string {
    const formatted = formatNumber(number, style);
    const a = Article.before(noun);
    return formatted ? `${a}${noun} ${formatted}` : `${a}${noun}`;
  },

  /** Render an athlete who could not be matched to the roster. */
  renderUnidentified(number: string, team: Team | null, style: CaptionStyle, _professional: boolean): string {
    const token = UNIDENTIFIED_TOKEN;
    const formatted = formatNumber(number, style);
    // The team label is retained even when the number is unreadable — the reference captions
    // emit "Nebraska Cornhuskers XXXXX shoots a jumper" for that case.
    if (!team) return formatted ? `${token} ${formatted}` : token;
    if (WireStyle.usesOfTheTeamForm(style)) {
      return formatted ? `${token} ${formatted} of ${Team.withArticle(team)}` : `${token} of ${Team.withArticle(team)}`;
    }
    return formatted ? `${Team.fullName(team)} ${token} ${formatted}` : `${Team.fullName(team)} ${token}`;
  },

  formatNumber,
};

function formatNumber(n: string, style: CaptionStyle): string {
  if (!n) return "";
  return WireStyle.jerseyNumberIsParenthesised(style) ? `(${n})` : `#${n}`;
}
