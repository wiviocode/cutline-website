/**
 * The app's state and everything it does: the setup, the run, review, and writing to disk.
 *
 * Everything that decides what a caption says lives in @core; everything that touches the disk
 * or the network in @platform. This file is the wiring between them.
 */

import { create } from "zustand";
import { Storage, DEFAULT_SETTINGS, type Settings, type SavedTeam, type RecentShoot } from "@platform/storage";
import { pickFolder, reopenFolder, FileListFolder, supportsWritableFolders, type PhotoFolder, type PhotoFile } from "@platform/fs";
import { browserSource, ImageCache, THUMB_EDGE, PREVIEW_EDGE, resized, base64, orientedSize } from "@platform/images";
import { readPhotoMetadata, readEmbeddedIPTC } from "@platform/exif";
import { fetchPage, relayAvailable } from "@platform/relay";

import { Claude, describe as describeError, type SentImage } from "@core/ai/Claude";
import { Cost, SCOUT_MODEL, TIERS, Usage, type Tier } from "@core/ai/Models";
import { readPhoto } from "@core/pipeline/ReadPhoto";
import { Compose, type CaptionContext } from "@core/caption/Compose";
import { Identify, type Identity, type ManualID } from "@core/vision/Identify";
import { Prompt, type MeetEntry, type ShootContext } from "@core/vision/Prompt";
import type { Observation } from "@core/vision/Observation";
import { resizedSize } from "@core/vision/ImageSize";
import { Team, Player, type Matchup, type TeamKey } from "@core/roster/Roster";
import { RosterImport, type ImportRequest } from "@core/roster/RosterImport";
import { Sports, Levels, type SportID, type Gender } from "@core/sports/Sports";
import { parseHeadline } from "@core/sports/Headline";
import { FrameRecord } from "@core/records/FrameRecord";
import { ProcessedFilesManifest } from "@core/records/ProcessedFilesManifest";
import { PhotoMetadata } from "@core/images/PhotoMetadata";
import { MetadataOutput } from "@core/metadata/MetadataOutput";
import { IPTCTemplate } from "@core/metadata/IPTCTemplate";
import { HurrdatFields } from "@core/metadata/HurrdatFields";

export type Screen = "loading" | "welcome" | "setup" | "review";
export type FrameState = "pending" | "working" | "done" | "failed";
export type Filter = "all" | "review" | "approved" | "unapproved";

export interface SlotState {
  team: Team | null;
  link: string;
  busy: boolean;
  status: string;
  error: string | null;
  notes: string[];
}

export interface Frame {
  id: string;
  name: string;
  photo: PhotoFile;
  exif: PhotoMetadata | null;
  state: FrameState;
  error: string | null;
  observation: Observation | null;
  sent: { width: number; height: number } | null;
  original: { width: number; height: number } | null;
  zooms: FrameRecord["zooms"];
  model: string | null;
  dollars: number;
  manual: Record<string, ManualID>;
  note: string;
  identities: Identity[];
  caption: string;
  captionEdited: boolean;
  approved: boolean;
  written: boolean;
  writeError: string | null;
}

export interface Setup {
  levelId: string;
  sport: SportID;
  gender: Gender;
  venue: string;
  city: string;
  state: string;
  eventName: string;
  /** A meet's entry list, as pasted: "bib, name, school" per line. */
  entriesText: string;
}

export interface Notice { text: string; kind: "error" | "info" }

const emptySlot = (): SlotState => ({ team: null, link: "", busy: false, status: "", error: null, notes: [] });

export const thumbnails = new ImageCache(4, THUMB_EDGE, true);
export const previews = new ImageCache(2, PREVIEW_EDGE, false);

interface State {
  screen: Screen;
  settings: Settings;
  apiKey: string;
  keyStatus: "unknown" | "checking" | "ok" | "bad";
  keyError: string | null;
  relay: boolean | null;
  library: SavedTeam[];
  recents: RecentShoot[];
  panel: null | "settings";

  setup: Setup;
  slots: Record<TeamKey, SlotState>;
  scouting: boolean;

  folder: PhotoFolder | null;
  recentID: string | null;
  frames: Frame[];
  loadingFolder: boolean;

  running: boolean;
  cancelRequested: boolean;
  runDone: number;
  runTotal: number;
  spent: number;

  selectedID: string | null;
  filter: Filter;
  notice: Notice | null;

  // lifecycle
  init(): Promise<void>;
  notify(text: string, kind?: Notice["kind"]): void;
  setPanel(p: null | "settings"): void;
  setScreen(s: Screen): void;
  updateSettings(patch: Partial<Settings>): Promise<void>;
  saveKey(key: string): Promise<boolean>;
  finishWelcome(): Promise<void>;

  // folder
  chooseFolder(): Promise<void>;
  useFiles(files: File[]): Promise<void>;
  useFolder(folder: PhotoFolder): Promise<void>;
  openRecent(r: RecentShoot): Promise<void>;
  forgetRecent(id: string): Promise<void>;
  closeShoot(): void;

