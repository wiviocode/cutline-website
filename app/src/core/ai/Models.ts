/**
 * The three ways a shoot can be read, and what each costs.
 *
 * Prices are Anthropic's list prices per million tokens (September 2026). The image budget is
 * the most important cost lever: a photograph is billed by its 28-pixel patches, so the tiers
 * differ as much in how much of the frame they send as in which model reads it.
 */

export type Tier = "economy" | "balanced" | "best";

export interface ModelInfo {
  id: string;
  name: string;
  input: number;
  output: number;
  /** Multipliers on the input price. */
  cacheWrite: number;
  cacheRead: number;
  /** The model's native image limits (standard or high-resolution tier). */
  maxEdge: number;
  maxImageTokens: number;
  /** How the request asks for thinking: off, or the effort to spend when it cannot be turned off. */
  thinking: "none" | "disabled" | { effort: "low" | "medium" };
}

export const MODELS: Record<string, ModelInfo> = {
  "claude-haiku-4-5": { id: "claude-haiku-4-5", name: "Claude Haiku 4.5", input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1, maxEdge: 1568, maxImageTokens: 1568, thinking: "none" },
  "claude-sonnet-5": { id: "claude-sonnet-5", name: "Claude Sonnet 5", input: 2, output: 10, cacheWrite: 1.25, cacheRead: 0.1, maxEdge: 2576, maxImageTokens: 4784, thinking: "disabled" },
  "claude-opus-5-5": { id: "claude-opus-5-5", name: "Claude Opus 5.5", input: 4, output: 20, cacheWrite: 1.25, cacheRead: 0.05, maxEdge: 2576, maxImageTokens: 4784, thinking: { effort: "low" } },
};

export interface TierInfo {
  id: Tier;
  name: string;
  model: string;
  /** Image budget in visual tokens; the frame is sized to fit it before it is sent. */
  imageTokens: number;
  /** Take a second, full-resolution look at numbers the first pass could not settle. */
  zoom: boolean;
  blurb: string;
}

/**
 * Chosen on 35 hand-checked frames from six real shoots (college and high-school football,
 * volleyball and soccer), scored on the names that reach the caption:
 *
 *   Haiku 4.5, 1568 tokens           precision 60%  recall 64%   $4.51 / 1,000
 *   Sonnet 5, 1568 tokens + zoom     precision 92%  recall 83%   $7.43 / 1,000
 *   Sonnet 5, 3000 tokens + zoom     precision 90%  recall 88%  $12.75 / 1,000
 *   Opus 5.5, 2400 tokens + zoom     precision 100% recall 93%  $20.57 / 1,000
 *   Opus 5.5, 4784 tokens + zoom     precision 100% recall 93%  $35.35 / 1,000
 *
 * Haiku misread too many numbers with confidence to be offered for photographs at all; it still
 * does the text jobs (a roster page, a team's name). The zoom — a close crop of the original for
 * numbers the first look could not settle — is on everywhere, because it buys recall for pennies.
 */
export const TIERS: Record<Tier, TierInfo> = {
  economy: { id: "economy", name: "Economy", model: "claude-sonnet-5", imageTokens: 1568, zoom: true,
    blurb: "Sonnet at standard resolution with close-ups of unclear numbers. Names about 8 in 10 players; wrong about 1 in 12." },
  balanced: { id: "balanced", name: "Balanced", model: "claude-opus-5-5", imageTokens: 2400, zoom: true,
    blurb: "Opus with close-ups of unclear numbers. Named 9 in 10 players with no wrong names in testing. The default." },
  best: { id: "best", name: "Best", model: "claude-opus-5-5", imageTokens: 4784, zoom: true,
    blurb: "Opus at full resolution. For wide, distant and aerial frames where numbers are small." },
};

/** The model that does text-only jobs: reading a roster page, naming a team. */
export const TEXT_MODEL = "claude-haiku-4-5";
/** The model that looks at a few frames to describe what each team is wearing. */
export const SCOUT_MODEL = "claude-sonnet-5";

export interface Usage {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}

export const Usage = {
  zero(): Usage { return { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 }; },
  add(a: Usage, b: Usage): Usage { return { input: a.input + b.input, output: a.output + b.output, cacheWrite: a.cacheWrite + b.cacheWrite, cacheRead: a.cacheRead + b.cacheRead }; },
  fromAPI(u: { input_tokens?: number | null; output_tokens?: number | null; cache_creation_input_tokens?: number | null; cache_read_input_tokens?: number | null } | null | undefined): Usage {
    return { input: u?.input_tokens ?? 0, output: u?.output_tokens ?? 0, cacheWrite: u?.cache_creation_input_tokens ?? 0, cacheRead: u?.cache_read_input_tokens ?? 0 };
  },
};

export const Cost = {
  /** Dollars for a usage on a model; batch requests are billed at half. */
  of(model: string, u: Usage, batch = false): number {
    const m = MODELS[model];
    if (!m) return 0;
    const perIn = m.input / 1e6;
    const dollars = u.input * perIn + u.output * (m.output / 1e6) + u.cacheWrite * perIn * m.cacheWrite + u.cacheRead * perIn * m.cacheRead;
    return batch ? dollars / 2 : dollars;
  },

  /**
   * The steady-state estimate for one photograph on a tier: the frame at its image budget, the
   * cached prompt read back, a line of text, and the JSON reply. Zoom adds a close crop for about
   * one frame in five.
   */
  perPhoto(tier: Tier, promptTokens = 4300): number {
    const t = TIERS[tier];
    const m = MODELS[t.model];
    const image = Math.min(t.imageTokens, m.maxImageTokens);
    // Replies average about 220 tokens on every tier (measured). Opus takes a close look at
    // about three frames in four, Sonnet about one in three.
    const u: Usage = { input: image + 80, output: 230, cacheWrite: 0, cacheRead: promptTokens };
    let dollars = Cost.of(t.model, u);
    if (t.zoom) dollars += (t.model.includes("opus") ? 0.75 : 0.33) * Cost.of(t.model, { input: 1250, output: 30, cacheWrite: 0, cacheRead: 0 });
    return dollars;
  },

  /** "$9.80", "$0.45", "4¢". */
  dollars(n: number): string {
    if (n > 0 && n < 0.1) return `${Math.max(1, Math.round(n * 100))}¢`;
    return n >= 100 ? `$${Math.round(n)}` : `$${n.toFixed(2)}`;
  },
};
