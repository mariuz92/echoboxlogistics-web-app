-- =============================================================================
-- Dashboard insights
--
-- Replaces get_dashboard_stats (volumes and charts that did not answer a
-- decision) with get_dashboard_insights: figures an admin can act on.
--
--   * snapshot   month vs previous month: revenue, orders, group size, losses,
--                cancellations, punctuality
--   * trend      the last 12 months (seasonality, growth)
--   * capacity   the most groups and radios out at the same time each day, against
--                the channels available, and the same for the next 14 days
--   * alerts     overdue pickups, deliveries and pickups without a rider
--   * stops      deliveries + pickups by weekday and hour (how many riders, when)
--   * guides     revenue concentration, new vs returning, guides to win back,
--                guides who lose radios
--   * operations booking lead time, booking source, rental length, riders
--   * locations  where the work is
--
-- Everything is computed in the company's timezone and only for the caller's
-- company (admins only), like the function it replaces.
-- =============================================================================

drop function public.get_dashboard_stats(date);

-- -----------------------------------------------------------------------------
-- Per day: the most groups (orders) and radios out *at the same time* in any hour
-- of the day (what equipment you need), plus deliveries and pickups of the day.
-- An order is out from its delivery to its pickup (picked up, planned, or 6 hours
-- after the delivery when no pickup is planned). Cancelled orders are ignored.
-- Not callable by users: it trusts its tenant argument.
-- -----------------------------------------------------------------------------
create function private.concurrency(p_tenant uuid, p_tz text, p_from date, p_to date)
returns table (day date, groups integer, radios integer, deliveries integer, pickups integer)
language sql
stable
set search_path = ''
as $$
  with span as (
    select o.delivery_at as s,
           greatest(coalesce(o.picked_up_at, o.pickup_at, o.delivery_at + interval '6 hours'),
                    o.delivery_at + interval '1 minute') as e,
           (o.radios_count + o.extra_radios) as radios,
           (o.delivery_at at time zone p_tz)::date as d_del,
           (o.pickup_at at time zone p_tz)::date as d_pick
    from public.orders o
    where o.tenant_id = p_tenant
      and o.status <> 'cancelled'
      and o.delivery_at < ((p_to + 1)::timestamp at time zone p_tz)
      and coalesce(o.picked_up_at, o.pickup_at, o.delivery_at + interval '6 hours')
          > (p_from::timestamp at time zone p_tz)
  ),
  hours as (
    select d.day, ((d.day::timestamp + h * interval '1 hour') at time zone p_tz) as hs
    from (select p_from + n as day from generate_series(0, p_to - p_from) as n) d
    cross join generate_series(0, 23) as h
  ),
  per_hour as (
    select hh.day, hh.hs, count(s.s)::integer as groups, coalesce(sum(s.radios), 0)::integer as radios
    from hours hh
    left join span s on s.s < hh.hs + interval '1 hour' and s.e > hh.hs
    group by hh.day, hh.hs
  )
  select d.day,
         (select max(ph.groups) from per_hour ph where ph.day = d.day),
         (select max(ph.radios) from per_hour ph where ph.day = d.day),
         (select count(*) from span s where s.d_del = d.day)::integer,
         (select count(*) from span s where s.d_pick = d.day)::integer
  from (select p_from + n as day from generate_series(0, p_to - p_from) as n) d
  order by d.day;
$$;

