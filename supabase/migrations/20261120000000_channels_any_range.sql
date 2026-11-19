-- =============================================================================
-- Radio channels for any equipment (model agnostic)
--
-- Companies use very different radioguide systems: some have a single channel,
-- digital ones have thousands. EchoBox does not know or care about the model:
-- each company describes its channels as a range (channel_min..channel_max, up
-- to 10,000 channels) plus a list of disabled channels.
--
-- What changes:
--   * A channel is busy only while a group has the radios: from the delivery
--     time to the planned pickup (or to the end of the delivery day when no
--     pickup is planned). The same channel can serve a morning group and an
--     afternoon group. Before, a channel stayed locked from the moment an order
--     was created until its pickup, so a 1-channel company could have only one
--     open order.
--   * channels_exclusive = false lets several groups share a channel (equipment
--     where that is harmless); the office still sees who uses what.
--   * public.free_channels() suggests the first free channels for given times;
--     public bookings get one automatically.
--   * public.get_channel_board() returns only the channels in use in a period,
--     so the map scales to 10,000 channels (it replaces get_channel_status()).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Channel range on the tenant
-- -----------------------------------------------------------------------------
alter table public.tenants
  add column channel_min        integer not null default 1,
  add column channel_max        integer not null default 40,
  add column channels_exclusive boolean not null default true;

-- Existing companies keep exactly what they had: channels 0..radio_channels_total.
update public.tenants set channel_min = 0, channel_max = radio_channels_total;

alter table public.tenants
  drop column radio_channels_total,
  add constraint tenants_channel_range check (
    channel_min >= 0
    and channel_max >= channel_min
    and channel_max - channel_min < 10000
    and channel_max <= 99999);

comment on column public.tenants.channel_min is 'First radio channel number of the company''s equipment.';
comment on column public.tenants.channel_max is 'Last radio channel number (at most 10,000 channels in total).';
comment on column public.tenants.channels_exclusive is
  'true: a channel serves one group at a time (overlapping open orders are rejected). false: groups may share channels.';

grant update (channel_min, channel_max, channels_exclusive) on public.tenants to authenticated;

-- The old index made a channel unique among ALL open orders, whatever their
-- dates. Conflicts are now checked on time windows by private.orders_guard.
drop index public.orders_open_channel_uidx;

create index orders_open_channel_idx
  on public.orders (tenant_id, radio_channel)
  where radio_channel is not null and status not in ('picked_up', 'cancelled');

-- -----------------------------------------------------------------------------
-- 2. When does an order occupy its channel?
--    From delivery to the planned pickup; without a planned pickup, until the end
--    of the delivery day in the company's time zone. Never shorter than a minute.
-- -----------------------------------------------------------------------------
create function private.channel_window(
  p_delivery_at timestamptz,
  p_pickup_at   timestamptz,
  p_timezone    text
)
returns tstzrange
language sql
stable
set search_path = ''
as $$
  select pg_catalog.tstzrange(
    p_delivery_at,
    greatest(
      coalesce(
        p_pickup_at,
        (pg_catalog.date_trunc('day', p_delivery_at at time zone p_timezone) + interval '1 day')
          at time zone p_timezone),
      p_delivery_at + interval '1 minute'),
    '[)');
$$;

-- -----------------------------------------------------------------------------
-- 3. First free channels of a company for a time window
--    (enabled, inside the range, not used by another open order at that time).
-- -----------------------------------------------------------------------------
create function private.free_channels(
  p_tenant_id uuid,
  p_window    tstzrange,
  p_exclude   uuid,
  p_limit     integer
)
returns integer[]
language sql
stable
security definer
set search_path = ''
as $$
  with t as (
    select * from public.tenants where id = p_tenant_id
  ),
  busy as (
    select distinct o.radio_channel as c
    from public.orders o
    join t on t.id = o.tenant_id
    where o.radio_channel is not null
      and o.status not in ('picked_up', 'cancelled')
      and o.id is distinct from p_exclude
      and private.channel_window(o.delivery_at, o.pickup_at, t.timezone) && p_window
  )
  select coalesce(array(
    select s.c
    from t
    cross join lateral pg_catalog.generate_series(t.channel_min, t.channel_max) as s(c)
    where s.c <> all (t.disabled_channels)
      and not exists (select 1 from busy b where b.c = s.c)
    order by s.c
    limit greatest(coalesce(p_limit, 1), 1)
  ), '{}');
