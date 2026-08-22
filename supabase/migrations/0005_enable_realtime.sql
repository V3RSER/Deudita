-- ============================================================================
-- MIGRATION 0005: Enable Supabase Realtime for expenses and payments
-- ============================================================================

-- 1) Set replica identity to full so that UPDATE and DELETE payloads contain complete records
alter table public.expenses replica identity full;
alter table public.payments replica identity full;

-- 2) Add tables to the supabase_realtime publication
-- If they are already in the publication, alter publication ignores or adds idempotently
do $$
begin
  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'expenses'
  ) then
    alter publication supabase_realtime add table public.expenses;
  end if;

  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'payments'
  ) then
    alter publication supabase_realtime add table public.payments;
  end if;
end $$;
