// HDS filenames, the editable pattern, and the rename plan. Renaming is destructive and
// irreversible in practice — a card renamed wrongly is a card the desk cannot match to a story —
// so these care less about the happy path than about what a typed pattern must never produce.

import { describe, it, expect } from "vitest";
import { HDSNaming, type Fixture } from "../src/core/naming/HDSNaming";
import { NamingPattern } from "../src/core/naming/NamingPattern";
import { PhotoRenamer } from "../src/core/naming/PhotoRenamer";
import { Shortened } from "../src/core/naming/Shortened";
import { localDate } from "../src/core/images/PhotoMetadata";

const sept9 = localDate(2023, 9, 9);
const home: Fixture = { initials: "JSP", date: sept9, sportCode: "FB", covered: "Nebraska", opponent: "Ohio State", coveredIsHome: true };
const away: Fixture = { ...home, coveredIsHome: false };
const name = (pattern: string, f: Fixture, n = 1) => NamingPattern.filename(pattern, f, n, "jpg");

describe("The document's worked examples", () => {
  it("reproduces home and away, with the school table as the authority on Ohio State", () => {
    expect(HDSNaming.filename(home, 1, "jpg")).toBe("JSP20230909_FB_NU_v_OSU_0001.jpg");
    expect(HDSNaming.filename(home, 1, "jpg").replace("_OSU_", "_OS_")).toBe("JSP20230909_FB_NU_v_OS_0001.jpg");
    expect(HDSNaming.schoolCode("Ohio State").code).toBe("OSU");
    expect(HDSNaming.filename(away, 1, "jpg")).toBe("JSP20230909_FB_NU_at_OSU_0001.jpg");
    expect(HDSNaming.filename(home, 1, "jpg").replace("_v_", "_at_")).toBe(HDSNaming.filename(away, 1, "jpg"));
    expect(HDSNaming.filename(home, 7, "jpg")).toContain("_0007.");
    expect(HDSNaming.filename(home, 1234, "jpg")).toContain("_1234.");
    expect(HDSNaming.filename(home, 1, "JPG").endsWith(".jpg")).toBe(true);
    expect(HDSNaming.dateStamp(sept9)).toBe("20230909");
  });
  it("gives sport codes", () => {
    expect(HDSNaming.sportCode("football", "mens")).toBe("FB");
    expect(HDSNaming.sportCode("volleyball", "womens")).toBe("VB");
    expect(HDSNaming.sportCode("soccer", "mens")).toBe("MSOC");
    expect(HDSNaming.sportCode("soccer", "womens")).toBe("WSOC");
    expect(HDSNaming.sportCode("basketball", "mens")).toBe("MBB");
    expect(HDSNaming.sportCode("basketball", "womens")).toBe("WBB");
    expect(HDSNaming.sportCode("trackAndField", "mens")).toBe("TF");
    expect(HDSNaming.sportCode("hockey", "mens")).toBe("MHKY");
    expect(HDSNaming.sportCode("hockey", "womens")).toBe("WHKY");
    expect(HDSNaming.sportCode("wrestling", "mens")).toBe("WRES");
    expect(HDSNaming.sportCode("fieldHockey", "womens")).toBe("FH");
    expect(HDSNaming.sportCode("horseRacing", "mens")).toBe("HORSE");
    expect(HDSNaming.sportCode("curling", "mens")).toBeNull();
  });
  it("gives school codes, and marks the guesses", () => {
    expect(HDSNaming.schoolCode("Nebraska").code).toBe("NU");
    expect(HDSNaming.schoolCode("Nebraska Cornhuskers").code).toBe("NU");
    expect(HDSNaming.schoolCode("Creighton Bluejays").code).toBe("CU");
    expect(HDSNaming.schoolCode("Michigan State").code).toBe("MSU");
    expect(HDSNaming.schoolCode("St. John's").code).toBe("SJ");
    expect(HDSNaming.schoolCode("nebraska").code).toBe("NU");
    expect(HDSNaming.schoolCode("Nebraska").isKnown).toBe(true);
    const unknown = HDSNaming.schoolCode("Millard South Patriots");
    expect(unknown.code).toBe("MS"); expect(unknown.isKnown).toBe(false);
    expect(HDSNaming.schoolCode("Kearney").code).toBe("KEA");
    expect(HDSNaming.schoolCode("Notre Dame").code).toBe("ND");
    expect(HDSNaming.schoolCode("Notre Dame Fighting Irish").code).toBe("ND");
    expect(HDSNaming.schoolCode("Notre Dame").isKnown).toBe(false);
    // A hyphenated school is two words; a plural nickname marks where the school ends.
    expect(HDSNaming.schoolCode("Ashland-Greenwood Bluejays").code).toBe("AG");
    expect(HDSNaming.schoolCode("Ashland-Greenwood").code).toBe("AG");
    expect(HDSNaming.schoolCode("Syracuse Rockets").code).toBe("SYR");
    expect(HDSNaming.schoolCode("Syracuse").code).toBe("SYR");
  });
  it("makes initials", () => {
    expect(HDSNaming.initials("Eli Larson")).toBe("EL");
    expect(HDSNaming.initials("John S Peterson")).toBe("JSP");
    expect(HDSNaming.initials("JSP")).toBe("JSP");
    expect(HDSNaming.initials("  ")).toBe("");
  });
});

