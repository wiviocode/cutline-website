/**
 * Builds a roster from a team's public roster page.
 *
 * Athletics sites have no common markup — Nebraska is Next.js, a high-school site might be
 * WordPress, a Wix template, or a table someone hand-wrote in 2011. A fixed scraper would break
 * per school and per season. So the page is reduced to **visible text** and a model extracts the
 * rows, which is robust to markup it has never seen.
 *
 * Reduction matters: `huskers.com/sports/soccer/roster` is 1 MB of HTML but 18 KB of text
 * (~4,500 tokens), so extraction costs about a cent.
 *
 * Fetching the page is the platform's job (a browser cannot fetch another site for itself).
 * Everything after the bytes arrive is here.
 */

import type { AnthropicClient } from "../anthropic/AnthropicClient";
import { CaptionResponseParser } from "../vision/CaptionResponseParser";

export interface ImportedPlayer {
  jerseyNumber: string;
  firstName: string;
  lastName: string;
  position: string;
  classYear?: string | null;
  /**
   * "offense", "defense" or "specialTeams" where the source says so. Football rosters routinely
   * reuse a number across the two units, and the composer resolves that from the action verb —
   * but only if it knows which side each player is on.
   */
  side?: string | null;
}

export type ImportSource = "visibleText" | "scriptPayload";

export class ImportError extends Error {
  constructor(public readonly kind: "fetchFailed" | "emptyPage" | "noPlayersFound", detail = "") {
    super(kind === "fetchFailed" ? `Could not load that page: ${detail}`
      : kind === "emptyPage" ? "That page came back empty. Check the link opens in a browser."
      : `No names and numbers could be read from that page. ${detail}`.trim());
    this.name = "ImportError";
  }
}

/** Same discipline as the vision prompt: structured rows only, never prose, never invent a player. */
export const EXTRACTION_PROMPT = `You are extracting a sports team roster from the visible text of a team's roster web page.

Return ONLY a JSON array. No prose, no markdown fences, no commentary.

Each element:
{
  "jerseyNumber": "9",          // as printed; keep leading zeros; "" if the page shows none
  "firstName": "Alessandra",
  "lastName": "Geraneo",
  "position": "midfielder",     // lowercase full word: goalkeeper, defender, midfielder,
                                // forward, quarterback, guard, forward, center, …
  "classYear": "Sophomore"      // optional; omit if absent
}

Rules:
- Include every player on the page, in the order listed.
- Expand position abbreviations to full lowercase words: GK -> goalkeeper, D -> defender,
  MF -> midfielder, F -> forward, QB -> quarterback, RB -> running back, WR -> wide receiver,
  G -> guard, C -> center. For a dual position such as "MF/D" use the first: "midfielder".
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
  async extract(text: string, client: AnthropicClient): Promise<ImportedPlayer[]> {
    const clipped = text.slice(0, 120_000);
    const reply = await client.describeText(EXTRACTION_PROMPT, `Roster page text:\n\n${clipped}`, 8000);
    const unwrapped = CaptionResponseParser.unwrapFence(reply.text);
    let parsed: unknown;
    try { parsed = JSON.parse(unwrapped); }
    catch {
      const start = unwrapped.indexOf("["), end = unwrapped.lastIndexOf("]");
      if (start < 0 || end <= start) throw new ImportError("noPlayersFound", unwrapped.slice(0, 200));
      try { parsed = JSON.parse(unwrapped.slice(start, end + 1)); }
      catch { throw new ImportError("noPlayersFound", unwrapped.slice(0, 200)); }
    }
    if (!Array.isArray(parsed) || parsed.length === 0) throw new ImportError("noPlayersFound", unwrapped.slice(0, 200));
    const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
    const players = parsed.filter((p) => p && typeof p === "object").map((p) => {
      const q = p as Record<string, unknown>;
      return {
        jerseyNumber: str(q.jerseyNumber), firstName: str(q.firstName), lastName: str(q.lastName),
        position: str(q.position), classYear: q.classYear == null ? null : str(q.classYear), side: q.side == null ? null : str(q.side),
      } as ImportedPlayer;
    });
    if (players.length === 0) throw new ImportError("noPlayersFound", unwrapped.slice(0, 200));
    return players;
  },

  /**
   * Import a roster from a page's HTML, escalating only as far as necessary: visible text for
   * server-rendered pages, then the script payload for React/Next sites that embed their data.
   * Each step costs more than the last, so the cheapest sufficient one wins.
   */
  async importRoster(html: string, client: AnthropicClient, onEscalate?: (source: ImportSource) => void):
    Promise<{ players: ImportedPlayer[]; source: ImportSource }> {
    const plain = RosterImporter.strip(html);
    if (!RosterImporter.looksLikeEmptyShell(plain)) {
      try {
        const players = await RosterImporter.extract(plain, client);
        if (players.length) return { players, source: "visibleText" };
      } catch { /* fall through to the payload */ }
    }
    const payload = RosterImporter.payloadText(html);
    if (payload) {
      onEscalate?.("scriptPayload");
      // Keep the visible text as context — headings and labels help the model.
      const combined = plain + "\n\n" + payload.slice(0, 150_000);
      const players = await RosterImporter.extract(combined, client);
      if (players.length) return { players, source: "scriptPayload" };
    }
    throw new ImportError("noPlayersFound", "no roster found in the page's text or its embedded data");
  },
};
