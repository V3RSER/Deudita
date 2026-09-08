/**
 * ============================================================
 * DETECCIÓN DE GASTOS POR CORREO — Apps Script (Web App único)
 * ============================================================
 * Se despliega UNA sola vez como Web App ("Ejecutar como: el usuario
 * que accede a la app"). Cada amigo se conecta con un solo clic en
 * el link que le da tu app (con su token ya incluido) — no necesita
 * copiar código ni tokens a mano.
 */

const BACKEND_BASE_URL = 'https://deudita-nine.vercel.app'; // <-- cambiar por tu dominio real
const PROCESSED_LABEL = 'gastos-procesados';
const TEMPLATES_CACHE_SECONDS = 21600; // 6 horas — tope máximo que permite CacheService
const DEBUG_MATCHING = true; // true = loguea el motivo por el que CADA plantilla no matcheó un correo.
// Ponlo en false cuando ya no lo necesites — genera bastante ruido en el log.

// ------------------------------------------------------------
// 1) CONEXIÓN INICIAL (doGet) — se activa desde el link que la app genera
// ------------------------------------------------------------

function doGet(e) {
  if (e.parameter.mode === 'test') {
    return testGet();
  }

  const token = e.parameter.token;

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
    // No bloqueamos la confirmación al usuario por un error puntual en la primera corrida.
  }

  return HtmlService.createHtmlOutput(
    '<p>✅ Listo. Tu detección de gastos por correo está activa. Puedes cerrar esta pestaña.</p>'
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
    console.warn(
      'syncExpenseEmails: usuario sin WEBHOOK_TOKEN — no debería pasar si el trigger es suyo.'
    );
    return;
  }

  ensureLabelExists(PROCESSED_LABEL);

  const label = GmailApp.getUserLabelByName(PROCESSED_LABEL);
  const templates = getTemplatesWithCache(token);

  console.log(`Plantillas disponibles: ${templates.length}`);

  const entityGroups = groupTemplatesByEntity(templates);

  console.log(`Entidades con plantillas activas: ${entityGroups.length}`);

  const sinceEpoch = getLastSyncEpoch();

  console.log(
    `Ventana de búsqueda: desde ${new Date(sinceEpoch * 1000).toISOString()}`
  );

  const query = `in:inbox -label:${PROCESSED_LABEL} after:${sinceEpoch}`;
  const threads = GmailApp.search(query, 0, 50);

  console.log(`Hilos recuperados: ${threads.length}`);

  let latestMessageEpoch = sinceEpoch;
  let messagesProcessed = 0;
  let matchesFound = 0;
  let candidatesSent = 0;
  let candidatesFailed = 0;

  const matchesByTemplate = {};

  threads.forEach(thread => {
    thread.getMessages().forEach(message => {
      messagesProcessed++;

      const messageEpoch = Math.floor(message.getDate().getTime() / 1000);

      if (messageEpoch > latestMessageEpoch) {
        latestMessageEpoch = messageEpoch;
      }

      const subject = message.getSubject();
      const sender = message.getFrom();

      const match = matchAgainstTemplates(message, entityGroups);

      if (match) {
        matchesFound++;

        matchesByTemplate[match.templateId] =
          (matchesByTemplate[match.templateId] || 0) + 1;

        console.log(
          `✅ "${subject}" (de: ${sender}) → match con plantilla ${match.templateId}, monto=${match.amount}, concept="${match.concept}"`
        );

        const sent = sendCandidate(token, message, match);

        if (sent) {
          candidatesSent++;
        } else {
          candidatesFailed++;
        }
      } else {
        console.log(
          `✋ "${subject}" (de: ${sender}) → sin match con ninguna plantilla`
        );
      }
    });

    thread.addLabel(label);
  });

  setLastSyncEpoch(latestMessageEpoch - 60);

  const durationMs = Date.now() - startTime;

  console.log(
    `Resumen sync: correos=${messagesProcessed}, matches=${matchesFound}, ` +
    `enviados_ok=${candidatesSent}, enviados_error=${candidatesFailed}, ` +
    `duración_ms=${durationMs}`
  );

  if (matchesFound > 0) {
    console.log(
      `Matches por plantilla: ${JSON.stringify(matchesByTemplate)}`
    );
  }

  if (candidatesFailed > 0) {
    console.warn(
      `${candidatesFailed} candidato(s) NO se pudieron enviar al backend — revisar conectividad o el endpoint.`
    );
  }
}

