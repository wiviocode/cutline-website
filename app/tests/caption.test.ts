// The caption core, checked against the golden suite: 13 reference captions that must match
// byte for byte, then the documented rules — colour-locking, fuzzy correction, offense-aware
// duplicates, group-action rejection, every house style, Hurrdat's own worked example, and
// captioning with no roster or no teams at all.

import { describe, it, expect } from "vitest";
import { Roster, RosterPlayer, Team } from "../src/core/roster/Roster";
import { RosterMatcher } from "../src/core/roster/RosterMatcher";
import { TeamColorArbiter } from "../src/core/roster/TeamColorArbiter";
import { TeamName } from "../src/core/roster/TeamName";
import { VisionResult, VisionPlayer, type SceneType, SCENE_TYPES } from "../src/core/vision/VisionResult";
import { CaptionResponseParser } from "../src/core/vision/CaptionResponseParser";
import { CaptionComposer } from "../src/core/caption/CaptionComposer";
import { CompositionContext, EventDescription, CAPTION_STYLES, type CaptionStyle } from "../src/core/caption/CompositionContext";
import { WireDate } from "../src/core/caption/WireStyle";
import { USState, APState } from "../src/core/caption/USState";
import { TeamNoun } from "../src/core/caption/TeamNoun";
import { Cleanup } from "../src/core/caption/Cleanup";
import { UNIDENTIFIED_TOKEN } from "../src/core/caption/PlayerReference";
import { SampleCaption } from "../src/core/caption/SampleCaption";
import { CaptionParts } from "../src/core/caption/CaptionParts";
import { KitColourDiagnosis } from "../src/core/setup/KitColourDiagnosis";
import { VISION_MODELS, VisionModel, ALT_TEXT_MODES, ImagePrep } from "../src/core/anthropic/VisionModel";
import { localDate } from "../src/core/images/PhotoMetadata";

const player = (n: string, c: string, a: string, conf = 0.9) => VisionPlayer.make(n, c, a, conf);
const duel = (sn: string, sc: string, tn: string, tc: string, phrase: string) =>
  ({ subjectJerseyNumber: sn, subjectJerseyColor: sc, targetJerseyNumber: tn, targetJerseyColor: tc, phrase });

describe("The 13 golden captions", () => {
  const nebraska = Team.make("Nebraska", "red", "Cornhuskers");
  const kansasState = Team.make("Kansas State", "white", "Wildcats");
  // team1/team2 order matches the app's own settings — it drives "between the A and the B".
  const roster = Roster.make(kansasState, nebraska, [
    RosterPlayer.make({ teamID: kansasState.id, jerseyNumber: "34", firstName: "Nate", lastName: "Johnson", position: "guard" }),
    RosterPlayer.make({ teamID: kansasState.id, jerseyNumber: "2", firstName: "Exavier", lastName: "Wilson", position: "guard" }),
    RosterPlayer.make({ teamID: kansasState.id, jerseyNumber: "10", firstName: "David", lastName: "Castillo", position: "guard" }),
    RosterPlayer.make({ teamID: kansasState.id, jerseyNumber: "1", firstName: "Abdi", lastName: "Bashir Jr.", position: "guard" }),
    RosterPlayer.make({ teamID: kansasState.id, jerseyNumber: "3", firstName: "C.J.", lastName: "Jones", position: "guard" }),
    RosterPlayer.make({ teamID: kansasState.id, jerseyNumber: "21", firstName: "Khamari", lastName: "Mcgriff", position: "forward" }),
  ]);
  const context = CompositionContext.make({ style: "apSports", mode: "fullCaption", fallback: "markUnidentified", sport: "basketball", roster });
  const cases: [string, Parameters<typeof VisionResult.make>[0], string][] = [
    ["ELI07874 action-only", { sceneType: "players_action", primaryAction: "lies on the floor", overallConfidence: 0.8 },
      "Lies on the floor during a basketball game between the Kansas State Wildcats and the Nebraska Cornhuskers."],
    ["ELI07350 action-only", { sceneType: "players_action", primaryAction: "reaches for the ball", overallConfidence: 0.85 },
      "Reaches for the ball during a basketball game between the Kansas State Wildcats and the Nebraska Cornhuskers."],
    ["ELI07242 bench scene", { sceneType: "bench", sceneDescription: "look on from the bench", subjectTeamColor: "red", overallConfidence: 0.85 },
      "Members of the Nebraska Cornhuskers look on from the bench during a basketball game against the Kansas State Wildcats."],
    ["ELI07715 unidentified #0", { sceneType: "players_action", players: [player("0", "red", "raises an arm", 0.95)], overallConfidence: 0.92 },
      "Nebraska Cornhuskers XXXXX (0) raises an arm during a basketball game against the Kansas State Wildcats."],
    ["ELI07747 identified guard", { sceneType: "players_action", players: [player("3", "white", "defends tightly")] },
      "Kansas State Wildcats guard C.J. Jones (3) defends tightly during a basketball game against the Nebraska Cornhuskers."],
    ["ELI07459 identified, long action", { sceneType: "players_action", players: [player("34", "white", "runs down the court")] },
      "Kansas State Wildcats guard Nate Johnson (34) runs down the court during a basketball game against the Nebraska Cornhuskers."],
    ["ELI07221 unreadable number", { sceneType: "players_action", players: [player("", "red", "shoots a jumper")] },
      "Nebraska Cornhuskers XXXXX shoots a jumper during a basketball game against the Kansas State Wildcats."],
    ["ELI07582 drives past", { sceneType: "players_action", players: [player("1", "red", "drives past"), player("2", "white", "defends")], interaction: duel("1", "red", "2", "white", "drives past") },
      "Nebraska Cornhuskers XXXXX (1) drives past Kansas State Wildcats guard Exavier Wilson (2) during a basketball game."],
    ["ELI07417 dribbles past", { sceneType: "players_action", players: [player("3", "red", "dribbles past"), player("10", "white", "defends")], interaction: duel("3", "red", "10", "white", "dribbles past") },
      "Nebraska Cornhuskers XXXXX (3) dribbles past Kansas State Wildcats guard David Castillo (10) during a basketball game."],
    ["ELI07780 shoots over forward", { sceneType: "players_action", players: [player("10", "red", "shoots over"), player("21", "white", "defends")], interaction: duel("10", "red", "21", "white", "shoots over") },
      "Nebraska Cornhuskers XXXXX (10) shoots over Kansas State Wildcats forward Khamari Mcgriff (21) during a basketball game."],
    ["ELI07662 suffixed surname", { sceneType: "players_action", players: [player("21", "red", "shoots over"), player("1", "white", "defends")], interaction: duel("21", "red", "1", "white", "shoots over") },
      "Nebraska Cornhuskers XXXXX (21) shoots over Kansas State Wildcats guard Abdi Bashir Jr. (1) during a basketball game."],
    ["ELI07473 drives past Johnson", { sceneType: "players_action", players: [player("1", "red", "drives past"), player("34", "white", "defends")], interaction: duel("1", "red", "34", "white", "drives past") },
      "Nebraska Cornhuskers XXXXX (1) drives past Kansas State Wildcats guard Nate Johnson (34) during a basketball game."],
    ["ELI07543 shoots against", { sceneType: "players_action", players: [player("1", "red", "shoots"), player("34", "white", "defends")], interaction: duel("1", "red", "34", "white", "shoots against") },
      "Nebraska Cornhuskers XXXXX (1) shoots against Kansas State Wildcats guard Nate Johnson (34) during a basketball game."],
  ];
  for (const [id, vision, expected] of cases) {
    it(id, () => expect(CaptionComposer.compose(VisionResult.make(vision), context).caption).toBe(expected));
  }
});

