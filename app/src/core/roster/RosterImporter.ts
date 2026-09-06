/**
 * Builds a roster from a team's public roster page.
 *
 * Athletics sites have no common markup — Nebraska is Next.js, a high-school site might be
 * WordPress, a Wix template, or a table someone hand-wrote in 2011. A fixed scraper would break
 * per school and per season. So the page is reduced to **visible text** and a model extracts the
 * rows, which is robust to markup it has never seen.
 *
 * One site is read without a model: MaxPreps embeds its roster as data, and `MaxPrepsRoster`
 * reads it straight off the page — instant, free, and with both of a two-way player's positions.
 * Every other site goes to the model.
 *
 * Reduction matters: `huskers.com/sports/soccer/roster` is 1 MB of HTML but 18 KB of text
 * (~4,500 tokens), so extraction costs about a cent.
 *
 * Fetching the page is the platform's job (a browser cannot fetch another site for itself).
 * Everything after the bytes arrive is here.
 */

import type { AnthropicClient, Usage } from "../anthropic/AnthropicClient";
import { CaptionResponseParser } from "../vision/CaptionResponseParser";
import { MaxPrepsRoster } from "./MaxPrepsRoster";
import { Positions } from "./Positions";

export interface ImportedPlayer {
  jerseyNumber: string;
  firstName: string;
  lastName: string;
  /** Full lowercase word: "running back". The first position listed. */
  position: string;
  classYear?: string | null;
  /**
   * "offense", "defense" or "specialTeams" where the source says so or the position implies it.
   * Football rosters routinely reuse a number across the two units, and the composer resolves
   * that from the play — but only if it knows which side each player is on.
   */
  side?: string | null;
  /** A two-way player's other position, on the other unit — the "MLB" of "RB, MLB". */
  secondaryPosition?: string | null;
  secondarySide?: string | null;
}

export type ImportSource = "structured" | "visibleText" | "scriptPayload";

export class ImportError extends Error {
  constructor(public readonly kind: "fetchFailed" | "emptyPage" | "noPlayersFound", detail = "") {
    super(kind === "fetchFailed" ? `Could not load that page: ${detail}`
      : kind === "emptyPage" ? "That page came back empty. Check the link opens in a browser."
      : `No names and numbers could be read from that page. ${detail}`.trim());
    this.name = "ImportError";
  }
}

/**
 * Same discipline as the vision prompt: structured rows only, never prose, never invent a player.
 * Rows are arrays rather than objects — the same roster in a third fewer output tokens, which is
 * most of what the import's wait is.
 */
export const EXTRACTION_PROMPT = `You are extracting a sports team roster from the visible text of a team's roster web page.

Return ONLY a JSON array of rows. No prose, no markdown fences, no commentary.

Each row is an array of exactly six strings, in this order:
  [jerseyNumber, firstName, lastName, positions, classYear, unit]

  jerseyNumber  as printed; keep leading zeros; "" if the page shows none
  firstName     "Alessandra"
  lastName      "Geraneo"
  positions     the position abbreviations exactly as the page prints them, every one of them,
                separated by ", " — "GK", "MF/D" becomes "MF, D", "RB, MLB" stays "RB, MLB".
                Do not expand abbreviations and do not drop a second position.
  classYear     "Sophomore", "Sr.", "12" — as printed; "" if absent
  unit          for American football ONLY, and only when the page groups players by unit
                (an "Offense" heading, a "Defense" heading): "offense", "defense" or
                "specialTeams". Otherwise "".

Example: [["9", "Alessandra", "Geraneo", "MF", "Sophomore", ""], ["2", "Sam", "Mundt", "RB, MLB", "Sr.", ""]]

Rules:
- Include every player on the page, in the order listed.
- Do NOT invent players, numbers, or positions. If a jersey number is genuinely absent from
  the page, use "" rather than guessing.
- Ignore coaches, staff, navigation, schedules, news and sponsor text.`;

