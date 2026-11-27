begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(97);

-- Fixtures: an operator, company A (owner + 4 riders), another company B with its own admin.
insert into auth.users (id, email, email_confirmed_at, encrypted_password, raw_user_meta_data)
values
  ('dddd0000-0000-4000-8000-000000000001', 'operator-billing@example.test', now(), 'test-hash', '{}'),
  ('dddd0000-0000-4000-8000-000000000002', 'owner-a@example.test', now(), 'test-hash', '{}'),
  ('dddd0000-0000-4000-8000-000000000003', 'rider-a1@example.test', now(), 'test-hash', '{}'),
  ('dddd0000-0000-4000-8000-000000000004', 'rider-a2@example.test', now(), 'test-hash', '{}'),
  ('dddd0000-0000-4000-8000-000000000005', 'rider-a3@example.test', now(), 'test-hash', '{}'),
  ('dddd0000-0000-4000-8000-000000000006', 'rider-a4@example.test', now(), 'test-hash', '{}'),
  ('dddd0000-0000-4000-8000-000000000007', 'owner-b@example.test', now(), 'test-hash', '{}'),
  ('dddd0000-0000-4000-8000-000000000008', 'owner-d@example.test', now(), 'test-hash', '{}'),
  ('dddd0000-0000-4000-8000-000000000009', 'rider-d@example.test', now(), 'test-hash', '{}');
insert into private.platform_admins(user_id) values ('dddd0000-0000-4000-8000-000000000001');
insert into public.tenants(id, name, slug) values
  ('dddd0000-0000-4000-8000-0000000000a1', 'Billing A', 'billing-a'),
  ('dddd0000-0000-4000-8000-0000000000b1', 'Billing B', 'billing-b'),
  ('dddd0000-0000-4000-8000-0000000000c1', 'Billing C', 'billing-c'),
  ('dddd0000-0000-4000-8000-0000000000d1', 'Billing D', 'billing-d');
insert into public.profiles(id, tenant_id, email, roles) values
  ('dddd0000-0000-4000-8000-000000000002', 'dddd0000-0000-4000-8000-0000000000a1', 'owner-a@example.test', array['admin']::public.app_role[]),
  ('dddd0000-0000-4000-8000-000000000003', 'dddd0000-0000-4000-8000-0000000000a1', 'rider-a1@example.test', array['rider']::public.app_role[]),
  ('dddd0000-0000-4000-8000-000000000004', 'dddd0000-0000-4000-8000-0000000000a1', 'rider-a2@example.test', array['rider']::public.app_role[]),
  ('dddd0000-0000-4000-8000-000000000005', 'dddd0000-0000-4000-8000-0000000000a1', 'rider-a3@example.test', array['rider']::public.app_role[]),
  ('dddd0000-0000-4000-8000-000000000006', 'dddd0000-0000-4000-8000-0000000000a1', 'rider-a4@example.test', array['rider']::public.app_role[]),
  ('dddd0000-0000-4000-8000-000000000007', 'dddd0000-0000-4000-8000-0000000000b1', 'owner-b@example.test', array['admin']::public.app_role[]),
  ('dddd0000-0000-4000-8000-000000000008', 'dddd0000-0000-4000-8000-0000000000d1', 'owner-d@example.test', array['admin']::public.app_role[]),
  ('dddd0000-0000-4000-8000-000000000009', 'dddd0000-0000-4000-8000-0000000000d1', 'rider-d@example.test', array['rider']::public.app_role[]);
insert into private.company_owners(tenant_id, user_id) values
  ('dddd0000-0000-4000-8000-0000000000a1', 'dddd0000-0000-4000-8000-000000000002'),
  ('dddd0000-0000-4000-8000-0000000000d1', 'dddd0000-0000-4000-8000-000000000008');

-- Plans -----------------------------------------------------------------------
select is((select price_month from private.platform_plans where code = 'pro'), 79::numeric,
  'the starting Pro price is seeded');
select is((select included_orders from private.platform_plans where code = 'business'), 6000,
  'the Business plan includes 6000 orders');