describe("Documented rules", () => {
  const ksu = Team.make("Kansas State", "white", "Wildcats");
  const neb = Team.make("Nebraska", "red", "Cornhuskers");
  const roster = Roster.make(ksu, neb, [
    RosterPlayer.make({ teamID: ksu.id, jerseyNumber: "5", firstName: "White", lastName: "Five", position: "guard" }),
    RosterPlayer.make({ teamID: neb.id, jerseyNumber: "5", firstName: "Red", lastName: "Five", position: "forward" }),
    RosterPlayer.make({ teamID: ksu.id, jerseyNumber: "13", firstName: "Thir", lastName: "Teen", position: "guard" }),
  ]);
  const matcher = new RosterMatcher(roster, "basketball");

  it("colour-locks the number to the side its colour implies", () => {
    const w = matcher.match("5", "white", "shoots");
    expect(w.ok && w.match.player.lastName === "Five" && w.match.team.id === ksu.id).toBe(true);
    const r = matcher.match("5", "red", "shoots");
    expect(r.ok && r.match.team.id === neb.id).toBe(true);
    const g = matcher.match("5", "green", "shoots");
    expect(!g.ok && g.failure.kind === "colorUnresolved").toBe(true);
  });
  it("corrects plausible misreads and refuses 0/00", () => {
    expect(RosterMatcher.isPlausibleMisread("3", "13")).toBe(true);
    expect(RosterMatcher.isPlausibleMisread("0", "3")).toBe(true);
    expect(RosterMatcher.isPlausibleMisread("7", "22")).toBe(false);
    expect(RosterMatcher.isPlausibleMisread("0", "00")).toBe(false);
  });
  it("resolves football duplicates from the verb, and refuses elsewhere", () => {
    const team = Team.make("Nebraska", "red", "Cornhuskers");
    const fb = Roster.make(team, ksu, [
      RosterPlayer.make({ teamID: team.id, jerseyNumber: "22", firstName: "Off", lastName: "Ense", position: "running back", side: "offense" }),
      RosterPlayer.make({ teamID: team.id, jerseyNumber: "22", firstName: "Def", lastName: "Ense", position: "linebacker", side: "defense" }),
    ]);
    const fbm = new RosterMatcher(fb, "football");
    const carry = fbm.match("22", "red", "carries the ball");
    expect(carry.ok && carry.match.player.side === "offense").toBe(true);
    const tackle = fbm.match("22", "red", "tackles the runner");
    expect(tackle.ok && tackle.match.player.side === "defense").toBe(true);
    const bb = new RosterMatcher(fb, "basketball").match("22", "red", "shoots");
    expect(!bb.ok && bb.failure.kind === "ambiguousDuplicate" && bb.failure.team === "Nebraska").toBe(true);
  });
  it("lets a nearby majority override the declared subject colour", () => {
    const a = TeamColorArbiter.subjectTeam(roster, "white", ["red", "red", "red", "white"]);
    expect(a.team?.id).toBe(neb.id); expect(a.overridden).toBe(true);
    const b = TeamColorArbiter.subjectTeam(roster, "white", ["white", "white"]);
    expect(b.team?.id).toBe(ksu.id); expect(b.overridden).toBe(false);
  });
  it("drops a group action that spans both teams", () => {
    const mixed = VisionResult.make({ sceneType: "players_action",
      players: [player("5", "white", "reaches"), player("13", "white", "reaches"), player("5", "red", "reaches")],
      groupAction: { phrase: "reach for a loose ball" } });
    const out = CaptionComposer.compose(mixed, CompositionContext.make({ style: "apSports", sport: "basketball", roster }));
    expect(out.warnings).toContain("group_action_dropped_mixed_teams");
    expect(out.caption).not.toContain("reach for a loose ball");
  });
  it("puts the article only before a nickname", () => {
    const withNickname = Team.make("Ohio State", "grey", "Buckeyes");
    const bare = Team.make("Nebraska", "white");
    const blank = Team.make("Nebraska", "white", "  ");
    expect(Team.takesDefiniteArticle(withNickname)).toBe(true);
    expect(Team.takesDefiniteArticle(bare)).toBe(false);
    expect(Team.takesDefiniteArticle(blank)).toBe(false);
    expect(Team.withArticle(withNickname)).toBe("the Ohio State Buckeyes");
    expect(Team.withArticle(bare)).toBe("Nebraska");
    expect(Team.groupLabel(withNickname, "players")).toBe("Members of the Ohio State Buckeyes");
    expect(Team.groupLabel(bare, "players")).toBe("Nebraska players");

    const bareRoster = Roster.make(bare, Team.make("Notre Dame", "navy"), []);
    const huddle = VisionResult.make({ sceneType: "celebration", sceneDescription: "huddle together before kickoff", subjectTeamColor: "navy" });
    const huddleOut = CaptionComposer.compose(huddle, CompositionContext.make({ style: "apSports", fallback: "describeWithoutName", sport: "soccer", roster: bareRoster })).caption;
    expect(huddleOut).not.toContain("the Nebraska");
    expect(huddleOut.includes("against Nebraska") || !huddleOut.includes("against")).toBe(true);
    const nickRoster = Roster.make(Team.make("Kansas State", "purple", "Wildcats"), withNickname, []);
    const nickOut = CaptionComposer.compose(huddle, CompositionContext.make({ style: "apSports", fallback: "describeWithoutName", sport: "basketball", roster: nickRoster })).caption;
    expect(nickOut.includes("the Ohio State Buckeyes") || nickOut.includes("the Kansas State Wildcats")).toBe(true);
  });

  const one = VisionResult.make({ sceneType: "players_action", players: [player("5", "white", "shoots a jumper")] });
  const caption = (style: CaptionStyle) => CaptionComposer.compose(one, CompositionContext.make({ style, sport: "basketball", roster })).caption;
  it("renders each style's player reference", () => {
    expect(caption("gettySports").startsWith("White Five #5 of the Kansas State Wildcats")).toBe(true);
    expect(caption("gettySportsParen").startsWith("White Five (5) of the Kansas State Wildcats")).toBe(true);
    expect(caption("apSports").startsWith("Kansas State Wildcats guard White Five (5)")).toBe(true);
    expect(caption("simple").startsWith("White Five (5)")).toBe(true);
  });
  it("warns on Imagn without a country", () => {
    expect(CaptionComposer.compose(one, CompositionContext.make({ style: "imagnImages", sport: "basketball", roster })).warnings).toContain("imagn_country_missing");
  });
  it("prepend mode appends the base, synthesises one, or warns", () => {
    const withBase = CaptionComposer.compose(one, CompositionContext.make({ style: "apSports", mode: "prependToBase", sport: "basketball", roster, iptc: { description: "Existing base text." } }));
    expect(withBase.caption.endsWith("Existing base text.")).toBe(true);
    const noBase = CaptionComposer.compose(one, CompositionContext.make({ style: "apSports", mode: "prependToBase", sport: "basketball", roster }));
    expect(noBase.warnings).toContain("prepend_base_unavailable");
    const synth = CaptionComposer.compose(one, CompositionContext.make({ style: "apSports", mode: "prependToBase", sport: "basketball", roster, iptc: { venue: "Pinnacle Bank Arena" } }));
    expect(synth.caption).toContain("at Pinnacle Bank Arena");
  });
  it("cleans placeholder artefacts", () => {
    expect(Cleanup.tidy("A XXXXX (?) shoots")).toBe("A XXXXX shoots.");
    expect(Cleanup.tidy("A XXXXX #? shoots")).toBe("A XXXXX shoots.");
  });
  it("offers the alt text modes cheapest first, and brief looks at a smaller copy", () => {
    expect(ImagePrep.briefLongEdge).toBeLessThan(ImagePrep.standardLongEdge);
    expect(ALT_TEXT_MODES.map((m) => m.id)).toEqual(["simple", "brief", "detailed", "off"]);
  });
  it("the settings example holds up in every style", () => {
    for (const style of ["apSports", "hurrdatSports", "gettySports", "gettySportsParen", "imagnImages", "simple"] as CaptionStyle[]) {
      const sample = SampleCaption.text(style, "John Peterson");
      expect(sample).toContain("Adrian Martinez");
      expect(sample.length > 40 && (sample.endsWith(".") || sample.endsWith(")") || sample.endsWith("Imagn Images"))).toBe(true);
    }
    expect(SampleCaption.text("hurrdatSports", "John Peterson")).toContain("Photo by John Peterson.");
    expect(SampleCaption.text("hurrdatSports", "")).not.toContain("Photo by");
    expect(SampleCaption.text("apSports", "")).not.toBe(SampleCaption.text("gettySportsParen", ""));
  });
});

