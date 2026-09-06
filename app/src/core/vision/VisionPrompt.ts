/**
 * The system prompt for the vision pass, and the per-photo context that goes with it.
 *
 * The prompt text is imported as a string so the schema it describes and the code that decodes
 * it ship together — a prompt in one place and a schema in another drift apart silently, and the
 * failure shows up mid-shoot as a parse error.
 *
 * It must be byte-identical across every photo in a run — `AnthropicClient.analyse` marks it
 * `cache_control: ephemeral`, so the first frame writes the cache and the rest read it. Nothing
 * per-photo is interpolated into it; per-photo facts go in the user turn.
 */

import instructions from "./visionInstructions.txt?raw";
import { Team, type Roster } from "../roster/Roster";
import type { EventDescription } from "../caption/CompositionContext";

export const VisionPrompt = {
  system: instructions as string,

  /**
   * The per-photo user turn. With no teams there is nothing to tell the model about kit colours,
   * and naming teams that are not there would invite it to invent them. The photographer's notes
   * go last so they can correct what is above them: a note saying a side changed kit has to beat
   * the colour already stated.
   */
  context(opts: { sportLabel: string; roster: Roster; event?: EventDescription | null; notes?: string; note?: string }): string {
    const base = opts.event
      ? `Event: ${opts.event.name}\nThere are no teams in this event; competitors are individuals.\n\nAnalyze this sports photo. Return JSON per the schema.`
      : `Sport: ${opts.sportLabel}\n` +
        `Team 1: ${Team.fullName(opts.roster.team1)} — uniform colour: ${opts.roster.team1.uniformColor}\n` +
        `Team 2: ${Team.fullName(opts.roster.team2)} — uniform colour: ${opts.roster.team2.uniformColor}\n\n` +
        `Analyze this sports photo. Return JSON per the schema.`;
    const notes = (opts.notes ?? "").trim();
    const note = (opts.note ?? "").trim();
    let out = base;
    if (notes) out += `\n\nAlso note, from the photographer:\n${notes}`;
    // A note written for this one frame is the photographer correcting the model's first reading.
    // It has to beat everything above it, and it says what it may change.
    if (note) out += `\n\nThe photographer's note on THIS photograph, which is authoritative — use it over your own reading for jersey numbers, colours, who has the ball, the unit, the action and the scene type:\n${note}`;
    return out;
  },
};
