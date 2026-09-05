/**
 * Which model reads the photographs, and what it costs.
 *
 * Priced per model, because the cost display was once hardcoded to Opus rates and a Haiku run
 * read five times its real price.
 */

export type VisionModelID = "claude-opus-5" | "claude-sonnet-5" | "claude-haiku-4-5-20251001";

export interface VisionModel {
  id: VisionModelID;
  name: string;
  relativeCost: string;
  /** USD per million tokens. */
  inputPricePerMillion: number;
  outputPricePerMillion: number;
}

export const VISION_MODELS: VisionModel[] = [
  { id: "claude-opus-5",              name: "Opus 5",    relativeCost: "most capable", inputPricePerMillion: 5.00, outputPricePerMillion: 25.00 },
  { id: "claude-sonnet-5",            name: "Sonnet 5",  relativeCost: "balanced",     inputPricePerMillion: 2.00, outputPricePerMillion: 10.00 },
  { id: "claude-haiku-4-5-20251001",  name: "Haiku 4.5", relativeCost: "fastest",      inputPricePerMillion: 1.00, outputPricePerMillion: 5.00 },
];

export const VisionModel = {
  default: VISION_MODELS[0],
  byID(id: string): VisionModel { return VISION_MODELS.find((m) => m.id === id) ?? VISION_MODELS[0]; },
  cost(m: VisionModel, inputTokens: number, outputTokens: number): number {
    return (inputTokens / 1_000_000) * m.inputPricePerMillion + (outputTokens / 1_000_000) * m.outputPricePerMillion;
  },
};

export type AltTextMode = "simple" | "brief" | "detailed" | "off";
export const ALT_TEXT_MODES: { id: AltTextMode; name: string }[] = [
  { id: "simple",   name: "Simple — built from the caption, free" },
  { id: "brief",    name: "Brief — a quick look at a small copy" },
  { id: "detailed", name: "Detailed — a full look at the photo" },
  { id: "off",      name: "None" },
];

/** Long-edge sizes for the vision call. */
export const ImagePrep = {
  /** Claude's high-resolution tier caps at 2576 px on the long edge. */
  highResLongEdge: 2576,
  /** Standard tier. */
  standardLongEdge: 1568,
  /** For brief alt text: enough to tell a court from a field and a serve from a dig. */
  briefLongEdge: 672,
  longEdges: [
    { id: 2576, name: "Maximum — 2576 px" },
    { id: 1616, name: "Balanced — 1616 px" },
    { id: 1024, name: "Economy — 1024 px" },
  ],
};
