/**
 * Phrasing for captions with no identified athletes.
 *
 * The model supplies only a bare verb phrase (`cheer from the stands`); the subject noun is
 * prepended here. The prompt instructs the model not to repeat the subject precisely because this
 * stage adds it — duplicating it yields "Cheerleaders Cheerleaders perform".
 */

import { Article } from "./Article";
import { Team } from "../roster/Roster";
import type { SceneType } from "../vision/VisionResult";
import type { CaptionStyle } from "./CompositionContext";

/** "An" before a vowel sound: "An Ohio State coach", "A Nebraska coach", "A Utah coach". */
export function indefiniteArticle(word: string): string {
  return Article.leading(word);
}

export const SceneFallback = {
  /**
   * Subject noun phrase, and whether it takes a plural verb. `phrasePlural` is how many the
   * model's own phrase describes, which is the only evidence of how many are in the frame: an
   * unplaceable scene is one player or several depending on it, and every other scene has a
   * subject whose number is already settled.
   */
  subject(scene: SceneType, team: Team | null, _style: CaptionStyle, _professional: boolean,
          phrasePlural: boolean | null = null): { text: string; plural: boolean } | null {
    const name = team ? Team.fullName(team) : null;
    switch (scene) {
      case "crowd":        return { text: "Fans", plural: true };
      case "cheerleaders": return { text: name ? `${name} cheerleaders` : "Cheerleaders", plural: true };
      case "band":         return { text: name ? `The ${name} band` : "The band", plural: false };
      case "mascot":       return { text: name ? `The ${name} mascot` : "The mascot", plural: false };
      case "coaches":      return { text: name ? `${indefiniteArticle(name)} ${name} coach` : "A coach", plural: false };
      case "bench":        return { text: team ? Team.groupLabel(team, "players") : "Players", plural: true };
      case "celebration":  return { text: team ? Team.groupLabel(team, "players") : "Players", plural: true };
      // A scene the model could not place — a portrait, a warm-up, a moment on the sideline. With
      // a team's colour in frame the subject is one of its players; without one there is nothing
      // honest to say, and the caller falls back to the phrase alone.
      case "other":
        if (!team) return null;
        return phrasePlural === true
          ? { text: `${Team.fullName(team)} players`, plural: true }
          : { text: `${indefiniteArticle(Team.fullName(team))} ${Team.fullName(team)} player`, plural: false };
      default:             return null;
    }
  },

  /**
   * Scenes whose subjects are athletes in uniform. A number read on one of them and matched to
   * the roster names them; the group sentence is for when nobody could be identified. The rest —
   * the crowd, the band, the mascot, a coach, a wide view — have no numbered subject to name.
   */
  namesAthletes(scene: SceneType): boolean {
    return scene === "celebration" || scene === "bench" || scene === "other";
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
