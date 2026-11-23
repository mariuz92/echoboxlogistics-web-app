# Moving the Flutter app from Firebase to Supabase

This is a **guide**, not a change: nothing in `echoboxlogistics_mobile` (the Flutter project, package name
`flutter_order`) was modified. It was only *read* to write this document. Everything below is based on what that code
does today and on what was built and tested in this repository.

- [1. What was done in the web project](#1-what-was-done-in-the-web-project-and-why-it-matters-for-the-app)
- [2. What the Flutter app uses today](#2-what-the-flutter-app-uses-today)
- [3. Firebase → Supabase mapping](#3-firebase--supabase-mapping)
- [4. Data mapping (models and statuses)](#4-data-mapping-models-and-statuses)
- [5. Dart snippets for the main flows](#5-dart-snippets-for-the-main-flows)
- [6. Push notifications](#6-push-notifications-the-one-part-that-needs-new-back-end-work)
- [7. Suggested order of work](#7-suggested-order-of-work)
- [8. Security notes](#8-security-notes-for-the-app-repository)

## 1. What was done in the web project (and why it matters for the app)

The web app used to be a client that talked to Firestore directly and kept its rules in browser code. It was
rebuilt around one idea: **the database enforces the rules, clients only call it.**

| Step | What it means | Where |
|---|---|---|
| Schema | Tenants, profiles (admins/riders), guides, orders, invitations, audit log; `tenant_id` on every row | `supabase/migrations/…init_schema.sql` |
| Security | Row Level Security: a user only sees their company; riders only see their own jobs + unassigned pickups | `…_rls.sql` |
| Business rules | Order state machine, one open order per radio channel, assignment rules, onboarding, public booking: all in SQL functions (RPCs) | `…_rpcs.sql`, `…_functions_triggers.sql` |
| API | Supabase's auto-generated REST + Realtime + Auth; no custom server | [API.md](API.md) |
| Tests | 86 database assertions (pgTAP) + 45 unit tests + 44 browser tests | `supabase/tests`, `src/**/*.test.ts`, `e2e/` |

What the app gets from this **for free**, without re-implementing anything:

- The **rider actions** (`claim_pickup`, `start_delivery`, `complete_delivery`, `start_pickup`, `complete_pickup`) are one
  RPC, `rider_order_action`. The app no longer has to compute statuses, update `rider_status`, free channels or
  guard transitions: today that logic is spread over `api_order.dart`, `order_management.dart` (2,032 lines) and
  `rider_status_api.dart`.
- **Admin assignment** is `assign_order(order, 'delivery'|'pickup', rider)`.
- **Who is busy** is a read-only view (`rider_activity`) instead of a hand-maintained `rider_status` collection.
- **Radio channels** are computed (`get_channel_status`) instead of tracked on the client.
- **Time zones, validation, throttling, audit trail** are server-side.

Lessons from building and testing it that apply to the app too:

1. **Never let several parts of the app create the user profile at once.** After a first sign-in, three places asked for
   the profile simultaneously and the loser got a duplicate-key error. The fix is server-side (an advisory lock in
   `bootstrap_profile`) plus a single in-flight load on the client. Do the same in the Dart auth repository.
2. **Handle the one-time "no company yet" case explicitly** (`bootstrap_profile` raising `no_company`).
3. **Do not rely on hover or on timing in UI tests**: on a phone there is no hover. Use taps for menus.
4. **Do not keep identity in local storage**: take it from the session.

## 2. What the Flutter app uses today

From reading `lib/`, `pubspec.yaml`, `notifications/` (42 Dart files; 21 touch Firebase):

| Area | Today | Notes |
|---|---|---|
| Architecture | `layers/{data,domain,presentation}`, Riverpod, a hand-written router in `routing/` | The port is mostly confined to `layers/data/` and the entities in `layers/domain/entity/` |
| Auth | `firebase_auth`: email + password, Google sign-in, password reset, `updatePassword`, `authStateChanges` | `fireabase_auth_api.dart` (409 lines), `login_page_notifier.dart` |
| Database | `cloud_firestore` on a **named database** (`DBID` from `.env`). Collections: `users`, `orders`, `notifications`, `tenants`, `rider_status` | ~84 reads, 33 `where`, 18 `add`, 10 `update`, 10 `delete`, 7 `snapshots()` streams |
| Realtime | 7 Firestore streams: orders (`api_order.dart`), rider statuses, notifications | |
| Push | `firebase_messaging` + `flutter_local_notifications`; device tokens saved in **`users.devicesFcm` = `{deviceId: token}`** | `token_api.dart`, `firebase_messaging_provider.dart` |
| Server code | `notifications/` = Firebase **Cloud Functions** (Node 22, region `europe-west8`): `onOrderChange` (Firestore trigger), `sendDeliveryReminder`, `sendPickupReminder` (Cloud Tasks) | sends FCM **and** writes a document to `notifications` |
| Storage | `firebase_storage` helper in `fireStorage.dart` | **Not used anywhere else**: it can simply be deleted |
| Models | `Order`, `User`, `Tenant`, `RiderStatus` with `fromJson`/`fromFirestore`, Firestore `Timestamp` fields | Same legacy shapes the web app had (`nomeGuida`, `oraConsegna`, `consegnatoDa`, …) |
| Screens | home (time-ordered list), order management (create/edit), riders status, notification hub, profile, settings, login | |
| Config | `flutter_dotenv` loading `.env` (declared as a Flutter **asset**) | see [section 8](#8-security-notes-for-the-app-repository) |

## 3. Firebase → Supabase mapping

| Firebase | Supabase | Dart package / call |
|---|---|---|
| `firebase_core` + `Firebase.initializeApp` | `Supabase.initialize(url, anonKey)` | `supabase_flutter` |
| `firebase_auth` email/password | Supabase Auth | `auth.signInWithPassword`, `auth.signUp`, `auth.resetPasswordForEmail`, `auth.updateUser` |
| Google sign-in | Supabase Auth with the Google ID token | keep `google_sign_in`, then `auth.signInWithIdToken(provider: OAuthProvider.google, idToken: …)`; enable the Google provider in Supabase |
| `authStateChanges()` | `auth.onAuthStateChange` | |
| Firestore `get()` / `where` | `from('orders').select().eq(...)` | RLS already limits rows to the rider |
| Firestore `snapshots()` | `from(...).stream(primaryKey: ['id'])` or `channel().onPostgresChanges(...)` | see the limits below |
| Firestore writes / transactions / batches | RPCs (`rider_order_action`, `assign_order`, `admin_set_status`, `update_member`) | one network call, validated server-side |
| Cloud Functions triggers + Cloud Tasks | DB trigger + Edge Function + `pg_cron` | [section 6](#6-push-notifications-the-one-part-that-needs-new-back-end-work) |
| FCM | **stays FCM** (Supabase does not deliver push) | keep `firebase_messaging` + `firebase_core` for push only |
| Firebase Storage | Supabase Storage (only if needed; currently unused) | `supabase.storage` |

You do not have to leave Firebase *entirely* on day one: **keeping `firebase_core` + `firebase_messaging` just to
receive push** is normal. Auth, data and server logic move to Supabase.

## 4. Data mapping (models and statuses)

### `User` → `profiles`

| Firestore `users/{uid}` | Postgres `profiles` |
|---|---|
| `id` | `id` (= Supabase auth user id) |
| `email`, `displayName`, `photoURL` | `email`, `full_name`, `avatar_url` |
| `phoneNumber` | `phone` |
| `role: ["admin","rider","guide"]` | `roles: ["admin","rider"]`; **guides are no longer users**, they are rows in `guides` |
| `disabled`, `tenantId` | `disabled`, `tenant_id` |
| `createdAt`, `lastLoginAt` (`Timestamp`) | `created_at`, `last_login_at` (ISO 8601 `timestamptz`, parse with `DateTime.parse(...).toLocal()`) |
| `devicesFcm` map | new table `device_tokens` (see section 6) |

### `Order` → `orders`

| Firestore / Dart | Postgres |
|---|---|
| `nomeGuida`, `telefonoGuida` | `guide_name`, `guide_phone` (+ `guide_email`, `guide_id`) |
| `canaleRadio` (String) | `radio_channel` (int) |
| `oraConsegna` / `luogoConsegna` | `delivery_at` / `delivery_address` |
| `oraRitiro` / `luogoRitiro` | `pickup_at` / `pickup_address` |
| `radioguideConsegnate`, `extra`, `lost` | `radios_count`, `extra_radios`, `lost_radios` |
| `saldo`, `invoiceRequired` | `balance` (numeric), `invoice_required` |
| `consegnatoDa` + `deliveryName` | `delivery_rider_id` (+ embedded `delivery_rider.full_name`) |
| `ritiratoDa` + `pickupName` | `pickup_rider_id` (+ embedded `pickup_rider.full_name`) |
| `note` | `notes` |
| `status` | `status` enum |

### `OrderStatus` (Dart enum has 8 values; the database has 9)

| Dart `OrderStatus` | Postgres `order_status` |
|---|---|
| `presaInCarico` | `received` |
| `assegnato` (delivery rider set) | `delivery_assigned` |
| `assegnato` (pickup rider set) | `pickup_assigned` |
| `inConsegna` | `out_for_delivery` |
| `consegnato` | `delivered` |
| `attesaRitiro` | `awaiting_pickup` |
| `inRitiro` | `out_for_pickup` |
| `ritirato` | `picked_up` |
| `annullato` | `cancelled` |

`assegnato` splits in two because the old status was ambiguous. In Dart, add the two new values and keep the Italian
`displayName` (label `Assegnato` for both is fine in the UI; the web app says "Consegna assegnata" / "Ritiro assegnato").

### `RiderStatus` → view `rider_activity`

`isBusy`, `headingTo`, `lastStatus`, `lastUpdate` become `is_busy`, `heading_to`, `current_status`,
`last_activity_at`. It is **read-only** and computed from orders, so `rider_status_api.dart` (287 lines of reads and writes) can go away.

## 5. Dart snippets for the main flows

> Illustrative and **not compiled** against your project. API names follow `supabase_flutter` 2.x; check the
> package docs for the exact version you install. Local emulator URL for Android: `http://10.0.2.2:55321`
> (this repo's local stack uses port **55321**).

### Initialise

```dart
// main.dart
await Supabase.initialize(
  url: const String.fromEnvironment('SUPABASE_URL'),
  anonKey: const String.fromEnvironment('SUPABASE_ANON_KEY'),
);
final supabase = Supabase.instance.client;
```

Prefer `--dart-define` over a bundled `.env` (see section 8).

### Sign in (and the first-login profile)

```dart
Future<Profile> signIn(String email, String password) async {
  await supabase.auth.signInWithPassword(email: email, password: password);
  return _loadProfile();
}

// Share ONE in-flight future so concurrent callers never race (see lesson 1).
Future<Profile>? _inFlight;
Future<Profile> _loadProfile() => _inFlight ??= _fetchProfile().whenComplete(() => _inFlight = null);

Future<Profile> _fetchProfile() async {
  final uid = supabase.auth.currentUser!.id;
  var row = await supabase.from('profiles').select().eq('id', uid).maybeSingle();
  row ??= await supabase.rpc('bootstrap_profile'); // accepts an invitation / creates the company
  if (row['disabled'] == true) {
    await supabase.auth.signOut();
    throw const AppException('disabled');
  }
  // Supabase request builders are lazy: they only run when awaited or `.then` is called.
  supabase.rpc('touch_login').then((_) {}, onError: (_) {});
  return Profile.fromJson(row);
}
```

`bootstrap_profile` raises `no_company` (signed in but not attached to a company) and `email_not_confirmed`; map the
`PostgrestException.message` codes with a table like [`src/lib/errors.ts`](../src/lib/errors.ts).

### Read the rider's jobs (RLS does the filtering)

```dart
final jobs = await supabase
    .from('orders')
    .select('*, delivery_rider:profiles!orders_delivery_rider_id_fkey(id, full_name), '
            'pickup_rider:profiles!orders_pickup_rider_id_fkey(id, full_name)')
    .not('status', 'in', '(picked_up,cancelled)')
    .order('delivery_at');
```

A rider only receives their own orders plus unassigned pickups (`awaiting_pickup`). No `where tenantId == …` and no
client-side filtering is needed.

### Realtime

```dart
final channel = supabase
    .channel('orders')
    .onPostgresChanges(
      event: PostgresChangeEvent.all,
      schema: 'public',
      table: 'orders',
      callback: (_) => ref.invalidate(riderJobsProvider), // refetch; RLS filters the events too
    )
    .subscribe();
// dispose: supabase.removeChannel(channel);
```

`stream(primaryKey: ['id'])` is simpler but supports a single filter and **no joins**; with the embedded rider names,
use the channel + refetch pattern above (it is what the web app does).

### Rider actions (replace the status code in `order_management.dart`)

```dart
Future<void> riderAction(String orderId, String action, {int? lost}) async {
  await supabase.rpc('rider_order_action', params: {
    'p_order_id': orderId,
    'p_action': action, // claim_pickup | start_delivery | complete_delivery | start_pickup | complete_pickup
    if (lost != null) 'p_lost': lost,
  });
}
```

### Admin screens

```dart
await supabase.rpc('assign_order', params: {'p_order_id': id, 'p_leg': 'delivery', 'p_rider_id': riderId});
await supabase.rpc('admin_set_status', params: {'p_order_id': id, 'p_status': 'cancelled'});
final channels = await supabase.rpc('get_channel_status');           // free / busy / disabled per channel
final stats = await supabase.rpc('get_dashboard_insights', params: {'p_month': '2026-11-01'});
```

Creating or editing an order is a normal `insert` / `update` on `orders` for the plain fields; `status` and the rider
columns are rejected on direct writes (use the RPCs above).

### Errors

```dart
try { await riderAction(id, 'start_delivery'); }
on PostgrestException catch (e) {
  final message = switch (e.message) {
    'transition_not_allowed' => 'Questa azione non è consentita nello stato attuale.',
    'order_not_claimable'    => 'Questo ritiro non è più disponibile.',
    _                        => 'Si è verificato un errore.',
  };
  showSnack(message);
}
```

The full list of codes is in [DATABASE.md](DATABASE.md#error-codes).

## 6. Push notifications: the one part that needs new back-end work

What the Cloud Functions in `notifications/src/index.ts` do today:

1. `onOrderChange` (fires on every order update): when a **delivery rider or pickup rider is newly assigned**, or the
   **delivery/pickup time changes**, send an FCM message to that rider, write a `notifications` document, and
   (re)schedule a reminder.
2. `sendDeliveryReminder` / `sendPickupReminder` (Cloud Tasks, scheduled before the appointment): re-check the order, skip
   it if it is already delivered/picked up/cancelled, then notify.

Supabase has no equivalent built in, but the pieces fit well:

| Today | Replacement |
|---|---|
| Firestore trigger `onOrderChange` | a trigger on `public.orders` that calls an **Edge Function** through `pg_net` (or reads `order_events`, which already records assignment and status changes) |
| `users.devicesFcm` | table `device_tokens(user_id, device_id, token, platform, updated_at)`; the app upserts its token after login |
| `notifications` collection (in-app feed) | table `notifications(id, tenant_id, user_id, order_id, type, title, body, read_at, created_at)` with RLS "a user reads their own"; the app subscribes via Realtime |
| Cloud Tasks reminders | `pg_cron` job every minute that finds orders starting in N minutes without `reminder_sent_at` and calls the same Edge Function |
| `firebase-admin` `messaging().send` | the Edge Function calls the **FCM HTTP v1 API** with a service-account secret (`supabase secrets set`) |

Sketch (not implemented here; it would be a new migration + Edge Function in **this** repo, and it would also give the
web dashboard the "new booking" alert that is currently missing):

```sql
create table public.device_tokens (
  user_id uuid not null references public.profiles(id) on delete cascade,
  device_id text not null,
  token text not null,
  platform text,
  updated_at timestamptz not null default now(),
  primary key (user_id, device_id)
);
-- RLS: a user manages only their own rows.

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  order_id uuid references public.orders(id) on delete cascade,
  type text not null,            -- assigned_delivery | assigned_pickup | time_changed | reminder
  title text not null,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
```

```ts
// supabase/functions/notify-rider/index.ts (outline)
// 1. receive { user_id, order_id, type } from the DB trigger / cron (verify a shared secret header)
// 2. insert into notifications (service role)
// 3. select tokens from device_tokens where user_id = …
// 4. POST https://fcm.googleapis.com/v1/projects/<id>/messages:send with an OAuth token from the service account
// 5. delete tokens FCM reports as UNREGISTERED
```

Flutter side: keep `firebase_messaging` / `flutter_local_notifications`; after login, upsert
`{user_id, device_id, token}` into `device_tokens` (replacing `NotifToken.addDeviceToken`), and read the feed from
`notifications` (replacing the `notifications` Firestore queries in `notification_service.dart`).

## 7. Suggested order of work

Both back ends cannot serve the same app at once, so plan one cut-over. Each phase can be tested on its own against the
local stack (`npm run db:start` in this repo).

| Phase | Work | Done when |
|---|---|---|
| 0. Prepare | Take `.env` out of git and restrict keys ([section 8](#8-security-notes-for-the-app-repository)); run the local Supabase stack; add `supabase_flutter` | the app builds with both SDKs |
| 1. Auth | Replace `fireabase_auth_api.dart`, `firebase_auth_provider.dart`, `login_page_notifier.dart`; implement `bootstrap_profile` / `touch_login`; invitation and reset-password deep links | log in as `rider1@echobox.test` (local seed) and reach the home page |
| 2. Models | New entities for the table above; status enum with 9 values; `DateTime` instead of `Timestamp` | unit tests for the mappers pass |
| 3. Reads | `api_order.dart`, `user_api.dart`, `role_api.dart`, `rider_status_api.dart` (read side) → `from(...).select`, `rider_activity` | home list and riders page show seeded data |
| 4. Writes | Replace status/assignment code in `order_management.dart` with `rider_order_action`, `assign_order`, `admin_set_status` | a full delivery + pickup cycle works from two devices |
| 5. Realtime | Channel + refetch for orders and the notification feed | changes appear without refresh |
| 6. Push | New tables + Edge Function + cron (section 6); token upsert in the app | assignment and reminders arrive on a device |
| 7. Clean-up | Remove `cloud_firestore`, `firebase_auth`, `firebase_storage`, `fireStorage.dart`, the `notifications/` Cloud Functions project; keep `firebase_core` + `firebase_messaging` if FCM stays | no Firestore import remains |
| 8. Release | Force-update (the old build would keep writing to Firestore); migrate users (re-invite, or import hashes, see [MIGRATION_FROM_FIREBASE.md](MIGRATION_FROM_FIREBASE.md#migrating-existing-data)) | |

Testing: unit-test the status and model mappers in Dart; reuse the server tests (`supabase test db`) for all rules;
add a few Flutter integration tests that sign in as the seeded rider against the local stack.

## 8. Security notes for the app repository

These were noticed while reading the mobile project; none were changed.

1. **`.env` is tracked by git** even though `.gitignore` lists it (it was committed before the rule, so the rule does
   nothing). It contains the Google Maps key and the Firebase client keys. Run `git rm --cached .env` and commit.
   The values stay in the git **history**: restrict the Google Maps key to your app (package name / bundle id) in Google Cloud,
   and consider it exposed.
2. **`.env` is declared as a Flutter asset**, so it is **bundled inside the APK/IPA** and can be extracted. That is fine
   for values that are public by design (the Supabase **anon** key, the project URL) but **never** put the Supabase
   `service_role` key, FCM service-account JSON or any secret there. Prefer `--dart-define` / `--dart-define-from-file`.
3. `google-services.json`, `GoogleService-Info.plist` and `firebase_options.dart` are tracked. They are client
   configuration (not secrets) and are still needed while FCM is used.
4. **Row Level Security is the security boundary** in Supabase: the app can safely hold the anon key, but every table
   must keep RLS enabled (they do in this repository's migrations).
5. Deep links: invitation and password-reset emails link to the **web** app (`/join`, `/update-password`). For riders
   who only use the phone, either let them finish on the web page or configure app links and add the app's redirect URL
   to Supabase *Auth → URL Configuration*.
