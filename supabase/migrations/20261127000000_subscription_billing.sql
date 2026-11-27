-- Subscription plans with prices and limits, usage metering, invoices, plan-change
-- requests and billing notices.
--
-- The database stays the single source of truth for plans, limits and access, so the
-- web app, the mobile app and the Superadmin console all follow the same rules.
-- Limits are SOFT: reaching one notifies the company and the operator, and extras are
-- billed on the next invoice. Only non-payment restricts access (company_access_mode).

-- -----------------------------------------------------------------------------
-- Plans: price and limits
-- -----------------------------------------------------------------------------
alter table private.platform_plans
  add column description text not null default '' check (char_length(description) <= 300),
  add column price_month numeric(10, 2) not null default 0 check (price_month >= 0),
  add column price_year numeric(10, 2) check (price_year is null or price_year >= 0),
  add column currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  -- NULL means unlimited.
  add column included_riders integer check (included_riders is null or included_riders >= 0),
  add column included_orders integer check (included_orders is null or included_orders >= 0),
  add column extra_rider_price numeric(8, 2) not null default 0 check (extra_rider_price >= 0),
  add column extra_orders_price numeric(8, 2) not null default 0 check (extra_orders_price >= 0),
  add column orders_block integer not null default 100 check (orders_block between 1 and 10000),
  -- Public plans are listed to company admins (upgrade/downgrade). Custom plans stay private.
  add column is_public boolean not null default true,
  add column sort_order integer not null default 100;

-- Starting prices. They live in the database, so they can be changed from the console
-- without a deploy. Plans an operator already edited (price > 0) are left alone.
insert into private.platform_plans
  (code, name, description, price_month, price_year, included_riders, included_orders,
   extra_rider_price, extra_orders_price, orders_block, sort_order)
values
  ('starter', 'Starter', 'Small teams getting started', 29, 290, 3, 300, 5, 8, 100, 10),
  ('pro', 'Pro', 'Growing operations', 79, 790, 10, 1500, 4, 6, 100, 20),
  ('business', 'Business', 'Large operations', 149, 1490, 30, 6000, 3, 5, 100, 30)
on conflict (code) do update set
  description = excluded.description, price_month = excluded.price_month, price_year = excluded.price_year,
  included_riders = excluded.included_riders, included_orders = excluded.included_orders,
  extra_rider_price = excluded.extra_rider_price, extra_orders_price = excluded.extra_orders_price,
  orders_block = excluded.orders_block, sort_order = excluded.sort_order
where private.platform_plans.price_month = 0;

-- -----------------------------------------------------------------------------
-- Subscriptions: interval, forever, payment provider
-- -----------------------------------------------------------------------------
alter table private.company_subscriptions
  add column billing_interval text not null default 'month' check (billing_interval in ('month', 'year')),
  add column forever boolean not null default false,
  add column notes text not null default '' check (char_length(notes) <= 1000),
  -- Ready for an automatic payment provider (e.g. Stripe); 'manual' = bank transfer.
  add column provider text not null default 'manual' check (provider ~ '^[a-z][a-z0-9_]{1,29}$'),
  add column provider_customer_id text check (char_length(provider_customer_id) <= 120),
  add column provider_subscription_id text check (char_length(provider_subscription_id) <= 120),
  add column started_at timestamptz not null default now();

-- "Forever" is only meaningful for an active subscription without an end date.
create function private.normalize_subscription()
returns trigger
language plpgsql
as $$
begin
  if new.state <> 'active' or new.ends_at is not null then new.forever := false; end if;
  if new.forever then new.ends_at := null; end if;
  return new;
end;
$$;

create trigger company_subscriptions_normalize
before insert or update on private.company_subscriptions
for each row execute function private.normalize_subscription();

-- -----------------------------------------------------------------------------
-- Platform settings: trial given to new companies, notice scheduling
-- -----------------------------------------------------------------------------
alter table private.platform_settings
  add column default_plan_code text references private.platform_plans(code) on delete set null,
  add column default_trial_days integer not null default 0 check (default_trial_days between 0 and 365),
  add column notices_generated_at timestamptz;

create function private.start_default_trial()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_plan text;
  v_days integer;
begin
  select s.default_plan_code, s.default_trial_days into v_plan, v_days from private.platform_settings s;
  if v_plan is not null and coalesce(v_days, 0) > 0 and exists (
    select 1 from private.platform_plans p where p.code = v_plan and p.available
  ) then
    insert into private.company_subscriptions(tenant_id, plan_code, state, ends_at)
    values (new.id, v_plan, 'trial', now() + make_interval(days => v_days))
    on conflict (tenant_id) do nothing;
  end if;
  return new;
end;
$$;

create trigger tenants_default_trial
after insert on public.tenants
for each row execute function private.start_default_trial();

