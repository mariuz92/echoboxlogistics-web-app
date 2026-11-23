-- The platform role is independent of company profiles and cannot be granted by the Data API.
create table private.platform_admins (
  user_id uuid primary key references auth.users(id) on delete restrict,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table private.platform_settings (
  singleton boolean primary key default true check (singleton),
  operator_only_companies boolean not null default false,
  booking_paused boolean not null default false,
  notice text not null default '' check (char_length(notice) <= 500)
);

create table private.company_owners (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete restrict
);

create table private.platform_plans (
  code text primary key check (code ~ '^[a-z][a-z0-9_-]{1,39}$'),
  name text not null check (char_length(btrim(name)) between 2 and 80),
  available boolean not null default true
);

create table private.company_subscriptions (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  plan_code text not null references private.platform_plans(code),
  state text not null check (state in ('trial', 'active', 'past_due', 'expired', 'cancelled')),
  ends_at timestamptz,
  grace_until timestamptz,
  closeout_until timestamptz,
  billing_email text check (char_length(billing_email) <= 254),
  updated_at timestamptz not null default now(),
  check (state <> 'trial' or ends_at is not null)
);

create table private.subscription_payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  actor_id uuid not null,
  amount numeric(12,2) not null check (amount > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  reference text not null check (char_length(btrim(reference)) between 1 and 120),
  paid_at timestamptz not null,
  unique (tenant_id, reference)
);

create table private.platform_audit (
  id bigint generated always as identity primary key,
  actor_id uuid not null,
  tenant_id uuid,
  action text not null,
  reason text not null,
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz not null default now()
);
create index platform_audit_tenant_idx on private.platform_audit(tenant_id, id desc);

create table private.platform_invitations (
  invitation_id uuid primary key references public.invitations(id) on delete cascade,
  for_owner boolean not null default false,
  delivery_state text not null default 'pending'
    check (delivery_state in ('pending', 'sending', 'sent', 'failed', 'existing_account')),
  attempt_id uuid,
  attempted_at timestamptz,
  attempts integer not null default 0,
  actor_id uuid not null
);

create table private.platform_issues (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete set null,
  source text not null check (source in ('web', 'flutter', 'backend')),
  area text not null,
  code text not null,
  build text,
  state text not null default 'open' check (state in ('open', 'investigating', 'resolved')),
  severity text not null default 'warning' check (severity in ('info', 'warning', 'critical')),
  occurrences integer not null default 1,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique nulls not distinct (tenant_id, source, area, code, build)
);
create index platform_issues_recent_idx on private.platform_issues(last_seen_at desc);

create table private.platform_report_limit (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_start timestamptz not null,
  reports integer not null
);

create function private.require_platform_admin()
returns uuid
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or coalesce(auth.jwt()->>'aal', '') <> 'aal2'
     or not exists (
       select 1 from private.platform_admins a join auth.users u on u.id = a.user_id
       where a.user_id = v_uid and a.enabled and u.email_confirmed_at is not null
         and (u.banned_until is null or u.banned_until <= now())
     ) then
    raise exception 'operator_access_denied' using errcode = '42501';
  end if;
  return v_uid;
end;
$$;

-- A first-factor session can discover its own enrollment requirement, but no console data.
create function public.platform_operator_status()
returns text
language sql stable security definer set search_path = ''
as $$
  select case when exists (
    select 1 from private.platform_admins a join auth.users u on u.id = a.user_id
    where a.user_id = auth.uid() and a.enabled and u.email_confirmed_at is not null
      and (u.banned_until is null or u.banned_until <= now())
  ) then case when auth.jwt()->>'aal' = 'aal2' then 'ready' else 'mfa_required' end
  else 'denied' end;
$$;

create function private.company_access_mode(p_tenant_id uuid)
returns text
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select case
      when not t.is_active then 'suspended'
      when s.tenant_id is null then 'full'
      when s.state in ('active', 'trial') and (s.ends_at is null or s.ends_at > now()) then 'full'
      when s.state = 'past_due' and s.grace_until > now() then 'full'
      when s.closeout_until > now() then 'closeout'
      else 'read_only'
    end
    from public.tenants t left join private.company_subscriptions s on s.tenant_id = t.id
    where t.id = p_tenant_id
  ), 'suspended');
