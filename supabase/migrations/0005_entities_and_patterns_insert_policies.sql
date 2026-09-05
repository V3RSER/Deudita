-- Migración 0005: Permitir inserción de entidades y patrones de correo para usuarios autenticados
-- Permite que los usuarios/testers agreguen nuevos bancos y sus patrones de correo al registrar plantillas.

drop policy if exists "insert_entities" on public.entities;
create policy "insert_entities"
  on public.entities
  for insert
  to authenticated
  with check (true);

drop policy if exists "insert_entity_email_patterns" on public.entity_email_patterns;
create policy "insert_entity_email_patterns"
  on public.entity_email_patterns
  for insert
  to authenticated
  with check (true);
