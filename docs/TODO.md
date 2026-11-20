# TODO

Backlog agreed on 2026-11-20. Checked items are implemented in this repository. The reasoning and the evidence behind the auth items are in
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

The [Superadmin requirements](SUPERADMIN.md) cover the complete console, including company subscriptions, web and mobile diagnostics, configuration, and delivery stages.

A separate web build uses the main app's visual style. Privileged SQL RPCs require a verified platform operator and MFA. The Edge Function sends invitations after the same authorization check.

- [x] Private operator table, mandatory two-step verification, separate build and Docker Compose deployment files.
- [x] Create and suspend companies in Supabase, invite the first owner, invite and disable staff, resend, renew or revoke operator invitations, and transfer ownership to an active admin.
- [x] Assign manual plans, set trial and renewal dates, grace and closeout states, and record manual payments. Enforce access in the Supabase app and public booking.
- [x] Console controls for company creation, global booking pause and a web notice.
- [x] Group signed-in web errors, review active orders and overdue pickups, handle landing inquiries, and inspect the platform audit trail.
- [x] Add and disable platform operators from verified accounts and prevent self-disable.
- [ ] Apply migrations and deploy to the EchoBox server. Provision the first production operator and verify TOTP, real email delivery, and custom DNS.
- [ ] Exercise production invitation retries, account recovery, and subscription closeout with two pilot companies before turning off public signup.
- [ ] Account recovery queue, platform-wide Auth revocation, role delegation, tenant-scoped support detail and data exports.
- [ ] Flutter diagnostics, push delivery history and retries, and shared multi-company access after the mobile migration.
- [ ] Incident notifications, external uptime checks, backup status, error reports before sign-in, and raw log aggregation.
- [ ] Plan quotas, company-facing billing, payment-provider integration, version policies and staged feature rollout.

## 2. Accounts and invitations (phases 1 and 2 of AUTH_REVIEW.md)

- [ ] **Deprecate sign-up:** remove `/register` and the "create a company" step of `/onboarding`, stop reading `company_name` from user metadata in `bootstrap_profile()`, turn off sign-up in the hosted Auth settings (invitations keep working), and drop the Google "create a company" path. Companies come only from the operator panel (F1, F2).
- [x] Operator-issued invitations activate on explicit acceptance after the join step.
- [ ] Move legacy company-admin invitations to explicit acceptance (F4).
- [ ] Keep an invitation when the person already has an account without a company (F5).
- [ ] Invite quotas per company and a generic answer that does not reveal who has an account elsewhere (F3).
- [x] Protect company ownership assigned by the operator. The owner remains an admin until ownership is transferred (F8).
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

## 7. Public booking page (guides)

Interpretation to confirm: the page a guide opens to book radios must belong to **the company that shared the link**. The
booking is created for that company only, and the page shows that company's identity.

- [ ] Each company has its own booking link (`/book/<company>`, already resolved by slug in `get_public_tenant` / `create_public_order`); every booking, and the guide record, is created inside that company and nowhere else.
- [ ] The page shows the sharing company (name, and logo if the company has one) in the header and footer instead of only the EchoBox brand; the company's name appears in the confirmation and in the e-mail or message sent to the guide.
- [ ] Remove the global `/OrdineGuida` route and `VITE_PUBLIC_BOOKING_SLUG` (one fixed company for everyone): old links redirect to the company's own link or show "link not valid".
- [ ] Link safety: the slug is guessable (derived from the company name) and cannot be changed. Decide whether the link should carry an unguessable token that the company admin can regenerate or switch off (`public_booking_enabled` already switches it off). Let the admin copy the link and QR code from the settings.
- [ ] Tests: two companies, a booking through company A's link never appears for company B, and vice versa.

## 8. Host the web app on my own server

- [ ] Provision an independent EchoBox Supabase stack and verify it alongside the existing Docker instance using the [self-hosting plan](DEPLOYMENT.md#5-self-hosted-supabase-on-a-shared-docker-server).
- [ ] Run the app from the Docker image on your own server behind a TLS reverse proxy; point the app's hostname to it with a DNS record. The landing page stays on Cloudflare Pages.
- [ ] Supabase **Site URL** and **Redirect URLs**: the app domain only. `ALLOWED_ORIGINS` (Edge Functions): app domain and landing domain.
- [ ] Booking links and invitation e-mails must use the app's new domain (they are built from the app's public URL).
- [ ] Reminder: change the Cloudflare Pages build command to `npm run build:landing` with output `dist-landing`.
