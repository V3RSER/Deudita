/**
 * Exact email body cleaning function used across the expense detection pipeline.
 * Replicated verbatim to guarantee 100% fidelity with production processing.
 */
export function cleanEmailBody(body: string | null | undefined): string {
  if (!body) return '';
  let text = String(body);

  // Normalizar saltos de línea primero
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Normalizar correos en cabeceras envueltos con saltos de línea dentro de < y >:
  // Ej: "From: Alertas <\n  alertas@bancolombia.com>" -> "From: Alertas <alertas@bancolombia.com>"
  text = text.replace(/<\s*\n\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\s*>/gi, '<$1>');
  text = text.replace(/((?:^|\n)\s*(?:from|de|to|para|cc|reply-to)\s*:[^\n\r<]*?)\s*<\s*\n\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\s*>/gim, '$1 <$2>');

  // Proteger direcciones de correo dentro de <...> para que la limpieza de etiquetas HTML no las elimine.
  // En correos (From, To, etc.), las direcciones vienen entre < y > (RFC 5322).
  // Un replace(/<[^>]+>/g, '') ingenuo borraría todas las direcciones de correo.
  const emailTokens = new Map<string, string>();
  let tokenCounter = 0;
  text = text.replace(/<\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\s*>/gi, (_, email) => {
    const token = `__EMAIL_ADDR_TOKEN_${tokenCounter++}__`;
    emailTokens.set(token, `<${email.trim()}>`);
    return token;
  });

  // Si el texto contiene fragmentos o etiquetas HTML (p. ej. correos sin procesar o pegados directos),
  // los convertimos a texto plano respetando saltos de línea, idéntico a GmailMessage.getPlainBody() de Google Apps Script.
  if (/<[a-z!/][\s\S]*>/i.test(text)) {
    text = text
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '')
      .replace(/<br\s*[\/]?>/gi, '\n')
      .replace(/<\/(p|div|tr|h[1-6]|li|table|blockquote)>/gi, '\n')
      .replace(/<(td|th)[^>]*>/gi, ' ')
      .replace(/<https?:\/\/[^\s>]+>/g, '')    // <https://...> (links envueltos)
      .replace(/<[^>]+>/g, '')                 // Resto de etiquetas HTML (los correos ya están protegidos)
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)));
  }

  // Restaurar las direcciones de correo protegidas
  text = text.replace(/__EMAIL_ADDR_TOKEN_(\d+)__/g, (match) => {
    return emailTokens.get(match) || match;
  });

  // Exactas 6 reglas de cleanEmailBody de Google Apps Script:
  return text
    .replace(/\[image:[^\]]*\]/gi, '')       // [image: BBVA Logo]
    .replace(/<https?:\/\/[^\s>]+>/g, '')    // <https://...> (links envueltos)
    .replace(/https?:\/\/\S+/g, '')          // URLs sueltas
    .replace(/\*/g, '')                       // asteriscos de negrita
    .replace(/[ \t]+/g, ' ')                  // colapsa espacios/tabs, conserva \n
    .replace(/\n{3,}/g, '\n\n')               // colapsa líneas en blanco excesivas
    .trim();
}

/**
 * Strips common email forwarding and reply prefixes across multiple languages
 * (e.g., Fwd:, FW:, Re:, RV:, VS:, TR:, WG:, etc., including bracketed forms [Fwd:] and chained prefixes).
 */
export function stripSubjectPrefixes(subject: string | null | undefined): string {
  if (!subject) return '';
  let s = String(subject).trim();
  const prefixRegex = /^(?:\[?(?:fwd?|fw|re|rv|vs|tr|wg|aw|sv|res|enc|doorst)\]?\s*[:：\-]\s*)+/i;
  while (prefixRegex.test(s)) {
    s = s.replace(prefixRegex, '').trim();
  }
  return s;
}

/**
 * Detects if an email address belongs to a generic personal webmail provider
 * (Gmail, Outlook, Hotmail, Yahoo, iCloud, Proton, etc.).
 */
