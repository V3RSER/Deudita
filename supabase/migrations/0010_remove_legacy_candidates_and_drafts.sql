-- Migration 0010: Remove legacy candidate and draft tables & functions
-- Consolidates all expense operations exclusively into public.expenses.

-- 1) Drop the old candidate function
drop function if exists public.insert_expense_candidate_for_webhook(text, text, uuid, numeric, text, text, text, text, date, text, text, timestamptz);

-- 2) Update insert_expense_for_webhook to support itemized expenses and remove any draft table writes
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

  -- Verify if already exists in expenses
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

  -- Insert expense in draft mode (sin grupo)
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

  -- If itemized, insert items
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

-- 3) Drop foreign key constraints and column referencing expense_drafts if any
alter table if exists public.expenses drop constraint if exists expenses_source_draft_id_fkey;
alter table if exists public.expenses drop column if exists source_draft_id;

-- 4) Drop old expense_drafts table
drop table if exists public.expense_drafts cascade;
