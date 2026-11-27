// public-plans
//
// The plans and prices shown on the marketing site. Public: no login, no secret, read-only.
//
//   GET /functions/v1/public-plans   ->  { "plans": [ { code, name, price_month, ... } ] }
//
// It returns the plans an operator marked as available and public in the Superadmin console
// (public.get_public_plans, callable only with the service role). The answer may be cached for
// a few minutes by browsers and the CDN, so a changed price shows up on the site within minutes.
// If this function is not deployed or unreachable, the landing page keeps its built-in prices.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CACHE_SECONDS = 300;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "GET" && req.method !== "POST") return json(req, { error: "method_not_allowed" }, 405);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data, error } = await admin.rpc("get_public_plans");
  if (error || !Array.isArray(data)) {
    console.error("public-plans failed", error);
    return json(req, { error: "plans_unavailable" }, 503);
  }
  const response = json(req, { plans: data });
  response.headers.set("Cache-Control", `public, max-age=${CACHE_SECONDS}, s-maxage=${CACHE_SECONDS}`);
  return response;
});
