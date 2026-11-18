// invite-member
//
// Lets a tenant admin invite a rider / admin by email.
//
//   POST /functions/v1/invite-member
//   Authorization: Bearer <admin user JWT>
//   { "email": "rider@example.com", "full_name": "Mario Rossi", "roles": ["rider"] }
//
// 1. verifies the caller is an active admin (using the caller's own JWT, so RLS
//    and the profiles table are the source of truth),
// 2. stores a pending row in public.invitations (service role),
// 3. asks Supabase Auth to send the invite email. The invitee lands on
//    <SITE_URL>/join, sets a password and public.bootstrap_profile() attaches
//    them to the tenant with the invited roles.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Public URL of the web app (the `platform.` host in production).
const SITE_URL = (Deno.env.get("SITE_URL") ?? "http://localhost:5173").replace(/\/$/, "");

const VALID_ROLES = new Set(["admin", "rider"]);
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req) });
  }
  if (req.method !== "POST") {
    return json(req, { error: "method_not_allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return json(req, { error: "unauthorized" }, 401);
  }

  // --- 1. Who is calling? -----------------------------------------------------
  const asCaller = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const { data: userData, error: userError } = await asCaller.auth.getUser();
  if (userError || !userData.user) {
    return json(req, { error: "unauthorized" }, 401);
  }

  const { data: caller, error: callerError } = await asCaller
    .from("profiles")
    .select("id, tenant_id, roles, disabled")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (callerError || !caller || caller.disabled || !caller.roles.includes("admin")) {
    return json(req, { error: "forbidden" }, 403);
  }

  // --- 2. Validate input ------------------------------------------------------
  let body: { email?: string; full_name?: string; roles?: string[] };
  try {
    body = await req.json();
  } catch {
    return json(req, { error: "invalid_json" }, 400);
  }

  const email = (body.email ?? "").trim().toLowerCase();
  const fullName = (body.full_name ?? "").trim().slice(0, 120);
  const roles = Array.isArray(body.roles) ? [...new Set(body.roles)] : [];

  if (!EMAIL_RE.test(email) || email.length > 200) {
    return json(req, { error: "invalid_email" }, 400);
  }
  if (roles.length === 0 || !roles.every((r) => VALID_ROLES.has(r))) {
    return json(req, { error: "invalid_roles" }, 400);
  }

  // --- 3. Record the invitation and send the email ----------------------------
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // Refresh a still-pending invitation instead of failing on the unique index.
  await admin
    .from("invitations")
    .delete()
    .eq("tenant_id", caller.tenant_id)
    .eq("email_key", email)
    .is("accepted_at", null);

  const { data: invitation, error: insertError } = await admin
    .from("invitations")
    .insert({
      tenant_id: caller.tenant_id,
      email,
      full_name: fullName || null,
      roles,
      invited_by: caller.id,
    })
    .select("id")
    .single();

  if (insertError || !invitation) {
    console.error("invitation insert failed", insertError);
    return json(req, { error: "invitation_failed" }, 500);
  }

  const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${SITE_URL}/join`,
    data: fullName ? { full_name: fullName } : undefined,
  });

  if (inviteError) {
    // Do not leave a dangling invitation if the email could not be sent.
    await admin.from("invitations").delete().eq("id", invitation.id);
    const alreadyRegistered =
      inviteError.status === 422 || /already.*registered/i.test(inviteError.message);
    return json(
      req,
      { error: alreadyRegistered ? "already_registered" : "email_failed" },
      alreadyRegistered ? 409 : 502,
    );
  }

  return json(req, { ok: true, invitation_id: invitation.id }, 201);
});
