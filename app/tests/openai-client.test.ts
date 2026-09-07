// The chat-completions client, against a fake server: the request shape OpenAI and the local
// servers expect, the token counts read back, and which failures are retried. No key is spent.

import { describe, it, expect } from "vitest";
import { OpenAICompatibleClient } from "../src/core/models/OpenAICompatibleClient";
import { ClientError, toBase64 } from "../src/core/anthropic/AnthropicClient";
import { RetryPolicy } from "../src/core/anthropic/RetryPolicy";

type Call = { url: string; method: string; headers: Record<string, string>; body: Record<string, unknown> };

function fakeServer(responses: ((call: Call, n: number) => Response)[]) {
  const calls: Call[] = [];
  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const headers: Record<string, string> = {};
    new Headers(init?.headers as HeadersInit).forEach((v, k) => { headers[k] = v; });
    const body = init?.body ? JSON.parse(init.body as string) : {};
    const call = { url: String(input), method: init?.method ?? "GET", headers, body };
    calls.push(call);
    return responses[Math.min(calls.length - 1, responses.length - 1)](call, calls.length);
  };
  return { calls, fetch: fetchImpl as typeof fetch };
}

const ok = (text: string, extra: Record<string, unknown> = {}) => new Response(JSON.stringify({
  id: "chatcmpl-1", object: "chat.completion", model: "gpt-5.6-luna",
  choices: [{ index: 0, message: { role: "assistant", content: text }, finish_reason: "stop" }],
  usage: { prompt_tokens: 9500, completion_tokens: 80, prompt_tokens_details: { cached_tokens: 9000 } }, ...extra,
}), { status: 200, headers: { "content-type": "application/json" } });

const fail = (status: number, message = `status ${status}`, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify({ error: { message, type: "x" } }), { status, headers: { "content-type": "application/json", ...headers } });

const fast = new RetryPolicy(4, 0.001, 0.005, false);
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const hosted = (server: ReturnType<typeof fakeServer>, extra = {}) =>
  new OpenAICompatibleClient({ baseURL: "https://api.openai.com/v1", apiKey: "sk-test", model: "gpt-5.6-luna", fetch: server.fetch, retry: fast, ...extra });
const local = (server: ReturnType<typeof fakeServer>, extra = {}) =>
  new OpenAICompatibleClient({ baseURL: "http://localhost:11434/v1/", apiKey: null, model: "qwen3-vl:8b", maxTokensParam: "max_tokens", fetch: server.fetch, retry: fast, ...extra });

