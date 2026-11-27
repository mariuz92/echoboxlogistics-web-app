begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(79);

insert into auth.users (id, email, email_confirmed_at, encrypted_password, raw_user_meta_data) values
  ('bbbb1111-0000-4000-8000-000000000001', 'admin-shifts@example.test', now(), 'x', '{}'),
  ('bbbb1111-0000-4000-8000-000000000002', 'rider1-shifts@example.test', now(), 'x', '{}'),
  ('bbbb1111-0000-4000-8000-000000000003', 'rider2-shifts@example.test', now(), 'x', '{}'),
  ('bbbb1111-0000-4000-8000-000000000004', 'rider3-shifts@example.test', now(), 'x', '{}'),
  ('bbbb1111-0000-4000-8000-000000000005', 'admin2-shifts@example.test', now(), 'x', '{}'),
  ('bbbb1111-0000-4000-8000-000000000006', 'rider4-shifts@example.test', now(), 'x', '{}');
insert into public.tenants(id, name, slug, timezone) values
  ('bbbb1111-0000-4000-8000-0000000000a1', 'Shifts One', 'shifts-one', 'Europe/Rome'), ('bbbb1111-0000-4000-8000-0000000000a2', 'Shifts Two', 'shifts-two', 'Europe/Rome');
insert into public.profiles(id, tenant_id, email, full_name, roles, disabled) values
  ('bbbb1111-0000-4000-8000-000000000001', 'bbbb1111-0000-4000-8000-0000000000a1', 'admin-shifts@example.test', 'Ada Admin', array['admin']::public.app_role[], false),
  ('bbbb1111-0000-4000-8000-000000000002', 'bbbb1111-0000-4000-8000-0000000000a1', 'rider1-shifts@example.test', 'Luca Rider', array['rider']::public.app_role[], false),
  ('bbbb1111-0000-4000-8000-000000000003', 'bbbb1111-0000-4000-8000-0000000000a1', 'rider2-shifts@example.test', 'Sara Rider', array['rider']::public.app_role[], false),
  ('bbbb1111-0000-4000-8000-000000000004', 'bbbb1111-0000-4000-8000-0000000000a1', 'rider3-shifts@example.test', 'Old Rider', array['rider']::public.app_role[], true),
  ('bbbb1111-0000-4000-8000-000000000005', 'bbbb1111-0000-4000-8000-0000000000a2', 'admin2-shifts@example.test', 'Other Admin', array['admin']::public.app_role[], false),
  ('bbbb1111-0000-4000-8000-000000000006', 'bbbb1111-0000-4000-8000-0000000000a2', 'rider4-shifts@example.test', 'Other Rider', array['rider']::public.app_role[], false);

-- A day 3 days ahead, in the company's time zone.
create temp table d as select ((now() at time zone 'Europe/Rome')::date + 3) as day;

-- Availability --------------------------------------------------------------------------------------
set local request.jwt.claim.sub = 'bbbb1111-0000-4000-8000-000000000002';
set local request.jwt.claims = '{"sub":"bbbb1111-0000-4000-8000-000000000002","aal":"aal1"}';
select is(public.save_availability((select day from d), '[{"start":"09:00","end":"13:00"},{"start":"16:00","end":"20:30"}]'::jsonb), 2,
  'a rider sets two hour windows for a day');
select is((select count(*) from public.rider_availability where rider_id = 'bbbb1111-0000-4000-8000-000000000002')::integer, 2, 'they are stored');
select is((select to_char(start_at at time zone 'Europe/Rome', 'HH24:MI') || '-' || to_char(end_at at time zone 'Europe/Rome', 'HH24:MI')
  from public.rider_availability where rider_id = 'bbbb1111-0000-4000-8000-000000000002' order by start_at limit 1), '09:00-13:00', 'in the company''s time zone');
select is(public.save_availability((select day from d), '[{"start":"08:00","end":"24:00"}]'::jsonb), 1,
  'saving the day again replaces its windows (and 24:00 means midnight)');
