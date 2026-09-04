/**
 * Exact email body cleaning function used across the expense detection pipeline.
 * Replicated verbatim to guarantee 100% fidelity with production processing.
 */
export function cleanEmailBody(body: string | null | undefined): string {
  if (!body) return '';
  return body
    .replace(/\[image:[^\]]*\]/gi, '')       // [image: BBVA Logo]
    .replace(/<https?:\/\/[^\s>]+>/g, '')    // <https://...> (links envueltos)
    .replace(/https?:\/\/\S+/g, '')          // URLs sueltas
    .replace(/\*/g, '')                       // asteriscos de negrita
    .replace(/[ \t]+/g, ' ')                  // colapsa espacios/tabs, conserva \n
    .replace(/\n{3,}/g, '\n\n')               // colapsa líneas en blanco excesivas
    .trim();
}

/**
 * Builds the exact prompt used to create a new expense extraction template.
 * Replicated verbatim, with entity referenced by relation/name.
 */
export function buildTemplatePrompt(sender: string, subject: string, cleanBody: string): string {
  return [
    'Eres un asistente que ayuda a crear plantillas de extracción de datos',
    'para un sistema de detección automática de gastos a partir de correos',
    'bancarios y de apps de pago (Colombia/Latinoamérica). Cada plantilla',
    'define un conjunto de expresiones regulares (regex de JavaScript) que',
    'se aplican sobre el cuerpo de texto plano de un correo (ya limpio de',
    'URLs, marcado HTML residual y espacios repetidos) para extraer: el',
    'monto, el comercio/destinatario, la fecha, la hora, la moneda y la',
    'cuenta de origen del gasto.',
    '',
    'CONTEXTO DEL FILTRADO (para que definas los patrones correctos):',
    'El sistema prueba los correos en 3 niveles, en este orden:',
    '  1) Patrón de correo de la ENTIDAD (no de esta plantilla): filtra',
    '     por el remitente. Una entidad (ej. "BBVA") puede tener varias',
    '     direcciones de correo asociadas.',
    '  2) subject_pattern: filtra por el asunto del correo.',
    '  3) match_pattern: SOLO es necesario si ya existe otra plantilla de',
    '     la MISMA entidad con el MISMO subject_pattern, y este correo se',
    '     diferencia de esa otra por alguna palabra o frase puntual en el',
    '     cuerpo (ej. "tarjeta de crédito" vs "tarjeta débito"). Si no',
    '     tienes evidencia de que exista una plantilla ambigua con esta,',
    '     déjalo en null.',
    '',
    'Todos los patrones (sender_pattern, subject_pattern, match_pattern y',
    'los _regex) son expresiones regulares de JavaScript, evaluadas con el',
    'flag "i" (insensible a mayúsculas). Los regex que extraen un valor',
    '(amount_regex, merchant_regex, date_regex, time_regex, currency_regex,',
    'source_account_regex) DEBEN tener exactamente un grupo de captura (...)',
    'alrededor del valor que se quiere extraer.',
    '',
    'ESQUEMA DE LA PLANTILLA:',
    '  - name: text — nombre corto y descriptivo, ej. "BBVA compra tarjeta crédito"',
    '  - entity_name: text — nombre de la entidad a la que pertenece (ej. "BBVA");',
    '    si ya existe una entidad con ese nombre se reutiliza, si no se crea',
    '  - sender_pattern: text|null — regex adicional sobre el remitente exacto',
    '    de ESTE correo (más específico que el patrón de correo de la entidad;',
    '    déjalo null si el patrón de la entidad ya es suficiente)',
    '  - subject_pattern: text|null — regex sobre el asunto del correo',
    '  - match_pattern: text|null — ver explicación arriba',
    '  - amount_regex: text (OBLIGATORIO) — regex con 1 grupo de captura para el monto',
    '  - merchant_regex: text|null — regex con 1 grupo de captura para el comercio/destinatario',
    '  - date_regex: text|null — regex con 1 grupo de captura para la fecha',
    '  - date_format: text|null — formato de la fecha capturada, usando tokens',
    '    YYYY, MM, DD, HH, mm, ss en el mismo orden en que aparecen en el texto',
    '    capturado por date_regex (+ time_regex si existe). Ej: "DD/MM/YYYY HH:mm"',
    '  - time_regex: text|null — regex con 1 grupo de captura para la hora,',
    '    SOLO si la hora viene en un lugar separado de la fecha en el correo',
    '  - currency_regex: text|null — regex con 1 grupo de captura para la moneda',
    '    (déjalo null si el correo no menciona la moneda explícitamente —',
    '    NO asumas ni inventes una moneda por defecto)',
    '  - source_account_regex: text|null — regex con 1 grupo de captura para',
    '    los últimos dígitos de la cuenta/tarjeta de origen',
    '  - expense_type: text|null — una de: "compra", "transferencia", "pago",',
    '    "transporte" (o null si ninguna aplica)',
    '',
    'CORREO REAL A ANALIZAR (cuerpo ya limpio de URLs/HTML, tal como lo ve',
    'el motor de matching):',
    '',
    '--- REMITENTE ---',
    sender,
    '',
    '--- ASUNTO ---',
    subject,
    '',
    '--- CUERPO ---',
    cleanBody,
    '--- FIN DEL CUERPO ---',
    '',
    'INSTRUCCIONES:',
    '1. Analiza el correo y determina qué texto exacto corresponde a cada',
    '   campo (monto, comercio, fecha, hora, moneda, cuenta origen).',
    '2. Escribe regex que capturen ESE texto específico de forma robusta',
    '   (no hardcodees el valor exacto de este correo — el regex debe',
    '   servir para futuros correos similares de la misma plantilla).',
    '3. Prueba mentalmente cada regex contra el cuerpo de arriba antes de',
    '   responder — cada regex con grupo de captura debe efectivamente',
    '   matchear ese cuerpo.',
    '4. Responde ÚNICAMENTE con un objeto JSON válido (sin texto antes ni',
    '   después, sin backticks de markdown), con exactamente estas claves:',
    '',
    '{',
    '  "name": "",',
    '  "entity_name": "",',
    '  "sender_pattern": null,',
    '  "subject_pattern": null,',
    '  "match_pattern": null,',
    '  "amount_regex": "",',
    '  "merchant_regex": null,',
    '  "date_regex": null,',
    '  "date_format": null,',
    '  "time_regex": null,',
    '  "currency_regex": null,',
    '  "source_account_regex": null,',
    '  "expense_type": null',
    '}',
  ].join('\n');
}

