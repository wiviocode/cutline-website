/**
 * The application's state: the setup screen's answers, the shoot, the run, and review.
 *
 * `ShootModel` and `GameSetup` from the native app, in one store. Everything that touches the
 * disk or the network goes through `@platform`; everything that decides what a caption says goes
 * through `@core`. This file is the wiring between them.
 */

import { create } from "zustand";
import { Storage, DEFAULT_SETTINGS, type Settings } from "@platform/storage";
import { pickFolder, reopenFolder, applyRenamePlan, FileListFolder, type PhotoFolder, type PhotoFile } from "@platform/fs";
import { preparedForVision, ImageCache, THUMB_EDGE, PREVIEW_EDGE } from "@platform/images";
import { readPhotoMetadata } from "@platform/exif";
import { fetchPage, fetchLogo, relayAvailable } from "@platform/fetchPage";

import { GameSelection, RecentGame, SportCatalogue, captionQualifier, type Level, type Gender, type RosterMode } from "@core/setup/GameLibrary";
import { KitColourDiagnosis } from "@core/setup/KitColourDiagnosis";
import { Roster, RosterPlayer, Team, type Roster as RosterT, type PlayerSide } from "@core/roster/Roster";
import { Positions } from "@core/roster/Positions";
import { TeamColorArbiter } from "@core/roster/TeamColorArbiter";
import { TeamName } from "@core/roster/TeamName";
import { SavedTeam, TeamLibrary } from "@core/roster/SavedTeam";
import { TeamPageURL } from "@core/roster/TeamPageURL";
import { TeamPageParser } from "@core/roster/TeamPageParser";
import { TeamIdentity } from "@core/roster/TeamIdentity";
import { RosterImporter, ImportError, type ImportedPlayer } from "@core/roster/RosterImporter";
import { CSVRosterImporter } from "@core/roster/CSVRosterImporter";
import { VisionResult } from "@core/vision/VisionResult";
import { VisionPrompt } from "@core/vision/VisionPrompt";
import { CaptionResponseParser } from "@core/vision/CaptionResponseParser";
import { CaptionComposer } from "@core/caption/CaptionComposer";
import { CompositionContext, EventDescription, asSport, type CaptionStyle } from "@core/caption/CompositionContext";
import { UNIDENTIFIED_TOKEN } from "@core/caption/PlayerReference";
import { AnthropicClient, ClientError, type KeyCheck } from "@core/anthropic/AnthropicClient";
import { needsOnboarding } from "./onboarding";
import { AltTextRequest, SimpleAltText } from "@core/anthropic/AltText";
import { VisionModel, ImagePrep } from "@core/anthropic/VisionModel";
import { CaptionRecord, type ReviewStatus } from "@core/records/CaptionRecord";
import { ProcessedFilesManifest, type ProcessedFileRecord } from "@core/records/ProcessedFilesManifest";
import { PhotoMetadata } from "@core/images/PhotoMetadata";
import { SupportedFormats } from "@core/images/SupportedFormats";
import { MetadataOutput } from "@core/metadata/MetadataOutput";
import { IPTCTemplate } from "@core/metadata/IPTCTemplate";
import { HurrdatFields } from "@core/metadata/HurrdatFields";
import { HDSNaming, type Fixture } from "@core/naming/HDSNaming";
import { PhotoRenamer, type RenamePlan } from "@core/naming/PhotoRenamer";

export type Side = "home" | "away";
export type FrameState = "pending" | "working" | "done" | "failed";
export type Screen = "welcome" | "start" | "game" | "review";
export interface Notice { text: string; kind: "error" | "info" }

export interface Frame {
  id: string;
  name: string;
  photo: PhotoFile;
  state: FrameState;
  error: string | null;
  caption: string;
  altText: string | null;
  record: CaptionRecord | null;
  exif: PhotoMetadata | null;
  needsNumber: boolean;
  approved: boolean;
  edited: boolean;
  writeError: string | null;
}

export interface SideState { name: string; colour: string; rosterURL: string; team: SavedTeam | null; /** The user set the colour for this fixture; an import must not propose over it. */ colourSet: boolean }
/** One side's roster import, so both can run at once and the sheet can be closed on either. */
export interface ImportState { busy: boolean; status: string; error: string | null; warnings: string[] }
const NO_IMPORT: ImportState = { busy: false, status: "", error: null, warnings: [] };

export const thumbnails = new ImageCache(3);
export const previews = new ImageCache(2);

interface State {
  ready: boolean;
  screen: Screen;
  panel: null | "settings" | "rename";
  writableFolders: boolean;
  relay: boolean | null;

  settings: Settings;
  apiKey: string;
  library: SavedTeam[];
  logoURLs: Record<string, string>;
  recents: RecentGame[];
  templateNames: string[];

  selection: GameSelection;
  rosterMode: RosterMode;
  home: SideState;
  away: SideState;
  eventName: string;
  participantNoun: string;
  venue: string;
  city: string;
  state: string;
  notes: string;
  folder: PhotoFolder | null;
  photoCount: number;
  shootDate: Date | null;
  imports: Record<Side, ImportState>;
  /** The rename sheet has been offered for this folder once every caption was approved. */
  renameOffered: boolean;
  /** The rename sheet is open because the app offered it, not because it was asked for. */
  renamePrompted: boolean;

  frames: Frame[];
  isRunning: boolean;
  progressDone: number;
  progressTotal: number;
  statusLine: string;
  notice: Notice | null;
  tokensIn: number;
  tokensOut: number;
  tokensCacheWrite: number;
  tokensCacheRead: number;
  selectedID: string | null;
  filter: ReviewStatus;
  bulkLabel: string;

  // lifecycle
  init(): Promise<void>;
  setScreen(s: Screen): void;
  setPanel(p: null | "settings" | "rename"): void;
  notify(text: string, kind?: Notice["kind"]): void;
  clearNotice(): void;

  // settings and the first-time setup
  setSetting(patch: Partial<Settings>): void;
  setApiKey(key: string): Promise<void>;
  verifyKey(key: string): Promise<KeyCheck>;
  finishOnboarding(): void;
  reopenSetup(): void;
  addTemplate(name: string, text: string): Promise<void>;
  removeTemplate(name: string): Promise<void>;

  // setup. `fresh` means a new card: the fixture is cleared, the beat is kept.
  chooseFolder(fresh: boolean): Promise<void>;
  useFolder(folder: PhotoFolder, fresh: boolean): Promise<void>;
  useFiles(files: File[], fresh: boolean): Promise<void>;
  openRecent(game: RecentGame): Promise<void>;
  forgetRecent(game: RecentGame): Promise<void>;
  startOver(): void;
  setLevel(l: Level): void;
  setSport(id: string): void;
  setGender(g: Gender): void;
  setRosterMode(m: RosterMode): void;
  setSide(side: Side, patch: Partial<SideState>): void;
  setFields(patch: Partial<Pick<State, "eventName" | "participantNoun" | "venue" | "city" | "state" | "notes">>): void;
  importTeam(side: Side): Promise<void>;
  importTeamFromHTML(side: Side, html: string, sourceURL?: string): Promise<void>;
  importCSV(side: Side, csv: string, teamName?: string): Promise<void>;
  pickLibraryTeam(side: Side, team: SavedTeam): void;
  clearTeam(side: Side): void;
  forgetTeam(team: SavedTeam): Promise<void>;
  continueToReview(): Promise<void>;

