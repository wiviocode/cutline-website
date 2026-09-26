import { describe, it, expect } from "vitest";
import { parseHeadline } from "../src/core/sports/Headline";
import { RosterImport } from "../src/core/roster/RosterImport";
import { resizedSize, imageTokens, Crop } from "../src/core/vision/ImageSize";
import { Cost, TIERS } from "../src/core/ai/Models";
import { Prompt, colourName } from "../src/core/vision/Prompt";
import { Team, Player } from "../src/core/roster/Roster";
import { Levels } from "../src/core/sports/Sports";

describe("what the photographs already say", () => {
  it("reads a desk's event headline", () => {
    expect(parseHeadline("Nebraska Football v Bowling Green State University - 2026-09-12")).toEqual({ home: "Nebraska", away: "Bowling Green State University", sport: "football", gender: null, level: null });
    expect(parseHeadline("Nebraska Women's Soccer v Indiana University - 2026-09-10")).toMatchObject({ home: "Nebraska", away: "Indiana University", sport: "soccer", gender: "womens", level: "college" });
    expect(parseHeadline("Waverly Girls Volleyball v Gretna - 2026-09-24")).toMatchObject({ home: "Waverly", away: "Gretna", sport: "volleyball", gender: "womens", level: "highSchool" });
    expect(parseHeadline("Media day portraits")).toBeNull();
  });
});

describe("roster links", () => {
  const college = { sport: "volleyball" as const, gender: "womens" as const, level: "college" as const };
  it("turns an athletics home page into its roster pages", () => {
    expect(RosterImport.candidates("huskers.com", college)).toEqual(["https://huskers.com/sports/volleyball/roster", "https://huskers.com/sports/womens-volleyball/roster"]);
    expect(RosterImport.candidates("https://goheels.com/sports/womens-volleyball/schedule", college)).toEqual(["https://goheels.com/sports/womens-volleyball/roster"]);
    expect(RosterImport.candidates("https://bgsufalcons.com/sports/football/roster?view=2", { ...college, sport: "football", gender: "mens" })).toEqual(["https://bgsufalcons.com/sports/football/roster?view=2"]);
  });
  it("turns a MaxPreps team page into the roster for the sport and gender", () => {
    const hs = { sport: "volleyball" as const, gender: "womens" as const, level: "highSchool" as const };
    expect(RosterImport.candidates("maxpreps.com/ne/waverly/waverly-vikings/", hs)[0]).toBe("https://www.maxpreps.com/ne/waverly/waverly-vikings/volleyball/roster/");
    expect(RosterImport.candidates("https://www.maxpreps.com/ne/gretna/gretna-dragons/football/schedule/", { ...hs, sport: "football", gender: "mens" })[0]).toBe("https://www.maxpreps.com/ne/gretna/gretna-dragons/football/roster/");
    expect(RosterImport.candidates("https://www.maxpreps.com/ne/omaha/millard-south-patriots/", { ...hs, sport: "basketball", gender: "womens" })[0]).toBe("https://www.maxpreps.com/ne/omaha/millard-south-patriots/basketball/girls/roster/");
  });
  it("follows a MaxPreps team page to a sport filed under its season, varsity first", async () => {
    const home = `<a href="/ne/waverly/waverly-vikings/softball/jv/">JV</a><a href="/ne/waverly/waverly-vikings/softball/fall/">Softball</a><a href="/ne/waverly/waverly-vikings/softball/fall/schedule/">Schedule</a><a href="/ne/waverly/waverly-vikings/football/">FB</a>`;
    const urls = await RosterImport.maxPrepsSeasonal("maxpreps.com/ne/waverly/waverly-vikings/", { sport: "softball", gender: "womens", level: "highSchool" }, async () => ({ url: "", text: home }));
    expect(urls[0]).toBe("https://www.maxpreps.com/ne/waverly/waverly-vikings/softball/fall/roster/");
    expect(urls).toContain("https://www.maxpreps.com/ne/waverly/waverly-vikings/softball/jv/roster/");
    expect(urls.some((u) => u.includes("schedule"))).toBe(false);
    expect(urls.some((u) => u.includes("football"))).toBe(false);
  });

  it("reduces a page to text a model can read, including script payloads", () => {
    const html = `<html><head><style>.x{}</style></head><body><nav>Home</nav><script>window.__DATA__ = {"players":[{"name":"Jane Doe","number":"12"}]} ${" ".repeat(500)}</script></body></html>`;
    const t = RosterImport.pageText(html);
    expect(t).toContain("Jane Doe");
    expect(t).not.toContain(".x{}");
  });
});

describe("image size and cost", () => {
  it("sizes a frame exactly as Claude would, so boxes map back one to one", () => {
    expect(resizedSize(1075, 1520, 1568, 1568)).toEqual([924, 1307]);
    const [w, h] = resizedSize(8640, 5760, 2576, 2400);
    expect(imageTokens(w, h)).toBeLessThanOrEqual(2400);
    expect(w / h).toBeCloseTo(1.5, 1);
  });
  it("crops around a box with room to spare, inside the photograph", () => {
    const c = Crop.around([900, 500, 1000, 700], { width: 2000, height: 1333 }, { width: 8000, height: 5332 });
    expect(c.x1).toBeGreaterThanOrEqual(0);
    expect(c.x2).toBeLessThanOrEqual(8000);
    expect(c.x2 - c.x1).toBeGreaterThan(400 * 1.2);
  });
  it("prices the tiers in the order they are offered", () => {
    expect(Cost.perPhoto("economy")).toBeLessThan(Cost.perPhoto("balanced"));
    expect(Cost.perPhoto("balanced")).toBeLessThan(Cost.perPhoto("best"));
    expect(Cost.perPhoto("balanced") * 1000).toBeGreaterThan(15);
    expect(Cost.perPhoto("balanced") * 1000).toBeLessThan(25);
    expect(TIERS.economy.model).toBe("claude-sonnet-5");
  });
});

describe("the prompt", () => {
  it("carries both rosters and today's uniforms, and nothing that varies by photograph", () => {
    const a = Team.make({ school: "Nebraska", nickname: "Cornhuskers", uniform: "white jerseys, red numbers", players: [Player.make({ number: "15", firstName: "Andi", lastName: "Jackson", positionAbbr: "MB" })] });
    const b = Team.make({ school: "North Carolina", colors: ["7BAFD4"], players: [Player.make({ number: "3", firstName: "Lauren", lastName: "Schutter", positionAbbr: "MB" })] });
    const p = Prompt.system({ sport: "volleyball", gender: "womens", level: Levels.info("ncaa-d1"), matchup: { a, b } });
    expect(p).toContain("Team A — Nebraska Cornhuskers. Wearing today: white jerseys, red numbers.");
    expect(p).toContain("15 Andi Jackson (MB)");
    expect(p).toContain("school colours blue");
    expect(p).toContain("libero");
    expect(p).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });
  it("names colours roughly", () => {
    expect(colourName("CC0022")).toBe("red");
    expect(colourName("00824B")).toBe("dark green");
    expect(colourName("FFFFFF")).toBe("white");
  });
});
