import { timingSafeEqual } from "node:crypto";
import { createClient } from "npm:@supabase/supabase-js@2";
import { type DeliveryResult, FcmSender, type PushMessage, readFcmCredentials } from "./fcm.ts";

type Claim = { delivery_id: string; lease_id: string };

const encoder = new TextEncoder();
const expected = encoder.encode(Deno.env.get("PUSH_WORKER_TOKEN") ?? "");
const dbUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
let sender: FcmSender | undefined;

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response(null, { status: 405 });
  const supplied = encoder.encode(request.headers.get("X-EchoBox-Push-Worker") ?? "");
  if (expected.length < 32 || supplied.length !== expected.length || !timingSafeEqual(expected, supplied)) {
    return new Response(null, { status: 401 });
  }
  if (!dbUrl || !serviceKey) return Response.json({ error: "missing_database_config" }, { status: 503 });

  const admin = createClient(dbUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: claims, error: claimError } = await admin.rpc("claim_push_deliveries", { p_limit: 16 });
  if (claimError || !Array.isArray(claims)) {
    return Response.json({ error: "push_claim_failed" }, { status: 503 });
  }
  const deliveries = claims as Claim[];
  if (!deliveries.length) return Response.json({ sent: 0 });

  let activeSender: FcmSender;
  let accessToken: string;
  try {
    activeSender = sender ??= new FcmSender(readFcmCredentials(Deno.env.get("FCM_SERVICE_ACCOUNT_JSON")));
    accessToken = await activeSender.authorize();
  } catch {
    // The claims remain leased briefly, allowing the worker to retry after recovery.
    console.error("EchoBox push worker could not authorize with Firebase.");
    return Response.json({ error: "fcm_oauth_failed" }, { status: 503 });
  }

  const outcomes = await Promise.all(deliveries.map(async ({ delivery_id, lease_id }) => {
    const claim = { p_delivery_id: delivery_id, p_lease_id: lease_id };
    const { data: rows, error } = await admin.rpc("read_push_delivery", claim);
    if (error || !Array.isArray(rows) || rows.length > 1) return "database_error";
    const data = rows[0] as PushMessage | undefined;

    const result: DeliveryResult = data
      ? await activeSender.send(accessToken, delivery_id, data)
      : { status: "skipped", code: "assignment_changed" };
    const { error: updateError } = await admin.rpc("finish_push_delivery", {
      ...claim,
      p_result: result.status,
      p_code: result.code ?? null,
      p_retry_after: result.retryAfter ?? null,
      p_token: result.status === "unregistered" ? data?.token : null,
    });
    return updateError ? "database_error" : result.status;
  }));

  const summary: Record<string, number> = {};
  for (const outcome of outcomes) summary[outcome] = (summary[outcome] ?? 0) + 1;
  return Response.json(summary, { status: summary.database_error ? 503 : 200 });
});
