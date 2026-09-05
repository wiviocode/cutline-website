/**
 * Accessibility alt text, two ways: asked of a model, or built here for free.
 */

import type { VisionResult } from "../vision/VisionResult";

/**
 * The model-side request. One of three call types, distinguished only by its prompt.
 * Parameters are taken from captured traffic: `maxTokens 400`, and a system instruction.
 */
export const AltTextRequest = {
  maxTokens: 400,
  /** Hard limit stated in both the system instruction and the user prompt. */
  characterLimit: 250,

  systemInstruction:
    "Follow the instructions in the user message. Reply with exactly one complete sentence: " +
    "the alt text only. No quotation marks. Hard maximum 250 characters. Never name individual " +
    "players or people; never transcribe jersey or uniform text. The sentence MUST end with a " +
    "period and must not stop mid-phrase.",

  instructions:
    "Write one complete sentence of image alt text for accessibility (must end with a period). " +
    "General visual summary only; not a full caption. Max 250 characters. Describe the " +
    "venue/setting (stadium, field, court, etc.) and scene. No photo credit or agency names. " +
    "Do not name any players or people; use generic roles only. Do not read or guess names from " +
    "jerseys or other text in the image, even if the caption names someone. Never stop mid-phrase.",

  /** Assemble the user content, matching the observed section order and headings. */
  userContent(caption?: string | null, sport?: string | null): string {
    let s = AltTextRequest.instructions;
    if (caption) s += `\n\nCAPTION (reference only):\n${caption}`;
    if (sport) s += `\n\nMETADATA:\nSport: ${sport}`;
    s += "\n\nOutput only the alt text.";
    return s;
  },

  /** Validate a model reply against the stated constraints. */
  validate(reply: string): ("empty" | "tooLong" | "notTerminated" | "quoted")[] {
    const problems: ("empty" | "tooLong" | "notTerminated" | "quoted")[] = [];
    const t = reply.trim();
    if (!t) problems.push("empty");
    if (t.length > AltTextRequest.characterLimit) problems.push("tooLong");
    if (!t.endsWith(".")) problems.push("notTerminated");
    if (t.startsWith('"') || t.endsWith('"')) problems.push("quoted");
    return problems;
  },

  /** Strip artefacts a model commonly adds despite the instruction. */
  sanitise(reply: string): string {
    let t = reply.trim();
    if (t.startsWith('"') && t.endsWith('"') && t.length > 1) t = t.slice(1, -1);
    if (t && !t.endsWith(".")) t += ".";
    return t;
  },
};

/**
 * Alt text built here rather than asked of a model.
 *
 * The detailed alt text sends a *second* image of every frame — a whole extra vision call whose
 * answer never touches the caption. This builds the same kind of sentence from what the first
 * call already returned. It costs nothing and it cannot break the two rules that matter, because
 * it has no way to know a name or read a shirt.
 *
 * The model's `primaryAction` is deliberately not used: it comes back sometimes as a noun phrase
 * and sometimes as a verb phrase, and no single way of joining it to a subject fits both.
 */
export const SimpleAltText = {
  build(vision: VisionResult, sport: string, venue: string): string {
    const s = sport.trim().toLowerCase();
    const setting = settingFor(venue);
    let subject: string;
    switch (vision.sceneType) {
      case "crowd":        subject = "Spectators watch from the stands"; break;
      case "cheerleaders": subject = "Cheerleaders perform"; break;
      case "band":         subject = "A marching band performs"; break;
      case "mascot":       subject = "A team mascot performs"; break;
      case "coaches":      subject = "A coach speaks to players"; break;
      case "bench":        subject = "Players watch from the bench"; break;
      case "celebration":  subject = "Players celebrate"; break;
      case "wide_view":    subject = s ? `A wide view of a ${s} venue shows play under way` : "A wide view of a sports venue shows play under way"; break;
      default:             subject = playersSubject(vision.players.length, s);
    }
    return `${subject} ${setting}`.trim() + ".";
  },
};

/** The venue's own name is not used: it is a proper noun a listener cannot picture. */
function settingFor(venue: string): string {
  const v = venue.toLowerCase();
  if (v.includes("stadium") || v.includes("field") || v.includes("park")) return "during a game on an outdoor field";
  if (v.includes("arena") || v.includes("court") || v.includes("gym") || v.includes("school") || v.includes("center") || v.includes("centre")) return "during a game in an indoor arena";
  return "during a game";
}

function playersSubject(count: number, sport: string): string {
  const noun = sport ? `${sport} players` : "athletes";
  switch (count) {
    case 0:  return "Athletes compete";
    case 1:  return `A ${sport ? `${sport} player` : "player"} competes`;
    case 2:  return `Two ${noun} compete`;
    default: return `${noun[0].toUpperCase()}${noun.slice(1)} compete`;
  }
}
