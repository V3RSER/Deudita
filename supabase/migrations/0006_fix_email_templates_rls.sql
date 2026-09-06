-- Migración 0006: Corregir políticas RLS para email_templates (UPDATE y DELETE)
-- Soluciona el error: "new row violates row-level security policy for table email_templates"
-- al desactivar (soft-delete) o eliminar plantillas.

-- 1. Asegurar política de SELECT amplia para authenticated (la app filtra por active=true)
drop policy if exists "select_active_email_templates" on public.email_templates;
drop policy if exists "select_email_templates" on public.email_templates;
create policy "select_email_templates"
  on public.email_templates
  for select
  to authenticated
  using (true);

-- 2. Asegurar política de UPDATE con WITH CHECK (true)
-- Es fundamental el "WITH CHECK (true)" para que al cambiar active = false no se viole la política RLS.
drop policy if exists "update_own_email_templates" on public.email_templates;
drop policy if exists "update_email_templates" on public.email_templates;
create policy "update_email_templates"
  on public.email_templates
  for update
  to authenticated
  using (true)
  with check (true);

-- 3. Permitir DELETE directo para usuarios autenticados
drop policy if exists "delete_own_email_templates" on public.email_templates;
drop policy if exists "delete_email_templates" on public.email_templates;
create policy "delete_email_templates"
  on public.email_templates
  for delete
  to authenticated
  using (true);
