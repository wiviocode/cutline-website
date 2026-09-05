/**
 * Deriving the IIM block from the XMP packet that was just written.
 *
 * One source of truth on purpose: the XMP is rendered from the template and the caption, and
 * the IIM is read straight back out of it. The alternative — building both from the same inputs
 * separately — is how the two blocks drift, which is worse than either being absent because the
 * file then says two different things.
 */

import { IPTCIIM, type IIMField } from "./IPTCIIM";

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const XMPToIIM = {
  fields(xmp: string): IIMField[] {
    const out: IIMField[] = [];
    const add = (ds: { ds: number; max: number }, value: string | null | undefined) => {
      if (value == null || !value.trim()) return;
      out.push(IPTCIIM.field(ds, value));
    };

    add(IPTCIIM.caption,     XMPToIIM.langAlt("dc:description", xmp));
    add(IPTCIIM.objectName,  XMPToIIM.langAlt("dc:title", xmp));
    add(IPTCIIM.copyright,   XMPToIIM.langAlt("dc:rights", xmp));
    add(IPTCIIM.byline,      XMPToIIM.seqFirst("dc:creator", xmp));
    add(IPTCIIM.headline,    XMPToIIM.attribute("photoshop:Headline", xmp));
    add(IPTCIIM.bylineTitle, XMPToIIM.attribute("photoshop:AuthorsPosition", xmp));
    add(IPTCIIM.credit,      XMPToIIM.attribute("photoshop:Credit", xmp));
    add(IPTCIIM.source,      XMPToIIM.attribute("photoshop:Source", xmp));
    add(IPTCIIM.writer,      XMPToIIM.attribute("photoshop:CaptionWriter", xmp));
    add(IPTCIIM.category,    XMPToIIM.attribute("photoshop:Category", xmp));
    add(IPTCIIM.city,        XMPToIIM.attribute("photoshop:City", xmp));
    add(IPTCIIM.sublocation, XMPToIIM.attribute("Iptc4xmpCore:Location", xmp));
    add(IPTCIIM.state,       XMPToIIM.attribute("photoshop:State", xmp));
    add(IPTCIIM.countryName, XMPToIIM.attribute("photoshop:Country", xmp));
    add(IPTCIIM.countryCode, XMPToIIM.attribute("Iptc4xmpCore:CountryCode", xmp));

    // 2:55 wants CCYYMMDD; XMP writes 2026-08-25 or a full timestamp.
    const date = XMPToIIM.attribute("photoshop:DateCreated", xmp)
      ?? XMPToIIM.attribute("xmp:CreateDate", xmp);
    if (date) {
      const digits = date.slice(0, 10).replace(/\D/g, "");
      if (digits.length === 8) out.push(IPTCIIM.field(IPTCIIM.dateCreated, digits));
    }

    // Repeatable datasets.
    for (const k of XMPToIIM.bagItems("photoshop:SupplementalCategories", xmp)) {
      out.push(IPTCIIM.field(IPTCIIM.suppCategory, k));
    }
    for (const k of XMPToIIM.bagItems("dc:subject", xmp)) {
      out.push(IPTCIIM.field(IPTCIIM.keywords, k));
    }
    return out;
  },

  /** `photoshop:City="Lincoln"` — also matches the element form some writers emit. */
  attribute(name: string, xmp: string): string | null {
    const n = escapeRe(name);
    const attr = new RegExp(`${n}="([^"]*)"`).exec(xmp);
    if (attr) return decode(attr[1]);
    const el = new RegExp(`<${n}>([^<]*)</${n}>`).exec(xmp);
    if (el) return decode(el[1]);
    return null;
  },

  /** The `x-default` item of a lang-Alt element. */
  langAlt(name: string, xmp: string): string | null {
    const block = element(name, xmp);
    if (block == null) return null;
    const li = /<rdf:li[^>]*>([\s\S]*?)<\/rdf:li>/.exec(block);
    return li ? decode(li[1]) : null;
  },

  /** The first item of an `rdf:Seq`. */
  seqFirst(name: string, xmp: string): string | null {
    return XMPToIIM.langAlt(name, xmp); // same shape: first rdf:li's text
  },

  /** Every item of an `rdf:Bag` or `rdf:Seq`. */
  bagItems(name: string, xmp: string): string[] {
    const block = element(name, xmp);
    if (block == null) return [];
    const out: string[] = [];
    const re = /<rdf:li[^>]*>([\s\S]*?)<\/rdf:li>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(block))) {
      const t = decode(m[1]);
      if (t) out.push(t);
    }
    return out;
  },

  /** XML entities, including the numeric newline Photo Mechanic writes into captions. */
  decode,
};

function element(name: string, xmp: string): string | null {
  const n = escapeRe(name);
  const m = new RegExp(`<${n}[ >][\\s\\S]*?</${n}>`).exec(xmp);
  return m ? m[0] : null;
}

function decode(s: string): string {
  return s
    .replace(/&#xA;/g, "\n")
    .replace(/&#xD;/g, "\r")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}
