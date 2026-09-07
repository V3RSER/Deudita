import { cleanEmailBody, sanitizeRegexPattern } from './email-cleaning';

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
  time_format: string | null;
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
  entity?: { name?: string };
  expense_type?: { name?: string };
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

export interface DiagnosisTemplateReport {
  template: CatalogTemplate;
  level1Passed: boolean;
  level2Passed: boolean;
  level3Passed: boolean;
  level4Passed?: boolean;
  overallPassed?: boolean;
  failureReason?: string;
  failureReasons?: string[];
  extractedAmount?: number | null;
  extractedMerchant?: string | null;
  extractedSourceAccount?: string | null;
  extractedDate?: string | null;
  extractedTime?: string | null;
  extractedCurrency?: string | null;
  isWinner: boolean;
  evaluation?: SingleTemplateEvaluation;
}

export interface SingleTemplateEvaluation {
  template: CatalogTemplate;
  level1: {
    passed: boolean;
    entityName: string;
    entityPatterns: string[];
    matchedPattern?: string;
    matchedOn?: 'sender' | 'body';
    reason?: string;
  };
  level2: {
    passed: boolean;
    subjectPattern: string | null;
    matchedOn?: 'subject' | 'body';
    reason?: string;
  };
  level3: {
    passed: boolean;
    matchPattern: string | null;
    matchedOn?: 'body' | 'subject';
    reason?: string;
  };
  level4: {
    passed: boolean;
    fields: {
      amount: ExtractedField;
      merchant: ExtractedField;
      date: ExtractedField;
      time: ExtractedField;
      currency: ExtractedField;
      source_account: ExtractedField;
    };
    extractedAmount: number | null;
    extractedMerchant: string | null;
    extractedDate: string | null;
    extractedTime: string | null;
    extractedCurrency: string | null;
    extractedSourceAccount: string | null;
  };
  overallPassed: boolean;
  failureReasons: string[];
  criticalFailures: string[];
  warnings: string[];
}

