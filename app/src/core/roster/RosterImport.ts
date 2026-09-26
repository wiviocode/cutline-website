/**
 * From whatever the photographer pastes — a team link, a roster link, a page's text, a
 * screenshot, a PDF or a CSV — to a team with a roster.
 *
 * The cheapest sufficient path wins. A link is turned into roster addresses to try (a MaxPreps
 * team page becomes its sport's roster for the right gender; a college athletics home page
 * becomes /sports/<sport>/roster). A page with embedded roster data is read exactly, for free.
 * Anything else is reduced to text and read by Haiku — about a cent. A college page's data
 * carries no nickname or colours, so a second tiny call names the team.
 */

import type { Claude, SentImage } from "../ai/Claude";
import { Cost, TEXT_MODEL, Usage } from "../ai/Models";
import { Sports, type Gender, type LevelKind, type SportID } from "../sports/Sports";
import { Player, Staff, Team } from "./Roster";
import { Positions } from "./Positions";
import { RosterPages, dedupe, type RosterSource, type TeamIdentity } from "./RosterPages";
import { CSVRosterImporter } from "./CSVRosterImporter";

export interface FetchedPage { url: string; text: string }
export type PageFetcher = (url: string) => Promise<FetchedPage>;

export interface ImportRequest {
  sport: SportID;
  gender: Gender;
  level: LevelKind;
}

export interface ImportResult {
  team: Team;
  source: RosterSource;
  /** Where the roster was read from. */
  url: string | null;
  dollars: number;
  /** Things the photographer should know: "the page says Boys", "no numbers on 3 players". */
  notes: string[];
}

export class RosterImportError extends Error {
  /** When several addresses are tried, the most telling failure is the one reported. */
  constructor(message: string, readonly weight = 0) { super(message); this.name = "RosterImportError"; }
}