-- Usage and estimate: Starter (3 riders, 300 orders, 5 per extra rider, 8 per extra 100 orders).
insert into private.company_subscriptions(tenant_id, plan_code, state)
values ('dddd0000-0000-4000-8000-0000000000a1', 'starter', 'active');
select set_config('app.order_actions', 'on', true);
insert into public.orders(tenant_id, guide_name, delivery_at, delivery_address)
select 'dddd0000-0000-4000-8000-0000000000a1', 'Guide ' || n, now(), 'Via Roma ' || n
from generate_series(1, 305) n;
-- One order has a rider; cancelled orders and orders of earlier months do not count.
update public.orders set delivery_rider_id = 'dddd0000-0000-4000-8000-000000000003', status = 'delivery_assigned'
where id = (select id from public.orders where tenant_id = 'dddd0000-0000-4000-8000-0000000000a1' limit 1);
insert into public.orders(tenant_id, guide_name, delivery_at, delivery_address)
values ('dddd0000-0000-4000-8000-0000000000a1', 'Cancelled guide', now(), 'Via Roma');
update public.orders set status = 'cancelled' where guide_name = 'Cancelled guide';
insert into public.orders(tenant_id, guide_name, delivery_at, delivery_address)
values ('dddd0000-0000-4000-8000-0000000000a1', 'Old guide', now(), 'Via Roma');
update public.orders set created_at = now() - interval '40 days' where guide_name = 'Old guide';
select set_config('app.order_actions', 'off', true);

select is((private.tenant_usage('dddd0000-0000-4000-8000-0000000000a1')->>'orders')::integer, 305,
  'usage counts this month''s orders without cancelled or older ones');
select is((private.tenant_usage('dddd0000-0000-4000-8000-0000000000a1')->>'riders')::integer, 4,
  'usage counts enabled riders');
select is((private.tenant_usage('dddd0000-0000-4000-8000-0000000000a1')->>'active_riders')::integer, 1,
  'usage counts riders who had an order');
update public.profiles set disabled = true where id = 'dddd0000-0000-4000-8000-000000000006';
select is((private.tenant_usage('dddd0000-0000-4000-8000-0000000000a1')->>'riders')::integer, 3,
  'disabled riders are not counted');
update public.profiles set disabled = false where id = 'dddd0000-0000-4000-8000-000000000006';
select is((private.estimate_bill('dddd0000-0000-4000-8000-0000000000a1')->>'total')::numeric, 42::numeric,
  'estimate = 29 base + 1 extra rider (5) + 1 extra block of orders (8)');
select is(jsonb_array_length(private.estimate_bill('dddd0000-0000-4000-8000-0000000000a1')->'lines'), 3,
  'estimate lists base, extra riders and extra orders');

-- Notices: limits reached create one notice each, recipients are the company admins.
-- The worker also prepares invoice drafts (covered by invoice_drafts.test.sql): keep them out of these fixtures.
insert into private.platform_settings(singleton, invoices_generated_at) values (true, now())
on conflict (singleton) do update set invoices_generated_at = now();
select ok(jsonb_array_length(public.claim_billing_notices(25)) >= 2, 'limits reached produce notices to send');
select is((select count(*) from private.billing_notices
  where tenant_id = 'dddd0000-0000-4000-8000-0000000000a1' and kind = 'limit_orders_100')::integer, 1,
  'one orders-limit notice');
select is((select count(*) from private.billing_notices
  where tenant_id = 'dddd0000-0000-4000-8000-0000000000a1' and kind = 'limit_riders_100')::integer, 1,
  'one riders-limit notice');
select is((select count(*) from private.billing_notices
  where tenant_id = 'dddd0000-0000-4000-8000-0000000000a1' and kind = 'limit_orders_80')::integer, 0,
  'no 80% notice once the limit is already reached');
select is(jsonb_array_length(public.claim_billing_notices(25)), 0, 'leased notices are not handed out twice');
select is((select p.payload->>'used' from private.billing_notices p
  where p.tenant_id = 'dddd0000-0000-4000-8000-0000000000a1' and p.kind = 'limit_orders_100'), '305',
  'the notice carries the usage');
select lives_ok($$select public.finish_billing_notice(
  (select id from private.billing_notices where tenant_id = 'dddd0000-0000-4000-8000-0000000000a1' and kind = 'limit_orders_100'),
  true)$$);
select ok((select sent_at is not null from private.billing_notices
  where tenant_id = 'dddd0000-0000-4000-8000-0000000000a1' and kind = 'limit_orders_100'), 'sent notices are marked');

-- Company side ------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claim.sub = 'dddd0000-0000-4000-8000-000000000002';
set local request.jwt.claims = '{"sub":"dddd0000-0000-4000-8000-000000000002","aal":"aal1"}';
select throws_ok($$select public.claim_billing_notices(5)$$, '42501', null,
  'customers cannot read the notice queue');