  // setup
  setSetup(patch: Partial<Setup>): void;
  setLink(slot: TeamKey, link: string): void;
  importLink(slot: TeamKey): Promise<void>;
  importText(slot: TeamKey, text: string): Promise<void>;
  importFile(slot: TeamKey, file: File): Promise<void>;
  useSaved(slot: TeamKey, saved: SavedTeam): void;
  clearTeam(slot: TeamKey): void;
  editTeam(slot: TeamKey, patch: Partial<Team>): void;
  editPlayer(slot: TeamKey, id: string, patch: Partial<Player>): void;
  addPlayer(slot: TeamKey): void;
  removePlayer(slot: TeamKey, id: string): void;
  swapTeams(): void;
  saveTeamToLibrary(slot: TeamKey): Promise<void>;
  deleteSaved(id: string): Promise<void>;
  scoutUniforms(): Promise<void>;

  // run
  startRun(opts?: { ids?: string[]; redo?: boolean }): Promise<void>;
  cancelRun(): void;

  // review
  select(id: string): void;
  step(delta: number): void;
  setFilter(f: Filter): void;
  setManual(frameID: string, subjectID: string, manual: ManualID | null): Promise<void>;
  editCaption(frameID: string, text: string): Promise<void>;
  revertCaption(frameID: string): Promise<void>;
  setNote(frameID: string, note: string): void;
  reread(frameID: string): Promise<void>;
  setApproved(frameID: string, approved: boolean): Promise<void>;
  approveAndNext(): Promise<void>;
  writeAllApproved(): Promise<void>;
}

// ------------------------------------------------------------------------------------------ derived

export const derive = {
  sport(s: Pick<State, "setup">) { return Sports.info(s.setup.sport); },
  level(s: Pick<State, "setup">) { return Levels.info(s.setup.levelId); },
  usesRosters(s: Pick<State, "setup">) { return Sports.usesRosters(s.setup.sport); },

  matchup(s: Pick<State, "slots" | "setup">): Matchup | null {
    if (!Sports.usesRosters(s.setup.sport)) {
      // A meet may still be a dual between two named teams.
      return s.slots.A.team && s.slots.B.team ? { a: s.slots.A.team, b: s.slots.B.team } : null;
    }
    const blank = (name: string) => Team.make({ school: name });
    return { a: s.slots.A.team ?? blank("Home"), b: s.slots.B.team ?? blank("Visitors") };
  },

  entries(s: Pick<State, "setup">): MeetEntry[] {
    return s.setup.entriesText.split(/\r?\n/).map((line) => line.split(/\t|,/).map((x) => x.trim())).filter((c) => c[0] && /^\d+$/.test(c[0]) && c[1])
      .map(([bib, name, school]) => ({ bib, name, school: school ?? "" }));
  },

  shoot(s: Pick<State, "slots" | "setup">): ShootContext {
    return { sport: s.setup.sport, gender: s.setup.gender, level: Levels.info(s.setup.levelId), matchup: derive.matchup(s), entries: derive.entries(s), eventName: s.setup.eventName.trim() || undefined };
  },

  captionContext(s: Pick<State, "slots" | "setup" | "settings">, frame?: Frame | null): CaptionContext {
    return {
      style: s.settings.style, sport: s.setup.sport, gender: s.setup.gender, level: Levels.info(s.setup.levelId), matchup: derive.matchup(s),
      eventName: s.setup.eventName.trim() || undefined, venue: s.setup.venue.trim() || undefined, city: s.setup.city.trim() || undefined, state: s.setup.state.trim() || undefined,
      captureDate: frame?.exif?.captureDate ?? null, photographer: s.settings.photographer, house: s.settings.house, unnamed: s.settings.unnamed,
    };
  },

  /** Why the run cannot start yet, or null. */
  blocker(s: State): string | null {
    if (!s.apiKey || s.keyStatus === "bad") return "Add a working Anthropic API key in Settings.";
    if (!s.folder || !s.frames.length) return "Choose a folder of photographs.";
    if (derive.usesRosters(s)) {
      if (!s.slots.A.team || !s.slots.B.team) return "Add both teams.";
      if (!s.slots.A.team.players.length && !s.slots.B.team.players.length) return "Neither team has a roster yet.";
    } else if (!s.setup.eventName.trim()) return "Name the meet.";
    return null;
  },

  title(s: Pick<State, "slots" | "setup">): string {
    const sport = Sports.label(s.setup.sport, s.setup.gender, Levels.info(s.setup.levelId).kind);
    if (!Sports.usesRosters(s.setup.sport)) return [s.setup.eventName || sport].join("");
    const a = s.slots.A.team?.school, b = s.slots.B.team?.school;
    return a && b ? `${a} v ${b} · ${sport}` : sport;
  },

  visible(s: Pick<State, "frames" | "filter">): Frame[] {
    switch (s.filter) {
      case "review": return s.frames.filter((f) => f.state === "failed" || (f.state === "done" && !f.approved && Identify.needsReview(f.identities)));
      case "approved": return s.frames.filter((f) => f.approved);
      case "unapproved": return s.frames.filter((f) => !f.approved);
      default: return s.frames;
    }
  },

  counts(s: Pick<State, "frames">) {
    const f = s.frames;
    return {
      total: f.length,
      done: f.filter((x) => x.state === "done").length,
      pending: f.filter((x) => x.state === "pending").length,
      failed: f.filter((x) => x.state === "failed").length,
      review: f.filter((x) => x.state === "done" && !x.approved && Identify.needsReview(x.identities)).length,
      approved: f.filter((x) => x.approved).length,
    };
  },

  estimate(s: State): number {
    const todo = s.frames.filter((f) => f.state !== "done").length;
    return todo * Cost.perPhoto(s.settings.tier);
  },
};

