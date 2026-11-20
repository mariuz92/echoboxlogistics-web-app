begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(46);

insert into auth.users (id, email, email_confirmed_at, encrypted_password, raw_user_meta_data)
values
  ('cccc0000-0000-4000-8000-000000000001', 'operator-platform@example.test', now(), 'test-hash', '{}'),
  ('cccc0000-0000-4000-8000-000000000002', 'owner-platform@example.test', now(), 'test-hash', '{}'),
  ('cccc0000-0000-4000-8000-000000000003', 'regular-platform@example.test', now(), 'test-hash', '{"company_name":"Unapproved Company"}');
insert into private.platform_admins(user_id) values ('cccc0000-0000-4000-8000-000000000001');
insert into public.tenants(id, name, slug)
values ('cccc0000-0000-4000-8000-000000000005', 'Another Platform Company', 'another-platform-company');
insert into private.platform_issues (tenant_id, source, area, code, build)
select 'cccc0000-0000-4000-8000-000000000005', 'backend', 'test', 'other_issue_' || n, null
from generate_series(1, 26) n;

set local role authenticated;
set local request.jwt.claim.sub = 'cccc0000-0000-4000-8000-000000000001';
set local request.jwt.claims = '{"sub":"cccc0000-0000-4000-8000-000000000001","aal":"aal1"}';
select is(public.platform_operator_status(), 'mfa_required');
select throws_ok($$select public.platform_console_snapshot()$$, '42501', 'operator_access_denied',
  'first-factor sessions cannot read console data');
select throws_ok($$select public.platform_issue_queue()$$, '42501', 'operator_access_denied',
  'first-factor sessions cannot read support queues');

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
select throws_ok($$select public.platform_issue_detail(gen_random_uuid())$$, '42501', 'operator_access_denied',
  'a regular user with MFA cannot inspect an issue');
select throws_ok($$select public.platform_issue_triage(gen_random_uuid(),0,'resolved','info','Unauthorized')$$,
  '42501', 'operator_access_denied', 'a regular user with MFA cannot triage issues');
select throws_ok($$select public.platform_order_history(gen_random_uuid(),gen_random_uuid())$$,
  '42501', 'operator_access_denied', 'a regular user with MFA cannot use the support order journal');
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
select is(public.platform_console_snapshot(
  (public.platform_console_snapshot(null, 'Platform Test Company')->'companies'->0->>'id')::uuid
)->'issues'->0->>'code', 'query_error');
select is((public.platform_issue_queue(p_source => 'web', p_search => 'QUERY_ERROR')->>'total')::integer,
  1, 'issue filters apply to all matching reports');
select is((public.platform_issue_queue(p_source => 'flutter')->>'total')::integer,
  0, 'the source filter excludes web reports');
select is((public.platform_issue_queue(p_tenant_id => 'cccc0000-0000-4000-8000-000000000005', p_source => 'web')->>'total')::integer,
  0, 'a company queue does not include issues for another company');
select is((public.platform_issue_queue(p_source => 'backend')->>'total')::integer, 26, 'the total covers all pages');
select is(jsonb_array_length(public.platform_issue_queue(p_source => 'backend')->'issues'), 25, 'issue pages are bounded');
select is(jsonb_array_length(public.platform_issue_queue(p_source => 'backend', p_offset => 25)->'issues'), 1,
  'the next page contains the remaining issue');
select throws_ok($$select public.platform_issue_triage((public.platform_issue_queue(p_source => 'web')->'issues'->0->>'id')::uuid, 0,
  'investigating', 'critical', 'Unverified owner', 'cccc0000-0000-4000-8000-000000000003')$$,
  'P0001', 'issue_assignee_unavailable', 'assignees must be active platform operators');
select lives_ok($$select public.platform_issue_triage((public.platform_issue_queue(p_source => 'web')->'issues'->0->>'id')::uuid, 0,
  'resolved', 'critical', 'Recovered data query', 'cccc0000-0000-4000-8000-000000000001')$$,
  'the operator can record a resolution and assign responsibility');
select is((public.platform_issue_queue(p_source => 'web')->>'total')::integer, 0, 'resolved issues leave the active queue');
select is(public.platform_issue_queue(p_state => 'resolved', p_severity => 'critical')->'issues'->0->>'assignee_email',
  'operator-platform@example.test', 'the queue includes the assignee');
select is(public.platform_issue_detail((public.platform_issue_queue(p_state => 'resolved')->'issues'->0->>'id')::uuid)
  ->'activity'->0->>'reason', 'Recovered data query', 'the resolution is in the issue audit history');
select throws_ok($$select public.platform_issue_triage(
  (public.platform_issue_queue(p_state => 'resolved')->'issues'->0->>'id')::uuid, 0, 'open', 'info', 'Stale change')$$,
  'P0001', 'issue_triage_changed', 'a stale operator edit fails');
select is(public.platform_order_history(
  (public.platform_console_snapshot(null, 'Platform Test Company')->'companies'->0->>'id')::uuid,
  'cccc0000-0000-4000-8000-000000000004')->0->>'event_type', 'created', 'the order journal includes its creation');
select ok(not (public.platform_order_history(
  (public.platform_console_snapshot(null, 'Platform Test Company')->'companies'->0->>'id')::uuid,
  'cccc0000-0000-4000-8000-000000000004')->0 ? 'payload'), 'the support journal excludes raw payloads');
select throws_ok($$select public.platform_order_history('cccc0000-0000-4000-8000-000000000005', 'cccc0000-0000-4000-8000-000000000004')$$,
  'P0001', 'order_not_found', 'an order from another company cannot be opened with a mismatched scope');

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
select ok(public.report_platform_issue('web','data','query_error') is not null, 'a repeated report reopens the resolved issue');

set local request.jwt.claim.sub = 'cccc0000-0000-4000-8000-000000000001';
set local request.jwt.claims = '{"sub":"cccc0000-0000-4000-8000-000000000001","aal":"aal2"}';
select is((public.platform_issue_detail((public.platform_issue_queue(p_source => 'web')->'issues'->0->>'id')::uuid)
  ->'issue'->>'triage_version')::integer, 2, 'automatic reopening invalidates edits opened on a resolved issue');
select is((public.platform_issue_queue(p_source => 'web')->'issues'->0->>'occurrences')::integer, 2,
  'recurrence retains the original issue and increments its counter');
select lives_ok($$select public.platform_console_action('set_company_active', jsonb_build_object(
  'tenant_id', public.platform_console_snapshot(null, 'Platform Test Company')->'companies'->0->>'id',
  'active', false, 'reason', 'Review account access'))$$);

set local request.jwt.claim.sub = 'cccc0000-0000-4000-8000-000000000002';
set local request.jwt.claims = '{"sub":"cccc0000-0000-4000-8000-000000000002","aal":"aal1"}';
select is((select count(*) from public.orders where id = 'cccc0000-0000-4000-8000-000000000004'),
  0::bigint, 'suspension takes effect for an already-issued customer JWT');

select * from finish();
rollback;
