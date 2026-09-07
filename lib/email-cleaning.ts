/**
 * Exact email body cleaning function used across the expense detection pipeline.
 * Replicated verbatim to guarantee 100% fidelity with production processing.
 */
export function cleanEmailBody(body: string | null | undefined): string {
  if (!body) return '';
  let text = String(body);

  // Si el texto contiene fragmentos o etiquetas HTML (p. ej. correos sin procesar o pegados directos),
  // los convertimos a texto plano respetando saltos de línea, idéntico a GmailMessage.getPlainBody() de Google Apps Script.
  if (/<[a-z][\s\S]*>/i.test(text)) {
    text = text
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '')
      .replace(/<br\s*[\/]?>/gi, '\n')
      .replace(/<\/(p|div|tr|h[1-6]|li|table|blockquote)>/gi, '\n')
      .replace(/<(td|th)[^>]*>/gi, ' ')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)));
  }

  // Exactas 6 reglas de cleanEmailBody de Google Apps Script:
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\[image:[^\]]*\]/gi, '')       // [image: BBVA Logo]
    .replace(/<https?:\/\/[^\s>]+>/g, '')    // <https://...> (links envueltos)
    .replace(/https?:\/\/\S+/g, '')          // URLs sueltas
    .replace(/\*/g, '')                       // asteriscos de negrita
    .replace(/[ \t]+/g, ' ')                  // colapsa espacios/tabs, conserva \n
    .replace(/\n{3,}/g, '\n\n')               // colapsa líneas en blanco excesivas
    .trim();
}

/**
 * Sanitizes regex strings by removing leading/trailing forward slashes (/.../i)
 * and accidental outer quotes that LLMs or users might introduce.
 */
