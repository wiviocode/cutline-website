import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { RosterPages } from "../src/core/roster/RosterPages";
import { Player } from "../src/core/roster/Roster";

const page = (name: string) =>
  gunzipSync(readFileSync(fileURLToPath(new URL(`./fixtures/rosters/${name}.html.gz`, import.meta.url)))).toString("utf8");

describe("roster pages read without a model", () => {
  it("reads a WMT page (huskers.com volleyball) with numbers, positions and headshots", () => {
    const r = RosterPages.parse(page("wmt_nebraska_volleyball"), "https://huskers.com/sports/volleyball/roster", "volleyball")!;
    expect(r.source).toBe("wmt");
    expect(r.identity.school).toBe("Nebraska");
    const reilly = r.players.find((p) => p.lastName === "Reilly")!;
    expect(reilly.number).toBe("2");
    expect(reilly.position).toBe("setter");
    expect(reilly.headshotURL).toMatch(/^https:\/\/huskers\.com\/imgproxy\//);
    const jackson = r.players.find((p) => p.lastName === "Jackson" && p.firstName === "Andi")!;
    expect(jackson.number).toBe("15");
    expect(r.players.length).toBeGreaterThan(12);
    expect(r.players.every((p) => p.firstName && p.lastName)).toBe(true);
  });

  it("reads a Sidearm NextGen page (goheels.com volleyball)", () => {
    const r = RosterPages.parse(page("sidearm_next_unc_volleyball"), "https://goheels.com/sports/womens-volleyball/roster", "volleyball")!;
    expect(r.source).toBe("sidearm-nextgen");
    expect(r.identity.school).toBe("North Carolina");
    const hampton = r.players.find((p) => p.lastName === "Hampton")!;
    expect(hampton.number).toBe("22");
    expect(hampton.position).toBe("outside hitter");
    expect(hampton.headshotURL).toMatch(/^https:\/\/goheels\.com\/images\//);
    expect(r.players.find((p) => p.lastName === "Taylor" && p.firstName === "Jackie")?.number).toBe("21");
  });

  it("reads a classic Sidearm page (fightinghawks.com football) with football units", () => {
    const r = RosterPages.parse(page("sidearm_classic_und_football"), "https://fightinghawks.com/sports/football/roster", "football")!;
    expect(r.source).toBe("sidearm-classic");
    expect(r.identity.school).toBe("North Dakota");
    expect(r.players.length).toBeGreaterThan(80);
    const rucker = r.players.find((p) => p.lastName === "Rucker")!;
    expect(rucker.number).toBe("0");
    expect(rucker.side).toBe("defense");
    expect(rucker.headshotURL).toMatch(/Rucker__Lance\.jpg$/);
    // Every row got a number or is honestly blank; none carries markup.
    expect(r.players.every((p) => !/[<>]/.test(Player.fullName(p) + p.number))).toBe(true);
  });

  it("reads MaxPreps with the school, mascot and colours", () => {
    const r = RosterPages.parse(page("maxpreps_waverly_volleyball"), "https://www.maxpreps.com/ne/waverly/waverly-vikings/volleyball/roster/", "volleyball")!;
    expect(r.source).toBe("maxpreps");
    expect(r.identity).toMatchObject({ school: "Waverly", nickname: "Vikings", state: "Nebraska" });
    expect(r.identity.colors[0]).toBe("52000E");
    const g = r.players.find((p) => p.lastName === "Lauenstein")!;
    expect(g).toMatchObject({ number: "3", position: "outside hitter" });
  });

  it("keeps both of a two-way high-school football player's positions", () => {
    const r = RosterPages.parse(page("maxpreps_gretna_football"), "https://www.maxpreps.com/ne/gretna/gretna-dragons/football/roster/", "football")!;
    const sliva = r.players.find((p) => p.lastName === "Sliva")!;
    expect(sliva.number).toBe("1");
    expect(sliva.side).toBe("defense");
    expect(sliva.secondary).toEqual({ position: "wide receiver", side: "offense" });
    expect(Player.positionFor(sliva, "offense")).toBe("wide receiver");
    expect(Player.positionFor(sliva, "defense")).toBe("free safety");
  });

  it("cleans athletics site names into what a caption calls the school", () => {
    expect(RosterPages.cleanSiteName("University of Nebraska - Official Athletics Website")).toBe("Nebraska");
    expect(RosterPages.cleanSiteName("Bowling Green State University Athletics")).toBe("Bowling Green State University");
    expect(RosterPages.cleanSiteName("University of North Dakota Athletics")).toBe("North Dakota");
  });

  it("returns null for a page with no roster data it can trust", () => {
    expect(RosterPages.parse("<html><body>Roster coming soon</body></html>", "https://example.com", "soccer")).toBeNull();
  });
});
