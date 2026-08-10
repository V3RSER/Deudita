-- ============================================================================
-- ESQUEMA UNIFICADO — versión final
-- Reemplaza 0001..0006 + todos los parches posteriores.
-- Idempotente: se puede correr sobre una base nueva o sobre una que ya
-- tenga cualquier versión anterior de estas tablas/policies/triggers.
-- No borra datos existentes de PERFILES REALES (usa IF NOT EXISTS /
-- OR REPLACE / DROP...IF EXISTS solo sobre objetos que se recrean).
--
-- INCLUYE: fusión de MÚLTIPLES perfiles temporales al registrarse.
-- Si a la misma persona la agregaron como miembro (solo con nombre) en
-- varios grupos distintos, y luego se registra -- por cualquiera de los
-- links de invitación, o directo desde la app -- el trigger reclama TODOS
-- los perfiles temporales que le correspondan (por token y/o por email)
-- y los fusiona en un único perfil real, migrando todo su historial
-- (grupos, gastos, pagos, splits, notificaciones) sin perder datos.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) PERFILES
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key,
  email text,
  full_name text,
  avatar_url text,
  timezone text default 'America/Mexico_City',
  currency text default 'COP',
  currency_symbol text default '$',
  is_temp boolean not null default false,
  created_at timestamptz not null default now()
);

-- profiles.email es OPCIONAL: un perfil temporal (miembro agregado solo
-- con nombre, sin cuenta todavía) puede no tener correo.
alter table public.profiles alter column email drop not null;

-- profiles.id NO tiene FK a auth.users a propósito: permite perfiles
-- temporales cuyo id se genera antes de que la persona se registre.
-- El "claim" (vincular el perfil temporal a la cuenta real) se hace por
-- TOKEN de invitación, ver la función handle_new_user() más abajo.
alter table public.profiles drop constraint if exists profiles_id_fkey;

alter table public.profiles add column if not exists is_temp boolean not null default false;

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
  email text,
  invited_by uuid not null references public.profiles(id),
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

-- email opcional: se puede invitar por link genérico sin correo capturado
alter table public.group_invites alter column email drop not null;

-- token: identificador canónico del link de invitación. Esto es lo que
-- realmente vincula "esta persona que se está registrando" con "este
-- perfil temporal / esta invitación", sin depender de que el correo
-- coincida (la persona puede registrarse con cualquier correo, ej. Google).
alter table public.group_invites add column if not exists token uuid not null default gen_random_uuid();

-- referencia directa al perfil temporal que esta invitación reclama
-- (para el flujo: "agregar miembro por nombre" -> "invitarlo después")
alter table public.group_invites add column if not exists invitee_profile_id uuid references public.profiles(id);

alter table public.group_invites drop constraint if exists group_invites_group_id_email_key;
create unique index if not exists group_invites_token_key on public.group_invites (token);

alter table public.group_invites drop constraint if exists group_invites_email_or_profile_check;
alter table public.group_invites add constraint group_invites_email_or_profile_check
  check (email is not null or invitee_profile_id is not null);

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

alter table public.expenses drop constraint if exists expenses_source_draft_id_fkey;
alter table public.expenses add constraint expenses_source_draft_id_fkey
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
-- 7) FUNCIÓN AUXILIAR: chequeo de membresía sin recursión de RLS
--    (security definer -> se salta RLS al consultar group_members desde
--    dentro de la propia policy de group_members)
-- ----------------------------------------------------------------------------
create or replace function public.is_group_member(p_group_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = p_user_id
  );
$$;

