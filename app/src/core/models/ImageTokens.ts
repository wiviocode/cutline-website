/**
 * What a photograph costs in tokens, by provider, before it is sent — so the model picker can
 * say what a thousand frames will come to at the chosen detail.
 *
 * Anthropic reads 28-pixel patches and caps each model at a long edge and a token count,
 * downscaling to fit (platform.claude.com/docs/en/build-with-claude/vision, read 2026-09-07):
 * the standard tier at 1568 px and 1568 tokens, the high-resolution tier — Claude 4.7 and
 * later — at 2576 px and 4784 tokens. OpenAI's GPT-5.6 models read 32-pixel patches, bill
 * 1.2 tokens per patch, and at the default detail accept up to 6000 px and 10,000 patches
 * (developers.openai.com/api/docs/guides/images-vision, read 2026-09-07). A model on this Mac
 * costs nothing, whatever it reads.
 */

export type ImageTier =
  | { kind: "anthropic"; maxLongEdge: number; maxTokens: number }
  | { kind: "openai"; maxLongEdge: number; maxPatches: number; perPatch: number }
  | { kind: "free" };

export const ANTHROPIC_STANDARD: ImageTier = { kind: "anthropic", maxLongEdge: 1568, maxTokens: 1568 };
export const ANTHROPIC_HIGH_RES: ImageTier = { kind: "anthropic", maxLongEdge: 2576, maxTokens: 4784 };
export const OPENAI_ORIGINAL: ImageTier = { kind: "openai", maxLongEdge: 6000, maxPatches: 10_000, perPatch: 1.2 };
export const FREE: ImageTier = { kind: "free" };

export const ImageTokens = {
  /** Tokens for a width × height image on a tier, after the provider's own downscaling. */
  count(tier: ImageTier, width: number, height: number): number {
    switch (tier.kind) {
      case "anthropic": return fitted(width, height, 28, tier.maxLongEdge, tier.maxTokens);
      case "openai":    return Math.round(fitted(width, height, 32, tier.maxLongEdge, tier.maxPatches) * tier.perPatch);
      case "free":      return 0;
    }
  },

  /** The size the provider will actually read, which is what tells a photographer whether more detail is worth sending. */
  readAt(tier: ImageTier, width: number, height: number): { width: number; height: number } {
    if (tier.kind === "free") return { width, height };
    const patch = tier.kind === "anthropic" ? 28 : 32;
    const cap = tier.kind === "anthropic" ? tier.maxTokens : tier.maxPatches;
    const s = scale(width, height, patch, tier.maxLongEdge, cap);
    return { width: Math.round(width * s), height: Math.round(height * s) };
  },

  /** The frame the estimates assume: a landscape at the long edge, three by two. */
  frame(longEdge: number, aspect = 3 / 2): { width: number; height: number } {
    return { width: longEdge, height: Math.round(longEdge / aspect) };
  },
};

function patches(w: number, h: number, patch: number, s: number): number {
  return Math.ceil((w * s) / patch) * Math.ceil((h * s) / patch);
}

/** Shrink until both the long edge and the patch count fit, keeping the aspect ratio. */
function scale(w: number, h: number, patch: number, maxEdge: number, maxPatches: number): number {
  let s = Math.min(1, maxEdge / Math.max(w, h));
  if (patches(w, h, patch, s) > maxPatches) {
    s = Math.min(s, Math.sqrt((maxPatches * patch * patch) / (w * h)));
    while (patches(w, h, patch, s) > maxPatches) s *= 0.995;
  }
  return s;
}

function fitted(w: number, h: number, patch: number, maxEdge: number, maxPatches: number): number {
  return patches(w, h, patch, scale(w, h, patch, maxEdge, maxPatches));
}
