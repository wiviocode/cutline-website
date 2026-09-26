/**
 * Reading a roster straight off a team's own web page, with no model involved.
 *
 * Four platforms carry nearly every roster a college or high-school desk needs, and each embeds
 * its roster as data — so a roster is read exactly, instantly and for free, headshots included:
 *
 *  - **MaxPreps** (high school): a Next.js page whose `__NEXT_DATA__` holds `athleteData`, one
 *    positional array per athlete, and `teamContext`, the school, mascot and colours.
 *  - **Sidearm NextGen** (most of Division I — Indiana, North Carolina, Bowling Green): a Nuxt
 *    page whose `__NUXT_DATA__` payload holds `pinia.roster.roster[].players[]`.
 *  - **WMT** (Nebraska and others): also Nuxt, with `data["roster-…-players-list"]`.
 *  - **Sidearm classic** (North Dakota and many smaller schools): server-rendered
 *    `li.sidearm-roster-player` markup.
 *
 * Anything else falls through to the model (RosterExtraction), which reads the page's text.
 */

import { Player, Staff, type PlayerSide } from "./Roster";
import { Positions } from "./Positions";

export type RosterSource = "maxpreps" | "sidearm-nextgen" | "wmt" | "sidearm-classic" | "model" | "csv" | "manual";

export interface TeamIdentity {
  school: string | null;
  nickname: string | null;
  colors: string[];
  city: string | null;
  state: string | null;
  logoURL: string | null;
  /** What the page says it is: "Girls Volleyball Varsity Fall 26-27", "2026 Football Roster". */
  title: string | null;
}

export interface ParsedRoster {
  source: RosterSource;
  players: Player[];
  /** Coaches and staff, when the page lists them. MaxPreps keeps them on a page of their own. */
  staff: Player[];
  identity: TeamIdentity;
}

const EMPTY_IDENTITY: TeamIdentity = { school: null, nickname: null, colors: [], city: null, state: null, logoURL: null, title: null };

export const RosterPages = {
  /** The page's own roster data, or null when it has none this app can read exactly. */
  parse(html: string, pageURL: string, sport: string): ParsedRoster | null {
    return maxPreps(html, sport)
      ?? nuxtRoster(html, pageURL, sport)
      ?? sidearmClassic(html, pageURL, sport);
  },

  /**
   * A MaxPreps roster page, read for what it says about itself: whether any players are posted,
   * which gender, and which season ("26-27"). Null for any other page.
   */
  maxPrepsPage(html: string): { posted: boolean; gender: "Boys" | "Girls" | null; season: string | null } | null {
    const pp = (nextData(html)?.props as Record<string, unknown> | undefined)?.pageProps as Record<string, unknown> | undefined;
    if (!pp || !Array.isArray(pp.athleteData)) return null;
    const t = (pp.teamContext as Record<string, unknown> | undefined)?.data as Record<string, unknown> | undefined;
    const gender = t?.gender === "Boys" || t?.gender === "Girls" ? t.gender : null;
    const season = typeof t?.year === "string" && /^\d{2}-\d{2}$/.test(t.year) ? t.year : null;
    return { posted: pp.athleteData.length > 0, gender, season };
  },

  /** A MaxPreps staff page (…/volleyball/staff/): its coaches, as MaxPreps titles them. */
  maxPrepsStaff(html: string): Player[] {
    const pp = (nextData(html)?.props as Record<string, unknown> | undefined)?.pageProps as Record<string, unknown> | undefined;
    const list = Array.isArray(pp?.initStaffList) ? (pp!.initStaffList as unknown[]) : [];
    return Staff.sorted(list.map(obj).filter((c): c is Obj => !!c).map((c) => Staff.make({
      firstName: str(c.userFirstName), lastName: str(c.userLastName), title: str(c.position) || "Coach", headshotURL: str(c.photoUrl) || null,
    })).filter((c) => c.firstName || c.lastName));
  },

  /** Best-effort identity for any page, for when the roster came from the model. */
  identity(html: string): TeamIdentity {
    return { ...EMPTY_IDENTITY, ...openGraphIdentity(html) };
  },

  cleanSiteName,
  unflattenNuxt,
};

