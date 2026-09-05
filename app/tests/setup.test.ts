// The setup screen's rules, file formats, the retry policy, the manifest, records, alt text,
// and the RAW preview walker — the pure parts of everything that is not the composer or the
// metadata writer.

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { GameSelection, SportCatalogue, RosterSuggestion, RecentGame, genderLabel } from "../src/core/setup/GameLibrary";
import { SupportedFormats } from "../src/core/images/SupportedFormats";
import { RetryPolicy } from "../src/core/anthropic/RetryPolicy";
import { ProcessedFilesManifest, CFTime } from "../src/core/records/ProcessedFilesManifest";
import { CaptionRecord, REVIEW_STATUSES } from "../src/core/records/CaptionRecord";
import { VisionResult, VisionPlayer } from "../src/core/vision/VisionResult";
import { AltTextRequest, SimpleAltText } from "../src/core/anthropic/AltText";
import { RAWPreviewExtractor } from "../src/core/images/RAWPreviewExtractor";
import { VisionPrompt } from "../src/core/vision/VisionPrompt";
import { Roster, Team } from "../src/core/roster/Roster";
import { SCENE_TYPES } from "../src/core/vision/VisionResult";

describe("Level, sport and gender stay legal", () => {
  it("drops a sport the level does not offer, and keeps one both do", () => {
    let sel = GameSelection.make("divisionI", "baseball", "mens");
    expect(sel.sportID).toBe("baseball");
    sel = GameSelection.setLevel(sel, "nebraskaHS");
    expect(sel.sportID).not.toBe("baseball");
    expect(SportCatalogue.options("nebraskaHS").some((o) => o.sport === sel.sportID)).toBe(true);
    const keeps = GameSelection.setLevel(GameSelection.make("divisionI", "volleyball", "womens"), "nebraskaHS");
    expect(keeps.sportID).toBe("volleyball");
    expect(new Set(SportCatalogue.nebraskaHS.map((o) => o.sport))).toEqual(new Set(["football", "basketball", "volleyball"]));
    expect(SportCatalogue.option("volleyball", "nebraskaHS")?.genders).toEqual(["womens"]);
    expect(GameSelection.label(GameSelection.make("nebraskaHS", "volleyball", "womens"))).toBe("Girls Volleyball");
    expect(GameSelection.make("nebraskaHS", "volleyball", "mens").gender).toBe("womens");
    expect(GameSelection.make("nebraskaHS", "baseball", "mens").sportID).not.toBe("baseball");
  });
  it("switches gender to what the sport is played in", () => {
    let g = GameSelection.make("divisionI", "basketball", "mens");
    expect(g.gender).toBe("mens");
    g = GameSelection.setSport(g, "volleyball"); expect(g.gender).toBe("womens");
    g = GameSelection.setSport(g, "football"); expect(g.gender).toBe("mens");
    g = GameSelection.setGender(g, "womens"); expect(g.gender).toBe("mens");
    expect(SportCatalogue.option("football", "divisionI")?.genders).toEqual(["mens"]);
    expect(SportCatalogue.option("soccer", "divisionI")?.genders).toEqual(["womens"]);
  });
  it("labels the event the way people say it", () => {
    expect(GameSelection.label(GameSelection.make("divisionI", "soccer", "womens"))).toBe("Women's Soccer");
    expect(GameSelection.label(GameSelection.make("nebraskaHS", "basketball", "womens"))).toBe("Girls Basketball");
    expect(GameSelection.label(GameSelection.make("nebraskaHS", "football", "mens"))).toBe("Boys Football");
    expect(GameSelection.label(GameSelection.make("divisionI", "trackAndField", "mens"))).toBe("Men's Track & Field");
    expect(genderLabel("womens", "divisionI")).toBe("Women's");
  });
  it("suggests roster URLs only where there is something to suggest", () => {
    expect(RosterSuggestion.huskers("soccer", "womens")).toBe("https://huskers.com/sports/soccer/roster");
    expect(RosterSuggestion.huskers("basketball", "mens")).not.toBe(RosterSuggestion.huskers("basketball", "womens"));
    for (const o of SportCatalogue.divisionI) for (const g of ["mens", "womens"] as const) {
      const u = RosterSuggestion.huskers(o.sport, g);
      if (u) expect(RosterSuggestion.allHuskers.has(u)).toBe(true);
    }
    expect(GameSelection.suggestedHomeURL(GameSelection.make("nebraskaHS", "football", "mens"))).toBeNull();
    expect(GameSelection.suggestedHomeURL(GameSelection.make("divisionI", "soccer", "womens")))
      .not.toBe(GameSelection.suggestedHomeURL(GameSelection.make("divisionI", "football", "mens")));
  });
});

