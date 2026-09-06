/**
 * A team that has been scraped once and kept.
 *
 * The roster is stored alongside the identity deliberately: the expensive part of an import is
 * the model call that reads names and numbers out of the page, and the same squad is shot many
 * times in a season. Picking a saved team costs nothing and makes no network request.
 */

import type { Gender, Level } from "../setup/GameLibrary";
import { eventLabel, SportCatalogue } from "../setup/GameLibrary";
import { TeamIdentity } from "./TeamIdentity";
import type { ImportedPlayer } from "./RosterImporter";
import { newID } from "./Roster";

export interface SavedTeam {
  id: string;
  source: "web" | "manual";
  identity: TeamIdentity;
  level: Level;
  sport: string;
  gender: Gender;
  /** ISO-8601. */
  lastScraped: string;
  /** Key of the cached logo blob in storage, if one was saved. */
  logoKey?: string | null;
  players: ImportedPlayer[];
}

export const SavedTeam = {
  make(p: Partial<SavedTeam> & { identity: TeamIdentity; level: Level; sport: string; gender: Gender }): SavedTeam {
    return {
      id: p.id ?? newID(),
      source: p.source ?? "web",
      identity: p.identity,
      level: p.level,
      sport: p.sport,
      gender: p.gender,
      lastScraped: p.lastScraped ?? new Date().toISOString(),
      logoKey: p.logoKey ?? null,
      players: p.players ?? [],
    };
  },

  fullName(t: SavedTeam): string { return TeamIdentity.fullName(t.identity); },

  sportLabel(t: SavedTeam): string {
    const name = SportCatalogue.option(t.sport, t.level)?.name ?? (t.sport[0].toUpperCase() + t.sport.slice(1));
    return eventLabel(t.level, t.sport, t.gender, name);
  },

  /** The same school in the same sport and gender is the same team, however it was reached. */
  identityKey(t: SavedTeam): string {
    return `${t.level}|${t.sport}|${t.gender}|${t.identity.schoolName.toLowerCase()}`;
  },

  /** Whether the page's own gender matched what was asked for. */
  genderMismatch(t: SavedTeam): boolean {
    const reported = t.identity.reportedGender?.toLowerCase();
    if (!reported) return false;
    const wanted = t.gender === "womens" ? ["girls", "women", "women's"] : ["boys", "men", "men's"];
    return !wanted.includes(reported);
  },
};

/** The library's rules, kept apart from where it is stored. */
export const TeamLibrary = {
  /** Insert or refresh, keyed on the school rather than the record's id. */
  upsert(teams: SavedTeam[], team: SavedTeam): SavedTeam[] {
    const key = SavedTeam.identityKey(team);
    const i = teams.findIndex((t) => SavedTeam.identityKey(t) === key);
    if (i < 0) return [...teams, team];
    const existing = teams[i];
    const updated: SavedTeam = {
      ...team,
      id: existing.id, // keep the id stable for the UI
      // Never trade a cached roster for an empty one.
      players: team.players.length ? team.players : existing.players,
      logoKey: team.logoKey ?? existing.logoKey ?? null,
    };
    const out = [...teams];
    out[i] = updated;
    return out;
  },

  remove(teams: SavedTeam[], id: string): SavedTeam[] { return teams.filter((t) => t.id !== id); },

  /** Newest first. */
  sorted(teams: SavedTeam[]): SavedTeam[] {
    return [...teams].sort((a, b) => (a.lastScraped < b.lastScraped ? 1 : a.lastScraped > b.lastScraped ? -1 : 0));
  },
};
