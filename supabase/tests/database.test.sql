-- =============================================================================
-- Database tests (pgTAP).  Run with:  supabase test db
--
-- Covers tenant isolation (RLS), column privileges, the order state machine,
-- radio-channel conflicts on time windows, onboarding (bootstrap_profile), member management
-- and the public booking RPC. Everything runs inside a transaction that is
-- rolled back. Relies on the demo data in supabase/seed.sql for the main tenant.
-- =============================================================================

begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

create schema tests;
grant usage on schema tests to anon, authenticated;

create function tests.login_as(p_uid uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  set local role authenticated;
end $$;

create function tests.login_anon()
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', 'anon', true);
  set local role anon;
end $$;

create function tests.logout()
returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
end $$;

grant execute on all functions in schema tests to anon, authenticated;

-- Fixture ids -----------------------------------------------------------------
-- demo tenant (from seed): admin 1111..., rider1 2222..., rider2 3333...
-- second tenant (created here): admin 4444...
create temp table ids as select
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid as demo,
  '11111111-1111-4111-8111-111111111111'::uuid as admin1,
  '22222222-2222-4222-8222-222222222222'::uuid as rider1,
  '33333333-3333-4333-8333-333333333333'::uuid as rider2,
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid as other,
  '44444444-4444-4444-8444-444444444444'::uuid as admin2,
  'c0000000-0000-4000-8000-000000000001'::uuid as o1,
  'c0000000-0000-4000-8000-000000000002'::uuid as o2,
  'c0000000-0000-4000-8000-000000000003'::uuid as o_other;
grant select on ids to anon, authenticated;

-- Second tenant with its own admin and one order.
insert into public.tenants (id, name, slug) values
  ((select other from ids), 'Other Co', 'other-co');

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', (select admin2 from ids),
        'authenticated', 'authenticated', 'admin2@other.test', now(),
        '{}', '{}', now(), now());

insert into public.profiles (id, tenant_id, email, full_name, roles)
values ((select admin2 from ids), (select other from ids), 'admin2@other.test',
        'Other Admin', array['admin']::public.app_role[]);

select set_config('app.order_actions', 'on', true);

insert into public.orders (id, tenant_id, guide_name, delivery_at, delivery_address)
values ((select o_other from ids), (select other from ids), 'Other Guide',
        now() + interval '1 day', 'Via Roma 1');

-- o1: full lifecycle order on channel 10 with a pickup planned.
insert into public.orders (id, tenant_id, guide_name, radio_channel, radios_count,
                           delivery_at, delivery_address, pickup_at, pickup_address)
values ((select o1 from ids), (select demo from ids), 'Test Guide', 10, 20,
        now() + interval '1 hour', 'Colosseo, Roma',
        now() + interval '5 hours', 'Colosseo, Roma');

-- o2: delivered, but no pickup planned yet.
insert into public.orders (id, tenant_id, guide_name, radio_channel, radios_count,
                           delivery_at, delivery_address, status, delivery_rider_id)
values ((select o2 from ids), (select demo from ids), 'No Pickup Guide', 11, 10,
        now() - interval '2 hours', 'Pantheon, Roma', 'delivered',
        (select rider1 from ids));

select set_config('app.order_actions', 'off', true);

-- =============================================================================
-- 1. Anonymous access
-- =============================================================================
select tests.login_anon();

select throws_ok($$select * from public.orders$$, '42501', null,
  'anon cannot read orders');
select throws_ok($$select * from public.tenants$$, '42501', null,
  'anon cannot read tenants');
select throws_ok($$select * from public.profiles$$, '42501', null,
  'anon cannot read profiles');
select throws_ok($$select * from public.get_dashboard_stats(current_date)$$, '42501', null,
  'anon cannot call dashboard stats');

select is((select accepting_bookings from public.get_public_tenant('echobox-demo')), true,
  'anon can resolve a public tenant by slug');