describe("Wire house styles", () => {
  const caption = (style: CaptionStyle, photographer = "Eli Larson") => SampleCaption.text(style, photographer);
  it("AP", () => {
    const ap = caption("apSports");
    expect(ap).toContain(", Saturday, Sept. 14, 2024, in ");
    expect(ap).not.toContain("on Sept.");
    expect(ap).toContain("Lincoln, Neb."); expect(ap).not.toContain("Lincoln, NE");
    expect(ap.endsWith("(AP Photo/Eli Larson)")).toBe(true);
    expect(ap).not.toContain("Memorial Stadium");
    expect(ap).toContain("Nebraska Cornhuskers quarterback Adrian Martinez (2)");
  });
  it("Getty", () => {
    const getty = caption("gettySports");
    expect(getty.startsWith("Adrian Martinez #2 of the")).toBe(true);
    expect(getty).toContain("#2"); expect(getty).not.toContain("(2)");
    expect(getty).toContain("on September 14, 2024");
    expect(getty).toContain("at Memorial Stadium");
    expect(getty).toContain("in Lincoln, Nebraska");
    expect(getty.endsWith("(Photo by Eli Larson/Getty Images)")).toBe(true);
    const parens = caption("gettySportsParen");
    expect(parens).toContain("Adrian Martinez (2) of the"); expect(parens).not.toContain("#2");
  });
  it("Imagn", () => {
    const imagn = caption("imagnImages");
    expect(imagn.startsWith("Sep 14, 2024; ")).toBe(true);
    expect(imagn).not.toContain("Sept.");
    expect(imagn).toContain("Lincoln, NE, USA;");
    expect(imagn.endsWith("Mandatory Credit: Eli Larson-Imagn Images")).toBe(true);
    expect(imagn).toContain("Nebraska Cornhuskers quarterback Adrian Martinez (2)");
    expect(imagn).toContain("at Memorial Stadium");
  });
  it("Icon Sportswire", () => {
    const icon = caption("iconSports");
    expect(icon.startsWith("LINCOLN, NE - SEPTEMBER 14: ")).toBe(true);
    expect(icon).toContain("Adrian Martinez #2 of the Nebraska Cornhuskers");
    expect(icon).toContain("on September 14, 2024"); expect(icon).toContain("in Lincoln, Nebraska");
    expect(icon.endsWith("(Photo by Eli Larson/Icon Sportswire via Getty Images)")).toBe(true);
  });
  it("omits the credit rather than leaving it dangling", () => {
    for (const style of ["apSports", "gettySports", "imagnImages", "iconSports"] as CaptionStyle[]) {
      const anonymous = caption(style, "");
      expect(anonymous).not.toContain("Photo"); expect(anonymous).not.toContain("Mandatory Credit");
      expect(anonymous.endsWith(".") || anonymous.endsWith(")")).toBe(true);
    }
    expect(caption("simple")).not.toContain("Photo");
    for (const style of CAPTION_STYLES) expect(caption(style).endsWith(").")).toBe(false);
  });
  it("writes states and months each desk's way", () => {
    expect(USState.written("Neb.", "fullName")).toBe("Nebraska");
    expect(USState.written("Nebraska", "apAbbreviation")).toBe("Neb.");
    expect(USState.written("NE", "fullName")).toBe("Nebraska");
    expect(USState.written("nebraska", "postal")).toBe("NE");
    expect(USState.written("Ohio", "apAbbreviation")).toBe("Ohio");
    expect(USState.written("Texas", "apAbbreviation")).toBe("Texas");
    expect(USState.written("California", "apAbbreviation")).toBe("Calif.");
    expect(USState.written("California", "postal")).toBe("CA");
    expect(USState.written("Ontario", "fullName")).toBe("Ontario");
    expect(USState.written("", "fullName")).toBe("");
    const july = localDate(2025, 7, 4), september = localDate(2024, 9, 14);
    expect(WireDate.text(july, "apAbbreviated")).toBe("July 4, 2025");
    expect(WireDate.text(july, "full")).toBe("July 4, 2025");
    expect(WireDate.text(july, "threeLetter")).toBe("Jul 4, 2025");
    expect(WireDate.text(september, "apAbbreviated")).toBe("Sept. 14, 2024");
    expect(WireDate.text(september, "full")).toBe("September 14, 2024");
    expect(WireDate.text(september, "threeLetter")).toBe("Sep 14, 2024");
    expect(WireDate.datelineDate(september)).toBe("SEPTEMBER 14");
    expect(APState.apStyle("Nebraska")).toBe("Neb."); expect(APState.apStyle("NE")).toBe("Neb.");
    expect(APState.apStyle("Iowa")).toBe("Iowa"); expect(APState.apStyle("TX")).toBe("Texas");
    expect(APState.apStyle("California")).toBe("Calif."); expect(APState.apStyle("Saskatchewan")).toBe("Saskatchewan");
  });
});

