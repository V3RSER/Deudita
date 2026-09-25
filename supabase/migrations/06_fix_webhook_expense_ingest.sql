-- ============================================================================
-- 06_fix_webhook_expense_ingest.sql
-- Solución para error: "column split_config of relation expenses does not exist"
-- y prevención de errores RLS o de casteo de tiempo en la ingesta desde Gmail/Google Apps Script.
--
-- INSTRUCCIONES:
-- Ejecuta este script en el SQL Editor de tu proyecto de Supabase.
-- ============================================================================

-- 1. Asegurar todas las columnas necesarias en la tabla public.expenses
alter table public.expenses add column if not exists is_draft boolean not null default false;
alter table public.expenses add column if not exists source_account text;
alter table public.expenses add column if not exists entity text;
alter table public.expenses add column if not exists currency text default 'COP';
alter table public.expenses add column if not exists expense_type text;
alter table public.expenses add column if not exists template_id uuid references public.email_templates(id);
alter table public.expenses add column if not exists gmail_message_id text;
alter table public.expenses add column if not exists raw_snippet text;
alter table public.expenses add column if not exists split_config jsonb;
alter table public.expenses add column if not exists expense_time timestamptz;
alter table public.expenses add column if not exists category text default 'General';
alter table public.expenses add column if not exists notes text;

-- 2. Índices de deduplicación y consulta de borradores
create unique index if not exists idx_expenses_gmail_message_id
  on public.expenses(gmail_message_id)
  where gmail_message_id is not null;

create index if not exists idx_expenses_is_draft_user
  on public.expenses(created_by, is_draft)
  where is_draft = true;

-- 3. Función de inserción segura por Webhook (SECURITY DEFINER)
-- Permite a Google Apps Script insertar borradores asociados al usuario del webhook_token
-- sin violar Row Level Security (RLS) y con soporte robusto de formatos de fecha/hora.
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
  v_expense_time timestamptz;
  v_has_split_config boolean := false;
  v_notes text;
begin
  -- 1. Resolver usuario por token de conexión activo
  v_user_id := public.resolve_user_by_webhook_token(p_token);

  if v_user_id is null then
    raise exception 'Token de webhook inválido o inactivo';
  end if;

  if p_gmail_message_id is null or length(trim(p_gmail_message_id)) = 0 then
    raise exception 'gmail_message_id es requerido';
  end if;

  -- 2. Deduplicación por gmail_message_id
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

  -- 3. Normalizar descripción y snippet
  v_description := coalesce(nullif(trim(p_merchant), ''), nullif(trim(p_concept), ''), 'Gasto detectado');

  v_raw_snippet :=
      coalesce(p_entity, 'Notificación')
      || ': '
      || v_description
      || ' por '
      || coalesce(p_currency, 'COP')
      || ' '
      || coalesce(p_amount::text, '0');

  -- 4. Parseo seguro de hora para timestamptz (soporta HH:MI, HH:MI:SS o timestamp completo)
  if p_time is not null and trim(p_time) <> '' then
    begin
      if trim(p_time) ~ '^\d{2}:\d{2}(:\d{2})?$' then
        v_expense_time := (coalesce(p_date, current_date)::text || ' ' || trim(p_time))::timestamptz;
      else
        v_expense_time := trim(p_time)::timestamptz;
      end if;
    exception when others then
      v_expense_time := null;
    end;
  else
    v_expense_time := null;
  end if;

  -- 5. Configurar split
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

  v_notes := '<!-- SPLIT_CONFIG:' || v_split_config::text || ' -->';

  -- 6. Comprobar si la columna split_config existe dinámicamente en la tabla expenses
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'expenses'
      and column_name = 'split_config'
  ) into v_has_split_config;

  if v_has_split_config then
    execute 'insert into public.expenses (
      group_id, paid_by, created_by, total_amount, description,
      expense_date, expense_time, source, is_draft, source_account,
      entity, currency, template_id, gmail_message_id, raw_snippet,
      expense_type, split_config, notes, created_at
    ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
    returning id'
    into v_expense_id
    using null, v_user_id, v_user_id, coalesce(p_amount, 0), v_description,
          coalesce(p_date, current_date), v_expense_time, 'gmail', true, p_source_account,
          p_entity, coalesce(p_currency, 'COP'), p_template_id, trim(p_gmail_message_id),
          v_raw_snippet, p_expense_type, v_split_config, v_notes, coalesce(p_received_at, now());
  else
    execute 'insert into public.expenses (
      group_id, paid_by, created_by, total_amount, description,
      expense_date, expense_time, source, is_draft, source_account,
      entity, currency, template_id, gmail_message_id, raw_snippet,
      expense_type, notes, created_at
    ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
    returning id'
    into v_expense_id
    using null, v_user_id, v_user_id, coalesce(p_amount, 0), v_description,
          coalesce(p_date, current_date), v_expense_time, 'gmail', true, p_source_account,
          p_entity, coalesce(p_currency, 'COP'), p_template_id, trim(p_gmail_message_id),
          v_raw_snippet, p_expense_type, v_notes, coalesce(p_received_at, now());
  end if;

  -- 7. Si es desglosado, insertar ítems
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