select is((select count(*) from public.rider_availability where rider_id = 'bbbb1111-0000-4000-8000-000000000002')::integer, 1, 'the old windows are gone');
select is(public.save_availability((select day from d), '[]'::jsonb), 0, 'an empty list clears the day');
select is((select count(*) from public.rider_availability where rider_id = 'bbbb1111-0000-4000-8000-000000000002')::integer, 0, 'nothing left');
select throws_ok($$select public.save_availability((select day from d), '[{"start":"10:00","end":"09:00"}]'::jsonb)$$, '23514', 'invalid_slot',
  'a window must end after it starts');
select throws_ok($$select public.save_availability((select day from d), '[{"start":"09:10","end":"12:00"}]'::jsonb)$$, '23514', 'invalid_slot_minutes',
  'times are on a 15-minute grid');
select throws_ok($$select public.save_availability((select day from d), '[{"start":"09:00","end":"12:00"},{"start":"11:00","end":"14:00"}]'::jsonb)$$,
  '23P01', 'availability_overlap', 'windows of a day cannot overlap');
select throws_ok($$select public.save_availability((select day from d), '[{"start":"9am","end":"12:00"}]'::jsonb)$$, 'P0001', 'invalid_window',
  'times must be HH:MM');
select throws_ok($$select public.save_availability((select day from d) - 10, '[{"start":"09:00","end":"12:00"}]'::jsonb)$$, 'P0001', 'day_in_the_past',
  'a rider cannot change a past day');
select throws_ok($$select public.save_availability((select day from d), '[{"start":"09:00","end":"10:00"}]'::jsonb, 'bbbb1111-0000-4000-8000-000000000003')$$, '42501', 'not_authorized',
  'a rider cannot set another rider''s availability');
-- restore R1 availability for the next tests
select public.save_availability((select day from d), '[{"start":"09:00","end":"13:00"}]'::jsonb);

-- Who sees what -----------------------------------------------------------------------------------------
set local request.jwt.claim.sub = 'bbbb1111-0000-4000-8000-000000000003';
set local request.jwt.claims = '{"sub":"bbbb1111-0000-4000-8000-000000000003","aal":"aal1"}';
select public.save_availability((select day from d), '[{"start":"10:00","end":"14:00"}]'::jsonb);
set local role authenticated;
select is((select count(*) from public.rider_availability)::integer, 1, 'a rider sees only their own availability');
select throws_ok($$insert into public.rider_availability(tenant_id, rider_id, start_at, end_at)
  values ('bbbb1111-0000-4000-8000-0000000000a1', 'bbbb1111-0000-4000-8000-000000000003', now(), now() + interval '1 hour')$$, '42501', null, 'tables cannot be written directly');
reset role;
set local request.jwt.claim.sub = 'bbbb1111-0000-4000-8000-000000000001';
set local request.jwt.claims = '{"sub":"bbbb1111-0000-4000-8000-000000000001","aal":"aal1"}';
set local role authenticated;
select is((select count(*) from public.rider_availability)::integer, 2, 'an admin sees all riders of the company');
reset role;
set local request.jwt.claim.sub = 'bbbb1111-0000-4000-8000-000000000005';
set local request.jwt.claims = '{"sub":"bbbb1111-0000-4000-8000-000000000005","aal":"aal1"}';
set local role authenticated;
select is((select count(*) from public.rider_availability)::integer, 0, 'another company sees nothing');
reset role;

-- Admin: availability for a rider, any day ------------------------------------------------------------
set local request.jwt.claim.sub = 'bbbb1111-0000-4000-8000-000000000001';
set local request.jwt.claims = '{"sub":"bbbb1111-0000-4000-8000-000000000001","aal":"aal1"}';
select is(public.save_availability((select day from d) - 5, '[{"start":"09:00","end":"12:00"}]'::jsonb, 'bbbb1111-0000-4000-8000-000000000003'), 1,
  'an admin can set availability for a rider, even for a past day');
select throws_ok($$select public.save_availability((select day from d), '[]'::jsonb, 'bbbb1111-0000-4000-8000-000000000006')$$, 'P0001', 'rider_not_found',
  'but not for a rider of another company');
