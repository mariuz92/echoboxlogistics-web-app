-- Run against the EchoBox database after all application migrations.
-- Produces counts and tenant IDs without returning contact details or credentials.
begin isolation level repeatable read read only;

select relation, row_count
from (
  select 'auth.users' as relation, count(*) as row_count from auth.users
  union all select 'auth.identities', count(*) from auth.identities
  union all select 'public.tenants', count(*) from public.tenants
  union all select 'public.profiles', count(*) from public.profiles
  union all select 'public.guides', count(*) from public.guides
  union all select 'public.invitations', count(*) from public.invitations
  union all select 'public.orders', count(*) from public.orders
  union all select 'public.order_events', count(*) from public.order_events
  union all select 'public.contact_messages', count(*) from public.contact_messages
) counts
order by relation;

select t.id as tenant_id,
       (select count(*) from public.profiles p where p.tenant_id = t.id) as profiles,
       (select count(*) from public.guides g where g.tenant_id = t.id) as guides,
       (select count(*) from public.invitations i where i.tenant_id = t.id) as invitations,
       (select count(*) from public.orders o where o.tenant_id = t.id) as orders,
       (select count(*) from public.order_events e where e.tenant_id = t.id) as order_events
from public.tenants t
order by t.id;

select tenant_id, status, source, count(*) as orders,
       sum(radios_count) as radios, sum(balance) as balance
from public.orders
group by tenant_id, status, source
order by tenant_id, status, source;

