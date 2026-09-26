/**
 * Photographs in the browser: the frame the model sees, close crops of the original, a preview
 * for the stage and thumbnails for the strip.
 *
 * A football game is several hundred frames at 24 to 60 megapixels. The frame sent to the model
 * is decoded straight to its final size; the full-resolution decode a close crop needs happens
 * one photograph at a time, because each costs a couple of hundred megabytes while it lasts.
 * RAW files are read through the JPEG preview the camera embedded.
 */

import exifr from "exifr";
import { RAWPreviewExtractor } from "@core/images/RAWPreviewExtractor";
import { SupportedFormats } from "@core/images/SupportedFormats";
import { JPEGSegments } from "@core/metadata/JPEGSegments";
import { resizedSize, type Box } from "@core/vision/ImageSize";
import type { PhotoSource } from "@core/pipeline/ReadPhoto";
import type { SentImage } from "@core/ai/Claude";
import type { PhotoFile } from "./fs";

export const THUMB_EDGE = 360;
export const PREVIEW_EDGE = 2400;

/** The bytes to decode: the file itself, or the preview inside a RAW. */
export async function decodableBlob(file: File, targetLongEdge = 4000): Promise<Blob> {
  if (!SupportedFormats.isRaw(file.name)) return file;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const preview = RAWPreviewExtractor.bestPreview(bytes, targetLongEdge);
  return new Blob([RAWPreviewExtractor.jpegData(bytes, preview) as unknown as BlobPart], { type: "image/jpeg" });
}

/** The size of the image after EXIF orientation, read from the file's header where possible. */
export async function orientedSize(blob: Blob): Promise<{ width: number; height: number }> {
  const head = new Uint8Array(await blob.slice(0, 2 * 1024 * 1024).arrayBuffer());
  const dims = JPEGSegments.dimensions(head);
  if (dims) {
    let orientation = 1;
    try { orientation = (await exifr.orientation(blob)) ?? 1; } catch { /* none */ }
    return orientation >= 5 && orientation <= 8 ? { width: dims.height, height: dims.width } : dims;
  }
  const bmp = await createImageBitmap(blob, { imageOrientation: "from-image" });
  const size = { width: bmp.width, height: bmp.height };
  bmp.close();
  return size;
}

async function toJPEG(canvas: OffscreenCanvas, quality: number): Promise<Blob> {
  return canvas.convertToBlob({ type: "image/jpeg", quality });
}

export async function base64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Decode straight to a size, oriented, and re-encode. */
export async function resized(blob: Blob, width: number, height: number, quality = 0.86): Promise<Blob> {
  const bmp = await createImageBitmap(blob, { imageOrientation: "from-image", resizeWidth: width, resizeHeight: height, resizeQuality: "high" });
  try {
    const c = new OffscreenCanvas(width, height);
    c.getContext("2d")!.drawImage(bmp, 0, 0);
    return await toJPEG(c, quality);
  } finally { bmp.close(); }
}

/** One full-resolution decode at a time. */
let fullDecode: Promise<unknown> = Promise.resolve();
function oneAtATime<T>(work: () => Promise<T>): Promise<T> {
  const run = fullDecode.then(work, work);
  fullDecode = run.catch(() => undefined);
  return run;
}

/** The model's view of a photograph, and close crops of it on request. */
export function browserSource(photo: PhotoFile): PhotoSource {
  let blob: Promise<Blob> | null = null;
  let dims: Promise<{ width: number; height: number }> | null = null;
  const source = () => (blob ??= photo.file().then((f) => decodableBlob(f)));
  return {
    name: photo.name,
    size: () => (dims ??= source().then(orientedSize)),
    async frame(width, height): Promise<SentImage> {
      const jpeg = await resized(await source(), width, height, 0.86);
      return { data: await base64(jpeg), width, height };
    },
    crop(box: Box, maxEdge, maxTokens): Promise<SentImage> {
      return oneAtATime(async () => {
        const w = box.x2 - box.x1, h = box.y2 - box.y1;
        const [tw, th] = resizedSize(w, h, maxEdge, maxTokens);
        const bmp = await createImageBitmap(await source(), { imageOrientation: "from-image" });
        try {
          const c = new OffscreenCanvas(tw, th);
          const ctx = c.getContext("2d")!;
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(bmp, box.x1, box.y1, w, h, 0, 0, tw, th);
          return { data: await base64(await toJPEG(c, 0.9)), width: tw, height: th };
        } finally { bmp.close(); }
      });
    },
  };
}

/** Object URLs for decoded images, with a bounded decode queue and a thumbnail fast path. */
export class ImageCache {
  private urls = new Map<string, string>();
  private pending = new Map<string, Promise<string>>();
  private queue: (() => void)[] = [];
  private active = 0;
  constructor(private readonly concurrency = 3, private readonly edge = THUMB_EDGE, private readonly useEmbeddedThumb = false) {}

  cached(key: string): string | null { return this.urls.get(key) ?? null; }

  url(key: string, photo: PhotoFile): Promise<string> {
    const hit = this.urls.get(key);
    if (hit) return Promise.resolve(hit);
    const inflight = this.pending.get(key);
    if (inflight) return inflight;
    const p = this.slot(async () => {
      const f = await photo.file();
      let out: Blob | null = null;
      if (this.useEmbeddedThumb && !SupportedFormats.isRaw(f.name)) {
        // The camera's own thumbnail: instant, and plenty for a strip.
        try {
          const t = await exifr.thumbnail(f);
          if (t && t.byteLength > 2000) out = await orientThumb(new Blob([t as BlobPart], { type: "image/jpeg" }), f);
        } catch { /* decode instead */ }
      }
      if (!out) {
        const src = await decodableBlob(f, this.edge);
        const { width, height } = await orientedSize(src);
        const s = Math.min(1, this.edge / Math.max(width, height));
        out = await resized(src, Math.max(1, Math.round(width * s)), Math.max(1, Math.round(height * s)), 0.82);
      }
      const url = URL.createObjectURL(out);
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
          this.queue.shift()?.();
        });
      };
      if (this.active < this.concurrency) run(); else this.queue.push(run);
    });
  }
}

/** An embedded thumbnail carries no orientation of its own; the photograph's applies to it. */
async function orientThumb(thumb: Blob, original: File): Promise<Blob> {
  let orientation = 1;
  try { orientation = (await exifr.orientation(original)) ?? 1; } catch { /* none */ }
  if (orientation === 1) return thumb;
  const bmp = await createImageBitmap(thumb);
  const swap = orientation >= 5 && orientation <= 8;
  const c = new OffscreenCanvas(swap ? bmp.height : bmp.width, swap ? bmp.width : bmp.height);
  const ctx = c.getContext("2d")!;
  const { width: w, height: h } = bmp;
  switch (orientation) {
    case 3: ctx.transform(-1, 0, 0, -1, w, h); break;
    case 6: ctx.transform(0, 1, -1, 0, h, 0); break;
    case 8: ctx.transform(0, -1, 1, 0, 0, w); break;
    default: break;
  }
  ctx.drawImage(bmp, 0, 0);
  bmp.close();
  return toJPEG(c, 0.85);
}
