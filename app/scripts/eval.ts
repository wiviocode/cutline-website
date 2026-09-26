/**
 * The evaluation harness: runs the same pipeline the app runs over folders of real photographs
 * and scores the named players against hand-checked ground truth.
 *
 *   npx tsx scripts/eval.ts --config <eval.json> [--tier balanced] [--model claude-sonnet-5]
 *     [--tokens 3000] [--zoom on|off] [--truth-only] [--only a.jpg,b.jpg] [--limit 10]
 *     [--concurrency 4] [--out name] [--budget 10]
 *
 * The key comes from ANTHROPIC_API_KEY or --keyfile. Every run's cost is added to a ledger
 * beside the config, and a run that would take the ledger past --budget refuses to start.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { Claude } from "../src/core/ai/Claude";
import { Cost, TIERS, Usage, type Tier } from "../src/core/ai/Models";
import { readPhoto, type PhotoReading } from "../src/core/pipeline/ReadPhoto";
import { Prompt, type ShootContext } from "../src/core/vision/Prompt";
import { Compose, type CaptionContext } from "../src/core/caption/Compose";
import { RosterPages } from "../src/core/roster/RosterPages";
import { Team, type Matchup } from "../src/core/roster/Roster";
import { Levels, Sports, type SportID, type Gender } from "../src/core/sports/Sports";
import type { CaptionStyle } from "../src/core/caption/Styles";
import { resizedSize } from "../src/core/vision/ImageSize";
import { nodeSource } from "./nodeSource";

interface TeamConfig { roster: string; url: string; school: string; nickname?: string; uniform?: string }
interface ShootConfig {
  id: string; folder: string; match?: string; sport: SportID; gender: Gender; level: string;
  a: TeamConfig; b: TeamConfig; style: CaptionStyle; house?: string; photographer?: string;
  venue?: string; city?: string; state?: string;
}
interface EvalConfig { photosRoot: string; rosterDir: string; truth?: string; shoots: ShootConfig[] }
/** file → expected named athletes, "A10" / "B54". */
type Truth = Record<string, string[]>;

const args = parseArgs(process.argv.slice(2));
const configPath = resolve(args.config ?? "eval.json");
const config = JSON.parse(readFileSync(configPath, "utf8")) as EvalConfig;
const baseDir = dirname(configPath);
const tier = (args.tier ?? "balanced") as Tier;
const model = args.model ?? TIERS[tier].model;
const tokens = args.tokens ? Number(args.tokens) : TIERS[tier].imageTokens;
const zoom = args.zoom ? args.zoom === "on" : TIERS[tier].zoom;
const budget = Number(args.budget ?? 10);
const concurrency = Number(args.concurrency ?? 4);
const ledgerPath = join(baseDir, "ledger.json");
const ledger: { total: number; runs: { name: string; dollars: number; photos: number; at: string }[] } = existsSync(ledgerPath) ? JSON.parse(readFileSync(ledgerPath, "utf8")) : { total: 0, runs: [] };
const truth: Truth = config.truth && existsSync(join(baseDir, config.truth)) ? JSON.parse(readFileSync(join(baseDir, config.truth), "utf8")) : {};
const key = process.env.ANTHROPIC_API_KEY ?? (args.keyfile ? readFileSync(args.keyfile, "utf8").trim() : "");
if (!key) throw new Error("no API key: set ANTHROPIC_API_KEY or pass --keyfile");
const claude = new Claude(key, { thinkingEffort: args.thinking === "low" || args.thinking === "medium" ? args.thinking : undefined });

interface Job { shoot: ShootConfig; file: string; path: string }
interface Result {
  file: string; shoot: string; caption: string; clause: string; reference: string;
  named: string[]; expected: string[] | null; ids: { id: string; team: string | null; number: string; clarity: string; status: string; who: string; reason: string }[];
  zooms: PhotoReading["zooms"]; dollars: number; usage: Usage; ms: number; error?: string;
}