/**
 * Limpia el cuerpo de un correo antes de aplicarle cualquier regex.
 * Protege direcciones de email en encabezados (RFC 5322) para que no sean borradas como tags HTML.
 */
function cleanEmailBody(bodyText) {
  if (!bodyText) return "";
  var text = String(bodyText);

  // 1. Normalizar saltos de línea
  text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // 2. Normalizar correos en cabeceras envueltos con saltos de línea dentro de < y >:
  // Ej: "From: Alertas <\n  alertas@bancolombia.com>" -> "From: Alertas <alertas@bancolombia.com>"
  text = text.replace(/<\s*\n\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\s*>/gi, '<$1>');
  text = text.replace(/((?:^|\n)\s*(?:from|de|to|para|cc|reply-to)\s*:[^\n\r<]*?)\s*<\s*\n\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\s*>/gim, '$1 <$2>');

  // 3. Proteger direcciones de correo dentro de <...> mediante tokens temporales
  // para evitar que la limpieza HTML por regex las destruya.
  var emailTokens = {};
  var tokenCounter = 0;
  text = text.replace(/<\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\s*>/gi, function (match, email) {
    var token = '__EMAIL_ADDR_TOKEN_' + (tokenCounter++) + '__';
    emailTokens[token] = '<' + email.trim() + '>';
    return token;
  });

  // 4. Si el texto contiene fragmentos o etiquetas HTML, convertirlos a texto plano
  if (/<[a-z!/][\s\S]*>/i.test(text)) {
    text = text
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '')
      .replace(/<br\s*[\/]?>/gi, '\n')
      .replace(/<\/(p|div|tr|h[1-6]|li|table|blockquote)>/gi, '\n')
      .replace(/<(td|th)[^>]*>/gi, ' ')
      .replace(/<https?:\/\/[^\s>]+>/g, '')    // Eliminar <https://...>
      .replace(/<[^>]+>/g, '')                 // Eliminar etiquetas HTML (los correos están protegidos)
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, function (_, dec) { return String.fromCharCode(parseInt(dec, 10)); });
  }

  // 5. Restaurar las direcciones de correo protegidas
  text = text.replace(/__EMAIL_ADDR_TOKEN_(\d+)__/g, function (match) {
    return emailTokens[match] || match;
  });

  // 6. 6 reglas de limpieza idénticas al frontend y backend
  return text
    .replace(/\[image:[^\]]*\]/gi, '')
    .replace(/<https?:\/\/[^\s>]+>/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\*/g, '')
    .replace(/[ \zt]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
/**
 * Prueba una regex contra el texto directo y, si no encuentra coincidencia,
 * contra el cuerpo del correo.
 */
function matchesEitherSource(pattern, directText, body) {
  const regex = new RegExp(pattern, 'i');
  return regex.test(directText) || regex.test(body);
}

/**
 * Normaliza montos en formato colombiano/latinoamericano a string "NNNN.dd".
 */
function normalizeAmount(rawAmount) {
  if (!rawAmount) return rawAmount;

  let s = String(rawAmount)
    .replace(/\s|\$|COP/g, '')
    .trim();

  if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, '');
  } else if (/^\d{1,3}(\.\d{3})+,\d{1,2}$/.test(s)) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(s)) {
    s = s.replace(/,/g, '');
  } else if (/^\d+,\d{1,2}$/.test(s)) {
    s = s.replace(',', '.');
  }

  const num = parseFloat(s);

  if (isNaN(num)) {
    return rawAmount;
  }

  return num.toFixed(2);
}

/**
 * Convierte un string según date_format.
 *
 * date_format debe contener únicamente YYYY, MM y DD.
 *
 * Ejemplos:
 *   DD/MM/YYYY
 *   YYYY-MM-DD
 *   MM/DD/YYYY
 */
function parseDateWithFormat(rawDateStr, formatStr) {
  if (!rawDateStr || !formatStr) return null;

  const tokenOrder = [];

  const tokenRegexSource = formatStr.replace(
    /YYYY|MM|DD/g,
    match => {
      tokenOrder.push(match);
      return match === 'YYYY'
        ? '(\\d{4})'
        : '(\\d{1,2})';
    }
  );

  try {
    const match = rawDateStr.match(
      new RegExp(tokenRegexSource)
    );

    if (!match) {
      return null;
    }

    const parts = {
      YYYY: '1970',
      MM: '01',
      DD: '01',
    };

    tokenOrder.forEach((token, i) => {
      parts[token] = match[i + 1].padStart(
        token === 'YYYY' ? 4 : 2,
        '0'
      );
    });

    return `${parts.YYYY}-${parts.MM}-${parts.DD}`;
  } catch (err) {
    console.warn(
      `Formato de fecha inválido "${formatStr}": ${err.message}`
    );

    return null;
  }
}

