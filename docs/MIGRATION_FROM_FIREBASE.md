# Migration from Firebase

This release moves the app from Firebase (Auth + Firestore) to Supabase (Auth + Postgres), upgrades every
dependency, adds a real back end (schema, security rules, business logic, tests), and refreshes the UI.

## What changed at a glance

| Before | Now |
|---|---|
| Firebase Auth | Supabase Auth (email + password, optional Google) |
| Firestore collections, no server-side rules in the repo | Postgres + Row Level Security, constraints, triggers, RPCs |
| Business logic spread over browser code (`orderApi.ts`, `channelsSync.tsx`, `riderStatusApi.tsx`) | In the database; the browser only calls RPCs |
| `localStorage` as the source of identity, tenant and radio channels | Supabase session + server state (TanStack Query) |
| Firestore `onSnapshot` listeners | Supabase Realtime on `orders` |
| React 18, antd 5, Vite 6, `@refinedev/antd` | React 19, **antd 6**, Vite 8, TypeScript 7, headless Refine |
| No tests, no docs, no container, no CI | 86 DB tests + 45 unit tests + 44 browser tests, docs, Docker image, GitHub Actions CI |

## Package upgrades

`react 18→19`, `antd 5→6.7`, `@ant-design/icons 5→6`, `vite 6→8`, `@vitejs/plugin-react 1→6`,
`typescript 5→7`, `recharts 2→3`, `react-router 7.1→7.18`, `@refinedev/core 5.0.12`,
`@supabase/supabase-js 2.119`, `dayjs 1.11.23`, `jspdf 4.2.1`.

Removed: `firebase`, `@refinedev/antd` (supports antd 5 only, and pulled in a vulnerable `path-to-regexp`),
`@refinedev/cli`, `@refinedev/simple-rest`, `@ant-design/pro-layout`, `@uiw/react-md-editor`, `react-csv`,
`react-router-dom` (everything imports from `react-router`), and the stale `@types/*`.
`npm audit` reports 0 vulnerabilities.

## Data model mapping

| Firestore | Postgres |
|---|---|
| `tenants/{id}` | `tenants` (`name` + unique `name_key`, `slug`, `timezone`, `channel_min`, `channel_max`, `disabled_channels`, `channels_exclusive`) |
| `users/{uid}` with `role: ["admin","rider","guide"]` | `profiles` for **admin / rider** (1:1 with `auth.users`). Guides become rows in **`guides`** (contacts without a login) |
| `invitations/{token}` | `invitations` (matched by verified email; the custom token + OTP are gone) |
| `orders/{id}` (no `tenantId`!) | `orders` (with `tenant_id`) |
| `rider_status/{uid}` | **view** `rider_activity`, derived from open orders |
| tenant `iddleChannels` / localStorage `Iddlechannels` | derived from open orders and their times (`get_channel_board`) |

### `orders` fields

| Firestore | Postgres |
|---|---|
| `nomeGuida`, `telefonoGuida` | `guide_name`, `guide_phone` (+ new `guide_email`, `guide_id`) |
| `canaleRadio` (string) | `radio_channel` (integer) |
| `oraConsegna`, `luogoConsegna` | `delivery_at`, `delivery_address` |
| `oraRitiro`, `luogoRitiro` | `pickup_at`, `pickup_address` |
| `radioguideConsegnate`, `extra`, `lost` | `radios_count`, `extra_radios`, `lost_radios` |
| `saldo`, `invoiceRequired` | `balance`, `invoice_required` |
| `consegnatoDa` / `deliveryName` | `delivery_rider_id` (name via join) |
| `ritiratoDa` / `pickupName` | `pickup_rider_id` (name via join) |
| `note` | `notes` |
| `status` (Italian) | `status` enum, see below |

### Status mapping

| Firestore `status` | Postgres `order_status` |
|---|---|
| `Presa in Carico` | `received` |
| `Assegnato` with `consegnatoDa` only | `delivery_assigned` |
| `Assegnato` with `ritiratoDa` | `pickup_assigned` |
| `In Consegna` | `out_for_delivery` |
| `Consegnato` | `delivered` (or `awaiting_pickup` if a pickup is planned and unassigned) |
| `Attesa ritiro` | `awaiting_pickup` |
| `In Ritiro` | `out_for_pickup` |
| `Ritirato` | `picked_up` |
| `Annullato` | `cancelled` |