select is((select count(*)::int from public.get_public_tenant('does-not-exist')), 0,
  'unknown slug returns nothing');

select lives_ok($$select public.create_public_order(
  'echobox-demo', 'Public Guide', '+39 351 000 0001', 'public@example.com', 12,
  now() + interval '2 days', 'Piazza Navona, Roma')$$,
  'anon can create a public order');

select throws_ok($$select public.create_public_order(
  'echobox-demo', 'Public Guide', '12', null, 12,
  now() + interval '2 days', 'Piazza Navona, Roma')$$,
  'P0001', 'invalid_phone', 'public order rejects an invalid phone');

select throws_ok($$select public.create_public_order(
  'echobox-demo', 'Public Guide', '+39 351 000 0001', null, 0,
  now() + interval '2 days', 'Piazza Navona, Roma')$$,
  'P0001', 'invalid_radios_count', 'public order rejects zero radios');

select throws_ok($$select public.create_public_order(
  'echobox-demo', 'Public Guide', '+39 351 000 0001', null, 5,
  now() - interval '3 days', 'Piazza Navona, Roma')$$,
  'P0001', 'invalid_delivery_time', 'public order rejects delivery in the past');

select throws_ok($$select public.create_public_order(
  'nope', 'Public Guide', '+39 351 000 0001', null, 5,
  now() + interval '2 days', 'Piazza Navona, Roma')$$,
  'P0001', 'booking_unavailable', 'public order rejects an unknown tenant');

-- 1 order already created above for this phone; 4 more are allowed, the 6th is not.
select lives_ok($$select public.create_public_order('echobox-demo','Public Guide','+39 351 000 0001',null,5,now()+interval '3 days','Via A')$$, 'public order 2');
select lives_ok($$select public.create_public_order('echobox-demo','Public Guide','+39 351 000 0001',null,5,now()+interval '3 days','Via B')$$, 'public order 3');
select lives_ok($$select public.create_public_order('echobox-demo','Public Guide','+39 351 000 0001',null,5,now()+interval '3 days','Via C')$$, 'public order 4');
select lives_ok($$select public.create_public_order('echobox-demo','Public Guide','+39 351 000 0001',null,5,now()+interval '3 days','Via D')$$, 'public order 5');
select throws_ok($$select public.create_public_order('echobox-demo','Public Guide','+39 351 000 0001',null,5,now()+interval '3 days','Via E')$$,
  'P0001', 'too_many_requests', 'public orders are throttled per phone');

select tests.logout();

select is((select count(*)::int from public.guides
           where tenant_id = (select demo from ids) and phone_digits = '393510000001'), 1,
  'repeated public orders reuse a single guide contact');
select is((select count(*)::int from public.orders
           where source = 'public_form' and status = 'received'
             and tenant_id = (select demo from ids) and guide_phone = '+39 351 000 0001'), 5,
  'public orders are stored as received / public_form');

-- =============================================================================
-- 2. Tenant isolation and column privileges
-- =============================================================================
select tests.login_as((select admin1 from ids));

select is((select count(*)::int from public.orders where tenant_id <> (select demo from ids)), 0,
  'demo admin sees no foreign orders');
select ok((select count(*) from public.orders) >= 90, 'demo admin sees own tenant orders');
select is((select count(*)::int from public.tenants), 1, 'admin sees exactly one tenant');
select is((select count(*)::int from public.profiles where tenant_id <> (select demo from ids)), 0,
  'admin sees no foreign profiles');

select throws_ok($$insert into public.orders (tenant_id, guide_name, delivery_at, delivery_address)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Sneaky', now(), 'x')$$,
  '42501', null, 'admin cannot insert orders into another tenant');

select lives_ok($$update public.orders set notes = 'hacked'
  where id = 'c0000000-0000-4000-8000-000000000003'$$,
  'updating another tenant''s order is silently filtered by RLS');

