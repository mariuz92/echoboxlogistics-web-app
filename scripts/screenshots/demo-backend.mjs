// A minimal in-browser stand-in for the Supabase API, used only to take the
// landing-page screenshots. It answers the PostgREST, RPC, Auth and Realtime
// calls the app makes, from the demo data in ./demo-data.mjs.

import { channelBoard, dashboardInsights, riderActivity } from "./demo-data.mjs";

export const DEMO_SUPABASE_URL = "http://demo-supabase.localhost:54321";
export const STORAGE_KEY = "sb-demo-supabase-auth-token";

const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");

export function demoSession(user, now) {
  const exp = Math.floor(now.getTime() / 1000) + 10 * 365 * 86400;
  const access_token = `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url({
    sub: user.id,
    role: "authenticated",
    aud: "authenticated",
    email: user.email,
    exp,
    iat: Math.floor(now.getTime() / 1000),
    session_id: "demo",
  })}.demo-signature`;
  return {
    access_token,
    token_type: "bearer",
    expires_in: exp - Math.floor(now.getTime() / 1000),
    expires_at: exp,
    refresh_token: "demo-refresh-token",
    user: authUser(user),
  };
}

function authUser(p) {
  return {
    id: p.id,
    aud: "authenticated",
    role: "authenticated",
    email: p.email,
    email_confirmed_at: p.created_at,
    phone: "",
    confirmed_at: p.created_at,
    last_sign_in_at: p.last_login_at,
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: { full_name: p.full_name },
    identities: [],
    created_at: p.created_at,
    updated_at: p.updated_at,
    is_anonymous: false,
  };
}

// --- PostgREST filter evaluation ------------------------------------------------

