-- 1) PERFILES
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

-- 2) GRUPOS Y MEMBRESÍA
create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null default 'home',
  description text,
  owner_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  invited_by uuid references public.profiles(id),
  role text not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table public.group_invites (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  email text not null,
  invited_by uuid not null references public.profiles(id),
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  unique (group_id, email)
);

-- 3) GASTOS
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  paid_by uuid not null references public.profiles(id),
  total_amount numeric(12,2) not null,
  description text,
  expense_date date not null default current_date,
  source text not null default 'manual',
  source_draft_id uuid, -- FK se agrega en el paso 6
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.expense_items (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses(id) on delete cascade,
  description text not null,
  amount numeric(12,2) not null,
  created_at timestamptz not null default now()
);

create table public.expense_splits (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  amount_owed numeric(12,2) not null,
  created_at timestamptz not null default now(),
  unique (expense_id, user_id)
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  paid_by uuid not null references public.profiles(id),
  paid_to uuid not null references public.profiles(id),
  amount numeric(12,2) not null,
  payment_date date not null default current_date,
  note text,
  created_at timestamptz not null default now()
);

-- 4) BORRADORES DESDE GMAIL
create table public.expense_drafts (
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

-- 5) VISTA DE BALANCES NETOS
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

-- 6) FK PENDIENTE (expenses -> expense_drafts)
alter table public.expenses
  add constraint expenses_source_draft_id_fkey
  foreign key (source_draft_id) references public.expense_drafts(id);

-- 7) TRIGGER: crear perfil y aceptar invitaciones al registrarse
create function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'avatar_url')
  on conflict (id) do nothing;

  insert into public.group_members (group_id, user_id, invited_by)
  select gi.group_id, new.id, gi.invited_by
  from public.group_invites gi
  where gi.email = new.email and gi.status = 'pending';

  update public.group_invites set status = 'accepted'
  where email = new.email and status = 'pending';

  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 8) ROW LEVEL SECURITY
alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_invites enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_items enable row level security;
alter table public.expense_splits enable row level security;
alter table public.payments enable row level security;
alter table public.expense_drafts enable row level security;

-- Policies for profiles
create policy "select_profiles" on public.profiles for select using (true);
create policy "insert_profiles" on public.profiles for insert with check (true);
create policy "update_profiles" on public.profiles for update using (auth.uid() = id);

-- Policies for groups
create policy "select_own_groups" on public.groups
  for select using (
    id in (select group_id from public.group_members where user_id = auth.uid()) or owner_id = auth.uid()
  );

create policy "insert_own_groups" on public.groups
  for insert with check (auth.uid() = owner_id);

create policy "update_own_groups" on public.groups
  for update using (auth.uid() = owner_id);

create policy "delete_own_groups" on public.groups
  for delete using (auth.uid() = owner_id);

-- Policies for group_members
create policy "select_group_members" on public.group_members
  for select using (true);

create policy "insert_group_members" on public.group_members
  for insert with check (true);

create policy "delete_group_members" on public.group_members
  for delete using (user_id = auth.uid() or group_id in (select id from public.groups where owner_id = auth.uid()));

-- Policies for group_invites
create policy "select_group_invites" on public.group_invites
  for select using (true);

create policy "insert_group_invites" on public.group_invites
  for insert with check (invited_by = auth.uid());

create policy "update_group_invites" on public.group_invites
  for update using (true);

-- Policies for expenses
create policy "select_group_expenses" on public.expenses
  for select using (
    group_id in (select group_id from public.group_members where user_id = auth.uid())
  );

create policy "insert_group_expenses" on public.expenses
  for insert with check (
    group_id in (select group_id from public.group_members where user_id = auth.uid())
  );

create policy "delete_group_expenses" on public.expenses
  for delete using (
    created_by = auth.uid() or paid_by = auth.uid()
  );

-- Policies for expense_items
create policy "select_expense_items" on public.expense_items for select using (true);
create policy "insert_expense_items" on public.expense_items for insert with check (true);

-- Policies for expense_splits
create policy "select_expense_splits" on public.expense_splits for select using (true);
create policy "insert_expense_splits" on public.expense_splits for insert with check (true);

-- Policies for payments
create policy "select_group_payments" on public.payments
  for select using (
    group_id in (select group_id from public.group_members where user_id = auth.uid())
  );

create policy "insert_group_payments" on public.payments
  for insert with check (
    group_id in (select group_id from public.group_members where user_id = auth.uid())
  );

-- Policies for expense_drafts
create policy "select_own_drafts" on public.expense_drafts
  for select using (user_id = auth.uid());

create policy "insert_own_drafts" on public.expense_drafts
  for insert with check (user_id = auth.uid());

create policy "update_own_drafts" on public.expense_drafts
  for update using (user_id = auth.uid());