$$;

-- -----------------------------------------------------------------------------
-- 4. Order guard: range, disabled channels and time-based conflicts
-- -----------------------------------------------------------------------------

create or replace function private.orders_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actions boolean := coalesce(nullif(current_setting('app.order_actions', true), ''), 'off') = 'on';
  v_tenant  public.tenants%rowtype;
  v_other   record;
begin
  if tg_op = 'INSERT' then
    if not v_actions and (
         new.status <> 'received'
         or new.delivery_rider_id is not null
         or new.pickup_rider_id is not null) then
      raise exception 'New orders must start as "received" without riders'
        using errcode = '42501';
    end if;
  else
    if new.tenant_id <> old.tenant_id then
      raise exception 'An order cannot move to another tenant' using errcode = '42501';
    end if;
    if not v_actions and (
         new.status is distinct from old.status
         or new.delivery_rider_id is distinct from old.delivery_rider_id
         or new.pickup_rider_id is distinct from old.pickup_rider_id) then
      raise exception 'Status and riders can only be changed through order actions'
        using errcode = '42501';
    end if;
  end if;

  -- Referenced rows must belong to the same tenant.
  if new.guide_id is not null and not exists (
       select 1 from public.guides g
       where g.id = new.guide_id and g.tenant_id = new.tenant_id) then
    raise exception 'Guide belongs to a different tenant' using errcode = '23514';
  end if;

  if new.delivery_rider_id is not null and not exists (
       select 1 from public.profiles p
       where p.id = new.delivery_rider_id
         and p.tenant_id = new.tenant_id
         and 'rider' = any (p.roles)) then
    raise exception 'Delivery rider is not a rider of this tenant' using errcode = '23514';
  end if;

  if new.pickup_rider_id is not null and not exists (
       select 1 from public.profiles p
       where p.id = new.pickup_rider_id
         and p.tenant_id = new.tenant_id
         and 'rider' = any (p.roles)) then
    raise exception 'Pickup rider is not a rider of this tenant' using errcode = '23514';
  end if;

  -- Radio channel: inside the company's range and not disabled. When channels are
  -- exclusive, no other open order may use the same channel at the same time
  -- (see private.channel_window). The advisory lock serialises concurrent writes
  -- on one channel, so two simultaneous bookings cannot both pass the check.
  if new.radio_channel is not null then
    select * into v_tenant from public.tenants t where t.id = new.tenant_id;

    if tg_op = 'INSERT' or new.radio_channel is distinct from old.radio_channel then
      if new.radio_channel not between v_tenant.channel_min and v_tenant.channel_max then
        raise exception 'channel_out_of_range' using errcode = '23514',
          detail = format('Channel %s is outside %s-%s', new.radio_channel, v_tenant.channel_min, v_tenant.channel_max);
      end if;
      if new.radio_channel = any (v_tenant.disabled_channels) then
        raise exception 'channel_disabled' using errcode = '23514',
          detail = format('Channel %s is disabled', new.radio_channel);
      end if;
    end if;

    if v_tenant.channels_exclusive
       and new.status not in ('picked_up', 'cancelled')
       and (tg_op = 'INSERT'
            or new.radio_channel is distinct from old.radio_channel
            or new.delivery_at is distinct from old.delivery_at
            or new.pickup_at is distinct from old.pickup_at
            or old.status in ('picked_up', 'cancelled')) then
      perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(new.tenant_id::text || '/channel/' || new.radio_channel::text, 0));

      select o.guide_name, o.delivery_at into v_other
      from public.orders o
      where o.tenant_id = new.tenant_id
        and o.radio_channel = new.radio_channel
        and o.id <> new.id
        and o.status not in ('picked_up', 'cancelled')
        and private.channel_window(o.delivery_at, o.pickup_at, v_tenant.timezone)
            && private.channel_window(new.delivery_at, new.pickup_at, v_tenant.timezone)
      order by o.delivery_at
      limit 1;

      if found then
        raise exception 'channel_busy' using errcode = '23P01',
          detail = format('Channel %s is used by "%s" (delivery %s)', new.radio_channel, v_other.guide_name, v_other.delivery_at);
      end if;
    end if;
  end if;

  -- Keep the lifecycle timestamps coherent with the status.
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    if new.status in ('received', 'delivery_assigned', 'out_for_delivery') then
      new.delivered_at := null;
      new.picked_up_at := null;
    elsif new.status in ('delivered', 'awaiting_pickup', 'pickup_assigned', 'out_for_pickup') then
      new.delivered_at := coalesce(new.delivered_at, now());
      new.picked_up_at := null;
    elsif new.status = 'picked_up' then
      new.delivered_at := coalesce(new.delivered_at, now());
      new.picked_up_at := coalesce(new.picked_up_at, now());
    end if;
  end if;

  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. Public bookings get the first free channel
