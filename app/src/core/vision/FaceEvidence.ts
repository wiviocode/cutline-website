/**
 * What a face match is allowed to do.
 *
 * Only one thing on its own: name an athlete the reading left unnamed because no number was
 * visible — and only when the match is strong, clearly ahead of the next, from a face big and
 * square-on enough to trust, on the side the uniform says, and not a player already named in the
 * same photograph. That identity is marked "likely", never "confirmed": a face is a second
 * opinion, and the photographer is shown it as one.
 *
 * Scores are the cosine similarity of ArcFace ResNet-50 embeddings (each averaged with its mirror
 * image) between the face in the photograph and the roster headshot: 1 is the same image, 0 no
 * resemblance. On 71 hand-labeled faces from Nebraska volleyball and soccer frames against 87
 * roster headshots, the right player scored a median of 0.49; no wrong player scored above 0.30,
 * and no fan from the student section above 0.26 — so a name needs 0.40 and a clear lead.
 */

import { Matchup, Player, type Matchup as MatchupT, type TeamKey } from "../roster/Roster";
import type { Identity } from "./Identify";
import type { Observation } from "./Observation";

export interface FaceHint {
  playerID: string;
  /** Cosine similarity to the player's roster headshot. */
  score: number;
  /** The face was confident, large and turned toward the camera enough to name someone unasked. */
  good: boolean;
}

/** The model these scores come from. Scores saved by another model are dropped, never compared. */
export const FACE_MODEL = "arcface-r50-w600k";

/** Kept, to put the nearest players first in the picker. */
export const FACE_LISTED = 0.2;
/** A likeness worth showing, and enough among the players a partly read number allows. */
export const FACE_SUGGEST = 0.32;
/** Enough to name an athlete with no number visible. */
export const FACE_STRONG = 0.4;
/** How far the best must lead the next. */
export const FACE_MARGIN = 0.05;
export const FACE_STRONG_MARGIN = 0.1;

/** A photograph's saved face matches, if the model that made them is this one. */
export function currentHints(raw: unknown, model?: unknown): Record<string, FaceHint[]> {
  const out: Record<string, FaceHint[]> = {};
  if (model !== FACE_MODEL || !raw || typeof raw !== "object") return out;
  for (const [k, list] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(list)) continue;
    out[k] = list.filter((h): h is FaceHint => !!h && typeof h.playerID === "string" && typeof h.score === "number").map((h) => ({ playerID: h.playerID, score: h.score, good: !!h.good }));
  }
  return out;
}

export function applyFaceHints(ids: Identity[], obs: Observation, hints: Record<string, FaceHint[]> | undefined, matchup: MatchupT | null): Identity[] {
  if (!hints || !matchup) return ids;
  const named = new Set(ids.filter((i) => i.player).map((i) => i.player!.id));
  return ids.map((id) => {
    const s = obs.subjects.find((x) => x.id === id.subjectId);
    const h = hints[id.subjectId];
    if (!s || s.kind !== "athlete" || id.source === "manual" || id.source === "note" || !h?.length) return id;
    const [best, next] = h;
    const lead = best.score - (next?.score ?? 0);
    // Two independent signals agreeing — a partly read number and a clear face — settle it.
    if (id.player) {
      if (id.status === "likely" && best.playerID === id.player.id && best.good && best.score >= FACE_SUGGEST && lead >= FACE_MARGIN) {
        return { ...id, status: "confirmed", reason: `${id.reason}; the face agrees (${likeness(best.score)})` };
      }
      return id;
    }
    // When the digits read narrow it to a few players ("1?"), a looser match among just those is
    // evidence enough to name one for review.
    const among = id.alternatives.length > 0 && id.alternatives.some((p) => p.id === best.playerID);
    const enough = among ? best.score >= FACE_SUGGEST && lead >= FACE_MARGIN : best.good && best.score >= FACE_STRONG && lead >= FACE_STRONG_MARGIN;
    if (!enough || named.has(best.playerID)) return id;
    const found = (["A", "B"] as TeamKey[]).map((k) => ({ k, p: Matchup.team(matchup, k).players.find((p) => p.id === best.playerID) })).find((x) => x.p);
    if (!found?.p) return id;
    if ((s.team === "A" || s.team === "B") && s.team !== found.k) return id;
    // Whatever digits were read still hold: the face only fills the gap they leave ("1?" → 14, not 22).
    // A strong match may also say the unread digit was never there: "1?" on #1.
    const n = found.p.number;
    const fits = !s.number || (s.number.length === n.length && [...s.number].every((c, i) => c === "?" || c === n[i]))
      || (!among && s.number.replace(/\?/g, "") === n);
    if (!fits) return id;
    named.add(found.p.id);
    return {
      ...id, player: found.p, teamKey: found.k, status: "likely", source: "face",
      reason: s.number
        ? `Read ${s.number.replace(/\?/g, "_")}; the face resembles ${Player.fullName(found.p)}'s roster photo (${likeness(best.score)})`
        : `Number not visible; the face resembles ${Player.fullName(found.p)}'s roster photo (${likeness(best.score)})`,
    };
  });
}

/** A likeness as the review screen words it. */
export function likeness(score: number): string {
  return score >= FACE_STRONG ? "close likeness" : score >= FACE_SUGGEST ? "likeness" : "faint likeness";
}

