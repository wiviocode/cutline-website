/**
 * The face models, off the page's thread: YuNet finds faces and their five points, SFace turns
 * an aligned face into 128 numbers. Both run in onnxruntime-web's WebAssembly build, served from
 * this site — nothing leaves the browser.
 *
 * Photographs arrive as blobs and are decoded here at full resolution, so a face 60 pixels across
 * in a 6000-pixel frame is read at 60 pixels, not shrunk first.
 */

import * as ort from "onnxruntime-web/wasm";
import wasmURL from "onnxruntime-web/ort-wasm-simd-threaded.wasm?url";
import {
  decodeYuNet, mapFace, headRegion, pickSubjectFace, pickPortraitFace, alignmentTransform, flipAverage, quality, padTo32,
  type DetectedFace, type FaceQuality,
} from "@core/vision/FaceGeometry";

export type FaceRequest =
  | { id: number; kind: "warm" }
  | { id: number; kind: "portrait"; blob: Blob }
  | { id: number; kind: "subjects"; blob: Blob; boxes: [number, number, number, number][]; sent: { width: number; height: number } };

export interface FaceFound { embedding: Float32Array; quality: FaceQuality }
export type FaceReply =
  | { id: number; ok: true; faces: (FaceFound | null)[] }
  | { id: number; ok: false; error: string };

const MODELS = `${import.meta.env.BASE_URL}models/`;
const DETECTOR = `${MODELS}face_detection_yunet_2026may.onnx`;
const RECOGNIZER = `${MODELS}face_recognition_sface_2021dec_int8bq_cutline.onnx`;
/** The detector's working size: faces from about 10 to 300 pixels across are found in a 640-pixel view. */
const DETECT_EDGE = 640;

ort.env.wasm.wasmPaths = { wasm: wasmURL };
// Threads need a cross-origin-isolated page; without one a single thread is used, quietly.
ort.env.wasm.numThreads = globalThis.crossOriginIsolated ? Math.min(4, Math.max(1, Math.floor((navigator.hardwareConcurrency || 2) / 2))) : 1;
ort.env.logLevel = "error";

let sessions: Promise<{ detect: ort.InferenceSession; embed: ort.InferenceSession }> | null = null;
function models() {
  return (sessions ??= (async () => {
    const load = async (url: string) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`The face model did not load (${res.status}).`);
      return new Uint8Array(await res.arrayBuffer());
    };
    const [d, e] = await Promise.all([load(DETECTOR), load(RECOGNIZER)]);
    const opts: ort.InferenceSession.SessionOptions = { executionProviders: ["wasm"], graphOptimizationLevel: "all", logSeverityLevel: 3 };
    return {
      detect: await ort.InferenceSession.create(d, opts),
      // The block-quantized weights are folded once at load, so each face runs at float speed.
      embed: await ort.InferenceSession.create(e, { ...opts, extra: { session: { disable_quant_qdq: "1" } } }),
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

/** The face laid onto the 112×112 template, and its mirror image; SFace's embedding of each, averaged. */
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
    // RGB, 0–255, planar; the model scales it itself.
    const input = new Float32Array(3 * 112 * 112);
    for (let y = 0; y < 112; y++) {
      for (let x = 0; x < 112; x++) {
        const s = (y * 112 + (mirror ? 111 - x : x)) * 4, d = y * 112 + x;
        input[d] = aligned[s];
        input[12544 + d] = aligned[s + 1];
        input[25088 + d] = aligned[s + 2];
      }
    }
    const out = await recognizer.run({ [recognizer.inputNames[0]]: new ort.Tensor("float32", input, [1, 3, 112, 112]) });
    vectors.push(out[recognizer.outputNames[0]].data as Float32Array);
  }
  return flipAverage(vectors[0], vectors[1]);
}

async function handle(req: FaceRequest): Promise<(FaceFound | null)[]> {
  const { detect: detector, embed: recognizer } = await models();
  if (req.kind === "warm") return [];
  const bitmap = await createImageBitmap(req.blob, { imageOrientation: "from-image" });
  try {
    if (req.kind === "portrait") {
      const face = pickPortraitFace(await detect(bitmap, { x: 0, y: 0, w: bitmap.width, h: bitmap.height }, detector));
      return [face ? { embedding: await embed(bitmap, face, recognizer), quality: quality(face) } : null];
    }
    // The reading's boxes are in the frame as it was sent; this is the original.
    const kx = bitmap.width / req.sent.width, ky = bitmap.height / req.sent.height;
    const found: (FaceFound | null)[] = [];
    for (const b of req.boxes) {
      const box: [number, number, number, number] = [b[0] * kx, b[1] * ky, b[2] * kx, b[3] * ky];
      const region = headRegion(box, bitmap.width, bitmap.height);
      const face = pickSubjectFace(await detect(bitmap, region, detector), box);
      found.push(face ? { embedding: await embed(bitmap, face, recognizer), quality: quality(face) } : null);
    }
    return found;
  } finally {
    bitmap.close();
  }
}

// One request at a time: the models are single-threaded and a queue keeps memory to one decoded frame.
let chain: Promise<unknown> = Promise.resolve();
const port = self as unknown as { postMessage(m: FaceReply): void; onmessage: ((e: MessageEvent<FaceRequest>) => void) | null };
port.onmessage = (e) => {
  const req = e.data;
  chain = chain.then(() => handle(req)
    .then((faces) => port.postMessage({ id: req.id, ok: true, faces }))
    .catch((err: unknown) => port.postMessage({ id: req.id, ok: false, error: err instanceof Error ? err.message : String(err) })));
};
