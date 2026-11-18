-- =============================================================================
-- EchoBox Logistics - core schema
--
-- Replaces the former Firestore collections:
--   tenants       -> public.tenants
--   users         -> public.profiles   (+ auth.users managed by Supabase Auth)
--   (guide users) -> public.guides     (guides are contacts, not login accounts)
--   invitations   -> public.invitations
--   orders        -> public.orders
--   rider_status  -> public.rider_activity (a VIEW derived from orders)
--   (new)         -> public.order_events (audit trail)
-- =============================================================================

create schema if not exists private;

-- -----------------------------------------------------------------------------
-- Enumerations
-- -----------------------------------------------------------------------------

-- Platform roles. "guide" is intentionally NOT a role: guides never log in.
create type public.app_role as enum ('admin', 'rider');

-- Order lifecycle. Legacy (Italian) value -> new value:
--   Presa in Carico -> received            Assegnato (delivery) -> delivery_assigned
--   In Consegna     -> out_for_delivery    Consegnato           -> delivered
--   Attesa ritiro   -> awaiting_pickup     Assegnato (pickup)   -> pickup_assigned
--   In Ritiro       -> out_for_pickup      Ritirato             -> picked_up
--   Annullato       -> cancelled
create type public.order_status as enum (
  'received',
  'delivery_assigned',
  'out_for_delivery',
  'delivered',
  'awaiting_pickup',
  'pickup_assigned',
  'out_for_pickup',
  'picked_up',
  'cancelled'
);

create type public.order_source as enum ('dashboard', 'public_form');