select throws_ok($$select public.save_availability((select day from d), '[]'::jsonb, 'bbbb1111-0000-4000-8000-000000000004')$$, 'P0001', 'rider_not_found',
  'nor for a disabled rider');

-- Shifts ----------------------------------------------------------------------------------------------------
select lives_ok($$select public.admin_save_shift('bbbb1111-0000-4000-8000-000000000002', ((select day from d)::timestamp + time '09:00') at time zone 'Europe/Rome',
  ((select day from d)::timestamp + time '13:00') at time zone 'Europe/Rome', 'Morning')$$, 'the admin plans a shift');
select is((select planned_end_at = end_at and planned_start_at = start_at from public.rider_shifts where rider_id = 'bbbb1111-0000-4000-8000-000000000002'), true,
  'the planned times start equal to the paid times');
select is((select count(*) from public.rider_shift_events where event_type = 'created')::integer, 1, 'the creation is recorded');
-- extra hour
select lives_ok($$select public.admin_save_shift('bbbb1111-0000-4000-8000-000000000002', ((select day from d)::timestamp + time '09:00') at time zone 'Europe/Rome',
  ((select day from d)::timestamp + time '14:00') at time zone 'Europe/Rome', 'Stayed longer',
  (select id from public.rider_shifts where rider_id = 'bbbb1111-0000-4000-8000-000000000002'))$$, 'the admin changes it afterwards (an extra hour)');
select is((select (extract(epoch from end_at - start_at) / 60)::integer || '/' || (extract(epoch from planned_end_at - planned_start_at) / 60)::integer
  from public.rider_shifts where rider_id = 'bbbb1111-0000-4000-8000-000000000002'), '300/240', 'paid 5 hours, planned 4 hours');
select is((select count(*) from public.rider_shift_events where event_type = 'changed')::integer, 1, 'the change is recorded');
select ok((select old_end_at < new_end_at and actor_id = 'bbbb1111-0000-4000-8000-000000000001' from public.rider_shift_events where event_type = 'changed'),
  'with the old and new times and who did it');
select throws_ok($$select public.admin_save_shift('bbbb1111-0000-4000-8000-000000000002', ((select day from d)::timestamp + time '13:30') at time zone 'Europe/Rome',
  ((select day from d)::timestamp + time '16:00') at time zone 'Europe/Rome')$$, '23P01', 'shift_overlap', 'a rider cannot have two shifts at once');
select lives_ok($$select public.admin_save_shift('bbbb1111-0000-4000-8000-000000000002', ((select day from d)::timestamp + time '14:00') at time zone 'Europe/Rome',
  ((select day from d)::timestamp + time '16:00') at time zone 'Europe/Rome')$$, 'but shifts can follow each other');
select throws_ok($$select public.admin_save_shift('bbbb1111-0000-4000-8000-000000000002', ((select day from d)::timestamp + time '17:00') at time zone 'Europe/Rome',
  ((select day from d)::timestamp + time '19:10') at time zone 'Europe/Rome')$$, '23514', 'invalid_slot_minutes', 'shifts are on the 15-minute grid too');
select throws_ok($$select public.admin_save_shift('bbbb1111-0000-4000-8000-000000000002', ((select day from d)::timestamp + time '01:00') at time zone 'Europe/Rome',
  ((select day from d)::timestamp + time '23:00') at time zone 'Europe/Rome')$$, '23514', 'invalid_slot', 'a shift is at most 16 hours');
select throws_ok($$select public.admin_save_shift('bbbb1111-0000-4000-8000-000000000004', now() + interval '10 days', now() + interval '10 days 2 hours')$$, 'P0001', 'rider_not_found',
  'a disabled rider cannot be scheduled');
select throws_ok($$select public.admin_save_shift('bbbb1111-0000-4000-8000-000000000006', now() + interval '10 days', now() + interval '10 days 2 hours')$$, 'P0001', 'rider_not_found',
  'nor a rider of another company');

