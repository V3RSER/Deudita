-- Migration 0004: Payment proof_url and RLS policies for update and delete

alter table public.payments add column if not exists proof_url text;
alter table public.payments add column if not exists updated_at timestamptz not null default now();
alter table public.payments add column if not exists updated_by uuid references public.profiles(id);

-- Add UPDATE policy for payments: group members, payer, or receiver can update
drop policy if exists "update_group_payments" on public.payments;
create policy "update_group_payments" on public.payments
  for update using (
    public.is_group_member(group_id, auth.uid())
    or paid_by = auth.uid()
    or paid_to = auth.uid()
  );

-- Add DELETE policy for payments: group members, payer, or receiver can delete
drop policy if exists "delete_group_payments" on public.payments;
create policy "delete_group_payments" on public.payments
  for delete using (
    public.is_group_member(group_id, auth.uid())
    or paid_by = auth.uid()
    or paid_to = auth.uid()
  );
