-- =============================================================================
-- Business logic exposed as RPCs (PostgREST /rpc/<name>) and views.
--
-- Error contract: functions raise short machine-readable messages
-- (e.g. 'company_exists', 'delivery_not_reassignable'); the web app maps them to
-- user-facing text. Authorization failures use SQLSTATE 42501.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Onboarding
-- -----------------------------------------------------------------------------

-- Called by the app right after sign-in. Creates the caller's profile on first
-- use, either by accepting a pending invitation (matched on the verified email)
-- or by registering a brand-new company (name taken from the sign-up metadata).
create function public.bootstrap_profile()
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := (select auth.uid());
  v_user      auth.users%rowtype;
  v_profile   public.profiles;
  v_inv       public.invitations;
  v_tenant_id uuid;
  v_company   text;
  v_name      text;
  v_phone     text;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select * into v_profile from public.profiles p where p.id = v_uid;
  if found then
    return v_profile;
  end if;

  select * into v_user from auth.users u where u.id = v_uid;
  if not found or v_user.email is null or v_user.email_confirmed_at is null then
    raise exception 'email_not_confirmed' using errcode = '28000';
  end if;

  v_name := coalesce(
    nullif(btrim(v_user.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(v_user.raw_user_meta_data ->> 'name'), ''));
  v_phone := nullif(btrim(v_user.raw_user_meta_data ->> 'phone'), '');

  -- 1) Pending invitation for this (verified) email.
  select * into v_inv
  from public.invitations i
  where i.email_key = lower(btrim(v_user.email))
    and i.accepted_at is null
    and i.expires_at > now()
  order by i.created_at desc
  limit 1
  for update;

  if found then
    insert into public.profiles (id, tenant_id, email, full_name, phone, roles)
    values (
      v_uid, v_inv.tenant_id, v_user.email,
      coalesce(v_name, nullif(btrim(v_inv.full_name), ''), split_part(v_user.email, '@', 1)),
      v_phone, v_inv.roles)
    returning * into v_profile;

    update public.invitations set accepted_at = now() where id = v_inv.id;
    return v_profile;
  end if;

  -- 2) Self-service registration of a new company.
  v_company := nullif(btrim(v_user.raw_user_meta_data ->> 'company_name'), '');
  if v_company is null then
    raise exception 'no_company';
  end if;

  begin
    insert into public.tenants (name, slug)
    values (v_company, private.unique_tenant_slug(v_company))
    returning id into v_tenant_id;
  exception when unique_violation then
    -- Joining an existing company is only possible through an invitation.
    raise exception 'company_exists';
  end;

  insert into public.profiles (id, tenant_id, email, full_name, phone, roles)
  values (
    v_uid, v_tenant_id, v_user.email,
    coalesce(v_name, split_part(v_user.email, '@', 1)),
    v_phone, array['admin']::public.app_role[])
  returning * into v_profile;

  return v_profile;
end;
$$;

create function public.touch_login()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.profiles set last_login_at = now() where id = (select auth.uid());
$$;

-- -----------------------------------------------------------------------------
-- Member management (admins only)
-- -----------------------------------------------------------------------------