describe("The pattern", () => {
  it("defaults to HDS and can be reordered", () => {
    expect(name(NamingPattern.hurrdat, home)).toBe("JSP20230909_FB_NU_v_OSU_0001.jpg");
    expect(name(NamingPattern.hurrdat, away)).toBe("JSP20230909_FB_NU_at_OSU_0001.jpg");
    expect(name(NamingPattern.hurrdat, home)).toBe(HDSNaming.filename(home, 1, "jpg"));
    expect(NamingPattern.stem("{team}", away, 1)).toBe("NU");
    expect(NamingPattern.stem("{home}_{away}", away, 1)).toBe("OSU_NU");
    expect(NamingPattern.stem("{seq}", home, 42)).toBe("0042");
    expect(NamingPattern.stem("{date}", home, 1)).toBe("20230909");
    expect(name("{date}-{sport}-{seq}", home)).toBe("20230909-FB-0001.jpg");
    expect(name("frame", home)).toBe("frame.jpg");
  });
  it("never lets a typed pattern reach the file system unsafely", () => {
    expect(NamingPattern.stem("a/b", home, 1)).toBe("a_b");
    expect(NamingPattern.stem("a:b", home, 1)).not.toContain(":");
    expect(NamingPattern.stem("", home, 1)).not.toBe("");
    expect(NamingPattern.stem("   ", home, 1)).not.toBe("");
    expect(NamingPattern.stem("...x", home, 1).startsWith(".")).toBe(false);
    expect(NamingPattern.unknownTokens("{tema}_{seq}")).toEqual(["{tema}"]);
    expect(NamingPattern.unknownTokens(NamingPattern.hurrdat)).toEqual([]);
    expect(NamingPattern.tokens.every((t) => NamingPattern.unknownTokens(t.token).length === 0)).toBe(true);
    expect(NamingPattern.stem("{tema}", home, 1)).toBe("{tema}");
    expect(name(NamingPattern.hurrdat, home, 1)).not.toBe(name(NamingPattern.hurrdat, home, 2));
  });
  it("shortens a name in the middle so frames stay distinguishable", () => {
    const long = "8B7A0413_Lincoln_Southwest_v_North_Star_20.jpg";
    expect(Shortened.middle("IMG_0001.JPG", 22)).toBe("IMG_0001.JPG");
    expect(Shortened.middle("x".repeat(22), 22).length).toBe(22);
    expect(Shortened.middle(long, 22).length).toBe(22);
    expect(Shortened.middle(long, 22)).toContain("…");
    expect(Shortened.middle(long, 22).endsWith("_20.jpg")).toBe(true);
    expect(Shortened.middle(long, 22).startsWith("8B7A")).toBe(true);
    expect(Shortened.middle(long, 22)).not.toBe(Shortened.middle(long.replace("_20.jpg", "_21.jpg"), 22));
    expect(Shortened.middle(long, 0)).toBe("");
    expect(Shortened.middle(long, 1).length).toBe(1);
  });
});

describe("The rename plan", () => {
  const fixture: Fixture = { initials: "EL", date: sept9, sportCode: "WSOC", covered: "Nebraska", opponent: "Creighton", coveredIsHome: true };
  const photos = ["DSC001.JPG", "DSC002.JPG", "DSC003.JPG"];
  const existing = new Set([...photos, "DSC001.xmp", "DSC002.xmp", "DSC003.xmp"]);
  const records = new Set(["DSC001.json", "DSC002.json"]);
  const plan = PhotoRenamer.plan({ photos, fixture, existingNames: existing, recordNames: records });

  it("covers every frame, numbers in order, and carries companions", () => {
    expect(plan.items.length).toBe(3);
    expect(PhotoRenamer.isRunnable(plan)).toBe(true);
    expect(plan.items[0].destination).toBe("EL20230909_WSOC_NU_v_CU_0001.jpg");
    expect(plan.items[2].destination).toBe("EL20230909_WSOC_NU_v_CU_0003.jpg");
    expect(plan.items[0].companions.length).toBe(2);
    expect(plan.items[2].companions.length).toBe(1);
    expect(plan.items[0].companions.find((c) => c.kind === "sidecar")?.to).toBe("EL20230909_WSOC_NU_v_CU_0001.xmp");
    expect(plan.items[0].companions.find((c) => c.kind === "caption data")?.to).toBe("EL20230909_WSOC_NU_v_CU_0001.json");
  });
  it("is a no-op when the names already match", () => {
    const renamed = photos.map((_, i) => `EL20230909_WSOC_NU_v_CU_000${i + 1}.jpg`);
    const second = PhotoRenamer.plan({ photos: renamed, fixture, existingNames: new Set(renamed), recordNames: records });
    expect(PhotoRenamer.changing(second)).toEqual([]);
    expect(PhotoRenamer.isRunnable(second)).toBe(false);
  });
  it("refuses rather than half-applying", () => {
    const noInitials = PhotoRenamer.plan({ photos, fixture: { ...fixture, initials: "" }, existingNames: existing });
    expect(PhotoRenamer.isRunnable(noInitials)).toBe(false);
    expect(noInitials.problems.some((p) => p.includes("initials"))).toBe(true);
    const clash = PhotoRenamer.plan({ photos: ["a.jpg"], fixture, existingNames: new Set(["a.jpg", "EL20230909_WSOC_NU_v_CU_0001.jpg"]) });
    expect(clash.problems.some((p) => p.includes("already exists"))).toBe(true);
  });
});