$$;

create function public.platform_runtime_settings()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce((select jsonb_build_object(
    'operator_only_companies', s.operator_only_companies,
    'booking_paused', s.booking_paused,
    'notice', s.notice
  ) from private.platform_settings s), '{"operator_only_companies":false,"booking_paused":false,"notice":""}'::jsonb);
$$;

create function public.platform_company_access()
returns text
language sql stable security definer set search_path = ''
as $$
  select private.company_access_mode(
    (select p.tenant_id from public.profiles p where p.id = auth.uid() and not p.disabled)
  );
$$;

create function private.write_platform_audit(
  p_actor uuid, p_tenant uuid, p_action text, p_reason text, p_before jsonb, p_after jsonb
)
returns void
language sql security definer set search_path = ''
as $$
  insert into private.platform_audit(actor_id, tenant_id, action, reason, before_state, after_state)
  values (p_actor, p_tenant, p_action, p_reason, p_before, p_after);
$$;

create function private.new_platform_invitation(
  p_actor uuid, p_tenant uuid, p_email text, p_roles public.app_role[], p_for_owner boolean
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
  v_email text := lower(btrim(p_email));
begin
  if v_email is null or length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid_email';
  end if;
  if private.company_access_mode(p_tenant) <> 'full' then raise exception 'company_access_restricted'; end if;
  perform pg_advisory_xact_lock(hashtextextended('platform-invite/' || v_email, 0));
  if exists (
    select 1 from auth.users u join public.profiles p on p.id = u.id where lower(btrim(u.email)) = v_email
  ) then raise exception 'account_has_company'; end if;
  if exists (
    select 1 from public.invitations i where i.email_key = v_email and i.accepted_at is null
      and i.expires_at > now() and i.tenant_id <> p_tenant
  ) then raise exception 'invite_in_another_company'; end if;
  select i.id into v_id from public.invitations i
  join private.platform_invitations pi on pi.invitation_id = i.id
  where i.tenant_id = p_tenant and i.email_key = v_email and i.accepted_at is null
    and i.expires_at > now() and pi.for_owner = p_for_owner and i.roles = p_roles;
  if v_id is not null then return v_id; end if;
  if exists (
    select 1 from public.invitations i where i.tenant_id = p_tenant and i.email_key = v_email
      and i.accepted_at is null and i.expires_at > now()
  ) then raise exception 'revoke_previous_invitation'; end if;
  delete from public.invitations i where i.tenant_id = p_tenant and i.email_key = v_email
    and i.accepted_at is null and i.expires_at <= now();
  insert into public.invitations (tenant_id, email, roles)
  values (p_tenant, v_email, p_roles) returning id into v_id;
  insert into private.platform_invitations(invitation_id, for_owner, actor_id)
  values (v_id, p_for_owner, p_actor);
  return v_id;
end;
$$;

create function public.platform_console_action(p_action text, p_values jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := private.require_platform_admin();
  v_tenant uuid := nullif(p_values->>'tenant_id', '')::uuid;
  v_target uuid;
  v_attempt uuid;
  v_before jsonb;
  v_after jsonb;
  v_reason text := nullif(btrim(p_values->>'reason'), '');
  v_name text := nullif(btrim(p_values->>'name'), '');
  v_timezone text := coalesce(nullif(btrim(p_values->>'timezone'), ''), 'Europe/Rome');
  v_inv public.invitations;
begin
  if v_reason is null or char_length(v_reason) > 500 then raise exception 'operator_reason_required'; end if;

  case p_action
    when 'create_company' then
      if not exists (select 1 from pg_timezone_names where name = v_timezone) then raise exception 'invalid_timezone'; end if;
      insert into public.tenants(name, slug, timezone)
      values (v_name, private.unique_tenant_slug(v_name), v_timezone)
      returning id into v_tenant;
      v_target := private.new_platform_invitation(v_actor, v_tenant, p_values->>'email', array['admin']::public.app_role[], true);
      v_after := jsonb_build_object('tenant_id', v_tenant, 'name', v_name, 'invitation_id', v_target);

    when 'invite_member' then
      if coalesce(p_values->>'role', '') not in ('admin', 'rider') then raise exception 'invalid_roles'; end if;
      v_target := private.new_platform_invitation(
        v_actor, v_tenant, p_values->>'email', array[(p_values->>'role')::public.app_role], false
      );
      v_after := jsonb_build_object('invitation_id', v_target, 'role', p_values->>'role');

    when 'claim_invitation' then
      v_target := (p_values->>'invitation_id')::uuid;
      select i.* into v_inv from public.invitations i
      where i.id = v_target and i.expires_at > now() and i.accepted_at is null for update;
      if not found then raise exception 'invitation_unavailable'; end if;
      v_tenant := v_inv.tenant_id;
      if private.company_access_mode(v_tenant) <> 'full' then raise exception 'company_access_restricted'; end if;
      v_attempt := gen_random_uuid();
      update private.platform_invitations pi
      set delivery_state = 'sending', attempt_id = v_attempt, attempted_at = now(), attempts = pi.attempts + 1, actor_id = v_actor
      where pi.invitation_id = v_target and pi.attempts < 10
        and (pi.attempted_at is null or pi.attempted_at < now() - interval '1 minute')
        and (pi.delivery_state <> 'sending' or pi.attempted_at < now() - interval '5 minutes');
      if not found then raise exception 'invitation_retry_unavailable'; end if;
      v_after := jsonb_build_object('invitation_id', v_target, 'attempt_id', v_attempt, 'delivery_state', 'sending');

    when 'renew_invitation' then
      v_target := (p_values->>'invitation_id')::uuid;
      select i.* into v_inv from public.invitations i
      join private.platform_invitations pi on pi.invitation_id = i.id
      where i.id = v_target and i.accepted_at is null and i.expires_at <= now();
      if not found then raise exception 'invitation_unavailable'; end if;
      v_tenant := v_inv.tenant_id;
      perform pg_advisory_xact_lock(hashtextextended('platform-invite/' || v_inv.email_key, 0));
      if private.company_access_mode(v_tenant) <> 'full' then raise exception 'company_access_restricted'; end if;
      if exists (
        select 1 from public.invitations i where i.email_key = v_inv.email_key and i.id <> v_target
          and i.accepted_at is null and i.expires_at > now()
      ) then raise exception 'revoke_previous_invitation'; end if;
      update public.invitations set expires_at = now() + interval '7 days'
      where id = v_target and accepted_at is null and expires_at <= now();
      if not found then raise exception 'invitation_unavailable'; end if;
      update private.platform_invitations set delivery_state = 'pending', attempt_id = null, attempted_at = null,
        attempts = 0 where invitation_id = v_target;
      v_before := jsonb_build_object('invitation_id', v_target, 'expires_at', v_inv.expires_at);
      v_after := jsonb_build_object('invitation_id', v_target, 'expires_at', now() + interval '7 days');

    when 'revoke_invitation' then
      delete from public.invitations i
      where i.id = (p_values->>'invitation_id')::uuid and i.accepted_at is null
      returning i.id, i.tenant_id into v_target, v_tenant;
      if not found then raise exception 'invitation_unavailable'; end if;
      v_after := jsonb_build_object('invitation_id', v_target, 'revoked', true);

    when 'set_company_active' then
      select jsonb_build_object('is_active', t.is_active) into v_before
      from public.tenants t where t.id = v_tenant for update;
      if not found then raise exception 'company_not_found'; end if;
      update public.tenants t set is_active = (p_values->>'active')::boolean
      where t.id = v_tenant returning jsonb_build_object('is_active', t.is_active) into v_after;

    when 'set_member_enabled' then
      v_target := (p_values->>'user_id')::uuid;
      perform 1 from public.tenants t where t.id = v_tenant for update;
      select jsonb_build_object('user_id', p.id, 'disabled', p.disabled) into v_before
      from public.profiles p where p.id = v_target and p.tenant_id = v_tenant for update;
      if not found then raise exception 'member_not_found'; end if;
      if (p_values->>'enabled')::boolean is false then
        if exists (
          select 1 from public.profiles p where p.id = v_target and 'admin' = any(p.roles)
        ) and not exists (
          select 1 from public.profiles p where p.tenant_id = v_tenant and p.id <> v_target
            and not p.disabled and 'admin' = any(p.roles)
        ) then raise exception 'last_admin'; end if;
        if exists (
          select 1 from public.orders o where o.tenant_id = v_tenant and (
            (o.delivery_rider_id = v_target and o.status in ('delivery_assigned','out_for_delivery')) or
            (o.pickup_rider_id = v_target and o.status in ('pickup_assigned','out_for_pickup')))
        ) then raise exception 'rider_has_active_orders'; end if;
      end if;
      update public.profiles p set disabled = not (p_values->>'enabled')::boolean
      where p.id = v_target returning jsonb_build_object('user_id', p.id, 'disabled', p.disabled) into v_after;

    when 'transfer_owner' then
      v_target := (p_values->>'user_id')::uuid;
      perform 1 from public.profiles p join auth.users u on u.id = p.id
      where p.id = v_target and p.tenant_id = v_tenant and not p.disabled and 'admin' = any(p.roles)
        and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until <= now())
      for update of p;
      if not found then raise exception 'owner_must_be_active_admin'; end if;
      select to_jsonb(co) into v_before from private.company_owners co where co.tenant_id = v_tenant;
      insert into private.company_owners(tenant_id, user_id) values (v_tenant, v_target)
      on conflict (tenant_id) do update set user_id = excluded.user_id
      returning to_jsonb(company_owners) into v_after;

    when 'save_plan' then
      select to_jsonb(p) into v_before from private.platform_plans p where p.code = p_values->>'code';
      insert into private.platform_plans(code, name, available)
      values (p_values->>'code', v_name, coalesce((p_values->>'available')::boolean, true))
      on conflict (code) do update set name = excluded.name, available = excluded.available
      returning to_jsonb(platform_plans) into v_after;

    when 'save_subscription' then
      perform 1 from public.tenants t where t.id = v_tenant for update;
      if not found then raise exception 'company_not_found'; end if;
      select to_jsonb(s) into v_before from private.company_subscriptions s where s.tenant_id = v_tenant;
      if not exists (
        select 1 from private.platform_plans p
        where p.code = p_values->>'plan_code' and (p.available or p.code = v_before->>'plan_code')
      ) then raise exception 'plan_unavailable'; end if;
      insert into private.company_subscriptions(tenant_id, plan_code, state, ends_at, grace_until, closeout_until, billing_email)
      values (
        v_tenant, p_values->>'plan_code', p_values->>'state', nullif(p_values->>'ends_at', '')::timestamptz,
        nullif(p_values->>'grace_until', '')::timestamptz, nullif(p_values->>'closeout_until', '')::timestamptz,
        nullif(btrim(p_values->>'billing_email'), '')
      )
      on conflict (tenant_id) do update set plan_code = excluded.plan_code, state = excluded.state,
        ends_at = excluded.ends_at, grace_until = excluded.grace_until, closeout_until = excluded.closeout_until,
        billing_email = excluded.billing_email, updated_at = now()
      returning to_jsonb(company_subscriptions) into v_after;

    when 'record_payment' then
      insert into private.subscription_payments(tenant_id, actor_id, amount, currency, reference, paid_at)
      values (v_tenant, v_actor, (p_values->>'amount')::numeric, upper(p_values->>'currency'),
        btrim(p_values->>'reference'), (p_values->>'paid_at')::timestamptz)
      returning to_jsonb(subscription_payments) into v_after;

    when 'set_operator' then
      perform pg_advisory_xact_lock(hashtextextended('platform-operators', 0));
      perform private.require_platform_admin();
      select u.id into v_target from auth.users u
      where lower(btrim(u.email)) = lower(btrim(p_values->>'email'))
        and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until <= now());
      if not found then raise exception 'operator_verified_account_required'; end if;
      if v_target = v_actor and (p_values->>'enabled')::boolean is false then
        raise exception 'operator_cannot_disable_self';
      end if;
      select jsonb_build_object('user_id', a.user_id, 'enabled', a.enabled) into v_before
      from private.platform_admins a where a.user_id = v_target;
      insert into private.platform_admins(user_id, enabled)
      values (v_target, (p_values->>'enabled')::boolean)
      on conflict (user_id) do update set enabled = excluded.enabled
      returning jsonb_build_object('user_id', user_id, 'enabled', enabled) into v_after;

    when 'save_settings' then
      select public.platform_runtime_settings() into v_before;
      insert into private.platform_settings(operator_only_companies, booking_paused, notice)
      values ((p_values->>'operator_only_companies')::boolean, (p_values->>'booking_paused')::boolean,
        coalesce(btrim(p_values->>'notice'), ''))
      on conflict (singleton) do update set operator_only_companies = excluded.operator_only_companies,
        booking_paused = excluded.booking_paused, notice = excluded.notice
      returning to_jsonb(platform_settings) - 'singleton' into v_after;

    when 'update_issue' then
      v_target := (p_values->>'issue_id')::uuid;
      select to_jsonb(i), i.tenant_id into v_before, v_tenant
      from private.platform_issues i where i.id = v_target for update;
      if not found then raise exception 'issue_not_found'; end if;
      update private.platform_issues i set state = p_values->>'state', severity = p_values->>'severity'
      where i.id = v_target returning to_jsonb(i) into v_after;

    when 'handle_contact' then
      v_target := (p_values->>'contact_id')::uuid;
      select jsonb_build_object('id', c.id, 'handled', c.handled) into v_before
      from public.contact_messages c where c.id = v_target for update;
      if not found then raise exception 'contact_not_found'; end if;
      update public.contact_messages c set handled = (p_values->>'handled')::boolean
      where c.id = v_target returning jsonb_build_object('id', c.id, 'handled', c.handled) into v_after;

    else raise exception 'unknown_operator_action';
  end case;

  perform private.write_platform_audit(v_actor, v_tenant, p_action, v_reason, v_before, v_after);
  if p_action = 'claim_invitation' then
    return v_after || jsonb_build_object('email', v_inv.email);
  end if;
  return v_after;
