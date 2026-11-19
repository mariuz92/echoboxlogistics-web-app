import { expect, test, type Page } from "./helpers";
import { cleanupE2eData, e2eName, failOnBrowserErrors, isoDay, loginAsAdmin, pickerDate } from "./helpers";

const drawerOf = (page: Page) => page.getByRole("dialog");
const rowOf = (page: Page, text: string) => page.getByRole("row").filter({ hasText: text });

/** The order form's channel input and its live status line. */
const channelInput = (page: Page) => drawerOf(page).locator("#radio_channel");
const channelSuggestion = (page: Page, channel: string) =>
  drawerOf(page).getByRole("button", { name: `Usa il canale ${channel}`, exact: true });

/** Waits for the form to pre-fill the first channel free for the order's times and returns it. */
async function autoFilledChannel(page: Page): Promise<string> {
  await expect(channelInput(page)).not.toHaveValue("");
  return channelInput(page).inputValue();
}

/**
 * Creates an order through the UI (default delivery: 09:00 of the day shown, no
 * pickup, so it holds its channel until the end of that day). New orders get the
 * first free channel automatically.
 */
async function createOrder(
  page: Page,
  guide: string,
  opts: { radios?: number; address?: string; pickup?: string } = {},
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

  const channel = await autoFilledChannel(page);

  await drawer.getByRole("button", { name: "Crea ordine" }).click();
  await expect(page.getByText("Ordine creato")).toBeVisible();
  await expect(drawer).toBeHidden();
  await expect(rowOf(page, guide)).toBeVisible();
  return { channel, channelLabel: `Canale ${channel}` };
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

  test("an order holds its radio channel during its times until it is cancelled", async ({ page }) => {
    const guide = e2eName("Canale");
    const { channel, channelLabel } = await createOrder(page, guide);
    await expect(rowOf(page, guide).getByText("Presa in carico")).toBeVisible();
    await expect(rowOf(page, guide).getByText(channelLabel)).toBeVisible();

    // another order at the same time gets a different channel, and the busy one is explained
    await page.getByRole("button", { name: "Nuovo ordine" }).click();
    expect(await autoFilledChannel(page)).not.toBe(channel);
    await expect(channelSuggestion(page, channel)).toHaveCount(0);
    await channelInput(page).fill(channel);
    await expect(drawerOf(page).getByText(`Canale ${channel} già usato in questi orari`)).toBeVisible();
    await closeDrawer(page);

    // cancelling the order frees the channel again
    await openRowMenu(page, guide);
    await page.getByRole("menuitem", { name: "Cambia stato" }).click();
    await page.getByRole("menuitem", { name: "Annulla ordine" }).click();
    await page.getByRole("button", { name: "Conferma" }).click();
    await expect(rowOf(page, guide).getByText("Annullato")).toBeVisible();

    await page.getByRole("button", { name: "Nuovo ordine" }).click();
    await expect(channelSuggestion(page, channel)).toBeVisible();
    await closeDrawer(page);
  });

  test("the same channel serves another group once the first one has returned the radios", async ({ page }) => {
    // morning group: 09:00-12:00, three days from now
    await page.goto(`/?date=${isoDay(3)}&period=day`);
    const morning = e2eName("Mattina");
    const { channel } = await createOrder(page, morning, { pickup: pickerDate(3, 12, 0) });

    // an afternoon order the same day is offered that channel again
    await page.getByRole("button", { name: "Nuovo ordine" }).click();
    const drawer = drawerOf(page);
    await drawer.locator("#delivery_at").fill(pickerDate(3, 14, 0));
    await drawer.locator("#delivery_at").press("Enter");
    await expect(channelSuggestion(page, channel)).toBeVisible();
    await channelInput(page).fill(channel);
    await expect(drawer.getByText(`Canale ${channel} libero in questi orari`)).toBeVisible();

    // ...but not if its times overlap the morning group
    await drawer.locator("#delivery_at").fill(pickerDate(3, 11, 0));
    await drawer.locator("#delivery_at").press("Enter");
    await expect(drawer.getByText(`Canale ${channel} già usato in questi orari`)).toBeVisible();
    await closeDrawer(page);
  });

  test("editing an order keeps its own channel selectable and is recorded in the timeline", async ({ page }) => {
    const guide = e2eName("Modifica");
    const { channelLabel } = await createOrder(page, guide, { radios: 8 });

    await rowOf(page, guide).click();
    const drawer = drawerOf(page);
    await expect(drawer.getByText("Dettagli ordine")).toBeVisible();
    await drawer.getByRole("button", { name: "Modifica" }).click();

    // regression: the order's own channel used to disappear from its edit form
    await expect(channelInput(page)).toHaveValue(channelLabel.replace("Canale ", ""));
    await expect(drawer.getByText(`${channelLabel} libero in questi orari`)).toBeVisible();

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
    const modal = page.getByRole("dialog").filter({ hasText: "Occupazione del" });
    await expect(modal).toBeVisible();

    // the channel of the order we just created is in use today and cannot be toggled
    const busyChannel = modal.getByRole("button", { name: new RegExp(`^${channelLabel}: In uso$`) });
    await expect(busyChannel).toBeDisabled();
    await expect(modal.getByRole("row").filter({ hasText: guide })).toBeVisible();

    // disable the highest free channel and save
    const free = modal.getByRole("button", { name: /^Canale \d+: Libero$/ }).last();
    const freeName = (await free.getAttribute("aria-label"))!.replace(": Libero", "");
    await free.click();
    await expect(modal.getByLabel("Canali disabilitati")).toHaveValue(new RegExp(freeName.replace("Canale ", "")));
    await modal.getByRole("button", { name: "Salva" }).click();
    await expect(page.getByText("Canali aggiornati")).toBeVisible();

    try {
      // it is now refused by the order form too
      await page.getByRole("button", { name: "Nuovo ordine" }).click();
      await channelInput(page).fill(freeName.replace("Canale ", ""));
      await expect(drawerOf(page).getByText(`Il ${freeName.toLowerCase()} è disabilitato.`)).toBeVisible();
      await closeDrawer(page);
    } finally {
      // restore the demo configuration
      await page.getByRole("button", { name: "Canali radio" }).click();
      const again = page.getByRole("dialog").filter({ hasText: "Occupazione del" });
      await again.getByRole("button", { name: new RegExp(`^${freeName}: Disabilitato$`) }).click();
      await again.getByRole("button", { name: "Salva" }).click();
      await expect(page.getByText("Canali aggiornati").last()).toBeVisible();
    }
  });
});
