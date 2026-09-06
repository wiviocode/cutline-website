/**
 * The first-time setup, as rules: when it is needed, what its steps are, and what a key should
 * look like before the network is asked. Pure, so it is tested without a browser.
 */

import { NamingPattern } from "@core/naming/NamingPattern";

export type WelcomeStep = "key" | "byline" | "output" | "naming";

export const WELCOME_STEPS: { id: WelcomeStep; title: string; blurb: string }[] = [
  { id: "key",    title: "Your key",         blurb: "Cutline reads photographs with a model you pay for directly." },
  { id: "byline", title: "Your byline",      blurb: "The name in the credit line, and the house style the captions follow." },
  { id: "output", title: "Model and output", blurb: "Which model reads the photographs, where the captions go, and your desk's template." },
  { id: "naming", title: "File names",       blurb: "How the renamer names photographs, when you ask it to." },
];

/** Naming conventions offered by name. Hurrdat's is the one that was published; the rest are common shapes. */
export const NAMING_PRESETS: { id: string; title: string; pattern: string; detail: string }[] = [
  { id: "hurrdat",   title: "Hurrdat convention", pattern: NamingPattern.hurrdat,                    detail: "Your initials, the date, the sport code, the team you covered, v or at, the opponent, the frame number." },
  { id: "dateTeams", title: "Date and teams",     pattern: "{date}_{team}_{vs}_{opponent}_{seq}",    detail: "The date, the team you covered, v or at, the opponent, the frame number. No initials or sport code." },
  { id: "homeAway",  title: "Home and away",      pattern: "{date}_{sport}_{home}_v_{away}_{seq}",   detail: "The date and sport, then the host first whoever you covered, then the visitor." },
  { id: "custom",    title: "Custom",             pattern: "",                                        detail: "Any order of the tokens below, typed in the pattern field." },
];

/** Which preset a pattern is, or "custom" when it is none of them. */
export function presetFor(pattern: string): string {
  return NAMING_PRESETS.find((p) => p.pattern && p.pattern === pattern.trim())?.id ?? "custom";
}

/** Setup runs until it has been finished once and there is a key to work with. */
export function needsOnboarding(settings: { onboarded: boolean }, apiKey: string): boolean {
  return !settings.onboarded || apiKey.trim() === "";
}

/** The step to open on: the first one whose answer is missing. */
export function firstStep(settings: { onboarded: boolean }, apiKey: string): WelcomeStep {
  return apiKey.trim() ? "byline" : "key";
}

export function nextStep(step: WelcomeStep): WelcomeStep | null {
  const i = WELCOME_STEPS.findIndex((s) => s.id === step);
  return WELCOME_STEPS[i + 1]?.id ?? null;
}

export function previousStep(step: WelcomeStep): WelcomeStep | null {
  const i = WELCOME_STEPS.findIndex((s) => s.id === step);
  return i > 0 ? WELCOME_STEPS[i - 1].id : null;
}

/** What is wrong with a key before it is sent anywhere, or null when it is worth checking. */
export function keyProblem(raw: string): string | null {
  const key = raw.trim();
  if (!key) return "Paste the key first.";
  if (/\s/.test(key)) return "The key has a space or line break in it — it was not copied whole.";
  if (!key.startsWith("sk-ant-")) return "An Anthropic API key starts with sk-ant-.";
  if (key.length < 40) return "That is too short to be a whole key.";
  return null;
}
