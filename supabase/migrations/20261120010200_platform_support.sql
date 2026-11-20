alter table private.platform_issues
  add column assignee_id uuid references private.platform_admins(user_id) on delete set null,
  add column triage_version integer not null default 0;

-- A recurrence that reopens an issue also invalidates an editor opened before it.
create function private.bump_platform_issue_version()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if (new.state, new.severity, new.assignee_id) is distinct from (old.state, old.severity, old.assignee_id) then
    new.triage_version := old.triage_version + 1;
  end if;
  return new;
end;
$$;

create trigger platform_issue_triage_version
  before update on private.platform_issues
  for each row execute function private.bump_platform_issue_version();

create index platform_issue_activity_idx on private.platform_audit ((after_state->>'id'), id desc)
  where action = 'update_issue';

create function public.platform_issue_queue(
  p_tenant_id uuid default null, p_state text default 'active', p_source text default null,
  p_severity text default null, p_search text default null, p_offset integer default 0
)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  v_search text := nullif(lower(left(btrim(p_search), 120)), '');
  v_result jsonb;
begin
  perform private.require_platform_admin();
  if p_state is null or p_state not in ('all', 'active', 'open', 'investigating', 'resolved')
    or (p_source is not null and p_source not in ('web', 'flutter', 'backend'))
    or (p_severity is not null and p_severity not in ('info', 'warning', 'critical'))
    or coalesce(p_offset, -1) < 0 then
    raise exception 'invalid_issue_filters';
  end if;

  with matches as (
    select i.id, i.tenant_id, t.name as company_name, i.source, i.area, i.code, i.build, i.state, i.severity,
      i.occurrences, i.first_seen_at, i.last_seen_at, u.email as assignee_email
    from private.platform_issues i
    left join public.tenants t on t.id = i.tenant_id
    left join auth.users u on u.id = i.assignee_id
    where (p_tenant_id is null or i.tenant_id = p_tenant_id)
      and (p_source is null or i.source = p_source)
      and (p_severity is null or i.severity = p_severity)
      and (p_state = 'all' or i.state = p_state or (p_state = 'active' and i.state <> 'resolved'))
      and (v_search is null or strpos(lower(concat_ws(' ', i.id, t.name, t.slug, i.area,
        i.code, i.build, u.email)), v_search) > 0)
  ), page as (
    select * from matches order by last_seen_at desc, id limit 25 offset p_offset
  )
  select jsonb_build_object(
    'total', (select count(*) from matches),
    'issues', coalesce((select jsonb_agg(to_jsonb(p) order by p.last_seen_at desc, p.id) from page p), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

create function public.platform_issue_detail(p_issue_id uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  v_issue jsonb;
begin
  perform private.require_platform_admin();
  select to_jsonb(i) || jsonb_build_object('company_name', t.name, 'assignee_email', u.email) into v_issue
  from private.platform_issues i
  left join public.tenants t on t.id = i.tenant_id
  left join auth.users u on u.id = i.assignee_id
  where i.id = p_issue_id;
  if not found then raise exception 'issue_not_found'; end if;

  return jsonb_build_object('issue', v_issue, 'activity', coalesce((
    select jsonb_agg(to_jsonb(a) order by a.id desc) from (
      select a.id, a.created_at, coalesce(u.email, a.actor_id::text) as actor,
        a.reason, a.after_state->>'state' as state, a.after_state->>'severity' as severity
      from private.platform_audit a left join auth.users u on u.id = a.actor_id
      where a.action = 'update_issue' and a.after_state->>'id' = p_issue_id::text
      order by a.id desc limit 100
    ) a
  ), '[]'::jsonb));
end;
$$;

create function public.platform_issue_triage(
  p_issue_id uuid, p_version integer, p_state text, p_severity text, p_reason text, p_assignee_id uuid default null
)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := private.require_platform_admin();
  v_reason text := nullif(btrim(p_reason), '');
  v_before private.platform_issues;
  v_after private.platform_issues;
begin
  if v_reason is null or char_length(v_reason) > 500 then raise exception 'operator_reason_required'; end if;
  if coalesce(p_state, '') not in ('open', 'investigating', 'resolved')
    or coalesce(p_severity, '') not in ('info', 'warning', 'critical') then
    raise exception 'invalid_issue_triage';
  end if;

  select * into v_before from private.platform_issues i where i.id = p_issue_id for update;
  if not found then raise exception 'issue_not_found'; end if;
  if v_before.triage_version is distinct from p_version then raise exception 'issue_triage_changed'; end if;
  if p_assignee_id is not null and p_assignee_id is distinct from v_before.assignee_id then
    perform 1 from private.platform_admins a join auth.users u on u.id = a.user_id
    where a.user_id = p_assignee_id and a.enabled and u.email_confirmed_at is not null
      and (u.banned_until is null or u.banned_until <= now()) for share of a;
    if not found then raise exception 'issue_assignee_unavailable'; end if;
  end if;

  update private.platform_issues i set state = p_state, severity = p_severity, assignee_id = p_assignee_id
  where i.id = p_issue_id returning * into v_after;
  perform private.write_platform_audit(v_actor, v_after.tenant_id, 'update_issue', v_reason,
    jsonb_build_object('id', v_before.id, 'state', v_before.state, 'severity', v_before.severity,
      'assignee_id', v_before.assignee_id),
    jsonb_build_object('id', v_after.id, 'state', v_after.state, 'severity', v_after.severity,
      'assignee_id', v_after.assignee_id));
end;
$$;

-- Scope the existing order journal to the company selected in the console.
-- Raw payloads can contain guide details and belong to the company workspace.
create function public.platform_order_history(p_tenant_id uuid, p_order_id uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  perform private.require_platform_admin();
  if not exists (select 1 from public.orders o where o.id = p_order_id and o.tenant_id = p_tenant_id) then
    raise exception 'order_not_found';
  end if;
  return coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at desc, e.id desc) from (
    select e.id, e.event_type, e.from_status, e.to_status, e.created_at
    from public.order_events e where e.order_id = p_order_id and e.tenant_id = p_tenant_id
    order by e.created_at desc, e.id desc limit 100
  ) e), '[]'::jsonb);
end;
$$;

revoke all on function private.bump_platform_issue_version() from public, anon, authenticated, service_role;
revoke all on function public.platform_issue_queue(uuid, text, text, text, text, integer),
  public.platform_issue_detail(uuid), public.platform_issue_triage(uuid, integer, text, text, text, uuid),
  public.platform_order_history(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.platform_issue_queue(uuid, text, text, text, text, integer),
  public.platform_issue_detail(uuid), public.platform_issue_triage(uuid, integer, text, text, text, uuid),
  public.platform_order_history(uuid, uuid) to authenticated;
