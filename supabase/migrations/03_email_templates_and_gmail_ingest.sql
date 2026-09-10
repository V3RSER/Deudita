-- ============================================================================
-- 05_email_templates_and_gmail_ingest.sql
-- Entidades financieras, patrones de correo, plantillas de extracción,
-- conexiones de ingesta Gmail y RPCs de webhook.
-- Consolidado desde 0003, 0005, 0006, 0007, 0008, 0009, 0010 — estado final.
--
-- BUG PREEXISTENTE DETECTADO (heredado de 0010, no corregido aquí):
--   insert_expense_for_webhook() inserta en la columna expenses.split_config,
--   pero ninguna de las 10 migraciones originales crea esa columna en
--   public.expenses. Si vas a ejecutar esta función, agrega antes:
--     alter table public.expenses add column if not exists split_config jsonb;
--   Lo dejo señalado en vez de "arreglarlo silenciosamente" por si el nombre
--   correcto de la columna es otro en tu app real.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- ENTIDADES FINANCIERAS / EMISORES
-- ----------------------------------------------------------------------------
create table public.entities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  country text not null default 'CO',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- PATRONES DE CORREO DE ENTIDADES (remitentes)
-- ----------------------------------------------------------------------------
create table public.entity_email_patterns (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.entities(id) on delete cascade,
  pattern text not null check (position('@' in pattern) > 0),
  created_at timestamptz not null default now()
);

create unique index entity_email_patterns_entity_pattern_uidx
  on public.entity_email_patterns(entity_id, pattern);

-- ----------------------------------------------------------------------------
-- TIPOS DE GASTOS DINÁMICOS
-- ----------------------------------------------------------------------------
create table public.expense_types (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label text not null,
  is_default boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- PLANTILLAS DE EXTRACCIÓN DE CORREOS
-- (sin sender_pattern / entity_name / default_currency / active: eliminadas en 0007)
-- ----------------------------------------------------------------------------
create table public.email_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  entity_id uuid references public.entities(id) on delete set null,
  expense_type_id uuid references public.expense_types(id) on delete set null,
  subject_pattern text,
  match_pattern text,
  amount_regex text not null,
  merchant_regex text,
  date_regex text not null,
  date_format text not null,
  currency_regex text,
  source_account_regex text,
  time_regex text,
  time_format text,
  created_by uuid references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- CONEXIONES DE INGESTA DE GMAIL POR USUARIO
-- ----------------------------------------------------------------------------
create table public.email_ingest_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  webhook_token text not null unique,
  status text not null default 'active',
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- PREFERENCIAS DE USUARIO PARA PLANTILLAS ACTIVAS/DESACTIVADAS
-- ----------------------------------------------------------------------------
create table public.user_template_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  template_id uuid not null references public.email_templates(id) on delete cascade,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique(user_id, template_id)
);

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
alter table public.entities enable row level security;
alter table public.entity_email_patterns enable row level security;
alter table public.expense_types enable row level security;
alter table public.email_templates enable row level security;
alter table public.email_ingest_connections enable row level security;
alter table public.user_template_preferences enable row level security;

create policy "select_entities" on public.entities for select using (true);

create policy "insert_entities" on public.entities
  for insert to authenticated with check (true);

create policy "select_entity_email_patterns" on public.entity_email_patterns for select using (true);

create policy "insert_entity_email_patterns" on public.entity_email_patterns
  for insert to authenticated with check (true);

create policy "select_expense_types" on public.expense_types for select using (true);

-- email_templates: RLS final según 0006 (abierta a authenticated en las 4 operaciones)
create policy "select_email_templates" on public.email_templates
  for select to authenticated using (true);

create policy "insert_email_templates" on public.email_templates
  for insert to authenticated with check (true);

create policy "update_email_templates" on public.email_templates
  for update to authenticated using (true) with check (true);

create policy "delete_email_templates" on public.email_templates
  for delete to authenticated using (true);

create policy "email_ingest_connections_policy" on public.email_ingest_connections
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "user_template_preferences_policy" on public.user_template_preferences
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- FUNCIONES
-- ----------------------------------------------------------------------------

-- Resuelve usuario por webhook_token de forma segura
create or replace function public.resolve_user_by_webhook_token(p_token text)
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select user_id
  from public.email_ingest_connections
  where webhook_token = trim(p_token)
    and status = 'active'
  limit 1;