-- ----------------------------------------------------------------------------
-- 8) TRIGGER: crear perfil / reclamar perfil temporal por TOKEN, y
--    aceptar invitaciones pendientes.
--
--    Flujo esperado de la app:
--    a) Agregar miembro solo con nombre -> insert en profiles
--       (is_temp=true, email=null) + insert directo en group_members.
--    b) Invitarlo (opcional) -> insert en group_invites con
--       invitee_profile_id apuntando al perfil temporal; el `token`
--       generado va en el link/correo de invitación.
--    c) Al registrarse, la app pasa el token como
--       options.data.invite_token en supabase.auth.signUp(...).
--       El trigger usa ese token (no el email) para reclamar el perfil.
--    d) Fallback: si alguien se registra con el mismo email que se puso
--       al invitar, pero sin pasar por el link con token, igual se
--       vincula automáticamente vía group_invites.email.
-- ----------------------------------------------------------------------------
-- Reclama TODAS las referencias de un perfil temporal (temp_id) y las
-- reasigna al perfil real (real_id). Idempotente por diseño: si ya no
-- quedan filas apuntando a temp_id, simplemente no hace nada.
create or replace function public.claim_temp_profile(temp_id uuid, real_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if temp_id is null or temp_id = real_id then
    return;
  end if;

  update public.group_members set user_id = real_id where user_id = temp_id
    and not exists (
      select 1 from public.group_members gm2
      where gm2.group_id = group_members.group_id and gm2.user_id = real_id
    );
  -- si ya era miembro del mismo grupo con el id real, solo borra el duplicado
  delete from public.group_members where user_id = temp_id;

  update public.group_members set invited_by = real_id where invited_by = temp_id;
  update public.groups set owner_id = real_id where owner_id = temp_id;
  update public.expenses set paid_by = real_id where paid_by = temp_id;
  update public.expenses set created_by = real_id where created_by = temp_id;

  update public.expense_splits set user_id = real_id where user_id = temp_id
    and not exists (
      select 1 from public.expense_splits es2
      where es2.expense_id = expense_splits.expense_id and es2.user_id = real_id
    );
  delete from public.expense_splits where user_id = temp_id;

  update public.payments set paid_by = real_id where paid_by = temp_id;
  update public.payments set paid_to = real_id where paid_to = temp_id;
  update public.notifications set user_id = real_id where user_id = temp_id;
  update public.group_invites set invitee_profile_id = real_id where invitee_profile_id = temp_id;

  delete from public.profiles where id = temp_id and is_temp = true;
end;
$$;

-- ----------------------------------------------------------------------------
-- Trigger: crea el perfil real y reclama TODOS los perfiles temporales que
-- le correspondan a este usuario nuevo -- ya sea porque llegó con un token
-- de invitación específico, o porque su email coincide con el de una o más
-- invitaciones pendientes (caso: lo invitaron a varios grupos distintos
-- antes de registrarse, y se registra directo o desde cualquiera de los
-- links -- todos esos perfiles temporales deben fusionarse en uno solo).
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger as $$
declare
  invite_token uuid;
  inv record;
begin
  invite_token := nullif(new.raw_user_meta_data->>'invite_token', '')::uuid;

  insert into public.profiles (id, email, full_name, avatar_url, is_temp)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(coalesce(new.email, ''), '@', 1)),
    coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture', ''),
    false
  )
  on conflict (id) do nothing;

  -- Recorre TODAS las invitaciones pendientes relevantes para este usuario:
  -- por token exacto (si vino de un link) Y/O por email coincidente
  -- (cualquier grupo que lo haya invitado a ese correo, sin importar el
  -- token). Se deduplica por invitee_profile_id para no fusionar el mismo
  -- perfil temporal dos veces si aparece en ambos criterios.
  for inv in
    select distinct on (gi.invitee_profile_id, gi.id)
      gi.id as invite_id, gi.group_id, gi.invited_by, gi.invitee_profile_id, g.name as group_name
    from public.group_invites gi
    join public.groups g on g.id = gi.group_id
    where gi.status = 'pending'
      and (
        (invite_token is not null and gi.token = invite_token)
        or (new.email is not null and gi.email = new.email)
      )
  loop
    if inv.invitee_profile_id is not null then
      -- Fusiona el perfil temporal (con todo su historial) al usuario real.
      perform public.claim_temp_profile(inv.invitee_profile_id, new.id);
    else
      -- Invitación sin perfil temporal asociado (invitación "abierta" por
      -- email, sin haber agregado antes a nadie con nombre): solo agrega
      -- al grupo directamente.
      insert into public.group_members (group_id, user_id, invited_by)
      values (inv.group_id, new.id, inv.invited_by)
      on conflict (group_id, user_id) do nothing;
    end if;

    update public.group_invites set status = 'accepted' where id = inv.invite_id;

    insert into public.notifications (user_id, type, title, message, data)
    values (
      new.id, 'group_invite', '¡Te has unido al grupo!',
      'Te has unido exitosamente al grupo ' || inv.group_name || '.',
      jsonb_build_object('group_id', inv.group_id, 'invite_id', inv.invite_id)
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
-- 9) STORAGE: bucket de uploads
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
-- 10) ROW LEVEL SECURITY
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
  for insert with check (auth.uid() = id or is_temp = true);

