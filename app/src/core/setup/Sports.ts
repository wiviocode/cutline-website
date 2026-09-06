/**
 * Every sport the app knows, in one table: what it is called, how a caption names its event,
 * which levels and genders play it, which leagues it has, whether it is a team affair, where
 * its rosters live, and the code the file-naming convention gives it. Everything sport-specific
 * elsewhere — the catalogue on the game screen, the caption's "during a … game", the roster
 * importer's MaxPreps path, the renamer's code — reads from here, so adding a sport is one row.
 *
 * The original app's fifteen sports are all here, plus the five that round out what is played
 * at American colleges and high schools: wrestling, swimming and diving, gymnastics, field
 * hockey and water polo.
 */

import type { Sport } from "../caption/CompositionContext";
import type { Gender, Level, RosterMode } from "./GameLibrary";

/** The word after the sport: "a college football game", "a college soccer match", "a track meet". */
export type EventWord = "game" | "match" | "meet" | "dual" | "tournament" | "race";

export interface SportInfo {
  id: Sport;
  name: string;
  /** The word in "a college <noun> game". Empty for the racing sports, whose event is just "a race". */
  noun: string;
  event: EventWord;
  /**
   * What the setup assumes about teams. Ball sports have rosters with numbers; wrestling and
   * tennis have two sides but no numbers to match, so players are described by team; a meet, a
   * tournament or a race has no sides at all.
   */
  rosterMode: RosterMode;
  /** True for the racing sports, where men's and women's is not a distinction anyone draws. */
  genderless?: boolean;
  /** Which genders play it at each level. A level missing here does not offer the sport. */
  genders: Partial<Record<Level, Gender[]>>;
  /** Professional leagues by gender, for "an NFL football game". */
  leagues?: Partial<Record<Gender, string>>;
  /** MaxPreps' path segment, where MaxPreps carries the sport's rosters. Checked against the site. */
  maxPreps?: string;
  /** The file-naming convention's code. */
  code: (gender: Gender) => string | null;
}

const both: Gender[] = ["mens", "womens"];
const men: Gender[] = ["mens"];
const women: Gender[] = ["womens"];
const byGender = (m: string, w: string) => (gender: Gender) => (gender === "mens" ? m : w);
const one = (c: string) => () => c;

