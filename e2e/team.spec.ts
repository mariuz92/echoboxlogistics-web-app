import { expect, test, type Page } from "./helpers";
import {
  newUserContext,
  ACCOUNTS,
  BASE_URL,
  PASSWORD,
  authLink,
  cleanupE2eData,
  login,
  loginAsAdmin,
  uid,
  waitForMail,
} from "./helpers";

async function openInviteDrawer(page: Page) {
  await page.goto("/riders");
  await page.getByRole("button", { name: "Invita persona" }).click();
  return page.getByRole("dialog");
}

test.describe("team and invitations", () => {
  test.afterAll(async ({ playwright }) => {
    await cleanupE2eData(playwright);
  });

  test("an invited rider joins, changes their password, and an admin can deactivate them", async ({
    page,
    browser,
    request,
  }) => {
    const id = uid();
    const email = `e2e-rider-${id}@example.test`;
    const name = `E2E Rider ${id}`;
    const newPassword = "E2eChanged2026y";

    // ---- admin invites ---------------------------------------------------------------
    await loginAsAdmin(page);
    const invite = await openInviteDrawer(page);
    await invite.getByLabel("Email").fill(email);
    await invite.getByLabel("Nome e cognome").fill(name);
    await invite.getByRole("button", { name: "Invia invito" }).click();
    await expect(page.getByText(`Invito inviato a ${email}`)).toBeVisible();

    await page.getByRole("tab", { name: /Inviti in sospeso/ }).click();
    await expect(page.getByRole("row").filter({ hasText: email })).toBeVisible();

    // ---- the invitee follows the link in the email -----------------------------------
    const link = authLink(await waitForMail(request, email, "invited"));
    const riderContext = await newUserContext(browser);
    const rider = await riderContext.newPage();
    await rider.goto(link);
    await expect(rider).toHaveURL(/\/join/);
    await expect(rider.getByText("Sei stato invitato a unirti a EchoBox Demo.")).toBeVisible();
    await expect(rider.getByLabel("Nome e cognome")).toHaveValue(name);

    // the password policy is enforced before anything is sent
    await rider.getByLabel("Scegli una password").fill("short");
    await rider.getByRole("button", { name: "Entra" }).click();
    await expect(rider.getByText("Almeno 8 caratteri")).toBeVisible();

    await rider.getByLabel("Telefono").fill("+39 333 1112233");
    await rider.getByLabel("Scegli una password").fill(PASSWORD);
    await rider.getByLabel("Conferma password").fill(PASSWORD);
    await rider.getByRole("button", { name: "Entra" }).click();
    await expect(rider.getByRole("heading", { name: "Le mie consegne", level: 2 })).toBeVisible();

    // ---- the rider changes their own password ----------------------------------------
    await rider.goto("/profile");
    await rider.getByLabel("Nuova password").fill(newPassword);
    await rider.getByLabel("Conferma password").fill(newPassword);
    await rider.getByRole("button", { name: "Aggiorna password" }).click();
    await expect(rider.getByText("Password aggiornata")).toBeVisible();
    await rider.getByRole("button", { name: /Rider/ }).first().click();
    await rider.getByRole("menuitem", { name: "Esci" }).click();
    await expect(rider).toHaveURL(/\/login/);

    await login(rider, { email, password: PASSWORD });
    await expect(rider.getByText("Email o password non corretti.")).toBeVisible(); // old password is dead
    await login(rider, { email, password: newPassword });
    await expect(rider.getByRole("heading", { name: "Le mie consegne", level: 2 })).toBeVisible();

    // ---- the admin sees the new rider and deactivates them ---------------------------
    await page.goto("/riders");
    const row = page.getByRole("row").filter({ hasText: email });
    await expect(row).toBeVisible();
    await row.getByRole("switch").click();
    await expect(page.getByText("Utente disattivato")).toBeVisible();

    const blocked = await riderContext.newPage();
    await riderContext.clearCookies();
    await blocked.goto("/login");
    await blocked.evaluate(() => localStorage.clear());
    await login(blocked, { email, password: newPassword });
    await expect(blocked.getByText("Il tuo account è stato disabilitato")).toBeVisible();

    // the rider's other open tab shares that session: it must be sent to the login page
    // (regression: it used to throw "useReadyUser used outside an authenticated route" and go blank)
    await expect(rider).toHaveURL(/\/login/);
    await riderContext.close();
  });

  test("inviting an address that already has an account is refused with a clear message", async ({ page }) => {
    await loginAsAdmin(page);
    const invite = await openInviteDrawer(page);
    await invite.getByLabel("Email").fill(ACCOUNTS.rider1.email);
    await invite.getByRole("button", { name: "Invia invito" }).click();
    await expect(page.getByText("Questa email è già registrata.")).toBeVisible();
  });

  test("a pending invitation can be revoked", async ({ page }) => {
    const email = `e2e-revoke-${uid()}@example.test`;
    await loginAsAdmin(page);
    const invite = await openInviteDrawer(page);
    await invite.getByLabel("Email").fill(email);
    await invite.getByRole("button", { name: "Invia invito" }).click();
    await expect(page.getByText(`Invito inviato a ${email}`)).toBeVisible();

    await page.getByRole("tab", { name: /Inviti in sospeso/ }).click();
    await page.getByRole("row").filter({ hasText: email }).getByRole("button", { name: "Revoca" }).click();
    const confirm = page.getByRole("dialog").filter({ hasText: "Revocare l'invito?" });
    await confirm.getByRole("button", { name: "Revoca" }).click();
    await expect(page.getByRole("row").filter({ hasText: email })).toHaveCount(0);
  });

  test("admins cannot deactivate themselves", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/riders");
    await page.getByRole("tab", { name: /Amministratori/ }).click();
    await expect(page.getByRole("switch", { name: /Attiva o disattiva Demo Admin/ })).toBeDisabled();
  });

  test("the team page shows live rider activity", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/riders");
    await expect(page.getByText(/In servizio ora \(\d+\/\d+\)/)).toBeVisible();
    await expect(page.getByRole("tab", { name: /Rider \(\d+\)/ })).toBeVisible();
  });
});
