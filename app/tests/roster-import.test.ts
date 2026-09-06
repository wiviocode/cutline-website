// Team import: URL resolution, page parsing against real captured pages, colour mapping, the
// library's rules, CSV, and the text reduction that makes extraction affordable.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { TeamPageURL, MAXPREPS_SPORT_SLUG } from "../src/core/roster/TeamPageURL";
import { TeamPageParser } from "../src/core/roster/TeamPageParser";
import { TeamIdentity, HexColour } from "../src/core/roster/TeamIdentity";
import { SavedTeam, TeamLibrary } from "../src/core/roster/SavedTeam";
import { RosterImporter, EXTRACTION_PROMPT } from "../src/core/roster/RosterImporter";
import { Positions } from "../src/core/roster/Positions";
import { MaxPrepsRoster } from "../src/core/roster/MaxPrepsRoster";
import type { AnthropicClient } from "../src/core/anthropic/AnthropicClient";
import { CSVRosterImporter } from "../src/core/roster/CSVRosterImporter";
import { COLOUR_SYNONYMS } from "../src/core/roster/TeamColorArbiter";

const fixture = (name: string) => readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), "utf8");

describe("Working out the roster page from a pasted link", () => {
  it("understands the MaxPreps grammar", () => {
    const t = TeamPageURL.parse("https://www.maxpreps.com/ne/omaha/millard-south-patriots/")!;
    expect(t.site).toBe("maxPreps");
    expect(t.teamPath).toBe("/ne/omaha/millard-south-patriots");
    expect(TeamPageURL.rosterCandidates(t, "football", "mens")[0]).toBe("https://www.maxpreps.com/ne/omaha/millard-south-patriots/football/roster/");
    const girls = TeamPageURL.rosterCandidates(t, "basketball", "womens");
    expect(girls[0]).toBe("https://www.maxpreps.com/ne/omaha/millard-south-patriots/basketball/girls/roster/");
    expect(girls.length).toBe(2);
    expect(girls[1]).toBe("https://www.maxpreps.com/ne/omaha/millard-south-patriots/basketball/roster/");
    for (const section of ["football/", "basketball/roster/", "football/schedule/", "athletes/"]) {
      expect(TeamPageURL.parse(`https://www.maxpreps.com/ne/omaha/millard-south-patriots/${section}`)?.teamPath).toBe("/ne/omaha/millard-south-patriots");
    }
    const already = TeamPageURL.parse("https://www.maxpreps.com/ne/omaha/millard-south-patriots/football/roster/")!;
    expect(TeamPageURL.isRosterPage(already)).toBe(true);
    expect(TeamPageURL.rosterCandidates(already, "football", "mens")[0]).toBe("https://www.maxpreps.com/ne/omaha/millard-south-patriots/football/roster/");
    expect(MAXPREPS_SPORT_SLUG.trackAndField).toBe("track-field");
    expect(MAXPREPS_SPORT_SLUG.crossCountry).toBe("cross-country");
  });
  it("understands Sidearm, refuses API hosts, and tolerates bare input", () => {
    const sidearm = TeamPageURL.parse("https://huskers.com/sports/soccer/")!;
    expect(sidearm.site).toBe("sidearm");
    expect(TeamPageURL.rosterCandidates(sidearm, "soccer", "womens")[0]).toBe("https://huskers.com/sports/soccer/roster");
    const api = TeamPageURL.parse("https://site.api.espn.com/apis/site/v2/sports/soccer/usa.ncaa.w.1/teams/20328")!;
    expect(api.site).toBe("unknown");
    expect(TeamPageURL.rosterCandidates(api, "soccer", "womens")[0]).toBe("https://site.api.espn.com/apis/site/v2/sports/soccer/usa.ncaa.w.1/teams/20328");
    expect(TeamPageURL.parse("https://api.example.com/sports/soccer/")?.site).toBe("unknown");
    expect(TeamPageURL.parse("https://www.maxpreps.com/")?.teamPath).toBeNull();
    expect(TeamPageURL.parse("   ")).toBeNull();
    expect(TeamPageURL.parse("maxpreps.com/ne/omaha/millard-south-patriots/")?.site).toBe("maxPreps");
  });
});

