-- ----------------------------------------------------------------------------
-- 4) EXPENSE AUDIT LOGS TRIGGER
-- ----------------------------------------------------------------------------

create or replace function public.log_expense_changes()
returns trigger
language plpgsql
security definer
as $$
declare
  v_user_id uuid;
begin
  -- Intentamos sacar el user_id de la petición (auth.uid())
  v_user_id := auth.uid();
  
  if TG_OP = 'INSERT' then
    insert into public.expense_audit_logs (expense_id, user_id, action, changes)
    values (
      NEW.id,
      coalesce(v_user_id, NEW.created_by),
      'create',
      jsonb_build_object('new', row_to_json(NEW))
    );
    return NEW;
  elsif TG_OP = 'UPDATE' then
    -- Guardamos solo los campos que cambiaron
    insert into public.expense_audit_logs (expense_id, user_id, action, changes)
    values (
      NEW.id,
      coalesce(NEW.updated_by, v_user_id, NEW.created_by),
      'update',
      jsonb_build_object(
        'old', row_to_json(OLD),
        'new', row_to_json(NEW)
      )
    );
    return NEW;
  elsif TG_OP = 'DELETE' then
    insert into public.expense_audit_logs (expense_id, user_id, action, changes)
    values (
      OLD.id,
      coalesce(v_user_id, OLD.created_by),
      'delete',
      jsonb_build_object('old', row_to_json(OLD))
    );
    return OLD;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_log_expense_changes on public.expenses;
create trigger trg_log_expense_changes
after insert or update or delete on public.expenses
for each row
execute function public.log_expense_changes();
