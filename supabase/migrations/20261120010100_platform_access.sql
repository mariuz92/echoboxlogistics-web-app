create function private.complete_platform_profile(p_explicit boolean)
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
  v_platform  private.platform_invitations;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  -- The app can call this from several places at once right after a first sign-in
  -- (user provider, auth check, join page). Serialise per user so the second caller
  -- waits, then simply finds the profile the first one created.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_uid::text, 0));

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
  order by exists (
    select 1 from private.platform_invitations pi where pi.invitation_id = i.id
  ) desc, i.created_at desc, i.id
  limit 1
  for update;

  if found then
    if private.company_access_mode(v_inv.tenant_id) <> 'full' then
      raise exception 'company_access_restricted';
    end if;
    select * into v_platform from private.platform_invitations pi where pi.invitation_id = v_inv.id;
    if found and not p_explicit then raise exception 'invitation_pending'; end if;
    if v_platform.invitation_id is not null and coalesce(v_user.encrypted_password, '') = '' then
      raise exception 'invitation_password_required';
    end if;
    insert into public.profiles (id, tenant_id, email, full_name, phone, roles)
    values (
      v_uid, v_inv.tenant_id, v_user.email,
      coalesce(v_name, nullif(btrim(v_inv.full_name), ''), split_part(v_user.email, '@', 1)),
      v_phone, v_inv.roles)
    returning * into v_profile;

    update public.invitations set accepted_at = now() where id = v_inv.id;
    if v_platform.for_owner then
      insert into private.company_owners(tenant_id, user_id) values (v_inv.tenant_id, v_uid);
    end if;
    if v_platform.invitation_id is not null then
      perform private.write_platform_audit(v_uid, v_inv.tenant_id, 'invitation_accepted',
        'Verified company invitation', null, jsonb_build_object('invitation_id', v_inv.id, 'user_id', v_uid));
    end if;
    return v_profile;
  end if;

  if p_explicit then raise exception 'invitation_unavailable'; end if;
  if (public.platform_runtime_settings()->>'operator_only_companies')::boolean then
    raise exception 'invitation_required';
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

create or replace function public.bootstrap_profile()
returns public.profiles
language sql security definer set search_path = ''
as $$ select private.complete_platform_profile(false); $$;

create function public.accept_platform_invitation()
returns public.profiles
language sql security definer set search_path = ''
as $$ select private.complete_platform_profile(true); $$;

create function public.platform_pending_invitation()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('company', t.name, 'full_name', i.full_name)
  from auth.users u
  join public.invitations i on i.email_key = lower(btrim(u.email))
  join private.platform_invitations pi on pi.invitation_id = i.id
  join public.tenants t on t.id = i.tenant_id
  where u.id = auth.uid() and u.email_confirmed_at is not null
    and i.accepted_at is null and i.expires_at > now() and private.company_access_mode(t.id) = 'full'
    and not exists (select 1 from public.profiles p where p.id = u.id)
  order by i.created_at desc, i.id limit 1;
$$;

create function private.protect_company_owner()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if exists (select 1 from private.company_owners co where co.user_id = old.id) then
    if tg_op = 'DELETE' then raise exception 'transfer_company_owner_first'; end if;
    if new.disabled or not ('admin' = any(new.roles)) or new.tenant_id <> old.tenant_id then
      raise exception 'transfer_company_owner_first';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger protect_company_owner
before update of roles, disabled, tenant_id or delete on public.profiles
for each row execute function private.protect_company_owner();

create or replace function private.current_tenant_id()
returns uuid
language sql stable security definer set search_path = ''
as $$
  select p.tenant_id from public.profiles p where p.id = auth.uid() and not p.disabled
    and private.company_access_mode(p.tenant_id) <> 'suspended';
$$;

create or replace function private.is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid()
    and p.tenant_id = private.current_tenant_id() and 'admin' = any(p.roles));
$$;

create or replace function private.is_rider()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid()
    and p.tenant_id = private.current_tenant_id() and 'rider' = any(p.roles));
$$;

create or replace function public.touch_login()
returns void
language sql security definer set search_path = ''
as $$
  update public.profiles set last_login_at = now()
  where id = auth.uid() and private.current_tenant_id() is not null;
$$;

