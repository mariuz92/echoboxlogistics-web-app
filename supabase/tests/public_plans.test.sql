begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(13);

insert into auth.users (id, email, email_confirmed_at, encrypted_password, raw_user_meta_data)
values
  ('eeee0000-0000-4000-8000-000000000001', 'operator-plans@example.test', now(), 'test-hash', '{}'),
  ('eeee0000-0000-4000-8000-000000000002', 'regular-plans@example.test', now(), 'test-hash', '{}');
insert into private.platform_admins(user_id) values ('eeee0000-0000-4000-8000-000000000001');

-- The three starting plans are public, in price order, with the badge on Pro.
select is(jsonb_array_length(public.get_public_plans()), 3, 'the starting plans are public');
select is(public.get_public_plans()->0->>'code', 'starter', 'plans come in their display order');
select is((select p->>'code' from jsonb_array_elements(public.get_public_plans()) p where (p->>'highlighted')::boolean), 'pro',
  'Pro carries the badge by default');
select is((public.get_public_plans()->0->>'price_month')::numeric, 29::numeric, 'prices are included');
select ok(not (public.get_public_plans()->0 ? 'is_public') and not (public.get_public_plans()->0 ? 'available'),
  'internal flags are not exposed');

-- Custom and archived plans stay private.
insert into private.platform_plans(code, name, price_month, is_public) values ('acme-custom', 'Acme custom', 120, false);
insert into private.platform_plans(code, name, price_month, available) values ('old-plan', 'Old plan', 10, false);
select is(jsonb_array_length(public.get_public_plans()), 3, 'custom and archived plans are not published');

-- Unlimited limits are published as null.
insert into private.platform_plans(code, name, price_month, included_riders, included_orders, sort_order)
values ('unlimited', 'Unlimited', 500, null, null, 5);
select ok((select p->'included_orders' = 'null'::jsonb from jsonb_array_elements(public.get_public_plans()) p where p->>'code' = 'unlimited'),
  'unlimited plans have null limits');
select is(public.get_public_plans()->0->>'code', 'unlimited', 'sort order decides the position');

-- Only the service role reads the list; customers and visitors cannot call it directly.
set local role anon;
select throws_ok($$select public.get_public_plans()$$, '42501', null, 'visitors cannot call get_public_plans');
reset role;

-- The badge: operators only, one plan at a time.
set local role authenticated;
set local request.jwt.claim.sub = 'eeee0000-0000-4000-8000-000000000002';
set local request.jwt.claims = '{"sub":"eeee0000-0000-4000-8000-000000000002","aal":"aal2"}';
select throws_ok($$select public.platform_highlight_plan('starter', true, 'Not allowed')$$, '42501', 'operator_access_denied',
  'regular users cannot choose the badge');
reset role;
set local request.jwt.claim.sub = 'eeee0000-0000-4000-8000-000000000001';
set local request.jwt.claims = '{"sub":"eeee0000-0000-4000-8000-000000000001","aal":"aal2"}';
select lives_ok($$select public.platform_highlight_plan('business', true, 'Push the big plan')$$);
select is((select count(*) from private.platform_plans where highlighted)::integer, 1, 'only one plan carries the badge');
select is((select code from private.platform_plans where highlighted), 'business', 'the badge moved');

select * from finish();
rollback;
