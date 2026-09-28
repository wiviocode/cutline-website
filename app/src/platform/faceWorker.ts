/**
 * The face models, off the page's thread: YuNet finds the faces, SCRFD looks again at each one for
 * sharper eye, nose and mouth points, and ArcFace turns the face, laid onto those points, into 512
 * numbers. All three run in onnxruntime-web's WebAssembly build, served from this site — nothing
 * leaves the browser. (SCRFD and ArcFace are InsightFace's, for non-commercial research only:
 * public/models/NOTICE.md.)
 *
 * Photographs arrive as blobs and are decoded here at full resolution, so a face 60 pixels across
 * in a 6000-pixel frame is read at 60 pixels, not shrunk first.
 */

import * as ort from "onnxruntime-web/wasm";
import wasmURL from "onnxruntime-web/ort-wasm-simd-threaded.wasm?url";
import {
  decodeYuNet, decodeSCRFD, refinedFace, mapFace, headRegion, pickSubjectFace, pickPortraitFace, alignmentTransform, flipAverage, quality, padTo32, iou,
  type DetectedFace, type FaceQuality,
} from "@core/vision/FaceGeometry";

export type FaceRequest =
  | { id: number; kind: "warm" }
  | { id: number; kind: "portrait"; blob: Blob }
  | { id: number; kind: "subjects"; blob: Blob; boxes: [number, number, number, number][]; sent: { width: number; height: number } };

/** `crowded`: another face was nearly as likely to be this subject's, or another subject's box chose the same face. */
export interface FaceFound { embedding: Float32Array; quality: FaceQuality; crowded: boolean }
export type FaceReply =
  | { id: number; ok: true; faces: (FaceFound | null)[] }
  | { id: number; ok: false; error: string };

const MODELS = `${import.meta.env.BASE_URL}models/`;
const DETECTOR = `${MODELS}face_detection_yunet_2026may.onnx`;
const LANDMARKER = `${MODELS}scrfd_500m.onnx`;
const RECOGNIZER = `${MODELS}arcface_w600k_r50_int8_cutline.onnx`;
/** The detector's working size: faces from about 10 to 300 pixels across are found in a 640-pixel view. */
const DETECT_EDGE = 640;
/**
 * SCRFD's second look at a game face: a square three times the face, at 160 pixels. Measured on
 * the labeled frames, it moves YuNet's points by a third of the eye distance on faces whose eyes
 * are 20–30 pixels apart, and that is worth two more players named first by every recognizer tried.
 */
const REFINE_SPAN = 3, REFINE_EDGE = 160;
/** A headshot is looked at whole, fitted into 640 pixels. */
const PORTRAIT_EDGE = 640;

ort.env.wasm.wasmPaths = { wasm: wasmURL };
// Threads need a cross-origin-isolated page; without one a single thread is used, quietly.
ort.env.wasm.numThreads = globalThis.crossOriginIsolated ? Math.min(4, Math.max(1, Math.floor((navigator.hardwareConcurrency || 2) / 2))) : 1;
ort.env.logLevel = "error";

interface Models { detect: ort.InferenceSession; landmarks: ort.InferenceSession; embed: ort.InferenceSession }
let sessions: Promise<Models> | null = null;
function models(): Promise<Models> {
  return (sessions ??= (async () => {
    const load = async (url: string) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`The face model did not load (${res.status}).`);
      return new Uint8Array(await res.arrayBuffer());
    };
    const [d, l, e] = await Promise.all([load(DETECTOR), load(LANDMARKER), load(RECOGNIZER)]);
    const opts: ort.InferenceSession.SessionOptions = { executionProviders: ["wasm"], graphOptimizationLevel: "all", logSeverityLevel: 3 };
    return {
      detect: await ort.InferenceSession.create(d, opts),
      landmarks: await ort.InferenceSession.create(l, opts),
      embed: await ort.InferenceSession.create(e, opts),
    };
  })().catch((err) => { sessions = null; throw err; }));
}