-- -----------------------------------------------------------------------------

create or replace function public.create_public_order(
  p_slug             text,
  p_guide_name       text,
  p_guide_phone      text,
  p_guide_email      text,
  p_radios_count     integer,
  p_delivery_at      timestamptz,
  p_delivery_address text,
  p_pickup_at        timestamptz default null,
  p_pickup_address   text default null,
  p_notes            text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant public.tenants;
  v_digits text := private.digits(p_guide_phone);
  v_email  text := nullif(btrim(p_guide_email), '');
  v_guide  uuid;
  v_order  uuid;
  v_recent integer;
  v_window tstzrange;
  v_channel integer;
  v_try    integer := 0;
begin
  select * into v_tenant
  from public.tenants t
  where t.slug = lower(btrim(coalesce(p_slug, ''))) and t.is_active and t.public_booking_enabled;
  if not found then
    raise exception 'booking_unavailable';
  end if;

  if char_length(btrim(coalesce(p_guide_name, ''))) not between 2 and 120 then
    raise exception 'invalid_guide_name';
  end if;
  if char_length(v_digits) not between 6 and 15 then
    raise exception 'invalid_phone';
  end if;
  if v_email is not null and (char_length(v_email) > 200 or v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    raise exception 'invalid_email';
  end if;
  if p_radios_count is null or p_radios_count not between 1 and 500 then
    raise exception 'invalid_radios_count';
  end if;
  if p_delivery_at is null
     or p_delivery_at < now() - interval '1 hour'
     or p_delivery_at > now() + interval '2 years' then
    raise exception 'invalid_delivery_time';
  end if;
  if char_length(btrim(coalesce(p_delivery_address, ''))) not between 1 and 300 then
    raise exception 'invalid_address';
  end if;
  if p_pickup_at is not null and p_pickup_at < p_delivery_at then
    raise exception 'invalid_pickup_time';
  end if;
  if p_pickup_at is not null and char_length(btrim(coalesce(p_pickup_address, ''))) = 0 then
    raise exception 'invalid_address';
  end if;
  if char_length(coalesce(p_notes, '')) > 1000 or char_length(coalesce(p_pickup_address, '')) > 300 then
    raise exception 'invalid_address';
  end if;

  -- Basic abuse protection: per phone and per tenant.
  select count(*) into v_recent
  from public.orders o
  where o.tenant_id = v_tenant.id and o.source = 'public_form'
    and o.created_at > now() - interval '1 hour'
    and private.digits(o.guide_phone) = v_digits;
  if v_recent >= 5 then
    raise exception 'too_many_requests';
  end if;

  select count(*) into v_recent
  from public.orders o
  where o.tenant_id = v_tenant.id and o.source = 'public_form'
    and o.created_at > now() - interval '1 hour';
  if v_recent >= 200 then
    raise exception 'too_many_requests';
  end if;

  -- Reuse (or create) the guide contact, matched on phone number.
  select g.id into v_guide from public.guides g
  where g.tenant_id = v_tenant.id and g.phone_digits = v_digits;

  if v_guide is null then
    insert into public.guides (tenant_id, full_name, phone, email)
    values (v_tenant.id, btrim(p_guide_name), btrim(p_guide_phone), v_email)
    on conflict do nothing
    returning id into v_guide;

    if v_guide is null then
      -- Phone or email collided with another contact: fall back to phone only.
      select g.id into v_guide from public.guides g
      where g.tenant_id = v_tenant.id and g.phone_digits = v_digits;
      if v_guide is null then
        insert into public.guides (tenant_id, full_name, phone)
        values (v_tenant.id, btrim(p_guide_name), btrim(p_guide_phone))
        on conflict do nothing
        returning id into v_guide;
      end if;
    end if;
  end if;

  -- Give the booking the first channel that is free for its times (none if all
  -- are taken: the office assigns one). If another booking grabs the same channel
  -- in the meantime, try the next free one; after three attempts book without one.
  v_window := private.channel_window(p_delivery_at, p_pickup_at, v_tenant.timezone);
  loop
    v_try := v_try + 1;
    v_channel := case when v_try <= 3
                      then (private.free_channels(v_tenant.id, v_window, null, 1))[1] end;
    begin
      insert into public.orders (
        tenant_id, guide_id, guide_name, guide_phone, guide_email,
        radios_count, delivery_at, delivery_address, pickup_at, pickup_address,
        notes, source, radio_channel)
      values (
        v_tenant.id, v_guide, btrim(p_guide_name), btrim(p_guide_phone), v_email,
        p_radios_count, p_delivery_at, btrim(p_delivery_address), p_pickup_at,
        nullif(btrim(p_pickup_address), ''),
        nullif(btrim(p_notes), ''), 'public_form', v_channel)
      returning id into v_order;
      exit;
    exception when exclusion_violation then
      null; -- channel taken a moment ago: pick again
    end;
  end loop;

  return v_order;
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. Dashboard: the 20 most used channels (a bar per channel does not scale)
-- -----------------------------------------------------------------------------

create or replace function public.get_dashboard_stats(p_month date default current_date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tenant    public.tenants%rowtype;
  v_month     timestamp := date_trunc('month', p_month::timestamp);
  v_from      timestamptz;
  v_to        timestamptz;
  v_prev_from timestamptz;
  v_result    jsonb;
begin
  if not (select private.is_admin()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_tenant from public.tenants t where t.id = (select private.current_tenant_id());

  v_from      := v_month at time zone v_tenant.timezone;
  v_to        := (v_month + interval '1 month') at time zone v_tenant.timezone;
  v_prev_from := (v_month - interval '1 month') at time zone v_tenant.timezone;

  with cur as (
    select * from public.orders o
    where o.tenant_id = v_tenant.id and o.delivery_at >= v_from and o.delivery_at < v_to
  ),
  live as (select * from cur where status <> 'cancelled'),
  prev as (
    select * from public.orders o
    where o.tenant_id = v_tenant.id
      and o.delivery_at >= v_prev_from and o.delivery_at < v_from
      and o.status <> 'cancelled'
  ),
  pickups as (
    select * from public.orders o
    where o.tenant_id = v_tenant.id
      and o.pickup_at >= v_from and o.pickup_at < v_to
      and o.status <> 'cancelled'
  )
  select jsonb_build_object(
    'month', to_char(v_month, 'YYYY-MM'),
    'timezone', v_tenant.timezone,

    'current', (
      select jsonb_build_object(
        'orders', count(*),
        'revenue', coalesce(sum(balance), 0),
        'radios', coalesce(sum(radios_count), 0),
        'extras', coalesce(sum(extra_radios), 0),
        'lost', coalesce(sum(lost_radios), 0),
        'avg_order_value', case when count(*) > 0 then round(sum(balance) / count(*), 2) else 0 end,
        'cancelled', (select count(*) from cur where status = 'cancelled'))
      from live),

    'previous', (
      select jsonb_build_object(
        'orders', count(*),
        'revenue', coalesce(sum(balance), 0))
      from prev),

    'status_distribution', (
      select coalesce(jsonb_agg(jsonb_build_object('status', s.status, 'count', s.c) order by s.c desc), '[]'::jsonb)
      from (select status, count(*) as c from cur group by status) s),

    'daily', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'date', d.day, 'deliveries', d.deliveries, 'pickups', d.pickups, 'revenue', d.revenue)
             order by d.day), '[]'::jsonb)
      from (
        select day, sum(deliveries)::integer as deliveries, sum(pickups)::integer as pickups, sum(revenue) as revenue
        from (
          select to_char(delivery_at at time zone v_tenant.timezone, 'YYYY-MM-DD') as day,
                 1 as deliveries, 0 as pickups, balance as revenue
          from live
          union all
          select to_char(pickup_at at time zone v_tenant.timezone, 'YYYY-MM-DD'),
                 0, 1, 0::numeric
          from pickups
        ) u
        group by day
      ) d),

    'weekly', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'week_start', w.week_start, 'orders', w.orders, 'revenue', w.revenue)
             order by w.week_start), '[]'::jsonb)
      from (
        select to_char(date_trunc('week', delivery_at at time zone v_tenant.timezone), 'YYYY-MM-DD') as week_start,
               count(*)::integer as orders, coalesce(sum(balance), 0) as revenue
        from live group by 1
      ) w),

    'hourly', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'hour', h.hour, 'deliveries', h.deliveries, 'pickups', h.pickups)
             order by h.hour), '[]'::jsonb)
      from (
        select g.hour,
               (select count(*) from live where extract(hour from delivery_at at time zone v_tenant.timezone)::integer = g.hour)::integer as deliveries,
               (select count(*) from pickups where extract(hour from pickup_at at time zone v_tenant.timezone)::integer = g.hour)::integer as pickups
        from generate_series(0, 23) as g(hour)
      ) h),

    'heatmap', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'weekday', x.weekday, 'hour', x.hour, 'count', x.c)), '[]'::jsonb)
      from (
        select extract(isodow from delivery_at at time zone v_tenant.timezone)::integer as weekday,
               extract(hour from delivery_at at time zone v_tenant.timezone)::integer as hour,
               count(*)::integer as c
        from live group by 1, 2
      ) x),

    'top_guides', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'name', g.name, 'orders', g.orders, 'revenue', g.revenue, 'radios', g.radios)
             order by g.orders desc, g.revenue desc), '[]'::jsonb)
      from (
        select max(guide_name) as name, count(*)::integer as orders,
               coalesce(sum(balance), 0) as revenue, coalesce(sum(radios_count), 0)::integer as radios
        from live
        group by lower(btrim(guide_name))
        order by count(*) desc, sum(balance) desc
        limit 10
      ) g),

    'channels', (
      select coalesce(jsonb_agg(jsonb_build_object('channel', c.radio_channel, 'orders', c.orders)
             order by c.orders desc, c.radio_channel), '[]'::jsonb)
      from (
        select radio_channel, count(*)::integer as orders
        from live where radio_channel is not null group by radio_channel
        order by count(*) desc, radio_channel
        limit 20
      ) c),

    'top_locations', (
      select coalesce(jsonb_agg(jsonb_build_object('location', l.location, 'orders', l.orders)
             order by l.orders desc), '[]'::jsonb)
      from (
        select delivery_address as location, count(*)::integer as orders
        from live group by delivery_address order by count(*) desc limit 10
      ) l)
  )
  into v_result;

  return v_result;
