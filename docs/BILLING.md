# Subscriptions and billing

How plans, limits, invoices and reminders work, how the operator uses them in the Superadmin console, and how the web and
mobile apps read them. Everything lives in the database, so every app follows the same rules.

## The model

A company has **one subscription**: a plan, a state, a billing interval and optional dates.

- **Plan** (`private.platform_plans`): monthly and yearly price, included riders, included orders per month, the price of an
  extra rider and of a block of extra orders. An empty limit means unlimited. Plans can be **public** (customers see them and can
  ask to switch) or **custom** (only the operator can assign them). Starting prices: Starter 29, Pro 79, Business 149 euro per
  month, seeded by the migration and editable in the console.
- **State**: `trial`, `active`, `past_due`, `expired` or `cancelled`. **Forever** is an active subscription with no end date.
  A company without a subscription has full access and no limits.
- **Access** follows the subscription (`company_access_mode`): `full` while active or in trial, `full` during a grace period,
  then `closeout` (finish open jobs only) and `read_only`. A running trial that reaches its end date restricts access by itself.

### What is counted

| | Counted | Not counted |
|---|---|---|
| Orders | created in the calendar month, in the company's time zone | cancelled orders, orders of earlier months |
| Riders | enabled rider accounts (a disabled rider costs nothing) | admins, disabled riders |

The number of riders who actually had an order is shown next to the limit for information (`active_riders`).

### Limits are soft

Reaching a limit never blocks work. The company sees a notice, receives an e-mail once, and the extra is billed on the next
invoice: `base + (riders - included) * extra rider price + ceil((orders - included) / block) * extra orders price`.
Only non-payment restricts access. The same formula exists three times, pinned together by tests: `private.estimate_bill`
(database), `estimateFromPlan` (console) and `monthlyCost` (landing calculator).

## Yearly plans: discount, upgrades, downgrades and refunds

- **Discount:** the yearly price is about two months free on the **base fee only** (Starter 290 instead of 348 euro, Pro 790
  instead of 948, Business 1,490 instead of 1,788). Extra riders and extra orders stay at the normal price and are billed monthly.
- **Paid in advance.** Extras of the month are invoiced after the month.
- **Upgrade** (bigger plan): starts at once. On a yearly plan the customer pays the **difference of the yearly base fee for the
  whole months left**: `(new yearly price - old yearly price) x months left / 12`. On a monthly plan the new price applies from the
  next invoice.
- **Downgrade** (smaller plan, or yearly to monthly on the same plan): starts at the **next renewal**. Nothing is charged or
  refunded. The console stores it as a scheduled change (`next_plan_code`) and applies it when the renewal invoice is paid.
- **Cancellation:** a yearly plan is refunded the **base fee of the whole months left**: `base paid x months left / 12`. A month
  that has started counts as used, and extra riders and orders already consumed are never refunded. Monthly plans have no refund.
  The refund can never exceed what was received and not yet refunded.

Example: Pro yearly (790 euro), cancelled with 8 whole months left: refund `790 x 8 / 12 = 526.67` euro. Upgrade from Starter to Pro with
6 months left: `(790 - 290) x 6 / 12 = 250` euro.

The rules are in one place, `src/features/billing/proration.ts`, with tests. The console computes the amounts for you:
**Disdici** on the company page proposes the refund and records it (as a payment of kind `refund`, shown with a minus sign) and
puts the company in read-only; approving a mid-year upgrade offers to issue the difference invoice; approving a downgrade schedules it.
These terms are shown on the landing page and in Settings. They are not yet in the legal terms (`/terms`): ask your lawyer to add them.

## Invoices are prepared automatically

Every month the system prepares a **draft invoice** for each paying company (state active or past due; not trials, not "forever",
not cancelled, and only companies with a plan), from the real figures of the month that has just ended in the company's time zone:

| Plan | What the draft contains |
|---|---|
| Monthly | base fee + extra riders + extra orders of the closed month |
| Yearly | extra riders and extra orders of the closed month only (the base fee was paid in advance); no draft when there are no extras |
| Yearly, term ending within 30 days | the **renewal** invoice of the next term, at the price of the plan that will apply then (a scheduled downgrade is already taken into account) |

- Drafts appear in **Fatturazione -> Fatture**, with the tag *Automatica* and a counter on the tab. Nothing is sent to the customer and
  customers cannot see a draft.
