-- ----------------------------------------------------------------------------
-- 0) Extensión requerida
-- ----------------------------------------------------------------------------
create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- 1) TABLA expense_types
-- ----------------------------------------------------------------------------
create table if not exists public.expense_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  label text not null,
  created_at timestamptz not null default now()
);

insert into public.expense_types (name, label) values
  ('compra', 'Compra'),
  ('transferencia', 'Transferencia'),
  ('pago', 'Pago'),
  ('transporte', 'Transporte')
on conflict (name) do nothing;

alter table public.expense_types enable row level security;

drop policy if exists "select_expense_types" on public.expense_types;
create policy "select_expense_types"
  on public.expense_types
  for select
  to authenticated
  using (true);

-- ----------------------------------------------------------------------------
-- 2) TABLA entities
-- ----------------------------------------------------------------------------
create table if not exists public.entities (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

alter table public.entities enable row level security;

drop policy if exists "select_entities" on public.entities;
create policy "select_entities"
  on public.entities
  for select
  to authenticated
  using (true);

-- ----------------------------------------------------------------------------
-- 3) TABLA entity_email_patterns
--    Una entidad puede tener múltiples remitentes/patrones de correo.
-- ----------------------------------------------------------------------------
create table if not exists public.entity_email_patterns (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.entities(id) on delete cascade,
  pattern text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_entity_email_patterns_entity
  on public.entity_email_patterns(entity_id);

alter table public.entity_email_patterns enable row level security;

drop policy if exists "select_entity_email_patterns" on public.entity_email_patterns;
create policy "select_entity_email_patterns"
  on public.entity_email_patterns
  for select
  to authenticated
  using (true);

-- ----------------------------------------------------------------------------
-- 4) TABLA email_templates
-- ----------------------------------------------------------------------------
create table if not exists public.email_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sender_pattern text,
  subject_pattern text,
  amount_regex text not null,
  merchant_regex text,
  date_regex text,
  date_format text,
  entity_name text,
  default_currency text,
  currency_regex text,
  source_account_regex text,
  time_regex text,
  expense_type_id uuid references public.expense_types(id),
  entity_id uuid references public.entities(id),
  match_pattern text,
  created_by uuid references public.profiles(id),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_email_templates_active
  on public.email_templates(active);

create index if not exists idx_email_templates_created_by
  on public.email_templates(created_by);

create index if not exists idx_email_templates_entity_id
  on public.email_templates(entity_id);

create index if not exists idx_email_templates_expense_type_id
  on public.email_templates(expense_type_id);

alter table public.email_templates enable row level security;

drop policy if exists "select_active_email_templates" on public.email_templates;
create policy "select_active_email_templates"
  on public.email_templates
  for select
  to authenticated
  using (active = true);

drop policy if exists "insert_own_email_templates" on public.email_templates;
create policy "insert_own_email_templates"
  on public.email_templates
  for insert
  to authenticated
  with check (created_by = auth.uid());

drop policy if exists "update_own_email_templates" on public.email_templates;
create policy "update_own_email_templates"
  on public.email_templates
  for update
  to authenticated
  using (created_by = auth.uid());

-- ----------------------------------------------------------------------------
-- 5) TABLA user_template_preferences
--    Modelo por excepción: si no existe fila, la plantilla está habilitada.
-- ----------------------------------------------------------------------------
create table if not exists public.user_template_preferences (
  user_id uuid not null references public.profiles(id) on delete cascade,
  template_id uuid not null references public.email_templates(id) on delete cascade,
  enabled boolean not null default true,
  primary key (user_id, template_id)
);

create index if not exists idx_user_template_preferences_user
  on public.user_template_preferences(user_id);

alter table public.user_template_preferences enable row level security;

drop policy if exists "select_own_template_preferences" on public.user_template_preferences;
create policy "select_own_template_preferences"
  on public.user_template_preferences
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "insert_own_template_preferences" on public.user_template_preferences;
create policy "insert_own_template_preferences"
  on public.user_template_preferences
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "update_own_template_preferences" on public.user_template_preferences;
create policy "update_own_template_preferences" on public.user_template_preferences
  for update
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "delete_own_template_preferences" on public.user_template_preferences;
create policy "delete_own_template_preferences"
  on public.user_template_preferences
  for delete
  to authenticated
  using (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 6) TABLA email_ingest_connections
-- ----------------------------------------------------------------------------
create table if not exists public.email_ingest_connections (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  webhook_token text not null unique default encode(gen_random_bytes(24), 'hex'),
  last_sync_at timestamptz,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create index if not exists idx_email_ingest_connections_token
  on public.email_ingest_connections(webhook_token);

alter table public.email_ingest_connections enable row level security;

drop policy if exists "select_own_email_ingest_connection" on public.email_ingest_connections;
create policy "select_own_email_ingest_connection"
  on public.email_ingest_connections
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "insert_own_email_ingest_connection" on public.email_ingest_connections;
create policy "insert_own_email_ingest_connection"
  on public.email_ingest_connections
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "update_own_email_ingest_connection" on public.email_ingest_connections;
create policy "update_own_email_ingest_connection"
  on public.email_ingest_connections
  for update
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "delete_own_email_ingest_connection" on public.email_ingest_connections;
create policy "delete_own_email_ingest_connection"
  on public.email_ingest_connections
  for delete
  to authenticated
  using (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 7) expense_drafts: columnas finales usadas por esta funcionalidad
-- ----------------------------------------------------------------------------
alter table public.expense_drafts
  add column if not exists template_id uuid references public.email_templates(id);

alter table public.expense_drafts
  add column if not exists currency text;

alter table public.expense_drafts
  add column if not exists entity text;

alter table public.expense_drafts
  add column if not exists source_account text;

alter table public.expense_drafts
  add column if not exists detected_time text;

alter table public.expense_drafts
  add column if not exists concept text;

-- No inventar una moneda cuando la ingestión no la detectó.
alter table public.expense_drafts
  alter column currency drop default;

create unique index if not exists idx_expense_drafts_gmail_msg
  on public.expense_drafts(gmail_message_id);

-- ----------------------------------------------------------------------------
-- 8) Resolver usuario por token de webhook
-- ----------------------------------------------------------------------------
create or replace function public.resolve_user_by_webhook_token(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  if p_token is null or length(trim(p_token)) = 0 then
    return null;
  end if;

  select user_id
    into v_user_id
  from public.email_ingest_connections
  where webhook_token = trim(p_token)
    and status = 'active';

  if v_user_id is not null then
    update public.email_ingest_connections
    set last_sync_at = now()
    where user_id = v_user_id;
  end if;

  return v_user_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 9) Obtener plantillas activas para el webhook
