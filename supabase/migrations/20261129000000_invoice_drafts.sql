-- Automatic invoice drafts.
--
-- Every month the system prepares a DRAFT invoice for each paying company, from the real figures of
-- the month that has just ended, so the operator only reviews, issues and sends it:
--   - monthly plans:  base fee + extra riders + extra orders of the closed month
--   - yearly plans:   extra riders and orders of the closed month only (the base fee is paid in advance)
--   - yearly renewals: a draft for the next term, 30 days before the current one ends
-- Nothing is sent to the customer: sending the invoice (and later e-invoicing and payment collection)
-- stays a manual step, or a later automation, on top of these drafts.
--
-- Drafts are idempotent (one per company and period), get their number only when issued, and a draft
-- that is not wanted is voided, not deleted, so it is not generated again.

alter table private.company_invoices
  add column auto_key text check (char_length(auto_key) <= 40);

create unique index company_invoices_auto_key_uidx
  on private.company_invoices(tenant_id, auto_key) where auto_key is not null;

alter table private.platform_settings
  add column invoices_generated_at timestamptz;

-- A draft carries a placeholder number; the real EB-<year>-<n> number is taken when it is issued,
-- so voided drafts do not leave holes in the numbering.
create function private.number_invoice_on_issue()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  new.number := private.next_invoice_number();
  return new;
end;
$$;

create trigger company_invoices_number_on_issue
before update on private.company_invoices
for each row
when (old.status = 'draft' and new.status in ('issued', 'paid') and new.number like 'BOZZA-%')
execute function private.number_invoice_on_issue();

create function private.protect_auto_draft()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if old.auto_key is not null and old.status = 'draft' then
    raise exception 'auto_invoice_use_void';
  end if;
  return old;
end;
$$;

create trigger company_invoices_protect_auto_draft
before delete on private.company_invoices
for each row execute function private.protect_auto_draft();

-- Creates the drafts that are due and returns how many were created. Safe to run again.
--   p_month  first day of a closed month to invoice (default: the month that has just ended, plus the
--            yearly renewals that are due); p_tenant limits it to one company.
create function private.generate_invoice_drafts(p_month date default null, p_tenant uuid default null)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  r record;
  v_local_now timestamp;
  v_first date;
  v_est jsonb;
  v_lines jsonb;
  v_total numeric;
  v_count integer := 0;
  v_plan private.platform_plans;
  v_interval text;
  v_price numeric;
  v_start date;
  v_end date;