describe("Hurrdat Sports, and captioning with no roster", () => {
  it("singularises nicknames, and knows which have no singular", () => {
    expect(TeamNoun.singular("Cornhuskers")).toBe("Cornhusker");
    expect(TeamNoun.singular("Buckeyes")).toBe("Buckeye");
    expect(TeamNoun.singular("Wildcats")).toBe("Wildcat");
    expect(TeamNoun.singular("Patriots")).toBe("Patriot");
    expect(TeamNoun.singular("Huskies")).toBe("Husky");
    expect(TeamNoun.singular("Bluejays")).toBe("Bluejay");
    expect(TeamNoun.singular("Fighting Irish")).toBeNull();
    expect(TeamNoun.singular("Crimson Tide")).toBeNull();
    expect(TeamNoun.singular("Green Wave")).toBeNull();
    expect(TeamNoun.singular("CORNHUSKERS")).toBe("Cornhusker");
    expect(TeamNoun.singular("  ")).toBeNull();
    expect(TeamNoun.singularTeamLabel("Nebraska", "Cornhuskers")).toBe("Nebraska Cornhusker");
    expect(TeamNoun.singularTeamLabel("Notre Dame", "Fighting Irish")).toBeNull();
  });

  const neb = Team.make("Nebraska", "red", "Cornhuskers");
  const osu = Team.make("Ohio State", "grey", "Buckeyes");
  const martinez = RosterPlayer.make({ teamID: neb.id, jerseyNumber: "2", firstName: "Adrian", lastName: "Martinez", position: "quarterback", side: "offense" });
  const football = Roster.make(neb, osu, [martinez]);
  const pass = VisionResult.make({ sceneType: "players_action", players: [player("2", "red", "throws a pass for a first down in the third quarter")] });
  const iptc = { dateText: "Sept. 14, 2021", city: "Lincoln", state: "Neb.", leagueLevel: "college" };

  it("matches the guide's worked example exactly", () => {
    const out = CaptionComposer.compose(pass, CompositionContext.make({ style: "hurrdatSports", sport: "football", roster: football, iptc, photographer: "John Peterson", weekday: "Saturday" })).caption;
    expect(out).toBe("Nebraska Cornhusker Adrian Martinez (2) throws a pass for a first down in the third quarter against the Ohio State Buckeyes during a college football game, Saturday, Sept. 14, 2021, in Lincoln, Neb. Photo by John Peterson.");
    const venueOut = CaptionComposer.compose(pass, CompositionContext.make({ style: "hurrdatSports", sport: "football", roster: football, iptc: { ...iptc, venue: "Memorial Stadium" }, photographer: "John Peterson" })).caption;
    expect(venueOut).toContain("at Memorial Stadium in Lincoln, Neb.");
    expect(venueOut).toContain("game Sept. 14, 2021,"); expect(venueOut).not.toContain("game, Sept.");
    expect(venueOut.endsWith("Photo by John Peterson.")).toBe(true);
    const anon = CaptionComposer.compose(pass, CompositionContext.make({ style: "hurrdatSports", sport: "football", roster: football, iptc })).caption;
    expect(anon).not.toContain("Photo by"); expect(anon.endsWith(".")).toBe(true);
  });

  const noPlayers = Roster.make(neb, osu, []);
  const rosterless = (vision: VisionResult, style: CaptionStyle = "hurrdatSports") =>
    CaptionComposer.compose(vision, CompositionContext.make({ style, fallback: "describeWithoutName", sport: "football", roster: noPlayers, iptc, photographer: "John Peterson", weekday: "Saturday" })).caption;

  it("describes players by team and number without inventing a name", () => {
    const bare = rosterless(pass);
    expect(bare).not.toContain("Martinez");
    expect(bare).not.toContain(UNIDENTIFIED_TOKEN);
    expect(bare.startsWith("A Nebraska Cornhusker (2)")).toBe(true);
    expect(bare).toContain("throws a pass for a first down");
    expect(bare).toContain("against the Ohio State Buckeyes");
    expect(bare).toContain("during a college football game, Saturday");
    expect(bare.endsWith("Photo by John Peterson.")).toBe(true);
    const out = CaptionComposer.compose(pass, CompositionContext.make({ style: "hurrdatSports", fallback: "describeWithoutName", sport: "football", roster: noPlayers, iptc }));
    expect(out.warnings).not.toContain("unidentified_placeholder");
    expect(out.suppressedPlayerCount).toBe(0);
    const nd = Roster.make(Team.make("Notre Dame", "blue", "Fighting Irish"), osu, []);
    const ndOut = CaptionComposer.compose(VisionResult.make({ sceneType: "players_action", players: [player("7", "blue", "makes a tackle")] }),
      CompositionContext.make({ style: "hurrdatSports", fallback: "describeWithoutName", sport: "football", roster: nd, iptc })).caption;
    expect(ndOut.startsWith("A Notre Dame Fighting Irish player (7)")).toBe(true);
    const noNumber = rosterless(VisionResult.make({ sceneType: "players_action", players: [player("", "red", "celebrates")] }));
    expect(noNumber.startsWith("A Nebraska Cornhusker celebrates")).toBe(true);
    expect(noNumber).not.toContain("()");
    const two = rosterless(VisionResult.make({ sceneType: "players_action", players: [player("2", "red", "carries the ball"), player("9", "grey", "moves to tackle")] }));
    expect(two).toContain("Nebraska Cornhusker (2)"); expect(two).toContain("Ohio State Buckeye (9)");
    expect(two).not.toContain("against the"); expect(two).not.toContain("between the");
    expect(rosterless(pass, "apSports")).not.toContain(UNIDENTIFIED_TOKEN);
    expect(rosterless(pass, "gettySports")).toContain("of the Nebraska Cornhuskers");
    const scene = rosterless(VisionResult.make({ sceneType: "wide_view" }));
    expect(scene.length).toBeGreaterThan(0);
    expect(scene.toLowerCase()).not.toContain("a nebraska cornhusker (");
  });

  const ride = VisionResult.make({ sceneType: "players_action", players: [player("12", "red", "climbs the final hill")] });
  const event = (name: string, noun = "rider", vision: VisionResult = ride, style: CaptionStyle = "hurrdatSports") =>
    CaptionComposer.compose(vision, CompositionContext.make({ style, fallback: "describeWithoutName", sport: "crossCountry", roster: Roster.noTeams(), iptc, photographer: "John Peterson", weekday: "Saturday", event: EventDescription.make(name, noun) })).caption;

  it("captions an event with no teams", () => {
    const cx = event("the Nebraska State Cyclocross Championships");
    expect(cx.startsWith("A rider (12) climbs the final hill")).toBe(true);
    expect(cx.toLowerCase()).not.toContain("cornhusker");
    expect(cx).not.toContain("between the"); expect(cx).not.toContain("against the");
    expect(cx).not.toContain(" game");
    expect(cx).toContain("during the Nebraska State Cyclocross Championships");
    expect(cx).toContain(", Saturday, Sept. 14, 2021,");
    expect(cx.endsWith("Photo by John Peterson.")).toBe(true);
    expect(event("the Cornhusker State Games", "").startsWith("A competitor (12)")).toBe(true);
    expect(event("the state meet", "wrestler").startsWith("A wrestler (12)")).toBe(true);
    expect(event("Boston Marathon")).toContain("during the Boston Marathon");
    expect(event("the Boston Marathon")).not.toContain("during the the");
    expect(event("a cyclocross race")).toContain("during a cyclocross race");
    expect(event("practice")).toContain("during practice"); expect(event("practice")).not.toContain("during the practice");
    expect(event("")).not.toContain("during");
    const ap = event("the Boston Marathon", "rider", ride, "apSports");
    expect(ap).toContain("during the Boston Marathon"); expect(ap).not.toContain("between the");
    expect(ap).toContain(", Sept. 14, 2021"); expect(ap).not.toContain("on Sept.");
    const noNum = event("the Boston Marathon", "rider", VisionResult.make({ sceneType: "players_action", players: [player("", "", "crosses the line")] }));
    expect(noNum.startsWith("A rider crosses the line")).toBe(true); expect(noNum).not.toContain("()");
    const crowd = event("the Boston Marathon", "rider", VisionResult.make({ sceneType: "crowd", sceneDescription: "line the course" }));
    expect(crowd.startsWith("Fans line the course")).toBe(true); expect(crowd).toContain("during the Boston Marathon");
    const wide = event("the Boston Marathon", "rider", VisionResult.make({ sceneType: "wide_view" }));
    expect(wide.length).toBeGreaterThan(0); expect(wide).not.toContain("between the");
    const coach = event("the state meet", "rider", VisionResult.make({ sceneType: "coaches", sceneDescription: "watches the final heat" }));
    expect(coach.startsWith("A coach watches the final heat")).toBe(true);
    const pair = event("the Boston Marathon", "rider", VisionResult.make({ sceneType: "players_action", players: [player("12", "", "leads"), player("8", "", "follows")] }));
    expect(pair.includes("a rider (12)") || pair.includes("A rider (12)")).toBe(true);
    expect(pair).toContain("a rider (8)");
  });

  it("locates player names inside a finished caption", () => {
    const lewis = RosterPlayer.make({ teamID: neb.id, jerseyNumber: "27", firstName: "Nathalie", lastName: "Lewis", position: "F" });
    const lew = RosterPlayer.make({ teamID: neb.id, jerseyNumber: "3", firstName: "Ada", lastName: "Lew", position: "M" });
    const annaMae = RosterPlayer.make({ teamID: osu.id, jerseyNumber: "9", firstName: "Anna", lastName: "Mae", position: "D" });
    const annaMaeCarter = RosterPlayer.make({ teamID: osu.id, jerseyNumber: "11", firstName: "Anna Mae", lastName: "Carter", position: "F" });
    const names = Roster.make(neb, osu, [lewis, lew, annaMae, annaMaeCarter]);
    const spans = (t: string) => CaptionParts.split(t, names);
    const named = (t: string) => spans(t).filter((s) => s.player).map((s) => s.text);
    expect(named("Nathalie Lewis scores.")).toEqual(["Nathalie Lewis"]);
    expect(spans("Nathalie Lewis scores.").map((s) => s.text).join("")).toBe("Nathalie Lewis scores.");
    expect(spans("Fans watch from the stands.").length).toBe(1);
    expect(spans("")).toEqual([]);
    expect(named("Anna Mae Carter passes.")).toEqual(["Anna Mae Carter"]);
    expect(named("Anna Mae passes.")).toEqual(["Anna Mae"]);
    expect(named("Lewisham United warmed up.")).toEqual([]);
    expect(named("Nathalie Lewis's shot went wide.")).toEqual(["Nathalie Lewis"]);
    expect(named("Nathalie Lewis passes to Anna Mae.").length).toBe(2);
    expect(named("Nathalie Lewis beats a defender; Nathalie Lewis shoots.").length).toBe(2);
    expect(spans("Nathalie Lewis scores.").find((s) => s.player)?.team?.name).toBe("Nebraska");
    const mates = Roster.teammates(names, lewis);
    expect(mates.every((p) => p.teamID === neb.id)).toBe(true);
    expect(mates.map((p) => p.jerseyNumber)).toEqual(["3", "27"]);
    expect(named("Late on, Nathalie Lewis curled one in from 20 yards.")).toEqual(["Nathalie Lewis"]);
  });
});

