-- =============================================================================
-- Rider availability and shifts, by the hour
--
-- A courier business does not run on "morning" and "evening" turns but on hours, and the hours
-- are what a rider is paid for. So:
--   * riders say when they are available: a day and one or more hour windows (15-minute steps);
--   * the admin covers the week with shifts of exact start and end times, one by one or from the
--     availability, and can change them at any time (an extra hour, a shorter day);
--   * a shift keeps the times it was first planned with next to the current ones (the paid hours),
--     and every change is recorded (who, when, from what to what);
--   * a report adds up the hours per rider for a week or a month.
--
-- Times are stored as instants; the day and the 15-minute grid follow the company's time zone.
-- Tables are read through RLS; every write goes through a function that validates it.
-- =============================================================================

create table public.rider_availability (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  rider_id    uuid not null references public.profiles (id) on delete cascade,
  start_at    timestamptz not null,
  end_at      timestamptz not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index rider_availability_tenant_start_idx on public.rider_availability (tenant_id, start_at);
create index rider_availability_rider_start_idx on public.rider_availability (rider_id, start_at);

-- Shifts are accounting data (hours to pay): a rider with shifts cannot be deleted, only disabled.
create table public.rider_shifts (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants (id) on delete cascade,
  rider_id          uuid not null references public.profiles (id) on delete restrict,
  start_at          timestamptz not null,
  end_at            timestamptz not null,
  -- The times the shift was first planned with. start_at / end_at are the current (paid) times.
  planned_start_at  timestamptz not null,
  planned_end_at    timestamptz not null,
  note              text not null default '' check (char_length(note) <= 200),
  created_by        uuid,
  updated_by        uuid,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index rider_shifts_tenant_start_idx on public.rider_shifts (tenant_id, start_at);
create index rider_shifts_rider_start_idx on public.rider_shifts (rider_id, start_at);

-- History of every change to a shift. No foreign key to the shift: it survives a deletion.
create table public.rider_shift_events (
  id            bigint generated always as identity primary key,
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  shift_id      uuid not null,
  rider_id      uuid not null,
  event_type    text not null check (event_type in ('created', 'changed', 'deleted')),
  old_start_at  timestamptz,
  old_end_at    timestamptz,
  new_start_at  timestamptz,
  new_end_at    timestamptz,
  note          text not null default '',
  actor_id      uuid,
  created_at    timestamptz not null default now()
);

create index rider_shift_events_shift_idx on public.rider_shift_events (shift_id, id desc);
create index rider_shift_events_tenant_idx on public.rider_shift_events (tenant_id, created_at desc);

create trigger rider_availability_set_updated_at
  before update on public.rider_availability
  for each row execute function private.set_updated_at();

create trigger rider_shifts_set_updated_at
  before update on public.rider_shifts
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Guard shared by both tables: a sensible slot on the company's 15-minute grid, for a rider of the
-- company, never overlapping another slot of the same rider.
-- -----------------------------------------------------------------------------
create function private.rider_slot_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_tz      text;
  v_overlap boolean;
begin
  select t.timezone into v_tz from public.tenants t where t.id = new.tenant_id;

  if new.end_at <= new.start_at or new.end_at - new.start_at > interval '16 hours' then
    raise exception 'invalid_slot' using errcode = '23514';
  end if;
  if date_part('second', new.start_at) <> 0 or date_part('second', new.end_at) <> 0
     or date_part('minute', new.start_at at time zone v_tz)::integer % 15 <> 0
     or date_part('minute', new.end_at at time zone v_tz)::integer % 15 <> 0 then
    raise exception 'invalid_slot_minutes' using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = new.rider_id and p.tenant_id = new.tenant_id and 'rider' = any (p.roles)
  ) then
    raise exception 'rider_not_found' using errcode = '23514';
  end if;

  -- One writer at a time per rider, so two simultaneous saves cannot both pass the check.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(tg_table_name || '/' || new.rider_id::text, 0));
  execute format(
    'select exists (select 1 from public.%I x where x.rider_id = $1 and x.id <> $2 '
    'and tstzrange(x.start_at, x.end_at) && tstzrange($3, $4))', tg_table_name)
    into v_overlap using new.rider_id, new.id, new.start_at, new.end_at;
  if v_overlap then
    raise exception '%', case when tg_table_name = 'rider_shifts' then 'shift_overlap' else 'availability_overlap' end
      using errcode = '23P01';
  end if;
  return new;