select is(public.company_billing()->'subscription'->>'plan_code', 'starter', 'an admin sees the company subscription');
select is((public.company_billing()->'usage'->>'orders')::integer, 305, 'an admin sees usage');
select is((public.company_billing()->'estimate'->>'total')::numeric, 42::numeric, 'an admin sees the estimate');
select is(jsonb_array_length(public.company_billing()->'plans'), 3, 'an admin sees the public plans');
select throws_ok($$select public.request_plan_change('nonexistent')$$, 'P0001', 'plan_unavailable');
select lives_ok($$select public.request_plan_change('pro', 'year', 'We are growing')$$, 'an admin can request a plan change');
select throws_ok($$select public.request_plan_change('business')$$, 'P0001', 'request_already_open',
  'only one request can be open');
select is(public.company_billing()->'request'->>'to_plan', 'pro', 'the open request is visible');

set local request.jwt.claim.sub = 'dddd0000-0000-4000-8000-000000000003';
set local request.jwt.claims = '{"sub":"dddd0000-0000-4000-8000-000000000003","aal":"aal1"}';
select throws_ok($$select public.company_billing()$$, '42501', 'not_authorized', 'riders cannot see billing');
select throws_ok($$select public.request_plan_change('pro')$$, '42501', 'not_authorized', 'riders cannot request plans');

set local request.jwt.claim.sub = 'dddd0000-0000-4000-8000-000000000007';
set local request.jwt.claims = '{"sub":"dddd0000-0000-4000-8000-000000000007","aal":"aal2"}';
select is(public.company_billing()->'subscription', 'null'::jsonb, 'a company without a subscription has none');
select throws_ok($$select public.platform_billing_action('save_plan', '{"code":"hack","name":"Hack","reason":"x"}')$$,
  '42501', 'operator_access_denied', 'customers cannot manage plans');
select throws_ok($$select public.platform_billing_overview()$$, '42501', 'operator_access_denied',
  'customers cannot read the billing overview');

-- Operator ---------------------------------------------------------------------
-- Security-definer functions run with the owner's rights, so the rest runs as the
-- test owner with the operator's session claims.
reset role;
set local request.jwt.claim.sub = 'dddd0000-0000-4000-8000-000000000001';
set local request.jwt.claims = '{"sub":"dddd0000-0000-4000-8000-000000000001","aal":"aal2"}';
select is((public.platform_billing_overview()->'summary'->>'open_requests')::integer, 1, 'the open request reaches the console');
select lives_ok($$select public.platform_billing_action('handle_plan_request', jsonb_build_object(
  'request_id', (select id from private.plan_change_requests where status = 'open'),
  'decision', 'approved', 'response', 'Welcome to Pro', 'reason', 'Approved upgrade'))$$);
select is((select plan_code || '/' || billing_interval from private.company_subscriptions
  where tenant_id = 'dddd0000-0000-4000-8000-0000000000a1'), 'pro/year', 'approving applies the plan and interval');
select is((select state from private.company_subscriptions where tenant_id = 'dddd0000-0000-4000-8000-0000000000a1'),
  'active', 'approving keeps the subscription state');