describe("Parsing real team pages", () => {
  const mp = "https://www.maxpreps.com/ne/omaha/millard-south-patriots/football/roster/";
  const football = TeamPageParser.parse(fixture("teampages/maxpreps_football_boys.html"), mp)!;
  it("reads a MaxPreps page's structured block", () => {
    expect(football).not.toBeNull();
    expect(football.schoolName).toBe("Millard South");
    expect(football.mascot).toBe("Patriots");
    expect(TeamIdentity.fullName(football)).toBe("Millard South Patriots");
    expect(football.city).toBe("Omaha");
    expect(football.state).toBe("Neb.");
    expect(football.logoURL).toContain("school-mascot");
    expect(football.colorHexes).toEqual(["CC0022", "FFFFFF"]);
    expect(football.reportedGender).toBe("Boys");
    const girls = TeamPageParser.parse(fixture("teampages/maxpreps_basketball_girls.html"), mp)!;
    expect(girls.reportedGender).toBe("Girls");
    expect(girls.schoolName).toBe(football.schoolName);
  });
  it("falls back to Open Graph on a Sidearm page and invents nothing", () => {
    const husk = TeamPageParser.parse(fixture("teampages/sidearm_soccer.html"), "https://huskers.com/sports/soccer/roster")!;
    expect(husk).not.toBeNull();
    expect(husk.schoolName).toBe("Nebraska");
    expect(husk.logoURL).toBeTruthy();
    expect(husk.colorHexes).toEqual([]);
    expect(husk.mascot ?? null).toBeNull();
  });
  it("maps published hexes onto the matcher's vocabulary", () => {
    expect(HexColour.familyName("CC0022")).toBe("red");
    expect(HexColour.familyName("FFFFFF")).toBe("white");
    expect(HexColour.familyName("000000")).toBe("black");
    expect(HexColour.familyName("001E62")).toBe("blue");
    expect(HexColour.familyName("1F4EE0")).toBe("blue");
    expect(HexColour.familyName("E41C38")).toBe("red");
    expect(HexColour.familyName("FFC72C")).toBe("yellow");
    expect(HexColour.familyName("FFB81C")).toBe("yellow");
    expect(HexColour.familyName("FFCC00")).toBe("yellow");
    expect(HexColour.familyName("FF8200")).toBe("orange");
    expect(HexColour.familyName("F47321")).toBe("orange");
    expect(HexColour.familyName("CC5500")).toBe("orange");
    expect(HexColour.familyName("8B4513")).toBe("brown");
    expect(HexColour.familyName("7B3F00")).toBe("brown");
    expect(HexColour.familyName("154734")).toBe("green");
    expect(HexColour.familyName("FF7F27")).toBe("orange");
    expect(HexColour.familyName("5B2B82")).toBe("purple");
    expect(HexColour.familyName("9EA2A2")).toBe("grey");
    expect(HexColour.familyName("      ")).toBeNull();
    expect(HexColour.familyName("FFF")).toBeNull();
    expect(HexColour.familyName("#CC0022")).toBe("red");
    for (const hex of ["CC0022", "FFFFFF", "000000", "001E62", "FFC72C", "154734", "9EA2A2", "5B2B82"]) {
      expect(Object.keys(COLOUR_SYNONYMS)).toContain(HexColour.familyName(hex));
    }
    expect(TeamIdentity.suggestedKitColour(football)).toBe("red");
  });
  it("keeps a library keyed on the school", () => {
    const roster = [
      { jerseyNumber: "12", firstName: "Braxton", lastName: "Scroggs", position: "QB", classYear: "Sr." },
      { jerseyNumber: "7", firstName: "Lucas", lastName: "Waddell", position: "WR", classYear: "Jr." },
    ];
    const team = SavedTeam.make({ identity: football, level: "nebraskaHS", sport: "football", gender: "mens", players: roster });
    let lib = TeamLibrary.upsert([], team);
    expect(lib.length).toBe(1);
    expect(lib[0].players).toEqual(roster);
    lib = TeamLibrary.upsert(lib, SavedTeam.make({ identity: football, level: "nebraskaHS", sport: "football", gender: "mens", players: [...roster, ...roster] }));
    expect(lib.length).toBe(1); expect(lib[0].players.length).toBe(4); expect(lib[0].id).toBe(team.id);
    lib = TeamLibrary.upsert(lib, SavedTeam.make({ identity: football, level: "nebraskaHS", sport: "football", gender: "mens", players: [] }));
    expect(lib[0].players.length).toBe(4);
    const bball = SavedTeam.make({ identity: football, level: "nebraskaHS", sport: "basketball", gender: "mens", players: roster });
    lib = TeamLibrary.upsert(lib, bball);
    expect(lib.length).toBe(2);
    expect(SavedTeam.identityKey(team)).not.toBe(SavedTeam.identityKey(bball));
    const girls = SavedTeam.make({ identity: TeamPageParser.parse(fixture("teampages/maxpreps_basketball_girls.html"), mp)!, level: "nebraskaHS", sport: "basketball", gender: "womens", players: roster });
    expect(SavedTeam.identityKey(girls)).not.toBe(SavedTeam.identityKey(bball));
    expect(SavedTeam.genderMismatch(girls)).toBe(false);
    expect(SavedTeam.genderMismatch({ ...girls, gender: "mens" })).toBe(true);
    expect(TeamLibrary.remove(lib, bball.id).length).toBe(1);
    expect(SavedTeam.sportLabel(team)).toBe("Boys Football");
  });
});

