import { describe, it, expect } from "vitest";
import { Compose, type CaptionContext } from "../src/core/caption/Compose";
import { Identify } from "../src/core/vision/Identify";
import { Observation, type Subject } from "../src/core/vision/Observation";
import { Team, Player, type Matchup } from "../src/core/roster/Roster";
import { Levels } from "../src/core/sports/Sports";

const p = (number: string, first: string, last: string, position = "", positionAbbr = "") =>
  Player.make({ number, firstName: first, lastName: last, position, positionAbbr });

const nebraskaVB = Team.make({ school: "Nebraska", nickname: "Cornhuskers", players: [
  p("3", "Virginia", "Adriano", "opposite", "OPP"), p("11", "Teraya", "Sigler", "outside hitter", "OH"),
  p("15", "Andi", "Jackson", "middle blocker", "MB"), p("27", "Harper", "Murray", "outside hitter", "OH"), p("2", "Bergen", "Reilly", "setter", "S"),
] });
const unc = Team.make({ school: "North Carolina", nickname: "Tar Heels", players: [
  p("22", "Safi", "Hampton", "outside hitter", "OH"), p("21", "Jackie", "Taylor", "middle blocker", "MB"), p("3", "Lauren", "Schutter", "middle blocker", "MB"),
] });
const vb: Matchup = { a: nebraskaVB, b: unc };

const subject = (x: Partial<Subject> & { id: string }): Subject => ({
  kind: "athlete", team: "A", number: "", numberOn: "chest", clarity: "clear", player: "", role: "", uniformText: "", box: null, ...x,
});

const apCtx = (matchup: Matchup, sport: CaptionContext["sport"], date: Date): CaptionContext => ({
  style: "apSports", sport, gender: "womens", level: Levels.info("ncaa-d1"), matchup,
  city: "Lincoln", state: "Nebraska", captureDate: date, photographer: "Eli Larson", house: "Nebraska Athletics", unnamed: "placeholder",
});

function compose(obs: Observation, ctx: CaptionContext) {
  const ids = Identify.all(obs, { matchup: ctx.matchup, unitSport: ctx.sport === "football" });
  return Compose.caption(obs, ids, ctx).caption;
}