end;
$$;

create function public.platform_finish_invitation(p_invitation_id uuid, p_attempt_id uuid, p_state text)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid;
  v_tenant uuid;
begin
  if p_state not in ('sent', 'failed', 'existing_account') then raise exception 'invalid_invitation_state'; end if;
  select i.tenant_id into v_tenant from public.invitations i where i.id = p_invitation_id for update;
  if not found then return false; end if;
  update private.platform_invitations pi set delivery_state = p_state
  where pi.invitation_id = p_invitation_id and pi.attempt_id = p_attempt_id and pi.delivery_state = 'sending'
  returning pi.actor_id into v_actor;
  if not found then return false; end if;
  perform private.write_platform_audit(v_actor, v_tenant, 'invitation_delivery', p_state, null,
    jsonb_build_object('invitation_id', p_invitation_id, 'attempt_id', p_attempt_id, 'state', p_state));
  return true;
end;
$$;

create function public.platform_console_snapshot(p_tenant_id uuid default null, p_search text default null)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_result jsonb;
  v_search text := nullif(left(btrim(p_search), 120), '');
begin
  perform private.require_platform_admin();
  if p_tenant_id is not null and not exists (select 1 from public.tenants t where t.id = p_tenant_id) then
    raise exception 'company_not_found';
  end if;
  select jsonb_build_object(
    'summary', jsonb_build_object(
      'companies', (select count(*) from public.tenants),
      'pending_invites', (select count(*) from public.invitations i where i.accepted_at is null and i.expires_at > now()),
      'issues', (select count(*) from private.platform_issues i where i.state <> 'resolved'),
      'overdue_pickups', (select count(*) from public.orders o where o.pickup_at < now()
        and o.status in ('delivered', 'awaiting_pickup', 'pickup_assigned', 'out_for_pickup'))
    ),
    'companies', coalesce((select jsonb_agg(to_jsonb(t) order by t.name, t.id) from (
      select t.id, t.name, t.slug, t.timezone, t.is_active, t.public_booking_enabled,
        private.company_access_mode(t.id) as access_mode,
        o.user_id as owner_id, s.plan_code, s.state as subscription_state
      from public.tenants t left join private.company_owners o on o.tenant_id = t.id
      left join private.company_subscriptions s on s.tenant_id = t.id
      where (p_tenant_id is null or t.id = p_tenant_id)
        and (v_search is null or strpos(lower(t.name), lower(v_search)) > 0 or strpos(t.slug, lower(v_search)) > 0)
      order by t.name, t.id limit 100
    ) t), '[]'::jsonb),
    'plans', coalesce((select jsonb_agg(to_jsonb(p) order by p.name, p.code) from private.platform_plans p), '[]'::jsonb),
    'settings', public.platform_runtime_settings(),
    'operators', coalesce((select jsonb_agg(jsonb_build_object(
      'user_id', a.user_id, 'email', u.email, 'enabled', a.enabled, 'created_at', a.created_at
    ) order by u.email, a.user_id) from private.platform_admins a join auth.users u on u.id = a.user_id), '[]'::jsonb),
    'members', coalesce((select jsonb_agg(to_jsonb(p)) from (
      select p.id, p.email, p.full_name, p.roles, p.disabled, p.last_login_at
      from public.profiles p where p.tenant_id = p_tenant_id order by p.full_name, p.id limit 200
    ) p), '[]'::jsonb),
    'invitations', coalesce((select jsonb_agg(to_jsonb(i)) from (
      select i.id, i.email, i.roles, i.accepted_at, i.expires_at, pi.for_owner, pi.delivery_state
      from public.invitations i left join private.platform_invitations pi on pi.invitation_id = i.id
      where i.tenant_id = p_tenant_id order by i.created_at desc, i.id limit 100
    ) i), '[]'::jsonb),
    'subscription', (select to_jsonb(s) from private.company_subscriptions s where s.tenant_id = p_tenant_id),
    'payments', coalesce((select jsonb_agg(to_jsonb(p)) from (
      select p.id, p.amount, p.currency, p.reference, p.paid_at
      from private.subscription_payments p where p.tenant_id = p_tenant_id order by p.paid_at desc, p.id limit 100
    ) p), '[]'::jsonb),
    'orders', coalesce((select jsonb_agg(to_jsonb(o)) from (
      select o.id, o.status, o.delivery_at, o.pickup_at, o.radio_channel, o.lost_radios,
        o.delivery_rider_id, o.pickup_rider_id
      from public.orders o where o.tenant_id = p_tenant_id and o.status not in ('cancelled', 'picked_up')
      order by (o.pickup_at < now() and o.status in ('delivered','awaiting_pickup','pickup_assigned','out_for_pickup')) desc nulls last,
        o.delivery_at, o.id limit 100
    ) o), '[]'::jsonb),
    'issues', coalesce((select jsonb_agg(to_jsonb(i)) from (
      select i.*, t.name as company_name from private.platform_issues i
      left join public.tenants t on t.id = i.tenant_id
      where p_tenant_id is null or i.tenant_id = p_tenant_id
      order by i.last_seen_at desc, i.id limit 100
    ) i), '[]'::jsonb),
    'contacts', coalesce((select jsonb_agg(to_jsonb(c)) from (
      select c.id, c.name, c.email, c.company, c.message, c.handled, c.created_at, c.emailed_at,
        c.email_error is not null as mail_failed
      from public.contact_messages c where p_tenant_id is null order by c.handled, c.created_at desc, c.id limit 100
    ) c), '[]'::jsonb),
    'audit', coalesce((select jsonb_agg(to_jsonb(a)) from (
      select a.id, a.actor_id, u.email as actor_email, a.tenant_id, a.action, a.reason, a.before_state, a.after_state, a.created_at
      from private.platform_audit a left join auth.users u on u.id = a.actor_id
      where p_tenant_id is null or a.tenant_id = p_tenant_id order by a.id desc limit 100
    ) a), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

-- Structured labels only. Derive scope from the signed-in user and bound reporting per account.
create function public.report_platform_issue(p_source text, p_area text, p_code text, p_build text default null)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_tenant uuid;
  v_id uuid;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if p_source is null or p_source not in ('web','flutter','backend')
     or coalesce(p_area, '') !~ '^[a-z][a-z0-9_-]{1,39}$'
     or coalesce(p_code, '') !~ '^[a-zA-Z0-9][a-zA-Z0-9_.-]{1,59}$'
     or (p_build is not null and p_build !~ '^[a-zA-Z0-9][a-zA-Z0-9.+_-]{0,39}$') then
    raise exception 'invalid_issue_fields';
  end if;
  select p.tenant_id into v_tenant from public.profiles p where p.id = v_uid and not p.disabled;
  if v_tenant is null and not exists (select 1 from private.platform_admins a where a.user_id = v_uid and a.enabled) then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  insert into private.platform_report_limit as r (user_id, window_start, reports)
  values (v_uid, now(), 1)
  on conflict (user_id) do update set
    reports = case when r.window_start <= now() - interval '1 minute' then 1 else r.reports + 1 end,
    window_start = case when r.window_start <= now() - interval '1 minute' then now() else r.window_start end
  where r.window_start <= now() - interval '1 minute' or r.reports < 20;
  if not found then return null; end if;

  insert into private.platform_issues as i (tenant_id, source, area, code, build)
  values (v_tenant, p_source, p_area, p_code, p_build)
  on conflict (tenant_id, source, area, code, build) do update set
    occurrences = i.occurrences + 1, last_seen_at = now(),
    state = case when i.state = 'resolved' then 'open' else i.state end
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on table private.platform_admins, private.platform_settings, private.company_owners,
  private.platform_plans, private.company_subscriptions, private.subscription_payments,
  private.platform_audit, private.platform_invitations, private.platform_issues, private.platform_report_limit
from public, anon, authenticated, service_role;

revoke all on function private.require_platform_admin(), private.company_access_mode(uuid),
  private.write_platform_audit(uuid, uuid, text, text, jsonb, jsonb),
  private.new_platform_invitation(uuid, uuid, text, public.app_role[], boolean) from public, anon, authenticated;

revoke all on function public.platform_operator_status(), public.platform_runtime_settings(),
  public.platform_company_access(), public.platform_console_action(text, jsonb),
  public.platform_console_snapshot(uuid, text), public.report_platform_issue(text, text, text, text),
  public.platform_finish_invitation(uuid, uuid, text) from public, anon, authenticated, service_role;

grant execute on function public.platform_operator_status(), public.platform_company_access(),
  public.platform_console_action(text, jsonb), public.platform_console_snapshot(uuid, text),
  public.report_platform_issue(text, text, text, text) to authenticated;
grant execute on function public.platform_runtime_settings() to anon, authenticated;
grant execute on function public.platform_finish_invitation(uuid, uuid, text) to service_role;
