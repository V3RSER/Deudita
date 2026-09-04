-- ============================================================
-- Plantillas por defecto — extraídas de BankService.gs
-- ============================================================
--
-- NOTAS IMPORTANTES antes de correr esto:
--
-- 1) Todas las regex se aplican con la bandera 'i' (case-insensitive) en el
--    Apps Script — ya corregido ahí, no hace falta duplicar variantes de
--    mayúsculas/minúsculas en las regex de abajo.
--
-- 2) LIMITACIÓN CONOCIDA — Didi y Uber: el script original extrae el
--    "destino" recorriendo varias paradas con un loop (extractStops) y se
--    queda con la última. Nuestro sistema de plantillas hace un solo
--    .match() por campo, no un loop — no se puede replicar esa lógica con
--    una sola regex. Por eso, en Didi y Uber, merchant_regex queda NULL
--    a propósito: el monto, fecha, hora y cuenta origen sí se capturan
--    igual de bien, pero el "comercio/destino" no. Si te importa ese campo
--    para viajes, la alternativa es crear la plantilla puntual con el
--    asistente de IA cuando tengas un correo de ejemplo a mano, o aceptar
--    que ese campo quede vacío para estos dos.
--
-- 3) LIMITACIÓN — dos casos combinan fecha+hora en una sola regex (BBVA
--    transferencia y Uber), en vez de dos campos separados como el resto.
--    Ahí date_regex captura el string completo "fecha hora" y time_regex
--    queda NULL — tu backend debe poder parsear ese formato combinado tal
--    cual (ver date_format de cada fila).
--
-- 4) ORDEN IMPORTA para Bancolombia: hay 4 variantes (llave, cuenta, QR,
--    y un fallback genérico purposefully MUY amplio). El fallback genérico
--    matchea CUALQUIER correo de Bancolombia con un "$monto", así que si
--    tu API devuelve las plantillas en un orden donde el fallback queda
--    antes que las otras tres, se va a "robar" todos los correos de
--    Bancolombia con datos incompletos. Por ahora dejo el fallback
--    genérico FUERA de este insert (comentado al final) — actívalo solo
--    si le agregas alguna forma de prioridad/orden explícito a
--    email_templates (ej. una columna "priority"), porque con el modelo
--    actual (primera plantilla que matchee, en el orden en que llegan)
--    es arriesgado.
--
-- 5) DAVIbank: el "sourceAccount" original es un string fijo ("Cencosud"),
--    no algo que se extrae con regex — se refleja en entity_name, no en
--    source_account_regex (que queda NULL para esta plantilla).


INSERT INTO public.email_templates
  (name, subject_pattern, amount_regex, merchant_regex, date_regex, time_regex,
   date_format, entity_name, default_currency, source_account_regex, active)
VALUES

-- ── RappiCard — compra ──────────────────────────────────────
(
  'RappiCard - Compra',
  $rgx$rappicard$rgx$,
  $rgx$Monto\s*\n?\s*\$?([\d.,]+)$rgx$,
  $rgx$Comercio\s*\n?\s*([^\n\r$\d]{2,60})$rgx$,
  $rgx$Fecha de la transacci[oó]n\s*\n?\s*([\d\-]+ [\d:]+)$rgx$,
  NULL,
  'YYYY-MM-DD HH:mm',
  'RappiCard',
  'COP',
  $rgx$M[eé]todo de pago\s*\n?\s*\*?(\d{4})$rgx$,
  true
),

-- ── DAVIbank — compra (Cencosud) ────────────────────────────
(
  'DAVIbank - Compra Cencosud',
  $rgx$davibank$rgx$,
  $rgx$Monto\s*\n?\s*([\d.,]+)$rgx$,
  $rgx$Comercio\s*\n?\s*([^\n\r\t]{2,80})$rgx$,
  $rgx$Fecha\s*\n?\s*([\d\/]+)$rgx$,
  $rgx$Hora\s*\n?\s*([\d:]+)$rgx$,
  'DD/MM/YYYY',
  'DAVIbank (Cencosud)',
  'COP',
  NULL, -- sourceAccount original es un string fijo "Cencosud", no se extrae por regex
  true
),

-- ── BBVA — transferencia entre personas ─────────────────────
(
  'BBVA - Transferencia',
  $rgx$bbva$rgx$,
  $rgx$Valor enviado\s*\n?\s*\$?\s*([\d.,]+)$rgx$,
  $rgx$Persona que recibe\s*\n?\s*([^\n\r]{2,80})$rgx$,
  $rgx$Fecha y hora\s*\n?\s*([\d\/]+ [\d:]+)$rgx$, -- captura fecha+hora juntos, ver nota 3
  NULL,
  'DD/MM/YYYY HH:mm',
  'BBVA',
  'COP',
  $rgx$Cuenta origen\s*\n?\s*\*+(\d{4})$rgx$,
  true
),

