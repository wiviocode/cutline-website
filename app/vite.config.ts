/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  // The app lives at /app on the site; the marketing page owns /.
  base: "/app/",
  plugins: [react()],
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
