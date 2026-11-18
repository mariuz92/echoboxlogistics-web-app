import { expect, test, type Page } from "./helpers";
import {
  newUserContext,
  BASE_URL,
  PASSWORD,
  authLink,
  cleanupE2eData,
  login,
  uid,
  waitForMail,
} from "./helpers";

async function fillRegistration(page: Page, company: string, email: string, name = "E2E Fondatore") {
  await page.goto("/register");
  await page.getByLabel("Nome azienda").fill(company);
  await page.getByLabel("Nome e cognome").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Conferma password").fill(PASSWORD);
  await page.getByRole("checkbox", { name: /Accetto/ }).check();
  await page.getByRole("button", { name: "Crea account" }).click();
}

test.describe("company registration", () => {
  test.afterAll(async ({ playwright }) => {
    await cleanupE2eData(playwright);
  });

  test("the registration form validates input", async ({ page }) => {
    await page.goto("/register");
    await page.getByRole("button", { name: "Crea account" }).click();
    await expect(page.getByText("Inserisci il nome dell'azienda")).toBeVisible();
    await expect(page.getByText("Inserisci la tua email")).toBeVisible();
    await expect(page.getByText("Devi accettare termini e privacy")).toBeVisible();

    await page.getByLabel("Password", { exact: true }).fill("weak");
    await expect(page.getByText("Almeno 8 caratteri")).toBeVisible();
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByLabel("Conferma password").fill("Different2026x");
    await expect(page.getByText("Le password non coincidono")).toBeVisible();
  });

  test("a company registers, confirms its email and lands in an empty, isolated workspace", async ({
    page,
    request,
  }) => {
    const id = uid();
    const company = `E2E Co ${id}`;
    const email = `e2e-founder-${id}@example.test`;

    await fillRegistration(page, company, email);
    await expect(page.getByText("Controlla la tua email")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);

    // until the email is confirmed nobody can sign in
    await login(page, { email, password: PASSWORD });
    await expect(page.getByText("Conferma prima il tuo indirizzo email.")).toBeVisible();

    // the confirmation link signs the user in and creates the company
    await page.goto(authLink(await waitForMail(request, email, "confirm")));
    await expect(page.getByRole("heading", { name: "Ordini", level: 2 })).toBeVisible();
    await expect(page.getByText(company).first()).toBeVisible();
    await expect(page.getByText("Amministratore").first()).toBeVisible();

    // tenant isolation: none of the demo company's data is visible
    await page.goto("/?period=year");
    await expect(page.getByText("Nessun ordine nel periodo selezionato")).toBeVisible();
    await page.goto("/guides");
    await expect(page.getByText("Nessuna guida in rubrica")).toBeVisible();
    await expect(page.getByText("Mario Rossi")).toHaveCount(0);

    // its own public booking link exists
    await page.goto("/settings");
    await expect(page.locator('input[value*="/book/e2e-co-"]')).toBeVisible();
  });

  test("an existing company name cannot be claimed by a second registration", async ({ page, browser, request }) => {
    const id = uid();
    const company = `E2E Dup ${id}`;

    // first company registers and confirms
    const firstEmail = `e2e-first-${id}@example.test`;
    await fillRegistration(page, company, firstEmail);
    await page.goto(authLink(await waitForMail(request, firstEmail, "confirm")));
    await expect(page.getByRole("heading", { name: "Ordini", level: 2 })).toBeVisible();

    // a second person registers with the same name (different case and spacing)
    const context = await newUserContext(browser);
    const second = await context.newPage();
    const secondEmail = `e2e-second-${id}@example.test`;
    await fillRegistration(second, `  ${company.toUpperCase()} `, secondEmail);
    await expect(second.getByText("Controlla la tua email")).toBeVisible();

    // confirming does NOT make them an admin of the first company; they are told why
    await second.goto(authLink(await waitForMail(request, secondEmail, "confirm")));
    await expect(second).toHaveURL(/\/login$/);
    await expect(second.getByText("Esiste già un'azienda con questo nome")).toBeVisible();
    await context.close();
  });
});