The old `Assegnato` meant both "delivery assigned" and "pickup assigned"; the new enum separates them,
which removes the guesswork the old code did in `handleShare` and `updateRiderStatusFromOrder`.

## Migrating existing data

> **No automated Firestore → Postgres import is included.** If you have production data to keep, follow
> this outline (ask for a script if you want one built and tested against an export).

1. **Create the tenants** in Supabase and keep a map `firestore tenant id → uuid`. Names must be unique
   ignoring case/whitespace (`name_key`).
2. **Users.** Two options:
   - *Re-invite* (simplest, supported out of the box): create the company's first admin by registering,
     then invite everyone else from **Team e rider**. Nobody keeps an old password.
   - *Import accounts and password hashes*: Supabase documents importing Firebase Auth users, including
     Firebase's scrypt password hashes (see "Migrate from Firebase Auth" in the Supabase docs; verify the
     current procedure). Then insert the matching `profiles` rows (`id` = the new `auth.users.id`).
   Users with only the `guide` role become `guides` rows (no account).
3. **Orders.** Export `orders`, resolve each order's tenant (the old collection had no `tenantId`, so you have to
   infer it from the rider/guide user or assign by hand), map fields and statuses with the tables above, and
   insert with `set_config('app.order_actions','on', false)` in the session so statuses and riders can be written
   directly (the guard trigger otherwise rejects them).
4. **Clean up before inserting.** The database enforces rules the old data may violate:
   - `pickup_at >= delivery_at`
   - no two open orders on the same radio channel with overlapping times (delivery to pickup) per company
   - a `*_assigned` / `out_for_*` status needs the matching rider id
   Decide how to resolve violations (null the pickup, close old orders, drop a duplicate channel).
5. `rider_status` and the tenant channel arrays are **not migrated**: they are derived.
6. Run `supabase test db` and open the dashboard to sanity-check totals against Firestore.

### The mobile app

The code comments mention a **Flutter** client sharing the Firestore data (`User` / `fromJson`). It is not in
this repository. **It keeps talking to Firestore until it is ported**, so it will not see orders created through
this app. Port it to `supabase_flutter`: [API.md](API.md) documents the RPCs it needs
(`rider_order_action`, `claim_pickup`, reading assigned orders, Realtime).

## Bugs and logic problems fixed

### Security

| Problem in the old app | Fix |
|---|---|
| Registering with the name of an **existing company made you its admin** (the code comment said "guide", the code assigned `admin`) | Joining a company is only possible via an invitation; `bootstrap_profile` returns `company_exists` |
| Orders lived in one root collection **without a tenant**, and the app queried that whole collection for every company (the Firestore security rules are not in the repo, so isolation depended on rules nobody could review) | `tenant_id` on every row + RLS; verified by `database.test.sql` |
| User, rider and guide lists were not tenant-scoped in the queries either | RLS on `profiles`, `guides` |
| Authorization decisions trusted `localStorage` (`email`, `userInfo`, `tenantId`): setting a key bypassed the client guard | Session comes from Supabase Auth; roles from the database |
| Any user could write role / tenant fields from the browser (no server-side enforcement in the repo) | Column privileges + `update_member` RPC; last admin protected |
| The public booking page wrote straight into the shared collection with no validation | `create_public_order`: validation, tenant-aware, throttled |

### Business logic