export const RosterImport = {
  /** Roster addresses to try for a pasted link, best first. */
  candidates(input: string, req: ImportRequest): string[] {
    let text = input.trim();
    if (!text) return [];
    if (!/^https?:\/\//i.test(text)) text = `https://${text}`;
    let url: URL;
    try { url = new URL(text); } catch { return []; }
    const host = url.hostname.toLowerCase();
    const parts = url.pathname.split("/").filter(Boolean);
    const sport = Sports.find(req.sport);
    if (!sport) return [url.toString()];

    if (host.endsWith("maxpreps.com")) {
      // A roster link as pasted, perhaps for one season (/basketball/girls/25-26/roster/), is read as is.
      if (parts.length < 3 || parts.includes("roster")) return [url.toString()];
      const base = `https://www.maxpreps.com/${parts.slice(0, 3).join("/")}/${sport.maxPreps}`;
      // Boys is MaxPreps' unmarked default for most sports and girls for volleyball and softball;
      // the page states its own gender, which is checked after reading.
      const girlsFirst = req.gender === "womens";
      const plain = `${base}/roster/`, girls = `${base}/girls/roster/`, boys = `${base}/boys/roster/`;
      if (sport.id === "volleyball" || sport.id === "softball") return girlsFirst ? [plain, girls] : [boys, plain];
      return girlsFirst ? [girls, plain] : [plain, boys];
    }

    if (url.pathname.toLowerCase().includes("/roster")) return [url.toString()];
    const i = parts.indexOf("sports");
    const origin = `${url.protocol}//${url.host}`;
    if (i >= 0 && i + 1 < parts.length) return [`${origin}/sports/${parts[i + 1]}/roster`];
    // A college athletics home page: the platforms share one path grammar.
    if (parts.length === 0) return sport.collegeSlugs[req.gender].map((slug) => `${origin}/sports/${slug}/roster`);
    return [url.toString()];
  },

  /** Read a team from a link, trying each address in turn. */
  async fromLink(input: string, req: ImportRequest, fetch: PageFetcher, claude: Claude | null): Promise<ImportResult> {
    const urls = RosterImport.candidates(input, req);
    if (!urls.length) throw new RosterImportError("That doesn't look like a link.");
    let lastError = "", lastWeight = -1;
    const failed = (e: unknown) => {
      const weight = e instanceof RosterImportError ? e.weight : 0;
      if (weight >= lastWeight) { lastError = (e as Error).message; lastWeight = weight; }
    };
    const tryAll = async (list: string[]) => {
      for (const url of list) {
        let page: FetchedPage;
        try { page = await fetch(url); } catch (e) { failed(e); continue; }
        const result = await RosterImport.fromHTML(page.text, page.url || url, req, claude).catch((e) => { failed(e); return null; });
        if (result) return withMaxPrepsStaff(result, fetch);
      }
      return null;
    };
    const first = await tryAll(urls);
    if (first) return first;
    // MaxPreps files a sport played out of its usual season under a season segment —
    // Nebraska's fall softball is /softball/fall/. The team's own page links to it.
    const seasonal = await RosterImport.maxPrepsSeasonal(input, req, fetch).catch(() => []);
    const second = seasonal.length ? await tryAll(seasonal.filter((u) => !urls.includes(u))) : null;
    if (second) return second;
    throw new RosterImportError(lastError || "No roster found at that link.");
  },

  /** Roster addresses taken from a MaxPreps team page's own links to the sport. */
  async maxPrepsSeasonal(input: string, req: ImportRequest, fetch: PageFetcher): Promise<string[]> {
    let url: URL;
    try { url = new URL(/^https?:\/\//i.test(input.trim()) ? input.trim() : `https://${input.trim()}`); } catch { return []; }
    if (!url.hostname.toLowerCase().endsWith("maxpreps.com")) return [];
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length < 3) return [];
    const teamPath = `/${parts.slice(0, 3).join("/")}`;
    const slug = Sports.info(req.sport).maxPreps;
    const home = await fetch(`https://www.maxpreps.com${teamPath}/`);
    const re = new RegExp(`${teamPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/${slug}/([a-z/-]*)`, "g");
    const paths = new Set<string>();
    for (const m of home.text.matchAll(re)) paths.add(`${teamPath}/${slug}/${m[1].replace(/roster\/?$/, "")}`.replace(/\/+$/, "/"));
    const wanted = req.gender === "womens" ? /girls/ : /boys/;
    const other = req.gender === "womens" ? /boys/ : /girls/;
    // Varsity first: JV, freshman and reserve rosters only when nothing else is linked.
    const lower = /\/(jv|junior-varsity|freshman|fresh|reserve|c-team|sophomore)\b/;
    const score = (p: string) => (lower.test(p) ? 0 : 2) + (wanted.test(p) ? 1 : 0);
    return [...paths].filter((p) => !other.test(p) && !/\/(schedule|stats|videos|photos|news|standings|rankings)\b/.test(p))
      .sort((a, b) => score(b) - score(a))
      .map((p) => `https://www.maxpreps.com${p.endsWith("/") ? p : `${p}/`}roster/`);
  },

  /** A page's HTML: its own data if it has any, else the model reads its text. */
  async fromHTML(html: string, url: string, req: ImportRequest, claude: Claude | null): Promise<ImportResult> {
    const notes: string[] = [];
    let dollars = 0;
    // MaxPreps says what a roster page is. Another gender's roster, or a season with no players
    // posted yet, is reported as such — never handed to the model to find names in the page's clutter.
    const mp = RosterPages.maxPrepsPage(html);
    if (mp) {
      const wanted = req.gender === "womens" ? "Girls" : "Boys";
      if (mp.gender && mp.gender !== wanted) throw new RosterImportError(`That link is the ${mp.gender.toLowerCase()}' roster, and this game is set to ${wanted.toLowerCase()}.`, 1);
      if (!mp.posted) {
        const last = mp.season ? previousSeason(mp.season) : null;
        const lastURL = last ? url.replace(/\/(\d{2}-\d{2}\/)?roster\/?(\?.*)?$/, `/${last}/roster/`) : null;
        throw new RosterImportError(`MaxPreps has no ${mp.season ? `${mp.season} ` : ""}roster posted for this team yet. Paste it from the school's site${lastURL && lastURL !== url ? `, or start from last season's by reading ${lastURL}` : ""}.`, 2);
      }
    }
    const exact = RosterPages.parse(html, url, req.sport);
    if (exact) {
      const identity = { ...exact.identity };
      genderCheck(identity, req, notes);
      if ((!identity.nickname || !identity.school) && claude && req.level === "college") {
        try {
          const g = await claude.identifyTeam({ model: TEXT_MODEL, siteName: identity.school ?? "", url, sport: Sports.info(req.sport).noun });
          dollars += Cost.of(TEXT_MODEL, g.usage);
          if (g.team.school) identity.school = g.team.school;
          if (g.team.nickname && !identity.nickname) identity.nickname = g.team.nickname;
          if (!identity.colors.length && g.team.colors.length) identity.colors = g.team.colors;
        } catch { /* a team with no nickname is still a team */ }
      }
      return { team: toTeam(exact.players, identity, url, exact.staff), source: exact.source, url, dollars, notes: notes.concat(numberNotes(exact.players)) };
    }
    if (!claude) throw new RosterImportError("This page has no roster data the app can read on its own. Add an API key to read it with Claude.");
    const text = RosterImport.pageText(html);
    // A bot check instead of the page: the site will not be read automatically, and should not be forced.
    if (text.length < 2000 && /challenge-container|cf-challenge|captcha|just a moment|access denied|are you a robot/i.test(html)) {
      throw new RosterImportError("This site blocks automated reading. Open the roster in your browser, select the table, copy it and use Paste.");
    }
    if (text.length < 200) throw new RosterImportError("That page came back nearly empty — try pasting the roster's text instead.");
    const r = await RosterImport.fromText(text, req, claude);
    const identity = RosterPages.identity(html);
    if (!r.team.school && identity.school) r.team.school = identity.school;
    if (!r.team.colors.length) r.team.colors = identity.colors;
    return { ...r, url };
  },

  /** Pasted text, a screenshot or a PDF, read by the model. */
  async fromText(text: string, req: ImportRequest, claude: Claude): Promise<ImportResult> {
    return extract({ text: text.slice(0, 150_000) }, req, claude);
  },
  async fromImage(image: SentImage, req: ImportRequest, claude: Claude): Promise<ImportResult> {
    // A screenshot's small print is read better by the stronger model.
    return extract({ image }, req, claude, "claude-sonnet-5");
  },
  async fromPDF(pdfBase64: string, req: ImportRequest, claude: Claude): Promise<ImportResult> {
    return extract({ pdf: pdfBase64 }, req, claude, "claude-sonnet-5");
  },

  fromCSV(csv: string, req: ImportRequest, school = ""): ImportResult {
    const { players, skippedRows } = CSVRosterImporter.import(csv);
    const names = (p: (typeof players)[number]) => (p.firstName || p.lastName ? { firstName: p.firstName, lastName: p.lastName } : Staff.splitName(p.fullName));
    const list = players.filter((p) => p.role === "player").map((p) => {
      const parsed = Positions.parse(p.position, req.sport);
      return Player.make({ number: p.jerseyNumber, ...names(p), position: parsed.position, positionAbbr: p.position, side: parsed.side, secondary: parsed.secondary });
    });
    // A coach's row carries the title in the position column ("Head Coach").
    const staff = players.filter((p) => p.role === "coach" || p.role === "staff").map((p) => Staff.make({ ...names(p), title: p.position || (p.role === "coach" ? "Coach" : "Staff") }));
    if (!list.length) throw new RosterImportError("No players found in that file.");
    return { team: Team.make({ school, players: dedupe(list), staff: Staff.sorted(staff) }), source: "csv", url: null, dollars: 0, notes: skippedRows ? [`${skippedRows} rows had no number and were skipped.`] : [] };
  },

  /**
   * Visible text, plus the words and numbers inside script payloads — React and Nuxt sites
   * stream their roster as JSON, which the visible text alone would miss.
   */
  pageText(html: string): string {
    let s = html;
    const payloads: string[] = [];
    for (const m of s.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)) if (m[1].length > 400 && m[1].includes("\"")) payloads.push(m[1]);
    for (const tag of ["script", "style", "noscript", "svg", "head"]) s = s.replace(new RegExp(`<${tag}[^>]*>[\\s\\S]*?</${tag}>`, "gi"), " ");
    s = s.replace(/<!--[\s\S]*?-->/g, " ").replace(/<(br|\/p|\/div|\/li|\/tr|\/h\d)[^>]*>/gi, "\n").replace(/<[^>]+>/g, " ");
    s = s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&#x27;/g, "'").replace(/&quot;/g, "\"");
    const visible = s.replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
    const digits = (visible.match(/\d/g) ?? []).length;
    if (visible.length > 6000 && digits > 60) return visible;
    const payload = payloads.join(" ").replace(/\\"/g, " ").replace(/[{}[\]",:;]/g, " ").replace(/\\u[0-9a-fA-F]{4}/g, " ").replace(/\s+/g, " ");
    return `${visible}\n\n${payload.slice(0, 120_000)}`;
  },
};

async function extract(input: { text?: string; image?: SentImage; pdf?: string }, req: ImportRequest, claude: Claude, model = TEXT_MODEL): Promise<ImportResult> {
  const { roster, usage } = await claude.extractRoster({ model, sport: `${req.level === "college" ? "college" : "high school"} ${Sports.label(req.sport, req.gender, req.level).toLowerCase()}`, ...input });
  const players = dedupe(roster.players.filter((p) => p.first || p.last).map((p) => {
    const parsed = Positions.parse(p.position, req.sport);
    return Player.make({ number: p.number.replace(/^#/, ""), firstName: p.first, lastName: p.last, position: parsed.position, positionAbbr: p.position, side: parsed.side, secondary: parsed.secondary, classYear: p.year || null });
  }));
  if (!players.length) throw new RosterImportError("No players could be read from that.");
  const staff = Staff.sorted(roster.coaches.filter((c) => c.first || c.last).map((c) => Staff.make({ firstName: c.first, lastName: c.last, title: c.title || "Coach" })));
  const team = Team.make({ school: roster.school, nickname: roster.nickname || null, players, staff });
  return { team, source: "model", url: null, dollars: Cost.of(model, usage as Usage), notes: numberNotes(players) };
}

function toTeam(players: Player[], identity: TeamIdentity, url: string, staff: Player[] = []): Team {
  return Team.make({ school: identity.school ?? "", nickname: identity.nickname, colors: identity.colors, players, staff, sourceURL: url, logoURL: identity.logoURL });
}

/** MaxPreps lists a team's coaches on their own page beside the roster; a roster read without them is still a roster. */
async function withMaxPrepsStaff(result: ImportResult, fetch: PageFetcher): Promise<ImportResult> {
  if (result.source !== "maxpreps" || !result.url || result.team.staff.length || !/\/roster\/?(\?.*)?$/.test(result.url)) return result;
  try {
    const page = await fetch(result.url.replace(/roster\/?(\?.*)?$/, "staff/"));
    const staff = RosterPages.maxPrepsStaff(page.text);
    return staff.length ? { ...result, team: { ...result.team, staff } } : result;
  } catch { return result; }
}

function numberNotes(players: Player[]): string[] {
  const missing = players.filter((p) => !p.number).length;
  return missing ? [`${missing} player${missing === 1 ? " has" : "s have"} no number on the roster and can only be named by hand.`] : [];
}

/** "26-27" → "25-26". */
function previousSeason(season: string): string | null {
  const m = /^(\d{2})-(\d{2})$/.exec(season);
  if (!m) return null;
  const pad = (n: number) => String((n + 100) % 100).padStart(2, "0");
  return `${pad(+m[1] - 1)}-${pad(+m[2] - 1)}`;
}

/** A page titled for the other gender is worth saying out loud. */
function genderCheck(identity: TeamIdentity, req: ImportRequest, notes: string[]) {
  const t = (identity.title ?? "").toLowerCase();
  if (req.gender === "womens" && /\bboys\b/.test(t)) notes.push(`This page is a boys' roster ("${identity.title}").`);
  if (req.gender === "mens" && /\bgirls\b/.test(t)) notes.push(`This page is a girls' roster ("${identity.title}").`);
}
