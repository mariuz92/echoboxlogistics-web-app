# TODO

Backlog agreed on 2026-11-20. Nothing here is built yet. The reasoning and the evidence behind the auth items are in
[AUTH_REVIEW.md](AUTH_REVIEW.md) (flaw ids F1 to F10 refer to it).

## Decisions taken

| Topic | Decision |
|---|---|
| Who operates the platform | The owner, from a **superadmin panel** (below). |
| How companies get created | **Confirmed:** only by the owner (operator) from the panel, who invites the company's first admin. Self-service sign-up is **deprecated** (see section 2). |
| People and companies | Usually one person per company, but **riders can work for two or more companies**. Needs memberships (below). |
| Roles now | `owner`, `admin`, `rider`. |
| Roles later | `supervisor`: like an admin for riders and orders, with limited access to everything else. |
| Rider sign-in | **Confirmed:** riders have an e-mail address. Invite link or QR code for the first entry, then a 6-digit code sent by e-mail when they need to sign in again. No passwords for riders and no SMS (so no sending cost). |

## 1. Superadmin panel (operator console)

A separate app on its own domain, like the landing page, with its own sign-in and mandatory two-step verification. Access is
limited to a `platform_admins` table. The browser never holds the service-role key: every privileged action is an Edge Function
that first checks the caller is a platform admin.

- [ ] `platform_admins` table, a sign-in for operators, and the separate build and deployment (`npm run build:console`).
- [ ] Companies: list, create (name + first admin's e-mail → invited as owner), suspend and reactivate. Suspension is enforced in `private.current_tenant_id()` (F8).
- [ ] People: list members of a company, add or remove admins, disable (also bans the Auth account, F9), resend or revoke invitations, force-attach an existing account to a company.
- [ ] **Logs**: a `system_events` / audit table written by the functions and triggers (company created, invitation sent or failed, member changed, sign-in blocked, function error) with a screen to filter it. Link out to the Supabase dashboard for raw logs.
- [ ] **Fix-it tools**: accounts with no company (the F1 leftovers), invitations stuck or expired, companies with no active admin, failed e-mails.
- [ ] Contact-form inbox (`contact_messages`) with the `handled` flag.
- [ ] Every operator action is written to the audit log. "View as" a company, if added, is logged and read-only.

## 2. Accounts and invitations (phases 1 and 2 of AUTH_REVIEW.md)

- [ ] **Deprecate sign-up:** remove `/register` and the "create a company" step of `/onboarding`, stop reading `company_name` from user metadata in `bootstrap_profile()`, turn off sign-up in the hosted Auth settings (invitations keep working), and drop the Google "create a company" path. Companies come only from the operator panel (F1, F2).
- [ ] `accept_invitation()` called only after the person has finished the join step; nobody is active before that (F4).
- [ ] Keep an invitation when the person already has an account without a company (F5).
- [ ] Invite quotas per company and a generic answer that does not reveal who has an account elsewhere (F3).
- [ ] `owner` role: cannot be demoted or disabled except by transfer (F8).
- [ ] Store consent to terms and privacy with version and timestamp (F2).
- [ ] Office and rider switch for a person who has both roles (F7).
- [ ] `signOut` for the current device only; current password required to change it; two-step verification option for admins (F10).

## 3. Riders: sign-in and several companies

- [ ] **Invite by link or QR code** that the admin shares on WhatsApp (or sends by e-mail): opens the app, the rider is signed in, no password. Name and phone are pre-filled. The link is a long-lived invitation code exchanged by a function for a fresh session, so it does not depend on the e-mail OTP expiry (F5).
- [ ] Stay signed in on the phone (long session, installable app). Note for iOS: the installed app has separate storage from Safari, so the first launch needs a sign-in too.
- [ ] **Re-entry by a 6-digit code sent by e-mail and typed in the app**, never by a link, which is the usual source of "link opened in the wrong browser" errors. The admin can also re-issue the invite link. (The e-mail template must show the code.)
- [ ] **Memberships**: a global person (`profiles`) plus `memberships(tenant_id, roles, disabled)`. The active company is stored per user and read by `private.current_tenant_id()`, so existing row-level security keeps working (F6).
- [ ] Inviting a rider who already has an account adds a pending membership instead of failing; the rider accepts in the app. The admin always sees "invitation sent", so nothing leaks about other companies.
- [ ] Company switcher in the rider app; jobs and notifications are per company.

## 4. Supervisor role (later)

- [ ] Define the permission matrix: can manage riders and orders (create, assign, change status, team activity); cannot change company settings or channels, invite admins, or see company-wide statistics (to be confirmed).
- [ ] Add the role to `app_role`, `update_member`, the invitation screens, route guards and RLS policies, with tests.

## 5. Hardening and operations

- [ ] Checklist of hosted Auth settings in `DEPLOYMENT.md` (OTP expiry, password policy, e-mail confirmation, rate limits, SMTP, captcha if sign-up ever reopens).
- [ ] Audit log of member changes visible to company owners.
- [ ] Verify on the hosted project: invite-link expiry, `inviteUserByEmail` for an unconfirmed address, default `signOut` scope.

## 6. Landing page follow-ups

- [ ] Set `contactEndpoint` (`src/features/landing/config.ts`) and add the landing domain to `ALLOWED_ORIGINS`.
- [x] "Come si parte", step 1, reworded: after the demo the operator creates the company (done 2026-11-20). Step 2 still says riders choose a password; change it when the rider sign-in above is built.
- [ ] Legal pages and the support address still use the echoboxlogistics name.
