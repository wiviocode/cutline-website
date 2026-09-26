/**
 * A Photo Mechanic IPTC template (an exported `.XMP` stationery pad).
 *
 * The template is kept as **text and used as a scaffold**, rather than being parsed into a field
 * model and re-serialised. Photo Mechanic templates carry structures this app has no reason to
 * understand — `photomechanic:FieldsToApply` hex ids, `LocationCreated` bags, `plus:Licensor`
 * sequences — and round-tripping them through a partial model would silently drop whatever the
 * model does not cover. Passing them through verbatim cannot.
 *
 * Only two things are transformed:
 *  1. `{token}` variables are expanded (`PMVariables`).
 *  2. `dc:description` receives the generated caption.
 *
 * Prepend semantics: in a typical template `dc:description` is not empty — it holds a **base**
 * such as `"\n\nNovember 20, 2025\nMBB vs New Mexico"`. The generated caption goes *above* it,
 * which is what `photomechanic:CaptionMergeStyle="1"` selects.
 */

import { PMVariables, type PMContext } from "./PMVariables";

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export class TemplateError extends Error {
  constructor(public readonly kind: "notXMP" | "unreadable") {
    super(kind === "notXMP" ? "That file is not an XMP template" : "That template could not be read as text");
    this.name = "TemplateError";
  }
}

export class IPTCTemplate {
  /** The template document, verbatim. */
  readonly source: string;
  /** Existing `dc:description` content — the prepend base. Empty when the template has none. */
  readonly descriptionBase: string;

  constructor(source: string) {
    if (!source.includes("<x:xmpmeta") && !source.includes("<rdf:RDF")) throw new TemplateError("notXMP");
    this.source = source;
    this.descriptionBase = extractLangAlt("dc:description", source) ?? "";
  }

  /** Fields the template sets, for display and for sanity-checking a template before a run. */
  get declaredFields(): Record<string, string> {
    const out: Record<string, string> = {};
    // Flat attributes on rdf:Description, e.g. photoshop:City="Lincoln".
    const attr = /(\b(?:photoshop|xmpRights|xmp|Iptc4xmpCore|photomechanic|plus):[A-Za-z]+)="([^"]*)"/g;
    let m: RegExpExecArray | null;
    while ((m = attr.exec(this.source))) out[m[1]] = m[2];
    for (const el of ["dc:title", "dc:rights", "Iptc4xmpExt:Event"]) {
      const v = extractLangAlt(el, this.source);
      if (v != null) out[el] = v;
    }
    const creator = extractSeq("dc:creator", this.source)[0];
    if (creator != null) out["dc:creator"] = creator;
    return out;
  }

  /** Produce a finished packet: variables expanded, caption prepended to the base. */
  render(caption: string, altText?: string | null, variables: PMContext = {}): string {
    let doc = PMVariables.expand(this.source, variables);
    const merged = merge(caption, this.descriptionBase);
    doc = replaceLangAlt("dc:description", merged, doc);
    if (altText) doc = upsertAltText(altText, doc);
    return doc;
  }
}

/**
 * Caption above, template base below — preserving the base's own leading whitespace, which is
 * deliberate in Photo Mechanic templates (it produces the blank line between blocks).
 */
export function merge(caption: string, base: string): string {
  const c = caption.trim();
  if (!base) return c;
  if (!c) return base;
  // Idempotency guard: refusing to stack costs nothing and removes the whole failure mode of
  // four dc:description blocks accumulating across runs.
  if (base.startsWith(c)) return base;
  // The base commonly begins with newlines already; don't double them.
  return base.startsWith("\n") ? c + base : c + "\n\n" + base;
}

// ---- XMP surgery ----

export function extractLangAlt(element: string, xmp: string): string | null {
  const n = escapeRe(element);
  const m = new RegExp(`<${n}>\\s*<rdf:Alt>[\\s\\S]*?<rdf:li[^>]*>([\\s\\S]*?)</rdf:li>`).exec(xmp);
  return m ? decodeEntities(m[1]) : null;
}

export function extractSeq(element: string, xmp: string): string[] {
  const n = escapeRe(element);
  const m = new RegExp(`<${n}>\\s*<rdf:Seq>([\\s\\S]*?)</rdf:Seq>`).exec(xmp);
  if (!m) return [];
  const out: string[] = [];
  const li = /<rdf:li[^>]*>([\s\S]*?)<\/rdf:li>/g;
  let x: RegExpExecArray | null;
  while ((x = li.exec(m[1]))) out.push(decodeEntities(x[1]));
  return out;
}

/** Replace every `rdf:li` inside the element's `rdf:Alt` with `value`. */
export function replaceLangAlt(element: string, value: string, xmp: string): string {
  const block =
    `<${element}>\n` +
    `    <rdf:Alt>\n` +
    `     <rdf:li xml:lang="x-default">${escape(value)}</rdf:li>\n` +
    `    </rdf:Alt>\n` +
    `   </${element}>`;
  const n = escapeRe(element);
  const re = new RegExp(`<${n}>\\s*<rdf:Alt>[\\s\\S]*?</rdf:Alt>\\s*</${n}>`);
  if (re.test(xmp)) return xmp.replace(re, () => block);
  // No existing element — insert before the closing rdf:Description.
  return xmp.replace("</rdf:Description>", () => `${block}\n  </rdf:Description>`);
}

export function upsertAltText(value: string, xmp: string): string {
  if (xmp.includes("<Iptc4xmpCore:AltTextAccessibility>")) {
    return replaceLangAlt("Iptc4xmpCore:AltTextAccessibility", value, xmp);
  }
  const block =
    `   <Iptc4xmpCore:AltTextAccessibility>\n` +
    `    <rdf:Alt>\n` +
    `     <rdf:li xml:lang="x-default">${escape(value)}</rdf:li>\n` +
    `    </rdf:Alt>\n` +
    `   </Iptc4xmpCore:AltTextAccessibility>`;
  return xmp.replace("</rdf:Description>", () => `${block}\n  </rdf:Description>`);
}

export function escape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "&#xA;");
}

export function decodeEntities(s: string): string {
  return s.replace(/&#xA;/g, "\n").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}
