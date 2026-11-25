import { expect, test } from "./helpers";
import { failOnBrowserErrors, loginAsAdmin } from "./helpers";

test.describe("interface language", () => {
  test("Italian is the default; ?lang=en switches to English and is remembered", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Accedi" })).toBeVisible();

    await page.goto("/login?lang=en");
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();

    await page.goto("/login"); // no parameter: the choice was saved
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.lang)).toBe("en");

    await page.goto("/login?lang=it");
    await expect(page.getByRole("heading", { name: "Accedi" })).toBeVisible();
  });

  test("the language switch on the page changes the language", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("combobox", { name: "Language / Lingua" }).click();
    // antd also renders a hidden copy of the options for screen readers; the visible one has this title
    await page.getByTitle("English").click();
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  });

  test("an admin sees the whole app in English, without a missing text", async ({ page }) => {
    const browserErrors = failOnBrowserErrors(page);
    await loginAsAdmin(page);
    await page.goto("/?lang=en");

    await expect(page.getByRole("heading", { name: "Orders", level: 2 })).toBeVisible();
    for (const item of ["Orders", "Calendar", "Dashboard", "Team and riders", "Guides", "Settings"]) {
      await expect(page.getByRole("menuitem", { name: item })).toBeVisible();
    }
    for (const [path, heading] of [
      ["/calendar", "Calendar"],
      ["/dashboard", "Dashboard"],
      ["/riders", "Team and riders"],
      ["/guides", "Guides"],
      ["/settings", "Settings"],
    ] as const) {
      await page.getByRole("menuitem", { name: heading }).click();
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(page.getByRole("heading", { name: heading, level: 2 })).toBeVisible();
    }
    browserErrors.expectNone();
  });
});