end;
$$;

create trigger rider_availability_slot_guard
  before insert or update on public.rider_availability
  for each row execute function private.rider_slot_guard();

create trigger rider_shifts_slot_guard
  before insert or update on public.rider_shifts
  for each row execute function private.rider_slot_guard();

-- The history of a shift.
create function private.log_rider_shift()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.rider_shift_events(tenant_id, shift_id, rider_id, event_type, new_start_at, new_end_at, note, actor_id)
    values (new.tenant_id, new.id, new.rider_id, 'created', new.start_at, new.end_at, new.note, (select auth.uid()));
    return new;
  elsif tg_op = 'UPDATE' then
    if new.start_at is distinct from old.start_at or new.end_at is distinct from old.end_at
       or new.note is distinct from old.note then
      insert into public.rider_shift_events(tenant_id, shift_id, rider_id, event_type, old_start_at, old_end_at,
        new_start_at, new_end_at, note, actor_id)
      values (new.tenant_id, new.id, new.rider_id, 'changed', old.start_at, old.end_at, new.start_at, new.end_at,
        new.note, (select auth.uid()));
    end if;
    return new;
  end if;
  insert into public.rider_shift_events(tenant_id, shift_id, rider_id, event_type, old_start_at, old_end_at, note, actor_id)
  values (old.tenant_id, old.id, old.rider_id, 'deleted', old.start_at, old.end_at, old.note, (select auth.uid()));
  return old;
end;
$$;

create trigger rider_shifts_log
  after insert or update or delete on public.rider_shifts
  for each row execute function private.log_rider_shift();

-- -----------------------------------------------------------------------------
-- Read access (RLS): a rider sees their own availability and shifts, an admin everything in the
-- company. Nobody writes the tables directly.
-- -----------------------------------------------------------------------------
alter table public.rider_availability enable row level security;
alter table public.rider_shifts enable row level security;
alter table public.rider_shift_events enable row level security;

revoke all on public.rider_availability, public.rider_shifts, public.rider_shift_events from public, anon, authenticated;
grant select on public.rider_availability, public.rider_shifts, public.rider_shift_events to authenticated;

create policy rider_availability_select on public.rider_availability
  for select to authenticated
  using (
    tenant_id = (select private.current_tenant_id())
    and ((select private.is_admin()) or rider_id = (select auth.uid()))
  );

create policy rider_shifts_select on public.rider_shifts
  for select to authenticated
  using (
    tenant_id = (select private.current_tenant_id())
    and ((select private.is_admin()) or rider_id = (select auth.uid()))
  );

create policy rider_shift_events_select_admin on public.rider_shift_events
  for select to authenticated
  using (tenant_id = (select private.current_tenant_id()) and (select private.is_admin()));

