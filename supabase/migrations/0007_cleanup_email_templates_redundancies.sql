-- Migración 0007: Optimización y desacoplamiento de redundancias en email_templates
-- 1. Asegurar defaults y flexibilidad en columnas opcionales/redundantes
alter table if exists public.email_templates
  alter column time_format set default 'HH:mm:ss',
  alter column default_currency set default 'COP',
  alter column active set default true;

-- 2. Función optimizada para Google Apps Script que devuelve la entidad canónica y sus patrones
create or replace function public.get_email_templates_for_webhook(p_token text)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_user_id uuid;
  v_result jsonb;
begin
  -- Validar conexión activa por token
  select user_id into v_user_id
  from public.email_ingest_connections
  where webhook_token = p_token
    and status = 'active';

  if v_user_id is null then
    return null;
  end if;

  -- Actualizar último sync
  update public.email_ingest_connections
  set last_sync_at = now()
  where user_id = v_user_id;

  -- Retornar plantillas enriquecidas con entidades y patrones
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', t.id,
      'name', t.name,
      'entity_id', t.entity_id,
      'entity_name', coalesce(e.name, t.entity_name),
      'entity_email_patterns', coalesce(
        (
          select jsonb_agg(p.pattern)
          from public.entity_email_patterns p
          where p.entity_id = t.entity_id
        ),
        '[]'::jsonb
      ),
      'sender_pattern', t.sender_pattern,
      'subject_pattern', t.subject_pattern,
      'match_pattern', t.match_pattern,
      'amount_regex', t.amount_regex,
      'merchant_regex', t.merchant_regex,
      'date_regex', t.date_regex,
      'date_format', coalesce(t.date_format, 'DD/MM/YYYY'),
      'time_regex', t.time_regex,
      'time_format', coalesce(t.time_format, case when t.time_regex is not null then 'HH:mm:ss' else null end),
      'currency_regex', t.currency_regex,
      'default_currency', coalesce(t.default_currency, 'COP'),
      'source_account_regex', t.source_account_regex,
      'active', coalesce(t.active, true)
    )
    order by t.created_at asc
  ), '[]'::jsonb)
  into v_result
  from public.email_templates t
  left join public.entities e on e.id = t.entity_id
  where (t.active is null or t.active = true)
    and not exists (
      select 1
      from public.user_template_preferences utp
      where utp.user_id = v_user_id
        and utp.template_id = t.id
        and utp.enabled = false
    );

  return v_result;
end;
$$;
