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
      } catch { }
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
  const effectiveSubject =
    forwardedSubject || (strippedSubject !== subject ? strippedSubject : subject);

  const matchedExistingEntity = findEntityByEmailPattern(sender, existingEntities, cleanBody);
  const detectedInstitutionalEmail = extractInstitutionalSenderEmail(sender, cleanBody, isFwd);

  let entityInstructions = '';

  if (matchedExistingEntity) {
    const existingPatterns = matchedExistingEntity.patterns?.filter(Boolean) ?? [];

    entityInstructions = [
      'ENTIDAD RESUELTA DETERMINÍSTICAMENTE POR EL SISTEMA:',
      `entity_label="${matchedExistingEntity.name}"`,
      'is_new_entity=false',
      'BLOQUEO DE ENTIDAD: esta entidad fue determinada por una coincidencia de patrón existente en el remitente, remitente reenviado o cuerpo.',
      'No identifiques, infieras, reevalues, corrijas ni sustituyas la entidad.',
      'No compares esta entidad con otras entidades registradas para decidir cuál corresponde.',
      'La respuesta debe conservar exactamente entity_label e is_new_entity indicados arriba.',
      'entity_email_pattern NO debe crearse ni modificarse para esta entidad. Si ya existe un patrón coincidente, devuelve entity_email_pattern=null.',
      ...(existingPatterns.length
        ? [
          '',
          'PATRONES EXISTENTES DE ESTA ENTIDAD (SOLO COMO CONTEXTO PARA EL DESEMPATE):',
          ...existingPatterns.map((pattern, i) => `${i + 1}. ${pattern}`),
          'Estos patrones ya resuelven el NIVEL 1 (Entidad). No los conviertas en un nuevo match_pattern ni generes un patrón de entidad redundante.',
        ]
        : []),
    ].join('\n');
  } else {
    const entityNames = existingEntities.map((e) => e.name).filter(Boolean);
    const namesList = entityNames.length
      ? `ENTIDADES REGISTRADAS:\n${entityNames.map((n) => `- "${n}"`).join('\n')}`
      : 'No hay entidades registradas.';

    entityInstructions = [
      namesList,
      '',
      'IDENTIFICACIÓN DE ENTIDAD:',
      'Identifica la marca o entidad que emite directamente la notificación.',
      'Si corresponde inequívocamente a una entidad registrada, usa exactamente ese nombre y marca is_new_entity=false.',
      'Si no corresponde a ninguna, define un nombre comercial corto y marca is_new_entity=true.',
      '',
      'entity_email_pattern:',
      'Genera un patrón reutilizable para reconocer futuros correos de la entidad.',
      'Derívalo del correo institucional real de la notificación e incluye siempre "@".',
      'Conserva la parte estable desde "@"; normalmente el resultado es "@dominio".',
      'No incluyas el usuario local concreto salvo que forme parte estable del identificador.',
      'No devuelvas la dirección completa de una instancia cuando el usuario local pueda variar.',
      'No inventes dominios, comodines ni texto ausente.',
      'Usa null únicamente si no existe información suficiente para construir un patrón fiable.',
    ].join('\n');
  }

  const relevantExistingPatterns = matchedExistingEntity?.patterns?.filter(Boolean) ?? [];

  return [
    'Eres un asistente especializado en diseñar plantillas de extracción para un sistema de finanzas personales que procesa notificaciones bancarias y de billeteras digitales de Colombia y Latinoamérica.',
    '',
    'OBJETIVO:',
    'Analiza el correo y genera una plantilla reutilizable para reconocer futuros correos de la misma clase y extraer sus datos transaccionales.',
    'La plantilla representa una entidad y un tipo de notificación, no una instancia concreta.',
    '',
    'FUENTE DE INFORMACIÓN:',
    'Usa siempre la información perteneciente a la notificación original.',
    'Si el correo fue reenviado, busca entidad, asunto, fecha, hora y demás datos de la transacción dentro del contenido de la notificación original incluido en el cuerpo.',
    'Ignora fechas, horas, remitentes y demás metadatos añadidos por el sistema de correo durante el reenvío.',
    'Si no hay reenvío, usa el remitente, asunto y contenido del correo recibido.',
    '',
    '1. ENTIDAD:',
    'entity_label identifica la marca o entidad que emite directamente la notificación.',
    'Prioriza la identidad explícita del emisor sobre relaciones corporativas, bancos asociados, propietarios, emisores legales, procesadores o menciones secundarias.',
    'La lista de entidades registradas solo sirve para normalizar la entidad emisora cuando exista equivalencia inequívoca.',
    'is_new_entity=true únicamente cuando la entidad emisora no corresponda a una entidad registrada.',
    '',
    entityInstructions,
    '',
    '2. ASUNTO Y CLASE DE NOTIFICACIÓN:',
    'subject_pattern debe representar únicamente las características semánticas y estructurales estables que identifican la clase de notificación.',
    'DIFERENCIA DE TIPO: si cambia o desaparece, puede ser otra clase de notificación; se conserva.',
    'VARIACIÓN DE INSTANCIA: puede cambiar sin cambiar la clase; se abstrae.',
    'Para cada segmento, evalúa: "Si cambiara o desapareciera, ¿seguiría siendo la misma clase de notificación?". Si sí, abstraelo; si no, consérvalo.',
    'Abstrae datos concretos o accidentales como fechas, horas, importes, nombres, personas, comercios, referencias, códigos, identificadores y prefijos Re:, RE:, Fwd:, FW:, RV: o equivalentes.',
    'Conserva un prefijo de respuesta/reenvío solo si pertenece al asunto original de forma estable.',
    'No conviertas un elemento en estructural solo por aparecer literalmente en la muestra.',
    '',
    '3. NOMBRE:',
    'name debe ser corto y descriptivo, basado principalmente en ENTIDAD + TIPO DE NOTIFICACIÓN.',
    'No debe contener valores concretos ni depender de la redacción accidental de una muestra.',
    '',
    '4. MATCH_PATTERN:',
    'match_pattern es obligatorio.',
    'Debe ser una expresión regular JavaScript válida que actúe como discriminante estable del tipo de notificación dentro de la entidad.',
    'Debe identificar el rasgo semántico o estructural más pequeño que distingue esta clase de notificación dentro de la entidad.',
    'Usa como referencia los patrones existentes proporcionados para la entidad cuando estén disponibles y busca una diferencia estable respecto de ellos.',
    'No copies un patrón existente ni intentes describir todo el contenido del correo. El patrón debe expresar la señal distintiva, no una transcripción de la muestra.',
    'Los valores dinámicos no son estables y no deben fijarse literalmente en el regex. Sin embargo, su carácter dinámico no invalida el texto o la estructura que los introduce: puede ser precisamente esa estructura estable la que distingue el tipo de notificación.',
    'Trata los valores dinámicos como desconocidos y potencialmente arbitrarios: no supongas su longitud, formato, caracteres permitidos ni contenido. Cuando sea necesario para expresar la estructura distintiva, deja que el regex tolere cualquier contenido dinámico entre elementos estables.',
    'Prioriza etiquetas, términos funcionales, relaciones semánticas y estructuras que indiquen qué operación ocurrió. Elimina nombres, importes, fechas, horas, cuentas, identificadores y demás valores concretos como valores del patrón, pero conserva las palabras o estructuras estables que los contextualizan.',
    'Prefiere el patrón mínimo que distingue correctamente la plantilla. No añadas texto estable solo para hacer el patrón más descriptivo si no aporta capacidad de discriminación.',
    'El patrón debe seguir coincidiendo con futuras instancias de la misma clase aunque cambien completamente los valores dinámicos y aunque esos valores contengan caracteres arbitrarios.',
    'No uses contenido incidental, texto de cortesía ni detalles exclusivos de esta muestra.',
    'No uses null.',
    '',
    ...(relevantExistingPatterns.length
      ? [
        'PATRONES EXISTENTES PARA COMPARACIÓN:',
        ...relevantExistingPatterns.map((pattern, i) => `${i + 1}. ${pattern}`),
        'Estos patrones sirven para identificar diferencias existentes entre tipos de notificación de la misma entidad. No los copies literalmente si contienen partes dinámicas.',
        '',
      ]
      : []),
    'VALIDACIÓN DE MATCH_PATTERN:',
    'Valida que el valor generado compile con new RegExp(match_pattern, "i").',
    'Valida que coincida con el CUERPO LIMPIO de esta muestra.',
    'Valida que siga coincidiendo si los valores dinámicos cambian por completo y pueden contener cualquier carácter o formato válido para ese campo.',
    'Valida que el patrón dependa del rasgo distintivo del tipo de notificación y no de una instancia concreta ni de una frase completa de la muestra.',
    'Si existe una señal estable suficiente para distinguir la clase por sí sola, no la acompañes con valores dinámicos ni con texto adicional innecesario.',
    '',
    'REGLA CENTRAL:',
    'Clasifica cada característica como DIFERENCIA DE TIPO o VARIACIÓN DE INSTANCIA.',
    'Conserva las diferencias de tipo y abstrae las variaciones de instancia.',
    'Hazlo por significado y estructura, no por coincidencia literal con la muestra.',
    '',
    '5. REGEX:',
    'Todos los regex deben ser JavaScript válidos y compilar con new RegExp(regex, "i").',
    'No uses /.../ ni flags dentro del valor.',
    'Usa sintaxis estándar de JavaScript y (?:...) para grupos no capturantes.',
    'Cada regex de extracción debe tener exactamente un grupo de captura; los demás grupos deben ser no capturantes.',
    'amount_regex debe capturar únicamente el importe tal como aparece en el correo, sin símbolo de moneda ni etiquetas.',
    'merchant_regex debe capturar el comercio, tienda, destinatario o beneficiario tal como aparece. En transferencias, si no hay beneficiario pero sí una cuenta destino explícita, captura esa cuenta. Si no existe ninguno, usa null.',
    'date_regex debe capturar únicamente la fecha tal como aparece en la notificación original.',
    'date_format debe describir exactamente el formato en que esa fecha aparece en el correo. No conviertas, normalices ni reformatees la fecha.',
    'time_regex debe capturar únicamente la hora tal como aparece en la notificación original, admitiendo formatos de 12/24 horas y segundos opcionales.',
    'time_format debe describir exactamente el formato en que esa hora aparece en el correo. No conviertas, normalices ni reformatees la hora.',
    'Si la fecha u hora no aparece en la notificación original, usa null en su regex y formato correspondientes.',
    'currency_regex debe capturar la moneda únicamente si aparece explícitamente en la notificación en formato ISO 4217; si no, usa null.',
    'source_account_regex debe capturar la cuenta de origen tal como aparece cuando esté explícitamente presente; si no, usa null.',
    'Los regex se aplican sobre el CUERPO LIMPIO. HTML y tablas pueden convertir ":" en espacios o saltos de línea; usa separadores flexibles como `(?:\\s*:\\s*|\\s+)` cuando corresponda.',
    'Los regex deben usar únicamente el contexto mínimo, estable y necesario para localizar el campo objetivo.',
    'Evita incorporar datos concretos de la instancia o segmentos accidentales que puedan variar entre correos de la misma clase.',
    'Nunca inventes un regex para un dato ausente.',
    '',
    '6. FECHA Y HORA:',
    'Extrae fecha y hora exactamente como aparecen en la notificación original y usa date_format/time_format para describir su formato de origen.',
    'El prompt no convierte ni normaliza estos valores; la conversión posterior corresponde al sistema.',
    'En correos reenviados, ignora cualquier fecha u hora del envío, recepción, reenvío o metadatos del correo y usa únicamente las de la notificación original.',
    '',
    '7. VALIDACIÓN DE REGEX:',
    'Antes de responder, valida internamente cada regex contra el CUERPO LIMPIO.',
    'Comprueba que compila, encuentra el dato correcto, produce exactamente una captura y que esta contiene únicamente el valor objetivo tal como aparece en el correo.',
    'Verifica que no capture etiquetas, moneda, separadores ni texto incidental y que tolere los espacios y formato reales del correo.',
    'Para date_regex y time_regex verifica especialmente que la coincidencia pertenezca a la notificación original y no a metadatos de reenvío.',
    'Simula al menos una coincidencia por regex y corrígelo si falla.',
    'Comprueba también que el patrón no capture accidentalmente otra instancia del mismo tipo de dato presente en el correo.',
    'Si el dato no existe, usa null según las reglas del campo.',
    'No muestres esta validación.',
    '',
    'REGLA DE AUTORIDAD PARA ENTIDAD:',
    matchedExistingEntity
      ? 'La entidad ya fue resuelta por el sistema antes de generar este prompt. La IA NO participa en la decisión del NIVEL 1.'
      : 'No existe una coincidencia determinista de entidad. En este caso sí debes identificar la entidad según las reglas anteriores.',
    matchedExistingEntity
      ? 'No cambies entity_label, is_new_entity ni entity_email_pattern respecto a la resolución proporcionada por el sistema.'
      : 'Si ninguna entidad registrada coincide, puedes definir una nueva entidad y construir entity_email_pattern según las reglas.',
    '',
    '8. VALORES SEMÁNTICOS:',
    'expense_type debe representar la naturaleza de la operación usando el vocabulario del sistema, por ejemplo "compra", "transferencia", "retiro" o "pago".',
    'entity_label debe usar exactamente el nombre registrado cuando exista una equivalencia válida.',
    '',
    'ANÁLISIS INTERNO:',
    'Determina entidad emisora, clase de notificación, características estructurales y variables del asunto, nombre ENTIDAD + TIPO, diferencias estables respecto a los patrones existentes, datos concretos que no deben convertirse en identificadores y campos opcionales presentes.',
    'Cuando la entidad no haya sido identificada previamente por el sistema, determina también entity_email_pattern.',
    'Para fecha y hora, identifica el valor original de la notificación y su formato exacto, sin convertirlo.',
    'Después valida match_pattern y todos los regex contra el cuerpo.',
    'No muestres este razonamiento.',
    '',
    'SALIDA:',
    'Responde exclusivamente con un objeto JSON válido, sin markdown ni explicaciones.',
    'Debe contener exactamente:',
    'name, entity_label, is_new_entity, entity_email_pattern, subject_pattern, match_pattern, amount_regex, merchant_regex, date_regex, date_format, time_regex, time_format, currency_regex, source_account_regex, expense_type.',
    'No copies valores de estas instrucciones como datos del correo.',
    'No inventes valores ni propiedades.',
    'Usa null únicamente cuando una regla lo indique.',
    'No cambies los nombres de las propiedades.',
    'No uses valores en inglés cuando el vocabulario definido por estas reglas indique otro valor.',
    '',
    'DATOS DEL CORREO:',
    '--- REMITENTE RECIBIDO ---',
    sender || '(Sin remitente)',
    '',
    '--- ASUNTO RECIBIDO ---',
    subject || '(Sin asunto)',
    ...(effectiveSubject !== subject
      ? [`[ASUNTO ORIGINAL NORMALIZADO: "${effectiveSubject}"]`]
      : []),
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