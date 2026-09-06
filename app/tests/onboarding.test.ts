import { describe, it, expect } from "vitest";
import { needsOnboarding, firstStep, nextStep, previousStep, keyProblem, WELCOME_STEPS, NAMING_PRESETS, presetFor } from "../src/app/onboarding";
import { NamingPattern } from "../src/core/naming/NamingPattern";
import { DEFAULT_SETTINGS } from "../src/platform/storage";
import { VisionModel } from "../src/core/anthropic/VisionModel";

describe("The first-time setup", () => {
  it("runs until it has been finished once and there is a key", () => {
    expect(needsOnboarding({ onboarded: false }, "")).toBe(true);
    expect(needsOnboarding({ onboarded: false }, "sk-ant-x")).toBe(true);
    expect(needsOnboarding({ onboarded: true }, "")).toBe(true);
    expect(needsOnboarding({ onboarded: true }, "  ")).toBe(true);
    expect(needsOnboarding({ onboarded: true }, "sk-ant-x")).toBe(false);
  });
  it("opens on the first missing answer", () => {
    expect(firstStep({ onboarded: false }, "")).toBe("key");
    expect(firstStep({ onboarded: false }, "sk-ant-x")).toBe("byline");
  });
  it("walks the steps in order and stops at the ends", () => {
    expect(WELCOME_STEPS.map((s) => s.id)).toEqual(["key", "byline", "output", "naming"]);
    expect(nextStep("key")).toBe("byline");
    expect(nextStep("output")).toBe("naming");
    expect(nextStep("naming")).toBeNull();
    expect(previousStep("key")).toBeNull();
    expect(previousStep("naming")).toBe("output");
  });
  it("rejects a key that cannot be right before the network is asked", () => {
    expect(keyProblem("")).toMatch(/Paste/);
    expect(keyProblem("sk-ant-abc def")).toMatch(/space/);
    expect(keyProblem("abc")).toMatch(/sk-ant-/);
    expect(keyProblem("sk-ant-short")).toMatch(/short/);
    expect(keyProblem("sk-ant-api03-" + "x".repeat(60))).toBeNull();
  });
  it("offers naming conventions that use only known tokens, and knows which one a pattern is", () => {
    for (const p of NAMING_PRESETS.filter((p) => p.pattern)) expect(NamingPattern.unknownTokens(p.pattern)).toEqual([]);
    expect(presetFor(NamingPattern.hurrdat)).toBe("hurrdat");
    expect(presetFor("{date}_{team}_{vs}_{opponent}_{seq}")).toBe("dateTeams");
    expect(presetFor("{date}_{seq}")).toBe("custom");
    expect(NAMING_PRESETS[0].pattern).toBe(NamingPattern.hurrdat);
  });
  it("starts a new desk on Sonnet 5", () => {
    expect(DEFAULT_SETTINGS.model).toBe("claude-sonnet-5");
    expect(VisionModel.default.id).toBe("claude-sonnet-5");
    expect(VisionModel.byID("nonsense").id).toBe("claude-sonnet-5");
  });
});
