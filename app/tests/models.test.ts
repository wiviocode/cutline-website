// The model catalogue: what a frame costs on each provider, which models are reachable with what
// the desk has set up, and the factory that builds the right client. No network.

import { describe, it, expect } from "vitest";
import { ImageTokens, ANTHROPIC_HIGH_RES, ANTHROPIC_STANDARD, OPENAI_ORIGINAL, FREE } from "../src/core/models/ImageTokens";
import { VisionModel, VISION_MODELS, Cost, ImagePrep, CostAssumptions } from "../src/core/models/VisionModel";
import { Providers } from "../src/core/models/Providers";
import { Access, NO_ACCESS, makeClient, makeUtilityClient, type ModelAccess } from "../src/core/models/VisionClient";
import { AnthropicClient } from "../src/core/anthropic/AnthropicClient";
import { OpenAICompatibleClient } from "../src/core/models/OpenAICompatibleClient";
import { VisionPrompt } from "../src/core/vision/VisionPrompt";

describe("Image tokens", () => {
  it("reproduces Anthropic's documented examples on both tiers", () => {
    // platform.claude.com/docs/en/build-with-claude/vision, read 2026-09-07
    expect(ImageTokens.count(ANTHROPIC_STANDARD, 1000, 1000)).toBe(1296);
    expect(ImageTokens.count(ANTHROPIC_STANDARD, 1920, 1080)).toBe(1560);
    expect(ImageTokens.count(ANTHROPIC_STANDARD, 2000, 1500)).toBe(1564);
    expect(ImageTokens.count(ANTHROPIC_STANDARD, 3840, 2160)).toBe(1560);
    expect(ImageTokens.count(ANTHROPIC_HIGH_RES, 1920, 1080)).toBe(2691);
    expect(ImageTokens.count(ANTHROPIC_HIGH_RES, 2000, 1500)).toBe(3888);
    expect(ImageTokens.count(ANTHROPIC_HIGH_RES, 3840, 2160)).toBe(4784);
  });
  it("counts the app's own frame sizes", () => {
    expect(ImageTokens.count(ANTHROPIC_HIGH_RES, 1616, 1077)).toBe(58 * 39);
    expect(ImageTokens.count(ANTHROPIC_HIGH_RES, 1024, 683)).toBe(37 * 25);
    // 32-px patches at 1.2 tokens each, no downscale at the default detail.
    expect(ImageTokens.count(OPENAI_ORIGINAL, 1616, 1077)).toBe(Math.round(51 * 34 * 1.2));
    expect(ImageTokens.count(OPENAI_ORIGINAL, 2576, 1717)).toBe(Math.round(81 * 54 * 1.2));
    expect(ImageTokens.count(FREE, 2576, 1717)).toBe(0);
  });
  it("says where a standard-tier model actually reads a frame", () => {
    const read = ImageTokens.readAt(ANTHROPIC_STANDARD, 1616, 1077);
    expect(read.width).toBeLessThan(1400);
    expect(read.width).toBeGreaterThan(1300);
    expect(ImageTokens.readAt(ANTHROPIC_HIGH_RES, 1616, 1077)).toEqual({ width: 1616, height: 1077 });
  });
});