describe("Reducing a page to something a model can read cheaply", () => {
  it("strips scripts and tags, including multi-line ones", () => {
    expect(RosterImporter.strip("<div>Jane Doe<script>var x = \"Ghost Player\";</script> 7</div>")).toBe("Jane Doe 7");
    expect(RosterImporter.strip("<p>Real</p><script>\nvar a = 1;\nvar b = 2;\n</script>")).not.toContain("var");
    expect(RosterImporter.strip("<b>A &amp; B</b>")).toBe("A & B");
  });
  it("recovers embedded JSON payloads and recognises an empty shell", () => {
    const html = "<script>{\"players\":[{\"name\":\"Jane Doe\",\"number\":\"7\"}]}" + " x".repeat(250) + "</script>";
    expect(RosterImporter.payloadText(html)).toContain("Jane Doe");
    expect(RosterImporter.looksLikeEmptyShell("Home About Schedule News ".repeat(100))).toBe(true);
    const real = fixture("teampages/maxpreps_football_boys.html");
    expect(RosterImporter.payloadText(real).length).toBeGreaterThan(0);
  });
});

describe("CSV rosters", () => {
  it("imports first/last and full-name files", () => {
    const r = CSVRosterImporter.import(fixture("roster-example.csv"));
    expect(r.players.length).toBe(11);
    expect(r.players[0].fullName).toBe("John Smith");
    expect(r.players[r.players.length - 1].role).toBe("coach");
    expect(r.players[0].position).toBe("QB");
    const alt = CSVRosterImporter.import(fixture("roster-example-alternative.csv"));
    expect(alt.players.length).toBe(10);
    expect(alt.players[0].firstName).toBe("John"); expect(alt.players[0].lastName).toBe("Smith");
    expect(alt.players.every((p) => p.role === "player")).toBe(true);
  });
  it("handles the documented edge cases and refuses garbage", () => {
    const messy = 'Number,Name,Pos\n7,Alpha Beta,G\n\n,Missing Jersey,F\n9,"Quoted, Name",C\n';
    const r = CSVRosterImporter.import(messy);
    expect(r.players.length).toBe(2);
    expect(r.skippedRows).toBeGreaterThanOrEqual(1);
    expect(r.players[1].fullName).toBe("Quoted, Name");
    expect(CSVRosterImporter.import("number,name,first_name,last_name\n5,Full Name,Ignored,Also\n").players[0].fullName).toBe("Full Name");
    expect(() => CSVRosterImporter.import("foo,bar\n1,2\n")).toThrow();
    expect(() => CSVRosterImporter.import("number,pos\n1,QB\n")).toThrow();
  });
});

