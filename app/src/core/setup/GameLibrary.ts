/**
 * The vocabulary of a shoot: what level, what sport, who is playing.
 *
 * Three levels — college, high school, professional — and the sports each one plays, drawn from
 * the sport table. The level ids are the ones the first desk used and are kept as stored, so a
 * remembered shoot still opens.
 */

import { Sports } from "./Sports";

export type Level = "divisionI" | "nebraskaHS" | "professional";
export type Gender = "mens" | "womens";
/**
 * How much team information a shoot has. Three genuinely different situations: "no rosters"
 * still has two teams and two kit colours — that is what puts a jersey number on the right
 * side. "No teams" has neither, which is the normal case for cycling, track, wrestling, swimming
 * and road races.
 */
export type RosterMode = "rosters" | "noRosters" | "noTeams";

export const Levels: { id: Level; label: string; shortLabel: string; captionQualifier: string }[] = [
  { id: "divisionI",    label: "College",      shortLabel: "College", captionQualifier: "college" },
  { id: "nebraskaHS",   label: "High School",  shortLabel: "HS",      captionQualifier: "high school" },
  { id: "professional", label: "Professional", shortLabel: "Pro",     captionQualifier: "professional" },
];

/**
 * How a caption qualifies the game: "a **college** football game", "a **high school** wrestling
 * dual", "an **NFL** football game". A professional fixture takes its league where the sport has
 * one; a race takes nothing, since "a professional race" says less than "a race".
 */
export function captionQualifier(level: Level, sport?: string, gender: Gender = "mens"): string {
  if (level !== "professional") return Levels.find((l) => l.id === level)?.captionQualifier ?? "college";
  if (sport && Sports.isGenderless(sport)) return "";
  return (sport && Sports.league(sport, gender)) || "professional";
}

/**
 * College and high school use different words for the same distinction; a professional fixture
 * is named by its league, and a race by nothing at all.
 */
export function genderLabel(gender: Gender, level: Level, sport?: string): string {
  if (level === "professional") {
    if (sport && Sports.isGenderless(sport)) return "";
    return (sport && Sports.league(sport, gender)) || (gender === "mens" ? "Men's" : "Women's");
  }
  if (level === "divisionI") return gender === "mens" ? "Men's" : "Women's";
  return gender === "mens" ? "Boys" : "Girls";
}

/**
 * The event as a desk names it: "Nebraska Football", "Nebraska Volleyball", "Nebraska Women's
 * Basketball" — the gender word only where the college plays both. High school keeps "Boys" and
 * "Girls" throughout, which is how those sports are named; a professional fixture takes its league.
 */
export function eventLabel(level: Level, sport: string, gender: Gender, name: string): string {
  const genders = Sports.info(sport)?.genders[level] ?? [];
  const single = genders.length === 1;
  const word = level === "nebraskaHS" || !single || (level === "professional" && Sports.league(sport, gender)) ? genderLabel(gender, level, sport) : "";
  return `${word} ${name}`.trim();
}

export const RosterModes: { id: RosterMode; label: string; explanation: string }[] = [
  { id: "rosters",   label: "Rosters",    explanation: "Players are named from each team's roster." },
  { id: "noRosters", label: "No rosters", explanation: "Two teams, no player lists — players are described by team and jersey number." },
  { id: "noTeams",   label: "No teams",   explanation: "An individual or open event: cycling, track, wrestling, a road race. No teams, no colours, no rosters." },
];

export interface SportOption {
  /** Matches a `Sport` case in the composer — handed through unchanged. */
  sport: string;
  name: string;
  genders: Gender[];
}

/** The sports a level plays, from the sport table, in the table's order. */
function optionsAt(level: Level): SportOption[] {
  return Sports.all.filter((s) => (s.genders[level] ?? []).length > 0).map((s) => ({ sport: s.id, name: s.name, genders: s.genders[level]! }));
}

export const SportCatalogue = {
  get divisionI(): SportOption[] { return optionsAt("divisionI"); },
  get nebraskaHS(): SportOption[] { return optionsAt("nebraskaHS"); },
  get professional(): SportOption[] { return optionsAt("professional"); },
  options: optionsAt,
  option(id: string, level: Level): SportOption | undefined {
    return optionsAt(level).find((o) => o.sport === id);
  },
};

