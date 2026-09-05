/**
 * Surgical replacement of a JPEG's XMP and IPTC segments.
 *
 * ImageIO's copy path preserves pixel data but rebuilds the EXIF segment, and in doing so
 * discards the embedded thumbnail: on a Sony A1 frame the EXIF APP1 shrank from 47,110 to 8,564
 * bytes. Photo Mechanic uses that thumbnail to browse a shoot, so losing it makes ingest visibly
 * slower — a poor trade for writing a caption.
 *
 * This rewrites the container directly: every segment is copied byte-for-byte and only the
 * targeted segment is swapped. EXIF, maker notes, the thumbnail, ICC profile and scan data are
 * untouched by construction rather than by hope. Nothing here ever decodes a pixel, which is
 * also the whole reason it runs unchanged in a browser.
 */

import { IPTCIIM } from "./IPTCIIM";

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: false });

/** The namespace header that identifies an APP1 segment as XMP rather than EXIF. */
const XMP_HEADER = encoder.encode("http://ns.adobe.com/xap/1.0/\0");
/**
 * A single APP1 segment cannot exceed 65,533 bytes of payload; beyond that XMP requires the
 * ExtendedXMP mechanism, which this does not implement.
 */
export const MAX_SEGMENT_PAYLOAD = 65_533;

/** Signature that identifies an APP13 segment as carrying Photoshop image resources. */
export const PHOTOSHOP_HEADER = encoder.encode("Photoshop 3.0\0");

export class SegmentError extends Error {
  constructor(public readonly kind: "notJPEG" | "truncated" | "tooLarge", detail?: number) {
    super(
      kind === "notJPEG" ? "not a JPEG"
      : kind === "truncated" ? "the file ended mid-segment"
      : `payload is ${detail} bytes; a single segment holds ${MAX_SEGMENT_PAYLOAD}`,
    );
    this.name = "SegmentError";
  }
}

function isSOI(data: Uint8Array): boolean {
  return data.length > 4 && data[0] === 0xff && data[1] === 0xd8;
}

function isStandalone(marker: number): boolean {
  return marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7);
}

function segmentLength(data: Uint8Array, i: number): number {
  return (data[i + 2] << 8) | data[i + 3];
}

function startsWith(data: Uint8Array, offset: number, prefix: Uint8Array): boolean {
  if (offset + prefix.length > data.length) return false;
  for (let k = 0; k < prefix.length; k++) if (data[offset + k] !== prefix[k]) return false;
  return true;
}

