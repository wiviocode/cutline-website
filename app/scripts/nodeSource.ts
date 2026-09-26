/**
 * PhotoSource for Node: the evaluation harness reads photographs from disk with sharp, the way
 * the browser reads them with createImageBitmap — oriented, resized to the exact size sent.
 */

import sharp from "sharp";
import type { PhotoSource } from "../src/core/pipeline/ReadPhoto";
import type { SentImage } from "../src/core/ai/Claude";
import { resizedSize, type Box } from "../src/core/vision/ImageSize";

export function nodeSource(path: string, name: string): PhotoSource {
  let oriented: Promise<Buffer> | null = null;
  let dims: Promise<{ width: number; height: number }> | null = null;
  // Decode once, oriented; every later resize and crop starts from the same pixels.
  const pixels = () => (oriented ??= sharp(path, { limitInputPixels: false }).rotate().toBuffer());
  return {
    name,
    size() {
      return (dims ??= pixels().then(async (b) => {
        const m = await sharp(b, { limitInputPixels: false }).metadata();
        return { width: m.width!, height: m.height! };
      }));
    },
    async frame(width, height): Promise<SentImage> {
      const out = await sharp(await pixels(), { limitInputPixels: false }).resize(width, height, { fit: "fill" }).jpeg({ quality: 85, mozjpeg: true }).toBuffer();
      return { data: out.toString("base64"), width, height };
    },
    async crop(box: Box, maxEdge, maxTokens): Promise<SentImage> {
      const w = box.x2 - box.x1, h = box.y2 - box.y1;
      const [tw, th] = resizedSize(w, h, maxEdge, maxTokens);
      const out = await sharp(await pixels(), { limitInputPixels: false })
        .extract({ left: box.x1, top: box.y1, width: w, height: h })
        .resize(tw, th, { fit: "fill" }).jpeg({ quality: 90 }).toBuffer();
      return { data: out.toString("base64"), width: tw, height: th };
    },
  };
}
