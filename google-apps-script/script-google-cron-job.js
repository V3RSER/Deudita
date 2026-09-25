const BACKEND_BASE_URL = 'https://deudita-nine.vercel.app';
const PROCESSED_LABEL = 'gastos-procesados';
const TEMPLATES_CACHE_SECONDS = 21600; // 6 horas.
const MAX_THREADS_PER_RUN = 50;
const DEBUG_MATCHING = false;

// ------------------------------------------------------------
// 1) CONEXIÓN INICIAL
// ------------------------------------------------------------

function doGet(e) {
    const token = e?.parameter ? (e.parameter.token || e.parameter.webhook_token) : null;
    if (token) {
        const props = PropertiesService.getUserProperties();
        props.setProperty('WEBHOOK_TOKEN', String(token).trim());
        CacheService.getUserCache().remove('TEMPLATES_JSON');
    }

    if (e?.parameter?.mode === 'test') {
        return renderEmailTestApp();
    }

    if (!token && !getWebhookToken()) {
        return HtmlService.createHtmlOutput(
            '<p>Falta el token de conexión. Vuelve a la app y presiona "Conectar Gmail" de nuevo.</p>'
        );
    }

    ensureLabelExists(PROCESSED_LABEL);
    installTriggerIfMissing();

    try {
        syncExpenseEmails();
    } catch (err) {
        console.warn(`Primera sincronización falló: ${err?.message ? err.message : err}`);
    }

    return HtmlService.createHtmlOutput(
        '<p>Listo. Tu detección de gastos por correo está activa. Puedes cerrar esta pestaña.</p>'
    );
}

function installTriggerIfMissing() {
    const already = ScriptApp.getProjectTriggers().some(
        t => t.getHandlerFunction() === 'syncExpenseEmails'
    );

    if (!already) {
        ScriptApp.newTrigger('syncExpenseEmails')
            .timeBased()
            .everyMinutes(5)
            .create();
    }
}

// ------------------------------------------------------------
// 2) SINCRONIZACIÓN PERIÓDICA
// ------------------------------------------------------------