end;
$$;

-- -----------------------------------------------------------------------------
-- 7. Channel settings guard
--    * the disabled list is kept sorted, unique and inside the range;
--    * the range cannot drop, and a channel cannot be disabled, while an open
--      order uses it;
--    * channels cannot become exclusive while open orders share a channel.
-- -----------------------------------------------------------------------------
create function private.tenants_channel_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_channel integer;
begin
  new.disabled_channels := coalesce(array(
    select distinct d from pg_catalog.unnest(new.disabled_channels) as d
    where d between new.channel_min and new.channel_max
    order by d), '{}');

  if tg_op = 'UPDATE' then
    if (new.channel_min, new.channel_max, new.disabled_channels)
       is distinct from (old.channel_min, old.channel_max, old.disabled_channels) then
      select o.radio_channel into v_channel
      from public.orders o
      where o.tenant_id = new.id
        and o.radio_channel is not null
        and o.status not in ('picked_up', 'cancelled')
        and (o.radio_channel not between new.channel_min and new.channel_max
             or o.radio_channel = any (new.disabled_channels))
      order by o.radio_channel
      limit 1;
      if found then
        raise exception 'channel_used_by_open_order' using errcode = '23514',
          detail = format('Channel %s is used by an open order', v_channel);
      end if;
    end if;

    if new.channels_exclusive and not old.channels_exclusive and exists (
      select 1
      from public.orders a
      join public.orders b
        on b.tenant_id = a.tenant_id and b.radio_channel = a.radio_channel and b.id > a.id
      where a.tenant_id = new.id
        and a.radio_channel is not null
        and a.status not in ('picked_up', 'cancelled')
        and b.status not in ('picked_up', 'cancelled')
        and private.channel_window(a.delivery_at, a.pickup_at, new.timezone)
            && private.channel_window(b.delivery_at, b.pickup_at, new.timezone)) then
      raise exception 'channel_conflicts_exist' using errcode = '23P01';
    end if;
  end if;

  return new;
