/**
 * The chat-completions API, from the page — the shape OpenAI defined and that Ollama and LM
 * Studio speak too, so one client reaches a hosted model with the photographer's key and a model
 * on their own Mac with none.
 *
 * Plain fetch rather than a second SDK: the request is one JSON document, and what this app
 * needs from the response is the text and the token counts. The same `RetryPolicy` as the
 * Anthropic client decides what is tried again, so the two behave alike under a rate limit.
 *
 * The one provider-specific wrinkle is spelled out: OpenAI's own API wants the output limit as
 * `max_completion_tokens`; the local servers take `max_tokens`. Asking for a JSON object outright
 * (`response_format`) is tried first and dropped, once, if the server rejects the parameter, so a
 * server that does not know it costs one request rather than every frame.
 */

import { RetryPolicy, type TransportFailure } from "../anthropic/RetryPolicy";
import { ClientError, toBase64, type Reply, type KeyCheck } from "../anthropic/AnthropicClient";

export interface OpenAICompatibleOptions {
  /** ".../v1" — https://api.openai.com/v1, or http://localhost:11434/v1. */
  baseURL: string;
  /** None for a server on this Mac. */
  apiKey: string | null;
  model: string;
  maxTokens?: number;
  maxTokensParam?: "max_completion_tokens" | "max_tokens";
  /** Ask for a JSON object on the vision call. */
  jsonMode?: boolean;
  retry?: RetryPolicy;
  onRetry?: (attempt: number, wait: number, why: string) => void;
  signal?: AbortSignal;
  /** Per request. A local 30B model on a laptop can take a minute a frame. */
  timeoutMs?: number;
  /** For tests. */
  fetch?: typeof fetch;
}

type Part = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
interface Request { system: string; parts: Part[] | string; maxTokens: number; json: boolean }