/**
 * Convierte un string según time_format.
 *
 * time_format debe contener únicamente HH, mm y ss.
 *
 * Ejemplos:
 *   HH:mm
 *   HH:mm:ss
 */
function parseTimeWithFormat(rawTimeStr, formatStr) {
  if (!rawTimeStr || !formatStr) return null;

  const tokenOrder = [];

  const tokenRegexSource = formatStr.replace(
    /HH|mm|ss/g,
    match => {
      tokenOrder.push(match);
      return '(\\d{1,2})';
    }
  );

  try {
    const match = rawTimeStr.match(
      new RegExp(tokenRegexSource)
    );

    if (!match) {
      return null;
    }

    const parts = {
      HH: '00',
      mm: '00',
      ss: '00',
    };

    tokenOrder.forEach((token, i) => {
      parts[token] = match[i + 1].padStart(2, '0');
    });

    return `${parts.HH}:${parts.mm}:${parts.ss}`;
  } catch (err) {
    console.warn(
      `Formato de hora inválido "${formatStr}": ${err.message}`
    );

    return null;
  }
}

/**
 * Normaliza fecha y hora utilizando exclusivamente sus formatos independientes.
 *
 * date_regex + date_format → date
 * time_regex + time_format → time
 *
 * No admite formatos combinados de fecha y hora.
 */
function normalizeDateTime(
  dateRaw,
  timeRaw,
  dateFormat,
  timeFormat
) {
  const effectiveTimeFormat = timeFormat || 'HH:mm:ss';
  return {
    date:
      dateRaw && dateFormat
        ? parseDateWithFormat(dateRaw, dateFormat)
        : null,

    time:
      timeRaw
        ? parseTimeWithFormat(timeRaw, effectiveTimeFormat)
        : null,
  };
}

/**
 * Arma el título compuesto tipo:
 * "Pago · AGUAS DE CARTAGENA"
 */
function buildConcept(
  expenseTypeLabel,
  merchant
) {
  const cleanMerchant = merchant
    ? StringUtils_toTitleCase(merchant.trim())
    : null;

  if (expenseTypeLabel && cleanMerchant) {
    return `${expenseTypeLabel} · ${cleanMerchant}`;
  }

  if (cleanMerchant) {
    return cleanMerchant;
  }

  if (expenseTypeLabel) {
    return expenseTypeLabel;
  }

  return null;
}

/**
 * Title Case básico para nombres de comercio.
 */
function StringUtils_toTitleCase(str) {
  return str
    .toLowerCase()
    .replace(
      /(^|\s)([a-záéíóúñ])/g,
      (m, sep, c) => sep + c.toUpperCase()
    );
}

/**
 * Agrupa las plantillas por entidad.
 */
function groupTemplatesByEntity(templates) {
  const byEntity = {};

  templates.forEach(t => {
    if (!t.entity_id) {
      console.warn(
        `Plantilla "${t.name || t.id}" no tiene entity_id — se ignora, nunca matcheará ningún correo. Asígnale una entidad.`
      );
      return;
    }

    if (!byEntity[t.entity_id]) {
      byEntity[t.entity_id] = {
        entityId: t.entity_id,
        entityName: (t.entity && t.entity.name) || t.entity_id,
        emailPatterns: t.entity_email_patterns || [],
        templates: [],
      };
    }

    byEntity[t.entity_id].templates.push(t);
  });

  return Object.values(byEntity);
}

/**
 * Devuelve las primeras N líneas no vacías del cuerpo, para buscar ahí
 * el remitente/entidad real cuando el correo llegó reenviado (p. ej. por
 * una regla de Outlook) y message.getFrom() apunta al correo personal
 * en vez de al remitente original.
 */
function getHeadLines(body, maxLines) {
  if (!body) return '';
  return body
    .split('\n')
    .slice(0, maxLines || 10)
    .join('\n');
}

