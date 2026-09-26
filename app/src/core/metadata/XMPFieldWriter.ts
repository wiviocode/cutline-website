/**
 * Setting individual fields in an already-rendered XMP packet.
 *
 * A Photo Mechanic template is a saved set of literal strings — there is no way for it to say
 * "whichever game this is". So the packet is rendered from the template first and the fields the
 * app actually knows are written over the top, the same way the capture date already was. The
 * alternative, requiring the template to use variables, fails silently for every template a
 * photographer saved out of Photo Mechanic itself, which is all of them.
 */

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The namespaces a field may belong to. A packet written from a Photo Mechanic template declares
 * them all; one built from nothing declares only what it started with, and a `photoshop:City`
 * added to it without `xmlns:photoshop` is malformed XML that a strict reader drops whole.
 */
export const XMP_NAMESPACES: Record<string, string> = {
  dc: "http://purl.org/dc/elements/1.1/",
  photoshop: "http://ns.adobe.com/photoshop/1.0/",
  xmp: "http://ns.adobe.com/xap/1.0/",
  xmpRights: "http://ns.adobe.com/xap/1.0/rights/",
  Iptc4xmpCore: "http://iptc.org/std/Iptc4xmpCore/1.0/xmlns/",
  Iptc4xmpExt: "http://iptc.org/std/Iptc4xmpExt/2008-02-29/",
  plus: "http://ns.useplus.org/ldf/xmp/1.0/",
  cutline: "http://ns.cutline.app/xmp/1.0/",
};

export const XMPFieldWriter = {
  /** Make sure the prefix of `name` is declared somewhere in the packet, adding it to the description tag if not. */
  ensureNamespace(name: string, xmp: string): string {
    const prefix = name.split(":")[0];
    const uri = XMP_NAMESPACES[prefix];
    if (!uri || new RegExp(`xmlns:${escapeRe(prefix)}=`).test(xmp)) return xmp;
    const open = "<rdf:Description";
    const at = xmp.indexOf(open);
    if (at < 0) return xmp;
    return xmp.slice(0, at + open.length) + ` xmlns:${prefix}="${uri}"` + xmp.slice(at + open.length);
  },

  /**
   * `photoshop:City="Lincoln"`. Replaces the value if the attribute is there, and adds the
   * attribute to the description tag if it is not.
   */
  setAttribute(name: string, value: string, xmp: string): string {
    xmp = XMPFieldWriter.ensureNamespace(name, xmp);
    const escaped = XMPFieldWriter.escape(value);
    const re = new RegExp(`${escapeRe(name)}="[^"]*"`);
    if (re.test(xmp)) return xmp.replace(re, () => `${name}="${escaped}"`);
    // No such attribute yet: hang it off the anchor every packet has.
    const anchor = 'rdf:about=""';
    const at = xmp.indexOf(anchor);
    if (at < 0) return xmp;
    return xmp.slice(0, at) + `rdf:about=""\n   ${name}="${escaped}"` + xmp.slice(at + anchor.length);
  },

  /** A language-alternative element — `dc:title`, `Iptc4xmpExt:Event`. */
  setLangAlt(name: string, value: string, xmp: string): string {
    xmp = XMPFieldWriter.ensureNamespace(name, xmp);
    const escaped = XMPFieldWriter.escape(value);
    const element =
      `<${name}>\n` +
      `    <rdf:Alt>\n` +
      `     <rdf:li xml:lang="x-default">${escaped}</rdf:li>\n` +
      `    </rdf:Alt>\n` +
      `   </${name}>`;
    return replaceElement(name, "   " + element, xmp);
  },

  /** An unordered bag — `photoshop:SupplementalCategories`, `dc:subject`. */
  setBag(name: string, values: string[], xmp: string): string {
    xmp = XMPFieldWriter.ensureNamespace(name, xmp);
    const items = values.map((v) => `     <rdf:li>${XMPFieldWriter.escape(v)}</rdf:li>`).join("\n");
    const element =
      `   <${name}>\n` +
      `    <rdf:Bag>\n` +
      `${items}\n` +
      `    </rdf:Bag>\n` +
      `   </${name}>`;
    return replaceElement(name, element, xmp);
  },

  /** An ordered sequence — `dc:creator`, whose first entry the IIM By-line is taken from. */
  setSeq(name: string, values: string[], xmp: string): string {
    xmp = XMPFieldWriter.ensureNamespace(name, xmp);
    const items = values.map((v) => `     <rdf:li>${XMPFieldWriter.escape(v)}</rdf:li>`).join("\n");
    const element =
      `   <${name}>\n` +
      `    <rdf:Seq>\n` +
      `${items}\n` +
      `    </rdf:Seq>\n` +
      `   </${name}>`;
    return replaceElement(name, element, xmp);
  },

  /**
   * One attribute inside the single `rdf:li` of `Iptc4xmpExt:LocationCreated`.
   *
   * Scoped deliberately: `Iptc4xmpExt:City` also appears under `LocationShown`, and a blind
   * replace would write the shoot's city into a list describing what the photograph depicts.
   */
  setLocationCreated(attribute: string, value: string, xmp: string): string {
    const block = element("Iptc4xmpExt:LocationCreated", xmp);
    if (!block) return xmp;
    const updated = setAttributeWithinLI(attribute, value, block.text);
    return xmp.slice(0, block.start) + updated + xmp.slice(block.end);
  },

  /**
   * XML-escape a value. A school called "St. Mary's" and an ampersand in a venue both have to
   * survive, and an unescaped one would make the whole packet unreadable.
   */
  escape(value: string): string {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  },
};

function setAttributeWithinLI(name: string, value: string, fragment: string): string {
  const escaped = XMPFieldWriter.escape(value);
  const re = new RegExp(`${escapeRe(name)}="[^"]*"`);
  if (re.test(fragment)) return fragment.replace(re, () => `${name}="${escaped}"`);
  const li = fragment.indexOf("<rdf:li");
  if (li < 0) return fragment;
  return fragment.slice(0, li) + `<rdf:li\n      ${name}="${escaped}"` + fragment.slice(li + "<rdf:li".length);
}

/** The whole `<name> … </name>` element, including its tags. */
function element(name: string, xmp: string): { start: number; end: number; text: string } | null {
  const n = escapeRe(name);
  // Both the paired form and the self-closing one some writers emit.
  for (const pattern of [new RegExp(`<${n}>[\\s\\S]*?</${n}>`), new RegExp(`<${n}[^>]*/>`)]) {
    const m = pattern.exec(xmp);
    if (m) return { start: m.index, end: m.index + m[0].length, text: m[0] };
  }
  return null;
}

function replaceElement(name: string, replacement: string, xmp: string): string {
  const existing = element(name, xmp);
  if (existing) {
    // Keep the indentation the packet already uses on that line.
    return xmp.slice(0, existing.start) + replacement.replace(/^[ \t]+/, "") + xmp.slice(existing.end);
  }
  const close = xmp.indexOf("</rdf:Description>");
  if (close < 0) return xmp;
  return xmp.slice(0, close) + replacement + "\n  </rdf:Description>" + xmp.slice(close + "</rdf:Description>".length);
}