function syncExpenseEmails(selectedMessageId) {
    const startTime = Date.now();
    const token = getWebhookToken();

    if (!token) {
        console.warn('syncExpenseEmails: usuario sin WEBHOOK_TOKEN configurado en UserProperties.');
        return {
            success: false,
            error: 'No hay WEBHOOK_TOKEN configurado. Guarda tu token de Deudita primero.',
            messagesProcessed: 0,
            matchesFound: 0,
            expensesSent: 0,
            expensesFailed: 0,
        };
    }

    const label = GmailApp.getUserLabelByName(PROCESSED_LABEL) ||
        GmailApp.createLabel(PROCESSED_LABEL);

    const templates = getTemplatesWithCache(token);
    console.log(`CATALOG | templates=${templates.length}`);

    if (!templates.length) {
        console.log('No hay plantillas disponibles.');
        return {
            success: true,
            warning: 'No hay plantillas disponibles en el catálogo.',
            messagesProcessed: 0,
            matchesFound: 0,
            expensesSent: 0,
            expensesFailed: 0,
        };
    }

    // La adaptación del payload de la API al catálogo que consume el motor es
    // infraestructura del cron. El matching/extracción pertenece al motor
    // compartido y vive en email-matching.ts.
    const entities = buildCatalogEntitiesFromTemplates(templates);
    const matcher = getProductionMatcher(templates, entities);

    const sinceEpoch = getLastSyncEpoch();
    const query = `in:inbox -label:${PROCESSED_LABEL} after:${sinceEpoch}`;
    const threads = selectedMessageId
        ? [GmailApp.getMessageById(String(selectedMessageId).trim()).getThread()]
        : GmailApp.search(query, 0, MAX_THREADS_PER_RUN);

    console.log(
        `SYNC INPUT | modo=${selectedMessageId ? 'correo-seleccionado' : 'cron'} | ` +
        `messageId=${selectedMessageId || 'n/a'} | hilos=${threads.length}`
    );

    let latestMessageEpoch = sinceEpoch;
    let messagesProcessed = 0;
    let matchesFound = 0;
    let expensesSent = 0;
    let expensesFailed = 0;
    let lastExpenseResult = null;
    let lastMatchedDetails = null;
    const matchesByTemplate = {};
    const processedThreads = [];

    for (const thread of threads) {
        const messages = thread.getMessages();

        for (const message of messages) {
            if (selectedMessageId && message.getId() !== String(selectedMessageId).trim()) {
                continue;
            }

            messagesProcessed++;

            const messageDate = message.getDate();
            const messageEpoch = Math.floor(messageDate.getTime() / 1000);
            if (messageEpoch > latestMessageEpoch) {
                latestMessageEpoch = messageEpoch;
            }

            const subject = message.getSubject() || '';
            const sender = message.getFrom() || '';
            const body = message.getPlainBody() || '';

            // Matching compatible con el motor frontend (email-matching.ts).
            console.log(
                `MESSAGE | id=${message.getId()} | from=${sender} | subject=${subject}`
            );

            const match = matchEmailWithMatcher(
                matcher,
                sender,
                subject,
                body
            );

            console.log(
                `MATCH RESULT | messageId=${message.getId()} | matched=${Boolean(match)} | ` +
                `json=${JSON.stringify(match)}`
            );

            if (!match) continue;

            matchesFound++;
            matchesByTemplate[match.templateId] =
                (matchesByTemplate[match.templateId] || 0) + 1;

            const matchedTpl = templates.find(t => t.id === match.templateId);
            lastMatchedDetails = {
                templateId: match.templateId,
                templateName: (matchedTpl && matchedTpl.name) ? matchedTpl.name : match.templateId,
                amount: match.amount,
                currency: match.currency,
                merchant: match.merchant,
                concept: match.concept,
            };

            if (DEBUG_MATCHING) {
                console.log(
                    `MATCH ${match.templateId} | ${sender} | ${subject} | ${match.amount}`
                );
            }

            const sendResult = sendExpense(token, message, match);
            lastExpenseResult = sendResult;
            if (sendResult && sendResult.success) {
                expensesSent++;
            } else {
                expensesFailed++;
            }
        }

        processedThreads.push(thread);
    }

    if (processedThreads.length) {
        label.addToThreads(processedThreads);
    }

    if (threads.length > 0 && !selectedMessageId) {
        setLastSyncEpoch(latestMessageEpoch - 60);
    }

    const durationMs = Date.now() - startTime;

    console.log(
        `Sync: hilos=${threads.length}, correos=${messagesProcessed}, ` +
        `matches=${matchesFound}, enviados=${expensesSent}, ` +
        `errores=${expensesFailed}, duración_ms=${durationMs}`
    );

    if (matchesFound > 0) {
        console.log(`Matches por plantilla: ${JSON.stringify(matchesByTemplate)}`);
    }

    return {
        success: expensesFailed === 0 && (expensesSent > 0 || (matchesFound === 0 && messagesProcessed > 0)),
        messagesProcessed,
        matchesFound,
        expensesSent,
        expensesFailed,
        lastResult: lastExpenseResult,
        matchedTemplateName: lastMatchedDetails ? lastMatchedDetails.templateName : null,
        extractedAmount: lastMatchedDetails ? lastMatchedDetails.amount : null,
        currency: lastMatchedDetails ? lastMatchedDetails.currency : null,
        merchant: lastMatchedDetails ? lastMatchedDetails.merchant : null,
        concept: lastMatchedDetails ? lastMatchedDetails.concept : null,
    };
}

/**
 * Convierte el payload de plantillas al catálogo de entidades que consume
 * el motor compartido.
 */