describe("Kit colour, model choice and cost", () => {
  const rosterWith = (colour: string) => {
    const home = Team.make("Lincoln Southwest", "green", "Silver Hawks");
    const away = Team.make("Lincoln North Star", colour, "Navigators");
    return Roster.make(home, away, [
      RosterPlayer.make({ teamID: away.id, jerseyNumber: "8", firstName: "Alex", lastName: "Kroll", position: "Setter" }),
      RosterPlayer.make({ teamID: home.id, jerseyNumber: "28", firstName: "Ruby", lastName: "Vodicka", position: "Outside Hitter" }),
    ]);
  };
  const seen = VisionResult.make({ sceneType: "players_action", players: [player("8", "white", "sets the ball")] });
  const caption = (r: Roster) => CaptionComposer.compose(seen, CompositionContext.make({ style: "apSports", fallback: "markUnidentified", sport: "volleyball", roster: r, iptc: { dateText: "2026-08-27" } })).caption;
  it("a wrong kit colour leaves a placeholder; the right one names the player", () => {
    const wrong = caption(rosterWith("blue")), right = caption(rosterWith("white"));
    expect(wrong).toContain("XXXXX"); expect(wrong).toContain("(8)"); expect(wrong).toContain("sets the ball");
    expect(right).toContain("Alex Kroll"); expect(right).not.toContain("XXXXX");
    expect(right).toContain("Lincoln North Star"); expect(right.toLowerCase()).toContain("setter");
    expect(TeamColorArbiter.sameFamily("navy", "royal")).toBe(true);
    expect(TeamColorArbiter.sameFamily("white", "blue")).toBe(false);
  });
  it("prices every model, cheaper ones cheaper, Haiku a fifth of Opus", () => {
    expect(VisionModel.default.relativeCost).toBe("most capable");
    for (const m of VISION_MODELS) { expect(m.inputPricePerMillion).toBeGreaterThan(0); expect(m.outputPricePerMillion).toBeGreaterThan(0); }
    const opus = VisionModel.byID("claude-opus-5"), haiku = VisionModel.byID("claude-haiku-4-5-20251001");
    for (const m of VISION_MODELS) expect(Math.abs(VisionModel.cost(m, 1_000_000, 1_000_000) - (m.inputPricePerMillion + m.outputPricePerMillion))).toBeLessThan(1e-9);
    expect(Math.abs(VisionModel.cost(haiku, 400_000, 20_000) * 5 - VisionModel.cost(opus, 400_000, 20_000))).toBeLessThan(1e-9);
    expect(VisionModel.cost(opus, 0, 0)).toBe(0);
  });
  it("decides whether the colours are actually wrong", () => {
    expect(KitColourDiagnosis.isMisconfigured(6, 24)).toBe(true);
    expect(KitColourDiagnosis.isMisconfigured(1, 24)).toBe(false);
    expect(KitColourDiagnosis.isMisconfigured(3, 200)).toBe(false);
    expect(KitColourDiagnosis.isMisconfigured(2, 3)).toBe(false);
    expect(KitColourDiagnosis.isMisconfigured(10, 500)).toBe(false);
    expect(KitColourDiagnosis.isMisconfigured(10, 40)).toBe(true);
    expect(KitColourDiagnosis.isMisconfigured(24, 24)).toBe(true);
    expect(KitColourDiagnosis.isMisconfigured(0, 24)).toBe(false);
    expect(KitColourDiagnosis.isMisconfigured(0, 0)).toBe(false);
    expect(KitColourDiagnosis.isMisconfigured(8, 8)).toBe(true);
  });
  it("breaks a caption into wrappable pieces that reassemble exactly", () => {
    const clause = "(6) digs the ball against the Lincoln Southwest Silver Hawks";
    const split = CaptionParts.wrappablePieces(clause);
    expect(split.length).toBeGreaterThan(1);
    expect(split.every((p) => !p.trim().includes(" "))).toBe(true);
    expect(split.join("")).toBe(clause);
    expect(CaptionParts.wrappablePieces("a  double  space").join("")).toBe("a  double  space");
    expect(CaptionParts.wrappablePieces(" (6) digs")[0]).toBe(" (6) ");
    expect(CaptionParts.wrappablePieces("Navigator ").join("")).toBe("Navigator ");
    expect(CaptionParts.wrappablePieces("")).toEqual([]);
    expect(CaptionParts.wrappablePieces("   ")).toEqual(["   "]);
    expect(CaptionParts.wrappablePieces("Kroll")).toEqual(["Kroll"]);
    const full = caption(rosterWith("white"));
    const rebuilt = CaptionParts.split(full, rosterWith("white")).flatMap((s) => (s.player ? [s.text] : CaptionParts.wrappablePieces(s.text)));
    expect(rebuilt.join("")).toBe(full);
    expect(rebuilt).toContain("Alex Kroll");
  });
});

