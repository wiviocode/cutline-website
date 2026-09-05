// The Messages client, against a fake server: the request shape the API expects, the prompt
// cache marker, refusal handling, and which failures are retried. No key is spent.

import { describe, it, expect } from "vitest";
import { AnthropicClient, ClientError, toBase64 } from "../src/core/anthropic/AnthropicClient";
import { RetryPolicy } from "../src/core/anthropic/RetryPolicy";

type Call = { url: string; headers: Record<string, string>; body: Record<string, unknown>; signal: AbortSignal | null };

function fakeServer(responses: ((call: Call, n: number) => Response)[]) {
  const calls: Call[] = [];
  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const headers: Record<string, string> = {};
    new Headers(init?.headers as HeadersInit).forEach((v, k) => { headers[k] = v; });
    const body = init?.body ? JSON.parse(init.body as string) : {};
    const call = { url: String(input), headers, body, signal: (init?.signal as AbortSignal | null | undefined) ?? null };
    calls.push(call);
    const handler = responses[Math.min(calls.length - 1, responses.length - 1)];
    return handler(call, calls.length);
  };
  return { calls, fetch: fetchImpl as typeof fetch };
}

const ok = (text: string, extra: Record<string, unknown> = {}) => new Response(JSON.stringify({
  id: "msg_1", type: "message", role: "assistant", model: "claude-opus-5",
  content: [{ type: "text", text }], stop_reason: "end_turn", stop_sequence: null,
  usage: { input_tokens: 1200, output_tokens: 80, cache_creation_input_tokens: 1100, cache_read_input_tokens: 0 }, ...extra,
}), { status: 200, headers: { "content-type": "application/json" } });

const fail = (status: number, headers: Record<string, string> = {}) => new Response(JSON.stringify({ type: "error", error: { type: "x", message: `status ${status}` } }), { status, headers: { "content-type": "application/json", ...headers } });

const fast = new RetryPolicy(4, 0.001, 0.005, false);
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

