-- Migración 0004: Añadir país al perfil de usuario
alter table public.profiles add column if not exists country text default 'CO';
