/// <reference types="vitest/config" />
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Two builds from one repository:
 *   vite / vite build                   the web app (login, orders, riders…)
 *   vite --mode landing / build:landing  the marketing site: static, no login, no environment
 *                                        variables, hostable on its own domain.
 */

/** The landing shares public/ with the app; drop what only the app needs. */
function dropAppOnlyFiles(): Plugin {
  let outDir = "";
  return {
    name: "landing-drop-app-only-files",
    apply: "build",
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      for (const file of ["manifest.json", "env-config.js", "images/youngtour.jpg", "images/youngtour_logo.png"]) {
        rmSync(resolve(outDir, file), { force: true });
      }
    },
  };
}

/**
 * A short fingerprint of each landing screenshot (public/images/screens/<id>.webp|jpg), e.g.
 * { "crop-dashboard": "1eae54f1" }. The landing adds it to the image URL (?v=…), so a replaced
 * screenshot gets a new address and is never served from a browser or CDN cache that still holds
 * the old picture under the same name.
 */
function screenshotVersions(): Record<string, string> {
  const dir = resolve(__dirname, "public/images/screens");
  const hashes: Record<string, ReturnType<typeof createHash>> = {};
  for (const file of readdirSync(dir).sort()) {
    const m = /^(.+)\.(webp|jpg)$/.exec(file);
    if (!m) continue;
    (hashes[m[1]] ??= createHash("sha1")).update(readFileSync(resolve(dir, file)));
  }
  return Object.fromEntries(Object.entries(hashes).map(([id, h]) => [id, h.digest("hex").slice(0, 8)]));
}

export default defineConfig(({ mode }) => {
  if (mode === "landing") {
    return {
      root: resolve(__dirname, "landing"),
      publicDir: resolve(__dirname, "public"),
      plugins: [react(), dropAppOnlyFiles()],
      define: { __SHOT_VERSIONS__: JSON.stringify(screenshotVersions()) },
      // Never expose anything from .env files to the marketing site.
      envPrefix: "LANDING_NEVER_",
      server: { port: 5174, host: true, fs: { allow: [resolve(__dirname)] } },
      preview: { port: 4174, host: true, allowedHosts: true },
      build: { outDir: resolve(__dirname, "dist-landing"), emptyOutDir: true },
    };
  }

  return {
    plugins: [react()],
    server: {
      port: 5173,
      host: true,
      // The app is served from its own domain in production; the
      // platform.localhost alias lets you exercise the same code path locally.
      allowedHosts: ["localhost", "platform.localhost", ".localhost"],
    },
    preview: {
      port: 4173,
      host: true,
      allowedHosts: true,
    },
    test: {
      environment: "node",
      include: ["src/**/*.test.ts"],
    },
  };
});
