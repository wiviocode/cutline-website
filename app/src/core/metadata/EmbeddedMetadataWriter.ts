/**
 * Writes an XMP packet — and the legacy IIM block derived from it — into a JPEG's own bytes.
 *
 * Both blocks are written: the XMP packet **and** the IPTC-IIM block in APP13. Photo Mechanic
 * writes both, and a great deal of ingest tooling still reads only the IIM one — a file carrying
 * XMP alone can arrive in a library system with every field blank.
 *
 * Bytes in, bytes out. Putting the result on disk — atomically, so an interrupted write cannot
 * truncate a photograph — is the platform's job.
 */

import { JPEGSegments } from "./JPEGSegments";
import { IPTCIIM } from "./IPTCIIM";
import { XMPToIIM } from "./XMPToIIM";

export interface Readback {
  description?: string;
  creator?: string;
  credit?: string;
  city?: string;
  state?: string;
  dateCreated?: string;
  pixelWidth?: number;
  pixelHeight?: number;
  hasEXIF: boolean;
}

export const EmbeddedMetadataWriter = {
  /** Replace the XMP packet in a JPEG, and derive and replace its IIM block. */
  embed(xmp: string, original: Uint8Array, writeIIM = true): Uint8Array {
    let updated = JPEGSegments.replacingXMP(original, xmp);
    if (writeIIM) {
      // The IIM block is derived from the packet just written, so the two can never disagree.
      const fields = XMPToIIM.fields(xmp);
      if (fields.length > 0) updated = JPEGSegments.replacingIPTC(updated, IPTCIIM.encode(fields));
    }
    return updated;
  },

  /** Read back the embedded XMP, for verification. */
  readXMP(data: Uint8Array): string | null {
    return JPEGSegments.extractXMP(data);
  },

  /** Values for the fields that matter, so a write can be checked without parsing XMP by hand. */
  read(data: Uint8Array): Readback {
    const r: Readback = { hasEXIF: false };
    const dims = JPEGSegments.dimensions(data);
    if (dims) { r.pixelWidth = dims.width; r.pixelHeight = dims.height; }
    r.hasEXIF = JPEGSegments.segmentSizes(data).some((s) => s.name === "EXIF");

    // IIM first, then XMP over the top: XMP is authoritative where both exist — it is what
    // Photo Mechanic and Adobe read.
    const app13 = JPEGSegments.firstAPP13Body(data);
    const iim = app13 ? IPTCIIM.iimFromAPP13(app13) : null;
    if (iim) {
      for (const f of IPTCIIM.decode(iim)) {
        if (f.record !== 2) continue;
        switch (f.dataset) {
          case 120: r.description = f.text; break;
          case 110: r.credit = f.text; break;
          case 90:  r.city = f.text; break;
          case 95:  r.state = f.text; break;
          case 55:  r.dateCreated = f.text; break;
          case 80:  r.creator = f.text; break;
        }
      }
    }
    const xmp = JPEGSegments.extractXMP(data);
    if (xmp) {
      const d = XMPToIIM.langAlt("dc:description", xmp); if (d != null) r.description = d;
      const c = XMPToIIM.seqFirst("dc:creator", xmp); if (c != null) r.creator = c;
      const cr = XMPToIIM.attribute("photoshop:Credit", xmp); if (cr != null) r.credit = cr;
      const ci = XMPToIIM.attribute("photoshop:City", xmp); if (ci != null) r.city = ci;
      const st = XMPToIIM.attribute("photoshop:State", xmp); if (st != null) r.state = st;
      const dc = XMPToIIM.attribute("photoshop:DateCreated", xmp); if (dc != null) r.dateCreated = dc;
    }
    return r;
  },
};