with open_windows as materialized (
  select o.id, o.tenant_id, o.radio_channel,
         private.channel_window(o.delivery_at, o.pickup_at, t.timezone) as occupied
  from public.orders o
  join public.tenants t on t.id = o.tenant_id
  where o.status not in ('picked_up', 'cancelled')
    and o.radio_channel is not null and t.channels_exclusive
    and exists (select 1 from pg_timezone_names z where z.name = t.timezone)
), open_slots as (
  select occupied,
         max(upper(occupied)) over (
           partition by tenant_id, radio_channel order by lower(occupied), id
           rows between unbounded preceding and 1 preceding
         ) as prior_end
  from open_windows
), checks as (
  select 'active_company_without_verified_admin' as check_name, count(*) as affected
  from public.tenants t
  where t.is_active and not exists (
    select 1 from public.profiles p join auth.users u on u.id = p.id
    where p.tenant_id = t.id and 'admin' = any (p.roles) and not p.disabled
      and u.email is not null and u.email_confirmed_at is not null
      and (u.banned_until is null or u.banned_until <= now())
  )
  union all
  select 'invalid_company_timezone', count(*) from public.tenants t
  where not exists (select 1 from pg_timezone_names z where z.name = t.timezone)
  union all
  select 'invalid_company_disabled_channel_list', count(*) from public.tenants t
  where t.disabled_channels is distinct from array(
    select distinct channel from unnest(t.disabled_channels) as disabled(channel)
    where channel between t.channel_min and t.channel_max order by channel
  )
  union all
  select 'profile_email_differs_from_auth', count(*)
  from public.profiles p join auth.users u on u.id = p.id
  where lower(btrim(p.email)) is distinct from lower(btrim(u.email))
  union all
  select 'profile_without_auth_sign_in_identity_review', count(*) from public.profiles p
  where not exists (select 1 from auth.identities i where i.user_id = p.id)
  union all
  select 'confirmed_auth_user_without_profile_review', count(*) from auth.users u
  where u.email_confirmed_at is not null
    and not exists (select 1 from public.profiles p where p.id = u.id)
  union all
  select 'pending_invite_email_in_multiple_companies', count(*)
  from (
    select email_key from public.invitations
    where accepted_at is null and expires_at > now()
    group by email_key having count(distinct tenant_id) > 1
  ) ambiguous_invites
  union all
  select 'active_invite_for_user_with_existing_profile_review', count(*)
  from public.invitations i
  where i.accepted_at is null and i.expires_at > now() and exists (
    select 1 from auth.users u join public.profiles p on p.id = u.id
    where lower(btrim(u.email)) = i.email_key
  )
  union all
  select 'invitation_links_to_another_company', count(*)
  from public.invitations i join public.profiles p on p.id = i.invited_by
  where p.tenant_id <> i.tenant_id
  union all
  select 'order_links_to_another_company', count(*)
  from public.orders o
  left join public.guides g on g.id = o.guide_id
  left join public.profiles delivery on delivery.id = o.delivery_rider_id
  left join public.profiles pickup on pickup.id = o.pickup_rider_id
  left join public.profiles creator on creator.id = o.created_by
  where g.tenant_id <> o.tenant_id or delivery.tenant_id <> o.tenant_id
     or pickup.tenant_id <> o.tenant_id or creator.tenant_id <> o.tenant_id
  union all
  select 'assigned_order_without_usable_rider', count(*)
  from public.orders o
  where (o.status in ('delivery_assigned', 'out_for_delivery')
      or o.status in ('pickup_assigned', 'out_for_pickup'))
    and not exists (
      select 1 from public.profiles p join auth.users u on u.id = p.id
      where p.id = case when o.status in ('delivery_assigned', 'out_for_delivery')
                         then o.delivery_rider_id else o.pickup_rider_id end
        and p.tenant_id = o.tenant_id and 'rider' = any (p.roles) and not p.disabled
        and u.email is not null and u.email_confirmed_at is not null
        and (u.banned_until is null or u.banned_until <= now())
    )
  union all
  select 'pickup_workflow_missing_time_or_address', count(*) from public.orders
  where status in ('awaiting_pickup', 'pickup_assigned', 'out_for_pickup')
    and (pickup_at is null or nullif(btrim(pickup_address), '') is null)
  union all
  select 'order_lifecycle_timestamp_or_lost_count_review', count(*) from public.orders
  where picked_up_at < delivered_at or lost_radios > radios_count::bigint + extra_radios
     or (status in ('delivered', 'awaiting_pickup', 'pickup_assigned', 'out_for_pickup', 'picked_up')
         and delivered_at is null)
     or (status = 'picked_up' and picked_up_at is null)
  union all
  select 'open_order_channel_disabled_or_out_of_range', count(*)
  from public.orders o join public.tenants t on t.id = o.tenant_id
  where o.status not in ('picked_up', 'cancelled')
    and (o.radio_channel not between t.channel_min and t.channel_max
         or o.radio_channel = any (t.disabled_channels))
  union all
  select 'open_order_overlaps_an_earlier_exclusive_channel_window', count(*)
  from open_slots where lower(occupied) < prior_end
  union all
  select 'order_without_creation_event_review', count(*) from public.orders o
  where not exists (
    select 1 from public.order_events e
    where e.order_id = o.id and e.tenant_id = o.tenant_id and e.event_type = 'created'
  )
  union all
  select 'cancelled_order_without_prior_status_review', count(*) from public.orders o
  where o.status = 'cancelled' and not exists (
    select 1 from public.order_events e
    where e.order_id = o.id and e.tenant_id = o.tenant_id
      and e.to_status = 'cancelled' and e.from_status is not null
  )
  union all
  select 'orders_missing_from_realtime_publication', count(*)
  where not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orders'
  )
  union all
  select 'missing_edge_function_table_privileges', count(*)
  from (values
    ('public.invitations', 'SELECT'), ('public.invitations', 'INSERT'), ('public.invitations', 'DELETE'),
    ('public.contact_messages', 'SELECT'), ('public.contact_messages', 'INSERT'), ('public.contact_messages', 'UPDATE')
  ) required(relation, privilege)
  where not has_table_privilege('service_role', relation, privilege)
)
select check_name, affected from checks order by check_name;

commit;
