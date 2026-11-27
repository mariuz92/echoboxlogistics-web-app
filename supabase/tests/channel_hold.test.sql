begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(16);

insert into auth.users (id, email, email_confirmed_at, encrypted_password, raw_user_meta_data)
values ('aaaa1111-0000-4000-8000-000000000001', 'admin-hold@example.test', now(), 'test-hash', '{}');
insert into public.tenants(id, name, slug) values ('aaaa1111-0000-4000-8000-0000000000a1', 'Hold Test', 'hold-test');
insert into public.profiles(id, tenant_id, email, roles)
values ('aaaa1111-0000-4000-8000-000000000001', 'aaaa1111-0000-4000-8000-0000000000a1', 'admin-hold@example.test', array['admin']::public.app_role[]);
set local request.jwt.claim.sub = 'aaaa1111-0000-4000-8000-000000000001';
set local request.jwt.claims = '{"sub":"aaaa1111-0000-4000-8000-000000000001","aal":"aal1"}';
select set_config('app.order_actions', 'on', true);

-- Channel 7: delivered yesterday, pickup planned for yesterday evening, radios NOT returned yet.
insert into public.orders(id, tenant_id, guide_name, delivery_at, pickup_at, delivery_address, radio_channel)
values ('aaaa1111-0000-4000-8000-0000000000b1', 'aaaa1111-0000-4000-8000-0000000000a1', 'Unreturned group', now() - interval '26 hours', now() - interval '24 hours', 'Via 1', 7);
update public.orders set status = 'delivered' where id = 'aaaa1111-0000-4000-8000-0000000000b1';
-- Channel 11: delivered two days ago, no pickup planned, still open.
insert into public.orders(id, tenant_id, guide_name, delivery_at, delivery_address, radio_channel)
values ('aaaa1111-0000-4000-8000-0000000000b2', 'aaaa1111-0000-4000-8000-0000000000a1', 'No pickup planned', now() - interval '50 hours', 'Via 2', 11);
update public.orders set status = 'delivered' where id = 'aaaa1111-0000-4000-8000-0000000000b2';
-- Channel 10: an old order that was cancelled does not hold anything.
insert into public.orders(id, tenant_id, guide_name, delivery_at, pickup_at, delivery_address, radio_channel)
values ('aaaa1111-0000-4000-8000-0000000000b3', 'aaaa1111-0000-4000-8000-0000000000a1', 'Cancelled group', now() - interval '30 hours', now() - interval '28 hours', 'Via 3', 10);
update public.orders set status = 'cancelled' where id = 'aaaa1111-0000-4000-8000-0000000000b3';
-- Channel 9: a booking for tomorrow, 10:00-12:00 (planned end in the future: nothing changes for it).
insert into public.orders(id, tenant_id, guide_name, delivery_at, pickup_at, delivery_address, radio_channel)
values ('aaaa1111-0000-4000-8000-0000000000b4', 'aaaa1111-0000-4000-8000-0000000000a1', 'Tomorrow group', now() + interval '1 day', now() + interval '1 day 2 hours', 'Via 4', 9);
select set_config('app.order_actions', 'off', true);

-- The unreturned channel is still occupied today, tomorrow and next week ------------------------------
select is((select count(*) from public.get_channel_board(now(), now() + interval '1 hour')
  where channel = 7)::integer, 1, 'yesterday''s unreturned channel is occupied today');
select ok((select overdue and busy_until is null from public.get_channel_board(now(), now() + interval '1 hour') where channel = 7),
  'and it is marked overdue, with no end');
select is((select count(*) from public.get_channel_board(now() + interval '10 days', now() + interval '11 days')
  where channel = 7)::integer, 1, 'and it stays occupied on the following days, until it is closed');
select is((select count(*) from public.get_channel_board(now() + interval '10 days', now() + interval '11 days')
  where channel = 11)::integer, 1, 'an order without a planned pickup is held too once its day is over');
select is((select count(*) from public.get_channel_board(now() - interval '10 days', now() + interval '10 days')
  where channel = 10)::integer, 0, 'a cancelled order holds nothing');

