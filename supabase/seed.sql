insert into public.expense_types (name, label) values
  ('compra', 'Compra'),
  ('transferencia', 'Transferencia'),
  ('pago', 'Pago'),
  ('retiro', 'Retiro'),
  ('transporte', 'Transporte')
on conflict (name) do nothing;