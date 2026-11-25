import type { Session } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabase";
import { getErrorMessage } from "../../lib/errors";
import type { AccessMode } from "../platform/api";
import type { Profile, Tenant } from "../../types/domain";
import { t } from "../../i18n";

export type CurrentUserResult =
  | { kind: "signed_out" }
  | { kind: "ready"; session: Session; profile: Profile; tenant: Tenant; accessMode: AccessMode }
  /** Signed in, but not attached to any company yet (e.g. first Google login). */
  | { kind: "needs_company"; session: Session }
  | { kind: "pending_invite"; session: Session }
  | {
      kind: "blocked";
      session: Session | null;
      reason: "disabled" | "error";
      /** Machine code (e.g. "company_exists") the login page can translate. */
      code?: string;
      message: string;
    };

let cached: { userId: string; promise: Promise<CurrentUserResult>; settled: boolean } | null = null;

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
      if (bootstrapError.message === "invitation_pending") return { kind: "pending_invite", session };
      if (bootstrapError.message === "no_company") {
        return { kind: "needs_company", session };
      }
      return {
        kind: "blocked",
        session,
        reason: "error",
        code: bootstrapError.message,
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
      code: "disabled",
      message: t("Il tuo account è stato disabilitato. Contatta un amministratore."),
    };
  }

  const { data: accessMode, error: accessError } = await supabase.rpc("platform_company_access");
  if (accessError) {
    return { kind: "blocked", session, reason: "error", message: getErrorMessage(accessError) };
  }
  if (accessMode === "suspended") {
    return {
      kind: "blocked", session, reason: "disabled", code: "company_suspended",
      message: getErrorMessage("company_suspended"),
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

  return { kind: "ready", session, profile, tenant, accessMode: accessMode as AccessMode };
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

  // A load that is already running is always shared (even when `force` is set): several
  // parts of the app ask for the user at the same moment after a sign-in, and each fresh
  // load would otherwise race the others (e.g. creating the profile twice).
  if (cached && cached.userId === session.user.id && (!force || !cached.settled)) {
    return cached.promise;
  }

  const promise = fetchCurrentUser(session);
  const entry = { userId: session.user.id, promise, settled: false };
  cached = entry;

  void promise.then(
    (result) => {
      entry.settled = true;
      // Do not keep failures around: the next call should retry.
      if (result.kind === "blocked" && cached === entry) cached = null;
    },
    () => {
      entry.settled = true;
      if (cached === entry) cached = null;
    },
  );

  return promise;
}

export async function signOut() {
  resetCurrentUserCache();
  await supabase.auth.signOut();
}

/* -------------------------------------------------------------------------- */
/* One-shot notice for the login page                                         */
/* -------------------------------------------------------------------------- */

const NOTICE_KEY = "echobox.loginNotice";

/** Remembers why the user was sent back to the login page (survives the redirect). */
export function setLoginNotice(code: string) {
  try {
    sessionStorage.setItem(NOTICE_KEY, code);
  } catch {
    /* storage unavailable: the user just sees the plain login form */
  }
}

/** Returns and clears the pending notice, if any. */
export function takeLoginNotice(): string | null {
  try {
    const code = sessionStorage.getItem(NOTICE_KEY);
    if (code) sessionStorage.removeItem(NOTICE_KEY);
    return code;
  } catch {
    return null;
  }
}
