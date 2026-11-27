import { expect, test } from "./helpers";
import { failOnBrowserErrors, loginAsAdmin } from "./helpers";

test.describe("subscription", () => {
  test("an admin sees the plans and can request and cancel a plan change", async ({ page }) => {
    const errors = failOnBrowserErrors(page);
    await loginAsAdmin(page);
    await page.goto("/settings?tab=subscription");
    await expect(page.getByRole("tab", { name: "Abbonamento", selected: true })).toBeVisible();

    // A request left over from an earlier, interrupted run would disable the plan buttons.
    const cancel = page.getByRole("button", { name: "Annulla richiesta" });
    if (await cancel.isVisible({ timeout: 2000 }).catch(() => false)) {
      await cancel.click();
      await expect(page.getByText("Richiesta annullata.")).toBeVisible();
    }

    // The three starting plans, with what they include.
    for (const plan of ["Starter", "Pro", "Business"]) {
      await expect(page.getByText(plan, { exact: true }).first()).toBeVisible();
    }
    await expect(page.getByText("3 rider inclusi")).toBeVisible();
    await expect(page.getByText("300 ordini al mese inclusi")).toBeVisible();

    // Request a plan with a note.
    await page.getByRole("button", { name: "Scegli Pro" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Richiedi il piano Pro")).toBeVisible();
    await dialog.getByLabel("Nota per EchoBox").fill("Test e2e");
    await dialog.getByRole("button", { name: "Invia richiesta" }).click();
    await expect(page.getByText("Richiesta in corso: Pro (mensile)")).toBeVisible();

    // While a request is open the plan buttons are disabled, and it can be cancelled.
    await expect(page.getByRole("button", { name: "Richiesta inviata" })).toBeDisabled();
    await page.getByRole("button", { name: "Annulla richiesta" }).click();
    await expect(page.getByText("Richiesta in corso")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Scegli Pro" })).toBeEnabled();
    errors.expectNone();
  });

  test("the tab is reachable from the settings page", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/settings");
    await page.getByRole("tab", { name: "Abbonamento" }).click();
    await expect(page).toHaveURL(/tab=subscription/);
    await expect(page.getByText("Il tuo abbonamento")).toBeVisible();
    await page.getByRole("tab", { name: "Azienda" }).click();
    await expect(page.getByLabel("Nome azienda")).toBeVisible();
  });
});
