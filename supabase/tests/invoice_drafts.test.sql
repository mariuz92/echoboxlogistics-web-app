begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(32);

insert into auth.users (id, email, email_confirmed_at, encrypted_password, raw_user_meta_data) values
  ('ffff0000-0000-4000-8000-000000000001', 'operator-drafts@example.test', now(), 'test-hash', '{}'),
  ('ffff0000-0000-4000-8000-000000000002', 'regular-drafts@example.test', now(), 'test-hash', '{}'),
  ('ffff0000-0000-4000-8000-000000000010', 'rider-10@example.test', now(), 'test-hash', '{}'),
  ('ffff0000-0000-4000-8000-000000000011', 'rider-11@example.test', now(), 'test-hash', '{}'),
  ('ffff0000-0000-4000-8000-000000000012', 'rider-12@example.test', now(), 'test-hash', '{}'),
  ('ffff0000-0000-4000-8000-000000000013', 'rider-13@example.test', now(), 'test-hash', '{}'),
  ('ffff0000-0000-4000-8000-000000000014', 'rider-14@example.test', now(), 'test-hash', '{}'),
  ('ffff0000-0000-4000-8000-000000000015', 'rider-15@example.test', now(), 'test-hash', '{}'),
  ('ffff0000-0000-4000-8000-000000000016', 'rider-16@example.test', now(), 'test-hash', '{}'),
  ('ffff0000-0000-4000-8000-000000000017', 'rider-17@example.test', now(), 'test-hash', '{}');
insert into private.platform_admins(user_id) values ('ffff0000-0000-4000-8000-000000000001');
insert into public.tenants(id, name, slug) values
  ('ffff0000-0000-4000-8000-0000000000a1', 'Drafts A', 'drafts-a'),
  ('ffff0000-0000-4000-8000-0000000000b1', 'Drafts B', 'drafts-b'),
  ('ffff0000-0000-4000-8000-0000000000c1', 'Drafts C', 'drafts-c'),
  ('ffff0000-0000-4000-8000-0000000000d1', 'Drafts D', 'drafts-d'),
  ('ffff0000-0000-4000-8000-0000000000e1', 'Drafts E', 'drafts-e'),
  ('ffff0000-0000-4000-8000-0000000000f1', 'Drafts F', 'drafts-f'),
  ('ffff0000-0000-4000-8000-0000000000a2', 'Drafts G', 'drafts-g'),
  ('ffff0000-0000-4000-8000-0000000000b2', 'Drafts H', 'drafts-h'),
  ('ffff0000-0000-4000-8000-0000000000c2', 'Drafts I', 'drafts-i');
insert into public.profiles(id, tenant_id, email, roles) values
  ('ffff0000-0000-4000-8000-000000000010', 'ffff0000-0000-4000-8000-0000000000a1', 'rider-10@example.test', array['rider']::public.app_role[]),
  ('ffff0000-0000-4000-8000-000000000011', 'ffff0000-0000-4000-8000-0000000000a1', 'rider-11@example.test', array['rider']::public.app_role[]),
  ('ffff0000-0000-4000-8000-000000000012', 'ffff0000-0000-4000-8000-0000000000a1', 'rider-12@example.test', array['rider']::public.app_role[]),
  ('ffff0000-0000-4000-8000-000000000013', 'ffff0000-0000-4000-8000-0000000000a1', 'rider-13@example.test', array['rider']::public.app_role[]),
  ('ffff0000-0000-4000-8000-000000000014', 'ffff0000-0000-4000-8000-0000000000b1', 'rider-14@example.test', array['rider']::public.app_role[]),
  ('ffff0000-0000-4000-8000-000000000015', 'ffff0000-0000-4000-8000-0000000000b1', 'rider-15@example.test', array['rider']::public.app_role[]),
  ('ffff0000-0000-4000-8000-000000000016', 'ffff0000-0000-4000-8000-0000000000b1', 'rider-16@example.test', array['rider']::public.app_role[]),
  ('ffff0000-0000-4000-8000-000000000017', 'ffff0000-0000-4000-8000-0000000000b1', 'rider-17@example.test', array['rider']::public.app_role[]);