-- Riders cannot manage shifts ---------------------------------------------------------------------------
set local request.jwt.claim.sub = 'bbbb1111-0000-4000-8000-000000000002';
set local request.jwt.claims = '{"sub":"bbbb1111-0000-4000-8000-000000000002","aal":"aal1"}';
select throws_ok($$select public.admin_save_shift('bbbb1111-0000-4000-8000-000000000002', now() + interval '20 days', now() + interval '20 days 2 hours')$$, '42501', 'not_authorized',
  'a rider cannot plan shifts');
select throws_ok($$select public.admin_delete_shift((select id from public.rider_shifts where rider_id = 'bbbb1111-0000-4000-8000-000000000002' limit 1))$$, '42501', 'not_authorized',
  'nor delete them');
select throws_ok($$select public.get_rider_hours(current_date, current_date + 7)$$, '42501', 'not_authorized', 'nor read the hours report');
set local role authenticated;
select is((select count(*) from public.rider_shifts)::integer, 2, 'a rider sees their own shifts');
select is((select count(*) from public.rider_shift_events)::integer, 0, 'but not the history');
reset role;
set local request.jwt.claim.sub = 'bbbb1111-0000-4000-8000-000000000003';
set local request.jwt.claims = '{"sub":"bbbb1111-0000-4000-8000-000000000003","aal":"aal1"}';
set local role authenticated;
select is((select count(*) from public.rider_shifts)::integer, 0, 'and not those of others');
reset role;

-- Cover from availability -----------------------------------------------------------------------------
set local request.jwt.claim.sub = 'bbbb1111-0000-4000-8000-000000000001';
set local request.jwt.claims = '{"sub":"bbbb1111-0000-4000-8000-000000000001","aal":"aal1"}';
select is(public.admin_cover_from_availability((select day from d), (select day from d)), 1,
  'covering the availability creates the shifts that are missing (Sara; Luca already has shifts that day)');
select is((select count(*) from public.rider_shifts where rider_id = 'bbbb1111-0000-4000-8000-000000000003')::integer, 1, 'Sara got a shift equal to her availability');
select is(public.admin_cover_from_availability((select day from d), (select day from d)), 0, 'and it is safe to run again');
select throws_ok($$select public.admin_cover_from_availability(current_date + 30, current_date)$$, 'P0001', 'invalid_period');

-- Hours to pay ------------------------------------------------------------------------------------------
select is((select (r->>'paid_minutes')::integer from jsonb_array_elements(public.get_rider_hours((select day from d), (select day from d))) r
  where r->>'rider_id' = 'bbbb1111-0000-4000-8000-000000000002'), 420, 'Luca''s paid hours: 5 + 2 = 7 hours');
select is((select (r->>'planned_minutes')::integer from jsonb_array_elements(public.get_rider_hours((select day from d), (select day from d))) r
  where r->>'rider_id' = 'bbbb1111-0000-4000-8000-000000000002'), 360, 'against 6 planned');
select is((select (r->>'adjusted')::integer from jsonb_array_elements(public.get_rider_hours((select day from d), (select day from d))) r
  where r->>'rider_id' = 'bbbb1111-0000-4000-8000-000000000002'), 1, 'one shift was adjusted');
select is(jsonb_array_length(public.get_rider_hours((select day from d) + 1, (select day from d) + 2)), 0, 'a period without shifts is empty');

-- Delete, with history ------------------------------------------------------------------------------------
select lives_ok($$select public.admin_delete_shift((select id from public.rider_shifts where rider_id = 'bbbb1111-0000-4000-8000-000000000003'))$$, 'the admin deletes a shift');
select is((select count(*) from public.rider_shift_events where event_type = 'deleted')::integer, 1, 'the history remembers it');
select throws_ok($$select public.admin_delete_shift(gen_random_uuid())$$, 'P0001', 'shift_not_found');

-- Staffing needs and batch creation -----------------------------------------------------------------------
select ok(public.admin_save_need(
  ((select day from d) + 5)::timestamp at time zone 'Europe/Rome' + interval '9 hours',
  ((select day from d) + 5)::timestamp at time zone 'Europe/Rome' + interval '13 hours', 2) is not null, 'the admin sets the riders needed in a block');
