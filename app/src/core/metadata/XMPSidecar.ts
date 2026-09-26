/**
 * Reads and writes the `.xmp` sidecar files placed next to each RAW image.
 *
 * A writer that **appends** rather than replaces leaves a photo captioned more than once with
 * duplicate `dc:description` and `Iptc4xmpCore:AltTextAccessibility` blocks — and always emits
 * a trailing *empty* description, which a "last value wins" reader resolves to a blank caption.
 *
 * This implementation is idempotent: writing repeatedly yields exactly one block per field.
 */

export type CaptionSource = "ai" | "manual" | "imported";

export interface XMPSidecarFields {
  description?: string;
  altTextAccessibility?: string;
  captionSource?: CaptionSource;
}

export const XMPSidecar = {
  namespace: "http://ns.cutline.app/xmp/1.0/",
  /**
   * The prefix earlier files were written under. Only ever read, never written: sidecars already
   * beside somebody's photographs carry it, and a reader that did not know it would treat every
   * one of those as uncaptioned and caption them again.
   */
  legacyPrefix: "sideline",

  /**
   * Parse a sidecar. Duplicate blocks are tolerated on read. **Empty values are ignored**, and
   * the last non-empty value wins — which recovers a usable caption from a file carrying a
   * trailing empty description.
   */
  parse(xml: string): XMPSidecarFields {
    const result: XMPSidecarFields = {};
    const d = lastNonEmptyValue("dc:description", xml);
    if (d != null) result.description = d;
    const a = lastNonEmptyValue("Iptc4xmpCore:AltTextAccessibility", xml);
    if (a != null) result.altTextAccessibility = a;
    const raw = attribute("cutline:CaptionSource", xml) ?? attribute(`${XMPSidecar.legacyPrefix}:CaptionSource`, xml);
    if (raw === "ai" || raw === "manual" || raw === "imported") result.captionSource = raw;
    return result;
  },

  /**
   * Serialise to a complete sidecar document. Emits exactly one block per populated field;
   * fields left undefined are omitted rather than written empty.
   */
  serialise(f: XMPSidecarFields): string {
    let body = "";
    if (f.description) body += langAlt("dc:description", f.description, 9);
    if (f.altTextAccessibility) body += langAlt("Iptc4xmpCore:AltTextAccessibility", f.altTextAccessibility, 9);
    const sourceAttr = f.captionSource ? ` cutline:CaptionSource="${f.captionSource}"` : "";
    return (
      `<?xml version="1.0"?><?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>` +
      `<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="XMP Core 6.0.0">\n` +
      `   <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">\n` +
      `      <rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/" ` +
      `xmlns:Iptc4xmpCore="http://iptc.org/std/Iptc4xmpCore/1.0/xmlns/" ` +
      `xmlns:cutline="${XMPSidecar.namespace}" rdf:about=""${sourceAttr}>\n` +
      `${body}      </rdf:Description>\n` +
      `   </rdf:RDF>\n` +
      `</x:xmpmeta><?xpacket end="w"?>`
    );
  },

  /**
   * Merge new values into an existing sidecar and serialise. A populated field replaces its
   * previous value and an absent field leaves the previous one intact.
   */
  update(existing: string | null | undefined, next: XMPSidecarFields): string {
    const merged: XMPSidecarFields = existing ? XMPSidecar.parse(existing) : {};
    if (next.description) merged.description = next.description;
    if (next.altTextAccessibility) merged.altTextAccessibility = next.altTextAccessibility;
    if (next.captionSource) merged.captionSource = next.captionSource;
    return XMPSidecar.serialise(merged);
  },

  /** Sidecar name for an image: `IMG_1234.ARW` → `IMG_1234.xmp`. */
  sidecarName(imageName: string): string {
    const dot = imageName.lastIndexOf(".");
    const stem = dot > 0 ? imageName.slice(0, dot) : imageName;
    return `${stem}.xmp`;
  },

  escape(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  },

  decodeEntities(s: string): string {
    return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").trim();
  },
};

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function lastNonEmptyValue(element: string, xml: string): string | null {
  const n = escapeRe(element);
  const blocks = xml.match(new RegExp(`<${n}[ >][\\s\\S]*?</${n}>`, "g")) ?? [];
  let found: string | null = null;
  for (const block of blocks) {
    // `xml:lang="x-default"` carries the canonical value; quoting varies between single and
    // double across files.
    for (const p of [/x-default'\s*>([\s\S]*?)<\/rdf:li>/, /x-default"\s*>([\s\S]*?)<\/rdf:li>/]) {
      const m = p.exec(block);
      if (m && m[1]) found = XMPSidecar.decodeEntities(m[1]);
    }
  }
  return found;
}

function attribute(name: string, s: string): string | null {
  const m = new RegExp(`${escapeRe(name)}\\s*=\\s*['"]([^'"]*)['"]`).exec(s);
  return m ? m[1] : null;
}

function langAlt(element: string, value: string, indent: number): string {
  const pad = " ".repeat(indent);
  const escaped = XMPSidecar.escape(value);
  return (
    `${pad}<${element}>\n` +
    `${pad}   <rdf:Alt>\n` +
    `${pad}      <rdf:li xml:lang="x-default">${escaped}</rdf:li>\n` +
    `${pad}      <rdf:li xml:lang="en-US">${escaped}</rdf:li>\n` +
    `${pad}   </rdf:Alt>\n` +
    `${pad}</${element}>\n`
  );
}
