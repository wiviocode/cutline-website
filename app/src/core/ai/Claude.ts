/**
 * Every call Cutline makes to Claude, in one place.
 *
 * The same code runs in the photographer's browser (with their own key, straight to
 * api.anthropic.com) and in the evaluation harness under Node. Each call uses structured
 * outputs, so a reply is valid JSON of the expected shape or it is an error — never prose to be
 * scraped.
 */

import Anthropic from "@anthropic-ai/sdk";
import { MODELS, Usage } from "./Models";
import { Observation, OBSERVATION_SCHEMA, cleanNumber } from "../vision/Observation";

export interface SentImage {
  /** Base64 JPEG. */
  data: string;
  width: number;
  height: number;
}

export class ClaudeError extends Error {
  constructor(message: string, readonly kind: "auth" | "rate" | "overloaded" | "refusal" | "truncated" | "network" | "bad-request" | "other", readonly retryable: boolean) {
    super(message);
    this.name = "ClaudeError";
  }
}

export interface ExtractedRoster {
  school: string;
  nickname: string;
  players: { number: string; first: string; last: string; position: string; year: string }[];
  coaches: { first: string; last: string; title: string }[];
}

export interface TeamGuess { school: string; nickname: string; colors: string[] }

export class Claude {
  private client: Anthropic;

  /** Evaluation only: run every model with adaptive thinking at this effort instead of its default. */
  private thinkingEffort: "low" | "medium" | null;

  constructor(apiKey: string, options: { browser?: boolean; maxRetries?: number; thinkingEffort?: "low" | "medium" } = {}) {
    this.client = new Anthropic({ apiKey, dangerouslyAllowBrowser: options.browser ?? false, maxRetries: options.maxRetries ?? 3 });
    this.thinkingEffort = options.thinkingEffort ?? null;
  }

