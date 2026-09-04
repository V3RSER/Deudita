import { cleanEmailBody } from './email-cleaning';

export interface CatalogEntity {
  id: string;
  name: string;
  patterns: string[];
}

export interface CatalogTemplate {
  id: string;
  name: string;
  sender_pattern: string | null;
  subject_pattern: string | null;
  amount_regex: string;
  merchant_regex: string | null;
  date_regex: string | null;
  date_format: string | null;
  entity_name: string | null;
  entity_id: string | null;
  match_pattern: string | null;
  expense_type_id: string | null;
  expense_type_label?: string | null;
  default_currency: string | null;
  currency_regex: string | null;
  source_account_regex: string | null;
  time_regex: string | null;
  active: boolean;
  created_at?: string;
  entity_email_patterns?: string[];
}

export interface Level1EntityReport {
  entityId: string;
  entityName: string;
  patterns: string[];
  matched: boolean;
  matchedPattern?: string;
  matchedOn?: 'sender' | 'body';
  discardReason?: string;
  templatesCount: number;
  templateNames: string[];
}

export interface Level2SubjectGroupReport {
  entityId: string;
  entityName: string;
  subjectPattern: string | null;
  matched: boolean;
  matchedOn?: 'subject' | 'body';
  discardReason?: string;
  templatesCount: number;
  templates: CatalogTemplate[];
}

export interface Level3CandidateReport {
  template: CatalogTemplate;
  entityName: string;
  subjectPattern: string | null;
  matchPattern: string | null;
  isAmbiguousGroup: boolean;
  hasDataIssue: boolean;
  dataIssueMessage?: string;
  matched: boolean;
  matchedOn?: 'body' | 'subject';
  discardReason?: string;
}

export interface ExtractedField {
  field: 'amount' | 'merchant' | 'date' | 'time' | 'currency' | 'source_account';
  label: string;
  pattern: string | null;
  rawExtracted: string | null;
  cleanedValue: string | number | null;
  success: boolean;
  reason?: string;
  hasCaptureGroup?: boolean;
}

export interface TemplateExtractionReport {
  template: CatalogTemplate;
  isWinner: boolean;
  fields: {
    amount: ExtractedField;
    merchant: ExtractedField;
    date: ExtractedField;
    time: ExtractedField;
    currency: ExtractedField;
    source_account: ExtractedField;
  };
  hasErrors: boolean;
}

export interface DiagnosisResult {
  cleanedBody: string;
  level1: {
    passedEntities: Level1EntityReport[];
    discardedEntities: Level1EntityReport[];
    totalTemplatesDiscarded: number;
  };
  level2: {
    passedGroups: Level2SubjectGroupReport[];
    discardedGroups: Level2SubjectGroupReport[];
    totalTemplatesDiscarded: number;
  };
  level3: {
    candidates: Level3CandidateReport[];
    survivingTemplates: CatalogTemplate[];
    discardedCandidates: Level3CandidateReport[];
    ambiguityIssuesCount: number;
  };
  extractions: TemplateExtractionReport[];
  winner: TemplateExtractionReport | null;
}

function parseAmountValue(rawAmount: string | null): number | null {
  if (!rawAmount) return null;
  // Remove $ and non-numeric chars except commas and dots
  const sanitized = rawAmount.replace(/[$\s]/g, '').trim();
  // Check format: e.g. 45.000 (thousands dot) or 45,000 or 45000.00
  if (sanitized.includes('.') && !sanitized.includes(',')) {
    const parts = sanitized.split('.');
    if (parts.length === 2 && parts[1].length === 3) {
      // Colombian thousand separator: 45.000 -> 45000
      return parseFloat(sanitized.replace(/\./g, ''));
    }
  }
  // Standard cleanup: replace thousand dots, convert comma decimal
  const normalized = sanitized.replace(/\./g, '').replace(',', '.');
  const parsed = parseFloat(normalized);
  return isNaN(parsed) ? null : parsed;
}

/**
 * Executes a regex extraction with safe evaluation, validating capture groups.
 */
