import { readFileSync } from "node:fs";
import { expect, test } from "./helpers";
import {
  cleanupE2eData,
  e2eName,
  failOnBrowserErrors,
  isoDay,
  loginAsAdmin,
  uniquePhone,
} from "./helpers";

test.describe("guides address book", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/guides");
  });

  test.afterAll(async ({ playwright }) => {
    await cleanupE2eData(playwright);
  });

  test("create, search, edit and delete a guide, and reject a duplicate phone", async ({ page }) => {
    const name = e2eName("Guida");
    const phone = `+39 ${uniquePhone()}`;
    const drawer = page.getByRole("dialog");

    // create (with validation first)
    await page.getByRole("button", { name: "Nuova guida" }).click();
    await drawer.getByRole("button", { name: "Salva" }).click();
    await expect(drawer.getByText("Inserisci il nome")).toBeVisible();
    await drawer.getByLabel("Nome e cognome (o gruppo)").fill(name);
    await drawer.getByLabel("Telefono").fill(phone);
    await drawer.getByLabel("Email").fill("guida.e2e@example.com");
    await drawer.getByRole("button", { name: "Salva" }).click();
    await expect(page.getByText("Guida aggiunta")).toBeVisible();

    // search
    await page.getByPlaceholder("Cerca per nome, telefono o email…").fill(name);
    const row = page.getByRole("row").filter({ hasText: name });
    await expect(row).toBeVisible();
    await expect(page.locator("tbody tr.ant-table-row")).toHaveCount(1);

    // the same phone cannot be added twice (matched on digits, not on formatting)
    await page.getByRole("button", { name: "Nuova guida" }).click();
    await drawer.getByLabel("Nome e cognome (o gruppo)").fill(e2eName("Doppione"));
    await drawer.getByLabel("Telefono").fill(phone.replace(/\s/g, ""));
    await drawer.getByRole("button", { name: "Salva" }).click();
    await expect(page.getByText("Esiste già un elemento con questi dati.")).toBeVisible();
    await drawer.getByRole("button", { name: "Annulla" }).click();

    // edit
    await row.getByRole("button", { name: "Modifica" }).click();
    await drawer.getByLabel("Note").fill("Parla inglese e francese");
    await drawer.getByRole("button", { name: "Salva" }).click();
    await expect(page.getByText("Guida aggiornata")).toBeVisible();

    // delete
    await row.getByRole("button", { name: "Elimina" }).click();
    await page.getByRole("dialog").filter({ hasText: `Eliminare ${name}?` }).getByRole("button", { name: "Elimina" }).click();
    await expect(page.getByText("Guida eliminata")).toBeVisible();
    await expect(row).toHaveCount(0);
  });

  test("a guide from the address book pre-fills a new order", async ({ page }) => {
    const name = e2eName("Rubrica");
    const phone = `+39 ${uniquePhone()}`;
    const drawer = page.getByRole("dialog");
    await page.getByRole("button", { name: "Nuova guida" }).click();
    await drawer.getByLabel("Nome e cognome (o gruppo)").fill(name);
    await drawer.getByLabel("Telefono").fill(phone);
    await drawer.getByRole("button", { name: "Salva" }).click();
    await expect(page.getByText("Guida aggiunta")).toBeVisible();

    await page.goto("/");
    await page.getByRole("button", { name: "Nuovo ordine" }).click();
    await drawer.locator("#guide_id").fill(name);
    await page.locator(".ant-select-dropdown:visible .ant-select-item-option").filter({ hasText: name }).click();
    await expect(drawer.locator("#guide_name")).toHaveValue(name);
    await expect(drawer.locator("#guide_phone")).toHaveValue(phone);
  });
});

test.describe("calendar", () => {
  test("shows the month, opens a day in the orders list, and exports a CSV", async ({ page }) => {
    const browserErrors = failOnBrowserErrors(page);
    await loginAsAdmin(page);
    await page.goto("/calendar");
    await expect(page.getByRole("heading", { name: "Calendario", level: 2 })).toBeVisible();
    await expect(page.getByText(/\d+ consegn[ae]/).first()).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Esporta CSV" }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^calendario_\d{4}-\d{2}\.csv$/);
    const csv = readFileSync(await download.path(), "utf8");
    expect(csv).toContain('"Data";"Consegne";"Ritiri"');

    await page.locator(`td[title="${isoDay(0)}"]`).click();
    await expect(page).toHaveURL(new RegExp(`date=${isoDay(0)}&period=day`));
    await expect(page.getByRole("heading", { name: "Ordini", level: 2 })).toBeVisible();
    browserErrors.expectNone();
  });
});

