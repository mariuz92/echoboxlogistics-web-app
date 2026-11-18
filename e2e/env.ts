import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Reads KEY=value lines from .env.local (the file the app itself uses). */
function readDotenv(): Record<string, string> {
  const file = resolve(process.cwd(), ".env.local");
  if (!existsSync(file)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match) out[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

const dotenv = readDotenv();
const pick = (key: string, fallback?: string) => process.env[key] ?? dotenv[key] ?? fallback;

export const E2E = {
  supabaseUrl: pick("VITE_SUPABASE_URL", "http://127.0.0.1:55321")!,
  anonKey: pick("VITE_SUPABASE_ANON_KEY"),
  /** Local mail catcher (Mailpit/Inbucket) that receives Supabase Auth emails. */
  mailUrl: pick("E2E_MAIL_URL", "http://127.0.0.1:55324")!,
};

export function assertConfigured() {
  if (!E2E.anonKey) {
    throw new Error(
      "VITE_SUPABASE_ANON_KEY is not set. Run `npm run db:start`, then copy ANON_KEY from " +
        "`npx supabase status -o env` into .env.local (see .env.example).",
    );
  }
}

let cachedServiceKey: string | null | undefined;

/**
 * Service-role key of the LOCAL stack, used only to delete the users and companies
 * that tests create. Taken from E2E_SERVICE_ROLE_KEY or, failing that, from
 * `supabase status -o env`. Returns null when unavailable (cleanup is then skipped).
 */
export function serviceRoleKey(): string | null {
  if (cachedServiceKey !== undefined) return cachedServiceKey;
  const fromEnv = pick("E2E_SERVICE_ROLE_KEY");
  if (fromEnv) return (cachedServiceKey = fromEnv);
  try {
    const out = execSync("supabase status -o env", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    cachedServiceKey = out.match(/^SERVICE_ROLE_KEY="?([^"\r\n]+)"?/m)?.[1] ?? null;
  } catch {
    cachedServiceKey = null;
  }
  return cachedServiceKey;
}
