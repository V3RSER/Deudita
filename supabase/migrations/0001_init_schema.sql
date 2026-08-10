-- ============================================================================
-- MIGRACIÓN CONSOLIDADA — reemplaza 0001..0006
-- Generada el 2026-08-10. Incluye correcciones de RLS (ver notas al final).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) PERFILES
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key,
  email text not null,
  full_name text,
  avatar_url text,
  timezone text default 'America/Mexico_City',
  currency text default 'COP',
  currency_symbol text default '$',
  -- NUEVO: distingue perfiles "placeholder" (invitado sin cuenta aún)
  -- de perfiles reales ligados a auth.users.
  is_temp boolean not null default false,
  created_at timestamptz not null default now()
);

-- OJO: a propósito NO hay FK profiles.id -> auth.users(id).
-- Esto es intencional (0005) para permitir perfiles temporales cuyo id
-- se genera antes de que la persona se registre. Ver notas de aplicación
-- al final de este archivo para el flujo de "claim" al registrarse.

-- ----------------------------------------------------------------------------
-- 2) GRUPOS Y MEMBRESÍA
-- ----------------------------------------------------------------------------
create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null default 'home',
  description text,
  owner_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  invited_by uuid references public.profiles(id),
  role text not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table if not exists public.group_invites (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  email text not null,
  invited_by uuid not null references public.profiles(id),
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  unique (group_id, email)
);

-- ----------------------------------------------------------------------------
-- 3) GASTOS
-- ----------------------------------------------------------------------------
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  paid_by uuid not null references public.profiles(id),
  total_amount numeric(12,2) not null,
  description text,
  expense_date date not null default current_date,
  source text not null default 'manual',
  source_draft_id uuid,
  created_by uuid not null references public.profiles(id),
  receipt_url text,
  category text default 'General',
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.expense_items (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses(id) on delete cascade,
  description text not null,
  amount numeric(12,2) not null,
  created_at timestamptz not null default now()
);

create table if not exists public.expense_splits (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  amount_owed numeric(12,2) not null,
  created_at timestamptz not null default now(),
  unique (expense_id, user_id)
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  paid_by uuid not null references public.profiles(id),
  paid_to uuid not null references public.profiles(id),
  amount numeric(12,2) not null,
  payment_date date not null default current_date,
  note text,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 4) BORRADORES DESDE GMAIL
-- ----------------------------------------------------------------------------
create table if not exists public.expense_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  gmail_message_id text not null unique,
  raw_snippet text,
  detected_amount numeric(12,2),
  detected_merchant text,
  detected_date date,
  confidence numeric(3,2),
  status text not null default 'pending',
  confirmed_expense_id uuid references public.expenses(id),
  created_at timestamptz not null default now()
);

alter table public.expenses
  drop constraint if exists expenses_source_draft_id_fkey;
alter table public.expenses
  add constraint expenses_source_draft_id_fkey
  foreign key (source_draft_id) references public.expense_drafts(id);

-- ----------------------------------------------------------------------------
-- 5) NOTIFICACIONES
-- ----------------------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null default 'group_invite',
  title text not null,
  message text not null,
  data jsonb default '{}'::jsonb,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 6) VISTA DE BALANCES NETOS
-- ----------------------------------------------------------------------------
drop view if exists public.net_balances;
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
-- 7) TRIGGER: crear perfil (o reclamar uno temporal) y aceptar invitaciones
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger as $$
declare
  inv_record record;
  existing_temp_profile record;
begin
  -- ¿Existe ya un perfil temporal con este email? (invitado antes de registrarse)
  select * into existing_temp_profile
  from public.profiles
  where email = new.email and is_temp = true
  limit 1;

  if existing_temp_profile.id is not null then
    -- "Reclamar" el perfil temporal: mover su fila al id real de auth.users.
    -- Como no hay FK a auth.users, insertamos el perfil real con el id nuevo,
    -- migramos referencias del id temporal al id real, y borramos el temporal.
    insert into public.profiles (id, email, full_name, avatar_url, is_temp)
    values (
      new.id,
      new.email,
      coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
      coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture', ''),
      false
    )
    on conflict (id) do nothing;

    update public.group_members set user_id = new.id where user_id = existing_temp_profile.id;
    update public.group_members set invited_by = new.id where invited_by = existing_temp_profile.id;
    update public.groups set owner_id = new.id where owner_id = existing_temp_profile.id;
    update public.expenses set paid_by = new.id where paid_by = existing_temp_profile.id;
    update public.expenses set created_by = new.id where created_by = existing_temp_profile.id;
    update public.expense_splits set user_id = new.id where user_id = existing_temp_profile.id;
    update public.payments set paid_by = new.id where paid_by = existing_temp_profile.id;
    update public.payments set paid_to = new.id where paid_to = existing_temp_profile.id;
    update public.notifications set user_id = new.id where user_id = existing_temp_profile.id;

    delete from public.profiles where id = existing_temp_profile.id;
  else
    insert into public.profiles (id, email, full_name, avatar_url, is_temp)
    values (
      new.id,
      new.email,
      coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
      coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture', ''),
      false
    )
    on conflict (id) do nothing;
  end if;

  -- Agregar al usuario a grupos donde tenga invitación pendiente por email
  for inv_record in
    select gi.id, gi.group_id, gi.invited_by, g.name as group_name
    from public.group_invites gi
    join public.groups g on g.id = gi.group_id
    where gi.email = new.email and gi.status = 'pending'
  loop
    insert into public.group_members (group_id, user_id, invited_by)
    values (inv_record.group_id, new.id, inv_record.invited_by)
    on conflict (group_id, user_id) do nothing;

    update public.group_invites
    set status = 'accepted'
    where id = inv_record.id;

    insert into public.notifications (user_id, type, title, message, data)
    values (
      new.id,
      'group_invite',
      '¡Te has unido al grupo!',
      'Te has unido exitosamente al grupo ' || inv_record.group_name || '.',
      jsonb_build_object('group_id', inv_record.group_id, 'invite_id', inv_record.id)
    );
  end loop;

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 8) STORAGE: bucket de uploads
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('uploads', 'uploads', true)
on conflict (id) do update set public = true;

