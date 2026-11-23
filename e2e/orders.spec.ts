import { expect, test, type Page } from "./helpers";
import { cleanupE2eData, e2eName, failOnBrowserErrors, isoDay, loginAsAdmin, pickerDate } from "./helpers";

const drawerOf = (page: Page) => page.getByRole("dialog");
const rowOf = (page: Page, text: string) => page.getByRole("row").filter({ hasText: text });

/** The order form's channel input. */
const channelInput = (page: Page) => drawerOf(page).locator("#radio_channel");

/**
 * Creates an order through the UI on the given radio channel (default delivery:
 * 09:00 of the day shown, no pickup, so it holds the channel until the end of
 * that day).
 */
async function createOrder(
  page: Page,
  guide: string,
  opts: { channel: number; radios?: number; address?: string; pickup?: string },
) {
  await page.getByRole("button", { name: "Nuovo ordine" }).click();
  const drawer = drawerOf(page);
  await drawer.locator("#guide_name").fill(guide);
  await drawer.locator("#radios_count").fill(String(opts.radios ?? 12));
  await drawer.locator("#delivery_address").fill(opts.address ?? "Via del Corso 10, Roma");
  if (opts.pickup) {
    await drawer.locator("#pickup_at").fill(opts.pickup);
    await drawer.locator("#pickup_at").press("Enter");
    await drawer.locator("#pickup_address").fill(opts.address ?? "Via del Corso 10, Roma");
  }
  await channelInput(page).fill(String(opts.channel));
  await expect(drawer.getByText(`Canale ${opts.channel} libero in questi orari`)).toBeVisible();

  await drawer.getByRole("button", { name: "Crea ordine" }).click();
  await expect(page.getByText("Ordine creato")).toBeVisible();
  await expect(drawer).toBeHidden();
  await expect(rowOf(page, guide)).toBeVisible();
  return { channelLabel: `Canale ${opts.channel}` };
}

async function closeDrawer(page: Page) {
  await drawerOf(page).getByRole("button", { name: "Annulla", exact: true }).click();
  await expect(drawerOf(page)).toBeHidden();
}

async function openRowMenu(page: Page, guide: string) {
  // Narrow the table to this order first: the row sits at the top of the page, so the
  // menu and its submenu open in a predictable place (no scrolling, no clipping).
  await page.getByPlaceholder("Cerca guida, telefono, indirizzo…").fill(guide);
  await expect(page.locator("tbody tr.ant-table-row")).toHaveCount(1);
  await rowOf(page, guide).getByRole("button", { name: "Azioni ordine" }).click();
}