// ---------------------------------------------------------------- MaxPreps

/** Column positions in `athleteData`, as observed on maxpreps.com in the 2026 season. */
const MP = { first: 5, last: 6, grade: 7, jersey: 8, position1: 12, position2: 13, positions: 32, fullName: 33, classYear: 36 };

function nextData(html: string): Record<string, unknown> | null {
  const open = html.indexOf('<script id="__NEXT_DATA__"');
  if (open < 0) return null;
  const start = html.indexOf(">", open);
  const close = html.indexOf("</script>", start + 1);
  if (start < 0 || close < 0) return null;
  try { return JSON.parse(html.slice(start + 1, close)) as Record<string, unknown>; } catch { return null; }
}

function maxPreps(html: string, sport: string): ParsedRoster | null {
  const root = nextData(html);
  const pp = (root?.props as Record<string, unknown> | undefined)?.pageProps as Record<string, unknown> | undefined;
  const rows = pp?.athleteData;
  if (!Array.isArray(rows) || !rows.length || !rows.every(Array.isArray)) return null;
  const players: Player[] = [];
  for (const row of rows as unknown[][]) {
    const text = (i: number) => { const v = row[i]; return typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : ""; };
    const first = text(MP.first), last = text(MP.last), full = text(MP.fullName);
    if (!first && !last) continue;
    // The columns are unnamed, so each row is checked against itself: a page whose layout has
    // moved fails here and goes to the model rather than yielding shifted columns.
    if (full && full !== `${first} ${last}`.trim()) return null;
    const p1 = text(MP.position1), p2 = text(MP.position2), combined = text(MP.positions);
    const pieces = Positions.split(combined);
    if (combined && ![p1, p2].filter(Boolean).every((p) => pieces.includes(p))) return null;
    const printed = combined || [p1, p2].filter(Boolean).join(", ");
    players.push(fromPrinted({ number: text(MP.jersey), first, last, printed, classYear: text(MP.classYear) }, sport));
  }
  if (!players.length) return null;
  const t = (pp?.teamContext as Record<string, unknown> | undefined)?.data as Record<string, unknown> | undefined;
  return {
    source: "maxpreps",
    players: dedupe(players),
    staff: [],
    identity: maxPrepsIdentity(t),
  };
}

/**
 * High-school rosters are typed by coaches, and MaxPreps shows the seams: the same athlete twice
 * (once per position, or once per level), a name spelled two ways under one number, a numbered
 * row and an unnumbered one for the same person. Duplicates would make a clear number look
 * shared, so they are folded: same number and nearly the same name is one player.
 */
export function dedupe(players: Player[]): Player[] {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
  const same = (a: Player, b: Player) => norm(a.firstName) === norm(b.firstName) && editDistance(norm(a.lastName), norm(b.lastName)) <= 2;
  const out: Player[] = [];
  for (const p of players) {
    const twin = out.find((q) => (q.number === p.number || !p.number || !q.number) && same(p, q));
    if (!twin) { out.push(p); continue; }
    if (!twin.number && p.number) twin.number = p.number;
    if (!twin.positionAbbr && p.positionAbbr) Object.assign(twin, { position: p.position, positionAbbr: p.positionAbbr, side: p.side, secondary: p.secondary });
  }
  return out;
}

function editDistance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return d[a.length][b.length];
}

function maxPrepsIdentity(t: Record<string, unknown> | undefined): TeamIdentity {
  const s = (k: string) => { const v = t?.[k]; return typeof v === "string" && v.trim() ? v.trim() : null; };
  const colors = ["schoolColor1", "schoolColor2", "schoolColor3"].map(s).filter((c): c is string => !!c && /^[0-9a-f]{6}$/i.test(c));
  return {
    school: s("schoolName"), nickname: s("schoolMascot"), colors, city: s("schoolMailingCity"), state: s("stateName"),
    logoURL: s("schoolMascotUrl"), title: s("sportSeasonName"),
  };
}