export function isPersonalEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const match = String(email).toLowerCase().match(/@([a-z0-9.-]+)/);
  if (!match) return false;
  const domain = match[1];
  const personalDomains = [
    'gmail.com', 'googlemail.com', 'hotmail.com', 'outlook.com',
    'live.com', 'msn.com', 'yahoo.com', 'yahoo.es', 'icloud.com', 'me.com',
    'proton.me', 'protonmail.com'
  ];
  return personalDomains.some((d) => domain === d || domain.endsWith('.' + d));
}

/**
 * Detects if an email was forwarded or arrived via an inbox rule.
 */
export function isForwardedEmail(
  sender: string | null | undefined,
  subject: string | null | undefined,
  body: string | null | undefined
): boolean {
  const s = (subject || '').trim();
  const b = (body || '').trim();
  if (/^(?:\[?(?:fwd?|fw|re|rv|vs|tr|wg|aw|sv|res|enc|doorst)\]?\s*[:：\-]\s*)+/i.test(s)) {
    return true;
  }
  if (/---+\s*(?:forwarded message|mensaje reenviado)\s*---+/i.test(b)) {
    return true;
  }
  const head = getHeadLines(b, 15);
  if (/^(?:de|from)\s*:/im.test(head) && /^(?:fecha|date|asunto|subject|para|to)\s*:/im.test(head)) {
    return true;
  }
  if (sender && isPersonalEmail(sender) && /^(?:de|from)\s*:/im.test(head)) {
    return true;
  }
  return false;
}

/**
 * Extracts the real institutional sender email.
 * If the email is forwarded, it MUST come from the original forwarded headers in the body,
 * NEVER from the outer envelope sender (which is just the user who forwarded the email).
 */
export function extractInstitutionalSenderEmail(
  sender: string | null | undefined,
  body: string | null | undefined,
  isForwarded: boolean
): string | null {
  // 1. Prioritize forwarded headers in the body
  const forwardedSender = extractForwardedSenderFromBody(body, 15);
  const forwardedEmail = extractEmailAddress(forwardedSender);
  if (forwardedEmail && !isPersonalEmail(forwardedEmail)) {
    return forwardedEmail;
  }

  // 2. Look for non-personal email address in the first 15 lines of the body
  const head = getHeadLines(body, 15);
  const bodyEmails = head.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g);
  if (bodyEmails && bodyEmails.length > 0) {
    for (const em of bodyEmails) {
      const lower = em.toLowerCase();
      if (!isPersonalEmail(lower)) {
        return lower;
      }
    }
  }

  // If forwarded, under NO circumstances use the outer sender as institutional!
  if (isForwarded) {
    return null;
  }

  // 3. Direct non-forwarded email: use sender if it's not a personal email
  const directEmail = extractEmailAddress(sender);
  if (directEmail && !isPersonalEmail(directEmail)) {
    return directEmail;
  }

  return null;
}

/**
 * Extracts the original sender from forwarded headers in the body (e.g., "De: Bancolombia <alertas@...>" or "From: ...").
 */
export function extractForwardedSenderFromBody(body: string | null | undefined, maxLines: number = 15): string | null {
  if (!body) return null;
  const head = getHeadLines(body, maxLines);

  // Match wrapped line where '<' is at end of line and email is on next line
  const wrappedMatch = head.match(/^(?:de|from)\s*:\s*([^\n\r<]*?)\s*<\s*\n\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})>?(?:\s*\n|$)/im);
  if (wrappedMatch) {
    const name = wrappedMatch[1].trim();
    const email = wrappedMatch[2].trim();
    return name ? `${name} <${email}>` : `<${email}>`;
  }

  const match = head.match(/^(?:de|from)\s*:\s*([^\n\r]+)/im);
  if (match && match[1]) {
    let senderStr = match[1].trim();
    // If sender ends with '<' without closing '>', check if next line has the email
    if (senderStr.includes('<') && !senderStr.includes('>')) {
      const rest = head.slice(match.index! + match[0].length);
      const nextLineEmail = rest.match(/^\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})>?/i);
      if (nextLineEmail) {
        senderStr = `${senderStr} ${nextLineEmail[1]}>`;
      }
    }
    return senderStr;
  }
  return null;
}

/**
 * Extracts a standard email address from arbitrary text (e.g. "Bancolombia <alertas@bancolombia.com>" -> "alertas@bancolombia.com").
 */
