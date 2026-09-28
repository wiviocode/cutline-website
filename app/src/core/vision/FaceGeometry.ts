/**
 * The arithmetic of face matching, apart from any runtime: reading YuNet's and SCRFD's outputs,
 * choosing the face that belongs to a subject, and the similarity transform that lays a face onto
 * the 112×112 template ArcFace was trained on. The models run elsewhere (@platform/faceWorker);
 * this is what surrounds them, and what the tests can check.
 */

/** A face as YuNet reports it: box, score, and five points — the subject's right eye, left eye, nose tip, right and left mouth corners. */
export interface DetectedFace {
  x: number; y: number; w: number; h: number;
  score: number;
  /** [right eye, left eye, nose, right mouth corner, left mouth corner], each [x, y]. */
  points: [number, number][];
}

/** How well a face can be compared: the detector's confidence, the eyes' distance in pixels, and how far the head is turned. */
export interface FaceQuality { score: number; eyes: number; yaw: number }

/** Where each of the five points sits on ArcFace's 112×112 aligned face. */
export const TEMPLATE: [number, number][] = [[38.2946, 51.6963], [73.5318, 51.5014], [56.0252, 71.7366], [41.5493, 92.3655], [70.7299, 92.2041]];

export const YUNET_STRIDES = [8, 16, 32] as const;

/** YuNet takes any size that is a multiple of 32; the image is padded out to it at the bottom and right. */
export const padTo32 = (n: number): number => Math.max(32, Math.ceil(n / 32) * 32);

type Outputs = Record<string, { data: ArrayLike<number> }>;

/**
 * Faces from YuNet's twelve outputs (cls, obj, bbox and kps at strides 8, 16 and 32) for an input
 * of padW × padH — the decoding of OpenCV's FaceDetectorYN, then non-maximum suppression.
 */
export function decodeYuNet(out: Outputs, padW: number, padH: number, threshold = 0.5, nmsIoU = 0.3): DetectedFace[] {
  const faces: DetectedFace[] = [];
  for (const s of YUNET_STRIDES) {
    const cols = Math.floor(padW / s), rows = Math.floor(padH / s);
    const cls = out[`cls_${s}`].data, obj = out[`obj_${s}`].data, bbox = out[`bbox_${s}`].data, kps = out[`kps_${s}`].data;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const score = Math.sqrt(clamp01(cls[i]) * clamp01(obj[i]));
        if (score < threshold) continue;
        const cx = (c + bbox[i * 4]) * s, cy = (r + bbox[i * 4 + 1]) * s;
        const w = Math.exp(bbox[i * 4 + 2]) * s, h = Math.exp(bbox[i * 4 + 3]) * s;
        const points: [number, number][] = [];
        for (let n = 0; n < 5; n++) points.push([(kps[i * 10 + 2 * n] + c) * s, (kps[i * 10 + 2 * n + 1] + r) * s]);
        faces.push({ x: cx - w / 2, y: cy - h / 2, w, h, score, points });
      }
    }
  }
  return nms(faces, nmsIoU);
}

export const SCRFD_STRIDES = [8, 16, 32] as const;

/**
 * Faces from SCRFD's nine outputs, in the model's own order: scores, boxes and points at strides
 * 8, 16 and 32. Two anchors per cell, centred on the cell's corner; a box is its four distances
 * from the centre and each point an offset from it, all in strides — InsightFace's decoding.
 */
export function decodeSCRFD(out: ArrayLike<number>[], width: number, height: number, threshold = 0.3, nmsIoU = 0.4): DetectedFace[] {
  const faces: DetectedFace[] = [];
  SCRFD_STRIDES.forEach((s, k) => {
    const cols = Math.floor(width / s), rows = Math.floor(height / s);
    const scores = out.at(k)!, boxes = out.at(k + 3)!, kps = out.at(k + 6)!;
    for (let i = 0; i < rows * cols * 2; i++) {
      const score = scores[i];
      if (score < threshold) continue;
      const cell = Math.floor(i / 2), cx = (cell % cols) * s, cy = Math.floor(cell / cols) * s;
      const x1 = cx - boxes[i * 4] * s, y1 = cy - boxes[i * 4 + 1] * s, x2 = cx + boxes[i * 4 + 2] * s, y2 = cy + boxes[i * 4 + 3] * s;
      const points: [number, number][] = [];
      for (let n = 0; n < 5; n++) points.push([cx + kps[i * 10 + 2 * n] * s, cy + kps[i * 10 + 2 * n + 1] * s]);
      faces.push({ x: x1, y: y1, w: x2 - x1, h: y2 - y1, score, points });
    }
  });
  return nms(faces, nmsIoU);
}

export function nms(faces: DetectedFace[], iouLimit: number): DetectedFace[] {
  const sorted = [...faces].sort((a, b) => b.score - a.score);
  const kept: DetectedFace[] = [];
  for (const f of sorted) if (kept.every((k) => iou(k, f) <= iouLimit)) kept.push(f);
  return kept;
}

export function iou(a: DetectedFace, b: DetectedFace): number {
  const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y), x2 = Math.min(a.x + a.w, b.x + b.w), y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a.w * a.h + b.w * b.h - inter;
  return union > 0 ? inter / union : 0;
}

/** A face moved and scaled: from detector coordinates back to the image's. */
export function mapFace(f: DetectedFace, scale: number, dx: number, dy: number): DetectedFace {
  return { x: f.x / scale + dx, y: f.y / scale + dy, w: f.w / scale, h: f.h / scale, score: f.score, points: f.points.map(([x, y]) => [x / scale + dx, y / scale + dy]) };
}