-- The screens update by themselves (RLS applies to the change stream too).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.rider_availability;
    alter publication supabase_realtime add table public.rider_shifts;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Rider or admin: set the availability of one day (replaces that day's windows).
--   p_windows: [{"start":"09:00","end":"13:00"}, {"start":"16:00","end":"20:00"}]  ("24:00" ends at midnight)
--   An empty list clears the day. A rider changes their own days, from today on; an admin can
--   change any rider and any day (p_rider_id).
-- -----------------------------------------------------------------------------
create function public.save_availability(p_day date, p_windows jsonb, p_rider_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_tenant uuid := (select private.current_tenant_id());
  v_admin  boolean := (select private.is_admin());
  v_rider  uuid;
  v_tz     text;
  v_today  date;
  v_w      jsonb;
  v_start  timestamptz;
  v_end    timestamptz;
  v_count  integer := 0;
begin
  if v_uid is null or v_tenant is null then raise exception 'not_authorized' using errcode = '42501'; end if;
  if public.platform_company_access() <> 'full' then raise exception 'company_access_restricted' using errcode = '42501'; end if;
  v_rider := coalesce(p_rider_id, v_uid);
  if v_rider <> v_uid and not v_admin then raise exception 'not_authorized' using errcode = '42501'; end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = v_rider and p.tenant_id = v_tenant and 'rider' = any (p.roles) and not p.disabled
  ) then raise exception 'rider_not_found'; end if;

  select t.timezone into v_tz from public.tenants t where t.id = v_tenant;
  v_today := (now() at time zone v_tz)::date;
  if not v_admin then
    if p_day < v_today then raise exception 'day_in_the_past'; end if;
    if p_day > v_today + 90 then raise exception 'day_too_far'; end if;
  end if;
  if p_windows is null or jsonb_typeof(p_windows) <> 'array' or jsonb_array_length(p_windows) > 6 then
    raise exception 'invalid_windows';
  end if;

  delete from public.rider_availability a
  where a.rider_id = v_rider and (a.start_at at time zone v_tz)::date = p_day;

  for v_w in select w from jsonb_array_elements(p_windows) w order by w->>'start' loop
    if coalesce(v_w->>'start', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
       or coalesce(v_w->>'end', '') !~ '^(([01][0-9]|2[0-3]):[0-5][0-9]|24:00)$' then
      raise exception 'invalid_window';
    end if;
    v_start := (p_day::timestamp + (v_w->>'start')::time) at time zone v_tz;
    v_end := case when v_w->>'end' = '24:00' then (p_day + 1)::timestamp at time zone v_tz
      else (p_day::timestamp + (v_w->>'end')::time) at time zone v_tz end;
    insert into public.rider_availability(tenant_id, rider_id, start_at, end_at)
    values (v_tenant, v_rider, v_start, v_end);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- -----------------------------------------------------------------------------
-- Admin: create a shift, or change one (p_shift_id): new start and end, a note.
-- A change keeps the originally planned times, so extra or shorter hours stay visible.
-- Returns the shift id.
-- -----------------------------------------------------------------------------
create function public.admin_save_shift(
  p_rider_id uuid, p_start_at timestamptz, p_end_at timestamptz,
  p_note text default '', p_shift_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_tenant uuid := (select private.current_tenant_id());
  v_id     uuid;
  v_shift  public.rider_shifts;
begin
  if v_uid is null or v_tenant is null or not (select private.is_admin()) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if public.platform_company_access() <> 'full' then raise exception 'company_access_restricted' using errcode = '42501'; end if;
  if char_length(coalesce(p_note, '')) > 200 then raise exception 'invalid_note'; end if;

  if p_shift_id is null then
    if not exists (
      select 1 from public.profiles p
      where p.id = p_rider_id and p.tenant_id = v_tenant and 'rider' = any (p.roles) and not p.disabled
    ) then raise exception 'rider_not_found'; end if;
    insert into public.rider_shifts(tenant_id, rider_id, start_at, end_at, planned_start_at, planned_end_at, note,
      created_by, updated_by)
    values (v_tenant, p_rider_id, p_start_at, p_end_at, p_start_at, p_end_at, coalesce(p_note, ''), v_uid, v_uid)
    returning id into v_id;
    return v_id;
  end if;

  select * into v_shift from public.rider_shifts s where s.id = p_shift_id and s.tenant_id = v_tenant for update;
  if not found then raise exception 'shift_not_found'; end if;
  update public.rider_shifts s set start_at = p_start_at, end_at = p_end_at, note = coalesce(p_note, ''), updated_by = v_uid
  where s.id = p_shift_id;
  return p_shift_id;
end;
$$;

create function public.admin_delete_shift(p_shift_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or (select private.current_tenant_id()) is null or not (select private.is_admin()) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if public.platform_company_access() <> 'full' then raise exception 'company_access_restricted' using errcode = '42501'; end if;
  delete from public.rider_shifts s where s.id = p_shift_id and s.tenant_id = (select private.current_tenant_id());
  if not found then raise exception 'shift_not_found'; end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Admin: cover the availability. Every availability window in the period (of one rider, or of all)
-- that is not already touched by a shift becomes a shift with the same times. Safe to run again.
-- Returns how many shifts were created.
-- -----------------------------------------------------------------------------
create function public.admin_cover_from_availability(p_from date, p_to date, p_rider_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_tenant uuid := (select private.current_tenant_id());
  v_tz     text;
  v_count  integer;
begin
  if v_uid is null or v_tenant is null or not (select private.is_admin()) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if public.platform_company_access() <> 'full' then raise exception 'company_access_restricted' using errcode = '42501'; end if;
  if p_to < p_from or p_to - p_from > 62 then raise exception 'invalid_period'; end if;
  select t.timezone into v_tz from public.tenants t where t.id = v_tenant;

  insert into public.rider_shifts(tenant_id, rider_id, start_at, end_at, planned_start_at, planned_end_at, created_by, updated_by)
  select a.tenant_id, a.rider_id, a.start_at, a.end_at, a.start_at, a.end_at, v_uid, v_uid
  from public.rider_availability a
  join public.profiles p on p.id = a.rider_id and not p.disabled
  where a.tenant_id = v_tenant
    and (a.start_at at time zone v_tz)::date between p_from and p_to
    and (p_rider_id is null or a.rider_id = p_rider_id)
    and not exists (
      select 1 from public.rider_shifts s
      where s.rider_id = a.rider_id and tstzrange(s.start_at, s.end_at) && tstzrange(a.start_at, a.end_at)
    )
  order by a.start_at;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- -----------------------------------------------------------------------------
-- Admin: the hours to pay. For the days from p_from to p_to (company time zone, a shift belongs to
-- the day it starts): per rider and day, the paid minutes (current times), the planned minutes (the
-- first times) and how many shifts were adjusted.
-- -----------------------------------------------------------------------------
create function public.get_rider_hours(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := (select private.current_tenant_id());
  v_tz     text;
  v_result jsonb;
begin
  if (select auth.uid()) is null or v_tenant is null or not (select private.is_admin()) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_to < p_from or p_to - p_from > 366 then raise exception 'invalid_period'; end if;
  select t.timezone into v_tz from public.tenants t where t.id = v_tenant;

  select coalesce(jsonb_agg(r order by r.name, r.rider_id), '[]'::jsonb) into v_result
  from (
    select s.rider_id, coalesce(nullif(btrim(p.full_name), ''), p.email) as name,
      sum(extract(epoch from s.end_at - s.start_at) / 60)::integer as paid_minutes,
      sum(extract(epoch from s.planned_end_at - s.planned_start_at) / 60)::integer as planned_minutes,
      count(*)::integer as shifts,
      count(*) filter (where s.start_at <> s.planned_start_at or s.end_at <> s.planned_end_at)::integer as adjusted,
      jsonb_agg(jsonb_build_object(
        'shift_id', s.id, 'day', (s.start_at at time zone v_tz)::date, 'start_at', s.start_at, 'end_at', s.end_at,
        'planned_start_at', s.planned_start_at, 'planned_end_at', s.planned_end_at, 'note', s.note
      ) order by s.start_at) as items
    from public.rider_shifts s
    join public.profiles p on p.id = s.rider_id
    where s.tenant_id = v_tenant and (s.start_at at time zone v_tz)::date between p_from and p_to
    group by s.rider_id, p.full_name, p.email
  ) r;
  return v_result;
end;
$$;

-- -----------------------------------------------------------------------------
-- Staffing needs: how many riders the company needs in a block of time ("3 riders from 09:00 to
-- 13:00"). They are what the timeline compares the shifts with, and what the auto-fill covers from
-- the riders' availability. Blocks of a company never overlap (one number for any moment).
-- -----------------------------------------------------------------------------
create table public.shift_needs (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants (id) on delete cascade,
  start_at       timestamptz not null,
  end_at         timestamptz not null,
  riders_needed  smallint not null check (riders_needed between 1 and 50),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index shift_needs_tenant_start_idx on public.shift_needs (tenant_id, start_at);

create trigger shift_needs_set_updated_at
  before update on public.shift_needs
  for each row execute function private.set_updated_at();

create function private.shift_need_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_tz      text;
  v_overlap boolean;
begin
  select t.timezone into v_tz from public.tenants t where t.id = new.tenant_id;

  if new.end_at <= new.start_at or new.end_at - new.start_at > interval '24 hours' then
    raise exception 'invalid_need' using errcode = '23514';
  end if;
  if date_part('second', new.start_at) <> 0 or date_part('second', new.end_at) <> 0
     or date_part('minute', new.start_at at time zone v_tz)::integer % 15 <> 0
     or date_part('minute', new.end_at at time zone v_tz)::integer % 15 <> 0 then
    raise exception 'invalid_slot_minutes' using errcode = '23514';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('shift_needs/' || new.tenant_id::text, 0));
  select exists (
    select 1 from public.shift_needs x
    where x.tenant_id = new.tenant_id and x.id <> new.id
      and tstzrange(x.start_at, x.end_at) && tstzrange(new.start_at, new.end_at)
  ) into v_overlap;
  if v_overlap then raise exception 'need_overlap' using errcode = '23P01'; end if;
  return new;
end;
$$;

create trigger shift_needs_guard
  before insert or update on public.shift_needs
  for each row execute function private.shift_need_guard();

alter table public.shift_needs enable row level security;
revoke all on public.shift_needs from public, anon, authenticated;
grant select on public.shift_needs to authenticated;

create policy shift_needs_select_admin on public.shift_needs
  for select to authenticated
  using (tenant_id = (select private.current_tenant_id()) and (select private.is_admin()));

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.shift_needs;
  end if;
end $$;

-- Admin: set the riders needed in a block of time (create, or change with p_need_id).
create function public.admin_save_need(
  p_start_at timestamptz, p_end_at timestamptz, p_riders_needed integer, p_need_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := (select private.current_tenant_id());
  v_id     uuid;
begin
  if (select auth.uid()) is null or v_tenant is null or not (select private.is_admin()) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if public.platform_company_access() <> 'full' then raise exception 'company_access_restricted' using errcode = '42501'; end if;
  if p_riders_needed is null or p_riders_needed < 1 or p_riders_needed > 50 then raise exception 'invalid_riders_needed'; end if;

  if p_need_id is null then
    insert into public.shift_needs(tenant_id, start_at, end_at, riders_needed)
    values (v_tenant, p_start_at, p_end_at, p_riders_needed)
    returning id into v_id;
    return v_id;
  end if;
  update public.shift_needs n set start_at = p_start_at, end_at = p_end_at, riders_needed = p_riders_needed
  where n.id = p_need_id and n.tenant_id = v_tenant;
  if not found then raise exception 'need_not_found'; end if;
  return p_need_id;
end;
$$;

create function public.admin_delete_need(p_need_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or (select private.current_tenant_id()) is null or not (select private.is_admin()) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if public.platform_company_access() <> 'full' then raise exception 'company_access_restricted' using errcode = '42501'; end if;
  delete from public.shift_needs n where n.id = p_need_id and n.tenant_id = (select private.current_tenant_id());
  if not found then raise exception 'need_not_found'; end if;
end;
$$;

-- Admin: copy the needs of the days p_from..p_to onto the days p_offset_days later (or earlier), e.g. a
-- Monday onto a Tuesday, or this week onto next week (offset 7). The needs already there are replaced.
-- The wall-clock time is kept across a clock change. Returns how many blocks were copied.
create function public.admin_copy_needs(p_from date, p_to date, p_offset_days integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := (select private.current_tenant_id());
  v_tz     text;
  v_rows   jsonb;
  v_count  integer;
begin
  if (select auth.uid()) is null or v_tenant is null or not (select private.is_admin()) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if public.platform_company_access() <> 'full' then raise exception 'company_access_restricted' using errcode = '42501'; end if;
  if p_to < p_from or p_to - p_from > 62 or p_offset_days is null or p_offset_days = 0
     or abs(p_offset_days) > 366 or abs(p_offset_days) < (p_to - p_from + 1) then
    raise exception 'invalid_period';
  end if;
  select t.timezone into v_tz from public.tenants t where t.id = v_tenant;

  select coalesce(jsonb_agg(jsonb_build_object(
      'start_at', ((n.start_at at time zone v_tz) + make_interval(days => p_offset_days)) at time zone v_tz,
      'end_at', ((n.end_at at time zone v_tz) + make_interval(days => p_offset_days)) at time zone v_tz,
      'riders_needed', n.riders_needed) order by n.start_at), '[]'::jsonb)
  into v_rows
  from public.shift_needs n
  where n.tenant_id = v_tenant and (n.start_at at time zone v_tz)::date between p_from and p_to;

  delete from public.shift_needs n
  where n.tenant_id = v_tenant
    and (n.start_at at time zone v_tz)::date between p_from + p_offset_days and p_to + p_offset_days;

  insert into public.shift_needs(tenant_id, start_at, end_at, riders_needed)
  select v_tenant, (r->>'start_at')::timestamptz, (r->>'end_at')::timestamptz, (r->>'riders_needed')::smallint
  from jsonb_array_elements(v_rows) r;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Admin: create several shifts at once, all or none (the auto-fill uses it).
--   p_shifts: [{"rider_id": "…", "start_at": "2026-12-02T08:00:00Z", "end_at": "…", "note": ""}]
create function public.admin_create_shifts(p_shifts jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_tenant uuid := (select private.current_tenant_id());
  v_item   jsonb;
  v_rider  uuid;
  v_start  timestamptz;
  v_end    timestamptz;
  v_note   text;
  v_count  integer := 0;
begin
  if v_uid is null or v_tenant is null or not (select private.is_admin()) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if public.platform_company_access() <> 'full' then raise exception 'company_access_restricted' using errcode = '42501'; end if;
  if p_shifts is null or jsonb_typeof(p_shifts) <> 'array' or jsonb_array_length(p_shifts) > 500 then
    raise exception 'invalid_shifts';
  end if;

  for v_item in select i from jsonb_array_elements(p_shifts) i loop
    begin
      v_rider := (v_item->>'rider_id')::uuid;
      v_start := (v_item->>'start_at')::timestamptz;
      v_end := (v_item->>'end_at')::timestamptz;
    exception when others then
      raise exception 'invalid_shifts';
    end;
    v_note := coalesce(v_item->>'note', '');
    if char_length(v_note) > 200 then raise exception 'invalid_note'; end if;
    if not exists (
      select 1 from public.profiles p
      where p.id = v_rider and p.tenant_id = v_tenant and 'rider' = any (p.roles) and not p.disabled
    ) then raise exception 'rider_not_found'; end if;
    insert into public.rider_shifts(tenant_id, rider_id, start_at, end_at, planned_start_at, planned_end_at, note, created_by, updated_by)
    values (v_tenant, v_rider, v_start, v_end, v_start, v_end, v_note, v_uid, v_uid);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function private.rider_slot_guard(), private.log_rider_shift(), private.shift_need_guard() from public, anon, authenticated;

revoke all on function public.save_availability(date, jsonb, uuid),
  public.admin_save_shift(uuid, timestamptz, timestamptz, text, uuid),
  public.admin_delete_shift(uuid),
  public.admin_cover_from_availability(date, date, uuid),
  public.get_rider_hours(date, date),
  public.admin_save_need(timestamptz, timestamptz, integer, uuid),
  public.admin_delete_need(uuid),
  public.admin_copy_needs(date, date, integer),
  public.admin_create_shifts(jsonb)
from public, anon, authenticated;

grant execute on function public.save_availability(date, jsonb, uuid),
  public.admin_save_shift(uuid, timestamptz, timestamptz, text, uuid),
  public.admin_delete_shift(uuid),
  public.admin_cover_from_availability(date, date, uuid),
  public.get_rider_hours(date, date),
  public.admin_save_need(timestamptz, timestamptz, integer, uuid),
  public.admin_delete_need(uuid),
  public.admin_copy_needs(date, date, integer),
  public.admin_create_shifts(jsonb)
to authenticated;
