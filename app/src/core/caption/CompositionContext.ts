/**
 * Everything the composer needs besides the model's observation.
 */

import type { Roster } from "../roster/Roster";

/** Caption output styles. Each maps to a distinct wire-service house style. */
export type CaptionStyle =
  | "apSports" | "gettySports" | "gettySportsParen" | "imagnImages" | "iconSports" | "simple"
  /**
   * Hurrdat Sports house style, from their News Photo Caption Style Guide. Differs from AP in
   * three ways: the team is written singular before a player's name ("Nebraska Cornhusker"),
   * the date is set off by commas rather than introduced by "on", and a "Photo by <name>."
   * credit closes the caption.
   */
  | "hurrdatSports";

export const CAPTION_STYLES: CaptionStyle[] = [
  "apSports", "hurrdatSports", "gettySports", "gettySportsParen", "imagnImages", "iconSports", "simple",
];

export type CaptionMode = "fullCaption" | "prependToBase";

/** What to do when a visible athlete cannot be matched to the roster. */
export type FallbackBehavior =
  /** Emit the placeholder token and let downstream cleanup tidy it. */
  | "markUnidentified"
  /** Drop the unmatched player from the caption entirely. */
  | "guessPlayer"
  /**
   * Describe the player by team and number without inventing a name: "a Nebraska Cornhusker (2)
   * throws a pass". What rosterless captioning uses — nothing is missing, so no placeholder.
   */
  | "describeWithoutName";

export const SPORTS = [
  "autoRacing", "baseball", "basketball", "crossCountry", "cricket", "football", "golf", "hockey",
  "horseRacing", "lacrosse", "soccer", "softball", "tennis", "trackAndField", "volleyball",
] as const;
export type Sport = (typeof SPORTS)[number];

export function asSport(s: string): Sport {
  return (SPORTS as readonly string[]).includes(s) ? (s as Sport) : "soccer";
}

/** Metadata read from the image's existing IPTC/XMP fields, or supplied by the shoot. */
export interface IPTCMetadata {
  description?: string | null;
  dateText?: string | null;
  venue?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  leagueLevel?: string | null;
  rights?: string | null;
}

/** `City, State` / `City, Country`, whichever is available. */
export function iptcPlace(i: IPTCMetadata): string | null {
  const parts = [i.city, i.state ?? i.country].filter((p): p is string => !!p && p.length > 0);
  return parts.length ? parts.join(", ") : null;
}

/**
 * An event with no teams: cycling, track, wrestling, swimming, a road race, a meet. Nothing is
 * arbitrated by kit colour because there are no sides, and the tail names the event instead of
 * a matchup.
 */
export interface EventDescription {
  /** As it should read after "during": "the Nebraska State Cyclocross Championships". */
  name: string;
  /** What one participant is called — "rider", "runner". Blank falls back to "competitor". */
  participantNoun: string;
}

export const EventDescription = {
  make(name: string, participantNoun = ""): EventDescription { return { name, participantNoun }; },
  noun(e: EventDescription): string {
    const n = e.participantNoun.trim();
    return n || "competitor";
  },
  /**
   * The event as it appears after "during". A proper name gets "the" when it lacks an article;
   * a name typed in lower case is left exactly as written.
   */
  clause(e: EventDescription): string {
    const trimmed = e.name.trim();
    if (!trimmed) return "";
    const firstWord = (trimmed.split(" ")[0] ?? "").toLowerCase();
    if (["a", "an", "the"].includes(firstWord)) return trimmed;
    const first = trimmed[0];
    if (first !== first.toUpperCase() || first === first.toLowerCase()) return trimmed;
    return `the ${trimmed}`;
  },
};

export interface CompositionContext {
  style: CaptionStyle;
  mode: CaptionMode;
  fallback: FallbackBehavior;
  sport: Sport;
  roster: Roster;
  iptc: IPTCMetadata;
  /** Appended verbatim after the caption body when present. */
  appendCredit: boolean;
  /** `true` for professional leagues, where mascots are always included. */
  isProfessionalLeague: boolean;
  /** Photographer, for styles that close with a credit line. */
  photographer?: string | null;
  /** Weekday for the date, when the house style sets the date off appositively. */
  weekday?: string | null;
  /** Set for events with no teams. */
  event?: EventDescription | null;
  /** When the frame was taken, so each desk can write the date its own way. */
  captureDate?: Date | null;
}

export const CompositionContext = {
  make(p: Partial<CompositionContext> & { style: CaptionStyle; sport: Sport; roster: Roster }): CompositionContext {
    return {
      style: p.style,
      mode: p.mode ?? "fullCaption",
      fallback: p.fallback ?? "markUnidentified",
      sport: p.sport,
      roster: p.roster,
      iptc: p.iptc ?? {},
      appendCredit: p.appendCredit ?? false,
      isProfessionalLeague: p.isProfessionalLeague ?? false,
      photographer: p.photographer ?? null,
      weekday: p.weekday ?? null,
      event: p.event ?? null,
      captureDate: p.captureDate ?? null,
    };
  },
};
