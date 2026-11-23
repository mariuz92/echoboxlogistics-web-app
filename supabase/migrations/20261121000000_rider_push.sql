create table private.push_devices (
  device_id text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  token text not null unique,
  platform text not null check (platform in ('android', 'ios')),
  updated_at timestamptz not null default now()
);
create index push_devices_user_idx on private.push_devices(user_id);

-- A registration belongs to one account at a time, even if a phone changes
-- accounts after going offline and could not unregister the old session.
create function public.register_push_device(p_device_id text, p_token text, p_platform text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not coalesce(p_device_id ~ '^[0-9a-f]{32}$', false)
    or not coalesce(char_length(p_token) between 1 and 4096 and p_token ~ '^[!-~]+$', false)
    or not coalesce(p_platform in ('android', 'ios'), false) then
    raise exception 'invalid_push_device' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = v_user and not p.disabled and 'rider' = any(p.roles)
      and private.company_access_mode(p.tenant_id) in ('full', 'closeout')
  ) then
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_token, 0));
  delete from private.push_devices d where d.token = p_token and d.device_id <> p_device_id;
  insert into private.push_devices(device_id, user_id, token, platform)
  values (p_device_id, v_user, p_token, p_platform)
  on conflict (device_id) do update set
    user_id = excluded.user_id, token = excluded.token, platform = excluded.platform, updated_at = now();
end;
$$;

create function public.unregister_push_device(p_device_id text)
returns void language sql security definer set search_path = '' as $$
  delete from private.push_devices d where d.device_id = p_device_id and d.user_id = auth.uid();
$$;

create table private.push_jobs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  rider_id uuid not null references public.profiles(id) on delete cascade,
  leg text not null check (leg in ('delivery', 'pickup')),
  kind text not null check (kind in ('assignment', 'reminder')),
  available_at timestamptz not null,
  expires_at timestamptz not null,
  cancelled_at timestamptz
);
create index push_jobs_order_idx on private.push_jobs(order_id, leg) where cancelled_at is null;
create index push_jobs_active_idx on private.push_jobs(available_at, expires_at) where cancelled_at is null;

create table private.push_deliveries (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references private.push_jobs(id) on delete cascade,
  device_id text not null,
  state text not null default 'pending' check (state in ('pending', 'sent', 'skipped', 'failed')),
  next_attempt_at timestamptz not null default now(),
  attempt_count integer not null default 0,
  claim_id uuid,
  result_code text,
  finished_at timestamptz,
  unique (job_id, device_id)
);
create index push_deliveries_pending_idx on private.push_deliveries(next_attempt_at) where state = 'pending';

revoke all on private.push_devices, private.push_jobs, private.push_deliveries
  from public, anon, authenticated;

create function private.order_push_legs(p_order public.orders)
returns table (leg text, rider_id uuid, scheduled_at timestamptz)
language sql immutable set search_path = '' as $$
  select 'delivery', (p_order).delivery_rider_id, (p_order).delivery_at
    where (p_order).status in ('delivery_assigned', 'out_for_delivery') and (p_order).delivery_rider_id is not null
  union all
  select 'pickup', (p_order).pickup_rider_id, (p_order).pickup_at
    where (p_order).status in ('pickup_assigned', 'out_for_pickup') and (p_order).pickup_rider_id is not null;
$$;

create function private.sync_order_push_jobs()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_leg record;
begin
  for v_leg in
    select coalesce(n.leg, o.leg) as leg, n.rider_id, n.scheduled_at,
      n.rider_id is distinct from o.rider_id as assignment_changed,
      n.scheduled_at is distinct from o.scheduled_at as schedule_changed
    from private.order_push_legs(new) n
    full join private.order_push_legs(case when tg_op = 'UPDATE' then old else null::public.orders end) o using (leg)
  loop
    if not (v_leg.assignment_changed or v_leg.schedule_changed) then continue; end if;

    update private.push_jobs j set cancelled_at = now()
    where j.order_id = new.id and j.leg = v_leg.leg and j.cancelled_at is null
      and (v_leg.assignment_changed or j.kind = 'reminder');

    if v_leg.rider_id is null then continue; end if;
    if v_leg.assignment_changed then
      insert into private.push_jobs(order_id, rider_id, leg, kind, available_at, expires_at)
      values (new.id, v_leg.rider_id, v_leg.leg, 'assignment', now(), now() + interval '1 hour');
    end if;
    if v_leg.scheduled_at > now() then
      insert into private.push_jobs(order_id, rider_id, leg, kind, available_at, expires_at)
      values (new.id, v_leg.rider_id, v_leg.leg, 'reminder',
        v_leg.scheduled_at - interval '15 minutes', v_leg.scheduled_at);
    end if;
  end loop;
  return new;
end;
$$;

create trigger sync_order_push_jobs
after insert or update of status, delivery_rider_id, pickup_rider_id, delivery_at, pickup_at on public.orders
for each row execute function private.sync_order_push_jobs();

