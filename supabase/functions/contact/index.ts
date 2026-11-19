// contact
//
// Contact form of the marketing site. Public: no login needed.
//
//   POST /functions/v1/contact
//   { "name": "…", "email": "…", "company": "…", "phone": "…", "message": "…",
//     "locale": "it" | "en" | "de" | "fr", "website": "" }
//
// 1. validates the input (`website` is a honeypot: humans never see that field),
// 2. rate-limits by hashed IP (5 per hour) and globally (60 per hour),
// 3. stores the message in public.contact_messages (service role),
// 4. e-mails it to CONTACT_TO_EMAIL through Resend (https://resend.com), with
//    Reply-To set to the sender so the owner can answer straight from the inbox.
//
// The message is saved even if the e-mail cannot be sent (no key configured, or
// the provider is down); the error is recorded on the row.
//
// Secrets (supabase secrets set …):
//   CONTACT_TO_EMAIL    where notifications go (required for the e-mail)
//   RESEND_API_KEY      Resend API key (required for the e-mail)
//   CONTACT_FROM_EMAIL  sender, e.g. "Rondo <hello@your-domain>"
//                       (default: Resend's test sender, which only delivers to
//                       the address of the Resend account owner)
//   CONTACT_IP_SALT     optional salt for the IP hash
//   ALLOWED_ORIGINS     CORS allow-list (shared with the other functions)

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TO = Deno.env.get("CONTACT_TO_EMAIL") ?? "";
const FROM = Deno.env.get("CONTACT_FROM_EMAIL") ?? "Rondo <onboarding@resend.dev>";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const IP_SALT = Deno.env.get("CONTACT_IP_SALT") ?? "echobox-contact";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const LOCALES = new Set(["it", "en", "de", "fr"]);
const PER_IP_PER_HOUR = 5;
const GLOBAL_PER_HOUR = 60;

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

async function sha256(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req) });
  }
  if (req.method !== "POST") {
    return json(req, { error: "method_not_allowed" }, 405);
  }

  // --- 1. Validate --------------------------------------------------------------
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(req, { error: "invalid_json" }, 400);
  }

  // Bots fill every field: pretend it worked and drop the message.
  if (str(body.website, 200) !== "") {
    return json(req, { ok: true }, 201);
  }

  const name = str(body.name, 120);
  const email = str(body.email, 200).toLowerCase();
  const company = str(body.company, 160);
  const phone = str(body.phone, 40);
  const message = str(body.message, 4000);
  const locale = LOCALES.has(str(body.locale, 5)) ? str(body.locale, 5) : null;

  if (name.length < 2) return json(req, { error: "invalid_name" }, 400);
  if (!EMAIL_RE.test(email)) return json(req, { error: "invalid_email" }, 400);
  if (message.length < 10) return json(req, { error: "invalid_message" }, 400);

  // --- 2. Rate limit ------------------------------------------------------------
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const ipHash = await sha256(`${IP_SALT}:${ip}`);
  const hourAgo = new Date(Date.now() - 3600_000).toISOString();

  const [perIp, global] = await Promise.all([
    admin
      .from("contact_messages")
      .select("id", { count: "exact", head: true })
      .eq("ip_hash", ipHash)
      .gte("created_at", hourAgo),
    admin.from("contact_messages").select("id", { count: "exact", head: true }).gte("created_at", hourAgo),
  ]);
  if ((perIp.count ?? 0) >= PER_IP_PER_HOUR || (global.count ?? 0) >= GLOBAL_PER_HOUR) {
    return json(req, { error: "too_many_requests" }, 429);
  }

  // --- 3. Store -----------------------------------------------------------------
  const { data: row, error: insertError } = await admin
    .from("contact_messages")
    .insert({
      name,
      email,
      company: company || null,
      phone: phone || null,
      message,
      locale,
      ip_hash: ipHash,
      user_agent: str(req.headers.get("user-agent"), 400) || null,
    })
    .select("id, created_at")
    .single();

  if (insertError || !row) {
    console.error("contact insert failed", insertError);
    return json(req, { error: "save_failed" }, 500);
  }

  // --- 4. Notify ----------------------------------------------------------------
  let emailError: string | null = null;
  if (!TO || !RESEND_API_KEY) {
    emailError = "email_not_configured";
  } else {
    const lines: [string, string][] = [
      ["Nome", name],
      ["Email", email],
      ["Azienda", company || "—"],
      ["Telefono", phone || "—"],
      ["Lingua", locale ?? "—"],
    ];
    const html = `
      <h2 style="font-family:sans-serif">Nuovo messaggio dal sito</h2>
      <table style="font-family:sans-serif;border-collapse:collapse">
        ${lines
          .map(
            ([k, v]) =>
              `<tr><td style="padding:4px 12px 4px 0;color:#666">${k}</td><td style="padding:4px 0">${escapeHtml(v)}</td></tr>`,
          )
          .join("")}
      </table>
      <p style="font-family:sans-serif;white-space:pre-wrap;border-left:3px solid #1d5fa8;padding-left:12px">${escapeHtml(message)}</p>
      <p style="font-family:sans-serif;color:#888;font-size:12px">ID ${row.id}</p>`;
    const text = `${lines.map(([k, v]) => `${k}: ${v}`).join("\n")}\n\n${message}\n\nID ${row.id}`;

    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: FROM,
          to: TO.split(",").map((s) => s.trim()).filter(Boolean),
          reply_to: email,
          subject: `Contatto dal sito: ${name}${company ? ` (${company})` : ""}`,
          html,
          text,
        }),
      });
      if (!res.ok) emailError = `resend_${res.status}: ${(await res.text()).slice(0, 300)}`;
    } catch (err) {
      emailError = `resend_unreachable: ${String(err).slice(0, 300)}`;
    }
  }

  await admin
    .from("contact_messages")
    .update(emailError ? { email_error: emailError } : { emailed_at: new Date().toISOString() })
    .eq("id", row.id);
  if (emailError) console.error("contact email not sent", emailError);

  // The visitor does not need to know whether the e-mail went out: the message is saved.
  return json(req, { ok: true }, 201);
});