async function main() {
  const jobs: Job[] = [];
  for (const shoot of config.shoots) {
    const dir = join(config.photosRoot, shoot.folder);
    for (const file of readdirSync(dir).filter((f) => /\.jpe?g$/i.test(f) && (!shoot.match || f.includes(shoot.match))).sort()) {
      if (args.only && !args.only.split(",").includes(file)) continue;
      if (args["truth-only"] && !(file in truth)) continue;
      jobs.push({ shoot, file, path: join(dir, file) });
    }
  }
  const selected = args.limit ? jobs.slice(0, Number(args.limit)) : jobs;
  const estimate = selected.length * Cost.perPhoto(tier) * (model === TIERS[tier].model ? 1 : 1.5) + 0.05;
  console.log(`${selected.length} photos · ${model} · ${tokens} image tokens · zoom ${zoom ? "on" : "off"} · estimate ${Cost.dollars(estimate)} · ledger ${Cost.dollars(ledger.total)} of ${Cost.dollars(budget)}`);
  if (ledger.total + estimate > budget) { console.error("Refusing: this run could take spending past the budget."); process.exit(2); }
  if (args["dry-run"]) return;

  // Per shoot: rosters, uniforms (scouted once, cached beside the config), the system prompt.
  const shoots = new Map<string, { ctx: ShootContext; caption: CaptionContext; system: string; matchup: Matchup }>();
  let setupCost = 0;
  const scoutPath = join(baseDir, "scout-cache.json");
  const scoutCache: Record<string, { a: string; b: string }> = existsSync(scoutPath) ? JSON.parse(readFileSync(scoutPath, "utf8")) : {};
  for (const shoot of new Set(selected.map((j) => j.shoot))) {
    const team = (t: TeamConfig) => {
      const html = readFileSync(join(config.rosterDir, t.roster), "utf8");
      const parsed = RosterPages.parse(html, t.url, shoot.sport);
      if (!parsed) throw new Error(`no roster in ${t.roster}`);
      return Team.make({ school: t.school, nickname: t.nickname ?? parsed.identity.nickname, colors: parsed.identity.colors, uniform: t.uniform ?? "", players: parsed.players });
    };
    const matchup: Matchup = { a: team(shoot.a), b: team(shoot.b) };
    if (!shoot.a.uniform || !shoot.b.uniform) {
      if (!scoutCache[shoot.id]) {
        const files = selected.filter((j) => j.shoot === shoot).map((j) => j.path);
        const pick = [0.2, 0.45, 0.7, 0.9].map((f) => files[Math.min(files.length - 1, Math.floor(f * files.length))]);
        const images = await Promise.all([...new Set(pick)].map(async (p) => {
          const src = nodeSource(p, p);
          const { width, height } = await src.size();
          const [w, h] = resizedSize(width, height, 1568, 900);
          return src.frame(w, h);
        }));
        const s = await claude.scoutUniforms({ model: "claude-sonnet-5", images, sport: Sports.info(shoot.sport).noun, teamA: Team.fullName(matchup.a), teamB: Team.fullName(matchup.b), colorsA: matchup.a.colors.join(", "), colorsB: matchup.b.colors.join(", ") });
        setupCost += Cost.of("claude-sonnet-5", s.usage);
        scoutCache[shoot.id] = { a: s.a, b: s.b };
        writeFileSync(scoutPath, JSON.stringify(scoutCache, null, 2));
        console.log(`scouted ${shoot.id}: A = ${s.a} | B = ${s.b}`);
      }
      matchup.a.uniform ||= scoutCache[shoot.id].a;
      matchup.b.uniform ||= scoutCache[shoot.id].b;
    }
    const ctx: ShootContext = { sport: shoot.sport, gender: shoot.gender, level: Levels.info(shoot.level), matchup };
    const caption: CaptionContext = {
      style: shoot.style, sport: shoot.sport, gender: shoot.gender, level: Levels.info(shoot.level), matchup,
      venue: shoot.venue, city: shoot.city, state: shoot.state, photographer: shoot.photographer, house: shoot.house, unnamed: "placeholder",
    };
    shoots.set(shoot.id, { ctx, caption, system: Prompt.system(ctx), matchup });
  }

  const results: Result[] = [];
  let spent = setupCost;
  const started = new Set<string>();
  const queue = [...selected];
  // The first photograph of each shoot goes alone, so the others read its cached prompt.
  const runOne = async (job: Job) => {
    const s = shoots.get(job.shoot.id)!;
    const t0 = Date.now();
    const src = nodeSource(job.path, job.file);
    try {
      const reading = await readPhoto({ claude, tier, model, imageTokens: tokens, zoom, system: s.system, identify: { matchup: s.matchup, unitSport: Sports.hasUnits(job.shoot.sport) }, source: src, sportName: Sports.info(job.shoot.sport).noun });
      const date = await captureDate(job.path);
      const composed = Compose.caption(reading.observation, reading.identities, { ...s.caption, captureDate: date });
      const dollars = Cost.of(reading.model, reading.usage);
      spent += dollars;
      // Scored as the caption reads: only the people the clause names.
      const inClause = new Set(reading.observation.clause.match(/\{P\d+\}/g)?.map((t) => t.slice(1, -1)) ?? []);
      const named = reading.identities.filter((i) => i.player && i.teamKey && inClause.has(i.subjectId)).map((i) => `${i.teamKey}${i.player!.number}:${i.player!.lastName.split(" ")[0]}`);
      results.push({
        file: job.file, shoot: job.shoot.id, caption: composed.caption, clause: reading.observation.clause, reference: await referenceCaption(job.path),
        named, expected: truth[job.file] ?? null,
        ids: reading.identities.map((i) => {
          const subj = reading.observation.subjects.find((x) => x.id === i.subjectId)!;
          return { id: i.subjectId, team: i.teamKey, number: subj.number, clarity: subj.clarity, status: i.status, who: i.player ? `${i.player.firstName} ${i.player.lastName}` : subj.kind, reason: i.reason };
        }),
        zooms: reading.zooms, dollars, usage: reading.usage, ms: Date.now() - t0,
      });
      process.stdout.write(`\r${results.length}/${selected.length} · ${Cost.dollars(spent)}   `);
    } catch (e) {
      results.push({ file: job.file, shoot: job.shoot.id, caption: "", clause: "", reference: "", named: [], expected: truth[job.file] ?? null, ids: [], zooms: [], dollars: 0, usage: Usage.zero(), ms: Date.now() - t0, error: (e as Error).message });
      console.error(`\n${job.file}: ${(e as Error).message}`);
    }
  };
  const worker = async () => {
    while (queue.length) {
      const job = queue.shift()!;
      if (!started.has(job.shoot.id)) { started.add(job.shoot.id); await runOne(job); continue; }
      await runOne(job);
    }
  };
  // Prime each shoot's cache serially, then fan out.
  for (const shoot of new Set(queue.map((j) => j.shoot.id))) {
    const i = queue.findIndex((j) => j.shoot.id === shoot);
    const [job] = queue.splice(i, 1);
    started.add(shoot);
    await runOne(job);
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  console.log();

  results.sort((a, b) => a.file.localeCompare(b.file));
  const name = args.out ?? `${new Date().toISOString().replace(/[:.]/g, "-")}-${model}-${tokens}${zoom ? "-zoom" : ""}`;
  mkdirSync(join(baseDir, "runs"), { recursive: true });
  writeFileSync(join(baseDir, "runs", `${name}.json`), JSON.stringify({ model, tokens, zoom, tier, spent, results }, null, 2));
  ledger.total += spent;
  ledger.runs.push({ name, dollars: spent, photos: results.length, at: new Date().toISOString() });
  writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2));

  // Score against ground truth.
  let tp = 0, fp = 0, fn = 0;
  const lines: string[] = [];
  for (const r of results) {
    if (!r.expected) continue;
    // "A13" is required (team and number); "B0:Scoby" also the player; "+A9" is visible and
    // correct if named but not required; "A?" means any A naming goes unscored (unreadable).
    const dontCare = new Set(r.expected.filter((e) => e.endsWith("?")).map((e) => e[0]));
    const want = r.expected.filter((e) => !e.endsWith("?") && !e.startsWith("+"));
    const allowed = r.expected.filter((e) => e.startsWith("+")).map((e) => e.slice(1));
    const matches = (g: string, w: string) => { const [tn, name] = w.split(":"); const [gtn, gname] = g.split(":"); return gtn === tn && (!name || gname.toLowerCase() === name.toLowerCase()); };
    const got = [...r.named];
    let hits = 0, misses = 0;
    for (const w of want) {
      const i = got.findIndex((g) => matches(g, w));
      if (i >= 0) { hits++; got.splice(i, 1); } else misses++;
    }
    const wrong = got.filter((g) => !dontCare.has(g[0]) && !allowed.some((a) => matches(g, a))).length;
    tp += hits; fn += misses; fp += wrong;
    if (misses || wrong) lines.push(`  ${r.file}: expected [${r.expected.join(" ")}] got [${r.named.join(" ")}] — ${r.ids.map((i) => `${i.id}:${i.team ?? "?"}${i.number || "-"}/${i.clarity}/${i.status}`).join(" ")}`);
  }
  const scored = results.filter((r) => r.expected).length;
  const perPhoto = spent / Math.max(1, results.length);
  console.log(`spent ${Cost.dollars(spent)} (${Cost.dollars(perPhoto)}/photo, ${Cost.dollars(perPhoto * 1000)}/1000) · ledger ${Cost.dollars(ledger.total)} · errors ${results.filter((r) => r.error).length}`);
  console.log(`mean latency ${Math.round(results.reduce((s, r) => s + r.ms, 0) / Math.max(1, results.length))} ms · zooms ${results.reduce((s, r) => s + r.zooms.length, 0)}`);
  if (scored) {
    console.log(`scored ${scored} photos: precision ${(tp / Math.max(1, tp + fp) * 100).toFixed(1)}% · recall ${(tp / Math.max(1, tp + fn) * 100).toFixed(1)}% (tp ${tp}, fp ${fp}, fn ${fn})`);
    console.log(lines.join("\n"));
  }
  console.log(`wrote runs/${name}.json`);
}

async function captureDate(path: string): Promise<Date | null> {
  const exifr = (await import("exifr")).default;
  try {
    const t = await exifr.parse(path, { pick: ["DateTimeOriginal", "CreateDate"] });
    const d = t?.DateTimeOriginal ?? t?.CreateDate;
    return d instanceof Date ? d : null;
  } catch { return null; }
}

async function referenceCaption(path: string): Promise<string> {
  const buf = readFileSync(path).subarray(0, 600_000).toString("latin1");
  const m = /<dc:description>[\s\S]*?<rdf:li[^>]*>([\s\S]*?)<\/rdf:li>/.exec(buf);
  return m ? Buffer.from(m[1], "latin1").toString("utf8").replace(/&amp;/g, "&").replace(/&quot;/g, "\"") : "";
}

function parseArgs(a: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < a.length; i++) {
    if (!a[i].startsWith("--")) continue;
    const k = a[i].slice(2);
    if (i + 1 < a.length && !a[i + 1].startsWith("--")) out[k] = a[++i]; else out[k] = "true";
  }
  return out;
}

main().catch((e) => { console.error(e); process.exit(1); });