-- -----------------------------------------------------------------------------
-- Invoices, plan-change requests, notices
-- -----------------------------------------------------------------------------
create sequence private.invoice_number_seq;

-- Invoices are kept for accounting: a company with billing history cannot be deleted.
create table private.company_invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  number text not null check (char_length(btrim(number)) between 1 and 40),
  status text not null default 'issued' check (status in ('draft', 'issued', 'paid', 'void')),
  period_start date not null,
  period_end date not null,
  lines jsonb not null default '[]' check (jsonb_typeof(lines) = 'array'),
  amount numeric(12, 2) not null check (amount >= 0),
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  issued_at timestamptz,
  due_at timestamptz,
  paid_at timestamptz,
  -- Link to the fiscal invoice (e-invoicing service) or to the payment provider.
  external_url text check (external_url is null or (external_url ~ '^https://' and char_length(external_url) <= 500)),
  provider text not null default 'manual',
  provider_ref text check (char_length(provider_ref) <= 120),
  created_by uuid,
  created_at timestamptz not null default now(),
  check (period_end >= period_start),
  unique (tenant_id, number)
);
create index company_invoices_status_idx on private.company_invoices(status, due_at);

alter table private.subscription_payments
  add column invoice_id uuid references private.company_invoices(id) on delete set null;

create table private.plan_change_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  requested_by uuid not null,
  from_plan text,
  to_plan text not null references private.platform_plans(code),
  billing_interval text not null default 'month' check (billing_interval in ('month', 'year')),
  note text not null default '' check (char_length(note) <= 500),
  status text not null default 'open' check (status in ('open', 'approved', 'rejected', 'cancelled')),
  response text check (char_length(response) <= 500),
  created_at timestamptz not null default now(),
  handled_at timestamptz,
  handled_by uuid
);
create unique index plan_change_one_open on private.plan_change_requests(tenant_id) where status = 'open';

-- Queue of e-mails (limits reached, trial ending, reminders). A worker sends them.
create table private.billing_notices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  kind text not null check (kind in (
    'limit_orders_80', 'limit_orders_100', 'limit_riders_100', 'trial_ending', 'past_due',
    'payment_reminder', 'custom')),
  -- Deduplicates automatic notices (e.g. one per month); manual ones get a random value.
  period text not null,
  payload jsonb not null default '{}',
  created_by uuid,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  attempts integer not null default 0,
  sent_at timestamptz,
  error text check (char_length(error) <= 200),
  unique (tenant_id, kind, period)
);
create index billing_notices_pending_idx on private.billing_notices(created_at) where sent_at is null;

create index if not exists orders_tenant_created_idx on public.orders (tenant_id, created_at);

revoke all on table private.company_invoices, private.plan_change_requests, private.billing_notices
from public, anon, authenticated, service_role;
revoke all on sequence private.invoice_number_seq from public, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Usage and bill estimate
-- -----------------------------------------------------------------------------
-- Usage of the current calendar month in the company's time zone.
--   orders  = orders created in the month, cancelled ones excluded
--   riders  = enabled rider accounts (what the limit and the extra price apply to)
--   active_riders = riders who actually had an order in the month (information only)
create function private.tenant_usage(p_tenant uuid, p_at timestamptz default now())
returns jsonb
language sql stable security definer set search_path = ''
as $$
  with t as (
    select t.timezone as tz, date_trunc('month', p_at at time zone t.timezone) as m0
    from public.tenants t where t.id = p_tenant
  ), o as (
    select o.delivery_rider_id, o.pickup_rider_id from public.orders o, t
    where o.tenant_id = p_tenant and o.status <> 'cancelled'
      and o.created_at >= t.m0 at time zone t.tz
      and o.created_at < (t.m0 + interval '1 month') at time zone t.tz
  )
  select jsonb_build_object(
    'period_start', t.m0::date,
    'period_end', (t.m0 + interval '1 month')::date - 1,
    'orders', (select count(*) from o),
    'riders', (select count(*) from public.profiles p
      where p.tenant_id = p_tenant and 'rider' = any(p.roles) and not p.disabled),
    'active_riders', (select count(distinct r) from o, unnest(array[o.delivery_rider_id, o.pickup_rider_id]) r
      where r is not null)
  ) from t;
$$;

-- What the company would be billed for the current month: base fee + extras.
create function private.estimate_bill(p_tenant uuid, p_at timestamptz default now())
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_sub private.company_subscriptions;
  v_plan private.platform_plans;
  v_usage jsonb;
  v_lines jsonb := '[]';
  v_base numeric;
  v_extra integer;
  v_total numeric := 0;
