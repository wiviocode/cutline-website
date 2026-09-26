/**
 * The sports Cutline captions, in one table.
 *
 * The rebuild is deliberately narrow: the six team sports a college or high-school desk shoots
 * most — football, basketball, volleyball, soccer, baseball, softball — read against rosters,
 * plus track and field and cross country, which have no rosters and are captioned by event,
 * bib and uniform instead. Everything sport-specific elsewhere reads from here.
 */

export type SportID =
  | "football" | "basketball" | "volleyball" | "soccer" | "baseball" | "softball"
  | "trackAndField" | "crossCountry";

export type Gender = "mens" | "womens";
export type LevelKind = "college" | "highSchool";

/** The word after the sport in "a college football game", "a high school volleyball match". */
export type EventWord = "game" | "match" | "meet";

export interface SportInfo {
  id: SportID;
  name: string;
  /** The word in "a college <noun> game". */
  noun: string;
  event: EventWord;
  /** Team sports are read against two rosters; meets are captioned without them. */
  rosters: boolean;
  /** Which genders play it, at either level. */
  genders: Gender[];
  /** Two players can share a number because they never play the same unit (football). */
  units?: boolean;
  /** MaxPreps' path segment. */
  maxPreps: string;
  /** Sidearm and WMT path slugs to try, by gender. */
  collegeSlugs: Record<Gender, string[]>;
  /** The file-naming convention's code. */
  code: (gender: Gender) => string;
}

const both: Gender[] = ["mens", "womens"];

export const SPORTS: SportInfo[] = [
  { id: "football", name: "Football", noun: "football", event: "game", rosters: true, genders: ["mens"], units: true, maxPreps: "football",
    collegeSlugs: { mens: ["football"], womens: ["football"] }, code: () => "FB" },
  { id: "basketball", name: "Basketball", noun: "basketball", event: "game", rosters: true, genders: both, maxPreps: "basketball",
    collegeSlugs: { mens: ["mens-basketball", "basketball"], womens: ["womens-basketball", "basketball"] }, code: (g) => (g === "mens" ? "MBB" : "WBB") },
  { id: "volleyball", name: "Volleyball", noun: "volleyball", event: "match", rosters: true, genders: both, maxPreps: "volleyball",
    collegeSlugs: { mens: ["mens-volleyball"], womens: ["volleyball", "womens-volleyball"] }, code: () => "VB" },
  { id: "soccer", name: "Soccer", noun: "soccer", event: "match", rosters: true, genders: both, maxPreps: "soccer",
    collegeSlugs: { mens: ["mens-soccer", "soccer"], womens: ["womens-soccer", "soccer"] }, code: (g) => (g === "mens" ? "MSOC" : "WSOC") },
  { id: "baseball", name: "Baseball", noun: "baseball", event: "game", rosters: true, genders: ["mens"], maxPreps: "baseball",
    collegeSlugs: { mens: ["baseball"], womens: ["baseball"] }, code: () => "BB" },
  { id: "softball", name: "Softball", noun: "softball", event: "game", rosters: true, genders: ["womens"], maxPreps: "softball",
    collegeSlugs: { mens: ["softball"], womens: ["softball"] }, code: () => "SB" },
  { id: "trackAndField", name: "Track & Field", noun: "track and field", event: "meet", rosters: false, genders: both, maxPreps: "track-field",
    collegeSlugs: { mens: ["track-and-field", "mens-track-and-field"], womens: ["track-and-field", "womens-track-and-field"] }, code: () => "TF" },
  { id: "crossCountry", name: "Cross Country", noun: "cross country", event: "meet", rosters: false, genders: both, maxPreps: "cross-country",
    collegeSlugs: { mens: ["cross-country", "mens-cross-country"], womens: ["cross-country", "womens-cross-country"] }, code: () => "CC" },
];

const BY_ID = new Map(SPORTS.map((s) => [s.id as string, s]));

export const Sports = {
  all: SPORTS,
  info(id: string): SportInfo {
    const s = BY_ID.get(id);
    if (!s) throw new Error(`unknown sport ${id}`);
    return s;
  },
  find(id: string): SportInfo | undefined { return BY_ID.get(id); },
  /** "football game", "volleyball match", "cross country meet". */
  eventPhrase(id: string): string {
    const s = BY_ID.get(id);
    return s ? `${s.noun} ${s.event}` : `${id} game`;
  },
  hasUnits(id: string): boolean { return !!BY_ID.get(id)?.units; },
  usesRosters(id: string): boolean { return BY_ID.get(id)?.rosters ?? true; },
  code(id: string, gender: Gender): string | null { return BY_ID.get(id)?.code(gender) ?? null; },
  /** "Women's Volleyball" style label for the setup screen and file headlines. */
  label(id: string, gender: Gender): string {
    const s = BY_ID.get(id);
    if (!s) return id;
    if (s.genders.length === 1) return s.name;
    return `${gender === "mens" ? "Men's" : "Women's"} ${s.name}`;
  },
};

/** How a level is written in a caption, and what it is called in the picker. */
export interface Level {
  id: string;
  kind: LevelKind;
  name: string;
  /** "college", "high school". AP prefixes NCAA divisions with "NCAA". */
  qualifier: string;
  /** Governing body an AP caption names before "college": "NCAA", "NAIA". */
  body: string | null;
}

export const LEVELS: Level[] = [
  { id: "ncaa-d1", kind: "college", name: "NCAA Division I", qualifier: "college", body: "NCAA" },
  { id: "ncaa-d2", kind: "college", name: "NCAA Division II", qualifier: "college", body: "NCAA" },
  { id: "ncaa-d3", kind: "college", name: "NCAA Division III", qualifier: "college", body: "NCAA" },
  { id: "naia", kind: "college", name: "NAIA", qualifier: "college", body: "NAIA" },
  { id: "juco", kind: "college", name: "Junior college", qualifier: "junior college", body: null },
  { id: "hs", kind: "highSchool", name: "High school", qualifier: "high school", body: null },
];

export const Levels = {
  all: LEVELS,
  info(id: string): Level { return LEVELS.find((l) => l.id === id) ?? LEVELS[0]; },
};
