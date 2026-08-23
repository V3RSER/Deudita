-- ============================================================================
-- MIGRATION 0005: Enable Supabase Realtime for expenses and payments
-- ============================================================================

-- 1) Configure REPLICA IDENTITY FULL on public.expenses and public.payments
-- This ensures that DELETE events sent by Realtime include the entire OLD row (including group_id and id)
alter table public.expenses replica identity full;
alter table public.payments replica identity full;

-- 2) Idempotently add tables to supabase_realtime publication
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'expenses'
  ) then
    alter publication supabase_realtime add table public.expenses;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'payments'
  ) then
    alter publication supabase_realtime add table public.payments;
  end if;
end;
$$;