// ---------------------------------------------------------------- Nuxt (Sidearm NextGen, WMT)

/**
 * Nuxt 3 serialises its state with `devalue`: one flat JSON array in which objects and arrays
 * hold indexes into the array rather than values, with a few tagged forms (`["Reactive", i]`,
 * `["Set", …]`, `["Map", …]`, `["Date", s]`). This rebuilds the object graph.
 */
function unflattenNuxt(payload: unknown[]): unknown {
  const memo = new Map<number, unknown>();
  const WRAPPERS = new Set(["Reactive", "ShallowReactive", "Ref", "ShallowRef", "EmptyRef", "EmptyShallowRef", "NuxtError", "Island"]);
  const hyd = (i: unknown): unknown => {
    if (typeof i !== "number") return i;
    if (i < 0) return undefined; // devalue's sentinels: -1 undefined, -2 hole, …
    if (memo.has(i)) return memo.get(i);
    const v = payload[i];
    if (v === null || typeof v !== "object") { memo.set(i, v); return v; }
    if (Array.isArray(v)) {
      const tag = v[0];
      if (typeof tag === "string" && WRAPPERS.has(tag)) { const r = hyd(v[1]); memo.set(i, r); return r; }
      if (tag === "Date") { memo.set(i, v[1]); return v[1]; }
      if (tag === "Set") { const out: unknown[] = []; memo.set(i, out); for (const x of v.slice(1)) out.push(hyd(x)); return out; }
      if (tag === "Map") { const out: Record<string, unknown> = {}; memo.set(i, out); for (let k = 1; k + 1 < v.length; k += 2) out[String(hyd(v[k]))] = hyd(v[k + 1]); return out; }
      if (tag === "BigInt" || tag === "RegExp" || tag === "null") { memo.set(i, null); return null; }
      const out: unknown[] = []; memo.set(i, out);
      for (const x of v) out.push(hyd(x));
      return out;
    }
    const out: Record<string, unknown> = {}; memo.set(i, out);
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) out[k] = hyd(x);
    return out;
  };
  return hyd(0);
}

function nuxtPayload(html: string): unknown | null {
  const m = /<script[^>]*id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!m) return null;
  try {
    const arr = JSON.parse(m[1]);
    return Array.isArray(arr) ? unflattenNuxt(arr) : null;
  } catch { return null; }
}

type Obj = Record<string, unknown>;
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");
const obj = (v: unknown): Obj | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : null);