// ------------------------------------------------------------------------------------------ helpers

function claude(s: State): Claude | null {
  return s.apiKey ? new Claude(s.apiKey, { browser: true }) : null;
}

function importRequest(s: State): ImportRequest {
  return { sport: s.setup.sport, gender: s.setup.gender, level: Levels.info(s.setup.levelId).kind };
}

/** Identities and caption for a frame from its reading and corrections. */
function composed(s: State, f: Frame): Pick<Frame, "identities" | "caption"> {
  if (!f.observation) return { identities: [], caption: f.caption };
  const matchup = derive.matchup(s);
  const identities = Identify.all(f.observation, { matchup: Sports.usesRosters(s.setup.sport) || matchup ? matchup : null, entries: derive.entries(s), unitSport: Sports.hasUnits(s.setup.sport) }, f.manual);
  if (f.captionEdited) return { identities, caption: f.caption };
  const c = Compose.caption(f.observation, identities, derive.captionContext(s, f));
  return { identities, caption: c.caption };
}

function record(f: Frame): FrameRecord {
  return {
    version: 2, filename: f.name, observation: f.observation, sent: f.sent, original: f.original, zooms: f.zooms, model: f.model, dollars: f.dollars,
    manual: f.manual, note: f.note, caption: f.caption, captionEdited: f.captionEdited, approved: f.approved, generatedAt: new Date().toISOString(),
  };
}

async function saveRecord(folder: PhotoFolder | null, f: Frame): Promise<void> {
  if (!folder?.writable) return;
  try {
    const dir = await folder.sub(FrameRecord.folder, true);
    await dir?.writeText(FrameRecord.pathFor(f.name), FrameRecord.serialise(record(f)));
  } catch { /* a record is a convenience; the photograph is what matters */ }
}

