import { createClient } from "@supabase/supabase-js";
import type { Database } from "../types/database.types";
import { env, isSupabaseConfigured } from "../config/env";

/**
 * Single Supabase client for the whole app.
 * The session is persisted in localStorage by supabase-js itself; the app never
 * stores user data in localStorage by hand any more.
 */
export const supabase = createClient<Database>(
  // Placeholders keep the module importable when the app is misconfigured; the
  // <ConfigurationError /> screen is shown instead of rendering anything that
  // would call the API.
  env.supabaseUrl ?? "http://localhost:54321",
  env.supabaseAnonKey ?? "missing-anon-key",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);

export { isSupabaseConfigured };