describe("Recent shoots", () => {
  it("titles, labels and identifies a game", () => {
    const g = RecentGame.make({ level: "nebraskaHS", sport: "basketball", gender: "womens", homeName: "Millard South Patriots", homeColor: "blue", awayName: "Lincoln East Spartans", awayColor: "white", city: "Omaha", state: "Neb." });
    expect(RecentGame.sportLabel(g)).toBe("Girls Basketball");
    expect(RecentGame.title(g)).toBe("Millard South Patriots vs Lincoln East Spartans");
    const a = RecentGame.make({ homeName: "Nebraska", awayName: "Iowa", sport: "football" });
    const b = { ...a, id: "other", venue: "Memorial Stadium" };
    expect(RecentGame.identity(a)).toBe(RecentGame.identity(b));
    expect(RecentGame.identity(a)).not.toBe(RecentGame.identity({ ...a, awayName: "Minnesota" }));
  });
  it("keeps an open event free of teams it has no teams for", () => {
    const open = RecentGame.make({ rosterMode: "noTeams", eventName: "the Nebraska State Cyclocross Championships", sport: "soccer", gender: "womens", homeName: "Nebraska Cornhuskers", awayName: "" });
    expect(RecentGame.title(open)).toBe("the Nebraska State Cyclocross Championships");
    expect(RecentGame.title(open)).not.toContain(" vs ");
    expect(RecentGame.title(open)).not.toContain("Cornhuskers");
    expect(RecentGame.sportLabel(open)).toBe("");
    expect(RecentGame.title({ ...open, eventName: "   " })).not.toContain("vs");
    expect(RecentGame.identity(open)).not.toBe(RecentGame.identity({ ...open, eventName: "the Cornhusker State Games" }));
    const team = RecentGame.make({ homeName: "Millard South Patriots", awayName: "Lincoln East Spartans", sport: "football", gender: "mens", level: "nebraskaHS" });
    expect(RecentGame.title(team)).toBe("Millard South Patriots vs Lincoln East Spartans");
    expect(RecentGame.sportLabel(team)).toBe("Boys Football");
    expect(RecentGame.identity(team)).not.toBe(RecentGame.identity(open));
  });
  it("keys the same fixture in two folders as two shoots", () => {
    const sept = RecentGame.make({ homeName: "Nebraska", awayName: "Notre Dame", sport: "soccer", gender: "womens", photosFolder: "2026-09-04 Neb v ND" });
    const oct = { ...sept, photosFolder: "2026-10-11 Neb v ND" };
    expect(RecentGame.identity(sept)).not.toBe(RecentGame.identity(oct));
    expect(RecentGame.identity(sept)).toBe(RecentGame.identity({ ...sept, venue: "Hibner Stadium" }));
    const noFolder = { ...sept, photosFolder: undefined };
    expect(RecentGame.identity(noFolder)).not.toBe("");
    expect(RecentGame.identity(noFolder)).not.toBe(RecentGame.identity(sept));
  });
  it("remembers newest first, deduplicated, capped", () => {
    let list: RecentGame[] = [];
    for (let i = 0; i < RecentGame.limit + 6; i++) {
      list = RecentGame.remember(list, RecentGame.make({ homeName: `Home ${i}`, awayName: `Away ${i}`, lastOpened: new Date(2026, 0, 1, 0, 0, i).toISOString() }));
    }
    expect(list.length).toBe(RecentGame.limit);
    expect(list[0].homeName).toBe(`Home ${RecentGame.limit + 5}`);
    for (let i = 1; i < list.length; i++) expect(list[i - 1].lastOpened >= list[i].lastOpened).toBe(true);
    const again = RecentGame.remember(list, { ...list[0], id: "new", venue: "X" });
    expect(again.length).toBe(RecentGame.limit);
    expect(again.filter((g) => g.homeName === list[0].homeName).length).toBe(1);
  });
});