/**
 * The face with a second detector's five points, where that detector found the same face (boxes
 * overlapping by 0.3 or more); the first detector's box and confidence stay. Unchanged otherwise.
 */
export function refinedFace(face: DetectedFace, second: DetectedFace[]): DetectedFace {
  let best: DetectedFace | null = null, overlap = 0;
  for (const d of second) { const o = iou(d, face); if (o > overlap) { best = d; overlap = o; } }
  return best && overlap >= 0.3 ? { ...face, points: best.points } : face;
}

export function quality(f: DetectedFace): FaceQuality {
  const [re, le, nose] = f.points;
  const eyes = Math.hypot(le[0] - re[0], le[1] - re[1]);
  // How far the nose sits from between the eyes, in eye-widths: 0 facing the camera, past ±0.6 well turned.
  const yaw = eyes > 0 ? (nose[0] - (re[0] + le[0]) / 2) / eyes : 1;
  return { score: f.score, eyes, yaw };
}

/**
 * The part of the photograph where a subject's face should be, in the original's pixels: the
 * reading's box is head and torso, but arms raised to spike or celebrate push its top above the
 * head — so the upper three quarters of it, a little wider.
 */
export function headRegion(box: [number, number, number, number], imageW: number, imageH: number): { x: number; y: number; w: number; h: number } {
  const [x1, y1, x2, y2] = box;
  const bw = x2 - x1, bh = y2 - y1;
  const left = Math.max(0, x1 - bw * 0.25), right = Math.min(imageW, x2 + bw * 0.25);
  const top = Math.max(0, y1 - bh * 0.15), bottom = Math.min(imageH, y1 + bh * 0.8);
  return { x: left, y: top, w: Math.max(1, right - left), h: Math.max(1, bottom - top) };
}

/** A runner-up face this close to the chosen one makes the choice a guess. */
export const CROWDED = 0.6;

/**
 * The face in a region that belongs to the subject whose box it is: inside the box's width and
 * its upper part, large, confident and near the middle — at the net two faces can share a crop,
 * and the neighbour's is usually off to one side.
 *
 * `crowded` when another face in the box is nearly as likely: a player straight behind another
 * puts two heads in one box, and which is whose cannot be told from where they are. Such a face
 * is still compared, but never names anyone unasked — in testing, every wrong name that reached
 * a caption came from one.
 */
export function pickSubjectFace(faces: DetectedFace[], box: [number, number, number, number]): { face: DetectedFace | null; crowded: boolean } {
  const [x1, y1, x2, y2] = box;
  const bw = x2 - x1, bh = y2 - y1, mid = (x1 + x2) / 2;
  let best: DetectedFace | null = null, bestWeight = 0, second = 0;
  for (const f of faces) {
    const cx = f.x + f.w / 2, cy = f.y + f.h / 2;
    if (cx < x1 - bw * 0.1 || cx > x2 + bw * 0.1 || cy < y1 - bh * 0.15 || cy > y1 + bh * 0.75) continue;
    const off = Math.min(1, Math.abs(cx - mid) / (bw / 2 || 1));
    const weight = f.score * Math.sqrt(f.w * f.h) * (1 - 0.7 * off);
    if (weight > bestWeight) { second = bestWeight; best = f; bestWeight = weight; }
    else if (weight > second) second = weight;
  }
  return { face: best, crowded: !!best && second >= CROWDED * bestWeight };
}

/** The face in a roster headshot: the largest confident one. */
export function pickPortraitFace(faces: DetectedFace[]): DetectedFace | null {
  let best: DetectedFace | null = null;
  for (const f of faces) if (!best || f.score * f.w * f.h > best.score * best.w * best.h) best = f;
  return best;
}

/**
 * The similarity transform (rotation, one scale, translation) that best carries the five points
 * onto the template, as [a, b, c, d, e, f] for a canvas's setTransform: x' = a·x + c·y + e,
 * y' = b·x + d·y + f. Least squares without reflection — what OpenCV's alignCrop computes.
 */
export function alignmentTransform(points: [number, number][]): [number, number, number, number, number, number] {
  const n = points.length;
  const sm = [0, 0], dm = [0, 0];
  for (let i = 0; i < n; i++) { sm[0] += points[i][0] / n; sm[1] += points[i][1] / n; dm[0] += TEMPLATE[i][0] / n; dm[1] += TEMPLATE[i][1] / n; }
  let num = 0, numI = 0, den = 0;
  for (let i = 0; i < n; i++) {
    const sx = points[i][0] - sm[0], sy = points[i][1] - sm[1];
    const dx = TEMPLATE[i][0] - dm[0], dy = TEMPLATE[i][1] - dm[1];
    num += sx * dx + sy * dy;
    numI += sx * dy - sy * dx;
    den += sx * sx + sy * sy;
  }
  const a = den ? num / den : 1, b = den ? numI / den : 0;
  const e = dm[0] - (a * sm[0] - b * sm[1]);
  const f = dm[1] - (b * sm[0] + a * sm[1]);
  return [a, b, -b, a, e, f];
}

/** Unit length, so a dot product is the cosine. */
export function normalize(v: ArrayLike<number>): Float32Array {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  const k = s > 0 ? 1 / Math.sqrt(s) : 0;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] * k;
  return out;
}

/** An embedding and its mirror image's, averaged: steadier on a turned head than either alone. */
export function flipAverage(a: ArrayLike<number>, b: ArrayLike<number>): Float32Array {
  const na = normalize(a), nb = normalize(b);
  const sum = new Float32Array(na.length);
  for (let i = 0; i < na.length; i++) sum[i] = na[i] + nb[i];
  return normalize(sum);
}

export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
