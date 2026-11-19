-- =============================================================================
-- Contact form of the marketing site.
--
-- Messages are written ONLY by the `contact` Edge Function (service role): it
-- validates the input, rate-limits by hashed IP, stores the row here and e-mails
-- it to the site owner. Browsers can neither read nor write this table: it is
-- not tenant data, and the people who write in are not users of the platform.
-- Read the messages in the Supabase dashboard (Table editor -> contact_messages).
-- =============================================================================

create table public.contact_messages (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  name        text not null check (char_length(btrim(name)) between 2 and 120),
  email       text not null check (char_length(email) <= 200 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  company     text check (char_length(company) <= 160),
  phone       text check (char_length(phone) <= 40),
  message     text not null check (char_length(btrim(message)) between 10 and 4000),
  locale      text check (locale in ('it', 'en', 'de', 'fr')),
  -- sha-256 of the sender IP (+ salt): enough for rate limiting, not an address.
  ip_hash     text,
  user_agent  text check (char_length(user_agent) <= 400),
  -- delivery of the notification e-mail
  emailed_at  timestamptz,
  email_error text,
  -- for whoever answers: tick it in the dashboard once handled
  handled     boolean not null default false
);

comment on table public.contact_messages is
  'Messages sent through the contact form of the marketing site. Written by the contact Edge Function only.';

create index contact_messages_created_at_idx on public.contact_messages (created_at desc);
create index contact_messages_ip_hash_idx on public.contact_messages (ip_hash, created_at desc);

-- Service role only: RLS on and no policies, plus no table privileges for the
-- API roles (belt and braces).
alter table public.contact_messages enable row level security;
revoke all on public.contact_messages from anon, authenticated;