function stripNumbers(s: string): string {
  return s.replace(/\s\(\d+\)/g, "").replace(/\s#\d+/g, "");
}

/** Alt text built from the reading at no cost: who and what, without credit or date. */
function altText(s: State, f: Frame): string | null {
  if (!f.observation) return null;
  const c = Compose.caption(f.observation, f.identities, { ...derive.captionContext(s, f), style: "simple" });
  const sport = Sports.info(s.setup.sport);
  const body = stripNumbers(c.body).replace(/XXXXX/g, "a player");
  return `${body[0]?.toUpperCase() ?? ""}${body.slice(1)} in a ${Levels.info(s.setup.levelId).qualifier} ${sport.noun} ${sport.event}.`;
}

let templateCache: { name: string; template: IPTCTemplate } | null = null;
async function template(s: State): Promise<IPTCTemplate | null> {
  const name = s.settings.templateName;
  if (!name) return null;
  if (templateCache?.name === name) return templateCache.template;
  const text = await Storage.template(name);
  if (!text) return null;
  try { templateCache = { name, template: new IPTCTemplate(text) }; return templateCache.template; } catch { return null; }
}

// ------------------------------------------------------------------------------------------ store

export const useStore = create<State>((set, get) => {
  const patchFrame = (id: string, patch: Partial<Frame>) => set((s) => ({ frames: s.frames.map((f) => (f.id === id ? { ...f, ...patch } : f)) }));
  const frame = (id: string) => get().frames.find((f) => f.id === id) ?? null;
  const recompose = (id: string) => {
    const s = get(), f = frame(id);
    if (!f) return;
    patchFrame(id, composed(s, f));
  };
  const recomposeAll = () => set((s) => ({ frames: s.frames.map((f) => (f.observation ? { ...f, ...composed(s, f) } : f)) }));
  const slotPatch = (slot: TeamKey, patch: Partial<SlotState>) => set((s) => ({ slots: { ...s.slots, [slot]: { ...s.slots[slot], ...patch } } }));
  const setTeam = (slot: TeamKey, team: Team | null) => { slotPatch(slot, { team }); recomposeAll(); persistRecent(); };

  let persistTimer: ReturnType<typeof setTimeout> | null = null;
  const persistRecent = () => {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(async () => {
      const s = get();
      if (!s.folder || !s.recentID) return;
      const r: RecentShoot = { id: s.recentID, folderName: s.folder.name, title: derive.title(s), photoCount: s.frames.length, lastOpened: new Date().toISOString(),
        setup: { setup: s.setup, a: s.slots.A.team, b: s.slots.B.team } };
      await Storage.saveRecent(r);
      if (s.folder.handle) await Storage.saveFolderHandle(r.id, s.folder.handle);
      set({ recents: await Storage.recents() });
    }, 400);
  };

  const writeFrame = async (id: string): Promise<void> => {
    const s = get(), f = frame(id), folder = s.folder;
    if (!f || !folder?.writable || !f.caption) return;
    try {
      const file = await f.photo.file();
      const exif = f.exif ?? {};
      const fields = derive.usesRosters(s) ? HurrdatFields.make({
        descriptor: HurrdatFields.descriptor(s.slots.A.team?.school ?? "", Sports.label(s.setup.sport, s.setup.gender, Levels.info(s.setup.levelId).kind), s.slots.B.team?.school ?? "", HurrdatFields.datePlaceholder),
        supplementalCategory: HurrdatFields.supplementalCategory(s.setup.sport, s.setup.gender),
        city: s.setup.city, state: s.setup.state, sublocation: s.setup.venue,
      }) : HurrdatFields.make({ descriptor: `${s.setup.eventName} - ${HurrdatFields.datePlaceholder}`, city: s.setup.city, state: s.setup.state, sublocation: s.setup.venue });
      const packet = MetadataOutput.packet(f.caption, altText(s, f), f.name, exif, {
        template: await template(s), city: s.setup.city, state: s.setup.state, fields, photographer: s.settings.photographer, house: s.settings.house,
      }, f.captionEdited ? "manual" : "ai");
      const original = s.settings.embed ? new Uint8Array(await file.arrayBuffer()) : null;
      const plan = MetadataOutput.plan(f.name, packet, original);
      if (plan.kind === "embed") await folder.writeBytes(f.name, plan.bytes);
      else await folder.writeText(plan.name, plan.text);
      // The write changed the file's size and date; the manifest records the new signature.
      const fresh = (await folder.listPhotos()).find((p) => p.name === f.name);
      if (fresh) {
        patchFrame(id, { photo: fresh });
        const text = await folder.readText(ProcessedFilesManifest.fileName);
        const sig = ProcessedFilesManifest.signature(fresh);
        await folder.writeText(ProcessedFilesManifest.fileName, ProcessedFilesManifest.serialise(ProcessedFilesManifest.markProcessed(text ? ProcessedFilesManifest.parse(text) : [], sig.filename, sig.fileSize, sig.modificationDate)));
      }
      patchFrame(id, { written: true, writeError: null });
    } catch (e) {
      patchFrame(id, { written: false, writeError: (e as Error).message });
    }
  };

  const runOne = async (id: string, c: Claude): Promise<void> => {
    const s = get(), f = frame(id);
    if (!f) return;
    patchFrame(id, { state: "working", error: null });
    const tier: Tier = s.settings.tier;
    const matchup = derive.matchup(s);
    try {
      const reading = await readPhoto({
        claude: c, tier, system: Prompt.system(derive.shoot(s)),
        identify: { matchup, entries: derive.entries(s), unitSport: Sports.hasUnits(s.setup.sport) },
        source: browserSource(f.photo), note: f.note || null, sportName: Sports.info(s.setup.sport).noun,
      }).catch(async (e) => {
        // Opus declines the odd frame its safety checks misjudge; Sonnet reads it instead.
        if (describeError(e).kind === "refusal" && TIERS[tier].model !== "claude-sonnet-5") {
          return readPhoto({ claude: c, tier, model: "claude-sonnet-5", system: Prompt.system(derive.shoot(s)), identify: { matchup, entries: derive.entries(s), unitSport: Sports.hasUnits(s.setup.sport) }, source: browserSource(f.photo), note: f.note || null, sportName: Sports.info(s.setup.sport).noun });
        }
        throw e;
      });
      const dollars = Cost.of(reading.model, reading.usage);
      set((st) => ({ spent: st.spent + dollars }));
      const next: Frame = { ...frame(id)!, state: "done", observation: reading.observation, sent: reading.sent, original: reading.original, zooms: reading.zooms, model: reading.model, dollars, captionEdited: false, approved: false, written: false };
      const { identities, caption } = composed(get(), next);
      patchFrame(id, { ...next, identities, caption });
      await saveRecord(get().folder, frame(id)!);
    } catch (e) {
      const err = describeError(e);
      patchFrame(id, { state: "failed", error: err.message });
      if (err.kind === "auth") { set({ cancelRequested: true, keyStatus: "bad", keyError: err.message }); get().notify(err.message); }
    }
  };

  return {
    screen: "loading",
    settings: DEFAULT_SETTINGS,
    apiKey: "",
    keyStatus: "unknown",
    keyError: null,
    relay: null,
    library: [],
    recents: [],
    panel: null,
    setup: { levelId: "ncaa-d1", sport: "football", gender: "mens", venue: "", city: "", state: "", eventName: "", entriesText: "" },
    slots: { A: emptySlot(), B: emptySlot() },
    scouting: false,
    folder: null,
    recentID: null,
    frames: [],
    loadingFolder: false,
    running: false,
    cancelRequested: false,
    runDone: 0,
    runTotal: 0,
    spent: 0,
    selectedID: null,
    filter: "all",
    notice: null,

    async init() {
      const [settings, apiKey, library, recents] = await Promise.all([Storage.settings(), Storage.key(), Storage.teams(), Storage.recents()]);
      set({ settings, apiKey, library, recents, keyStatus: apiKey ? "ok" : "unknown", screen: settings.onboarded && apiKey ? "setup" : "welcome" });
      relayAvailable().then((relay) => set({ relay }));
    },

    notify(text, kind = "error") { set({ notice: { text, kind } }); if (kind === "info") setTimeout(() => { if (get().notice?.text === text) set({ notice: null }); }, 4000); },
    setPanel(panel) { set({ panel }); },
    setScreen(screen) { set({ screen }); },

    async updateSettings(patch) {
      const settings = { ...get().settings, ...patch };
      set({ settings });
      await Storage.saveSettings(settings);
      if ("style" in patch || "photographer" in patch || "house" in patch || "unnamed" in patch) recomposeAll();
    },

    async saveKey(key) {
      const k = key.trim();
      set({ keyStatus: "checking", keyError: null });
      if (!/^sk-ant-/.test(k)) { set({ keyStatus: "bad", keyError: "An Anthropic API key starts with sk-ant-." }); return false; }
      const r = await new Claude(k, { browser: true }).verify();
      if (!r.ok) { set({ keyStatus: "bad", keyError: r.reason }); return false; }
      await Storage.saveKey(k);
      set({ apiKey: k, keyStatus: "ok", keyError: null });
      return true;
    },

    async finishWelcome() {
      await get().updateSettings({ onboarded: true });
      set({ screen: "setup" });
    },

    // ---------------------------------------------------------------- folder

    async chooseFolder() {
      if (!supportsWritableFolders()) return;
      const folder = await pickFolder().catch((e) => { get().notify((e as Error).message); return null; });
      if (folder) await openFolder(folder, null);
    },

    async useFiles(files) {
      if (!files.length) return;
      await openFolder(new FileListFolder(files), null);
    },

    async useFolder(folder) { await openFolder(folder, null); },

    async openRecent(r) {
      const handle = await Storage.folderHandle(r.id);
      if (!handle) { get().notify("That folder can't be reopened here — choose it again."); return; }
      const folder = await reopenFolder(handle).catch(() => null);
      if (!folder) { get().notify("Permission to open the folder was not given."); return; }
      await openFolder(folder, r);
    },

    async forgetRecent(id) { await Storage.deleteRecent(id); set({ recents: await Storage.recents() }); },

    closeShoot() {
      thumbnails.clear(); previews.clear();
      set({ folder: null, frames: [], selectedID: null, recentID: null, screen: "setup", spent: 0, slots: { A: emptySlot(), B: emptySlot() } });
    },

    // ---------------------------------------------------------------- setup

    setSetup(patch) {
      const setup = { ...get().setup, ...patch };
      // Keep gender consistent with the sport; a newly chosen sport starts at its usual gender.
      const sport = Sports.info(setup.sport);
      if (patch.sport && !patch.gender && sport.defaultGender) setup.gender = sport.defaultGender;
      if (!sport.genders.includes(setup.gender)) setup.gender = sport.genders[0];
      set({ setup });
      recomposeAll();
      persistRecent();
    },

    setLink(slot, link) { slotPatch(slot, { link }); },

    async importLink(slot) {
      const s = get();
      const link = s.slots[slot].link.trim();
      if (!link) return;
      slotPatch(slot, { busy: true, error: null, status: "Reading the roster page…", notes: [] });
      try {
        const r = await RosterImport.fromLink(link, importRequest(s), fetchPage, claude(s));
        set((st) => ({ spent: st.spent + r.dollars }));
        const previous = get().slots[slot].team;
        const team = { ...r.team, uniform: previous?.uniform ?? r.team.uniform };
        slotPatch(slot, { busy: false, status: `${team.players.length} players · ${sourceLabel(r.source)}${r.dollars ? ` · ${Cost.dollars(r.dollars)}` : ""}`, notes: r.notes });
        setTeam(slot, team);
      } catch (e) {
        slotPatch(slot, { busy: false, status: "", error: (e as Error).message });
      }
    },

    async importText(slot, text) {
      const s = get(), c = claude(s);
      if (!text.trim()) return;
      if (!c) { slotPatch(slot, { error: "Reading pasted text needs an API key." }); return; }
      slotPatch(slot, { busy: true, error: null, status: "Reading the pasted roster…", notes: [] });
      try {
        // A whole page's HTML pasted in is read as a page, which may need no model at all.
        const r = /<html|<script|<div/i.test(text)
          ? await RosterImport.fromHTML(text, s.slots[slot].link || "https://pasted.invalid/", importRequest(s), c)
          : await RosterImport.fromText(text, importRequest(s), c);
        set((st) => ({ spent: st.spent + r.dollars }));
        slotPatch(slot, { busy: false, status: `${r.team.players.length} players · ${sourceLabel(r.source)}${r.dollars ? ` · ${Cost.dollars(r.dollars)}` : ""}`, notes: r.notes });
        setTeam(slot, { ...r.team, school: r.team.school || get().slots[slot].team?.school || "" });
      } catch (e) {
        slotPatch(slot, { busy: false, status: "", error: (e as Error).message });
      }
    },

    async importFile(slot, file) {
      const s = get(), c = claude(s);
      const req = importRequest(s);
      slotPatch(slot, { busy: true, error: null, status: `Reading ${file.name}…`, notes: [] });
      try {
        let r;
        if (/\.(csv|tsv|txt)$/i.test(file.name)) r = RosterImport.fromCSV(await file.text(), req, s.slots[slot].team?.school ?? "");
        else if (!c) throw new Error("Reading a screenshot or PDF needs an API key.");
        else if (/\.pdf$/i.test(file.name)) r = await RosterImport.fromPDF(await base64(file), req, c);
        else if (/\.(png|jpe?g|webp|gif|heic)$/i.test(file.name)) {
          const { width, height } = await orientedSize(file);
          const [w, h] = resizedSize(width, height, 2576, 4784);
          const img: SentImage = { data: await base64(await resized(file, w, h, 0.9)), width: w, height: h };
          r = await RosterImport.fromImage(img, req, c);
        } else if (/\.html?$/i.test(file.name)) r = await RosterImport.fromHTML(await file.text(), "https://file.invalid/", req, c);
        else throw new Error("Use a CSV, a PDF, a screenshot or a saved web page.");
        set((st) => ({ spent: st.spent + r.dollars }));
        slotPatch(slot, { busy: false, status: `${r.team.players.length} players · ${sourceLabel(r.source)}${r.dollars ? ` · ${Cost.dollars(r.dollars)}` : ""}`, notes: r.notes });
        setTeam(slot, { ...r.team, school: r.team.school || get().slots[slot].team?.school || "" });
      } catch (e) {
        slotPatch(slot, { busy: false, status: "", error: describeError(e).message });
      }
    },

    useSaved(slot, saved) {
      slotPatch(slot, { status: `${saved.team.players.length} players · from your teams`, error: null, notes: [] });
      setTeam(slot, { ...saved.team, uniform: "" });
    },

    clearTeam(slot) { set((s) => ({ slots: { ...s.slots, [slot]: emptySlot() } })); recomposeAll(); persistRecent(); },

    editTeam(slot, patch) {
      const team = get().slots[slot].team ?? Team.make({ school: "" });
      setTeam(slot, { ...team, ...patch });
    },

    editPlayer(slot, id, patch) {
      const team = get().slots[slot].team;
      if (!team) return;
      setTeam(slot, { ...team, players: team.players.map((p) => (p.id === id ? { ...p, ...patch } : p)) });
    },

    addPlayer(slot) {
      const team = get().slots[slot].team ?? Team.make({ school: "" });
      setTeam(slot, { ...team, players: [...team.players, Player.make({ number: "" })] });
    },

    removePlayer(slot, id) {
      const team = get().slots[slot].team;
      if (team) setTeam(slot, { ...team, players: team.players.filter((p) => p.id !== id) });
    },

    swapTeams() {
      // A reading's team letters refer to the prompt it was read with, so they swap too —
      // otherwise every player read so far would be named for the other side.
      const flip = (t: string) => (t === "A" ? "B" : t === "B" ? "A" : t);
      const flipClause = (c: string) => c.replace(/\{(A|B)(:players)?\}/g, (_, k: string, p: string | undefined) => `{${flip(k)}${p ?? ""}}`);
      set((s) => ({
        slots: { A: s.slots.B, B: s.slots.A },
        frames: s.frames.map((f) => (!f.observation ? f : {
          ...f,
          observation: { ...f.observation, clause: flipClause(f.observation.clause), subjects: f.observation.subjects.map((x) => ({ ...x, team: flip(x.team) as typeof x.team })) },
          manual: Object.fromEntries(Object.entries(f.manual).map(([k, m]) => [k, { ...m, teamKey: m.teamKey ? (flip(m.teamKey) as TeamKey) : null }])),
        })),
      }));
      recomposeAll();
      persistRecent();
    },

    async saveTeamToLibrary(slot) {
      const s = get(), team = s.slots[slot].team;
      if (!team) return;
      const saved: SavedTeam = { team: { ...team, uniform: "" }, sport: s.setup.sport, gender: s.setup.gender, level: Levels.info(s.setup.levelId).kind, savedAt: new Date().toISOString() };
      await Storage.saveTeam(saved);
      set({ library: await Storage.teams() });
      get().notify(`${Team.fullName(team)} saved to your teams.`, "info");
    },

    async deleteSaved(id) { await Storage.deleteTeam(id); set({ library: await Storage.teams() }); },

    async scoutUniforms() {
      const s = get(), c = claude(s);
      const a = s.slots.A.team, b = s.slots.B.team;
      if (!c || !a || !b || !s.frames.length) return;
      set({ scouting: true });
      try {
        const n = s.frames.length;
        const picks = [...new Set([0.15, 0.4, 0.65, 0.9].map((x) => Math.min(n - 1, Math.floor(x * n))))].map((i) => s.frames[i]);
        const images = await Promise.all(picks.map(async (f) => {
          const src = browserSource(f.photo);
          const { width, height } = await src.size();
          const [w, h] = resizedSize(width, height, 1568, 900);
          return src.frame(w, h);
        }));
        const r = await c.scoutUniforms({ model: SCOUT_MODEL, images, sport: Sports.info(s.setup.sport).noun, teamA: Team.fullName(a), teamB: Team.fullName(b), colorsA: a.colors.join(", "), colorsB: b.colors.join(", ") });
        set((st) => ({ spent: st.spent + Cost.of(SCOUT_MODEL, r.usage) }));
        if (r.a) get().editTeam("A", { uniform: r.a });
        if (r.b) get().editTeam("B", { uniform: r.b });
      } catch (e) {
        get().notify(`Could not read the uniforms: ${describeError(e).message}`);
      } finally { set({ scouting: false }); }
    },

    // ---------------------------------------------------------------- run

    async startRun(opts = {}) {
      const s = get();
      const blocked = derive.blocker(s);
      if (blocked) { get().notify(blocked); return; }
      const c = claude(s)!;
      // Uniforms first: the strongest cue for telling the sides apart, read once per shoot.
      if (derive.usesRosters(s) && (!s.slots.A.team?.uniform || !s.slots.B.team?.uniform)) await get().scoutUniforms();
      const ids = (opts.ids ?? get().frames.filter((f) => opts.redo || f.state === "pending" || f.state === "failed").map((f) => f.id));
      if (!ids.length) { set({ screen: "review" }); return; }
      set({ running: true, cancelRequested: false, runDone: 0, runTotal: ids.length, screen: "review", selectedID: get().selectedID ?? ids[0] });
      const queue = [...ids];
      // The first photograph goes alone so the rest read its cached prompt.
      const first = queue.shift()!;
      await runOne(first, c);
      set((st) => ({ runDone: st.runDone + 1 }));
      const worker = async () => {
        while (queue.length && !get().cancelRequested) {
          const id = queue.shift()!;
          await runOne(id, c);
          set((st) => ({ runDone: st.runDone + 1 }));
        }
      };
      await Promise.all(Array.from({ length: Math.max(1, Math.min(8, get().settings.concurrency)) }, worker));
      set({ running: false, cancelRequested: false });
      persistRecent();
      const c2 = derive.counts(get());
      get().notify(`Done: ${c2.done} read${c2.failed ? `, ${c2.failed} failed` : ""}${c2.review ? ` · ${c2.review} to check` : ""}.`, "info");
    },

    cancelRun() { set({ cancelRequested: true }); },

    // ---------------------------------------------------------------- review

    select(id) { set({ selectedID: id }); },
    step(delta) {
      const s = get(), list = derive.visible(s);
      if (!list.length) return;
      const i = Math.max(0, list.findIndex((f) => f.id === s.selectedID));
      const next = list[Math.min(list.length - 1, Math.max(0, i + delta))];
      set({ selectedID: next.id });
    },
    setFilter(filter) { set({ filter }); },

    async setManual(frameID, subjectID, manual) {
      const f = frame(frameID);
      if (!f) return;
      const next = { ...f.manual };
      if (manual) {
        const team = manual.teamKey ? get().slots[manual.teamKey].team : null;
        const p = team?.players.find((x) => x.id === manual.playerID);
        next[subjectID] = p ? { ...manual, number: p.number, name: Player.fullName(p) } : manual;
      } else delete next[subjectID];
      patchFrame(frameID, { manual: next, captionEdited: false });
      recompose(frameID);
      await saveRecord(get().folder, frame(frameID)!);
      if (frame(frameID)!.approved) await writeFrame(frameID);
    },

    async editCaption(frameID, text) {
      patchFrame(frameID, { caption: text, captionEdited: true });
      await saveRecord(get().folder, frame(frameID)!);
      if (frame(frameID)!.approved) await writeFrame(frameID);
    },

    async revertCaption(frameID) {
      patchFrame(frameID, { captionEdited: false });
      recompose(frameID);
      await saveRecord(get().folder, frame(frameID)!);
    },

    setNote(frameID, note) { patchFrame(frameID, { note }); },

    async reread(frameID) {
      const c = claude(get());
      if (!c) return;
      await runOne(frameID, c);
    },

    async setApproved(frameID, approved) {
      patchFrame(frameID, { approved });
      if (approved) await writeFrame(frameID);
      await saveRecord(get().folder, frame(frameID)!);
    },

    async approveAndNext() {
      const s = get(), id = s.selectedID;
      if (!id) return;
      const f = frame(id);
      if (!f || f.state !== "done" && !f.caption) return;
      get().step(1);
      await get().setApproved(id, true);
    },

    async writeAllApproved() {
      for (const f of get().frames.filter((x) => x.approved && !x.written)) await writeFrame(f.id);
      get().notify("Approved captions written.", "info");
    },
  };

  async function openFolder(folder: PhotoFolder, recent: RecentShoot | null) {
    set({ loadingFolder: true });
    thumbnails.clear(); previews.clear();
    try {
      const photos = await folder.listPhotos();
      if (!photos.length) { get().notify("There are no photographs in that folder."); return; }
      const records = await folder.sub(FrameRecord.folder, false).catch(() => null);
      const frames: Frame[] = [];
      for (const photo of photos) {
        const text = records ? await records.readText(FrameRecord.pathFor(photo.name)).catch(() => null) : null;
        const rec = text ? FrameRecord.parse(text, photo.name) : null;
        frames.push({
          id: photo.name, name: photo.name, photo, exif: null,
          state: rec?.observation ? "done" : rec?.caption ? "done" : "pending", error: null,
          observation: rec?.observation ?? null, sent: rec?.sent ?? null, original: rec?.original ?? null, zooms: rec?.zooms ?? [], model: rec?.model ?? null, dollars: rec?.dollars ?? 0,
          manual: rec?.manual ?? {}, note: rec?.note ?? "", identities: [], caption: rec?.caption ?? "", captionEdited: rec?.captionEdited ?? false,
          approved: rec?.approved ?? false, written: rec?.approved ?? false, writeError: null,
        });
      }
      const id = recent?.id ?? `${folder.name}:${photos.length}:${photos[0].name}`;
      set({ folder, frames, recentID: id, selectedID: frames[0].id, spent: 0, filter: "all" });

      if (recent?.setup) {
        const saved = recent.setup as { setup: Setup; a: Team | null; b: Team | null };
        set((s) => ({ setup: { ...s.setup, ...saved.setup }, slots: { A: { ...emptySlot(), team: saved.a }, B: { ...emptySlot(), team: saved.b } } }));
      } else {
        // What the photographs already say: location, and often the sport and both teams.
        const first = await photos[0].file();
        const iptc = await readEmbeddedIPTC(first);
        const guess = iptc.headline ? parseHeadline(iptc.headline) : null;
        const patch: Partial<Setup> = {};
        if (iptc.city) patch.city = iptc.city;
        if (iptc.state) patch.state = iptc.state;
        if (iptc.venue) patch.venue = iptc.venue;
        if (guess?.sport) { patch.sport = guess.sport; if (guess.gender) patch.gender = guess.gender; }
        if (guess?.level === "highSchool" && Levels.info(get().setup.levelId).kind !== "highSchool") patch.levelId = "hs";
        if (guess?.level === "college" && Levels.info(get().setup.levelId).kind !== "college") patch.levelId = "ncaa-d1";
        get().setSetup(patch);
        if (guess) {
          if (!get().slots.A.team) slotPatch("A", { link: "", team: null, status: `From the photos: ${guess.home}` });
          if (!get().slots.B.team) slotPatch("B", { link: "", team: null, status: `From the photos: ${guess.away}` });
          set((s) => ({ slots: { A: { ...s.slots.A, team: s.slots.A.team ?? Team.make({ school: guess.home }) }, B: { ...s.slots.B, team: s.slots.B.team ?? Team.make({ school: guess.away }) } } }));
        }
      }
      recomposeAll();
      persistRecent();
      set({ screen: "setup" });

      // Capture dates, a few at a time, then captions that include them.
      const queue = [...get().frames];
      const worker = async () => {
        while (queue.length) {
          const f = queue.shift()!;
          const exif = await readPhotoMetadata(await f.photo.file()).catch(() => null);
          patchFrame(f.id, { exif });
        }
      };
      await Promise.all(Array.from({ length: 4 }, worker));
      recomposeAll();
    } finally {
      set({ loadingFolder: false });
    }
  }
});

function sourceLabel(source: string): string {
  switch (source) {
    case "maxpreps": return "read from MaxPreps";
    case "sidearm-nextgen": case "sidearm-classic": return "read from the athletics site";
    case "wmt": return "read from the athletics site";
    case "model": return "read by Claude";
    case "csv": return "from the CSV";
    default: return source;
  }
}

export { Usage };