--    Incluye entidad, match_pattern y patrones de correo de la entidad.
-- ----------------------------------------------------------------------------
create or replace function public.get_email_templates_for_webhook(p_token text)
returns table (
  id uuid,
  name text,
  sender_pattern text,
  subject_pattern text,
  amount_regex text,
  merchant_regex text,
  date_regex text,
  date_format text,
  entity_name text,
  default_currency text,
  currency_regex text,
  source_account_regex text,
  time_regex text,
  expense_type_id uuid,
  expense_type_label text,
  entity_id uuid,
  match_pattern text,
  entity_email_patterns text[],
  created_by uuid,
  active boolean,
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
    t.sender_pattern,
    t.subject_pattern,
    t.amount_regex,
    t.merchant_regex,
    t.date_regex,
    t.date_format,
    t.entity_name,
    t.default_currency,
    t.currency_regex,
    t.source_account_regex,
    t.time_regex,
    t.expense_type_id,
    et.label as expense_type_label,
    t.entity_id,
    t.match_pattern,
    coalesce(eep.patterns, array[]::text[]) as entity_email_patterns,
    t.created_by,
    t.active,
    t.created_at
  from public.email_templates t
  left join public.expense_types et
    on et.id = t.expense_type_id
  left join lateral (
    select array_agg(p.pattern order by p.created_at) as patterns
    from public.entity_email_patterns p
    where p.entity_id = t.entity_id
  ) eep
    on true
  where t.active = true
    and not exists (
      select 1
      from public.user_template_preferences p
      where p.template_id = t.id
        and p.user_id = v_user_id
        and p.enabled = false
    )
  order by t.created_at asc;
end;
$$;

-- ----------------------------------------------------------------------------
-- 10) Detectar ambigüedades de plantillas
--     Misma entidad + mismo subject_pattern + al menos una sin match_pattern.
-- ----------------------------------------------------------------------------
create or replace function public.detect_ambiguous_templates()
returns table (
  entity_id uuid,
  subject_pattern text,
  template_ids uuid[],
  template_names text[]
)
language sql
security definer
set search_path = public
as $$
  select
    t.entity_id,
    t.subject_pattern,
    array_agg(t.id order by t.created_at) as template_ids,
    array_agg(t.name order by t.created_at) as template_names
  from public.email_templates t
  where t.active = true
    and t.entity_id is not null
    and t.subject_pattern is not null
  group by t.entity_id, t.subject_pattern
  having count(*) > 1
     and count(*) filter (where t.match_pattern is null) > 0;
$$;

-- ----------------------------------------------------------------------------
-- 11) Insertar candidato de gasto desde webhook
--     Estado final: p_currency puede quedar NULL; p_concept es opcional.
-- ----------------------------------------------------------------------------
create or replace function public.insert_expense_candidate_for_webhook(
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
  p_received_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_inserted_id uuid;
  v_raw_snippet text;
begin
  v_user_id := public.resolve_user_by_webhook_token(p_token);

  if v_user_id is null then
    raise exception 'Token de webhook inválido o inactivo';
  end if;

  if p_gmail_message_id is null
     or length(trim(p_gmail_message_id)) = 0 then
    raise exception 'gmail_message_id es requerido';
  end if;

  v_raw_snippet :=
      coalesce(p_entity, 'Notificación')
      || ': '
      || coalesce(p_merchant, 'Compra')
      || ' por '
      || coalesce(p_currency, 'COP')
      || ' '
      || coalesce(p_amount::text, '0');

  insert into public.expense_drafts (
    user_id,
    gmail_message_id,
    template_id,
    detected_amount,
    currency,
    detected_merchant,
    entity,
    source_account,
    detected_date,
    detected_time,
    concept,
    raw_snippet,
    confidence,
    status,
    created_at
  )
  values (
    v_user_id,
    trim(p_gmail_message_id),
    p_template_id,
    p_amount,
    p_currency,
    p_merchant,
    p_entity,
    p_source_account,
    coalesce(p_date, current_date),
    p_time,
    p_concept,
    v_raw_snippet,
    0.95,
    'pending',
    coalesce(p_received_at, now())
  )
  on conflict (gmail_message_id) do nothing
  returning id into v_inserted_id;

  return jsonb_build_object(
    'success', true,
    'inserted', (v_inserted_id is not null),
    'id', v_inserted_id,
    'user_id', v_user_id,
    'gmail_message_id', p_gmail_message_id
  );
end;
$$;