function buildCatalogEntitiesFromTemplates(templates) {
    const byId = {};

    for (const template of templates) {
        const entityId = template.entity_id;
        if (!entityId) continue;

        if (!byId[entityId]) {
            byId[entityId] = {
                id: String(entityId),
                name: template.entity?.name
                    ? String(template.entity.name)
                    : String(entityId),
                patterns: [],
            };
        }

        const target = byId[entityId].patterns;
        const entityPatterns = template.entity && Array.isArray(template.entity.patterns)
            ? template.entity.patterns
            : [];
        const templatePatterns = Array.isArray(template.entity_email_patterns)
            ? template.entity_email_patterns
            : [];

        for (const pattern of entityPatterns.concat(templatePatterns)) {
            if (pattern && target.indexOf(pattern) === -1) {
                target.push(pattern);
            }
        }
    }

    return Object.keys(byId).map(id => byId[id]);
}

/**
 * Obtiene el motor de matching. Si email-matching.js está cargado en el proyecto
 * de Google Apps Script, reutiliza createProductionEmailMatcher.
 * Si no está disponible en el entorno de ejecución, usa la implementación local
 * equivalente para evitar ReferenceError y garantizar compatibilidad idéntica con el frontend.
 */
function getProductionMatcher(templates, entities) {
    if (typeof createProductionEmailMatcher === 'function') {
        try {
            return createProductionEmailMatcher(templates, entities);
        } catch (err) {
            console.warn(`Error al invocar createProductionEmailMatcher compartido: ${err && err.message ? err.message : err}. Usando motor local de respaldo.`);
        }
    }
    return createLocalProductionEmailMatcher(templates, entities);
}

/**
 * Ejecuta el matching de un correo. Si email-matching.js está cargado,
 * reutiliza matchEmailForProduction. En caso contrario, usa executeLocalProductionMatch.
 */
function matchEmailWithMatcher(matcher, sender, subject, body) {
    if (typeof matchEmailForProduction === 'function') {
        try {
            return matchEmailForProduction(matcher, sender, subject, body);
        } catch (err) {
            console.warn(`Error al invocar matchEmailForProduction compartido: ${err && err.message ? err.message : err}. Usando matching local de respaldo.`);
        }
    }
    return executeLocalProductionMatch(matcher, sender, subject, body);
}

/**
 * Implementación local del agrupamiento de entidades y plantillas
 * replicando exactamente la lógica del frontend (lib/email-templates/email-matching.ts).
 */
function createLocalProductionEmailMatcher(templates, entities) {
    entities = entities || [];
    const entityMap = {};

    for (const ent of entities) {
        if (!ent || !ent.id) continue;
        entityMap[ent.id] = {
            entity: ent,
            templates: [],
            patterns: Array.isArray(ent.patterns) ? ent.patterns.slice() : [],
        };
    }

    for (const t of templates) {
        const entId = t.entity_id || '__ORPHAN__';
        if (!entityMap[entId]) {
            entityMap[entId] = {
                entity: t.entity || { id: entId, name: entId, patterns: [] },
                templates: [],
                patterns: [],
            };
        }
        entityMap[entId].templates.push(t);
        if (Array.isArray(t.entity_email_patterns)) {
            for (const p of t.entity_email_patterns) {
                if (p && entityMap[entId].patterns.indexOf(p) === -1) {
                    entityMap[entId].patterns.push(p);
                }
            }
        }
    }

    const groups = [];
    for (const entId of Object.keys(entityMap)) {
        const item = entityMap[entId];
        if (!item.templates.length) continue;

        const subjectGroupsMap = {};
        for (const tpl of item.templates) {
            const rawSub = tpl.subject_pattern ? String(tpl.subject_pattern).trim() : '__NO_SUBJECT__';
            if (!subjectGroupsMap[rawSub]) {
                subjectGroupsMap[rawSub] = [];
            }
            subjectGroupsMap[rawSub].push(tpl);
        }

        const subjectGroups = Object.keys(subjectGroupsMap).map(key => ({
            subjectPattern: key === '__NO_SUBJECT__' ? null : key,
            templates: subjectGroupsMap[key],
        }));

        groups.push({
            entityId: entId === '__ORPHAN__' ? null : entId,
            entity: item.entity,
            entityPatterns: item.patterns,
            templates: item.templates,
            subjectGroups: subjectGroups,
        });
    }

    return { groups: groups };
}