insert into private.company_subscriptions(tenant_id, plan_code, state, billing_interval, ends_at, forever) values
  ('ffff0000-0000-4000-8000-0000000000a1', 'starter', 'active', 'month', null, false),
  ('ffff0000-0000-4000-8000-0000000000b1', 'starter', 'active', 'year', now() + interval '200 days', false),
  ('ffff0000-0000-4000-8000-0000000000c1', 'starter', 'active', 'year', now() + interval '200 days', false),
  ('ffff0000-0000-4000-8000-0000000000d1', 'starter', 'trial', 'month', now() + interval '10 days', false),
  ('ffff0000-0000-4000-8000-0000000000e1', 'starter', 'active', 'month', null, true),
  ('ffff0000-0000-4000-8000-0000000000f1', 'starter', 'cancelled', 'month', now(), false);
insert into private.company_subscriptions(tenant_id, plan_code, state, billing_interval, ends_at, next_plan_code, next_billing_interval)
values ('ffff0000-0000-4000-8000-0000000000b2', 'pro', 'active', 'year', now() + interval '10 days', 'starter', 'year');
insert into public.orders(tenant_id, guide_name, delivery_at, delivery_address) select 'ffff0000-0000-4000-8000-0000000000a1', 'G' || n, now(), 'Via ' || n from generate_series(1, 305) n;
insert into public.orders(tenant_id, guide_name, delivery_at, delivery_address) select 'ffff0000-0000-4000-8000-0000000000b1', 'G' || n, now(), 'Via ' || n from generate_series(1, 305) n;
insert into public.orders(tenant_id, guide_name, delivery_at, delivery_address) select 'ffff0000-0000-4000-8000-0000000000c1', 'G' || n, now(), 'Via ' || n from generate_series(1, 10) n;
insert into public.orders(tenant_id, guide_name, delivery_at, delivery_address) select 'ffff0000-0000-4000-8000-0000000000d1', 'G' || n, now(), 'Via ' || n from generate_series(1, 305) n;
insert into public.orders(tenant_id, guide_name, delivery_at, delivery_address) select 'ffff0000-0000-4000-8000-0000000000e1', 'G' || n, now(), 'Via ' || n from generate_series(1, 305) n;
insert into public.orders(tenant_id, guide_name, delivery_at, delivery_address) select 'ffff0000-0000-4000-8000-0000000000f1', 'G' || n, now(), 'Via ' || n from generate_series(1, 305) n;
update public.orders set created_at = (date_trunc('month', now() at time zone 'Europe/Rome') - interval '10 days') at time zone 'Europe/Rome' where tenant_id in ('ffff0000-0000-4000-8000-0000000000a1','ffff0000-0000-4000-8000-0000000000b1','ffff0000-0000-4000-8000-0000000000c1','ffff0000-0000-4000-8000-0000000000d1','ffff0000-0000-4000-8000-0000000000e1','ffff0000-0000-4000-8000-0000000000f1');
insert into public.orders(tenant_id, guide_name, delivery_at, delivery_address) values ('ffff0000-0000-4000-8000-0000000000a1', 'This month 1', now(), 'Via'), ('ffff0000-0000-4000-8000-0000000000a1', 'This month 2', now(), 'Via');
create temp table prev_key as select to_char(date_trunc('month', now() at time zone 'Europe/Rome') - interval '1 month', 'YYYY-MM') as k, (date_trunc('month', now() at time zone 'Europe/Rome') - interval '1 month')::date as first;

-- What gets a draft -------------------------------------------------------------------------
select is(private.generate_invoice_drafts(), 3,
  'drafts: monthly company, yearly company with extras, and the yearly renewal that is due');
select is((select amount from private.company_invoices where tenant_id = 'ffff0000-0000-4000-8000-0000000000a1'), 42::numeric,
  'a monthly plan is invoiced base + extras of the closed month (29 + 5 + 8)');
select ok((select status = 'draft' and number like 'BOZZA-%' and auto_key = 'month:' || (select k from prev_key)
  from private.company_invoices where tenant_id = 'ffff0000-0000-4000-8000-0000000000a1'), 'it is a draft with a placeholder number and a key');
select is((select period_start from private.company_invoices where tenant_id = 'ffff0000-0000-4000-8000-0000000000a1'), (select first from prev_key),
  'the period is the month that has just ended');
select is((select count(*) from private.company_invoices where tenant_id = 'ffff0000-0000-4000-8000-0000000000a1' and amount = 42)::integer, 1,
  'orders of the current month are not in the draft');