function concat(parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

function frame(marker: number, payload: Uint8Array): Uint8Array {
  const length = payload.length + 2; // the length field includes itself
  const seg = new Uint8Array(4 + payload.length);
  seg[0] = 0xff; seg[1] = marker;
  seg[2] = (length >> 8) & 0xff; seg[3] = length & 0xff;
  seg.set(payload, 4);
  return seg;
}

export const JPEGSegments = {
  isXMPSegment(data: Uint8Array, start: number, end: number): boolean {
    const from = start + 4;
    if (from + XMP_HEADER.length > end) return false;
    return startsWith(data, from, XMP_HEADER);
  },

  /** Return `data` with its XMP packet replaced by `xmp`, everything else byte-identical. */
  replacingXMP(data: Uint8Array, xmp: string): Uint8Array {
    if (!isSOI(data)) throw new SegmentError("notJPEG");

    const payload = concat([XMP_HEADER, encoder.encode(xmp)]);
    if (payload.length > MAX_SEGMENT_PAYLOAD) throw new SegmentError("tooLarge", payload.length);
    const newSegment = frame(0xe1, payload);

    const out: Uint8Array[] = [new Uint8Array([0xff, 0xd8])];
    let i = 2;
    let wroteXMP = false;
    let insertedBeforeFirstNonAPP1 = false;

    while (i < data.length) {
      if (data[i] !== 0xff) throw new SegmentError("truncated");
      const marker = data[i + 1];

      // Start of scan: the rest of the file is entropy-coded data — copy it verbatim.
      if (marker === 0xda) {
        if (!wroteXMP) { out.push(newSegment); wroteXMP = true; }
        out.push(data.subarray(i));
        break;
      }
      if (isStandalone(marker)) { out.push(data.subarray(i, i + 2)); i += 2; continue; }
      if (i + 4 > data.length) throw new SegmentError("truncated");
      const end = i + 2 + segmentLength(data, i);
      if (end > data.length) throw new SegmentError("truncated");

      const isXMP = marker === 0xe1 && JPEGSegments.isXMPSegment(data, i, end);
      if (isXMP) {
        // Replace this one; drop any further XMP segments so none can accumulate.
        if (!wroteXMP) { out.push(newSegment); wroteXMP = true; }
      } else {
        // XMP conventionally follows EXIF; insert before the first non-APP1 segment so the
        // packet lands early where readers expect it.
        if (!wroteXMP && !insertedBeforeFirstNonAPP1 && marker !== 0xe1 && marker !== 0xe0) {
          out.push(newSegment);
          wroteXMP = true;
          insertedBeforeFirstNonAPP1 = true;
        }
        out.push(data.subarray(i, end));
      }
      i = end;
    }
    if (!wroteXMP) throw new SegmentError("truncated");
    return concat(out);
  },

  /**
   * Replace (or insert) the APP13 block carrying IPTC-IIM.
   *
   * A sibling of `replacingXMP` rather than folded into it: the two segments are independent,
   * and a file may legitimately have one and not the other. Any 8BIM resources already in the
   * file that are not the IPTC one are carried across.
   */
  replacingIPTC(data: Uint8Array, iim: Uint8Array): Uint8Array {
    if (!isSOI(data)) throw new SegmentError("notJPEG");

    const existingBody = JPEGSegments.firstAPP13Body(data);
    const newSegment = (): Uint8Array => {
      const payload = IPTCIIM.app13Body(iim, existingBody);
      if (payload.length > MAX_SEGMENT_PAYLOAD) throw new SegmentError("tooLarge", payload.length);
      return frame(0xed, payload);
    };

    const out: Uint8Array[] = [new Uint8Array([0xff, 0xd8])];
    let i = 2;
    let wrote = false;

    while (i < data.length) {
      if (data[i] !== 0xff) throw new SegmentError("truncated");
      const marker = data[i + 1];

      if (marker === 0xda) {
        if (!wrote) { out.push(newSegment()); wrote = true; }
        out.push(data.subarray(i));
        break;
      }
      if (isStandalone(marker)) { out.push(data.subarray(i, i + 2)); i += 2; continue; }
      if (i + 4 > data.length) throw new SegmentError("truncated");
      const end = i + 2 + segmentLength(data, i);
      if (end > data.length) throw new SegmentError("truncated");

      if (marker === 0xed) {
        // Replace the first APP13 and drop any others, so none accumulate.
        if (!wrote) { out.push(newSegment()); wrote = true; }
      } else {
        // APP13 conventionally sits after EXIF and XMP, before the image data.
        if (!wrote && marker !== 0xe0 && marker !== 0xe1) {
          out.push(newSegment());
          wrote = true;
        }
        out.push(data.subarray(i, end));
      }
      i = end;
    }
    if (!wrote) throw new SegmentError("truncated");
    return concat(out);
  },

  /** The body of the first APP13 segment, signature included, or null when there is none. */
  firstAPP13Body(data: Uint8Array): Uint8Array | null {
    let i = 2;
    while (i + 4 <= data.length) {
      if (data[i] !== 0xff) return null;
      const marker = data[i + 1];
      if (marker === 0xda) return null;
      if (isStandalone(marker)) { i += 2; continue; }
      const end = i + 2 + segmentLength(data, i);
      if (end > data.length) return null;
      if (marker === 0xed) return data.slice(i + 4, end);
      i = end;
    }
    return null;
  },

  /** Segment inventory, for verifying that a write disturbed only what it should. */
  segmentSizes(data: Uint8Array): { name: string; size: number }[] {
    if (!isSOI(data)) return [];
    const out: { name: string; size: number }[] = [];
    let i = 2;
    while (i + 4 <= data.length) {
      if (data[i] !== 0xff) break;
      const marker = data[i + 1];
      if (marker === 0xda) { out.push({ name: "scan", size: data.length - i }); break; }
      if (isStandalone(marker)) { i += 2; continue; }
      const len = segmentLength(data, i);
      const end = i + 2 + len;
      if (end > data.length) break;
      const name = marker === 0xe1
        ? (JPEGSegments.isXMPSegment(data, i, end) ? "XMP" : "EXIF")
        : "0x" + marker.toString(16).toUpperCase().padStart(2, "0");
      out.push({ name, size: len });
      i = end;
    }
    return out;
  },

  /** The entropy-coded data from SOS to the end, for proving a write left the image alone. */
  scanData(data: Uint8Array): Uint8Array {
    let i = 2;
    while (i + 4 <= data.length && data[i] === 0xff) {
      const marker = data[i + 1];
      if (marker === 0xda) return data.subarray(i);
      if (isStandalone(marker)) { i += 2; continue; }
      i += 2 + segmentLength(data, i);
    }
    return new Uint8Array(0);
  },

  /** Extract the XMP packet, if the file carries one. */
  extractXMP(data: Uint8Array): string | null {
    if (!isSOI(data)) return null;
    let i = 2;
    while (i + 4 <= data.length) {
      if (data[i] !== 0xff) return null;
      const marker = data[i + 1];
      if (marker === 0xda) return null;
      if (isStandalone(marker)) { i += 2; continue; }
      const end = i + 2 + segmentLength(data, i);
      if (end > data.length) return null;
      if (marker === 0xe1 && JPEGSegments.isXMPSegment(data, i, end)) {
        return decoder.decode(data.subarray(i + 4 + XMP_HEADER.length, end));
      }
      i = end;
    }
    return null;
  },

  /** Width and height from the first SOF marker, without decoding anything. */
  dimensions(data: Uint8Array): { width: number; height: number } | null {
    if (!isSOI(data)) return null;
    let i = 2;
    while (i + 9 < data.length) {
      if (data[i] !== 0xff) { i++; continue; }
      const marker = data[i + 1];
      const isSOF = (marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7)
        || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf);
      if (isSOF) {
        return { height: (data[i + 5] << 8) | data[i + 6], width: (data[i + 7] << 8) | data[i + 8] };
      }
      if (marker === 0xd8 || isStandalone(marker)) { i += 2; continue; }
      if (marker === 0xda) return null;
      i += 2 + segmentLength(data, i);
    }
    return null;
  },
};