export class OpenAICompatibleClient {
  readonly model: string;
  readonly maxTokens: number;
  readonly baseURL: string;
  private readonly apiKey: string | null;
  private readonly maxTokensParam: "max_completion_tokens" | "max_tokens";
  private jsonMode: boolean;
  private readonly retry: RetryPolicy;
  private readonly onRetry?: OpenAICompatibleOptions["onRetry"];
  private readonly signal?: AbortSignal;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: OpenAICompatibleOptions) {
    this.model = opts.model;
    this.maxTokens = opts.maxTokens ?? 2000;
    this.baseURL = opts.baseURL.replace(/\/+$/, "");
    this.apiKey = opts.apiKey || null;
    this.maxTokensParam = opts.maxTokensParam ?? "max_completion_tokens";
    this.jsonMode = opts.jsonMode ?? true;
    this.retry = opts.retry ?? new RetryPolicy();
    this.onRetry = opts.onRetry;
    this.signal = opts.signal;
    this.timeoutMs = opts.timeoutMs ?? 180_000;
    this.fetchImpl = opts.fetch ?? fetch;
  }

  /** One vision call: system prompt, image, then the per-photo context — a JSON object back. */
  analyse(imageJPEG: Uint8Array, systemPrompt: string, context: string): Promise<Reply> {
    return this.send({ system: systemPrompt, parts: [image(imageJPEG), { type: "text", text: context }], maxTokens: this.maxTokens, json: true });
  }

  /** A short single-image call with its own instruction, for alt text. Prose back. */
  describe(imageJPEG: Uint8Array, systemInstruction: string, userContent: string, maxTokens: number): Promise<Reply> {
    return this.send({ system: systemInstruction, parts: [image(imageJPEG), { type: "text", text: userContent }], maxTokens, json: false });
  }

  /** A text-only call — no image. Used for roster extraction from a web page. */
  describeText(systemInstruction: string, userContent: string, maxTokens: number): Promise<Reply> {
    return this.send({ system: systemInstruction, parts: userContent, maxTokens, json: false });
  }

  /** Whether the server answers and takes the key, from its model list — no tokens are spent. */
  static async verify(baseURL: string, apiKey: string | null, fetchImpl: typeof fetch = fetch): Promise<KeyCheck> {
    const r = await OpenAICompatibleClient.models(baseURL, apiKey, fetchImpl);
    return r.ok ? { ok: true } : r;
  }

  /** The models a server offers. For a Mac, that is what has been pulled. */
  static async models(baseURL: string, apiKey: string | null, fetchImpl: typeof fetch = fetch): Promise<{ ok: true; models: string[] } | { ok: false; reason: string }> {
    const url = `${baseURL.replace(/\/+$/, "")}/models`;
    let res: Response;
    try {
      res = await fetchImpl(url, { headers: headersFor(apiKey), signal: AbortSignal.timeout(20_000) });
    } catch {
      return { ok: false, reason: unreachable(baseURL) };
    }
    if (res.status === 401) return { ok: false, reason: "That key was not accepted. Check it was copied whole." };
    if (res.status === 403) return { ok: false, reason: "That key is valid but not allowed to use the API. Check its permissions." };
    if (res.status === 429) return { ok: false, reason: "The key works but is rate-limited right now. Try again in a moment." };
    if (!res.ok) return { ok: false, reason: `${hostOf(baseURL)} answered HTTP ${res.status}.` };
    let body: unknown;
    try { body = await res.json(); } catch { return { ok: false, reason: `${hostOf(baseURL)} did not answer with a model list.` }; }
    const data = (body as { data?: { id?: unknown }[] })?.data;
    const models = Array.isArray(data) ? data.map((m) => String(m?.id ?? "")).filter(Boolean) : [];
    return { ok: true, models };
  }

  /** Whether the key, not the network, is what the server objects to. Only a hosted API has a key to ask about. */
  private async rejectedKey(): Promise<401 | 403 | null> {
    if (!this.apiKey) return null;
    try {
      const res = await this.fetchImpl(`${this.baseURL}/models`, { headers: headersFor(this.apiKey), signal: AbortSignal.timeout(10_000) });
      return res.status === 401 ? 401 : res.status === 403 ? 403 : null;
    } catch { return null; }
  }

  private body(req: Request): Record<string, unknown> {
    const messages: { role: string; content: string | Part[] }[] = [];
    if (req.system) messages.push({ role: "system", content: req.system });
    messages.push({ role: "user", content: req.parts });
    const b: Record<string, unknown> = { model: this.model, messages, [this.maxTokensParam]: req.maxTokens };
    if (req.json && this.jsonMode) b.response_format = { type: "json_object" };
    return b;
  }

  private async send(req: Request): Promise<Reply> {
    let attempt = 0;
    for (;;) {
      attempt += 1;
      const r = await this.once(this.body(req));
      if (r.kind === "reply") return r.reply;
      if (r.kind === "status") {
        // A server that does not know response_format says so with a 400: ask plainly, once.
        if (r.status === 400 && req.json && this.jsonMode && /response_format|json/i.test(r.message)) { this.jsonMode = false; attempt -= 1; continue; }
        const d = this.retry.decide(r.status, attempt, r.retryAfter);
        if (d.retry) { this.onRetry?.(attempt, d.after, `HTTP ${r.status}`); await sleep(d.after); continue; }
        throw new ClientError("http", r.message ? `${d.reason}: ${r.message}` : d.reason, r.status);
      }
      if (r.kind === "transport") {
        const d = this.retry.decideTransport(r.failure, attempt);
        if (d.retry) { this.onRetry?.(attempt, d.after, r.failure); await sleep(d.after); continue; }
        throw new ClientError("http", r.failure === "cancelled" ? "stopped" : r.message);
      }
    }
  }

  private async once(body: Record<string, unknown>): Promise<
    | { kind: "reply"; reply: Reply }
    | { kind: "status"; status: number; message: string; retryAfter: number | null }
    | { kind: "transport"; failure: TransportFailure; message: string }> {
    const signals: AbortSignal[] = [AbortSignal.timeout(this.timeoutMs)];
    if (this.signal) signals.push(this.signal);
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseURL}/chat/completions`, {
        method: "POST", headers: { ...headersFor(this.apiKey), "content-type": "application/json" },
        body: JSON.stringify(body), signal: AbortSignal.any(signals),
      });
    } catch (e) {
      if (this.signal?.aborted) return { kind: "transport", failure: "cancelled", message: "stopped" };
      if ((e as Error)?.name === "TimeoutError") return { kind: "transport", failure: "timeout", message: "the request timed out" };
      // A hosted API answers a rejected key without the CORS header the browser needs, so a
      // bad key reads as "failed to fetch". Its model list does carry the header: ask it which.
      const rejected = await this.rejectedKey();
      if (rejected) return { kind: "status", status: rejected, message: "the API key was rejected", retryAfter: null };
      return { kind: "transport", failure: "network", message: unreachable(this.baseURL) };
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { kind: "status", status: res.status, message: errorMessage(text), retryAfter: retryAfterSeconds(res, text) };
    }
    let json: unknown;
    try { json = await res.json(); } catch { throw new ClientError("malformed", "the reply was not JSON"); }
    return { kind: "reply", reply: toReply(json) };
  }
}

function image(jpeg: Uint8Array): Part {
  return { type: "image_url", image_url: { url: `data:image/jpeg;base64,${toBase64(jpeg)}` } };
}

function headersFor(apiKey: string | null): Record<string, string> {
  return apiKey ? { authorization: `Bearer ${apiKey}` } : {};
}

function hostOf(baseURL: string): string {
  try { return new URL(baseURL).host; } catch { return baseURL; }
}

function unreachable(baseURL: string): string {
  const host = hostOf(baseURL);
  return /^(localhost|127\.0\.0\.1|\[::1\])/.test(host)
    ? `Could not reach ${host}. Is the model server running, and is this site among the origins it allows?`
    : `Could not reach ${host}. Check the connection, or whether something is blocking it.`;
}

/** `{ error: { message } }` from OpenAI; `{ error: "…" }` from Ollama; anything else verbatim. */
function errorMessage(text: string): string {
  try {
    const j = JSON.parse(text) as { error?: { message?: string } | string; message?: string };
    if (typeof j.error === "string") return j.error;
    if (j.error && typeof j.error.message === "string") return j.error.message;
    if (typeof j.message === "string") return j.message;
  } catch { /* not JSON */ }
  return text.slice(0, 200);
}

function retryAfterSeconds(res: Response, text: string): number | null {
  const header = res.headers.get("retry-after");
  if (header) { const n = Number(header); if (isFinite(n)) return n; }
  const m = /try again in ([0-9.]+)s/i.exec(text);
  return m ? Number(m[1]) : null;
}

/** The text and the counts out of a chat completion, whichever server wrote it. */
function toReply(json: unknown): Reply {
  const j = json as {
    choices?: { message?: { content?: string | { type?: string; text?: string }[] | null }; finish_reason?: string | null }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } };
  };
  const choice = j.choices?.[0];
  if (!choice) throw new ClientError("malformed", "the reply had no choices");
  if (choice.finish_reason === "content_filter") throw new ClientError("refused", "the model declined to describe this photograph");
  const content = choice.message?.content;
  const text = typeof content === "string" ? content
    : Array.isArray(content) ? content.filter((p) => p.type === "text" && typeof p.text === "string").map((p) => p.text as string).join("") : "";
  const cached = j.usage?.prompt_tokens_details?.cached_tokens ?? 0;
  const prompt = j.usage?.prompt_tokens ?? 0;
  return {
    text,
    stopReason: choice.finish_reason ?? null,
    usage: {
      inputTokens: Math.max(0, prompt - cached),
      outputTokens: j.usage?.completion_tokens ?? 0,
      cacheCreationInputTokens: null,
      cacheReadInputTokens: cached || null,
    },
  };
}

const sleep = (s: number) => new Promise<void>((r) => setTimeout(r, Math.max(0, s * 1000)));