begin
  for r in
    select t.id as tenant_id, t.timezone as tz, s.plan_code, s.billing_interval, s.ends_at, s.state,
      s.next_plan_code, s.next_billing_interval, p.name as plan_name, p.currency
    from public.tenants t
    join private.company_subscriptions s on s.tenant_id = t.id
    join private.platform_plans p on p.code = s.plan_code
    where t.is_active and s.state in ('active', 'past_due') and not s.forever
      and (p_tenant is null or t.id = p_tenant)
  loop
    v_local_now := now() at time zone r.tz;
    v_first := coalesce(date_trunc('month', p_month::timestamp)::date,
      (date_trunc('month', v_local_now) - interval '1 month')::date);

    -- The month must be over in the company's time zone.
    if v_first < date_trunc('month', v_local_now)::date then
      v_est := private.estimate_bill(r.tenant_id, v_first::timestamp at time zone r.tz);
      select coalesce(jsonb_agg(l || jsonb_build_object('label', case l->>'code'
          when 'base' then 'Canone ' || r.plan_name || ' (mensile)'
          when 'extra_riders' then 'Rider aggiuntivi (' || (l->>'quantity') || ')'
          else 'Ordini aggiuntivi (' || (l->>'quantity') || ' × ' || coalesce(l->>'block', '100') || ')' end)),
          '[]'::jsonb),
        coalesce(sum((l->>'amount')::numeric), 0)
      into v_lines, v_total
      from jsonb_array_elements(v_est->'lines') l
      where r.billing_interval = 'month' or l->>'code' <> 'base';

      if v_total > 0 then
        insert into private.company_invoices(tenant_id, number, status, period_start, period_end, lines, amount,
          currency, auto_key)
        values (r.tenant_id, 'BOZZA-' || substr(gen_random_uuid()::text, 1, 8), 'draft', v_first,
          (v_first + interval '1 month')::date - 1, v_lines, v_total, r.currency, 'month:' || to_char(v_first, 'YYYY-MM'))
        on conflict (tenant_id, auto_key) where auto_key is not null do nothing;
        if found then v_count := v_count + 1; end if;
      end if;
    end if;

    -- A yearly term about to end: prepare the invoice of the next term (the plan that will apply then).
    if p_month is null and r.billing_interval = 'year' and r.state = 'active' and r.ends_at is not null
       and r.ends_at > now() and r.ends_at <= now() + interval '30 days' then
      select * into v_plan from private.platform_plans p where p.code = coalesce(r.next_plan_code, r.plan_code);
      v_interval := coalesce(r.next_billing_interval, 'year');
      v_price := case v_interval when 'year' then coalesce(v_plan.price_year, v_plan.price_month * 12)
        else v_plan.price_month end;
      v_start := (r.ends_at at time zone r.tz)::date;
      v_end := (v_start + case v_interval when 'year' then interval '1 year' else interval '1 month' end)::date - 1;
      if v_price > 0 then
        insert into private.company_invoices(tenant_id, number, status, period_start, period_end, lines, amount,
          currency, auto_key)
        values (r.tenant_id, 'BOZZA-' || substr(gen_random_uuid()::text, 1, 8), 'draft', v_start, v_end,
          jsonb_build_array(jsonb_build_object('code', 'base', 'quantity', 1, 'unit_price', v_price, 'amount', v_price,
            'label', 'Rinnovo ' || v_plan.name || case v_interval when 'year' then ' (annuale)' else ' (mensile)' end)),
          v_price, v_plan.currency, 'renewal:' || to_char(v_start, 'YYYY-MM-DD'))
        on conflict (tenant_id, auto_key) where auto_key is not null do nothing;
        if found then v_count := v_count + 1; end if;
      end if;
    end if;
  end loop;
  return v_count;
end;
$$;

-- Called by the worker through claim_billing_notices: at most once an hour.
create function private.generate_invoice_drafts_if_due()
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_last timestamptz;
begin
  select s.invoices_generated_at into v_last from private.platform_settings s;
  if v_last is not null and v_last > now() - interval '1 hour' then return; end if;
  insert into private.platform_settings(singleton, invoices_generated_at) values (true, now())
  on conflict (singleton) do update set invoices_generated_at = now();
  perform private.generate_invoice_drafts();
end;
$$;

-- The worker's call now also prepares the drafts that are due.
create or replace function public.claim_billing_notices(p_limit integer default 10)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_result jsonb;
begin
  perform private.generate_billing_notices();
  perform private.generate_invoice_drafts_if_due();
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

-- Operator: prepare the drafts of a closed month now (all companies, or one).
create function public.platform_generate_invoices(p_reason text, p_month date default null, p_tenant uuid default null)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := private.require_platform_admin();
  v_reason text := nullif(btrim(p_reason), '');
  v_count integer;
begin
  if v_reason is null or char_length(v_reason) > 500 then raise exception 'operator_reason_required'; end if;
  if p_month is not null and p_month <> date_trunc('month', p_month::timestamp)::date then
    raise exception 'month_invalid';
  end if;
  v_count := private.generate_invoice_drafts(p_month, p_tenant);
  perform private.write_platform_audit(v_actor, p_tenant, 'generate_invoices', v_reason, null,
    jsonb_build_object('month', p_month, 'created', v_count));
  return v_count;
end;
$$;