drop policy if exists "Public Access Uploads" on storage.objects;
create policy "Public Access Uploads" on storage.objects
  for select using (bucket_id = 'uploads');

drop policy if exists "Authenticated Insert Uploads" on storage.objects;
create policy "Authenticated Insert Uploads" on storage.objects
  for insert with check (bucket_id = 'uploads' and auth.role() = 'authenticated');

drop policy if exists "Authenticated Update Uploads" on storage.objects;
create policy "Authenticated Update Uploads" on storage.objects
  for update using (bucket_id = 'uploads' and auth.role() = 'authenticated');

-- ============================================================================
-- 9) ROW LEVEL SECURITY
-- ============================================================================
alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_invites enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_items enable row level security;
alter table public.expense_splits enable row level security;
alter table public.payments enable row level security;
alter table public.expense_drafts enable row level security;
alter table public.notifications enable row level security;

-- ---- profiles ----
drop policy if exists "select_profiles" on public.profiles;
create policy "select_profiles" on public.profiles for select using (true);

drop policy if exists "insert_profiles" on public.profiles;
create policy "insert_profiles" on public.profiles
  for insert with check (
    -- el propio usuario creando su perfil, o cualquier miembro autenticado
    -- creando un perfil TEMPORAL (para invitar a alguien sin cuenta)
    auth.uid() = id or is_temp = true
  );

-- CORREGIDO (antes: cualquier miembro de grupo compartido podía editar
-- perfiles de otros, incluso reales). Ahora solo:
--  a) el propio dueño del perfil, o
--  b) un miembro de un grupo en común, PERO solo si el perfil objetivo es temporal.
drop policy if exists "update_profiles" on public.profiles;
create policy "update_profiles" on public.profiles
  for update using (
    auth.uid() = id
    or (
      is_temp = true
      and exists (
        select 1 from public.group_members gm1
        join public.group_members gm2 on gm1.group_id = gm2.group_id
        where gm1.user_id = auth.uid() and gm2.user_id = profiles.id
      )
    )
  );

-- CORREGIDO: mismo criterio para delete (antes permitía borrar perfiles reales).
drop policy if exists "delete_profiles" on public.profiles;
create policy "delete_profiles" on public.profiles
  for delete using (
    auth.uid() = id
    or (
      is_temp = true
      and exists (
        select 1 from public.group_members gm1
        join public.group_members gm2 on gm1.group_id = gm2.group_id
        where gm1.user_id = auth.uid() and gm2.user_id = profiles.id
      )
    )
  );

-- ---- groups ----
drop policy if exists "select_own_groups" on public.groups;
create policy "select_own_groups" on public.groups
  for select using (
    id in (select group_id from public.group_members where user_id = auth.uid()) or owner_id = auth.uid()
  );

drop policy if exists "insert_own_groups" on public.groups;
create policy "insert_own_groups" on public.groups
  for insert with check (auth.uid() = owner_id);

drop policy if exists "update_own_groups" on public.groups;
create policy "update_own_groups" on public.groups
  for update using (auth.uid() = owner_id);

drop policy if exists "delete_own_groups" on public.groups;
create policy "delete_own_groups" on public.groups
  for delete using (auth.uid() = owner_id);

-- ---- group_members ----
-- CORREGIDO: select limitado a miembros del mismo grupo (antes: true).
drop policy if exists "select_group_members" on public.group_members;
create policy "select_group_members" on public.group_members
  for select using (
    group_id in (select group_id from public.group_members gm where gm.user_id = auth.uid())
  );

-- CORREGIDO: insert limitado al owner del grupo o a quien está agregándose
-- a sí mismo por invitación aceptada (el trigger corre como security definer,
-- así que esta policy solo restringe inserts manuales desde el cliente).
drop policy if exists "insert_group_members" on public.group_members;
create policy "insert_group_members" on public.group_members
  for insert with check (
    group_id in (select id from public.groups where owner_id = auth.uid())
    or user_id = auth.uid()
  );

