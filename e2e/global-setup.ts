import { assertConfigured, E2E } from "./env";

/** Fails fast with a readable message when the back end is not running. */
export default async function globalSetup() {
  assertConfigured();

  for (const [name, url] of [
    ["Supabase API", `${E2E.supabaseUrl}/auth/v1/health`],
    ["mail catcher", `${E2E.mailUrl}/api/v1/info`],
  ] as const) {
    try {
      const res = await fetch(url, { headers: { apikey: E2E.anonKey! } });
      if (!res.ok && res.status !== 401) throw new Error(`HTTP ${res.status}`);
    } catch (error) {
      throw new Error(
        `${name} is not reachable at ${url} (${(error as Error).message}). Start it with \`npm run db:start\`.`,
      );
    }
  }
}
