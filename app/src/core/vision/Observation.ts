/**
 * What the model reports about one photograph.
 *
 * The model points at people and describes the moment; it never writes a name, a team, a date
 * or a place. The caption clause refers to people through tokens — `{P1}`, `{A:players}` — and
 * the composer renders those in the desk's house style from the roster. So a correction during
 * review re-renders the caption locally, and grammar stays the model's job while names stay the
 * software's.
 */

export const SCENES = [
  "action", "celebration", "huddle", "bench", "coach", "portrait", "crowd", "cheer", "band", "mascot", "wide", "ceremony", "other",
] as const;
export type Scene = (typeof SCENES)[number];

export type SubjectKind = "athlete" | "coach" | "official" | "fan" | "performer" | "other";
export type TeamCall = "A" | "B" | "none" | "unsure";
export type Clarity = "clear" | "partial" | "hidden";

export interface Subject {
  /** "P1", "P2", … in order of importance; the token the clause uses. */
  id: string;
  kind: SubjectKind;
  team: TeamCall;
  /** Digits the model could actually see. Empty when none. */
  number: string;
  clarity: Clarity;
  /** The roster entry the model chose, as written in the roster ("15 Andi Jackson"), or "". */
  player: string;
  /** One or two words: "ball carrier", "setter", "goalkeeper", "coach". */
  role: string;
  /** Where the number was seen: "chest", "back", "helmet", … or "none". */
  numberOn: string;
  /** Text printed on the uniform, when legible: "NEBRASKA", "ANTLERS". */
  uniformText: string;
  /** Pixel box in the image the model saw: [x1, y1, x2, y2]. Null when not given. */
  box: [number, number, number, number] | null;
}

export interface Observation {
  scene: Scene;
  subjects: Subject[];
  /** One present-tense clause with tokens: "{P1} catches a pass over {P2}". */
  clause: string;
  /** When in the event the frame falls, so a warm-up is not captioned "during the game". */
  timing: Timing;
}

export type Timing = "during" | "before" | "after";

const TOKEN = /\{(P\d+|A|B|A:players|B:players|venue)\}/g;

export const Observation = {
  /** Every token a clause uses. */
  tokens(clause: string): string[] {
    return [...clause.matchAll(TOKEN)].map((m) => m[1]);
  },

  /**
   * Decode the model's JSON tolerantly. Structured outputs guarantee the shape on the wire, but
   * records saved to disk and replies from a retried call are decoded here too — a missing field
   * is a degraded observation, a thrown error is a lost frame.
   */
  fromJSON(raw: unknown): Observation {
    const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const s = (v: unknown) => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");
    const scene = SCENES.includes(s(o.scene) as Scene) ? (s(o.scene) as Scene) : "other";
    const subjects: Subject[] = (Array.isArray(o.subjects) ? o.subjects : []).filter((x) => x && typeof x === "object").map((x, i) => {
      const q = x as Record<string, unknown>;
      const kind = (["athlete", "coach", "official", "fan", "performer", "other"] as const).find((k) => k === s(q.kind)) ?? "athlete";
      const team = (["A", "B", "none", "unsure"] as const).find((k) => k === s(q.team)) ?? "unsure";
      const clarity = (["clear", "partial", "hidden"] as const).find((k) => k === s(q.clarity)) ?? (s(q.number) ? "partial" : "hidden");
      const box = Array.isArray(q.box) && q.box.length === 4 && q.box.every((n) => typeof n === "number" && isFinite(n))
        ? (q.box as number[]).map((n) => Math.max(0, Math.round(n))) as [number, number, number, number] : null;
      return {
        id: /^P\d+$/.test(s(q.id)) ? s(q.id) : `P${i + 1}`,
        kind, team,
        number: cleanNumber(s(q.number)),
        // A number with an unreadable digit is partial whatever the model called it.
        clarity: !cleanNumber(s(q.number)) ? "hidden" : cleanNumber(s(q.number)).includes("?") && clarity === "clear" ? "partial" : clarity,
        player: s(q.player),
        role: s(q.role),
        uniformText: s(q.uniform_text ?? q.uniformText),
        numberOn: s(q.number_on ?? q.numberOn) || (s(q.number) ? "chest" : "none"),
        box,
      };
    });
    const timing = (["during", "before", "after"] as const).find((t) => t === s(o.timing)) ?? "during";
    return { scene, subjects, clause: s(o.clause), timing };
  },

  toJSON(v: Observation): Record<string, unknown> {
    return {
      scene: v.scene,
      subjects: v.subjects.map((p) => ({
        id: p.id, kind: p.kind, team: p.team, number: p.number, clarity: p.clarity, player: p.player,
        role: p.role, uniform_text: p.uniformText, number_on: p.numberOn, box: p.box,
      })),
      clause: v.clause,
      timing: v.timing,
    };
  },
};

/**
 * The JSON schema the model's reply is constrained to (structured outputs). Field order matters:
 * the model writes top to bottom, so it decides the scene and looks at each person — team,
 * digits, clarity — before it chooses a roster entry, and chooses everyone before it writes the
 * clause about them.
 */
export const OBSERVATION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["scene", "subjects", "clause", "timing"],
  properties: {
    scene: { type: "string", enum: [...SCENES] },
    subjects: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "kind", "team", "uniform_text", "number_on", "number", "clarity", "player", "role", "box"],
        properties: {
          id: { type: "string" },
          kind: { type: "string", enum: ["athlete", "coach", "official", "fan", "performer", "other"] },
          team: { type: "string", enum: ["A", "B", "none", "unsure"] },
          uniform_text: { type: "string" },
          number_on: { type: "string", enum: ["chest", "back", "shoulder", "sleeve", "shorts", "helmet", "none"] },
          number: { type: "string" },
          clarity: { type: "string", enum: ["clear", "partial", "hidden"] },
          player: { type: "string" },
          role: { type: "string" },
          box: { type: "array", items: { type: "integer" } },
        },
      },
    },
    clause: { type: "string" },
    timing: { type: "string", enum: ["during", "before", "after"] },
  },
} as const;

/** Digits, and "?" for a digit that is there but unreadable. A number of only "?"s says nothing. */
export function cleanNumber(raw: string): string {
  const n = raw.replace(/[^0-9?]/g, "").slice(0, 3);
  return /\d/.test(n) ? n : "";
}