begin
  select * into v_sub from private.company_subscriptions s where s.tenant_id = p_tenant;
  if not found then return null; end if;
  select * into v_plan from private.platform_plans p where p.code = v_sub.plan_code;
  v_usage := private.tenant_usage(p_tenant, p_at);

  v_base := case when v_sub.billing_interval = 'year'
    then coalesce(v_plan.price_year, v_plan.price_month * 12) else v_plan.price_month end;
  v_lines := v_lines || jsonb_build_array(jsonb_build_object(
    'code', 'base', 'quantity', 1, 'unit_price', v_base, 'amount', v_base));
  v_total := v_base;

  if v_plan.included_riders is not null and (v_usage->>'riders')::integer > v_plan.included_riders then
    v_extra := (v_usage->>'riders')::integer - v_plan.included_riders;
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'code', 'extra_riders', 'quantity', v_extra, 'unit_price', v_plan.extra_rider_price,
      'amount', v_extra * v_plan.extra_rider_price));
    v_total := v_total + v_extra * v_plan.extra_rider_price;
  end if;
  if v_plan.included_orders is not null and (v_usage->>'orders')::integer > v_plan.included_orders then
    v_extra := ceil(((v_usage->>'orders')::integer - v_plan.included_orders)::numeric / v_plan.orders_block);
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'code', 'extra_orders', 'quantity', v_extra, 'unit_price', v_plan.extra_orders_price,
      'block', v_plan.orders_block, 'amount', v_extra * v_plan.extra_orders_price));
    v_total := v_total + v_extra * v_plan.extra_orders_price;
  end if;

  return jsonb_build_object('currency', v_plan.currency, 'interval', v_sub.billing_interval,
    'lines', v_lines, 'total', v_total, 'usage', v_usage);
end;
$$;

-- -----------------------------------------------------------------------------
-- Notices: automatic generation and delivery queue
-- -----------------------------------------------------------------------------
create function private.generate_billing_notices()
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_last timestamptz;
begin
  select s.notices_generated_at into v_last from private.platform_settings s;
  if v_last is not null and v_last > now() - interval '10 minutes' then return; end if;
  insert into private.platform_settings(singleton, notices_generated_at) values (true, now())
  on conflict (singleton) do update set notices_generated_at = now();

  with u as (
    select t.id as tenant_id, p.included_orders, p.included_riders, p.extra_rider_price, p.extra_orders_price,
      p.orders_block, p.currency, private.tenant_usage(t.id) as usage
    from public.tenants t
    join private.company_subscriptions s on s.tenant_id = t.id
    join private.platform_plans p on p.code = s.plan_code
    where t.is_active and private.company_access_mode(t.id) = 'full'
  ), hits as (
    select tenant_id, 'limit_orders_100' as kind, 'orders' as metric, included_orders as included,
      (usage->>'orders')::integer as used, extra_orders_price as extra_price, orders_block as block, currency
    from u where included_orders > 0 and (usage->>'orders')::integer >= included_orders
    union all
    select tenant_id, 'limit_orders_80', 'orders', included_orders, (usage->>'orders')::integer,
      extra_orders_price, orders_block, currency
    from u where included_orders > 0 and (usage->>'orders')::integer >= included_orders * 0.8
      and (usage->>'orders')::integer < included_orders
    union all
    select tenant_id, 'limit_riders_100', 'riders', included_riders, (usage->>'riders')::integer,
      extra_rider_price, 1, currency
    from u where included_riders > 0 and (usage->>'riders')::integer >= included_riders
  )
  insert into private.billing_notices(tenant_id, kind, period, payload)
  select tenant_id, kind, to_char(now(), 'YYYY-MM'),
    jsonb_build_object('metric', metric, 'included', included, 'used', used,
      'extra_price', extra_price, 'block', block, 'currency', currency)
  from hits
  on conflict (tenant_id, kind, period) do nothing;

  insert into private.billing_notices(tenant_id, kind, period, payload)
  select s.tenant_id, 'trial_ending', s.ends_at::date::text, jsonb_build_object('ends_at', s.ends_at)
  from private.company_subscriptions s join public.tenants t on t.id = s.tenant_id
  where t.is_active and s.state = 'trial' and s.ends_at > now() and s.ends_at <= now() + interval '3 days'
  on conflict (tenant_id, kind, period) do nothing;

  insert into private.billing_notices(tenant_id, kind, period, payload)
  select s.tenant_id, 'past_due', to_char(now(), 'IYYY-"W"IW'), jsonb_build_object('grace_until', s.grace_until)
  from private.company_subscriptions s join public.tenants t on t.id = s.tenant_id
  where t.is_active and s.state = 'past_due'
  on conflict (tenant_id, kind, period) do nothing;
end;
$$;

