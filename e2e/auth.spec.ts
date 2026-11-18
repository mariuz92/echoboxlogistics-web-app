import { expect, test } from "./helpers";
import { ACCOUNTS, failOnBrowserErrors, login, loginAsAdmin, logout } from "./helpers";

test.describe("authentication and access control", () => {
  test("signed-out visitors are sent to the login page", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("heading", { name: "Accedi" })).toBeVisible();
  });

  test("a wrong password shows a clear error and stays on the login page", async ({ page }) => {
    await login(page, { email: ACCOUNTS.admin.email, password: "definitely-wrong-1A" });
    await expect(page.getByText("Email o password non corretti.")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("the login form validates required fields", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Accedi" }).click();
    await expect(page.getByText("Inserisci la tua email")).toBeVisible();
    await expect(page.getByText("Inserisci la password")).toBeVisible();
  });

  test("an admin signs in, sees the whole navigation, and signs out", async ({ page }) => {
    const browserErrors = failOnBrowserErrors(page);
    await loginAsAdmin(page);

    for (const item of ["Ordini", "Calendario", "Dashboard", "Team e rider", "Guide", "Impostazioni"]) {
      await expect(page.getByRole("menuitem", { name: item })).toBeVisible();
    }
    await expect(page.getByText("EchoBox Demo").first()).toBeVisible();

    await logout(page);
    // the session is really gone: protected pages bounce back to the login
    await page.goto("/");
    await expect(page).toHaveURL(/\/login/);
    browserErrors.expectNone();
  });

  test("a signed-in user is redirected away from the login page", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/login");
    await expect(page).toHaveURL(/localhost:\d+\/$/);
  });

  test("a rider only gets the rider screen and is denied admin pages", async ({ page }) => {
    await login(page, ACCOUNTS.rider1);
    await expect(page.getByRole("heading", { name: "Le mie consegne", level: 2 })).toBeVisible();

    // navigation is limited to the rider's own screen
    await expect(page.getByRole("menuitem")).toHaveCount(1);
    await expect(page.getByRole("menuitem", { name: "Dashboard" })).toHaveCount(0);

    for (const path of ["/dashboard", "/riders", "/guides", "/settings", "/calendar"]) {
      await page.goto(path);
      await expect(page.getByText("Accesso non consentito")).toBeVisible();
    }
  });

  test("legacy URLs of the previous app still resolve", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/Calendario");
    await expect(page).toHaveURL(/\/calendar$/);
    await page.goto("/Profilo");
    await expect(page).toHaveURL(/\/profile$/);
  });

  test("unknown routes show a 404 inside the app", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/this-page-does-not-exist");
    await expect(page.getByText("Pagina non trovata")).toBeVisible();
  });
});
