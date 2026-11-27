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
- [x] Hide company creation on customer registration and onboarding pages when the console-only setting is active.
- [ ] Enable **Creazione aziende solo dalla console** in production and verify owner invitation acceptance.
- [x] Group signed-in web errors, review active orders and overdue pickups, handle landing inquiries, and inspect the platform audit trail.
- [x] Search and filter the support queue, assign issues to operators, and record triage and resolutions. Open a company's issue queue and inspect the timeline of an open order.
- [x] Share the main app's navigation shell and order display across both builds. Preserve support links and issue filters across reloads and browser history.
- [x] Add and disable platform operators from verified accounts and prevent self-disable.
- [ ] Apply migrations and deploy to the EchoBox server. Provision the first production operator and verify TOTP, real email delivery, and custom DNS.
- [ ] Exercise production invitation retries, account recovery, and subscription closeout with two pilot companies before turning off public signup.
- [ ] Account recovery queue, platform-wide Auth revocation, role delegation, time-limited case access and data exports.
- [x] Flutter Auth, data and Realtime are on Supabase in [the mobile feature branch](https://github.com/mariuz92/echoboxlogistics_mobile/tree/03e673e790fbe385aaa1082b3e7ab02dadf5c19a). Firebase is used for push.
- [x] Align Flutter order forms with company channel ranges, disabled channels, and schedule-based availability. [Mobile channel update](https://github.com/mariuz92/echoboxlogistics_mobile/commit/0cbc65b6cac7f44891c8c3d607d0a37f46509ce5)
- [x] Enforce the company’s channel range in the web order form and show occupied channels for the order’s schedule.
- [ ] Pilot web and Flutter against the same EchoBox Supabase project. Verify channel bookings across both clients, operator invites, and company access messages.
- [x] Add the Supabase queue and Firebase sender for rider assignments and reminders.
- [ ] Deploy rider push and verify receipt on an iPhone and an Android phone.
- [ ] Add Flutter diagnostics, a notification history in Superadmin, and shared multi-company access.
- [ ] Incident notifications, external uptime checks, backup status, error reports before sign-in, and raw log aggregation.
- [ ] Pick a provider for automated company subscription payments. Compare Stripe Billing and Mollie for EUR card and SEPA payments. Keep manual bank transfer available for annual and pilot invoices.
- [ ] Give company owners a billing screen and show payment method, last payment, next charge, invoices and failed payments in Superadmin. Reconcile provider events with the subscription and keep the existing grace and closeout rules.
- [ ] Plan quotas, version policies and staged feature rollout.

## 2. Accounts and invitations (phases 1 and 2 of AUTH_REVIEW.md)

- [ ] **Deprecate sign-up:** remove `/register` and the "create a company" step of `/onboarding`, stop reading `company_name` from user metadata in `bootstrap_profile()`, set `DISABLE_SIGNUP=true` on the Auth service (invitations keep working), and drop the Google "create a company" path. Companies come only from the operator panel (F1, F2).
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

- [ ] Checklist of production Auth settings in `DEPLOYMENT.md` (written for the self-hosted stack; review it when sign-up is closed): OTP expiry, password policy, e-mail confirmation, rate limits, SMTP, captcha if sign-up ever reopens.
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

- [x] Provide full and lean Compose configurations for a separate EchoBox stack on the shared Docker server.
- [ ] Provision an independent EchoBox Supabase stack and verify it alongside the existing Docker instance using the [self-hosting plan](DEPLOYMENT.md#5-self-hosted-supabase-on-a-shared-docker-server).
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

## 10. Dashboard follow-ups

The decision dashboard (`get_dashboard_insights`) is in. Next, once there is real usage to learn from:

- [ ] **Fleet size** in the company settings (how many radios the company owns). With it the capacity chart can draw the limit and the findings can say "you are at 91% of your radios on peak days" instead of "this is the minimum fleet".
- [ ] Cost of a lost radio in the settings, so losses can be shown in euros.
- [ ] Company-level thresholds for the findings: how late is "on time" (10 minutes now), how long before a guide counts as lapsed (45 days), how much concentration is too much (40%).
- [ ] Rider-level view for admins: stops per day, punctuality over time, per rider.
- [ ] Revenue and orders by source and by guide over the 12 months (retention), and a forecast of the month from bookings already made.
- [ ] Export of the month to CSV and PDF for the accountant.

- [ ] Drop `get_dashboard_stats` in a later migration once no deployed app build calls it (the new dashboard uses `get_dashboard_insights`).

## 11. More languages in the app

The app has Italian and English (`src/i18n`). To add German or French: add the language to `APP_LANGS`, a dictionary next to
`en.ts` (the unit test lists every missing text), the dayjs and antd locales in `src/lib/dates.ts` and `src/App.tsx`, and take
the landing screenshots in that language (`capture.mjs`). Not yet translated: e-mails sent by Supabase Auth (invitation,
confirmation, reset), the PDF header text of the order export, and the public privacy, terms and cookie pages.

## 12. Subscriptions and billing follow-ups

The plans, limits, invoices, requests, notices, console pages, customer screen and landing pricing are in
([BILLING.md](BILLING.md)). Still open:

- [ ] **Fix the real prices.** The numbers (Starter 29, Pro 79, Business 149) are a starting point. Change them in the console:
  customers, invoices and the landing page follow. Then update the fallback in `src/features/billing/pricing.ts`.
- [ ] **Decide on a free trial for new sign-ups**: Piani -> "Prova per i nuovi clienti". Off by default, so new companies keep
  full access until an operator assigns a plan.
- [ ] **Pick the electronic invoicing service** (SDI) and decide how invoice links get into the console.
- [ ] **Automatic payments** with Stripe (Checkout, customer portal, webhook that marks invoices paid): the data model is ready.
- [x] Draft invoices are prepared automatically every month (and yearly renewals 30 days ahead); the operator reviews and issues them.
- [ ] Automate the next steps on top of the drafts: e-mail the issued invoice to the customer, create the fiscal invoice in the e-invoicing service (SDI), collect the payment (Stripe / SEPA) and mark it paid by itself.
- [ ] An operator e-mail summary when new drafts are ready (today the Fatture tab shows a counter).
- [ ] Mobile app: show the same notices to company admins using `company_billing()`.
- [ ] Hard limits per plan (block new orders), only if soft limits turn out to be abused.
- [ ] Billing e-mails in German and French, and per-company language.
- [ ] Companies that already exist have no subscription (full access): assign them a plan or a forever subscription from the console.
- [ ] Add the yearly terms (refund of whole months left, upgrade difference, downgrade at renewal) to the legal terms page `/terms` after a lawyer has read them.