function nuxtRoster(html: string, pageURL: string, sport: string): ParsedRoster | null {
  const root = obj(nuxtPayload(html));
  if (!root) return null;
  const og = openGraphIdentity(html);

  // Sidearm NextGen
  // Keyed by roster id on some sites, a plain list on others.
  const held = obj(obj(root.pinia)?.roster)?.roster;
  const rosters = Array.isArray(held) ? held : obj(held) ? Object.values(obj(held)!) : null;
  if (rosters) {
    // A page can hold more than one roster (the season shown, plus others it preloaded); the
    // largest one on the page is the one it was opened for.
    const shown = rosters.map(obj).filter((r): r is Obj => !!r)
      .sort((a, b) => (Array.isArray(b.players) ? b.players.length : 0) - (Array.isArray(a.players) ? a.players.length : 0))[0];
    const lists = [Array.isArray(shown?.players) ? (shown!.players as unknown[]) : []];
    const staff = Staff.sorted((Array.isArray(shown?.coaches) ? (shown!.coaches as unknown[]) : []).map(obj).filter((c): c is Obj => !!c && !c.hide).map((c) => {
      const image = obj(c.image);
      return Staff.make({ firstName: str(c.firstName), lastName: str(c.lastName), title: str(c.title) || "Coach", headshotURL: absolute(str(image?.absoluteUrl) || str(image?.url), pageURL) });
    }).filter((c) => c.firstName || c.lastName));
    const players = (lists[0] ?? []).map(obj).filter((p): p is Obj => !!p && !p.hide).map((p) => {
      const image = obj(p.image);
      const printed = str(p.positionShort) || str(p.positionLong);
      return fromPrinted({
        number: str(p.jerseyNumber), first: str(p.firstName), last: str(p.lastName), printed,
        classYear: str(p.academicYearShort) || str(p.academicYearLong),
        headshot: absolute(str(image?.absoluteUrl) || str(image?.url), pageURL),
      }, sport);
    }).filter((p) => p.firstName || p.lastName);
    if (players.length) return { source: "sidearm-nextgen", players, staff, identity: og };
  }

  // WMT
  const data = obj(root.data);
  if (data) {
    const key = Object.keys(data).filter((k) => /players-list/.test(k) && Array.isArray(data[k]))
      .sort((x, y) => (data[y] as unknown[]).length - (data[x] as unknown[]).length)[0];
    if (key) {
      const players = (data[key] as unknown[]).map(obj).filter((w): w is Obj => !!w && (w.publication_state == null || w.publication_state === "published")).map((w) => {
        const person = obj(w.player) ?? {};
        const pos = obj(w.player_position) ?? obj(person.player_position);
        const printed = str(pos?.abbreviation) || str(pos?.name);
        const photo = obj(w.photo) ?? obj(person.master_photo);
        const number = w.jersey_number ?? person.jersey_number;
        return fromPrinted({
          number: number == null ? "" : str(number), first: str(person.first_name), last: str(person.last_name), printed,
          classYear: str(obj(w.class_level)?.name),
          headshot: absolute(str(photo?.url), pageURL),
        }, sport);
      }).filter((p) => p.firstName || p.lastName);
      // Coaches and support staff, in the site's own order, on a list of their own.
      const staffKey = Object.keys(data).find((k) => /staff-members-list/.test(k) && Array.isArray(obj(data[k])?.rosterStaffs));
      const staff = Staff.sorted((staffKey ? (obj(data[staffKey])!.rosterStaffs as unknown[]) : []).map(obj).filter((c): c is Obj => !!c).map((c) => {
        const person = obj(c.staff_member) ?? obj(c.staff) ?? c;
        const photo = obj(c.photo) ?? obj(person.master_photo) ?? obj(c.master_photo);
        return Staff.make({ firstName: str(c.first_name) || str(person.first_name), lastName: str(c.last_name) || str(person.last_name), title: str(c.position) || str(person.position) || "Coach", headshotURL: absolute(str(photo?.url), pageURL) });
      }).filter((c) => c.firstName || c.lastName));
      if (players.length) return { source: "wmt", players, staff, identity: og };
    }
  }
  return null;
}

// ---------------------------------------------------------------- Sidearm classic