/**
 * Ejecuta el matching replicando la lógica exacta del frontend:
 * Nivel 1: Detección de entidad (remitente, cabeceras o cuerpo superior)
 * Nivel 2: Filtro por patrón de asunto
 * Nivel 3: Desempate por patrón de texto (match_pattern)
 * Nivel 4: Extracción de campos con expresiones regulares
 */
function executeLocalProductionMatch(matcher, sender, subject, rawBody) {
    if (!matcher || !Array.isArray(matcher.groups)) return null;

    let cleanBody = '';
    let bodyHeadLines = [];
    let forwardedSender = null;
    let forwardedSubject = null;

    if (typeof buildEmailContext === 'function') {
        const ctx = buildEmailContext(rawBody || '');
        cleanBody = ctx.cleanBody;
        bodyHeadLines = ctx.bodyHeadLines || [];
        forwardedSender = ctx.forwardedSender || null;
        forwardedSubject = ctx.forwardedSubject || null;
    } else {
        const ctx = cleanEmailBodyAndExtractContext(rawBody || '');
        cleanBody = ctx.cleanBody;
        bodyHeadLines = ctx.bodyHeadLines;
        forwardedSender = ctx.forwardedSender;
        forwardedSubject = ctx.forwardedSubject;
    }

    const normalizedSender = String(sender || '').trim();
    const normalizedSubject = String(subject || '').trim();

    for (const group of matcher.groups) {
        if (!group.entityPatterns || !group.entityPatterns.length) continue;

        let entityMatched = false;
        if (typeof matchEmailEntityPatterns === 'function') {
            const m = matchEmailEntityPatterns(group.entityPatterns, normalizedSender, bodyHeadLines, forwardedSender);
            entityMatched = Boolean(m && m.matched);
        } else {
            entityMatched = testLocalEntityPatterns(group.entityPatterns, normalizedSender, bodyHeadLines, forwardedSender);
        }

        if (!entityMatched) continue;

        for (const subjectGroup of group.subjectGroups) {
            if (subjectGroup.subjectPattern) {
                let subMatch = false;
                try {
                    const patClean = cleanRegexPattern(subjectGroup.subjectPattern);
                    const rx = new RegExp(patClean, 'i');
                    subMatch = rx.test(normalizedSubject) || (forwardedSubject && rx.test(forwardedSubject)) || rx.test(cleanBody.slice(0, 300));
                } catch (e) {
                    subMatch = normalizedSubject.toLowerCase().indexOf(subjectGroup.subjectPattern.toLowerCase()) !== -1;
                }
                if (!subMatch) continue;
            }

            const ambiguous = subjectGroup.templates.length > 1;

            for (const template of subjectGroup.templates) {
                const matchPattern = template.match_pattern ? String(template.match_pattern).trim() : null;
                if (ambiguous && !matchPattern) continue;

                if (matchPattern) {
                    let mpMatch = false;
                    try {
                        const patClean = cleanRegexPattern(matchPattern);
                        const rx = new RegExp(patClean, 'i');
                        mpMatch = rx.test(cleanBody) || rx.test(normalizedSubject);
                    } catch (e) {
                        mpMatch = cleanBody.toLowerCase().indexOf(matchPattern.toLowerCase()) !== -1;
                    }
                    if (!mpMatch) continue;
                }

                const extractedAmount = extractFieldWithPattern(cleanBody, template.amount_regex);
                const parsedAmount = parseAmountFromRaw(extractedAmount);
                if (parsedAmount === null || isNaN(parsedAmount) || parsedAmount <= 0) {
                    continue;
                }

                const extractedMerchant = extractFieldWithPattern(cleanBody, template.merchant_regex);
                const extractedCurrency = extractFieldWithPattern(cleanBody, template.currency_regex);
                const extractedSourceAccount = extractFieldWithPattern(cleanBody, template.source_account_regex);
                const extractedDate = extractFieldWithPattern(cleanBody, template.date_regex);
                const extractedTime = extractFieldWithPattern(cleanBody, template.time_regex);

                const cleanMerchant = extractedMerchant ? extractedMerchant.trim() : null;
                const concept = template.expense_type_label && cleanMerchant
                    ? `${template.expense_type_label} · ${cleanMerchant}`
                    : cleanMerchant || template.expense_type_label || null;

                return {
                    templateId: template.id,
                    amount: parsedAmount,
                    currency: extractedCurrency ? extractedCurrency.trim() : null,
                    merchant: cleanMerchant,
                    entityId: template.entity_id || group.entityId || null,
                    sourceAccount: extractedSourceAccount ? extractedSourceAccount.trim() : null,
                    date: extractedDate ? extractedDate.trim() : null,
                    time: extractedTime ? extractedTime.trim() : null,
                    concept: concept,
                    expenseType: template.expense_type_label || null,
                };
            }
        }
    }

    return null;
}

