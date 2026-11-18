import { expect, test, type Locator, type Page } from "./helpers";
import { cleanupE2eData, e2eName, failOnBrowserErrors, loginAsAdmin, pickerDate } from "./helpers";

const drawerOf = (page: Page) => page.getByRole("dialog");
const rowOf = (page: Page, text: string) => page.getByRole("row").filter({ hasText: text });

/** Opens the channel dropdown of the order form and returns its currently offered options. */
async function openChannelOptions(page: Page): Promise<Locator> {
  await drawerOf(page).locator("#radio_channel").click();
  return page.locator(".ant-select-dropdown:visible .ant-select-item-option");
}

/** Creates an order through the UI, reserving the first free radio channel. */
async function createOrder(page: Page, guide: string, opts: { radios?: number; address?: string } = {}) {
  await page.getByRole("button", { name: "Nuovo ordine" }).click();
  const drawer = drawerOf(page);
  await drawer.locator("#guide_name").fill(guide);
  await drawer.locator("#radios_count").fill(String(opts.radios ?? 12));
  await drawer.locator("#delivery_address").fill(opts.address ?? "Via del Corso 10, Roma");

  const options = await openChannelOptions(page);
  const channelLabel = (await options.first().innerText()).trim(); // e.g. "Canale 7"
  await options.first().click();

  await drawer.getByRole("button", { name: "Crea ordine" }).click();
  await expect(page.getByText("Ordine creato")).toBeVisible();
  await expect(drawer).toBeHidden();
  await expect(rowOf(page, guide)).toBeVisible();
  return { channelLabel };
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

  test("an order reserves its radio channel until it is cancelled", async ({ page }) => {
    const guide = e2eName("Canale");
    const { channelLabel } = await createOrder(page, guide);
    await expect(rowOf(page, guide).getByText("Presa in carico")).toBeVisible();
    await expect(rowOf(page, guide).getByText(channelLabel)).toBeVisible();

    // a second order can no longer pick that channel
    await page.getByRole("button", { name: "Nuovo ordine" }).click();
    const options = await openChannelOptions(page);
    await expect(options.first()).toBeVisible();
    await expect(options.filter({ hasText: new RegExp(`^${channelLabel}$`) })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await drawerOf(page).getByRole("button", { name: "Chiudi", exact: true }).click();

    // cancelling the order frees the channel again
    await openRowMenu(page, guide);
    await page.getByRole("menuitem", { name: "Cambia stato" }).click();
    await page.getByRole("menuitem", { name: "Annulla ordine" }).click();
    await page.getByRole("button", { name: "Conferma" }).click();
    await expect(rowOf(page, guide).getByText("Annullato")).toBeVisible();

    await page.getByRole("button", { name: "Nuovo ordine" }).click();
    const afterCancel = await openChannelOptions(page);
    await expect(afterCancel.filter({ hasText: new RegExp(`^${channelLabel}$`) })).toHaveCount(1);
  });

  test("editing an order keeps its own channel selectable and is recorded in the timeline", async ({ page }) => {
    const guide = e2eName("Modifica");
    const { channelLabel } = await createOrder(page, guide, { radios: 8 });

    await rowOf(page, guide).click();
    const drawer = drawerOf(page);
    await expect(drawer.getByText("Dettagli ordine")).toBeVisible();
    await drawer.getByRole("button", { name: "Modifica" }).click();

    // regression: the order's own channel used to disappear from its edit form
    await expect(drawer.locator(`[title="${channelLabel}"]`)).toBeVisible();

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
    await createOrder(page, guide);

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
    await createOrder(page, guide);
    await openRowMenu(page, guide);
    // received orders only offer the delivery leg
    await expect(page.getByRole("menuitem", { name: "Assegna consegna" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Assegna ritiro" })).toHaveCount(0);
  });

  test("deleting an order asks for confirmation and removes the row", async ({ page }) => {
    const guide = e2eName("Elimina");
    await createOrder(page, guide);

    await openRowMenu(page, guide);
    await page.getByRole("menuitem", { name: "Elimina" }).click();
    await expect(page.locator(".ant-modal-confirm-title")).toHaveText("Eliminare definitivamente l'ordine?");
    await page.getByRole("button", { name: "Elimina" }).last().click();
    await expect(page.getByText("Ordine eliminato")).toBeVisible();
    await expect(rowOf(page, guide)).toHaveCount(0);
  });

  test("search and the 'only unassigned' filter narrow the list", async ({ page }) => {
    const guide = e2eName("Cerca");
    await createOrder(page, guide);

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

  test("the channel board shows live state, protects busy channels and persists disabled ones", async ({ page }) => {
    const guide = e2eName("Board");
    const { channelLabel } = await createOrder(page, guide);

    await page.getByRole("button", { name: "Canali radio" }).click();
    const modal = page.getByRole("dialog").filter({ hasText: "Mappa canali" });
    await expect(modal).toBeVisible();

    // the channel of the order we just created is in use and cannot be toggled
    const busyChannel = modal.getByRole("button", { name: new RegExp(`^${channelLabel}: In uso$`) });
    await expect(busyChannel).toBeDisabled();

    // disable the highest free channel and save
    const free = modal.getByRole("button", { name: /^Canale \d+: Libero$/ }).last();
    const freeName = (await free.getAttribute("aria-label"))!.replace(": Libero", "");
    await free.click();
    await modal.getByRole("button", { name: "Salva" }).click();
    await expect(page.getByText("Canali aggiornati")).toBeVisible();

    try {
      // it is now disabled for new orders too
      await page.getByRole("button", { name: "Nuovo ordine" }).click();
      await drawerOf(page).locator("#radio_channel").click();
      const options = page.locator(".ant-select-dropdown:visible .ant-select-item-option");
      await options.last().scrollIntoViewIfNeeded();
      await expect(options.filter({ hasText: new RegExp(`^${freeName}$`) })).toHaveCount(0);
      await page.keyboard.press("Escape");
      await drawerOf(page).getByRole("button", { name: "Chiudi", exact: true }).click();
    } finally {
      // restore the demo configuration
      await page.getByRole("button", { name: "Canali radio" }).click();
      const again = page.getByRole("dialog").filter({ hasText: "Mappa canali" });
      await again.getByRole("button", { name: new RegExp(`^${freeName}: Disabilitato$`) }).click();
      await again.getByRole("button", { name: "Salva" }).click();
      await expect(page.getByText("Canali aggiornati").last()).toBeVisible();
    }
  });
});