test.describe("dashboard", () => {
  test("renders the insights, charts and tables, and navigates between months", async ({ page }) => {
    const browserErrors = failOnBrowserErrors(page);
    await loginAsAdmin(page);
    await page.goto("/dashboard");

    for (const kpi of ["Incasso", "Ordini", "Valore medio ordine", "Incasso per radio", "Consegne puntuali", "Radio perse"]) {
      await expect(page.getByText(kpi, { exact: true }).first()).toBeVisible();
    }
    // the month in progress says what it is measured against
    await expect(page.getByText("Mese in corso", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("In breve", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Gli ultimi 12 mesi")).toBeVisible();
    await expect(page.getByText("Radio fuori nello stesso momento")).toBeVisible();
    await expect(page.getByText("Quando servono i rider")).toBeVisible();
    await expect(page.getByText("Chi porta l'incasso")).toBeVisible();
    await expect(page.getByText("Dove si consegna")).toBeVisible();
    await expect(page.locator(".recharts-surface").first()).toBeVisible();

    // the explanatory panels can be hidden and brought back
    await page.getByRole("button", { name: "Nascondi In breve" }).click();
    await expect(page.getByRole("button", { name: "Nascondi In breve" })).toHaveCount(0);
    await page.getByRole("button", { name: "In breve", exact: true }).click();
    await expect(page.getByRole("button", { name: "Nascondi In breve" })).toBeVisible();

    // the trend can show another measure
    await page.getByText("Ordini", { exact: true }).last().click();
    await expect(page.locator(".recharts-surface").first()).toBeVisible();

    await page.getByRole("button", { name: "Mese precedente" }).click();
    await expect(page.getByText("vs mese precedente").first()).toBeVisible();
    await page.getByRole("button", { name: "Questo mese" }).click();
    await expect(page.locator(".recharts-surface").first()).toBeVisible();
    browserErrors.expectNone();
  });
});

test.describe("settings and profile", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("company settings are saved and survive a reload", async ({ page }) => {
    const browserErrors = failOnBrowserErrors(page);
    await page.goto("/settings");
    const description = page.getByLabel("Descrizione");
    const original = await description.inputValue();
    const updated = `Descrizione E2E ${Date.now()}`;

    await description.fill(updated);
    await page.getByRole("button", { name: "Salva modifiche" }).click();
    await expect(page.getByText("Impostazioni salvate")).toBeVisible();
    try {
      await page.reload();
      await expect(page.getByLabel("Descrizione")).toHaveValue(updated);
    } finally {
      await page.getByLabel("Descrizione").fill(original);
      await page.getByRole("button", { name: "Salva modifiche" }).click();
      await expect(page.getByText("Impostazioni salvate").last()).toBeVisible();
    }

    await page.getByRole("button", { name: "Gestisci canali" }).click();
    await expect(page.getByRole("dialog").filter({ hasText: "Canali disabilitati" })).toBeVisible();
    browserErrors.expectNone();
  });

  test("profile details can be edited and the password policy is enforced", async ({ page }) => {
    await page.goto("/profile");
    const phone = page.getByLabel("Telefono");
    const original = await phone.inputValue();

    await phone.fill("+39 06 7654321");
    await page.getByRole("button", { name: "Salva", exact: true }).click();
    await expect(page.getByText("Profilo aggiornato")).toBeVisible();
    try {
      await page.reload();
      await expect(page.getByLabel("Telefono")).toHaveValue("+39 06 7654321");
    } finally {
      await page.getByLabel("Telefono").fill(original);
      await page.getByRole("button", { name: "Salva", exact: true }).click();
      await expect(page.getByText("Profilo aggiornato").last()).toBeVisible();
    }

    await page.getByLabel("Nuova password").fill("weak");
    await expect(page.getByText("Almeno 8 caratteri")).toBeVisible();
    await expect(page.getByText("Demo Admin").first()).toBeVisible();
  });
});

test.describe("theme and responsive navigation", () => {
  test("dark mode is applied and remembered", async ({ page }) => {
    await loginAsAdmin(page);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await page.getByRole("button", { name: "Cambia tema" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.getByRole("button", { name: "Cambia tema" }).click(); // restore for other tests
  });

  test("on a phone the navigation lives in a drawer", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAsAdmin(page);
    await expect(page.getByRole("menuitem", { name: "Dashboard" })).toHaveCount(0); // closed
    await page.getByRole("button", { name: "Apri o chiudi il menu" }).click();
    await page.getByRole("menuitem", { name: "Dashboard" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    // no horizontal page scroll on mobile
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