select throws_ok($$update public.orders set status = 'picked_up'
  where id = 'c0000000-0000-4000-8000-000000000001'$$,
  '42501', null, 'status cannot be changed with a plain UPDATE');

select throws_ok($$update public.orders set delivery_rider_id = '33333333-3333-4333-8333-333333333333'
  where id = 'c0000000-0000-4000-8000-000000000001'$$,
  '42501', null, 'riders cannot be set with a plain UPDATE');

select throws_ok($$insert into public.orders (tenant_id, guide_name, delivery_at, delivery_address, status)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Sneaky', now(), 'x', 'picked_up')$$,
  '42501', null, 'orders cannot be created in a non-initial status');

select throws_ok($$update public.profiles set roles = '{admin}' where id = '22222222-2222-4222-8222-222222222222'$$,
  '42501', null, 'roles cannot be changed with a plain UPDATE (even by admins)');

select lives_ok($$update public.orders set notes = 'edited by admin'
  where id = 'c0000000-0000-4000-8000-000000000001'$$, 'admin can edit plain order fields');

select tests.logout();

select is((select notes from public.orders where id = (select o_other from ids)), null,
  'the other tenant''s order was not modified');
select is((select notes from public.orders where id = (select o1 from ids)), 'edited by admin',
  'the admin''s own order was modified');

-- =============================================================================
-- 3. Radio channels (any range; a channel is busy from delivery to pickup)
-- =============================================================================
-- o1 holds channel 10 from now()+1h to now()+5h.
select throws_ok($$insert into public.orders (tenant_id, guide_name, radio_channel, delivery_at, delivery_address, pickup_at, pickup_address)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Overlap', 10, now() + interval '2 hours', 'x', now() + interval '3 hours', 'x')$$,
  '23P01', 'channel_busy', 'a channel cannot serve two groups at the same time');

select lives_ok($$insert into public.orders (tenant_id, guide_name, radio_channel, delivery_at, delivery_address)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Another day', 10, now() + interval '9 days', 'x')$$,
  'the same channel can serve another group on another day');

select throws_ok($$insert into public.orders (tenant_id, guide_name, radio_channel, delivery_at, delivery_address)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Range', 99, now() + interval '9 days', 'x')$$,
  '23514', 'channel_out_of_range', 'a channel outside the configured range is rejected');

update public.tenants set disabled_channels = array[20, 20, 500] where id = (select demo from ids);
select is((select disabled_channels from public.tenants where id = (select demo from ids)), array[20],
  'disabled channels are kept unique and inside the range');

select throws_ok($$insert into public.orders (tenant_id, guide_name, radio_channel, delivery_at, delivery_address)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Disabled', 20, now() + interval '9 days', 'x')$$,
  '23514', 'channel_disabled', 'a disabled channel cannot be used');

select throws_ok($$update public.tenants set channel_max = 5 where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$,
  '23514', 'channel_used_by_open_order', 'the range cannot drop a channel an open order uses');

select throws_ok($$update public.tenants set channel_min = 1, channel_max = 10001 where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$,
  '23514', null, 'at most 10,000 channels');

select tests.login_as((select admin1 from ids));
select ok(not (10 = any (public.free_channels(now() + interval '2 hours', now() + interval '3 hours', null, 200))),
  'channel 10 is not suggested while o1 uses it');
select ok(10 = any (public.free_channels(now() + interval '2 hours', now() + interval '3 hours', (select o1 from ids), 200)),
  'the order being edited keeps its own channel among the suggestions');
select ok(not (20 = any (public.free_channels(now() + interval '2 hours', now() + interval '3 hours', null, 200))),
  'disabled channels are never suggested');
select is((select count(*)::int from public.get_channel_board(now(), now() + interval '6 hours') where channel = 10), 1,
  'the channel board shows channel 10 in use now');
select tests.logout();

