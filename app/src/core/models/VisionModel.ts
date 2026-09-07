/**
 * The models a photograph can be read by, and what each costs.
 *
 * One table, priced per model from the providers' own pages (read 2026-09-07), because the cost
 * display was once hardcoded to Opus rates and a Haiku run read five times its real price. The
 * three Anthropic models have been run on this app's own frames; the rest have not been measured
 * on jersey numbers here, and their notes say so — a photographer chooses them for the price and
 * tries them on ten frames first.
 *
 * Google's Gemini is not offered: its API does not answer a browser on another origin, and its
 * free tier keeps what it is sent for training. Neither fits an app that sends a photographer's
 * unpublished frames from their own browser.
 */

import { type ProviderID, Providers } from "./Providers";
import { ImageTokens, ANTHROPIC_HIGH_RES, ANTHROPIC_STANDARD, OPENAI_ORIGINAL, FREE, type ImageTier } from "./ImageTokens";

export type Tier = "accurate" | "balanced" | "economy" | "free";

export const TIER_LABELS: Record<Tier, string> = { accurate: "Most accurate", balanced: "Balanced", economy: "Economy", free: "Free and private" };

export interface VisionModel {
  /** What settings store. The Anthropic ids are the model ids, as they always were. */
  id: string;
  provider: ProviderID;
  /** The id on the wire. Empty for the local entry, whose model is whatever the desk picked. */
  wire: string;
  name: string;
  tier: Tier;
  /** What it is good for, and whether that has been measured on this app's frames. */
  note: string;
  measured: boolean;
  /** USD per million tokens. */
  inputPricePerMillion: number;
  outputPricePerMillion: number;
  /** Writing the prompt cache costs this much of the input rate; reading it, this much. */
  cacheWriteMultiplier: number;
  cacheReadMultiplier: number;
  image: ImageTier;
  /** The chat API can be asked for a JSON object outright. */
  jsonMode: boolean;
}

export const VISION_MODELS: VisionModel[] = [
  { id: "claude-opus-5", provider: "anthropic", wire: "claude-opus-5", name: "Opus 5", tier: "accurate",
    note: "Reads the most numbers right, at the highest price.", measured: true,
    inputPricePerMillion: 5, outputPricePerMillion: 25, cacheWriteMultiplier: 1.25, cacheReadMultiplier: 0.1, image: ANTHROPIC_HIGH_RES, jsonMode: false },
  { id: "claude-sonnet-5", provider: "anthropic", wire: "claude-sonnet-5", name: "Sonnet 5", tier: "balanced",
    note: "Most of Opus's reading of a moving number at less than half the price. The default.", measured: true,
    inputPricePerMillion: 2, outputPricePerMillion: 10, cacheWriteMultiplier: 1.25, cacheReadMultiplier: 0.1, image: ANTHROPIC_HIGH_RES, jsonMode: false },
  { id: "claude-haiku-4-5-20251001", provider: "anthropic", wire: "claude-haiku-4-5-20251001", name: "Haiku 4.5", tier: "economy",
    note: "Cheapest and quickest of Anthropic's; misses more numbers on busy frames, and reads a frame at 1568 px at most.", measured: true,
    inputPricePerMillion: 1, outputPricePerMillion: 5, cacheWriteMultiplier: 1.25, cacheReadMultiplier: 0.1, image: ANTHROPIC_STANDARD, jsonMode: false },
  { id: "gpt-5.6-terra", provider: "openai", wire: "gpt-5.6-terra", name: "GPT-5.6 Terra", tier: "balanced",
    note: "OpenAI's mid-size model, priced like Sonnet. Not yet measured on jersey numbers here — try it on ten frames before a whole shoot.", measured: false,
    inputPricePerMillion: 2, outputPricePerMillion: 12, cacheWriteMultiplier: 1.25, cacheReadMultiplier: 0.1, image: OPENAI_ORIGINAL, jsonMode: true },
  { id: "gpt-5.6-luna", provider: "openai", wire: "gpt-5.6-luna", name: "GPT-5.6 Luna", tier: "economy",
    note: "OpenAI's small model, about a tenth of Sonnet's price. Not yet measured on jersey numbers here — try it on ten frames before a whole shoot.", measured: false,
    inputPricePerMillion: 0.2, outputPricePerMillion: 1.2, cacheWriteMultiplier: 1.25, cacheReadMultiplier: 0.1, image: OPENAI_ORIGINAL, jsonMode: true },
  { id: "local", provider: "local", wire: "", name: "A model on this Mac", tier: "free",
    note: "Ollama or LM Studio running a vision model such as qwen3-vl. Costs nothing and sends nothing; slower, and weaker on small blurred numbers than the hosted models — try it on ten frames first.", measured: false,
    inputPricePerMillion: 0, outputPricePerMillion: 0, cacheWriteMultiplier: 0, cacheReadMultiplier: 0, image: FREE, jsonMode: true },
];

