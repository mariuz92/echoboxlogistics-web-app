import { expect, test, type Page } from "./helpers";
import {
  cleanupE2eData,
  e2eName,
  failOnBrowserErrors,
  isoDay,
  loginAsAdmin,
  pickerDate,
  uniquePhone,
} from "./helpers";

const SLUG = "echobox-demo";

async function fillBooking(page: Page, guide: string, phone = uniquePhone(), email = "anna.e2e@example.com") {
  await page.locator("#guideName").fill(guide);
  await page.locator("#phone").fill(phone);
  await page.locator("#email").fill(email);
  await page.locator("#radiosCount").fill("18");
  await page.locator("#deliveryAt").fill(pickerDate(1, 10, 30));
  await page.locator("#deliveryAt").press("Enter");
  await page.locator("#deliveryAddress").fill("Piazza Venezia, Roma");
}

test.describe("public booking form (no login)", () => {
  test.afterAll(async ({ playwright }) => {
    await cleanupE2eData(playwright);
  });

  test("an unknown company link explains that bookings are unavailable", async ({ page }) => {
    await page.goto("/book/this-company-does-not-exist");
    await expect(page.getByText("Prenotazioni non disponibili")).toBeVisible();
  });

  test("the legacy /OrdineGuida URL serves the configured company", async ({ page }) => {
    await page.goto("/OrdineGuida");
    await expect(page.getByRole("heading", { name: "Prenota il servizio radioguide" })).toBeVisible();
    await expect(page.getByText("EchoBox Demo").first()).toBeVisible();
  });

  test("the form validates every required field and rejects past dates", async ({ page }) => {
    const browserErrors = failOnBrowserErrors(page);
    await page.goto(`/book/${SLUG}`);
    await page.getByRole("button", { name: "Invia richiesta" }).click();

    for (const message of [
      "Inserisci il nome",
      "Inserisci il numero",
      "Inserisci la tua email",
      "Indica quante radioguide servono",
      "Seleziona data e ora",
      "Inserisci il luogo di consegna",
    ]) {
      await expect(page.getByText(message, { exact: true })).toBeVisible();
    }

    await page.locator("#deliveryAt").fill("01/01/2020 09:00");
    await page.locator("#deliveryAt").press("Enter");
    await expect(page.getByText("La data non può essere nel passato")).toBeVisible();

    await page.locator("#phone").fill("12");
    await expect(page.getByText("Solo cifre (5-15)")).toBeVisible();
    browserErrors.expectNone();
  });

  test("a booking arrives in the dashboard as a new request, with the email and the right time", async ({ page }) => {
    const guide = e2eName("Pubblico");
    const phone = uniquePhone();

    // ---- an anonymous guide books ---------------------------------------------------
    await page.goto(`/book/${SLUG}`);
    await fillBooking(page, guide, phone);
    await page.getByRole("button", { name: "Invia richiesta" }).click();
    await expect(page.getByText("Richiesta inviata!")).toBeVisible();

    // ---- the admin finds it, flagged as coming from the public form ------------------
    await loginAsAdmin(page);
    await page.goto(`/?date=${isoDay(1)}&period=day`);
    const row = page.getByRole("row").filter({ hasText: guide });
    await expect(row).toBeVisible();
    await expect(row.getByText("Presa in carico")).toBeVisible();
    // 10:30 typed by the guide is 10:30 in the company's time zone
    await expect(row.getByText("10:30")).toBeVisible();

    await row.click();
    const drawer = page.getByRole("dialog");
    await expect(drawer.getByText("Richiesta ricevuta dal modulo pubblico")).toBeVisible();
    await expect(drawer.getByText("anna.e2e@example.com")).toBeVisible(); // the old app dropped the email
    await expect(drawer.getByText("Ordine ricevuto dal modulo pubblico")).toBeVisible();

    // ---- and the guide became an address-book contact --------------------------------
    await page.goto("/guides");
    await expect(page.getByRole("row").filter({ hasText: guide })).toBeVisible();
  });

  test("a second booking from the same phone reuses the contact", async ({ page }) => {
    const guide = e2eName("Ripetuto");
    const phone = uniquePhone();
    for (let i = 0; i < 2; i++) {
      await page.goto(`/book/${SLUG}`);
      await fillBooking(page, guide, phone);
      await page.getByRole("button", { name: "Invia richiesta" }).click();
      await expect(page.getByText("Richiesta inviata!")).toBeVisible();
    }
    await loginAsAdmin(page);
    await page.goto("/guides");
    await page.getByPlaceholder("Cerca per nome, telefono o email…").fill(guide);
    await expect(page.locator("tbody tr.ant-table-row")).toHaveCount(1);
  });

  test("bots that fill the hidden field get a fake success but no order", async ({ page }) => {
    const guide = e2eName("Bot");
    await page.goto(`/book/${SLUG}`);
    await fillBooking(page, guide);
    await page.locator("#website").fill("http://spam.example", { force: true });
    await page.getByRole("button", { name: "Invia richiesta" }).click();
    await expect(page.getByText("Richiesta inviata!")).toBeVisible();

    await loginAsAdmin(page);
    await page.goto(`/?date=${isoDay(1)}&period=day`);
    await page.getByPlaceholder("Cerca guida, telefono, indirizzo…").fill(guide);
    await expect(page.getByText("Nessun ordine nel periodo selezionato")).toBeVisible();
  });

  test("an admin can switch online bookings off and the public link reacts", async ({ page, context }) => {
    await loginAsAdmin(page);
    await page.goto("/settings");
    await expect(page.locator(`input[value$="/book/${SLUG}"]`)).toBeVisible();

    const toggle = page.getByRole("switch");
    await toggle.click();
    await page.getByRole("button", { name: "Salva modifiche" }).click();
    await expect(page.getByText("Impostazioni salvate")).toBeVisible();

    try {
      const visitor = await context.newPage(); // same browser profile, but the page is public anyway
      await visitor.goto(`/book/${SLUG}`);
      await expect(visitor.getByText("Prenotazioni non disponibili")).toBeVisible();
      await expect(visitor.getByText("non accetta prenotazioni online")).toBeVisible();
      await visitor.close();
    } finally {
      await toggle.click();
      await page.getByRole("button", { name: "Salva modifiche" }).click();
      await expect(page.getByText("Impostazioni salvate").last()).toBeVisible();
    }
  });
});
