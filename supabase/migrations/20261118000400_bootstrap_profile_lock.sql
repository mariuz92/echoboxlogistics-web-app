-- =============================================================================
-- bootstrap_profile(): make concurrent first-login calls safe.
--
-- Without the advisory lock two simultaneous calls for the same brand-new user both
-- saw "no profile yet" and both tried to insert it; the loser failed with a
-- duplicate-key error (seen as "invitation invalid" on the /join page).
-- Found by the browser tests (e2e/team.spec.ts).
-- =============================================================================

create or replace function public.bootstrap_profile()
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
