/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { GET as relay } from "../api/fetch.ts";

/**
 * In development Vite serves the page but nothing serves /api/fetch, so a roster could only be
 * pasted. This runs the same function the host runs, on the dev server.
 */
function relayInDev(): Plugin {
  return {
    name: "cutline-relay-in-dev",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/api/fetch", async (req, res) => {
        try {
          // The function sees what the browser sent — the app's header, the address — as it
          // would on the host, so the dev relay refuses exactly what the deployed one refuses.
          const headers = new Headers();
          for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v); else if (Array.isArray(v)) headers.set(k, v.join(", "));
          const response = await relay(new Request(`http://${req.headers.host ?? "localhost"}/api/fetch${req.url ?? ""}`, { method: req.method ?? "GET", headers }));
          res.statusCode = response.status;
          response.headers.forEach((v, k) => res.setHeader(k, v));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (e) {
          res.statusCode = 500;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ error: (e as Error).message }));
        }
      });
    },
  };
}

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  // The app lives at /app on the site; the marketing page owns /.
  base: "/app/",
  plugins: [react(), relayInDev()],
  build: { outDir: "../dist/app", emptyOutDir: true },
  resolve: {
    alias: {
      "@core": here("./src/core"),
      "@platform": here("./src/platform"),
      "@app": here("./src/app"),
    },
  },
  // The vision prompt is text, imported as a string so it cannot drift from the schema.
  assetsInclude: ["**/*.txt"],
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