- **Review, then issue:** *Modifica* corrects the lines (a discount, a different quantity, a note) and the due date; *Emetti* gives the draft its
  real number (`EB-<year>-<n>`) and makes it visible to the customer; *Scarta* voids it. A voided draft is **not created again**; this is
  why automatic drafts are discarded, not deleted. Placeholder numbers (`BOZZA-...`) disappear at issue, so voided drafts leave no gaps.
- There is one draft per company and period, so running the generation again never duplicates anything.
- **When:** the same worker that sends the billing e-mails prepares them, at most once an hour, so they exist a few minutes after midnight
  of the 1st. If the worker is not running, use **Genera bozze**: pick a closed month (any past month works) for all companies or one.
- **Sending stays manual for now.** Issue the legal invoice in your invoicing service (SDI), paste its link, and mark it paid when the
  money arrives. When sending, e-invoicing or payment collection are automated later, they start from these same invoices.

## Operator (Superadmin console)

| Where | What |
|---|---|
| **Piani** | Create, edit, duplicate and archive plans. Mark a plan "Su misura" to hide it from customers and from the site. Choose the plan with the **"Il più scelto"** badge. Set a **free trial for new companies** (plan and days; 0 = off). |
| **Fatturazione** | Companies with usage bars (amber from 80%, red at 100%), payment state and amount due. Tabs for all invoices, who paid, plan requests and the e-mail queue. Filters: limit reached, in trial, overdue, unpaid, no subscription. |
| Company -> **Abbonamento** | Change plan, state, interval, **forever**, grace and close-out dates, billing e-mail and notes. Start a trial. See usage and the month's estimate, create an invoice from the estimate (or review the one prepared automatically), mark it paid, send a reminder. **Disdici** cancels and proposes the refund. A scheduled downgrade is shown here. |
| Company header | **Sospendi** blocks access. **Rimuovi** deletes the company, its orders and its people for good: only when suspended and only if it has **no invoices or payments** (they must be kept for accounting). Otherwise leave it suspended. |

**Invoices**: the console prepares, records and tracks invoices and their payment; it does not issue the fiscal document. Issue the legal invoice
(including electronic invoicing through SDI) with your invoicing service and paste its link into the invoice. Numbers default to
`EB-<year>-<n>`.

**Marking an invoice paid** records the payment and, if you leave "Rinnova l'abbonamento" on, sets the subscription to active and
moves the end date by one month or one year.

**Plan requests**: a company admin asks for an upgrade or downgrade from Settings -> Abbonamento. It appears under
Fatturazione -> Richieste with a badge. Approving applies the plan at once, then issue the invoice. The company sees your answer.

## What the customer sees

Settings -> **Abbonamento** (admins only): plan and status, usage against the limits, the estimate for the month, plan cards with
a monthly or yearly price and Upgrade or Downgrade buttons, and the invoice history with lines and links.
Notices at the top of the app (closable until the situation changes): trial ending in 7 days or over, payment overdue,
orders at 80% and 100%, riders at the limit.

## E-mails

Queued in `private.billing_notices` and sent by the `notify-billing` Edge Function through Resend, in Italian and English:
limit reached (once per month per limit), trial ending (3 days before), payment overdue (once a week), and reminders or free
messages sent by the operator. The same systemd timer that sends rider push notifications calls it every few seconds; a
missing function or a mail error never stops rider push. Recipients: the billing e-mail if set, otherwise the company admins.

## Mobile app

The mobile app (Flutter, separate repository) talks to the same database, so billing needs **no new backend work**. What to
add there, in order:

1. **Update the database first.** Apply the billing migration (`20261127000000_subscription_billing.sql`) to the production database.
   Until then the functions below do not exist.
2. **Respect access mode.** The app already reads `platform_company_access()`. Keep the existing handling and make sure it covers
   `closeout` (the rider can finish jobs already started, nothing new), `read_only` and `suspended` (sign out with a clear message).
   Cancelled or unpaid companies now end up there, so test those three states with a real account.
3. **Admins only: add a "Subscription" screen** (Settings or profile menu) using `company_billing()`. Riders never call it
   (it answers `not_authorized`, 42501). Call it with the signed-in user's session; no service key.
4. **Show these fields** (same JSON as `src/features/billing/types.ts`):
   plan name and state (`trial`, `active`, `past_due`, `expired`, `cancelled`), `forever`, interval, `ends_at` (renewal or trial end),
   usage `orders` and `riders` against `plan.included_orders` and `plan.included_riders` (`null` = unlimited), `estimate.total` and its
   `lines` (`base`, `extra_riders`, `extra_orders`), `invoices` (number, period, amount, status, due date, `external_url` to open),
   and `subscription.next_plan_code` ("changes at the renewal").
