/**
 * What the app remembers between sessions: settings, the API key, the team library, recent
 * shoots and the folder handles that reopen them, and Photo Mechanic templates.
 *
 * IndexedDB rather than localStorage, because folder handles are not strings. The database and
 * its stores are the first Cutline's, so a key and folders saved by it still open.
 *
 * On the key: a browser has no keychain. This is readable by anything running in the same
 * browser profile — said plainly in Settings.
 */

import { openDB, type IDBPDatabase } from "idb";
import type { CaptionStyle } from "@core/caption/Styles";
import type { UnnamedMode } from "@core/caption/Compose";
import type { Tier } from "@core/ai/Models";
import type { Team } from "@core/roster/Roster";
import type { SportID, Gender, LevelKind } from "@core/sports/Sports";
import { NamingPattern } from "@core/naming/NamingPattern";

export type WriteTarget = "embed" | "sidecar" | "both";

export interface Settings {
  style: CaptionStyle;
  photographer: string;
  /** The agency, desk or publication in the credit line; blank for the style's own. */
  house: string;
  tier: Tier;
  /** How an athlete the app could not name is written: the desk's XXXXX, or "a Nebraska player". */
  unnamed: UnnamedMode;
  /** Where an approved caption goes: into the JPEG itself, an .xmp sidecar beside it, or both. */
  writeTo: WriteTarget;
  concurrency: number;
  /** On-device face matching against roster headshots, offered for college rosters only. */
  faces: boolean;
  templateName: string | null;
  namingPattern: string;
  onboarded: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  style: "apSports",
  photographer: "",
  house: "",
  tier: "balanced",
  unnamed: "placeholder",
  writeTo: "embed",
  concurrency: 4,
  faces: false,
  templateName: null,
  namingPattern: NamingPattern.hurrdat,
  onboarded: false,
};

/** A team kept for next time, so a roster is read once a season. */
export interface SavedTeam {
  team: Team;
  sport: SportID;
  gender: Gender;
  level: LevelKind;
  savedAt: string;
}

export interface RecentShoot {
  id: string;
  folderName: string;
  title: string;
  photoCount: number;
  lastOpened: string;
  /** Everything the setup screen held, to restore it with the folder. */
  setup: unknown;
}

const DB_NAME = "cutline";
const DB_VERSION = 2;

let dbPromise: Promise<IDBPDatabase> | null = null;
function db(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(d, oldVersion) {
        if (oldVersion < 1) {
          d.createObjectStore("kv");
          d.createObjectStore("logos");
          d.createObjectStore("templates");
          d.createObjectStore("folders");
        }
        // The first Cutline's team and recent-shoot records have another shape; start fresh.
        if (d.objectStoreNames.contains("teams")) d.deleteObjectStore("teams");
        if (d.objectStoreNames.contains("recents")) d.deleteObjectStore("recents");
        d.createObjectStore("teams");
        d.createObjectStore("recents", { keyPath: "id" });
      },
    });
  }
  return dbPromise;
}

export const Storage = {
  async settings(): Promise<Settings> {
    const stored = (await (await db()).get("kv", "settings2")) as (Partial<Settings> & { embed?: boolean }) | undefined;
    // Settings saved before "both" was offered carry a yes-or-no `embed`.
    const writeTo: WriteTarget = stored?.writeTo ?? (stored?.embed === false ? "sidecar" : "embed");
    const { embed: _old, ...rest } = stored ?? {};
    return { ...DEFAULT_SETTINGS, ...rest, writeTo };
  },
  async saveSettings(s: Settings): Promise<void> { await (await db()).put("kv", s, "settings2"); },

  async key(): Promise<string> { return ((await (await db()).get("kv", "apiKey")) as string | undefined) ?? ""; },
  async saveKey(key: string): Promise<void> {
    const d = await db();
    if (key) await d.put("kv", key, "apiKey"); else await d.delete("kv", "apiKey");
  },

  async teams(): Promise<SavedTeam[]> {
    const all = (await (await db()).getAll("teams")) as SavedTeam[];
    // Teams saved before coaches were read have no staff list.
    return all.map((t) => ({ ...t, team: { ...t.team, staff: t.team.staff ?? [] } })).sort((a, b) => a.team.school.localeCompare(b.team.school));
  },
  async saveTeam(t: SavedTeam): Promise<void> { await (await db()).put("teams", t, t.team.id); },
  async deleteTeam(id: string): Promise<void> { await (await db()).delete("teams", id); },

  async recents(): Promise<RecentShoot[]> {
    const all = (await (await db()).getAll("recents")) as RecentShoot[];
    return all.sort((a, b) => (a.lastOpened < b.lastOpened ? 1 : -1)).slice(0, 12);
  },
  async saveRecent(r: RecentShoot): Promise<void> { await (await db()).put("recents", r); },
  async deleteRecent(id: string): Promise<void> {
    await (await db()).delete("recents", id);
    await Storage.deleteFolderHandle(id);
  },

  async templateNames(): Promise<string[]> { return ((await (await db()).getAllKeys("templates")) as string[]).sort(); },
  async template(name: string): Promise<string | null> { return ((await (await db()).get("templates", name)) as string | undefined) ?? null; },
  async saveTemplate(name: string, text: string): Promise<void> { await (await db()).put("templates", text, name); },
  async deleteTemplate(name: string): Promise<void> { await (await db()).delete("templates", name); },

  async folderHandle(id: string): Promise<FileSystemDirectoryHandle | null> {
    try { return ((await (await db()).get("folders", id)) as FileSystemDirectoryHandle | undefined) ?? null; } catch { return null; }
  },
  async saveFolderHandle(id: string, handle: FileSystemDirectoryHandle): Promise<void> {
    try { await (await db()).put("folders", handle, id); } catch { /* not storable in this browser */ }
  },
  async deleteFolderHandle(id: string): Promise<void> { try { await (await db()).delete("folders", id); } catch { /* ignore */ } },
};
