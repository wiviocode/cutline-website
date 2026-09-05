/**
 * The first-time setup, as rules: when it is needed, what its steps are, and what a key should
 * look like before the network is asked. Pure, so it is tested without a browser.
 */

export type WelcomeStep = "key" | "byline" | "output";

export const WELCOME_STEPS: { id: WelcomeStep; title: string; blurb: string }[] = [
  { id: "key",    title: "Your key",         blurb: "Cutline reads photographs with a model you pay for directly." },
  { id: "byline", title: "Your byline",      blurb: "The name in the credit line, and the house style the captions follow." },
  { id: "output", title: "Model and output", blurb: "Which model reads the photographs, and where the captions go." },
];

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
