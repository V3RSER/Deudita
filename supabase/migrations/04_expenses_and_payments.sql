-- ============================================================================
-- 02_expenses_and_payments.sql
-- Gastos, ítems, splits, pagos, auditoría, vista de balances y realtime.
-- Consolidado desde 0001 (§3-4, 7), 0002 (§4-6), 0009, 0010 — estado final.
--
-- NOTA: incluye group_id nullable (gastos personales / sin grupo, 0009) y
-- todas las columnas de ingesta por Gmail directamente en public.expenses
-- (0009 unificó lo que antes vivía en expense_drafts; 0010 eliminó esa tabla).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- GASTOS
-- ----------------------------------------------------------------------------
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references public.groups(id) on delete cascade,  -- nullable: gasto personal/borrador (0009)
  paid_by uuid not null references public.profiles(id),
  total_amount numeric(12,2) not null,
  description text,
  expense_date date not null default current_date,
  expense_time timestamptz,
  source text not null default 'manual',
  created_by uuid not null references public.profiles(id),
  receipt_url text,
  category text default 'General',
  notes text,
  -- ingesta / borrador desde Gmail (0009, 0010)
  is_draft boolean not null default false,
  source_account text,
  entity text,
  currency text default 'COP',
  expense_type text,
  template_id uuid references public.email_templates(id),
  gmail_message_id text,
  raw_snippet text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);

create unique index idx_expenses_gmail_message_id
  on public.expenses(gmail_message_id)
  where gmail_message_id is not null;

create index idx_expenses_is_draft_user
  on public.expenses(created_by, is_draft)
  where is_draft = true;

create table public.expense_items (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses(id) on delete cascade,
  description text not null,
  amount numeric(12,2) not null,
  created_at timestamptz not null default now()
);

create table public.expense_splits (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  amount_owed numeric(12,2) not null,
  created_at timestamptz not null default now(),
  unique (expense_id, user_id)
);

-- ----------------------------------------------------------------------------
-- PAGOS
-- ----------------------------------------------------------------------------
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  paid_by uuid not null references public.profiles(id),
  paid_to uuid not null references public.profiles(id),
  amount numeric(12,2) not null,
  payment_date date not null default current_date,
  payment_time timestamptz,
  note text,
  proof_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);