  // run
  run(opts?: { redo?: boolean; limit?: number; failed?: boolean }): Promise<void>;
  cancel(): void;

  // review
  select(id: string): void;
  step(delta: number): void;
  nextNeedingNumber(): void;
  setFilter(f: ReviewStatus): void;
  assignNumber(id: string, slot: number, number: string): Promise<void>;
  updateCaption(id: string, text: string): Promise<void>;
  recompose(id: string): Promise<void>;
  recomposeAll(): Promise<void>;
  setApproved(id: string, approved: boolean): Promise<void>;
  approveAndAdvance(): Promise<void>;
  recaption(id: string, note: string): Promise<void>;
  setKitColour(colour: string, side: Side): Promise<void>;

  // rename
  renameFixture(date: Date, coveredIsHome: boolean): Fixture | null;
  renamePlan(date: Date, coveredIsHome: boolean): Promise<RenamePlan | null>;
  applyRename(plan: RenamePlan): Promise<void>;
}

// ---- derived helpers, used by screens too ----

export const derive = {
  sportLabel: (s: State) => (s.rosterMode === "noTeams" ? "" : GameSelection.label(s.selection)),
  eventTitle: (s: State) => {
    if (s.rosterMode === "noTeams") return s.eventName.trim() || "Event";
    return `${s.home.name || "Home"} vs ${s.away.name || "Away"}`;
  },
  rosterless: (s: State) => s.rosterMode !== "rosters",
  noTeams: (s: State) => s.rosterMode === "noTeams",
  hasFolder: (s: State) => s.folder != null,
  needsOnboarding: (s: State) => needsOnboarding(s.settings, s.apiKey),

  /** Where a team's name divides. A scraped team already knows; a typed one is guessed at. */
  nameParts(s: State, side: Side): { school: string; nickname: string | null } {
    const st = s[side];
    if (st.team && st.team.identity.schoolName && st.name === SavedTeam.fullName(st.team)) {
      return { school: st.team.identity.schoolName, nickname: st.team.identity.mascot ?? null };
    }
    return TeamName.split(st.name);
  },

  roster(s: State): RosterT {
    if (s.rosterMode === "noTeams") return Roster.noTeams();
    const h = derive.nameParts(s, "home"), a = derive.nameParts(s, "away");
    const t1 = Team.make(h.school, s.home.colour, h.nickname, "home");
    const t2 = Team.make(a.school, s.away.colour, a.nickname, "away");
    if (s.rosterMode === "noRosters") return Roster.make(t1, t2, []);
    const players = (team: SavedTeam | null, id: string) => (team?.players ?? []).map((p) => toRosterPlayer(p, id, s.selection.sportID));
    return Roster.make(t1, t2, [...players(s.home.team, "home"), ...players(s.away.team, "away")]);
  },

  event(s: State): EventDescription | null {
    return s.rosterMode === "noTeams" ? EventDescription.make(s.eventName, s.participantNoun) : null;
  },

  canContinue(s: State): boolean { return derive.blockingReason(s) == null; },

  blockingReason(s: State): string | null {
    if (!s.folder) return "Choose the folder of photos.";
    if (s.rosterMode === "noTeams") return s.eventName.trim() ? null : "Name the event.";
    if (!s.home.name.trim()) return "Name the home team.";
    if (!s.away.name.trim()) return "Name the away team.";
    if (!s.home.colour.trim() || !s.away.colour.trim()) return "Set both kit colours — colour is how a jersey is matched to a team.";
    if (TeamColorArbiter.sameFamily(s.home.colour, s.away.colour)) {
      return s.home.colour.toLowerCase() === s.away.colour.toLowerCase()
        ? `Both teams are set to ${s.home.colour} — colour is how a jersey is matched to a team.`
        : `${cap(s.home.colour)} and ${cap(s.away.colour)} are the same colour to the matcher, so it could not tell the teams apart.`;
    }
    if (s.rosterMode === "rosters") {
      if (!s.home.team) return "Import or choose the home team.";
      if (!s.away.team) return "Import or choose the away team.";
      if (!s.home.team.players.length) return "The home team has no players.";
      if (!s.away.team.players.length) return "The away team has no players.";
    }
    return null;
  },

  deskFields(s: State): HurrdatFields {
    const descriptor = s.rosterMode === "noTeams"
      ? HurrdatFields.descriptor(derive.eventTitle(s), "", "", HurrdatFields.datePlaceholder)
      : HurrdatFields.descriptor(derive.nameParts(s, "home").school, derive.sportLabel(s), derive.nameParts(s, "away").school, HurrdatFields.datePlaceholder);
    return HurrdatFields.make({
      descriptor,
      supplementalCategory: HurrdatFields.supplementalCategory(s.selection.sportID, s.selection.gender),
      city: s.city, state: s.state, sublocation: s.venue,
    });
  },

  descriptorPreview(s: State): string {
    const iso = s.shootDate ? PhotoMetadata.iptcDateCreated({ captureDate: s.shootDate })! : "the date of each frame";
    return derive.deskFields(s).descriptor.split(HurrdatFields.datePlaceholder).join(iso);
  },

  filenamePreview(s: State): string | null {
    if (s.rosterMode === "noTeams" || !s.shootDate || !s.home.name || !s.away.name) return null;
    const code = HDSNaming.sportCode(s.selection.sportID, s.selection.gender);
    if (!code) return null;
    return HDSNaming.filename({ initials: HDSNaming.initials(s.settings.photographer), date: s.shootDate, sportCode: code, covered: s.home.name, opponent: s.away.name, coveredIsHome: true }, 1, "jpg");
  },

  visibleFrames(s: State): Frame[] {
    switch (s.filter) {
      case "approved": return s.frames.filter((f) => f.approved);
      case "needsReview": return s.frames.filter((f) => !f.approved);
      default: return s.frames;
    }
  },
  counts(s: State) {
    const approved = s.frames.filter((f) => f.approved).length;
    return { needsReview: s.frames.length - approved, approved, all: s.frames.length, needsNumber: s.frames.filter((f) => f.needsNumber).length };
  },
  selected(s: State): Frame | null {
    const list = derive.visibleFrames(s);
    if (!s.selectedID) return list[0] ?? null;
    return list.find((f) => f.id === s.selectedID) ?? list[0] ?? null;
  },
  estimatedCost: (s: State) => VisionModel.cost(VisionModel.byID(s.settings.model), s.tokensIn, s.tokensOut, s.tokensCacheWrite, s.tokensCacheRead),
  pendingCount: (s: State) => s.frames.filter((f) => f.state === "pending").length,
  failedCount: (s: State) => s.frames.filter((f) => f.state === "failed").length,
  anyDone: (s: State) => s.frames.some((f) => f.state === "done"),
  readyToRun: (s: State) => !!s.folder && !!s.apiKey && !s.isRunning && s.frames.length > 0,

  /**
   * Colours that cost a player their name — counted from what the captions lost, not from what
   * the model saw, so re-composing after a fix clears the warning.
   */
  kitColourWarning(s: State): { colour: string; count: number }[] {
    if (s.rosterMode === "noTeams") return [];
    const roster = derive.roster(s);
    const counts = new Map<string, number>();
    let readable = 0;
    for (const f of s.frames) {
      if (!f.record) continue;
      const corrected = CaptionRecord.correctedVision(f.record);
      for (const p of corrected.players) {
        if (!p.jerseyNumber) continue;
        readable++;
        if (!f.record.caption.includes(UNIDENTIFIED_TOKEN)) continue;
        const colour = p.jerseyColor.trim();
        if (!colour || TeamColorArbiter.team(roster, colour)) continue;
        counts.set(colour.toLowerCase(), (counts.get(colour.toLowerCase()) ?? 0) + 1);
      }
    }
    const unmatched = [...counts.entries()].map(([colour, count]) => ({ colour, count })).sort((a, b) => b.count - a.count);
    const lost = unmatched.reduce((n, u) => n + u.count, 0);
    return KitColourDiagnosis.isMisconfigured(lost, readable) ? unmatched : [];
  },
};

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** What went wrong, in words a person can act on. */
function describeFailure(e: unknown): string {
  if (e instanceof ClientError && e.status === 401) return "Anthropic rejected the API key (HTTP 401). It may have been revoked or rotated — check it in Settings.";
  if (e instanceof ClientError && e.status === 429) return "Anthropic is rate-limiting this key right now. Wait a moment and try again.";
  return String((e as Error)?.message ?? e);
}

