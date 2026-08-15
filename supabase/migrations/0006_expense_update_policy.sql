create policy "update_group_expenses" on public.expenses
  for update
  using (
    exists (
      select 1 from public.group_members gm
      where gm.group_id = expenses.group_id
      and gm.user_id = auth.uid()
    )
  );