-- Existing assignments can receive an upcoming reminder after rollout.
insert into private.push_jobs(order_id, rider_id, leg, kind, available_at, expires_at)
select o.id, leg.rider_id, leg.leg, 'reminder', leg.scheduled_at - interval '15 minutes', leg.scheduled_at
from public.orders o cross join lateral private.order_push_legs(o) leg
where leg.scheduled_at > now();

create view private.deliverable_push_jobs as
select j.*
from private.push_jobs j
join public.orders o on o.id = j.order_id
join public.profiles p on p.id = j.rider_id and p.tenant_id = o.tenant_id
join auth.users u on u.id = p.id
cross join lateral private.order_push_legs(o) leg
where j.cancelled_at is null and j.available_at <= now() and j.expires_at > now()
  and leg.leg = j.leg and leg.rider_id = j.rider_id
  and not p.disabled and 'rider' = any(p.roles)
  and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until <= now())
  and case when j.leg = 'pickup' then private.company_access_mode(o.tenant_id) in ('full', 'closeout')
    else private.company_access_mode(o.tenant_id) = 'full' end;

revoke all on private.deliverable_push_jobs from public, anon, authenticated;

create function public.claim_push_deliveries(p_limit integer default 16)
returns table (delivery_id uuid, lease_id uuid)
language plpgsql security definer set search_path = '' as $$
begin
  update private.push_deliveries d
  set state = 'skipped', claim_id = null, finished_at = now(),
      result_code = case when j.cancelled_at is not null then 'cancelled' else 'expired' end
  from private.push_jobs j
  where j.id = d.job_id and d.state = 'pending' and d.next_attempt_at <= now()
    and (j.cancelled_at is not null or j.expires_at <= now());

  insert into private.push_deliveries(job_id, device_id)
  select j.id, d.device_id
  from private.deliverable_push_jobs j join private.push_devices d on d.user_id = j.rider_id
  on conflict (job_id, device_id) do nothing;

  return query
  with batch as (
    select d.id
    from private.push_deliveries d
    join private.deliverable_push_jobs j on j.id = d.job_id
    join private.push_devices p on p.device_id = d.device_id and p.user_id = j.rider_id
    where d.state = 'pending' and d.next_attempt_at <= now()
    order by d.next_attempt_at, d.id
    limit greatest(1, least(coalesce(p_limit, 16), 32))
    for update of d skip locked
  )
  update private.push_deliveries d
  set claim_id = gen_random_uuid(), next_attempt_at = now() + interval '2 minutes',
      attempt_count = d.attempt_count + 1
  from batch where d.id = batch.id
  returning d.id, d.claim_id;
end;
$$;

-- Recheck the order, company, rider and device immediately before delivery.
create function public.read_push_delivery(p_delivery_id uuid, p_lease_id uuid)
returns table (order_id uuid, leg text, kind text, token text, expires_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select j.order_id, j.leg, j.kind, p.token, j.expires_at
  from private.push_deliveries d
  join private.deliverable_push_jobs j on j.id = d.job_id
  join private.push_devices p on p.device_id = d.device_id and p.user_id = j.rider_id
  where d.id = p_delivery_id and d.claim_id = p_lease_id and d.next_attempt_at > now() and d.state = 'pending';
$$;

create function public.finish_push_delivery(
  p_delivery_id uuid, p_lease_id uuid, p_result text, p_code text default null,
  p_retry_after integer default null, p_token text default null
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_delivery private.push_deliveries;
begin
  if not coalesce(p_result in ('sent', 'skipped', 'failed', 'retry', 'unregistered'), false) then
    raise exception 'invalid_push_result' using errcode = '22023';
  end if;
  update private.push_deliveries d
  set state = case p_result when 'retry' then 'pending' when 'unregistered' then 'failed' else p_result end,
      claim_id = null,
      result_code = case when p_code ~ '^[A-Za-z0-9_]{1,64}$' then p_code else null end,
      finished_at = case when p_result = 'retry' then null else now() end,
      next_attempt_at = now() + pg_catalog.make_interval(secs =>
        greatest(60, least(3600, coalesce(p_retry_after, 60 * (1 << least(d.attempt_count - 1, 6))))))
  where d.id = p_delivery_id and d.claim_id = p_lease_id and d.state = 'pending'
  returning d.* into v_delivery;

  if found and p_result = 'unregistered' then
    delete from private.push_devices p using private.push_jobs j
    where j.id = v_delivery.job_id and p.device_id = v_delivery.device_id
      and p.user_id = j.rider_id and p.token = p_token;
  end if;
end;
$$;

revoke all on function public.register_push_device(text, text, text), public.unregister_push_device(text)
  from public, anon, authenticated;
grant execute on function public.register_push_device(text, text, text), public.unregister_push_device(text)
  to authenticated;

revoke all on function public.claim_push_deliveries(integer), public.read_push_delivery(uuid, uuid),
  public.finish_push_delivery(uuid, uuid, text, text, integer, text) from public, anon, authenticated;
grant execute on function public.claim_push_deliveries(integer), public.read_push_delivery(uuid, uuid),
  public.finish_push_delivery(uuid, uuid, text, text, integer, text) to service_role;

revoke all on function private.order_push_legs(public.orders), private.sync_order_push_jobs() from public;