revoke all on function private.concurrency(uuid, text, date, date) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- The dashboard
-- -----------------------------------------------------------------------------
create function public.get_dashboard_insights(p_month date default current_date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tenant     public.tenants%rowtype;
  v_month      timestamp := date_trunc('month', p_month::timestamp);
  v_from       timestamptz;
  v_to         timestamptz;
  v_prev_from  timestamptz;
  v_cut        timestamptz;
  v_prev_cut   timestamptz;
  v_today      date;
  v_channels   integer;
  v_result     jsonb;
begin
  if not (select private.is_admin()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_tenant from public.tenants t where t.id = (select private.current_tenant_id());

  v_from       := v_month at time zone v_tenant.timezone;
  v_to         := (v_month + interval '1 month') at time zone v_tenant.timezone;
  v_prev_from  := (v_month - interval '1 month') at time zone v_tenant.timezone;
  v_today      := (now() at time zone v_tenant.timezone)::date;
  -- What happened is measured up to the end of today for a month in progress (so it is
  -- compared with the same days of the previous month); what is already booked after
  -- that is reported apart.
  v_cut        := least(v_to, greatest(v_from, ((v_today + 1)::timestamp at time zone v_tenant.timezone)));
  v_prev_cut   := least(v_from, v_prev_from + (v_cut - v_from));
  v_channels   := greatest(0, (v_tenant.channel_max - v_tenant.channel_min + 1)
                              - coalesce(cardinality(v_tenant.disabled_channels), 0));

  with
  -- every order of the company, with the guide's identity and local times
  base as (
    select o.*,
           coalesce(o.guide_id::text, lower(btrim(o.guide_name))) as guide_key,
           (o.delivery_at at time zone v_tenant.timezone) as d_local,
           (o.pickup_at at time zone v_tenant.timezone) as p_local
    from public.orders o
    where o.tenant_id = v_tenant.id
  ),
  cur as (select * from base where delivery_at >= v_from and delivery_at < v_cut),
  live as (select * from cur where status <> 'cancelled'),
  prev_all as (select * from base where delivery_at >= v_prev_from and delivery_at < v_prev_cut),
  prev as (select * from prev_all where status <> 'cancelled'),
  pickups as (
    select * from base
    where pickup_at >= v_from and pickup_at < v_cut and status <> 'cancelled'
  ),
  -- the guides active in the month and when each guide first ordered
  first_order as (
    select guide_key, min(delivery_at) as first_at
    from base where status <> 'cancelled' group by guide_key
  ),
  guide_life as (
    select guide_key, max(guide_name) as name, count(*) as orders,
           coalesce(sum(balance), 0) as revenue,
           max(delivery_at) filter (where delivery_at < now()) as last_at,
           bool_or(delivery_at >= now()) as has_future
    from base where status <> 'cancelled' group by guide_key
  )
  select jsonb_build_object(
    'month', to_char(v_month, 'YYYY-MM'),
    'timezone', v_tenant.timezone,
    'in_progress', v_cut < v_to,
    'through', to_char((v_cut - interval '1 second') at time zone v_tenant.timezone, 'YYYY-MM-DD'),
    'booked_ahead', (
      select jsonb_build_object(
        'orders', count(*),
        'revenue', coalesce(sum(balance), 0),
        'radios', coalesce(sum(radios_count + extra_radios), 0))
      from base where status <> 'cancelled' and delivery_at >= v_cut and delivery_at < v_to),

    -- 1. snapshot ------------------------------------------------------------
    'current', (
      select jsonb_build_object(
        'orders', count(*),
        'revenue', coalesce(sum(balance), 0),
        'radios', coalesce(sum(radios_count + extra_radios), 0),
        'lost', coalesce(sum(lost_radios), 0),
        'delivered', count(*) filter (where delivered_at is not null),
        'on_time', count(*) filter (where delivered_at is not null
                                      and delivered_at <= delivery_at + interval '10 minutes'),
        'cancelled', (select count(*) from cur where status = 'cancelled'),
        'booked', (select count(*) from cur))
      from live),
    'previous', (
      select jsonb_build_object(
        'orders', count(*),
        'revenue', coalesce(sum(balance), 0),
        'radios', coalesce(sum(radios_count + extra_radios), 0),
        'lost', coalesce(sum(lost_radios), 0),
        'delivered', count(*) filter (where delivered_at is not null),
        'on_time', count(*) filter (where delivered_at is not null
                                      and delivered_at <= delivery_at + interval '10 minutes'),
        'cancelled', (select count(*) from prev_all where status = 'cancelled'),
        'booked', (select count(*) from prev_all))
      from prev),

    -- 2. the last 12 months -------------------------------------------------
    'trend', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'month', m.month, 'orders', m.orders, 'revenue', m.revenue, 'radios', m.radios)
             order by m.month), '[]'::jsonb)
      from (
        select to_char(s.first_day, 'YYYY-MM') as month,
               count(b.id)::integer as orders,
               coalesce(sum(b.balance), 0) as revenue,
               coalesce(sum(b.radios_count + b.extra_radios), 0)::integer as radios
        from (select (v_month - make_interval(months => n)) as first_day
              from generate_series(0, 11) as n) s
        left join base b
          on b.status <> 'cancelled'
         and b.delivery_at >= (s.first_day at time zone v_tenant.timezone)
         and b.delivery_at <  least(((s.first_day + interval '1 month') at time zone v_tenant.timezone), v_cut)
        group by s.first_day
      ) m),

    -- 3. capacity: this month and the next two weeks -----------------------
    'capacity', jsonb_build_object(
      'channels', v_channels,
      'exclusive', v_tenant.channels_exclusive,
      'days', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'date', c.day, 'groups', c.groups, 'radios', c.radios,
                 'deliveries', c.deliveries, 'pickups', c.pickups) order by c.day), '[]'::jsonb)
        from private.concurrency(v_tenant.id, v_tenant.timezone, v_month::date,
                                 (v_month + interval '1 month - 1 day')::date) c),
      'upcoming', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'date', c.day, 'groups', c.groups, 'radios', c.radios,
                 'deliveries', c.deliveries, 'pickups', c.pickups) order by c.day), '[]'::jsonb)
        from private.concurrency(v_tenant.id, v_tenant.timezone, v_today, v_today + 13) c)),

    -- 4. what needs attention now -------------------------------------------
    'alerts', jsonb_build_object(
      -- radios still out: the pickup time has passed, or no pickup was planned and
      -- the delivery was more than a day ago
      'overdue_pickups', (
        select jsonb_build_object(
                 'orders', count(*),
                 'radios', coalesce(sum(radios_count + extra_radios), 0),
                 'oldest_days', coalesce(max(floor(extract(epoch from (now() - coalesce(pickup_at, delivery_at))) / 86400)), 0))
        from base
        where status in ('delivered', 'awaiting_pickup', 'pickup_assigned', 'out_for_pickup')
          and (pickup_at < now() or (pickup_at is null and delivery_at < now() - interval '1 day'))),
      'unassigned_deliveries', (
        select count(*) from base
        where status = 'received' and delivery_rider_id is null
          and delivery_at >= now() and delivery_at < now() + interval '7 days'),
      'unassigned_pickups', (
        select count(*) from base
        where pickup_rider_id is null and pickup_at >= now() and pickup_at < now() + interval '7 days'
          and status not in ('picked_up', 'cancelled'))),

    -- 5. deliveries + pickups by weekday and hour (rider workload) ----------
    'stops', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'weekday', x.weekday, 'hour', x.hour, 'count', x.c) order by x.weekday, x.hour), '[]'::jsonb)
      from (
        select weekday, hour, count(*)::integer as c
        from (
          select extract(isodow from d_local)::integer as weekday, extract(hour from d_local)::integer as hour from live
          union all
          select extract(isodow from p_local)::integer, extract(hour from p_local)::integer from pickups
        ) u
        group by weekday, hour
      ) x),

    -- 6. guides ---------------------------------------------------------------
    'guides', jsonb_build_object(
      'top', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'name', g.name, 'orders', g.orders, 'revenue', g.revenue, 'radios', g.radios)
               order by g.revenue desc, g.orders desc), '[]'::jsonb)
        from (
          select max(guide_name) as name, count(*)::integer as orders,
                 coalesce(sum(balance), 0) as revenue,
                 coalesce(sum(radios_count + extra_radios), 0)::integer as radios
          from live group by guide_key
          order by sum(balance) desc nulls last, count(*) desc
          limit 8
        ) g),
      'active', (select count(distinct guide_key) from live),
      'new', (select count(distinct l.guide_key) from live l
              join first_order f using (guide_key) where f.first_at >= v_from),
      'new_revenue', (select coalesce(sum(l.balance), 0) from live l
                      join first_order f using (guide_key) where f.first_at >= v_from),
      'win_back', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'name', w.name, 'orders', w.orders, 'revenue', w.revenue,
                 'last_order', w.last_day, 'days_since', w.days_since)
               order by w.revenue desc), '[]'::jsonb)
        from (
          select name, orders::integer as orders, revenue,
                 to_char(last_at at time zone v_tenant.timezone, 'YYYY-MM-DD') as last_day,
                 (v_today - (last_at at time zone v_tenant.timezone)::date) as days_since
          from guide_life
          where orders >= 2 and not has_future
            and last_at < now() - interval '45 days'
            and last_at >= now() - interval '540 days'
          order by revenue desc
          limit 8
        ) w),
      'losses', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'name', l.name, 'lost', l.lost, 'radios', l.radios) order by l.lost desc, l.radios desc, l.name), '[]'::jsonb)
        from (
          select max(guide_name) as name, sum(lost_radios)::integer as lost,
                 sum(radios_count + extra_radios)::integer as radios
          from live group by guide_key having sum(lost_radios) > 0
          order by sum(lost_radios) desc, sum(radios_count + extra_radios) desc, max(guide_name) limit 5
        ) l)),

    -- 7. operations -----------------------------------------------------------
    'operations', jsonb_build_object(
      'lead_time', (
        select jsonb_build_object(
                 'same_day', count(*) filter (where lead < interval '1 day'),
                 'days_1_2', count(*) filter (where lead >= interval '1 day' and lead < interval '3 days'),
                 'days_3_7', count(*) filter (where lead >= interval '3 days' and lead < interval '8 days'),
                 'days_8_30', count(*) filter (where lead >= interval '8 days' and lead < interval '31 days'),
                 'over_30', count(*) filter (where lead >= interval '31 days'))
        from (select greatest(delivery_at - created_at, interval '0') as lead from live) t),
      'sources', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'source', s.source, 'orders', s.orders, 'revenue', s.revenue, 'cancelled', s.cancelled)
               order by s.orders desc), '[]'::jsonb)
        from (
          select source, count(*) filter (where status <> 'cancelled')::integer as orders,
                 coalesce(sum(balance) filter (where status <> 'cancelled'), 0) as revenue,
                 count(*) filter (where status = 'cancelled')::integer as cancelled
          from cur group by source
        ) s),
      'avg_days_out', (
        select round(avg(extract(epoch from (coalesce(picked_up_at, pickup_at) - delivery_at)) / 86400)::numeric, 1)
        from live where coalesce(picked_up_at, pickup_at) is not null),
      'riders', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'name', r.name, 'stops', r.stops, 'deliveries', r.deliveries,
                 'on_time', r.on_time, 'delivered', r.delivered) order by r.stops desc), '[]'::jsonb)
        from (
          select p.full_name as name,
                 (count(*) filter (where o.delivery_rider_id = p.id)
                  + count(*) filter (where o.pickup_rider_id = p.id and o.pickup_at >= v_from and o.pickup_at < v_cut))::integer as stops,
                 count(*) filter (where o.delivery_rider_id = p.id)::integer as deliveries,
                 count(*) filter (where o.delivery_rider_id = p.id and o.delivered_at is not null)::integer as delivered,
                 count(*) filter (where o.delivery_rider_id = p.id and o.delivered_at is not null
                                    and o.delivered_at <= o.delivery_at + interval '10 minutes')::integer as on_time
          from public.profiles p
          join base o on (o.delivery_rider_id = p.id or o.pickup_rider_id = p.id)
                     and o.status <> 'cancelled'
                     and ((o.delivery_at >= v_from and o.delivery_at < v_cut)
                          or (o.pickup_at >= v_from and o.pickup_at < v_cut))
          where p.tenant_id = v_tenant.id
          group by p.id, p.full_name
          order by 2 desc
          limit 10
        ) r)),

    -- 8. where the work is ---------------------------------------------------
    'locations', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'location', l.location, 'orders', l.orders, 'revenue', l.revenue, 'radios', l.radios)
             order by l.orders desc, l.revenue desc), '[]'::jsonb)
      from (
        select max(delivery_address) as location, count(*)::integer as orders,
               coalesce(sum(balance), 0) as revenue,
               coalesce(sum(radios_count + extra_radios), 0)::integer as radios
        from live group by lower(btrim(delivery_address))
        order by count(*) desc, sum(balance) desc
        limit 8
      ) l)
  )
  into v_result;

  return v_result;
end;
$$;

revoke execute on function public.get_dashboard_insights(date) from public, anon;
grant execute on function public.get_dashboard_insights(date) to authenticated;
