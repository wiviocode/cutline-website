// The metadata layer, checked the way the golden suite checked it: decoded back out of the
// bytes rather than trusted from the encoder's inputs. This is the part that decides whether a
// caption survives the trip into a library system, and it is binary, so a mistake is silent —
// the file still opens, the picture still looks right, and every field downstream is blank.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { JPEGSegments } from "../src/core/metadata/JPEGSegments";
import { IPTCIIM } from "../src/core/metadata/IPTCIIM";
import { XMPToIIM } from "../src/core/metadata/XMPToIIM";
import { PMVariables } from "../src/core/metadata/PMVariables";
import { IPTCTemplate } from "../src/core/metadata/IPTCTemplate";
import { XMPSidecar } from "../src/core/metadata/XMPSidecar";
import { HurrdatFields } from "../src/core/metadata/HurrdatFields";
import { MetadataOutput } from "../src/core/metadata/MetadataOutput";
import { TemplateBuilder } from "../src/core/metadata/TemplateBuilder";
import { EmbeddedMetadataWriter } from "../src/core/metadata/EmbeddedMetadataWriter";
import { PhotoMetadata, localDate } from "../src/core/images/PhotoMetadata";

const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
const bytes = (name: string) => new Uint8Array(readFileSync(fixture(name)));
const text = (name: string) => readFileSync(fixture(name), "utf8");
const count = (needle: string, s: string) => s.split(needle).length - 1;
const dec = new TextDecoder();

describe("IPTC-IIM encoding", () => {
  const one = IPTCIIM.encode([IPTCIIM.field(IPTCIIM.city, "Lincoln")]);
  const parsed = IPTCIIM.decode(one);

  it("writes the UTF-8 marker first, as ESC % G", () => {
    expect(parsed[0].record).toBe(1);
    expect(parsed[0].dataset).toBe(90);
    expect([...parsed[0].bytes]).toEqual([0x1b, 0x25, 0x47]);
  });
  it("writes the record version 4 next", () => {
    expect(parsed[1].record).toBe(2);
    expect(parsed[1].dataset).toBe(0);
    expect([...parsed[1].bytes]).toEqual([0x00, 0x04]);
  });
  it("writes the field, matched on record as well as dataset", () => {
    expect(parsed.some((f) => f.record === 2 && f.dataset === 90 && f.text === "Lincoln")).toBe(true);
    expect(one[0]).toBe(0x1c);
  });

  const city = (v: string) => IPTCIIM.decode(IPTCIIM.encode([IPTCIIM.field(IPTCIIM.city, v)]))
    .find((f) => f.record === 2 && f.dataset === 90);
  it("skips empty and whitespace-only values, and trims", () => {
    expect(city("")).toBeUndefined();
    expect(city("   ")).toBeUndefined();
    expect(city("  Lincoln  ")?.text).toBe("Lincoln");
  });

  it("truncates a long caption to the IIM limit", () => {
    const capped = IPTCIIM.decode(IPTCIIM.encode([IPTCIIM.field(IPTCIIM.caption, "a".repeat(3000))]));
    expect(capped.find((f) => f.dataset === 120)?.bytes.length).toBe(2000);
  });
  it("never splits a UTF-8 sequence when truncating", () => {
    const cut = IPTCIIM.truncate("é".repeat(40), 31); // 2 bytes each, lands mid-character
    expect(() => new TextDecoder("utf-8", { fatal: true }).decode(cut)).not.toThrow();
    expect(cut.length).toBeLessThanOrEqual(31);
    expect(cut.length).toBe(30);
    expect(dec.decode(IPTCIIM.truncate("Lincoln", 32))).toBe("Lincoln");
    expect(dec.decode(IPTCIIM.truncate("🏈🏈🏈", 6))).toBe("🏈");
  });

  it("wraps the stream in an even-length 8BIM block with id 0x0404", () => {
    const block = IPTCIIM.resourceBlock(one);
    expect(dec.decode(block.subarray(0, 4))).toBe("8BIM");
    expect([...block.subarray(4, 6)]).toEqual([0x04, 0x04]);
    expect(block.length % 2).toBe(0);
    expect(dec.decode(IPTCIIM.app13Body(one, null).subarray(0, 14))).toBe("Photoshop 3.0\0");
  });

  it("preserves unrelated 8BIM resources and never stacks a second IPTC one", () => {
    const foreign = new Uint8Array([0x38, 0x42, 0x49, 0x4d, 0x03, 0xed, 0x00, 0x00, 0x00, 0x00, 0x00, 0x04, 0xde, 0xad, 0xbe, 0xef]);
    const existing = new Uint8Array([...new TextEncoder().encode("Photoshop 3.0\0"), ...foreign]);
    const merged = IPTCIIM.app13Body(one, existing);
    const hex = Array.from(merged).map((b) => b.toString(16).padStart(2, "0")).join("");
    expect(hex).toContain("deadbeef");
    expect(merged.length).toBeGreaterThan(existing.length);
    const twice = IPTCIIM.app13Body(one, merged);
    const twiceHex = Array.from(twice).map((b) => b.toString(16).padStart(2, "0")).join("");
    expect(count("3842494d0404", twiceHex)).toBe(1);
  });
});

