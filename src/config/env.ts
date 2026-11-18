/**
 * Typed access to configuration.
 *
 * Values are resolved in this order:
 *   1. `window.__ENV__`   - injected at container start by docker/entrypoint.sh
 *                           (lets ONE image run in many environments)
 *   2. `import.meta.env`  - Vite build-time variables (.env files, local dev)
 */

declare global {
  interface Window {
    __ENV__?: Record<string, string | undefined>;
  }
}

type EnvKey =
  | "VITE_SUPABASE_URL"
  | "VITE_SUPABASE_ANON_KEY"
  | "VITE_GOOGLE_MAPS_API_KEY"
  | "VITE_APP_MODE"
  | "VITE_PUBLIC_BOOKING_SLUG"
  | "VITE_ENABLE_GOOGLE_AUTH"
  | "VITE_MARKETING_URL";

function read(key: EnvKey): string | undefined {
  const runtime = typeof window !== "undefined" ? window.__ENV__?.[key] : undefined;
  const value = runtime || (import.meta.env[key] as string | undefined);
  return value && value.trim() !== "" ? value.trim() : undefined;
}

export type AppMode = "app" | "landing";

function resolveAppMode(): AppMode {
  const explicit = read("VITE_APP_MODE");
  if (explicit === "app" || explicit === "landing") return explicit;
  // "auto": the app lives on platform.<domain>, the marketing site on the apex.
  // In local development there is no such split, so always serve the app.
  if (import.meta.env.DEV) return "app";
  return window.location.hostname.startsWith("platform.") ? "app" : "landing";
}

export const env = {
  supabaseUrl: read("VITE_SUPABASE_URL"),
  supabaseAnonKey: read("VITE_SUPABASE_ANON_KEY"),
  googleMapsApiKey: read("VITE_GOOGLE_MAPS_API_KEY"),
  /** Tenant slug served by the legacy /OrdineGuida public booking URL. */
  publicBookingSlug: read("VITE_PUBLIC_BOOKING_SLUG"),
  enableGoogleAuth: read("VITE_ENABLE_GOOGLE_AUTH") === "true",
  /** Where "back to site" links point. */
  marketingUrl: read("VITE_MARKETING_URL") ?? "https://www.youngtour.it",
  get appMode(): AppMode {
    return resolveAppMode();
  },
};

export const isSupabaseConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey);
