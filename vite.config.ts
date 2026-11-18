/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    // The app is served from platform.<domain> in production; the
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
});
