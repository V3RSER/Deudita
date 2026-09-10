/**
 * Utilities for building and validating AI-driven email expense templates.
 *
 * Shared email normalization, entity-resolution, and template-AI utilities.
 */

const DEFAULT_HEAD_LINES = 15;

const EMAIL_PATTERN = String.raw`[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}`;

const EMAIL_ADDRESS_REGEX = new RegExp(`(${EMAIL_PATTERN})`, 'i');
const ANGLE_BRACKET_EMAIL_REGEX = new RegExp(
    String.raw`<\s*(${EMAIL_PATTERN})\s*>`,
    'gi',
);
const WRAPPED_HEADER_EMAIL_REGEX = new RegExp(
    String.raw`<\s*\n\s*(${EMAIL_PATTERN})\s*>`,
    'gi',
);
const WRAPPED_NAMED_HEADER_EMAIL_REGEX = new RegExp(
    String.raw`((?:^|\n)\s*(?:from|de|to|para|cc|reply-to)\s*:[^\n\r<]*?)\s*<\s*\n\s*(${EMAIL_PATTERN})\s*>`,
    'gim',
);

const SUBJECT_PREFIX_TOKENS = new Set([
    'fwd', 'fw', 're', 'rv', 'vs', 'tr', 'wg', 'aw', 'sv', 'res', 'enc', 'doorst',
]);
const SUBJECT_PREFIX_TOKEN_REGEX = /^(?:\[?([a-z]+)\]?\s*[:：-]\s*)/i;

const FORWARDED_HEADER_REGEX = /^(?:de|from)\s*:\s*([^\n\r<]+)/im;
const WRAPPED_FORWARDED_SENDER_REGEX = new RegExp(
    String.raw`^(?:de|from)\s*:\s*([^\n\r<]*?)\s*<\s*\n\s*(${EMAIL_PATTERN})>?(?:\s*\n|$)`,
    'im',
);
const NEXT_LINE_EMAIL_REGEX = new RegExp(
    String.raw`^\s*(${EMAIL_PATTERN})>?`,
    'i',
);

const FORWARDED_SEPARATOR = '---';
const FORWARDED_MESSAGE_MARKERS = ['forwarded message', 'mensaje reenviado'] as const;
const FORWARDED_DATE_HEADER_REGEX =
    /^(?:fecha|date|asunto|subject|para|to)\s*:/im;
const FROM_HEADER_REGEX = /^(?:de|from)\s*:/im;

const PERSONAL_EMAIL_DOMAINS = new Set([
    'gmail.com',
    'googlemail.com',
    'hotmail.com',
    'outlook.com',
    'live.com',
    'msn.com',
    'yahoo.com',
    'yahoo.es',
    'icloud.com',
    'me.com',
    'proton.me',
    'protonmail.com',
]);


const HTML_DOCUMENT_REGEX = /<[a-z!/][\s\S]*>/i;
const EMAIL_TOKEN_REGEX = /__EMAIL_ADDR_TOKEN_(\d+)__/g;

const HTML_RULES: Array<[RegExp, string]> = [
    [/<style[^>]*>[\s\S]*?<\/style>/gi, ''],
    [/<script[^>]*>[\s\S]*?<\/script>/gi, ''],
    [/<head[^>]*>[\s\S]*?<\/head>/gi, ''],
    [/<br\s*\/?>/gi, '\n'],
    [/<\/(p|div|tr|h[1-6]|li|table|blockquote)>/gi, '\n'],
    [/<(td|th)[^>]*>/gi, ' '],
    [/<https?:\/\/[^\s>]+>/g, ''],
    [/&nbsp;/gi, ' '],
    [/&amp;/gi, '&'],
    [/&lt;/gi, '<'],
    [/&gt;/gi, '>'],
    [/&quot;/gi, '"'],
    [/&#39;/g, "'"],
    [/&apos;/gi, "'"],
];

export interface EmailContext {
    cleanBody: string;
    bodyHeadLines: string;
    forwardedSender: string | null;
    forwardedSubject: string | null;
}

export interface EmailEntityPatternSource {
    id: string;
    name: string;
    patterns: string[];
}

export interface ResolvedEmailEntity {
    entity: EmailEntityPatternSource | null;
    effectivePattern: string | null;
    senderAlreadyCovered: boolean;
    matchedBy: 'id' | 'name' | 'pattern' | 'none';
    matchedPattern?: string;
}

const CLEAN_BODY_RULES: Array<[RegExp, string]> = [
    [/\[image:[^\]]*\]/gi, ''],
    [/<https?:\/\/[^\s>]+>/g, ''],
    [/https?:\/\/\S+/g, ''],
    [/\*/g, ''],
    [/[ \t]+/g, ' '],
    [/\n{3,}/g, '\n\n'],
];

