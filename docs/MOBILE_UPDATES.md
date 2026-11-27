# What the mobile app (Flutter) needs

Everything the web app and the database gained that the Flutter app (separate repository, same Supabase project) has to follow,
**including the earlier changes**, in the order to do them. The mobile app already talks to the same database, so almost all of it
is reading new fields and calling new functions: no new backend per feature. Apply the migrations first, then ship the app.

| # | Change | Migration (apply first) | Mobile work | Needed for |
|---|---|---|---|---|
| 1 | Access modes (suspended, read-only, closeout) | `20261127000000_subscription_billing.sql` | small | everyone: unpaid or cancelled companies now end up in these modes |
| 2 | Subscription screen, notices, plan requests (admins) | same | medium | admins |
| 3 | Radio channels stay occupied until the pickup | `20261130000000_channel_hold_until_freed.sql` | small | anyone who picks or shows channels |
| 4 | Rider availability and shifts | `20261201000000_rider_shifts.sql` | medium | riders (admins can use the web) |
| 5 | Delete my account (Play Store) | none yet | small | store listing |
| 6 | Push for shifts | none | small | riders, after 4 |
| 7 | Decision dashboard | `20261123000000_dashboard_insights.sql` (already applied) | optional | admins, if the app shows a dashboard |

Migrations to apply on the server, in order: `20261127000000`, `20261128000000` (landing prices, nothing for mobile), `20261129000000`
(invoice drafts, nothing for mobile), `20261130000000`, `20261201000000`. Section 6b and 6c of [DEPLOYMENT.md](DEPLOYMENT.md).

---

## 1. Access modes: respect all four

`platform_company_access()` (already called by the app) returns one of:

| Value | Meaning | The app should |
|---|---|---|
| `full` | everything works | – |
| `closeout` | the company is winding down | a rider can finish jobs already started (start/complete delivery or pickup, finish a started job); nothing new: no claiming pickups, no creating orders |
| `read_only` | subscription ended or unpaid | look at everything, change nothing; show a banner "Abbonamento scaduto, contatta l'amministratore" |
| `suspended` | the operator suspended the company | sign out with a clear message |

Until now only a few companies were in these modes; with subscriptions, **cancelled and unpaid companies end up there**. Test the three
restricted states with a real account. Errors to translate: `company_access_restricted` (42501) on any write, `company_suspended`.
Re-check the mode when the app comes to the foreground and after a `company_access_restricted` error, not only at login.

## 2. Subscription screen and notices (company admins only)

