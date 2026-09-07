/**
 * Where a model lives, and what it takes to reach it from the page.
 *
 * Three ways a photograph can be read, all from the browser with nothing of ours in between:
 * Anthropic's API and OpenAI's API, each with the photographer's own key; and a model server
 * running on the same Mac — Ollama or LM Studio — which takes no key and sends nothing anywhere.
 *
 * Google's Gemini API is deliberately absent: its endpoint does not answer browser requests from
 * another origin, so reaching it would mean routing every photograph through a server of ours.
 */

export type ProviderID = "anthropic" | "openai" | "local";

/** The providers that take a key. */
export type KeyedProviderID = Exclude<ProviderID, "local">;

export interface ProviderInfo {
  id: ProviderID;
  name: string;
  /** The request shape: Anthropic's Messages API, or the chat-completions shape everyone else speaks. */
  api: "anthropic" | "openaiCompatible";
  needsKey: boolean;
  /** What a key of theirs starts with, checked before the network is asked. */
  keyPrefix: string | null;
  /** Where to get one. */
  keyURL: string | null;
  /** The host the photographs go to, in the words beside the key. */
  destination: string;
  /** What happens to the photographs there, as the provider states it. */
  dataUse: string;
  /** The base of the chat-completions API; Anthropic's SDK knows its own. */
  baseURL: string | null;
}

export const PROVIDERS: ProviderInfo[] = [
  {
    id: "anthropic", name: "Anthropic", api: "anthropic", needsKey: true, keyPrefix: "sk-ant-",
    keyURL: "https://console.anthropic.com/settings/keys", destination: "api.anthropic.com",
    dataUse: "Anthropic does not use what is sent through its API to train its models.",
    baseURL: null,
  },
  {
    id: "openai", name: "OpenAI", api: "openaiCompatible", needsKey: true, keyPrefix: "sk-",
    keyURL: "https://platform.openai.com/api-keys", destination: "api.openai.com",
    dataUse: "OpenAI does not use what is sent through its API to train its models unless you opt in.",
    baseURL: "https://api.openai.com/v1",
  },
  {
    id: "local", name: "On this Mac", api: "openaiCompatible", needsKey: false, keyPrefix: null,
    keyURL: null, destination: "a model server on this Mac",
    dataUse: "The photographs are read on this Mac and are not sent anywhere.",
    baseURL: "http://localhost:11434/v1",
  },
];

const BY_ID = new Map(PROVIDERS.map((p) => [p.id, p]));

export const Providers = {
  all: PROVIDERS,
  info(id: ProviderID): ProviderInfo { return BY_ID.get(id) ?? PROVIDERS[0]; },
  name(id: ProviderID): string { return Providers.info(id).name; },

  /** What is wrong with a key before it is sent anywhere, or null when it is worth checking. */
  keyProblem(id: ProviderID, raw: string): string | null {
    const p = Providers.info(id);
    if (!p.needsKey) return null;
    const key = raw.trim();
    if (!key) return "Paste the key first.";
    if (/\s/.test(key)) return "The key has a space or line break in it — it was not copied whole.";
    if (p.keyPrefix && !key.startsWith(p.keyPrefix)) return `${aOrAn(p.name)} ${p.name} API key starts with ${p.keyPrefix}.`;
    if (key.length < (id === "anthropic" ? 40 : 20)) return "That is too short to be a whole key.";
    return null;
  },
};

function aOrAn(word: string): string { return /^[aeio]/i.test(word) ? "An" : "A"; }