5. **Show the same notices as the web app** at the top of the admin home: trial ending within 7 days or over, `past_due`
   (with `grace_until`), orders at 80% and 100% of the included amount, riders at the included number. Rules and wording:
   `src/features/billing/alerts.ts`. Let the user close a notice until the situation changes (store the notice id, for example
   `orders_100:<period_start>`, locally).
6. **Plan requests:** list `plans` (public plans only come back) with monthly and yearly price, included amounts and extra prices.
   Calling `request_plan_change(plan_code, interval, note)` creates a request; show `request` while it is open and a button that calls
   `cancel_plan_change_request()`. Show `last_response` (approved or rejected, with the operator's text) for 14 days.
   Say clearly: upgrade starts at once (yearly: pay the difference for the months left), downgrade starts at the renewal.
7. **Error codes** to translate: `not_authorized`, `request_already_open`, `plan_unavailable`, `company_access_restricted`.
8. **Do not block anything because of a limit.** Limits are soft; only the access mode restricts the app.
9. **Test:** an admin on a company with no subscription (no plan, full access), on a trial, `past_due`, cancelled (read-only),
   a company over its orders limit, one with a scheduled downgrade, and a rider (no billing screen).

| Function | Who | Returns |
|---|---|---|
| `company_billing()` | company admins | access mode, subscription, plan, usage, estimate, public plans, invoices, open request |
| `request_plan_change(plan, interval, note)` | company admins | creates a request (one open at a time) |
| `cancel_plan_change_request()` | company admins | cancels it |
| `platform_company_access()` | everyone | `full`, `closeout`, `read_only` or `suspended` (already used for restrictions) |

## Prices on the landing page

The landing page reads its plans from the database, so **a price changed in the console appears on the site within minutes**,
with no deploy:

1. The `public-plans` Edge Function returns the plans that are **available and visible to customers** ("Visibile ai clienti e
   sul sito" in the plan editor), in their display order. Custom plans and archived plans are never published.
2. The landing page shows them: price, yearly price with its discount, included riders and orders (or "unlimited"), extras, and the
   calculator. The yearly switch and the badge on it are computed from the real prices. The price list has **three choices**: the
   site shows the first three published plans (by "Ordine", then name); Piani warns you if you publish more. Bigger or special needs go
   through the "piano su misura" contact box, not a fourth plan.
3. **Piani -> Evidenzia** chooses the plan that carries the "Il più scelto" badge (one at a time; Pro by default).
4. The answer is cached for 5 minutes by browsers and the CDN.

If the function is not deployed, not configured, slow (6 seconds) or answers something unexpected, the page shows the built-in
prices from `src/features/billing/pricing.ts` and nothing breaks. Keep that file in line with your real prices (the test
`pricing.test.ts` compares it with the seed), so the fallback never shows old numbers.

The name shown is the plan's name. The short text under it is translated for Starter, Pro and Business; for a plan you add, it is
the plan's description (one language), so leave it empty or write it in the language you prefer.

**Switching it on:** apply `20261128000000_public_plans.sql`, deploy the function (DEPLOYMENT.md 6b) and make sure the landing page
knows your API address: it uses `contactEndpoint` (the `contact` function) and takes the plans from the same host
(`.../functions/v1/public-plans`); set `plansEndpoint` in `src/features/landing/config.ts` or
`window.__ECHOBOX_LANDING__` in `landing/index.html` to use another address. The landing domain must be in `ALLOWED_ORIGINS`.

## Changing the prices

Edit the plan in the console (Piani -> Modifica): customers, invoices and the landing page use the new price. Then update the
fallback in `src/features/billing/pricing.ts` when the change is for good.

## Taking payments automatically (later)

The model is ready for a payment provider: subscriptions have `provider`, `provider_customer_id` and
`provider_subscription_id`, invoices have `provider`, `provider_ref` and a link. A Stripe integration would add a Checkout and
customer-portal link and a webhook Edge Function that updates `company_subscriptions.state` and marks invoices paid; plans,
limits, access and notices stay as they are. Stripe does not issue Italian electronic invoices (SDI), so keep your invoicing
service next to it. Bank transfer with the console works today and needs nothing more.

## Tests

`supabase/tests/billing.test.sql` (97 checks: usage, estimate, notices, plan requests, scheduled downgrades, upgrades, refunds, trials,
forever, invoices, payments, reminders, removing companies), `src/features/billing/*.test.ts` and `e2e/subscription.spec.ts`.
