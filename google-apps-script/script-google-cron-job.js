/**
 * ============================================================
 * DETECCIÓN DE GASTOS POR CORREO — Apps Script
 * ============================================================
 *
 * IMPORTANTE:
 *
 * Este archivo NO contiene una implementación propia del matching.
 *
 * En el proyecto de Google Apps Script deben existir también:
 *   - email-cleaning.js  ← generado desde email-cleaning.ts
 *   - email-matching.js  ← generado desde email-matching.ts
 *
 * Los tres archivos comparten el mismo scope global de Apps Script.
 * Por tanto, el cron llama directamente a las funciones del código compartido.
 *
 * FUENTE ÚNICA DE VERDAD:
 *   email-cleaning.ts
 *   email-matching.ts
 *
 * Para regenerar los .js compartidos:
 *   node build-google-script-engine.js
 * ============================================================
 */

const BACKEND_BASE_URL = 'https://deudita-nine.vercel.app';
const PROCESSED_LABEL = 'gastos-procesados';
const TEMPLATES_CACHE_SECONDS = 21600; // 6 horas.
const MAX_THREADS_PER_RUN = 50;
const DEBUG_MATCHING = false;

// ------------------------------------------------------------
// 1) CONEXIÓN INICIAL
// ------------------------------------------------------------

function doGet(e) {
  if (e && e.parameter && e.parameter.mode === 'test') {
    return renderEmailTestApp();
  }

  const token = e && e.parameter ? e.parameter.token : null;

  if (!token) {
    return HtmlService.createHtmlOutput(
      '<p>Falta el token de conexión. Vuelve a la app y presiona "Conectar Gmail" de nuevo.</p>'
    );
  }

  const props = PropertiesService.getUserProperties();
  props.setProperty('WEBHOOK_TOKEN', token);
  CacheService.getUserCache().remove('TEMPLATES_JSON');

  ensureLabelExists(PROCESSED_LABEL);
  installTriggerIfMissing();

  try {
    syncExpenseEmails();
  } catch (err) {
    console.warn(`Primera sincronización falló: ${err && err.message ? err.message : err}`);
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

function syncExpenseEmails() {
  const startTime = Date.now();
  const token = getWebhookToken();

  if (!token) {
    console.warn('syncExpenseEmails: usuario sin WEBHOOK_TOKEN.');
    return;
  }

  const label = GmailApp.getUserLabelByName(PROCESSED_LABEL) ||
    GmailApp.createLabel(PROCESSED_LABEL);

  const templates = getTemplatesWithCache(token);
  if (!templates.length) {
    console.log('No hay plantillas disponibles.');
    return;
  }

  // La adaptación del payload de la API al catálogo que consume el motor es
  // infraestructura del cron. El matching/extracción pertenece al motor
  // compartido y vive en email-matching.ts.
  const entities = buildCatalogEntitiesFromTemplates(templates);
  const matcher = createProductionEmailMatcher(templates, entities);

  const sinceEpoch = getLastSyncEpoch();
  const query = `in:inbox -label:${PROCESSED_LABEL} after:${sinceEpoch}`;
  const threads = GmailApp.search(query, 0, MAX_THREADS_PER_RUN);

  let latestMessageEpoch = sinceEpoch;
  let messagesProcessed = 0;
  let matchesFound = 0;
  let candidatesSent = 0;
  let candidatesFailed = 0;
  const matchesByTemplate = {};
  const processedThreads = [];

  for (const thread of threads) {
    const messages = thread.getMessages();

    for (const message of messages) {
      messagesProcessed++;

      const messageDate = message.getDate();
      const messageEpoch = Math.floor(messageDate.getTime() / 1000);
      if (messageEpoch > latestMessageEpoch) {
        latestMessageEpoch = messageEpoch;
      }

      const subject = message.getSubject() || '';
      const sender = message.getFrom() || '';
      const body = message.getPlainBody() || '';

      // ESTA ES LA ÚNICA llamada de matching del cron.
      // La implementación viene directamente de email-matching.ts.
      const match = matchEmailForProduction(
        matcher,
        sender,
        subject,
        body
      );

      if (!match) continue;

      matchesFound++;
      matchesByTemplate[match.templateId] =
        (matchesByTemplate[match.templateId] || 0) + 1;

      if (DEBUG_MATCHING) {
        console.log(
          `MATCH ${match.templateId} | ${sender} | ${subject} | ${match.amount}`
        );
      }

      const sent = sendCandidate(token, message, match);
      if (sent) {
        candidatesSent++;
      } else {
        candidatesFailed++;
      }
    }

    processedThreads.push(thread);
  }

  if (processedThreads.length) {
    label.addToThreads(processedThreads);
  }

  if (threads.length > 0) {
    setLastSyncEpoch(latestMessageEpoch - 60);
  }

  const durationMs = Date.now() - startTime;

  console.log(
    `Sync: hilos=${threads.length}, correos=${messagesProcessed}, ` +
    `matches=${matchesFound}, enviados=${candidatesSent}, ` +
    `errores=${candidatesFailed}, duración_ms=${durationMs}`
  );

  if (matchesFound > 0) {
    console.log(`Matches por plantilla: ${JSON.stringify(matchesByTemplate)}`);
  }
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
        name: template.entity && template.entity.name
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

// ------------------------------------------------------------
// 3) ENVÍO DEL CANDIDATO
// ------------------------------------------------------------

function sendCandidate(token, message, match) {
  const response = UrlFetchApp.fetch(
    `${BACKEND_BASE_URL}/api/expense-candidate`,
    {
      method: 'post',
      contentType: 'application/json',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      payload: JSON.stringify({
        gmail_message_id: message.getId(),
        template_id: match.templateId,
        amount: match.amount,
        currency: match.currency,
        merchant: match.merchant,
        entity: match.entityId,
        sourceAccount: match.sourceAccount,
        date: match.date,
        time: match.time,
        concept: match.concept,
        received_at: message.getDate().toISOString(),
      }),
      muteHttpExceptions: true,
    }
  );

  const code = response.getResponseCode();

  if (code < 200 || code >= 300) {
    console.warn(
      `expense-candidate respondió ${code} para el mensaje ${message.getId()}: ${response.getContentText()}`
    );
    return false;
  }

  return true;
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

  const response = UrlFetchApp.fetch(
    `${BACKEND_BASE_URL}/api/email-templates`,
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
  return PropertiesService
    .getUserProperties()
    .getProperty('WEBHOOK_TOKEN');
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