const JSON_FIELDS = [
    'name',
    'entity_label',
    'is_new_entity',
    'entity_email_pattern',
    'subject_pattern',
    'match_pattern',
    'amount_regex',
    'merchant_regex',
    'date_regex',
    'date_format',
    'time_regex',
    'time_format',
    'currency_regex',
    'source_account_regex',
    'expense_type',
] as const;

const EXTRACTION_REGEX_FIELDS: Array<{
    key: string;
    label: string;
    requiresCapture: boolean;
}> = [
    {key: 'amount_regex', label: 'Monto', requiresCapture: true},
    {key: 'merchant_regex', label: 'Comercio', requiresCapture: true},
    {key: 'date_regex', label: 'Fecha', requiresCapture: true},
    {key: 'time_regex', label: 'Hora', requiresCapture: true},
    {key: 'currency_regex', label: 'Moneda', requiresCapture: true},
    {
        key: 'source_account_regex',
        label: 'Cuenta de origen',
        requiresCapture: true,
    },
    {key: 'subject_pattern', label: 'Patrón de Asunto', requiresCapture: false},
    {key: 'match_pattern', label: 'Patrón de Desempate', requiresCapture: false},
    {
        key: 'entity_email_pattern',
        label: 'Patrón de Correo de Entidad',
        requiresCapture: false,
    },
];

function getNonEmptyString(value: string | null | undefined): string {
    return typeof value === 'string' ? value.trim() : '';
}

