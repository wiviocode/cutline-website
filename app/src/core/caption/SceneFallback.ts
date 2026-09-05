/**
 * Phrasing for captions with no identified athletes.
 *
 * The model supplies only a bare verb phrase (`cheer from the stands`); the subject noun is
 * prepended here. The prompt instructs the model not to repeat the subject precisely because this
 * stage adds it — duplicating it yields "Cheerleaders Cheerleaders perform".
 */

import { Team } from "../roster/Roster";
import type { SceneType } from "../vision/VisionResult";
import type { CaptionStyle } from "./CompositionContext";

export const SceneFallback = {
  /** Subject noun phrase, and whether it takes a plural verb. */
  subject(scene: SceneType, team: Team | null, _style: CaptionStyle, _professional: boolean): { text: string; plural: boolean } | null {
    const name = team ? Team.fullName(team) : null;
    switch (scene) {
      case "crowd":        return { text: "Fans", plural: true };
      case "cheerleaders": return { text: name ? `${name} cheerleaders` : "Cheerleaders", plural: true };
      case "band":         return { text: name ? `The ${name} band` : "The band", plural: false };
      case "mascot":       return { text: name ? `The ${name} mascot` : "The mascot", plural: false };
      case "coaches":      return { text: name ? `A ${name} coach` : "A coach", plural: false };
      case "bench":        return { text: team ? Team.groupLabel(team, "players") : "Players", plural: true };
      case "celebration":  return { text: team ? Team.groupLabel(team, "players") : "Players", plural: true };
      default:             return null;
    }
  },

  /** Default verb phrase when the model supplied no `scene_description`. */
  defaultPhrase(scene: SceneType): string | null {
    switch (scene) {
      case "crowd":       return "watch from the stands";
      case "coaches":     return "watches from the sideline";
      case "bench":       return "look on from the bench";
      case "celebration": return "celebrate after the game";
      default:            return null;
    }
  },

  /** Whole-caption form for scenes with no subject noun of their own. */
  standaloneOpening(scene: SceneType, venue: string | null | undefined): string | null {
    switch (scene) {
      case "wide_view":   return venue ? `A general view of ${venue}` : "A general view of the venue";
      case "celebration": return "Players celebrate";
      default:            return null;
    }
  },
};
