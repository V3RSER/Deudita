begin;

drop function if exists public.get_email_templates_for_webhook(text);

update public.email_templates
set time_format = 'HH:mm:ss'
where time_regex is not null
  and time_format is null;

alter table public.email_templates
  drop column if exists sender_pattern,
  drop column if exists entity_name,
  drop column if exists default_currency,
  drop column if exists active;

create function public.get_email_templates_for_webhook(p_token text)
returns table (
  id uuid,
  name text,
  subject_pattern text,
  match_pattern text,
  amount_regex text,
  merchant_regex text,
  date_regex text,
  date_format text,
  currency_regex text,
  source_account_regex text,
  time_regex text,
  time_format text,
  expense_type_id uuid,
  expense_type_label text,
  entity_id uuid,
  entity_email_patterns text[],
  created_by uuid,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  v_user_id := public.resolve_user_by_webhook_token(p_token);

  if v_user_id is null then
    raise exception 'Token de webhook inválido o inactivo';
  end if;

  update public.email_ingest_connections
  set last_sync_at = now()
  where user_id = v_user_id;

  return query
  select
    t.id,
    t.name,
    t.subject_pattern,
    t.match_pattern,
    t.amount_regex,
    t.merchant_regex,
    t.date_regex,
    t.date_format,
    t.currency_regex,
    t.source_account_regex,
    t.time_regex,
    t.time_format,
    t.expense_type_id,
    et.label,
    t.entity_id,
    coalesce(eep.patterns, array[]::text[]),
    t.created_by,
    t.created_at
  from public.email_templates t
  left join public.expense_types et on et.id = t.expense_type_id
  left join lateral (
    select array_agg(p.pattern order by p.created_at) as patterns
    from public.entity_email_patterns p
    where p.entity_id = t.entity_id
  ) eep on true
  where not exists (
    select 1
    from public.user_template_preferences p
    where p.template_id = t.id
      and p.user_id = v_user_id
      and p.enabled = false
  )
  order by t.created_at asc;
end;
$$;

commit;