function extractWithCaptureGroup(
  text: string,
  regexPattern: string | null | undefined,
  fieldLabel: string
): { success: boolean; rawExtracted: string | null; reason?: string; hasCaptureGroup: boolean } {
  if (!regexPattern || !regexPattern.trim()) {
    return {
      success: false,
      rawExtracted: null,
      reason: `${fieldLabel} no está definido en esta plantilla (null)`,
      hasCaptureGroup: false,
    };
  }

  try {
    const regex = new RegExp(regexPattern, 'i');
    const match = text.match(regex);
    const hasCapture = regexPattern.includes('(') && regexPattern.includes(')');

    if (!match) {
      return {
        success: false,
        rawExtracted: null,
        reason: `No coincidió con el patrón en el cuerpo: /${regexPattern}/i`,
        hasCaptureGroup: hasCapture,
      };
    }

    if (match.length > 1 && match[1] !== undefined) {
      return {
        success: true,
        rawExtracted: match[1].trim(),
        hasCaptureGroup: true,
      };
    }

    return {
      success: true,
      rawExtracted: match[0].trim(),
      reason: 'El patrón coincidió pero no tiene grupo de captura (...) explícito',
      hasCaptureGroup: false,
    };
  } catch (err: unknown) {
    const errMessage = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      rawExtracted: null,
      reason: `Error de sintaxis en expresión regular /${regexPattern}/: ${errMessage}`,
      hasCaptureGroup: false,
    };
  }
}

/**
 * 3-Level Matching Engine and Data Extraction Diagnostic
 */
