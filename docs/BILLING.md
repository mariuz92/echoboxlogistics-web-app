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

## Operator (Superadmin console)

| Where | What |
|---|---|
| **Piani** | Create, edit, duplicate and archive plans. Mark a plan "Su misura" to hide it from customers. Set a **free trial for new companies** (plan and days; 0 = off). |
| **Fatturazione** | Companies with usage bars (amber from 80%, red at 100%), payment state and amount due. Tabs for all invoices, who paid, plan requests and the e-mail queue. Filters: limit reached, in trial, overdue, unpaid, no subscription. |
| Company -> **Abbonamento** | Change plan, state, interval, **forever**, grace and close-out dates, billing e-mail and notes. Start a trial. See usage and the month's estimate, create an invoice from the estimate, mark it paid, send a reminder. |
| Company header | **Sospendi** blocks access. **Rimuovi** deletes the company, its orders and its people for good: only when suspended and only if it has **no invoices or payments** (they must be kept for accounting). Otherwise leave it suspended. |

**Invoices**: the console records invoices and their payment; it does not issue the fiscal document. Issue the legal invoice
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

The mobile app reads the same functions with the signed-in user's session:

| Function | Who | Returns |
|---|---|---|
| `company_billing()` | company admins | access mode, subscription, plan, usage, estimate, public plans, invoices, open request |
| `request_plan_change(plan, interval, note)` | company admins | creates a request (one open at a time) |
| `cancel_plan_change_request()` | company admins | cancels it |
| `platform_company_access()` | everyone | `full`, `closeout`, `read_only` or `suspended` (already used for restrictions) |

Riders do not see billing. The `company_billing` JSON has the same shape as `src/features/billing/types.ts`.

## Changing the prices

Edit the plan in the console: customers and invoices use the new price immediately. The landing page shows
`src/features/billing/pricing.ts`: update it to match, change the seed in the migration only for new installations, and keep
`pricing.test.ts` passing (it compares the file with the migration seed).

## Taking payments automatically (later)

The model is ready for a payment provider: subscriptions have `provider`, `provider_customer_id` and
`provider_subscription_id`, invoices have `provider`, `provider_ref` and a link. A Stripe integration would add a Checkout and
customer-portal link and a webhook Edge Function that updates `company_subscriptions.state` and marks invoices paid; plans,
limits, access and notices stay as they are. Stripe does not issue Italian electronic invoices (SDI), so keep your invoicing
service next to it. Bank transfer with the console works today and needs nothing more.

## Tests

`supabase/tests/billing.test.sql` (78 checks: usage, estimate, notices, plan requests, trials, forever, invoices, payments,
reminders, removing companies), `src/features/billing/*.test.ts` and `e2e/subscription.spec.ts`.
