-- Migration 0009: Standardize drafts into expenses
-- Unifies expense drafts directly into public.expenses in draft mode ('is_draft = true')
-- and adds payment method/source_account ('con qué se pagó').

-- 1) Allow NULL group_id for personal and draft expenses ("sin grupo")
alter table public.expenses alter column group_id drop not null;

-- 2) Add draft mode flag, source account info, and email metadata to expenses
alter table public.expenses add column if not exists is_draft boolean not null default false;
alter table public.expenses add column if not exists source_account text;
alter table public.expenses add column if not exists entity text;
alter table public.expenses add column if not exists currency text default 'COP';
alter table public.expenses add column if not exists expense_type text;
alter table public.expenses add column if not exists template_id uuid references public.email_templates(id);
alter table public.expenses add column if not exists gmail_message_id text;
alter table public.expenses add column if not exists raw_snippet text;

-- Index for preventing duplicate ingestions on expenses
create unique index if not exists idx_expenses_gmail_message_id
  on public.expenses(gmail_message_id)
  where gmail_message_id is not null;

-- Index for quick draft lookups
create index if not exists idx_expenses_is_draft_user
  on public.expenses(created_by, is_draft)
  where is_draft = true;

-- 3) Update RLS policies for expenses (support group_id is null for personal/draft expenses)
drop policy if exists "select_group_expenses" on public.expenses;
drop policy if exists "select_expenses" on public.expenses;
create policy "select_expenses" on public.expenses
  for select using (
    (group_id is not null and public.is_group_member(group_id, auth.uid()))
    or (created_by = auth.uid() or paid_by = auth.uid())
  );

drop policy if exists "insert_group_expenses" on public.expenses;
drop policy if exists "insert_expenses" on public.expenses;
create policy "insert_expenses" on public.expenses
  for insert with check (
    (group_id is not null and public.is_group_member(group_id, auth.uid()))
    or (group_id is null and (created_by = auth.uid() or paid_by = auth.uid()))
  );

drop policy if exists "update_group_expenses" on public.expenses;
drop policy if exists "update_expenses" on public.expenses;
create policy "update_expenses" on public.expenses
  for update using (
    (group_id is not null and exists (
      select 1 from public.group_members gm
      where gm.group_id = expenses.group_id
      and gm.user_id = auth.uid()
    ))
    or (created_by = auth.uid() or paid_by = auth.uid())
  );

drop policy if exists "delete_group_expenses" on public.expenses;
drop policy if exists "delete_expenses" on public.expenses;
create policy "delete_expenses" on public.expenses
  for delete using (created_by = auth.uid() or paid_by = auth.uid());

-- 4) Update RLS policies for expense_items
drop policy if exists "select_expense_items" on public.expense_items;
create policy "select_expense_items" on public.expense_items
  for select using (
    expense_id in (
      select e.id from public.expenses e
      where (e.group_id is not null and public.is_group_member(e.group_id, auth.uid()))
         or (e.created_by = auth.uid() or e.paid_by = auth.uid())
    )
  );

drop policy if exists "insert_expense_items" on public.expense_items;
create policy "insert_expense_items" on public.expense_items
  for insert with check (
    expense_id in (
      select e.id from public.expenses e
      where (e.group_id is not null and public.is_group_member(e.group_id, auth.uid()))
         or (e.created_by = auth.uid() or e.paid_by = auth.uid())
    )
  );

drop policy if exists "update_expense_items" on public.expense_items;
create policy "update_expense_items" on public.expense_items
  for update using (
    expense_id in (
      select e.id from public.expenses e
      where (e.group_id is not null and public.is_group_member(e.group_id, auth.uid()))
         or (e.created_by = auth.uid() or e.paid_by = auth.uid())
    )
  );

drop policy if exists "delete_expense_items" on public.expense_items;
create policy "delete_expense_items" on public.expense_items
  for delete using (
    expense_id in (
      select e.id from public.expenses e
      where (e.group_id is not null and public.is_group_member(e.group_id, auth.uid()))
         or (e.created_by = auth.uid() or e.paid_by = auth.uid())
    )
  );

-- 5) Update RLS policies for expense_splits
drop policy if exists "select_expense_splits" on public.expense_splits;
create policy "select_expense_splits" on public.expense_splits
  for select using (
    expense_id in (
      select e.id from public.expenses e
      where (e.group_id is not null and public.is_group_member(e.group_id, auth.uid()))
         or (e.created_by = auth.uid() or e.paid_by = auth.uid())
    )
  );

drop policy if exists "insert_expense_splits" on public.expense_splits;
create policy "insert_expense_splits" on public.expense_splits
  for insert with check (
    expense_id in (
      select e.id from public.expenses e
      where (e.group_id is not null and public.is_group_member(e.group_id, auth.uid()))
         or (e.created_by = auth.uid() or e.paid_by = auth.uid())
    )
  );

-- 6) Direct webhook RPC to insert an expense in draft mode ("sin grupo")
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
  p_expense_type text default null
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
    coalesce(p_received_at, now())
  )
  returning id into v_expense_id;

  return jsonb_build_object(
    'success', true,
    'inserted', true,
    'expense_id', v_expense_id,
    'is_draft', true,
    'status', 'draft',
    'message', 'Gasto guardado en modo borrador'
  );
end;
$$;
