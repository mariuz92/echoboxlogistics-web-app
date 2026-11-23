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

- [ ] **Deprecate sign-up:** remove `/register` and the "create a company" step of `/onboarding`, stop reading `company_name` from user metadata in `bootstrap_profile()`, set `DISABLE_SIGNUP=true` on the Auth service (invitations keep working), and drop the Google "create a company" path. Companies come only from the operator panel (F1, F2).
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

- [ ] Checklist of production Auth settings in `DEPLOYMENT.md` (written for the self-hosted stack; review it when sign-up is closed): OTP expiry, password policy, e-mail confirmation, rate limits, SMTP, captcha if sign-up ever reopens).
- [ ] Audit log of member changes visible to company owners.
- [ ] Verify on the production stack: invite-link expiry, `inviteUserByEmail` for an unconfirmed address, default `signOut` scope.

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

- [ ] Run the app from the Docker image on your own server behind a TLS reverse proxy; point the app's hostname to it with a DNS record. The landing page stays on Cloudflare Pages.
- [ ] Auth `SITE_URL` and `ADDITIONAL_REDIRECT_URLS`: the app domain only. `ALLOWED_ORIGINS` (Edge Functions): app domain and landing domain.
- [ ] Booking links and invitation e-mails must use the app's new domain (they are built from the app's public URL).
- [ ] Reminder: change the Cloudflare Pages build command to `npm run build:landing` with output `dist-landing`.

## 9. Account deletion (Google Play, GDPR)

The public page `/delete-account` (landing site, four languages) is the URL for the Play Console "Delete account URL". It promises
deletion within 30 days after an e-mail request. Until the in-app flow exists the operator does it by hand, so:

- [ ] **Runbook** for a manual deletion: set `orders.delivery_rider_id` and `pickup_rider_id` to null for that person (the foreign keys are `on delete restrict`), null `order_events.actor_id` (no foreign key), then delete the Auth user (the profile goes with it). For a guide or customer: clear name, phone and e-mail on `guides` and on the matching `orders` rows. For a company: delete the `tenants` row (everything cascades).
- [ ] **In-app "Delete my account"** (Profile screen, web and mobile): Play expects it in the app as well as on the web. Edge Function `delete-account` that re-checks the password, does the steps above, and signs out. An owner cannot delete the account while the company has no other admin.
- [ ] Claims on the page, checked 2026-11-23: deletion within 30 days matches GDPR Art. 12(3) (one month, extendable by two with notice). **Backups: Supabase is self-hosted, so there are no managed backups: the page's "within 30 days" is true only if you set it up.** Run a scheduled `pg_dump` (or WAL archiving) of the database, store it off the server, encrypted, and delete copies older than 30 days; test a restore. If you keep backups longer, change the page. After a restore, re-apply any deletions made since the backup. Accounting retention of 10 years is the Italian rule (art. 2220 c.c.); Germany and France use other periods (6 to 10 years), so the page says "in Italy". Confirm with your accountant.
- [ ] The page uses `support@echoboxlogistics.com`: switch to the real support address when the domain is final (also in the legal pages).
- [ ] Play Console: fill the Data safety form to match (account data, name, phone, e-mail collected; deletion request link = the page URL) and keep the listing name equal to "EchoBox Logistics".
