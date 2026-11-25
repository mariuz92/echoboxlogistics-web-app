// Takes the product screenshots used on the landing page.
//
//   node scripts/screenshots/capture.mjs            # all shots
//   node scripts/screenshots/capture.mjs orders     # only shots whose name contains "orders"
//   node scripts/screenshots/capture.mjs "" en      # only the English set (default: it,en)
//
// Every shot is taken twice, from the real app in each language: <name>.jpg/webp (Italian) and
// <name>-en.jpg/webp (English). The landing page shows Italian to Italian visitors and English to everyone else.
//
// It starts the real app (Vite dev server) and answers its Supabase calls with the
// demo data in ./demo-data.mjs (see ./demo-backend.mjs), so no database is needed
// and no real customer data can end up in a screenshot. The clock is frozen at
// DEMO_NOW (default: today 10:25, Rome time) so the day looks busy.
//
// Output: public/images/screens/<name>.jpg (+ .webp when ImageMagick is installed).

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, devices } from "@playwright/test";
import { buildDemo, rome } from "./demo-data.mjs";
import { DEMO_SUPABASE_URL, installDemoBackend } from "./demo-backend.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const outDir = join(root, "public/images/screens");
const tmpDir = join(root, "node_modules/.cache/screens");
const PORT = Number(process.env.SCREENSHOT_PORT ?? 5199);
// Set SCREENSHOT_BASE to reuse a dev server you started yourself (with the demo env).
const BASE = process.env.SCREENSHOT_BASE ?? `http://localhost:${PORT}`;
const filter = process.argv[2] ?? "";
const langs = (process.argv[3] ?? "it,en").split(",").map((l) => l.trim()).filter(Boolean);

function demoNow() {
  if (process.env.DEMO_NOW) return new Date(process.env.DEMO_NOW);
  const d = new Date();
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  return rome(+p.year, +p.month, +p.day, 10, 25);
}

const now = demoNow();
const dbs = { it: buildDemo(now, "it"), en: buildDemo(now, "en") };
const db = dbs.it;
const ADMIN = db.profiles.find((p) => p.full_name === "Giulia Ferri").id;
const RIDER = db.profiles.find((p) => p.full_name === "Luca Bianchi").id;

const desktop = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 };
// A phone screen without device chrome: the landing page shows it as a plain rounded screen.
const phone = { ...devices["iPhone 13"], viewport: { width: 390, height: 760 } };

const dialog = (page) => page.getByRole("dialog").first();

// Texts of the app that the shots look for, in each language.
const TEXT = {
  it: { newOrder: "Nuovo ordine", delivery: "Consegna", occupied: /occupato da/, show: "Mostra", prev: "Mese precedente", brief: "In breve", name: /Mario Rossi/, email: /esempio/, qty: /Es\. 25/ },
  en: { newOrder: "New order", delivery: "Delivery", occupied: /is occupied by/, show: "Show", prev: "Previous month", brief: "In short", name: /John Smith/, email: /example/, qty: /E\.g\. 25/ },
};

/**
 * name:    output file (public/images/screens/<name>.jpg/.webp)
 * target:  optional element to capture instead of the whole viewport
 * clip:    optional viewport region (CSS pixels) to capture
 * @type {{ name: string, ctx: object, as: string | null, path: string,
 *          prepare?: (page) => Promise<void>, target?: (page) => import("@playwright/test").Locator,
 *          clip?: { x: number, y: number, width: number, height: number } }[]}
 */