function canvas(w: number, h: number): OffscreenCanvasRenderingContext2D {
  const c = new OffscreenCanvas(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
  return c.getContext("2d", { willReadFrequently: true })!;
}

/** Faces in a region of an image, in the image's own coordinates. */
async function detect(src: CanvasImageSource, region: { x: number; y: number; w: number; h: number }, detector: ort.InferenceSession): Promise<DetectedFace[]> {
  // Down to the detector's size; small regions up, but never past twice their pixels.
  const scale = Math.min(DETECT_EDGE / Math.max(region.w, region.h), 2);
  const w = Math.max(1, Math.round(region.w * scale)), h = Math.max(1, Math.round(region.h * scale));
  const padW = padTo32(w), padH = padTo32(h);
  const ctx = canvas(padW, padH);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, padW, padH);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, region.x, region.y, region.w, region.h, 0, 0, w, h);
  const px = ctx.getImageData(0, 0, padW, padH).data;
  // BGR, 0–255, planar — as OpenCV hands it to YuNet.
  const plane = padW * padH;
  const input = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    input[i] = px[i * 4 + 2];
    input[plane + i] = px[i * 4 + 1];
    input[2 * plane + i] = px[i * 4];
  }
  const out = await detector.run({ [detector.inputNames[0]]: new ort.Tensor("float32", input, [1, 3, padH, padW]) });
  const faces = decodeYuNet(out as unknown as Record<string, { data: Float32Array }>, padW, padH, 0.5);
  return faces.map((f) => mapFace(f, scale, region.x, region.y));
}

/**
 * SCRFD over the square (x0, y0, side) of an image, drawn at edge × edge; the faces it finds, in
 * the image's own coordinates. Whatever of the square lies outside the image stays black.
 */
async function scrfd(src: ImageBitmap, x0: number, y0: number, side: number, edge: number, landmarker: ort.InferenceSession): Promise<DetectedFace[]> {
  const ctx = canvas(edge, edge);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, edge, edge);
  ctx.imageSmoothingQuality = "high";
  const k = edge / side;
  const sx = Math.max(0, x0), sy = Math.max(0, y0), ex = Math.min(src.width, x0 + side), ey = Math.min(src.height, y0 + side);
  if (ex > sx && ey > sy) ctx.drawImage(src, sx, sy, ex - sx, ey - sy, (sx - x0) * k, (sy - y0) * k, (ex - sx) * k, (ey - sy) * k);
  const px = ctx.getImageData(0, 0, edge, edge).data;
  // RGB, (v − 127.5) / 128, planar — as InsightFace feeds it.
  const plane = edge * edge;
  const input = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    input[i] = (px[i * 4] - 127.5) / 128;
    input[plane + i] = (px[i * 4 + 1] - 127.5) / 128;
    input[2 * plane + i] = (px[i * 4 + 2] - 127.5) / 128;
  }
  const out = await landmarker.run({ [landmarker.inputNames[0]]: new ort.Tensor("float32", input, [1, 3, edge, edge]) });
  const faces = decodeSCRFD(landmarker.outputNames.map((n) => out[n].data as Float32Array), edge, edge);
  return faces.map((f) => mapFace(f, k, x0, y0));
}

/** A game face with SCRFD's points where SCRFD finds the same face; YuNet's where it does not. */
async function refine(src: ImageBitmap, face: DetectedFace, landmarker: ort.InferenceSession): Promise<DetectedFace> {
  const side = REFINE_SPAN * Math.max(face.w, face.h);
  const x0 = Math.round(face.x + face.w / 2 - side / 2), y0 = Math.round(face.y + face.h / 2 - side / 2);
  return refinedFace(face, await scrfd(src, x0, y0, Math.round(side), REFINE_EDGE, landmarker));
}