$$;

-- Obtiene plantillas activas para el Google Apps Script de ingesta
create or replace function public.get_email_templates_for_webhook(p_token text)
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

-- RPC de webhook: inserta un gasto en modo borrador ("sin grupo"), con
-- soporte de ítems (gasto desglosado). Versión final según 0010.
-- Ver advertencia de split_config al inicio de este archivo.
create or replace function public.insert_expense_for_webhook(
  p_token text,
  p_gmail_message_id text,
  p_template_id uuid default null,
  p_amount numeric default null,
  p_currency text default null,
  p_merchant text default null,
  p_entity text default null,
  p_source_account text default null,
  p_date date default current_date,
  p_time text default null,
  p_concept text default null,
  p_received_at timestamptz default null,
  p_expense_type text default null,
  p_items jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_expense_id uuid;
  v_raw_snippet text;
  v_description text;
  v_item jsonb;
  v_item_desc text;
  v_item_amount numeric;
  v_is_itemized boolean := false;
  v_split_config jsonb;
begin
  v_user_id := public.resolve_user_by_webhook_token(p_token);

  if v_user_id is null then
    raise exception 'Token de webhook inválido o inactivo';
  end if;

  if p_gmail_message_id is null or length(trim(p_gmail_message_id)) = 0 then
    raise exception 'gmail_message_id es requerido';
  end if;

  -- Verificar si ya existe en expenses
  select id into v_expense_id
  from public.expenses
  where gmail_message_id = trim(p_gmail_message_id)
  limit 1;

  if v_expense_id is not null then
    return jsonb_build_object(
      'success', true,
      'inserted', false,
      'expense_id', v_expense_id,
      'is_draft', true,
      'message', 'Gasto ya registrado previamente'
    );
  end if;

  v_description := coalesce(nullif(trim(p_merchant), ''), nullif(trim(p_concept), ''), 'Gasto detectado');

  v_raw_snippet :=
      coalesce(p_entity, 'Notificación')
      || ': '
      || v_description
      || ' por '
      || coalesce(p_currency, 'COP')
      || ' '
      || coalesce(p_amount::text, '0');

  v_is_itemized := jsonb_typeof(p_items) = 'array' and jsonb_array_length(p_items) > 0;

  if v_is_itemized then
    v_split_config := jsonb_build_object(
      'version', 1,
      'splitType', 'itemized',
      'mode', 'itemized',
      'items', p_items
    );
  else
    v_split_config := jsonb_build_object(
      'version', 1,
      'splitType', 'equal',
      'mode', 'quick'
    );
  end if;

  -- Insertar gasto en modo borrador (sin grupo)
  insert into public.expenses (
    group_id,
    paid_by,
    created_by,
    total_amount,
    description,
    expense_date,
    expense_time,
    source,
    is_draft,
    source_account,
    entity,
    currency,
    template_id,
    gmail_message_id,
    raw_snippet,
    expense_type,
    split_config,
    created_at
  )
  values (
    null,
    v_user_id,
    v_user_id,
    coalesce(p_amount, 0),
    v_description,
    coalesce(p_date, current_date),
    p_time,
    'gmail',
    true,
    p_source_account,
    p_entity,
    coalesce(p_currency, 'COP'),
    p_template_id,
    trim(p_gmail_message_id),
    v_raw_snippet,
    p_expense_type,
    v_split_config,
    coalesce(p_received_at, now())
  )
  returning id into v_expense_id;

  -- Si es desglosado, insertar ítems
  if v_is_itemized then
    for v_item in select * from jsonb_array_elements(p_items)
    loop
      v_item_desc := coalesce(v_item->>'description', v_item->>'desc', 'Artículo');
      v_item_amount := coalesce((v_item->>'amount')::numeric, 0);

      insert into public.expense_items (expense_id, description, amount)
      values (v_expense_id, v_item_desc, v_item_amount);
    end loop;
  end if;

  return jsonb_build_object(
    'success', true,
    'inserted', true,
    'expense_id', v_expense_id,
    'is_draft', true,
    'is_itemized', v_is_itemized,
    'status', 'draft',
    'message', 'Gasto guardado en modo borrador'
  );
end;
$$;