select throws_ok($$select public.admin_save_need(
  ((select day from d) + 5)::timestamp at time zone 'Europe/Rome' + interval '12 hours',
  ((select day from d) + 5)::timestamp at time zone 'Europe/Rome' + interval '15 hours', 1)$$, '23P01', 'need_overlap', 'blocks of needs cannot overlap');
select lives_ok($$select public.admin_save_need(
  ((select day from d) + 5)::timestamp at time zone 'Europe/Rome' + interval '13 hours',
  ((select day from d) + 5)::timestamp at time zone 'Europe/Rome' + interval '18 hours', 3)$$, 'but they can touch');
select throws_ok($$select public.admin_save_need(now(), now() + interval '1 hour', 0)$$, 'P0001', 'invalid_riders_needed', 'at least one rider');
select throws_ok($$select public.admin_save_need(now(), now() + interval '1 hour', 51)$$, 'P0001', 'invalid_riders_needed', 'at most 50');
select throws_ok($$select public.admin_save_need(
  ((select day from d) + 6)::timestamp at time zone 'Europe/Rome' + interval '9 hours',
  ((select day from d) + 6)::timestamp at time zone 'Europe/Rome' + interval '8 hours', 1)$$, '23514', 'invalid_need', 'a block must end after it starts');
select throws_ok($$select public.admin_save_need(
  ((select day from d) + 6)::timestamp at time zone 'Europe/Rome' + interval '9 hours 10 minutes',
  ((select day from d) + 6)::timestamp at time zone 'Europe/Rome' + interval '12 hours', 1)$$, '23514', 'invalid_slot_minutes', 'times are on a 15-minute grid');
select lives_ok($$select public.admin_save_need(
  ((select day from d) + 5)::timestamp at time zone 'Europe/Rome' + interval '9 hours',
  ((select day from d) + 5)::timestamp at time zone 'Europe/Rome' + interval '12 hours', 4,
  (select id from public.shift_needs where riders_needed = 2))$$, 'a block can be changed');
select is((select riders_needed from public.shift_needs where start_at = ((select day from d) + 5)::timestamp at time zone 'Europe/Rome' + interval '9 hours')::integer, 4, 'the change is saved');
select throws_ok($$select public.admin_save_need(now(), now() + interval '1 hour', 1, gen_random_uuid())$$, 'P0001', 'need_not_found', 'changing a missing block fails');

-- copy the day's needs to the next two days (and replace what is there)
select is(public.admin_copy_needs((select day from d) + 5, (select day from d) + 5, 1), 2, 'needs of a day are copied to another day');
select is((select count(*) from public.shift_needs where (start_at at time zone 'Europe/Rome')::date = (select day from d) + 6)::integer, 2, 'they are there');
select is(public.admin_copy_needs((select day from d) + 5, (select day from d) + 5, 1), 2, 'copying again replaces instead of piling up');
select is((select count(*) from public.shift_needs where (start_at at time zone 'Europe/Rome')::date = (select day from d) + 6)::integer, 2, 'still two');
select throws_ok($$select public.admin_copy_needs((select day from d), (select day from d) + 6, 3)$$, 'P0001', 'invalid_period', 'the target cannot overlap the source');
select lives_ok($$select public.admin_delete_need((select id from public.shift_needs where riders_needed = 3 and (start_at at time zone 'Europe/Rome')::date = (select day from d) + 6))$$, 'a block is deleted');
select throws_ok($$select public.admin_delete_need(gen_random_uuid())$$, 'P0001', 'need_not_found');

-- several shifts at once, all or none
select is(public.admin_create_shifts(jsonb_build_array(
  jsonb_build_object('rider_id', 'bbbb1111-0000-4000-8000-000000000003',
    'start_at', ((select day from d) + 5)::timestamp at time zone 'Europe/Rome' + interval '9 hours',
    'end_at', ((select day from d) + 5)::timestamp at time zone 'Europe/Rome' + interval '13 hours'),
  jsonb_build_object('rider_id', 'bbbb1111-0000-4000-8000-000000000002',
    'start_at', ((select day from d) + 5)::timestamp at time zone 'Europe/Rome' + interval '9 hours',
    'end_at', ((select day from d) + 5)::timestamp at time zone 'Europe/Rome' + interval '12 hours'))), 2, 'the auto-fill creates its shifts in one go');