export const SPORT_TABLE: SportInfo[] = [
  { id: "football",      name: "Football",          noun: "football",        event: "game",       rosterMode: "rosters",   genders: { divisionI: men,   nebraskaHS: men,   professional: men },   leagues: { mens: "NFL" },                       maxPreps: "football",      code: one("FB") },
  { id: "basketball",    name: "Basketball",        noun: "basketball",      event: "game",       rosterMode: "rosters",   genders: { divisionI: both,  nebraskaHS: both,  professional: both },  leagues: { mens: "NBA", womens: "WNBA" },       maxPreps: "basketball",    code: byGender("MBB", "WBB") },
  { id: "volleyball",    name: "Volleyball",        noun: "volleyball",      event: "match",      rosterMode: "rosters",   genders: { divisionI: women, nebraskaHS: women, professional: women },                                                 maxPreps: "volleyball",    code: one("VB") },
  { id: "soccer",        name: "Soccer",            noun: "soccer",          event: "match",      rosterMode: "rosters",   genders: { divisionI: both,  nebraskaHS: both,  professional: both },  leagues: { mens: "MLS", womens: "NWSL" },       maxPreps: "soccer",        code: byGender("MSOC", "WSOC") },
  { id: "baseball",      name: "Baseball",          noun: "baseball",        event: "game",       rosterMode: "rosters",   genders: { divisionI: men,   nebraskaHS: men,   professional: men },   leagues: { mens: "MLB" },                       maxPreps: "baseball",      code: one("BB") },
  { id: "softball",      name: "Softball",          noun: "softball",        event: "game",       rosterMode: "rosters",   genders: { divisionI: women, nebraskaHS: women, professional: women },                                                 maxPreps: "softball",      code: one("SB") },
  { id: "hockey",        name: "Ice Hockey",        noun: "hockey",          event: "game",       rosterMode: "rosters",   genders: { divisionI: both,  nebraskaHS: both,  professional: both },  leagues: { mens: "NHL", womens: "PWHL" },       maxPreps: "ice-hockey",    code: byGender("MHKY", "WHKY") },
  { id: "lacrosse",      name: "Lacrosse",          noun: "lacrosse",        event: "game",       rosterMode: "rosters",   genders: { divisionI: both,  nebraskaHS: both,  professional: men },   leagues: { mens: "PLL" },                       maxPreps: "lacrosse",      code: byGender("MLAX", "WLAX") },
  { id: "fieldHockey",   name: "Field Hockey",      noun: "field hockey",    event: "game",       rosterMode: "rosters",   genders: { divisionI: women, nebraskaHS: women },                                                                      maxPreps: "field-hockey",  code: one("FH") },
  { id: "waterPolo",     name: "Water Polo",        noun: "water polo",      event: "match",      rosterMode: "rosters",   genders: { divisionI: both,  nebraskaHS: both },                                                                       maxPreps: "water-polo",    code: byGender("MWPO", "WWPO") },
  { id: "wrestling",     name: "Wrestling",         noun: "wrestling",       event: "dual",       rosterMode: "noRosters", genders: { divisionI: both,  nebraskaHS: both },                                                                       maxPreps: "wrestling",     code: one("WRES") },
  { id: "tennis",        name: "Tennis",            noun: "tennis",          event: "match",      rosterMode: "noRosters", genders: { divisionI: both,  nebraskaHS: both,  professional: both },                                                 maxPreps: "tennis",        code: byGender("MTEN", "WTEN") },
  { id: "golf",          name: "Golf",              noun: "golf",            event: "tournament", rosterMode: "noTeams",   genders: { divisionI: both,  nebraskaHS: both,  professional: both },  leagues: { mens: "PGA Tour", womens: "LPGA" },  maxPreps: "golf",          code: byGender("MGF", "WGF") },
  { id: "trackAndField", name: "Track & Field",     noun: "track and field", event: "meet",       rosterMode: "noTeams",   genders: { divisionI: both,  nebraskaHS: both,  professional: both },                                                 maxPreps: "track-field",   code: one("TF") },
  { id: "crossCountry",  name: "Cross Country",     noun: "cross country",   event: "meet",       rosterMode: "noTeams",   genders: { divisionI: both,  nebraskaHS: both },                                                                       maxPreps: "cross-country", code: one("CC") },
  { id: "swimming",      name: "Swimming & Diving", noun: "swimming",        event: "meet",       rosterMode: "noTeams",   genders: { divisionI: both,  nebraskaHS: both,  professional: both },                                                                            code: byGender("MSWIM", "WSWIM") },
  { id: "gymnastics",    name: "Gymnastics",        noun: "gymnastics",      event: "meet",       rosterMode: "noTeams",   genders: { divisionI: both,  nebraskaHS: women, professional: both },                                                                            code: byGender("MGYM", "WGYM") },
  { id: "autoRacing",    name: "Auto Racing",       noun: "",                event: "race",       rosterMode: "noTeams",   genderless: true, genders: { professional: men },                                                                                                  code: one("RACE") },
  { id: "horseRacing",   name: "Horse Racing",      noun: "",                event: "race",       rosterMode: "noTeams",   genderless: true, genders: { professional: men },                                                                                                  code: one("HORSE") },
  { id: "cricket",       name: "Cricket",           noun: "cricket",         event: "match",      rosterMode: "rosters",   genders: { divisionI: men,   professional: both },  leagues: { mens: "MLC" },                                                                     code: one("CRK") },
];

const BY_ID = new Map(SPORT_TABLE.map((s) => [s.id as string, s]));

export const Sports = {
  all: SPORT_TABLE,
  info(id: string): SportInfo | undefined { return BY_ID.get(id); },

  /** "football game", "soccer match", "wrestling dual", "swimming meet", or just "race". */
  eventPhrase(id: string): string {
    const s = BY_ID.get(id);
    if (!s) return `${id} game`;
    return s.noun ? `${s.noun} ${s.event}` : s.event;
  },

  /** The league a professional fixture is captioned under, or null where there is none to name. */
  league(id: string, gender: Gender): string | null { return BY_ID.get(id)?.leagues?.[gender] ?? null; },

  defaultRosterMode(id: string): RosterMode { return BY_ID.get(id)?.rosterMode ?? "rosters"; },

  isGenderless(id: string): boolean { return !!BY_ID.get(id)?.genderless; },

  /** Sports MaxPreps carries rosters for, by path segment. */
  get maxPrepsSlugs(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const s of SPORT_TABLE) if (s.maxPreps) out[s.id] = s.maxPreps;
    return out;
  },

  code(id: string, gender: Gender): string | null { return BY_ID.get(id)?.code(gender) ?? null; },
};