export function diagnoseEmailMatching(
  sender: string,
  subject: string,
  rawOrCleanBody: string,
  templates: CatalogTemplate[],
  entities: CatalogEntity[]
): DiagnosisResult {
  const cleanBody = cleanEmailBody(rawOrCleanBody);

  // Group templates by entity
  // An entity can be found either by entity_id matching entities.id or fallback entity_name
  const entityMap = new Map<string, { entity: CatalogEntity; templates: CatalogTemplate[] }>();

  // Initialize with all known entities
  for (const ent of entities) {
    entityMap.set(ent.id, { entity: ent, templates: [] });
  }

  // Populate templates
  for (const tpl of templates) {
    let matchedEntId = tpl.entity_id;
    if (!matchedEntId && tpl.entity_name) {
      const found = entities.find(
        (e) => e.name.toLowerCase().trim() === tpl.entity_name?.toLowerCase().trim()
      );
      if (found) matchedEntId = found.id;
    }

    if (matchedEntId && entityMap.has(matchedEntId)) {
      entityMap.get(matchedEntId)!.templates.push(tpl);
    } else {
      // Template has no registered entity or unknown entity
      const fallbackId = tpl.entity_name ? `virtual-${tpl.entity_name}` : 'sin-entidad';
      if (!entityMap.has(fallbackId)) {
        entityMap.set(fallbackId, {
          entity: {
            id: fallbackId,
            name: tpl.entity_name || 'Sin entidad asignada',
            patterns: tpl.sender_pattern ? [tpl.sender_pattern] : [],
          },
          templates: [],
        });
      }
      entityMap.get(fallbackId)!.templates.push(tpl);
    }
  }

  // -------------------------------------------------------------
  // NIVEL 1 — ENTIDAD
  // -------------------------------------------------------------
  const passedEntities: Level1EntityReport[] = [];
  const discardedEntities: Level1EntityReport[] = [];
  let l1DiscardedTemplatesCount = 0;

  for (const [entId, { entity, templates: entTemplates }] of entityMap.entries()) {
    // If entity has no templates, skip reporting to avoid noise
    if (entTemplates.length === 0) continue;

    // Compile patterns to test for this entity
    const patternsToTest = [...entity.patterns];

    // If entity has no registered patterns in entity_email_patterns, check template sender_pattern
    if (patternsToTest.length === 0) {
      for (const t of entTemplates) {
        if (t.sender_pattern && !patternsToTest.includes(t.sender_pattern)) {
          patternsToTest.push(t.sender_pattern);
        }
      }
    }

    if (patternsToTest.length === 0) {
      // Discard because no patterns exist to verify sender
      discardedEntities.push({
        entityId: entId,
        entityName: entity.name,
        patterns: [],
        matched: false,
        discardReason: 'No hay patrones de correo registrados en entity_email_patterns para esta entidad.',
        templatesCount: entTemplates.length,
        templateNames: entTemplates.map((t) => t.name),
      });
      l1DiscardedTemplatesCount += entTemplates.length;
      continue;
    }

    let entityMatched = false;
    let matchedPattern: string | undefined;
    let matchedOn: 'sender' | 'body' | undefined;

    for (const pat of patternsToTest) {
      try {
        const regex = new RegExp(pat, 'i');
        if (regex.test(sender)) {
          entityMatched = true;
          matchedPattern = pat;
          matchedOn = 'sender';
          break;
        }
        // Fallback to body (e.g. forwarded emails where sender is in the body text)
        if (regex.test(cleanBody)) {
          entityMatched = true;
          matchedPattern = pat;
          matchedOn = 'body';
          break;
        }
      } catch {
        // Skip invalid regex
      }
    }

    if (entityMatched) {
      passedEntities.push({
        entityId: entId,
        entityName: entity.name,
        patterns: patternsToTest,
        matched: true,
        matchedPattern,
        matchedOn,
        templatesCount: entTemplates.length,
        templateNames: entTemplates.map((t) => t.name),
      });
    } else {
      discardedEntities.push({
        entityId: entId,
        entityName: entity.name,
        patterns: patternsToTest,
        matched: false,
        discardReason: `Ningún patrón (${patternsToTest.map((p) => `/${p}/i`).join(', ')}) coincidió con el remitente ni con el cuerpo.`,
        templatesCount: entTemplates.length,
        templateNames: entTemplates.map((t) => t.name),
      });
      l1DiscardedTemplatesCount += entTemplates.length;
    }
  }

  // -------------------------------------------------------------
  // NIVEL 2 — ASUNTO
  // -------------------------------------------------------------
  const passedGroups: Level2SubjectGroupReport[] = [];
  const discardedGroups: Level2SubjectGroupReport[] = [];
  let l2DiscardedTemplatesCount = 0;

  for (const passedEnt of passedEntities) {
    const entData = entityMap.get(passedEnt.entityId);
    if (!entData) continue;

    // Group templates within this entity by subject_pattern
    const subjectGroups = new Map<string, CatalogTemplate[]>();
    for (const tpl of entData.templates) {
      const key = tpl.subject_pattern?.trim() || '__NO_SUBJECT_PATTERN__';
      if (!subjectGroups.has(key)) {
        subjectGroups.set(key, []);
      }
      subjectGroups.get(key)!.push(tpl);
    }

    for (const [key, groupTemplates] of subjectGroups.entries()) {
      const subjectPattern = key === '__NO_SUBJECT_PATTERN__' ? null : key;

      if (!subjectPattern) {
        // Null subject_pattern matches any subject
        passedGroups.push({
          entityId: passedEnt.entityId,
          entityName: passedEnt.entityName,
          subjectPattern: null,
          matched: true,
          matchedOn: 'subject',
          templatesCount: groupTemplates.length,
          templates: groupTemplates,
        });
        continue;
      }

      let groupMatched = false;
      let matchedOn: 'subject' | 'body' | undefined;

      try {
        const regex = new RegExp(subjectPattern, 'i');
        if (regex.test(subject)) {
          groupMatched = true;
          matchedOn = 'subject';
        } else if (regex.test(cleanBody)) {
          // Fallback to body for forwarded messages
          groupMatched = true;
          matchedOn = 'body';
        }
      } catch (err: unknown) {
        const errMessage = err instanceof Error ? err.message : String(err);
        discardedGroups.push({
          entityId: passedEnt.entityId,
          entityName: passedEnt.entityName,
          subjectPattern,
          matched: false,
          discardReason: `Error de sintaxis en subject_pattern: /${subjectPattern}/: ${errMessage}`,
          templatesCount: groupTemplates.length,
          templates: groupTemplates,
        });
        l2DiscardedTemplatesCount += groupTemplates.length;
        continue;
      }

      if (groupMatched) {
        passedGroups.push({
          entityId: passedEnt.entityId,
          entityName: passedEnt.entityName,
          subjectPattern,
          matched: true,
          matchedOn,
          templatesCount: groupTemplates.length,
          templates: groupTemplates,
        });
      } else {
        discardedGroups.push({
          entityId: passedEnt.entityId,
          entityName: passedEnt.entityName,
          subjectPattern,
          matched: false,
          discardReason: `El patrón de asunto /${subjectPattern}/i no coincidió con el asunto ni con el cuerpo.`,
          templatesCount: groupTemplates.length,
          templates: groupTemplates,
        });
        l2DiscardedTemplatesCount += groupTemplates.length;
      }
    }
  }

  // -------------------------------------------------------------
  // NIVEL 3 — MATCH PATTERN (DESEMPATE)
  // -------------------------------------------------------------
  const candidates: Level3CandidateReport[] = [];
  const survivingTemplates: CatalogTemplate[] = [];
  const discardedCandidates: Level3CandidateReport[] = [];
  let ambiguityIssuesCount = 0;

  for (const group of passedGroups) {
    const isAmbiguous = group.templates.length > 1;

    for (const tpl of group.templates) {
      const matchPattern = tpl.match_pattern?.trim() || null;

      // Ambiguity Check per requirement:
      // "Si hay ambigüedad y alguna candidata no tiene match_pattern definido,
      // señálalo como problema de datos — nunca va a poder ganar el desempate."
      if (isAmbiguous && !matchPattern) {
        ambiguityIssuesCount++;
        const candidateReport: Level3CandidateReport = {
          template: tpl,
          entityName: group.entityName,
          subjectPattern: group.subjectPattern,
          matchPattern: null,
          isAmbiguousGroup: true,
          hasDataIssue: true,
          dataIssueMessage: `⚠️ Problema de datos: la plantilla "${tpl.name}" comparte el subject_pattern pero no tiene match_pattern definido. Nunca podrá ganar el desempate.`,
          matched: false,
          discardReason: 'No tiene match_pattern definido en un grupo ambiguo con múltiples plantillas.',
        };
        candidates.push(candidateReport);
        discardedCandidates.push(candidateReport);
        continue;
      }

      // If single template and no match_pattern, it automatically survives
      if (!isAmbiguous && !matchPattern) {
        const candidateReport: Level3CandidateReport = {
          template: tpl,
          entityName: group.entityName,
          subjectPattern: group.subjectPattern,
          matchPattern: null,
          isAmbiguousGroup: false,
          hasDataIssue: false,
          matched: true,
        };
        candidates.push(candidateReport);
        survivingTemplates.push(tpl);
        continue;
      }

      // Otherwise, test match_pattern on body or subject
      let matchPatternSuccess = false;
      let matchedOn: 'body' | 'subject' | undefined;

      try {
        const regex = new RegExp(matchPattern!, 'i');
        if (regex.test(cleanBody)) {
          matchPatternSuccess = true;
          matchedOn = 'body';
        } else if (regex.test(subject)) {
          matchPatternSuccess = true;
          matchedOn = 'subject';
        }
      } catch (err: unknown) {
        const errMessage = err instanceof Error ? err.message : String(err);
        const candidateReport: Level3CandidateReport = {
          template: tpl,
          entityName: group.entityName,
          subjectPattern: group.subjectPattern,
          matchPattern,
          isAmbiguousGroup: isAmbiguous,
          hasDataIssue: true,
          dataIssueMessage: `Error de sintaxis en match_pattern: /${matchPattern}/: ${errMessage}`,
          matched: false,
          discardReason: `Error en expresión regular de match_pattern: ${errMessage}`,
        };
        candidates.push(candidateReport);
        discardedCandidates.push(candidateReport);
        continue;
      }

      if (matchPatternSuccess) {
        const candidateReport: Level3CandidateReport = {
          template: tpl,
          entityName: group.entityName,
          subjectPattern: group.subjectPattern,
          matchPattern,
          isAmbiguousGroup: isAmbiguous,
          hasDataIssue: false,
          matched: true,
          matchedOn,
        };
        candidates.push(candidateReport);
        survivingTemplates.push(tpl);
      } else {
        const candidateReport: Level3CandidateReport = {
          template: tpl,
          entityName: group.entityName,
          subjectPattern: group.subjectPattern,
          matchPattern,
          isAmbiguousGroup: isAmbiguous,
          hasDataIssue: false,
          matched: false,
          discardReason: `El patrón de desempate /${matchPattern}/i no coincidió en el cuerpo ni en el asunto.`,
        };
        candidates.push(candidateReport);
        discardedCandidates.push(candidateReport);
      }
    }
  }

  // -------------------------------------------------------------
  // EXTRACCIÓN DE CAMPOS EN SOBREVIVIENTES
  // -------------------------------------------------------------
  const extractions: TemplateExtractionReport[] = [];

  for (const tpl of survivingTemplates) {
    const amountRes = extractWithCaptureGroup(cleanBody, tpl.amount_regex, 'Monto');
    const merchantRes = extractWithCaptureGroup(cleanBody, tpl.merchant_regex, 'Comercio / Destinatario');
    const dateRes = extractWithCaptureGroup(cleanBody, tpl.date_regex, 'Fecha');
    const timeRes = extractWithCaptureGroup(cleanBody, tpl.time_regex, 'Hora');
    const currencyRes = extractWithCaptureGroup(cleanBody, tpl.currency_regex, 'Moneda');
    const accountRes = extractWithCaptureGroup(cleanBody, tpl.source_account_regex, 'Cuenta de origen');

    const parsedAmount = parseAmountValue(amountRes.rawExtracted);

    const report: TemplateExtractionReport = {
      template: tpl,
      isWinner: false, // determined below
      fields: {
        amount: {
          field: 'amount',
          label: 'Monto',
          pattern: tpl.amount_regex,
          rawExtracted: amountRes.rawExtracted,
          cleanedValue: parsedAmount,
          success: amountRes.success && parsedAmount !== null,
          reason: !amountRes.success ? amountRes.reason : parsedAmount === null ? 'No se pudo convertir el monto a valor numérico' : undefined,
          hasCaptureGroup: amountRes.hasCaptureGroup,
        },
        merchant: {
          field: 'merchant',
          label: 'Comercio / Destinatario',
          pattern: tpl.merchant_regex,
          rawExtracted: merchantRes.rawExtracted,
          cleanedValue: merchantRes.rawExtracted,
          success: merchantRes.success,
          reason: merchantRes.reason,
          hasCaptureGroup: merchantRes.hasCaptureGroup,
        },
        date: {
          field: 'date',
          label: 'Fecha',
          pattern: tpl.date_regex,
          rawExtracted: dateRes.rawExtracted,
          cleanedValue: dateRes.rawExtracted,
          success: dateRes.success,
          reason: dateRes.reason,
          hasCaptureGroup: dateRes.hasCaptureGroup,
        },
        time: {
          field: 'time',
          label: 'Hora',
          pattern: tpl.time_regex,
          rawExtracted: timeRes.rawExtracted,
          cleanedValue: timeRes.rawExtracted,
          success: timeRes.success,
          reason: timeRes.reason,
          hasCaptureGroup: timeRes.hasCaptureGroup,
        },
        currency: {
          field: 'currency',
          label: 'Moneda',
          pattern: tpl.currency_regex,
          rawExtracted: currencyRes.rawExtracted || tpl.default_currency || 'COP',
          cleanedValue: currencyRes.rawExtracted || tpl.default_currency || 'COP',
          success: currencyRes.success || Boolean(tpl.default_currency),
          reason: currencyRes.reason,
          hasCaptureGroup: currencyRes.hasCaptureGroup,
        },
        source_account: {
          field: 'source_account',
          label: 'Cuenta / Tarjeta Origen',
          pattern: tpl.source_account_regex,
          rawExtracted: accountRes.rawExtracted,
          cleanedValue: accountRes.rawExtracted,
          success: accountRes.success,
          reason: accountRes.reason,
          hasCaptureGroup: accountRes.hasCaptureGroup,
        },
      },
      hasErrors: !amountRes.success || parsedAmount === null,
    };

    extractions.push(report);
  }

  // Determine winner:
  // If exactly 1 surviving template exists, it is the winner.
  // If multiple exist, prioritize the one that successfully extracted the required amount.
  let winner: TemplateExtractionReport | null = null;
  if (extractions.length === 1) {
    winner = extractions[0];
    winner.isWinner = true;
  } else if (extractions.length > 1) {
    const validAmount = extractions.find((e) => e.fields.amount.success);
    winner = validAmount || extractions[0];
    winner.isWinner = true;
  }

  return {
    cleanedBody: cleanBody,
    level1: {
      passedEntities,
      discardedEntities,
      totalTemplatesDiscarded: l1DiscardedTemplatesCount,
    },
    level2: {
      passedGroups,
      discardedGroups,
      totalTemplatesDiscarded: l2DiscardedTemplatesCount,
    },
    level3: {
      candidates,
      survivingTemplates,
      discardedCandidates,
      ambiguityIssuesCount,
    },
    extractions,
    winner,
  };
}