function sidearmClassic(html: string, pageURL: string, sport: string): ParsedRoster | null {
  if (!html.includes("sidearm-roster-player")) return null;
  const players: Player[] = [];
  const re = /<li class="sidearm-roster-player[\s"][\s\S]*?(?=<li class="sidearm-roster-player[\s"]|<\/ul>)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const li = m[0];
    const name = decode(firstMatch(li, /<h3[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/) ?? firstMatch(li, /data-player-name="([^"]+)"/) ?? "");
    if (!name) continue;
    const number = decode(firstMatch(li, /sidearm-roster-player-jersey-number[^>]*>([\s\S]*?)</) ?? "");
    const printed = decode(firstMatch(li, /sidearm-roster-player-position-long-short hide-on-medium[^>]*>([\s\S]*?)</)
      ?? firstMatch(li, /sidearm-roster-player-position[^>]*>[\s\S]*?<span[^>]*>([\s\S]*?)</)
      ?? firstMatch(li, /sidearm-roster-player-position-long-short[^>]*>([\s\S]*?)</) ?? "");
    const classYear = decode(firstMatch(li, /sidearm-roster-player-academic-year[^>]*>([\s\S]*?)</) ?? "");
    const img = firstMatch(li, /data-src="([^"]+)"/) ?? firstMatch(li, /<img[^>]+src="([^"]+)"/);
    const [first, ...rest] = name.split(/\s+/);
    players.push(fromPrinted({
      number, first, last: rest.join(" "), printed, classYear,
      headshot: img ? absolute(img.replace(/\?.*$/, ""), pageURL) : null,
    }, sport));
  }
  if (!players.length) return null;
  const staff: Player[] = [];
  const cre = /<li class="sidearm-roster-coach[\s"][\s\S]*?(?=<li class="sidearm-roster-coach[\s"]|<\/ul>)/g;
  while ((m = cre.exec(html))) {
    const li = m[0];
    const name = decode(firstMatch(li, /sidearm-roster-coach-name[^>]*>[\s\S]*?<(?:p|a|span)[^>]*>([\s\S]*?)</) ?? "");
    if (!name) continue;
    const title = decode(firstMatch(li, /sidearm-roster-coach-title[^>]*>[\s\S]*?<span[^>]*>([\s\S]*?)</) ?? "") || "Coach";
    const img = firstMatch(li, /data-src="([^"]+)"/) ?? firstMatch(li, /<img[^>]+src="([^"]+)"/);
    staff.push(Staff.make({ ...Staff.splitName(name), title, headshotURL: img ? absolute(img.replace(/\?.*$/, ""), pageURL) : null }));
  }
  return { source: "sidearm-classic", players, staff: Staff.sorted(staff), identity: openGraphIdentity(html) };
}

// ---------------------------------------------------------------- shared

interface Printed { number: string; first: string; last: string; printed: string; classYear?: string; headshot?: string | null }

function fromPrinted(p: Printed, sport: string): Player {
  const parsed = Positions.parse(p.printed, sport);
  return Player.make({
    number: p.number.replace(/^#/, ""),
    firstName: p.first,
    lastName: p.last,
    position: parsed.position,
    positionAbbr: p.printed,
    side: parsed.side as PlayerSide,
    secondary: parsed.secondary,
    classYear: p.classYear || null,
    headshotURL: p.headshot || null,
  });
}

function openGraphIdentity(html: string): TeamIdentity {
  const site = meta(html, "og:site_name");
  const title = meta(html, "og:title") ?? firstMatch(html, /<title[^>]*>([^<]*)<\/title>/);
  const theme = meta(html, "theme-color");
  return {
    ...EMPTY_IDENTITY,
    school: site ? cleanSiteName(site) || null : null,
    title: title ? decode(title) : null,
    colors: theme && /^#?[0-9a-f]{6}$/i.test(theme) ? [theme.replace("#", "").toUpperCase()] : [],
  };
}

/** "University of Nebraska - Official Athletics Website" → "Nebraska"; "Indiana University Athletics" → "Indiana University". */
function cleanSiteName(raw: string): string {
  let s = decode(raw);
  for (const sep of [" - ", " | ", " – ", " — "]) { const i = s.indexOf(sep); if (i > 0) s = s.slice(0, i); }
  s = s.replace(/\s+(Official\s+)?Athletics(\s+Website)?$/i, "").replace(/\s+Sports$/i, "");
  s = s.replace(/^(The\s+)?University\s+of\s+/i, "");
  return s.trim();
}

function meta(html: string, property: string): string | null {
  const p = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  for (const re of [
    new RegExp(`<meta[^>]+(?:property|name)=["']${p}["'][^>]*content=["']([^"']*)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${p}["']`, "i"),
  ]) {
    const m = re.exec(html);
    if (m && m[1].trim()) return m[1].trim();
  }
  return null;
}

function firstMatch(s: string, re: RegExp): string | null {
  const m = re.exec(s);
  return m ? m[1] : null;
}

function decode(s: string): string {
  return s.replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#x27;|&#39;|&apos;/g, "'").replace(/&quot;/g, "\"")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/\s+/g, " ").trim();
}

function absolute(u: string, base: string): string | null {
  if (!u) return null;
  try { return new URL(u, base).toString().replace(/^http:/, "https:"); } catch { return null; }
}