-- Custom plan (private, unlimited orders), trial and forever.
select lives_ok($$select public.platform_billing_action('save_plan', '{"code":"acme","name":"Acme custom","price_month":120,
  "included_riders":15,"extra_rider_price":3,"is_public":false,"reason":"Custom deal"}')$$);
select is((select included_orders from private.platform_plans where code = 'acme'), null,
  'unlimited limits are stored as NULL');
select lives_ok($$select public.platform_billing_action('start_trial', jsonb_build_object(
  'tenant_id', 'dddd0000-0000-4000-8000-0000000000b1', 'plan_code', 'acme', 'days', 14, 'reason', 'Trial'))$$);
select is((select state from private.company_subscriptions where tenant_id = 'dddd0000-0000-4000-8000-0000000000b1'),
  'trial', 'a trial can be started');
select is(private.company_access_mode('dddd0000-0000-4000-8000-0000000000b1'), 'full', 'a running trial has full access');
select ok((select ends_at > now() + interval '13 days' from private.company_subscriptions
  where tenant_id = 'dddd0000-0000-4000-8000-0000000000b1'), 'the trial ends in 14 days');
select throws_ok($$select public.platform_billing_action('save_subscription', jsonb_build_object(
  'tenant_id', 'dddd0000-0000-4000-8000-0000000000b1', 'plan_code', 'acme', 'state', 'trial', 'reason', 'No end'))$$,
  'P0001', 'trial_needs_end_date');
select lives_ok($$select public.platform_billing_action('save_subscription', jsonb_build_object(
  'tenant_id', 'dddd0000-0000-4000-8000-0000000000b1', 'plan_code', 'acme', 'state', 'active', 'forever', true,
  'reason', 'Partner company'))$$);
select ok((select forever and ends_at is null from private.company_subscriptions
  where tenant_id = 'dddd0000-0000-4000-8000-0000000000b1'), 'a forever subscription has no end');
select throws_ok($$select public.platform_billing_action('save_subscription', jsonb_build_object(
  'tenant_id', 'dddd0000-0000-4000-8000-0000000000b1', 'plan_code', 'acme', 'state', 'past_due', 'forever', true,
  'reason', 'Invalid'))$$, 'P0001', 'forever_requires_active');

-- Invoices -----------------------------------------------------------------------
select lives_ok($$select public.platform_billing_action('create_invoice', jsonb_build_object(
  'tenant_id', 'dddd0000-0000-4000-8000-0000000000a1', 'period_start', '2026-11-01', 'period_end', '2026-11-30',
  'lines', '[{"code":"base","label":"Pro annual","quantity":1,"unit_price":790,"amount":790},
             {"code":"extra_orders","label":"Extra orders","quantity":2,"unit_price":6,"amount":12}]'::jsonb,
  'reason', 'Annual invoice'))$$);
select is((select amount from private.company_invoices where tenant_id = 'dddd0000-0000-4000-8000-0000000000a1'),
  802::numeric, 'the invoice total is the sum of its lines');
select ok((select number like 'EB-%' from private.company_invoices where tenant_id = 'dddd0000-0000-4000-8000-0000000000a1'),
  'invoice numbers are generated');
select lives_ok($$select public.platform_billing_action('create_invoice', jsonb_build_object(
  'tenant_id', 'dddd0000-0000-4000-8000-0000000000a1', 'period_start', '2026-12-01', 'period_end', '2026-12-31',
  'status', 'draft', 'lines', '[{"code":"base","label":"Draft","quantity":1,"unit_price":5,"amount":5}]'::jsonb,
  'reason', 'Draft'))$$);
select throws_ok($$select public.platform_billing_action('create_invoice', jsonb_build_object(
  'tenant_id', 'dddd0000-0000-4000-8000-0000000000a1', 'period_start', '2026-12-01', 'period_end', '2026-12-31',
  'lines', '[]'::jsonb, 'reason', 'Empty'))$$, 'P0001', 'invoice_lines_required');

set local request.jwt.claim.sub = 'dddd0000-0000-4000-8000-000000000002';
set local request.jwt.claims = '{"sub":"dddd0000-0000-4000-8000-000000000002","aal":"aal1"}';
select is(jsonb_array_length(public.company_billing()->'invoices'), 1, 'customers see issued invoices but not drafts');

set local request.jwt.claim.sub = 'dddd0000-0000-4000-8000-000000000001';
set local request.jwt.claims = '{"sub":"dddd0000-0000-4000-8000-000000000001","aal":"aal2"}';
select lives_ok($$select public.platform_billing_action('save_subscription', jsonb_build_object(
  'tenant_id', 'dddd0000-0000-4000-8000-0000000000a1', 'plan_code', 'pro', 'state', 'past_due',
  'billing_interval', 'year', 'grace_until', (now() - interval '1 day')::text, 'reason', 'Unpaid'))$$);
select is(private.company_access_mode('dddd0000-0000-4000-8000-0000000000a1'), 'read_only',
  'an unpaid subscription past its grace period is read-only');
select lives_ok($$select public.platform_billing_action('set_invoice_status', jsonb_build_object(
  'invoice_id', (select id from private.company_invoices where tenant_id = 'dddd0000-0000-4000-8000-0000000000a1' and status = 'issued'),
  'status', 'paid', 'extend_subscription', true, 'reason', 'Bank transfer received'))$$);
select is(private.company_access_mode('dddd0000-0000-4000-8000-0000000000a1'), 'full',
  'a paid invoice that renews the subscription restores access');
select ok((select ends_at > now() + interval '364 days' from private.company_subscriptions
  where tenant_id = 'dddd0000-0000-4000-8000-0000000000a1'), 'a yearly plan is renewed by one year');