describe("Positions and the unit they imply", () => {
  it("expands what a roster prints and knows which unit a football position is on", () => {
    expect(Positions.expand("QB", "football")).toBe("quarterback");
    expect(Positions.expand("MLB", "football")).toBe("middle linebacker");
    expect(Positions.expand("Running Back", "football")).toBe("running back");
    expect(Positions.expand("MF", "soccer")).toBe("midfielder");
    expect(Positions.expand("OH", "volleyball")).toBe("outside hitter");
    expect(Positions.expand("ZZ", "football")).toBe("ZZ");
    expect(Positions.side("QB", "football")).toBe("offense");
    expect(Positions.side("outside linebacker", "football")).toBe("defense");
    expect(Positions.side("K", "football")).toBe("specialTeams");
    expect(Positions.side("guard", "basketball")).toBe("unknown");
  });
  it("keeps a two-way player's other position only when it is on the other unit", () => {
    expect(Positions.parse("RB, MLB", "football")).toEqual({ position: "running back", side: "offense", secondary: { position: "middle linebacker", side: "defense" } });
    expect(Positions.parse("WR, TE", "football")).toEqual({ position: "wide receiver", side: "offense", secondary: null });
    expect(Positions.parse("MF/D", "soccer")).toEqual({ position: "midfielder", side: "unknown", secondary: null });
    expect(Positions.parse("", "football")).toEqual({ position: "", side: "unknown", secondary: null });
  });
});

describe("MaxPreps' embedded roster", () => {
  const html = fixture("teampages/maxpreps_roster.html");
  const silent = (): AnthropicClient => {
    let asked = 0;
    return { model: "x", get asked() { return asked; }, describeText: async () => { asked++; return { text: "[]", usage: { inputTokens: 0, outputTokens: 0, cacheCreationInputTokens: null, cacheReadInputTokens: null }, stopReason: null }; } } as unknown as AnthropicClient;
  };
  it("is read straight off the page, with both positions and no model", async () => {
    const players = MaxPrepsRoster.parse(html, "football")!;
    expect(players.map((p) => `${p.jerseyNumber} ${p.firstName} ${p.lastName}`)).toEqual(["2 Avery Stone", "3 Jordan Reyes", "55 Casey Nguyen", "8 Riley Okafor", "2 Sam Lindqvist"]);
    expect(players[0]).toMatchObject({ position: "running back", side: "offense", secondaryPosition: "middle linebacker", secondarySide: "defense", classYear: "Sr." });
    expect(players[3]).toMatchObject({ position: "quarterback", side: "offense", secondaryPosition: null });
    const client = silent();
    const r = await RosterImporter.importRoster(html, client, undefined, "football");
    expect(r.source).toBe("structured");
    expect(r.usage.inputTokens).toBe(0);
    expect((client as unknown as { asked: number }).asked).toBe(0);
  });
  it("refuses a row whose columns disagree, so a changed layout goes to the model instead", () => {
    expect(MaxPrepsRoster.parse(html.replace('"Avery Stone"', '"Somebody Else"'), "football")).toBeNull();
    expect(MaxPrepsRoster.parse(fixture("teampages/maxpreps_football_boys.html"), "football")).toBeNull();
    expect(MaxPrepsRoster.parse("<html></html>", "football")).toBeNull();
  });
});

describe("What the extraction model returns", () => {
  it("decodes rows as arrays — and the older objects — into positions with sides", () => {
    const rows = RosterImporter.decode('[["2","Sam","Mundt","RB, MLB","Sr.",""],["9","Ana","Geraneo","MF/D","",""]]', "football");
    expect(rows[0]).toMatchObject({ jerseyNumber: "2", position: "running back", side: "offense", secondaryPosition: "middle linebacker", secondarySide: "defense", classYear: "Sr." });
    const older = RosterImporter.decode('```json\n[{"jerseyNumber":"9","firstName":"A","lastName":"B","position":"midfielder"}]\n```', "soccer");
    expect(older[0]).toMatchObject({ jerseyNumber: "9", position: "midfielder", side: null, secondaryPosition: null });
    expect(RosterImporter.decode('[["22","C","D","WR","","defense"]]', "football")[0].side).toBe("defense");
    expect(EXTRACTION_PROMPT).toContain("RB, MLB");
    expect(() => RosterImporter.decode("no rows here", "football")).toThrow();
  });
});