select is((select amount from private.company_invoices where tenant_id = 'ffff0000-0000-4000-8000-0000000000b1' and auto_key like 'month:%'), 13::numeric,
  'a yearly plan is invoiced the extras only (5 + 8)');
select ok(not exists (select 1 from private.company_invoices i, jsonb_array_elements(i.lines) l
  where i.tenant_id = 'ffff0000-0000-4000-8000-0000000000b1' and i.auto_key like 'month:%' and l->>'code' = 'base'), 'no base fee on a yearly plan''s monthly draft');
select is((select count(*) from private.company_invoices where tenant_id = 'ffff0000-0000-4000-8000-0000000000c1')::integer, 0,
  'a yearly company within its limits gets no draft');
select is((select count(*) from private.company_invoices
  where tenant_id in ('ffff0000-0000-4000-8000-0000000000d1', 'ffff0000-0000-4000-8000-0000000000e1', 'ffff0000-0000-4000-8000-0000000000f1', 'ffff0000-0000-4000-8000-0000000000a2'))::integer, 0,
  'trials, forever, cancelled and companies without a subscription are skipped');
select is((select amount from private.company_invoices where tenant_id = 'ffff0000-0000-4000-8000-0000000000b2' and auto_key like 'renewal:%'), 290::numeric,
  'a yearly renewal is invoiced with the plan that applies next (the scheduled downgrade: Starter yearly)');
select ok((select period_start = (ends_at at time zone 'Europe/Rome')::date from private.company_invoices i
  join private.company_subscriptions s on s.tenant_id = i.tenant_id where i.tenant_id = 'ffff0000-0000-4000-8000-0000000000b2'), 'the renewal starts when the term ends');
select is(private.generate_invoice_drafts(), 0, 'running it again creates nothing');


-- Review and issue ---------------------------------------------------------------------------
set local request.jwt.claim.sub = 'ffff0000-0000-4000-8000-000000000001';
set local request.jwt.claims = '{"sub":"ffff0000-0000-4000-8000-000000000001","aal":"aal2"}';
select lives_ok($$select public.platform_billing_action('set_invoice_status', jsonb_build_object(
  'invoice_id', (select id from private.company_invoices where tenant_id = 'ffff0000-0000-4000-8000-0000000000a1'), 'status', 'issued', 'reason', 'Reviewed'))$$);
select ok((select number like 'EB-%' and due_at is not null and status = 'issued' from private.company_invoices where tenant_id = 'ffff0000-0000-4000-8000-0000000000a1'),
  'issuing a draft gives it the real number and a due date');
select throws_ok($$select public.platform_billing_action('delete_invoice', jsonb_build_object(
  'invoice_id', (select id from private.company_invoices where tenant_id = 'ffff0000-0000-4000-8000-0000000000b1' and auto_key like 'month:%'), 'reason', 'Remove'))$$,
  'P0001', 'auto_invoice_use_void', 'an automatic draft is voided, not deleted');
select lives_ok($$select public.platform_billing_action('set_invoice_status', jsonb_build_object(
  'invoice_id', (select id from private.company_invoices where tenant_id = 'ffff0000-0000-4000-8000-0000000000b1' and auto_key like 'month:%'), 'status', 'void', 'reason', 'Not needed'))$$);
select is(private.generate_invoice_drafts(), 0, 'a voided draft is not generated again');

select lives_ok($$select public.platform_update_draft_invoice(
  (select id from private.company_invoices where tenant_id = 'ffff0000-0000-4000-8000-0000000000b2' and auto_key like 'renewal:%'),
  '[{"code":"custom","label":"Renewal with discount","quantity":1,"unit_price":250,"amount":250}]'::jsonb, 'Agreed discount')$$);
select is((select amount from private.company_invoices where tenant_id = 'ffff0000-0000-4000-8000-0000000000b2' and auto_key like 'renewal:%'), 250::numeric,
  'a draft can be corrected before issuing');
select throws_ok($$select public.platform_update_draft_invoice(
  (select id from private.company_invoices where tenant_id = 'ffff0000-0000-4000-8000-0000000000a1'),
  '[{"label":"x","amount":1}]'::jsonb, 'Too late')$$, 'P0001', 'invoice_not_draft', 'an issued invoice cannot be edited');
select throws_ok($$select public.platform_update_draft_invoice(
  (select id from private.company_invoices where tenant_id = 'ffff0000-0000-4000-8000-0000000000b2' and auto_key like 'renewal:%'),
  '[{"label":"x","amount":"abc"}]'::jsonb, 'Bad')$$, 'P0001', 'invalid_lines', 'lines need numeric amounts');


