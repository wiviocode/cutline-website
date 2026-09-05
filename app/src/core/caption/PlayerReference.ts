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
    if (WireStyle.includesPosition(style) && match.player.position) parts.push(match.player.position);
    parts.push(name);

    if (style === "simple") return `${name} ${number}`;

    // Hurrdat writes the team singular ahead of the name. When the nickname has no usable
    // singular ("Fighting Irish"), the plural team name is used unchanged.
    if (WireStyle.usesSingularTeamBeforeName(style)) {
      const label = TeamNoun.singularTeamLabel(match.team.name, match.team.nickname) ?? Team.fullName(match.team);
      return `${label} ${name} ${number}`;
    }
    return `${parts.join(" ")} ${number}`;
  },

  /**
   * Describe an athlete by team and number, without a name. Used by rosterless captioning:
   * "a Nebraska Cornhusker (2)" is a complete and factual reference on its own.
   */
  renderDescriptive(number: string, team: Team | null, style: CaptionStyle): string {
    const formatted = formatNumber(number, style);
    if (!team) return formatted ? `a player ${formatted}` : "a player";

    if (WireStyle.usesOfTheTeamForm(style)) {
      if (!formatted) {
        return Team.takesDefiniteArticle(team) ? `a player of ${Team.withArticle(team)}` : `a ${Team.fullName(team)} player`;
      }
      return Team.takesDefiniteArticle(team)
        ? `a player ${formatted} of ${Team.withArticle(team)}`
        : `a ${Team.fullName(team)} player ${formatted}`;
    }

    // "a Nebraska Cornhusker (2)" where the nickname has a singular, otherwise
    // "a Notre Dame Fighting Irish player (2)".
    const singular = TeamNoun.singularTeamLabel(team.name, team.nickname);
    if (singular) return formatted ? `a ${singular} ${formatted}` : `a ${singular}`;
    return formatted ? `a ${Team.fullName(team)} player ${formatted}` : `a ${Team.fullName(team)} player`;
  },

  /** Describe a competitor at an event with no teams: "a rider (12)". */
  renderParticipant(number: string, noun: string, style: CaptionStyle): string {
    const formatted = formatNumber(number, style);
    return formatted ? `a ${noun} ${formatted}` : `a ${noun}`;
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