-- Solo el dueño real del perfil, o un compañero de grupo cuando el
-- perfil objetivo es temporal (nunca se puede editar/borrar el perfil
-- de otro usuario ya registrado).
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
    public.is_group_member(id, auth.uid()) or owner_id = auth.uid()
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
-- select: usa la función security definer is_group_member para evitar que
-- la policy se auto-referencie (eso causaba "infinite recursion", 42P17).
drop policy if exists "select_group_members" on public.group_members;
create policy "select_group_members" on public.group_members
  for select using (
    public.is_group_member(group_id, auth.uid())
    or group_id in (select id from public.groups where owner_id = auth.uid())
  );

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

drop policy if exists "update_group_invites" on public.group_invites;
create policy "update_group_invites" on public.group_invites
  for update using (
    email = (select email from public.profiles where id = auth.uid())
    or group_id in (select id from public.groups where owner_id = auth.uid())
  );

-- ---- expenses ----
drop policy if exists "select_group_expenses" on public.expenses;
create policy "select_group_expenses" on public.expenses
  for select using (public.is_group_member(group_id, auth.uid()));

drop policy if exists "insert_group_expenses" on public.expenses;
create policy "insert_group_expenses" on public.expenses
  for insert with check (public.is_group_member(group_id, auth.uid()));

drop policy if exists "delete_group_expenses" on public.expenses;
create policy "delete_group_expenses" on public.expenses
  for delete using (created_by = auth.uid() or paid_by = auth.uid());

-- ---- expense_items ----
drop policy if exists "select_expense_items" on public.expense_items;
create policy "select_expense_items" on public.expense_items
  for select using (
    expense_id in (
      select e.id from public.expenses e
      where public.is_group_member(e.group_id, auth.uid())
    )
  );

drop policy if exists "insert_expense_items" on public.expense_items;
create policy "insert_expense_items" on public.expense_items
  for insert with check (
    expense_id in (
      select e.id from public.expenses e
      where public.is_group_member(e.group_id, auth.uid())
    )
  );

-- ---- expense_splits ----
drop policy if exists "select_expense_splits" on public.expense_splits;
create policy "select_expense_splits" on public.expense_splits
  for select using (
    expense_id in (
      select e.id from public.expenses e
      where public.is_group_member(e.group_id, auth.uid())
    )
  );

drop policy if exists "insert_expense_splits" on public.expense_splits;
create policy "insert_expense_splits" on public.expense_splits
  for insert with check (
    expense_id in (
      select e.id from public.expenses e
      where public.is_group_member(e.group_id, auth.uid())
    )
  );

-- ---- payments ----
drop policy if exists "select_group_payments" on public.payments;
create policy "select_group_payments" on public.payments
  for select using (public.is_group_member(group_id, auth.uid()));

drop policy if exists "insert_group_payments" on public.payments;
create policy "insert_group_payments" on public.payments
  for insert with check (public.is_group_member(group_id, auth.uid()));

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