export function extractEmailAddress(text: string | null | undefined): string | null {
  if (!text) return null;
  const match = String(text).match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Escapes special regex characters in an email address so it can safely be used as an exact regex pattern.
 */
export function escapeRegexEmail(email: string): string {
  return email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Infers an entity_email_pattern from the email sender or forwarded headers in the body.
 * If the email is forwarded (e.g., from Outlook or personal rule), prefers the forwarded institutional sender.
 */
export function inferEntityEmailPattern(
  sender: string | null | undefined,
  body?: string | null | undefined
): string | null {
  const isFwd = isForwardedEmail(sender, null, body);
  const institutional = extractInstitutionalSenderEmail(sender, body, isFwd);
  if (institutional) {
    return escapeRegexEmail(institutional);
  }
  return null;
}

/**
 * Extracts the original subject from forwarded headers in the body (e.g., "Asunto: Alertas y Notificaciones" or "Subject: ...").
 */
export function extractForwardedSubjectFromBody(body: string | null | undefined, maxLines: number = 15): string | null {
  if (!body) return null;
  const head = getHeadLines(body, maxLines);
  const match = head.match(/^(?:asunto|subject)\s*:\s*([^\n\r]+)/im);
  if (match && match[1]) {
    return stripSubjectPrefixes(match[1].trim());
  }
  return null;
}

/**
 * Returns the first N non-trailing lines of the (cleaned) body. Used to look for
 * the real sender/entity when an email arrived forwarded by a rule (e.g. Outlook),
 * in which case getFrom()/sender points to the personal inbox instead of the
 * original sender, and the subject may have been rewritten too.
 */
export function getHeadLines(body: string | null | undefined, maxLines: number = 10): string {
  if (!body) return '';
  return String(body).split('\n').slice(0, maxLines).join('\n');
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
    entity_label: string | null;
    is_new_entity: boolean;
    entity_email_pattern: string | null;
    subject_pattern: string | null;
    match_pattern: string | null;
    amount_regex: string;
    merchant_regex: string | null;
    date_regex: string | null;
    date_format: string | null;
    time_regex: string | null;
    time_format: string | null;
    currency_regex: string | null;
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
export interface PromptEntity { id: string; name: string; patterns: string[]; }

export function findEntityByEmailPattern(
  sender: string,
  entities: PromptEntity[] = [],
  body?: string | null
): PromptEntity | null {
  const value = (sender || '').trim();
  const bodyHead = body ? getHeadLines(body, 15) : '';
  const forwardedSender = body ? extractForwardedSenderFromBody(body, 15) : null;

  for (const entity of entities) {
    for (const rawPattern of entity.patterns || []) {
      const pattern = sanitizeRegexPattern(rawPattern);
      if (!pattern || !pattern.includes('@')) continue;
      try {
        const regex = new RegExp(pattern, 'i');
        if (value && regex.test(value)) return entity;
        if (forwardedSender && regex.test(forwardedSender)) return entity;
        if (bodyHead && regex.test(bodyHead)) return entity;
      } catch {}
    }
  }
  return null;
}

export function buildTemplatePrompt(
  sender: string,
  subject: string,
  cleanBody: string,
  existingEntities: PromptEntity[] = []
): string {
  const isFwd = isForwardedEmail(sender, subject, cleanBody);
  const forwardedSender = extractForwardedSenderFromBody(cleanBody, 15);
  const strippedSubject = stripSubjectPrefixes(subject);
  const forwardedSubject = extractForwardedSubjectFromBody(cleanBody, 15);
  const effectiveSubject = forwardedSubject || (strippedSubject !== subject ? strippedSubject : subject);

  // Probar primero si el correo ya es reconocido por los patrones de una entidad existente
  const matchedExistingEntity = findEntityByEmailPattern(sender, existingEntities, cleanBody);

  // Remitente institucional original (si fue reenviado, NUNCA usar la cuenta personal externa)
  const detectedInstitutionalEmail = extractInstitutionalSenderEmail(sender, cleanBody, isFwd);

  let entityInstructions = '';
  if (matchedExistingEntity) {
    entityInstructions = [
      'ENTIDAD PREVIAMENTE RECONOCIDA POR EL SISTEMA:',
      `El correo coincide con la entidad registrada "${matchedExistingEntity.name}".`,
      `- entity_label: "${matchedExistingEntity.name}"`,
      `- is_new_entity: false`,
      `- entity_email_pattern: null (los patrones registrados de "${matchedExistingEntity.name}" ya reconocen este correo).`,
    ].join('\n');
  } else {
    // Si no coincide con ninguna por patrón, enviamos ÚNICAMENTE los nombres de las entidades
    // (sin IDs ni patrones regex) para que el modelo razone si corresponde a alguna de ellas.
    const entityNames = existingEntities.map((e) => e.name).filter(Boolean);
    const namesList = entityNames.length > 0
      ? `ENTIDADES REGISTRADAS EN EL SISTEMA:\n${entityNames.map((n) => `  • "${n}"`).join('\n')}`
      : 'Aún no hay entidades registradas en el sistema.';

    entityInstructions = [
      namesList,
      '',
      'INSTRUCCIÓN PARA ENTIDAD (entity_label / is_new_entity / entity_email_pattern):',
      '1. Analiza el correo y razona si la notificación corresponde a alguna de las entidades registradas arriba (por ejemplo normalizando el nombre a una de ellas).',
      '2. Si corresponde a una entidad de la lista:',
      '   - entity_label: usa exactamente ese nombre registrado.',
      '   - is_new_entity: false.',
      '3. Si es una entidad completamente nueva que no está en la lista:',
      '   - entity_label: define el nombre comercial corto de la entidad emisora (ej: "Nu", "Bancolombia", "Daviplata", "RappiCard").',
      '   - is_new_entity: true.',
      '4. Reglas para entity_email_pattern:',
      detectedInstitutionalEmail
        ? `   - Dirección institucional detectada en el correo: "${detectedInstitutionalEmail}". Devuélvela exactamente en entity_email_pattern para registrarla en la base de datos.`
        : '   - Si detectas una dirección de correo institucional del emisor en el encabezado original De:/From: o cuerpo, colócala en entity_email_pattern. De lo contrario usa null.',
      '   - Si el correo fue reenviado (por ejemplo por una cuenta personal de Gmail), NUNCA uses la dirección de quien lo reenvió como entity_email_pattern.',
    ].join('\n');
  }

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
    'NIVEL 1 — ENTIDAD Y REMITENTE INSTITUCIONAL (entity_email_pattern):',
    'Identifica como entity_label la marca o entidad que emite directamente la notificación, priorizando el campo "De:", el remitente original, el asunto y el contenido principal.',
    'No infieras la entidad a partir de relaciones corporativas, bancos asociados, propietarios, emisores legales, procesadores ni menciones en pies de página, términos legales o frases como "Producto de...".',
    'Ejemplo: si el correo dice De: RappiCard y al final dice Producto de Davivienda S.A., la entidad es "RappiCard", no Davivienda ni DAVIbank.',
    'La lista de entidades registradas solo sirve para normalizar el nombre cuando la entidad emisora identificada directamente sea inequívocamente equivalente a una entidad registrada. No uses relaciones corporativas para determinar equivalencia.',
    'is_new_entity debe ser true únicamente si la entidad emisora identificada no corresponde a ninguna entidad registrada.',
    'REGLA PARA entity_email_pattern:',
    '- Debe ser la dirección de correo institucional real extraída textualmente del remitente recibido o de la cabecera original "De:" / "From:" en el cuerpo si el correo fue reenviado.',
    '- NUNCA inventes nombres de dominios, comodines ni coloques palabras sueltas.',
    '- Si la entidad ya cuenta con un patrón registrado en su lista que coincida con esa dirección, devuelve entity_email_pattern=null.',
    '- Si la dirección real no está en la lista de patrones de la entidad, devuélvela exactamente en entity_email_pattern para que el sistema la registre en la base de datos.',
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
    entityInstructions,
    '',
    'REGLAS PARA LOS REGEX:',
    '1. Todos deben ser JavaScript válidos y compilar con new RegExp(regex, "i").',
    '1A. entity_email_pattern: Si aplica registrar un nuevo remitente institucional, debe ser la dirección de correo institucional real del emisor (ej: alertas@bancolombia.com.co). Si ya está cubierto o no aplica, usa null. Si el correo fue reenviado, NUNCA uses el correo de quien lo reenvió.',
    '2. No uses delimitadores /.../ ni flags dentro del valor.',
    '3. Usa sintaxis estándar de JavaScript; para grupos no capturantes usa (?:...).',
    '4. Cada regex de extracción debe tener exactamente UN grupo de captura (...) alrededor del valor a extraer. Si usas alternaciones como (val1)|(val2), asegúrate de que capture el valor.',
    '5. amount_regex es OBLIGATORIO y debe capturar únicamente el importe numérico (ej: "50.000,00" o "120500"), sin el signo de moneda ni etiquetas.',
    '6. merchant_regex: captura el comercio, tienda, destinatario o beneficiario de la operación cuando esté presente. En transferencias, si no existe nombre de beneficiario pero sí una cuenta destino explícita, debe capturarse esa cuenta destino. Si no existe ningún comercio, destinatario ni beneficiario identificable, merchant_regex debe ser null.',
    '7. date_regex debe capturar únicamente la fecha y date_format debe indicar exactamente su formato (ej: DD/MM/YYYY, YYYY-MM-DD, etc.).',
    '7A. time_regex: Si el correo tiene hora de transacción (ej: "14:35", "02:35 p. m.", "Hora: 14:35:00", "a las 14:35"), usa un patrón tolerante a formato 12h/24h con segundos opcionales, capturando el valor exacto de la hora: ejemplo `(?:hora|hora\\s+transacción)?:?\\s*([0-2]?[0-9]:[0-5][0-9](?::[0-5][0-9])?(?:\\s*[ap]\\.?\\s*m\\.?)?)`. time_format debe coincidir con los tokens de fecha/hora (ej: "HH:mm", "HH:mm:ss", "hh:mm a", "hh:mm a.m."). Si la hora NO aparece en el correo, devuelve time_regex=null y time_format=null.',
    '7B. currency_regex: Si el correo indica dinámicamente la moneda (ej: "COP", "USD", "$"), usa un regex con captura. Si no aparece una moneda explícita, deja currency_regex=null.',
    '8. CRÍTICO PARA EXTRACCIÓN: Las expresiones regulares DEBEN coincidir contra el texto en CUERPO LIMPIO. Ten en cuenta que tras la limpieza de correos y tablas HTML, entre etiquetas y sus valores suele haber espacios o saltos de línea, NO siempre dos puntos ":". Usa separadores flexibles como `(?:\\s*:\\s*|\\s+)`.',
    '9. Si un campo opcional (como hora, cuenta de origen, comercio) NO aparece en el texto del correo, devuelve null. NUNCA inventes un regex para un campo que no está en el correo.',
    '',
    'VALORES SEMÁNTICOS DEL RESULTADO:',
    '13. expense_type debe describir la naturaleza de la operación según el vocabulario del sistema: "compra", "transferencia", "retiro", "pago", etc.',
    '14. entity_label debe usar exactamente el nombre de una entidad equivalente si ya existe en la lista registrada.',
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
    'name, entity_label, is_new_entity, entity_email_pattern, subject_pattern,',
    'match_pattern, amount_regex, merchant_regex, date_regex, date_format, time_regex, time_format,',
    'currency_regex, source_account_regex, expense_type.',
    '',
    'Cada propiedad debe contener el valor determinado por el análisis del correo y las reglas anteriores.',
    'NO copies valores de esta instrucción como si fueran datos del correo.',
    'NO inventes valores para completar propiedades.',
    'Usa null únicamente cuando corresponda según las reglas.',
    'No cambies los nombres de las propiedades ni inventes nuevas propiedades.',
    'No uses valores en inglés cuando el vocabulario indicado por estas instrucciones define otro valor.',
    '',
    'DATOS DEL CORREO A ANALIZAR:',
    '--- REMITENTE EXTERNO RECIBIDO ---',
    sender || '(Sin remitente)',
    ...(isFwd ? [`[AVISO: Mensaje reenviado. El remitente externo "${sender}" corresponde a quien reenvió el correo, NO al emisor original.]`] : []),
    ...(forwardedSender ? [`[REMITENTE ORIGINAL EN EL CUERPO: "${forwardedSender}"]`] : []),
    ...(detectedInstitutionalEmail ? [`[DIRECCIÓN INSTITUCIONAL ORIGINAL: "${detectedInstitutionalEmail}"]`] : []),
    '',
    '--- ASUNTO RECIBIDO ---',
    subject || '(Sin asunto)',
    ...(effectiveSubject !== subject ? [`[NOTA IMPORTANTE: El asunto contiene prefijos de reenvío/respuesta. El asunto original normalizado es: "${effectiveSubject}"]`] : []),
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
    parsed.name = `${parsed.entity_label || 'Banco'} - Plantilla`;
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

  if (parsed.time_regex && !parsed.time_format) validationErrors.push('Si existe time_regex, time_format es obligatorio.');

  const entityPattern = sanitizeRegexPattern(parsed.entity_email_pattern);
  if (entityPattern) {
    if (!entityPattern.includes('@')) validationErrors.push('El entity_email_pattern debe contener @ y representar un correo/dominio institucional.');
    else { try { new RegExp(entityPattern, 'i'); } catch { validationErrors.push('El entity_email_pattern no es un regex válido.'); } }
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
      entity_label: parsed.entity_label ? String(parsed.entity_label).trim() : null,
      is_new_entity: Boolean(parsed.is_new_entity),
      entity_email_pattern: sanitizeRegexPattern(parsed.entity_email_pattern),
      subject_pattern: sanitizeRegexPattern(parsed.subject_pattern),
      match_pattern: sanitizeRegexPattern(parsed.match_pattern),
      amount_regex: sanitizeRegexPattern(parsed.amount_regex) || String(parsed.amount_regex).trim(),
      merchant_regex: sanitizeRegexPattern(parsed.merchant_regex),
      date_regex: sanitizeRegexPattern(parsed.date_regex),
      date_format: parsed.date_format ? String(parsed.date_format).trim() : 'DD/MM/YYYY',
      time_regex: sanitizeRegexPattern(parsed.time_regex),
      time_format: parsed.time_format ? String(parsed.time_format).trim() : null,
      currency_regex: sanitizeRegexPattern(parsed.currency_regex),
      source_account_regex: sanitizeRegexPattern(parsed.source_account_regex),
      expense_type: parsed.expense_type ? String(parsed.expense_type).toLowerCase().trim() : null,
    },
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

export interface TemplateCorrectionDetails {
  template: {
    name?: string | null;
    entity_label?: string | null;
    entity_email_pattern?: string | null;
    subject_pattern?: string | null;
    match_pattern?: string | null;
    amount_regex?: string | null;
    merchant_regex?: string | null;
    date_regex?: string | null;
    date_format?: string | null;
    time_regex?: string | null;
    time_format?: string | null;
    currency_regex?: string | null;
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

  const isFwd = isForwardedEmail(sender, subject, cleanBody);
  const forwardedSender = extractForwardedSenderFromBody(cleanBody, 15);
  const detectedInstitutionalEmail = extractInstitutionalSenderEmail(sender, cleanBody, isFwd);

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
    '--- REMITENTE EXTERNO RECIBIDO ---',
    sender || '(Sin remitente)',
    ...(isFwd ? [`[AVISO: Mensaje reenviado. El remitente externo "${sender}" corresponde a quien reenvió el correo, NO al emisor original.]`] : []),
    ...(forwardedSender ? [`[REMITENTE ORIGINAL EN EL CUERPO: "${forwardedSender}"]`] : []),
    ...(detectedInstitutionalEmail ? [`[DIRECCIÓN INSTITUCIONAL ORIGINAL: "${detectedInstitutionalEmail}"]`] : []),
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
    '6. Si el Nivel 1 (Entidad) falla porque el remitente no coincide con ningún patrón de la entidad, extrae la dirección de correo institucional real del remitente (o del encabezado De:/From: del cuerpo si fue reenviado) y devuélvela en entity_email_pattern para su registro. NUNCA uses la dirección personal de quien reenvió el correo.',
    '7. Responde ÚNICAMENTE con el objeto JSON completo y corregido, sin explicaciones ni markdown adicional.',
  ].join('\n');
}