-- Used by the worker (service role): lease a few pending notices, with their recipients.
create function public.claim_billing_notices(p_limit integer default 10)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_result jsonb;
begin
  perform private.generate_billing_notices();
  with c as (
    update private.billing_notices n set attempts = n.attempts + 1, claimed_at = now()
    where n.id in (
      select b.id from private.billing_notices b
      where b.sent_at is null and b.attempts < 5
        and (b.claimed_at is null or b.claimed_at < now() - interval '10 minutes')
      order by b.created_at limit least(greatest(p_limit, 1), 25) for update skip locked
    )
    returning n.id, n.tenant_id, n.kind, n.payload
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id, 'kind', c.kind, 'payload', c.payload, 'company', t.name,
    'to', case when s.billing_email is not null then jsonb_build_array(s.billing_email) else
      coalesce((select jsonb_agg(distinct lower(p.email)) from public.profiles p
        where p.tenant_id = c.tenant_id and 'admin' = any(p.roles) and not p.disabled), '[]'::jsonb) end
  )), '[]'::jsonb) into v_result
  from c join public.tenants t on t.id = c.tenant_id
  left join private.company_subscriptions s on s.tenant_id = c.tenant_id;
  return v_result;
end;
$$;

create function public.finish_billing_notice(p_id uuid, p_sent boolean, p_error text default null)
returns void
language sql security definer set search_path = ''
as $$
  update private.billing_notices n
  set sent_at = case when p_sent then now() end, error = case when p_sent then null else left(p_error, 200) end
  where n.id = p_id and n.sent_at is null;
$$;

-- -----------------------------------------------------------------------------
-- Company side: subscription screen, plan-change requests
-- -----------------------------------------------------------------------------
create function public.company_billing()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_tenant uuid := private.current_tenant_id();
begin
  if v_tenant is null or not private.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'access_mode', private.company_access_mode(v_tenant),
    'subscription', (select jsonb_build_object(
      'plan_code', s.plan_code, 'state', s.state, 'interval', s.billing_interval, 'forever', s.forever,
      'ends_at', s.ends_at, 'grace_until', s.grace_until, 'closeout_until', s.closeout_until,
      'billing_email', s.billing_email, 'started_at', s.started_at)
      from private.company_subscriptions s where s.tenant_id = v_tenant),
    'plan', (select to_jsonb(p) - 'available' - 'is_public' - 'sort_order'
      from private.platform_plans p join private.company_subscriptions s on s.plan_code = p.code
      where s.tenant_id = v_tenant),
    'usage', private.tenant_usage(v_tenant),
    'estimate', private.estimate_bill(v_tenant),
    'plans', coalesce((select jsonb_agg(to_jsonb(p) - 'available' - 'is_public' order by p.sort_order, p.name)
      from private.platform_plans p where p.available and p.is_public), '[]'::jsonb),
    'invoices', coalesce((select jsonb_agg(to_jsonb(i) order by i.issued_at desc, i.id) from (
      select i.id, i.number, i.status, i.period_start, i.period_end, i.lines, i.amount, i.currency,
        i.issued_at, i.due_at, i.paid_at, i.external_url
      from private.company_invoices i where i.tenant_id = v_tenant and i.status <> 'draft'
      order by i.issued_at desc, i.id limit 60) i), '[]'::jsonb),
    'request', (select to_jsonb(r) from (
      select r.id, r.to_plan, r.billing_interval, r.note, r.created_at
      from private.plan_change_requests r where r.tenant_id = v_tenant and r.status = 'open') r),
    'last_response', (select to_jsonb(r) from (
      select r.to_plan, r.status, r.response, r.handled_at
      from private.plan_change_requests r where r.tenant_id = v_tenant and r.status in ('approved', 'rejected')
      order by r.handled_at desc limit 1) r)
  );
end;
$$;

create function public.request_plan_change(p_plan_code text, p_interval text default 'month', p_note text default null)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_tenant uuid := private.current_tenant_id();
  v_id uuid;
  v_from text;
begin
  if v_tenant is null or not private.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_interval not in ('month', 'year') then raise exception 'invalid_interval'; end if;
  if not exists (select 1 from private.platform_plans p where p.code = p_plan_code and p.available and p.is_public) then
    raise exception 'plan_unavailable';
  end if;
  select s.plan_code into v_from from private.company_subscriptions s where s.tenant_id = v_tenant;
  begin
    insert into private.plan_change_requests(tenant_id, requested_by, from_plan, to_plan, billing_interval, note)
    values (v_tenant, auth.uid(), v_from, p_plan_code, p_interval, coalesce(left(btrim(p_note), 500), ''))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'request_already_open';
  end;
  perform private.write_platform_audit(auth.uid(), v_tenant, 'plan_change_requested', 'Requested by the company',
    null, jsonb_build_object('request_id', v_id, 'from', v_from, 'to', p_plan_code, 'interval', p_interval));
  return v_id;
end;
$$;

create function public.cancel_plan_change_request()
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_tenant uuid := private.current_tenant_id();
begin
  if v_tenant is null or not private.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  update private.plan_change_requests r set status = 'cancelled', handled_at = now()
  where r.tenant_id = v_tenant and r.status = 'open';
  return found;
end;
$$;