export const RosterSuggestion = {
  /**
   * Nebraska's athletics site uses one path shape for every sport. Only the soccer path has been
   * fetched and parsed end to end; the others follow the same visible pattern and are offered as
   * a starting point, not as verified URLs — the field stays editable for exactly that reason.
   */
  huskers(sport: string, gender: Gender): string | null {
    const g = (m: string, w: string) => (gender === "mens" ? m : w);
    const slug: Record<string, string | undefined> = {
      football: "football", soccer: "soccer", volleyball: "volleyball",
      baseball: "baseball", softball: "softball", wrestling: "wrestling",
      basketball: g("mens-basketball", "womens-basketball"),
      tennis: g("mens-tennis", "womens-tennis"),
      golf: g("mens-golf", "womens-golf"),
      trackAndField: g("mens-track-and-field", "womens-track-and-field"),
      crossCountry: g("mens-cross-country", "womens-cross-country"),
      swimming: g("mens-swimming-and-diving", "womens-swimming-and-diving"),
      gymnastics: gender === "womens" ? "womens-gymnastics" : undefined,
    };
    const s = slug[sport];
    return s ? `https://huskers.com/sports/${s}/roster` : null;
  },

  /** Every URL the table can produce, so a field still holding a suggestion can be recognised. */
  get allHuskers(): Set<string> {
    const out = new Set<string>();
    for (const o of optionsAt("divisionI")) for (const gender of ["mens", "womens"] as Gender[]) {
      const u = RosterSuggestion.huskers(o.sport, gender);
      if (u) out.add(u);
    }
    return out;
  },

  maxPrepsHint: "https://www.maxpreps.com/ne/omaha/millard-south-patriots/football/roster/",
};

/**
 * Level, sport and gender, plus the rules that keep them consistent: a sport that does not
 * exist at the chosen level, a gender the sport is not played in.
 */
export interface GameSelection { level: Level; sportID: string; gender: Gender }

export const GameSelection = {
  make(level: Level = "divisionI", sportID = "soccer", gender: Gender = "womens"): GameSelection {
    return GameSelection.reconcile({ level, sportID, gender });
  },

  /** Drop to a legal sport for the level, then a legal gender for the sport. */
  reconcile(s: GameSelection): GameSelection {
    let { level, sportID, gender } = s;
    const options = SportCatalogue.options(level);
    if (!options.some((o) => o.sport === sportID)) sportID = options[0]?.sport ?? sportID;
    const sport = SportCatalogue.option(sportID, level);
    if (sport && !sport.genders.includes(gender)) gender = sport.genders[0] ?? gender;
    return { level, sportID, gender };
  },

  setLevel(s: GameSelection, level: Level): GameSelection { return GameSelection.reconcile({ ...s, level }); },
  setSport(s: GameSelection, sportID: string): GameSelection { return GameSelection.reconcile({ ...s, sportID }); },
  setGender(s: GameSelection, gender: Gender): GameSelection { return GameSelection.reconcile({ ...s, gender }); },

  sportName(s: GameSelection): string {
    return SportCatalogue.option(s.sportID, s.level)?.name ?? (s.sportID[0]?.toUpperCase() + s.sportID.slice(1));
  },

  /** "Women's Soccer" / "Football" / "Girls Volleyball" / "NFL Football" / "Auto Racing" — what the event is actually called. */
  label(s: GameSelection): string { return eventLabel(s.level, s.sportID, s.gender, GameSelection.sportName(s)); },

  /** The team situation a sport is usually shot in: rosters, two sides without them, or none. */
  defaultRosterMode(s: GameSelection): RosterMode { return Sports.defaultRosterMode(s.sportID); },

  /**
   * The team situation after the sport changes — by choice, or because a new level did not offer
   * the old one. It follows the sport unless the photographer had set one the old sport did not
   * imply, which is theirs to keep.
   */
  rosterModeAfter(before: string, after: string, current: RosterMode): RosterMode {
    if (before === after) return current;
    return current === Sports.defaultRosterMode(before) ? Sports.defaultRosterMode(after) : current;
  },

  /** The roster URL to propose, or null when there is nothing sensible to propose. */
  suggestedHomeURL(s: GameSelection): string | null {
    return s.level === "divisionI" ? RosterSuggestion.huskers(s.sportID, s.gender) : null;
  },
};

