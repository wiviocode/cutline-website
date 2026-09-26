/**
 * Extracts embedded JPEG previews from a camera RAW file.
 *
 * RAW containers (Sony `.ARW`, Canon `.CR2`, Nikon `.NEF`, Adobe `.DNG`) are TIFF files whose
 * IFDs point at one or more embedded JPEGs. Sony ARW typically carries three: a 160×120
 * thumbnail, a 1616×1080 preview, and a full-size 8640×5760 preview.
 *
 * **Scanning for `FF D8 FF` is not sufficient** — that byte sequence occurs inside sensor data
 * and produces phantom previews with nonsense dimensions. This parses the IFD chain instead.
 *
 * In the browser this is not an optimisation but the whole route: no browser decodes ARW, and
 * the embedded preview is both what the photographer sees and what the model sees.
 */

export interface Preview { offset: number; length: number; width: number; height: number }

export class ExtractError extends Error {
  constructor(public readonly kind: "notATIFF" | "truncated" | "noPreviewFound") {
    super(kind === "notATIFF" ? "not a TIFF-based RAW" : kind === "truncated" ? "the file is truncated" : "no embedded preview found");
    this.name = "ExtractError";
  }
}

const TAG = { subIFDs: 0x014a, jpegInterchangeFormat: 0x0201, jpegInterchangeLength: 0x0202 } as const;

export const RAWPreviewExtractor = {
  longestEdge(p: Preview): number { return Math.max(p.width, p.height); },

  /** Enumerate every embedded JPEG the container declares, smallest first. */
  previews(data: Uint8Array): Preview[] {
    if (data.length <= 8) throw new ExtractError("truncated");
    let little: boolean;
    if (data[0] === 0x49 && data[1] === 0x49) little = true;        // "II"
    else if (data[0] === 0x4d && data[1] === 0x4d) little = false;  // "MM"
    else throw new ExtractError("notATIFF");
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const r16 = (o: number) => (o + 2 <= data.length ? view.getUint16(o, little) : 0);
    const r32 = (o: number) => (o + 4 <= data.length ? view.getUint32(o, little) : 0);
    if (r16(2) !== 42) throw new ExtractError("notATIFF");

    const found: Preview[] = [];
    const visited = new Set<number>();
    const queue: number[] = [r32(4)];

    while (queue.length) {
      const ifdOffset = queue.pop()!;
      if (ifdOffset <= 0 || ifdOffset + 2 > data.length || visited.has(ifdOffset)) continue;
      visited.add(ifdOffset);
      const count = r16(ifdOffset);
      let jpegOffset: number | null = null, jpegLength: number | null = null;

      for (let i = 0; i < count; i++) {
        const e = ifdOffset + 2 + i * 12;
        if (e + 12 > data.length) break;
        const tag = r16(e), type = r16(e + 2), n = r32(e + 4), valueOffset = e + 8;
        switch (tag) {
          case TAG.subIFDs: {
            // One or more pointers, inline when they fit in four bytes.
            const size = type === 4 ? 4 : 2;
            if (n * size <= 4) {
              for (let k = 0; k < n; k++) queue.push(size === 4 ? r32(valueOffset + k * 4) : r16(valueOffset + k * 2));
            } else {
              const base = r32(valueOffset);
              for (let k = 0; k < n && base + k * size + size <= data.length; k++) queue.push(size === 4 ? r32(base + k * 4) : r16(base + k * 2));
            }
            break;
          }
          case TAG.jpegInterchangeFormat: jpegOffset = r32(valueOffset); break;
          case TAG.jpegInterchangeLength: jpegLength = r32(valueOffset); break;
        }
      }

      if (jpegOffset != null && jpegLength != null && jpegLength > 0 && jpegOffset + jpegLength <= data.length
        && data[jpegOffset] === 0xff && data[jpegOffset + 1] === 0xd8) {
        const d = jpegDimensions(data, jpegOffset, jpegOffset + jpegLength);
        if (d) found.push({ offset: jpegOffset, length: jpegLength, width: d.width, height: d.height });
      }
      // Follow the next-IFD pointer.
      const next = ifdOffset + 2 + count * 12;
      if (next + 4 <= data.length) queue.push(r32(next));
    }
    if (found.length === 0) throw new ExtractError("noPreviewFound");
    return found.sort((a, b) => RAWPreviewExtractor.longestEdge(a) - RAWPreviewExtractor.longestEdge(b));
  },

  /**
   * The smallest preview whose longest edge still meets `target`, else the largest available.
   * Decoding the 8640 px full-size preview to make a 320 px thumbnail wastes most of the work.
   */
  bestPreview(data: Uint8Array, targetLongestEdge: number): Preview {
    const all = RAWPreviewExtractor.previews(data);
    return all.find((p) => RAWPreviewExtractor.longestEdge(p) >= targetLongestEdge) ?? all[all.length - 1];
  },

  jpegData(data: Uint8Array, preview: Preview): Uint8Array {
    return data.subarray(preview.offset, preview.offset + preview.length);
  },
};

/** Read width/height from a JPEG SOF marker. */
function jpegDimensions(d: Uint8Array, start: number, limit: number): { width: number; height: number } | null {
  let i = start + 2;
  const end = Math.min(limit, d.length);
  while (i + 9 < end) {
    if (d[i] !== 0xff) { i++; continue; }
    const marker = d[i + 1];
    const isSOF = (marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf);
    if (isSOF) return { height: (d[i + 5] << 8) | d[i + 6], width: (d[i + 7] << 8) | d[i + 8] };
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
    if (i + 4 > d.length) break;
    i += 2 + ((d[i + 2] << 8) | d[i + 3]);
  }
  return null;
}