describe("The chat-completions client", () => {
  it("sends the vision request as OpenAI documents it, and reads the counts back", async () => {
    const server = fakeServer([() => ok('{"scene_type":"other"}')]);
    const reply = await hosted(server).analyse(jpeg, "SYSTEM PROMPT", "Sport: soccer");
    expect(reply.text).toBe('{"scene_type":"other"}');
    // Cached prompt tokens are reported apart from the rest, as the Anthropic client reports them.
    expect(reply.usage.inputTokens).toBe(500);
    expect(reply.usage.cacheReadInputTokens).toBe(9000);
    expect(reply.usage.outputTokens).toBe(80);
    const call = server.calls[0];
    expect(call.url).toBe("https://api.openai.com/v1/chat/completions");
    expect(call.method).toBe("POST");
    expect(call.headers["authorization"]).toBe("Bearer sk-test");
    expect(call.body.model).toBe("gpt-5.6-luna");
    expect(call.body.max_completion_tokens).toBe(2000);
    expect(call.body.max_tokens).toBeUndefined();
    expect(call.body.response_format).toEqual({ type: "json_object" });
    const messages = call.body.messages as { role: string; content: unknown }[];
    expect(messages[0]).toEqual({ role: "system", content: "SYSTEM PROMPT" });
    const parts = messages[1].content as { type: string; image_url?: { url: string }; text?: string }[];
    expect(parts[0].type).toBe("image_url");
    expect(parts[0].image_url?.url).toBe(`data:image/jpeg;base64,${toBase64(jpeg)}`);
    expect(parts[1]).toEqual({ type: "text", text: "Sport: soccer" });
  });
  it("speaks to a server on this Mac with no key and the older token parameter", async () => {
    const server = fakeServer([() => ok("hello")]);
    await local(server).describeText("EXTRACT", "Roster page text", 8000);
    const call = server.calls[0];
    expect(call.url).toBe("http://localhost:11434/v1/chat/completions");
    expect(call.headers["authorization"]).toBeUndefined();
    expect(call.body.max_tokens).toBe(8000);
    expect(call.body.max_completion_tokens).toBeUndefined();
    expect(call.body.response_format).toBeUndefined();
    expect((call.body.messages as { content: string }[])[1].content).toBe("Roster page text");
  });
  it("drops the JSON request once when a server does not know it, and remembers", async () => {
    const server = fakeServer([
      (c) => (c.body.response_format ? fail(400, "unknown field: response_format") : ok("{}")),
    ]);
    const client = local(server);
    await client.analyse(jpeg, "S", "C");
    await client.analyse(jpeg, "S", "C");
    expect(server.calls.length).toBe(3);
    expect(server.calls[0].body.response_format).toBeDefined();
    expect(server.calls[1].body.response_format).toBeUndefined();
    expect(server.calls[2].body.response_format).toBeUndefined();
  });
  it("fails fast on a rejected key, retries a rate limit, and honours retry-after", async () => {
    const bad = fakeServer([() => fail(401, "Incorrect API key provided")]);
    await expect(hosted(bad).describeText("S", "hi", 16)).rejects.toMatchObject({ status: 401 });
    expect(bad.calls.length).toBe(1);

    const waits: number[] = [];
    const limited = fakeServer([() => fail(429, "slow down", { "retry-after": "0.002" }), () => ok("after the wait")]);
    const reply = await hosted(limited, { onRetry: (_a: number, wait: number) => waits.push(wait) }).describeText("S", "hi", 16);
    expect(reply.text).toBe("after the wait");
    expect(waits).toEqual([0.002]);

    const dead = fakeServer([() => fail(500)]);
    await expect(hosted(dead).describeText("S", "hi", 16)).rejects.toBeInstanceOf(ClientError);
    expect(dead.calls.length).toBe(4);
  });
  it("tells a rejected key from a dead network when the error response has no CORS header", async () => {
    // OpenAI answers a bad key on the chat endpoint without access-control-allow-origin, so the
    // browser reports "failed to fetch"; its model list does carry the header and says 401.
    const server = fakeServer([
      (c) => { if (c.url.endsWith("/chat/completions")) throw new TypeError("Failed to fetch"); return fail(401, "Incorrect API key provided"); },
    ]);
    await expect(hosted(server).describeText("S", "hi", 16)).rejects.toMatchObject({ status: 401 });
    expect(server.calls.map((c) => c.url.split("/v1")[1])).toEqual(["/chat/completions", "/models"]);
    // A server on this Mac has no key to ask about: a network failure stays a network failure, retried.
    const down = fakeServer([() => { throw new TypeError("Failed to fetch"); }]);
    await expect(local(down).describeText("S", "hi", 16)).rejects.toThrow(/running/);
    expect(down.calls.length).toBe(4);
  });
  it("treats a content filter as a refusal and joins content that comes back in parts", async () => {
    const filtered = fakeServer([() => ok("", { choices: [{ index: 0, message: { role: "assistant", content: null }, finish_reason: "content_filter" }] })]);
    await expect(hosted(filtered).analyse(jpeg, "S", "C")).rejects.toMatchObject({ kind: "refused" });
    const parts = fakeServer([() => ok("", { choices: [{ index: 0, message: { role: "assistant", content: [{ type: "text", text: "{\"a\":" }, { type: "text", text: "1}" }] }, finish_reason: "stop" }] })]);
    expect((await hosted(parts).analyse(jpeg, "S", "C")).text).toBe('{"a":1}');
  });
  it("says when a server on this Mac cannot be reached, in terms of what to check", async () => {
    const down = fakeServer([() => { throw new TypeError("Failed to fetch"); }]);
    const r = await OpenAICompatibleClient.models("http://localhost:11434/v1", null, down.fetch);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/running.*origins/);
  });
  it("lists a server's models from the free list, and checks a key the same way", async () => {
    const list = () => new Response(JSON.stringify({ object: "list", data: [{ id: "qwen3-vl:8b", object: "model" }, { id: "llama3.2:3b", object: "model" }] }), { status: 200, headers: { "content-type": "application/json" } });
    const server = fakeServer([list]);
    const r = await OpenAICompatibleClient.models("http://localhost:11434/v1", null, server.fetch);
    expect(r).toEqual({ ok: true, models: ["qwen3-vl:8b", "llama3.2:3b"] });
    expect(server.calls[0].url).toBe("http://localhost:11434/v1/models");
    expect(server.calls[0].headers["authorization"]).toBeUndefined();

    const keyed = fakeServer([list]);
    expect(await OpenAICompatibleClient.verify("https://api.openai.com/v1", "sk-good", keyed.fetch)).toEqual({ ok: true });
    expect(keyed.calls[0].headers["authorization"]).toBe("Bearer sk-good");
    const rejected = fakeServer([() => fail(401)]);
    const v = await OpenAICompatibleClient.verify("https://api.openai.com/v1", "sk-bad", rejected.fetch);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toMatch(/not accepted/);
  });
});