| Problem | Fix |
|---|---|
| Radio channel usage was tracked in **localStorage per browser** and mirrored to the tenant document: two admins overwrote each other, cancelling an order never freed a channel, and an order's own channel vanished from its edit dropdown | Derived from open orders; unique index prevents double booking; the edit list always includes the order's own channel |
| The "manual" free → used → disabled cycle could contradict real orders | Only "disabled" is manual; "busy" is computed |
| Month / year views filtered the **already loaded single day** of orders | The list queries the whole selected period (day / week / month / year) |
| A pickup only appeared on the **delivery** day | Lists match delivery **or** pickup time |
| Rider status was maintained by several client functions and drifted; the "clear" query was not tenant-scoped | `rider_activity` view computed from orders |
| `Assegnato` was ambiguous (delivery vs pickup) | Separate `delivery_assigned` / `pickup_assigned` states and a documented state machine |
| Anyone could set any status in the edit form | Status changes only through validated actions; audit log |
| Dashboard fetched all orders (capped at 10,000) and computed in the browser; "hourly" chart was really per day; weeks were approximated; "+100%" shown when last month was 0; cancelled orders inflated revenue | `get_dashboard_stats` in SQL, tenant time zone, real hourly distribution, `n/d` without baseline, cancelled orders excluded |
| Day boundaries used the browser's time zone | Tenant time zone; DST-safe (tested) |
| The booking form collected an **email and never stored it** | Stored (`guide_email`) |
| A typed (not picked) address was not saved, so validation failed; without a Maps key the field was stuck on "Caricamento mappa…" | Controlled input that always works, Places suggestions when a key exists |
| CSV export did not quote fields | Quoted, UTF-8 BOM for Excel |
| Dead links (`/Collaboratori`, `/auth/request-invite`) | Redirected / removed |
| Password messages inconsistent ("min 6" vs "almeno 12") | One policy, enforced by Supabase and the form |

### Found later by the browser tests

Problems in the *new* code that only a real browser against the real stack could reveal, all fixed:

| Problem | Fix |
|---|---|
| After a first sign-in several parts of the app asked for the profile at once; the loser of the race got a duplicate-key error (an invitee saw "invitation invalid") | `bootstrap_profile` serialises per user with an advisory lock (migration `…000400`); the client shares one in-flight load |
| Deactivating an account while its owner had the app open in another tab crashed the app to a blank screen ("useReadyUser used outside an authenticated route") | `RequireUser` guard + hard redirect to the login page with an explanation; an error boundary as a safety net |
| Confirming an email whose company name was already taken dropped the user on an empty login page with no explanation | The reason is kept across the redirect and shown on the login page |
| The row action menu opened submenus on **hover**, which does not exist on tablets and phones | Submenus open on tap/click |
| Every background (realtime) refresh flashed a spinner over the orders table and could close an open menu | Spinner only on first load and when switching period |
| Two form inputs shared the DOM id `guide_id`; deprecated antd 6 props (`Notification.message`, `Input.addonAfter`) | Fixed; the browser-error gate now fails any test that logs a console error |

## UI / UX changes

- New brand theme (navy / coral / pale blue from the logo), **dark mode**, Inter font self-hosted (no Google Fonts request).
- Responsive layout with a mobile drawer; **rider-specific "Le mie consegne"** screen with big action buttons,
  tap-to-call and map links.
- Orders: period switcher (day / week / month / year), search, status filter, "only unassigned", KPI strip,
  overdue-pickup alert, status tags with explanations, one row action menu (assign, change status, cancel / re-open),
  confirmation before destructive actions, order timeline in the details drawer.
- Radio channel map showing free / in use / disabled with the order holding each channel.
- Dashboard redesigned: KPIs with deltas, daily/weekly/hourly charts, heat-map, top guides and locations.
- Team page with live rider activity, invitations (resend / revoke) and activate / deactivate switches.
- New *Guide* address book, *Impostazioni* (company, time zone, booking link), *Profilo* (details, password).
- Public booking form rebuilt (mobile friendly, honeypot, clear errors); legacy `/OrdineGuida` still works.
- Login no longer asks for the company name (the account already belongs to one company).

## Things to review outside the code

- **Privacy and cookie policy**: the cookie page now names Supabase instead of Firebase; have the full privacy
  policy reviewed for the new processor, the data region and any transfers.
- **Landing page claims** ("10k+ orders managed", "99.9% uptime guarantee", "24/7 support") are marketing copy that
  was not changed; confirm they are accurate.
- **Google Maps API key**: restrict it by HTTP referrer in Google Cloud.
- **Old Firebase project**: keep it read-only until the data is migrated and the mobile app is ported, then delete it.

## Rolling back

The Firebase code is in git history (`git log` before the migration commit). Supabase and Firebase do not
share state, so a rollback means redeploying the old build and the old Firestore rules; orders created in Supabase
since the cut-over would have to be exported first.
