import { expect, test, type Page } from "./helpers";
import {
  newUserContext,
  ACCOUNTS,
  BASE_URL,
  cleanupE2eData,
  e2eName,
  login,
  loginAsAdmin,
  pickerDate,
} from "./helpers";

const rowOf = (page: Page, text: string) => page.getByRole("row").filter({ hasText: text });
const jobCard = (page: Page, guide: string) => page.locator(".ant-card").filter({ hasText: guide });

test.describe("rider workflow: admin and riders in separate browsers", () => {
  test.afterAll(async ({ playwright }) => {
    await cleanupE2eData(playwright);
  });

  test("an order travels from creation to pickup, live on both screens", async ({ page, browser }) => {
    const guide = e2eName("Ciclo");

    // ---- admin creates an order with a pickup planned ---------------------------------
    await loginAsAdmin(page);
    await page.getByRole("button", { name: "Nuovo ordine" }).click();
    const drawer = page.getByRole("dialog");
    await drawer.locator("#guide_name").fill(guide);
    await drawer.locator("#radios_count").fill("12");
    await drawer.locator("#delivery_address").fill("Piazza Navona, Roma");
    await drawer.locator("#pickup_at").fill(pickerDate(0, 20, 0));
    await drawer.locator("#pickup_at").press("Enter");
    await drawer.locator("#pickup_address").fill("Piazza Navona, Roma");
    await drawer.getByRole("button", { name: "Crea ordine" }).click();
    await expect(page.getByText("Ordine creato")).toBeVisible();

    // keep the admin screen on this one order; it must update by itself from now on
    await page.getByPlaceholder("Cerca guida, telefono, indirizzo…").fill(guide);
    await expect(page.locator("tbody tr.ant-table-row")).toHaveCount(1);

    // ---- admin assigns the delivery to rider 1 ----------------------------------------
    await rowOf(page, guide).getByRole("button", { name: "Azioni ordine" }).click();
    await page.getByRole("menuitem", { name: "Assegna consegna" }).click();
    await page.getByRole("menuitem", { name: /Luca Rider/ }).click();
    await expect(rowOf(page, guide).getByText("Consegna assegnata")).toBeVisible();

    // ---- rider 2 cannot see rider 1's job ---------------------------------------------
    const other = await newUserContext(browser, { viewport: { width: 390, height: 844 } });
    const otherPage = await other.newPage();
    await login(otherPage, ACCOUNTS.rider2);
    await expect(otherPage.getByRole("heading", { name: "Le mie consegne", level: 2 })).toBeVisible();
    await expect(jobCard(otherPage, guide)).toHaveCount(0);
    await other.close();

    // ---- rider 1 runs the delivery on a phone-sized screen -----------------------------
    const riderContext = await newUserContext(browser, { viewport: { width: 390, height: 844 } });
    const rider = await riderContext.newPage();
    await login(rider, ACCOUNTS.rider1);
    await expect(jobCard(rider, guide)).toBeVisible();
    await expect(jobCard(rider, guide).getByText("Consegna assegnata")).toBeVisible();

    await jobCard(rider, guide).getByRole("button", { name: "Avvia consegna" }).click();
    await expect(rider.getByText("Consegna avviata")).toBeVisible();
    await expect(rowOf(page, guide).getByText("In consegna")).toBeVisible(); // live on the admin screen

    await jobCard(rider, guide).getByRole("button", { name: "Consegna completata" }).click();
    await expect(rowOf(page, guide).getByText("Attesa ritiro")).toBeVisible();

    // the pickup is now open for any rider to claim
    const claim = jobCard(rider, guide).getByRole("button", { name: "Prendi in carico il ritiro" });
    await expect(claim).toBeVisible();
    await claim.click();
    await expect(rowOf(page, guide).getByText("Ritiro assegnato")).toBeVisible();

    await jobCard(rider, guide).getByRole("button", { name: "Avvia ritiro" }).click();
    await expect(rowOf(page, guide).getByText("In ritiro")).toBeVisible();

    // completing the pickup asks how many radios did not come back
    await jobCard(rider, guide).getByRole("button", { name: "Ritiro completato" }).click();
    const modal = rider.getByRole("dialog");
    await modal.getByRole("spinbutton").fill("1");
    await modal.getByRole("button", { name: "Conferma ritiro" }).click();
    await expect(jobCard(rider, guide)).toHaveCount(0);
    await riderContext.close();

    // ---- admin sees the finished order with its history -------------------------------
    await expect(rowOf(page, guide).getByText("Ritirato")).toBeVisible();
    await rowOf(page, guide).click();
    const details = page.getByRole("dialog");
    await expect(details.getByRole("row").filter({ hasText: /Perses*1/ })).toHaveCount(1);
    await expect(details.getByText("Stato: Consegna assegnata → In consegna")).toBeVisible();
    await expect(details.getByText("Stato: In ritiro → Ritirato")).toBeVisible();
  });

  test("a rider can only act on their own jobs", async ({ page, request }) => {
    // an admin-created order assigned to rider 1 cannot be started by rider 2 through the API
    await loginAsAdmin(page);
    await page.getByRole("button", { name: "Nuovo ordine" }).click();
    const guide = e2eName("Altrui");
    const drawer = page.getByRole("dialog");
    await drawer.locator("#guide_name").fill(guide);
    await drawer.locator("#radios_count").fill("5");
    await drawer.locator("#delivery_address").fill("Via Appia 1, Roma");
    await drawer.getByRole("button", { name: "Crea ordine" }).click();
    await expect(page.getByText("Ordine creato")).toBeVisible();
    await page.getByPlaceholder("Cerca guida, telefono, indirizzo…").fill(guide);
    await rowOf(page, guide).getByRole("button", { name: "Azioni ordine" }).click();
    await page.getByRole("menuitem", { name: "Assegna consegna" }).click();
    await page.getByRole("menuitem", { name: /Luca Rider/ }).click();
    await expect(rowOf(page, guide).getByText("Consegna assegnata")).toBeVisible();

    const { E2E } = await import("./env");
    const token = async (email: string, password: string) =>
      (
        (await (
          await request.post(`${E2E.supabaseUrl}/auth/v1/token?grant_type=password`, {
            headers: { apikey: E2E.anonKey! },
            data: { email, password },
          })
        ).json()) as { access_token: string }
      ).access_token;

    const rider2Token = await token(ACCOUNTS.rider2.email, ACCOUNTS.rider2.password);
    const orders = await request.get(`${E2E.supabaseUrl}/rest/v1/orders?guide_name=eq.${encodeURIComponent(guide)}&select=id`, {
      headers: { apikey: E2E.anonKey!, Authorization: `Bearer ${rider2Token}` },
    });
    // rider 2 cannot even see rider 1's order
    expect(await orders.json()).toEqual([]);
  });
});
