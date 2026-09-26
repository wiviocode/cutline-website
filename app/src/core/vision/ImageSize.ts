/**
 * The size a photograph is sent at.
 *
 * Claude bills an image by its 28×28-pixel patches and downsizes anything over the model's edge
 * or patch budget. Sizing the frame ourselves to exactly what fits means nothing is resized on
 * the far side — so the pixel boxes the model returns map straight back onto the original, and
 * the budget is spent on the frame rather than on bytes that would be thrown away.
 *
 * `resizedSize` is Anthropic's reference implementation (docs: vision-coordinates), including
 * its round-half-to-even on the short edge.
 */

export function imageTokens(width: number, height: number): number {
  return Math.ceil(width / 28) * Math.ceil(height / 28);
}

function roundTiesToEven(value: number): number {
  const floor = Math.floor(value);
  if (value - floor !== 0.5) return Math.round(value);
  return floor % 2 === 0 ? floor : floor + 1;
}

export function resizedSize(width: number, height: number, maxEdge: number, maxTokens: number): [number, number] {
  const fits = (w: number, h: number) =>
    Math.ceil(w / 28) * 28 <= maxEdge && Math.ceil(h / 28) * 28 <= maxEdge && imageTokens(w, h) <= maxTokens;
  if (fits(width, height)) return [width, height];
  if (height > width) {
    const [h, w] = resizedSize(height, width, maxEdge, maxTokens);
    return [w, h];
  }
  const aspect = width / height;
  let lo = 1, hi = width;
  while (lo + 1 < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (fits(mid, Math.max(roundTiesToEven(mid / aspect), 1))) lo = mid; else hi = mid;
  }
  return [lo, Math.max(roundTiesToEven(lo / aspect), 1)];
}

export interface Box { x1: number; y1: number; x2: number; y2: number }

export const Crop = {
  /**
   * A region of the original to look at closely, around a box the model gave on the sent image.
   * Padded generously — the box is approximate and a number can sit at the edge of a torso —
   * and never smaller than a readable minimum.
   */
  around(box: [number, number, number, number], sent: { width: number; height: number }, original: { width: number; height: number }, pad = 0.3): Box {
    const sx = original.width / sent.width, sy = original.height / sent.height;
    let [x1, y1, x2, y2] = [box[0] * sx, box[1] * sy, box[2] * sx, box[3] * sy];
    if (x2 < x1) [x1, x2] = [x2, x1];
    if (y2 < y1) [y1, y2] = [y2, y1];
    const w = Math.max(x2 - x1, original.width * 0.04), h = Math.max(y2 - y1, original.height * 0.06);
    const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
    const half = Math.max(w, h) * (0.5 + pad);
    return {
      x1: Math.max(0, Math.round(cx - half)),
      y1: Math.max(0, Math.round(cy - half)),
      x2: Math.min(original.width, Math.round(cx + half)),
      y2: Math.min(original.height, Math.round(cy + half)),
    };
  },
};
