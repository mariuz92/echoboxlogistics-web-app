import { expect, test, type Page } from "./helpers";
import { newUserContext, ACCOUNTS, cleanupE2eData, login, loginAsAdmin } from "./helpers";

/** Days from today (Rome) to next week's `weekday` (0 = Monday). */
function daysToNextWeek(weekday: number): number {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Rome", weekday: "short" }).format(new Date());
  const today = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(name);
  return 7 - today + weekday;
}

const rowOf = (page: Page, text: string) => page.getByRole("row").filter({ hasText: text });
const dayCard = (page: Page, weekday: string) => page.locator(".ant-card").filter({ hasText: weekday });

/** Types a time into an antd time field (the field is found by its label). */
async function typeTime(page: Page, label: string, time: string) {
  const field = page.getByRole("dialog").getByLabel(label).first();
  await field.fill(time);
  await field.press("Enter");
}

test.describe("rider shifts: availability, planning and hours to pay", () => {
  test.afterAll(async ({ playwright }) => {
    await cleanupE2eData(playwright);
  });

  test("a rider states when they can work, the admin plans and adjusts the shift, hours follow", async ({
    page,
    browser,
  }) => {
    // ---- the rider says they are available next Wednesday, 09:00-13:00 ------------------
    const riderContext = await newUserContext(browser, { viewport: { width: 390, height: 844 } });
    const rider = await riderContext.newPage();
    await login(rider, ACCOUNTS.rider1);
    await rider.goto("/my-shifts");
    await expect(rider.getByRole("heading", { name: "I miei turni", level: 2 })).toBeVisible();
    await rider.getByRole("button", { name: "Settimana successiva" }).click();

    const wednesday = dayCard(rider, "Mercoledì");
    await wednesday.getByRole("button", { name: "Aggiungi fascia" }).click();
    await wednesday.getByRole("button", { name: "Salva" }).click();
    await expect(rider.getByText("Disponibilità salvata.")).toBeVisible();

    // ---- the admin sees it and covers it -----------------------------------------------
    await loginAsAdmin(page);
    await page.goto("/shifts");
    await expect(page.getByRole("heading", { name: "Turni", level: 2 })).toBeVisible();
    await page.getByRole("button", { name: "Settimana successiva" }).first().click();
    await expect(rowOf(page, "Luca Rider")).toContainText("09:00–13:00");

    await page.getByRole("button", { name: /Usa la disponibilità/ }).click();
    await page.getByRole("button", { name: "Crea turni" }).click();
    await expect(page.getByText(/turn[oi] aggiunt[oi] dalla disponibilità/)).toBeVisible();

    // ---- an extra hour is added after the shift was set --------------------------------
    await rowOf(page, "Luca Rider").getByRole("button", { name: /Turni di Luca Rider, mer/ }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Disponibilità indicata dal rider")).toBeVisible();
    await typeTime(page, "Fine turno", "14:00");
    await dialog.getByRole("button", { name: "Salva" }).first().click();
    await expect(page.getByText("Turno salvato.")).toBeVisible();
    await expect(dialog.getByText(/Pianificato 09:00–13:00/)).toBeVisible();
    await dialog.getByRole("button", { name: "Close" }).first().click();
    await expect(dialog).toBeHidden();

    // ---- the hours to pay show the extra hour ------------------------------------------
    await page.getByRole("tab", { name: "Ore da pagare" }).click();
    await page.getByRole("button", { name: "Periodo successivo" }).click();
    await expect(rowOf(page, "Luca Rider")).toContainText("+1 h");

    // ---- the rider sees the shift that was planned for them ----------------------------
    await rider.reload();
    await rider.getByRole("button", { name: "Settimana successiva" }).click();
    await expect(dayCard(rider, "Mercoledì").getByText("09:00–14:00")).toBeVisible();

    // ---- the admin removes the shift; the hours go away --------------------------------
    await page.getByRole("tab", { name: "Settimana" }).click();
    await page.getByRole("button", { name: "Settimana successiva" }).first().click();
    await rowOf(page, "Luca Rider").getByRole("button", { name: /Turni di Luca Rider, mer/ }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Elimina turno" }).click();
    await page.getByRole("button", { name: "Elimina", exact: true }).click();
    await expect(page.getByText("Turno eliminato.")).toBeVisible();
    await riderContext.close();
  });

  test("the admin sets how many riders are needed and the auto-fill covers it from the availability", async ({
    page,
    browser,
  }) => {
    // ---- the rider is available next Thursday 09:00-13:00 --------------------------------
    const riderContext = await newUserContext(browser, { viewport: { width: 390, height: 844 } });
    const rider = await riderContext.newPage();
    await login(rider, ACCOUNTS.rider1);
    await rider.goto("/my-shifts");
    await rider.getByRole("button", { name: "Settimana successiva" }).click();
    const thursday = dayCard(rider, "Giovedì");
    await thursday.getByRole("button", { name: "Aggiungi fascia" }).click();
    await thursday.getByRole("button", { name: "Salva" }).click();
    await expect(rider.getByText("Disponibilità salvata.")).toBeVisible();

    // ---- the admin opens that day on the timeline and says one rider is needed ------------
    await loginAsAdmin(page);
    await page.goto("/shifts");
    await page.getByRole("tab", { name: "Giornata" }).click();
    for (let i = 0; i < daysToNextWeek(3); i++) await page.getByRole("button", { name: "Giorno successivo" }).click();
    await expect(page.getByText(/^Giovedì /)).toBeVisible();
    await page.getByLabel("Rider necessari").fill("1");
    await page.getByRole("button", { name: /Aggiungi$/ }).click();
    await expect(page.getByText("Fabbisogno salvato.")).toBeVisible();
    await expect(page.getByText(/mancano 4 h/)).toBeVisible();

    // ---- the auto-fill proposes the rider's shift, and creates it ------------------------
    await page.getByRole("button", { name: "Riempi in automatico" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Luca Rider").first()).toBeVisible();
    await dialog.getByRole("button", { name: /Crea 1 turno/ }).click();
    await expect(page.getByText("1 turno creato.")).toBeVisible();
    await expect(page.getByText(/Fabbisogno coperto/)).toBeVisible();
    await riderContext.close();
  });
});
