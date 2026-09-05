/**
 * The Messages API, from the page.
 *
 * Anthropic serves CORS, and the SDK runs in a browser once told that the key is the user's own
 * and stays on their machine. Two things matter for this workload and are built in: the large,
 * byte-identical vision prompt goes in `system` with `cache_control`, so every photo after the
 * first reads it from cache instead of paying for it; and `stop_reason == "refusal"` is checked
 * before reading content.
 *
 * The SDK's own retries are switched off in favour of `RetryPolicy`, so what is retried and for
 * how long is one place, and testable.
 */

import Anthropic, { APIError, APIConnectionError, APIConnectionTimeoutError, APIUserAbortError } from "@anthropic-ai/sdk";
import type { MessageCreateParamsNonStreaming } from "@anthropic-ai/sdk/resources/messages";
import { RetryPolicy } from "./RetryPolicy";

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number | null;
  cacheReadInputTokens: number | null;
}

export interface Reply { text: string; usage: Usage; stopReason: string | null }

export class ClientError extends Error {
  constructor(public readonly kind: "refused" | "http" | "malformed", message: string, public readonly status?: number, public readonly category?: string | null) {
    super(message);
    this.name = "ClientError";
  }
}

export interface ClientOptions {
  apiKey: string;
  model: string;
  maxTokens?: number;
  /** `low` … `max`; pairs with adaptive thinking. */
  effort?: "low" | "medium" | "high" | "xhigh" | "max" | null;
  retry?: RetryPolicy;
  /** Called before each wait, so a long batch can show why it paused. */
  onRetry?: (attempt: number, wait: number, why: string) => void;
  /** For tests. */
  fetch?: typeof fetch;
}

export class AnthropicClient {
  readonly model: string;
  readonly maxTokens: number;
  readonly effort: ClientOptions["effort"];
  readonly retry: RetryPolicy;
  private readonly onRetry?: ClientOptions["onRetry"];
  private readonly sdk: Anthropic;

  constructor(opts: ClientOptions) {
    this.model = opts.model;
    this.maxTokens = opts.maxTokens ?? 2000;
    this.effort = opts.effort ?? null;
    this.retry = opts.retry ?? new RetryPolicy();
    this.onRetry = opts.onRetry;
    this.sdk = new Anthropic({
      apiKey: opts.apiKey,
      dangerouslyAllowBrowser: true,
      maxRetries: 0,
      timeout: 180_000,
      ...(opts.fetch ? { fetch: opts.fetch } : {}),
    });
  }

  /** One vision call: cached system prompt + image + per-photo context. */
  analyse(imageJPEG: Uint8Array, systemPrompt: string, context: string): Promise<Reply> {
    const params: MessageCreateParamsNonStreaming = {
      model: this.model,
      max_tokens: this.maxTokens,
      // The prompt is identical for every photo — cache it once, read it thereafter.
      system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
      messages: [{
        role: "user",
        // Image before text: the documented ordering for best results.
        content: [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: toBase64(imageJPEG) } },
          { type: "text", text: context },
        ],
      }],
    };
    if (this.effort) {
      params.output_config = { effort: this.effort };
      params.thinking = { type: "adaptive" };
    }
    return this.send(params);
  }

  /** A short single-image call with its own system instruction, for alt text. */
  describe(imageJPEG: Uint8Array, systemInstruction: string, userContent: string, maxTokens: number): Promise<Reply> {
    const params: MessageCreateParamsNonStreaming = {
      model: this.model,
      max_tokens: maxTokens,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: toBase64(imageJPEG) } },
          { type: "text", text: userContent },
        ],
      }],
    };
    if (systemInstruction) params.system = systemInstruction;
    return this.send(params);
  }

  /** A text-only call — no image. Used for roster extraction from a web page. */
  describeText(systemInstruction: string, userContent: string, maxTokens: number): Promise<Reply> {
    const params: MessageCreateParamsNonStreaming = {
      model: this.model,
      max_tokens: maxTokens,
      messages: [{ role: "user", content: userContent }],
    };
    if (systemInstruction) params.system = systemInstruction;
    return this.send(params);
  }

  private async send(params: MessageCreateParamsNonStreaming): Promise<Reply> {
    let attempt = 0;
    for (;;) {
      attempt += 1;
      try {
        return await this.sendOnce(params);
      } catch (e) {
        if (e instanceof APIUserAbortError) throw e;
        if (e instanceof APIError && typeof e.status === "number") {
          const retryAfter = retryAfterSeconds(e);
          const d = this.retry.decide(e.status, attempt, retryAfter);
          if (d.retry) { this.onRetry?.(attempt, d.after, `HTTP ${e.status}`); await sleep(d.after); continue; }
          throw new ClientError("http", d.reason, e.status);
        }
        if (e instanceof APIConnectionTimeoutError || e instanceof APIConnectionError) {
          const kind = e instanceof APIConnectionTimeoutError ? "timeout" : "network";
          const d = this.retry.decideTransport(kind, attempt);
          if (d.retry) { this.onRetry?.(attempt, d.after, kind); await sleep(d.after); continue; }
          throw new ClientError("http", d.reason);
        }
        throw e;
      }
    }
  }

  private async sendOnce(params: MessageCreateParamsNonStreaming): Promise<Reply> {
    const message = await this.sdk.messages.create(params);
    if (message.stop_reason === "refusal") {
      const details = (message as unknown as { stop_details?: { category?: string } }).stop_details;
      throw new ClientError("refused", "the model declined to describe this photograph", undefined, details?.category ?? null);
    }
    const text = message.content.filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text").map((b) => b.text).join("");
    const u = message.usage;
    return {
      text,
      stopReason: message.stop_reason ?? null,
      usage: {
        inputTokens: u.input_tokens,
        outputTokens: u.output_tokens,
        cacheCreationInputTokens: u.cache_creation_input_tokens ?? null,
        cacheReadInputTokens: u.cache_read_input_tokens ?? null,
      },
    };
  }
}

/** The server knows better than exponential backoff how long to wait. */
function retryAfterSeconds(e: APIError): number | null {
  const header = e.headers?.get?.("retry-after");
  if (header) { const n = Number(header); if (isFinite(n)) return n; }
  const body = typeof e.error === "object" && e.error ? JSON.stringify(e.error) : String(e.message ?? "");
  const m = /"retry_after"\s*:\s*([0-9.]+)/.exec(body);
  return m ? Number(m[1]) : null;
}

const sleep = (s: number) => new Promise<void>((r) => setTimeout(r, Math.max(0, s * 1000)));

/** Base64 for large buffers without blowing the call stack. */
export function toBase64(bytes: Uint8Array): string {
  const B = (globalThis as { Buffer?: { from(b: Uint8Array): { toString(enc: string): string } } }).Buffer;
  if (B) return B.from(bytes).toString("base64");
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  return btoa(binary);
}