Full steps and the JSON fields are in [BILLING.md](BILLING.md#mobile-app). Short version:

- `company_billing()` (admins only; a rider gets `not_authorized`, 42501) returns the access mode, subscription, plan, usage,
  estimate, public plans, invoices and the open request. Show: plan, state (`trial`, `active`, `past_due`, `expired`, `cancelled`),
  `forever`, interval, `ends_at`; usage of `orders` and `riders` against `plan.included_orders` / `plan.included_riders` (`null` = unlimited);
  the estimate lines; the invoices (open `external_url`); and `subscription.next_plan_code` ("cambia al rinnovo").
- The same notices as the web top banner (trial ending within 7 days, `past_due` with `grace_until`, orders at 80% / 100%, riders at the
  included number; rules in `src/features/billing/alerts.ts`), dismissible until the situation changes.
- Plan requests: `request_plan_change(plan_code, interval, note)`, `cancel_plan_change_request()`, show `request` and `last_response`
  (14 days). Say: upgrade starts at once (yearly: pay the difference for the months left), downgrade at the renewal.
- **Limits are soft**: never block an action because a limit is reached; only the access mode restricts the app.
- New JSON fields since the first version: `subscription.next_plan_code` and `subscription.next_billing_interval` (a downgrade scheduled for the renewal).
- Errors: `not_authorized`, `request_already_open`, `plan_unavailable`, `company_access_restricted`.

## 3. Radio channels: they stay occupied until the pickup

A channel is no longer "free the day after": it stays **occupied until the order is picked up or cancelled**, also when the planned
pickup time has passed. Two things change for the app, if it shows or picks channels:

- `get_channel_board(p_from, p_to)` rows now have `busy_until` (**`null` while the radios have not been returned**, so handle a null)
  and `overdue` (`true` when the planned pickup is past and the radios are still out). Show a "ritiro in ritardo" mark for `overdue`.
  `pickup_at` can be null too.
- Choosing a channel for an order can now fail with `channel_busy` also because of an **unreturned** order from a previous day.
  Keep the existing message ("Questo canale è già usato da un altro gruppo negli stessi orari"), and offer the channels the board says are free.
- The board refreshes by itself on the web (realtime on `orders` + a 30 s refetch). Do the same: subscribe to `orders` changes and refetch.

The earlier channel settings are unchanged: `tenants.channel_min`, `channel_max`, `channels_exclusive`, `disabled_channels`
(migration `20261120000000_channels_any_range.sql`, already required by the current build).

## 4. Rider availability and shifts

Details: [SHIFTS.md](SHIFTS.md). Riders get two screens; the admin planning stays on the web for now.

**Screen "Le mie disponibilità"** (a week at a time, today and up to 90 days ahead; past days are read-only):
for each day a list of windows (start, end on a 15-minute grid, `24:00` = midnight, up to 6 per day), buttons *Aggiungi fascia*, *Tutto il giorno*,
*Non disponibile* and *Salva*. One call per day:

```dart
await supabase.rpc('save_availability', params: {
  'p_day': '2026-12-02',                       // the day in the company's time zone (tenants.timezone)
  'p_windows': [ {'start': '09:00', 'end': '13:00'}, {'start': '16:00', 'end': '20:00'} ],  // [] = not available
});
```

Reading what is saved (RLS returns only the rider's own rows). Times are instants (UTC): convert to the company's time zone, and
group by the day the window starts:

```dart
final rows = await supabase.from('rider_availability').select()
    .lt('start_at', toIso).gt('end_at', fromIso).order('start_at');
```

**Screen "I miei turni"**: the shifts assigned by the admin, with the hours of the day and of the week, from `rider_shifts`
(`start_at`, `end_at` are the **current** times; `planned_*` are the first ones, an admin may have added or removed time; `note`). Show an
"orario modificato" mark when they differ. Subscribe to realtime on `rider_availability` and `rider_shifts` so changes appear at once:

```dart
supabase.channel('shifts').onPostgresChanges(event: PostgresChangeEvent.all, schema: 'public', table: 'rider_shifts', callback: (_) => reload()).subscribe();
```

Rules to mirror: the screen must follow `tenants.timezone`, not the phone's; a shift belongs to the day it **starts**; hours are `end_at − start_at`.
Error codes (translate): `day_in_the_past`, `day_too_far`, `invalid_windows` (more than 6), `invalid_window`, `invalid_slot`, `invalid_slot_minutes`,
`availability_overlap`, `company_access_restricted`, `rider_not_found`, `not_authorized`. Copy the Italian texts from `src/lib/errors.ts`.
Riders cannot read `shift_needs` or `rider_shift_events` (admins only) and cannot create shifts.

Tests: save two windows, reopen the app (same windows), clear the day, try a past day (error), try overlapping windows (error), a company in
`read_only` (saving refused with `company_access_restricted`), another rider's data never visible.

## 5. "Delete my account" (store requirement)

Google Play needs a deletion link and, ideally, an in-app option. Today there is the public page `/delete-account` (landing site) to put in
the Play Console "Delete account URL". For the app: a *Profile → Delete my account* entry that opens that page (or, later, the in-app flow
planned in [TODO.md](TODO.md#9-account-deletion-google-play-gdpr), an Edge Function `delete-account` that re-checks the password). Until
that exists the operator deletes by hand (runbook in the same TODO section).

## 6. Push notifications for shifts (after 4)

Not built yet ([TODO.md](TODO.md#13-shifts-follow-ups)). Plan: the existing push worker (the `echobox-push.timer` that sends order push)
also sends "new shift", "shift changed" and "tomorrow you work 09:00–13:00". On the app: nothing new for tokens (same FCM registration);
handle a notification with `type: shift` by opening *I miei turni*.

## 7. Dashboard (only if the app shows one)

The web dashboard uses `get_dashboard_insights(p_month)`. The old `get_dashboard_stats` still exists, so the current build keeps working.
Move to the new one when the app gets a dashboard; response shape in [API.md](API.md).

## Release checklist

1. Migrations applied on the server in the order above; web app and console rebuilt.
2. Build with items 1 to 4 (and 5) for iOS and Android; test with: an admin on a company with no subscription, on a trial, `past_due`,
   cancelled (read-only) and suspended; a rider in each state; a company with an unreturned order (channel board); a rider saving availability.
3. Make sure the build points at the same Supabase project as the web app and that realtime is on for the three shift tables
   (`rider_availability`, `rider_shifts`, `shift_needs` are in the publication by the migration).
4. Report sanitized client errors with `report_platform_issue` (already in the requirements, [SUPERADMIN.md](SUPERADMIN.md#flutter-and-the-shared-supabase-backend)).