-- -----------------------------------------------------------------------------
-- Generic helpers
-- -----------------------------------------------------------------------------

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Lower-cases and strips everything but digits: used to de-duplicate phones.
create function private.digits(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(coalesce(p_value, ''), '[^0-9]', '', 'g');
$$;

-- -----------------------------------------------------------------------------
-- tenants
-- -----------------------------------------------------------------------------

create table public.tenants (
  id                     uuid primary key default gen_random_uuid(),
  name                   text not null check (char_length(btrim(name)) between 2 and 120),
  -- Case/whitespace-insensitive uniqueness key (legacy code upper-cased names).
  name_key               text generated always as (lower(btrim(name))) stored,
  -- URL-safe identifier used by the public booking page: /book/<slug>
  slug                   text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description            text,
  domain                 text,
  timezone               text not null default 'Europe/Rome',
  -- Radio channels are numbered 0..radio_channels_total (inclusive), as before.
  radio_channels_total   integer not null default 35 check (radio_channels_total between 0 and 999),
  disabled_channels      integer[] not null default '{}',
  public_booking_enabled boolean not null default true,
  is_active              boolean not null default true,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create unique index tenants_name_key_uidx on public.tenants (name_key);
create unique index tenants_slug_uidx on public.tenants (slug);

create trigger tenants_set_updated_at
  before update on public.tenants
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- profiles (1:1 with auth.users; a user belongs to exactly one tenant)
-- -----------------------------------------------------------------------------

create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  email         text not null,
  full_name     text not null default '',
  phone         text,
  avatar_url    text,
  roles         public.app_role[] not null check (cardinality(roles) > 0),
  disabled      boolean not null default false,
  last_login_at timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index profiles_tenant_idx on public.profiles (tenant_id);
create index profiles_roles_idx on public.profiles using gin (roles);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- guides (tour guides / groups that rent radios; contacts, not accounts)
-- -----------------------------------------------------------------------------

create table public.guides (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants (id) on delete cascade,
  full_name    text not null check (char_length(btrim(full_name)) >= 2),
  phone        text,
  email        text,
  notes        text,
  phone_digits text generated always as (private.digits(phone)) stored,
  email_key    text generated always as (lower(btrim(email))) stored,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index guides_tenant_name_idx on public.guides (tenant_id, lower(full_name));
create unique index guides_tenant_phone_uidx
  on public.guides (tenant_id, phone_digits) where phone_digits <> '';
create unique index guides_tenant_email_uidx
  on public.guides (tenant_id, email_key) where email_key is not null and email_key <> '';

create trigger guides_set_updated_at
  before update on public.guides
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- invitations (created by the invite-member Edge Function, consumed by
-- public.bootstrap_profile() when the invited person first signs in)
-- -----------------------------------------------------------------------------

create table public.invitations (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  email       text not null,
  email_key   text generated always as (lower(btrim(email))) stored,
  full_name   text,
  roles       public.app_role[] not null check (cardinality(roles) > 0),
  invited_by  uuid references public.profiles (id) on delete set null,
  expires_at  timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at  timestamptz not null default now()
);

create index invitations_email_idx on public.invitations (email_key) where accepted_at is null;
create unique index invitations_pending_uidx
  on public.invitations (tenant_id, email_key) where accepted_at is null;

-- -----------------------------------------------------------------------------
-- orders
-- -----------------------------------------------------------------------------

create table public.orders (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants (id) on delete cascade,

  -- Guide (denormalised on purpose: manual entries and public bookings may
  -- not have a matching row in public.guides).
  guide_id            uuid references public.guides (id) on delete set null,
  guide_name          text not null check (char_length(btrim(guide_name)) >= 2),
  guide_phone         text,
  guide_email         text,

  -- Equipment
  radio_channel       integer check (radio_channel >= 0),
  radios_count        integer not null default 0 check (radios_count >= 0),
  extra_radios        integer not null default 0 check (extra_radios >= 0),
  lost_radios         integer not null default 0 check (lost_radios >= 0),

  -- Money
  balance             numeric(10, 2) not null default 0,
  invoice_required    boolean not null default false,

  -- Delivery leg
  delivery_at         timestamptz not null,
  delivery_address    text not null check (char_length(btrim(delivery_address)) > 0),
  delivery_rider_id   uuid references public.profiles (id) on delete restrict,
  delivered_at        timestamptz,

  -- Pickup leg (optional until planned)
  pickup_at           timestamptz,
  pickup_address      text,
  pickup_rider_id     uuid references public.profiles (id) on delete restrict,
  picked_up_at        timestamptz,

  status              public.order_status not null default 'received',
  notes               text,
  source              public.order_source not null default 'dashboard',
  created_by          uuid references public.profiles (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint orders_pickup_after_delivery
    check (pickup_at is null or pickup_at >= delivery_at),
  constraint orders_delivery_rider_required
    check (status not in ('delivery_assigned', 'out_for_delivery') or delivery_rider_id is not null),
  constraint orders_pickup_rider_required
    check (status not in ('pickup_assigned', 'out_for_pickup') or pickup_rider_id is not null)
);

create index orders_tenant_delivery_idx on public.orders (tenant_id, delivery_at desc);
create index orders_tenant_pickup_idx on public.orders (tenant_id, pickup_at desc) where pickup_at is not null;
create index orders_tenant_status_idx on public.orders (tenant_id, status);
create index orders_delivery_rider_idx on public.orders (delivery_rider_id) where delivery_rider_id is not null;
create index orders_pickup_rider_idx on public.orders (pickup_rider_id) where pickup_rider_id is not null;
create index orders_guide_idx on public.orders (guide_id) where guide_id is not null;

-- A radio channel can serve one open order at a time. This replaces the old
-- per-browser localStorage bookkeeping ("Iddlechannels") with a guarantee that
-- is enforced by the database itself.
create unique index orders_open_channel_uidx
  on public.orders (tenant_id, radio_channel)
  where radio_channel is not null and status not in ('picked_up', 'cancelled');

create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- order_events (append-only audit trail, written by triggers)
-- -----------------------------------------------------------------------------

create table public.order_events (
  id          bigint generated always as identity primary key,
  order_id    uuid not null,
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  actor_id    uuid,
  event_type  text not null,
  from_status public.order_status,
  to_status   public.order_status,
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index order_events_order_idx on public.order_events (order_id, created_at desc);
create index order_events_tenant_idx on public.order_events (tenant_id, created_at desc);

comment on table public.tenants      is 'One row per company using the platform.';
comment on table public.profiles     is 'Platform users (admins and riders). 1:1 with auth.users.';
comment on table public.guides       is 'Tour guides / groups that rent radios. Contacts only, they do not log in.';
comment on table public.invitations  is 'Pending invitations to join a tenant. Created by the invite-member Edge Function.';
comment on table public.orders       is 'A radio-guide rental: delivery leg + optional pickup leg.';
comment on table public.order_events is 'Append-only audit log of order changes.';