/**
 * Prueba un correo contra los patrones de correo de una entidad.
 * Revisa primero el remitente (sender) y, si no coincide, también las
 * primeras 10 líneas del cuerpo, donde suele quedar el remitente original
 * cuando el correo fue reenviado automáticamente por una regla (Outlook, etc.).
 */
function matchesEntityEmail(emailPatterns, sender, bodyHeadLines) {
  return emailPatterns.some(pattern => {
    try {
      const regex = new RegExp(pattern, 'i');
      return regex.test(sender || '') || regex.test(bodyHeadLines || '');
    } catch {
      return false;
    }
  });
}

/**
 * Prueba un mensaje contra las plantillas. Uso en producción (sync cron):
 * recorre niveles 1→4 y retorna el primer match (o null). No construye
 * reportes intermedios, para no gastar ciclos de más en cada ejecución
 * del trigger. Para diagnóstico nivel-por-nivel usa
 * diagnoseMessageAgainstTemplates, que comparte toda esta misma lógica.
 */
function matchAgainstTemplates(
  message,
  entityGroups
) {
  const sender = message.getFrom();
  const subject = message.getSubject();
  const body = cleanEmailBody(
    message.getPlainBody()
  );
  const bodyHeadLines = getHeadLines(body, 10);

  for (const group of entityGroups) {
    if (group.emailPatterns.length === 0) {
      if (DEBUG_MATCHING) console.log(`  → entidad ${group.entityId}: descartada, no tiene entity_email_patterns`);
      continue;
    }
    if (!matchesEntityEmail(group.emailPatterns, sender, bodyHeadLines)) {
      if (DEBUG_MATCHING) console.log(`  → entidad ${group.entityId}: descartada, ningún entity_email_pattern coincide con el remitente ni con las primeras 10 líneas del cuerpo`);
      continue;
    }
    if (DEBUG_MATCHING) {
      const matchedOnSender = group.emailPatterns.some(p => { try { return new RegExp(p, 'i').test(sender || ''); } catch { return false; } });
      console.log(`  ✓ entidad ${group.entityId}: entity_email_pattern coincidió con ${matchedOnSender ? 'el remitente' : 'las primeras 10 líneas del cuerpo (correo reenviado)'}; evaluando ${group.templates.length} plantilla(s)`);
    }

    const bySubject = {};

    group.templates.forEach(t => {
      const key =
        t.subject_pattern ||
        `__no_subject_${t.id}`;

      if (!bySubject[key]) {
        bySubject[key] = [];
      }

      bySubject[key].push(t);
    });

    for (const key of Object.keys(bySubject)) {
      const candidates = bySubject[key];
      const first = candidates[0];

      if (
        first.subject_pattern &&
        !matchesEitherSource(
          first.subject_pattern,
          subject,
          body
        )
      ) {
        if (DEBUG_MATCHING) {
          console.log(
            `  → subject_pattern "${first.subject_pattern}": descartado (${candidates.length} plantilla(s) omitida(s))`
          );
        }

        continue;
      }

      const toEvaluate =
        candidates.length > 1
          ? candidates.filter(t => {
            if (!t.match_pattern) {
              if (DEBUG_MATCHING) {
                console.log(
                  `  → plantilla "${t.name}": ambigua con otra(s) del mismo asunto y SIN match_pattern definido — se omite (definir match_pattern en la plantilla)`
                );
              }

              return false;
            }

            const regex = new RegExp(
              t.match_pattern,
              'i'
            );

            const matched =
              regex.test(body) ||
              regex.test(subject);

            if (
              !matched &&
              DEBUG_MATCHING
            ) {
              console.log(
                `  → plantilla "${t.name}": match_pattern "${t.match_pattern}" no encontrado, se descarta`
              );
            }

            return matched;
          })
          : candidates;

      for (const t of toEvaluate) {
        const result =
          tryExtractFromTemplate(
            t,
            sender,
            subject,
            body
          );

        if (result) {
          return result;
        }
      }
    }
  }

  return null;
}

/**
 * Igual que matchAgainstTemplates, pero en vez de devolver solo el primer
 * match, construye un reporte completo de los 4 niveles de filtrado
 * (entidad, asunto, desempate, extracción) para cada plantilla evaluada.
 * Reutiliza exactamente las mismas funciones que producción — nunca hay
 * dos implementaciones del matching corriendo en paralelo.
 *
 * Se usa desde el panel de pruebas (testMessageAgainstTemplates).
 */
