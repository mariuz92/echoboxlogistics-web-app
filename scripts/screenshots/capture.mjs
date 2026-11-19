// Takes the product screenshots used on the landing page.
//
//   node scripts/screenshots/capture.mjs            # all shots
//   node scripts/screenshots/capture.mjs orders     # only shots whose name contains "orders"
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
const db = buildDemo(now);
const ADMIN = db.profiles.find((p) => p.full_name === "Giulia Ferri").id;
const RIDER = db.profiles.find((p) => p.full_name === "Luca Bianchi").id;

const desktop = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 };
// A phone screen without device chrome: the landing page shows it as a plain rounded screen.
const phone = { ...devices["iPhone 13"], viewport: { width: 390, height: 760 } };

const dialog = (page) => page.getByRole("dialog").first();

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
    // The day map of the channel board (a tall viewport so the dialog fits).
    name: "crop-channel-board",
    ctx: { ...desktop, viewport: { width: 1440, height: 1500 } },
    as: ADMIN,
    path: "/",
    prepare: async (page) => {
      await page.getByRole("button", { name: /Canali radio/ }).click();
      await dialog(page).waitFor();
      await page.getByText("In uso in questa giornata").waitFor();
      await page.waitForTimeout(900);
    },
    target: (page) => page.locator(".ant-card").filter({ hasText: "Occupazione del" }).first(),
  },
  {
    name: "crop-pickups",
    ctx: desktop,
    as: ADMIN,
    path: "/",
    prepare: async (page) => {
      await page.getByRole("button", { name: "Mostra" }).click();
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
    prepare: async (page) => {
      // Last month is complete, so its totals and charts look like a real month.
      await page.locator(".recharts-surface").first().waitFor();
      await page.getByRole("button", { name: "Mese precedente" }).first().click();
      await page.waitForTimeout(1200);
    },
    clip: { x: 252, y: 80, width: 1172, height: 700 },
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
    prepare: async (page) => {
      await page.locator("input:visible").first().waitFor();
      await page.getByPlaceholder(/Mario Rossi/).fill("Chiara Lombardi");
      await page.getByPlaceholder(/333 1234567/).fill("328 415 7720");
      await page.getByPlaceholder(/esempio/).fill("chiara.l@guidaroma.example");
      await page.getByPlaceholder(/Es\. 25/).fill("25");
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
      VITE_APP_MODE: "app",
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

    for (const shot of shots.filter((s) => s.name.includes(filter))) {
      const context = await browser.newContext({
        ...shot.ctx,
        locale: "it-IT",
        timezoneId: "Europe/Rome",
        colorScheme: shot.dark ? "dark" : "light",
        reducedMotion: "reduce",
      });
      const page = await context.newPage();
      page.on("pageerror", (e) => console.warn(`[${shot.name}] page error:`, e.message));
      await page.clock.setFixedTime(now);
      await installDemoBackend(page, db, { asUserId: shot.as, log: Boolean(process.env.DEMO_LOG) });
      console.log(`… ${shot.name}`);
      await page.goto(BASE + shot.path, { waitUntil: "load" });
      await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
      try {
        if (shot.prepare) await shot.prepare(page);
      } catch (err) {
        console.warn(`✗ ${shot.name}: ${err.message.split("\n")[0]}`);
        await page.screenshot({ path: join(tmpDir, `${shot.name}-failed.png`) });
        await context.close();
        continue;
      }
      await page.waitForTimeout(600);
      const png = join(tmpDir, `${shot.name}.png`);
      const jpg = join(outDir, `${shot.name}.jpg`);
      const opts = { animations: "disabled", ...(shot.clip ? { clip: shot.clip } : {}) };
      const take = (o) => (shot.target ? shot.target(page).screenshot({ ...opts, ...o }) : page.screenshot({ ...opts, ...o }));
      await take({ path: png });
      await take({ path: jpg, type: "jpeg", quality: 84 });
      const webp = spawnSync("convert", [png, "-quality", "80", join(outDir, `${shot.name}.webp`)]);
      console.log(`✓ ${shot.name}${webp.status === 0 ? " (jpg + webp)" : " (jpg)"}`);
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