select is((select count(*) from private.subscription_payments
  where tenant_id = 'dddd0000-0000-4000-8000-0000000000a1' and amount = 802)::integer, 1, 'the payment is recorded');
select is((public.platform_billing_overview()->'payments'->0->>'company_name'), 'Billing A', 'the overview shows who paid');
select throws_ok($$select public.platform_billing_action('set_invoice_status', jsonb_build_object(
  'invoice_id', (select id from private.company_invoices where tenant_id = 'dddd0000-0000-4000-8000-0000000000a1' and status = 'paid'),
  'status', 'void', 'reason', 'Too late'))$$, 'P0001', 'invoice_final', 'paid invoices are final');
select throws_ok($$select public.platform_billing_action('delete_invoice', jsonb_build_object(
  'invoice_id', (select id from private.company_invoices where tenant_id = 'dddd0000-0000-4000-8000-0000000000a1' and status = 'paid'),
  'reason', 'Remove'))$$, 'P0001', 'only_drafts_can_be_deleted', 'only drafts can be deleted');
select lives_ok($$select public.platform_billing_action('delete_invoice', jsonb_build_object(
  'invoice_id', (select id from private.company_invoices where tenant_id = 'dddd0000-0000-4000-8000-0000000000a1' and status = 'draft'),
  'reason', 'Remove draft'))$$);

-- Downgrades wait for the renewal, upgrades apply at once -----------------------------
set local request.jwt.claim.sub = 'dddd0000-0000-4000-8000-000000000002';
set local request.jwt.claims = '{"sub":"dddd0000-0000-4000-8000-000000000002","aal":"aal1"}';
select lives_ok($$select public.request_plan_change('starter', 'month', 'Smaller team')$$,
  'the company asks for a smaller plan');
set local request.jwt.claim.sub = 'dddd0000-0000-4000-8000-000000000001';
set local request.jwt.claims = '{"sub":"dddd0000-0000-4000-8000-000000000001","aal":"aal2"}';
select is(public.platform_billing_action('handle_plan_request', jsonb_build_object(
  'request_id', (select id from private.plan_change_requests where status = 'open'),
  'decision', 'approved', 'reason', 'Downgrade at renewal'))->>'effective', 'renewal',
  'a downgrade of a paying company is scheduled for the renewal');
select is((select plan_code || '/' || next_plan_code from private.company_subscriptions
  where tenant_id = 'dddd0000-0000-4000-8000-0000000000a1'), 'pro/starter', 'the current plan stays until the renewal');
set local request.jwt.claim.sub = 'dddd0000-0000-4000-8000-000000000002';
set local request.jwt.claims = '{"sub":"dddd0000-0000-4000-8000-000000000002","aal":"aal1"}';
select is(public.company_billing()->'subscription'->>'next_plan_code', 'starter', 'the company sees the scheduled change');
set local request.jwt.claim.sub = 'dddd0000-0000-4000-8000-000000000001';
set local request.jwt.claims = '{"sub":"dddd0000-0000-4000-8000-000000000001","aal":"aal2"}';
-- The term is about to end: renewals are paid at the end of a term.
update private.company_subscriptions set ends_at = now() + interval '1 day'
where tenant_id = 'dddd0000-0000-4000-8000-0000000000a1';
select lives_ok($$select public.platform_billing_action('create_invoice', jsonb_build_object(
  'tenant_id', 'dddd0000-0000-4000-8000-0000000000a1', 'period_start', '2027-11-01', 'period_end', '2027-11-30',
  'lines', '[{"code":"base","label":"Starter monthly","quantity":1,"unit_price":29,"amount":29}]'::jsonb,
  'reason', 'Renewal invoice'))$$);
select lives_ok($$select public.platform_billing_action('set_invoice_status', jsonb_build_object(
  'invoice_id', (select id from private.company_invoices where tenant_id = 'dddd0000-0000-4000-8000-0000000000a1' and status = 'issued'),
  'status', 'paid', 'extend_subscription', true, 'reason', 'Renewal received'))$$);
select is((select plan_code || '/' || billing_interval from private.company_subscriptions
  where tenant_id = 'dddd0000-0000-4000-8000-0000000000a1'), 'starter/month', 'the scheduled plan starts with the renewal');