describe("captions in the desk's own style", () => {
  const sept18 = new Date(2026, 8, 18, 19, 0);

  it("AP: one player against the opponent", () => {
    const obs: Observation = { scene: "action", timing: "during", clause: "{P1} spikes the ball over {P2}", subjects: [
      subject({ id: "P1", team: "A", number: "15", player: "15 Andi Jackson" }),
      subject({ id: "P2", team: "B", number: "3", player: "3 Lauren Schutter" }),
    ] };
    expect(compose(obs, apCtx(vb, "volleyball", sept18))).toBe(
      "Nebraska middle blocker Andi Jackson (15) spikes the ball over North Carolina middle blocker Lauren Schutter (3) during an NCAA college volleyball match, Friday, Sept. 18, 2026, in Lincoln, Neb. (Nebraska Athletics/Eli Larson)");
  });

  it("AP: one team named, the other becomes the opponent", () => {
    const obs: Observation = { scene: "celebration", timing: "during", clause: "{P1} celebrates", subjects: [subject({ id: "P1", team: "A", number: "11" })] };
    expect(compose(obs, apCtx(vb, "volleyball", sept18))).toBe(
      "Nebraska outside hitter Teraya Sigler (11) celebrates during an NCAA college volleyball match against North Carolina, Friday, Sept. 18, 2026, in Lincoln, Neb. (Nebraska Athletics/Eli Larson)");
  });

  it("AP: a scene with no team names both", () => {
    const obs: Observation = { scene: "wide", timing: "during", clause: "A general view of {venue}", subjects: [] };
    const ctx = { ...apCtx(vb, "volleyball", sept18), venue: "Bob Devaney Sports Center" };
    expect(compose(obs, ctx)).toBe(
      "A general view of Bob Devaney Sports Center during an NCAA college volleyball match between Nebraska and North Carolina, Friday, Sept. 18, 2026, in Lincoln, Neb. (Nebraska Athletics/Eli Larson)");
  });

  it("AP: the team as a group", () => {
    const obs: Observation = { scene: "huddle", timing: "during", clause: "{A:players} huddle between points", subjects: [] };
    expect(compose(obs, apCtx(vb, "volleyball", sept18))).toBe(
      "Nebraska players huddle between points during an NCAA college volleyball match against North Carolina, Friday, Sept. 18, 2026, in Lincoln, Neb. (Nebraska Athletics/Eli Larson)");
  });

  it("AP: before the game", () => {
    const obs: Observation = { scene: "portrait", timing: "before", clause: "{A:players} stand for pregame introductions", subjects: [] };
    expect(compose(obs, apCtx(vb, "volleyball", sept18))).toMatch(/^Nebraska players stand for pregame introductions before an NCAA college volleyball match against North Carolina, Friday/);
  });

  it("AP: an unreadable number becomes the desk's placeholder, with the team", () => {
    const obs: Observation = { scene: "action", timing: "during", clause: "{P1} blocks the spike", subjects: [subject({ id: "P1", team: "B", number: "", clarity: "hidden" })] };
    expect(compose(obs, apCtx(vb, "volleyball", sept18))).toMatch(/^North Carolina XXXXX blocks the spike during an NCAA college volleyball match against Nebraska,/);
  });

  describe("Hurrdat, high school", () => {
    const waverly = Team.make({ school: "Waverly", nickname: "Vikings", players: [p("3", "Gracie", "Lauenstein", "outside hitter", "OH"), p("2", "Aubree", "Real", "middle hitter", "MH")] });
    const gretna = Team.make({ school: "Gretna", nickname: "Dragons", players: [p("10", "Kyla", "Gangwish", "libero", "L"), p("7", "Samantha", "Hagaman", "setter", "S")] });
    const ctx: CaptionContext = {
      style: "hurrdatSports", sport: "volleyball", gender: "womens", level: Levels.info("hs"), matchup: { a: waverly, b: gretna },
      venue: "Waverly High School Gymnasium", city: "Waverly", state: "NE", captureDate: new Date(2026, 8, 24, 19), photographer: "Eli Larson", house: "Hurdatt", unnamed: "placeholder",
    };

    it("names the player with the team singular and puts the opponent before the game clause", () => {
      const obs: Observation = { scene: "action", timing: "during", clause: "{P1} digs the ball", subjects: [subject({ id: "P1", team: "A", number: "3" })] };
      expect(compose(obs, ctx)).toBe(
        "Waverly Viking Gracie Lauenstein (3) digs the ball against the Gretna Dragons during a high school volleyball match, Thursday, Sept. 24, 2026, at Waverly High School Gymnasium in Waverly, Neb. Photo by Eli Larson/Hurdatt.");
    });

    it("keeps the teams straight when the subject is the visitor", () => {
      const obs: Observation = { scene: "action", timing: "during", clause: "{P1} serves the ball", subjects: [subject({ id: "P1", team: "B", number: "7" })] };
      expect(compose(obs, ctx)).toBe(
        "Gretna Dragon Samantha Hagaman (7) serves the ball against the Waverly Vikings during a high school volleyball match, Thursday, Sept. 24, 2026, at Waverly High School Gymnasium in Waverly, Neb. Photo by Eli Larson/Hurdatt.");
    });

    it("fans between the two teams", () => {
      const obs: Observation = { scene: "crowd", timing: "during", clause: "Fans cheer from the stands", subjects: [] };
      expect(compose(obs, ctx)).toBe(
        "Fans cheer from the stands between the Waverly Vikings and the Gretna Dragons during a high school volleyball match, Thursday, Sept. 24, 2026, at Waverly High School Gymnasium in Waverly, Neb. Photo by Eli Larson/Hurdatt.");
    });

    it("drops the model's article before 'members of'", () => {
      const obs: Observation = { scene: "portrait", timing: "before", clause: "{P1} walks down the stairs with the {B:players}", subjects: [subject({ id: "P1", team: "B", number: "7" })] };
      expect(compose(obs, ctx)).toMatch(/^Gretna Dragon Samantha Hagaman \(7\) walks down the stairs with members of the Gretna Dragons against the Waverly Vikings before a high school volleyball match/);
    });

    it("members of the team, and a coach", () => {
      const obs: Observation = { scene: "celebration", timing: "during", clause: "{A:players} celebrate together on the sideline", subjects: [] };
      expect(compose(obs, ctx)).toMatch(/^Members of the Waverly Vikings celebrate together on the sideline against the Gretna Dragons during a high school volleyball match/);
      const coach: Observation = { scene: "coach", timing: "during", clause: "{P1} talks to her players in a huddle", subjects: [subject({ id: "P1", kind: "coach", team: "B", role: "coach" })] };
      expect(compose(coach, ctx)).toMatch(/^A Gretna Dragons coach talks to her players in a huddle against the Waverly Vikings during/);
    });
  });

  it("football: a number shared by offense and defense is settled by the play", () => {
    const bg = Team.make({ school: "Bowling Green", nickname: "Falcons", players: [p("1", "Drey", "Braxton", "defensive back", "DB")] });
    const ne = Team.make({ school: "Nebraska", nickname: "Cornhuskers", players: [
      Player.make({ number: "1", firstName: "Nyziah", lastName: "Hunter", position: "wide receiver", positionAbbr: "WR", side: "offense" }),
      Player.make({ number: "1", firstName: "Ceyair", lastName: "Wright", position: "defensive back", positionAbbr: "DB", side: "defense" }),
    ] });
    const obs: Observation = { scene: "action", timing: "during", clause: "{P1} hurdles {P2}", subjects: [
      subject({ id: "P1", team: "A", number: "1", role: "ball carrier" }),
      subject({ id: "P2", team: "B", number: "1", role: "tackler" }),
    ] };
    const ctx = { ...apCtx({ a: ne, b: bg }, "football", new Date(2026, 8, 12, 15)), gender: "mens" as const };
    expect(compose(obs, ctx)).toBe(
      "Nebraska wide receiver Nyziah Hunter (1) hurdles Bowling Green defensive back Drey Braxton (1) during an NCAA college football game, Saturday, Sept. 12, 2026, in Lincoln, Neb. (Nebraska Athletics/Eli Larson)");
  });

  it("fixes the article in front of a rendered team", () => {
    const iu = Team.make({ school: "Indiana", nickname: "Hoosiers", players: [] });
    const obs: Observation = { scene: "coach", timing: "during", clause: "{P1} talks with a {B} assistant", subjects: [subject({ id: "P1", kind: "coach", team: "A", role: "head coach" })] };
    const ctx = { ...apCtx({ a: nebraskaVB, b: iu }, "soccer", sept18) };
    expect(compose(obs, ctx)).toMatch(/^A Nebraska head coach talks with an Indiana assistant during an NCAA college soccer match,/);
  });

  it("decodes a model reply, including one missing fields", () => {
    const o = Observation.fromJSON({ scene: "action", subjects: [{ id: "P1", team: "A", number: "#15", clarity: "clear", box: [1, 2, 3, 4] }], clause: "{P1} spikes the ball" });
    expect(o.subjects[0]).toMatchObject({ number: "15", kind: "athlete", box: [1, 2, 3, 4] });
    expect(o.timing).toBe("during");
    expect(Observation.fromJSON(null)).toMatchObject({ scene: "other", subjects: [], clause: "" });
  });
});

