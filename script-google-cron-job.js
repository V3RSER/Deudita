const BACKEND_BASE_URL = 'https://deudita-nine.vercel.app'; 
const PROCESSED_LABEL = 'gastos-procesados';
const TEMPLATES_CACHE_SECONDS = 21600; 
const DEBUG_MATCHING = true; 

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

function syncExpenseEmails() {
  const startTime = Date.now();
  const token = getWebhookToken();

  if (!token) {
    console.warn('syncExpenseEmails: usuario sin WEBHOOK_TOKEN — no debería pasar si el trigger es suyo.');
    return;
  }

  ensureLabelExists(PROCESSED_LABEL);
  const label = GmailApp.getUserLabelByName(PROCESSED_LABEL);
  const templates = getTemplatesWithCache(token);

  console.log(`Plantillas disponibles: ${templates.length}`);

  const entityGroups = groupTemplatesByEntity(templates);

  console.log(`Entidades con plantillas activas: ${entityGroups.length}`);

  const sinceEpoch = getLastSyncEpoch();

  console.log(`Ventana de búsqueda: desde ${new Date(sinceEpoch * 1000).toISOString()}`);

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

function cleanEmailBody(body) {
  if (!body) return body;

  return body
    .replace(/\[image:[^\]]*\]/gi, '')       
    .replace(/<https?:\/\/[^\s>]+>/g, '')    
    .replace(/https?:\/\/\S+/g, '')          
    .replace(/\*/g, '')                       
    .replace(/[ \t]+/g, ' ')                  
    .replace(/\n{3,}/g, '\n\n')               
    .trim();
}

function matchesEitherSource(pattern, directText, body) {
  const regex = new RegExp(pattern, 'i');

  return regex.test(directText) || regex.test(body);
}

function normalizeAmount(rawAmount) {
  if (!rawAmount) return rawAmount;

  let s = String(rawAmount)
    .replace(/\s|\$|COP/g, '')
    .trim();

  if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, '');
  } else if (/\d{1,3}(\.\d{3})+,\d{1,2}$/.test(s)) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (/\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(s)) {
    s = s.replace(/,/g, '');
  } else if (/^\d+,\d{1,2}$/.test(s)) {
    s = s.replace(',', '.');
  }

  const num = parseFloat(s);

  if (isNaN(num)) return rawAmount;

  return num.toFixed(2);
}

function parseDateWithFormat(rawDateStr, formatStr) {
  if (!rawDateStr) return null;

  if (!formatStr) return rawDateStr;

  const tokenOrder = [];

  const tokenRegexSource = formatStr.replace(
    /YYYY|MM|DD|HH|mm|ss/g,
    match => {
      tokenOrder.push(match);
      return match === 'YYYY' ? '(\\d{4})' : '(\\d{1,2})';
    }
  );

  const match = rawDateStr.match(new RegExp(tokenRegexSource));

  if (!match) return null;

  const parts = {
    YYYY: '1970',
    MM: '01',
    DD: '01',
    HH: '00',
    mm: '00',
    ss: '00'
  };

  tokenOrder.forEach((token, i) => {
    parts[token] = match[i + 1].padStart(
      token === 'YYYY' ? 4 : 2,
      '0'
    );
  });

  return {
    date: `${parts.YYYY}-${parts.MM}-${parts.DD}`,
    time: `${parts.HH}:${parts.mm}:${parts.ss}`,
  };
}

function normalizeDateTime(dateRaw, timeRaw, dateFormat) {
  if (!dateRaw) {
    return {
      date: null,
      time: null
    };
  }

  const combined = timeRaw
    ? `${dateRaw} ${timeRaw}`
    : dateRaw;

  const parsed = parseDateWithFormat(
    combined,
    dateFormat
  );

  return parsed || {
    date: null,
    time: null
  };
}

function buildConcept(expenseTypeLabel, merchant) {
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

function StringUtils_toTitleCase(str) {
  return str
    .toLowerCase()
    .replace(
      /(^|\s)([a-záéíóúñ])/g,
      (m, sep, c) => sep + c.toUpperCase()
    );
}

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
        emailPatterns: t.entity_email_patterns || [],
        templates: [],
      };
    }

    byEntity[t.entity_id].templates.push(t);
  });

  return Object.values(byEntity);
}

function matchesEntityEmail(emailPatterns, sender, body) {
  return emailPatterns.some(
    pattern => matchesEitherSource(pattern, sender, body)
  );
}

