/**
 * Assembles dist/ for the host: the design site (this repository's root) is served at /, and the
 * app's Vite build at /app. The app build runs first and writes dist/app itself; this copies the
 * site beside it, leaving out the tooling and anything dotted.
 */
import { cpSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const dist = join(root, "dist");
const tooling = new Set(["app", "api", "dist", "node_modules", "scripts", "package.json", "package-lock.json", "vercel.json", "tsconfig.json"]);

mkdirSync(dist, { recursive: true });
for (const name of readdirSync(dist)) if (name !== "app") rmSync(join(dist, name), { recursive: true, force: true });

let copied = 0;
for (const name of readdirSync(root)) {
  if (name.startsWith(".") || tooling.has(name)) continue;
  cpSync(join(root, name), join(dist, name), { recursive: true, filter: (src) => !basename(src).startsWith(".") });
  copied++;
}

for (const must of ["Cutline.dc.html", "App Review.dc.html", "support.js", "docs/cutline-mark.svg", "app/index.html"]) {
  if (!statSync(join(dist, must), { throwIfNoEntry: false })?.isFile()) throw new Error(`dist/${must} is missing`);
}
console.log(`site: ${copied} entries copied to dist/; app at dist/app`);