-- Shared channels: overlapping groups are allowed, and exclusivity cannot come back
-- while they exist.
update public.tenants set channels_exclusive = false where id = (select demo from ids);
select lives_ok($$insert into public.orders (tenant_id, guide_name, radio_channel, delivery_at, delivery_address, pickup_at, pickup_address)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Shared', 10, now() + interval '2 hours', 'x', now() + interval '3 hours', 'x')$$,
  'shared channels: two groups may use the same channel at the same time');
select throws_ok($$update public.tenants set channels_exclusive = true where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$,
  '23P01', 'channel_conflicts_exist', 'channels cannot become exclusive while groups share one');
delete from public.orders where guide_name = 'Shared';
update public.tenants set channels_exclusive = true where id = (select demo from ids);

-- A company with a single channel can still run tours back to back.
insert into public.tenants (id, name, slug, channel_min, channel_max)
values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'One Channel Co', 'one-channel-co', 1, 1);
select lives_ok($$insert into public.orders (tenant_id, guide_name, radio_channel, delivery_at, delivery_address, pickup_at, pickup_address)
  values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'Morning', 1, now() + interval '1 day', 'x', now() + interval '1 day 3 hours', 'x')$$,
  'one channel: morning tour');
select lives_ok($$insert into public.orders (tenant_id, guide_name, radio_channel, delivery_at, delivery_address, pickup_at, pickup_address)
  values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'Afternoon', 1, now() + interval '1 day 4 hours', 'x', now() + interval '1 day 7 hours', 'x')$$,
  'one channel: afternoon tour on the same channel');
select throws_ok($$insert into public.orders (tenant_id, guide_name, radio_channel, delivery_at, delivery_address, pickup_at, pickup_address)
  values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'Clash', 1, now() + interval '1 day 2 hours', 'x', now() + interval '1 day 5 hours', 'x')$$,
  '23P01', 'channel_busy', 'one channel: overlapping tours are rejected');

-- =============================================================================
-- 4. Order state machine
-- =============================================================================
select tests.login_as((select admin1 from ids));

select throws_ok($$select public.assign_order('c0000000-0000-4000-8000-000000000001', 'pickup',
                     '33333333-3333-4333-8333-333333333333')$$,
  'P0001', 'pickup_not_assignable', 'pickup cannot be assigned before delivery');

select throws_ok($$select public.assign_order('c0000000-0000-4000-8000-000000000001', 'delivery',
                     '11111111-1111-4111-8111-111111111111')$$,
  'P0001', 'rider_invalid', 'a non-rider cannot be assigned');

select throws_ok($$select public.assign_order('c0000000-0000-4000-8000-000000000003', 'delivery',
                     '22222222-2222-4222-8222-222222222222')$$,
  'P0002', 'order_not_found', 'cannot assign another tenant''s order');

select is((select status::text from public.assign_order('c0000000-0000-4000-8000-000000000001',
            'delivery', '22222222-2222-4222-8222-222222222222')),
  'delivery_assigned', 'delivery assignment moves the order to delivery_assigned');

select tests.logout();

-- rider_activity reflects the assignment
select tests.login_as((select admin1 from ids));
select is((select is_busy from public.rider_activity where rider_id = (select rider1 from ids)), true,
  'rider with an assigned order is busy');
select is((select count(*)::int from public.rider_activity),
          (select count(*)::int from public.profiles
           where tenant_id = (select demo from ids) and 'rider' = any (roles) and not disabled),
  'every active rider of the tenant appears in rider_activity');
select tests.logout();

-- rider visibility: only own orders + unassigned pickups
select tests.login_as((select rider2 from ids));
select is((select count(*)::int from public.orders
           where status not in ('awaiting_pickup')
             and delivery_rider_id is distinct from (select rider2 from ids)
             and pickup_rider_id is distinct from (select rider2 from ids)), 0,
  'rider only sees own orders and open pickups');
