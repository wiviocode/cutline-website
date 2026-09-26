/**
 * Idempotency manifest: prevents re-captioning a file the app has already done.
 *
 * Format matches the native app's `.caption-manifest.json`: a flat array of content signatures,
 * with timestamps in **Core Foundation absolute time** (seconds since 2001-01-01), not Unix
 * epoch, so the two apps can read each other's.
 */

export interface ProcessedFileRecord {
  filename: string;
  fileSize: number;
  modificationDate: number;
  processedAt: number;
}

export const CFTime = {
  /** Offset between the Unix epoch and Core Foundation's 2001-01-01 reference date. */
  referenceOffset: 978_307_200,
  fromUnix(t: number): number { return t - CFTime.referenceOffset; },
  toUnix(t: number): number { return t + CFTime.referenceOffset; },
  now(date: Date = new Date()): number { return CFTime.fromUnix(date.getTime() / 1000); },
};

export const ProcessedFilesManifest = {
  fileName: ".caption-manifest.json",

  parse(text: string): ProcessedFileRecord[] {
    try {
      const raw = JSON.parse(text);
      if (!Array.isArray(raw)) return [];
      return raw.filter((r) => r && typeof r.filename === "string" && typeof r.fileSize === "number"
        && typeof r.modificationDate === "number").map((r) => ({
          filename: r.filename, fileSize: r.fileSize, modificationDate: r.modificationDate,
          processedAt: typeof r.processedAt === "number" ? r.processedAt : CFTime.now(),
        }));
    } catch { return []; }
  },

  serialise(records: ProcessedFileRecord[]): string {
    const sorted = records.map((r) => ({ fileSize: r.fileSize, filename: r.filename, modificationDate: r.modificationDate, processedAt: r.processedAt }));
    return JSON.stringify(sorted, null, 2);
  },

  /**
   * A file counts as already processed when name, size, **and** modification date all match.
   * Size and mtime together act as a content signature, so re-exporting a file makes it eligible
   * again even though the name is unchanged.
   */
  isProcessed(records: ProcessedFileRecord[], filename: string, fileSize: number, modificationDate: number, tolerance = 0.001): boolean {
    return records.some((r) => r.filename === filename && r.fileSize === fileSize && Math.abs(r.modificationDate - modificationDate) <= tolerance);
  },

  /** Record a file as processed, replacing any earlier entry for the same name. */
  markProcessed(records: ProcessedFileRecord[], filename: string, fileSize: number, modificationDate: number, at: Date = new Date()): ProcessedFileRecord[] {
    return [...records.filter((r) => r.filename !== filename), { filename, fileSize, modificationDate, processedAt: CFTime.now(at) }];
  },

  /** A browser `File` reports `lastModified` in Unix milliseconds. */
  signature(file: { name: string; size: number; lastModified: number }): { filename: string; fileSize: number; modificationDate: number } {
    return { filename: file.name, fileSize: file.size, modificationDate: CFTime.fromUnix(file.lastModified / 1000) };
  },
};
