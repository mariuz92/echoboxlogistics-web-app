import type { Session } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabase";
import { getErrorMessage } from "../../lib/errors";
import type { Profile, Tenant } from "../../types/domain";

export type CurrentUserResult =
  | { kind: "signed_out" }
  | { kind: "ready"; session: Session; profile: Profile; tenant: Tenant }
  /** Signed in, but not attached to any company yet (e.g. first Google login). */
  | { kind: "needs_company"; session: Session }
  | { kind: "blocked"; session: Session | null; reason: "disabled" | "error"; message: string };

let cached: { userId: string; promise: Promise<CurrentUserResult> } | null = null;

export function resetCurrentUserCache() {
  cached = null;
}

async function fetchCurrentUser(session: Session): Promise<CurrentUserResult> {
  // 1) Existing profile?
  const { data: existing, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", session.user.id)
    .maybeSingle();

  if (profileError) {
    return { kind: "blocked", session, reason: "error", message: getErrorMessage(profileError) };
  }

  let profile = existing;

  // 2) First login: accept an invitation or register the company.
  if (!profile) {
    const { data: created, error: bootstrapError } = await supabase.rpc("bootstrap_profile");
    if (bootstrapError) {
      if (bootstrapError.message === "no_company") {
        return { kind: "needs_company", session };
      }
      return {
        kind: "blocked",
        session,
        reason: "error",
        message: getErrorMessage(bootstrapError),
      };
    }
    profile = created;
  }

  if (!profile) {
    return { kind: "blocked", session, reason: "error", message: getErrorMessage(null) };
  }

  if (profile.disabled) {
    return {
      kind: "blocked",
      session,
      reason: "disabled",
      message: "Il tuo account è stato disabilitato. Contatta un amministratore.",
    };
  }

  // 3) Company
  const { data: tenant, error: tenantError } = await supabase
    .from("tenants")
    .select("*")
    .eq("id", profile.tenant_id)
    .single();

  if (tenantError || !tenant) {
    return { kind: "blocked", session, reason: "error", message: getErrorMessage(tenantError) };
  }

  return { kind: "ready", session, profile, tenant };
}

/**
 * Resolves the signed-in user + profile + tenant. Memoised per user so that the
 * Refine auth provider, access control and React context share a single load.
 */
export async function loadCurrentUser(force = false): Promise<CurrentUserResult> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    cached = null;
    return { kind: "signed_out" };
  }

  if (!force && cached && cached.userId === session.user.id) {
    return cached.promise;
  }

  const promise = fetchCurrentUser(session);
  cached = { userId: session.user.id, promise };

  // Do not keep failures around: the next call should retry.
  promise.then((result) => {
    if (result.kind === "blocked" && cached?.promise === promise) cached = null;
  });

  return promise;
}

export async function signOut() {
  resetCurrentUserCache();
  await supabase.auth.signOut();
}
