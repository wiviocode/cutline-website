/**
 * What the app remembers between sessions: settings, the API key, the team library and its
 * logos, recent shoots, Photo Mechanic templates, and the folder handles that let a recent shoot
 * reopen without a picker.
 *
 * IndexedDB rather than localStorage, because folder handles and logo blobs are not strings.
 *
 * On the key: the native app used the login keychain. A browser has nothing comparable — this
 * is readable by anything running in the same browser profile. Said plainly in Settings.
 */

import { openDB, type IDBPDatabase } from "idb";
import type { SavedTeam } from "@core/roster/SavedTeam";
import type { RecentGame } from "@core/setup/GameLibrary";
import type { CaptionStyle } from "@core/caption/CompositionContext";
import type { AltTextMode } from "@core/anthropic/VisionModel";
import { NamingPattern } from "@core/naming/NamingPattern";

export interface Settings {
  style: CaptionStyle;
  photographer: string;
  embedInFile: boolean;
  writeSidecars: boolean;
  altTextMode: AltTextMode;
  model: string;
  longEdge: number;
  concurrency: number;
  namingPattern: string;
  /** Name of the chosen template in the `templates` store, or null for none. */
  templateName: string | null;
  /** The first-time setup has been completed once. */
  onboarded: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  style: "apSports",
  photographer: "",
  embedInFile: true,
  writeSidecars: false,
  altTextMode: "simple",
  model: "claude-opus-5",
  longEdge: 1616,
  concurrency: 4,
  namingPattern: NamingPattern.hurrdat,
  templateName: null,
  onboarded: false,
};

const DB_NAME = "cutline";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase> | null = null;
function db(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(d) {
        d.createObjectStore("kv");
        d.createObjectStore("teams", { keyPath: "id" });
        d.createObjectStore("logos");
        d.createObjectStore("recents", { keyPath: "id" });
        d.createObjectStore("templates");
        d.createObjectStore("folders");
      },
    });
  }
  return dbPromise;
}

export const Storage = {
  async settings(): Promise<Settings> {
    const stored = (await (await db()).get("kv", "settings")) as Partial<Settings> | undefined;
    return { ...DEFAULT_SETTINGS, ...(stored ?? {}) };
  },
  async saveSettings(s: Settings): Promise<void> { await (await db()).put("kv", s, "settings"); },

  async apiKey(): Promise<string> { return ((await (await db()).get("kv", "apiKey")) as string | undefined) ?? ""; },
  async saveApiKey(key: string): Promise<void> {
    const d = await db();
    if (key) await d.put("kv", key, "apiKey"); else await d.delete("kv", "apiKey");
  },

  async teams(): Promise<SavedTeam[]> { return (await (await db()).getAll("teams")) as SavedTeam[]; },
  async saveTeams(teams: SavedTeam[]): Promise<void> {
    const d = await db();
    const tx = d.transaction("teams", "readwrite");
    await tx.store.clear();
    for (const t of teams) await tx.store.put(t);
    await tx.done;
  },

  async logo(key: string): Promise<Blob | null> { return ((await (await db()).get("logos", key)) as Blob | undefined) ?? null; },
  async saveLogo(key: string, blob: Blob): Promise<void> { await (await db()).put("logos", blob, key); },
  async deleteLogo(key: string): Promise<void> { await (await db()).delete("logos", key); },

  async recents(): Promise<RecentGame[]> {
    const all = (await (await db()).getAll("recents")) as RecentGame[];
    return all.sort((a, b) => (a.lastOpened < b.lastOpened ? 1 : a.lastOpened > b.lastOpened ? -1 : 0));
  },
  async saveRecents(list: RecentGame[]): Promise<void> {
    const d = await db();
    const tx = d.transaction("recents", "readwrite");
    await tx.store.clear();
    for (const g of list) await tx.store.put(g);
    await tx.done;
  },

  async templateNames(): Promise<string[]> { return ((await (await db()).getAllKeys("templates")) as string[]).sort(); },
  async template(name: string): Promise<string | null> { return ((await (await db()).get("templates", name)) as string | undefined) ?? null; },
  async saveTemplate(name: string, text: string): Promise<void> { await (await db()).put("templates", text, name); },
  async deleteTemplate(name: string): Promise<void> { await (await db()).delete("templates", name); },

  /** Folder handles, keyed by the recent game's id. Chromium only; harmless elsewhere. */
  async folderHandle(id: string): Promise<FileSystemDirectoryHandle | null> {
    try { return ((await (await db()).get("folders", id)) as FileSystemDirectoryHandle | undefined) ?? null; }
    catch { return null; }
  },
  async saveFolderHandle(id: string, handle: FileSystemDirectoryHandle): Promise<void> {
    try { await (await db()).put("folders", handle, id); } catch { /* not storable in this browser */ }
  },
  async deleteFolderHandle(id: string): Promise<void> { try { await (await db()).delete("folders", id); } catch { /* ignore */ } },
};
