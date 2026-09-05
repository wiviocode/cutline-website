import { describe, it, expect } from "vitest";
import { needsOnboarding, firstStep, nextStep, previousStep, keyProblem, WELCOME_STEPS } from "../src/app/onboarding";

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
    expect(WELCOME_STEPS.map((s) => s.id)).toEqual(["key", "byline", "output"]);
    expect(nextStep("key")).toBe("byline");
    expect(nextStep("output")).toBeNull();
    expect(previousStep("key")).toBeNull();
    expect(previousStep("output")).toBe("byline");
  });
  it("rejects a key that cannot be right before the network is asked", () => {
    expect(keyProblem("")).toMatch(/Paste/);
    expect(keyProblem("sk-ant-abc def")).toMatch(/space/);
    expect(keyProblem("abc")).toMatch(/sk-ant-/);
    expect(keyProblem("sk-ant-short")).toMatch(/short/);
    expect(keyProblem("sk-ant-api03-" + "x".repeat(60))).toBeNull();
  });
});