test.describe("orders (admin)", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test.afterAll(async ({ playwright }) => {
    await cleanupE2eData(playwright);
  });

  test("shows today's seeded orders with KPIs and an overdue-pickup alert", async ({ page }) => {
    const browserErrors = failOnBrowserErrors(page);
    await expect(page.getByText("Radioguide", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Da assegnare", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/ritir[oi] da pianificare o in ritardo/)).toBeVisible();

    await page.getByRole("button", { name: "Mostra" }).click();
    const modal = page.getByRole("dialog").filter({ hasText: "Ritiri da pianificare o in ritardo" });
    await expect(modal).toBeVisible();
    await expect(modal.getByRole("row").nth(1)).toBeVisible(); // at least one pending pickup listed
    browserErrors.expectNone();
  });

  test("the new-order form validates required fields and pickup consistency", async ({ page }) => {
    await page.getByRole("button", { name: "Nuovo ordine" }).click();
    const drawer = drawerOf(page);
    await drawer.getByRole("button", { name: "Crea ordine" }).click();
    await expect(drawer.getByText("Inserisci il nome della guida")).toBeVisible();
    await expect(drawer.getByText("Obbligatorio").first()).toBeVisible();
    await expect(drawer.getByText("Inserisci il luogo di consegna")).toBeVisible();

    // a pickup address without a pickup time is rejected
    await drawer.locator("#pickup_address").fill("Via Roma 1");
    await drawer.getByRole("button", { name: "Crea ordine" }).click();
    await expect(drawer.getByText("Indica anche data e ora del ritiro")).toBeVisible();

    // a pickup before the delivery is rejected
    await drawer.locator("#delivery_at").fill(pickerDate(2, 12, 0));
    await drawer.locator("#delivery_at").press("Enter");
    await drawer.locator("#pickup_at").fill(pickerDate(1, 9, 0));
    await drawer.locator("#pickup_at").press("Enter");
    await drawer.getByRole("button", { name: "Crea ordine" }).click();
    await expect(drawer.getByText("Il ritiro non può precedere la consegna")).toBeVisible();
  });

  test("a channel used at the same time shows as occupied until that order is cancelled", async ({ page }) => {
    const guide = e2eName("Canale");
    const { channelLabel } = await createOrder(page, guide, { channel: 30 });
    await expect(rowOf(page, guide).getByText("Presa in carico")).toBeVisible();
    await expect(rowOf(page, guide).getByText(channelLabel)).toBeVisible();

    // another order at the same time: channel 30 is occupied, and saving is refused
    await page.getByRole("button", { name: "Nuovo ordine" }).click();
    await channelInput(page).fill("30");
    await expect(drawerOf(page).getByText(new RegExp(`Canale 30 occupato da ${guide}`))).toBeVisible();
    await closeDrawer(page);

    // cancelling the order frees the channel again
    await openRowMenu(page, guide);
    await page.getByRole("menuitem", { name: "Cambia stato" }).click();
    await page.getByRole("menuitem", { name: "Annulla ordine" }).click();
    await page.getByRole("button", { name: "Conferma" }).click();
    await expect(rowOf(page, guide).getByText("Annullato")).toBeVisible();

    await page.getByRole("button", { name: "Nuovo ordine" }).click();
    await channelInput(page).fill("30");
    await expect(drawerOf(page).getByText("Canale 30 libero in questi orari")).toBeVisible();
    await closeDrawer(page);
  });

  test("the same channel serves another group once the first one has returned the radios", async ({ page }) => {
    // morning group: 09:00-12:00, three days from now
    await page.goto(`/?date=${isoDay(3)}&period=day`);
    const morning = e2eName("Mattina");
    await createOrder(page, morning, { channel: 31, pickup: pickerDate(3, 12, 0) });

    // in the afternoon the channel is free
    await page.getByRole("button", { name: "Nuovo ordine" }).click();
    const drawer = drawerOf(page);
    await drawer.locator("#delivery_at").fill(pickerDate(3, 14, 0));
    await drawer.locator("#delivery_at").press("Enter");
    await channelInput(page).fill("31");
    await expect(drawer.getByText("Canale 31 libero in questi orari")).toBeVisible();

    // ...but not at a time that overlaps the morning group
    await drawer.locator("#delivery_at").fill(pickerDate(3, 11, 0));
    await drawer.locator("#delivery_at").press("Enter");
    await expect(drawer.getByText(new RegExp(`Canale 31 occupato da ${morning}`))).toBeVisible();
    await closeDrawer(page);
  });

  test("editing an order keeps its own channel selectable and is recorded in the timeline", async ({ page }) => {
    const guide = e2eName("Modifica");
    const { channelLabel } = await createOrder(page, guide, { channel: 32, radios: 8 });

    await rowOf(page, guide).click();
    const drawer = drawerOf(page);
    await expect(drawer.getByText("Dettagli ordine")).toBeVisible();
    await drawer.getByRole("button", { name: "Modifica" }).click();

    // regression: the order's own channel used to disappear from its edit form
    await expect(channelInput(page)).toHaveValue(channelLabel.replace("Canale ", ""));
    await expect(drawer.getByText(`${channelLabel} libero in questi orari`)).toBeVisible();

    await drawer.getByRole("button", { name: "Canali occupati" }).click();
    const occupied = page.getByRole("dialog", { name: "Canali occupati" });
    await expect(occupied.getByText(/canal[ei] occupat[oi] in questi orari/)).toBeVisible();
    await expect(occupied.getByRole("row").filter({ hasText: guide })).toHaveCount(0);
    await occupied.getByRole("button", { name: "Chiudi", exact: true }).last().click();

    await drawer.locator("#radios_count").fill("21");
    await drawer.locator("#notes").fill("Note aggiornate dal test");
    await drawer.getByRole("button", { name: "Salva modifiche" }).click();
    await expect(page.getByText("Ordine aggiornato")).toBeVisible();

    await rowOf(page, guide).click();
    await expect(drawer.getByText("Note aggiornate dal test")).toBeVisible();
    await expect(drawer.getByText(/Modificato:.*radioguide.*note|Modificato:.*note.*radioguide/)).toBeVisible();
    await expect(drawer.getByText("Ordine creato")).toBeVisible();
  });

  test("assigning a rider moves the order to 'Consegna assegnata' and can be undone", async ({ page }) => {
    const guide = e2eName("Assegna");
    await createOrder(page, guide, { channel: 28 });

    await openRowMenu(page, guide);
    await page.getByRole("menuitem", { name: "Assegna consegna" }).click();
    await page.getByRole("menuitem", { name: /Luca Rider/ }).click();
    await expect(page.getByText("Consegna assegnato a Luca Rider")).toBeVisible();
    await expect(rowOf(page, guide).getByText("Consegna assegnata")).toBeVisible();
    await expect(rowOf(page, guide).getByText(/C · Luca Rider/)).toBeVisible();

    // the action did not leak a click to the row (which would open the drawer)
    await expect(drawerOf(page)).toBeHidden();

    await openRowMenu(page, guide);
    await page.getByRole("menuitem", { name: /Cambia rider/ }).click();
    await page.getByRole("menuitem", { name: "Rimuovi assegnazione" }).click();
    await expect(rowOf(page, guide).getByText("Presa in carico")).toBeVisible();
  });

  test("a pickup cannot be assigned before the delivery happened", async ({ page }) => {
    const guide = e2eName("NoRitiro");
    await createOrder(page, guide, { channel: 25 });
    await openRowMenu(page, guide);
    // received orders only offer the delivery leg
    await expect(page.getByRole("menuitem", { name: "Assegna consegna" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Assegna ritiro" })).toHaveCount(0);
  });

  test("deleting an order asks for confirmation and removes the row", async ({ page }) => {
    const guide = e2eName("Elimina");
    await createOrder(page, guide, { channel: 26 });

    await openRowMenu(page, guide);
    await page.getByRole("menuitem", { name: "Elimina" }).click();
    await expect(page.locator(".ant-modal-confirm-title")).toHaveText("Eliminare definitivamente l'ordine?");
    await page.getByRole("button", { name: "Elimina" }).last().click();
    await expect(page.getByText("Ordine eliminato")).toBeVisible();
    await expect(rowOf(page, guide)).toHaveCount(0);
  });

  test("search and the 'only unassigned' filter narrow the list", async ({ page }) => {
    const guide = e2eName("Cerca");
    await createOrder(page, guide, { channel: 27 });

    const search = page.getByPlaceholder("Cerca guida, telefono, indirizzo…");
    await search.fill(guide);
    await expect(rowOf(page, guide)).toBeVisible();
    await expect(page.locator("tbody tr.ant-table-row")).toHaveCount(1);

    await search.fill("zzzz-nessun-risultato");
    await expect(page.getByText("Nessun ordine nel periodo selezionato")).toBeVisible();

    await search.fill("");
    await page.getByRole("switch").click(); // "Solo da assegnare"
    await expect(rowOf(page, guide)).toBeVisible();
    await expect(page.getByText("Consegna assegnata")).toHaveCount(0);
  });

  test("the period switcher loads the whole month, not just the loaded day", async ({ page }) => {
    const total = async () => {
      const text = await page.locator(".ant-pagination-total-text").innerText(); // "12 ordini"
      return Number(text.match(/\d+/)![0]);
    };
    await expect(page.locator(".ant-pagination-total-text")).toBeVisible();
    const day = await total();

    await page.getByText("Mese", { exact: true }).click();
    await expect(page).toHaveURL(/period=month/);
    await expect.poll(total).toBeGreaterThanOrEqual(day);

    await page.getByText("Anno", { exact: true }).click();
    await expect(page).toHaveURL(/period=year/);
    await expect.poll(total).toBeGreaterThanOrEqual(day);
  });

  test("exports the visible orders as a PDF", async ({ page }) => {
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Esporta PDF" }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^ordini_\d{4}-\d{2}-\d{2}\.pdf$/);
  });

  test("occupied channels are listed, and disabled channels are refused by the order form", async ({ page }) => {
    const guide = e2eName("Board");
    await createOrder(page, guide, { channel: 33 });

    // the "occupied channels" window lists the order and its channel; search narrows it
    await page.getByRole("button", { name: "Canali occupati" }).click();
    const occupied = page.getByRole("dialog").filter({ hasText: "Canali occupati" });
    await expect(occupied.getByRole("row").filter({ hasText: guide })).toContainText("33");
    await occupied.getByLabel("Cerca canale o guida").fill("33");
    await expect(occupied.getByRole("row").filter({ hasText: guide })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(occupied).toBeHidden();

    await page.getByRole("button", { name: "Nuovo ordine" }).click();
    const drawer = page.getByRole("dialog", { name: "Nuovo ordine" });
    const channel = drawer.locator("#radio_channel");
    const range = await drawer.getByText(/I tuoi canali vanno da \d+ a \d+/).innerText();
    const max = Number(range.match(/a (\d+)\./)?.[1]);
    await expect(channel).toHaveAttribute("max", String(max));
    await channel.fill(String(max + 1));
    await expect(drawer.getByText(new RegExp(`Inserisci un numero intero da \\d+ a ${max}\\.`))).toBeVisible();
    await drawer.getByRole("button", { name: "Canali occupati" }).click();
    await expect(occupied.getByRole("row").filter({ hasText: guide })).toContainText("33");
    await expect(occupied.getByLabel("Giorno")).toHaveCount(0);
    await occupied.getByRole("button", { name: "Chiudi", exact: true }).last().click();
    await closeDrawer(page);

    // disable channel 34 in the settings
    await page.goto("/settings");
    await page.getByRole("button", { name: "Gestisci canali" }).click();
    const settings = page.getByRole("dialog").filter({ hasText: "Canali disabilitati" });
    const disabled = settings.getByLabel("Canali disabilitati");
    const before = await disabled.inputValue();
    await disabled.fill(before ? `${before}, 34` : "34");
    await settings.getByRole("button", { name: "Salva" }).click();
    await expect(page.getByText("Canali aggiornati")).toBeVisible();

    try {
      // the order form refuses it now
      await page.goto("/");
      await page.getByRole("button", { name: "Nuovo ordine" }).click();
      await channelInput(page).fill("34");
      await expect(drawerOf(page).getByText("Il canale 34 è disabilitato.")).toBeVisible();
      await closeDrawer(page);
    } finally {
      // restore the demo configuration
      await page.goto("/settings");
      await page.getByRole("button", { name: "Gestisci canali" }).click();
      const again = page.getByRole("dialog").filter({ hasText: "Canali disabilitati" });
      await again.getByLabel("Canali disabilitati").fill(before);
      await again.getByRole("button", { name: "Salva" }).click();
      await expect(page.getByText("Canali aggiornati").last()).toBeVisible();
    }
  });
});