describe("Team names and colour families", () => {
  it("splits school and nickname", () => {
    expect(TeamName.split("Nebraska Cornhuskers")).toEqual({ school: "Nebraska", nickname: "Cornhuskers" });
    expect(TeamName.split("Notre Dame Fighting Irish")).toEqual({ school: "Notre Dame", nickname: "Fighting Irish" });
    expect(TeamName.split("Georgia Tech Yellow Jackets")).toEqual({ school: "Georgia Tech", nickname: "Yellow Jackets" });
    expect(TeamName.split("Nebraska")).toEqual({ school: "Nebraska", nickname: null });
    expect(TeamName.split("Millard South Patriots")).toEqual({ school: "Millard South", nickname: "Patriots" });
    expect(TeamName.split("   ")).toEqual({ school: "", nickname: null });
    expect(TeamName.split("Lincoln Southwest Silver Hawks")).toEqual({ school: "Lincoln Southwest Silver", nickname: "Hawks" });
  });
  it("tells kit colours apart by family", () => {
    expect(TeamColorArbiter.sameFamily("white", "navy")).toBe(false);
    expect(TeamColorArbiter.sameFamily("blue", "navy")).toBe(true);
    expect(TeamColorArbiter.sameFamily("royal", "navy")).toBe(true);
    expect(TeamColorArbiter.sameFamily("crimson", "red")).toBe(true);
    expect(TeamColorArbiter.sameFamily("cream", "white")).toBe(true);
    expect(TeamColorArbiter.sameFamily("white", "white")).toBe(true);
    expect(TeamColorArbiter.sameFamily("Navy", "navy")).toBe(true);
    expect(TeamColorArbiter.sameFamily("scarlet", "white")).toBe(false);
  });
});