select ok((select next_plan_code is null and next_billing_interval is null from private.company_subscriptions
  where tenant_id = 'dddd0000-0000-4000-8000-0000000000a1'), 'the schedule is cleared once applied');
select ok((select ends_at > now() + interval '27 days' and ends_at < now() + interval '34 days'
  from private.company_subscriptions where tenant_id = 'dddd0000-0000-4000-8000-0000000000a1'),
  'the renewal runs for one month of the new interval');
set local request.jwt.claim.sub = 'dddd0000-0000-4000-8000-000000000002';
set local request.jwt.claims = '{"sub":"dddd0000-0000-4000-8000-000000000002","aal":"aal1"}';
select lives_ok($$select public.request_plan_change('pro', 'year', 'Growing again')$$, 'the company asks for a bigger plan');
set local request.jwt.claim.sub = 'dddd0000-0000-4000-8000-000000000001';
set local request.jwt.claims = '{"sub":"dddd0000-0000-4000-8000-000000000001","aal":"aal2"}';
select is(public.platform_billing_action('handle_plan_request', jsonb_build_object(
  'request_id', (select id from private.plan_change_requests where status = 'open'),
  'decision', 'approved', 'reason', 'Upgrade'))->>'effective', 'now', 'an upgrade applies at once');
select is((select plan_code || '/' || billing_interval from private.company_subscriptions
  where tenant_id = 'dddd0000-0000-4000-8000-0000000000a1'), 'pro/year', 'the bigger plan is active');

-- Cancelling: refunds are bounded by what was paid -----------------------------------------
select throws_ok($$select public.platform_billing_action('cancel_subscription', jsonb_build_object(
  'tenant_id', 'dddd0000-0000-4000-8000-0000000000a1', 'refund_amount', 5000, 'reason', 'Too much'))$$, 'P0001', 'refund_exceeds_payments',
  'a refund cannot exceed the payments received');
select lives_ok($$select public.platform_billing_action('cancel_subscription', jsonb_build_object(
  'tenant_id', 'dddd0000-0000-4000-8000-0000000000a1', 'refund_amount', 400, 'reason', 'Customer cancelled'))$$);
select is((select state from private.company_subscriptions where tenant_id = 'dddd0000-0000-4000-8000-0000000000a1'), 'cancelled', 'the subscription is cancelled');
select is(private.company_access_mode('dddd0000-0000-4000-8000-0000000000a1'), 'read_only', 'a cancelled company is read-only');
select is((select count(*) from private.subscription_payments
  where tenant_id = 'dddd0000-0000-4000-8000-0000000000a1' and kind = 'refund' and amount = 400)::integer, 1, 'the refund is recorded');
select throws_ok($$select public.platform_billing_action('cancel_subscription', jsonb_build_object(
  'tenant_id', 'dddd0000-0000-4000-8000-0000000000a1', 'refund_amount', 500, 'reason', 'Refund twice'))$$, 'P0001', 'refund_exceeds_payments',
  'what was already refunded is not refunded again');
select throws_ok($$select public.platform_billing_action('cancel_subscription', jsonb_build_object(
  'tenant_id', 'dddd0000-0000-4000-8000-0000000000c1', 'reason', 'Nothing to cancel'))$$, 'P0001', 'subscription_not_found',
  'a company without a subscription has nothing to cancel');

-- Reminders ------------------------------------------------------------------------
select lives_ok($$select public.platform_billing_action('send_notice', jsonb_build_object(
  'tenant_id', 'dddd0000-0000-4000-8000-0000000000a1', 'kind', 'payment_reminder', 'reason', 'Reminder'))$$);
select is((select count(*) from private.billing_notices
  where tenant_id = 'dddd0000-0000-4000-8000-0000000000a1' and kind = 'payment_reminder')::integer, 1,
  'a reminder is queued');
select throws_ok($$select public.platform_billing_action('send_notice', jsonb_build_object(
  'tenant_id', 'dddd0000-0000-4000-8000-0000000000c1', 'kind', 'custom', 'message', 'Hello', 'reason', 'No admin'))$$,
  'P0001', 'no_recipient', 'a company without recipients cannot be e-mailed');

-- Removing companies --------------------------------------------------------------
select throws_ok($$select public.platform_billing_action('delete_company', jsonb_build_object(
  'tenant_id', 'dddd0000-0000-4000-8000-0000000000c1', 'confirm_slug', 'billing-c', 'reason', 'Remove'))$$,
  'P0001', 'suspend_company_first', 'an active company cannot be removed');