describe("File formats", () => {
  it("opens what it can open and embeds only into JPEGs", () => {
    for (const n of ["a.jpg", "a.jpeg", "a.png", "a.CR3", "a.nef", "a.ARW", "a.dng", "A.JPG"]) expect(SupportedFormats.isReadable(n)).toBe(true);
    for (const n of ["a.xmp", "a.json", "a.mov"]) expect(SupportedFormats.isReadable(n)).toBe(false);
    expect(SupportedFormats.canEmbed("a.jpg")).toBe(true);
    expect(SupportedFormats.canEmbed("a.cr3")).toBe(false);
    expect(SupportedFormats.canEmbed("a.png")).toBe(false);
    for (const e of SupportedFormats.embeddable) expect(SupportedFormats.readable.has(e)).toBe(true);
    for (const e of SupportedFormats.raw) { expect(SupportedFormats.readable.has(e)).toBe(true); expect(SupportedFormats.embeddable.has(e)).toBe(false); }
    expect(SupportedFormats.summary(["a.jpg", "b.jpg"])).toBe("2 photos");
    expect(SupportedFormats.summary(["a.jpg", "b.cr3", "c.png"])).toBe("3 photos · 2 need a sidecar");
  });
});

describe("Retry policy", () => {
  const p = new RetryPolicy(4, 1, 30, false);
  it("retries what is transient and fails fast on what is not", () => {
    for (const s of [429, 529, 500, 503, 408]) expect(p.decide(s, 1).retry).toBe(true);
    for (const s of [401, 400, 404]) expect(p.decide(s, 1).retry).toBe(false);
    const d = p.decide(413, 1);
    expect(!d.retry && d.reason.includes("detail")).toBe(true);
    expect(p.decide(500, 4).retry).toBe(false);
    expect(p.decide(500, 3).retry).toBe(true);
    expect(p.delay(1)).toBe(1); expect(p.delay(2)).toBe(2); expect(p.delay(3)).toBe(4);
    expect(p.delay(12)).toBe(30);
    const ra = p.decide(429, 1, 17);
    expect(ra.retry && ra.after === 17).toBe(true);
    const j = new RetryPolicy(4, 4, 30, true);
    const samples = Array.from({ length: 20 }, () => j.delay(1));
    expect(new Set(samples).size).toBeGreaterThan(1);
    expect(samples.every((s) => s > 2.9 && s < 5.1)).toBe(true);
    expect(p.decideTransport("network", 1).retry).toBe(true);
    expect(p.decideTransport("timeout", 1).retry).toBe(true);
    expect(p.decideTransport("cancelled", 1).retry).toBe(false);
  });
});

describe("The manifest", () => {
  it("replaces rather than duplicates, and treats a changed size as a new file", () => {
    let m = ProcessedFilesManifest.markProcessed([], "A.ARW", 10, 1);
    m = ProcessedFilesManifest.markProcessed(m, "A.ARW", 20, 2);
    expect(m.length).toBe(1);
    expect(m[0].fileSize).toBe(20);
    expect(ProcessedFilesManifest.isProcessed(m, "A.ARW", 99, 2)).toBe(false);
    expect(ProcessedFilesManifest.isProcessed(m, "A.ARW", 20, 2)).toBe(true);
    const round = ProcessedFilesManifest.parse(ProcessedFilesManifest.serialise(m));
    expect(round[0].filename).toBe("A.ARW");
    expect(CFTime.toUnix(CFTime.fromUnix(1_700_000_000))).toBe(1_700_000_000);
    expect(ProcessedFilesManifest.parse("nonsense")).toEqual([]);
    const sig = ProcessedFilesManifest.signature({ name: "x.jpg", size: 5, lastModified: 978_307_200_000 });
    expect(sig.modificationDate).toBe(0);
  });
});