-- A chosen month --------------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '', true);
insert into public.orders(tenant_id, guide_name, delivery_at, delivery_address)
select 'ffff0000-0000-4000-8000-0000000000a1', 'Old ' || n, now(), 'Via' from generate_series(1, 20) n;
update public.orders set created_at = ((date_trunc('month', now() at time zone 'Europe/Rome') - interval '2 months') + interval '5 days') at time zone 'Europe/Rome' where guide_name like 'Old %';
set local request.jwt.claim.sub = 'ffff0000-0000-4000-8000-000000000001';
set local request.jwt.claims = '{"sub":"ffff0000-0000-4000-8000-000000000001","aal":"aal2"}';
select is(public.platform_generate_invoices('Past month', ((date_trunc('month', now() at time zone 'Europe/Rome') - interval '2 months'))::date, 'ffff0000-0000-4000-8000-0000000000a1'), 1,
  'the operator can prepare the draft of an earlier month for one company');
select is((select amount from private.company_invoices where tenant_id = 'ffff0000-0000-4000-8000-0000000000a1' and auto_key = 'month:' || to_char((date_trunc('month', now() at time zone 'Europe/Rome') - interval '2 months'), 'YYYY-MM')),
  34::numeric, 'with the figures of that month (29 + 1 extra rider)');
select is(public.platform_generate_invoices('Again', ((date_trunc('month', now() at time zone 'Europe/Rome') - interval '2 months'))::date, 'ffff0000-0000-4000-8000-0000000000a1'), 0, 'and not twice');
select is(public.platform_generate_invoices('Not closed', date_trunc('month', now() at time zone 'Europe/Rome')::date, 'ffff0000-0000-4000-8000-0000000000a1'), 0,
  'a month that is not over has no draft');
select throws_ok($$select public.platform_generate_invoices('Bad month', '2026-01-15')$$, 'P0001', 'month_invalid');

set local request.jwt.claim.sub = 'ffff0000-0000-4000-8000-000000000002';
set local request.jwt.claims = '{"sub":"ffff0000-0000-4000-8000-000000000002","aal":"aal2"}';
select throws_ok($$select public.platform_generate_invoices('Not allowed')$$, '42501', 'operator_access_denied',
  'only operators prepare invoices');
set local request.jwt.claim.sub = 'ffff0000-0000-4000-8000-000000000001';
set local request.jwt.claims = '{"sub":"ffff0000-0000-4000-8000-000000000001","aal":"aal2"}';
select ok((public.platform_billing_overview()->'summary'->>'drafts')::integer >= 1, 'the console counts drafts waiting for review');
select ok((select bool_or(i->>'auto_key' is not null) from jsonb_array_elements(public.platform_billing_overview()->'invoices') i),
  'the console list tells which invoices are automatic');

-- The worker prepares drafts by itself, at most once an hour -----------------------------------
insert into private.platform_settings(singleton, invoices_generated_at) values (true, null)
on conflict (singleton) do update set invoices_generated_at = null;
select set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '', true);
insert into private.company_subscriptions(tenant_id, plan_code, state, billing_interval) values ('ffff0000-0000-4000-8000-0000000000c2', 'starter', 'active', 'month');
insert into public.orders(tenant_id, guide_name, delivery_at, delivery_address)
select 'ffff0000-0000-4000-8000-0000000000c2', 'W' || n, now(), 'Via' from generate_series(1, 305) n;
update public.orders set created_at = (date_trunc('month', now() at time zone 'Europe/Rome') - interval '10 days') at time zone 'Europe/Rome'
where tenant_id = 'ffff0000-0000-4000-8000-0000000000c2';
set local request.jwt.claim.sub = 'ffff0000-0000-4000-8000-000000000001';
set local request.jwt.claims = '{"sub":"ffff0000-0000-4000-8000-000000000001","aal":"aal2"}';
select lives_ok($$select public.claim_billing_notices(5)$$);
select is((select count(*) from private.company_invoices where tenant_id = 'ffff0000-0000-4000-8000-0000000000c2' and status = 'draft')::integer, 1,
  'the worker call prepared the draft of another company');
select ok((select invoices_generated_at > now() - interval '1 minute' from private.platform_settings), 'and noted when it ran');

select * from finish();
rollback;
