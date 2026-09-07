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
    '',
    'NIVEL 2 — ASUNTO Y NOMBRE DE LA PLANTILLA:',
    'Analiza el asunto para determinar la clase de notificación.',
    'Separa conceptualmente la identidad semántica estable de la notificación de cualquier información',
    'incidental, variable o introducida por el transporte, cliente o hilo de correo.',
    '',
    'El subject_pattern debe representar ÚNICAMENTE la identidad semántica estable de la clase de notificación',
    'y ser reutilizable para otros correos de esa misma clase.',
    '',
    'Antes de incluir cualquier segmento del asunto en subject_pattern, determina si ese segmento describe',
    'qué TIPO DE NOTIFICACIÓN es o si solamente describe una instancia concreta, una modificación del correo',
    'o un metadato accidental.',
    '',
    'Si un segmento puede cambiar, aparecer o desaparecer sin cambiar la clase de notificación, DEBE abstraerse',
    'y NO formar parte del subject_pattern.',
    'Esto incluye, entre otros, fechas, horas, importes, nombres, personas, comercios, destinatarios, referencias,',
    'códigos, consecutivos, números, identificadores y prefijos de respuesta o reenvío como "Re:", "RE:", "Fwd:",',
    '"FW:", "RV:" y equivalentes.',
    '',
    'Los prefijos o modificaciones introducidos por reenvíos, respuestas, clientes de correo o hilos NO forman parte',
    'del tipo de notificación, salvo que exista evidencia clara de que constituyen una parte intrínseca y estable',
    'del asunto original de esa clase.',
    '',
    'PRUEBA CONTRAFÁCTICA OBLIGATORIA PARA EL ASUNTO:',
    'Para cada elemento que pretendas conservar en subject_pattern, evalúa mentalmente:',
    '"Si este elemento cambiara o desapareciera, ¿seguiría siendo la misma clase de notificación?".',
    'Si la respuesta es sí, abstrae ese elemento.',
    'Si la respuesta es no porque ese elemento define otra clase de notificación, consérvalo.',
    '',
    'No determines estabilidad por el simple hecho de que un valor aparezca en esta muestra.',
    'Un elemento observado una sola vez no se convierte en estructural por aparecer literalmente en el asunto.',
    'Debes distinguir entre la ESTRUCTURA que identifica la notificación y los VALORES que describen una instancia.',
    '',
    'Ejemplo conceptual únicamente:',
    'si un asunto tiene la forma "TIPO DE NOTIFICACIÓN - <valor variable>", el valor variable debe abstraerse.',
    'No memorices el valor concreto observado.',
    '',
    'No dependas de una lista predeterminada de ejemplos; aplica este criterio semánticamente al correo recibido.',
    'No hagas opcional ni elimines una característica que realmente diferencie esta clase de otra.',
    'No conviertas información incidental o variable en parte obligatoria del patrón.',
    '',
    'El campo name NO debe describir el contenido concreto del correo ni mencionar datos de una instancia.',
    'El nombre debe ser corto, descriptivo y seguir principalmente esta idea: ENTIDAD + TIPO DE NOTIFICACIÓN',
    '(derivado del asunto y, solo cuando sea necesario, de la naturaleza de la operación).',
    'Usa el concepto normal de la notificación, no una frase extraída literalmente del cuerpo.',
    'El nombre debe permitir reconocer la plantilla en un catálogo sin abrir el correo.',
    '',
    'NIVEL 3 — DESEMPATE:',
    'Usa match_pattern SOLO cuando varias plantillas de la misma entidad puedan compartir el mismo subject_pattern',
    'y exista una diferencia semántica o estructural estable que realmente permita distinguirlas.',
    'La característica usada como desempate debe seguir siendo válida cuando cambien todos los valores concretos',
    'de las transacciones y cuando cambien los datos accidentales de la instancia.',
    'No uses datos de una instancia, valores concretos, personas, comercios, importes, fechas, horas,',
    'números de tarjeta o cuenta, códigos, referencias, prefijos de reenvío, prefijos de respuesta ni frases',
    'accidentales de la muestra.',
    'Si no existe una diferencia estable que requiera desempate, devuelve match_pattern=null.',
    'Nunca inventes un desempate para rellenar el campo.',
    '',
    'REGLA FUNDAMENTAL:',
    'Distingue siempre entre VARIACIÓN DE INSTANCIA y DIFERENCIA DE TIPO.',
    'Una variación de instancia es cualquier información que puede cambiar entre dos correos sin cambiar',
    'la clase de notificación. Esa variación debe abstraerse en los patrones.',
    'Una diferencia de tipo es cualquier característica cuya presencia, ausencia o estructura haga que el correo',
    'pertenezca a otra clase de notificación. Esa diferencia debe conservarse.',
    '',
    'IMPORTANTE:',
    'No confundas cambios introducidos por el cliente o transporte del correo con diferencias de tipo.',
    'El mismo correo puede llegar reenviado, respondido o dentro de un hilo, y eso no implica una nueva clase',
    'de notificación.',
    'Por tanto, analiza la notificación original representada por el contenido y no memorices modificaciones',
    'accidentales de la cadena recibida.',
    '',
    'Haz esta clasificación por análisis semántico y estructural del correo, no aplicando mecánicamente ejemplos prefijados.',
    '',
    entityListText,
    'REGLAS PARA LOS REGEX:',
    '1. Todos deben ser JavaScript válidos y compilar con new RegExp(regex, "i").',
    '1A. entity_email_pattern debe identificar la entidad de forma estable; debe funcionar como patrón persistido de entity_email_patterns.',
    '2. No uses delimitadores /.../ ni flags dentro del valor.',
    '3. Usa sintaxis estándar de JavaScript; para grupos no capturantes usa (?:...).',
    '4. Los regex de extracción deben tener exactamente UN grupo de captura (...) alrededor del valor extraído.',
    '5. amount_regex es obligatorio.',
    '6. merchant_regex debe capturar comercio, tienda o destinatario cuando esté presente.',
    '7. date_regex debe capturar la fecha y date_format debe indicar su formato.',
    '7A. time_regex debe capturar la hora y time_format debe indicar su formato.',
    '8. time_regex, currency_regex y source_account_regex deben ser null si el correo no proporciona ese dato.',
    '9. entity_email_pattern y sender_pattern deben representar señales de identidad institucional, no datos transaccionales.',
    '10. Los patrones deben generalizar variaciones de instancia sin borrar diferencias que definan otra plantilla.',
    '11. No uses información del asunto recibida como resultado de reenvío, respuesta o hilo como señal de identidad',
    '    salvo que esa información sea parte intrínseca y estable de la notificación original.',
    '',
    'ANTES DE CONSTRUIR EL JSON, RAZONA INTERNAMENTE:',
    'A) Cuál es la identidad habitual y corta de la entidad.',
    'B) Qué clase de notificación representa la notificación original.',
    'C) Qué elementos del asunto son estructurales y cuáles son variables, incidentales o introducidos por el correo.',
    'D) Qué nombre corto de catálogo describe mejor ENTIDAD + TIPO DE NOTIFICACIÓN.',
    'E) Si existe ambigüedad real que requiera match_pattern.',
    'F) Qué datos concretos de esta muestra nunca deberían convertirse en identificadores de la plantilla.',
    'G) Qué partes del asunto desaparecerían o cambiarían al recibir la misma notificación en otra instancia,',
    '   por reenvío, respuesta, fecha diferente, hora diferente u otros cambios accidentales.',
    'No escribas este razonamiento en la respuesta final; úsalo únicamente para construir el JSON.',
    '',
    'CORREO REAL A ANALIZAR:',
    '--- REMITENTE RECIBIDO POR EL SISTEMA ---',
    sender || '(Sin remitente)',
    '',
    '--- ASUNTO RECIBIDO POR EL SISTEMA ---',
    subject || '(Sin asunto)',
    '',
    '--- CUERPO LIMPIO ---',
    cleanBody || '(Sin cuerpo)',
    '--- FIN DEL CUERPO ---',
    '',
    'RESPONDE EXCLUSIVAMENTE CON UN OBJETO JSON VÁLIDO, SIN MARKDOWN NI EXPLICACIONES:',
    '{',
    '  "name": "Entidad + tipo de notificación",',
    '  "entity_name": "Nombre comercial corto y habitual de la entidad",',
    '  "is_new_entity": false,',
    '  "entity_email_pattern": null,',
    '  "sender_pattern": null,',
    '  "subject_pattern": "Regex que identifique el tipo de notificación",',
    '  "match_pattern": null,',
    '  "amount_regex": "Regex con grupo (...) para el monto",',
    '  "merchant_regex": "Regex con grupo (...) para el comercio o destinatario",',
    '  "date_regex": "Regex con grupo (...) para la fecha",',
    '  "date_format": "DD/MM/YYYY",',
    '  "time_regex": null,',
    '  "time_format": null,',
    '  "currency_regex": null,',
    '  "default_currency": "COP",',
    '  "source_account_regex": "Regex con grupo (...) para los últimos 4 dígitos",',
    '  "expense_type": "compra"',
    '}',
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