// -------------------------------------------------------------
// GOOGLE APPS SCRIPT EXACT PROCESSING & SIMULATION LOGIC
// -------------------------------------------------------------

export interface AppsScriptCandidatePayload {
  templateId: string;
  amount: number;
  currency: string | null;
  merchant: string | null;
  entity: string | null;
  sourceAccount: string | null;
  date: string | null;
  time: string | null;
  concept: string | null;
  gmail_message_id?: string;
  received_at?: string;
}

export interface AppsScriptSimulationResult {
  matched: boolean;
  match: AppsScriptCandidatePayload | null;
  matchedTemplate: CatalogTemplate | null;
  logs: string[];
  cleanBody: string;
  rejectionReason?: string;
}

export function normalizeAmount(rawAmount: string | number | null | undefined): string | null {
  if (rawAmount === null || rawAmount === undefined || rawAmount === '') return null;
  let s = String(rawAmount).replace(/\s|\$|COP/gi, '').trim();

  if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    // COP: punto como separador de miles, sin decimales: "49.800" o "1.500.000"
    s = s.replace(/\./g, '');
  } else if (/\d{1,3}(\.\d{3})+,\d{1,2}$/.test(s)) {
    // Europeo: punto miles + coma decimal: "49.800,50"
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (/\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(s)) {
    // Americano: coma miles + punto decimal: "49,800.50" o "49,800"
    s = s.replace(/,/g, '');
  } else if (/^\d+,\d{1,2}$/.test(s)) {
    // Coma como decimal sin separador de miles: "49800,50"
    s = s.replace(',', '.');
  }

  const num = parseFloat(s);
  if (isNaN(num)) return String(rawAmount);
  return num.toFixed(2);
}

