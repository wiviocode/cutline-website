/**
 * The structured observation returned by the vision model.
 *
 * The model is explicitly forbidden from writing prose: it reports what is visible and nothing
 * else. Everything a reader would recognise as a caption is assembled from this plus the roster
 * and the shoot's metadata. Two things follow, and they are the reason for the split: a jersey
 * number corrected during review re-composes the caption locally, and caption style is a
 * function, not a prompt.
 */

export type SceneType =
  | "players_action" | "wide_view" | "crowd" | "cheerleaders" | "band"
  | "mascot" | "coaches" | "bench" | "celebration" | "other";

export const SCENE_TYPES: SceneType[] = [
  "players_action", "wide_view", "crowd", "cheerleaders", "band", "mascot", "coaches", "bench", "celebration", "other",
];

/** Scene types where the caption describes a group rather than named athletes. */
export const isSceneFallback = (s: SceneType): boolean => s !== "players_action";

export interface VisionPlayer {
  /** Jersey number as written on the uniform. Empty when unreadable — never guessed. */
  jerseyNumber: string;
  /** Colour of the jersey *body panel*, lowercased. Not trim, sleeves, or numbers. */
  jerseyColor: string;
  /** Present-tense verb phrase, 1–5 words. */
  action: string;
  confidence: number;
  /** Free-form model annotations, e.g. `unreadable_number`, `partial_frame`. */
  flags: string[];
}

/** A relational play between exactly two identified players. */
export interface Interaction {
  subjectJerseyNumber: string;
  subjectJerseyColor: string;
  targetJerseyNumber: string;
  targetJerseyColor: string;
  /** Relational verb phrase, e.g. `dunks over`. */
  phrase: string;
}

export interface VisionResult {
  sceneType: SceneType;
  players: VisionPlayer[];
  interaction: Interaction | null;
  /** A single action shared by three or more identified players. */
  groupAction: { phrase: string } | null;
  /** Last-resort phrase when there is no interaction, group action, or per-player action. */
  primaryAction: string;
  /** Used only on the scene-fallback path. The subject is prepended, so the model does not repeat it. */
  sceneDescription: string;
  subjectTeamColor: string | null;
  /** Jersey colours of the scene's subjects, majority-voted against configured team colours. */
  nearbyPlayerColors: string[];
  overallConfidence: number;
}

export const VisionPlayer = {
  make(jerseyNumber: string, jerseyColor: string, action: string, confidence = 1.0, flags: string[] = []): VisionPlayer {
    return { jerseyNumber, jerseyColor, action, confidence, flags };
  },
};

export const VisionResult = {
  make(p: Partial<VisionResult> & { sceneType: SceneType }): VisionResult {
    return {
      sceneType: p.sceneType,
      players: p.players ?? [],
      interaction: p.interaction ?? null,
      groupAction: p.groupAction ?? null,
      primaryAction: p.primaryAction ?? "",
      sceneDescription: p.sceneDescription ?? "",
      subjectTeamColor: p.subjectTeamColor ?? null,
      nearbyPlayerColors: p.nearbyPlayerColors ?? [],
      overallConfidence: p.overallConfidence ?? 1.0,
    };
  },

  /**
   * Decode the model's JSON, tolerantly. Every field beyond `scene_type` is optional on the way
   * in, because a missing field is a degraded observation and a thrown error is a lost frame.
   */
  fromJSON(o: unknown): VisionResult {
    if (!o || typeof o !== "object") throw new Error("the reply did not match the schema: not an object");
    const r = o as Record<string, unknown>;
    const str = (v: unknown, d = "") => (typeof v === "string" ? v : v == null ? d : String(v));
    const num = (v: unknown, d: number) => (typeof v === "number" && isFinite(v) ? v : d);
    const scene = str(r.scene_type ?? r.sceneType, "other") as SceneType;
    const sceneType: SceneType = SCENE_TYPES.includes(scene) ? scene : "other";

    const players: VisionPlayer[] = Array.isArray(r.players)
      ? (r.players as unknown[]).filter((p) => p && typeof p === "object").map((p) => {
          const q = p as Record<string, unknown>;
          return {
            jerseyNumber: str(q.jersey_number ?? q.jerseyNumber),
            jerseyColor: str(q.jersey_color ?? q.jerseyColor),
            action: str(q.action),
            confidence: num(q.confidence, 1.0),
            flags: Array.isArray(q.flags) ? (q.flags as unknown[]).map((f) => str(f)) : [],
          };
        })
      : [];

    let interaction: Interaction | null = null;
    const i = r.interaction as Record<string, unknown> | null | undefined;
    if (i && typeof i === "object") {
      interaction = {
        subjectJerseyNumber: str(i.subject_jersey_number ?? i.subjectJerseyNumber),
        subjectJerseyColor: str(i.subject_jersey_color ?? i.subjectJerseyColor),
        targetJerseyNumber: str(i.target_jersey_number ?? i.targetJerseyNumber),
        targetJerseyColor: str(i.target_jersey_color ?? i.targetJerseyColor),
        phrase: str(i.phrase),
      };
    }
    const g = r.group_action ?? r.groupAction;
    const groupAction = g && typeof g === "object" ? { phrase: str((g as Record<string, unknown>).phrase) } : null;
    const nearby = r.nearby_player_colors ?? r.nearbyPlayerColors;
    const subject = r.subject_team_color ?? r.subjectTeamColor;

    return {
      sceneType,
      players,
      interaction,
      groupAction,
      primaryAction: str(r.primary_action ?? r.primaryAction),
      sceneDescription: str(r.scene_description ?? r.sceneDescription),
      subjectTeamColor: subject == null ? null : str(subject),
      nearbyPlayerColors: Array.isArray(nearby) ? (nearby as unknown[]).map((c) => str(c)) : [],
      overallConfidence: num(r.overall_confidence ?? r.overallConfidence, 1.0),
    };
  },

  /** The wire shape, for records on disk that the native app can also read. */
  toJSON(v: VisionResult): Record<string, unknown> {
    return {
      scene_type: v.sceneType,
      players: v.players.map((p) => ({
        jersey_number: p.jerseyNumber, jersey_color: p.jerseyColor, action: p.action,
        confidence: p.confidence, flags: p.flags,
      })),
      interaction: v.interaction ? {
        subject_jersey_number: v.interaction.subjectJerseyNumber, subject_jersey_color: v.interaction.subjectJerseyColor,
        target_jersey_number: v.interaction.targetJerseyNumber, target_jersey_color: v.interaction.targetJerseyColor,
        phrase: v.interaction.phrase,
      } : null,
      group_action: v.groupAction ? { phrase: v.groupAction.phrase } : null,
      primary_action: v.primaryAction,
      scene_description: v.sceneDescription,
      subject_team_color: v.subjectTeamColor,
      nearby_player_colors: v.nearbyPlayerColors,
      overall_confidence: v.overallConfidence,
    };
  },
};
