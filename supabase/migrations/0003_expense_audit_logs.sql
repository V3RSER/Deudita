-- ----------------------------------------------------------------------------
-- 3) EXPENSE AUDIT LOGS
-- ----------------------------------------------------------------------------
-- add updated_at and updated_by to expenses if not exist
alter table public.expenses add column if not exists updated_at timestamptz not null default now();
alter table public.expenses add column if not exists updated_by uuid references public.profiles(id);

create table if not exists public.expense_audit_logs (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid references public.expenses(id) on delete cascade not null,
  user_id uuid references public.profiles(id) not null,
  action text not null check (action in ('create', 'update', 'delete')),
  changes jsonb,
  created_at timestamptz not null default now()
);

alter table public.expense_audit_logs enable row level security;

-- Policies for expense_audit_logs
-- Only members of the group can view the audit logs for an expense in that group.
create policy "select_expense_audit_logs" on public.expense_audit_logs
  for select
  using (
    exists (
      select 1 from public.expenses e
      join public.group_members gm on gm.group_id = e.group_id
      where e.id = expense_audit_logs.expense_id
      and gm.user_id = auth.uid()
    )
  );

create policy "insert_expense_audit_logs" on public.expense_audit_logs
  for insert
  with check (
    exists (
      select 1 from public.expenses e
      join public.group_members gm on gm.group_id = e.group_id
      where e.id = expense_audit_logs.expense_id
      and gm.user_id = auth.uid()
    )
  );