export function parseDateWithFormat(
  rawDateStr: string | null | undefined,
  formatStr: string | null | undefined
): { date: string; time: string } | null {
  if (!rawDateStr || !formatStr) return null;

  const tokenOrder: string[] = [];
  const tokenRegexSource = formatStr.replace(/YYYY|MM|DD|HH|mm|ss/g, (match) => {
    tokenOrder.push(match);
    return match === 'YYYY' ? '(\\d{4})' : '(\\d{1,2})';
  });

  try {
    const match = rawDateStr.match(new RegExp(tokenRegexSource));
    if (!match) return null;

    const parts: Record<string, string> = {
      YYYY: '1970',
      MM: '01',
      DD: '01',
      HH: '00',
      mm: '00',
      ss: '00',
    };

    tokenOrder.forEach((token, i) => {
      parts[token] = match[i + 1].padStart(token === 'YYYY' ? 4 : 2, '0');
    });

    return {
      date: `${parts.YYYY}-${parts.MM}-${parts.DD}`,
      time: `${parts.HH}:${parts.mm}:${parts.ss}`,
    };
  } catch {
    return null;
  }
}

export function StringUtils_toTitleCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/(^|\s)([a-záéíóúñ])/g, (m, sep, c) => sep + c.toUpperCase());
}

