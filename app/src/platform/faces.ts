/**
 * On-device face matching against roster headshots — a second opinion for the athlete whose
 * number is turned away.
 *
 * Everything happens in this browser: the headshots come through the relay as images, and the
 * face models (YuNet to find a face, SCRFD for its points, ArcFace to describe it — see
 * public/models/NOTICE.md; the last two are for non-commercial research only) are served from
 * this site and run in a worker here. No face is sent to Anthropic or anywhere else. Offered only
 * for college rosters, never football, and only when the photographer asks.
 *
 * A match is evidence, not an identification: the review screen shows it as a suggestion, and
 * the caption uses it only as FaceEvidence allows.
 */

import { openDB, type IDBPDatabase } from "idb";
import type { Player } from "@core/roster/Roster";
import { FACE_LISTED, FACE_MODEL, type FaceHint } from "@core/vision/FaceEvidence";
import { cosine, type FaceQuality } from "@core/vision/FaceGeometry";
import type { FaceFound, FaceReply, FaceRequest } from "./faceWorker";
import { RELAY_HEADERS } from "./relay";
export type { FaceHint };

/** Big, confident and square-on enough to name someone unasked: eyes 20 pixels apart or more, not turned past profile. */
export function goodFace(q: FaceQuality): boolean {
  return q.score >= 0.8 && q.eyes >= 20 && Math.abs(q.yaw) <= 0.8;
}
/** Too small to compare at all: under 12 pixels between the eyes. */
const usable = (q: FaceQuality) => q.eyes >= 12 && q.score >= 0.6;

// ---------------------------------------------------------------- the worker

let worker: Worker | null = null;
let nextID = 1;
const waiting = new Map<number, { resolve: (f: (FaceFound | null)[]) => void; reject: (e: Error) => void }>();

type Request = FaceRequest extends infer R ? (R extends FaceRequest ? Omit<R, "id"> : never) : never;

function ask(req: Request): Promise<(FaceFound | null)[]> {

  if (!worker) {
    worker = new Worker(new URL("./faceWorker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<FaceReply>) => {
      const w = waiting.get(e.data.id);
      if (!w) return;
      waiting.delete(e.data.id);
      if (e.data.ok) w.resolve(e.data.faces); else w.reject(new Error(e.data.error));
    };
    worker.onerror = (e) => {
      // A worker that failed to start fails everything waiting on it; the next ask starts another.
      for (const w of waiting.values()) w.reject(new Error(e.message || "The face models could not start."));
      waiting.clear();
      worker?.terminate();
      worker = null;
    };
  }
  const id = nextID++;
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    worker!.postMessage({ ...req, id } as FaceRequest);
  });
}

// ---------------------------------------------------------------- the headshots

const STORE = FACE_MODEL;
let db: Promise<IDBPDatabase> | null = null;
function cache(): Promise<IDBPDatabase> {
  // Version 3: ArcFace embeddings. Earlier models' are dropped, not reused: their numbers mean nothing to this one.
  return (db ??= openDB("cutline-faces", 3, {
    upgrade(d) {
      for (const old of ["descriptors", "sface"]) if (d.objectStoreNames.contains(old)) d.deleteObjectStore(old);
      if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE);
    },
  }));
}

/** A smaller copy of a headshot where the site can serve one. */
function smaller(url: string): string {
  // Sidearm resizes on request; WMT's imgproxy URLs are signed and are used as they are.
  if (/\/images\/\d{4}\//.test(url) && !url.includes("imgproxy")) return `${url.split("?")[0]}?width=600&quality=90`;
  return url;
}

export class FaceMatcher {
  private refs = new Map<string, Float32Array>();

  /** Embeddings for every player with a headshot, from the cache where they were computed before. */
  async prepare(players: Player[], onProgress?: (done: number, total: number) => void): Promise<{ ready: number; total: number }> {
    const store = await cache();
    await ask({ kind: "warm" });
    const withShots = players.filter((p) => p.headshotURL);
    let done = 0;
    const queue = [...withShots];
    const work = async () => {
      while (queue.length) {
        const p = queue.shift()!;
        const url = p.headshotURL!;
        let e = (await store.get(STORE, url)) as Float32Array | null | undefined;
        if (e === undefined) {
          try {
            const res = await fetch(`/api/fetch?raw=1&url=${encodeURIComponent(smaller(url))}`, { headers: RELAY_HEADERS });
            if (res.ok) {
              const [found] = await ask({ kind: "portrait", blob: await res.blob() });
              e = found && found.quality.score >= 0.6 ? found.embedding : null;
              await store.put(STORE, e, url);
            }
          } catch { /* a headshot that will not load is a player without a face to match */ }
        }
        if (e) this.refs.set(p.id, e);
        onProgress?.(++done, withShots.length);
      }
    };
    await Promise.all([work(), work(), work(), work()]);
    return { ready: this.refs.size, total: withShots.length };
  }

  get size(): number { return this.refs.size; }

  /**
   * For each subject's box, the players whose headshots its face most resembles, best first,
   * among that subject's candidates — and whether a usable face was found at all.
   */
  async match(photo: Blob, boxes: [number, number, number, number][], sent: { width: number; height: number }, candidates: string[][]): Promise<{ hints: FaceHint[]; found: boolean }[]> {
    if (!this.refs.size || !boxes.length) return boxes.map(() => ({ hints: [], found: false }));
    const faces = await ask({ kind: "subjects", blob: photo, boxes, sent });
    return faces.map((face, i) => {
      if (!face || !usable(face.quality)) return { hints: [], found: false };
      // A face that may be someone else's is shown as a likeness, never used to name anyone unasked.
      const good = goodFace(face.quality) && !face.crowded;
      const hints = candidates[i].filter((id) => this.refs.has(id))
        .map((id) => ({ playerID: id, score: +cosine(face.embedding, this.refs.get(id)!).toFixed(3), good }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .filter((h) => h.score >= FACE_LISTED);
      return { hints, found: true };
    });
  }
}
