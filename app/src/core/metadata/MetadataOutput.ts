/**
 * Building the packet that goes out to disk — into the JPEG, or beside a RAW.
 *
 * One function, called from both the captioning run and from review. They used to build the
 * packet separately and had drifted: review set neither the city/state variables nor the camera
 * serial, and never replaced `photoshop:DateCreated` with the frame's own capture date.
 * Correcting a jersey number therefore rewrote the file with the template's hardcoded date and
 * with `{city}` left unresolved — a silent downgrade in the one workflow that exists to fix
 * mistakes.
 */

import { IPTCTemplate } from "./IPTCTemplate";
import { XMPSidecar, type CaptionSource } from "./XMPSidecar";
import { XMPFieldWriter } from "./XMPFieldWriter";
import { HurrdatFields } from "./HurrdatFields";
import { EmbeddedMetadataWriter } from "./EmbeddedMetadataWriter";
import { PhotoMetadata } from "../images/PhotoMetadata";
import { SupportedFormats } from "../images/SupportedFormats";

export interface OutputOptions {
  template?: IPTCTemplate | null;
  city?: string;
  state?: string;
  /** What the desk's sheet wants that a template cannot hold. Null leaves the template's own values alone. */
  fields?: HurrdatFields | null;
  /** The By-line, when the template supplies none — the name from Settings. */
  photographer?: string | null;
}

export const MetadataOutput = {
  /** Build the XMP packet exactly as it will be written. */
  packet(caption: string, altText: string | null | undefined, imageName: string,
         exif: PhotoMetadata, options: OutputOptions, source: CaptionSource): string {
    const dot = imageName.lastIndexOf(".");
    const stem = dot > 0 ? imageName.slice(0, dot) : imageName;

    let packet = options.template
      ? options.template.render(caption, altText, {
          fileBaseName: stem,
          iptcCity: options.city,
          iptcState: options.state,
          iptcCaption: caption,
          bodySerialNumber: exif.bodySerialNumber,
        })
      : XMPSidecar.serialise({
          description: caption,
          altTextAccessibility: altText ?? undefined,
          captionSource: source,
        });

    // The template carries whatever date it was saved with. The frame's own capture date is the
    // correct one, and it is what the IIM 2:55 dataset is derived from.
    const day = PhotoMetadata.iptcDateCreated(exif);
    if (day) {
      // Set, not merely replaced: a packet built without a template has no date to replace, and
      // the IIM 2:55 dataset a desk files by is derived from this attribute.
      packet = XMPFieldWriter.setAttribute("photoshop:DateCreated", day, packet)
        .replace(/xmp:CreateDate="[^"]*"/g, `xmp:CreateDate="${day}"`);
    }

    if (options.fields) {
      const fields = { ...options.fields };
      // The descriptor carries the date of the frame in hand, so a shoot spanning midnight still
      // describes each photo by the day it was taken.
      if (day) {
        const iso = HurrdatFields.isoDate(day.replace(/-/g, ""));
        if (iso) fields.descriptor = fields.descriptor.split(HurrdatFields.datePlaceholder).join(iso);
      }
      packet = MetadataOutput.apply(fields, packet);
    }
    // The photographer's name is the By-line. A template that names a creator keeps its own.
    const photographer = options.photographer?.trim();
    if (photographer && !/<dc:creator[\s>]/.test(packet)) packet = XMPFieldWriter.setSeq("dc:creator", [photographer], packet);
    return packet;
  },

  /**
   * Write the shoot's own values over whatever the template carried.
   *
   * A Photo Mechanic template is a saved set of literal strings — the one shipped with this app
   * said `Nebraska Football v Opponent - 2026-08-25` on every frame of every shoot until somebody
   * edited it by hand. Everything here is known from the setup screen, so the app fills it in
   * rather than asking for a template per fixture.
   */
  apply(fields: HurrdatFields, packet: string): string {
    let out = packet;
    // One string in three places, which is how the desk's sheet specifies it.
    if (fields.descriptor) {
      out = XMPFieldWriter.setAttribute("photoshop:Headline", fields.descriptor, out);
      out = XMPFieldWriter.setLangAlt("dc:title", fields.descriptor, out);
      out = XMPFieldWriter.setLangAlt("Iptc4xmpExt:Event", fields.descriptor, out);
    }
    if (fields.category) out = XMPFieldWriter.setAttribute("photoshop:Category", fields.category, out);
    // Always written, even when there is no code. A template saved at a football game carries
    // `FB`, so a soccer shoot would go to the desk filed as college football. A blank field is
    // merely missing; a wrong one is a wrong claim.
    out = XMPFieldWriter.setBag("photoshop:SupplementalCategories",
      fields.supplementalCategory ? [fields.supplementalCategory] : [], out);
    if (fields.city) {
      out = XMPFieldWriter.setAttribute("photoshop:City", fields.city, out);
      out = XMPFieldWriter.setLocationCreated("Iptc4xmpExt:City", fields.city, out);
    }
    if (fields.state) {
      out = XMPFieldWriter.setAttribute("photoshop:State", fields.state, out);
      out = XMPFieldWriter.setLocationCreated("Iptc4xmpExt:ProvinceState", fields.state, out);
    }
    if (fields.sublocation) {
      out = XMPFieldWriter.setAttribute("Iptc4xmpCore:Location", fields.sublocation, out);
      out = XMPFieldWriter.setLocationCreated("Iptc4xmpExt:Sublocation", fields.sublocation, out);
    }
    return out;
  },

  /**
   * What to write, and where.
   *
   * Embedding is JPEG segment surgery. A camera RAW has no such container, and rewriting one
   * would mean re-encoding the photograph. So anything that is not a JPEG gets a sidecar,
   * whatever the setting says, rather than being silently skipped.
   */
  plan(imageName: string, packet: string, original: Uint8Array | null):
    { kind: "embed"; bytes: Uint8Array } | { kind: "sidecar"; name: string; text: string } {
    if (SupportedFormats.canEmbed(imageName) && original) {
      return { kind: "embed", bytes: EmbeddedMetadataWriter.embed(packet, original) };
    }
    return { kind: "sidecar", name: XMPSidecar.sidecarName(imageName), text: packet };
  },
};