describe("The Messages client", () => {
  it("sends the vision request in the documented shape, with the prompt cached", async () => {
    const server = fakeServer([() => ok('{"scene_type":"other"}')]);
    const client = new AnthropicClient({ apiKey: "sk-test", model: "claude-opus-5", fetch: server.fetch, retry: fast });
    const reply = await client.analyse(jpeg, "SYSTEM PROMPT", "Sport: soccer");
    expect(reply.text).toBe('{"scene_type":"other"}');
    expect(reply.usage.inputTokens).toBe(1200);
    expect(reply.usage.cacheCreationInputTokens).toBe(1100);
    const call = server.calls[0];
    expect(call.url).toContain("/v1/messages");
    expect(call.headers["x-api-key"]).toBe("sk-test");
    expect(call.headers["anthropic-version"]).toBeTruthy();
    expect(call.body.model).toBe("claude-opus-5");
    const system = call.body.system as { type: string; text: string; cache_control: { type: string } }[];
    expect(system[0].text).toBe("SYSTEM PROMPT");
    expect(system[0].cache_control.type).toBe("ephemeral");
    const content = (call.body.messages as { content: { type: string; source?: { data: string; media_type: string }; text?: string }[] }[])[0].content;
    expect(content[0].type).toBe("image");
    expect(content[0].source?.media_type).toBe("image/jpeg");
    expect(content[0].source?.data).toBe(toBase64(jpeg));
    expect(content[1].text).toBe("Sport: soccer");
    expect(call.body.thinking).toBeUndefined();
  });
  it("adds adaptive thinking only when an effort is set", async () => {
    const server = fakeServer([() => ok("x")]);
    const client = new AnthropicClient({ apiKey: "k", model: "claude-opus-5", effort: "medium", fetch: server.fetch, retry: fast });
    await client.analyse(jpeg, "S", "C");
    expect(server.calls[0].body.thinking).toEqual({ type: "adaptive" });
    expect(server.calls[0].body.output_config).toEqual({ effort: "medium" });
  });
  it("treats a refusal as an error rather than a caption", async () => {
    const server = fakeServer([() => ok("", { stop_reason: "refusal", stop_details: { category: "x" } })]);
    const client = new AnthropicClient({ apiKey: "k", model: "claude-opus-5", fetch: server.fetch, retry: fast });
    await expect(client.analyse(jpeg, "S", "C")).rejects.toMatchObject({ kind: "refused" });
  });
  it("fails fast on a rejected key, retries a rate limit, and honours retry-after", async () => {
    const bad = fakeServer([() => fail(401)]);
    const c1 = new AnthropicClient({ apiKey: "k", model: "claude-opus-5", fetch: bad.fetch, retry: fast });
    await expect(c1.describeText("S", "hi", 16)).rejects.toMatchObject({ status: 401 });
    expect(bad.calls.length).toBe(1);

    const waits: number[] = [];
    const limited = fakeServer([() => fail(429, { "retry-after": "0.002" }), () => ok("after the wait")]);
    const c2 = new AnthropicClient({ apiKey: "k", model: "claude-opus-5", fetch: limited.fetch, retry: fast, onRetry: (_a, wait) => waits.push(wait) });
    const reply = await c2.describeText("S", "hi", 16);
    expect(reply.text).toBe("after the wait");
    expect(limited.calls.length).toBe(2);
    expect(waits).toEqual([0.002]);

    const flaky = fakeServer([() => fail(529), () => fail(500), () => ok("third time")]);
    const c3 = new AnthropicClient({ apiKey: "k", model: "claude-opus-5", fetch: flaky.fetch, retry: fast });
    expect((await c3.describeText("S", "hi", 16)).text).toBe("third time");
    expect(flaky.calls.length).toBe(3);

    const dead = fakeServer([() => fail(500)]);
    const c4 = new AnthropicClient({ apiKey: "k", model: "claude-opus-5", fetch: dead.fetch, retry: fast });
    await expect(c4.describeText("S", "hi", 16)).rejects.toBeInstanceOf(ClientError);
    expect(dead.calls.length).toBe(4);
  });
  it("sends a text-only request without an image block", async () => {
    const server = fakeServer([() => ok("[]")]);
    const client = new AnthropicClient({ apiKey: "k", model: "claude-haiku-4-5-20251001", maxTokens: 8000, fetch: server.fetch, retry: fast });
    await client.describeText("EXTRACT", "Roster page text", 8000);
    expect(server.calls[0].body.system).toBe("EXTRACT");
    expect(server.calls[0].body.max_tokens).toBe(8000);
    expect((server.calls[0].body.messages as { content: string }[])[0].content).toBe("Roster page text");
  });
  it("base64-encodes large buffers without blowing the stack", () => {
    const big = new Uint8Array(300_000).map((_, i) => i % 251);
    const b64 = toBase64(big);
    expect(b64.length).toBe(Math.ceil(big.length / 3) * 4);
    expect(Buffer.from(b64, "base64").equals(Buffer.from(big))).toBe(true);
  });
});

describe("Checking a key", () => {
  const models = () => new Response(JSON.stringify({ data: [{ id: "claude-opus-5", type: "model", display_name: "Opus", created_at: "2026-01-01T00:00:00Z" }], has_more: false, first_id: null, last_id: null }), { status: 200, headers: { "content-type": "application/json" } });
  it("uses the free model list and spends no tokens", async () => {
    const server = fakeServer([models]);
    expect(await AnthropicClient.verifyKey("sk-ant-good", server.fetch)).toEqual({ ok: true });
    expect(server.calls[0].url).toContain("/v1/models");
    expect(server.calls[0].headers["x-api-key"]).toBe("sk-ant-good");
  });
  it("says plainly why a key is refused", async () => {
    const server = fakeServer([() => fail(401)]);
    const r = await AnthropicClient.verifyKey("sk-ant-bad", server.fetch);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/not accepted/);
  });
  it("tells a network failure from a bad key", async () => {
    const server = fakeServer([() => { throw new TypeError("Failed to fetch"); }]);
    const r = await AnthropicClient.verifyKey("sk-ant-x", server.fetch);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/reach/);
  });
});

describe("Stopping", () => {
  it("hands the abort signal to every request", async () => {
    const server = fakeServer([() => ok("x")]);
    const controller = new AbortController();
    const client = new AnthropicClient({ apiKey: "k", model: "claude-opus-5", fetch: server.fetch, retry: fast, signal: controller.signal });
    await client.describeText("", "hello", 10);
    expect(server.calls[0].signal).toBeInstanceOf(AbortSignal);
  });
});
