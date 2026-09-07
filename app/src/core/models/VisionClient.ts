/**
 * One face for every model: the three calls the app makes, and a factory that builds the right
 * client for wherever the chosen model lives.
 *
 * `ModelAccess` is what the desk has set up — a key per hosted provider, and the address and
 * model of a server on this Mac. Nothing here reads settings; the store hands its access in.
 */

import { AnthropicClient, type Reply, type KeyCheck } from "../anthropic/AnthropicClient";
import { OpenAICompatibleClient } from "./OpenAICompatibleClient";
import { VisionModel as Catalogue, type VisionModel } from "./VisionModel";
import { Providers, type KeyedProviderID, type ProviderID } from "./Providers";

export interface VisionClient {
  readonly model: string;
  analyse(imageJPEG: Uint8Array, systemPrompt: string, context: string): Promise<Reply>;
  describe(imageJPEG: Uint8Array, systemInstruction: string, userContent: string, maxTokens: number): Promise<Reply>;
  describeText(systemInstruction: string, userContent: string, maxTokens: number): Promise<Reply>;
}

export interface ModelAccess {
  keys: Record<KeyedProviderID, string>;
  /** ".../v1" of Ollama or LM Studio. */
  localBaseURL: string;
  /** The model pulled there that the desk chose; empty until one is. */
  localModel: string;
}

export const DEFAULT_LOCAL_BASE_URL = "http://localhost:11434/v1";
export const NO_ACCESS: ModelAccess = { keys: { anthropic: "", openai: "" }, localBaseURL: DEFAULT_LOCAL_BASE_URL, localModel: "" };

export const Access = {
  providerReady(id: ProviderID, a: ModelAccess): boolean {
    return id === "local" ? a.localModel.trim() !== "" : a.keys[id]?.trim() !== "";
  },
  ready(m: VisionModel, a: ModelAccess): boolean { return Access.providerReady(m.provider, a); },
  anyReady(a: ModelAccess): boolean { return Providers.all.some((p) => Access.providerReady(p.id, a)); },
  /** The first provider that is set up, for choosing a model when the chosen one's is not. */
  firstReady(a: ModelAccess): ProviderID | null { return Providers.all.find((p) => Access.providerReady(p.id, a))?.id ?? null; },

  /** Why a model cannot run yet, in a sentence for the screen; null when it can. */
  missing(m: VisionModel, a: ModelAccess): string | null {
    if (Access.ready(m, a)) return null;
    if (m.provider === "local") return "Choose a model on this Mac in Settings first.";
    return `Add your ${Providers.name(m.provider)} API key in Settings first.`;
  },

  /** The id that goes on the wire. */
  wireModel(m: VisionModel, a: ModelAccess): string { return m.provider === "local" ? a.localModel.trim() : m.wire; },
};

export interface ClientOptions {
  maxTokens?: number;
  effort?: "low" | "medium" | "high" | "xhigh" | "max" | null;
  signal?: AbortSignal;
  onRetry?: (attempt: number, wait: number, why: string) => void;
}

/** A client for the model, built from what the desk has set up. */
export function makeClient(m: VisionModel, a: ModelAccess, opts: ClientOptions = {}): VisionClient {
  const provider = Providers.info(m.provider);
  if (provider.api === "anthropic") {
    return new AnthropicClient({ apiKey: a.keys.anthropic, model: m.wire, maxTokens: opts.maxTokens, effort: opts.effort, signal: opts.signal, onRetry: opts.onRetry });
  }
  const local = m.provider === "local";
  return new OpenAICompatibleClient({
    baseURL: local ? a.localBaseURL : provider.baseURL!,
    apiKey: local ? null : a.keys[m.provider as KeyedProviderID],
    model: Access.wireModel(m, a),
    maxTokens: opts.maxTokens,
    maxTokensParam: local ? "max_tokens" : "max_completion_tokens",
    jsonMode: m.jsonMode,
    signal: opts.signal,
    onRetry: opts.onRetry,
    // A model on a laptop can take a minute a frame; a hosted one should not.
    timeoutMs: local ? 300_000 : 180_000,
  });
}

/** The utility client — the provider's cheapest model, for text and alt-text jobs. */
export function makeUtilityClient(m: VisionModel, a: ModelAccess, opts: ClientOptions = {}): { client: VisionClient; model: VisionModel } {
  const model = Catalogue.utility(m);
  return { client: makeClient(model, a, opts), model };
}

/** Whether a key is accepted, from the provider's free model list. */
export function verifyKey(provider: KeyedProviderID, key: string): Promise<KeyCheck> {
  const k = key.trim();
  if (provider === "anthropic") return AnthropicClient.verifyKey(k);
  return OpenAICompatibleClient.verify(Providers.info(provider).baseURL!, k);
}

/** What a server on this Mac offers, or why it could not be asked. */
export function probeLocal(baseURL: string): Promise<{ ok: true; models: string[] } | { ok: false; reason: string }> {
  return OpenAICompatibleClient.models(baseURL.trim() || DEFAULT_LOCAL_BASE_URL, null);
}