function diagnoseMessageAgainstTemplates(message, entityGroups) {
  const sender = message.getFrom();
  const subject = message.getSubject();
  const body = cleanEmailBody(message.getPlainBody());
  const bodyHeadLines = getHeadLines(body, 10);

  const level1 = { passedEntities: [], discardedEntities: [] };
  const level2 = { passedGroups: [], discardedGroups: [] };
  const level3 = { candidates: [], discardedCandidates: [] };
  const extractions = [];
  let winner = null;

  for (const group of entityGroups) {
    const entityLabel = group.entityName || group.entityId;

    if (group.emailPatterns.length === 0) {
      level1.discardedEntities.push({
        entityId: group.entityId,
        entityName: entityLabel,
        patterns: [],
        matched: false,
        reason: 'La entidad no tiene entity_email_patterns; no puede participar en el matching.',
        templatesCount: group.templates.length,
      });
      continue;
    }

    const matchedOnSender = group.emailPatterns.some(p => {
      try { return new RegExp(p, 'i').test(sender || ''); } catch { return false; }
    });
    const matchedOnBody = !matchedOnSender && group.emailPatterns.some(p => {
      try { return new RegExp(p, 'i').test(bodyHeadLines || ''); } catch { return false; }
    });
    const entityMatched = matchedOnSender || matchedOnBody;

    if (!entityMatched) {
      level1.discardedEntities.push({
        entityId: group.entityId,
        entityName: entityLabel,
        patterns: group.emailPatterns,
        matched: false,
        reason: `Ningún patrón (${group.emailPatterns.map(p => `/${p}/i`).join(', ')}) coincidió con el remitente ni con las primeras 10 líneas del cuerpo.`,
        templatesCount: group.templates.length,
      });
      continue;
    }

    level1.passedEntities.push({
      entityId: group.entityId,
      entityName: entityLabel,
      patterns: group.emailPatterns,
      matched: true,
      matchedOn: matchedOnSender ? 'sender' : 'body',
      templatesCount: group.templates.length,
    });

    const bySubject = {};
    group.templates.forEach(t => {
      const key = t.subject_pattern || `__no_subject_${t.id}`;
      if (!bySubject[key]) bySubject[key] = [];
      bySubject[key].push(t);
    });

    for (const key of Object.keys(bySubject)) {
      const candidates = bySubject[key];
      const first = candidates[0];
      const subjectPassed =
        !first.subject_pattern ||
        matchesEitherSource(first.subject_pattern, subject, body);

      const groupReport = {
        entityId: group.entityId,
        entityName: entityLabel,
        subjectPattern: first.subject_pattern || null,
        matched: subjectPassed,
        templatesCount: candidates.length,
        templateNames: candidates.map(t => t.name),
      };

      if (!subjectPassed) {
        groupReport.reason = `El patrón de asunto "${first.subject_pattern}" no coincidió con el asunto ni con el cuerpo.`;
        level2.discardedGroups.push(groupReport);
        continue;
      }
      groupReport.matchedOn = first.subject_pattern ? 'subject' : undefined;
      level2.passedGroups.push(groupReport);

      const toEvaluate = candidates.length > 1
        ? candidates.filter(t => {
          const matchPat = t.match_pattern;
          if (!matchPat) {
            level3.discardedCandidates.push({
              templateId: t.id,
              templateName: t.name,
              matchPattern: null,
              isAmbiguousGroup: true,
              matched: false,
              reason: 'Plantilla ambigua con otra(s) del mismo asunto y SIN match_pattern definido — se descarta (define match_pattern para desambiguar).',
            });
            return false;
          }
          try {
            const regex = new RegExp(matchPat, 'i');
            const matched = regex.test(body) || regex.test(subject);
            if (!matched) {
              level3.discardedCandidates.push({
                templateId: t.id,
                templateName: t.name,
                matchPattern: matchPat,
                isAmbiguousGroup: true,
                matched: false,
                reason: `match_pattern "${matchPat}" no se encontró en el asunto ni en el cuerpo.`,
              });
            } else {
              level3.candidates.push({
                templateId: t.id,
                templateName: t.name,
                matchPattern: matchPat,
                isAmbiguousGroup: true,
                matched: true,
              });
            }
            return matched;
          } catch (err) {
            level3.discardedCandidates.push({
              templateId: t.id,
              templateName: t.name,
              matchPattern: matchPat,
              isAmbiguousGroup: true,
              matched: false,
              reason: `match_pattern inválido: ${err.message}`,
            });
            return false;
          }
        })
        : candidates;

      if (candidates.length === 1) {
        level3.candidates.push({
          templateId: first.id,
          templateName: first.name,
          matchPattern: first.match_pattern || null,
          isAmbiguousGroup: false,
          matched: true,
        });
      }

      for (const t of toEvaluate) {
        const result = tryExtractFromTemplate(t, sender, subject, body);
        const report = {
          templateId: t.id,
          templateName: t.name,
          overallPassed: Boolean(result),
        };

        if (result) {
          report.extractedAmount = result.amount;
          report.extractedMerchant = result.merchant;
          report.extractedDate = result.date;
          report.extractedTime = result.time;
          report.extractedCurrency = result.currency;
          report.extractedSourceAccount = result.sourceAccount;
          extractions.push(report);
          if (!winner) winner = result;
        } else {
          report.reason = 'amount_regex no encontró nada en el cuerpo, o el monto extraído no se pudo normalizar a número.';
          extractions.push(report);
        }
      }
    }
  }

  return {
    matched: Boolean(winner),
    winner,
    cleanedBody: body,
    level1,
    level2,
    level3,
    extractions,
  };
}

