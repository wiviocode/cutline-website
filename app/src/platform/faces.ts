/**
 * On-device face matching against roster headshots — a second opinion for the athlete whose
 * number is turned away.
 *
 * Everything happens in this browser: the headshots come through the relay as images, the
 * face-api models load from a public CDN, and descriptors are computed and compared here. No face
 * is sent to Anthropic or anywhere else. Offered only for college rosters, and only when the
 * photographer turns it on.
 *
 * A match is evidence, not an identification: the review screen shows it as a suggestion, and
 * the caption uses it only for an athlete with no readable number when the match is strong and
 * clearly better than the next.
 */

import { openDB, type IDBPDatabase } from "idb";
import type { Player } from "@core/roster/Roster";
import type { FaceHint } from "@core/vision/FaceEvidence";
export type { FaceHint };
import { RELAY_HEADERS } from "./relay";

const VERSION = "1.7.15";
const LIB = `https://cdn.jsdelivr.net/npm/@vladmandic/face-api@${VERSION}/dist/face-api.esm.js`;
const MODELS = `https://cdn.jsdelivr.net/npm/@vladmandic/face-api@${VERSION}/model/`;

/** Below this Euclidean distance a match counts as strong. face-api's own guidance is 0.6; sports photographs need tighter. */
export const STRONG_MATCH = 0.5;
/** Shown as a suggestion below this. */
export const WEAK_MATCH = 0.58;
/** The best match must beat the next by this much to be used unasked. */
export const MARGIN = 0.06;


// The library's surface, as used here.
interface FaceAPI {
  tf: { setBackend(b: string): Promise<boolean>; ready(): Promise<void> };
  nets: Record<"ssdMobilenetv1" | "faceLandmark68Net" | "faceRecognitionNet", { loadFromUri(u: string): Promise<void> }>;
  detectSingleFace(input: HTMLCanvasElement, options?: unknown): { withFaceLandmarks(): { withFaceDescriptor(): Promise<{ descriptor: Float32Array; detection: { score: number } } | undefined> } };
  SsdMobilenetv1Options: new (o: { minConfidence: number }) => unknown;
  euclideanDistance(a: Float32Array | number[], b: Float32Array | number[]): number;
}

let api: Promise<FaceAPI> | null = null;
function load(): Promise<FaceAPI> {
  return (api ??= (async () => {
    const f = (await import(/* @vite-ignore */ LIB)) as unknown as FaceAPI;
    await f.tf.setBackend("webgl").catch(() => f.tf.setBackend("cpu"));
    await f.tf.ready();
    await Promise.all([f.nets.ssdMobilenetv1.loadFromUri(MODELS), f.nets.faceLandmark68Net.loadFromUri(MODELS), f.nets.faceRecognitionNet.loadFromUri(MODELS)]);
    return f;
  })());
}

let db: Promise<IDBPDatabase> | null = null;
function cache(): Promise<IDBPDatabase> {
  return (db ??= openDB("cutline-faces", 1, { upgrade(d) { d.createObjectStore("descriptors"); } }));
}

async function canvasOf(blob: Blob, maxEdge: number): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(blob, { imageOrientation: "from-image" });
  const s = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(bmp.width * s));
  c.height = Math.max(1, Math.round(bmp.height * s));
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return c;
}

/** A smaller copy of a headshot where the site can serve one. */
function smaller(url: string): string {
  // Sidearm resizes on request; WMT's imgproxy URLs are signed and are used as they are.
  if (/\/images\/\d{4}\//.test(url) && !url.includes("imgproxy")) return `${url.split("?")[0]}?width=500&quality=85`;
  return url;
}

export class FaceMatcher {
  private refs = new Map<string, Float32Array>();

  /** Descriptors for every player with a headshot, from the cache where they were computed before. */
  async prepare(players: Player[], onProgress?: (done: number, total: number) => void): Promise<{ ready: number; total: number }> {
    const f = await load();
    const store = await cache();
    const withShots = players.filter((p) => p.headshotURL);
    let done = 0;
    const queue = [...withShots];
    const work = async () => {
      while (queue.length) {
        const p = queue.shift()!;
        const url = p.headshotURL!;
        let d = (await store.get("descriptors", url)) as number[] | null | undefined;
        if (d === undefined) {
          try {
            const res = await fetch(`/api/fetch?raw=1&url=${encodeURIComponent(smaller(url))}`, { headers: RELAY_HEADERS });
            if (res.ok) {
              const found = await f.detectSingleFace(await canvasOf(await res.blob(), 640)).withFaceLandmarks().withFaceDescriptor();
              d = found ? Array.from(found.descriptor) : null;
              await store.put("descriptors", d, url);
            }
          } catch { /* a headshot that will not load is a player without a face to match */ }
        }
        if (d) this.refs.set(p.id, Float32Array.from(d));
        onProgress?.(++done, withShots.length);
      }
    };
    await Promise.all([work(), work(), work()]);
    return { ready: this.refs.size, total: withShots.length };
  }

  get size(): number { return this.refs.size; }

  /** The closest players to the face in a crop, best first, among the given ids. */
  async match(crop: HTMLCanvasElement, candidates: string[]): Promise<FaceHint[]> {
    if (!this.refs.size) return [];
    const f = await load();
    const found = await f.detectSingleFace(crop, new f.SsdMobilenetv1Options({ minConfidence: 0.6 })).withFaceLandmarks().withFaceDescriptor();
    if (!found) return [];
    return candidates.filter((id) => this.refs.has(id))
      .map((id) => ({ playerID: id, distance: +f.euclideanDistance(found.descriptor, this.refs.get(id)!).toFixed(3) }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 3)
      .filter((h) => h.distance < WEAK_MATCH);
  }
}

/**
 * The head of a subject, from their box on the frame as sent: the top part of the box, squared
 * and padded, drawn from a larger decode of the photograph.
 */
export async function headCrops(photo: Blob, boxes: [number, number, number, number][], sent: { width: number; height: number }): Promise<HTMLCanvasElement[]> {
  const full = await canvasOf(photo, 2400);
  const sx = full.width / sent.width, sy = full.height / sent.height;
  return boxes.map((box) => {
    const [x1, y1, x2, y2] = [box[0] * sx, box[1] * sy, box[2] * sx, box[3] * sy];
    const side = Math.max(48, Math.min((x2 - x1) * 1.1, (y2 - y1) * 0.8));
    const cx = (x1 + x2) / 2, top = Math.max(0, y1 - side * 0.15);
    const c = document.createElement("canvas");
    const out = Math.min(400, Math.max(160, Math.round(side)));
    c.width = out; c.height = out;
    c.getContext("2d")!.drawImage(full, Math.max(0, cx - side / 2), top, side, side, 0, 0, out, out);
    return c;
  });
}
