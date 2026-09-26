/**
 * Re-score saved evaluation runs against the current ground truth, side by side.
 *
 *   npx tsx scripts/score.ts <truth.json> <run.json> [run.json …]
 *
 * Names are split by how sure the app was: a wrong "confirmed" name reaches the caption
 * unflagged, which is the error that matters most; a wrong "likely" one is flagged for review.
 */

import { readFileSync } from "node:fs";
import { basename } from "node:path";

type Truth = Record<string, string[]>;
interface Run { model: string; tokens: number; zoom: boolean; spent: number; results: { file: string; named: string[]; ids: { id: string; team: string | null; status: string }[]; clause: string; dollars: number; ms: number }[] }

const [truthPath, ...runs] = process.argv.slice(2);
const truth: Truth = JSON.parse(readFileSync(truthPath, "utf8"));

const matches = (g: string, w: string) => { const [tn, name] = w.split(":"); const [gtn, gname] = g.split(":"); return gtn === tn && (!name || gname.toLowerCase() === name.toLowerCase()); };

console.log("run".padEnd(34), "precision  recall  wrong-confirmed  wrong-likely  $/1000   ms");
for (const path of runs) {
  const run = JSON.parse(readFileSync(path, "utf8")) as Run;
  let tp = 0, fn = 0, fpConfirmed = 0, fpLikely = 0, n = 0;
  for (const r of run.results) {
    const expected = truth[r.file];
    if (!expected) continue;
    n++;
    const dontCare = new Set(expected.filter((e) => e.endsWith("?")).map((e) => e[0]));
    const want = expected.filter((e) => !e.endsWith("?") && !e.startsWith("+"));
    const allowed = expected.filter((e) => e.startsWith("+")).map((e) => e.slice(1));
    // Status of each named player, by position in the named list (same order as identities in the clause).
    const statuses = r.ids.filter((i) => r.clause.includes(`{${i.id}}`) && i.status !== "unknown" && i.team).map((i) => i.status);
    const got = r.named.map((g, k) => ({ g, status: statuses[k] ?? "likely" }));
    for (const w of want) {
      const k = got.findIndex((x) => matches(x.g, w));
      if (k >= 0) { tp++; got.splice(k, 1); } else fn++;
    }
    for (const x of got) {
      if (dontCare.has(x.g[0]) || allowed.some((a) => matches(x.g, a))) continue;
      if (x.status === "confirmed") fpConfirmed++; else fpLikely++;
    }
  }
  const fp = fpConfirmed + fpLikely;
  const per1000 = (run.spent / run.results.length) * 1000;
  const ms = run.results.reduce((s, r) => s + r.ms, 0) / run.results.length;
  console.log(basename(path, ".json").padEnd(34), `${(tp / Math.max(1, tp + fp) * 100).toFixed(1)}%`.padStart(9), `${(tp / Math.max(1, tp + fn) * 100).toFixed(1)}%`.padStart(7), String(fpConfirmed).padStart(16), String(fpLikely).padStart(13), `$${per1000.toFixed(2)}`.padStart(8), String(Math.round(ms)).padStart(6), ` (${n} photos)`);
}