/** The face laid onto the 112×112 template, and its mirror image; ArcFace's embedding of each, averaged. */
async function embed(src: ImageBitmap, face: DetectedFace, recognizer: ort.InferenceSession): Promise<Float32Array> {
  // A small crop around the face first — at most four times the template — so the warp below
  // never touches the whole 24-megapixel frame.
  const side = Math.max(face.w, face.h) * 2.2;
  const cx = face.x + face.w / 2, cy = face.y + face.h / 2;
  const cropX = Math.max(0, cx - side / 2), cropY = Math.max(0, cy - side / 2);
  const cropW = Math.min(src.width, cx + side / 2) - cropX, cropH = Math.min(src.height, cy + side / 2) - cropY;
  const k = Math.min(1, 448 / Math.max(cropW, cropH));
  const crop = canvas(cropW * k, cropH * k);
  crop.imageSmoothingQuality = "high";
  crop.drawImage(src, cropX, cropY, cropW, cropH, 0, 0, crop.canvas.width, crop.canvas.height);
  const points = face.points.map(([x, y]) => [(x - cropX) * k, (y - cropY) * k] as [number, number]);

  const ctx = canvas(112, 112);
  ctx.imageSmoothingQuality = "high";
  ctx.setTransform(...alignmentTransform(points));
  ctx.drawImage(crop.canvas, 0, 0);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const aligned = ctx.getImageData(0, 0, 112, 112).data;
  const vectors: Float32Array[] = [];
  for (const mirror of [false, true]) {
    // RGB, (v − 127.5) / 127.5, planar.
    const input = new Float32Array(3 * 112 * 112);
    for (let y = 0; y < 112; y++) {
      for (let x = 0; x < 112; x++) {
        const s = (y * 112 + (mirror ? 111 - x : x)) * 4, d = y * 112 + x;
        input[d] = (aligned[s] - 127.5) / 127.5;
        input[12544 + d] = (aligned[s + 1] - 127.5) / 127.5;
        input[25088 + d] = (aligned[s + 2] - 127.5) / 127.5;
      }
    }
    const out = await recognizer.run({ [recognizer.inputNames[0]]: new ort.Tensor("float32", input, [1, 3, 112, 112]) });
    vectors.push(out[recognizer.outputNames[0]].data as Float32Array);
  }
  return flipAverage(vectors[0], vectors[1]);
}

async function handle(req: FaceRequest): Promise<(FaceFound | null)[]> {
  const { detect: detector, landmarks: landmarker, embed: recognizer } = await models();
  if (req.kind === "warm") return [];
  const bitmap = await createImageBitmap(req.blob, { imageOrientation: "from-image" });
  try {
    if (req.kind === "portrait") {
      const found = pickPortraitFace(await detect(bitmap, { x: 0, y: 0, w: bitmap.width, h: bitmap.height }, detector));
      if (!found) return [null];
      // A headshot is one large face: SCRFD sees the whole picture.
      const face = refinedFace(found, await scrfd(bitmap, 0, 0, Math.max(bitmap.width, bitmap.height), PORTRAIT_EDGE, landmarker));
      return [{ embedding: await embed(bitmap, face, recognizer), quality: quality(face), crowded: false }];
    }
    // The reading's boxes are in the frame as it was sent; this is the original.
    const kx = bitmap.width / req.sent.width, ky = bitmap.height / req.sent.height;
    const found: (FaceFound | null)[] = [];
    const chosen: (DetectedFace | null)[] = [];
    for (const b of req.boxes) {
      const box: [number, number, number, number] = [b[0] * kx, b[1] * ky, b[2] * kx, b[3] * ky];
      const region = headRegion(box, bitmap.width, bitmap.height);
      const { face: seen, crowded } = pickSubjectFace(await detect(bitmap, region, detector), box);
      chosen.push(seen);
      const face = seen && await refine(bitmap, seen, landmarker);
      found.push(face ? { embedding: await embed(bitmap, face, recognizer), quality: quality(face), crowded } : null);
    }
    // One face cannot be two subjects': where two boxes chose the same face, neither may rely on it.
    chosen.forEach((a, i) => chosen.forEach((b, j) => {
      if (i < j && a && b && iou(a, b) > 0.5) { found[i]!.crowded = true; found[j]!.crowded = true; }
    }));
    return found;
  } finally {
    bitmap.close();
  }
}

// One request at a time: a queue keeps memory to one decoded frame.
let chain: Promise<unknown> = Promise.resolve();
const port = self as unknown as { name?: string; postMessage(m: FaceReply): void; onmessage: ((e: MessageEvent<FaceRequest>) => void) | null };
// With threads, onnxruntime starts its helpers from this same script, named "em-pthread"; they
// take their own messages, so only the worker the page made listens for requests.
if (port.name !== "em-pthread") {
  port.onmessage = (e) => {
    const req = e.data;
    chain = chain.then(() => handle(req)
      .then((faces) => port.postMessage({ id: req.id, ok: true, faces }))
      .catch((err: unknown) => port.postMessage({ id: req.id, ok: false, error: err instanceof Error ? err.message : String(err) })));
  };
}