-- Operator: correct the lines of a draft (a discount, a note, an adjusted quantity) before issuing it.
create function public.platform_update_draft_invoice(
  p_invoice_id uuid, p_lines jsonb, p_reason text, p_due_at timestamptz default null, p_external_url text default null
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := private.require_platform_admin();
  v_reason text := nullif(btrim(p_reason), '');
  v_inv private.company_invoices;
  v_total numeric;
begin
  if v_reason is null or char_length(v_reason) > 500 then raise exception 'operator_reason_required'; end if;
  select * into v_inv from private.company_invoices i where i.id = p_invoice_id for update;
  if not found then raise exception 'invoice_not_found'; end if;
  if v_inv.status <> 'draft' then raise exception 'invoice_not_draft'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'invoice_lines_required'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_lines) l
    where jsonb_typeof(l) <> 'object' or coalesce(l->>'amount', '') !~ '^-?[0-9]+(\.[0-9]+)?$'
  ) then raise exception 'invalid_lines'; end if;
  select coalesce(sum((l->>'amount')::numeric), 0) into v_total from jsonb_array_elements(p_lines) l;
  if v_total < 0 then raise exception 'invalid_amount'; end if;
  update private.company_invoices i set lines = p_lines, amount = v_total, due_at = p_due_at,
    external_url = nullif(btrim(p_external_url), '')
  where i.id = p_invoice_id;
  perform private.write_platform_audit(v_actor, v_inv.tenant_id, 'update_invoice_draft', v_reason,
    jsonb_build_object('invoice_id', p_invoice_id, 'amount', v_inv.amount),
    jsonb_build_object('invoice_id', p_invoice_id, 'amount', v_total));
end;
$$;

-- The console list shows which invoices were prepared automatically and how many drafts wait for review.
create or replace function public.platform_billing_overview()
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
      'open_requests', (select count(*) from private.plan_change_requests r where r.status = 'open'),
      'drafts', (select count(*) from private.company_invoices i where i.status = 'draft')
    ),
    'companies', coalesce((select jsonb_agg(c order by c.name) from (
      select t.id, t.name, t.slug, t.is_active, private.company_access_mode(t.id) as access_mode,
        s.plan_code, p.name as plan_name, s.state, s.billing_interval, s.forever, s.ends_at, s.billing_email,
        private.tenant_usage(t.id) as usage, p.included_orders, p.included_riders, p.currency,
        (select coalesce(sum(i.amount), 0) from private.company_invoices i
          where i.tenant_id = t.id and i.status = 'issued') as unpaid,
        (select max(pay.paid_at) from private.subscription_payments pay
          where pay.tenant_id = t.id and pay.kind = 'payment') as last_paid_at
      from public.tenants t
      left join private.company_subscriptions s on s.tenant_id = t.id
      left join private.platform_plans p on p.code = s.plan_code
      order by t.name, t.id limit 300) c), '[]'::jsonb),
    'invoices', coalesce((select jsonb_agg(i order by i.created_at desc, i.id) from (
      select i.id, i.tenant_id, t.name as company_name, i.number, i.status, i.period_start, i.period_end, i.lines,
        i.amount, i.currency, i.issued_at, i.due_at, i.paid_at, i.external_url, i.created_at, i.auto_key
      from private.company_invoices i join public.tenants t on t.id = i.tenant_id
      order by i.created_at desc, i.id limit 200) i), '[]'::jsonb),
    'payments', coalesce((select jsonb_agg(p order by p.paid_at desc, p.id) from (
      select p.id, p.tenant_id, t.name as company_name, p.kind, p.amount, p.currency, p.reference, p.paid_at
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

revoke all on function private.number_invoice_on_issue(), private.protect_auto_draft(),
  private.generate_invoice_drafts(date, uuid), private.generate_invoice_drafts_if_due()
from public, anon, authenticated, service_role;

revoke all on function public.platform_generate_invoices(text, date, uuid),
  public.platform_update_draft_invoice(uuid, jsonb, text, timestamptz, text)
from public, anon, authenticated, service_role;
grant execute on function public.platform_generate_invoices(text, date, uuid),
  public.platform_update_draft_invoice(uuid, jsonb, text, timestamptz, text) to authenticated;