create function public.update_member(
  p_user_id   uuid,
  p_full_name text default null,
  p_phone     text default null,   -- NULL = unchanged, '' = clear
  p_roles     public.app_role[] default null,
  p_disabled  boolean default null
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := (select private.current_tenant_id());
  v_target public.profiles;
  v_other_admins integer;
  v_losing_rider boolean;
begin
  if not (select private.is_admin()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_target
  from public.profiles p
  where p.id = p_user_id and p.tenant_id = v_tenant
  for update;
  if not found then
    raise exception 'member_not_found' using errcode = 'P0002';
  end if;

  -- A tenant must always keep at least one active admin.
  if 'admin' = any (v_target.roles)
     and ((p_roles is not null and not ('admin' = any (p_roles))) or p_disabled is true) then
    select count(*) into v_other_admins
    from public.profiles p
    where p.tenant_id = v_tenant and p.id <> p_user_id
      and 'admin' = any (p.roles) and not p.disabled;
    if v_other_admins = 0 then
      raise exception 'last_admin';
    end if;
  end if;

  -- A rider with open work cannot be disabled or stripped of the rider role.
  v_losing_rider := 'rider' = any (v_target.roles)
    and (p_disabled is true or (p_roles is not null and not ('rider' = any (p_roles))));
  if v_losing_rider and exists (
       select 1 from public.orders o
       where (o.delivery_rider_id = p_user_id and o.status in ('delivery_assigned', 'out_for_delivery'))
          or (o.pickup_rider_id = p_user_id and o.status in ('pickup_assigned', 'out_for_pickup'))) then
    raise exception 'rider_has_active_orders';
  end if;

  update public.profiles p set
    full_name = coalesce(nullif(btrim(p_full_name), ''), p.full_name),
    phone     = case when p_phone is null then p.phone else nullif(btrim(p_phone), '') end,
    roles     = coalesce(p_roles, p.roles),
    disabled  = coalesce(p_disabled, p.disabled)
  where p.id = p_user_id
  returning * into v_target;

  return v_target;
end;
$$;

-- -----------------------------------------------------------------------------
-- Order actions (the ONLY way to change status / riders)
-- -----------------------------------------------------------------------------

-- Assigns (or unassigns, when p_rider_id is NULL) a rider to one leg of an order.
--   p_leg = 'delivery': allowed while the order is received / delivery_assigned
--   p_leg = 'pickup'  : allowed once delivered, needs pickup time + address
create function public.assign_order(
  p_order_id uuid,
  p_leg      text,
  p_rider_id uuid
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := (select private.current_tenant_id());
  v_order  public.orders;
begin
  if not (select private.is_admin()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_leg not in ('delivery', 'pickup') then
    raise exception 'invalid_leg';
  end if;

  select * into v_order from public.orders o
  where o.id = p_order_id and o.tenant_id = v_tenant
  for update;
  if not found then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;
  if v_order.status = 'cancelled' then
    raise exception 'order_cancelled';
  end if;

  if p_rider_id is not null and not exists (
       select 1 from public.profiles p
       where p.id = p_rider_id and p.tenant_id = v_tenant
         and 'rider' = any (p.roles) and not p.disabled) then
    raise exception 'rider_invalid';
  end if;

  perform set_config('app.order_actions', 'on', true);

  if p_leg = 'delivery' then
    if v_order.status not in ('received', 'delivery_assigned') then
      raise exception 'delivery_not_reassignable';
    end if;
    update public.orders o set
      delivery_rider_id = p_rider_id,
      status = case when p_rider_id is null then 'received'::public.order_status
                    else 'delivery_assigned'::public.order_status end
    where o.id = p_order_id
    returning * into v_order;
  else
    if v_order.status not in ('delivered', 'awaiting_pickup', 'pickup_assigned') then
      raise exception 'pickup_not_assignable';
    end if;
    if p_rider_id is not null and (v_order.pickup_at is null or v_order.pickup_address is null) then
      raise exception 'pickup_details_missing';
    end if;
    update public.orders o set
      pickup_rider_id = p_rider_id,
      status = case when p_rider_id is null then 'awaiting_pickup'::public.order_status
                    else 'pickup_assigned'::public.order_status end
    where o.id = p_order_id
    returning * into v_order;
  end if;

  return v_order;
end;
$$;

-- Admin-driven status changes with consistent side effects.
-- Riders are managed by assign_order; this function never assigns riders.
create function public.admin_set_status(
  p_order_id uuid,
  p_status   public.order_status
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := (select private.current_tenant_id());
  v_order  public.orders;
  v_target public.order_status := p_status;
  v_prev   public.order_status;
begin
  if not (select private.is_admin()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_order from public.orders o
  where o.id = p_order_id and o.tenant_id = v_tenant
  for update;
  if not found then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;

  perform set_config('app.order_actions', 'on', true);

  case p_status
    when 'cancelled' then
      if v_order.status in ('picked_up', 'cancelled') then
        raise exception 'transition_not_allowed';
      end if;

    when 'received' then
      -- Re-open a cancelled order: restore the status it had before.
      if v_order.status <> 'cancelled' then
        raise exception 'transition_not_allowed';
      end if;
      select e.from_status into v_prev
      from public.order_events e
      where e.order_id = p_order_id and e.to_status = 'cancelled'
      order by e.created_at desc, e.id desc
      limit 1;
      v_target := coalesce(v_prev, 'received');

    when 'out_for_delivery' then
      if v_order.status <> 'delivery_assigned' then
        raise exception 'transition_not_allowed';
      end if;

    when 'delivered' then
      if v_order.status not in ('delivery_assigned', 'out_for_delivery') then
        raise exception 'transition_not_allowed';
      end if;
      if v_order.pickup_address is not null then
        v_target := 'awaiting_pickup';
      end if;

    when 'awaiting_pickup' then
      if v_order.status not in ('delivered', 'pickup_assigned') then
        raise exception 'transition_not_allowed';
      end if;
      if v_order.pickup_at is null or v_order.pickup_address is null then
        raise exception 'pickup_details_missing';
      end if;

    when 'out_for_pickup' then
      if v_order.status <> 'pickup_assigned' then
        raise exception 'transition_not_allowed';
      end if;

    when 'picked_up' then
      if v_order.status not in ('delivered', 'awaiting_pickup', 'pickup_assigned', 'out_for_pickup') then
        raise exception 'transition_not_allowed';
      end if;

    else
      -- delivery_assigned / pickup_assigned require choosing a rider.
      raise exception 'use_assign_order';
  end case;

  update public.orders o set
    status = v_target,
    pickup_rider_id = case when v_target = 'awaiting_pickup' then null else o.pickup_rider_id end
  where o.id = p_order_id
  returning * into v_order;

  return v_order;
end;
$$;

-- Actions performed by riders from their own jobs list / mobile app.
--   claim_pickup      awaiting_pickup   -> pickup_assigned   (self-assign)
--   start_delivery    delivery_assigned -> out_for_delivery
--   complete_delivery out_for_delivery  -> awaiting_pickup | delivered
--   start_pickup      pickup_assigned   -> out_for_pickup
--   complete_pickup   out_for_pickup    -> picked_up (optionally reports lost radios)
create function public.rider_order_action(
  p_order_id uuid,
  p_action   text,
  p_lost     integer default null
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_tenant uuid;
  v_order  public.orders;
begin
  select p.tenant_id into v_tenant
  from public.profiles p
  where p.id = v_uid and not p.disabled and 'rider' = any (p.roles);
  if v_tenant is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_order from public.orders o
  where o.id = p_order_id and o.tenant_id = v_tenant
  for update;
  if not found then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;

  perform set_config('app.order_actions', 'on', true);

  case p_action
    when 'claim_pickup' then
      if v_order.status <> 'awaiting_pickup' or v_order.pickup_rider_id is not null then
        raise exception 'order_not_claimable';
      end if;
      update public.orders o set pickup_rider_id = v_uid, status = 'pickup_assigned'
      where o.id = p_order_id returning * into v_order;

    when 'start_delivery' then
      if v_order.status <> 'delivery_assigned' or v_order.delivery_rider_id is distinct from v_uid then
        raise exception 'transition_not_allowed';
      end if;
      update public.orders o set status = 'out_for_delivery'
      where o.id = p_order_id returning * into v_order;

    when 'complete_delivery' then
      if v_order.status <> 'out_for_delivery' or v_order.delivery_rider_id is distinct from v_uid then
        raise exception 'transition_not_allowed';
      end if;
      update public.orders o set status = case
          when o.pickup_address is not null then 'awaiting_pickup'::public.order_status
          else 'delivered'::public.order_status end
      where o.id = p_order_id returning * into v_order;

    when 'start_pickup' then
      if v_order.status <> 'pickup_assigned' or v_order.pickup_rider_id is distinct from v_uid then
        raise exception 'transition_not_allowed';
      end if;
      update public.orders o set status = 'out_for_pickup'
      where o.id = p_order_id returning * into v_order;

    when 'complete_pickup' then
      if v_order.status <> 'out_for_pickup' or v_order.pickup_rider_id is distinct from v_uid then
        raise exception 'transition_not_allowed';
      end if;
      if p_lost is not null and (p_lost < 0 or p_lost > v_order.radios_count + v_order.extra_radios) then
        raise exception 'invalid_lost_count';
      end if;
      update public.orders o set status = 'picked_up', lost_radios = coalesce(p_lost, o.lost_radios)
      where o.id = p_order_id returning * into v_order;

    else
      raise exception 'unknown_action';
  end case;

  return v_order;
end;
$$;

-- -----------------------------------------------------------------------------
-- Radio channels
-- -----------------------------------------------------------------------------

-- One row per channel 0..radio_channels_total with its live state, derived from
-- open orders. No client-side bookkeeping needed.
create function public.get_channel_status()
returns table (
  channel     integer,
  state       text,
  order_id    uuid,
  guide_name  text,
  delivery_at timestamptz,
  status      public.order_status
)
language sql
stable
security definer
set search_path = ''
as $$
  with t as (
    select * from public.tenants
    where id = (select private.current_tenant_id()) and (select private.is_admin())
  )
  select
    c.n as channel,
    case
      when c.n = any (t.disabled_channels) then 'disabled'
      when o.id is not null then 'busy'
      else 'free'
    end as state,
    o.id, o.guide_name, o.delivery_at, o.status
  from t
  cross join lateral generate_series(0, t.radio_channels_total) as c(n)
  left join public.orders o
    on o.tenant_id = t.id
   and o.radio_channel = c.n
   and o.status not in ('picked_up', 'cancelled')
  order by c.n;
$$;

-- -----------------------------------------------------------------------------
-- Rider activity (replaces the hand-maintained rider_status collection)
-- -----------------------------------------------------------------------------

create view public.rider_activity
with (security_invoker = on) as
with legs as (
  select o.id as order_id, o.delivery_rider_id as rider_id, 'delivery'::text as leg,
         o.status, o.delivery_address as heading_to, o.delivery_at as scheduled_at, o.updated_at
  from public.orders o
  where o.delivery_rider_id is not null
    and o.status in ('delivery_assigned', 'out_for_delivery')
  union all
  select o.id, o.pickup_rider_id, 'pickup',
         o.status, o.pickup_address, o.pickup_at, o.updated_at
  from public.orders o
  where o.pickup_rider_id is not null
    and o.status in ('pickup_assigned', 'out_for_pickup')
),
agg as (
  select rider_id, count(*)::integer as active_orders, max(updated_at) as last_activity_at
  from legs group by rider_id
),
cur as (
  select distinct on (rider_id) rider_id, order_id, leg, status, heading_to, scheduled_at
  from legs
  order by rider_id,
           (status in ('out_for_delivery', 'out_for_pickup')) desc,
           scheduled_at nulls last
)
select
  p.id                              as rider_id,
  p.tenant_id,
  p.full_name                       as rider_name,
  coalesce(agg.active_orders, 0)    as active_orders,
  coalesce(agg.active_orders, 0) > 0 as is_busy,
  (cur.status in ('out_for_delivery', 'out_for_pickup')) as in_progress,
  cur.order_id                      as current_order_id,
  cur.leg                           as current_leg,
  cur.status                        as current_status,
  cur.heading_to,
  cur.scheduled_at,
  agg.last_activity_at
from public.profiles p
left join agg on agg.rider_id = p.id
left join cur on cur.rider_id = p.id
where 'rider' = any (p.roles) and not p.disabled;

-- -----------------------------------------------------------------------------
-- Dashboard statistics (computed in the database, in the tenant's timezone)
-- -----------------------------------------------------------------------------

create function public.get_dashboard_stats(p_month date default current_date)
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
             order by c.radio_channel), '[]'::jsonb)
      from (
        select radio_channel, count(*)::integer as orders
        from live where radio_channel is not null group by radio_channel
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
-- Public booking (anonymous guides use the /book/<slug> form)
-- -----------------------------------------------------------------------------

create function public.get_public_tenant(p_slug text)
returns table (name text, slug text, timezone text, accepting_bookings boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select t.name, t.slug, t.timezone, (t.is_active and t.public_booking_enabled)
  from public.tenants t
  where t.slug = lower(btrim(p_slug))
  limit 1;
$$;

create function public.create_public_order(
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

  insert into public.orders (
    tenant_id, guide_id, guide_name, guide_phone, guide_email,
    radios_count, delivery_at, delivery_address, pickup_at, pickup_address,
    notes, source)
  values (
    v_tenant.id, v_guide, btrim(p_guide_name), btrim(p_guide_phone), v_email,
    p_radios_count, p_delivery_at, btrim(p_delivery_address), p_pickup_at,
    nullif(btrim(p_pickup_address), ''),
    nullif(btrim(p_notes), ''), 'public_form')
  returning id into v_order;

  return v_order;
end;
$$;

-- -----------------------------------------------------------------------------
-- Function privileges: nothing is callable unless granted below.
-- -----------------------------------------------------------------------------

revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function
  public.bootstrap_profile(),
  public.touch_login(),
  public.update_member(uuid, text, text, public.app_role[], boolean),
  public.assign_order(uuid, text, uuid),
  public.admin_set_status(uuid, public.order_status),
  public.rider_order_action(uuid, text, integer),
  public.get_channel_status(),
  public.get_dashboard_stats(date)
to authenticated;

grant execute on function
  public.get_public_tenant(text),
  public.create_public_order(text, text, text, text, integer, timestamptz, text, timestamptz, text, text)
to anon, authenticated;

grant select on public.rider_activity to authenticated;