/** A game the user set up before, so the next one against the same opponent is two clicks. */
export interface RecentGame {
  id: string;
  /** ISO-8601, whole seconds. */
  lastOpened: string;
  level: Level;
  sport: string;
  gender: Gender;
  rosterMode: RosterMode;
  eventName: string;
  participantNoun: string;
  homeName: string; homeColor: string; homeRosterURL: string;
  awayName: string; awayColor: string; awayRosterURL: string;
  venue: string; city: string; state: string;
  /** Free-text context handed to the model with every photo of this shoot. */
  notes: string;
  homeTeamID?: string;
  awayTeamID?: string;
  templateName?: string;
  /** The folder's name, which is what makes two meetings of the same fixture distinct. */
  photosFolder?: string;
}

export const RecentGame = {
  limit: 12,

  now(): string { return new Date(Math.floor(Date.now() / 1000) * 1000).toISOString(); },

  make(partial: Partial<RecentGame> = {}): RecentGame {
    return {
      id: partial.id ?? cryptoId(),
      lastOpened: partial.lastOpened ?? RecentGame.now(),
      level: partial.level ?? "divisionI",
      sport: partial.sport ?? "soccer",
      gender: partial.gender ?? "womens",
      rosterMode: partial.rosterMode ?? "rosters",
      eventName: partial.eventName ?? "",
      participantNoun: partial.participantNoun ?? "",
      homeName: partial.homeName ?? "", homeColor: partial.homeColor ?? "white", homeRosterURL: partial.homeRosterURL ?? "",
      awayName: partial.awayName ?? "", awayColor: partial.awayColor ?? "navy", awayRosterURL: partial.awayRosterURL ?? "",
      venue: partial.venue ?? "", city: partial.city ?? "", state: partial.state ?? "",
      notes: partial.notes ?? "",
      homeTeamID: partial.homeTeamID, awayTeamID: partial.awayTeamID,
      templateName: partial.templateName, photosFolder: partial.photosFolder,
    };
  },

  title(g: RecentGame): string {
    if (g.rosterMode === "noTeams") {
      const name = g.eventName.trim();
      return name || "Event";
    }
    return `${g.homeName || "Home"} vs ${g.awayName || "Away"}`;
  },

  /** Empty for an open event: there is no sport grid in that mode. */
  sportLabel(g: RecentGame): string {
    if (g.rosterMode === "noTeams") return "";
    const name = SportCatalogue.option(g.sport, g.level)?.name ?? (g.sport[0]?.toUpperCase() + g.sport.slice(1));
    return eventLabel(g.level, g.sport, g.gender, name);
  },

  /**
   * Two entries are "the same shoot" when they are the same fixture **and the same folder**.
   * Keying on the teams alone made every Nebraska vs Notre Dame this season collapse onto one
   * entry, each new one silently discarding the previous game's folder.
   */
  identity(g: RecentGame): string {
    const folder = (g.photosFolder ?? "").toLowerCase();
    if (g.rosterMode === "noTeams") return `event|${g.eventName.toLowerCase()}|${folder}`;
    return `${g.level}|${g.sport}|${g.gender}|${g.homeName.toLowerCase()}|${g.awayName.toLowerCase()}|${folder}`;
  },

  /** Newest first, deduplicated by identity, capped. */
  remember(list: RecentGame[], game: RecentGame): RecentGame[] {
    const id = RecentGame.identity(game);
    const kept = list.filter((g) => RecentGame.identity(g) !== id);
    return [game, ...kept]
      .sort((a, b) => (a.lastOpened < b.lastOpened ? 1 : a.lastOpened > b.lastOpened ? -1 : 0))
      .slice(0, RecentGame.limit);
  },
};

function cryptoId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID().toUpperCase();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
