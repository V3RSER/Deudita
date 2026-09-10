-- Seed inicial de tipos de gastos
insert into public.expense_types (key, label, is_default, active)
values
  ('compra', 'Compra', true, true),
  ('transferencia', 'Transferencia', true, true),
  ('retiro', 'Retiro', true, true),
  ('pago', 'Pago', true, true),
  ('suscripcion', 'Suscripción', false, true),
  ('factura', 'Factura', false, true)
on conflict (key) do nothing;