end;
$$;

create trigger tenants_channel_guard
  before insert or update on public.tenants
  for each row execute function private.tenants_channel_guard();

-- -----------------------------------------------------------------------------
-- 8. API for the office
-- -----------------------------------------------------------------------------

-- First free channels for an order's times (admins only). p_exclude_order is the
-- order being edited, so that its own channel counts as free.
create function public.free_channels(
  p_delivery_at   timestamptz,
  p_pickup_at     timestamptz default null,
  p_exclude_order uuid default null,
  p_limit         integer default 12
)
returns integer[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tenant public.tenants;
begin
  if not (select private.is_admin()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_delivery_at is null then
    raise exception 'invalid_delivery_time';
  end if;

  select * into v_tenant from public.tenants t where t.id = (select private.current_tenant_id());

  return private.free_channels(
    v_tenant.id,
    private.channel_window(p_delivery_at, p_pickup_at, v_tenant.timezone),
    p_exclude_order,
    least(coalesce(p_limit, 12), 200));
end;
$$;

-- Channels in use during a period: one row per open order whose channel window
-- overlaps [p_from, p_to). Free and disabled channels are not listed (the client
-- knows the range), so this stays small even with 10,000 channels.
create function public.get_channel_board(p_from timestamptz, p_to timestamptz)
returns table (
  channel     integer,
  order_id    uuid,
  guide_name  text,
  status      public.order_status,
  delivery_at timestamptz,
  pickup_at   timestamptz,
  busy_until  timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select o.radio_channel, o.id, o.guide_name, o.status, o.delivery_at, o.pickup_at, pg_catalog.upper(w.r)
  from public.tenants t
  join public.orders o on o.tenant_id = t.id
  cross join lateral (select private.channel_window(o.delivery_at, o.pickup_at, t.timezone) as r) w
  where t.id = (select private.current_tenant_id())
    and (select private.is_admin())
    and o.radio_channel is not null
    and o.status not in ('picked_up', 'cancelled')
    and w.r && pg_catalog.tstzrange(p_from, p_to, '[)')
  order by o.radio_channel, o.delivery_at;
$$;

drop function public.get_channel_status();

-- -----------------------------------------------------------------------------
-- 9. Function privileges (new functions are executable by PUBLIC by default)
-- -----------------------------------------------------------------------------
revoke execute on function
  private.channel_window(timestamptz, timestamptz, text),
  private.free_channels(uuid, tstzrange, uuid, integer),
  private.tenants_channel_guard(),
  public.free_channels(timestamptz, timestamptz, uuid, integer),
  public.get_channel_board(timestamptz, timestamptz)
from public, anon, authenticated;

grant execute on function
  public.free_channels(timestamptz, timestamptz, uuid, integer),
  public.get_channel_board(timestamptz, timestamptz)
to authenticated;
