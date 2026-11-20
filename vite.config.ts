/// <reference types="vitest/config" />
import { rmSync } from "node:fs";
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

export default defineConfig(({ mode }) => {
  if (mode === "landing") {
    return {
      root: resolve(__dirname, "landing"),
      publicDir: resolve(__dirname, "public"),
      plugins: [react(), dropAppOnlyFiles()],
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