describe("identification against the roster", () => {
  const ctx = { matchup: vb, unitSport: false };
  it("confirms a clear, unique number and flags a soft one", () => {
    const [a] = Identify.all({ scene: "action", timing: "during", clause: "", subjects: [subject({ id: "P1", team: "A", number: "15" })] }, ctx);
    expect(a).toMatchObject({ status: "confirmed", teamKey: "A" });
    expect(a.player?.lastName).toBe("Jackson");
    const [b] = Identify.all({ scene: "action", timing: "during", clause: "", subjects: [subject({ id: "P1", team: "A", number: "15", clarity: "partial" })] }, ctx);
    expect(b.status).toBe("likely");
  });

  it("never believes a roster pick whose digits it did not see", () => {
    const [a] = Identify.all({ scene: "action", timing: "during", clause: "", subjects: [subject({ id: "P1", team: "A", number: "", clarity: "hidden", player: "15 Andi Jackson" })] }, ctx);
    expect(a.status).toBe("unknown");
    expect(a.player).toBeNull();
  });

  it("does not substitute a similar number for a clear read that matches nobody", () => {
    const [a] = Identify.all({ scene: "action", timing: "during", clause: "", subjects: [subject({ id: "P1", team: "A", number: "16" })] }, ctx);
    expect(a.status).toBe("unknown");
    expect(a.alternatives.map((x) => x.number)).toContain("15");
    const [b] = Identify.all({ scene: "action", timing: "during", clause: "", subjects: [subject({ id: "P1", team: "A", number: "16", clarity: "partial" })] }, ctx);
    expect(b).toMatchObject({ status: "likely", source: "fuzzy" });
    expect(b.player?.number).toBe("15");
  });

  it("takes the team from the number when the uniform did not say", () => {
    const [a] = Identify.all({ scene: "action", timing: "during", clause: "", subjects: [subject({ id: "P1", team: "unsure", number: "22" })] }, ctx);
    expect(a).toMatchObject({ status: "likely", teamKey: "B" });
    const [b] = Identify.all({ scene: "action", timing: "during", clause: "", subjects: [subject({ id: "P1", team: "unsure", number: "3" })] }, ctx);
    expect(b.status).toBe("unknown");
  });

  it("a hidden digit names a player only when one roster number fits", () => {
    const [a] = Identify.all({ scene: "action", timing: "during", clause: "", subjects: [subject({ id: "P1", team: "A", number: "2?", clarity: "partial" })] }, ctx);
    expect(a).toMatchObject({ status: "likely" });
    expect(a.player?.number).toBe("27");
    const [b] = Identify.all({ scene: "action", timing: "during", clause: "", subjects: [subject({ id: "P1", team: "B", number: "2?", clarity: "partial" })] }, ctx);
    expect(b.status).toBe("unknown");
    expect(b.alternatives.map((p) => p.number).sort()).toEqual(["21", "22"]);
    expect(Observation.fromJSON({ subjects: [{ number: "1?", clarity: "clear" }] }).subjects[0].clarity).toBe("partial");
  });

  it("a nameplate settles a shared number and outranks a misread one", () => {
    const bg = Team.make({ school: "Bowling Green", players: [
      Player.make({ number: "0", firstName: "Kal-El", lastName: "Pascal", position: "safety", side: "defense" }),
      Player.make({ number: "0", firstName: "Jeremiah", lastName: "Scoby", position: "tight end", side: "offense" }),
    ] });
    const ne = Team.make({ school: "Nebraska", players: [Player.make({ number: "32", firstName: "Trent", lastName: "Uhlir" }), Player.make({ number: "33", firstName: "Jaylen", lastName: "Jones" })] });
    const m = { matchup: { a: ne, b: bg }, unitSport: true };
    const [scoby] = Identify.all({ scene: "action", timing: "during", clause: "{P1} chases the ball carrier", subjects: [subject({ id: "P1", team: "B", number: "0", uniformText: "SCOBY", role: "tackler" })] }, m);
    expect(scoby.player?.lastName).toBe("Scoby");
    expect(scoby.status).toBe("confirmed");
    const [jones] = Identify.all({ scene: "action", timing: "during", clause: "", subjects: [subject({ id: "P1", team: "A", number: "32", uniformText: "J. JONES" })] }, m);
    expect(jones).toMatchObject({ status: "likely" });
    expect(jones.player?.lastName).toBe("Jones");
  });

  it("never names one player twice", () => {
    const ids = Identify.all({ scene: "action", timing: "during", clause: "{P1} and {P2}", subjects: [
      subject({ id: "P1", team: "B", number: "21" }), subject({ id: "P2", team: "B", number: "21", clarity: "partial" }),
    ] }, ctx);
    expect(ids[0].player?.lastName).toBe("Taylor");
    expect(ids[1].player).toBeNull();
  });

  it("plausible misreads", () => {
    expect(Identify.isPlausibleMisread("7", "17")).toBe(true);
    expect(Identify.isPlausibleMisread("16", "15")).toBe(true);
    expect(Identify.isPlausibleMisread("0", "00")).toBe(false);
    expect(Identify.isPlausibleMisread("12", "45")).toBe(false);
  });
});