describe("Caption records", () => {
  it("round-trips, decodes older records, and applies corrections", () => {
    const vision = VisionResult.make({ sceneType: "players_action", players: [VisionPlayer.make("27", "white", "controls the ball")] });
    const rec = CaptionRecord.make({ filename: "DSC07255.JPG", vision, caption: "A caption." });
    expect(rec.approved).toBe(false);
    const back = CaptionRecord.fromJSON(JSON.parse(JSON.stringify(CaptionRecord.toJSON({ ...rec, approved: true }))));
    expect(back.approved).toBe(true);
    expect(back.vision.players[0].jerseyNumber).toBe("27");
    const legacy = JSON.parse(`{"filename":"DSC05115.JPG","imagePath":"/tmp/DSC05115.JPG","caption":"A caption.",
      "manualJerseyNumbers":{},"generatedAt":"2026-08-20T12:00:00Z",
      "vision":{"scene_type":"players_action","players":[],"scene_description":"","primary_action":"","subject_team_color":"","nearby_player_colors":[],"overall_confidence":0.9}}`);
    const old = CaptionRecord.fromJSON(legacy);
    expect(old.caption).toBe("A caption."); expect(old.approved).toBe(false);
    const noNumber = CaptionRecord.make({ filename: "x.jpg", vision: VisionResult.make({ sceneType: "players_action", players: [VisionPlayer.make("", "white", "runs")] }), caption: "A caption." });
    expect(CaptionRecord.needsReview(noNumber)).toBe(true);
    const fixed = { ...noNumber, manualJerseyNumbers: { 0: "7" } };
    expect(CaptionRecord.needsReview(fixed)).toBe(false);
    expect(CaptionRecord.correctedVision(fixed).players[0].jerseyNumber).toBe("7");
    expect(CaptionRecord.recordName("DSC07255.JPG")).toBe("DSC07255.json");
    expect(REVIEW_STATUSES.map((s) => s.id)).toEqual(["needsReview", "approved", "all"]);
    expect(REVIEW_STATUSES[0].label).toBe("Needs review");
  });
});

describe("Alt text", () => {
  it("builds the model request and validates replies", () => {
    const uc = AltTextRequest.userContent("Members of the Nebraska Cornhuskers look on from the bench during a basketball game against the Kansas State Wildcats.", "Basketball");
    expect(uc).toContain("CAPTION (reference only):\nMembers of the Nebraska Cornhuskers");
    expect(uc).toContain("METADATA:\nSport: Basketball");
    expect(uc.endsWith("Output only the alt text.")).toBe(true);
    expect(AltTextRequest.maxTokens).toBe(400);
    expect(AltTextRequest.systemInstruction).toContain("Hard maximum 250 characters");
    expect(AltTextRequest.userContent()).not.toContain("CAPTION (reference only)");
    expect(AltTextRequest.validate("a".repeat(300) + ".")).toContain("tooLong");
    expect(AltTextRequest.validate("No period here")).toContain("notTerminated");
    expect(AltTextRequest.validate("A basketball player warms up on the court.")).toEqual([]);
    expect(AltTextRequest.sanitise('"A player warms up"')).toBe("A player warms up.");
  });
  const alt = (scene: (typeof SCENE_TYPES)[number], players = 0, action = "", sport = "Volleyball", venue = "Lincoln Southwest High School") =>
    SimpleAltText.build(VisionResult.make({ sceneType: scene, players: Array.from({ length: players }, (_, i) => VisionPlayer.make(String(i + 1), "white", "hits the ball")), primaryAction: action }), sport, venue);
  it("uses the model's own phrase for a scene when it gave one", () => {
    const walk = VisionResult.make({ sceneType: "celebration", sceneDescription: "walk together carrying a flag before the game" });
    expect(SimpleAltText.build(walk, "football", "")).toBe("Players walk together carrying a flag before the game.");
    const huddle = VisionResult.make({ sceneType: "celebration", sceneDescription: "huddle together and celebrate" });
    expect(SimpleAltText.build(huddle, "football", "Memorial Stadium")).toBe("Players huddle together and celebrate during a game on an outdoor field.");
    const coach = VisionResult.make({ sceneType: "coaches", sceneDescription: "talks to his players." });
    expect(SimpleAltText.build(coach, "football", "")).toBe("A coach talks to his players during a game.");
  });
  it("builds a safe sentence from the observation already in hand", () => {
    const two = alt("players_action", 2);
    expect(two.endsWith(".")).toBe(true);
    expect(two.slice(0, -1)).not.toContain(".");
    expect(two.toLowerCase()).toContain("volleyball");
    expect(alt("players_action", 1)).toContain("indoor");
    expect(alt("players_action", 1, "", "Football", "Memorial Stadium")).toContain("outdoor");
    const unknown = alt("players_action", 1, "", "Volleyball", "");
    expect(unknown).not.toContain("indoor"); expect(unknown).not.toContain("outdoor");
    expect(alt("crowd").toLowerCase()).toContain("spectators");
    expect(alt("coaches").toLowerCase()).toContain("coach");
    expect(alt("players_action", 1).startsWith("A volleyball player competes")).toBe(true);
    expect(two.startsWith("Two volleyball players compete")).toBe(true);
    expect(alt("players_action", 3, "number 27 spikes")).not.toContain("27");
    expect(alt("players_action", 2, "offensive play at the net")).toBe(alt("players_action", 2, "sets the ball"));
    expect(alt("players_action", 1, "sets the ball")).not.toContain("competes in");
    expect(AltTextRequest.validate(two)).toEqual([]);
    for (const s of SCENE_TYPES) {
      const t = alt(s, 2);
      expect(t.length).toBeGreaterThan(20); expect(t.endsWith(".")).toBe(true); expect(AltTextRequest.validate(t)).toEqual([]);
    }
  });
});

