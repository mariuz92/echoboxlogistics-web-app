-- =============================================================================
-- Row Level Security and privileges
--
-- Model:
--   * every row belongs to exactly one tenant; users only ever see their tenant
--   * admins manage everything in their tenant
--   * riders can read the orders they are involved in (plus unassigned pickups)
--     and act on them ONLY through the order action RPCs
--   * the anon role can reach nothing except the public booking RPCs
-- =============================================================================

alter table public.tenants      enable row level security;
alter table public.profiles     enable row level security;
alter table public.guides       enable row level security;
alter table public.invitations  enable row level security;
alter table public.orders       enable row level security;
alter table public.order_events enable row level security;

-- Start from zero privileges, then grant exactly what is needed.
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

grant usage on schema private to authenticated;
grant execute on function
  private.current_tenant_id(),
  private.is_admin(),
  private.is_rider()
to authenticated;

-- created_by defaults to the caller.
alter table public.orders alter column created_by set default auth.uid();

-- -----------------------------------------------------------------------------
-- tenants
-- -----------------------------------------------------------------------------
grant select on public.tenants to authenticated;
grant update (name, description, domain, timezone, radio_channels_total,
              disabled_channels, public_booking_enabled)
  on public.tenants to authenticated;

create policy tenants_select on public.tenants
  for select to authenticated
  using (id = (select private.current_tenant_id()));

create policy tenants_update_admin on public.tenants
  for update to authenticated
  using (id = (select private.current_tenant_id()) and (select private.is_admin()))
  with check (id = (select private.current_tenant_id()) and (select private.is_admin()));

-- -----------------------------------------------------------------------------
-- profiles (privileged columns - roles, disabled, tenant_id - can only be
-- changed through public.update_member / bootstrap_profile)
-- -----------------------------------------------------------------------------
grant select on public.profiles to authenticated;
grant update (full_name, phone, avatar_url) on public.profiles to authenticated;

create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or (tenant_id = (select private.current_tenant_id()) and (select private.is_admin()))
  );

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- guides (admin only)
-- -----------------------------------------------------------------------------
grant select, insert, update, delete on public.guides to authenticated;

create policy guides_admin_all on public.guides
  for all to authenticated
  using (tenant_id = (select private.current_tenant_id()) and (select private.is_admin()))
  with check (tenant_id = (select private.current_tenant_id()) and (select private.is_admin()));

-- -----------------------------------------------------------------------------
-- invitations (rows are created by the invite-member Edge Function with the
-- service role; admins can read and revoke them)
-- -----------------------------------------------------------------------------
grant select, delete on public.invitations to authenticated;

create policy invitations_select_admin on public.invitations
  for select to authenticated
  using (tenant_id = (select private.current_tenant_id()) and (select private.is_admin()));

create policy invitations_delete_admin on public.invitations
  for delete to authenticated
  using (tenant_id = (select private.current_tenant_id()) and (select private.is_admin()));

-- -----------------------------------------------------------------------------
-- orders
-- -----------------------------------------------------------------------------
grant select, insert, update, delete on public.orders to authenticated;

create policy orders_select on public.orders
  for select to authenticated
  using (
    tenant_id = (select private.current_tenant_id())
    and (
      (select private.is_admin())
      or (
        (select private.is_rider())
        and (
          delivery_rider_id = (select auth.uid())
          or pickup_rider_id = (select auth.uid())
          or status = 'awaiting_pickup'
        )
      )
    )
  );

create policy orders_insert_admin on public.orders
  for insert to authenticated
  with check (
    tenant_id = (select private.current_tenant_id())
    and (select private.is_admin())
    and source = 'dashboard'
    and (created_by is null or created_by = (select auth.uid()))
  );

create policy orders_update_admin on public.orders
  for update to authenticated
  using (tenant_id = (select private.current_tenant_id()) and (select private.is_admin()))
  with check (tenant_id = (select private.current_tenant_id()) and (select private.is_admin()));

create policy orders_delete_admin on public.orders
  for delete to authenticated
  using (tenant_id = (select private.current_tenant_id()) and (select private.is_admin()));

-- -----------------------------------------------------------------------------
-- order_events (read-only for admins; written by SECURITY DEFINER triggers)
-- -----------------------------------------------------------------------------
grant select on public.order_events to authenticated;

create policy order_events_select_admin on public.order_events
  for select to authenticated
  using (tenant_id = (select private.current_tenant_id()) and (select private.is_admin()));

-- -----------------------------------------------------------------------------
-- Realtime: the dashboard subscribes to order changes (RLS is applied to the
-- change stream, so each client only receives rows it is allowed to read).
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.orders;
  end if;
end $$;
