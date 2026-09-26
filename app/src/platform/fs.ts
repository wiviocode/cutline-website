/**
 * The photographs' folder, through the File System Access API.
 *
 * Chromium-based browsers grant a page read-write access to a directory the user picks, and
 * `createWritable()` writes to a temporary file that is swapped in on `close()` — so an
 * interrupted write cannot truncate a photograph, which is the property the native app's
 * back-up-swap-delete dance existed to provide.
 *
 * Safari and Firefox have no writable directory access. They can hand over a folder's files
 * through `<input webkitdirectory>`, read-only. That is modelled as the same folder interface
 * with `writable: false`, and the app says so rather than pretending.
 */

import { SupportedFormats } from "@core/images/SupportedFormats";
import type { RenamePlan } from "@core/naming/PhotoRenamer";

export interface PhotoFile {
  name: string;
  size: number;
  lastModified: number;
  file(): Promise<File>;
}

export interface PhotoFolder {
  readonly name: string;
  readonly writable: boolean;
  /** For remembering the folder between sessions. Chromium only. */
  readonly handle: FileSystemDirectoryHandle | null;
  listPhotos(): Promise<PhotoFile[]>;
  listNames(): Promise<Set<string>>;
  readText(name: string): Promise<string | null>;
  readBytes(name: string): Promise<Uint8Array | null>;
  writeText(name: string, text: string): Promise<void>;
  writeBytes(name: string, bytes: Uint8Array): Promise<void>;
  remove(name: string): Promise<void>;
  /** A subfolder, created on demand. Null when it does not exist and `create` is false. */
  sub(name: string, create: boolean): Promise<PhotoFolder | null>;
}

export const supportsWritableFolders = (): boolean => typeof window !== "undefined" && "showDirectoryPicker" in window;

/** Ask the user for a folder. Null when the browser cannot, or the user cancelled. */
export async function pickFolder(): Promise<PhotoFolder | null> {
  if (!supportsWritableFolders()) return null;
  try {
    const handle = await window.showDirectoryPicker({ id: "cutline-photos", mode: "readwrite" });
    return new HandleFolder(handle);
  } catch (e) {
    if ((e as DOMException).name === "AbortError") return null;
    throw e;
  }
}

/** Re-open a remembered folder. Needs a user gesture for the permission prompt. */
export async function reopenFolder(handle: FileSystemDirectoryHandle): Promise<PhotoFolder | null> {
  const q = await handle.queryPermission({ mode: "readwrite" });
  if (q === "granted") return new HandleFolder(handle);
  const r = await handle.requestPermission({ mode: "readwrite" });
  return r === "granted" ? new HandleFolder(handle) : null;
}

export class HandleFolder implements PhotoFolder {
  readonly writable = true;
  constructor(readonly handle: FileSystemDirectoryHandle) {}
  get name(): string { return this.handle.name; }

  async listPhotos(): Promise<PhotoFile[]> {
    const out: PhotoFile[] = [];
    for await (const [name, entry] of this.handle.entries()) {
      if (entry.kind !== "file" || !SupportedFormats.isReadable(name) || name.startsWith(".")) continue;
      const fh = entry as FileSystemFileHandle;
      const f = await fh.getFile();
      out.push({ name, size: f.size, lastModified: f.lastModified, file: () => fh.getFile() });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }

  async listNames(): Promise<Set<string>> {
    const names = new Set<string>();
    for await (const [name] of this.handle.entries()) names.add(name);
    return names;
  }

  async readText(name: string): Promise<string | null> {
    try { return await (await (await this.handle.getFileHandle(name)).getFile()).text(); }
    catch { return null; }
  }

  async readBytes(name: string): Promise<Uint8Array | null> {
    try { return new Uint8Array(await (await (await this.handle.getFileHandle(name)).getFile()).arrayBuffer()); }
    catch { return null; }
  }

  async writeText(name: string, text: string): Promise<void> {
    const fh = await this.handle.getFileHandle(name, { create: true });
    const w = await fh.createWritable();
    try { await w.write(text); } finally { await w.close(); }
  }

  async writeBytes(name: string, bytes: Uint8Array): Promise<void> {
    const fh = await this.handle.getFileHandle(name, { create: true });
    const w = await fh.createWritable();
    try { await w.write(bytes as unknown as BufferSource); } finally { await w.close(); }
  }

  async remove(name: string): Promise<void> {
    await this.handle.removeEntry(name);
  }

  async sub(name: string, create: boolean): Promise<PhotoFolder | null> {
    try { return new HandleFolder(await this.handle.getDirectoryHandle(name, { create })); }
    catch { return null; }
  }
}

/** A folder handed over as a list of files — read-only, for browsers without the picker. */
export class FileListFolder implements PhotoFolder {
  readonly writable = false;
  readonly handle = null;
  readonly name: string;
  private readonly files: Map<string, File>;
  private readonly subs: Map<string, File[]> = new Map();