export function buildConcept(
  expenseTypeLabel: string | null | undefined,
  merchant: string | null | undefined
): string | null {
  const cleanMerchant = merchant ? StringUtils_toTitleCase(merchant.trim()) : null;
  if (expenseTypeLabel && cleanMerchant) return `${expenseTypeLabel} · ${cleanMerchant}`;
  if (cleanMerchant) return cleanMerchant;
  if (expenseTypeLabel) return expenseTypeLabel;
  return null;
}

export function matchesEitherSource(pattern: string, directText: string, body: string): boolean {
  try {
    const regex = new RegExp(pattern, 'i');
    return regex.test(directText) || regex.test(body);
  } catch {
    return false;
  }
}

/**
 * Simulates the exact logic executed by the Google Apps Script webhook client:
 * 1. Clean email body with cleanEmailBody()
 * 2. Filter by entity email patterns (Level 1)
 * 3. Filter by subject pattern (Level 2)
 * 4. Filter by match_pattern if multiple candidates have the same subject pattern (Level 3)
 * 5. Extract amount, merchant, date/time, currency, account, and concept
 */
export function simulateGoogleAppsScriptProcess(
  message: {
    id?: string;
    subject: string;
    sender: string;
    plainBody: string;
    date?: string;
  },
  templates: CatalogTemplate[],
  entities: CatalogEntity[]
): AppsScriptSimulationResult {
  const logs: string[] = [];
  const sender = message.sender || '';
  const subject = message.subject || '';
  const body = cleanEmailBody(message.plainBody);

  logs.push(`[Google Apps Script] 📧 Procesando correo: "${subject}" | Remitente: ${sender}`);
  logs.push(`[Google Apps Script] Limpieza de cuerpo ejecutada (${body.length} caracteres de texto plano).`);

  // Build entity groups
  const entityMap = new Map<
    string,
    { entityId: string; entityName: string; emailPatterns: string[]; templates: CatalogTemplate[] }
  >();

  for (const ent of entities) {
    entityMap.set(ent.id, {
      entityId: ent.id,
      entityName: ent.name,
      emailPatterns: ent.patterns || [],
      templates: [],
    });
  }

  for (const t of templates) {
    let matchedEntId = t.entity_id;
    if (!matchedEntId && t.entity_name) {
      const found = entities.find((e) => e.name.toLowerCase() === t.entity_name?.toLowerCase());
      if (found) matchedEntId = found.id;
    }

    if (!matchedEntId) {
      logs.push(`⚠️ Plantilla "${t.name}" no tiene entidad vinculada. En Apps Script nunca matcheará ningún correo.`);
      continue;
    }

    if (!entityMap.has(matchedEntId)) {
      entityMap.set(matchedEntId, {
        entityId: matchedEntId,
        entityName: t.entity_name || 'Entidad',
        emailPatterns: t.entity_email_patterns || (t.sender_pattern ? [t.sender_pattern] : []),
        templates: [],
      });
    }

    entityMap.get(matchedEntId)!.templates.push(t);
  }

  const entityGroups = Array.from(entityMap.values()).filter((g) => g.templates.length > 0);
  logs.push(`[Google Apps Script] ${templates.length} plantilla(s) activas agrupadas en ${entityGroups.length} entidad(es).`);

  for (const group of entityGroups) {
    // Nivel 1: Filtro por entidad
    if (group.emailPatterns.length > 0) {
      const entityMatch = group.emailPatterns.some((pattern) => matchesEitherSource(pattern, sender, body));
      if (!entityMatch) {
        logs.push(`  → Entidad "${group.entityName}": descartada, ningún email_pattern coincidió con el remitente ni cuerpo.`);
        continue;
      }
      logs.push(`  ✓ Entidad "${group.entityName}": coincidió con email_pattern. Evaluando ${group.templates.length} plantilla(s).`);
    }

    // Agrupar por subject_pattern
    const bySubject = new Map<string, CatalogTemplate[]>();
    for (const t of group.templates) {
      const key = t.subject_pattern || `__no_subject_${t.id}`;
      if (!bySubject.has(key)) bySubject.set(key, []);
      bySubject.get(key)!.push(t);
    }

    for (const [, candidates] of bySubject.entries()) {
      const first = candidates[0];

      // Nivel 2: Filtro por asunto
      if (first.subject_pattern && !matchesEitherSource(first.subject_pattern, subject, body)) {
        logs.push(`  → Asunto "${first.subject_pattern}": no coincidió (${candidates.length} plantilla(s) descartadas).`);
        continue;
      }

      logs.push(`  ✓ Asunto coincidió: evaluando ${candidates.length} plantilla(s) candidata(s).`);

      // Nivel 3: Desempate por match_pattern
      const toEvaluate =
        candidates.length > 1
          ? candidates.filter((t) => {
              if (!t.match_pattern) {
                logs.push(`  ⚠️ Plantilla "${t.name}": ambigua con otra del mismo asunto y SIN match_pattern — descartada.`);
                return false;
              }
              try {
                const regex = new RegExp(t.match_pattern, 'i');
                const matched = regex.test(body) || regex.test(subject);
                if (!matched) {
                  logs.push(`  → Plantilla "${t.name}": match_pattern "${t.match_pattern}" no encontrado en el mensaje.`);
                }
                return matched;
              } catch {
                return false;
              }
            })
          : candidates;

      for (const t of toEvaluate) {
        try {
          if (t.sender_pattern && !matchesEitherSource(t.sender_pattern, sender, body)) {
            logs.push(`  → Plantilla "${t.name}": descartada, sender_pattern no coincidió.`);
            continue;
          }

          const amountRegex = new RegExp(t.amount_regex, 'i');
          const amountMatch = body.match(amountRegex);
          if (!amountMatch) {
            logs.push(`  → Plantilla "${t.name}": pasó filtros de asunto y entidad, pero amount_regex no encontró ningún monto.`);
            continue;
          }

          const merchantMatch = t.merchant_regex ? body.match(new RegExp(t.merchant_regex, 'i')) : null;
          const dateMatch = t.date_regex ? body.match(new RegExp(t.date_regex, 'i')) : null;
          const timeMatch = t.time_regex ? body.match(new RegExp(t.time_regex, 'i')) : null;
          const currencyMatch = t.currency_regex ? body.match(new RegExp(t.currency_regex, 'i')) : null;
          const sourceAccountMatch = t.source_account_regex
            ? body.match(new RegExp(t.source_account_regex, 'i'))
            : null;

          const merchant = merchantMatch && merchantMatch[1] ? merchantMatch[1].trim() : null;
          const currency = currencyMatch && currencyMatch[1] ? currencyMatch[1] : t.default_currency || 'COP';

          let dtDate: string | null = null;
          let dtTime: string | null = null;
          if (dateMatch && dateMatch[1]) {
            const rawD = dateMatch[1];
            const rawT = timeMatch && timeMatch[1] ? timeMatch[1] : null;
            const combined = rawT ? `${rawD} ${rawT}` : rawD;
            const parsed = parseDateWithFormat(combined, t.date_format);
            if (parsed) {
              dtDate = parsed.date;
              dtTime = parsed.time;
            }
          }

          const normalizedAmt = normalizeAmount(amountMatch[1]);
          const numericAmount = Number(normalizedAmt);
          if (isNaN(numericAmount)) {
            logs.push(`  → Plantilla "${t.name}": amount_regex extrajo "${amountMatch[1]}" pero no se pudo convertir a número.`);
            continue;
          }

          const concept = buildConcept(t.expense_type_label, merchant);

          logs.push(`✅ [Apps Script Match] "${subject}" (de: ${sender}) → match con plantilla "${t.name}" (ID: ${t.id}), monto=${numericAmount}, concept="${concept}"`);

          return {
            matched: true,
            matchedTemplate: t,
            match: {
              templateId: t.id,
              amount: numericAmount,
              currency,
              merchant,
              entity: t.entity_name || null,
              sourceAccount: sourceAccountMatch && sourceAccountMatch[1] ? sourceAccountMatch[1] : null,
              date: dtDate,
              time: dtTime,
              concept,
              gmail_message_id: message.id || `sim-${Date.now()}`,
              received_at: message.date || new Date().toISOString(),
            },
            logs,
            cleanBody: body,
          };
        } catch (err) {
          logs.push(`❌ Error evaluando regex en plantilla "${t.name}": ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }
  }

  logs.push(`✋ [Apps Script] "${subject}" (de: ${sender}) → sin match con ninguna plantilla.`);
  return {
    matched: false,
    matchedTemplate: null,
    match: null,
    logs,
    cleanBody: body,
    rejectionReason: 'Ninguna plantilla cumplió los 3 niveles de filtrado de Apps Script o la extracción de monto.',
  };
}
