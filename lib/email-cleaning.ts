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
    'Analizar el correo real proporcionado y generar la configuración completa para',
    'insertar una nueva plantilla en la base de datos, definiendo expresiones regulares',
    'robustas y gestionando las relaciones con entidades bancarias y tipos de gasto.',
    '',
    'ARQUITECTURA DE COINCIDENCIA DEL SISTEMA (3 NIVELES):',
    '  NIVEL 1: Entidad emisora (entity_email_patterns).',
    '           Filtra por el remitente o dominio del banco (ej. @bancolombia.com.co).',
    '           Si la entidad es NUEVA (no está en la lista), se debe crear la entidad',
    '           y registrar su patrón de correo en entity_email_patterns.',
    '  NIVEL 2: Asunto del correo (subject_pattern).',
    '           Filtra qué tipo de notificación es (ej. transferencias, compras).',
    '  NIVEL 3: Desempate en cuerpo (match_pattern).',
    '           SOLO si existen varias plantillas para la misma entidad con el mismo',
    '           asunto (ej. "tarjeta de crédito" vs "cuenta de ahorros").',
    '',
    entityListText,
    'REGLAS PARA EXPRESIONES REGULARES:',
    '1. Todos los regex deben ser de JavaScript válidos (evaluados con flag "i").',
    '2. Los campos de extracción (amount_regex, merchant_regex, date_regex, time_regex,',
    '   currency_regex, source_account_regex) DEBEN incluir exactamente UN grupo de captura (...)',
    '   alrededor del valor limpio que se desea extraer.',
    '3. amount_regex es ESTRICTAMENTE OBLIGATORIO. Debe capturar los dígitos y separadores del monto.',
    '4. merchant_regex debe capturar el nombre del comercio, tienda o persona destinataria.',
    '5. date_regex debe capturar la fecha. date_format debe indicar el formato (ej. DD/MM/YYYY).',
    '6. expense_type debe ser uno de: "compra", "transferencia", "pago", "transporte" (o null).',
    '',
    'CORREO REAL A ANALIZAR (cuerpo ya limpio de HTML y URLs):',
    '--- REMITENTE ---',
    sender || '(Sin remitente)',
    '',
    '--- ASUNTO ---',
    subject || '(Sin asunto)',
    '',
    '--- CUERPO LIMPIO ---',
    cleanBody || '(Sin cuerpo)',
    '--- FIN DEL CUERPO ---',
    '',
    'RESPONDE EXCLUSIVAMENTE CON UN OBJETO JSON VÁLIDO (sin bloques de código markdown, sin explicaciones antes o después), con la siguiente estructura:',
    '{',
    '  "name": "Nombre descriptivo (ej: Bancolombia - Transferencia a terceros)",',
    '  "entity_name": "Nombre oficial de la entidad (ej: Bancolombia)",',
    '  "is_new_entity": false,',
    '  "entity_email_pattern": null,',
    '  "sender_pattern": null,',
    '  "subject_pattern": "Regex para el asunto del correo",',
    '  "match_pattern": null,',
    '  "amount_regex": "Regex con grupo (...) para el monto numérico",',
    '  "merchant_regex": "Regex con grupo (...) para el comercio o destinatario",',
    '  "date_regex": "Regex con grupo (...) para la fecha",',
    '  "date_format": "DD/MM/YYYY",',
    '  "time_regex": null,',
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

  for (const { key, label, reqGroup } of regexFields) {
    const pattern = parsed[key];
    if (pattern && typeof pattern === 'string' && pattern.trim()) {
      try {
        new RegExp(pattern, 'i');
        if (reqGroup && !/\([^?].*?\)/.test(pattern)) {
          warnings.push(`El patrón de "${label}" (${pattern}) parece no contener un grupo de captura (...).`);
        }
      } catch (regexErr: unknown) {
        warnings.push(`El patrón de "${label}" (${pattern}) contiene una expresión regular con errores de sintaxis.`);
      }
    }
  }

  return {
    success: true,
    data: {
      name: String(parsed.name).trim(),
      entity_name: parsed.entity_name ? String(parsed.entity_name).trim() : null,
      is_new_entity: Boolean(parsed.is_new_entity),
      entity_email_pattern: parsed.entity_email_pattern ? String(parsed.entity_email_pattern).trim() : null,
      sender_pattern: parsed.sender_pattern ? String(parsed.sender_pattern).trim() : null,
      subject_pattern: parsed.subject_pattern ? String(parsed.subject_pattern).trim() : null,
      match_pattern: parsed.match_pattern ? String(parsed.match_pattern).trim() : null,
      amount_regex: String(parsed.amount_regex).trim(),
      merchant_regex: parsed.merchant_regex ? String(parsed.merchant_regex).trim() : null,
      date_regex: parsed.date_regex ? String(parsed.date_regex).trim() : null,
      date_format: parsed.date_format ? String(parsed.date_format).trim() : 'DD/MM/YYYY',
      time_regex: parsed.time_regex ? String(parsed.time_regex).trim() : null,
      currency_regex: parsed.currency_regex ? String(parsed.currency_regex).trim() : null,
      default_currency: parsed.default_currency ? String(parsed.default_currency).trim() : 'COP',
      source_account_regex: parsed.source_account_regex ? String(parsed.source_account_regex).trim() : null,
      expense_type: parsed.expense_type ? String(parsed.expense_type).toLowerCase().trim() : null,
    },
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