select throws_ok($$select public.rider_order_action('c0000000-0000-4000-8000-000000000001', 'start_delivery')$$,
  'P0001', 'transition_not_allowed', 'a rider cannot act on another rider''s order');
select throws_ok($$select public.rider_order_action('c0000000-0000-4000-8000-000000000003', 'start_delivery')$$,
  'P0002', 'order_not_found', 'a rider cannot act on another tenant''s order');
select throws_ok($$insert into public.orders (tenant_id, guide_name, delivery_at, delivery_address)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Rider order', now(), 'x')$$,
  '42501', null, 'riders cannot create orders');
select throws_ok($$select public.assign_order('c0000000-0000-4000-8000-000000000002', 'pickup',
                     '33333333-3333-4333-8333-333333333333')$$,
  '42501', null, 'riders cannot assign orders');
select throws_ok($$select * from public.get_dashboard_stats(current_date)$$, '42501', null,
  'riders cannot read dashboard stats');
select is((select count(*)::int from public.get_channel_board(now() - interval '1 year', now() + interval '1 year')), 0,
  'riders get no channel map');
select throws_ok($$select public.free_channels(now())$$, '42501', null, 'riders cannot ask for free channels');
select tests.logout();

-- rider 1 runs the delivery
select tests.login_as((select rider1 from ids));
select is((select status::text from public.rider_order_action(
            'c0000000-0000-4000-8000-000000000001', 'start_delivery')),
  'out_for_delivery', 'assigned rider starts the delivery');
select throws_ok($$select public.rider_order_action('c0000000-0000-4000-8000-000000000001', 'start_delivery')$$,
  'P0001', 'transition_not_allowed', 'the same action cannot be repeated');
select is((select status::text from public.rider_order_action(
            'c0000000-0000-4000-8000-000000000001', 'complete_delivery')),
  'awaiting_pickup', 'completing a delivery with a planned pickup waits for pickup');
select tests.logout();

-- admin assigns the pickup to rider 2; rider 2 completes it
select tests.login_as((select admin1 from ids));
select is((select status::text from public.assign_order('c0000000-0000-4000-8000-000000000001',
            'pickup', '33333333-3333-4333-8333-333333333333')),
  'pickup_assigned', 'pickup assignment moves the order to pickup_assigned');
select throws_ok($$select public.assign_order('c0000000-0000-4000-8000-000000000001', 'delivery',
                     '33333333-3333-4333-8333-333333333333')$$,
  'P0001', 'delivery_not_reassignable', 'a completed delivery cannot be reassigned');
select tests.logout();

select tests.login_as((select rider2 from ids));
select is((select status::text from public.rider_order_action(
            'c0000000-0000-4000-8000-000000000001', 'start_pickup')),
  'out_for_pickup', 'assigned rider starts the pickup');
select throws_ok($$select public.rider_order_action('c0000000-0000-4000-8000-000000000001', 'complete_pickup', 999)$$,
  'P0001', 'invalid_lost_count', 'lost radios cannot exceed what was delivered');
select is((select lost_radios from public.rider_order_action(
            'c0000000-0000-4000-8000-000000000001', 'complete_pickup', 1)),
  1, 'completing the pickup records lost radios');
select tests.logout();

select is((select status::text from public.orders where id = (select o1 from ids)), 'picked_up',
  'order reached picked_up');
select ok((select delivered_at is not null and picked_up_at is not null
           from public.orders where id = (select o1 from ids)),
  'lifecycle timestamps were stamped');

-- the channel is free again, even during o1's planned window, once o1 is closed
select lives_ok($$insert into public.orders (tenant_id, guide_name, radio_channel, delivery_at, delivery_address, pickup_at, pickup_address)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Reuse', 10, now() + interval '2 hours', 'x', now() + interval '3 hours', 'x')$$,
  'a channel is reusable once its order is picked up');

