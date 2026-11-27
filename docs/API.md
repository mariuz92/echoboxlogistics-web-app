# API

The back end is Supabase's auto-generated REST API (PostgREST) plus one Edge Function. Any client can
use it: the web app uses `supabase-js`; a mobile app can use `supabase_flutter`
(`supabase.rpc('rider_order_action', params: {...})`).

```
Base URL   https://<project-ref>.supabase.co        (local: http://127.0.0.1:55321)
Headers    apikey: <anon key>
           Authorization: Bearer <user access token>      (omit for anonymous endpoints)
```

Row Level Security applies to every call: a user only ever gets their own company's data. See
[DATABASE.md](DATABASE.md#row-level-security) for the access matrix and error codes.

## Authentication

Use Supabase Auth (`/auth/v1/...` or the client libraries).

```bash
# sign in -> access_token
curl -s -X POST "$BASE/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON" -H "Content-Type: application/json" \
  -d '{"email":"rider1@echobox.test","password":"..."}'
```

First sign-in after registration / invitation: call `bootstrap_profile` (the web app does this
automatically) so the user's profile exists.

## Reading data

Tables are queried with PostgREST filters. Embedded riders use the foreign-key names:

```bash
# Orders whose delivery OR pickup falls in a range (admin)
curl -s "$BASE/rest/v1/orders?select=*,delivery_rider:profiles!orders_delivery_rider_id_fkey(id,full_name),pickup_rider:profiles!orders_pickup_rider_id_fkey(id,full_name)\
&or=(and(delivery_at.gte.2026-11-18T00:00:00Z,delivery_at.lt.2026-11-19T00:00:00Z),and(pickup_at.gte.2026-11-18T00:00:00Z,pickup_at.lt.2026-11-19T00:00:00Z))\
&order=delivery_at.asc" \
  -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN"

# Who is working right now
curl -s "$BASE/rest/v1/rider_activity?select=*&is_busy=eq.true" -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN"
```

A rider calling `GET /orders` receives only orders assigned to them plus unassigned pickups
(`status = awaiting_pickup`).

Admins can `POST`/`PATCH`/`DELETE` `orders` and `guides` for plain fields. `status`, `delivery_rider_id`
and `pickup_rider_id` are **rejected** on direct writes (`42501`): use the RPCs below.

## RPC endpoints

`POST $BASE/rest/v1/rpc/<name>` with a JSON body of named parameters.

### Order actions (admin)

```bash
# Assign the delivery to a rider ("pickup" for the second leg; rider = null to unassign)
curl -s -X POST "$BASE/rest/v1/rpc/assign_order" -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"p_order_id":"<uuid>","p_leg":"delivery","p_rider_id":"<rider uuid>"}'
# -> the updated order row (status = "delivery_assigned")

# Cancel / re-open / move forward manually
curl -s -X POST "$BASE/rest/v1/rpc/admin_set_status" ... \
  -d '{"p_order_id":"<uuid>","p_status":"cancelled"}'
```

`admin_set_status` accepts `cancelled`, `received` (re-open a cancelled order), `out_for_delivery`,
`delivered`, `awaiting_pickup`, `out_for_pickup`, `picked_up`. Assigned statuses need `assign_order`.

### Rider actions

```bash
curl -s -X POST "$BASE/rest/v1/rpc/rider_order_action" ... \
  -d '{"p_order_id":"<uuid>","p_action":"complete_pickup","p_lost":1}'
```

| `p_action` | From → To | Notes |
|---|---|---|
| `claim_pickup` | `awaiting_pickup` → `pickup_assigned` | self-assign an unassigned pickup |
| `start_delivery` | `delivery_assigned` → `out_for_delivery` | caller must be the delivery rider |
| `complete_delivery` | `out_for_delivery` → `awaiting_pickup` (pickup planned) or `delivered` | |
| `start_pickup` | `pickup_assigned` → `out_for_pickup` | caller must be the pickup rider |
| `complete_pickup` | `out_for_pickup` → `picked_up` | optional `p_lost` (≤ radios delivered) |

### Other RPCs

| Function | Body | Returns |
|---|---|---|
| `bootstrap_profile` | `{}` | the caller's `profiles` row |
| `touch_login` | `{}` | – |
| `update_member` | `{p_user_id, p_full_name?, p_phone?, p_roles?, p_disabled?}` (admin) | updated profile |
| `get_channel_board` | `{p_from, p_to}` (admin) | `[{channel, order_id, guide_name, status, delivery_at, pickup_at, busy_until, overdue}]`; `busy_until` is `null` while the radios have not been returned |
| `get_dashboard_insights` | `{p_month: "2026-11-01"}` (admin) | JSON for the decision dashboard: `current` / `previous` (a month in progress is measured up to today and compared with the same days of the month before), `booked_ahead`, `trend` (12 months), `capacity` (most groups and radios out at the same time per day, this month and the next 14 days), `alerts` (overdue pickups, deliveries and pickups without a rider), `stops` (weekday x hour), `guides` (top, new, to win back, losses), `operations` (booking lead time, source, days out, riders), `locations` |

### Rider shifts

Availability, shifts, staffing needs and the hours report. Full list of functions, rules and error codes: [SHIFTS.md](SHIFTS.md#data).

```bash
# A rider says they are available next Wednesday 09:00-13:00 and 16:00-20:00 (replaces that day)
curl -s "$BASE/rest/v1/rpc/save_availability" -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"p_day":"2026-12-02","p_windows":[{"start":"09:00","end":"13:00"},{"start":"16:00","end":"20:00"}]}'

# Their own availability and shifts for a period (RLS: a rider only gets their own rows)
curl -s "$BASE/rest/v1/rider_shifts?select=*&start_at=lt.2026-12-07T00:00:00Z&end_at=gt.2026-11-30T00:00:00Z&order=start_at.asc" \
  -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN"

# An admin plans a shift (to change it later, send the same call with p_shift_id)
curl -s "$BASE/rest/v1/rpc/admin_save_shift" -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"p_rider_id":"<uuid>","p_start_at":"2026-12-02T08:00:00Z","p_end_at":"2026-12-02T12:00:00Z"}'
```

| Function | Body | Returns |
|---|---|---|
| `save_availability` | `{p_day, p_windows, p_rider_id?}` | number of windows saved |
| `admin_save_shift` | `{p_rider_id, p_start_at, p_end_at, p_note?, p_shift_id?}` | shift id |
| `admin_delete_shift` | `{p_shift_id}` | – |
| `admin_create_shifts` | `{p_shifts: [{rider_id, start_at, end_at, note?}]}` (all or none) | number created |
| `admin_cover_from_availability` | `{p_from, p_to, p_rider_id?}` | number created |
| `get_rider_hours` | `{p_from, p_to}` (dates) | `[{rider_id, name, paid_minutes, planned_minutes, shifts, adjusted, items:[{shift_id, day, start_at, end_at, planned_start_at, planned_end_at, note}]}]` |
| `admin_save_need` / `admin_delete_need` / `admin_copy_needs` | see SHIFTS.md | uuid / – / number copied |

### Public booking (no login)

```bash
curl -s -X POST "$BASE/rest/v1/rpc/get_public_tenant" -H "apikey: $ANON" -H "Content-Type: application/json" \
  -d '{"p_slug":"echobox-demo"}'
# -> [{"name":"EchoBox Demo","slug":"echobox-demo","timezone":"Europe/Rome","accepting_bookings":true}]

curl -s -X POST "$BASE/rest/v1/rpc/create_public_order" -H "apikey: $ANON" -H "Content-Type: application/json" \
  -d '{
    "p_slug":"echobox-demo","p_guide_name":"Anna Rossi","p_guide_phone":"+39 340 5551234",
    "p_guide_email":"anna@example.com","p_radios_count":18,
    "p_delivery_at":"2026-11-25T09:30:00Z","p_delivery_address":"Piazza Venezia, Roma",
    "p_pickup_at":null,"p_pickup_address":null,"p_notes":null
  }'
# -> "<order uuid>"
```

Limits: 5 requests per phone per hour, 200 per company per hour (`too_many_requests`).

### Errors

PostgREST returns `{ "code": "...", "message": "..." }`. For RPCs, `message` is one of the short codes
listed in [DATABASE.md](DATABASE.md#error-codes); `code` is `P0001` for business rules, `42501` for
permission problems, `P0002` for "not found", `23505` / `23514` for constraint violations and `23P01`
when the radio channel is already used by another group at the same time (`channel_busy`).

## Edge Function: `invite-member`

`POST $BASE/functions/v1/invite-member` (admin JWT required)

```json
{ "email": "rider@example.com", "full_name": "Mario Rossi", "roles": ["rider"] }
```

| Status | Body | Meaning |
|---|---|---|
| 201 | `{ "ok": true, "invitation_id": "…" }` | invitation stored and email sent |
| 400 | `{ "error": "invalid_email" \| "invalid_roles" \| "invalid_json" }` | |
| 401 | `{ "error": "unauthorized" }` | missing/invalid token |
| 403 | `{ "error": "forbidden" }` | caller is not an active admin |
| 409 | `{ "error": "already_registered" }` | that email already has an account |
| 502 | `{ "error": "email_failed" }` | Auth could not send the email (invitation is rolled back) |

The email contains a link to `<SITE_URL>/join` (set the `SITE_URL` secret).

## Realtime

```js
supabase
  .channel('orders')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, handler)
  .subscribe()
```

Events respect RLS: a rider only receives changes to rows they can read. The shift screens listen to `rider_availability`, `rider_shifts` and `shift_needs` the same way.
