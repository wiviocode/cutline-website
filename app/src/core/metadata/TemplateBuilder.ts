/**
 * An IPTC template made in the app, from the fields a desk carries on every photograph — the
 * credit line, the copyright notice, the source, usage terms, instructions, and how to reach the
 * photographer. The same standing fields a Photo Mechanic stationery pad holds, without needing
 * Photo Mechanic to make one.
 *
 * The result is an ordinary XMP template: `IPTCTemplate` reads it back like any exported pad,
 * the per-shoot fields are written over it, and the IIM block is derived from it. The template
 * carries no By-line, so the photographer's name in Settings reaches every frame as the creator.
 */

import { XMPFieldWriter, XMP_NAMESPACES } from "./XMPFieldWriter";

export interface DeskFields {
  credit?: string;
  source?: string;
  copyright?: string;
  usageTerms?: string;
  instructions?: string;
  jobTitle?: string;
  email?: string;
  website?: string;
  phone?: string;
}

export interface DeskFieldSpec { id: keyof DeskFields; label: string; hint: string; placeholder: string; multiline?: boolean; iim?: string }

export const TemplateBuilder = {
  /** The form, in the order a desk fills it in. */
  fields: [
    { id: "credit",       label: "Credit line",       hint: "IPTC Credit (2:110). How the photograph is credited when it runs: Name/House.", placeholder: "Jane Doe/Hurrdat Sports", iim: "2:110" },
    { id: "copyright",    label: "Copyright notice",  hint: "IPTC Copyright Notice (2:116). Marks the photograph as copyrighted.", placeholder: "© 2026 Hurrdat Sports", iim: "2:116" },
    { id: "source",       label: "Source",            hint: "IPTC Source (2:115). The original owner of the copyright — the agency, the paper, or the photographer.", placeholder: "Hurrdat Sports", iim: "2:115" },
    { id: "usageTerms",   label: "Usage terms",       hint: "Rights usage terms. What a recipient may do with the photograph.", placeholder: "Editorial use only. No resale, no archive.", multiline: true },
    { id: "instructions", label: "Instructions",      hint: "IPTC Special Instructions (2:40). A standing note to the desk.", placeholder: "Not for syndication.", multiline: true, iim: "2:40" },
    { id: "jobTitle",     label: "Job title",         hint: "IPTC By-line Title (2:85). The photographer's title, beside their name.", placeholder: "Staff photographer", iim: "2:85" },
    { id: "email",        label: "Contact email",     hint: "Creator contact info. Where a desk writes when it needs to.", placeholder: "photo@example.com" },
    { id: "website",      label: "Website",           hint: "Creator contact info.", placeholder: "https://example.com" },
    { id: "phone",        label: "Phone",             hint: "Creator contact info.", placeholder: "+1 402 555 0100" },
  ] as DeskFieldSpec[],

  /** A starting point from what the setup already knows. */
  suggest(settings: { photographer: string; house: string }): DeskFields & { name: string } {
    const name = settings.photographer.trim(), house = settings.house.trim();
    const owner = house || name;
    return {
      name: house ? house : name ? `${name}'s desk` : "My desk",
      credit: name && house ? `${name}/${house}` : owner,
      copyright: owner ? `© ${new Date().getFullYear()} ${owner}` : "",
      source: owner,
    };
  },

  /** True when there is something worth saving. */
  hasContent(f: DeskFields): boolean {
    return TemplateBuilder.fields.some((spec) => (f[spec.id] ?? "").trim() !== "");
  },

  /** The XMP template. Blank fields are left out rather than written empty. */
  build(f: DeskFields): string {
    const v = (k: keyof DeskFields) => (f[k] ?? "").trim();
    const esc = XMPFieldWriter.escape;
    const ns = ["dc", "photoshop", "xmpRights", "Iptc4xmpCore", "cutline"].map((p) => `    xmlns:${p}="${XMP_NAMESPACES[p]}"`).join("\n");
    const attrs: string[] = [];
    if (v("credit")) attrs.push(`photoshop:Credit="${esc(v("credit"))}"`);
    if (v("source")) attrs.push(`photoshop:Source="${esc(v("source"))}"`);
    if (v("instructions")) attrs.push(`photoshop:Instructions="${esc(v("instructions"))}"`);
    if (v("jobTitle")) attrs.push(`photoshop:AuthorsPosition="${esc(v("jobTitle"))}"`);
    if (v("copyright")) attrs.push(`xmpRights:Marked="True"`);
    if (v("website")) attrs.push(`xmpRights:WebStatement="${esc(v("website"))}"`);
    const langAlt = (el: string, value: string) =>
      `   <${el}>\n    <rdf:Alt>\n     <rdf:li xml:lang="x-default">${esc(value)}</rdf:li>\n    </rdf:Alt>\n   </${el}>\n`;
    let body = "";
    if (v("copyright")) body += langAlt("dc:rights", v("copyright"));
    if (v("usageTerms")) body += langAlt("xmpRights:UsageTerms", v("usageTerms"));
    const contact = [["CiEmailWork", v("email")], ["CiUrlWork", v("website")], ["CiTelWork", v("phone")]].filter(([, x]) => x);
    if (contact.length) {
      body += `   <Iptc4xmpCore:CreatorContactInfo rdf:parseType="Resource">\n` +
        contact.map(([el, x]) => `    <Iptc4xmpCore:${el}>${esc(x)}</Iptc4xmpCore:${el}>\n`).join("") +
        `   </Iptc4xmpCore:CreatorContactInfo>\n`;
    }
    return (
      `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>\n` +
      `<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="Cutline">\n` +
      ` <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">\n` +
      `  <rdf:Description rdf:about=""\n${ns}` + (attrs.length ? `\n   ${attrs.join("\n   ")}` : "") + `>\n` +
      body +
      `  </rdf:Description>\n` +
      ` </rdf:RDF>\n` +
      `</x:xmpmeta>\n` +
      `<?xpacket end="w"?>`
    );
  },
};
