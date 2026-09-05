/**
 * Legacy IPTC IIM — the metadata block that lives in a JPEG's APP13 segment.
 *
 * XMP alone is not enough. Photo Mechanic writes **both** XMP and IIM into every file it stamps,
 * and a great deal of the industry's ingest tooling still reads the IIM block. A file carrying
 * only XMP can open in a library system with every field blank, which is exactly the symptom
 * that prompted this: sidecars written, JPEGs untouched, nothing showing downstream.
 *
 * Structure, outermost first:
 *
 *     FFED <len:2> "Photoshop 3.0\0"        APP13 segment
 *       "8BIM" <id:2> <name> <size:4> …     image-resource blocks; IPTC is id 0x0404
 *         1C <record> <dataset> <len:2> …   IIM datasets
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: false });

export interface IIMField {
  /** Datasets are record 2 unless stated. */
  record: number;
  dataset: number;
  value: string;
  /** IIM's own maximum octet count for this dataset. */
  maxBytes: number;
}

export interface Dataset { ds: number; max: number }

const SIGNATURE = encoder.encode("Photoshop 3.0\0");
const EIGHT_BIM = encoder.encode("8BIM");

function concat(parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

export const IPTCIIM = {
  // Dataset numbers and their IIM length limits.
  objectName:   { ds: 5,   max: 64 } as Dataset,
  category:     { ds: 15,  max: 3 } as Dataset,
  suppCategory: { ds: 20,  max: 32 } as Dataset,
  keywords:     { ds: 25,  max: 64 } as Dataset,
  dateCreated:  { ds: 55,  max: 8 } as Dataset,
  byline:       { ds: 80,  max: 32 } as Dataset,
  bylineTitle:  { ds: 85,  max: 32 } as Dataset,
  city:         { ds: 90,  max: 32 } as Dataset,
  /** Photo Mechanic labels this one "Location". The venue goes here. */
  sublocation:  { ds: 92,  max: 32 } as Dataset,
  state:        { ds: 95,  max: 32 } as Dataset,
  countryCode:  { ds: 100, max: 3 } as Dataset,
  countryName:  { ds: 101, max: 64 } as Dataset,
  headline:     { ds: 105, max: 256 } as Dataset,
  credit:       { ds: 110, max: 32 } as Dataset,
  source:       { ds: 115, max: 32 } as Dataset,
  copyright:    { ds: 116, max: 128 } as Dataset,
  caption:      { ds: 120, max: 2000 } as Dataset,
  writer:       { ds: 122, max: 32 } as Dataset,

  field(dataset: Dataset, value: string, record = 2): IIMField {
    return { record, dataset: dataset.ds, value, maxBytes: dataset.max };
  },

  /**
   * Encode fields as an IIM record stream.
   *
   * Two datasets are emitted before anything else and are easy to omit by accident: `1:90`
   * declares UTF-8 (`ESC % G`), without which readers fall back to Latin-1 and mangle anything
   * non-ASCII; `2:00` is the record version, which some readers use to decide the block is
   * valid at all.
   */
  encode(fields: IIMField[]): Uint8Array {
    const parts: Uint8Array[] = [];
    parts.push(dataset(1, 90, new Uint8Array([0x1b, 0x25, 0x47])));
    parts.push(dataset(2, 0, new Uint8Array([0x00, 0x04])));
    for (const f of fields) {
      const trimmed = f.value.trim();
      if (!trimmed) continue;
      parts.push(dataset(f.record, f.dataset, IPTCIIM.truncate(trimmed, f.maxBytes)));
    }
    return concat(parts);
  },

  /** Truncate to a byte budget without splitting a UTF-8 sequence. */
  truncate(s: string, limit: number): Uint8Array {
    let data = encoder.encode(s);
    if (data.length <= limit) return data;
    data = data.slice(0, limit);
    // Walk back off any continuation bytes (10xxxxxx) plus the lead byte they belong to.
    let n = data.length;
    while (n > 0 && (data[n - 1] & 0b1100_0000) === 0b1000_0000) n--;
    if (n > 0 && (data[n - 1] & 0b1000_0000) !== 0) n--;
    return data.slice(0, n);
  },

  /** Wrap an IIM stream in the 8BIM image-resource block Photoshop and Photo Mechanic use. */
  resourceBlock(iim: Uint8Array): Uint8Array {
    const head = new Uint8Array(12);
    head.set(EIGHT_BIM, 0);
    head[4] = 0x04; head[5] = 0x04;      // resource id 0x0404 = IPTC-NAA
    head[6] = 0x00; head[7] = 0x00;      // empty Pascal name, padded to even
    const size = iim.length;
    head[8] = (size >>> 24) & 0xff; head[9] = (size >>> 16) & 0xff;
    head[10] = (size >>> 8) & 0xff; head[11] = size & 0xff;
    const parts = [head, iim];
    if (iim.length % 2 === 1) parts.push(new Uint8Array([0])); // padded to even length
    return concat(parts);
  },

  /**
   * The full APP13 segment body: the signature followed by resource blocks.
   *
   * Any resource blocks already present are preserved except `0x0404`, which is replaced — a
   * file may carry Photoshop's own resources alongside the IPTC one, and discarding them would
   * lose data that has nothing to do with captioning.
   */
  app13Body(iim: Uint8Array, existing: Uint8Array | null): Uint8Array {
    const parts: Uint8Array[] = [SIGNATURE];
    if (existing) {
      const resources = parseResources(existing);
      if (resources) for (const r of resources) if (r.id !== 0x0404) parts.push(r.raw);
    }
    parts.push(IPTCIIM.resourceBlock(iim));
    return concat(parts);
  },

  /** The IIM stream inside an APP13 body, or null when it carries none. */
  iimFromAPP13(body: Uint8Array): Uint8Array | null {
    const resources = parseResources(body);
    if (!resources) return null;
    const r = resources.find((x) => x.id === 0x0404);
    return r ? r.data : null;
  },

  /** Decode an IIM stream back into fields. Independent of the encoder, so it can check it. */
  decode(d: Uint8Array): { record: number; dataset: number; bytes: Uint8Array; text: string }[] {
    const out: { record: number; dataset: number; bytes: Uint8Array; text: string }[] = [];
    let i = 0;
    while (i + 5 <= d.length) {
      if (d[i] !== 0x1c) break;
      const record = d[i + 1], ds = d[i + 2];
      const len = (d[i + 3] << 8) | d[i + 4];
      const start = i + 5;
      if (start + len > d.length) break;
      const bytes = d.slice(start, start + len);
      out.push({ record, dataset: ds, bytes, text: decoder.decode(bytes) });
      i = start + len;
    }
    return out;
  },
};

function dataset(record: number, ds: number, bytes: Uint8Array): Uint8Array {
  // The standard's extended form covers values over 32767 octets; nothing here can reach it,
  // since the largest field is the 2000-octet caption.
  const n = Math.min(bytes.length, 32_767);
  const out = new Uint8Array(5 + n);
  out[0] = 0x1c; out[1] = record; out[2] = ds;
  out[3] = (n >> 8) & 0xff; out[4] = n & 0xff;
  out.set(bytes.subarray(0, n), 5);
  return out;
}

interface Resource { id: number; raw: Uint8Array; data: Uint8Array }

/** Walk the 8BIM chain in an existing APP13 body. Null when malformed. */
function parseResources(body: Uint8Array): Resource[] | null {
  let i = 0;
  if (body.length >= SIGNATURE.length) {
    let match = true;
    for (let k = 0; k < SIGNATURE.length; k++) if (body[k] !== SIGNATURE[k]) { match = false; break; }
    if (match) i = SIGNATURE.length;
  }
  const out: Resource[] = [];
  while (i + 12 <= body.length) {
    const start = i;
    if (body[i] !== 0x38 || body[i + 1] !== 0x42 || body[i + 2] !== 0x49 || body[i + 3] !== 0x4d) break;
    i += 4;
    const id = (body[i] << 8) | body[i + 1];
    i += 2;
    // Pascal-style name, padded so the pair occupies an even number of bytes.
    const nameLength = body[i];
    const nameField = nameLength + 1;
    i += nameField + (nameField % 2 === 1 ? 1 : 0);
    if (i + 4 > body.length) return null;
    const size = ((body[i] << 24) | (body[i + 1] << 16) | (body[i + 2] << 8) | body[i + 3]) >>> 0;
    i += 4;
    const padded = size + (size % 2 === 1 ? 1 : 0);
    if (i + padded > body.length) return null;
    const data = body.slice(i, i + size);
    i += padded;
    out.push({ id, raw: body.slice(start, i), data });
  }
  return out;
}
