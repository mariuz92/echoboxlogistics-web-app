-- Prices for the marketing site.
--
-- The landing page shows the plans an operator marks as available and public, read from the
-- database through the public-plans Edge Function (which calls get_public_plans with the service
-- role), so a price changed in the Superadmin console appears on the site without a deploy.
-- One plan can carry the "most popular" badge.

alter table private.platform_plans
  add column highlighted boolean not null default false;

-- Pro carries the badge until an operator chooses another plan.
update private.platform_plans set highlighted = true
where code = 'pro' and not exists (select 1 from private.platform_plans where highlighted);

-- Only public data: no internal flags, nothing about companies.
create function public.get_public_plans()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'code', p.code, 'name', p.name, 'description', p.description, 'highlighted', p.highlighted,
    'currency', p.currency, 'price_month', p.price_month, 'price_year', p.price_year,
    'included_riders', p.included_riders, 'included_orders', p.included_orders,
    'extra_rider_price', p.extra_rider_price, 'extra_orders_price', p.extra_orders_price,
    'orders_block', p.orders_block
  ) order by p.sort_order, p.name), '[]'::jsonb)
  from private.platform_plans p
  where p.available and p.is_public;
$$;

-- Operator action: choose which plan carries the badge (at most one).
create function public.platform_highlight_plan(p_code text, p_highlighted boolean, p_reason text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := private.require_platform_admin();
  v_reason text := nullif(btrim(p_reason), '');
begin
  if v_reason is null or char_length(v_reason) > 500 then raise exception 'operator_reason_required'; end if;
  if not exists (select 1 from private.platform_plans p where p.code = p_code) then
    raise exception 'plan_not_found';
  end if;
  if p_highlighted then
    update private.platform_plans set highlighted = (code = p_code);
  else
    update private.platform_plans set highlighted = false where code = p_code;
  end if;
  perform private.write_platform_audit(v_actor, null, 'highlight_plan', v_reason, null,
    jsonb_build_object('plan', p_code, 'highlighted', p_highlighted));
end;
$$;

revoke all on function public.get_public_plans(), public.platform_highlight_plan(text, boolean, text)
from public, anon, authenticated, service_role;
grant execute on function public.get_public_plans() to service_role;
grant execute on function public.platform_highlight_plan(text, boolean, text) to authenticated;