-- ── BBVA — pago de facturas/servicios ───────────────────────
(
  'BBVA - Pago de servicios',
  $rgx$bbva$rgx$,
  $rgx$pago por \$\s*([\d.,]+)$rgx$,
  $rgx$de\s+\d+\s+([^,\n\r]+?)(?:,\s*referencia|\s+referencia)$rgx$,
  $rgx$el\s+([\d\-]+)$rgx$,
  $rgx$Hora\s+([\d:]+)$rgx$,
  'YYYY-MM-DD', -- el formato original varía (YYYY-MM-DD o DD-MM-YYYY según el correo); ajustar si detectas casos DD-MM-YYYY
  'BBVA',
  'COP',
  $rgx$cuenta\s+No\.?[X*]*(\d{4})$rgx$,
  true
),

-- ── Bancolombia — transferencia a llave (Nequi/Daviplata) ───
(
  'Bancolombia - Transferencia a llave',
  $rgx$bancolombia$rgx$,
  $rgx$transferiste\s*\$([\d.,]+)\s+a la llave$rgx$,
  $rgx$a la llave\s+\S+\s+desde tu cuenta\s*\*?\d+\s+a\s+([\wÁÉÍÓÚÑáéíóúñ\s]+?)\s+el$rgx$,
  $rgx$el\s+([\d\/]+)\s+a las$rgx$,
  $rgx$a las\s+([\d:]+)$rgx$,
  'DD/MM/YYYY',
  'Bancolombia',
  'COP',
  $rgx$desde tu cuenta\s*\*?(\d+)\s+a\s$rgx$,
  true
),

-- ── Bancolombia — transferencia a cuenta ────────────────────
-- Nota: en el original, "title" en este caso es en realidad el número de
-- cuenta destino, no un nombre — se conserva ese comportamiento aquí.
(
  'Bancolombia - Transferencia a cuenta',
  $rgx$bancolombia$rgx$,
  $rgx$transferiste\s*\$([\d.,]+)\s+desde tu cuenta\s*\*?\d+\s+a la cuenta$rgx$,
  $rgx$a la cuenta\s*\*?(\d+)$rgx$,
  $rgx$el\s+([\d\/]+)\s+a las$rgx$,
  $rgx$a las\s+([\d:]+)$rgx$,
  'DD/MM/YYYY',
  'Bancolombia',
  'COP',
  $rgx$desde tu cuenta\s*\*?(\d+)\s+a la cuenta$rgx$,
  true
),

-- ── Bancolombia — pago por código QR ────────────────────────
(
  'Bancolombia - Pago QR',
  $rgx$bancolombia$rgx$,
  $rgx$pagaste\s*\$([\d.,]+)\s+por codigo QR$rgx$,
  $rgx$a la llave\s+(\S+)\s+el$rgx$,
  $rgx$el\s+([\d\/]+)\s+a las$rgx$,
  $rgx$a las\s+([\d:]+)$rgx$,
  'DD/MM/YYYY',
  'Bancolombia',
  'COP',
  $rgx$desde tu cuenta\s*\*?(\d+)\s+a la llave$rgx$,
  true
),

-- ── Didi ─────────────────────────────────────────────────────
-- merchant_regex NULL a propósito — ver nota 2 arriba.
(
  'Didi - Viaje',
  $rgx$didi$rgx$,
  $rgx$Total\s*\$\s*([\d.,]+)$rgx$,
  NULL,
  $rgx$(\d{1,2}\s+(?:ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)[a-z]*[\s,]+\d{4})$rgx$,
  $rgx$(\d{1,2}:\d{2}\s*[ap]m)$rgx$,
  'DD MMM YYYY', -- mes en español abreviado; confirma que tu parser de fechas lo soporte
  'Didi',
  'COP',
  $rgx$\*{2,4}(\d{4})$rgx$, -- si el correo no trae dígitos y solo trae el nombre de la marca (ej. "Visa"), este campo queda NULL
  true
),

-- ── Uber ─────────────────────────────────────────────────────
-- merchant_regex NULL a propósito — ver nota 2. Fecha+hora combinadas — ver nota 3.
(
  'Uber - Viaje',
  $rgx$uber$rgx$,
  $rgx$Total\s*COP\s*([\d.,]+)$rgx$,
  NULL,
  $rgx$(\d{2}\/\d{2}\/\d{2,4}\s+\d{1,2}:\d{2}\s*[ap]\.?\s*m\.?)$rgx$,
  NULL,
  'DD/MM/YYYY hh:mm a.m./p.m.', -- confirma que tu parser de fechas soporte este formato con puntos
  'Uber',
  'COP',
  $rgx$(?:Visa|Mastercard|Amex|Nequi|Daviplata)[^\d]*(\d{4})$rgx$, -- si solo viene el nombre de la marca sin dígitos, queda NULL
  true
);


-- ============================================================
-- Bancolombia — fallback genérico (COMENTADO, ver nota 4)
-- ============================================================
-- Descomenta y ajusta el orden/prioridad de plantillas antes de activar esto.
--
-- INSERT INTO public.email_templates
--   (name, subject_pattern, amount_regex, date_regex, entity_name, default_currency, active)
-- VALUES (
--   'Bancolombia - Fallback genérico',
--   $rgx$bancolombia$rgx$,
--   $rgx$\$([\d.,]+)$rgx$,
--   $rgx$el\s+([\d\/]+ a las [\d:]+)$rgx$,
--   'Bancolombia',
--   'COP',
--   true
-- );