/**
 * Intenta extraer los datos de un correo usando una plantilla específica.
 */
function tryExtractFromTemplate(
  t,
  sender,
  subject,
  body
) {
  try {
    const amountMatch =
      body.match(
        new RegExp(
          t.amount_regex,
          'i'
        )
      );

    if (!amountMatch) {
      if (DEBUG_MATCHING) {
        console.log(
          `  → plantilla "${t.name}": pasó los filtros previos, pero amount_regex no encontró nada en el cuerpo`
        );
      }

      return null;
    }

    const merchantMatch =
      t.merchant_regex
        ? body.match(
          new RegExp(
            t.merchant_regex,
            'i'
          )
        )
        : null;

    const dateMatch =
      t.date_regex
        ? body.match(
          new RegExp(
            t.date_regex,
            'i'
          )
        )
        : null;

    const timeMatch =
      t.time_regex
        ? body.match(
          new RegExp(
            t.time_regex,
            'i'
          )
        )
        : null;

    const currencyMatch =
      t.currency_regex
        ? body.match(
          new RegExp(
            t.currency_regex,
            'i'
          )
        )
        : null;

    const sourceAccountMatch =
      t.source_account_regex
        ? body.match(
          new RegExp(
            t.source_account_regex,
            'i'
          )
        )
        : null;

    const merchant =
      merchantMatch
        ? (merchantMatch[1] !== undefined ? merchantMatch[1] : merchantMatch[0]).trim()
        : null;

    const currency =
      currencyMatch
        ? (currencyMatch[1] !== undefined ? currencyMatch[1] : currencyMatch[0])
        : null;

    const rawDate = dateMatch ? (dateMatch[1] !== undefined ? dateMatch[1] : dateMatch[0]) : null;
    const rawTime = timeMatch ? (timeMatch[1] !== undefined ? timeMatch[1] : timeMatch[0]) : null;

    const dt = normalizeDateTime(
      rawDate,
      rawTime,
      t.date_format,
      t.time_format
    );

    const rawAmount = amountMatch[1] !== undefined ? amountMatch[1] : amountMatch[0];
    const normalizedAmount =
      normalizeAmount(
        rawAmount
      );

    const numericAmount =
      Number(normalizedAmount);

    if (isNaN(numericAmount)) {
      if (DEBUG_MATCHING) {
        console.log(
          `  → plantilla "${t.name}": amount_regex matcheó "${rawAmount}" pero no se pudo normalizar a número, se descarta`
        );
      }

      return null;
    }

    return {
      templateId: t.id,
      amount: numericAmount,
      currency: currency,
      merchant: merchant,
      entityId: t.entity_id,
      sourceAccount:
        sourceAccountMatch
          ? (sourceAccountMatch[1] !== undefined ? sourceAccountMatch[1] : sourceAccountMatch[0])
          : null,
      date:
        dt.date,
      time:
        dt.time,
      concept:
        buildConcept(
          t.expense_type_label,
          merchant
        ) || (merchant ? StringUtils_toTitleCase(merchant) : null),
    };
  } catch (regexError) {
    console.warn(
      `Plantilla ${t.id} (${t.name || 'sin nombre'}) tiene una regex inválida: ${regexError.message}`
    );

    return null;
  }
}