-- -----------------------------------------------------------------------------
-- Operator side
-- -----------------------------------------------------------------------------
create function private.next_invoice_number()
returns text
language sql security definer set search_path = ''
as $$ select 'EB-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('private.invoice_number_seq')::text, 4, '0'); $$;

create function private.apply_plan(p_tenant uuid, p_plan text, p_interval text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_after jsonb;
begin
  insert into private.company_subscriptions(tenant_id, plan_code, state, billing_interval)
  values (p_tenant, p_plan, 'active', p_interval)
  on conflict (tenant_id) do update set plan_code = excluded.plan_code,
    billing_interval = excluded.billing_interval, updated_at = now()
  returning to_jsonb(company_subscriptions) into v_after;
  return v_after;
end;
$$;

create function public.platform_billing_action(p_action text, p_values jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := private.require_platform_admin();
  v_tenant uuid := nullif(p_values->>'tenant_id', '')::uuid;
  v_reason text := nullif(btrim(p_values->>'reason'), '');
  v_name text := nullif(btrim(p_values->>'name'), '');
  v_target uuid;
  v_before jsonb;
  v_after jsonb;
  v_state text;
  v_interval text := coalesce(nullif(p_values->>'billing_interval', ''), 'month');
  v_forever boolean := coalesce((p_values->>'forever')::boolean, false);
  v_ends timestamptz;
  v_amount numeric;
  v_inv private.company_invoices;
  v_req private.plan_change_requests;
  v_slug text;
  v_active boolean;
  v_users uuid[];
begin
  if v_reason is null or char_length(v_reason) > 500 then raise exception 'operator_reason_required'; end if;
  if v_interval not in ('month', 'year') then raise exception 'invalid_interval'; end if;

  case p_action
    when 'save_plan' then
      select to_jsonb(p) into v_before from private.platform_plans p where p.code = p_values->>'code';
      insert into private.platform_plans(code, name, available, description, price_month, price_year, currency,
        included_riders, included_orders, extra_rider_price, extra_orders_price, orders_block, is_public, sort_order)
      values (p_values->>'code', v_name, coalesce((p_values->>'available')::boolean, true),
        coalesce(btrim(p_values->>'description'), ''), coalesce(nullif(p_values->>'price_month', '')::numeric, 0),
        nullif(p_values->>'price_year', '')::numeric, upper(coalesce(nullif(p_values->>'currency', ''), 'EUR')),
        nullif(p_values->>'included_riders', '')::integer, nullif(p_values->>'included_orders', '')::integer,
        coalesce(nullif(p_values->>'extra_rider_price', '')::numeric, 0),
        coalesce(nullif(p_values->>'extra_orders_price', '')::numeric, 0),
        coalesce(nullif(p_values->>'orders_block', '')::integer, 100),
        coalesce((p_values->>'is_public')::boolean, true), coalesce(nullif(p_values->>'sort_order', '')::integer, 100))
      on conflict (code) do update set name = excluded.name, available = excluded.available,
        description = excluded.description, price_month = excluded.price_month, price_year = excluded.price_year,
        currency = excluded.currency, included_riders = excluded.included_riders,
        included_orders = excluded.included_orders, extra_rider_price = excluded.extra_rider_price,
        extra_orders_price = excluded.extra_orders_price, orders_block = excluded.orders_block,
        is_public = excluded.is_public, sort_order = excluded.sort_order
      returning to_jsonb(platform_plans) into v_after;

    when 'save_subscription' then
      perform 1 from public.tenants t where t.id = v_tenant for update;
      if not found then raise exception 'company_not_found'; end if;
      select to_jsonb(s) into v_before from private.company_subscriptions s where s.tenant_id = v_tenant;
      v_state := p_values->>'state';
      if v_state not in ('trial', 'active', 'past_due', 'expired', 'cancelled') then raise exception 'invalid_state'; end if;
      if not exists (
        select 1 from private.platform_plans p
        where p.code = p_values->>'plan_code' and (p.available or p.code = v_before->>'plan_code')
      ) then raise exception 'plan_unavailable'; end if;
      v_ends := nullif(p_values->>'ends_at', '')::timestamptz;
      if v_forever and v_state <> 'active' then raise exception 'forever_requires_active'; end if;
      if v_state = 'trial' and v_ends is null then raise exception 'trial_needs_end_date'; end if;
      insert into private.company_subscriptions(tenant_id, plan_code, state, billing_interval, forever, ends_at,
        grace_until, closeout_until, billing_email, notes)
      values (v_tenant, p_values->>'plan_code', v_state, v_interval, v_forever, v_ends,
        nullif(p_values->>'grace_until', '')::timestamptz, nullif(p_values->>'closeout_until', '')::timestamptz,
        nullif(btrim(p_values->>'billing_email'), ''), coalesce(btrim(p_values->>'notes'), ''))
      on conflict (tenant_id) do update set plan_code = excluded.plan_code, state = excluded.state,
        billing_interval = excluded.billing_interval, forever = excluded.forever, ends_at = excluded.ends_at,
        grace_until = excluded.grace_until, closeout_until = excluded.closeout_until,
        billing_email = excluded.billing_email, notes = excluded.notes, updated_at = now()
      returning to_jsonb(company_subscriptions) into v_after;

    when 'start_trial' then
      perform 1 from public.tenants t where t.id = v_tenant for update;
      if not found then raise exception 'company_not_found'; end if;
      if (p_values->>'days')::integer not between 1 and 365 then raise exception 'invalid_trial_days'; end if;
      if not exists (select 1 from private.platform_plans p where p.code = p_values->>'plan_code' and p.available) then
        raise exception 'plan_unavailable';
      end if;
      select to_jsonb(s) into v_before from private.company_subscriptions s where s.tenant_id = v_tenant;
      insert into private.company_subscriptions(tenant_id, plan_code, state, ends_at)
      values (v_tenant, p_values->>'plan_code', 'trial', now() + make_interval(days => (p_values->>'days')::integer))
      on conflict (tenant_id) do update set plan_code = excluded.plan_code, state = 'trial',
        ends_at = excluded.ends_at, forever = false, grace_until = null, closeout_until = null, updated_at = now()
      returning to_jsonb(company_subscriptions) into v_after;

    when 'save_trial_defaults' then
      select jsonb_build_object('plan', s.default_plan_code, 'days', s.default_trial_days) into v_before
      from private.platform_settings s;
      if coalesce((p_values->>'days')::integer, 0) > 0 and not exists (
        select 1 from private.platform_plans p where p.code = p_values->>'plan_code' and p.available
      ) then raise exception 'plan_unavailable'; end if;
      insert into private.platform_settings(singleton, default_plan_code, default_trial_days)
      values (true, nullif(p_values->>'plan_code', ''), coalesce((p_values->>'days')::integer, 0))
      on conflict (singleton) do update set default_plan_code = excluded.default_plan_code,
        default_trial_days = excluded.default_trial_days;
      v_after := jsonb_build_object('plan', nullif(p_values->>'plan_code', ''), 'days', coalesce((p_values->>'days')::integer, 0));

    when 'create_invoice' then
      perform 1 from public.tenants t where t.id = v_tenant;
      if not found then raise exception 'company_not_found'; end if;
      if jsonb_typeof(p_values->'lines') <> 'array' or jsonb_array_length(p_values->'lines') = 0 then
        raise exception 'invoice_lines_required';
      end if;
      select coalesce(sum((l->>'amount')::numeric), 0) into v_amount from jsonb_array_elements(p_values->'lines') l;
      if v_amount < 0 then raise exception 'invalid_amount'; end if;
      v_state := coalesce(nullif(p_values->>'status', ''), 'issued');
      if v_state not in ('draft', 'issued') then raise exception 'invalid_invoice_status'; end if;
      insert into private.company_invoices(tenant_id, number, status, period_start, period_end, lines, amount,
        currency, issued_at, due_at, external_url, created_by)
      values (v_tenant, coalesce(nullif(btrim(p_values->>'number'), ''), private.next_invoice_number()), v_state,
        (p_values->>'period_start')::date, (p_values->>'period_end')::date, p_values->'lines', v_amount,
        upper(coalesce(nullif(p_values->>'currency', ''), 'EUR')),
        case when v_state = 'issued' then now() end,
        case when v_state = 'issued' then coalesce(nullif(p_values->>'due_at', '')::timestamptz, now() + interval '30 days') end,
        nullif(btrim(p_values->>'external_url'), ''), v_actor)
      returning to_jsonb(company_invoices) into v_after;

    when 'set_invoice_status' then
      v_target := (p_values->>'invoice_id')::uuid;
      select * into v_inv from private.company_invoices i where i.id = v_target for update;
      if not found then raise exception 'invoice_not_found'; end if;
      v_tenant := v_inv.tenant_id;
      v_before := to_jsonb(v_inv);
      v_state := p_values->>'status';
      if v_state not in ('issued', 'paid', 'void') then raise exception 'invalid_invoice_status'; end if;
      if v_inv.status in ('paid', 'void') or (v_inv.status = 'issued' and v_state = 'issued') then
        raise exception 'invoice_final';
      end if;
      if v_state = 'paid' then
        update private.company_invoices i set status = 'paid',
          issued_at = coalesce(i.issued_at, now()),
          paid_at = coalesce(nullif(p_values->>'paid_at', '')::timestamptz, now())
        where i.id = v_target returning * into v_inv;
        if v_inv.amount > 0 then
          insert into private.subscription_payments(tenant_id, actor_id, amount, currency, reference, paid_at, invoice_id)
          values (v_tenant, v_actor, v_inv.amount, v_inv.currency, v_inv.number, v_inv.paid_at, v_inv.id);
        end if;
        -- Paying renews the subscription by one interval.
        if coalesce((p_values->>'extend_subscription')::boolean, false) then
          update private.company_subscriptions s set state = 'active', grace_until = null, closeout_until = null,
            ends_at = case when s.forever then null else
              greatest(coalesce(s.ends_at, now()), now()) +
              case s.billing_interval when 'year' then interval '1 year' else interval '1 month' end end,
            updated_at = now()
          where s.tenant_id = v_tenant;
        end if;
      elsif v_state = 'issued' then
        update private.company_invoices i set status = 'issued', issued_at = now(),
          due_at = coalesce(i.due_at, now() + interval '30 days')
        where i.id = v_target returning * into v_inv;
      else
        update private.company_invoices i set status = 'void' where i.id = v_target returning * into v_inv;
      end if;
      v_after := to_jsonb(v_inv);

    when 'delete_invoice' then
      v_target := (p_values->>'invoice_id')::uuid;
      delete from private.company_invoices i where i.id = v_target and i.status = 'draft'
      returning to_jsonb(i), i.tenant_id into v_before, v_tenant;
      if not found then raise exception 'only_drafts_can_be_deleted'; end if;
      v_after := jsonb_build_object('deleted', true);

    when 'handle_plan_request' then
      v_target := (p_values->>'request_id')::uuid;
      select * into v_req from private.plan_change_requests r where r.id = v_target and r.status = 'open' for update;
      if not found then raise exception 'request_unavailable'; end if;
      v_tenant := v_req.tenant_id;
      v_state := p_values->>'decision';
      if v_state not in ('approved', 'rejected') then raise exception 'invalid_decision'; end if;
      v_before := to_jsonb(v_req);
      if v_state = 'approved' then
        if not exists (select 1 from private.platform_plans p where p.code = v_req.to_plan and p.available) then
          raise exception 'plan_unavailable';
        end if;
        perform private.apply_plan(v_tenant, v_req.to_plan, v_req.billing_interval);
      end if;
      update private.plan_change_requests r set status = v_state, handled_at = now(), handled_by = v_actor,
        response = nullif(left(btrim(p_values->>'response'), 500), '')
      where r.id = v_target returning to_jsonb(r) into v_after;

    when 'send_notice' then
      perform 1 from public.tenants t where t.id = v_tenant;
      if not found then raise exception 'company_not_found'; end if;
      v_state := p_values->>'kind';
      if v_state not in ('payment_reminder', 'trial_ending', 'custom') then raise exception 'invalid_notice_kind'; end if;
      if v_state = 'custom' and nullif(btrim(p_values->>'message'), '') is null then raise exception 'message_required'; end if;
      if not exists (
        select 1 from private.company_subscriptions s where s.tenant_id = v_tenant and s.billing_email is not null
      ) and not exists (
        select 1 from public.profiles p where p.tenant_id = v_tenant and 'admin' = any(p.roles) and not p.disabled
      ) then raise exception 'no_recipient'; end if;
      insert into private.billing_notices(tenant_id, kind, period, payload, created_by)
      values (v_tenant, v_state, gen_random_uuid()::text,
        jsonb_build_object('message', nullif(left(btrim(p_values->>'message'), 1000), '')), v_actor)
      returning jsonb_build_object('notice_id', id, 'kind', kind) into v_after;

    when 'delete_company' then
      select t.slug, t.is_active into v_slug, v_active from public.tenants t where t.id = v_tenant for update;
      if not found then raise exception 'company_not_found'; end if;
      if v_active then raise exception 'suspend_company_first'; end if;
      if p_values->>'confirm_slug' is distinct from v_slug then raise exception 'confirmation_mismatch'; end if;
      -- Invoices and payments must be kept for accounting.
      if exists (select 1 from private.company_invoices i where i.tenant_id = v_tenant)
         or exists (select 1 from private.subscription_payments p where p.tenant_id = v_tenant) then
        raise exception 'company_has_billing_history';
      end if;
      v_before := jsonb_build_object('tenant_id', v_tenant, 'slug', v_slug);
      select coalesce(array_agg(p.id), '{}') into v_users from public.profiles p where p.tenant_id = v_tenant;
      delete from public.orders o where o.tenant_id = v_tenant;
      delete from private.company_owners co where co.tenant_id = v_tenant;
      delete from public.tenants t where t.id = v_tenant;
      delete from auth.users u where u.id = any(v_users)
        and not exists (select 1 from private.platform_admins a where a.user_id = u.id);
      v_after := jsonb_build_object('deleted', true, 'users_removed', coalesce(array_length(v_users, 1), 0));

    else raise exception 'unknown_operator_action';
  end case;

  perform private.write_platform_audit(v_actor, v_tenant, p_action, v_reason, v_before, v_after);
  return v_after;
end;
$$;

-- One call with everything the billing pages need: companies with usage, money, requests.
create function public.platform_billing_overview()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_result jsonb;
begin
  perform private.require_platform_admin();
  select jsonb_build_object(
    'summary', jsonb_build_object(
      'mrr', (select coalesce(sum(case when s.billing_interval = 'year'
          then coalesce(p.price_year, p.price_month * 12) / 12 else p.price_month end), 0)
        from private.company_subscriptions s join private.platform_plans p on p.code = s.plan_code
        where s.state = 'active' and not s.forever),
      'trials', (select count(*) from private.company_subscriptions s where s.state = 'trial' and s.ends_at > now()),
      'past_due', (select count(*) from private.company_subscriptions s where s.state = 'past_due'),
      'unpaid_total', (select coalesce(sum(i.amount), 0) from private.company_invoices i where i.status = 'issued'),
      'overdue_invoices', (select count(*) from private.company_invoices i where i.status = 'issued' and i.due_at < now()),
      'open_requests', (select count(*) from private.plan_change_requests r where r.status = 'open')
    ),
    'companies', coalesce((select jsonb_agg(c order by c.name) from (
      select t.id, t.name, t.slug, t.is_active, private.company_access_mode(t.id) as access_mode,
        s.plan_code, p.name as plan_name, s.state, s.billing_interval, s.forever, s.ends_at, s.billing_email,
        private.tenant_usage(t.id) as usage, p.included_orders, p.included_riders, p.currency,
        (select coalesce(sum(i.amount), 0) from private.company_invoices i
          where i.tenant_id = t.id and i.status = 'issued') as unpaid,
        (select max(pay.paid_at) from private.subscription_payments pay where pay.tenant_id = t.id) as last_paid_at
      from public.tenants t
      left join private.company_subscriptions s on s.tenant_id = t.id
      left join private.platform_plans p on p.code = s.plan_code
      order by t.name, t.id limit 300) c), '[]'::jsonb),
    'invoices', coalesce((select jsonb_agg(i order by i.created_at desc, i.id) from (
      select i.id, i.tenant_id, t.name as company_name, i.number, i.status, i.period_start, i.period_end, i.lines,
        i.amount, i.currency, i.issued_at, i.due_at, i.paid_at, i.external_url, i.created_at
      from private.company_invoices i join public.tenants t on t.id = i.tenant_id
      order by i.created_at desc, i.id limit 200) i), '[]'::jsonb),
    'payments', coalesce((select jsonb_agg(p order by p.paid_at desc, p.id) from (
      select p.id, p.tenant_id, t.name as company_name, p.amount, p.currency, p.reference, p.paid_at
      from private.subscription_payments p join public.tenants t on t.id = p.tenant_id
      order by p.paid_at desc, p.id limit 100) p), '[]'::jsonb),
    'requests', coalesce((select jsonb_agg(r order by (r.status = 'open') desc, r.created_at desc) from (
      select r.id, r.tenant_id, t.name as company_name, r.from_plan, r.to_plan, r.billing_interval, r.note,
        r.status, r.response, r.created_at, r.handled_at
      from private.plan_change_requests r join public.tenants t on t.id = r.tenant_id
      order by (r.status = 'open') desc, r.created_at desc limit 100) r), '[]'::jsonb),
    'notices', coalesce((select jsonb_agg(n order by n.created_at desc) from (
      select n.id, n.tenant_id, t.name as company_name, n.kind, n.payload, n.created_at, n.sent_at, n.error, n.attempts
      from private.billing_notices n join public.tenants t on t.id = n.tenant_id
      order by n.created_at desc limit 100) n), '[]'::jsonb),
    'trial_defaults', coalesce((select jsonb_build_object('plan_code', s.default_plan_code, 'days', s.default_trial_days)
      from private.platform_settings s), '{"plan_code":null,"days":0}'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

revoke all on function private.normalize_subscription(), private.start_default_trial(),
  private.tenant_usage(uuid, timestamptz), private.estimate_bill(uuid, timestamptz),
  private.generate_billing_notices(), private.next_invoice_number(), private.apply_plan(uuid, text, text)
from public, anon, authenticated, service_role;

revoke all on function public.claim_billing_notices(integer), public.finish_billing_notice(uuid, boolean, text),
  public.company_billing(), public.request_plan_change(text, text, text), public.cancel_plan_change_request(),
  public.platform_billing_action(text, jsonb), public.platform_billing_overview()
from public, anon, authenticated, service_role;

grant execute on function public.company_billing(), public.request_plan_change(text, text, text),
  public.cancel_plan_change_request(), public.platform_billing_action(text, jsonb),
  public.platform_billing_overview() to authenticated;
grant execute on function public.claim_billing_notices(integer), public.finish_billing_notice(uuid, boolean, text)
  to service_role;
