/**
 * Decoding photographs in the browser: thumbnails for the strip, a fitted preview for the
 * stage, and the downscaled JPEG the model sees.
 *
 * A football game is several hundred frames at 7335×4890. Decoding one to draw a 104pt
 * thumbnail is real work, so decodes go through a small queue and every result is cached as an
 * object URL until the shoot changes.
 *
 * RAW files cannot be decoded by any browser. `RAWPreviewExtractor` walks the container's IFDs
 * and pulls the JPEG the camera embedded — Sony ARW carries one at full size — and that is both
 * the display image and what the model sees.
 */

import { RAWPreviewExtractor } from "@core/images/RAWPreviewExtractor";
import { SupportedFormats } from "@core/images/SupportedFormats";

export const THUMB_EDGE = 320;
export const PREVIEW_EDGE = 2200;

/** The bytes to decode: the file itself, or the preview inside a RAW. */
export async function decodableBlob(file: File, targetLongEdge: number): Promise<Blob> {
  if (!SupportedFormats.isRaw(file.name)) return file;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const preview = RAWPreviewExtractor.bestPreview(bytes, targetLongEdge);
  return new Blob([RAWPreviewExtractor.jpegData(bytes, preview) as unknown as BlobPart], { type: "image/jpeg" });
}

/** Decode and downscale to `longEdge`, honouring EXIF orientation, and re-encode as JPEG. */
export async function resizedJPEG(source: Blob, longEdge: number, quality = 0.9): Promise<Blob> {
  const bitmap = await createImageBitmap(source, { imageOrientation: "from-image" });
  try {
    const scale = Math.min(1, longEdge / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    ctx.drawImage(bitmap, 0, 0, w, h);
    return await canvas.convertToBlob({ type: "image/jpeg", quality });
  } finally {
    bitmap.close();
  }
}

/** The JPEG bytes sent to the model. */
export async function preparedForVision(file: File, longEdge: number): Promise<Uint8Array> {
  const blob = await decodableBlob(file, longEdge);
  const jpeg = await resizedJPEG(blob, longEdge, 0.9);
  return new Uint8Array(await jpeg.arrayBuffer());
}

/** Object URLs for decoded images, with a bounded decode queue. */
export class ImageCache {
  private urls = new Map<string, string>();
  private pending = new Map<string, Promise<string>>();
  private queue: (() => void)[] = [];
  private active = 0;
  constructor(private readonly concurrency = 3) {}

  cached(key: string): string | null { return this.urls.get(key) ?? null; }

  async url(key: string, file: () => Promise<File>, longEdge: number): Promise<string> {
    const hit = this.urls.get(key);
    if (hit) return hit;
    const inflight = this.pending.get(key);
    if (inflight) return inflight;
    const p = this.slot(async () => {
      const f = await file();
      const blob = await resizedJPEG(await decodableBlob(f, longEdge), longEdge, 0.85);
      const url = URL.createObjectURL(blob);
      this.urls.set(key, url);
      return url;
    }).finally(() => this.pending.delete(key));
    this.pending.set(key, p);
    return p;
  }

  clear(): void {
    for (const u of this.urls.values()) URL.revokeObjectURL(u);
    this.urls.clear();
    this.pending.clear();
  }

  private slot<T>(work: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const run = () => {
        this.active++;
        work().then(resolve, reject).finally(() => {
          this.active--;
          const next = this.queue.shift();
          if (next) next();
        });
      };
      if (this.active < this.concurrency) run(); else this.queue.push(run);
    });
  }
}
