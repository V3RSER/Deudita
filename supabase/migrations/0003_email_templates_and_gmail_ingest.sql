-- ============================================================================
-- MIGRACIÓN 0003: PLANTILLAS DE CORREO E INGESTIÓN DE GMAIL
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) TABLA email_templates
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
  default_currency text default 'COP',
  currency_regex text,
  source_account_regex text,
  time_regex text,
  created_by uuid references public.profiles(id),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_email_templates_active on public.email_templates(active);
create index if not exists idx_email_templates_created_by on public.email_templates(created_by);

alter table public.email_templates enable row level security;

drop policy if exists "select_active_email_templates" on public.email_templates;
create policy "select_active_email_templates"
  on public.email_templates for select
  to authenticated
  using (active = true);

drop policy if exists "insert_own_email_templates" on public.email_templates;
create policy "insert_own_email_templates"
  on public.email_templates for insert
  to authenticated
  with check (created_by = auth.uid());

drop policy if exists "update_own_email_templates" on public.email_templates;
create policy "update_own_email_templates"
  on public.email_templates for update
  to authenticated
  using (created_by = auth.uid());

-- ----------------------------------------------------------------------------
-- 2) TABLA user_template_preferences (Modelo por excepción)
-- ----------------------------------------------------------------------------
create table if not exists public.user_template_preferences (
  user_id uuid not null references public.profiles(id) on delete cascade,
  template_id uuid not null references public.email_templates(id) on delete cascade,
  enabled boolean not null default true,
  primary key (user_id, template_id)
);

create index if not exists idx_user_template_preferences_user on public.user_template_preferences(user_id);

alter table public.user_template_preferences enable row level security;

drop policy if exists "select_own_template_preferences" on public.user_template_preferences;
create policy "select_own_template_preferences"
  on public.user_template_preferences for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "insert_own_template_preferences" on public.user_template_preferences;
create policy "insert_own_template_preferences"
  on public.user_template_preferences for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "update_own_template_preferences" on public.user_template_preferences;
create policy "update_own_template_preferences"
  on public.user_template_preferences for update
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "delete_own_template_preferences" on public.user_template_preferences;
create policy "delete_own_template_preferences"
  on public.user_template_preferences for delete
  to authenticated
  using (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 3) TABLA email_ingest_connections
-- ----------------------------------------------------------------------------
create table if not exists public.email_ingest_connections (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  webhook_token text not null unique default encode(gen_random_bytes(24), 'hex'),
  last_sync_at timestamptz,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create index if not exists idx_email_ingest_connections_token on public.email_ingest_connections(webhook_token);

alter table public.email_ingest_connections enable row level security;

drop policy if exists "select_own_email_ingest_connection" on public.email_ingest_connections;
create policy "select_own_email_ingest_connection"
  on public.email_ingest_connections for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "insert_own_email_ingest_connection" on public.email_ingest_connections;
create policy "insert_own_email_ingest_connection"
  on public.email_ingest_connections for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "update_own_email_ingest_connection" on public.email_ingest_connections;
create policy "update_own_email_ingest_connection"
  on public.email_ingest_connections for update
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "delete_own_email_ingest_connection" on public.email_ingest_connections;
create policy "delete_own_email_ingest_connection"
  on public.email_ingest_connections for delete
  to authenticated
  using (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 4) AMPLIAR expense_drafts
-- ----------------------------------------------------------------------------
alter table public.expense_drafts add column if not exists template_id uuid references public.email_templates(id);
alter table public.expense_drafts add column if not exists currency text default 'COP';
alter table public.expense_drafts add column if not exists entity text;
alter table public.expense_drafts add column if not exists source_account text;
alter table public.expense_drafts add column if not exists detected_time text;

create unique index if not exists idx_expense_drafts_gmail_msg on public.expense_drafts(gmail_message_id);

-- ----------------------------------------------------------------------------
-- 5) FUNCIONES DE SEGURIDAD PARA INGESTIÓN VÍA WEBHOOK (Apps Script)
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

  select user_id into v_user_id
  from public.email_ingest_connections
  where webhook_token = trim(p_token) and status = 'active';

  if v_user_id is not null then
    update public.email_ingest_connections
    set last_sync_at = now()
    where user_id = v_user_id;
  end if;

  return v_user_id;