-- delivered without a pickup plan: rider cannot be assigned until details exist
select tests.login_as((select admin1 from ids));
select throws_ok($$select public.assign_order('c0000000-0000-4000-8000-000000000002', 'pickup',
                     '33333333-3333-4333-8333-333333333333')$$,
  'P0001', 'pickup_details_missing', 'pickup needs a time and address before assignment');

-- cancel / reopen
select is((select status::text from public.admin_set_status(
            (select id from public.orders where guide_name = 'Reuse'), 'cancelled')),
  'cancelled', 'admin can cancel an order');
select is((select status::text from public.admin_set_status(
            (select id from public.orders where guide_name = 'Reuse'), 'received')),
  'received', 'reopening restores the previous status');
select throws_ok($$select public.admin_set_status((select id from public.orders where guide_name = 'Reuse'), 'delivery_assigned')$$,
  'P0001', 'use_assign_order', 'assigned statuses require assign_order');
select throws_ok($$select public.admin_set_status('c0000000-0000-4000-8000-000000000001', 'cancelled')$$,
  'P0001', 'transition_not_allowed', 'a picked up order cannot be cancelled');
select tests.logout();

select ok((select count(*) >= 5 from public.order_events where order_id = (select o1 from ids)),
  'the order lifecycle was written to the audit log');

-- =============================================================================
-- 5. Member management
-- =============================================================================
select tests.login_as((select rider1 from ids));
select throws_ok($$select public.update_member('22222222-2222-4222-8222-222222222222', 'Hacker', null, '{admin}', null)$$,
  '42501', null, 'riders cannot call update_member');
select tests.logout();

select tests.login_as((select admin1 from ids));
select throws_ok($$select public.update_member('11111111-1111-4111-8111-111111111111', null, null, null, true)$$,
  'P0001', 'last_admin', 'the last admin cannot be disabled');
select throws_ok($$select public.update_member('11111111-1111-4111-8111-111111111111', null, null, '{rider}', null)$$,
  'P0001', 'last_admin', 'the last admin cannot lose the admin role');
select is((select full_name from public.update_member('33333333-3333-4333-8333-333333333333', 'Sara Updated', '+39 000', null, null)),
  'Sara Updated', 'admin can update a member');
select is((select roles from public.update_member('33333333-3333-4333-8333-333333333333', null, null, '{rider,admin}', null)),
  array['rider', 'admin']::public.app_role[], 'admin can grant roles');
select throws_ok($$select public.update_member('44444444-4444-4444-8444-444444444444', 'x', null, null, null)$$,
  'P0002', 'member_not_found', 'admin cannot edit members of another tenant');
select tests.logout();

-- A rider with open work cannot be disabled.
select set_config('app.order_actions', 'on', true);
update public.orders set status = 'delivery_assigned', delivery_rider_id = (select rider1 from ids)
 where id = (select o2 from ids);
select set_config('app.order_actions', 'off', true);

select tests.login_as((select admin1 from ids));
select throws_ok($$select public.update_member('22222222-2222-4222-8222-222222222222', null, null, null, true)$$,
  'P0001', 'rider_has_active_orders', 'a rider with open orders cannot be disabled');
select tests.logout();

-- =============================================================================
-- 6. Onboarding (bootstrap_profile)
-- =============================================================================
insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '55555555-5555-4555-8555-555555555555', 'authenticated', 'authenticated',
   'founder@newco.test', now(), '{}', '{"company_name":"New Co","full_name":"New Founder"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '66666666-6666-4666-8666-666666666666', 'authenticated', 'authenticated',
   'copycat@newco.test', now(), '{}', '{"company_name":"  new co "}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '77777777-7777-4777-8777-777777777777', 'authenticated', 'authenticated',
   'nocompany@x.test', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '88888888-8888-4888-8888-888888888888', 'authenticated', 'authenticated',
   'unconfirmed@x.test', null, '{}', '{"company_name":"Ghost Co"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '99999999-9999-4999-8999-999999999999', 'authenticated', 'authenticated',
   'invited@x.test', now(), '{}', '{"full_name":"Invited Rider"}', now(), now());

