-- 1. Add group_id to expense_audit_logs
alter table public.expense_audit_logs add column if not exists group_id uuid references public.groups(id) on delete cascade;

-- 2. Populate group_id for existing audit logs
update public.expense_audit_logs eal
set group_id = e.group_id
from public.expenses e
where eal.expense_id = e.id;

-- 3. Delete any orphaned logs and make group_id NOT NULL
delete from public.expense_audit_logs where group_id is null;
alter table public.expense_audit_logs alter column group_id set not null;

-- 4. Drop the foreign key from expense_id to expenses so we can log DELETES
alter table public.expense_audit_logs drop constraint if exists expense_audit_logs_expense_id_fkey;

-- 5. Update Policies to rely on group_id
drop policy if exists "select_expense_audit_logs" on public.expense_audit_logs;
drop policy if exists "insert_expense_audit_logs" on public.expense_audit_logs;
drop policy if exists "Members can view expense audit logs in their groups" on public.expense_audit_logs;
drop policy if exists "Users can create audit logs for their groups" on public.expense_audit_logs;

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

-- 6. Update the Trigger Function to include group_id
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
      jsonb_build_object(
        'old', row_to_json(OLD),
        'new', row_to_json(NEW)
      )
    );
    return NEW;
  elsif TG_OP = 'DELETE' then
    insert into public.expense_audit_logs (expense_id, group_id, user_id, action, changes)
    values (
      OLD.id,
      OLD.group_id,
      coalesce(v_user_id, OLD.created_by),
      'delete',
      jsonb_build_object('old', row_to_json(OLD))
    );
    return OLD;
  end if;
  return null;
end;
$$;