export const DEFAULT_VISION_MODEL = "claude-sonnet-5";

const BY_ID = new Map(VISION_MODELS.map((m) => [m.id, m]));

export const VisionModel = {
  all: VISION_MODELS,
  default: BY_ID.get(DEFAULT_VISION_MODEL)!,
  byID(id: string): VisionModel { return BY_ID.get(id) ?? VisionModel.default; },
  exists(id: string): boolean { return BY_ID.has(id); },
  /** The first model a provider is offered with: its balanced one, or the only one. */
  defaultFor(provider: ProviderID): VisionModel {
    const mine = VISION_MODELS.filter((m) => m.provider === provider);
    return mine.find((m) => m.tier === "balanced") ?? mine[0] ?? VisionModel.default;
  },
  /**
   * The model text-only and alt-text jobs run on: the cheapest of the same provider, so a desk on
   * OpenAI never needs an Anthropic key for a roster page, and a Mac model is its own helper.
   */
  utility(m: VisionModel): VisionModel {
    if (m.provider === "local") return m;
    const mine = VISION_MODELS.filter((x) => x.provider === m.provider);
    return mine.reduce((best, x) => (x.inputPricePerMillion < best.inputPricePerMillion ? x : best), mine[0]);
  },
  tierLabel(m: VisionModel): string { return TIER_LABELS[m.tier]; },
  providerName(m: VisionModel): string { return Providers.name(m.provider); },

  /**
   * The long edge worth sending: what the provider will read the frame at. Haiku reads a
   * 1616 px frame at 1338 px whatever is sent, so that is what goes on the wire.
   */
  effectiveLongEdge(m: VisionModel, longEdge: number): number {
    const f = ImageTokens.frame(longEdge);
    return ImageTokens.readAt(m.image, f.width, f.height).width;
  },

  /**
   * Cached prompt tokens are billed too: writing the cache costs more than the input rate,
   * reading it a tenth. Leaving them out understated a cached run by several times.
   */
  cost(m: VisionModel, inputTokens: number, outputTokens: number, cacheWriteTokens = 0, cacheReadTokens = 0): number {
    const perIn = m.inputPricePerMillion / 1_000_000;
    return inputTokens * perIn + (outputTokens / 1_000_000) * m.outputPricePerMillion
      + cacheWriteTokens * perIn * m.cacheWriteMultiplier + cacheReadTokens * perIn * m.cacheReadMultiplier;
  },
};

/**
 * What a photograph is assumed to cost, for the estimates beside each model: the frame at the
 * chosen detail, the system prompt read from cache, a few hundred tokens of roster and notes,
 * and the JSON that comes back. The prompt figure is the instructions file at Claude's current
 * tokenizer, which runs about a third denser than four characters a token.
 */
export const CostAssumptions = { promptTokens: 9_000, contextTokens: 300, outputTokens: 600 };

export const Cost = {
  /** The steady-state cost of one photograph, once the first has written the prompt cache. */
  perPhoto(m: VisionModel, longEdge: number, a = CostAssumptions): number {
    if (m.provider === "local") return 0;
    const f = ImageTokens.frame(longEdge);
    const image = ImageTokens.count(m.image, f.width, f.height);
    const perIn = m.inputPricePerMillion / 1_000_000;
    return (image + a.contextTokens) * perIn + a.promptTokens * perIn * m.cacheReadMultiplier + (a.outputTokens / 1_000_000) * m.outputPricePerMillion;
  },
  perThousand(m: VisionModel, longEdge: number): number { return Cost.perPhoto(m, longEdge) * 1000; },
  /** "about $13 per 1,000 photographs", "about $1.30 per 1,000 photographs", "free". */
  label(m: VisionModel, longEdge: number): string {
    if (m.provider === "local") return "free";
    return `about ${Cost.dollars(Cost.perThousand(m, longEdge))} per 1,000 photographs`;
  },
  /** "$13", "$1.30", "$0.45". */
  dollars(n: number): string { return n >= 10 ? `$${Math.round(n)}` : `$${n.toFixed(2)}`; },
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
  /**
   * The choices for a model, each saying where the provider would actually read the frame when
   * that is smaller than what is sent — so "Maximum" on Haiku is not a silent no-op.
   */
  choicesFor(m: VisionModel): { id: number; name: string }[] {
    return ImagePrep.longEdges.map((e) => {
      const read = VisionModel.effectiveLongEdge(m, e.id);
      return { id: e.id, name: read < e.id * 0.97 ? `${e.name} · read at ${read} px` : e.name };
    });
  },
};
