/**
 * What a face match is allowed to do.
 *
 * Only one thing on its own: name an athlete the reading left unnamed because no number was
 * visible — and only when the match is strong, clearly ahead of the next, on the side the uniform
 * says, and not a player already named in the same photograph. That identity is marked "likely",
 * never "confirmed": a face is a second opinion, and the photographer is shown it as one.
 */

import { Matchup, Player, type Matchup as MatchupT, type TeamKey } from "../roster/Roster";
import type { Identity } from "./Identify";
import type { Observation } from "./Observation";

export interface FaceHint { playerID: string; distance: number }

export const FACE_STRONG = 0.5;
export const FACE_MARGIN = 0.06;
/** Used only among the players the digits already allow. */
export const FACE_WEAK = 0.58;

export function applyFaceHints(ids: Identity[], obs: Observation, hints: Record<string, FaceHint[]> | undefined, matchup: MatchupT | null): Identity[] {
  if (!hints || !matchup) return ids;
  const named = new Set(ids.filter((i) => i.player).map((i) => i.player!.id));
  return ids.map((id) => {
    const s = obs.subjects.find((x) => x.id === id.subjectId);
    const h = hints[id.subjectId];
    if (!s || s.kind !== "athlete" || id.source === "manual" || !h?.length) return id;
    const [best, next] = h;
    // Two independent signals agreeing — a partly read number and a strong face — settle it.
    if (id.player) {
      const clear = best.distance < FACE_STRONG && (!next || next.distance - best.distance >= FACE_MARGIN);
      if (id.status === "likely" && clear && best.playerID === id.player.id) {
        return { ...id, status: "confirmed", reason: `${id.reason}; the face agrees (${best.distance.toFixed(2)})` };
      }
      return id;
    }
    // When the digits read narrow it to a few players ("1?"), a looser face match among just
    // those is evidence enough to name one for review.
    const among = id.alternatives.length > 0 && id.alternatives.some((p) => p.id === best.playerID);
    const threshold = among ? FACE_WEAK : FACE_STRONG;
    if (best.distance >= threshold || (next && next.distance - best.distance < FACE_MARGIN) || named.has(best.playerID)) return id;
    const found = (["A", "B"] as TeamKey[]).map((k) => ({ k, p: Matchup.team(matchup, k).players.find((p) => p.id === best.playerID) })).find((x) => x.p);
    if (!found?.p) return id;
    if ((s.team === "A" || s.team === "B") && s.team !== found.k) return id;
    // Whatever digits were read still hold: the face only fills the gap they leave ("1?" → 14, not 22).
    const fits = !s.number || (s.number.length === found.p.number.length && [...s.number].every((c, i) => c === "?" || c === found.p!.number[i]));
    if (!fits) return id;
    named.add(found.p.id);
    return {
      ...id, player: found.p, teamKey: found.k, status: "likely", source: "face",
      reason: among
        ? `Read ${s.number.replace(/\?/g, "_")}; the face resembles ${Player.fullName(found.p)}'s roster photo (${best.distance.toFixed(2)})`
        : `Number not visible; the face resembles ${Player.fullName(found.p)}'s roster photo (${best.distance.toFixed(2)})`,
    };
  });
}