end;
$$;

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
  select t.id, t.name, t.sender_pattern, t.subject_pattern, t.amount_regex,
         t.merchant_regex, t.date_regex, t.date_format, t.entity_name,
         t.default_currency, t.currency_regex, t.source_account_regex,
         t.time_regex, t.created_by, t.active, t.created_at
  from public.email_templates t
  where t.active = true
    and not exists (
      select 1 from public.user_template_preferences p
      where p.template_id = t.id
        and p.user_id = v_user_id
        and p.enabled = false
    )
  order by t.created_at asc;
end;
$$;

create or replace function public.insert_expense_candidate_for_webhook(
  p_token text,
  p_gmail_message_id text,
  p_template_id uuid default null,
  p_amount numeric default null,
  p_currency text default 'COP',
  p_merchant text default null,
  p_entity text default null,
  p_source_account text default null,
  p_date date default current_date,
  p_time text default null,
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

  if p_gmail_message_id is null or length(trim(p_gmail_message_id)) = 0 then
    raise exception 'gmail_message_id es requerido';
  end if;

  v_raw_snippet := coalesce(p_entity, 'Notificación') || ': ' || coalesce(p_merchant, 'Compra') ||
                   ' por ' || coalesce(p_currency, 'COP') || ' ' || coalesce(p_amount::text, '0');

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
    raw_snippet,
    confidence,
    status,
    created_at
  ) values (
    v_user_id,
    trim(p_gmail_message_id),
    p_template_id,
    p_amount,
    coalesce(p_currency, 'COP'),
    p_merchant,
    p_entity,
    p_source_account,
    coalesce(p_date, current_date),
    p_time,
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

-- ----------------------------------------------------------------------------
-- 6) PLANTILLAS POR DEFECTO (Ejemplos Bancolombia, Nequi, Daviplata)
-- ----------------------------------------------------------------------------
insert into public.email_templates (
  name,
  sender_pattern,
  subject_pattern,
  amount_regex,
  merchant_regex,
  date_regex,
  date_format,
  entity_name,
  default_currency,
  currency_regex,
  source_account_regex,
  time_regex,
  active
) values
(
  'Bancolombia - Compras y Transferencias',
  '.*@bancolombia\.com.*',
  '.*(compra|transferencia|notificación).*',
  'por\s*\$?\s*([0-9.,]+)',
  'en\s+([A-Za-z0-9\s._-]+?)(?:\s+el|\s+por|\s+desde|\.|$)',
  'el\s+([0-9]{2}/[0-9]{2}/[0-9]{4}|[0-9]{4}-[0-9]{2}-[0-9]{2})',
  'DD/MM/YYYY',
  'Bancolombia',
  'COP',
  '(COP|\$|USD)',
  'cuenta\s*\*?([0-9]{4})',
  '([0-9]{1,2}:[0-9]{2}(?::[0-9]{2})?\s*(?:AM|PM|am|pm)?)',
  true
),
(
  'Nequi - Pagos y Envíos',
  '.*@nequi\.com.*',
  '.*(enviaste|pagaste|comprobante).*',
  '(?:de|\$)\s*([0-9.,]+)',
  'a\s+([A-Za-z0-9\s._-]+?)(?:\s+el|\s+por|\.|$)',
  '([0-9]{2}/[0-9]{2}/[0-9]{4}|[0-9]{4}-[0-9]{2}-[0-9]{2})',
  'DD/MM/YYYY',
  'Nequi',
  'COP',
  '(COP|\$)',
  'celular\s*\*?([0-9]{4})',
  '([0-9]{1,2}:[0-9]{2}\s*(?:AM|PM|am|pm)?)',
  true
),
(
  'Daviplata - Movimientos',
  '.*@daviplata\.com.*',
  '.*(pago|compra|transferencia).*',
  '(?:valor|monto|por)\s*\$?\s*([0-9.,]+)',
  'en\s+([A-Za-z0-9\s._-]+?)(?:\s+el|\.|$)',
  '([0-9]{2}/[0-9]{2}/[0-9]{4})',
  'DD/MM/YYYY',
  'Daviplata',
  'COP',
  '(COP|\$)',
  'cuenta\s*\*?([0-9]{4})',
  '([0-9]{1,2}:[0-9]{2})',
  true
)
on conflict do nothing;
