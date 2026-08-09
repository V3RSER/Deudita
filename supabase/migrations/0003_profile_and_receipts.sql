-- Migration 0003: Profile customization fields and expense receipt_url

-- Add profile customization columns
alter table public.profiles
add column if not exists timezone text default 'America/Mexico_City',
add column if not exists currency text default 'COP',
add column if not exists currency_symbol text default '$';

-- Add receipt_url to expenses table
alter table public.expenses
add column if not exists receipt_url text;

-- Create uploads bucket in storage schema if storage exists
insert into storage.buckets (id, name, public)
values ('uploads', 'uploads', true)
on conflict (id) do update set public = true;

-- Storage policies for uploads bucket
drop policy if exists "Public Access Uploads" on storage.objects;
create policy "Public Access Uploads" on storage.objects
  for select using (bucket_id = 'uploads');

drop policy if exists "Authenticated Insert Uploads" on storage.objects;
create policy "Authenticated Insert Uploads" on storage.objects
  for insert with check (bucket_id = 'uploads' and auth.role() = 'authenticated');

drop policy if exists "Authenticated Update Uploads" on storage.objects;
create policy "Authenticated Update Uploads" on storage.objects
  for update using (bucket_id = 'uploads' and auth.role() = 'authenticated');
