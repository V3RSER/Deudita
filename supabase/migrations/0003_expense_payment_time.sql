-- Migration 0003: Add time fields to expenses and payments tables

alter table public.expenses add column if not exists expense_time timestamptz;
alter table public.payments add column if not exists payment_time timestamptz;
alter table public.payments add column if not exists updated_at timestamptz not null default now();
alter table public.payments add column if not exists updated_by uuid references public.profiles(id);

-- Backfill expense_time from expense_date + created_at if desired
update public.expenses 
set expense_time = (expense_date || ' ' || to_char(created_at, 'HH24:MI:SS'))::timestamptz
where expense_time is null and expense_date is not null;

update public.payments 
set payment_time = (payment_date || ' ' || to_char(created_at, 'HH24:MI:SS'))::timestamptz
where payment_time is null and payment_date is not null;