-- It cannot be booked by someone else -------------------------------------------------------------
select throws_ok($$insert into public.orders(tenant_id, guide_name, delivery_at, pickup_at, delivery_address, radio_channel)
  values ('aaaa1111-0000-4000-8000-0000000000a1', 'Next group', now() + interval '3 days', now() + interval '3 days 2 hours', 'Via 5', 7)$$,
  '23P01', 'channel_busy', 'an unreturned channel is not given to another group');
select lives_ok($$insert into public.orders(tenant_id, guide_name, delivery_at, pickup_at, delivery_address, radio_channel)
  values ('aaaa1111-0000-4000-8000-0000000000a1', 'Other channel', now() + interval '3 days', now() + interval '3 days 2 hours', 'Via 6', 8)$$,
  'another channel is free');

-- Unchanged behaviour for plans that are still in the future ---------------------------------------
select ok((select not overdue and busy_until is not null from public.get_channel_board(now() + interval '1 day', now() + interval '2 days')
  where channel = 9), 'a booking whose planned pickup has not come keeps its planned end');
select is((select count(*) from public.get_channel_board(now() + interval '2 days', now() + interval '3 days')
  where channel = 9)::integer, 0, 'and is free afterwards');
select lives_ok($$insert into public.orders(tenant_id, guide_name, delivery_at, pickup_at, delivery_address, radio_channel)
  values ('aaaa1111-0000-4000-8000-0000000000a1', 'Afternoon group', now() + interval '1 day 3 hours', now() + interval '1 day 5 hours', 'Via 7', 9)$$,
  'the same channel serves another group after the first one has finished');

-- Closing the order frees the channel ---------------------------------------------------------------
select set_config('app.order_actions', 'on', true);
update public.orders set status = 'picked_up' where id = 'aaaa1111-0000-4000-8000-0000000000b1';
select set_config('app.order_actions', 'off', true);
select is((select count(*) from public.get_channel_board(now(), now() + interval '30 days')
  where channel = 7)::integer, 0, 'once the radios are picked up the channel is free again');
select lives_ok($$insert into public.orders(tenant_id, guide_name, delivery_at, pickup_at, delivery_address, radio_channel)
  values ('aaaa1111-0000-4000-8000-0000000000a1', 'Now it can', now() + interval '3 days', now() + interval '3 days 2 hours', 'Via 8', 7)$$,
  'and can be booked');

-- Planning the pickup again gives the hold a new end ---------------------------------------------------
update public.orders set pickup_at = now() + interval '2 hours' where id = 'aaaa1111-0000-4000-8000-0000000000b2';
select ok((select not overdue and busy_until is not null from public.get_channel_board(now(), now() + interval '1 hour') where channel = 11),
  're-planning the pickup to a later time ends the open-ended hold');
select is((select count(*) from public.get_channel_board(now() + interval '5 days', now() + interval '6 days')
  where channel = 11)::integer, 0, 'and the channel is free after it');

-- Companies that let groups share a channel are not blocked -----------------------------------------------
update public.tenants set channels_exclusive = false where id = 'aaaa1111-0000-4000-8000-0000000000a1';
select set_config('app.order_actions', 'on', true);
insert into public.orders(id, tenant_id, guide_name, delivery_at, pickup_at, delivery_address, radio_channel)
values ('aaaa1111-0000-4000-8000-0000000000b5', 'aaaa1111-0000-4000-8000-0000000000a1', 'Old shared', now() - interval '26 hours', now() - interval '24 hours', 'Via 9', 12);
update public.orders set status = 'delivered' where id = 'aaaa1111-0000-4000-8000-0000000000b5';
select set_config('app.order_actions', 'off', true);
select lives_ok($$insert into public.orders(tenant_id, guide_name, delivery_at, pickup_at, delivery_address, radio_channel)
  values ('aaaa1111-0000-4000-8000-0000000000a1', 'Sharing', now() + interval '1 day', now() + interval '1 day 2 hours', 'Via 10', 12)$$,
  'sharing is allowed when the company turns exclusive channels off');
select is((select count(*) from public.get_channel_board(now() + interval '1 day', now() + interval '2 days')
  where channel = 12)::integer, 2, 'and the board lists both groups');

select * from finish();
rollback;
