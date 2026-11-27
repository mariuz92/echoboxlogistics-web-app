-- =============================================================================
-- A channel stays occupied until its order is actually closed
--
-- Until now an order held its radio channel from the delivery to the PLANNED
-- pickup (or to the end of the delivery day when no pickup was planned). When that
-- time passed and the radios had not been returned, the channel looked free again,
-- on the board and for new bookings, although the group still had the radios.
--
-- Now an open order (not picked up, not cancelled) keeps its channel until it is
-- closed: once the planned end has passed, the hold has no end, so the channel is
-- occupied today, tomorrow and on every following day until the order is picked up
-- or cancelled. Planning the pickup again to a later time gives the hold a new end.
-- Orders whose planned pickup is still in the future behave exactly as before.
--
-- get_channel_board() also says which holds are overdue (busy_until is NULL then).
-- =============================================================================

-- The planned window, made open-ended once its planned end has passed.
create function private.channel_hold(
  p_delivery_at timestamptz,
  p_pickup_at   timestamptz,
  p_timezone    text
)
returns tstzrange
language sql
stable
set search_path = ''
as $$
  select case
    when pg_catalog.upper(w.r) <= pg_catalog.now()
      then pg_catalog.tstzrange(pg_catalog.lower(w.r), null, '[)')
    else w.r
  end
  from (select private.channel_window(p_delivery_at, p_pickup_at, p_timezone) as r) w;
$$;

-- The booking check uses the hold, so an unreturned channel cannot be given to another group.
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
        and private.channel_hold(o.delivery_at, o.pickup_at, v_tenant.timezone)
            && private.channel_hold(new.delivery_at, new.pickup_at, v_tenant.timezone)
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

-- The board lists the holds that overlap the period, with the overdue ones.
drop function public.get_channel_board(timestamptz, timestamptz);

create function public.get_channel_board(p_from timestamptz, p_to timestamptz)
returns table (
  channel     integer,
  order_id    uuid,
  guide_name  text,
  status      public.order_status,
  delivery_at timestamptz,
  pickup_at   timestamptz,
  busy_until  timestamptz,
  overdue     boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select o.radio_channel, o.id, o.guide_name, o.status, o.delivery_at, o.pickup_at,
         case when pg_catalog.upper_inf(w.r) then null else pg_catalog.upper(w.r) end,
         pg_catalog.upper_inf(w.r)
  from public.tenants t
  join public.orders o on o.tenant_id = t.id
  cross join lateral (select private.channel_hold(o.delivery_at, o.pickup_at, t.timezone) as r) w
  where t.id = (select private.current_tenant_id())
    and (select private.is_admin())
    and o.radio_channel is not null
    and o.status not in ('picked_up', 'cancelled')
    and w.r && pg_catalog.tstzrange(p_from, p_to, '[)')
  order by o.radio_channel, o.delivery_at;
$$;

revoke execute on function private.channel_hold(timestamptz, timestamptz, text),
  public.get_channel_board(timestamptz, timestamptz)
from public, anon, authenticated;

grant execute on function public.get_channel_board(timestamptz, timestamptz) to authenticated;