export function sanitizeRegexPattern(pattern: string | null | undefined): string | null {
  if (!pattern || typeof pattern !== 'string') return null;
  let p = pattern.trim();
  // Strip surrounding quotes if present
  if ((p.startsWith('"') && p.endsWith('"')) || (p.startsWith("'") && p.endsWith("'"))) {
    p = p.slice(1, -1).trim();
  }
  // Strip enclosing regex slashes: e.g. /pattern/i or /pattern/
  const slashMatch = p.match(/^\/([\s\S]*)\/([gimsuy]*)$/);
  if (slashMatch) {
    p = slashMatch[1];
  }

  // Common LLM typo: (?\:...) is invalid JavaScript regex syntax; the intended
  // non-capturing group is (?:...). Repair only this unambiguous typo.
  p = p.replace(/\(\?\\:/g, '(?:');

  return p.trim() || null;
}

export interface ParsedAITemplateResult {
  success: boolean;
  data?: {
    name: string;
    entity_name: string | null;
    is_new_entity: boolean;
    entity_email_pattern: string | null;
    sender_pattern: string | null;
    subject_pattern: string | null;
    match_pattern: string | null;
    amount_regex: string;
    merchant_regex: string | null;
    date_regex: string | null;
    date_format: string | null;
    time_regex: string | null;
    time_format: string | null;
    currency_regex: string | null;
    default_currency: string;
    source_account_regex: string | null;
    expense_type: string | null;
  };
  error?: string;
  warnings?: string[];
}

/**
 * Builds the exact prompt used to create a new expense extraction template.
 * Includes entity matching logic, level 1-3 filtering, and required database fields.
 */
export function buildTemplatePrompt(
  sender: string,
  subject: string,
  cleanBody: string,
  existingEntities: string[] = []
): string {
  const entityListText = existingEntities.length > 0
    ? `ENTIDADES BANCARIAS YA REGISTRADAS EN EL SISTEMA:\n${existingEntities.map(e => `  - "${e}"`).join('\n')}\n`
    : 'Aún no hay entidades registradas en el sistema.\n';

  return [
    'Eres un asistente especializado en diseñar plantillas de extracción de datos',
    'para un sistema de finanzas personales que procesa notificaciones por correo',
    'bancarias y de billeteras digitales (Colombia y Latinoamérica).',
    '',
    'OBJETIVO:',
    'Analiza el correo proporcionado y genera una plantilla reutilizable para reconocer futuros',
    'correos de la MISMA CLASE DE NOTIFICACIÓN y extraer sus datos transaccionales.',
    'La plantilla debe modelar la identidad de la entidad y el tipo de notificación, no memorizar',
    'la redacción completa ni los valores concretos de una sola muestra.',
    '',
    'NIVEL 1 — ENTIDAD:',
    'Identifica la institución que origina la notificación y usa su nombre comercial o denominación',
    'habitual en el sistema. Debe ser un nombre corto, natural y reconocible.',
    'NO copies automáticamente sufijos societarios, jurídicos o registrales como S.A., S.A.S., Ltda.,',
    'Inc., Corp. u otros equivalentes si la entidad es conocida normalmente por una forma comercial más simple.',
    'Por ejemplo, si la organización se presenta como "DAVIbank S.A." pero su identidad habitual es',
    '"DAVIbank", usa "DAVIbank" como entity_name.',
    'Si existe una entidad equivalente en la lista de entidades registradas, usa exactamente ese nombre',
    'en lugar de crear una variante como "Entidad S.A." o "Entidad Colombia".',
    'entity_email_pattern debe identificar la señal institucional estable de la organización.',
    'No lo confundas con el tipo de mensaje ni con datos de una transacción.',
    'is_new_entity debe ser true únicamente si la entidad identificada no corresponde a ninguna entidad',
    'equivalente de la lista de entidades registradas; en caso contrario debe ser false.',
    '',
    'NIVEL 2 — ASUNTO Y NOMBRE DE LA PLANTILLA:',
    'Analiza el asunto para determinar la clase de notificación y construye subject_pattern únicamente con',
    'las características semánticas y estructurales estables que identifican esa clase.',
    'Separa siempre:',
    '- DIFERENCIA DE TIPO: cambia la clase de notificación y debe conservarse.',
    '- VARIACIÓN DE INSTANCIA: puede cambiar sin cambiar la clase y debe abstraerse.',
    '',
    'Antes de incluir cualquier segmento en subject_pattern, aplica esta prueba:',
    '"Si este segmento cambiara o desapareciera, ¿seguiría siendo la misma clase de notificación?".',
    'Si sí, abstraelo. Si no, consérvalo.',
    '',
    'Abstrae siempre los valores concretos de una instancia y las modificaciones accidentales del correo,',
    'incluyendo fechas, horas, importes, nombres, personas, comercios, referencias, códigos, identificadores',
    'y prefijos de respuesta o reenvío como Re:, RE:, Fwd:, FW:, RV: y equivalentes.',
    'Estos prefijos solo deben conservarse si existe evidencia de que forman parte intrínseca y estable',
    'del asunto original de la notificación.',
    '',
    'No memorices valores de una única muestra ni conviertas en estructural un elemento solo porque aparezca',
    'literalmente en el asunto recibido. El patrón debe representar la notificación original normalizada,',
    'no una transformación causada por reenvío, respuesta, hilo o cliente de correo.',
    '',
    'El campo name NO debe describir datos concretos de una instancia.',
    'Debe ser corto, descriptivo y seguir principalmente ENTIDAD + TIPO DE NOTIFICACIÓN,',
    'usando el concepto normal de la notificación y no una frase literal del cuerpo.',
    '',
    'NIVEL 3 — DESEMPATE:',
    'Usa match_pattern SOLO si varias plantillas de la misma entidad pueden compartir subject_pattern y existe',
    'una diferencia semántica o estructural estable que permita distinguirlas.',
    'No uses valores concretos ni datos accidentales de la muestra: personas, comercios, importes, fechas, horas,',
    'tarjetas, cuentas, códigos, referencias o texto incidental.',
    'Si no existe una diferencia estable que requiera desempate, devuelve match_pattern=null.',
    'Nunca inventes un desempate.',
    '',
    'REGLA FUNDAMENTAL:',
    'Clasifica cada característica como VARIACIÓN DE INSTANCIA o DIFERENCIA DE TIPO.',
    'Las variaciones de instancia se abstraen; las diferencias de tipo se conservan.',
    'Haz esta clasificación por análisis semántico y estructural del correo, no por coincidencia literal con la muestra.',
    '',
    entityListText,
    'REGLAS PARA LOS REGEX:',
    '1. Todos deben ser JavaScript válidos y compilar con new RegExp(regex, "i").',
    '1A. entity_email_pattern debe identificar de forma estable el dominio, buzón o señal institucional de la entidad.',
    'No debe depender de nombres, comercios, importes, fechas, referencias ni otros datos transaccionales.',
    '2. No uses delimitadores /.../ ni flags dentro del valor.',
    '3. Usa sintaxis estándar de JavaScript; para grupos no capturantes usa (?:...).',
    '4. Cada regex de extracción debe tener exactamente UN grupo de captura (...) alrededor del valor a extraer. Si usas alternaciones como (val1)|(val2), asegúrate de que capture el valor.',
    '5. amount_regex es OBLIGATORIO y debe capturar únicamente el importe numérico (ej: "50.000,00" o "120500"), sin el signo de moneda ni etiquetas.',
    '6. merchant_regex: captura el comercio, tienda, destinatario o beneficiario de la operación cuando esté presente. En transferencias, si no existe nombre de beneficiario pero sí una cuenta destino explícita, debe capturarse esa cuenta destino. Si no existe ningún comercio, destinatario ni beneficiario identificable, merchant_regex debe ser null.',
    '7. date_regex debe capturar únicamente la fecha y date_format debe indicar exactamente su formato (ej: DD/MM/YYYY, YYYY-MM-DD, etc.).',
    '7A. time_regex: Si el correo tiene hora de transacción (ej: "14:35", "02:35 p. m.", "Hora: 14:35:00", "a las 14:35"), usa un patrón tolerante a formato 12h/24h con segundos opcionales, capturando el valor exacto de la hora: ejemplo `(?:hora|hora\\s+transacción)?:?\\s*([0-2]?[0-9]:[0-5][0-9](?::[0-5][0-9])?(?:\\s*[ap]\\.?\\s*m\\.?)?)`. time_format debe coincidir con los tokens de fecha/hora (ej: "HH:mm", "HH:mm:ss", "hh:mm a", "hh:mm a.m."). Si la hora NO aparece en el correo, devuelve time_regex=null y time_format=null.',
    '7B. currency_regex: Si el correo indica dinámicamente la moneda (ej: "COP", "USD", "$"), usa un regex con captura. Si la moneda es implícita, deja currency_regex=null y define default_currency="COP".',
    '8. CRÍTICO PARA EXTRACCIÓN: Las expresiones regulares DEBEN coincidir contra el texto en CUERPO LIMPIO. Ten en cuenta que tras la limpieza de correos y tablas HTML, entre etiquetas y sus valores suele haber espacios o saltos de línea, NO siempre dos puntos ":". Usa separadores flexibles como `(?:\\s*:\\s*|\\s+)`.',
    '9. Si un campo opcional (como hora, cuenta de origen, comercio) NO aparece en el texto del correo, devuelve null. NUNCA inventes un regex para un campo que no está en el correo.',
    '10. sender_pattern debe identificar una señal estable del remitente institucional.',
    '11. Los patrones deben generalizar variaciones de instancia sin borrar diferencias que definan otra plantilla.',
    '',
    'VALORES SEMÁNTICOS DEL RESULTADO:',
    '12. default_currency debe contener la moneda aplicable por defecto cuando el correo no indique explícitamente una. Para notificaciones bancarias de Colombia, usa "COP" salvo evidencia clara de otra moneda.',
    '13. expense_type debe describir la naturaleza de la operación según el vocabulario del sistema: "compra", "transferencia", "retiro", "pago", etc.',
    '14. entity_name debe usar exactamente el nombre de una entidad equivalente si ya existe en la lista registrada.',
    '',
    'ANTES DE CONSTRUIR EL JSON, RAZONA INTERNAMENTE:',
    'A) Cuál es la identidad habitual y corta de la entidad.',
    'B) Qué clase de notificación representa la notificación original.',
    'C) Qué elementos del asunto son estructurales y cuáles son variables, incidentales o introducidos por el correo.',
    'D) Qué nombre corto de catálogo describe mejor ENTIDAD + TIPO DE NOTIFICACIÓN.',
    'E) Si existe ambigüedad real que requiera match_pattern.',
    'F) Qué datos concretos de esta muestra nunca deberían convertirse en identificadores de la plantilla.',
    'G) Qué campos opcionales están realmente presentes o ausentes en el correo.',
    'No escribas este razonamiento en la respuesta final; úsalo únicamente para construir el JSON.',
    '',
    'RESPONDE EXCLUSIVAMENTE CON UN OBJETO JSON VÁLIDO, SIN MARKDOWN NI EXPLICACIONES.',
    'El objeto debe contener EXACTAMENTE estas propiedades:',
    'name, entity_name, is_new_entity, entity_email_pattern, sender_pattern, subject_pattern,',
    'match_pattern, amount_regex, merchant_regex, date_regex, date_format, time_regex, time_format,',
    'currency_regex, default_currency, source_account_regex, expense_type.',
    '',
    'Cada propiedad debe contener el valor determinado por el análisis del correo y las reglas anteriores.',
    'NO copies valores de esta instrucción como si fueran datos del correo.',
    'NO inventes valores para completar propiedades.',
    'Usa null únicamente cuando corresponda según las reglas.',
    'No cambies los nombres de las propiedades ni inventes nuevas propiedades.',
    'No uses valores en inglés cuando el vocabulario indicado por estas instrucciones define otro valor.',
    '',
    'DATOS DEL CORREO A ANALIZAR:',
    '--- REMITENTE RECIBIDO POR EL SISTEMA ---',
    sender || '(Sin remitente)',
    '',
    '--- ASUNTO RECIBIDO POR EL SISTEMA ---',
    subject || '(Sin asunto)',
    '',
    '--- CUERPO LIMPIO ---',
    cleanBody || '(Sin cuerpo)',
    '--- FIN DEL CORREO ---',
  ].join('\n');
}

/**
 * Parses, cleans, and validates the AI response text when creating a template.
 * Tolerant to markdown code blocks, conversational prefixes/suffixes, and unescaped characters.
 */
export function parseAITemplateResponse(rawText: string): ParsedAITemplateResult {
  if (!rawText || !rawText.trim()) {
    return { success: false, error: 'El texto ingresado está vacío' };
  }

  let cleaned = rawText.trim();

  // Strip markdown code fences if present (```json ... ``` or ``` ... ```)
  const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (codeBlockMatch && codeBlockMatch[1]) {
    cleaned = codeBlockMatch[1].trim();
  }

  // Find first { and last } to isolate json payload
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return {
      success: false,
      error: 'No se encontró un objeto JSON válido en la respuesta de la IA. Asegúrate de copiar el JSON completo.',
    };
  }

  const jsonSubstring = cleaned.substring(firstBrace, lastBrace + 1);

  let parsed: any;
  try {
    parsed = JSON.parse(jsonSubstring);
  } catch (err: unknown) {
    // Attempt fallback repair for commonly unescaped backslashes in regex (e.g. "\$" or "\d")
    try {
      const repaired = jsonSubstring
        .replace(/\\/g, '\\\\')
        .replace(/\\\\"/g, '\\"')
        .replace(/\\\\\\/g, '\\\\');
      parsed = JSON.parse(repaired);
    } catch {
      const msg = err instanceof Error ? err.message : 'JSON inválido';
      return {
        success: false,
        error: `Error al interpretar el JSON devuelto por la IA: ${msg}. Verifica que el contenido tenga formato JSON correcto.`,
      };
    }
  }

  const warnings: string[] = [];

  // Required field checks
  if (!parsed.name || typeof parsed.name !== 'string' || !parsed.name.trim()) {
    warnings.push('La IA no especificó un nombre para la plantilla; se asignará uno por defecto.');
    parsed.name = `${parsed.entity_name || 'Banco'} - Plantilla`;
  }

  if (!parsed.amount_regex || typeof parsed.amount_regex !== 'string' || !parsed.amount_regex.trim()) {
    return {
      success: false,
      error: 'El campo "amount_regex" es obligatorio en la plantilla para poder capturar el valor del gasto.',
    };
  }

  // Validate regex syntax
  const regexFields: Array<{ key: string; label: string; reqGroup: boolean }> = [
    { key: 'amount_regex', label: 'Monto', reqGroup: true },
    { key: 'merchant_regex', label: 'Comercio', reqGroup: true },
    { key: 'date_regex', label: 'Fecha', reqGroup: true },
    { key: 'time_regex', label: 'Hora', reqGroup: true },
    { key: 'currency_regex', label: 'Moneda', reqGroup: true },
    { key: 'source_account_regex', label: 'Cuenta de origen', reqGroup: true },
    { key: 'subject_pattern', label: 'Patrón de Asunto', reqGroup: false },
    { key: 'sender_pattern', label: 'Patrón de Remitente', reqGroup: false },
    { key: 'match_pattern', label: 'Patrón de Desempate', reqGroup: false },
    { key: 'entity_email_pattern', label: 'Patrón de Correo de Entidad', reqGroup: false },
  ];

  const validationErrors: string[] = [];

  for (const { key, label, reqGroup } of regexFields) {
    const rawPattern = parsed[key];
    const pattern = sanitizeRegexPattern(rawPattern);
    if (pattern) {
      parsed[key] = pattern;
      try {
        new RegExp(pattern, 'i');
        if (reqGroup && !/\([^?].*?\)/.test(pattern)) {
          validationErrors.push(`El patrón de "${label}" no tiene un grupo de captura (...) válido.`);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        validationErrors.push(`El patrón de "${label}" es inválido: ${msg}`);
      }
    } else if (reqGroup && key !== 'currency_regex' && key !== 'source_account_regex' && key !== 'time_regex' && key !== 'date_regex' && key !== 'merchant_regex') {
      validationErrors.push(`El patrón de "${label}" es obligatorio.`);
    }
  }

  if (validationErrors.length > 0) {
    return {
      success: false,
      error: `La respuesta de la IA contiene errores que deben corregirse:\n${validationErrors.map((e) => `• ${e}`).join('\n')}`,
      warnings,
    };
  }

  return {
    success: true,
    data: {
      name: String(parsed.name).trim(),
      entity_name: parsed.entity_name ? String(parsed.entity_name).trim() : null,
      is_new_entity: Boolean(parsed.is_new_entity),
      entity_email_pattern: sanitizeRegexPattern(parsed.entity_email_pattern),
      sender_pattern: sanitizeRegexPattern(parsed.sender_pattern),
      subject_pattern: sanitizeRegexPattern(parsed.subject_pattern),
      match_pattern: sanitizeRegexPattern(parsed.match_pattern),
      amount_regex: sanitizeRegexPattern(parsed.amount_regex) || String(parsed.amount_regex).trim(),
      merchant_regex: sanitizeRegexPattern(parsed.merchant_regex),
      date_regex: sanitizeRegexPattern(parsed.date_regex),
      date_format: parsed.date_format ? String(parsed.date_format).trim() : 'DD/MM/YYYY',
      time_regex: sanitizeRegexPattern(parsed.time_regex),
      time_format: parsed.time_format ? String(parsed.time_format).trim() : null,
      currency_regex: sanitizeRegexPattern(parsed.currency_regex),
      default_currency: parsed.default_currency ? String(parsed.default_currency).trim() : 'COP',
      source_account_regex: sanitizeRegexPattern(parsed.source_account_regex),
      expense_type: parsed.expense_type ? String(parsed.expense_type).toLowerCase().trim() : null,
    },
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

export interface TemplateCorrectionDetails {
  template: {
    name?: string | null;
    entity_name?: string | null;
    entity_email_pattern?: string | null;
    sender_pattern?: string | null;
    subject_pattern?: string | null;
    match_pattern?: string | null;
    amount_regex?: string | null;
    merchant_regex?: string | null;
    date_regex?: string | null;
    date_format?: string | null;
    time_regex?: string | null;
    time_format?: string | null;
    currency_regex?: string | null;
    default_currency?: string | null;
    source_account_regex?: string | null;
    expense_type?: string | null;
  };
  failures: string[];
  warnings?: string[];
}

/**
 * Builds a concise targeted correction prompt with the exact failures detected
 * so the AI can fix the regex patterns and re-generate the JSON template.
 */
export function buildCorrectionPrompt(
  sender: string,
  subject: string,
  cleanBody: string,
  details: TemplateCorrectionDetails
): string {
  const sections: string[] = [];

  if (details.failures && details.failures.length > 0) {
    sections.push('ERRORES BLOQUEANTES QUE IMPIDEN QUE LA PLANTILLA COINCIDA:');
    sections.push(...details.failures.map((f) => `• ${f}`));
  }

  if (details.warnings && details.warnings.length > 0) {
    if (sections.length > 0) sections.push('');
    sections.push('AVISOS EN CAMPOS DE EXTRACCIÓN (Revisa los patrones o define null si no aparecen en el correo):');
    sections.push(...details.warnings.map((w) => `• ${w}`));
  }

  if (sections.length === 0) {
    sections.push('• Revisa la coincidencia exacta de los patrones de extracción sobre el texto real.');
  }

  return [
    'Corrige la siguiente plantilla JSON para extracción de notificaciones de correo.',
    'La plantilla fue evaluada contra el correo real y se obtuvieron los siguientes resultados:',
    '',
    ...sections,
    '',
    'PLANTILLA ACTUAL:',
    JSON.stringify(details.template, null, 2),
    '',
    'DATOS REALES DEL CORREO:',
    '--- REMITENTE RECIBIDO ---',
    sender || '(Sin remitente)',
    '',
    '--- ASUNTO RECIBIDO ---',
    subject || '(Sin asunto)',
    '',
    '--- CUERPO LIMPIO (DONDE DEBEN COINCIDIR LOS REGEX) ---',
    cleanBody || '(Sin cuerpo)',
    '--- FIN DEL CORREO ---',
    '',
    'INSTRUCCIONES DE CORRECCIÓN:',
    '1. Cada expresión regular de extracción debe coincidir con el texto exacto que aparece en CUERPO LIMPIO.',
    '2. En correos procesados, las etiquetas y valores pueden estar separados por espacios o saltos de línea, no siempre dos puntos (:). Usa `(?:\\s*:\\s*|\\s+)`.',
    '3. Cada regex de extracción DEBE tener exactamente UN grupo de captura (...) alrededor del valor limpio (ej: monto, hora, comercio).',
    '4. Si un dato (como hora, comercio o cuenta origen) NO existe en el texto de CUERPO LIMPIO, define su regex correspondiente como null.',
    '5. Si el correo sí incluye la hora (ej: 14:35 o 02:30 p.m.), asegúrate de que time_regex capture la hora limpia con paréntesis y time_format indique su formato.',
    '6. Responde ÚNICAMENTE con el objeto JSON completo y corregido, sin explicaciones ni markdown adicional.',
  ].join('\n');
}