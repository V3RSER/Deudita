-- ============================================================================
-- 03_email_templates_and_gmail_ingest.sql (IDEMPOTENTE)
-- Entidades financieras, patrones de correo, plantillas de extracción,
-- conexiones de ingesta Gmail y helpers de resolución de webhook.
-- Consolidado desde 0003, 0005, 0006, 0007, 0008, 0009, 0010 — estado final.
-- Seguro de re-ejecutar cuantas veces sea necesario.
--
-- NOTA: La función insert_expense_for_webhook se define en
-- 04_expenses_and_payments.sql para satisfacer la dependencia sobre
-- public.expenses y public.expense_items.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- ENTIDADES FINANCIERAS / EMISORES
-- ----------------------------------------------------------------------------
create table if not exists public.entities (
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
create table if not exists public.entity_email_patterns (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.entities(id) on delete cascade,
  pattern text not null check (position('@' in pattern) > 0),
  created_at timestamptz not null default now()
);

create unique index if not exists entity_email_patterns_entity_pattern_uidx
  on public.entity_email_patterns(entity_id, pattern);

-- ----------------------------------------------------------------------------
-- TIPOS DE GASTOS DINÁMICOS
-- ----------------------------------------------------------------------------
create table if not exists public.expense_types (
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
create table if not exists public.email_templates (
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
create table if not exists public.email_ingest_connections (
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
create table if not exists public.user_template_preferences (
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

drop policy if exists "select_entities" on public.entities;
create policy "select_entities" on public.entities for select using (true);

drop policy if exists "insert_entities" on public.entities;
create policy "insert_entities" on public.entities
  for insert to authenticated with check (true);

drop policy if exists "select_entity_email_patterns" on public.entity_email_patterns;
create policy "select_entity_email_patterns" on public.entity_email_patterns for select using (true);

drop policy if exists "insert_entity_email_patterns" on public.entity_email_patterns;
create policy "insert_entity_email_patterns" on public.entity_email_patterns
  for insert to authenticated with check (true);

drop policy if exists "select_expense_types" on public.expense_types;
create policy "select_expense_types" on public.expense_types for select using (true);

-- email_templates: RLS final según 0006 (abierta a authenticated en las 4 operaciones)
drop policy if exists "select_email_templates" on public.email_templates;
create policy "select_email_templates" on public.email_templates
  for select to authenticated using (true);

drop policy if exists "insert_email_templates" on public.email_templates;
create policy "insert_email_templates" on public.email_templates
  for insert to authenticated with check (true);

drop policy if exists "update_email_templates" on public.email_templates;
create policy "update_email_templates" on public.email_templates
  for update to authenticated using (true) with check (true);

drop policy if exists "delete_email_templates" on public.email_templates;
create policy "delete_email_templates" on public.email_templates
  for delete to authenticated using (true);

drop policy if exists "email_ingest_connections_policy" on public.email_ingest_connections;
create policy "email_ingest_connections_policy" on public.email_ingest_connections
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "user_template_preferences_policy" on public.user_template_preferences;
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