export const RosterImporter = {
  /** Some athletics sites serve a stub to unknown agents. */
  userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36",

  /**
   * Remove scripts, styles and tags; collapse whitespace.
   *
   * `[\s\S]` rather than `.`: `.` alone stops at a newline, which leaves multi-line `<script>`
   * blocks in place. That is a real hazard — a page once appeared to extract from "visible text"
   * when it was in fact reading an unstripped RSC payload.
   */
  strip(html: string): string {
    let s = html;
    for (const tag of ["script", "style", "noscript", "svg"]) {
      s = s.replace(new RegExp(`<${tag}[^>]*>[\\s\\S]*?</${tag}>`, "gi"), " ");
    }
    s = s.replace(/<!--[\s\S]*?-->/g, " ");
    s = s.replace(/<[^>]+>/g, " ");
    s = s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, "\"");
    return s.replace(/\s+/g, " ").trim();
  },

  /**
   * Readable text recovered from embedded script payloads. Modern athletics sites are React/Next
   * apps that stream their data as JSON inside `<script>` blocks. The roster is genuinely present
   * — just not in the rendered HTML — so this flattens JSON punctuation to whitespace and keeps
   * the words and numbers, which is all the extraction model needs.
   */
  payloadText(html: string): string {
    const chunks: string[] = [];
    const re = /<script[^>]*>([\s\S]*?)<\/script>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html))) {
      const body = m[1];
      // Only payloads worth reading: sizeable, and carrying quoted strings.
      if (body.length > 400 && body.includes("\"")) chunks.push(body);
    }
    let s = chunks.join(" ");
    s = s.replace(/\\"/g, " ");
    s = s.replace(/[{}[\]",:;]/g, " ");
    s = s.replace(/\\u[0-9a-fA-F]{4}/g, " ");
    return s.replace(/\s+/g, " ").trim();
  },

  /** Text that is mostly site chrome — a shell whose data has not arrived — looks like this. */
  looksLikeEmptyShell(text: string): boolean {
    const digits = (text.match(/\d/g) ?? []).length;
    return text.length < 8_000 || digits < 60;
  },

  /** Extract players from already-fetched text. */
  async extract(text: string, client: AnthropicClient, sport = ""): Promise<ImportedPlayer[]> {
    return (await RosterImporter.extractWithUsage(text, client, sport)).players;
  },

  /** The same, with what the call cost in tokens, so the import can say so. */
  async extractWithUsage(text: string, client: AnthropicClient, sport = ""): Promise<{ players: ImportedPlayer[]; usage: Usage }> {
    const clipped = text.slice(0, 120_000);
    const reply = await client.describeText(EXTRACTION_PROMPT, `Roster page text:\n\n${clipped}`, 8000);
    const players = RosterImporter.decode(reply.text, sport);
    return { players, usage: reply.usage };
  },

  /**
   * Rows out of the model's reply — arrays as asked for, or the objects an older prompt asked
   * for, since a record saved by an earlier build may still be replayed through here.
   */
  decode(replyText: string, sport = ""): ImportedPlayer[] {
    const unwrapped = CaptionResponseParser.unwrapFence(replyText);
    let parsed: unknown;
    try { parsed = JSON.parse(unwrapped); }
    catch {
      const start = unwrapped.indexOf("["), end = unwrapped.lastIndexOf("]");
      if (start < 0 || end <= start) throw new ImportError("noPlayersFound", unwrapped.slice(0, 200));
      try { parsed = JSON.parse(unwrapped.slice(start, end + 1)); }
      catch { throw new ImportError("noPlayersFound", unwrapped.slice(0, 200)); }
    }
    if (!Array.isArray(parsed) || parsed.length === 0) throw new ImportError("noPlayersFound", unwrapped.slice(0, 200));
    const str = (v: unknown) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim());
    const players: ImportedPlayer[] = [];
    for (const row of parsed) {
      let jersey = "", first = "", last = "", positions = "", classYear = "", unit = "";
      if (Array.isArray(row)) {
        [jersey, first, last, positions, classYear, unit] = [0, 1, 2, 3, 4, 5].map((i) => str(row[i]));
      } else if (row && typeof row === "object") {
        const q = row as Record<string, unknown>;
        jersey = str(q.jerseyNumber); first = str(q.firstName); last = str(q.lastName);
        positions = [str(q.position), str(q.secondaryPosition)].filter(Boolean).join(", ");
        classYear = str(q.classYear); unit = str(q.side ?? q.unit);
      } else continue;
      if (!first && !last) continue;
      const parsed = Positions.parse(positions, sport);
      const unitSide = unit === "offense" || unit === "defense" || unit === "specialTeams" ? unit : null;
      players.push({
        jerseyNumber: jersey, firstName: first, lastName: last,
        position: parsed.position,
        side: unitSide ?? (parsed.side === "unknown" ? null : parsed.side),
        secondaryPosition: parsed.secondary?.position ?? null,
        secondarySide: parsed.secondary?.side ?? null,
        classYear: classYear || null,
      });
    }
    if (players.length === 0) throw new ImportError("noPlayersFound", unwrapped.slice(0, 200));
    return players;
  },

  /**
   * Import a roster from a page's HTML, escalating only as far as necessary: the page's own data
   * where a site embeds it, then visible text for server-rendered pages, then the script payload
   * for React/Next sites that embed their data less tidily. Each step costs more than the last,
   * so the cheapest sufficient one wins.
   */
  async importRoster(html: string, client: AnthropicClient, onEscalate?: (source: ImportSource) => void, sport = ""):
    Promise<{ players: ImportedPlayer[]; source: ImportSource; usage: Usage }> {
    const none: Usage = { inputTokens: 0, outputTokens: 0, cacheCreationInputTokens: null, cacheReadInputTokens: null };
    const structured = MaxPrepsRoster.parse(html, sport);
    if (structured) return { players: structured, source: "structured", usage: none };

    const plain = RosterImporter.strip(html);
    let spent: Usage = none;
    const add = (u: Usage) => { spent = { ...spent, inputTokens: spent.inputTokens + u.inputTokens, outputTokens: spent.outputTokens + u.outputTokens }; };
    if (!RosterImporter.looksLikeEmptyShell(plain)) {
      try {
        const { players, usage } = await RosterImporter.extractWithUsage(plain, client, sport);
        add(usage);
        if (players.length) return { players, source: "visibleText", usage: spent };
      } catch (e) {
        // Only "nothing found" earns the costlier second attempt. A rejected key, a rate limit or
        // a network failure would fail again, larger.
        if (!(e instanceof ImportError)) throw e;
      }
    }
    const payload = RosterImporter.payloadText(html);
    if (payload) {
      onEscalate?.("scriptPayload");
      // Keep the visible text as context — headings and labels help the model.
      const combined = plain + "\n\n" + payload.slice(0, 150_000);
      const { players, usage } = await RosterImporter.extractWithUsage(combined, client, sport);
      add(usage);
      if (players.length) return { players, source: "scriptPayload", usage: spent };
    }
    throw new ImportError("noPlayersFound", "no roster found in the page's text or its embedded data");
  },
};
