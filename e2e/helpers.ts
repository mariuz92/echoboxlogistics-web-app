import {
  expect,
  test as base,
  type APIRequestContext,
  type Browser,
  type BrowserContextOptions,
  type Page,
  type PlaywrightWorkerArgs,
} from "@playwright/test";

export { expect };
export type { Locator, Page } from "@playwright/test";
import { E2E, serviceRoleKey } from "./env";

export const BASE_URL = "http://localhost:5173";

/** Demo accounts created by supabase/seed.sql (local stack only). */
export const ACCOUNTS = {
  admin: { email: "admin@echobox.test", password: "Password123!", name: "Demo Admin" },
  rider1: { email: "rider1@echobox.test", password: "Password123!", name: "Luca Rider" },
  rider2: { email: "rider2@echobox.test", password: "Password123!", name: "Sara Rider" },
} as const;

export type Account = { email: string; password: string; name?: string };

/** Unique, readable suffix so repeated runs never collide. */
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

/** Test data is always prefixed "E2E " so it can be found and cleaned up. */
export const e2eName = (label: string) => `E2E ${label} ${uid()}`;

/** A phone number that is unique per call (the public form throttles per phone). */
export const uniquePhone = () => `3${Math.floor(100000000 + Math.random() * 899999999)}`;

/**
 * The app works in the company's time zone (the browser contexts run in Europe/Rome),
 * so "today" in the tests must be Rome's today too. Using the runner's own date broke the
 * tests between 23:00 and 24:00 UTC, when Rome is already on the next day.
 */
const TEST_TIMEZONE = "Europe/Rome";

function dayInRome(days: number): { y: number; m: number; d: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: TEST_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(new Date())
      .map((part) => [part.type, part.value]),
  );
  const shifted = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) + days));
  return { y: shifted.getUTCFullYear(), m: shifted.getUTCMonth() + 1, d: shifted.getUTCDate() };
}

/** dd/mm/yyyy hh:mm, `days` from now (Rome time), as typed into the date pickers. */
export function pickerDate(days: number, hour = 10, minute = 30): string {
  const { y, m, d } = dayInRome(days);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d)}/${p(m)}/${y} ${p(hour)}:${p(minute)}`;
}

/** yyyy-mm-dd, `days` from now (Rome time; the format of the ?date= URL parameter). */
export function isoDay(days: number): string {
  const { y, m, d } = dayInRome(days);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${y}-${p(m)}-${p(d)}`;
}

export const PASSWORD = "E2eTest2026x";

export async function login(page: Page, account: Account) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password").fill(account.password);
  await page.getByRole("button", { name: "Accedi" }).click();
}

export async function loginAsAdmin(page: Page) {
  await login(page, ACCOUNTS.admin);
  await expect(page.getByRole("heading", { name: "Ordini", level: 2 })).toBeVisible();
}

export async function logout(page: Page) {
  await page.getByRole("button", { name: /Demo Admin|Rider|Amministratore/ }).first().click();
  await page.getByRole("menuitem", { name: "Esci" }).click();
  await expect(page).toHaveURL(/\/login/);
}

/** Fails the test on uncaught page errors or console errors (React warnings included). */
export function failOnBrowserErrors(page: Page) {
  const problems: string[] = [];
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    // Network failures are asserted explicitly where they matter.
    if (/Failed to load resource/.test(text)) return;
    problems.push(`console.error: ${text}`);
  });
  return {
    expectNone: () => expect(problems, `unexpected browser errors:\n${problems.join("\n")}`).toEqual([]),
  };
}

/* -------------------------------------------------------------------------- */
/* Mail catcher                                                               */
/* -------------------------------------------------------------------------- */

interface MailSummary {
  ID: string;
  Subject: string;
  To: { Address: string }[];
}