describe("The catalogue", () => {
  const byID = (id: string) => VISION_MODELS.find((m) => m.id === id)!;
  it("prices a thousand frames from the providers' own rates", () => {
    // Sonnet 5 at 1616 px: 2262 image tokens and 300 of context at $2, 9,000 prompt tokens read at $0.20, 600 out at $10.
    const sonnet = Cost.perPhoto(byID("claude-sonnet-5"), 1616, { promptTokens: 9000, contextTokens: 300, outputTokens: 600 });
    expect(sonnet).toBeCloseTo((2262 + 300) * 2e-6 + 9000 * 0.2e-6 + 600 * 10e-6, 6);
    expect(Cost.perThousand(byID("claude-sonnet-5"), 1616)).toBeGreaterThan(10);
    expect(Cost.perThousand(byID("claude-sonnet-5"), 1616)).toBeLessThan(16);
    // Opus is dearer than Sonnet, Sonnet than Haiku, Haiku than Luna; the Mac is free.
    const at = (id: string) => Cost.perThousand(byID(id), 1616);
    expect(at("claude-opus-5")).toBeGreaterThan(at("claude-sonnet-5"));
    expect(at("claude-sonnet-5")).toBeGreaterThan(at("claude-haiku-4-5-20251001"));
    expect(at("claude-haiku-4-5-20251001")).toBeGreaterThan(at("gpt-5.6-luna"));
    expect(at("local")).toBe(0);
    expect(Cost.label(byID("local"), 1616)).toBe("free");
    expect(Cost.label(byID("gpt-5.6-luna"), 1616)).toMatch(/^about \$\d\.\d\d per 1,000 photographs$/);
    expect(Cost.dollars(12.6)).toBe("$13");
    expect(Cost.dollars(1.3)).toBe("$1.30");
  });
  it("assumes a prompt about the size of the instructions actually sent", () => {
    const chars = VisionPrompt.system.length;
    expect(CostAssumptions.promptTokens).toBeGreaterThan(chars / 4.5);
    expect(CostAssumptions.promptTokens).toBeLessThan(chars / 2.8);
  });
  it("sends a standard-tier model only what it will read, and says so in the detail list", () => {
    const haiku = byID("claude-haiku-4-5-20251001");
    expect(VisionModel.effectiveLongEdge(haiku, 2576)).toBeLessThan(1400);
    expect(VisionModel.effectiveLongEdge(byID("claude-sonnet-5"), 2576)).toBeGreaterThanOrEqual(2300);
    expect(VisionModel.effectiveLongEdge(byID("gpt-5.6-luna"), 2576)).toBe(2576);
    expect(VisionModel.effectiveLongEdge(byID("local"), 2576)).toBe(2576);
    const choices = ImagePrep.choicesFor(haiku);
    expect(choices.find((c) => c.id === 2576)?.name).toMatch(/read at \d+ px/);
    expect(choices.find((c) => c.id === 1024)?.name).not.toMatch(/read at/);
    // A three-by-two frame at 2576 px has more patches than the high-resolution tier's 4784-token
    // cap allows, so even Opus reads "Maximum" a little smaller — and the list says so.
    const opus = ImagePrep.choicesFor(byID("claude-opus-5"));
    expect(opus.find((c) => c.id === 2576)?.name).toMatch(/read at 23\d\d px/);
    expect(opus.find((c) => c.id === 1616)?.name).not.toMatch(/read at/);
  });
  it("runs text and alt-text jobs on the provider's cheapest model, and a Mac model on itself", () => {
    expect(VisionModel.utility(byID("claude-opus-5")).id).toBe("claude-haiku-4-5-20251001");
    expect(VisionModel.utility(byID("gpt-5.6-terra")).id).toBe("gpt-5.6-luna");
    expect(VisionModel.utility(byID("local")).id).toBe("local");
    expect(VisionModel.defaultFor("openai").id).toBe("gpt-5.6-terra");
    expect(VisionModel.defaultFor("local").id).toBe("local");
    expect(VisionModel.defaultFor("anthropic").id).toBe("claude-sonnet-5");
  });
  it("marks what has been measured here and what has not", () => {
    expect(VISION_MODELS.filter((m) => m.provider === "anthropic").every((m) => m.measured)).toBe(true);
    expect(VISION_MODELS.filter((m) => m.provider !== "anthropic").every((m) => !m.measured && /ten frames/.test(m.note))).toBe(true);
  });
});

describe("Reaching a model", () => {
  const withKey = (k: Partial<ModelAccess["keys"]>, local = ""): ModelAccess => ({ ...NO_ACCESS, keys: { ...NO_ACCESS.keys, ...k }, localModel: local });
  it("knows what each model needs and says what is missing", () => {
    const sonnet = VisionModel.byID("claude-sonnet-5"), luna = VisionModel.byID("gpt-5.6-luna"), mac = VisionModel.byID("local");
    expect(Access.anyReady(NO_ACCESS)).toBe(false);
    expect(Access.ready(sonnet, withKey({ anthropic: "sk-ant-x" }))).toBe(true);
    expect(Access.ready(luna, withKey({ anthropic: "sk-ant-x" }))).toBe(false);
    expect(Access.missing(luna, withKey({ anthropic: "sk-ant-x" }))).toMatch(/OpenAI API key/);
    expect(Access.missing(mac, NO_ACCESS)).toMatch(/model on this Mac/);
    expect(Access.ready(mac, withKey({}, "qwen3-vl:8b"))).toBe(true);
    expect(Access.wireModel(mac, withKey({}, "qwen3-vl:8b"))).toBe("qwen3-vl:8b");
    expect(Access.firstReady(withKey({ openai: "sk-x" }))).toBe("openai");
  });
  it("builds the right client for where the model lives", () => {
    const a = withKey({ anthropic: "sk-ant-x", openai: "sk-o" }, "qwen3-vl:8b");
    expect(makeClient(VisionModel.byID("claude-sonnet-5"), a)).toBeInstanceOf(AnthropicClient);
    const openai = makeClient(VisionModel.byID("gpt-5.6-luna"), a) as OpenAICompatibleClient;
    expect(openai).toBeInstanceOf(OpenAICompatibleClient);
    expect(openai.baseURL).toBe("https://api.openai.com/v1");
    expect(openai.model).toBe("gpt-5.6-luna");
    const mac = makeClient(VisionModel.byID("local"), a) as OpenAICompatibleClient;
    expect(mac.baseURL).toBe("http://localhost:11434/v1");
    expect(mac.model).toBe("qwen3-vl:8b");
    const util = makeUtilityClient(VisionModel.byID("gpt-5.6-terra"), a, { maxTokens: 8000 });
    expect(util.model.id).toBe("gpt-5.6-luna");
    expect(util.client.model).toBe("gpt-5.6-luna");
  });
  it("checks a key's shape for each provider before the network is asked", () => {
    expect(Providers.keyProblem("anthropic", "sk-ant-" + "x".repeat(50))).toBeNull();
    expect(Providers.keyProblem("openai", "sk-ant-" + "x".repeat(50))).toBeNull();
    expect(Providers.keyProblem("openai", "pk-" + "x".repeat(50))).toMatch(/starts with sk-/);
    expect(Providers.keyProblem("local", "")).toBeNull();
  });
});