describe("Parsing what the model returns", () => {
  it("strips fences, tolerates prose, lifts captions, and decodes the schema", () => {
    const fenced = "```json\n{\n  \"scene_type\": \"bench\",\n  \"players\": []\n}\n```";
    expect(CaptionResponseParser.unwrapFence(fenced).startsWith("{")).toBe(true);
    expect(CaptionResponseParser.unwrapFence(fenced)).not.toContain("```");
    expect(CaptionResponseParser.unwrapFence("{\"a\":1}")).toBe("{\"a\":1}");
    expect(CaptionResponseParser.unwrapFence("A caption.")).toBe("A caption.");
    expect(VisionResult.fromJSON(CaptionResponseParser.decodeJSON(fenced)).sceneType).toBe("bench");
    expect(VisionResult.fromJSON(CaptionResponseParser.decodeJSON("Here:\n{\"scene_type\":\"crowd\"}\nDone.")).sceneType).toBe("crowd");
    expect(CaptionResponseParser.prose("A basketball player warms up.")).toBe("A basketball player warms up.");
    expect(CaptionResponseParser.prose('{"caption":"Lifted out."}')).toBe("Lifted out.");
    expect(CaptionResponseParser.prose('{"caption":"He said \\"go\\"."}')).toBe('He said "go".');
    expect(() => CaptionResponseParser.prose('{"scene_type":"bench"}')).toThrow();
    expect(() => CaptionResponseParser.prose("   ")).toThrow();
    const v = VisionResult.fromJSON({ scene_type: "players_action", players: [{ jersey_number: "5", jersey_color: "blue", action: "shoots a jumper", confidence: 0.92, flags: [] }], interaction: null, group_action: null, primary_action: "first-half possession", scene_description: "", overall_confidence: 0.9 });
    expect(v.players[0].jerseyNumber).toBe("5"); expect(v.primaryAction).toBe("first-half possession");
    expect(VisionResult.fromJSON(VisionResult.toJSON(v))).toEqual(v);
    expect(SCENE_TYPES.length).toBe(10);
    expect(VisionResult.fromJSON({ scene_type: "nonsense" }).sceneType).toBe<SceneType>("other");
  });
});