-- Prevent Data API table writes during closeout and read-only access. Existing tenant
-- policies continue to govern reads and role-based access.
do $$
declare table_name text;
begin
  foreach table_name in array array['orders', 'guides'] loop
    execute format('create policy platform_insert_access on public.%I as restrictive for insert to authenticated
      with check ((select public.platform_company_access()) = ''full'')', table_name);
    execute format('create policy platform_delete_access on public.%I as restrictive for delete to authenticated
      using ((select public.platform_company_access()) = ''full'')', table_name);
  end loop;
  foreach table_name in array array['orders', 'guides', 'tenants', 'profiles'] loop
    execute format('create policy platform_update_access on public.%I as restrictive for update to authenticated
      using ((select public.platform_company_access()) = ''full'')
      with check ((select public.platform_company_access()) = ''full'')', table_name);
  end loop;
end;
$$;

create function private.platform_can_revoke_invite(p_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.platform_company_access() = 'full'
    and not exists (select 1 from private.platform_invitations pi where pi.invitation_id = p_id);
$$;

create policy platform_invitation_delete_access on public.invitations as restrictive
for delete to authenticated using (private.platform_can_revoke_invite(id));

-- The invite-member Edge Function writes with service_role. Enforce access on
-- the database even when the public table policy is bypassed.
create function private.check_invite_company_access()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if auth.jwt()->>'role' = 'service_role' and exists (
      select 1 from private.platform_invitations pi where pi.invitation_id = old.id
    ) then raise exception 'operator_invitation_protected' using errcode = '42501'; end if;
    return old;
  end if;
  if private.company_access_mode(new.tenant_id) <> 'full' then
    raise exception 'company_access_restricted' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger platform_invitation_write_access before insert or delete on public.invitations
for each row execute function private.check_invite_company_access();

alter function public.update_member(uuid, text, text, public.app_role[], boolean) set schema private;
alter function public.assign_order(uuid, text, uuid) set schema private;
alter function public.admin_set_status(uuid, public.order_status) set schema private;
alter function public.rider_order_action(uuid, text, integer) set schema private;
alter function public.create_public_order(text, text, text, text, integer, timestamptz, text, timestamptz, text, text) set schema private;

revoke all on function private.complete_platform_profile(boolean), private.protect_company_owner(),
  private.check_invite_company_access(), private.platform_can_revoke_invite(uuid),
  private.update_member(uuid, text, text, public.app_role[], boolean), private.assign_order(uuid, text, uuid),
  private.admin_set_status(uuid, public.order_status), private.rider_order_action(uuid, text, integer),
  private.create_public_order(text, text, text, text, integer, timestamptz, text, timestamptz, text, text)
from public, anon, authenticated, service_role;

grant execute on function private.platform_can_revoke_invite(uuid) to authenticated;

create function public.update_member(
  p_user_id uuid, p_full_name text default null, p_phone text default null,
  p_roles public.app_role[] default null, p_disabled boolean default null
)
returns public.profiles
language plpgsql security definer set search_path = ''
as $$
begin
  if public.platform_company_access() <> 'full' then raise exception 'company_access_restricted' using errcode = '42501'; end if;
  return private.update_member(p_user_id, p_full_name, p_phone, p_roles, p_disabled);
end;
$$;

create function private.require_order_access(p_order uuid, p_allow_closeout boolean)
returns void
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_mode text := public.platform_company_access();
begin
  if v_mode = 'full' then return; end if;
  if v_mode = 'closeout' and p_allow_closeout and exists (
    select 1 from public.orders o where o.id = p_order and o.tenant_id = private.current_tenant_id()
      and o.status not in ('received', 'picked_up', 'cancelled')
  ) then return; end if;
  raise exception 'company_access_restricted' using errcode = '42501';
end;
$$;

create function public.assign_order(p_order_id uuid, p_leg text, p_rider_id uuid)
returns public.orders
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.require_order_access(p_order_id, true);
  return private.assign_order(p_order_id, p_leg, p_rider_id);
end;
$$;

create function public.admin_set_status(p_order_id uuid, p_status public.order_status)
returns public.orders
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.require_order_access(p_order_id, p_status <> 'received');
  return private.admin_set_status(p_order_id, p_status);
end;
$$;

create function public.rider_order_action(p_order_id uuid, p_action text, p_lost integer default null)
returns public.orders
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.require_order_access(p_order_id, true);
  return private.rider_order_action(p_order_id, p_action, p_lost);
end;
$$;

create or replace function public.get_public_tenant(p_slug text)
returns table (name text, slug text, timezone text, accepting_bookings boolean)
language sql stable security definer set search_path = ''
as $$
  select t.name, t.slug, t.timezone, t.public_booking_enabled and private.company_access_mode(t.id) = 'full'
    and not (public.platform_runtime_settings()->>'booking_paused')::boolean
  from public.tenants t where t.slug = lower(btrim(p_slug)) limit 1;
$$;

create function public.create_public_order(
  p_slug text, p_guide_name text, p_guide_phone text, p_guide_email text,
  p_radios_count integer, p_delivery_at timestamptz, p_delivery_address text,
  p_pickup_at timestamptz default null, p_pickup_address text default null, p_notes text default null
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
begin
  if not coalesce((select b.accepting_bookings from public.get_public_tenant(p_slug) b), false) then
    raise exception 'booking_unavailable';
  end if;
  return private.create_public_order(p_slug, p_guide_name, p_guide_phone, p_guide_email,
    p_radios_count, p_delivery_at, p_delivery_address, p_pickup_at, p_pickup_address, p_notes);
end;
$$;

revoke all on function private.require_order_access(uuid, boolean) from public, anon, authenticated, service_role;
revoke all on function public.accept_platform_invitation(), public.platform_pending_invitation(),
  public.update_member(uuid, text, text, public.app_role[], boolean), public.assign_order(uuid, text, uuid),
  public.admin_set_status(uuid, public.order_status), public.rider_order_action(uuid, text, integer),
  public.create_public_order(text, text, text, text, integer, timestamptz, text, timestamptz, text, text)
from public, anon, authenticated, service_role;

grant execute on function public.accept_platform_invitation(), public.platform_pending_invitation(),
  public.update_member(uuid, text, text, public.app_role[], boolean), public.assign_order(uuid, text, uuid),
  public.admin_set_status(uuid, public.order_status), public.rider_order_action(uuid, text, integer) to authenticated;
grant execute on function
  public.create_public_order(text, text, text, text, integer, timestamptz, text, timestamptz, text, text) to anon, authenticated;