describe("Reading IIM fields out of an XMP packet", () => {
  const xmp = `
<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about=""
    photoshop:City="Lincoln"
    photoshop:State="Nebraska"
    photoshop:Credit="Eli Larson/Hurrdat Sports"
    photoshop:Category="S"
    photoshop:DateCreated="2026-08-25">
   <dc:description><rdf:Alt><rdf:li xml:lang="x-default">A caption &amp; more</rdf:li></rdf:Alt></dc:description>
   <dc:creator><rdf:Seq><rdf:li>Eli Larson</rdf:li></rdf:Seq></dc:creator>
   <photoshop:SupplementalCategories><rdf:Bag><rdf:li>FB</rdf:li><rdf:li>VOL</rdf:li></rdf:Bag></photoshop:SupplementalCategories>
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>`;
  const fields = XMPToIIM.fields(xmp);
  const value = (ds: number) => fields.find((f) => f.dataset === ds)?.value;

  it("reads attributes, lang-alts, seqs and bags", () => {
    expect(value(90)).toBe("Lincoln");
    expect(value(110)).toBe("Eli Larson/Hurrdat Sports");
    expect(value(15)).toBe("S");
    expect(value(120)).toBe("A caption & more");
    expect(value(80)).toBe("Eli Larson");
    expect(value(55)).toBe("20260825");
    expect(fields.filter((f) => f.dataset === 20).map((f) => f.value)).toEqual(["FB", "VOL"]);
    expect(value(105)).toBeUndefined();
  });
});

describe("Photo Mechanic variables — the 28 golden cases", () => {
  const golden = JSON.parse(text("pm_golden.json")) as { cases: { template: string; context?: Record<string, unknown>; expected: string }[] };
  for (const c of golden.cases) {
    it(c.template, () => {
      expect(PMVariables.expand(c.template, (c.context ?? {}) as never)).toBe(c.expected);
    });
  }
  it("has all 28", () => expect(golden.cases.length).toBe(28));
});