  /** Whether the key works — a free call that lists models. */
  async verify(): Promise<{ ok: true } | { ok: false; reason: string }> {
    try {
      await this.client.models.list({ limit: 1 });
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: describe(e).message };
    }
  }

  /** Read one photograph. The system prompt carries the shoot and is cached. */
  async observe(req: { model: string; system: string; image: SentImage; text: string }): Promise<{ observation: Observation; usage: Usage }> {
    const reply = await this.structured({
      model: req.model,
      system: req.system,
      maxTokens: 2000,
      content: [imageBlock(req.image), { type: "text", text: req.text }],
      schema: OBSERVATION_SCHEMA,
    });
    return { observation: Observation.fromJSON(reply.json), usage: reply.usage };
  }

  /** A close crop of one athlete, when the first look could not settle their number. */
  async readNumber(req: { model: string; image: SentImage; sport: string; team: string; candidates: string[] }): Promise<{ number: string; clarity: "clear" | "partial" | "hidden"; usage: Usage }> {
    const reply = await this.structured({
      model: req.model,
      maxTokens: 300,
      system: "You read jersey numbers in close crops of sports photographs. Report only digits you can see; never supply a digit that is hidden or blurred.",
      content: [
        imageBlock(req.image),
        { type: "text", text: `A close crop of the main athlete from a ${req.sport} photograph${req.team ? `, playing for ${req.team}` : ""}. What number is on their jersey (chest, back, shorts or sleeve)? Numbers on this team's roster: ${req.candidates.join(", ") || "unknown"}. The roster only helps you choose between two readings the image genuinely allows; if the digits you see match none of them, report what you see. Write "?" for a digit you can tell is there but cannot read ("1?"). clarity is "clear" when every digit is plain, "partial" when some digit is hidden or ambiguous, "hidden" when none is visible (number "").` },
      ],
      schema: {
        type: "object", additionalProperties: false, required: ["number", "clarity"],
        properties: { number: { type: "string" }, clarity: { type: "string", enum: ["clear", "partial", "hidden"] } },
      },
    });
    const j = reply.json as { number?: string; clarity?: string };
    const number = cleanNumber(String(j.number ?? ""));
    const clarity = j.clarity === "clear" || j.clarity === "partial" ? j.clarity : "hidden";
    return { number, clarity: number ? clarity : "hidden", usage: reply.usage };
  }

  /**
   * What each team is wearing today, from a few frames of the shoot — the strongest cue the
   * reading of every photograph has for telling the sides apart.
   */
  async scoutUniforms(req: { model: string; images: SentImage[]; sport: string; teamA: string; teamB: string; colorsA: string; colorsB: string }): Promise<{ a: string; b: string; usage: Usage }> {
    const content: Anthropic.ContentBlockParam[] = [];
    req.images.forEach((img, i) => { content.push({ type: "text", text: `Photo ${i + 1}:` }, imageBlock(img)); });
    content.push({ type: "text", text: `These photographs are from one ${req.sport} game between ${req.teamA} (school colours: ${req.colorsA || "unknown"}) and ${req.teamB} (school colours: ${req.colorsB || "unknown"}). Describe what each team's players are wearing in these photographs, in a short phrase a person could use to tell the teams apart at a glance: jersey colour, number colour, and anything distinctive (helmet, pants, lettering, a libero or goalkeeper in another colour). Use lettering on the uniforms and the school colours to decide which team is which. If a team does not appear, give "" for it.` });
    const reply = await this.structured({
      model: req.model,
      maxTokens: 400,
      content,
      schema: { type: "object", additionalProperties: false, required: ["team_a", "team_b"], properties: { team_a: { type: "string" }, team_b: { type: "string" } } },
    });
    const j = reply.json as { team_a?: string; team_b?: string };
    return { a: String(j.team_a ?? "").trim(), b: String(j.team_b ?? "").trim(), usage: reply.usage };
  }

  /** A roster from a page's text, a screenshot or a PDF — for sites with no data to read directly. */
  async extractRoster(req: { model: string; sport: string; text?: string; image?: SentImage; pdf?: string }): Promise<{ roster: ExtractedRoster; usage: Usage }> {
    const content: Anthropic.ContentBlockParam[] = [];
    if (req.image) content.push(imageBlock(req.image));
    if (req.pdf) content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: req.pdf } });
    content.push({ type: "text", text: `${req.text ? `Roster page text:\n\n${req.text}\n\n` : ""}Extract the ${req.sport} roster: every player listed, in order, with the jersey number exactly as printed ("" if none), first and last name, position as printed (keep abbreviations, keep both positions of a two-way player, e.g. "RB/LB"), and class year as printed. List the coaches and staff the page shows separately, each with their title as printed ("Head Coach", "Assistant Coach"); none if it shows none. Ignore navigation, schedules, news and sponsors. Do not invent anyone. Also give the school's name as a newspaper would write it on first reference (e.g. "Nebraska", "Bowling Green", "Waverly") and its team nickname if the page shows it, else "".` });
    const reply = await this.structured({
      model: req.model,
      maxTokens: 16000,
      content,
      schema: {
        type: "object", additionalProperties: false, required: ["school", "nickname", "players", "coaches"],
        properties: {
          school: { type: "string" }, nickname: { type: "string" },
          players: { type: "array", items: { type: "object", additionalProperties: false, required: ["number", "first", "last", "position", "year"],
            properties: { number: { type: "string" }, first: { type: "string" }, last: { type: "string" }, position: { type: "string" }, year: { type: "string" } } } },
          coaches: { type: "array", items: { type: "object", additionalProperties: false, required: ["first", "last", "title"],
            properties: { first: { type: "string" }, last: { type: "string" }, title: { type: "string" } } } },
        },
      },
    });
    const j = reply.json as Partial<ExtractedRoster>;
    return { roster: { school: String(j.school ?? ""), nickname: String(j.nickname ?? ""), players: Array.isArray(j.players) ? j.players : [], coaches: Array.isArray(j.coaches) ? j.coaches : [] }, usage: reply.usage };
  }

  /** A college's caption name, nickname and colours from its athletics site's name. */
  async identifyTeam(req: { model: string; siteName: string; url: string; sport: string }): Promise<{ team: TeamGuess; usage: Usage }> {
    const reply = await this.structured({
      model: req.model,
      maxTokens: 200,
      content: [{ type: "text", text: `A college ${req.sport} roster page, from the site "${req.siteName}" at ${req.url}. How does a newspaper name this school on first reference (AP style, e.g. "Nebraska", "Bowling Green", "North Carolina", "Indiana"), what is its athletics nickname (e.g. "Cornhuskers", "Falcons", "Tar Heels"), and what are its primary colours as plain colour words? If you are not confident, give "" rather than guess.` }],
      schema: { type: "object", additionalProperties: false, required: ["school", "nickname", "colors"], properties: { school: { type: "string" }, nickname: { type: "string" }, colors: { type: "array", items: { type: "string" } } } },
    });
    const j = reply.json as Partial<TeamGuess>;
    return { team: { school: String(j.school ?? ""), nickname: String(j.nickname ?? ""), colors: Array.isArray(j.colors) ? j.colors.map(String) : [] }, usage: reply.usage };
  }

  // ------------------------------------------------------------------------------------------

  private async structured(req: { model: string; system?: string; maxTokens: number; content: Anthropic.ContentBlockParam[]; schema: object }): Promise<{ json: unknown; usage: Usage }> {
    const m = MODELS[req.model];
    const params: Record<string, unknown> = {
      model: req.model,
      max_tokens: req.maxTokens,
      messages: [{ role: "user", content: req.content }],
      output_config: { format: { type: "json_schema", schema: req.schema } },
    };
    if (req.system) params.system = [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }];
    if (this.thinkingEffort && m?.thinking !== "none") {
      params.thinking = { type: "adaptive" };
      (params.output_config as Record<string, unknown>).effort = this.thinkingEffort;
      params.max_tokens = Math.max(req.maxTokens, 8000);
    } else if (m?.thinking === "disabled") params.thinking = { type: "disabled" };
    else if (m && typeof m.thinking === "object") (params.output_config as Record<string, unknown>).effort = m.thinking.effort;

    let message: Anthropic.Message;
    try {
      message = (await this.client.messages.create(params as unknown as Anthropic.MessageCreateParamsNonStreaming)) as Anthropic.Message;
    } catch (e) {
      throw describe(e);
    }
    const usage = Usage.fromAPI(message.usage);
    if (message.stop_reason === "refusal") throw Object.assign(new ClaudeError("The model declined to read this photograph.", "refusal", false), { usage });
    if (message.stop_reason === "max_tokens") throw Object.assign(new ClaudeError("The reply was cut off before it finished.", "truncated", true), { usage });
    const text = message.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("");
    try {
      return { json: JSON.parse(text), usage };
    } catch {
      throw Object.assign(new ClaudeError("The reply was not valid JSON.", "other", true), { usage });
    }
  }
}