function matchAgainstTemplates(message, entityGroups) {
  const sender = message.getFrom();
  const subject = message.getSubject();
  const body = cleanEmailBody(message.getPlainBody());

  for (const group of entityGroups) {

    if (group.emailPatterns.length > 0) {
      if (!matchesEntityEmail(
        group.emailPatterns,
        sender,
        body
      )) {
        if (DEBUG_MATCHING) {
          console.log(
            `  → entidad ${group.entityId}: descartada, ningún email_pattern matcheó (${group.templates.length} plantilla(s) omitida(s) sin evaluar)`
          );
        }

        continue;
      }

      if (DEBUG_MATCHING) {
        console.log(
          `  → entidad ${group.entityId}: email_pattern matcheó, evaluando sus ${group.templates.length} plantilla(s)`
        );
      }
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

      const toEvaluate = candidates.length > 1
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

            if (!matched && DEBUG_MATCHING) {
              console.log(
                `  → plantilla "${t.name}": match_pattern "${t.match_pattern}" no encontrado, se descarta`
              );
            }

            return matched;
          })
        : candidates;

      for (const t of toEvaluate) {
        const result = tryExtractFromTemplate(
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

function tryExtractFromTemplate(
  t,
  sender,
  subject,
  body
) {
  try {

    if (
      t.sender_pattern &&
      !matchesEitherSource(
        t.sender_pattern,
        sender,
        body
      )
    ) {
      if (DEBUG_MATCHING) {
        console.log(
          `  → plantilla "${t.name}": descartada, sender_pattern no matcheó ni en remitente ni en cuerpo`
        );
      }

      return null;
    }

    const amountMatch = body.match(
      new RegExp(t.amount_regex, 'i')
    );

    if (!amountMatch) {
      if (DEBUG_MATCHING) {
        console.log(
          `  → plantilla "${t.name}": pasó los filtros previos, pero amount_regex no encontró nada en el cuerpo`
        );
      }

      return null;
    }

    const merchantMatch = t.merchant_regex
      ? body.match(
          new RegExp(t.merchant_regex, 'i')
        )
      : null;

    const dateMatch = t.date_regex
      ? body.match(
          new RegExp(t.date_regex, 'i')
        )
      : null;

    const timeMatch = t.time_regex
      ? body.match(
          new RegExp(t.time_regex, 'i')
        )
      : null;

    const currencyMatch = t.currency_regex
      ? body.match(
          new RegExp(t.currency_regex, 'i')
        )
      : null;

    const sourceAccountMatch = t.source_account_regex
      ? body.match(
          new RegExp(t.source_account_regex, 'i')
        )
      : null;

    const merchant = merchantMatch
      ? merchantMatch[1].trim()
      : null;

    const currency = currencyMatch
      ? currencyMatch[1]
      : null;

    const dt = normalizeDateTime(
      dateMatch ? dateMatch[1] : null,
      timeMatch ? timeMatch[1] : null,
      t.date_format
    );

    const normalizedAmount =
      normalizeAmount(amountMatch[1]);

    const numericAmount =
      Number(normalizedAmount);

    if (isNaN(numericAmount)) {
      if (DEBUG_MATCHING) {
        console.log(
          `  → plantilla "${t.name}": amount_regex matcheó "${amountMatch[1]}" pero no se pudo normalizar a número, se descarta`
        );
      }

      return null;
    }

    return {
      templateId: t.id,
      amount: numericAmount,
      currency: currency,
      merchant: merchant,
      entity: t.entity_name || null,
      sourceAccount:
        sourceAccountMatch
          ? sourceAccountMatch[1]
          : null,
      date: dt.date,
      time: dt.time,
      concept: buildConcept(
        t.expense_type_label,
        merchant
      ),
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
  const response = UrlFetchApp.fetch(
    `${BACKEND_BASE_URL}/api/expense-candidate`,
    {
      method: 'post',
      contentType: 'application/json',
      headers: {
        Authorization: `Bearer ${token}`
      },
      payload: JSON.stringify({
        gmail_message_id: message.getId(),
        template_id: match.templateId,
        amount: match.amount,
        currency: match.currency,
        merchant: match.merchant,
        entity: match.entity,
        sourceAccount: match.sourceAccount,
        date: match.date,
        time: match.time,
        concept: match.concept,
        received_at:
          message.getDate().toISOString(),
      }),
      muteHttpExceptions: true,
    }
  );

  const code =
    response.getResponseCode();

  if (code < 200 || code >= 300) {
    console.warn(
      `expense-candidate respondió ${code} para el mensaje ${message.getId()}: ${response.getContentText()}`
    );

    return false;
  }

  return true;
}

function getTemplatesWithCache(token) {
  const cache =
    CacheService.getUserCache();

  const cached =
    cache.get('TEMPLATES_JSON');

  if (cached) {
    const templates =
      JSON.parse(cached);

    console.log(
      `Plantillas desde caché (${templates.length})`
    );

    return templates;
  }

  const response = UrlFetchApp.fetch(
    `${BACKEND_BASE_URL}/api/email-templates`,
    {
      headers: {
        Authorization: `Bearer ${token}`
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

  const templates =
    JSON.parse(
      response.getContentText()
    );

  cache.put(
    'TEMPLATES_JSON',
    JSON.stringify(templates),
    TEMPLATES_CACHE_SECONDS
  );

  console.log(
    `Plantillas descargadas del backend y cacheadas (${templates.length})`
  );

  return templates;
}

function forceRefreshTemplates() {
  CacheService.getUserCache()
    .remove('TEMPLATES_JSON');

  const token =
    getWebhookToken();

  if (token) {
    getTemplatesWithCache(token);
  }
}

function getWebhookToken() {
  return PropertiesService
    .getUserProperties()
    .getProperty('WEBHOOK_TOKEN');
}

function getLastSyncEpoch() {
  const props =
    PropertiesService.getUserProperties();

  const stored =
    props.getProperty('LAST_SYNC_EPOCH');

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
    startOfToday.getTime() / 1000
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

function ensureLabelExists(name) {
  if (!GmailApp.getUserLabelByName(name)) {
    GmailApp.createLabel(name);
  }
}