# Rider shifts

Couriers do not work "morning" and "evening" turns, they work **hours**, and hours are what a rider is paid for. So the
whole feature is built on exact start and end times, in 15-minute steps, in the company's time zone.

| Who | What |
|---|---|
| Rider (web or mobile) | Says when they are available: for each day, one or more windows (`09:00–13:00`, `16:00–20:30`). Sees the shifts assigned to them and the hours of the week. |
| Admin | Sees the week (riders × days), the day as a Gantt chart with how many riders are on shift each hour, sets how many riders are needed, plans shifts by hand, from the availability, or with the auto-fill, changes them at any time, and reads the hours to pay. |

Web screens: admin **Turni** (`/shifts`, tabs *Settimana*, *Giornata*, *Ore da pagare*), rider **I miei turni** (`/my-shifts`).

## How it works

1. **Availability.** A rider saves one day at a time (`save_availability`): the list replaces the day's windows, an empty list
   means "not available". A rider can edit today and the next 90 days; an admin can edit any day for any rider.
2. **Staffing needs** (admin, optional): "2 riders from 09:00 to 13:00", "3 riders from 13:00 to 18:00". Blocks of a company never overlap.
   They can be copied to other days or to next week. They are what the *Giornata* chart compares the shifts with, and what the
   auto-fill covers.
3. **Shifts.** Three ways to create them:
   - one by one (cell of the week grid or *Giornata* chart → *Aggiungi un turno*);
   - **Usa la disponibilità**: every availability window not yet touched by a shift becomes a shift with the same times;
   - **Riempi in automatico**: covers the staffing needs from the availability (below).
4. **Changes.** An admin can change start, end and note of any shift at any time (an extra hour, a shorter day). The shift keeps the
   times it was **first planned** with (`planned_start_at`, `planned_end_at`) next to the current ones, and every change is recorded
   (who, when, from what to what) in `rider_shift_events`, also when the shift is deleted.
5. **Hours to pay.** `get_rider_hours(from, to)` adds up, per rider, the **paid** minutes (current times), the **planned** minutes
   (first times) and how many shifts were adjusted; the web page shows week or month, the difference (extra or shorter hours), the shifts of each
   rider, and exports a CSV (`;` separated, decimal hours, one line per shift and a total per rider). A shift counts on the day it starts.

Rules enforced by the database (the screens also check them): end after start, at most 16 hours, times on the 15-minute grid in the
company's time zone, a rider never has two overlapping shifts (or two overlapping availability windows), only active riders of the
company can be scheduled, a night shift is one shift (22:00 → 02:00), and a rider with shifts cannot be deleted (disable them).
A company whose access is restricted (`platform_company_access()` not `full`) cannot change availability, needs or shifts.

## Auto-fill

The proposal is computed in the browser (`src/features/shifts/autofill.ts`, unit-tested) and shown as a **preview**; nothing is saved until the
admin confirms, and the shifts are created in one transaction (`admin_create_shifts`: all or none).

For each day, in 15-minute steps: take the first quarter hour that has fewer riders on shift than needed, pick a rider who is available,
not already on a shift, and under the daily limit, and give them a shift that goes on while the need continues (and at least the
minimum length, when the rider is available that long). Repeat until the need is covered or nobody is left. Existing shifts
count: only what is missing is covered. Options:

| Option | Default | Meaning |
|---|---|---|
| Turno minimo | 2 h | Shifts are at least this long when the rider can; shorter only if that is all they offered |
| Ore massime al giorno | 10 h | Per rider, counting the shifts they already have that day |
| Distribuisci le ore in modo equo | on | Among riders who can cover a decent stretch, the one with the fewest hours in the period goes first. Off: the longest stretch wins |

What cannot be covered (nobody available) is listed as **gaps** ("lun 23/11 12:00–14:00, manca 1 rider"); the *Giornata* chart shows them in red.
The result is deterministic: the same data gives the same proposal.

## Data

Migration `supabase/migrations/20261201000000_rider_shifts.sql`; tests `supabase/tests/shifts.test.sql`.

| Table | Contents | Who reads it |
|---|---|---|
| `rider_availability` | `rider_id`, `start_at`, `end_at` | a rider: own rows; admin: company |
| `rider_shifts` | `rider_id`, `start_at`, `end_at`, `planned_start_at`, `planned_end_at`, `note`, `created_by`, `updated_by` | a rider: own rows; admin: company |
| `rider_shift_events` | history: `shift_id`, `event_type` (`created`, `changed`, `deleted`), old/new times, `actor_id` | admin |
| `shift_needs` | `start_at`, `end_at`, `riders_needed` (1–50) | admin |

Nobody writes the tables directly (RLS: select only). Everything goes through these functions (`SECURITY DEFINER`, errors are short codes):

| Function | Caller | Does |
|---|---|---|
| `save_availability(p_day date, p_windows jsonb, p_rider_id uuid = null)` → integer | rider (own) / admin | replaces the day's windows; `[{"start":"09:00","end":"13:00"}]`, `"24:00"` = midnight, at most 6 |
| `admin_save_shift(p_rider_id, p_start_at, p_end_at, p_note = '', p_shift_id = null)` → uuid | admin | creates a shift, or changes one (keeps the planned times) |
| `admin_delete_shift(p_shift_id)` | admin | deletes (the history stays) |
| `admin_create_shifts(p_shifts jsonb)` → integer | admin | creates up to 500 shifts, all or none: `[{"rider_id","start_at","end_at","note"}]` |
| `admin_cover_from_availability(p_from date, p_to date, p_rider_id = null)` → integer | admin | shifts for the availability nobody covers yet; safe to repeat; up to 62 days |
| `get_rider_hours(p_from date, p_to date)` → jsonb | admin | per rider: `paid_minutes`, `planned_minutes`, `shifts`, `adjusted`, `items[]` |
| `admin_save_need(p_start_at, p_end_at, p_riders_needed, p_need_id = null)` → uuid | admin | creates or changes a staffing need |
| `admin_delete_need(p_need_id)` | admin | deletes it |
| `admin_copy_needs(p_from date, p_to date, p_offset_days integer)` → integer | admin | copies the needs of the days onto the days `p_offset_days` later (replacing what is there) |

Error codes: `not_authorized`, `company_access_restricted`, `rider_not_found`, `day_in_the_past`, `day_too_far`, `invalid_windows`,
`invalid_window`, `invalid_slot`, `invalid_slot_minutes`, `shift_overlap`, `availability_overlap`, `shift_not_found`, `invalid_note`,
`invalid_period`, `need_overlap`, `need_not_found`, `invalid_need`, `invalid_riders_needed`, `invalid_shifts`. The web app translates them in `src/lib/errors.ts`.

Realtime: `rider_availability`, `rider_shifts` and `shift_needs` are in the `supabase_realtime` publication, so screens update by themselves.

## Deployment

Apply the migration with the other migrations ([DEPLOYMENT.md](DEPLOYMENT.md), section 6c) and rebuild the web app container. Nothing else:
no Edge Function, no worker.

## Not done yet

See [TODO.md](TODO.md#13-shifts-follow-ups): hourly rates and an estimated amount to pay, publishing the week to the riders, push
notifications for new or changed shifts, the mobile screens ([MOBILE_UPDATES.md](MOBILE_UPDATES.md)).