  constructor(files: File[]) {
    const top = new Map<string, File>();
    let folderName = "Photographs";
    for (const f of files) {
      const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
      const parts = rel.split("/");
      if (parts.length >= 2) folderName = parts[0];
      if (parts.length <= 2) top.set(f.name, f);
      else {
        const sub = parts[1];
        if (!this.subs.has(sub)) this.subs.set(sub, []);
        this.subs.get(sub)!.push(f);
      }
    }
    this.files = top;
    this.name = folderName;
  }

  async listPhotos(): Promise<PhotoFile[]> {
    return [...this.files.values()]
      .filter((f) => SupportedFormats.isReadable(f.name) && !f.name.startsWith("."))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((f) => ({ name: f.name, size: f.size, lastModified: f.lastModified, file: async () => f }));
  }
  async listNames(): Promise<Set<string>> { return new Set([...this.files.keys(), ...this.subs.keys()]); }
  async readText(name: string): Promise<string | null> { const f = this.files.get(name); return f ? f.text() : null; }
  async readBytes(name: string): Promise<Uint8Array | null> { const f = this.files.get(name); return f ? new Uint8Array(await f.arrayBuffer()) : null; }
  async writeText(): Promise<void> { throw new ReadOnlyError(); }
  async writeBytes(): Promise<void> { throw new ReadOnlyError(); }
  async remove(): Promise<void> { throw new ReadOnlyError(); }
  async sub(name: string): Promise<PhotoFolder | null> {
    const files = this.subs.get(name);
    if (!files) return null;
    const f = new FileListFolder([]);
    for (const file of files) (f as unknown as { files: Map<string, File> }).files.set(file.name, file);
    return f;
  }
}

export class ReadOnlyError extends Error {
  constructor() {
    super("This browser cannot write into your photographs. Use Chrome, Edge or another Chromium browser to write captions into the files.");
    this.name = "ReadOnlyError";
  }
}

/**
 * Apply a rename plan.
 *
 * Two phases, through temporary names. A rename within one folder can permute names — the old
 * 0002 becoming the new 0001 while 0001 becomes 0002 — and moving straight to the final names
 * would collide. Staging everything first makes the order irrelevant. A failure part-way rolls
 * back what has already moved.
 *
 * A browser file handle has no `move` outside the origin-private file system, so a move is a
 * read, a write, and a delete.
 */
export async function applyRenamePlan(folder: PhotoFolder, records: PhotoFolder | null, plan: RenamePlan,
                                      progress?: (done: number, total: number) => void): Promise<number> {
  if (plan.problems.length) throw new Error(plan.problems.join(" "));
  const work = plan.items.filter((i) => i.source !== i.destination);
  if (!work.length) return 0;

  const token = Math.random().toString(36).slice(2, 10);
  const staged: { where: PhotoFolder; temp: string; final: string; original: string }[] = [];

  const move = async (where: PhotoFolder, from: string, to: string) => {
    const bytes = await where.readBytes(from);
    if (!bytes) throw new Error(`Could not read ${from}`);
    await where.writeBytes(to, bytes);
    await where.remove(from);
  };
  const stage = async (where: PhotoFolder, from: string, to: string) => {
    const temp = `.rename-${token}-${staged.length}-${from}`;
    await move(where, from, temp);
    staged.push({ where, temp, final: to, original: from });
  };
  const rollback = async () => { for (const s of [...staged].reverse()) { try { await move(s.where, s.temp, s.original); } catch { /* best effort */ } } };

  try {
    for (const item of work) {
      await stage(folder, item.source, item.destination);
      for (const c of item.companions) {
        const where = c.kind === "caption data" ? records : folder;
        if (where) await stage(where, c.from, c.to);
      }
    }
  } catch (e) { await rollback(); throw e; }

  let done = 0;
  for (let i = 0; i < staged.length; i++) {
    const s = staged[i];
    try { await move(s.where, s.temp, s.final); }
    catch (e) {
      for (const placed of staged.slice(0, i).reverse()) { try { await move(placed.where, placed.final, placed.original); } catch { /* best effort */ } }
      for (const pending of staged.slice(i)) { try { await move(pending.where, pending.temp, pending.original); } catch { /* best effort */ } }
      throw new Error(`Could not rename ${s.final}: ${(e as Error).message}`);
    }
    done++;
    progress?.(done, staged.length);
  }
  return work.length;
}