select throws_ok($$select public.admin_create_shifts(jsonb_build_array(
  jsonb_build_object('rider_id', 'bbbb1111-0000-4000-8000-000000000003',
    'start_at', ((select day from d) + 8)::timestamp at time zone 'Europe/Rome' + interval '9 hours',
    'end_at', ((select day from d) + 8)::timestamp at time zone 'Europe/Rome' + interval '12 hours'),
  jsonb_build_object('rider_id', 'bbbb1111-0000-4000-8000-000000000003',
    'start_at', ((select day from d) + 8)::timestamp at time zone 'Europe/Rome' + interval '11 hours',
    'end_at', ((select day from d) + 8)::timestamp at time zone 'Europe/Rome' + interval '14 hours')))$$, '23P01', 'shift_overlap', 'an overlap stops the whole batch');
select is((select count(*) from public.rider_shifts where (start_at at time zone 'Europe/Rome')::date = (select day from d) + 8)::integer, 0, 'and nothing of it is kept');
select throws_ok($$select public.admin_create_shifts('[{"rider_id":"not-a-uuid"}]'::jsonb)$$, 'P0001', 'invalid_shifts', 'a malformed batch is refused');
select throws_ok($$select public.admin_create_shifts(jsonb_build_array(jsonb_build_object('rider_id', 'bbbb1111-0000-4000-8000-000000000004',
  'start_at', now() + interval '40 days', 'end_at', now() + interval '40 days 2 hours')))$$, 'P0001', 'rider_not_found', 'a disabled rider cannot be scheduled in a batch');

-- needs are for admins only
set local request.jwt.claim.sub = 'bbbb1111-0000-4000-8000-000000000002';
set local request.jwt.claims = '{"sub":"bbbb1111-0000-4000-8000-000000000002","aal":"aal1"}';
select throws_ok($$select public.admin_save_need(now(), now() + interval '1 hour', 1)$$, '42501', 'not_authorized', 'a rider cannot set needs');
select throws_ok($$select public.admin_create_shifts('[]'::jsonb)$$, '42501', 'not_authorized', 'nor create shifts in a batch');
set local role authenticated;
select is((select count(*) from public.shift_needs)::integer, 0, 'and cannot read them');
reset role;
set local request.jwt.claim.sub = 'bbbb1111-0000-4000-8000-000000000005';
set local request.jwt.claims = '{"sub":"bbbb1111-0000-4000-8000-000000000005","aal":"aal1"}';
set local role authenticated;
select is((select count(*) from public.shift_needs)::integer, 0, 'an admin of another company does not see them');
reset role;
set local request.jwt.claim.sub = 'bbbb1111-0000-4000-8000-000000000001';
set local request.jwt.claims = '{"sub":"bbbb1111-0000-4000-8000-000000000001","aal":"aal1"}';

-- A rider with shifts is disabled, not deleted ------------------------------------------------------------
select throws_ok($$delete from public.profiles where id = 'bbbb1111-0000-4000-8000-000000000002'$$, '23503', null, 'a rider with shifts cannot be deleted');

-- The company can be restricted (unpaid): nothing is written --------------------------------------------
insert into private.company_subscriptions(tenant_id, plan_code, state) values ('bbbb1111-0000-4000-8000-0000000000a1', 'starter', 'expired');
select throws_ok($$select public.admin_save_shift('bbbb1111-0000-4000-8000-000000000003', now() + interval '30 days', now() + interval '30 days 2 hours')$$, '42501', 'company_access_restricted',
  'a read-only company cannot plan shifts');
set local request.jwt.claim.sub = 'bbbb1111-0000-4000-8000-000000000002';
set local request.jwt.claims = '{"sub":"bbbb1111-0000-4000-8000-000000000002","aal":"aal1"}';
select throws_ok($$select public.save_availability((select day from d), '[]'::jsonb)$$, '42501', 'company_access_restricted',
  'nor change availability');

select * from finish();
rollback;
