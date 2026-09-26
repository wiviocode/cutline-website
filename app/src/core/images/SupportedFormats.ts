/**
 * Which files this app will take in, and which it can write metadata back into.
 *
 * The two lists are deliberately different. Anything here can be captioned — but the IPTC
 * writer is JPEG segment surgery: it rebuilds an APP13 block inside a JFIF container. There is
 * no equivalent for a camera RAW, and rewriting one would mean re-encoding the photograph, which
 * this app will not do. So a RAW or a PNG is captioned like anything else and its metadata is
 * written to a sidecar beside it.
 */

const ext = (name: string) => {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
};

export const SupportedFormats = {
  /** Camera RAW, by the extensions the major makers use. */
  raw: new Set(["cr2", "cr3", "crw", "nef", "nrw", "arw", "srf", "sr2", "orf", "raf", "rw2", "pef", "dng"]),

  /** Everything the app will open. */
  readable: new Set(["jpg", "jpeg", "png", "heic", "heif", "tif", "tiff",
    "cr2", "cr3", "crw", "nef", "nrw", "arw", "srf", "sr2", "orf", "raf", "rw2", "pef", "dng"]),

  /** Everything the metadata writer can put IPTC and XMP inside. */
  embeddable: new Set(["jpg", "jpeg"]),

  isReadable(name: string): boolean { return SupportedFormats.readable.has(ext(name)); },
  isRaw(name: string): boolean { return SupportedFormats.raw.has(ext(name)); },
  /** Whether metadata can go into the file itself, or has to go beside it. */
  canEmbed(name: string): boolean { return SupportedFormats.embeddable.has(ext(name)); },
  extension: ext,

  /** "25 photos" · "25 photos · 4 need a sidecar". */
  summary(names: string[]): string {
    const sidecarOnly = names.filter((n) => !SupportedFormats.canEmbed(n)).length;
    if (sidecarOnly === 0) return `${names.length} photos`;
    return `${names.length} photos · ${sidecarOnly} need a sidecar`;
  },
};