describe("A real Photo Mechanic template", () => {
  const tpl = new IPTCTemplate(text("PM_Hurrdat.XMP"));
  const f = tpl.declaredFields;

  it("reads the declared fields", () => {
    expect(f["photoshop:City"]).toBe("Lincoln");
    expect(f["photoshop:State"]).toBe("Nebraska");
    expect(f["photoshop:Credit"]).toBe("Eli Larson/Hurrdat Sports");
    expect(f["photoshop:Source"]).toBe("Photographer");
    expect(f["Iptc4xmpCore:CountryCode"]).toBe("USA");
    expect(f["dc:creator"]).toBe("Eli Larson");
    expect(f["dc:rights"]).toBe("2026 Hurrdat Sports");
    expect(f["Iptc4xmpExt:Event"]).toBe("Nebraska Football v Opponent - 2026-08-25");
    expect(f["photomechanic:CaptionMergeStyle"]).toBe("1");
  });
  it("finds the prepend base", () => {
    expect(tpl.descriptionBase).toContain("during a college football game");
  });

  const caption = "Nebraska Cornhuskers defender Reese Borer (8) challenges for the ball.";
  const out = tpl.render(caption);
  it("prepends the caption above the base and keeps everything else verbatim", () => {
    expect(out).toContain("Reese Borer (8)");
    expect(out).toContain("during a college football game");
    expect(out.indexOf("Reese Borer")).toBeLessThan(out.indexOf("during a college football game"));
    expect(count("<dc:description>", out)).toBe(1);
    expect(out).toContain('photoshop:Credit="Eli Larson/Hurrdat Sports"');
    expect(out).toContain("photomechanic:FieldsToApply");
    expect(out).toContain("0x8013");
    expect(out).toContain("plus:CopyrightOwner");
    expect(out).toContain("Iptc4xmpExt:LocationCreated");
  });
  it("re-parses and does not stack on a second render", () => {
    const round = new IPTCTemplate(out);
    expect(round.descriptionBase).toContain("Reese Borer (8)");
    const twice = round.render(caption);
    expect(count("Reese Borer (8)", twice)).toBe(1);
  });
  it("inserts alt text exactly once", () => {
    const withAlt = tpl.render(caption, "Two soccer players challenge for the ball.");
    expect(withAlt).toContain("Two soccer players challenge");
    expect(count("<Iptc4xmpCore:AltTextAccessibility>", withAlt)).toBe(1);
  });
  it("expands variables during render", () => {
    const varTpl = new IPTCTemplate(tpl.source.replace("Nebraska Football v Opponent - 2026-08-25", "{category} game {seqn:pad4}"));
    expect(varTpl.render(caption, null, { tokenValues: { category: "WSOC" }, seqn: 7 })).toContain("WSOC game 0007");
  });
  it("An empty-description template takes the caption alone", () => {
    const empty = new IPTCTemplate(text("PM_Hurrdat_AppCaption.XMP"));
    expect(empty.descriptionBase).toBe("");
    const r = new IPTCTemplate(empty.render(caption));
    expect(r.descriptionBase).toBe(caption);
  });
});

describe("Sidecars", () => {
  const out = XMPSidecar.serialise({ description: "A caption.", altTextAccessibility: "Alt text.", captionSource: "ai" });
  it("writes exactly one block per field and round-trips", () => {
    expect(count("<dc:description>", out)).toBe(1);
    expect(count("<Iptc4xmpCore:AltTextAccessibility>", out)).toBe(1);
    expect(out).not.toContain('<rdf:li xml:lang="x-default"/>');
    expect(XMPSidecar.parse(out).description).toBe("A caption.");
  });
  it("five repeated writes still yield one block each", () => {
    let acc = out;
    for (let i = 0; i < 5; i++) acc = XMPSidecar.update(acc, { description: "A caption.", altTextAccessibility: "Alt text.", captionSource: "ai" });
    expect(count("<dc:description>", acc)).toBe(1);
    expect(count("<Iptc4xmpCore:AltTextAccessibility>", acc)).toBe(1);
  });
  it("a partial update preserves the other field", () => {
    const pp = XMPSidecar.parse(XMPSidecar.update(out, { description: "Replaced." }));
    expect(pp.description).toBe("Replaced.");
    expect(pp.altTextAccessibility).toBe("Alt text.");
  });
  it("escapes and round-trips special characters", () => {
    const amp = XMPSidecar.serialise({ description: "Smith & Jones <3", captionSource: "ai" });
    expect(amp).toContain("Smith &amp; Jones &lt;3");
    expect(XMPSidecar.parse(amp).description).toBe("Smith & Jones <3");
  });
  it("derives the sidecar name and recognises the older prefix", () => {
    expect(XMPSidecar.sidecarName("ELI07221.ARW")).toBe("ELI07221.xmp");
    const written = XMPSidecar.serialise({ description: "A caption.", captionSource: "ai" });
    expect(written).toContain('cutline:CaptionSource="ai"');
    expect(written).not.toContain("sideline");
    const legacy = written.replace("cutline:CaptionSource", "sideline:CaptionSource").replace("xmlns:cutline", "xmlns:sideline");
    expect(XMPSidecar.parse(legacy).captionSource).toBe("ai");
    expect(XMPSidecar.parse(legacy).description).toBe("A caption.");
  });
  it("ignores a trailing empty block and keeps the last real value", () => {
    const dup = out.replace("</rdf:Description>", `<dc:description><rdf:Alt><rdf:li xml:lang="x-default"></rdf:li></rdf:Alt></dc:description></rdf:Description>`);
    expect(XMPSidecar.parse(dup).description).toBe("A caption.");
  });
});