function splitTopLevel(s) {
  const out = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

function compare(a, b) {
  if (a === null || a === undefined) return NaN;
  const da = Date.parse(a);
  const db = Date.parse(b);
  if (typeof a === "string" && /^\d{4}-\d{2}-\d{2}/.test(a) && !Number.isNaN(da) && !Number.isNaN(db)) {
    return da - db;
  }
  if (typeof a === "number") return a - Number(b);
  return String(a).localeCompare(String(b));
}

function test(row, column, expr) {
  let negate = false;
  if (expr.startsWith("not.")) {
    negate = true;
    expr = expr.slice(4);
  }
  const dot = expr.indexOf(".");
  const op = expr.slice(0, dot);
  const value = expr.slice(dot + 1);
  const v = row[column];
  let ok;
  switch (op) {
    case "eq":
      ok = String(v) === value;
      break;
    case "neq":
      ok = String(v) !== value;
      break;
    case "gt":
      ok = compare(v, value) > 0;
      break;
    case "gte":
      ok = compare(v, value) >= 0;
      break;
    case "lt":
      ok = compare(v, value) < 0;
      break;
    case "lte":
      ok = compare(v, value) <= 0;
      break;
    case "in": {
      const list = value.replace(/^\(|\)$/g, "").split(",").map((x) => x.replace(/^"|"$/g, ""));
      ok = list.includes(String(v));
      break;
    }
    case "is":
      ok = value === "null" ? v === null || v === undefined : String(v) === value;
      break;
    case "ilike": {
      const re = new RegExp(`^${value.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`, "i");
      ok = re.test(String(v ?? ""));
      break;
    }
    default:
      ok = true;
  }
  return negate ? !ok : ok;
}

function logical(row, expr) {
  // expr: "and(a.op.v,b.op.v)" | "or(...)" | "col.op.value"
  const m = /^(and|or)\((.*)\)$/.exec(expr);
  if (m) {
    const parts = splitTopLevel(m[2]);
    return m[1] === "and" ? parts.every((p) => logical(row, p)) : parts.some((p) => logical(row, p));
  }
  const dot = expr.indexOf(".");
  return test(row, expr.slice(0, dot), expr.slice(dot + 1));
}

const RESERVED = new Set(["select", "order", "limit", "offset", "or", "and", "on_conflict", "columns"]);

function runQuery(rows, params) {
  let out = rows.filter((row) => {
    for (const [k, v] of params) {
      if (RESERVED.has(k)) continue;
      if (!test(row, k, v)) return false;
    }
    const or = params.get("or");
    if (or && !logical(row, `or${or}`)) return false;
    return true;
  });
  const order = params.get("order");
  if (order) {
    const keys = order.split(",").map((k) => {
      const [col, dir = "asc"] = k.split(".");
      return { col, desc: dir === "desc" };
    });
    out = [...out].sort((a, b) => {
      for (const { col, desc } of keys) {
        const c = a[col] === b[col] ? 0 : a[col] === null ? 1 : b[col] === null ? -1 : a[col] > b[col] ? 1 : -1;
        if (c) return desc ? -c : c;
      }
      return 0;
    });
  }
  const limit = Number(params.get("limit") ?? 0);
  return limit ? out.slice(0, limit) : out;
}

// --- routing -------------------------------------------------------------------

export async function installDemoBackend(page, db, { asUserId, log = false } = {}) {
  const user = db.profiles.find((p) => p.id === asUserId);
  const isAdmin = user?.roles.includes("admin");

  const tables = {
    orders: () => {
      if (isAdmin) return db.orders;
      return db.orders.filter(
        (o) => o.delivery_rider_id === user.id || o.pickup_rider_id === user.id || o.status === "awaiting_pickup",
      );
    },
    profiles: () => (isAdmin ? db.profiles : db.profiles.filter((p) => p.id === user.id)),
    tenants: () => [db.tenant],
    guides: () => db.guides,
    invitations: () => db.invitations,
    order_events: () => db.order_events,
    rider_activity: () => riderActivity(db),
  };

  const rpcs = {
    touch_login: () => null,
    platform_company_access: () => "full",
    platform_runtime_settings: () => ({ operator_only_companies: false, booking_paused: false, notice: "" }),
    report_platform_issue: () => null,
    bootstrap_profile: () => user,
    get_channel_board: (body) => (isAdmin ? channelBoard(db, body.p_from, body.p_to) : []),
    get_dashboard_insights: (body) => dashboardInsights(db, (body.p_month ?? "").slice(0, 7)),
    get_public_tenant: () => [
      { name: db.tenant.name, slug: db.tenant.slug, timezone: db.tenant.timezone, accepting_bookings: true },
    ],
  };

  const json = (route, body, status = 200, headers = {}) =>
    route.fulfill({
      status,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", ...headers },
      body: JSON.stringify(body),
    });

  await page.route(`${DEMO_SUPABASE_URL}/**`, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    if (req.method() === "OPTIONS") {
      return route.fulfill({
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-headers": "*",
          "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
        },
      });
    }
    if (log) console.log("[demo]", req.method(), path + url.search);

    if (path.startsWith("/auth/v1/user")) return json(route, authUser(user));
    if (path.startsWith("/auth/v1/token")) return json(route, demoSession(user, db.now));
    if (path.startsWith("/auth/v1/logout")) return route.fulfill({ status: 204 });

    if (path.startsWith("/rest/v1/rpc/")) {
      const name = path.slice("/rest/v1/rpc/".length);
      const handler = rpcs[name];
      if (!handler) {
        console.warn("[demo] unknown rpc", name);
        return json(route, null);
      }
      const body = req.postData() ? JSON.parse(req.postData()) : {};
      return json(route, handler(body));
    }

    if (path.startsWith("/rest/v1/")) {
      const table = path.slice("/rest/v1/".length);
      const source = tables[table];
      if (!source) {
        console.warn("[demo] unknown table", table);
        return json(route, []);
      }
      if (req.method() !== "GET" && req.method() !== "HEAD") return json(route, []);
      const rows = runQuery(source(), url.searchParams);
      const wantsObject = (req.headers()["accept"] ?? "").includes("vnd.pgrst.object");
      if (wantsObject) {
        if (rows.length !== 1) {
          return json(route, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned", details: null, hint: null }, 406);
        }
        return json(route, rows[0]);
      }
      return json(route, rows, 200, { "content-range": `0-${Math.max(rows.length - 1, 0)}/${rows.length}` });
    }

    if (path.startsWith("/functions/v1/")) return json(route, { ok: true });
    return json(route, {});
  });

  // Realtime: accept the socket and acknowledge joins/heartbeats, never push changes.
  await page.routeWebSocket(/demo-supabase\.localhost:54321\/realtime/, (ws) => {
    ws.onMessage((raw) => {
      let msg;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (Array.isArray(msg)) {
        const [joinRef, ref, topic, event] = msg;
        if (event === "phx_join" || event === "heartbeat" || event === "access_token" || event === "phx_leave") {
          ws.send(JSON.stringify([joinRef, ref, topic, "phx_reply", { status: "ok", response: { postgres_changes: [] } }]));
        }
      } else if (msg && msg.event) {
        ws.send(
          JSON.stringify({
            topic: msg.topic,
            event: "phx_reply",
            ref: msg.ref,
            join_ref: msg.join_ref,
            payload: { status: "ok", response: { postgres_changes: [] } },
          }),
        );
      }
    });
  });

  if (user) {
    const session = demoSession(user, db.now);
    await page.addInitScript(
      ([key, value]) => {
        window.localStorage.setItem(key, value);
      },
      [STORAGE_KEY, JSON.stringify(session)],
    );
  }
}