select lives_ok($$select public.platform_console_action('set_company_active', jsonb_build_object(
  'tenant_id', 'dddd0000-0000-4000-8000-0000000000c1', 'active', false, 'reason', 'Suspend'))$$);
select throws_ok($$select public.platform_billing_action('delete_company', jsonb_build_object(
  'tenant_id', 'dddd0000-0000-4000-8000-0000000000c1', 'confirm_slug', 'wrong', 'reason', 'Remove'))$$,
  'P0001', 'confirmation_mismatch', 'removing needs the company slug');
select lives_ok($$select public.platform_console_action('set_company_active', jsonb_build_object(
  'tenant_id', 'dddd0000-0000-4000-8000-0000000000a1', 'active', false, 'reason', 'Suspend'))$$);
select throws_ok($$select public.platform_billing_action('delete_company', jsonb_build_object(
  'tenant_id', 'dddd0000-0000-4000-8000-0000000000a1', 'confirm_slug', 'billing-a', 'reason', 'Remove'))$$,
  'P0001', 'company_has_billing_history', 'a company with invoices is kept for accounting');
select lives_ok($$select public.platform_billing_action('delete_company', jsonb_build_object(
  'tenant_id', 'dddd0000-0000-4000-8000-0000000000c1', 'confirm_slug', 'billing-c', 'reason', 'Remove empty company'))$$);
select is((select count(*) from public.tenants where id = 'dddd0000-0000-4000-8000-0000000000c1')::integer, 0,
  'the company is removed');

-- A company with people and orders is removed with them.
select set_config('app.order_actions', 'on', true);
select set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '', true);
insert into public.orders(tenant_id, guide_name, delivery_at, delivery_address)
values ('dddd0000-0000-4000-8000-0000000000d1', 'Guide D', now(), 'Via D');
update public.orders set delivery_rider_id = 'dddd0000-0000-4000-8000-000000000009', status = 'delivery_assigned'
where tenant_id = 'dddd0000-0000-4000-8000-0000000000d1';
select set_config('app.order_actions', 'off', true);
set local request.jwt.claim.sub = 'dddd0000-0000-4000-8000-000000000001';
set local request.jwt.claims = '{"sub":"dddd0000-0000-4000-8000-000000000001","aal":"aal2"}';
select lives_ok($$select public.platform_console_action('set_company_active', jsonb_build_object(
  'tenant_id', 'dddd0000-0000-4000-8000-0000000000d1', 'active', false, 'reason', 'Suspend'))$$);
select lives_ok($$select public.platform_billing_action('delete_company', jsonb_build_object(
  'tenant_id', 'dddd0000-0000-4000-8000-0000000000d1', 'confirm_slug', 'billing-d', 'reason', 'Remove company with people'))$$);
select is((select count(*) from auth.users where id in (
  'dddd0000-0000-4000-8000-000000000008', 'dddd0000-0000-4000-8000-000000000009'))::integer, 0,
  'the people of a removed company are removed too');
select is((select count(*) from public.orders where tenant_id = 'dddd0000-0000-4000-8000-0000000000d1')::integer, 0,
  'its orders are removed');
select is((select count(*) from auth.users where id = 'dddd0000-0000-4000-8000-000000000001')::integer, 1,
  'operators are never removed');

-- Default trial for new companies ---------------------------------------------------
set local request.jwt.claim.sub = 'dddd0000-0000-4000-8000-000000000001';
set local request.jwt.claims = '{"sub":"dddd0000-0000-4000-8000-000000000001","aal":"aal2"}';
select lives_ok($$select public.platform_billing_action('save_trial_defaults',
  '{"plan_code":"starter","days":14,"reason":"Offer a trial"}')$$);
insert into public.tenants(id, name, slug) values ('dddd0000-0000-4000-8000-0000000000e1', 'Billing E', 'billing-e');
select is((select state from private.company_subscriptions where tenant_id = 'dddd0000-0000-4000-8000-0000000000e1'),
  'trial', 'new companies start the default trial');
update private.platform_settings set default_trial_days = 0;
insert into public.tenants(id, name, slug) values ('dddd0000-0000-4000-8000-0000000000e2', 'Billing F', 'billing-f');
select is((select count(*) from private.company_subscriptions where tenant_id = 'dddd0000-0000-4000-8000-0000000000e2')::integer,
  0, 'without a default trial nothing changes for new companies');

select * from finish();
rollback;