describe("The vision prompt and its context", () => {
  it("ships the prompt and builds the per-photo turn", () => {
    expect(VisionPrompt.system.length).toBeGreaterThan(10_000);
    expect(VisionPrompt.system).toContain("scene_type");
    const roster = Roster.make(Team.make("Nebraska", "red", "Cornhuskers"), Team.make("Iowa", "white", "Hawkeyes"));
    const ctx = VisionPrompt.context({ sportLabel: "Women's Soccer", roster, notes: "Nebraska in a white change kit" });
    expect(ctx).toContain("Team 1: Nebraska Cornhuskers — uniform colour: red");
    expect(ctx.indexOf("Also note, from the photographer")).toBeGreaterThan(ctx.indexOf("Team 2"));
    const ev = VisionPrompt.context({ sportLabel: "", roster, event: { name: "the Boston Marathon", participantNoun: "runner" } });
    expect(ev).toContain("Event: the Boston Marathon"); expect(ev).not.toContain("Team 1");
  });
});

describe("RAW previews", () => {
  it("rejects non-TIFF input", () => {
    expect(() => RAWPreviewExtractor.previews(new Uint8Array(64))).toThrow();
  });
  const sample = process.env.CUTLINE_RAW_SAMPLE;
  const hasSample = !!sample && existsSync(sample);
  it.skipIf(!hasSample)("walks a real ARW's IFDs and finds sane previews", () => {
    const d = new Uint8Array(readFileSync(sample!));
    const ps = RAWPreviewExtractor.previews(d);
    expect(ps.length).toBeGreaterThanOrEqual(2);
    for (const p of ps) {
      expect(p.width > 0 && p.height > 0 && p.width <= 20000 && p.height <= 20000).toBe(true);
      expect(d[p.offset]).toBe(0xff); expect(d[p.offset + 1]).toBe(0xd8);
    }
    const edges = ps.map(RAWPreviewExtractor.longestEdge);
    expect(edges).toEqual([...edges].sort((a, b) => a - b));
    const best = RAWPreviewExtractor.bestPreview(d, 320);
    expect(RAWPreviewExtractor.longestEdge(best)).toBeGreaterThanOrEqual(320);
    expect(RAWPreviewExtractor.longestEdge(best)).toBeLessThan(8000);
    expect(RAWPreviewExtractor.longestEdge(RAWPreviewExtractor.bestPreview(d, 1536))).toBeGreaterThanOrEqual(1536);
    const jpeg = RAWPreviewExtractor.jpegData(d, ps[ps.length - 1]);
    expect(jpeg[0]).toBe(0xff); expect(jpeg[1]).toBe(0xd8);
    expect(jpeg[jpeg.length - 2]).toBe(0xff); expect(jpeg[jpeg.length - 1]).toBe(0xd9);
  });
});