describe("The desk's per-shoot fields", () => {
  it("builds the descriptor the desk's sheet shows", () => {
    expect(HurrdatFields.descriptor("Nebraska", "Volleyball", "Creighton", "2026-08-01")).toBe("Nebraska Volleyball v Creighton - 2026-08-01");
    expect(HurrdatFields.descriptor("Lincoln Southwest", "Girls Volleyball", "Lincoln North Star", "2026-08-27")).toBe("Lincoln Southwest Girls Volleyball v Lincoln North Star - 2026-08-27");
    expect(HurrdatFields.descriptor("Cornhusker State Games", "", "", "2026-08-27")).toBe("Cornhusker State Games - 2026-08-27");
    expect(HurrdatFields.descriptor("Nebraska", "Volleyball", "Creighton", "")).toBe("Nebraska Volleyball v Creighton");
    expect(HurrdatFields.descriptor("  Nebraska  ", "Volleyball", " Creighton ", "2026-08-01")).toBe("Nebraska Volleyball v Creighton - 2026-08-01");
  });
  it("gives the desk's four codes and invents none", () => {
    expect(HurrdatFields.supplementalCategory("volleyball", "womens")).toBe("VOL");
    expect(HurrdatFields.supplementalCategory("football", "mens")).toBe("FB");
    expect(HurrdatFields.supplementalCategory("basketball", "mens")).toBe("MBB");
    expect(HurrdatFields.supplementalCategory("basketball", "womens")).toBe("WBB");
    expect(HurrdatFields.supplementalCategory("soccer", "womens")).toBeNull();
    expect(HurrdatFields.supplementalCategory("curling", "mens")).toBeNull();
    expect(HurrdatFields.isoDate("20260827")).toBe("2026-08-27");
    expect(HurrdatFields.isoDate("2026")).toBeNull();
  });

  const template = `<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about=""
   photoshop:City="Lincoln"
   photoshop:State="Nebraska"
   photoshop:Category="S"
   photoshop:Headline="Nebraska Football v Opponent - 2026-08-25">
   <photoshop:SupplementalCategories>
    <rdf:Bag>
     <rdf:li>FB</rdf:li>
    </rdf:Bag>
   </photoshop:SupplementalCategories>
   <dc:title>
    <rdf:Alt>
     <rdf:li xml:lang="x-default">Nebraska Football v Opponent - 2026-08-25</rdf:li>
    </rdf:Alt>
   </dc:title>
   <Iptc4xmpExt:LocationCreated>
    <rdf:Bag>
     <rdf:li
      Iptc4xmpExt:Sublocation=""
      Iptc4xmpExt:City="Lincoln"
      Iptc4xmpExt:ProvinceState="Nebraska"/>
    </rdf:Bag>
   </Iptc4xmpExt:LocationCreated>
   <Iptc4xmpExt:Event>
    <rdf:Alt>
     <rdf:li xml:lang="x-default">Nebraska Football v Opponent - 2026-08-25</rdf:li>
    </rdf:Alt>
   </Iptc4xmpExt:Event>
   <Iptc4xmpExt:LocationShown>
    <rdf:Bag>
     <rdf:li Iptc4xmpExt:City="Omaha"/>
    </rdf:Bag>
   </Iptc4xmpExt:LocationShown>
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>`;

  const fields = HurrdatFields.make({
    descriptor: "Lincoln Southwest Girls Volleyball v Lincoln North Star - 2026-08-27",
    supplementalCategory: "VOL", city: "Lincoln", state: "Nebraska", sublocation: "Lincoln Southwest High School",
  });
  const out = MetadataOutput.apply(fields, template);

  it("writes the fixture into headline, title and event, and the code into supp cat", () => {
    expect(out).not.toContain("Nebraska Football v Opponent");
    expect(XMPToIIM.attribute("photoshop:Headline", out)).toBe(fields.descriptor);
    expect(out).toContain(`<rdf:li xml:lang="x-default">${fields.descriptor}</rdf:li>`);
    expect(count(fields.descriptor, out)).toBe(3);
    expect(out).toContain("<rdf:li>VOL</rdf:li>");
    expect(out).not.toContain("<rdf:li>FB</rdf:li>");
    expect(XMPToIIM.attribute("photoshop:Category", out)).toBe("S");
    expect(XMPToIIM.attribute("Iptc4xmpCore:Location", out)).toBe("Lincoln Southwest High School");
    expect(out).toContain('Iptc4xmpExt:Sublocation="Lincoln Southwest High School"');
    // LocationShown describes what the photograph depicts, not where it was taken.
    expect(out).toContain("Iptc4xmpExt:LocationShown");
    expect(out).toContain('"Omaha"');
  });
  it("clears a stale sport code rather than inheriting it", () => {
    const noCode = MetadataOutput.apply(HurrdatFields.make({ descriptor: "Nebraska Soccer v Notre Dame - 2026-08-25" }), template);
    expect(noCode).not.toContain("<rdf:li>FB</rdf:li>");
    expect(XMPToIIM.fields(noCode).some((f) => f.dataset === 20)).toBe(false);
    expect(XMPToIIM.attribute("photoshop:Category", noCode)).toBe("S");
  });
  it("an away game overwrites the template's location", () => {
    const away = MetadataOutput.apply(HurrdatFields.make({ descriptor: "Nebraska Volleyball v Wisconsin - 2026-09-14", supplementalCategory: "VOL", city: "Madison", state: "Wisconsin", sublocation: "UW Field House" }), template);
    expect(XMPToIIM.attribute("photoshop:City", away)).toBe("Madison");
    expect(XMPToIIM.attribute("photoshop:State", away)).toBe("Wisconsin");
    expect(away).toContain('Iptc4xmpExt:City="Madison"');
  });
  it("adds fields a bare template lacks and keeps what it had", () => {
    const bare = `<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about=""
   photoshop:Credit="Eli Larson/Hurrdat Sports">
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>`;
    const bareOut = MetadataOutput.apply(fields, bare);
    expect(XMPToIIM.attribute("photoshop:Headline", bareOut)).toBe(fields.descriptor);
    expect(bareOut).toContain("<dc:title>");
    expect(XMPToIIM.attribute("photoshop:Credit", bareOut)).toBe("Eli Larson/Hurrdat Sports");
  });
  it("escapes values that would break the XML", () => {
    const awkward = MetadataOutput.apply(HurrdatFields.make({ descriptor: "St. Mary's v Bishop & Co - 2026-08-27", city: 'O"Neill', state: "Neb.", sublocation: "Smith & Sons <Field>" }), template);
    expect(awkward).toContain("Bishop &amp; Co");
    expect(awkward).not.toContain("Bishop & Co");
    expect(awkward).toContain("Smith &amp; Sons &lt;Field&gt;");
    expect(awkward).toContain("O&quot;Neill");
    expect(awkward).toContain("St. Mary's");
  });
  it("an empty value leaves the template's own alone", () => {
    const emptyOut = MetadataOutput.apply({ descriptor: "", category: "", supplementalCategory: null, city: "", state: "", sublocation: "" }, template);
    expect(XMPToIIM.attribute("photoshop:Headline", emptyOut)).toBe("Nebraska Football v Opponent - 2026-08-25");
    expect(XMPToIIM.attribute("photoshop:City", emptyOut)).toBe("Lincoln");
    expect(XMPToIIM.attribute("photoshop:Category", emptyOut)).toBe("S");
  });
  it("reaches the IIM block the desk reads", () => {
    const iim = XMPToIIM.fields(out);
    const value = (ds: number) => iim.find((f) => f.dataset === ds)?.value;
    expect(value(105)).toBe(fields.descriptor);
    expect(value(15)).toBe("S");
    expect(value(20)).toBe("VOL");
    expect(value(92)).toBe("Lincoln Southwest High School");
    expect(value(90)).toBe("Lincoln");
  });
});