-- ----------------------------------------------------------------------------
-- AUDITORÍA DE GASTOS (tabla + trigger)
-- ----------------------------------------------------------------------------
create table public.expense_audit_logs (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null,   -- sin FK: permite loguear deletes sin romper referencia
  group_id uuid references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  action text not null check (action in ('create', 'update', 'delete')),
  changes jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.log_expense_changes()
returns trigger
language plpgsql
security definer
as $$
declare
  v_user_id uuid;
begin
  v_user_id := auth.uid();

  if TG_OP = 'INSERT' then
    insert into public.expense_audit_logs (expense_id, group_id, user_id, action, changes)
    values (
      NEW.id,
      NEW.group_id,
      coalesce(v_user_id, NEW.created_by),
      'create',
      jsonb_build_object('new', row_to_json(NEW))
    );
    return NEW;
  elsif TG_OP = 'UPDATE' then
    insert into public.expense_audit_logs (expense_id, group_id, user_id, action, changes)
    values (
      NEW.id,
      NEW.group_id,
      coalesce(NEW.updated_by, v_user_id, NEW.created_by),
      'update',
      jsonb_build_object('old', row_to_json(OLD), 'new', row_to_json(NEW))
    );
    return NEW;
  elsif TG_OP = 'DELETE' then
    -- Solo loguea el delete si el grupo padre aún existe (evita violar FK durante cascade delete de groups)
    if exists (select 1 from public.groups where id = OLD.group_id) then
      insert into public.expense_audit_logs (expense_id, group_id, user_id, action, changes)
      values (
        OLD.id,
        OLD.group_id,
        coalesce(v_user_id, OLD.created_by),
        'delete',
        jsonb_build_object('old', row_to_json(OLD))
      );
    end if;
    return OLD;
  end if;
  return null;
end;
$$;

create trigger trg_log_expense_changes
after insert or update or delete on public.expenses
for each row
execute function public.log_expense_changes();

-- ----------------------------------------------------------------------------
-- VISTA DE BALANCES NETOS
-- ----------------------------------------------------------------------------
create view public.net_balances as
with expense_debts as (
  select e.group_id, e.paid_by as creditor, s.user_id as debtor, sum(s.amount_owed) as amount
  from public.expenses e
  join public.expense_splits s on s.expense_id = e.id
  where s.user_id <> e.paid_by
  group by e.group_id, e.paid_by, s.user_id
),
payment_totals as (
  select group_id, paid_by as debtor, paid_to as creditor, sum(amount) as amount
  from public.payments
  group by group_id, paid_by, paid_to
)
select
  coalesce(ed.group_id, pt.group_id) as group_id,
  coalesce(ed.creditor, pt.creditor) as creditor,
  coalesce(ed.debtor, pt.debtor) as debtor,
  coalesce(ed.amount, 0) - coalesce(pt.amount, 0) as amount
from expense_debts ed
full outer join payment_totals pt
  on ed.group_id = pt.group_id and ed.creditor = pt.creditor and ed.debtor = pt.debtor;

-- ----------------------------------------------------------------------------
-- SUPABASE REALTIME
-- ----------------------------------------------------------------------------
alter table public.expenses replica identity full;
alter table public.payments replica identity full;

alter publication supabase_realtime add table public.expenses;
alter publication supabase_realtime add table public.payments;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
alter table public.expenses enable row level security;
alter table public.expense_items enable row level security;
alter table public.expense_splits enable row level security;
alter table public.payments enable row level security;
alter table public.expense_audit_logs enable row level security;

-- ---- expenses (soporta group_id nulo: gastos personales/borrador, 0009) ----
create policy "select_expenses" on public.expenses
  for select using (
    (group_id is not null and public.is_group_member(group_id, auth.uid()))
    or (created_by = auth.uid() or paid_by = auth.uid())
  );

create policy "insert_expenses" on public.expenses
  for insert with check (
    (group_id is not null and public.is_group_member(group_id, auth.uid()))
    or (group_id is null and (created_by = auth.uid() or paid_by = auth.uid()))
  );

create policy "update_expenses" on public.expenses
  for update using (
    (group_id is not null and exists (
      select 1 from public.group_members gm
      where gm.group_id = expenses.group_id
      and gm.user_id = auth.uid()
    ))
    or (created_by = auth.uid() or paid_by = auth.uid())
  );

create policy "delete_expenses" on public.expenses
  for delete using (created_by = auth.uid() or paid_by = auth.uid());

-- ---- expense_items ----
create policy "select_expense_items" on public.expense_items
  for select using (
    expense_id in (
      select e.id from public.expenses e
      where (e.group_id is not null and public.is_group_member(e.group_id, auth.uid()))
         or (e.created_by = auth.uid() or e.paid_by = auth.uid())
    )
  );

create policy "insert_expense_items" on public.expense_items
  for insert with check (
    expense_id in (
      select e.id from public.expenses e
      where (e.group_id is not null and public.is_group_member(e.group_id, auth.uid()))
         or (e.created_by = auth.uid() or e.paid_by = auth.uid())
    )
  );

create policy "update_expense_items" on public.expense_items
  for update using (
    expense_id in (
      select e.id from public.expenses e
      where (e.group_id is not null and public.is_group_member(e.group_id, auth.uid()))
         or (e.created_by = auth.uid() or e.paid_by = auth.uid())
    )
  );

create policy "delete_expense_items" on public.expense_items
  for delete using (
    expense_id in (
      select e.id from public.expenses e
      where (e.group_id is not null and public.is_group_member(e.group_id, auth.uid()))
         or (e.created_by = auth.uid() or e.paid_by = auth.uid())
    )
  );

-- ---- expense_splits ----
create policy "select_expense_splits" on public.expense_splits
  for select using (
    expense_id in (
      select e.id from public.expenses e
      where (e.group_id is not null and public.is_group_member(e.group_id, auth.uid()))
         or (e.created_by = auth.uid() or e.paid_by = auth.uid())
    )
  );

create policy "insert_expense_splits" on public.expense_splits
  for insert with check (
    expense_id in (
      select e.id from public.expenses e
      where (e.group_id is not null and public.is_group_member(e.group_id, auth.uid()))
         or (e.created_by = auth.uid() or e.paid_by = auth.uid())
    )
  );

-- ---- expense_audit_logs ----
create policy "select_expense_audit_logs" on public.expense_audit_logs
  for select using (
    exists (
      select 1 from public.group_members gm
      where gm.group_id = expense_audit_logs.group_id
      and gm.user_id = auth.uid()
    )
  );

create policy "insert_expense_audit_logs" on public.expense_audit_logs
  for insert with check (
    exists (
      select 1 from public.group_members gm
      where gm.group_id = expense_audit_logs.group_id
      and gm.user_id = auth.uid()
    )
  );

-- ---- payments ----
create policy "select_group_payments" on public.payments
  for select using (public.is_group_member(group_id, auth.uid()));

create policy "insert_group_payments" on public.payments
  for insert with check (public.is_group_member(group_id, auth.uid()));

create policy "update_group_payments" on public.payments
  for update using (
    public.is_group_member(group_id, auth.uid())
    or paid_by = auth.uid()
    or paid_to = auth.uid()
  );

create policy "delete_group_payments" on public.payments
  for delete using (
    public.is_group_member(group_id, auth.uid())
    or paid_by = auth.uid()
    or paid_to = auth.uid()
  );