export interface DiagnosisResult {
  cleanedBody: string;
  matched: boolean;
  level1: {
    passedEntities: Level1EntityReport[];
    matchingEntities: Array<{ id: string; name: string }>;
    survivingTemplates: CatalogTemplate[];
    discardedEntities: Level1EntityReport[];
    totalTemplatesDiscarded: number;
  };
  level2: {
    passedGroups: Level2SubjectGroupReport[];
    survivingTemplates: CatalogTemplate[];
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
  winner: (TemplateExtractionReport & {
    extractedAmount?: number | null;
    extractedMerchant?: string | null;
    extractedSourceAccount?: string | null;
  }) | null;
  reports: DiagnosisTemplateReport[];
}

function parseAmountValue(rawAmount: string | null): number | null {
  if (!rawAmount) return null;
  const sanitized = rawAmount.replace(/[$\s]/g, '').trim();
  if (!sanitized) return null;

  // Mantener exactamente la misma interpretación de separadores que usa el
  // simulador de Google Apps Script:
  // 53,079 -> 53079 | 49.800 -> 49800 | 49.800,50 -> 49800.50 | 49,800.50 -> 49800.50
  let normalized = sanitized;

  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(normalized)) {
    normalized = normalized.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(normalized)) {
    normalized = normalized.replace(/,/g, '');
  } else if (/^\d+,\d{1,2}$/.test(normalized)) {
    normalized = normalized.replace(',', '.');
  } else if (/^\d+\.\d{1,2}$/.test(normalized)) {
    // Decimal point only when it is not a 3-digit thousands group.
    normalized = normalized;
  } else {
    // For plain integers containing separators not covered above, discard
    // grouping commas/dots rather than silently turning thousands into decimals.
    normalized = normalized.replace(/,/g, '');
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Executes a regex extraction with safe evaluation, validating capture groups.
 */
function extractWithCaptureGroup(
  text: string,
  regexPattern: string | null | undefined,
  fieldLabel: string
): { success: boolean; rawExtracted: string | null; reason?: string; hasCaptureGroup: boolean } {
  const sanitized = sanitizeRegexPattern(regexPattern);
  if (!sanitized) {
    return {
      success: false,
      rawExtracted: null,
      reason: `${fieldLabel} no está definido en esta plantilla (null)`,
      hasCaptureGroup: false,
    };
  }

  try {
    const regex = new RegExp(sanitized, 'i');
    let match = text.match(regex);
    // Multiline / normalized whitespace fallback if strict text match fails
    if (!match) {
      const normalizedWhitespace = text.replace(/\s+/g, ' ');
      match = normalizedWhitespace.match(regex);
    }

    const hasCapture = sanitized.includes('(') && sanitized.includes(')');

    if (!match) {
      return {
        success: false,
        rawExtracted: null,
        reason: `No coincidió con el patrón en el cuerpo: /${sanitized}/i`,
        hasCaptureGroup: hasCapture,
      };
    }

    // Look for first defined capturing group (supports alternations like (group1)|(group2))
    const firstGroup = match.slice(1).find((g) => g !== undefined);
    if (firstGroup !== undefined) {
      return {
        success: true,
        rawExtracted: firstGroup.trim(),
        hasCaptureGroup: true,
      };
    }

    // Regex matched match[0] but had no capturing parentheses (...).
    // Extract match[0] so the user can see the captured value, and report a note about capture groups.
    return {
      success: true,
      rawExtracted: match[0].trim(),
      reason: 'Capturado de match[0]. Falta grupo de captura (...) para compatibilidad con Google Apps Script.',
      hasCaptureGroup: false,
    };
  } catch (err: unknown) {
    const errMessage = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      rawExtracted: null,
      reason: `Error de sintaxis en expresión regular /${sanitized}/: ${errMessage}`,
      hasCaptureGroup: false,
    };
  }
}

/**
 * Unified evaluation of a single template against an email.
 * Applies the EXACT same 4-level logic whether the template is an active draft/new template
 * or an already created template saved in the database.
 */
export function evaluateTemplateAgainstEmail(
  template: CatalogTemplate,
  email: { sender: string; subject: string; body?: string; plainBody?: string; snippet?: string },
  entities: CatalogEntity[] = []
): SingleTemplateEvaluation {
  const cleanBody = cleanEmailBody(email.body || email.plainBody || email.snippet || '');
  const sender = (email.sender || '').trim();
  const subject = (email.subject || '').trim();

  const criticalFailures: string[] = [];
  const warnings: string[] = [];

  // --- Level 1: Entidad ---
  let level1Passed = false;
  let l1MatchedPattern: string | undefined;
  let l1MatchedOn: 'sender' | 'body' | undefined;
  let l1Reason: string | undefined;

  const matchedEntity = template.entity_id
    ? entities.find((e) => e.id === template.entity_id)
    : template.entity_name
    ? entities.find((e) => e.name.toLowerCase().trim() === template.entity_name!.toLowerCase().trim())
    : null;

  const entityPatterns = [
    ...(template.entity_email_patterns || []),
    ...(matchedEntity?.patterns || []),
  ].filter(Boolean);

  const entityName = template.entity_name || matchedEntity?.name || 'Entidad';

  if (entityPatterns.length > 0) {
    for (const pat of entityPatterns) {
      const sanitized = sanitizeRegexPattern(pat);
      if (!sanitized) continue;
      try {
        const re = new RegExp(sanitized, 'i');
        if (re.test(sender)) {
          level1Passed = true;
          l1MatchedPattern = pat;
          l1MatchedOn = 'sender';
          break;
        }
        if (re.test(cleanBody)) {
          level1Passed = true;
          l1MatchedPattern = pat;
          l1MatchedOn = 'body';
          break;
        }
      } catch {
        // Invalid regex in pattern list
      }
    }

    if (!level1Passed && template.sender_pattern) {
      const sanitizedSender = sanitizeRegexPattern(template.sender_pattern);
      if (sanitizedSender) {
        try {
          const re = new RegExp(sanitizedSender, 'i');
          if (re.test(sender)) {
            level1Passed = true;
            l1MatchedPattern = template.sender_pattern;
            l1MatchedOn = 'sender';
          } else if (re.test(cleanBody)) {
            level1Passed = true;
            l1MatchedPattern = template.sender_pattern;
            l1MatchedOn = 'body';
          }
        } catch {}
      }
    }

    if (!level1Passed) {
      l1Reason = `El remitente ("${sender || 'vacío'}") o cuerpo no coincide con ningún patrón de la entidad "${entityName}" (${entityPatterns.map((p) => `/${p}/i`).join(', ')}).`;
      criticalFailures.push(`Paso 1 (Entidad): ${l1Reason}`);
    }
  } else if (template.sender_pattern) {
    const sanitized = sanitizeRegexPattern(template.sender_pattern);
    if (sanitized) {
      try {
        const re = new RegExp(sanitized, 'i');
        if (re.test(sender)) {
          level1Passed = true;
          l1MatchedPattern = template.sender_pattern;
          l1MatchedOn = 'sender';
        } else if (re.test(cleanBody)) {
          level1Passed = true;
          l1MatchedPattern = template.sender_pattern;
          l1MatchedOn = 'body';
        } else {
          l1Reason = `El remitente o cuerpo no coincide con el patrón de remitente /${sanitized}/i.`;
          criticalFailures.push(`Paso 1 (Entidad): ${l1Reason}`);
        }
      } catch (err: unknown) {
        l1Reason = `Error en patrón de remitente /${sanitized}/: ${err instanceof Error ? err.message : String(err)}`;
        criticalFailures.push(`Paso 1 (Entidad): ${l1Reason}`);
      }
    } else {
      level1Passed = true;
    }
  } else {
    // Si no tiene patrones configurados, pasa nivel 1
    level1Passed = true;
  }

  // --- Level 2: Asunto ---
  let level2Passed = false;
  let l2MatchedOn: 'subject' | 'body' | undefined;
  let l2Reason: string | undefined;

  const sanitizedSubject = sanitizeRegexPattern(template.subject_pattern);
  if (sanitizedSubject) {
    try {
      const re = new RegExp(sanitizedSubject, 'i');
      if (re.test(subject)) {
        level2Passed = true;
        l2MatchedOn = 'subject';
      } else if (re.test(cleanBody)) {
        level2Passed = true;
        l2MatchedOn = 'body';
      } else {
        l2Reason = `El asunto ("${subject || 'vacío'}") no coincide con el patrón /${sanitizedSubject}/i.`;
        criticalFailures.push(`Paso 2 (Asunto): ${l2Reason}`);
      }
    } catch (err: unknown) {
      l2Reason = `Error en patrón de asunto /${sanitizedSubject}/: ${err instanceof Error ? err.message : String(err)}`;
      criticalFailures.push(`Paso 2 (Asunto): ${l2Reason}`);
    }
  } else {
    level2Passed = true;
  }

  // --- Level 3: Desempate (match_pattern) ---
  let level3Passed = false;
  let l3MatchedOn: 'body' | 'subject' | undefined;
  let l3Reason: string | undefined;

  const sanitizedMatch = sanitizeRegexPattern(template.match_pattern);
  if (sanitizedMatch) {
    try {
      const re = new RegExp(sanitizedMatch, 'i');
      if (re.test(cleanBody)) {
        level3Passed = true;
        l3MatchedOn = 'body';
      } else if (re.test(subject)) {
        level3Passed = true;
        l3MatchedOn = 'subject';
      } else {
        l3Reason = `El patrón de desempate /${sanitizedMatch}/i no fue encontrado en el cuerpo ni en el asunto del correo.`;
        criticalFailures.push(`Paso 3 (Desempate): ${l3Reason}`);
      }
    } catch (err: unknown) {
      l3Reason = `Error en patrón de desempate /${sanitizedMatch}/: ${err instanceof Error ? err.message : String(err)}`;
      criticalFailures.push(`Paso 3 (Desempate): ${l3Reason}`);
    }
  } else {
    level3Passed = true;
  }

  // --- Level 4: Extracción ---
  // Monto (obligatorio para éxito del match)
  let amountRes = extractWithCaptureGroup(cleanBody, template.amount_regex, 'Monto');
  if (!amountRes.success && subject) {
    const subjectAmountRes = extractWithCaptureGroup(subject, template.amount_regex, 'Monto');
    if (subjectAmountRes.success) amountRes = subjectAmountRes;
  }
  const parsedAmount = amountRes.success ? parseAmountValue(amountRes.rawExtracted) : null;
  const amountSuccess = Boolean(amountRes.success && parsedAmount !== null);
  if (!amountSuccess) {
    const r = !amountRes.success
      ? (amountRes.reason || `No coincidió con el patrón /${template.amount_regex}/i`)
      : 'No se pudo convertir el monto extraído a un número válido';
    criticalFailures.push(`Paso 4 (Monto): ${r}`);
  } else if (!amountRes.hasCaptureGroup) {
    warnings.push('Monto: capturado sin grupo (...). Agrega paréntesis para compatibilidad con Google Apps Script.');
  }

  // Comercio (opcional)
  let merchantRes = extractWithCaptureGroup(cleanBody, template.merchant_regex, 'Comercio');
  if (!merchantRes.success && subject) {
    const subjectMerchantRes = extractWithCaptureGroup(subject, template.merchant_regex, 'Comercio');
    if (subjectMerchantRes.success) merchantRes = subjectMerchantRes;
  }
  if (template.merchant_regex && !merchantRes.success) {
    warnings.push(`Comercio: ${merchantRes.reason || 'Sin captura'}`);
  } else if (merchantRes.success && !merchantRes.hasCaptureGroup) {
    warnings.push('Comercio: capturado sin grupo (...). Agrega paréntesis para Google Apps Script.');
  }

  // Fecha (opcional)
  let dateRes = extractWithCaptureGroup(cleanBody, template.date_regex, 'Fecha');
  if (!dateRes.success && subject) {
    const subjectDateRes = extractWithCaptureGroup(subject, template.date_regex, 'Fecha');
    if (subjectDateRes.success) dateRes = subjectDateRes;
  }
  if (template.date_regex && !dateRes.success) {
    warnings.push(`Fecha: ${dateRes.reason || 'Sin captura'}`);
  } else if (dateRes.success && !dateRes.hasCaptureGroup) {
    warnings.push('Fecha: capturada sin grupo (...). Agrega paréntesis para Google Apps Script.');
  }

  // Hora (opcional)
  let timeRes = extractWithCaptureGroup(cleanBody, template.time_regex, 'Hora');
  if (!timeRes.success && subject) {
    const subjectTimeRes = extractWithCaptureGroup(subject, template.time_regex, 'Hora');
    if (subjectTimeRes.success) timeRes = subjectTimeRes;
  }
  if (template.time_regex && !timeRes.success) {
    warnings.push(`Hora: ${timeRes.reason || 'Sin captura'}`);
  } else if (timeRes.success && !timeRes.hasCaptureGroup) {
    warnings.push('Hora: capturada sin grupo (...). Agrega paréntesis para Google Apps Script.');
  }

  // Moneda (opcional)
  let currencyRes = extractWithCaptureGroup(cleanBody, template.currency_regex, 'Moneda');
  if (!currencyRes.success && subject) {
    const subjectCurrRes = extractWithCaptureGroup(subject, template.currency_regex, 'Moneda');
    if (subjectCurrRes.success) currencyRes = subjectCurrRes;
  }
  const currencySuccess = currencyRes.success || Boolean(template.default_currency);

  // Cuenta (opcional)
  let accountRes = extractWithCaptureGroup(cleanBody, template.source_account_regex, 'Cuenta de origen');
  if (!accountRes.success && subject) {
    const subjectAccRes = extractWithCaptureGroup(subject, template.source_account_regex, 'Cuenta de origen');
    if (subjectAccRes.success) accountRes = subjectAccRes;
  }
  if (template.source_account_regex && !accountRes.success) {
    warnings.push(`Cuenta origen: ${accountRes.reason || 'Sin captura'}`);
  } else if (accountRes.success && !accountRes.hasCaptureGroup) {
    warnings.push('Cuenta origen: capturada sin grupo (...). Agrega paréntesis para Google Apps Script.');
  }

  const level4Passed = amountSuccess;
  const overallPassed = level1Passed && level2Passed && level3Passed && level4Passed;
  const failureReasons = [...criticalFailures, ...warnings];

  return {
    template,
    level1: {
      passed: level1Passed,
      entityName,
      entityPatterns,
      matchedPattern: l1MatchedPattern,
      matchedOn: l1MatchedOn,
      reason: l1Reason,
    },
    level2: {
      passed: level2Passed,
      subjectPattern: template.subject_pattern,
      matchedOn: l2MatchedOn,
      reason: l2Reason,
    },
    level3: {
      passed: level3Passed,
      matchPattern: template.match_pattern,
      matchedOn: l3MatchedOn,
      reason: l3Reason,
    },
    level4: {
      passed: level4Passed,
      fields: {
        amount: {
          field: 'amount',
          label: 'Monto',
          pattern: template.amount_regex,
          rawExtracted: amountRes.rawExtracted,
          cleanedValue: parsedAmount,
          success: amountSuccess,
          reason: !amountRes.success ? amountRes.reason : parsedAmount === null ? 'No se pudo convertir a número' : undefined,
          hasCaptureGroup: amountRes.hasCaptureGroup,
        },
        merchant: {
          field: 'merchant',
          label: 'Comercio / Destinatario',
          pattern: template.merchant_regex,
          rawExtracted: merchantRes.rawExtracted,
          cleanedValue: merchantRes.rawExtracted,
          success: merchantRes.success,
          reason: merchantRes.reason,
          hasCaptureGroup: merchantRes.hasCaptureGroup,
        },
        date: {
          field: 'date',
          label: 'Fecha',
          pattern: template.date_regex,
          rawExtracted: dateRes.rawExtracted,
          cleanedValue: dateRes.rawExtracted,
          success: dateRes.success,
          reason: dateRes.reason,
          hasCaptureGroup: dateRes.hasCaptureGroup,
        },
        time: {
          field: 'time',
          label: 'Hora',
          pattern: template.time_regex,
          rawExtracted: timeRes.rawExtracted,
          cleanedValue: timeRes.rawExtracted,
          success: timeRes.success,
          reason: timeRes.reason,
          hasCaptureGroup: timeRes.hasCaptureGroup,
        },
        currency: {
          field: 'currency',
          label: 'Moneda',
          pattern: template.currency_regex,
          rawExtracted: currencyRes.rawExtracted || template.default_currency || 'COP',
          cleanedValue: currencyRes.rawExtracted || template.default_currency || 'COP',
          success: currencySuccess,
          reason: currencyRes.reason,
          hasCaptureGroup: currencyRes.hasCaptureGroup,
        },
        source_account: {
          field: 'source_account',
          label: 'Cuenta / Tarjeta Origen',
          pattern: template.source_account_regex,
          rawExtracted: accountRes.rawExtracted,
          cleanedValue: accountRes.rawExtracted,
          success: accountRes.success,
          reason: accountRes.reason,
          hasCaptureGroup: accountRes.hasCaptureGroup,
        },
      },
      extractedAmount: parsedAmount,
      extractedMerchant: merchantRes.rawExtracted,
      extractedDate: dateRes.rawExtracted,
      extractedTime: timeRes.rawExtracted,
      extractedCurrency: currencyRes.rawExtracted || template.default_currency || 'COP',
      extractedSourceAccount: accountRes.rawExtracted,
    },
    overallPassed,
    failureReasons,
    criticalFailures,
    warnings,
  };
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

  // Mirror Google Apps Script exactly: templates participate only through
  // their persisted entity_id. No fallback by entity_name and no virtual
  // entities for saved templates.
  const entityMap = new Map<string, { entity: CatalogEntity | null; templates: CatalogTemplate[] }>();

  for (const ent of entities) {
    entityMap.set(ent.id, { entity: ent, templates: [] });
  }

  const orphanTemplates = new Set<string>();

  for (const tpl of templates) {
    if (!tpl.entity_id || !entityMap.has(tpl.entity_id)) {
      orphanTemplates.add(tpl.id);
      continue;
    }
    entityMap.get(tpl.entity_id)!.templates.push(tpl);
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

    // Google Apps Script uses ONLY the persisted entity_email_patterns returned
    // with the template. sender_pattern and entity name are not substitutes.
    const patternsToTest: string[] = [];
    for (const tpl of entTemplates) {
      for (const p of Array.isArray(tpl.entity_email_patterns) ? tpl.entity_email_patterns : []) {
        const cleanP = sanitizeRegexPattern(p);
        if (cleanP && !patternsToTest.includes(cleanP)) patternsToTest.push(cleanP);
      }
    }

    if (patternsToTest.length === 0) {
      passedEntities.push({
        entityId: entId,
        entityName: entity?.name || entId,
        patterns: [],
        matched: true,
        templatesCount: entTemplates.length,
        templateNames: entTemplates.map((t) => t.name),
      });
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
        entityName: entity?.name || entId,
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
        entityName: entity?.name || entId,
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
      const rawSubjectPattern = key === '__NO_SUBJECT_PATTERN__' ? null : key;
      const subjectPattern = sanitizeRegexPattern(rawSubjectPattern);

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
      const rawMatchPattern = tpl.match_pattern?.trim() || null;
      const matchPattern = sanitizeRegexPattern(rawMatchPattern);

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

  const l1SurvivingTemplates: CatalogTemplate[] = [];
  for (const pe of passedEntities) {
    const data = entityMap.get(pe.entityId);
    if (data) {
      l1SurvivingTemplates.push(...data.templates);
    }
  }

  const l2SurvivingTemplates: CatalogTemplate[] = [];
  for (const pg of passedGroups) {
    l2SurvivingTemplates.push(...pg.templates);
  }

  const templateReports: DiagnosisTemplateReport[] = templates.map((tpl) => {
    const evaluation = evaluateTemplateAgainstEmail(tpl, { sender, subject, body: cleanBody }, entities);

    if (orphanTemplates.has(tpl.id)) {
      return {
        template: tpl,
        level1Passed: false,
        level2Passed: false,
        level3Passed: false,
        level4Passed: false,
        overallPassed: false,
        failureReason: 'Omitida en producción: la plantilla no tiene un entity_id válido que pertenezca al catálogo de entidades.',
        failureReasons: ['Omitida: sin entity_id válido en catálogo'],
        isWinner: false,
        evaluation,
      };
    }

    const passedL1 = l1SurvivingTemplates.some((t) => t.id === tpl.id);
    if (!passedL1) {
      const entName = tpl.entity_name || tpl.entity?.name || 'Entidad';
      const reason = `Descartada en Paso 1: El remitente/cuerpo no coincide con la entidad "${entName}".`;
      return {
        template: tpl,
        level1Passed: false,
        level2Passed: false,
        level3Passed: false,
        level4Passed: false,
        overallPassed: false,
        failureReason: reason,
        failureReasons: [reason, ...evaluation.failureReasons],
        isWinner: false,
        evaluation,
      };
    }

    const passedL2 = l2SurvivingTemplates.some((t) => t.id === tpl.id);
    if (!passedL2) {
      const reason = `Descartada en Paso 2: El asunto no coincide con el patrón /${tpl.subject_pattern || ''}/i.`;
      return {
        template: tpl,
        level1Passed: true,
        level2Passed: false,
        level3Passed: false,
        level4Passed: false,
        overallPassed: false,
        failureReason: reason,
        failureReasons: [reason, ...evaluation.failureReasons],
        isWinner: false,
        evaluation,
      };
    }

    const surviving = survivingTemplates.some((t) => t.id === tpl.id);
    if (!surviving) {
      const disc = discardedCandidates.find((c) => c.template.id === tpl.id);
      const reason = disc?.discardReason || `Descartada en Paso 3: Patrón de desempate /${tpl.match_pattern || ''}/i no encontrado.`;
      return {
        template: tpl,
        level1Passed: true,
        level2Passed: true,
        level3Passed: false,
        level4Passed: false,
        overallPassed: false,
        failureReason: reason,
        failureReasons: [reason, ...evaluation.failureReasons],
        isWinner: false,
        evaluation,
      };
    }

    const ext = extractions.find((e) => e.template.id === tpl.id);
    const amountOk = Boolean(ext?.fields.amount.success);
    const isWinner = Boolean(amountOk && winner?.template.id === tpl.id);
    const failureReason = amountOk ? undefined : `Falló la extracción de Monto: ${ext?.fields.amount.reason || 'no se pudo extraer o convertir el monto.'}`;

    return {
      template: tpl,
      level1Passed: true,
      level2Passed: true,
      level3Passed: true,
      level4Passed: amountOk,
      overallPassed: Boolean(surviving && amountOk),
      failureReason,
      failureReasons: failureReason ? [failureReason, ...evaluation.failureReasons] : evaluation.failureReasons,
      extractedAmount: (ext?.fields.amount.cleanedValue as number | null) ?? evaluation.level4.extractedAmount,
      extractedMerchant: (ext?.fields.merchant.cleanedValue as string | null) ?? evaluation.level4.extractedMerchant,
      extractedSourceAccount: (ext?.fields.source_account.cleanedValue as string | null) ?? evaluation.level4.extractedSourceAccount,
      extractedDate: (ext?.fields.date.cleanedValue as string | null) ?? evaluation.level4.extractedDate,
      extractedTime: (ext?.fields.time.cleanedValue as string | null) ?? evaluation.level4.extractedTime,
      extractedCurrency: (ext?.fields.currency.cleanedValue as string | null) ?? evaluation.level4.extractedCurrency,
      isWinner,
      evaluation,
    };
  });

  // Sort reports: Winners/Complete matches first, then level 2, then level 1
  templateReports.sort((a, b) => {
    if (a.isWinner) return -1;
    if (b.isWinner) return 1;
    if (a.level3Passed && !b.level3Passed) return -1;
    if (!a.level3Passed && b.level3Passed) return 1;
    if (a.level2Passed && !b.level2Passed) return -1;
    if (!a.level2Passed && b.level2Passed) return 1;
    if (a.level1Passed && !b.level1Passed) return -1;
    if (!a.level1Passed && b.level1Passed) return 1;
    return 0;
  });

  const winnerWithFields = winner
    ? {
        ...winner,
        extractedAmount: (winner.fields.amount.cleanedValue as number | null) ?? null,
        extractedMerchant: (winner.fields.merchant.cleanedValue as string | null) ?? null,
        extractedSourceAccount: (winner.fields.source_account.cleanedValue as string | null) ?? null,
      }
    : null;

  return {
    cleanedBody: cleanBody,
    matched: Boolean(winner && winner.fields.amount.success),
    level1: {
      passedEntities,
      matchingEntities: passedEntities.map((e) => ({ id: e.entityId, name: e.entityName })),
      survivingTemplates: l1SurvivingTemplates,
      discardedEntities,
      totalTemplatesDiscarded: l1DiscardedTemplatesCount,
    },
    level2: {
      passedGroups,
      survivingTemplates: l2SurvivingTemplates,
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
    winner: winnerWithFields,
    reports: templateReports,
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

function parseFormattedTokens(
  rawValue: string | null | undefined,
  formatStr: string | null | undefined,
  allowedTokens: RegExp
): Record<string, string> | null {
  if (!rawValue || !formatStr) return null;

  const tokenOrder: string[] = [];
  const tokenRegexSource = formatStr.replace(allowedTokens, (token) => {
    tokenOrder.push(token);
    return token === 'YYYY' ? '(\\d{4})' : '(\\d{1,2})';
  });

  try {
    const match = rawValue.trim().match(new RegExp(tokenRegexSource));
    if (!match) return null;

    const parts: Record<string, string> = {};
    tokenOrder.forEach((token, i) => {
      parts[token] = match[i + 1].padStart(token === 'YYYY' ? 4 : 2, '0');
    });

    return parts;
  } catch {
    return null;
  }
}

export function parseDateWithFormat(
  rawDateStr: string | null | undefined,
  formatStr: string | null | undefined
): { date: string; time: string } | null {
  if (!rawDateStr || !formatStr) return null;

  const parts = parseFormattedTokens(rawDateStr, formatStr, /YYYY|MM|DD/g);
  if (!parts || !parts.YYYY || !parts.MM || !parts.DD) return null;

  return {
    date: `${parts.YYYY}-${parts.MM}-${parts.DD}`,
    time: '00:00:00',
  };
}

export function parseTimeWithFormat(
  rawTimeStr: string | null | undefined,
  formatStr: string | null | undefined
): string | null {
  if (!rawTimeStr || !formatStr) return null;

  const parts = parseFormattedTokens(rawTimeStr, formatStr, /HH|mm|ss/g);
  if (!parts || !parts.HH || !parts.mm) return null;

  return `${parts.HH}:${parts.mm}:${parts.ss || '00'}`;
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
  const cleanPat = sanitizeRegexPattern(pattern);
  if (!cleanPat) return false;
  try {
    const regex = new RegExp(cleanPat, 'i');
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

  // Match the production Apps Script data model exactly. A template without
  // a valid entity_id is ignored. Level 1 reads only entity_email_patterns.
  const entityMap = new Map<
    string,
    { entityId: string; entityName: string; emailPatterns: string[]; templates: CatalogTemplate[] }
  >();

  for (const ent of entities) {
    entityMap.set(ent.id, {
      entityId: ent.id,
      entityName: ent.name,
      emailPatterns: [],
      templates: [],
    });
  }

  for (const t of templates) {
    if (!t.entity_id || !entityMap.has(t.entity_id)) {
      logs.push(`  ⚠️ Plantilla "${t.name}": sin entity_id válido — Apps Script la ignora.`);
      continue;
    }

    const grp = entityMap.get(t.entity_id)!;
    grp.templates.push(t);
    for (const ep of Array.isArray(t.entity_email_patterns) ? t.entity_email_patterns : []) {
      const cleanEp = sanitizeRegexPattern(ep);
      if (cleanEp && !grp.emailPatterns.includes(cleanEp)) grp.emailPatterns.push(cleanEp);
    }
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
              const cleanMatchPat = sanitizeRegexPattern(t.match_pattern);
              if (!cleanMatchPat) {
                logs.push(`  ⚠️ Plantilla "${t.name}": ambigua con otra del mismo asunto y SIN match_pattern — descartada.`);
                return false;
              }
              try {
                const regex = new RegExp(cleanMatchPat, 'i');
                const matched = regex.test(body) || regex.test(subject);
                if (!matched) {
                  logs.push(`  → Plantilla "${t.name}": match_pattern "${cleanMatchPat}" no encontrado en el mensaje.`);
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

          const cleanAmtRegex = sanitizeRegexPattern(t.amount_regex) || t.amount_regex;
          const amountRegex = new RegExp(cleanAmtRegex, 'i');
          const amountMatch = body.match(amountRegex);
          if (!amountMatch) {
            logs.push(`  → Plantilla "${t.name}": pasó filtros de asunto y entidad, pero amount_regex no encontró ningún monto.`);
            continue;
          }

          const rawAmt = amountMatch[1];
          if (rawAmt === undefined) {
            logs.push(`  ❌ Plantilla "${t.name}": amount_regex coincidió pero no tiene grupo de captura (...). En Google Apps Script amountMatch[1] es undefined y se descarta.`);
            continue;
          }

          const normalizedAmt = normalizeAmount(rawAmt);
          const numericAmount = Number(normalizedAmt);
          if (isNaN(numericAmount) || !normalizedAmt) {
            logs.push(`  → Plantilla "${t.name}": amount_regex extrajo "${rawAmt}" pero no se pudo convertir a número.`);
            continue;
          }

          const cleanMerchRegex = sanitizeRegexPattern(t.merchant_regex);
          const merchantMatch = cleanMerchRegex ? body.match(new RegExp(cleanMerchRegex, 'i')) : null;
          let merchant: string | null = null;
          if (merchantMatch) {
            if (merchantMatch[1] === undefined) {
              logs.push(`  ❌ Plantilla "${t.name}": merchant_regex coincidió pero no tiene grupo de captura (...). En Google Apps Script provocará TypeError al llamar a merchantMatch[1].trim().`);
              continue;
            }
            merchant = merchantMatch[1].trim();
          }

          const cleanDateRegex = sanitizeRegexPattern(t.date_regex);
          const dateMatch = cleanDateRegex ? body.match(new RegExp(cleanDateRegex, 'i')) : null;
          const cleanTimeRegex = sanitizeRegexPattern(t.time_regex);
          const timeMatch = cleanTimeRegex ? body.match(new RegExp(cleanTimeRegex, 'i')) : null;
          const cleanCurrRegex = sanitizeRegexPattern(t.currency_regex);
          const currencyMatch = cleanCurrRegex ? body.match(new RegExp(cleanCurrRegex, 'i')) : null;
          const cleanSourceRegex = sanitizeRegexPattern(t.source_account_regex);
          const sourceAccountMatch = cleanSourceRegex
            ? body.match(new RegExp(cleanSourceRegex, 'i'))
            : null;

          const currency = currencyMatch && currencyMatch[1] ? currencyMatch[1] : t.default_currency || 'COP';

          let dtDate: string | null = null;
          let dtTime: string | null = null;

          const rawD = dateMatch?.[1] !== undefined ? dateMatch[1] : null;
          const rawT = timeMatch?.[1] !== undefined ? timeMatch[1] : null;

          if (rawD) {
            const parsedDate = parseDateWithFormat(rawD, t.date_format);
            if (parsedDate) {
              dtDate = parsedDate.date;
            }
          }

          if (rawT) {
            dtTime = parseTimeWithFormat(rawT, t.time_format);
          }

          // Backward compatibility: templates created before time_format existed
          // may have included HH/mm/ss inside date_format.
          if (rawD && !dtTime && !t.time_format && t.date_format?.match(/HH|mm|ss/)) {
            const combined = rawT ? `${rawD} ${rawT}` : rawD;
            const parsedLegacy = parseFormattedTokens(combined, t.date_format, /YYYY|MM|DD|HH|mm|ss/g);
            if (parsedLegacy?.YYYY && parsedLegacy.MM && parsedLegacy.DD) {
              dtDate = `${parsedLegacy.YYYY}-${parsedLegacy.MM}-${parsedLegacy.DD}`;
              dtTime = `${parsedLegacy.HH || '00'}:${parsedLegacy.mm || '00'}:${parsedLegacy.ss || '00'}`;
            }
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
              sourceAccount: sourceAccountMatch ? (sourceAccountMatch[1] !== undefined ? sourceAccountMatch[1] : sourceAccountMatch[0]) : null,
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
