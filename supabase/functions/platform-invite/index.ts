import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";

const url = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const siteUrl = Deno.env.get("SITE_URL")?.replace(/\/$/, "");
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "method_not_allowed" }, 405);
  if (!siteUrl) return json(req, { error: "invitation_site_not_configured" }, 503);

  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return json(req, { error: "unauthorized" }, 401);
  const input = await req.json().catch(() => null);
  const id = typeof input?.invitation_id === "string" ? input.invitation_id : "";
  if (!uuid.test(id)) return json(req, { error: "invalid_invitation_id" }, 400);

  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  // PostgREST verifies the user JWT. The RPC requires a live operator and AAL2
  // before claiming the invitation or returning its recipient.
  const { data: claim, error } = await caller.rpc("platform_console_action", {
    p_action: "claim_invitation",
    p_values: { invitation_id: id, reason: "Send or resend company invitation" },
  });
  if (error || !claim) {
    return json(req, { error: error?.message ?? "invitation_retry_unavailable" },
      error?.code === "42501" ? 403 : 409);
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  let status = "failed";
  try {
    const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(claim.email, {
      redirectTo: `${siteUrl}/join`,
    });
    if (!inviteError) status = "sent";
    else if (["email_exists", "user_already_exists"].includes(inviteError.code ?? "") ||
      /already (been )?(registered|exists)/i.test(inviteError.message)) {
      const publicAuth = createClient(url, anonKey, { auth: { persistSession: false } });
      const { error: linkError } = await publicAuth.auth.signInWithOtp({
        email: claim.email,
        options: { shouldCreateUser: false, emailRedirectTo: `${siteUrl}/join` },
      });
      status = linkError ? "existing_account" : "sent";
    }
  } catch {
    // Record the failed delivery attempt without copying provider response bodies.
  }

  const { data: recorded, error: recordError } = await admin.rpc("platform_finish_invitation", {
    p_invitation_id: id,
    p_attempt_id: claim.attempt_id,
    p_state: status,
  });
  if (recordError || !recorded) return json(req, { error: "invitation_result_unavailable" }, 503);
  return json(req, { state: status }, 200);
});
