/**
 * `CaptionMode.prependToBase`: the generated caption is placed in front of an existing IPTC
 * Description, which acts as a base template. When no Description exists, a base "tail" is
 * synthesised from whatever IPTC fields are available.
 */

import { iptcPlace, type CompositionContext, type IPTCMetadata } from "./CompositionContext";

export type ComposerWarning =
  | "unidentified_placeholder"
  | "filtered_non_participants"
  | "imagn_country_missing"
  | "audio_interaction"
  | "subject_team_color_overruled"
  | "group_action_dropped_mixed_teams"
  | "prepend_base_unavailable";

export const PrependComposer = {
  apply(generated: string, context: CompositionContext, warnings: ComposerWarning[]): string {
    const base = context.iptc.description?.trim();
    if (base) return join(generated, base);
    const tail = PrependComposer.synthesiseTail(context.iptc);
    if (!tail) { warnings.push("prepend_base_unavailable"); return generated; }
    return join(generated, tail);
  },

  /** Build a base tail from IPTC when no Description is present. */
  synthesiseTail(iptc: IPTCMetadata): string | null {
    const parts: string[] = [];
    if (iptc.leagueLevel) parts.push(iptc.leagueLevel);
    if (iptc.venue) parts.push(`at ${iptc.venue}`);
    const place = iptcPlace(iptc);
    if (place) parts.push(`in ${place}`);
    if (iptc.dateText) parts.push(`on ${iptc.dateText}`);
    return parts.length ? parts.join(" ") : null;
  },
};

function join(lead: string, base: string): string {
  const l = lead.trim(), b = base.trim();
  if (!l) return b;
  if (!b) return l;
  return l + (l.endsWith(".") ? " " : ". ") + b;
}
