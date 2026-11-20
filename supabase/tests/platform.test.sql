begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(24);

insert into auth.users (id, email, email_confirmed_at, encrypted_password, raw_user_meta_data)
values
  ('cccc0000-0000-4000-8000-000000000001', 'operator-platform@example.test', now(), 'test-hash', '{}'),
  ('cccc0000-0000-4000-8000-000000000002', 'owner-platform@example.test', now(), 'test-hash', '{}'),
  ('cccc0000-0000-4000-8000-000000000003', 'regular-platform@example.test', now(), 'test-hash', '{"company_name":"Unapproved Company"}');
insert into private.platform_admins(user_id) values ('cccc0000-0000-4000-8000-000000000001');

set local role authenticated;
set local request.jwt.claim.sub = 'cccc0000-0000-4000-8000-000000000001';
set local request.jwt.claims = '{"sub":"cccc0000-0000-4000-8000-000000000001","aal":"aal1"}';
select is(public.platform_operator_status(), 'mfa_required');
select throws_ok($$select public.platform_console_snapshot()$$, '42501', 'operator_access_denied',
  'first-factor sessions cannot read console data');

set local request.jwt.claims = '{"sub":"cccc0000-0000-4000-8000-000000000001","aal":"aal2"}';
select is(public.platform_operator_status(), 'ready');
select lives_ok($$select public.platform_console_action('create_company',
  '{"name":"Platform Test Company","email":"owner-platform@example.test","reason":"Provision pilot"}')$$);
select ok((public.platform_console_snapshot(null, 'Platform Test Company')->'companies'->0->>'id') is not null,
  'operators can locate a company they created');
select throws_ok($$select * from private.platform_admins$$, '42501', null,
  'operator sessions cannot read private tables directly');
select lives_ok($$select public.platform_console_action('save_settings',
  '{"operator_only_companies":true,"booking_paused":false,"notice":"","reason":"Start controlled signup"}')$$);

set local request.jwt.claim.sub = 'cccc0000-0000-4000-8000-000000000003';
set local request.jwt.claims = '{"sub":"cccc0000-0000-4000-8000-000000000003","aal":"aal2"}';
select throws_ok($$select public.platform_console_action('set_operator',
  '{"enabled":true,"email":"regular-platform@example.test","reason":"Unauthorized"}')$$,
  '42501', 'operator_access_denied', 'a regular user with MFA cannot grant operator access');
select throws_ok($$select public.bootstrap_profile()$$, 'P0001', 'invitation_required',
  'operator-only mode blocks metadata-based company creation');

set local request.jwt.claim.sub = 'cccc0000-0000-4000-8000-000000000002';
set local request.jwt.claims = '{"sub":"cccc0000-0000-4000-8000-000000000002","aal":"aal1"}';
select throws_ok($$select public.bootstrap_profile()$$, 'P0001', 'invitation_pending',
  'a sign-in alone does not accept an operator invitation');
select is((public.accept_platform_invitation()).id, 'cccc0000-0000-4000-8000-000000000002'::uuid);
select throws_ok($$select public.update_member('cccc0000-0000-4000-8000-000000000002', null, null, null, true)$$,
  'P0001', 'last_admin', 'the owner cannot disable the only administrator');
select ok(public.report_platform_issue('web','data','query_error') is not null,
  'a signed-in customer can submit a structured issue');
select lives_ok($$insert into public.orders (id, tenant_id, guide_name, delivery_at, delivery_address)
  select 'cccc0000-0000-4000-8000-000000000004', p.tenant_id, 'Platform Test Guide', now(), 'Test address'
  from public.profiles p where p.id = 'cccc0000-0000-4000-8000-000000000002'$$,
  'active companies can create orders');

set local request.jwt.claim.sub = 'cccc0000-0000-4000-8000-000000000001';
set local request.jwt.claims = '{"sub":"cccc0000-0000-4000-8000-000000000001","aal":"aal2"}';
select lives_ok($$select public.platform_console_action('save_plan',
  '{"code":"pilot","name":"Pilot plan","reason":"Trial pricing"}')$$);
select lives_ok($$select public.platform_console_action('save_subscription', jsonb_build_object(
  'tenant_id', public.platform_console_snapshot(null, 'Platform Test Company')->'companies'->0->>'id',
  'plan_code', 'pilot', 'state', 'expired', 'reason', 'Pilot ended'))$$);
select is(public.platform_console_snapshot()->'issues'->0->>'code', 'query_error');

set local request.jwt.claim.sub = 'cccc0000-0000-4000-8000-000000000002';
set local request.jwt.claims = '{"sub":"cccc0000-0000-4000-8000-000000000002","aal":"aal1"}';
select is(public.platform_company_access(), 'read_only');
select is((select accepting_bookings from public.get_public_tenant('platform-test-company')), false);
select is((select count(*) from public.orders where id = 'cccc0000-0000-4000-8000-000000000004'),
  1::bigint, 'read-only companies retain order history');
with changed as (
  update public.orders set notes = 'restricted' where id = 'cccc0000-0000-4000-8000-000000000004' returning id
)
select is((select count(*) from changed), 0::bigint, 'read-only companies cannot edit orders directly');
select throws_ok($$select public.admin_set_status('cccc0000-0000-4000-8000-000000000004', 'cancelled')$$,
  '42501', 'company_access_restricted', 'read-only companies cannot bypass access via order RPCs');

set local request.jwt.claim.sub = 'cccc0000-0000-4000-8000-000000000001';
set local request.jwt.claims = '{"sub":"cccc0000-0000-4000-8000-000000000001","aal":"aal2"}';
select lives_ok($$select public.platform_console_action('set_company_active', jsonb_build_object(
  'tenant_id', public.platform_console_snapshot(null, 'Platform Test Company')->'companies'->0->>'id',
  'active', false, 'reason', 'Review account access'))$$);

set local request.jwt.claim.sub = 'cccc0000-0000-4000-8000-000000000002';
set local request.jwt.claims = '{"sub":"cccc0000-0000-4000-8000-000000000002","aal":"aal1"}';
select is((select count(*) from public.orders where id = 'cccc0000-0000-4000-8000-000000000004'),
  0::bigint, 'suspension takes effect for an already-issued customer JWT');

select * from finish();
rollback;