const shots = [
  {
    // Landing hero: the whole Orders screen.
    name: "web-orders",
    ctx: desktop,
    as: ADMIN,
    path: "/",
    prepare: (page) => page.getByText("Alessandro Greco").first().waitFor(),
  },
  {
    name: "crop-order-detail",
    ctx: desktop,
    as: ADMIN,
    path: "/",
    prepare: async (page) => {
      await page.getByText("James Whitfield").first().click();
      await dialog(page).waitFor();
      await page.waitForTimeout(800);
    },
    target: dialog,
  },
  {
    // The order form: the typed channel is already used by another group at those times.
    name: "crop-channel-check",
    ctx: { ...desktop, viewport: { width: 1440, height: 1400 } },
    as: ADMIN,
    path: "/",
    prepare: async (page, lang) => {
      await page.getByRole("button", { name: TEXT[lang].newOrder }).click();
      const drawer = dialog(page);
      await drawer.locator("#guide_name").fill("Marta Rinaldi");
      await drawer.locator("#radios_count").fill("24");
      await drawer.locator("#delivery_address").fill("Piazza Navona, Roma");
      await drawer.locator("#radio_channel").fill("4");
      await drawer.getByText(TEXT[lang].occupied).waitFor();
      await drawer.getByText(TEXT[lang].delivery, { exact: true }).scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
    },
    clipFn: async (page, lang) => {
      const drawer = dialog(page);
      const top = await drawer.getByText(TEXT[lang].delivery, { exact: true }).boundingBox();
      const status = await drawer.getByText(TEXT[lang].occupied).boundingBox();
      const box = await drawer.boundingBox();
      return { x: box.x, y: top.y - 24, width: box.width, height: status.y + status.height + 32 - (top.y - 24) };
    },
  },
  {
    name: "crop-pickups",
    ctx: desktop,
    as: ADMIN,
    path: "/",
    prepare: async (page, lang) => {
      await page.getByRole("button", { name: TEXT[lang].show }).click();
      await dialog(page).waitFor();
      await page.waitForTimeout(800);
    },
    target: (page) => page.locator(".ant-modal-container, .ant-modal-content").first(),
  },
  {
    name: "crop-dashboard",
    ctx: desktop,
    as: ADMIN,
    path: "/dashboard",
    prepare: async (page, lang) => {
      // Last month is complete, so its totals and findings look like a real month.
      await page.locator(".recharts-surface").first().waitFor();
      await page.getByRole("button", { name: TEXT[lang].prev }).first().click();
      await page.locator(".ant-card", { hasText: TEXT[lang].brief }).first().waitFor();
      await page.waitForTimeout(1200);
    },
    // From the "In breve" findings down through the figures (taller than the viewport).
    fullPage: true,
    clipFn: async (page, lang) => {
      const box = await page.locator(".ant-card", { hasText: TEXT[lang].brief }).first().boundingBox();
      return { x: 252, y: box.y - 10, width: 1172, height: 700 };
    },
  },
  {
    name: "crop-rider",
    ctx: phone,
    as: RIDER,
    path: "/",
    prepare: (page) => page.getByText("Alessandro Greco").first().waitFor(),
  },
  {
    name: "crop-booking",
    ctx: phone,
    as: null,
    path: `/book/${db.tenant.slug}`,
    prepare: async (page, lang) => {
      await page.locator("input:visible").first().waitFor();
      await page.getByPlaceholder(TEXT[lang].name).fill("Chiara Lombardi");
      await page.getByPlaceholder(/333 1234567/).fill("328 415 7720");
      await page.getByPlaceholder(TEXT[lang].email).fill("chiara.l@guidaroma.example");
      await page.getByPlaceholder(TEXT[lang].qty).fill("25");
      await page.locator("body").click({ position: { x: 5, y: 5 } });
    },
  },
];

async function waitForServer() {
  for (let i = 0; i < 120; i++) {
    try {
      const res = await fetch(BASE);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("Vite dev server did not start");
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  mkdirSync(tmpDir, { recursive: true });

  const vite = process.env.SCREENSHOT_BASE ? null : spawn("npx", ["vite", "--port", String(PORT), "--strictPort"], {
    cwd: root,
    env: {
      ...process.env,
      VITE_SUPABASE_URL: DEMO_SUPABASE_URL,
      VITE_SUPABASE_ANON_KEY: "demo-anon-key",
      VITE_GOOGLE_MAPS_API_KEY: "",
      VITE_PUBLIC_BOOKING_SLUG: db.tenant.slug,
    },
    stdio: "ignore",
  });

  try {
    await waitForServer();
    // The project's @playwright/test may expect another browser build than the one
    // installed on the machine: CHROMIUM_PATH points at a specific binary.
    const executablePath =
      process.env.CHROMIUM_PATH ?? (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
    const browser = await chromium.launch(executablePath ? { executablePath } : {});

    for (const lang of langs) for (const shot of shots.filter((s) => s.name.includes(filter))) {
      const outName = lang === "en" ? `${shot.name}-en` : shot.name;
      const context = await browser.newContext({
        ...shot.ctx,
        locale: lang === "en" ? "en-GB" : "it-IT",
        timezoneId: "Europe/Rome",
        colorScheme: shot.dark ? "dark" : "light",
        reducedMotion: "reduce",
      });
      // the app remembers its language in this browser storage key (src/i18n/index.ts)
      await context.addInitScript((l) => { try { localStorage.setItem("echobox-app-lang", l); } catch { /* ignore */ } }, lang);
      const page = await context.newPage();
      page.on("pageerror", (e) => console.warn(`[${shot.name}] page error:`, e.message));
      await page.clock.setFixedTime(now);
      await installDemoBackend(page, dbs[lang], { asUserId: shot.as, log: Boolean(process.env.DEMO_LOG) });
      console.log(`… ${outName}`);
      await page.goto(BASE + shot.path, { waitUntil: "load" });
      await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
      try {
        if (shot.prepare) await shot.prepare(page, lang);
      } catch (err) {
        console.warn(`✗ ${outName}: ${err.message.split("\n")[0]}`);
        await page.screenshot({ path: join(tmpDir, `${outName}-failed.png`) });
        await context.close();
        continue;
      }
      await page.waitForTimeout(600);
      const png = join(tmpDir, `${outName}.png`);
      const jpg = join(outDir, `${outName}.jpg`);
      const clip = shot.clipFn ? await shot.clipFn(page, lang) : shot.clip;
      const opts = { animations: "disabled", ...(shot.fullPage ? { fullPage: true } : {}), ...(clip ? { clip } : {}) };
      const take = (o) => (shot.target ? shot.target(page).screenshot({ ...opts, ...o }) : page.screenshot({ ...opts, ...o }));
      await take({ path: png });
      await take({ path: jpg, type: "jpeg", quality: 84 });
      const webp = spawnSync("convert", [png, "-quality", "80", join(outDir, `${outName}.webp`)]);
      console.log(`✓ ${outName}${webp.status === 0 ? " (jpg + webp)" : " (jpg)"}`);
      await context.close();
    }
    await browser.close();
  } finally {
    vite?.kill("SIGTERM");
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