function cleanRegexPattern(pattern) {
    if (!pattern) return '';
    let p = String(pattern).trim();
    if (p.startsWith('/') && p.lastIndexOf('/') > 0) {
        p = p.substring(1, p.lastIndexOf('/'));
    }
    return p;
}

function extractFieldWithPattern(text, regexPattern) {
    if (!regexPattern || !text) return null;
    const sanitized = cleanRegexPattern(regexPattern);
    if (!sanitized) return null;

    try {
        const rx = new RegExp(sanitized, 'i');
        const match = rx.exec(text) || rx.exec(text.replace(/\s+/g, ' '));
        if (!match) return null;

        for (let i = 1; i < match.length; i++) {
            if (match[i] !== undefined) {
                return String(match[i]).trim();
            }
        }
        return String(match[0]).trim();
    } catch (err) {
        return null;
    }
}

function parseAmountFromRaw(rawAmount) {
    if (!rawAmount) return null;
    const sanitized = String(rawAmount).replace(/[$\s]/g, '').trim();
    if (!sanitized) return null;

    let normalized = sanitized;
    if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(normalized)) {
        normalized = normalized.replace(/\./g, '').replace(',', '.');
    } else if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(normalized)) {
        normalized = normalized.replace(/,/g, '');
    } else if (/^\d+,\d{1,2}$/.test(normalized)) {
        normalized = normalized.replace(',', '.');
    } else if (/^\d+\.\d{1,2}$/.test(normalized)) {
        // Decimal estándar con punto
    } else {
        normalized = normalized.replace(/,/g, '');
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
}

function testLocalEntityPatterns(patterns, sender, bodyHeadLines, forwardedSender) {
    if (!patterns || !patterns.length) return false;
    const candidates = [sender];
    if (forwardedSender) candidates.push(forwardedSender);
    if (Array.isArray(bodyHeadLines)) {
        for (const line of bodyHeadLines) {
            candidates.push(line);
        }
    }

    for (const pat of patterns) {
        if (!pat) continue;
        const cleanPat = cleanRegexPattern(pat);
        try {
            const rx = new RegExp(cleanPat, 'i');
            for (const c of candidates) {
                if (c && rx.test(c)) return true;
            }
        } catch (e) {
            const lowerPat = String(pat).toLowerCase();
            for (const c of candidates) {
                if (c && String(c).toLowerCase().indexOf(lowerPat) !== -1) return true;
            }
        }
    }
    return false;
}