/**
 * A saved player into the matcher's shape. The side is what the import recorded, else what the
 * position implies — so a roster saved before positions carried sides still resolves duplicates.
 */
function toRosterPlayer(p: ImportedPlayer, teamID: string, sport: string): RosterPlayer {
  const asSide = (v: string | null | undefined): PlayerSide | null => (v === "offense" || v === "defense" || v === "specialTeams" ? v : null);
  const side = asSide(p.side) ?? Positions.side(p.position, sport);
  const secondaryPosition = p.secondaryPosition?.trim();
  const secondary = secondaryPosition ? { position: secondaryPosition, side: asSide(p.secondarySide) ?? Positions.side(secondaryPosition, sport) } : null;
  return RosterPlayer.make({ teamID, jerseyNumber: p.jerseyNumber, firstName: p.firstName, lastName: p.lastName, position: p.position, side, secondary });
}

let runGeneration = 0;
let runController: AbortController | null = null;

export const useStore = create<State>()((set, get) => {
  const patchFrame = (id: string, patch: Partial<Frame>) =>
    set((s) => ({ frames: s.frames.map((f) => (f.id === id ? { ...f, ...patch } : f)) }));
  const frame = (id: string) => get().frames.find((f) => f.id === id) ?? null;

  const records = async (create: boolean): Promise<PhotoFolder | null> => {
    const folder = get().folder;
    if (!folder) return null;
    if (!folder.writable && !create) return folder.sub(CaptionRecord.directoryName, false);
    if (!folder.writable) return null;
    return folder.sub(CaptionRecord.directoryName, true);
  };

  const saveRecord = async (f: Frame, rec: CaptionRecord) => {
    const dir = await records(true);
    if (!dir) return;
    try { await dir.writeText(CaptionRecord.recordName(f.name), JSON.stringify(CaptionRecord.toJSON(rec), null, 2)); } catch { /* read-only */ }
  };

  const template = async (): Promise<IPTCTemplate | null> => {
    const name = get().settings.templateName;
    if (!name) return null;
    const text = await Storage.template(name);
    if (!text) return null;
    try { return new IPTCTemplate(text); } catch { return null; }
  };

  /** Push a frame's current caption out to its sidecar and into the JPEG. */
  const writeMetadata = async (f: Frame): Promise<void> => {
    const s = get();
    if (!s.folder || (!s.settings.embedInFile && !s.settings.writeSidecars)) return;
    if (!s.folder.writable) { patchFrame(f.id, { writeError: "This browser cannot write into the photographs." }); return; }
    try {
      const exif = f.exif ?? (await readPhotoMetadata(await f.photo.file()));
      const packet = MetadataOutput.packet(f.caption, f.altText, f.name, exif, { template: await template(), city: s.city, state: s.state, fields: derive.deskFields(s), photographer: s.settings.photographer, house: s.settings.house }, f.edited ? "manual" : "ai");
      if (s.settings.writeSidecars || !SupportedFormats.canEmbed(f.name)) {
        await s.folder.writeText(MetadataOutput.plan(f.name, packet, null).kind === "sidecar" ? f.name.replace(/\.[^.]+$/, "") + ".xmp" : f.name.replace(/\.[^.]+$/, "") + ".xmp", packet);
      }
      if (s.settings.embedInFile && SupportedFormats.canEmbed(f.name)) {
        const original = await s.folder.readBytes(f.name);
        if (!original) throw new Error("could not read the file");
        const plan = MetadataOutput.plan(f.name, packet, original);
        if (plan.kind === "embed") await s.folder.writeBytes(f.name, plan.bytes);
      }
      patchFrame(f.id, { writeError: null, exif });
    } catch (e) {
      patchFrame(f.id, { writeError: (e as Error).message });
    }
  };

  const composeFor = (s: State, rec: CaptionRecord, exif: PhotoMetadata | null) => {
    const roster = derive.roster(s);
    const cc = CompositionContext.make({
      style: s.settings.style as CaptionStyle,
      fallback: derive.rosterless(s) ? "describeWithoutName" : "markUnidentified",
      sport: asSport(s.selection.sportID),
      roster,
      iptc: { dateText: rec.capturedAt, venue: s.venue || null, city: s.city || null, state: s.state || null, leagueLevel: captionQualifier(s.selection.level) },
      photographer: s.settings.photographer || null,
      house: s.settings.house || null,
      weekday: exif ? PhotoMetadata.weekdayName(exif) : null,
      event: derive.event(s),
      captureDate: exif?.captureDate ?? null,
    });
    return CaptionComposer.compose(CaptionRecord.correctedVision(rec), cc);
  };

  /**
   * Rebuild one caption from its stored observation. Returns "changed", "same", or "kept" — kept
   * meaning a caption someone typed by hand, which a bulk rebuild must not overwrite. Nothing is
   * written to disk when the words did not change.
   */
  const recomposeFrame = async (id: string, opts: { force?: boolean } = {}): Promise<"changed" | "same" | "kept"> => {
    const f = frame(id);
    if (!f || !f.record) return "same";
    if (f.edited && !opts.force) return "kept";
    // A frame reopened from its record has no EXIF yet, and the weekday in the caption comes from
    // it. Read it once here rather than composing a caption that is missing a word.
    let exif = f.exif;
    if (!exif) { try { exif = await readPhotoMetadata(await f.photo.file()); patchFrame(id, { exif }); } catch { exif = null; } }
    const out = composeFor(get(), f.record, exif);
    if (out.caption === f.caption && !f.edited) { patchFrame(id, { needsNumber: CaptionRecord.needsReview(f.record) }); return "same"; }
    const rec = { ...f.record, caption: out.caption };
    patchFrame(id, { record: rec, caption: out.caption, needsNumber: CaptionRecord.needsReview(rec), edited: false });
    await saveRecord(f, rec);
    await writeMetadata({ ...f, exif, record: rec, caption: out.caption, edited: false });
    return "changed";
  };

  const scanFolder = async () => {
    const folder = get().folder;
    if (!folder) return;
    const photos = await folder.listPhotos();
    const dir = await records(false);
    const manifestText = await folder.readText(ProcessedFilesManifest.fileName);
    const manifest = manifestText ? ProcessedFilesManifest.parse(manifestText) : [];
    const frames: Frame[] = [];
    for (const p of photos) {
      const f: Frame = { id: p.name, name: p.name, photo: p, state: "pending", error: null, caption: "", altText: null, record: null, exif: null, needsNumber: false, approved: false, edited: false, writeError: null };
      const text = dir ? await dir.readText(CaptionRecord.recordName(p.name)) : null;
      if (text) {
        try {
          const rec = CaptionRecord.fromJSON(JSON.parse(text));
          f.record = rec; f.caption = rec.caption; f.altText = rec.altText; f.state = "done";
          f.needsNumber = CaptionRecord.needsReview(rec); f.approved = rec.approved;
        } catch { /* a bad record is an uncaptioned frame */ }
      } else {
        const sig = ProcessedFilesManifest.signature(p);
        if (ProcessedFilesManifest.isProcessed(manifest, sig.filename, sig.fileSize, sig.modificationDate)) { f.state = "done"; f.caption = "(captioned previously)"; }
      }
      frames.push(f);
    }
    thumbnails.clear(); previews.clear();
    // A dozen frames is enough to find the day, and the card is often not in capture order.
    const dates: Date[] = [];
    for (const p of photos.slice(0, 12)) { const m = await readPhotoMetadata(await p.file()); if (m.captureDate) dates.push(m.captureDate); }
    const shootDate = dates.length ? new Date(Math.min(...dates.map((d) => d.getTime()))) : null;
    set({ frames, photoCount: photos.length, shootDate, selectedID: frames[0]?.id ?? null, renameOffered: false, renamePrompted: false, statusLine: `${frames.length} photos — ${frames.filter((f) => f.state === "pending").length} to do` });
  };

  const adoptTeam = (side: Side, team: SavedTeam) => {
    const s = get();
    const other = side === "home" ? s.away.colour : s.home.colour;
    const proposed = TeamIdentity.suggestedKitColour(team.identity);
    const patch: Partial<SideState> = { team, name: SavedTeam.fullName(team) || s[side].name };
    // The kit colour is only proposed, and only into a colour nobody has set for this fixture:
    // published school colours are brand colours, and a team in its road whites still publishes
    // green as colour one. A colour the photographer typed is what the team wore.
    if (proposed && !s[side].colourSet && !TeamColorArbiter.sameFamily(proposed, other)) patch.colour = proposed;
    const page = team.identity.rosterURL ?? team.identity.sourceURL;
    if (team.source === "web" && page) patch.rosterURL = page;
    set({ [side]: { ...s[side], ...patch } } as Partial<State>);
    // Venue details come from the home side only; an away school's city is not the venue.
    if (side === "home") {
      const p: Partial<State> = {};
      if (team.identity.city) p.city = team.identity.city;
      if (team.identity.state) p.state = team.identity.state;
      set(p);
    }
  };

  const persistTeam = async (team: SavedTeam): Promise<SavedTeam> => {
    const lib = TeamLibrary.upsert(get().library, team);
    await Storage.saveTeams(lib);
    set({ library: TeamLibrary.sorted(lib) });
    return lib.find((t) => SavedTeam.identityKey(t) === SavedTeam.identityKey(team)) ?? team;
  };

  const loadLogos = async (teams: SavedTeam[]) => {
    const urls: Record<string, string> = { ...get().logoURLs };
    for (const t of teams) {
      if (!t.logoKey || urls[t.id]) continue;
      const blob = await Storage.logo(t.logoKey);
      if (blob) urls[t.id] = URL.createObjectURL(blob);
    }
    set({ logoURLs: urls });
  };

  const setImport = (side: Side, patch: Partial<ImportState>) =>
    set((st) => ({ imports: { ...st.imports, [side]: { ...st.imports[side], ...patch } } }));

  /**
   * Once every caption is approved the shoot is ready to be named. The sheet is opened for the
   * photographer once per folder, with the plan on screen; nothing is renamed unless they say so.
   */
  const offerRename = async () => {
    const s = get();
    if (s.renameOffered || s.panel || !s.folder?.writable || s.rosterMode === "noTeams" || !s.frames.length) return;
    if (s.frames.some((f) => !f.approved)) return;
    set({ renameOffered: true });
    const plan = await get().renamePlan(s.shootDate ?? new Date(), true);
    if (!plan || !PhotoRenamer.isRunnable(plan)) return;
    if (get().screen === "review") set({ panel: "rename", renamePrompted: true });
  };

  const remember = async () => {
    const s = get();
    const game = RecentGame.make({
      level: s.selection.level, sport: s.selection.sportID, gender: s.selection.gender, rosterMode: s.rosterMode,
      eventName: s.eventName, participantNoun: s.participantNoun,
      homeName: s.home.name, homeColor: s.home.colour, homeRosterURL: s.home.rosterURL,
      awayName: s.away.name, awayColor: s.away.colour, awayRosterURL: s.away.rosterURL,
      venue: s.venue, city: s.city, state: s.state, notes: s.notes,
      homeTeamID: s.home.team?.id, awayTeamID: s.away.team?.id,
      templateName: s.settings.templateName ?? undefined, photosFolder: s.folder?.name,
    });
    const list = RecentGame.remember(s.recents, game);
    set({ recents: list });
    await Storage.saveRecents(list);
    if (s.folder?.handle) await Storage.saveFolderHandle(game.id, s.folder.handle);
  };

  return {
    ready: false, screen: "start", panel: null, writableFolders: typeof window !== "undefined" && "showDirectoryPicker" in window, relay: null,
    settings: DEFAULT_SETTINGS, apiKey: "", library: [], logoURLs: {}, recents: [], templateNames: [],
    selection: GameSelection.make(), rosterMode: "rosters",
    home: { name: "", colour: "white", rosterURL: "", team: null, colourSet: false },
    away: { name: "", colour: "navy", rosterURL: "", team: null, colourSet: false },
    eventName: "", participantNoun: "", venue: "", city: "", state: "", notes: "",
    folder: null, photoCount: 0, shootDate: null,
    imports: { home: NO_IMPORT, away: NO_IMPORT }, renameOffered: false, renamePrompted: false,
    frames: [], isRunning: false, progressDone: 0, progressTotal: 0, statusLine: "", notice: null, tokensIn: 0, tokensOut: 0, tokensCacheWrite: 0, tokensCacheRead: 0,
    selectedID: null, filter: "all", bulkLabel: "",

    async init() {
      const [settings, apiKey, library, recents, templateNames] = await Promise.all([Storage.settings(), Storage.apiKey(), Storage.teams(), Storage.recents(), Storage.templateNames()]);
      set({ settings, apiKey, library: TeamLibrary.sorted(library), recents, templateNames, ready: true, screen: needsOnboarding(settings, apiKey) ? "welcome" : "start" });
      const sel = GameSelection.make();
      set({ selection: sel, home: { ...get().home, rosterURL: GameSelection.suggestedHomeURL(sel) ?? "" } });
      await loadLogos(library);
      relayAvailable().then((relay) => set({ relay }));
    },
    setScreen: (screen) => set({ screen }),
    setPanel: (panel) => set({ panel, ...(panel === null ? { renamePrompted: false } : {}) }),
    notify: (text, kind = "error") => set({ notice: { text, kind } }),
    clearNotice: () => set({ notice: null }),

    setSetting(patch) {
      const settings = { ...get().settings, ...patch };
      set({ settings });
      void Storage.saveSettings(settings);
    },
    async setApiKey(key) { set({ apiKey: key.trim() }); await Storage.saveApiKey(key.trim()); },
    verifyKey: (key) => AnthropicClient.verifyKey(key.trim()),
    finishOnboarding() { get().setSetting({ onboarded: true }); set({ screen: "start" }); },
    reopenSetup() { set({ panel: null, screen: "welcome" }); },
    async addTemplate(name, text) {
      try { new IPTCTemplate(text); } catch { get().notify("That file is not an XMP template."); return; }
      await Storage.saveTemplate(name, text);
      set({ templateNames: await Storage.templateNames() });
      get().setSetting({ templateName: name });
    },
    async removeTemplate(name) {
      await Storage.deleteTemplate(name);
      set({ templateNames: await Storage.templateNames() });
      if (get().settings.templateName === name) get().setSetting({ templateName: null });
    },

    async chooseFolder(fresh) {
      let folder: PhotoFolder | null = null;
      try { folder = await pickFolder(); } catch (e) { get().notify(`Could not open that folder: ${(e as Error).message}`); return; }
      if (folder) await get().useFolder(folder, fresh);
    },
    async useFolder(folder, fresh) {
      if (fresh) get().startOver();
      set({ folder, screen: "game" });
      try { await scanFolder(); } catch (e) { set({ folder: null, frames: [], photoCount: 0 }); get().notify(`Could not read that folder: ${(e as Error).message}`); }
    },
    async useFiles(files, fresh) {
      if (!files.length) return;
      await get().useFolder(new FileListFolder(files), fresh);
    },
    async openRecent(game) {
      const lib = get().library;
      const sel = GameSelection.make(game.level, game.sport, game.gender);
      set({
        selection: sel, rosterMode: game.rosterMode, eventName: game.eventName, participantNoun: game.participantNoun,
        home: { name: game.homeName, colour: game.homeColor, rosterURL: game.homeRosterURL, team: lib.find((t) => t.id === game.homeTeamID) ?? null, colourSet: true },
        away: { name: game.awayName, colour: game.awayColor, rosterURL: game.awayRosterURL, team: lib.find((t) => t.id === game.awayTeamID) ?? null, colourSet: true },
        venue: game.venue, city: game.city, state: game.state, notes: game.notes, imports: { home: NO_IMPORT, away: NO_IMPORT },
      });
      for (const side of ["home", "away"] as Side[]) {
        const id = side === "home" ? game.homeTeamID : game.awayTeamID;
        if (id && !get()[side].team) setImport(side, { error: "This team is no longer in the library — read it again." });
      }
      const handle = await Storage.folderHandle(game.id);
      if (handle) {
        try {
          const folder = await reopenFolder(handle);
          if (folder) { set({ folder, screen: "game" }); await scanFolder(); return; }
        } catch { /* fall through */ }
      }
      set({ folder: null, frames: [], photoCount: 0, shootDate: null, screen: "game" });
      get().notify("Choose the folder of photographs again — the browser could not reopen it on its own.", "info");
    },
    async forgetRecent(game) {
      const recents = get().recents.filter((g) => g.id !== game.id);
      set({ recents });
      await Storage.saveRecents(recents);
      await Storage.deleteFolderHandle(game.id);
    },
    /** A new card is a new fixture. What stays is what is not about this fixture. */
    startOver() {
      set({ home: { name: "", colour: "white", rosterURL: GameSelection.suggestedHomeURL(get().selection) ?? "", team: null, colourSet: false },
            away: { name: "", colour: "navy", rosterURL: "", team: null, colourSet: false },
            eventName: "", participantNoun: "", venue: "", city: "", state: "", notes: "",
            folder: null, frames: [], photoCount: 0, shootDate: null, imports: { home: NO_IMPORT, away: NO_IMPORT }, renameOffered: false, renamePrompted: false,
            statusLine: "", tokensIn: 0, tokensOut: 0, tokensCacheWrite: 0, tokensCacheRead: 0, selectedID: null, filter: "all", screen: "start" });
      thumbnails.clear(); previews.clear();
    },
    setLevel(level) {
      const sel = GameSelection.setLevel(get().selection, level);
      set({ selection: sel });
      refreshSuggestedURL(sel);
    },
    setSport(id) { const sel = GameSelection.setSport(get().selection, id); set({ selection: sel }); refreshSuggestedURL(sel); },
    setGender(g) { const sel = GameSelection.setGender(get().selection, g); set({ selection: sel }); refreshSuggestedURL(sel); },
    setRosterMode: (rosterMode) => set({ rosterMode }),
    setSide: (side, patch) => set({ [side]: { ...get()[side], ...patch, ...("colour" in patch ? { colourSet: true } : {}) } } as Partial<State>),
    setFields: (patch) => set(patch),

    async importTeam(side) {
      const s = get();
      if (s.imports[side].busy) return;
      if (!s.apiKey) { setImport(side, { error: "Add your Anthropic API key in Settings before importing a team." }); return; }
      const pasted = s[side].rosterURL.trim();
      if (!pasted) { setImport(side, { error: "Paste a link to the team's page first." }); return; }
      const parsed = TeamPageURL.parse(pasted);
      if (!parsed) { setImport(side, { error: "That does not look like a web address." }); return; }
      const candidates = TeamPageURL.rosterCandidates(parsed, s.selection.sportID, s.selection.gender);
      if (!candidates.length) { setImport(side, { error: `Could not work out the roster page for ${s.selection.sportID} from that link.` }); return; }
      setImport(side, { busy: true, error: null, warnings: [], status: "Resolving…" });

      let chosen: { url: string; html: string; identity: TeamIdentity | null } | null = null;
      let lastFailure: Error | null = null;
      for (const url of candidates) {
        setImport(side, { status: `Trying ${new URL(url).pathname}…` });
        try {
          const page = await fetchPage(url);
          const identity = TeamPageParser.parse(page.text, page.url);
          if (identity) {
            setImport(side, { status: `Found ${TeamIdentity.fullName(identity)} — reading the roster…` });
            const wanted = s.selection.gender === "womens" ? ["girls", "women", "women's"] : ["boys", "men", "men's"];
            const reported = identity.reportedGender?.toLowerCase();
            if (!reported || wanted.includes(reported)) { chosen = { url: page.url, html: page.text, identity }; break; }
          }
          if (!chosen) chosen = { url: page.url, html: page.text, identity };
        } catch (e) { lastFailure = e as Error; }
      }
      if (!chosen) {
        setImport(side, { busy: false, status: "", error: lastFailure ? `Could not load that page: ${lastFailure.message}` : "No roster page responded." });
        return;
      }
      await get().importTeamFromHTML(side, chosen.html, chosen.url);
    },

    async importTeamFromHTML(side, html, sourceURL) {
      const s = get();
      if (!s.apiKey) { setImport(side, { error: "Add your Anthropic API key in Settings before importing a team." }); return; }
      setImport(side, { busy: true, error: null, warnings: [], status: "Reading the page…" });
      try {
        const identity = (sourceURL ? TeamPageParser.parse(html, sourceURL) : null) ?? TeamIdentity.make({ schoolName: s[side].name, sourceURL: sourceURL ?? null });
        identity.rosterURL = sourceURL ?? identity.rosterURL ?? null;
        const warnings: string[] = [];
        if (!identity.schoolName) warnings.push("Could not read the team's name from that page — type it in.");
        if (!identity.colorHexes.length) warnings.push("That site does not publish team colours — set them by hand.");

        // The logo is fetched while the roster is read, not after it.
        const logoFetch = identity.logoURL ? fetchLogo(identity.logoURL).catch(() => null) : Promise.resolve(null);
        // Extraction is a text job on a few thousand tokens, so it runs on the cheap model
        // whatever the vision pass is set to. A MaxPreps page never reaches the model at all.
        const client = new AnthropicClient({ apiKey: s.apiKey, model: "claude-haiku-4-5-20251001", maxTokens: 8000 });
        const { players, source, usage } = await RosterImporter.importRoster(html, client, () => setImport(side, { status: "Nothing in the page text — reading its data…" }), s.selection.sportID);
        const reader = VisionModel.byID(client.model);
        const spent = VisionModel.cost(reader, usage.inputTokens, usage.outputTokens);
        const how = source === "structured" ? "read from the page's own data · no model, no cost"
          : `${reader.name} read ${source === "scriptPayload" ? "the page's data" : "the page"} · ${(usage.inputTokens + usage.outputTokens).toLocaleString()} tokens · ${spent < 0.005 ? "under a cent" : "$" + spent.toFixed(2)}`;

        let team = SavedTeam.make({ identity, level: s.selection.level, sport: s.selection.sportID, gender: s.selection.gender, players });
        if (SavedTeam.genderMismatch(team) && identity.reportedGender) warnings.push(`That page is the ${identity.reportedGender.toLowerCase()} team — check this is the squad you meant.`);
        if (identity.logoURL) {
          const logo = await logoFetch;
          if (logo) { const key = `${team.id}.${logo.extension}`; await Storage.saveLogo(key, logo.blob); team = { ...team, logoKey: key }; }
          else warnings.push("The team's logo could not be saved.");
        }
        const stored = await persistTeam(team);
        await loadLogos([stored]);
        adoptTeam(side, stored);
        const twoWay = stored.players.filter((p) => p.secondaryPosition).length;
        setImport(side, { busy: false, warnings, status: `${SavedTeam.fullName(stored)} — ${stored.players.length} players${twoWay ? `, ${twoWay} two-way` : ""} · ${how}` });
      } catch (e) {
        setImport(side, { busy: false, status: "", warnings: [], error: e instanceof ImportError ? e.message : describeFailure(e) });
      }
    },

    async importCSV(side, csv, teamName) {
      const s = get();
      try {
        const { players } = CSVRosterImporter.import(csv);
        const name = (teamName ?? s[side].name).trim() || "Team";
        const { school, nickname } = TeamName.split(name);
        const identity = TeamIdentity.make({ schoolName: school, mascot: nickname });
        const team = SavedTeam.make({ identity, level: s.selection.level, sport: s.selection.sportID, gender: s.selection.gender, source: "manual",
          players: players.filter((p) => p.role === "player").map((p) => ({ jerseyNumber: p.jerseyNumber, firstName: p.firstName, lastName: p.lastName, position: p.position })) });
        const stored = await persistTeam(team);
        adoptTeam(side, stored);
        setImport(side, { error: null, warnings: [], status: `${SavedTeam.fullName(stored)} — ${stored.players.length} players` });
      } catch (e) { setImport(side, { error: (e as Error).message }); }
    },

    pickLibraryTeam(side, team) { adoptTeam(side, team); setImport(side, { error: null, warnings: [], status: `${SavedTeam.fullName(team)} — ${team.players.length} players` }); },
    clearTeam(side) { set({ [side]: { ...get()[side], team: null } } as Partial<State>); },
    async forgetTeam(team) {
      const library = TeamLibrary.remove(get().library, team.id);
      await Storage.saveTeams(library);
      if (team.logoKey) await Storage.deleteLogo(team.logoKey);
      const s = get();
      set({ library, home: s.home.team?.id === team.id ? { ...s.home, team: null } : s.home, away: s.away.team?.id === team.id ? { ...s.away, team: null } : s.away });
    },

    async continueToReview() {
      if (!derive.canContinue(get())) return;
      await remember();
      // A kit colour, a venue or a name changed on the way back reaches every caption here, with
      // no request — and nothing is written when nothing changed.
      if (get().frames.some((f) => f.record)) await get().recomposeAll();
      set({ screen: "review" });
    },

    async run(opts = {}) {
      const s = get();
      if (!s.folder) return;
      if (!s.apiKey) { get().notify("Add your Anthropic API key in Settings first."); return; }
      let todo = s.frames.filter((f) => opts.redo || f.state === "pending" || (opts.failed && f.state === "failed"));
      if (opts.limit) todo = todo.slice(0, opts.limit);
      if (!todo.length) { set({ statusLine: "Nothing to do." }); return; }

      runGeneration += 1;
      const generation = runGeneration;
      runController = new AbortController();
      const signal = runController.signal;
      set({ isRunning: true, notice: null, progressDone: 0, progressTotal: todo.length, tokensIn: 0, tokensOut: 0, tokensCacheWrite: 0, tokensCacheRead: 0 });
      for (const f of todo) patchFrame(f.id, { state: "working", error: null });

      const roster = derive.roster(s);
      const event = derive.event(s);
      const sportLabel = s.rosterMode === "noTeams" ? s.eventName.trim() : derive.sportLabel(s);
      const context = VisionPrompt.context({ sportLabel, roster, event, notes: s.notes });
      const client = new AnthropicClient({ apiKey: s.apiKey, model: s.settings.model, signal, onRetry: (attempt, wait, why) => set({ statusLine: `Waiting ${Math.round(wait)}s after ${why} (attempt ${attempt})…` }) });
      const altClient = new AnthropicClient({ apiKey: s.apiKey, model: "claude-haiku-4-5-20251001", maxTokens: AltTextRequest.maxTokens, signal });
      const manifestDir = s.folder;
      let manifest: ProcessedFileRecord[] = ProcessedFilesManifest.parse((await manifestDir.readText(ProcessedFilesManifest.fileName)) ?? "");

      const work = async (f: Frame): Promise<void> => {
        if (generation !== runGeneration) return;
        try {
          const file = await f.photo.file();
          const exif = await readPhotoMetadata(file);
          const jpeg = await preparedForVision(file, s.settings.longEdge);
          const reply = await client.analyse(jpeg, VisionPrompt.system, context);
          if (generation !== runGeneration) return;
          const vision = VisionResult.fromJSON(CaptionResponseParser.decodeJSON(reply.text));
          let rec = CaptionRecord.make({ filename: f.name, imagePath: f.name, vision, caption: "", capturedAt: PhotoMetadata.apStyleDate(exif) });
          const out = composeFor(get(), rec, exif);
          let alt: string | null = null, altIn = 0, altOut = 0;
          switch (s.settings.altTextMode) {
            case "off": break;
            case "simple": alt = SimpleAltText.build(vision, sportLabel, s.venue); break;
            case "brief": case "detailed": {
              const edge = s.settings.altTextMode === "brief" ? ImagePrep.briefLongEdge : ImagePrep.standardLongEdge;
              const small = await preparedForVision(file, edge);
              const r = await altClient.describe(small, AltTextRequest.systemInstruction, AltTextRequest.userContent(out.caption, sportLabel), AltTextRequest.maxTokens);
              alt = AltTextRequest.sanitise(r.text); altIn = r.usage.inputTokens; altOut = r.usage.outputTokens;
            }
          }
          rec = { ...rec, caption: out.caption, altText: alt };
          if (generation !== runGeneration) return;
          patchFrame(f.id, { record: rec, caption: out.caption, altText: alt, exif, state: "done", approved: false, edited: false, needsNumber: CaptionRecord.needsReview(rec) });
          set((st) => ({ tokensIn: st.tokensIn + reply.usage.inputTokens + altIn, tokensOut: st.tokensOut + reply.usage.outputTokens + altOut,
            tokensCacheWrite: st.tokensCacheWrite + (reply.usage.cacheCreationInputTokens ?? 0), tokensCacheRead: st.tokensCacheRead + (reply.usage.cacheReadInputTokens ?? 0) }));
          await saveRecord(f, rec);
          await writeMetadata({ ...f, record: rec, caption: out.caption, altText: alt, exif, edited: false });
          const sig = ProcessedFilesManifest.signature(file);
          manifest = ProcessedFilesManifest.markProcessed(manifest, sig.filename, sig.fileSize, sig.modificationDate);
        } catch (e) {
          if (generation !== runGeneration) return;
          patchFrame(f.id, { state: "failed", error: (e as Error).message ?? String(e) });
        } finally {
          if (generation === runGeneration) set((st) => ({ progressDone: st.progressDone + 1, statusLine: `${st.progressDone + 1} of ${st.progressTotal}…` }));
        }
      };

      // Run the first alone so it writes the prompt cache, then fan out — otherwise several
      // requests race to write the same prefix instead of reading it.
      await work(todo[0]);
      // A key Anthropic rejects will reject every frame: stop here, and say so once.
      const first = frame(todo[0].id);
      if (generation === runGeneration && first?.state === "failed" && /\b401\b/.test(first.error ?? "")) {
        set((st) => ({ isRunning: false, statusLine: "Stopped — the API key was rejected.", frames: st.frames.map((f) => (f.state === "working" ? { ...f, state: "pending" as FrameState } : f)) }));
        get().notify(describeFailure(new ClientError("http", first.error ?? "", 401)));
        return;
      }
      const rest = todo.slice(1);
      let next = 0;
      const worker = async () => { while (next < rest.length && generation === runGeneration) { const f = rest[next++]; await work(f); } };
      await Promise.all(Array.from({ length: Math.min(s.settings.concurrency, rest.length) }, worker));

      if (generation !== runGeneration) return;
      if (manifestDir.writable) { try { await manifestDir.writeText(ProcessedFilesManifest.fileName, ProcessedFilesManifest.serialise(manifest)); } catch { /* ignore */ } }
      const st = get();
      const failed = st.frames.filter((f) => f.state === "failed").length;
      const needs = st.frames.filter((f) => f.needsNumber).length;
      set({ isRunning: false, statusLine: `Done — ${st.progressTotal - failed} captioned${failed ? `, ${failed} failed` : ""}${needs ? `, ${needs} need a number` : ""}` });
    },

    cancel() {
      runGeneration += 1;
      runController?.abort();
      set((s) => ({ isRunning: false, progressDone: 0, progressTotal: 0, statusLine: "Stopped.", frames: s.frames.map((f) => (f.state === "working" ? { ...f, state: "pending" as FrameState } : f)) }));
    },

    select: (id) => set({ selectedID: id }),
    step(delta) {
      const s = get();
      const list = derive.visibleFrames(s);
      if (!list.length) return;
      const current = Math.max(0, list.findIndex((f) => f.id === derive.selected(s)?.id));
      set({ selectedID: list[Math.min(Math.max(current + delta, 0), list.length - 1)].id });
    },
    nextNeedingNumber() {
      const s = get();
      const list = derive.visibleFrames(s);
      if (!list.length) return;
      const start = list.findIndex((f) => f.id === derive.selected(s)?.id) + 1;
      const order = [...list.slice(start), ...list.slice(0, start)];
      const hit = order.find((f) => f.needsNumber);
      if (hit) set({ selectedID: hit.id });
    },
    setFilter: (filter) => set({ filter }),

    async assignNumber(id, slot, number) {
      const f = frame(id);
      if (!f?.record || slot >= f.record.vision.players.length) return;
      const manual = { ...f.record.manualJerseyNumbers };
      const trimmed = number.trim();
      if (trimmed) manual[slot] = trimmed; else delete manual[slot];
      patchFrame(id, { record: { ...f.record, manualJerseyNumbers: manual } });
      await recomposeFrame(id, { force: true });
    },

    async updateCaption(id, text) {
      const f = frame(id);
      const trimmed = text.trim();
      if (!f || trimmed === f.caption) return;
      const rec = f.record ? { ...f.record, caption: trimmed } : null;
      patchFrame(id, { caption: trimmed, edited: true, writeError: null, record: rec });
      if (rec) await saveRecord(f, rec);
      await writeMetadata({ ...f, caption: trimmed, edited: true, record: rec });
    },

    async recompose(id) { await recomposeFrame(id, { force: true }); },
    async recomposeAll() {
      const targets = get().frames.filter((f) => f.record);
      if (!targets.length) return;
      let changed = 0, kept = 0;
      for (const f of targets) {
        const r = await recomposeFrame(f.id);
        if (r === "changed") changed++;
        if (r === "kept") kept++;
      }
      set({ bulkLabel: `Re-composed ${targets.length}; ${changed} changed${kept ? `; ${kept} edited by hand left alone` : ""}.` });
    },

    async setApproved(id, approved) {
      const f = frame(id);
      if (!f) return;
      patchFrame(id, { approved });
      if (f.record) { const rec = { ...f.record, approved }; patchFrame(id, { record: rec }); await saveRecord(f, rec); }
    },
    async approveAndAdvance() {
      const s = get();
      const row = derive.selected(s);
      if (!row) return;
      const list = derive.visibleFrames(s);
      const position = list.findIndex((f) => f.id === row.id);
      await get().setApproved(row.id, true);
      const after = derive.visibleFrames(get());
      if (after.some((f) => f.id === row.id)) get().step(1);
      else if (!after.length) set({ selectedID: null });
      else set({ selectedID: after[Math.min(Math.max(position, 0), after.length - 1)].id });
      void offerRename();
    },

    /** Caption one frame again, with something the photographer knows that the model missed. */
    async recaption(id, note) {
      const s = get();
      const f = frame(id);
      if (!f || !s.apiKey) { if (!s.apiKey) get().notify("Add your Anthropic API key in Settings first."); return; }
      patchFrame(id, { state: "working" });
      set({ statusLine: `Captioning ${f.name} again…` });
      try {
        const roster = derive.roster(s);
        const sportLabel = s.rosterMode === "noTeams" ? s.eventName.trim() : derive.sportLabel(s);
        const context = VisionPrompt.context({ sportLabel, roster, event: derive.event(s), notes: s.notes, note });
        const client = new AnthropicClient({ apiKey: s.apiKey, model: s.settings.model });
        const file = await f.photo.file();
        const exif = await readPhotoMetadata(file);
        const jpeg = await preparedForVision(file, s.settings.longEdge);
        const reply = await client.analyse(jpeg, VisionPrompt.system, context);
        const vision = VisionResult.fromJSON(CaptionResponseParser.decodeJSON(reply.text));
        const rec: CaptionRecord = { ...(f.record ?? CaptionRecord.make({ filename: f.name, vision, caption: "", capturedAt: PhotoMetadata.apStyleDate(exif) })), vision, manualJerseyNumbers: {} };
        patchFrame(id, { record: rec, exif, state: "done", edited: false });
        set((st) => ({ tokensIn: st.tokensIn + reply.usage.inputTokens, tokensOut: st.tokensOut + reply.usage.outputTokens,
          tokensCacheWrite: st.tokensCacheWrite + (reply.usage.cacheCreationInputTokens ?? 0), tokensCacheRead: st.tokensCacheRead + (reply.usage.cacheReadInputTokens ?? 0) }));
        await recomposeFrame(id, { force: true });
        set({ statusLine: `Captioned ${f.name} again.` });
      } catch (e) {
        patchFrame(id, { state: "done" });
        get().notify(`Could not caption ${f.name} again: ${(e as Error).message}`);
      }
    },

    async setKitColour(colour, side) {
      set({ [side]: { ...get()[side], colour } } as Partial<State>);
      await get().recomposeAll();
    },

    renameFixture(date, coveredIsHome) {
      const s = get();
      if (s.rosterMode === "noTeams") return null;
      const code = HDSNaming.sportCode(s.selection.sportID, s.selection.gender);
      if (!code) return null;
      return { initials: HDSNaming.initials(s.settings.photographer), date, sportCode: code,
        covered: coveredIsHome ? s.home.name : s.away.name, opponent: coveredIsHome ? s.away.name : s.home.name, coveredIsHome };
    },
    async renamePlan(date, coveredIsHome) {
      const s = get();
      const fixture = get().renameFixture(date, coveredIsHome);
      if (!fixture || !s.folder) return null;
      // Capture order, not the card's filenames, so the numbering follows the game.
      const withDates = await Promise.all(s.frames.map(async (f) => ({ f, when: f.exif?.captureDate ?? (await readPhotoMetadata(await f.photo.file())).captureDate ?? new Date(0) })));
      withDates.sort((a, b) => a.when.getTime() - b.when.getTime() || a.f.name.localeCompare(b.f.name));
      const dir = await records(false);
      return PhotoRenamer.plan({ photos: withDates.map((w) => w.f.name), fixture, pattern: s.settings.namingPattern,
        existingNames: await s.folder.listNames(), recordNames: dir ? await dir.listNames() : new Set() });
    },
    async applyRename(plan) {
      const s = get();
      if (!s.folder) return;
      try {
        const count = await applyRenamePlan(s.folder, await records(false), plan);
        await scanFolder();
        set({ statusLine: `Renamed ${count} file${count === 1 ? "" : "s"}.`, panel: null });
      } catch (e) { get().notify((e as Error).message); }
    },
  };

  function refreshSuggestedURL(sel: GameSelection) {
    const s = get();
    const suggestions = new Set([...SportCatalogue.divisionI.flatMap((o) => (["mens", "womens"] as Gender[]).map((g) => GameSelection.suggestedHomeURL({ level: "divisionI", sportID: o.sport, gender: g })))].filter(Boolean) as string[]);
    if (s.home.rosterURL === "" || suggestions.has(s.home.rosterURL)) {
      set({ home: { ...s.home, rosterURL: GameSelection.suggestedHomeURL(sel) ?? "" } });
    }
  }
});

export { THUMB_EDGE, PREVIEW_EDGE };
