-- =============================================================================
-- Local development seed data.  NEVER run this against a production project.
--
-- Demo logins (local stack only):
--   admin@echobox.test   / Password123!   (admin)
--   rider1@echobox.test  / Password123!   (rider)
--   rider2@echobox.test  / Password123!   (rider)
--
-- Public booking page for the demo company: /book/echobox-demo
-- =============================================================================

-- The seed writes statuses/riders directly, so open the order-actions gate for
-- this session (see private.orders_guard).
select set_config('app.order_actions', 'on', false);

-- -----------------------------------------------------------------------------
-- Tenant
-- -----------------------------------------------------------------------------
insert into public.tenants (id, name, slug, description, radio_channels_total)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'EchoBox Demo', 'echobox-demo',
        'Demo company for local development', 35);

-- -----------------------------------------------------------------------------
-- Auth users + profiles
-- -----------------------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change)
values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-4111-8111-111111111111',
   'authenticated', 'authenticated', 'admin@echobox.test',
   extensions.crypt('Password123!', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Demo Admin"}',
   now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-4222-8222-222222222222',
   'authenticated', 'authenticated', 'rider1@echobox.test',
   extensions.crypt('Password123!', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Luca Rider"}',
   now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '33333333-3333-4333-8333-333333333333',
   'authenticated', 'authenticated', 'rider2@echobox.test',
   extensions.crypt('Password123!', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Sara Rider"}',
   now(), now(), '', '', '', '');

insert into auth.identities (id, user_id, provider_id, identity_data, provider,
                             last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email', now(), now(), now()
from auth.users u
where u.email like '%@echobox.test';

insert into public.profiles (id, tenant_id, email, full_name, phone, roles) values
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'admin@echobox.test',  'Demo Admin', '+39 06 1234567', array['admin']::public.app_role[]),
  ('22222222-2222-4222-8222-222222222222', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'rider1@echobox.test', 'Luca Rider',  '+39 333 1111111', array['rider']::public.app_role[]),
  ('33333333-3333-4333-8333-333333333333', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'rider2@echobox.test', 'Sara Rider',  '+39 333 2222222', array['rider']::public.app_role[]);

-- -----------------------------------------------------------------------------
-- Guides
-- -----------------------------------------------------------------------------
insert into public.guides (tenant_id, full_name, phone, email) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Mario Rossi',  '+39 340 1000001', 'mario.rossi@example.com'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Giulia Bianchi','+39 340 1000002', 'giulia.bianchi@example.com'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Luca Verdi',   '+39 340 1000003', null),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Elena Neri',   '+39 340 1000004', 'elena.neri@example.com'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Marco Conti',  '+39 340 1000005', null),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Sara Greco',   '+39 340 1000006', 'sara.greco@example.com');

-- -----------------------------------------------------------------------------
-- Historical orders (closed): gives the dashboard something to chart
-- -----------------------------------------------------------------------------
with g as (
  select id, full_name, phone, (row_number() over (order by full_name) - 1)::int as idx
  from public.guides where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
),
places as (
  select array[
    'Piazza Navona, Roma', 'Colosseo, Roma', 'Fontana di Trevi, Roma',
    'Piazza San Pietro, Roma', 'Piazza di Spagna, Roma',
    'Stazione Termini, Roma', 'Pantheon, Roma'] as a
)
insert into public.orders (
  tenant_id, guide_id, guide_name, guide_phone, radio_channel, radios_count,
  extra_radios, lost_radios, balance, invoice_required,
  delivery_at, delivery_address, pickup_at, pickup_address,
  status, delivery_rider_id, pickup_rider_id, source, created_at)
select
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', g.id, g.full_name, g.phone,
  n % 36, 15 + (n * 7 % 30), n % 4, case when n % 13 = 0 then 1 else 0 end,
  round((120 + (n * 37 % 180))::numeric, 2), n % 5 = 0,
  d.delivery_at, p.a[(n % 7) + 1],
  d.delivery_at + interval '3 hours', p.a[((n + 3) % 7) + 1],
  case when n % 17 = 0 then 'cancelled'::public.order_status else 'picked_up'::public.order_status end,
  case when n % 2 = 0 then '22222222-2222-4222-8222-222222222222'::uuid else '33333333-3333-4333-8333-333333333333'::uuid end,
  case when n % 3 = 0 then '22222222-2222-4222-8222-222222222222'::uuid else '33333333-3333-4333-8333-333333333333'::uuid end,
  'dashboard', d.delivery_at - interval '2 days'
from generate_series(1, 90) as n
cross join places p
cross join lateral (
  select date_trunc('day', now()) - ((n % 45) + 1) * interval '1 day'
         + (8 + n % 10) * interval '1 hour' as delivery_at
) d
join g on g.idx = n % 6;

-- -----------------------------------------------------------------------------
-- Open orders: one per interesting state (channels are reserved while open)
-- -----------------------------------------------------------------------------
insert into public.orders (
  tenant_id, guide_name, guide_phone, radio_channel, radios_count, extra_radios, balance,
  delivery_at, delivery_address, pickup_at, pickup_address,
  status, delivery_rider_id, pickup_rider_id, source, notes)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Mario Rossi', '+39 340 1000001', 1, 25, 2, 180,
   now() + interval '1 day', 'Piazza Navona, Roma', now() + interval '1 day 4 hours', 'Piazza Navona, Roma',
   'received', null, null, 'dashboard', 'Gruppo scolastico'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Giulia Bianchi', '+39 340 1000002', 2, 30, 0, 210,
   now() + interval '2 hours', 'Colosseo, Roma', now() + interval '6 hours', 'Colosseo, Roma',
   'delivery_assigned', '22222222-2222-4222-8222-222222222222', null, 'dashboard', null),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Luca Verdi', '+39 340 1000003', 3, 18, 1, 140,
   now() - interval '30 minutes', 'Fontana di Trevi, Roma', now() + interval '4 hours', 'Fontana di Trevi, Roma',
   'out_for_delivery', '22222222-2222-4222-8222-222222222222', null, 'dashboard', null),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Elena Neri', '+39 340 1000004', 4, 22, 0, 160,
   now() - interval '3 hours', 'Piazza San Pietro, Roma', null, null,
   'delivered', '33333333-3333-4333-8333-333333333333', null, 'dashboard', 'Ritiro da concordare'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Marco Conti', '+39 340 1000005', 5, 40, 3, 320,
   now() - interval '5 hours', 'Piazza di Spagna, Roma', now() + interval '1 hour', 'Piazza di Spagna, Roma',
   'awaiting_pickup', '33333333-3333-4333-8333-333333333333', null, 'dashboard', null),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Sara Greco', '+39 340 1000006', 6, 20, 0, 150,
   now() - interval '6 hours', 'Stazione Termini, Roma', now() + interval '30 minutes', 'Stazione Termini, Roma',
   'pickup_assigned', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', 'dashboard', null),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Tour Operator Sole', '+39 351 9999999', null, 35, 0, 0,
   now() + interval '3 days', 'Pantheon, Roma', null, null,
   'received', null, null, 'public_form', 'Prenotazione dal modulo pubblico');

select set_config('app.order_actions', 'off', false);