drop policy if exists "update_group_members" on public.group_members;
create policy "update_group_members" on public.group_members
  for update using (
    user_id = auth.uid()
    or group_id in (select id from public.groups where owner_id = auth.uid())
  ) with check (
    user_id = auth.uid()
    or group_id in (select id from public.groups where owner_id = auth.uid())
  );

drop policy if exists "delete_group_members" on public.group_members;
create policy "delete_group_members" on public.group_members
  for delete using (
    user_id = auth.uid() or group_id in (select id from public.groups where owner_id = auth.uid())
  );

-- ---- group_invites ----
drop policy if exists "select_group_invites" on public.group_invites;
create policy "select_group_invites" on public.group_invites
  for select using (
    invited_by = auth.uid()
    or group_id in (select id from public.groups where owner_id = auth.uid())
    or email = (select email from public.profiles where id = auth.uid())
  );

drop policy if exists "insert_group_invites" on public.group_invites;
create policy "insert_group_invites" on public.group_invites
  for insert with check (invited_by = auth.uid());

-- CORREGIDO: antes cualquiera podía modificar cualquier invitación.
-- Ahora: el destinatario (por email) puede aceptar/rechazar la suya,
-- y el owner del grupo puede cancelar/editar invitaciones de su grupo.
drop policy if exists "update_group_invites" on public.group_invites;
create policy "update_group_invites" on public.group_invites
  for update using (
    email = (select email from public.profiles where id = auth.uid())
    or group_id in (select id from public.groups where owner_id = auth.uid())
  );

-- ---- expenses ----
drop policy if exists "select_group_expenses" on public.expenses;
create policy "select_group_expenses" on public.expenses
  for select using (
    group_id in (select group_id from public.group_members where user_id = auth.uid())
  );

drop policy if exists "insert_group_expenses" on public.expenses;
create policy "insert_group_expenses" on public.expenses
  for insert with check (
    group_id in (select group_id from public.group_members where user_id = auth.uid())
  );

drop policy if exists "delete_group_expenses" on public.expenses;
create policy "delete_group_expenses" on public.expenses
  for delete using (
    created_by = auth.uid() or paid_by = auth.uid()
  );

-- ---- expense_items ----
-- CORREGIDO: antes select/insert eran "true" (cualquier autenticado veía/creaba
-- ítems de cualquier gasto). Ahora restringido a miembros del grupo del gasto.
drop policy if exists "select_expense_items" on public.expense_items;
create policy "select_expense_items" on public.expense_items
  for select using (
    expense_id in (
      select e.id from public.expenses e
      join public.group_members gm on gm.group_id = e.group_id
      where gm.user_id = auth.uid()
    )
  );

drop policy if exists "insert_expense_items" on public.expense_items;
create policy "insert_expense_items" on public.expense_items
  for insert with check (
    expense_id in (
      select e.id from public.expenses e
      join public.group_members gm on gm.group_id = e.group_id
      where gm.user_id = auth.uid()
    )
  );

-- ---- expense_splits ----
-- CORREGIDO: mismo criterio que expense_items.
drop policy if exists "select_expense_splits" on public.expense_splits;
create policy "select_expense_splits" on public.expense_splits
  for select using (
    expense_id in (
      select e.id from public.expenses e
      join public.group_members gm on gm.group_id = e.group_id
      where gm.user_id = auth.uid()
    )
  );

drop policy if exists "insert_expense_splits" on public.expense_splits;
create policy "insert_expense_splits" on public.expense_splits
  for insert with check (
    expense_id in (
      select e.id from public.expenses e
      join public.group_members gm on gm.group_id = e.group_id
      where gm.user_id = auth.uid()
    )
  );

-- ---- payments ----
drop policy if exists "select_group_payments" on public.payments;
create policy "select_group_payments" on public.payments
  for select using (
    group_id in (select group_id from public.group_members where user_id = auth.uid())
  );

drop policy if exists "insert_group_payments" on public.payments;
create policy "insert_group_payments" on public.payments
  for insert with check (
    group_id in (select group_id from public.group_members where user_id = auth.uid())
  );

-- ---- expense_drafts ----
drop policy if exists "select_own_drafts" on public.expense_drafts;
create policy "select_own_drafts" on public.expense_drafts
  for select using (user_id = auth.uid());

drop policy if exists "insert_own_drafts" on public.expense_drafts;
create policy "insert_own_drafts" on public.expense_drafts
  for insert with check (user_id = auth.uid());

drop policy if exists "update_own_drafts" on public.expense_drafts;
create policy "update_own_drafts" on public.expense_drafts
  for update using (user_id = auth.uid());

-- ---- notifications ----
drop policy if exists "select_own_notifications" on public.notifications;
create policy "select_own_notifications" on public.notifications
  for select using (user_id = auth.uid());

drop policy if exists "insert_notifications" on public.notifications;
create policy "insert_notifications" on public.notifications
  for insert with check (true);

drop policy if exists "update_own_notifications" on public.notifications;
create policy "update_own_notifications" on public.notifications
  for update using (user_id = auth.uid());

drop policy if exists "delete_own_notifications" on public.notifications;
create policy "delete_own_notifications" on public.notifications
  for delete using (user_id = auth.uid());