function normalizeNewlines(text: string): string {
    return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function countOccurrences(text: string, value: string): number {
    if (!value) return 0;

    let count = 0;
    let index = text.indexOf(value);

    while (index !== -1) {
        count += 1;
        index = text.indexOf(value, index + value.length);
    }

    return count;
}

function applyRules(
    text: string,
    rules: ReadonlyArray<[RegExp, string]>,
): string {
    return rules.reduce((result, [pattern, replacement]) => {
        return result.replace(pattern, replacement);
    }, text);
}

function createEmailTokenStore(): {
    protect(text: string): string;
    restore(text: string): string;
} {
    const tokens = new Map<string, string>();
    let tokenCounter = 0;

    return {
        protect(text: string): string {
            return text.replace(ANGLE_BRACKET_EMAIL_REGEX, (_match, email: string) => {
                const token = `__EMAIL_ADDR_TOKEN_${tokenCounter++}__`;
                tokens.set(token, `<${email.trim()}>`);
                return token;
            });
        },
        restore(text: string): string {
            return text.replace(EMAIL_TOKEN_REGEX, (match) => {
                return tokens.get(match) || match;
            });
        },
    };
}

function hasRequiredCaptureGroup(pattern: string): boolean {
    for (let index = 0; index < pattern.length - 1; index += 1) {
        if (pattern[index] !== '(' || pattern[index + 1] === '?') continue;
        return true;
    }

    return false;
}

function hasSubjectPrefix(subject: string): boolean {
    let remaining = subject;

    while (true) {
        const match = SUBJECT_PREFIX_TOKEN_REGEX.exec(remaining);
        if (!match) return false;

        const token = match[1].toLowerCase();
        if (!SUBJECT_PREFIX_TOKENS.has(token)) return false;

        remaining = remaining.slice(match[0].length).trimStart();
    }
}

function parseJsonObject(rawText: string): {
    success: true;
    value: Record<string, unknown>;
} | {
    success: false;
    error: string;
} {
    let cleaned = rawText.trim();

    if (cleaned.startsWith('```')) {
        const openingEnd = cleaned.indexOf('\n');
        const closingStart = cleaned.lastIndexOf('```');

        if (openingEnd !== -1 && closingStart > openingEnd) {
            cleaned = cleaned.slice(openingEnd + 1, closingStart).trim();
        }
    }

    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');

    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
        return {
            success: false,
            error:
                'No se encontró un objeto JSON válido en la respuesta de la IA. Asegúrate de copiar el JSON completo.',
        };
    }

    const jsonSubstring = cleaned.slice(firstBrace, lastBrace + 1);

    try {
        const value: unknown = JSON.parse(jsonSubstring);
        if (!isJsonRecord(value)) {
            return {
                success: false,
                error: 'La respuesta JSON de la IA no contiene un objeto en el nivel superior.',
            };
        }
        return {success: true, value};
    } catch (err: unknown) {
        try {
            const repaired = repairUnescapedJsonBackslashes(jsonSubstring);
            const value: unknown = JSON.parse(repaired);
            if (!isJsonRecord(value)) {
                return {
                    success: false,
                    error: 'La respuesta JSON de la IA no contiene un objeto en el nivel superior.',
                };
            }
            return {success: true, value};
        } catch {
            const message = err instanceof Error ? err.message : 'JSON inválido';
            return {
                success: false,
                error: `Error al interpretar el JSON devuelto por la IA: ${message}. Verifica que el contenido tenga formato JSON correcto.`,
            };
        }
    }
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function repairUnescapedJsonBackslashes(json: string): string {
    // Preserve valid JSON escapes and double only backslashes that would
    // otherwise be invalid JSON escape sequences.
    return json.replace(
        /\\(?!["\\/bfnrt]|u[0-9a-fA-F]{4})/g,
        '\\\\',
    );
}

function normalizeTemplateString(
    value: unknown,
    fallback: string | null = null,
): string | null {
    if (typeof value !== 'string' || !value.trim()) return fallback;
    return value.trim();
}

function normalizeRegexOrNull(value: unknown): string | null {
    return sanitizeRegexPattern(
        typeof value === 'string' ? value : null,
    );
}

/**
 * Exact email body cleaning function used across the expense detection pipeline.
 * Replicated verbatim to preserve production processing behavior.
 */
export function cleanEmailBody(
    body: string | null | undefined,
): string {
    if (!body) return '';

    const tokenStore = createEmailTokenStore();

    let text = normalizeNewlines(String(body));

    // Normalizar correos en cabeceras envueltos con saltos de línea dentro de < y >.
    text = text.replace(WRAPPED_HEADER_EMAIL_REGEX, '<$1>');
    text = text.replace(
        WRAPPED_NAMED_HEADER_EMAIL_REGEX,
        '$1 <$2>',
    );

    text = tokenStore.protect(text);

    if (HTML_DOCUMENT_REGEX.test(text)) {
        text = applyRules(text, HTML_RULES).replace(
            /&#(\d+);/g,
            (_match, dec: string) => String.fromCodePoint(Number.parseInt(dec, 10)),
        );
    }

    text = tokenStore.restore(text);

    return applyRules(text, CLEAN_BODY_RULES).trim();
}

/**
 * Strips common email forwarding and reply prefixes across multiple languages.
 */
export function stripSubjectPrefixes(
    subject: string | null | undefined,
): string {
    let normalized = getNonEmptyString(subject);

    while (hasSubjectPrefix(normalized)) {
        const match = SUBJECT_PREFIX_TOKEN_REGEX.exec(normalized);
        if (!match) break;
        normalized = normalized.slice(match[0].length).trim();
    }

    return normalized;
}

/**
 * Detects if an email address belongs to a generic personal webmail provider.
 */
export function isPersonalEmail(
    email: string | null | undefined,
): boolean {
    const normalized = getNonEmptyString(email).toLowerCase();
    const atIndex = normalized.indexOf('@');

    if (atIndex === -1) return false;

    const domain = normalized.slice(atIndex + 1);
    for (const personalDomain of PERSONAL_EMAIL_DOMAINS) {
        if (
            domain === personalDomain ||
            domain.endsWith(`.${personalDomain}`)
        ) {
            return true;
        }
    }

    return false;
}

/**
 * Detects if an email was forwarded or arrived via an inbox rule.
 */
export function isForwardedEmail(
    sender: string | null | undefined,
    subject: string | null | undefined,
    body: string | null | undefined,
): boolean {
    const normalizedSubject = getNonEmptyString(subject);
    const normalizedBody = getNonEmptyString(body);

    if (hasSubjectPrefix(normalizedSubject)) {
        return true;
    }

    const separatorCount = countOccurrences(normalizedBody, FORWARDED_SEPARATOR);
    if (separatorCount >= 2) {
        const bodyLower = normalizedBody.toLowerCase();
        if (FORWARDED_MESSAGE_MARKERS.some((marker) => bodyLower.includes(marker))) {
            return true;
        }
    }

    const head = getHeadLines(normalizedBody, DEFAULT_HEAD_LINES);

    if (FROM_HEADER_REGEX.test(head) && FORWARDED_DATE_HEADER_REGEX.test(head)) {
        return true;
    }

    if (
        sender &&
        isPersonalEmail(sender) &&
        FROM_HEADER_REGEX.test(head)
    ) {
        return true;
    }

    return false;
}

/**
 * Extracts the real institutional sender email.
 *
 * For forwarded emails, the original sender must come from the forwarded
 * headers in the body, never from the outer envelope sender.
 */
export function extractInstitutionalSenderEmail(
    sender: string | null | undefined,
    body: string | null | undefined,
    isForwarded: boolean,
): string | null {
    const forwardedSender = extractForwardedSenderFromBody(
        body,
        DEFAULT_HEAD_LINES,
    );
    const forwardedEmail = extractEmailAddress(forwardedSender);

    if (forwardedEmail && !isPersonalEmail(forwardedEmail)) {
        return forwardedEmail;
    }

    const head = getHeadLines(body, DEFAULT_HEAD_LINES);
    const bodyEmails = head.matchAll(new RegExp(`(${EMAIL_PATTERN})`, 'gi'));

    for (const match of bodyEmails) {
        const email = match[1];
        const normalizedEmail = email.toLowerCase();
        if (!isPersonalEmail(normalizedEmail)) {
            return normalizedEmail;
        }
    }

    if (isForwarded) {
        return null;
    }

    const directEmail = extractEmailAddress(sender);

    return directEmail && !isPersonalEmail(directEmail)
        ? directEmail
        : null;
}

/**
 * Extracts the original sender from forwarded headers in the body.
 */
export function extractForwardedSenderFromBody(
    body: string | null | undefined,
    maxLines: number = DEFAULT_HEAD_LINES,
): string | null {
    const head = getHeadLines(body, maxLines);
    if (!head) return null;

    const wrappedMatch = WRAPPED_FORWARDED_SENDER_REGEX.exec(head);

    if (wrappedMatch) {
        const name = wrappedMatch[1].trim();
        const email = wrappedMatch[2].trim();

        return name ? `${name} <${email}>` : `<${email}>`;
    }

    const match = FORWARDED_HEADER_REGEX.exec(head);

    if (!match?.[1]) return null;

    let senderStr = match[1].trim();

    if (senderStr.includes('<') && !senderStr.includes('>')) {
        const rest = head.slice((match.index ?? 0) + match[0].length);
        const nextLineEmail = NEXT_LINE_EMAIL_REGEX.exec(rest);

        if (nextLineEmail) {
            senderStr = `${senderStr} ${nextLineEmail[1]}>`;
        }
    }

    return senderStr;
}

/**
 * Extracts a standard email address from arbitrary text.
 */
export function extractEmailAddress(
    text: string | null | undefined,
): string | null {
    if (!text) return null;

    const match = EMAIL_ADDRESS_REGEX.exec(String(text));
    return match ? match[1].toLowerCase() : null;
}

/**
 * Escapes special regex characters in an email address.
 */
export function escapeRegexEmail(email: string): string {
    return email.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

/**
 * Infers an entity_email_pattern from the email sender or forwarded headers.
 */
export function inferEntityEmailPattern(
    sender: string | null | undefined,
    body?: string | null | undefined,
): string | null {
    const forwarded = isForwardedEmail(sender, null, body);
    const institutionalEmail = extractInstitutionalSenderEmail(
        sender,
        body,
        forwarded,
    );

    return institutionalEmail
        ? escapeRegexEmail(institutionalEmail)
        : null;
}

/**
 * Extracts the original subject from forwarded headers in the body.
 */
export function extractForwardedSubjectFromBody(
    body: string | null | undefined,
    maxLines: number = DEFAULT_HEAD_LINES,
): string | null {
    const head = getHeadLines(body, maxLines);
    const match = /^(?:asunto|subject)\s*:\s*([^\n\r]+)/im.exec(head);

    return match?.[1]
        ? stripSubjectPrefixes(match[1].trim())
        : null;
}

/**
 * Returns the first N lines of the body.
 */
export function getHeadLines(
    body: string | null | undefined,
    maxLines: number = 10,
): string {
    if (!body) return '';
    return String(body).split('\n').slice(0, maxLines).join('\n');
}

/**
 * Sanitizes regex strings by removing leading/trailing /.../flags and
 * accidental outer quotes.
 */
export function sanitizeRegexPattern(
    pattern: string | null | undefined,
): string | null {
    if (!pattern || typeof pattern !== 'string') return null;

    let sanitized = pattern.trim();

    if (
        (sanitized.startsWith('"') && sanitized.endsWith('"')) ||
        (sanitized.startsWith("'") && sanitized.endsWith("'"))
    ) {
        sanitized = sanitized.slice(1, -1).trim();
    }

    const slashMatch = /^\/([^\n\r]*)\/([gimsuy]*)$/.exec(sanitized);
    if (slashMatch) {
        sanitized = slashMatch[1];
    }

    // Common LLM typo: (?\\:...) -> (?:...).
    sanitized = sanitized.replace(/\(\?\\:/g, '(?:');

    return sanitized.trim() || null;
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

export function buildEmailContext(body: string | null | undefined): EmailContext {
    const cleanBody = cleanEmailBody(body);
    return {
        cleanBody,
        bodyHeadLines: getHeadLines(cleanBody, DEFAULT_HEAD_LINES),
        forwardedSender: extractForwardedSenderFromBody(cleanBody, DEFAULT_HEAD_LINES),
        forwardedSubject: extractForwardedSubjectFromBody(cleanBody, DEFAULT_HEAD_LINES),
    };
}

export function matchEmailEntityPatterns(
    patterns: Array<string | null | undefined>,
    sender: string | null | undefined,
    bodyHeadLines: string,
    forwardedSender: string | null,
): { matched: boolean; matchedPattern?: string; matchedOn?: 'sender' | 'body' } {
    const normalizedSender = getNonEmptyString(sender);
    const sanitizedPatterns = patterns
        .map((pattern) => sanitizeRegexPattern(pattern))
        .filter((pattern): pattern is string => Boolean(pattern));

    for (const pattern of sanitizedPatterns) {
        try {
            const regex = new RegExp(pattern, 'i');
            if (normalizedSender && regex.test(normalizedSender)) {
                return {matched: true, matchedPattern: pattern, matchedOn: 'sender'};
            }
            if (forwardedSender && regex.test(forwardedSender)) {
                return {matched: true, matchedPattern: pattern, matchedOn: 'body'};
            }
            if (bodyHeadLines && regex.test(bodyHeadLines)) {
                return {matched: true, matchedPattern: pattern, matchedOn: 'body'};
            }
        } catch {
            // Invalid persisted patterns must not prevent other patterns from matching.
        }
    }

    return {matched: false};
}

export function resolveEmailEntity({
                                       entities,
                                       entityId,
                                       entityLabel,
                                       requestedPattern,
                                       sender,
                                       body,
                                       allowPatternFallback = true,
                                   }: {
    entities: EmailEntityPatternSource[];
    entityId?: string | null;
    entityLabel?: string | null;
    requestedPattern?: string | null;
    sender: string | null | undefined;
    body?: string | null | undefined;
    allowPatternFallback?: boolean;
}): ResolvedEmailEntity {
    const context = buildEmailContext(body);
    let entity: EmailEntityPatternSource | null = null;
    let matchedBy: ResolvedEmailEntity['matchedBy'] = 'none';
    let matchedPattern: string | undefined;

    if (entityId) {
        entity = entities.find((ent) => ent.id === entityId) || null;
        if (entity) matchedBy = 'id';
    } else if (entityLabel?.trim()) {
        const normalizedLabel = entityLabel.trim().toLowerCase();
        entity = entities.find(
            (ent) => ent.name.trim().toLowerCase() === normalizedLabel,
        ) || null;
        if (entity) matchedBy = 'name';
    }

    if (!entity && allowPatternFallback) {
        const patternMatch = entities
            .map((ent) => ({
                entity: ent,
                match: matchEmailEntityPatterns(
                    ent.patterns,
                    sender,
                    context.bodyHeadLines,
                    context.forwardedSender,
                ),
            }))
            .find(({match}) => match.matched);

        if (patternMatch) {
            entity = patternMatch.entity;
            matchedBy = 'pattern';
            matchedPattern = patternMatch.match.matchedPattern;
        }
    }

    const senderAlreadyCovered = Boolean(
        entity &&
        matchEmailEntityPatterns(
            entity.patterns,
            sender,
            context.bodyHeadLines,
            context.forwardedSender,
        ).matched,
    );

    const effectivePattern = requestedPattern
        ? sanitizeRegexPattern(requestedPattern)
        : !senderAlreadyCovered
            ? inferEntityEmailPattern(sender, body)
            : null;

    return {entity, effectivePattern, senderAlreadyCovered, matchedBy, matchedPattern};
}


export function buildTemplatePrompt(
    sender: string,
    subject: string,
    cleanBody: string,
    existingEntities: EmailEntityPatternSource[] = [],
    availableExpenseTypes: Array<{ name: string; label?: string }> = [],
): string {
    const strippedSubject = stripSubjectPrefixes(subject);
    const forwardedSubject = extractForwardedSubjectFromBody(
        cleanBody,
        DEFAULT_HEAD_LINES,
    );
    const effectiveSubject =
        forwardedSubject ||
        (strippedSubject !== subject ? strippedSubject : subject);

    const matchedExistingEntity = resolveEmailEntity({
        entities: existingEntities,
        sender,
        body: cleanBody,
    }).entity;

    let entityInstructions: string;

    if (matchedExistingEntity) {
        entityInstructions = [
            'ENTIDAD RESUELTA DETERMINÍSTICAMENTE POR EL SISTEMA:',
            `entity_label = "${matchedExistingEntity.name}"`,
            'is_new_entity=false',
            'entity_email_pattern=null',
            'No analices, infieras, reevalues, corrijas, compares ni sustituyas la entidad.',
            'Conserva exactamente estos valores y continúa con el análisis del tipo de notificación y sus campos.',
        ].join('\n');
    } else {
        const entityNames = existingEntities
            .map((entity) => entity.name)
            .filter(Boolean);

        const namesList = entityNames.length
            ? `ENTIDADES REGISTRADAS: \n${formatEntityNames(entityNames)} `
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

    const relevantExistingPatterns =
        matchedExistingEntity?.patterns?.filter(Boolean) ?? [];

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
        'Usa como referencia los patrones existentes proporcionados para la entidad cuando estén disponibles y busca una diferencia estable respecto a ellos.',
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
                ...relevantExistingPatterns.map(
                    (pattern, index) => `${index + 1}. ${pattern} `,
                ),
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
        'currency_regex debe capturar únicamente el código de moneda ISO 4217 de tres letras ([A-Z]{3}) cuando aparezca explícitamente asociado al importe o a una cantidad monetaria dentro de la notificación. El grupo de captura debe contener únicamente el código ISO 4217, sin símbolo de moneda, importe ni etiquetas. La moneda es un valor dinámico de la instancia: nunca fijes en el regex una moneda concreta como COP, USD, EUR u otra. El regex debe aceptar cualquier código que cumpla [A-Z]{3}. Si no aparece explícitamente una moneda ISO 4217 asociada a un importe, usa null.',
        'source_account_regex debe capturar el identificador de la cuenta o instrumento de pago de origen tal como aparece explícitamente en la notificación. Puede corresponder a una cuenta bancaria, tarjeta, billetera u otro medio de pago, y puede estar completo, parcialmente oculto o representado mediante cualquier formato utilizado por la entidad. La captura debe contener únicamente el identificador del origen, sin etiquetas, tipo de instrumento ni texto adicional. Si no se identifica explícitamente el origen del pago, usa null.',
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
        availableExpenseTypes && availableExpenseTypes.length > 0
            ? `expense_type debe representar la naturaleza de la operación usando estrictamente el vocabulario del sistema registrado en la base de datos: ${availableExpenseTypes.map((t) => `"${t.name}"${t.label && t.label.toLowerCase() !== t.name.toLowerCase() ? ` (${t.label})` : ''}`).join(', ')}. Debes seleccionar uno de estos valores exactos según la notificación. No inventes ni uses otros tipos.`
            : 'expense_type debe representar la naturaleza de la operación usando el vocabulario del sistema registrado en la base de datos.',
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
        `Debe contener exactamente: ${JSON_FIELDS.join(', ')}.`,
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
 */
export function parseAITemplateResponse(
    rawText: string,
): ParsedAITemplateResult {
    if (!rawText.trim()) {
        return {
            success: false,
            error: 'El texto ingresado está vacío',
        };
    }

    const parsedResult = parseJsonObject(rawText);

    if (!parsedResult.success) {
        return parsedResult;
    }

    const parsed = parsedResult.value;
    const warnings: string[] = [];

    if (
        !parsed.name ||
        typeof parsed.name !== 'string' ||
        !parsed.name.trim()
    ) {
        warnings.push(
            'La IA no especificó un nombre para la plantilla; se asignará uno por defecto.',
        );
        const entityLabel =
            typeof parsed.entity_label === 'string' && parsed.entity_label.trim()
                ? parsed.entity_label.trim()
                : 'Banco';
        parsed.name = `${entityLabel} - Plantilla`;
    }

    if (
        !parsed.amount_regex ||
        typeof parsed.amount_regex !== 'string' ||
        !parsed.amount_regex.trim()
    ) {
        return {
            success: false,
            error:
                'El campo "amount_regex" es obligatorio en la plantilla para poder capturar el valor del gasto.',
        };
    }

    const validationErrors: string[] = [];

    for (const {key, label, requiresCapture} of EXTRACTION_REGEX_FIELDS) {
        const rawPattern = parsed[key];
        const pattern = normalizeRegexOrNull(rawPattern);

        if (!pattern) {
            const optional =
                key === 'currency_regex' ||
                key === 'source_account_regex' ||
                key === 'time_regex' ||
                key === 'date_regex' ||
                key === 'merchant_regex';

            if (requiresCapture && !optional) {
                validationErrors.push(`El patrón de "${label}" es obligatorio.`);
            }

            continue;
        }

        parsed[key] = pattern;

        try {
            new RegExp(pattern, 'i');

            if (requiresCapture && !hasRequiredCaptureGroup(pattern)) {
                validationErrors.push(
                    `El patrón de "${label}" no tiene un grupo de captura (...) válido.`,
                );
            }
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            validationErrors.push(
                `El patrón de "${label}" es inválido: ${message}`,
            );
        }
    }

    if (parsed.time_regex && !parsed.time_format) {
        validationErrors.push(
            'Si existe time_regex, time_format es obligatorio.',
        );
    }

    const entityPattern = normalizeRegexOrNull(parsed.entity_email_pattern);

    if (entityPattern) {
        if (!entityPattern.includes('@')) {
            validationErrors.push(
                'El entity_email_pattern debe contener @ y representar un correo/dominio institucional.',
            );
        } else {
            try {
                new RegExp(entityPattern, 'i');
            } catch {
                validationErrors.push(
                    'El entity_email_pattern no es un regex válido.',
                );
            }
        }
    }

    if (validationErrors.length > 0) {
        return {
            success: false,
            error: [
                'La respuesta de la IA contiene errores que deben corregirse:',
                ...validationErrors.map((error) => `• ${error}`),
            ].join('\n'),
            warnings,
        };
    }

    return {
        success: true,
        data: {
            name: String(parsed.name).trim(),
            entity_label: normalizeTemplateString(parsed.entity_label),
            is_new_entity: Boolean(parsed.is_new_entity),
            entity_email_pattern: entityPattern,
            subject_pattern: normalizeRegexOrNull(parsed.subject_pattern),
            match_pattern: normalizeRegexOrNull(parsed.match_pattern),
            amount_regex:
                normalizeRegexOrNull(parsed.amount_regex) ||
                String(parsed.amount_regex).trim(),
            merchant_regex: normalizeRegexOrNull(parsed.merchant_regex),
            date_regex: normalizeRegexOrNull(parsed.date_regex),
            date_format: normalizeTemplateString(
                parsed.date_format,
                'DD/MM/YYYY',
            ),
            time_regex: normalizeRegexOrNull(parsed.time_regex),
            time_format: normalizeTemplateString(parsed.time_format),
            currency_regex: normalizeRegexOrNull(parsed.currency_regex),
            source_account_regex: normalizeRegexOrNull(
                parsed.source_account_regex,
            ),
            expense_type: normalizeTemplateString(parsed.expense_type)?.toLowerCase() ?? null,
        },
        warnings: warnings.length > 0 ? warnings : undefined,
    };
}

export interface TemplateCorrectionDetails {
    template: {
        name?: string | null;
        is_new_entity?: boolean | null;
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
 * Builds a concise targeted correction prompt.
 */
export function buildCorrectionPrompt(
    sender: string,
    subject: string,
    cleanBody: string,
    details: TemplateCorrectionDetails,
): string {
    const sections: string[] = [];

    if (details.failures?.length) {
        sections.push(
            'ERRORES BLOQUEANTES QUE IMPIDEN QUE LA PLANTILLA COINCIDA:',
            ...details.failures.map((failure) => `• ${failure}`),
        );
    }

    const warnings = details.warnings ?? [];

    if (warnings.length) {
        if (sections.length > 0) sections.push('');

        sections.push(
            'AVISOS EN CAMPOS DE EXTRACCIÓN (Revisa los patrones o define null si no aparecen en el correo):',
            ...warnings.map((warning) => `• ${warning}`),
        );
    }

    if (sections.length === 0) {
        sections.push(
            '• Revisa la coincidencia exacta de los patrones de extracción sobre el texto real.',
        );
    }

    const isForwarded = isForwardedEmail(sender, subject, cleanBody);
    const forwardedSender = extractForwardedSenderFromBody(
        cleanBody,
        DEFAULT_HEAD_LINES,
    );
    const detectedInstitutionalEmail = extractInstitutionalSenderEmail(
        sender,
        cleanBody,
        isForwarded,
    );
    return [
        'Corrige la siguiente plantilla JSON para extracción de notificaciones de correo.',
        'La plantilla fue evaluada contra el correo real y se obtuvieron los siguientes resultados:',
        '',
        ...sections,
        '',
        'PLANTILLA ACTUAL:',
        JSON.stringify(
            pickTemplateFields(details.template),
            null,
            2,
        ),
        '',
        'DATOS REALES DEL CORREO:',
        '--- REMITENTE EXTERNO RECIBIDO ---',
        sender || '(Sin remitente)',
        ...(isForwarded
            ? [
                `[AVISO: Mensaje reenviado. El remitente externo "${sender}" corresponde a quien reenvió el correo, NO al emisor original.]`,
            ]
            : []),
        ...(forwardedSender
            ? [`[REMITENTE ORIGINAL EN EL CUERPO: "${forwardedSender}"]`]
            : []),
        ...(detectedInstitutionalEmail
            ? [
                `[DIRECCIÓN INSTITUCIONAL ORIGINAL: "${detectedInstitutionalEmail}"]`,
            ]
            : []),
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

function formatEntityNames(entityNames: string[]): string {
    return entityNames.map((name) => `- "${name}"`).join('\n');
}

function pickTemplateFields(
    template: TemplateCorrectionDetails['template'],
): TemplateCorrectionDetails['template'] {
    const entries = JSON_FIELDS
        .filter((key) => key in template)
        .map((key) => [key, template[key]] as const);

    return Object.fromEntries(entries) as TemplateCorrectionDetails['template'];
}
