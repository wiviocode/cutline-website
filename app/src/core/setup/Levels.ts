/**
 * The levels a shoot can be at, from NCAA Division I to a recreational league — and the ones a
 * desk adds itself.
 *
 * A level carries three things a caption needs: the phrase that qualifies the game ("a college
 * football game", "a minor league baseball game", "an Olympic swimming meet"); its kind, which
 * decides which sports it offers and whether its sides are Men's and Women's or Boys and Girls;
 * and, at the top professional level only, whether the sport's league names the game instead.
 *
 * The three ids the first desk used — divisionI, nebraskaHS, professional — are kept as stored,
 * so a remembered shoot and a saved team still open.
 */

export type LevelKind = "college" | "highSchool" | "professional" | "open";

export interface LevelInfo {
  id: string;
  label: string;
  /** The heading it sits under in the list. */
  group: string;
  kind: LevelKind;
  /** What qualifies the game in a caption: "a <qualifier> football game". */
  qualifier: string;
  /** The sport's league names the game — "an NFL football game" — at the top professional level only. */
  leagues?: boolean;
  /** Added by the desk and kept in its settings. */
  custom?: boolean;
}

/** What a desk saves when it adds a level of its own. */
export interface CustomLevel { id: string; label: string; qualifier: string; kind: LevelKind }

export const BUILT_IN_LEVELS: LevelInfo[] = [
  { id: "divisionI",     label: "NCAA Division I",    group: "College",        kind: "college",      qualifier: "college" },
  { id: "divisionII",    label: "NCAA Division II",   group: "College",        kind: "college",      qualifier: "college" },
  { id: "divisionIII",   label: "NCAA Division III",  group: "College",        kind: "college",      qualifier: "college" },
  { id: "naia",          label: "NAIA",               group: "College",        kind: "college",      qualifier: "NAIA college" },
  { id: "juco",          label: "Junior college",     group: "College",        kind: "college",      qualifier: "junior college" },
  { id: "nebraskaHS",    label: "High school",        group: "School",         kind: "highSchool",   qualifier: "high school" },
  { id: "middleSchool",  label: "Middle school",      group: "School",         kind: "highSchool",   qualifier: "middle school" },
  { id: "youth",         label: "Youth",              group: "Youth and club", kind: "open",         qualifier: "youth" },
  { id: "club",          label: "Club",               group: "Youth and club", kind: "open",         qualifier: "club" },
  { id: "recreational",  label: "Recreational",       group: "Youth and club", kind: "open",         qualifier: "recreational" },
  { id: "professional",  label: "Professional",       group: "Professional",   kind: "professional", qualifier: "professional", leagues: true },
  { id: "minorLeague",   label: "Minor league",       group: "Professional",   kind: "professional", qualifier: "minor league" },
  { id: "semiPro",       label: "Semi-professional",  group: "Professional",   kind: "professional", qualifier: "semi-pro" },
  { id: "international", label: "International",      group: "Professional",   kind: "open",         qualifier: "international" },
  { id: "olympic",       label: "Olympic",            group: "Professional",   kind: "open",         qualifier: "Olympic" },
];

/** The kinds a desk chooses from when it adds a level, in the words that matter to it. */
export const LEVEL_KINDS: { id: LevelKind; label: string; detail: string }[] = [
  { id: "college",      label: "College",      detail: "Men's and Women's sides, and the college sports." },
  { id: "highSchool",   label: "School",       detail: "Boys and Girls sides, and the school sports." },
  { id: "professional", label: "Professional", detail: "Men's and Women's sides, and the professional sports." },
  { id: "open",         label: "Open",         detail: "Every sport, either side — a youth league, a club, an international event." },
];

let customLevels: LevelInfo[] = [];

export const Levels = {
  builtIn: BUILT_IN_LEVELS,
  kinds: LEVEL_KINDS,

  /**
   * The desk's own levels, registered when its settings load and whenever they change. A registry
   * rather than a parameter, because the level is consulted from the composer, the catalogue and
   * the recent-shoots list alike, none of which should have to be handed the settings.
   */
  register(custom: CustomLevel[]): void {
    customLevels = custom.map((c) => ({ ...c, group: "Your levels", custom: true }));
  },
  get custom(): LevelInfo[] { return customLevels; },
  get all(): LevelInfo[] { return [...BUILT_IN_LEVELS, ...customLevels]; },

  info(id: string): LevelInfo | undefined { return Levels.all.find((l) => l.id === id); },
  exists(id: string): boolean { return Levels.info(id) != null; },
  kind(id: string): LevelKind { return Levels.info(id)?.kind ?? "college"; },
  qualifier(id: string): string { return Levels.info(id)?.qualifier ?? "college"; },
  label(id: string): string { return Levels.info(id)?.label ?? id; },

  /** A level from what the desk typed. The phrase is what the caption says; blank takes the label, lowercased. */
  make(label: string, qualifier: string, kind: LevelKind): CustomLevel {
    const name = label.trim();
    const phrase = qualifier.trim() || name.toLowerCase();
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "level";
    return { id: `custom-${slug}-${Math.random().toString(36).slice(2, 7)}`, label: name, qualifier: phrase, kind };
  },
};