describe("Writing into a real camera JPEG", () => {
  const original = bytes("camera.jpg");
  const tpl = new IPTCTemplate(text("PM_Hurrdat.XMP"));
  const caption = "Nebraska Cornhuskers defender Reese Borer (8) challenges for the ball.";
  const xmp = tpl.render(caption, "Two players compete for the ball.");
  const written = EmbeddedMetadataWriter.embed(xmp, original);

  it("leaves the photograph alone: scan data and EXIF byte-identical", () => {
    const before = JPEGSegments.segmentSizes(original), after = JPEGSegments.segmentSizes(written);
    expect(after.find((s) => s.name === "EXIF")?.size).toBe(before.find((s) => s.name === "EXIF")?.size);
    expect(after.find((s) => s.name === "scan")?.size).toBe(before.find((s) => s.name === "scan")?.size);
    expect(Buffer.from(JPEGSegments.scanData(written)).equals(Buffer.from(JPEGSegments.scanData(original)))).toBe(true);
    expect(after.filter((s) => s.name === "XMP").length).toBe(1);
    expect(after.filter((s) => s.name === "0xED").length).toBe(1);
    expect(Math.abs(written.length - original.length)).toBeLessThan(60_000);
    expect(written[0]).toBe(0xff); expect(written[1]).toBe(0xd8);
  });
  it("the metadata is actually there, in both blocks", () => {
    const after = EmbeddedMetadataWriter.read(written);
    expect(after.description).toContain("Reese Borer (8)");
    expect(after.description).toContain("during a college football game");
    expect(after.credit).toBe("Eli Larson/Hurrdat Sports");
    expect(after.city).toBe("Lincoln");
    expect(after.creator).toBe("Eli Larson");
    expect(after.hasEXIF).toBe(true);
    expect(after.pixelWidth).toBe(900);
    const readXMP = EmbeddedMetadataWriter.readXMP(written)!;
    expect(readXMP).toContain("Reese Borer");
    expect(readXMP).toContain("Two players compete");
    expect(count("<dc:description", readXMP)).toBe(1);
    // And the IIM block alone, decoded without the XMP.
    const iim = IPTCIIM.iimFromAPP13(JPEGSegments.firstAPP13Body(written)!)!;
    const fields = IPTCIIM.decode(iim);
    expect(fields.find((f) => f.record === 2 && f.dataset === 120)?.text).toContain("Reese Borer (8)");
    expect(fields.find((f) => f.record === 2 && f.dataset === 80)?.text).toBe("Eli Larson");
  });
  it("re-embedding does not stack, and a new caption replaces the old", () => {
    const twice = EmbeddedMetadataWriter.embed(xmp, written);
    expect(twice.length).toBe(written.length);
    const twiceXMP = EmbeddedMetadataWriter.readXMP(twice)!;
    expect(count("<dc:description", twiceXMP)).toBe(1);
    expect(count("Reese Borer (8)", twiceXMP)).toBe(1);
    const second = EmbeddedMetadataWriter.embed(tpl.render("A different caption entirely."), twice);
    const replaced = EmbeddedMetadataWriter.read(second);
    expect(replaced.description).toContain("A different caption entirely");
    expect(replaced.description).not.toContain("Reese Borer");
  });
  it("the packet carries the frame's own capture date, not the template's", () => {
    const exif: PhotoMetadata = { captureDate: localDate(2026, 8, 20) };
    const packet = MetadataOutput.packet(caption, null, "DSC01.JPG", exif, { template: tpl }, "ai");
    expect(XMPToIIM.attribute("photoshop:DateCreated", packet)).toBe("2026-08-20");
    expect(XMPToIIM.fields(packet).find((f) => f.dataset === 55)?.value).toBe("20260820");
    const plan = MetadataOutput.plan("DSC01.JPG", packet, original);
    expect(plan.kind).toBe("embed");
    expect(MetadataOutput.plan("DSC01.ARW", packet, null)).toMatchObject({ kind: "sidecar", name: "DSC01.xmp" });
  });
  it("a packet built without a template declares every namespace it uses, and carries the date and the By-line", () => {
    const exif: PhotoMetadata = { captureDate: localDate(2026, 9, 4) };
    const fields = HurrdatFields.make({
      descriptor: HurrdatFields.descriptor("Ashland-Greenwood", "Boys Football", "Syracuse", HurrdatFields.datePlaceholder),
      supplementalCategory: "FB", city: "Ashland", state: "Neb.", sublocation: "",
    });
    const packet = MetadataOutput.packet(caption, "Two players compete.", "DSC01715.JPG", exif, { template: null, city: "Ashland", state: "Neb.", fields, photographer: "Eli Larson", house: "Hurrdat Sports" }, "ai");
    const used = new Set<string>();
    for (const m of packet.matchAll(/<\/?([A-Za-z][\w]*):[\w]+/g)) used.add(m[1]);
    for (const m of packet.matchAll(/\s([A-Za-z][\w]*):[\w]+="/g)) used.add(m[1]);
    for (const prefix of used) { if (prefix !== "xml" && prefix !== "xmlns") expect(packet, `xmlns:${prefix}`).toContain(`xmlns:${prefix}=`); }
    expect(used.has("photoshop") && used.has("Iptc4xmpExt")).toBe(true);
    expect(XMPToIIM.attribute("photoshop:DateCreated", packet)).toBe("2026-09-04");
    const iim = XMPToIIM.fields(packet);
    const ds = (n: number) => iim.find((f) => f.dataset === n)?.value;
    expect(ds(55)).toBe("20260904");
    expect(ds(80)).toBe("Eli Larson");
    expect(ds(110)).toBe("Eli Larson/Hurrdat Sports");
    expect(ds(105)).toBe("Ashland-Greenwood Boys Football v Syracuse - 2026-09-04");
    expect(ds(15)).toBe("S");
    expect(ds(20)).toBe("FB");
    expect(ds(90)).toBe("Ashland");
    expect(ds(120)).toContain("Reese Borer (8)");
    // A template that names its own creator keeps it.
    const templated = MetadataOutput.packet(caption, null, "DSC01.JPG", exif, { template: tpl, photographer: "Somebody Else" }, "ai");
    expect(XMPToIIM.fields(templated).find((f) => f.dataset === 80)?.value).toBe("Eli Larson");
  });
  it("rejects non-JPEG input", () => {
    expect(() => JPEGSegments.replacingXMP(new Uint8Array(64), "<x/>")).toThrow();
  });
});

describe("Photo metadata derived forms", () => {
  const m: PhotoMetadata = { captureDate: localDate(2024, 9, 14) }; // a Saturday
  it("writes the AP date, the ISO day and the weekday", () => {
    expect(PhotoMetadata.apStyleDate(m)).toBe("Sept. 14, 2024");
    expect(PhotoMetadata.iptcDateCreated(m)).toBe("2024-09-14");
    expect(PhotoMetadata.weekdayName(m)).toBe("Saturday");
    expect(PhotoMetadata.apStyleDate({ captureDate: localDate(2025, 7, 4) })).toBe("July 4, 2025");
    expect(PhotoMetadata.parseExifDate("2026:08:20 12:37:07")?.getFullYear()).toBe(2026);
    expect(PhotoMetadata.apStyleDate({})).toBeNull();
  });
});

describe("A template made in the app", () => {
  const xmp = TemplateBuilder.build({ credit: "Eli Larson/Hurrdat Sports", source: "Hurrdat Sports", copyright: "© 2026 Hurrdat Sports", usageTerms: "Editorial use only",
    instructions: "Not for syndication", jobTitle: "Staff photographer", email: "desk@example.com", website: "https://example.com", phone: "+1 402 555 0100" });
  const tpl = new IPTCTemplate(xmp);
  it("is a template the app accepts, with the desk's fields declared and no caption base", () => {
    expect(tpl.declaredFields["photoshop:Credit"]).toBe("Eli Larson/Hurrdat Sports");
    expect(tpl.declaredFields["photoshop:Source"]).toBe("Hurrdat Sports");
    expect(tpl.declaredFields["dc:rights"]).toBe("© 2026 Hurrdat Sports");
    expect(tpl.declaredFields["photoshop:Instructions"]).toBe("Not for syndication");
    expect(tpl.declaredFields["photoshop:AuthorsPosition"]).toBe("Staff photographer");
    expect(tpl.declaredFields["xmpRights:Marked"]).toBe("True");
    expect(tpl.declaredFields["dc:creator"]).toBeUndefined();
    expect(tpl.descriptionBase).toBe("");
    expect(xmp).toContain("<Iptc4xmpCore:CiEmailWork>desk@example.com</Iptc4xmpCore:CiEmailWork>");
    expect(xmp).toContain("<xmpRights:UsageTerms>");
  });
  it("carries the desk's fields into the IIM block beside the caption, with the By-line from Settings", () => {
    const exif: PhotoMetadata = { captureDate: localDate(2026, 9, 5) };
    const packet = MetadataOutput.packet("A caption.", "Alt text.", "DSC_0001.jpg", exif, { template: tpl, photographer: "Eli Larson", house: "Hurrdat Sports", city: "Lincoln", state: "Neb." }, "ai");
    const iim = Object.fromEntries(XMPToIIM.fields(packet).map((f) => [f.dataset, f.value]));
    expect(iim[120]).toBe("A caption.");
    expect(iim[110]).toBe("Eli Larson/Hurrdat Sports");
    expect(iim[115]).toBe("Hurrdat Sports");
    expect(iim[116]).toBe("© 2026 Hurrdat Sports");
    expect(iim[40]).toBe("Not for syndication");
    expect(iim[85]).toBe("Staff photographer");
    expect(iim[80]).toBe("Eli Larson");
    expect(iim[55]).toBe("20260905");
    expect(count("photoshop:Credit=", packet)).toBe(1);
    expect(packet).toContain("Alt text.");
    // The built template stays valid XML: every prefix it uses is declared.
    for (const prefix of ["dc", "photoshop", "xmpRights", "Iptc4xmpCore"]) expect(packet).toContain(`xmlns:${prefix}=`);
  });
  it("escapes what a desk types, and leaves blank fields out", () => {
    const odd = new IPTCTemplate(TemplateBuilder.build({ credit: 'Smith & Sons "Photo"', copyright: "" }));
    expect(odd.declaredFields["photoshop:Credit"]).toBe("Smith &amp; Sons &quot;Photo&quot;");
    expect(XMPToIIM.attribute("photoshop:Credit", odd.source)).toBe('Smith & Sons "Photo"');
    expect(odd.source).not.toContain("dc:rights");
    expect(odd.source).not.toContain("xmpRights:Marked");
    expect(TemplateBuilder.hasContent({ credit: "  " })).toBe(false);
    expect(TemplateBuilder.hasContent({ phone: "1" })).toBe(true);
  });
  it("suggests the credit and copyright from the byline", () => {
    const s = TemplateBuilder.suggest({ photographer: "Jane Doe", house: "The Ledger" });
    expect(s.credit).toBe("Jane Doe/The Ledger");
    expect(s.copyright).toMatch(/^© \d{4} The Ledger$/);
    expect(s.name).toBe("The Ledger");
    expect(TemplateBuilder.suggest({ photographer: "", house: "" }).name).toBe("My desk");
  });
});