function cleanEmailBodyAndExtractContext(raw) {
    if (!raw) return { cleanBody: '', bodyHeadLines: [], forwardedSender: null, forwardedSubject: null };
    let text = String(raw);

    let forwardedSender = null;
    let forwardedSubject = null;
    const fwdMatch = text.match(/(?:de|from)\s*:\s*([^\n\r<]+)(?:<([^>]+)>)?/i);
    if (fwdMatch) {
        forwardedSender = (fwdMatch[2] || fwdMatch[1] || '').trim();
    }
    const fwdSubMatch = text.match(/(?:asunto|subject)\s*:\s*([^\n\r]+)/i);
    if (fwdSubMatch) {
        forwardedSubject = fwdSubMatch[1].trim();
    }

    text = text.replace(/<style[\s\S]*?<\/style>/gi, ' ')
               .replace(/<script[\s\S]*?<\/script>/gi, ' ')
               .replace(/<!--[\s\S]*?-->/g, ' ')
               .replace(/<br\s*\/?>/gi, '\n')
               .replace(/<\/(p|div|tr|h\d)>/gi, '\n')
               .replace(/<[^>]+>/g, ' ');

    text = text.replace(/&nbsp;/gi, ' ')
               .replace(/&amp;/gi, '&')
               .replace(/&lt;/gi, '<')
               .replace(/&gt;/gi, '>')
               .replace(/&quot;/gi, '"')
               .replace(/&#39;|&apos;|&#039;/gi, "'")
               .replace(/&aacute;/gi, 'á')
               .replace(/&eacute;/gi, 'é')
               .replace(/&iacute;/gi, 'í')
               .replace(/&oacute;/gi, 'ó')
               .replace(/&uacute;/gi, 'ú')
               .replace(/&ntilde;/gi, 'ñ');

    const lines = text.split(/\r?\n/)
                      .map(l => l.replace(/[ \t]+/g, ' ').trim())
                      .filter(Boolean);

    const cleanBody = lines.join('\n');
    const bodyHeadLines = lines.slice(0, 15);

    return {
        cleanBody: cleanBody,
        bodyHeadLines: bodyHeadLines,
        forwardedSender: forwardedSender,
        forwardedSubject: forwardedSubject,
    };
}

// ------------------------------------------------------------
// REGISTRO GLOBAL DE FUNCIONES COMPARTIDAS
// Previene ReferenceError en Google Apps Script si email-matching.js
// no fue cargado en el proyecto remoto.
// ------------------------------------------------------------
if (typeof createProductionEmailMatcher === 'undefined') {
    var createProductionEmailMatcher = function (templates, entities) {
        return createLocalProductionEmailMatcher(templates, entities);
    };
}

if (typeof matchEmailForProduction === 'undefined') {
    var matchEmailForProduction = function (matcher, sender, subject, body) {
        return executeLocalProductionMatch(matcher, sender, subject, body);
    };
}

if (typeof globalThis !== 'undefined') {
    if (typeof globalThis.createProductionEmailMatcher !== 'function') {
        globalThis.createProductionEmailMatcher = createProductionEmailMatcher;
    }
    if (typeof globalThis.matchEmailForProduction !== 'function') {
        globalThis.matchEmailForProduction = matchEmailForProduction;
    }
}

// ------------------------------------------------------------
// 3) ENVÍO DIRECTO DEL GASTO A /api/expenses
// ------------------------------------------------------------

function sendExpense(token, message, match) {
    const cleanToken = String(token || '').trim();

    const payload = {
        gmail_message_id: message.getId(),
        template_id: match.templateId,
        amount: match.amount,
        currency: match.currency,
        merchant: match.merchant,
        entity: match.entityId,
        source_account: match.sourceAccount,
        sourceAccount: match.sourceAccount,
        date: match.date,
        time: match.time,
        concept: match.concept,
        items: match.items || [],
        expense_type: match.expenseType || match.expense_type || null,
        received_at: message.getDate().toISOString(),
        is_draft: true,
        webhook_token: cleanToken,
        token: cleanToken,
    };

    const payloadJson = JSON.stringify(payload);

    console.log(
        `EXPENSE CREATE REQUEST | messageId=${message.getId()} | json=${payloadJson}`
    );

    const baseUrl = getBackendBaseUrl();
    const endpoint = `${baseUrl}/api/expenses?token=${encodeURIComponent(cleanToken)}`;

    const response = UrlFetchApp.fetch(
        endpoint,
        {
            method: 'post',
            contentType: 'application/json',
            headers: {
                Authorization: `Bearer ${cleanToken}`,
                'X-Webhook-Token': cleanToken,
            },
            payload: payloadJson,
            muteHttpExceptions: true,
        }
    );

    const code = response.getResponseCode();
    const responseText = response.getContentText();

    console.log(
        `EXPENSE CREATE RESPONSE | messageId=${message.getId()} | ` +
        `status=${code} | body=${responseText}`
    );

    if (code < 200 || code >= 300) {
        console.warn(
            `/api/expenses respondió ${code} para el mensaje ${message.getId()}: ${responseText}`
        );
        return {
            success: false,
            statusCode: code,
            error: responseText,
        };
    }

    return {
        success: true,
        statusCode: code,
        body: responseText,
    };
}

// ------------------------------------------------------------
// 4) CACHÉ DE PLANTILLAS
// ------------------------------------------------------------

function getTemplatesWithCache(token, forceRefresh = false) {
    const cache = CacheService.getUserCache();

    if (forceRefresh) {
        cache.remove('TEMPLATES_JSON');
        console.log('Caché de plantillas invalidado: renovación forzada');
    }

    const cached = cache.get('TEMPLATES_JSON');

    if (cached) {
        const templates = JSON.parse(cached);
        console.log(`Plantillas desde caché (${templates.length})`);
        return templates;
    }

    const baseUrl = getBackendBaseUrl();
    const response = UrlFetchApp.fetch(
        `${baseUrl}/api/email-templates`,
        {
            headers: {
                Authorization: `Bearer ${token}`,
            },
            muteHttpExceptions: true,
        }
    );

    if (response.getResponseCode() !== 200) {
        console.warn(
            `No se pudieron obtener plantillas del backend (código ${response.getResponseCode()}): ${response.getContentText()}`
        );
        return [];
    }

    const templates = JSON.parse(response.getContentText());

    cache.put(
        'TEMPLATES_JSON',
        JSON.stringify(templates),
        TEMPLATES_CACHE_SECONDS
    );

    console.log(`Plantillas descargadas del backend y cacheadas (${templates.length})`);
    return templates;
}

function forceRefreshTemplates() {
    const token = getWebhookToken();

    if (!token) {
        throw new Error(
            'No hay token conectado. Conecta primero desde el link normal de la app.'
        );
    }

    return getTemplatesWithCache(token, true);
}

function refreshTemplatesCacheForTest() {
    return forceRefreshTemplates().map(t => ({
        id: t.id,
        name: t.name || t.id,
    }));
}

// ------------------------------------------------------------
// 5) UTILIDADES DE APPS SCRIPT
// ------------------------------------------------------------

function getWebhookToken() {
    const stored = PropertiesService
        .getUserProperties()
        .getProperty('WEBHOOK_TOKEN');
    return stored ? stored.trim() : null;
}

function getBackendBaseUrl() {
    const custom = PropertiesService
        .getUserProperties()
        .getProperty('BACKEND_BASE_URL');
    return (custom && custom.trim()) ? custom.trim().replace(/\/+$/, '') : BACKEND_BASE_URL;
}

function getLastSyncEpoch() {
    const stored = PropertiesService
        .getUserProperties()
        .getProperty('LAST_SYNC_EPOCH');

    if (stored) {
        return Number(stored);
    }

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    return Math.floor(startOfToday.getTime() / 1000);
}

function setLastSyncEpoch(epochSeconds) {
    PropertiesService
        .getUserProperties()
        .setProperty('LAST_SYNC_EPOCH', String(epochSeconds));
}

function ensureLabelExists(name) {
    if (!GmailApp.getUserLabelByName(name)) {
        GmailApp.createLabel(name);
    }
}