insert into public.invitations (tenant_id, email, roles)
values ((select demo from ids), 'Invited@X.test', array['rider']::public.app_role[]);

select tests.login_as('55555555-5555-4555-8555-555555555555');
select is((select roles from public.bootstrap_profile()), array['admin']::public.app_role[],
  'self-signup creates a new company with an admin');
select is((select count(*)::int from public.tenants where name_key = 'new co'), 1,
  'the new company exists');
select is((select id from public.bootstrap_profile()), '55555555-5555-4555-8555-555555555555'::uuid,
  'bootstrap_profile is idempotent');
select tests.logout();

select tests.login_as('66666666-6666-4666-8666-666666666666');
select throws_ok($$select public.bootstrap_profile()$$, 'P0001', 'company_exists',
  'an existing company name cannot be claimed (no more admin takeover)');
select tests.logout();

select tests.login_as('77777777-7777-4777-8777-777777777777');
select throws_ok($$select public.bootstrap_profile()$$, 'P0001', 'no_company',
  'no invitation and no company name -> no profile');
select tests.logout();

select tests.login_as('88888888-8888-4888-8888-888888888888');
select throws_ok($$select public.bootstrap_profile()$$, '28000', 'email_not_confirmed',
  'unconfirmed emails cannot bootstrap a profile');
select tests.logout();

select tests.login_as('99999999-9999-4999-8999-999999999999');
select is((select tenant_id from public.bootstrap_profile()), (select demo from ids),
  'an invited user joins the inviting tenant (email match is case-insensitive)');
select tests.logout();
select is((select roles from public.profiles where id = '99999999-9999-4999-8999-999999999999'),
  array['rider']::public.app_role[], 'invited user gets exactly the invited roles');
select ok((select accepted_at is not null from public.invitations where email_key = 'invited@x.test'),
  'the invitation is marked as accepted');

-- =============================================================================
-- 7. Dashboard stats
-- =============================================================================
select tests.login_as((select admin1 from ids));
select ok((public.get_dashboard_stats(current_date) -> 'current' ->> 'orders')::int > 0,
  'dashboard stats count orders for the current month');
select is(jsonb_typeof(public.get_dashboard_stats(current_date) -> 'daily'), 'array',
  'dashboard stats include a daily series');
select is(jsonb_array_length(public.get_dashboard_stats(current_date) -> 'hourly'), 24,
  'dashboard stats include 24 hourly buckets');
select tests.logout();

-- =============================================================================
-- 8. Contact form messages (service role only)
-- =============================================================================
select tests.login_anon();
select throws_ok($$select count(*) from public.contact_messages$$, '42501', null,
  'anon cannot read contact messages');
select throws_ok(
  $$insert into public.contact_messages (name, email, message) values ('Spam Bot', 'bot@x.test', 'buy cheap things now')$$,
  '42501', null, 'anon cannot write contact messages directly (only the Edge Function can)');
select tests.logout();

select tests.login_as((select admin1 from ids));
select throws_ok($$select count(*) from public.contact_messages$$, '42501', null,
  'tenant admins cannot read the platform contact messages');
select tests.logout();

select lives_ok(
  $$insert into public.contact_messages (name, email, message, locale) values ('Anna Verdi', 'anna@x.test', 'Vorrei una demo per la mia agenzia.', 'it')$$,
  'the service role can store a valid message');
select throws_ok(
  $$insert into public.contact_messages (name, email, message) values ('Anna Verdi', 'not-an-email', 'Vorrei una demo per la mia agenzia.')$$,
  '23514', null, 'invalid e-mail addresses are rejected');
select throws_ok(
  $$insert into public.contact_messages (name, email, message) values ('Anna Verdi', 'anna@x.test', 'ciao')$$,
  '23514', null, 'too short messages are rejected');

select * from finish();
rollback;