function sendCandidate(
  token,
  message,
  match
) {
  const response =
    UrlFetchApp.fetch(
      `${BACKEND_BASE_URL}/api/expense-candidate`,
      {
        method: 'post',
        contentType:
          'application/json',
        headers: {
          Authorization:
            `Bearer ${token}`,
        },
        payload: JSON.stringify({
          gmail_message_id:
            message.getId(),
          template_id:
            match.templateId,
          amount:
            match.amount,
          currency:
            match.currency,
          merchant:
            match.merchant,
          entity:
            match.entity,
          sourceAccount:
            match.sourceAccount,
          date:
            match.date,
          time:
            match.time,
          concept:
            match.concept,
          received_at:
            message.getDate().toISOString(),
        }),
        muteHttpExceptions:
          true,
      }
    );

  const code =
    response.getResponseCode();

  if (
    code < 200 ||
    code >= 300
  ) {
    console.warn(
      `expense-candidate respondió ${code} para el mensaje ${message.getId()}: ${response.getContentText()}`
    );

    return false;
  }

  return true;
}

// ------------------------------------------------------------
// 3) CACHÉ DE PLANTILLAS
// ------------------------------------------------------------

function getTemplatesWithCache(
  token,
  forceRefresh = false
) {
  const cache =
    CacheService.getUserCache();

  // Cuando se solicita una renovación explícita, eliminamos primero
  // la entrada actual para garantizar que la siguiente lectura vaya
  // al backend y vuelva a guardar el resultado nuevo en caché.
  if (forceRefresh) {
    cache.remove('TEMPLATES_JSON');
    console.log('Caché de plantillas invalidado: renovación forzada');
  }

  const cached =
    cache.get(
      'TEMPLATES_JSON'
    );

  if (cached) {
    const templates =
      JSON.parse(cached);

    console.log(
      `Plantillas desde caché (${templates.length})`
    );

    return templates;
  }

  const response =
    UrlFetchApp.fetch(
      `${BACKEND_BASE_URL}/api/email-templates`,
      {
        headers: {
          Authorization:
            `Bearer ${token}`,
        },
        muteHttpExceptions:
          true,
      }
    );

  if (
    response.getResponseCode() !==
    200
  ) {
    console.warn(
      `No se pudieron obtener plantillas del backend (código ${response.getResponseCode()}): ${response.getContentText()}`
    );

    return [];
  }

  const templates =
    JSON.parse(
      response.getContentText()
    );

  cache.put(
    'TEMPLATES_JSON',
    JSON.stringify(
      templates
    ),
    TEMPLATES_CACHE_SECONDS
  );

  console.log(
    `Plantillas descargadas del backend y cacheadas (${templates.length})`
  );

  return templates;
}

/**
 * Fuerza un refresco inmediato de las plantillas.
 */
function forceRefreshTemplates() {
  const token =
    getWebhookToken();

  if (!token) {
    throw new Error(
      'No hay token conectado. Conecta primero desde el link normal de la app.'
    );
  }

  return getTemplatesWithCache(
    token,
    true
  );
}

/**
 * Endpoint del panel de pruebas para renovar el caché y devolver
 * inmediatamente las plantillas recién descargadas.
 */
function refreshTemplatesCacheForTest() {
  return forceRefreshTemplates().map(t => ({
    id: t.id,
    name: t.name || t.id,
  }));
}

// ------------------------------------------------------------
// 4) UTILIDADES
// ------------------------------------------------------------

function getWebhookToken() {
  return PropertiesService
    .getUserProperties()
    .getProperty(
      'WEBHOOK_TOKEN'
    );
}

function getLastSyncEpoch() {
  const props =
    PropertiesService
      .getUserProperties();

  const stored =
    props.getProperty(
      'LAST_SYNC_EPOCH'
    );

  if (stored) {
    return Number(stored);
  }

  const startOfToday =
    new Date();

  startOfToday.setHours(
    0,
    0,
    0,
    0
  );

  return Math.floor(
    startOfToday.getTime() /
    1000
  );
}

function setLastSyncEpoch(
  epochSeconds
) {
  PropertiesService
    .getUserProperties()
    .setProperty(
      'LAST_SYNC_EPOCH',
      String(epochSeconds)
    );
}

function ensureLabelExists(
  name
) {
  if (
    !GmailApp.getUserLabelByName(
      name
    )
  ) {
    GmailApp.createLabel(
      name
    );
  }
}