function imageBlock(img: SentImage): Anthropic.ImageBlockParam {
  return { type: "image", source: { type: "base64", media_type: "image/jpeg", data: img.data } };
}

/** The SDK's typed errors, in the words the app shows. */
export function describe(e: unknown): ClaudeError {
  if (e instanceof ClaudeError) return e;
  if (e instanceof Anthropic.AuthenticationError) return new ClaudeError("Anthropic rejected the API key.", "auth", false);
  if (e instanceof Anthropic.PermissionDeniedError) return new ClaudeError("This API key is not allowed to use that model.", "auth", false);
  if (e instanceof Anthropic.RateLimitError) return new ClaudeError("Rate limited by Anthropic — slowing down.", "rate", true);
  if (e instanceof Anthropic.BadRequestError) {
    const msg = (e as { message?: string }).message ?? "";
    if (/credit balance/i.test(msg)) return new ClaudeError("The Anthropic account is out of credit.", "auth", false);
    return new ClaudeError(`Anthropic refused the request: ${msg.replace(/^\d+\s*/, "").slice(0, 200)}`, "bad-request", false);
  }
  if (e instanceof Anthropic.InternalServerError) {
    const status = (e as { status?: number }).status;
    return new ClaudeError(status === 529 ? "Anthropic is overloaded — retrying." : "Anthropic had a server error — retrying.", "overloaded", true);
  }
  if (e instanceof Anthropic.APIConnectionError) return new ClaudeError("Could not reach Anthropic. Check the connection.", "network", true);
  if (e instanceof Anthropic.APIError) return new ClaudeError((e as Error).message, "other", true);
  return new ClaudeError(e instanceof Error ? e.message : String(e), "other", false);
}
