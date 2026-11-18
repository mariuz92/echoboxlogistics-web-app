-- =============================================================================
-- Helper functions and order triggers
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Identity helpers used by RLS policies and RPCs.
-- SECURITY DEFINER so they can read profiles regardless of the caller's RLS.
-- -----------------------------------------------------------------------------

create function private.current_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.tenant_id
  from public.profiles p
  where p.id = (select auth.uid()) and not p.disabled;
$$;

create function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select 'admin' = any (p.roles)
     from public.profiles p
     where p.id = (select auth.uid()) and not p.disabled),
    false);
$$;

create function private.is_rider()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select 'rider' = any (p.roles)
     from public.profiles p
     where p.id = (select auth.uid()) and not p.disabled),
    false);
$$;

-- -----------------------------------------------------------------------------
-- Slugs
-- -----------------------------------------------------------------------------

create function private.slugify(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    nullif(
      btrim(
        regexp_replace(
          lower(translate(coalesce(p_text, ''),
            'àáâäãèéêëìíîïòóôöõùúûüçñÀÁÂÄÃÈÉÊËÌÍÎÏÒÓÔÖÕÙÚÛÜÇÑ',
            'aaaaaeeeeiiiiooooouuuucnaaaaaeeeeiiiiooooouuuucn')),
          '[^a-z0-9]+', '-', 'g'),
        '-'),
      ''),
    'company');
$$;

create function private.unique_tenant_slug(p_name text)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_base text := left(private.slugify(p_name), 48);
  v_slug text := v_base;
  v_try  integer := 0;
begin
  while exists (select 1 from public.tenants t where t.slug = v_slug) loop
    v_try := v_try + 1;
    v_slug := v_base || '-' || substr(md5(random()::text || clock_timestamp()::text), 1, 4);
    exit when v_try > 20;
  end loop;
  return v_slug;
end;
$$;

-- -----------------------------------------------------------------------------
-- Order guard: validates consistency and protects status / rider fields.
--
-- Status and rider columns can only be changed by the order action RPCs
-- (assign_order, admin_set_status, rider_order_action, ...), which switch on
-- the transaction-local flag `app.order_actions`. This makes the state machine
-- impossible to bypass through the REST API, even for admins.
-- -----------------------------------------------------------------------------

create function private.orders_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actions boolean := coalesce(nullif(current_setting('app.order_actions', true), ''), 'off') = 'on';
  v_tenant  public.tenants%rowtype;
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

  -- Radio channel must exist and must not be disabled.
  if new.radio_channel is not null
     and (tg_op = 'INSERT' or new.radio_channel is distinct from old.radio_channel) then
    select * into v_tenant from public.tenants t where t.id = new.tenant_id;
    if new.radio_channel > v_tenant.radio_channels_total then
      raise exception 'Radio channel % is outside the configured range (0-%)',
        new.radio_channel, v_tenant.radio_channels_total using errcode = '23514';
    end if;
    if new.radio_channel = any (v_tenant.disabled_channels) then
      raise exception 'Radio channel % is disabled', new.radio_channel using errcode = '23514';
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

create trigger orders_guard
  before insert or update on public.orders
  for each row execute function private.orders_guard();

-- -----------------------------------------------------------------------------
-- Order audit trail
-- -----------------------------------------------------------------------------

create function private.orders_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor   uuid := (select auth.uid());
  v_changes jsonb;
  v_type    text;
begin
  if tg_op = 'INSERT' then
    insert into public.order_events (order_id, tenant_id, actor_id, event_type, to_status, payload)
    values (new.id, new.tenant_id, v_actor, 'created', new.status,
            jsonb_build_object('source', new.source));
    return new;
  end if;

  if tg_op = 'DELETE' then
    insert into public.order_events (order_id, tenant_id, actor_id, event_type, from_status, payload)
    values (old.id, old.tenant_id, v_actor, 'deleted', old.status,
            jsonb_build_object('snapshot', to_jsonb(old)));
    return old;
  end if;

  select coalesce(jsonb_object_agg(n.key, jsonb_build_object('from', o.value, 'to', n.value)), '{}'::jsonb)
    into v_changes
  from jsonb_each(to_jsonb(new)) n
  join jsonb_each(to_jsonb(old)) o using (key)
  where n.value is distinct from o.value
    and n.key not in ('updated_at', 'delivered_at', 'picked_up_at');

  if v_changes = '{}'::jsonb then
    return new;
  end if;

  v_type := case
    when new.status is distinct from old.status then 'status_changed'
    when new.delivery_rider_id is distinct from old.delivery_rider_id
      or new.pickup_rider_id is distinct from old.pickup_rider_id then 'assigned'
    else 'updated'
  end;

  insert into public.order_events (order_id, tenant_id, actor_id, event_type, from_status, to_status, payload)
  values (new.id, new.tenant_id, v_actor, v_type, old.status, new.status,
          jsonb_build_object('changes', v_changes));
  return new;
end;
$$;

create trigger orders_audit
  after insert or update or delete on public.orders
  for each row execute function private.orders_audit();
