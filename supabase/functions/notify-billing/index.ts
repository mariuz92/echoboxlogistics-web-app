// notify-billing
//
// Sends the subscription e-mails queued in private.billing_notices: limits reached,
// trial ending, past-due and operator reminders. Called every few seconds by the same
// systemd timer as the rider push worker (deploy/supabase/run-push-worker.py), over
// the private loopback gateway - it is never exposed publicly.
//
//   POST /functions/v1/notify-billing      header: X-EchoBox-Push-Worker: <token>
//
// Secrets (already used by the other functions, in .env.functions):
//   PUSH_WORKER_TOKEN      shared secret of the worker
//   RESEND_API_KEY         Resend API key; without it notices stay queued and are retried
//   CONTACT_FROM_EMAIL     sender, e.g. "EchoBox Logistics <billing@your-domain>"
//   BILLING_REPLY_TO       optional reply-to address
//   PLATFORM_APP_URL       optional, e.g. https://platform.example.com (adds a link to the e-mail)

import { timingSafeEqual } from "node:crypto";
import { createClient } from "npm:@supabase/supabase-js@2";
import { buildEmail, type NoticeKind, type NoticePayload } from "./templates.ts";

interface Notice {
  id: string;
  kind: NoticeKind;
  payload: NoticePayload;
  company: string;
  to: string[];
}

const encoder = new TextEncoder();
const expected = encoder.encode(Deno.env.get("PUSH_WORKER_TOKEN") ?? "");
const dbUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const resendKey = Deno.env.get("RESEND_API_KEY") ?? "";
const from = Deno.env.get("CONTACT_FROM_EMAIL") ?? "EchoBox Logistics <onboarding@resend.dev>";
const replyTo = Deno.env.get("BILLING_REPLY_TO") ?? "";
const appUrl = Deno.env.get("PLATFORM_APP_URL") ?? "";

async function send(notice: Notice): Promise<string | null> {
  if (!resendKey) return "email_not_configured";
  if (!notice.to.length) return "no_recipient";
  const email = buildEmail(notice.kind, notice.payload, notice.company, appUrl || undefined);
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from, to: notice.to, subject: email.subject, text: email.text, html: email.html,
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
    });
    return response.ok ? null : `resend_${response.status}`;
  } catch {
    return "resend_unreachable";
  }
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response(null, { status: 405 });
  const supplied = encoder.encode(request.headers.get("X-EchoBox-Push-Worker") ?? "");
  if (expected.length < 32 || supplied.length !== expected.length || !timingSafeEqual(expected, supplied)) {
    return new Response(null, { status: 401 });
  }
  if (!dbUrl || !serviceKey) return Response.json({ error: "missing_database_config" }, { status: 503 });

  const admin = createClient(dbUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await admin.rpc("claim_billing_notices", { p_limit: 10 });
  if (error || !Array.isArray(data)) return Response.json({ error: "billing_claim_failed" }, { status: 503 });

  let sent = 0;
  let failed = 0;
  for (const notice of data as Notice[]) {
    const failure = await send(notice);
    const { error: finishError } = await admin.rpc("finish_billing_notice", {
      p_id: notice.id, p_sent: failure === null, p_error: failure,
    });
    if (failure === null && !finishError) sent += 1;
    else failed += 1;
  }
  return Response.json({ sent, failed });
});