/** Waits for an email to `to` and returns its body. */
export async function waitForMail(
  request: APIRequestContext,
  to: string,
  subjectPart?: string,
): Promise<{ subject: string; html: string; text: string }> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const res = await request.get(`${E2E.mailUrl}/api/v1/messages?limit=100`);
    const { messages = [] } = (await res.json()) as { messages?: MailSummary[] };
    const found = messages.find(
      (m) =>
        m.To.some((t) => t.Address.toLowerCase() === to.toLowerCase()) &&
        (!subjectPart || m.Subject.toLowerCase().includes(subjectPart.toLowerCase())),
    );
    if (found) {
      const full = await request.get(`${E2E.mailUrl}/api/v1/message/${found.ID}`);
      const body = (await full.json()) as { HTML?: string; Text?: string };
      return { subject: found.Subject, html: body.HTML ?? "", text: body.Text ?? "" };
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No email for ${to}${subjectPart ? ` (subject ~ "${subjectPart}")` : ""} within 20s`);
}

/** The first Supabase Auth link in an email (confirm signup / invite / reset). */
export function authLink(mail: { html: string; text: string }): string {
  const match = (mail.html || mail.text).match(/href="([^"]*\/auth\/v1\/verify[^"]*)"/);
  if (!match) throw new Error("No Supabase Auth link found in the email");
  return match[1].replace(/&amp;/g, "&");
}

/* -------------------------------------------------------------------------- */
/* Cleanup through the public REST API, as the demo admin                     */
/* -------------------------------------------------------------------------- */

async function adminToken(request: APIRequestContext): Promise<string> {
  const res = await request.post(`${E2E.supabaseUrl}/auth/v1/token?grant_type=password`, {
    headers: { apikey: E2E.anonKey!, "Content-Type": "application/json" },
    data: { email: ACCOUNTS.admin.email, password: ACCOUNTS.admin.password },
  });
  expect(res.ok(), "demo admin must be able to sign in for cleanup").toBeTruthy();
  return ((await res.json()) as { access_token: string }).access_token;
}

/** Shifts and availability the tests planned (the demo company has none of its own). */
async function cleanupShifts(request: APIRequestContext, headers: Record<string, string>) {
  const rpc = (name: string, data: unknown) =>
    request.post(`${E2E.supabaseUrl}/rest/v1/rpc/${name}`, { headers, data });
  const shifts = await request.get(`${E2E.supabaseUrl}/rest/v1/rider_shifts?select=id`, { headers });
  if (shifts.ok()) {
    for (const { id } of (await shifts.json()) as { id: string }[]) await rpc("admin_delete_shift", { p_shift_id: id });
  }
  const needs = await request.get(`${E2E.supabaseUrl}/rest/v1/shift_needs?select=id`, { headers });
  if (needs.ok()) {
    for (const { id } of (await needs.json()) as { id: string }[]) await rpc("admin_delete_need", { p_need_id: id });
  }
  const availability = await request.get(`${E2E.supabaseUrl}/rest/v1/rider_availability?select=rider_id,start_at`, { headers });
  if (availability.ok()) {
    const days = new Set<string>();
    for (const row of (await availability.json()) as { rider_id: string; start_at: string }[]) {
      const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date(row.start_at));
      days.add(`${row.rider_id}|${day}`);
    }
    for (const key of days) {
      const [rider, day] = key.split("|");
      await rpc("save_availability", { p_day: day, p_windows: [], p_rider_id: rider });
    }
  }
}

/**
 * Removes what tests created:
 *  - orders and guide contacts named "E2E …" (open orders hold radio channels, so leaving
 *    them behind would eventually exhaust the channels on a long-lived local database);
 *  - with the local service-role key: users "e2e-…@…", their invitations and "E2E …" companies.
 */
export async function cleanupE2eData(playwright: PlaywrightWorkerArgs["playwright"]) {
  const request = await playwright.request.newContext();
  try {
    const token = await adminToken(request);
    const headers = { apikey: E2E.anonKey!, Authorization: `Bearer ${token}` };
    await cleanupShifts(request, headers);
    await request.delete(`${E2E.supabaseUrl}/rest/v1/orders?guide_name=like.E2E *`, { headers });
    await request.delete(`${E2E.supabaseUrl}/rest/v1/guides?full_name=like.E2E *`, { headers });

    const key = serviceRoleKey();
    if (!key) return;
    const service = { apikey: key, Authorization: `Bearer ${key}` };
    const list = await request.get(`${E2E.supabaseUrl}/auth/v1/admin/users?per_page=1000`, { headers: service });
    const { users = [] } = (await list.json()) as { users?: { id: string; email?: string }[] };
    for (const user of users.filter((u) => u.email?.startsWith("e2e-"))) {
      await request.delete(`${E2E.supabaseUrl}/auth/v1/admin/users/${user.id}`, { headers: service });
    }
    await request.delete(`${E2E.supabaseUrl}/rest/v1/invitations?email=like.e2e-*`, { headers: service });
    await request.delete(`${E2E.supabaseUrl}/rest/v1/tenants?name=like.E2E *`, { headers: service });
  } finally {
    await request.dispose();
  }
}

/* -------------------------------------------------------------------------- */
/* Global gate: every test fails on browser console errors / uncaught errors  */
/* -------------------------------------------------------------------------- */

let currentProblems: string[] | null = null;

function watch(page: Page, problems: string[]) {
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    // HTTP errors are asserted where they matter (e.g. a wrong password returns 400 on purpose).
    if (/Failed to load resource/.test(text)) return;
    problems.push(`console.error: ${text}`);
  });
}

/**
 * Drop-in replacement for Playwright's `test`: besides the normal behaviour, a test fails
 * when the app logs a console error (React warnings, deprecated antd props, duplicate keys…)
 * or throws an uncaught exception in any page of its browser context.
 */
type GateFixtures = { browserErrorGate: undefined };

export const test = base.extend<GateFixtures>({
  browserErrorGate: [
    async ({ context }, use) => {
      const problems: string[] = [];
      currentProblems = problems;
      for (const page of context.pages()) watch(page, problems);
      context.on("page", (page) => watch(page, problems));
      await use(undefined);
      currentProblems = null;
      expect(problems, `unexpected browser errors:\n${problems.join("\n")}`).toEqual([]);
    },
    { auto: true },
  ],
});

/** A separate browser (e.g. a rider's phone) that is covered by the same error gate. */
export async function newUserContext(browser: Browser, options: BrowserContextOptions = {}) {
  const context = await browser.newContext({
    baseURL: BASE_URL,
    locale: "it-IT",
    timezoneId: "Europe/Rome",
    ...options,
  });
  if (currentProblems) {
    const problems = currentProblems;
    context.on("page", (page) => watch(page, problems));
  }
  return context;
}
