import {
  cleanEmailBody,
  sanitizeRegexPattern,
  getHeadLines,
  stripSubjectPrefixes,
  extractForwardedSenderFromBody,
  extractForwardedSubjectFromBody,
} from './email-cleaning';

export interface CatalogEntity {
  id: string;
  name: string;
  patterns: string[];
}

export interface CatalogTemplate {
  id: string;
  name: string;
  subject_pattern: string | null;
  amount_regex: string;
  merchant_regex: string | null;
  date_regex: string | null;
  date_format: string | null;
  time_format: string | null;
  entity_id: string | null;
  match_pattern: string | null;
  expense_type_id: string | null;
  expense_type_label?: string | null;
  currency_regex: string | null;
  source_account_regex: string | null;
  time_regex: string | null;
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


type RegexMatchResult = {
  success: boolean;
  rawExtracted: string | null;
  reason?: string;
  hasCaptureGroup: boolean;
};

type FieldConfig = {
  field: ExtractedField['field'];
  label: string;
  pattern: string | null | undefined;
};

const FORWARDED_HEADER_LINES = 15;

const FIELD_LABELS: Record<ExtractedField['field'], string> = {
  amount: 'Monto',
  merchant: 'Comercio / Destinatario',
  date: 'Fecha',
  time: 'Hora',
  currency: 'Moneda',
  source_account: 'Cuenta / Tarjeta Origen',
};

function uniqueSanitizedPatterns(patterns: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(
      patterns
        .map((pattern) => sanitizeRegexPattern(pattern))
        .filter((pattern): pattern is string => Boolean(pattern))
    )
  );
}

function getCleanEmailContext(text: string): {
  cleanBody: string;
  bodyHeadLines: string;
  forwardedSender: string | null;
} {
  const cleanBody = cleanEmailBody(text);
  return {
    cleanBody,
    bodyHeadLines: getHeadLines(cleanBody, FORWARDED_HEADER_LINES),
    forwardedSender: extractForwardedSenderFromBody(cleanBody, FORWARDED_HEADER_LINES),
  };
}

function createRegex(pattern: string | null | undefined, flags = 'i'): RegExp | null {
  const sanitized = sanitizeRegexPattern(pattern);
  if (!sanitized) return null;

  try {
    return new RegExp(sanitized, flags);
  } catch {
    return null;
  }
}

function testRegexAgainstTexts(regex: RegExp, texts: Array<string | null | undefined>): boolean {
  return texts.some((text) => text != null && text !== '' && regex.test(text));
}

function parseAmountValue(rawAmount: string | null): number | null {
  if (!rawAmount) return null;

  const sanitized = rawAmount.replace(/[$\s]/g, '').trim();
  if (!sanitized) return null;

  let normalized = sanitized;

  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(normalized)) {
    normalized = normalized.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(normalized)) {
    normalized = normalized.replace(/,/g, '');
  } else if (/^\d+,\d{1,2}$/.test(normalized)) {
    normalized = normalized.replace(',', '.');
  } else if (/^\d+\.\d{1,2}$/.test(normalized)) {
    // Keep decimal-point values unchanged.
  } else {
    normalized = normalized.replace(/,/g, '');
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Executes a regex extraction with safe evaluation, validating capture groups.
 */
export function extractWithCaptureGroup(
  text: string,
  regexPattern: string | null | undefined,
  fieldLabel: string
): RegexMatchResult {
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
    const normalizedText = text.replace(/\s+/g, ' ');
    const match = regex.exec(text) ?? regex.exec(normalizedText);

    const hasCaptureGroup = sanitized.includes('(') && sanitized.includes(')');

    if (!match) {
      return {
        success: false,
        rawExtracted: null,
        reason: `No coincidió con el patrón en el cuerpo: /${sanitized}/i`,
        hasCaptureGroup,
      };
    }

    const firstGroup = match.slice(1).find((group) => group !== undefined);
    if (firstGroup !== undefined) {
      return {
        success: true,
        rawExtracted: firstGroup.trim(),
        hasCaptureGroup: true,
      };
    }

    return {
      success: true,
      rawExtracted: match[0].trim(),
      reason: 'Capturado de match[0]. Falta grupo de captura (...) para compatibilidad con Google Apps Script.',
      hasCaptureGroup: false,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      rawExtracted: null,
      reason: `Error de sintaxis en expresión regular /${sanitized}/: ${message}`,
      hasCaptureGroup: false,
    };
  }
}

function extractTemplateFields(
  template: CatalogTemplate,
  body: string
): {
  amountRes: RegexMatchResult;
  merchantRes: RegexMatchResult;
  dateRes: RegexMatchResult;
  timeRes: RegexMatchResult;
  currencyRes: RegexMatchResult;
  accountRes: RegexMatchResult;
  parsedAmount: number | null;
} {
  const fields: FieldConfig[] = [
    { field: 'amount', label: 'Monto', pattern: template.amount_regex },
    { field: 'merchant', label: 'Comercio / Destinatario', pattern: template.merchant_regex },
    { field: 'date', label: 'Fecha', pattern: template.date_regex },
    { field: 'time', label: 'Hora', pattern: template.time_regex },
    { field: 'currency', label: 'Moneda', pattern: template.currency_regex },
    { field: 'source_account', label: 'Cuenta de origen', pattern: template.source_account_regex },
  ];

  const extracted = {} as Record<ExtractedField['field'], RegexMatchResult>;

  for (const { field, label, pattern } of fields) {
    extracted[field] = extractWithCaptureGroup(body, pattern, label);
  }

  return {
    amountRes: extracted.amount,
    merchantRes: extracted.merchant,
    dateRes: extracted.date,
    timeRes: extracted.time,
    currencyRes: extracted.currency,
    accountRes: extracted.source_account,
    parsedAmount: parseAmountValue(extracted.amount.rawExtracted),
  };
}

function buildExtractedField(
  field: ExtractedField['field'],
  pattern: string | null,
  result: RegexMatchResult,
  cleanedValue: string | number | null,
  success = result.success
): ExtractedField {
  return {
    field,
    label: FIELD_LABELS[field],
    pattern,
    rawExtracted: result.rawExtracted,
    cleanedValue,
    success,
    reason: result.reason,
    hasCaptureGroup: result.hasCaptureGroup,
  };
}

function buildTemplateExtractionReport(
  template: CatalogTemplate,
  body: string
): TemplateExtractionReport {
  const {
    amountRes,
    merchantRes,
    dateRes,
    timeRes,
    currencyRes,
    accountRes,
    parsedAmount,
  } = extractTemplateFields(template, body);

  const amountSuccess = amountRes.success && parsedAmount !== null;

  return {
    template,
    isWinner: false,
    fields: {
      amount: buildExtractedField(
        'amount',
        template.amount_regex,
        amountRes,
        parsedAmount,
        amountSuccess
      ),
      merchant: buildExtractedField(
        'merchant',
        template.merchant_regex,
        merchantRes,
        merchantRes.rawExtracted
      ),
      date: buildExtractedField('date', template.date_regex, dateRes, dateRes.rawExtracted),
      time: buildExtractedField('time', template.time_regex, timeRes, timeRes.rawExtracted),
      currency: buildExtractedField(
        'currency',
        template.currency_regex,
        currencyRes,
        currencyRes.rawExtracted
      ),
      source_account: buildExtractedField(
        'source_account',
        template.source_account_regex,
        accountRes,
        accountRes.rawExtracted
      ),
    },
    hasErrors: !amountSuccess,
  };
}

function getEvaluationWarnings(template: CatalogTemplate, fields: ReturnType<typeof extractTemplateFields>): string[] {
  const warnings: string[] = [];
  const optionalFields: Array<{
    result: RegexMatchResult;
    pattern: string | null;
    label: string;
  }> = [
      { result: fields.merchantRes, pattern: template.merchant_regex, label: 'Comercio' },
      { result: fields.dateRes, pattern: template.date_regex, label: 'Fecha' },
      { result: fields.timeRes, pattern: template.time_regex, label: 'Hora' },
      { result: fields.accountRes, pattern: template.source_account_regex, label: 'Cuenta origen' },
    ];

  for (const { result, pattern, label } of optionalFields) {
    if (pattern && !result.success) {
      warnings.push(`${label}: ${result.reason || 'Sin captura'}`);
    } else if (result.success && !result.hasCaptureGroup) {
      warnings.push(
        `${label}: capturada sin grupo (...). Agrega paréntesis para Google Apps Script.`
      );
    }
  }

  return warnings;
}

function buildEntityLookup(
  entities: CatalogEntity[],
  templates: CatalogTemplate[]
): {
  entityMap: Map<string, { entity: CatalogEntity | null; templates: CatalogTemplate[] }>;
  orphanTemplates: Set<string>;
} {
  const entityMap = new Map<string, { entity: CatalogEntity | null; templates: CatalogTemplate[] }>();

  for (const entity of entities) {
    entityMap.set(entity.id, { entity, templates: [] });
  }

  const orphanTemplates = new Set<string>();

  for (const template of templates) {
    if (!template.entity_id || !entityMap.has(template.entity_id)) {
      orphanTemplates.add(template.id);
      continue;
    }

    entityMap.get(template.entity_id)!.templates.push(template);
  }

  return { entityMap, orphanTemplates };
}

function groupTemplatesBySubject(
  templates: CatalogTemplate[],
  uniqueNullKeys: boolean
): Map<string, CatalogTemplate[]> {
  const groups = new Map<string, CatalogTemplate[]>();

  for (const template of templates) {
    const key = template.subject_pattern?.trim() || (
      uniqueNullKeys ? `__no_subject_${template.id}` : '__NO_SUBJECT_PATTERN__'
    );

    const group = groups.get(key);
    if (group) {
      group.push(template);
    } else {
      groups.set(key, [template]);
    }
  }

  return groups;
}

function matchEntityPatterns(
  patterns: string[],
  sender: string,
  bodyHeadLines: string,
  forwardedSender: string | null
): { matched: boolean; matchedPattern?: string; matchedOn?: 'sender' | 'body' } {
  for (const pattern of patterns) {
    const regex = createRegex(pattern);
    if (!regex) continue;

    if (regex.test(sender)) {
      return { matched: true, matchedPattern: pattern, matchedOn: 'sender' };
    }

    if (testRegexAgainstTexts(regex, [forwardedSender, bodyHeadLines])) {
      return { matched: true, matchedPattern: pattern, matchedOn: 'body' };
    }
  }

  return { matched: false };
}

function evaluateMatchPattern(
  pattern: string,
  body: string,
  subject: string
): { matched: boolean; matchedOn?: 'body' | 'subject'; reason?: string } {
  try {
    const regex = new RegExp(pattern, 'i');

    if (regex.test(body)) {
      return { matched: true, matchedOn: 'body' };
    }

    if (regex.test(subject)) {
      return { matched: true, matchedOn: 'subject' };
    }

    return {
      matched: false,
      reason: `El patrón de desempate /${pattern}/i no coincidió en el cuerpo ni en el asunto.`,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      matched: false,
      reason: `Error en expresión regular de match_pattern: ${message}`,
    };
  }
}


export function evaluateTemplateAgainstEmail(
  template: CatalogTemplate,
  email: { sender: string; subject: string; body?: string; plainBody?: string; snippet?: string },
  entities: CatalogEntity[] = []
): SingleTemplateEvaluation {
  const context = getCleanEmailContext(email.body || email.plainBody || email.snippet || '');
  const { cleanBody } = context;
  const sender = (email.sender || '').trim();
  const subject = (email.subject || '').trim();

  const criticalFailures: string[] = [];
  const warnings: string[] = [];

  let level1Passed = false;
  let l1MatchedPattern: string | undefined;
  let l1MatchedOn: 'sender' | 'body' | undefined;
  let l1Reason: string | undefined;

  const matchedEntity = template.entity_id
    ? entities.find((entity) => entity.id === template.entity_id) || null
    : template.entity?.name
      ? entities.find(
        (entity) =>
          entity.name.trim().toLowerCase() === template.entity!.name!.trim().toLowerCase()
      ) || null
      : null;

  const entityPatterns = uniqueSanitizedPatterns([
    ...(matchedEntity?.patterns || []),
    ...(template.entity_email_patterns || []),
  ]);

  const entityName = matchedEntity?.name || template.entity?.name || 'Entidad';

  if (!template.entity_id && !template.entity?.name && entityPatterns.length === 0) {
    l1Reason = 'La plantilla no tiene entidad ni patrón de correo configurado.';
    criticalFailures.push(`Paso 1 (Entidad): ${l1Reason}`);
  } else if (entityPatterns.length === 0) {
    l1Reason = `La entidad "${entityName}" no tiene patrones de correo configurados (entity_email_patterns); no puede coincidir ningún correo.`;
    criticalFailures.push(`Paso 1 (Entidad): ${l1Reason}`);
  } else {
    const { bodyHeadLines, forwardedSender } = context;
    const entityMatch = matchEntityPatterns(entityPatterns, sender, bodyHeadLines, forwardedSender);

    level1Passed = entityMatch.matched;
    l1MatchedPattern = entityMatch.matchedPattern;
    l1MatchedOn = entityMatch.matchedOn;

    if (!level1Passed) {
      l1Reason = `El remitente ("${sender || 'vacío'}") no coincide con ningún entity_email_pattern de "${entityName}".`;
      criticalFailures.push(`Paso 1 (Entidad): ${l1Reason}`);
    }
  }

  let level2Passed = false;
  let l2MatchedOn: 'subject' | 'body' | undefined;
  let l2Reason: string | undefined;

  const sanitizedSubject = sanitizeRegexPattern(template.subject_pattern);
  if (sanitizedSubject) {
    try {
      const matchResult = matchesSubject(sanitizedSubject, subject, cleanBody);
      level2Passed = matchResult.matched;
      l2MatchedOn = matchResult.matchedOn;

      if (!level2Passed) {
        l2Reason = `El asunto ("${subject || 'vacío'}") no coincide con el patrón /${sanitizedSubject}/i.`;
        criticalFailures.push(`Paso 2 (Asunto): ${l2Reason}`);
      }
    } catch (err: unknown) {
      l2Reason = `Error en patrón de asunto /${sanitizedSubject}/: ${err instanceof Error ? err.message : String(err)
        }`;
      criticalFailures.push(`Paso 2 (Asunto): ${l2Reason}`);
    }
  } else {
    level2Passed = true;
  }

  let level3Passed = false;
  let l3MatchedOn: 'body' | 'subject' | undefined;
  let l3Reason: string | undefined;

  const sanitizedMatch = sanitizeRegexPattern(template.match_pattern);
  if (sanitizedMatch) {
    const matchResult = evaluateMatchPattern(sanitizedMatch, cleanBody, subject);
    level3Passed = matchResult.matched;
    l3MatchedOn = matchResult.matchedOn;

    if (!level3Passed) {
      l3Reason = matchResult.reason || 'No coincidió el patrón de desempate.';
      criticalFailures.push(`Paso 3 (Desempate): ${l3Reason}`);
    }
  } else {
    level3Passed = true;
  }

  const fields = extractTemplateFields(template, cleanBody);
  const amountSuccess = fields.amountRes.success && fields.parsedAmount !== null;

  if (!amountSuccess) {
    const reason = !fields.amountRes.success
      ? fields.amountRes.reason || `No coincidió con el patrón /${template.amount_regex}/i`
      : 'No se pudo convertir el monto extraído a un número válido';
    criticalFailures.push(`Paso 4 (Monto): ${reason}`);
  } else if (!fields.amountRes.hasCaptureGroup) {
    warnings.push(
      'Monto: capturado sin grupo (...). Agrega paréntesis para compatibilidad con Google Apps Script.'
    );
  }

  warnings.push(...getEvaluationWarnings(template, fields));

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
        amount: buildExtractedField(
          'amount',
          template.amount_regex,
          fields.amountRes,
          fields.parsedAmount,
          amountSuccess
        ),
        merchant: buildExtractedField(
          'merchant',
          template.merchant_regex,
          fields.merchantRes,
          fields.merchantRes.rawExtracted
        ),
        date: buildExtractedField(
          'date',
          template.date_regex,
          fields.dateRes,
          fields.dateRes.rawExtracted
        ),
        time: buildExtractedField(
          'time',
          template.time_regex,
          fields.timeRes,
          fields.timeRes.rawExtracted
        ),
        currency: buildExtractedField(
          'currency',
          template.currency_regex,
          fields.currencyRes,
          fields.currencyRes.rawExtracted
        ),
        source_account: buildExtractedField(
          'source_account',
          template.source_account_regex,
          fields.accountRes,
          fields.accountRes.rawExtracted
        ),
      },
      extractedAmount: fields.parsedAmount,
      extractedMerchant: fields.merchantRes.rawExtracted,
      extractedDate: fields.dateRes.rawExtracted,
      extractedTime: fields.timeRes.rawExtracted,
      extractedCurrency: fields.currencyRes.rawExtracted,
      extractedSourceAccount: fields.accountRes.rawExtracted,
    },
    overallPassed,
    failureReasons,
    criticalFailures,
    warnings,
  };
}


export function diagnoseEmailMatching(
  sender: string,
  subject: string,
  rawOrCleanBody: string,
  templates: CatalogTemplate[],
  entities: CatalogEntity[]
): DiagnosisResult {
  const { cleanBody, bodyHeadLines, forwardedSender } = getCleanEmailContext(rawOrCleanBody);
  const { entityMap, orphanTemplates } = buildEntityLookup(entities, templates);

  const passedEntities: Level1EntityReport[] = [];
  const discardedEntities: Level1EntityReport[] = [];
  let l1DiscardedTemplatesCount = 0;

  for (const [entityId, { entity, templates: entityTemplates }] of entityMap.entries()) {
    if (entityTemplates.length === 0) continue;

    const entityPatterns: Array<string | null | undefined> = [];
    for (const template of entityTemplates) {
      if (Array.isArray(template.entity_email_patterns)) {
        entityPatterns.push(...template.entity_email_patterns);
      }
    }
    const patternsToTest = uniqueSanitizedPatterns(entityPatterns);

    const entityName = entity?.name || entityId;

    if (patternsToTest.length === 0) {
      discardedEntities.push({
        entityId,
        entityName,
        patterns: [],
        matched: false,
        discardReason: 'La entidad no tiene entity_email_patterns; no puede participar en el matching.',
        templatesCount: entityTemplates.length,
        templateNames: entityTemplates.map((template) => template.name),
      });
      l1DiscardedTemplatesCount += entityTemplates.length;
      continue;
    }

    const entityMatch = matchEntityPatterns(patternsToTest, sender, bodyHeadLines, forwardedSender);

    if (entityMatch.matched) {
      passedEntities.push({
        entityId,
        entityName,
        patterns: patternsToTest,
        matched: true,
        matchedPattern: entityMatch.matchedPattern,
        matchedOn: entityMatch.matchedOn,
        templatesCount: entityTemplates.length,
        templateNames: entityTemplates.map((template) => template.name),
      });
    } else {
      discardedEntities.push({
        entityId,
        entityName,
        patterns: patternsToTest,
        matched: false,
        discardReason: `Ningún patrón (${patternsToTest
          .map((pattern) => `/${pattern}/i`)
          .join(', ')}) coincidió con el remitente ni con las primeras 10 líneas del cuerpo.`,
        templatesCount: entityTemplates.length,
        templateNames: entityTemplates.map((template) => template.name),
      });
      l1DiscardedTemplatesCount += entityTemplates.length;
    }
  }

  const passedGroups: Level2SubjectGroupReport[] = [];
  const discardedGroups: Level2SubjectGroupReport[] = [];
  let l2DiscardedTemplatesCount = 0;

  for (const passedEntity of passedEntities) {
    const entityData = entityMap.get(passedEntity.entityId);
    if (!entityData) continue;

    const subjectGroups = groupTemplatesBySubject(entityData.templates, false);

    for (const [key, groupTemplates] of subjectGroups.entries()) {
      const rawSubjectPattern = key === '__NO_SUBJECT_PATTERN__' ? null : key;
      const subjectPattern = sanitizeRegexPattern(rawSubjectPattern);

      if (!subjectPattern) {
        passedGroups.push({
          entityId: passedEntity.entityId,
          entityName: passedEntity.entityName,
          subjectPattern: null,
          matched: true,
          matchedOn: 'subject',
          templatesCount: groupTemplates.length,
          templates: groupTemplates,
        });
        continue;
      }

      try {
        const matchResult = matchesSubject(subjectPattern, subject, cleanBody);
        if (matchResult.matched) {
          passedGroups.push({
            entityId: passedEntity.entityId,
            entityName: passedEntity.entityName,
            subjectPattern,
            matched: true,
            matchedOn: matchResult.matchedOn,
            templatesCount: groupTemplates.length,
            templates: groupTemplates,
          });
        } else {
          discardedGroups.push({
            entityId: passedEntity.entityId,
            entityName: passedEntity.entityName,
            subjectPattern,
            matched: false,
            discardReason: `El patrón de asunto /${subjectPattern}/i no coincidió con el asunto ni con el cuerpo.`,
            templatesCount: groupTemplates.length,
            templates: groupTemplates,
          });
          l2DiscardedTemplatesCount += groupTemplates.length;
        }
      } catch (err: unknown) {
        const errMessage = err instanceof Error ? err.message : String(err);
        discardedGroups.push({
          entityId: passedEntity.entityId,
          entityName: passedEntity.entityName,
          subjectPattern,
          matched: false,
          discardReason: `Error de sintaxis en subject_pattern: /${subjectPattern}/: ${errMessage}`,
          templatesCount: groupTemplates.length,
          templates: groupTemplates,
        });
        l2DiscardedTemplatesCount += groupTemplates.length;
      }
    }
  }

  const candidates: Level3CandidateReport[] = [];
  const survivingTemplates: CatalogTemplate[] = [];
  const discardedCandidates: Level3CandidateReport[] = [];
  let ambiguityIssuesCount = 0;

  for (const group of passedGroups) {
    const isAmbiguousGroup = group.templates.length > 1;

    for (const template of group.templates) {
      const matchPattern = sanitizeRegexPattern(template.match_pattern);

      if (isAmbiguousGroup && !matchPattern) {
        ambiguityIssuesCount++;
        const candidateReport: Level3CandidateReport = {
          template,
          entityName: group.entityName,
          subjectPattern: group.subjectPattern,
          matchPattern: null,
          isAmbiguousGroup: true,
          hasDataIssue: true,
          dataIssueMessage: `⚠️ Problema de datos: la plantilla "${template.name}" comparte el subject_pattern pero no tiene match_pattern definido. Nunca podrá ganar el desempate.`,
          matched: false,
          discardReason: 'No tiene match_pattern definido en un grupo ambiguo con múltiples plantillas.',
        };
        candidates.push(candidateReport);
        discardedCandidates.push(candidateReport);
        continue;
      }

      if (!isAmbiguousGroup && !matchPattern) {
        const candidateReport: Level3CandidateReport = {
          template,
          entityName: group.entityName,
          subjectPattern: group.subjectPattern,
          matchPattern: null,
          isAmbiguousGroup: false,
          hasDataIssue: false,
          matched: true,
        };
        candidates.push(candidateReport);
        survivingTemplates.push(template);
        continue;
      }

      const matchResult = evaluateMatchPattern(matchPattern!, cleanBody, subject);

      if (matchResult.matched) {
        const candidateReport: Level3CandidateReport = {
          template,
          entityName: group.entityName,
          subjectPattern: group.subjectPattern,
          matchPattern,
          isAmbiguousGroup,
          hasDataIssue: false,
          matched: true,
          matchedOn: matchResult.matchedOn,
        };
        candidates.push(candidateReport);
        survivingTemplates.push(template);
      } else {
        const isSyntaxError = matchResult.reason?.startsWith(
          'Error en expresión regular de match_pattern:'
        );

        const candidateReport: Level3CandidateReport = {
          template,
          entityName: group.entityName,
          subjectPattern: group.subjectPattern,
          matchPattern,
          isAmbiguousGroup,
          hasDataIssue: Boolean(isSyntaxError),
          dataIssueMessage: isSyntaxError
            ? `Error de sintaxis en match_pattern: /${matchPattern}/: ${matchResult.reason!
              .replace('Error en expresión regular de match_pattern: ', '')
              .replace(/^\/|\/$/g, '')}`
            : undefined,
          matched: false,
          discardReason: matchResult.reason || `El patrón de desempate /${matchPattern}/i no coincidió.`,
        };
        candidates.push(candidateReport);
        discardedCandidates.push(candidateReport);
      }
    }
  }

  const extractions = survivingTemplates.map((template) =>
    buildTemplateExtractionReport(template, cleanBody)
  );

  let winner: TemplateExtractionReport | null = null;
  if (extractions.length === 1) {
    winner = extractions[0];
    winner.isWinner = true;
  } else if (extractions.length > 1) {
    winner = extractions.find((extraction) => extraction.fields.amount.success) || extractions[0];
    winner.isWinner = true;
  }

  const l1SurvivingTemplates: CatalogTemplate[] = [];
  for (const passedEntity of passedEntities) {
    const entityTemplates = entityMap.get(passedEntity.entityId)?.templates || [];
    l1SurvivingTemplates.push(...entityTemplates);
  }

  const l2SurvivingTemplates: CatalogTemplate[] = [];
  for (const group of passedGroups) {
    l2SurvivingTemplates.push(...group.templates);
  }

  const templateReports: DiagnosisTemplateReport[] = templates.map((template) => {
    const evaluation = evaluateTemplateAgainstEmail(
      template,
      { sender, subject, body: cleanBody },
      entities
    );

    if (orphanTemplates.has(template.id)) {
      return {
        template,
        level1Passed: false,
        level2Passed: false,
        level3Passed: false,
        level4Passed: false,
        overallPassed: false,
        failureReason:
          'Omitida en producción: la plantilla no tiene un entity_id válido que pertenezca al catálogo de entidades.',
        failureReasons: ['Omitida: sin entity_id válido en catálogo'],
        isWinner: false,
        evaluation,
      };
    }

    const passedL1 = l1SurvivingTemplates.some((candidate) => candidate.id === template.id);
    if (!passedL1) {
      const entityName = template.entity?.name || 'Entidad';
      const reason = `Descartada en Paso 1: El remitente/cuerpo no coincide con la entidad "${entityName}".`;
      return {
        template,
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

    const passedL2 = l2SurvivingTemplates.some((candidate) => candidate.id === template.id);
    if (!passedL2) {
      const reason = `Descartada en Paso 2: El asunto no coincide con el patrón /${template.subject_pattern || ''}/i.`;
      return {
        template,
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

    const surviving = survivingTemplates.some((candidate) => candidate.id === template.id);
    if (!surviving) {
      const discarded = discardedCandidates.find((candidate) => candidate.template.id === template.id);
      const reason =
        discarded?.discardReason ||
        `Descartada en Paso 3: Patrón de desempate /${template.match_pattern || ''}/i no encontrado.`;

      return {
        template,
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

    const extraction = extractions.find((candidate) => candidate.template.id === template.id);
    const amountOk = Boolean(extraction?.fields.amount.success);
    const isWinner = Boolean(amountOk && winner?.template.id === template.id);
    const failureReason = amountOk
      ? undefined
      : `Falló la extracción de Monto: ${extraction?.fields.amount.reason || 'no se pudo extraer o convertir el monto.'
      }`;

    return {
      template,
      level1Passed: true,
      level2Passed: true,
      level3Passed: true,
      level4Passed: amountOk,
      overallPassed: Boolean(surviving && amountOk),
      failureReason,
      failureReasons: failureReason
        ? [failureReason, ...evaluation.failureReasons]
        : evaluation.failureReasons,
      extractedAmount:
        (extraction?.fields.amount.cleanedValue as number | null) ??
        evaluation.level4.extractedAmount,
      extractedMerchant:
        (extraction?.fields.merchant.cleanedValue as string | null) ??
        evaluation.level4.extractedMerchant,
      extractedSourceAccount:
        (extraction?.fields.source_account.cleanedValue as string | null) ??
        evaluation.level4.extractedSourceAccount,
      extractedDate:
        (extraction?.fields.date.cleanedValue as string | null) ??
        evaluation.level4.extractedDate,
      extractedTime:
        (extraction?.fields.time.cleanedValue as string | null) ??
        evaluation.level4.extractedTime,
      extractedCurrency:
        (extraction?.fields.currency.cleanedValue as string | null) ??
        evaluation.level4.extractedCurrency,
      isWinner,
      evaluation,
    };
  });

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
      extractedSourceAccount:
        (winner.fields.source_account.cleanedValue as string | null) ?? null,
    }
    : null;

  return {
    cleanedBody: cleanBody,
    matched: Boolean(winner?.fields.amount.success),
    level1: {
      passedEntities,
      matchingEntities: passedEntities.map(({ entityId, entityName }) => ({
        id: entityId,
        name: entityName,
      })),
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


export interface AppsScriptCandidatePayload {
  templateId: string;
  amount: number;
  currency: string | null;
  merchant: string | null;
  entity_id: string | null;
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

  let value = String(rawAmount).replace(/\s|\$|COP/gi, '').trim();

  if (/^\d{1,3}(\.\d{3})+$/.test(value)) {
    value = value.replace(/\./g, '');
  } else if (/\d{1,3}(\.\d{3})+,\d{1,2}$/.test(value)) {
    value = value.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(value)) {
    value = value.replace(/,/g, '');
  } else if (/^\d+,\d{1,2}$/.test(value)) {
    value = value.replace(',', '.');
  }

  const num = Number.parseFloat(value);
  return Number.isNaN(num) ? String(rawAmount) : num.toFixed(2);
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
    return token === 'YYYY' ? String.raw`(\d{4})` : String.raw`(\d{1,2})`;
  });

  try {
    const regex = new RegExp(tokenRegexSource);
    const match = regex.exec(rawValue.trim());
    if (!match) return null;

    return Object.fromEntries(
      tokenOrder.map((token, index) => [
        token,
        match[index + 1].padStart(token === 'YYYY' ? 4 : 2, '0'),
      ])
    );
  } catch {
    return null;
  }
}

export function parseDateWithFormat(
  rawDateStr: string | null | undefined,
  formatStr: string | null | undefined
): { date: string; time: string } | null {
  const parts = parseFormattedTokens(rawDateStr, formatStr, /YYYY|MM|DD/g);
  if (!parts?.YYYY || !parts.MM || !parts.DD) return null;

  return {
    date: `${parts.YYYY}-${parts.MM}-${parts.DD}`,
    time: '00:00:00',
  };
}

export function parseTimeWithFormat(
  rawTimeStr: string | null | undefined,
  formatStr: string | null | undefined
): string | null {
  const parts = parseFormattedTokens(rawTimeStr, formatStr, /HH|mm|ss/g);
  if (!parts?.HH || !parts.mm) return null;

  return `${parts.HH}:${parts.mm}:${parts.ss || '00'}`;
}

export function StringUtils_toTitleCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/(^|\s)([a-záéíóúñ])/g, (match, separator, character) =>
      separator + character.toUpperCase()
    );
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

export function matchesSubject(
  pattern: string | null | undefined,
  subject: string,
  body?: string
): { matched: boolean; matchedOn?: 'subject' | 'body' } {
  const cleanPattern = sanitizeRegexPattern(pattern);
  if (!cleanPattern) return { matched: true };

  try {
    const regex = new RegExp(cleanPattern, 'i');

    if (regex.test(subject)) {
      return { matched: true, matchedOn: 'subject' };
    }

    const strippedSubject = stripSubjectPrefixes(subject);
    if (strippedSubject && strippedSubject !== subject && regex.test(strippedSubject)) {
      return { matched: true, matchedOn: 'subject' };
    }

    if (!body) return { matched: false };

    const forwardedSubject = extractForwardedSubjectFromBody(body, FORWARDED_HEADER_LINES);
    if (forwardedSubject && regex.test(forwardedSubject)) {
      return { matched: true, matchedOn: 'subject' };
    }

    if (regex.test(body)) {
      return { matched: true, matchedOn: 'body' };
    }

    const multilineRegex = new RegExp(cleanPattern, 'im');
    if (multilineRegex.test(body)) {
      return { matched: true, matchedOn: 'body' };
    }

    return { matched: false };
  } catch {
    return { matched: false };
  }
}

export function matchesEitherSource(
  pattern: string,
  directText: string,
  body: string
): boolean {
  return matchesSubject(pattern, directText, body).matched;
}

function buildSimulationEntityGroups(
  templates: CatalogTemplate[],
  entities: CatalogEntity[],
  logs: string[]
): Array<{
  entityId: string;
  entityName: string;
  emailPatterns: string[];
  templates: CatalogTemplate[];
}> {
  const groups = new Map<
    string,
    { entityId: string; entityName: string; emailPatterns: string[]; templates: CatalogTemplate[] }
  >();

  for (const entity of entities) {
    groups.set(entity.id, {
      entityId: entity.id,
      entityName: entity.name,
      emailPatterns: uniqueSanitizedPatterns(entity.patterns || []),
      templates: [],
    });
  }

  for (const template of templates) {
    const group = template.entity_id ? groups.get(template.entity_id) : undefined;

    if (!group) {
      logs.push(`  ⚠️ Plantilla "${template.name}": sin entity_id válido — Apps Script la ignora.`);
      continue;
    }

    group.templates.push(template);
  }

  return Array.from(groups.values()).filter((group) => group.templates.length > 0);
}

function filterSimulationCandidates(
  candidates: CatalogTemplate[],
  body: string,
  subject: string,
  logs: string[]
): CatalogTemplate[] {
  if (candidates.length <= 1) return candidates;

  return candidates.filter((template) => {
    const matchPattern = sanitizeRegexPattern(template.match_pattern);
    if (!matchPattern) {
      logs.push(
        `  ⚠️ Plantilla "${template.name}": ambigua con otra del mismo asunto y SIN match_pattern — descartada.`
      );
      return false;
    }

    const matchResult = evaluateMatchPattern(matchPattern, body, subject);
    if (!matchResult.matched) {
      logs.push(
        `  → Plantilla "${template.name}": match_pattern "${matchPattern}" no encontrado en el mensaje.`
      );
    }

    return matchResult.matched;
  });
}

function extractAppsScriptCandidate(
  template: CatalogTemplate,
  message: {
    id?: string;
    subject: string;
    sender: string;
    plainBody: string;
    date?: string;
  },
  body: string,
  logs: string[]
): AppsScriptCandidatePayload | null {
  const amountPattern = sanitizeRegexPattern(template.amount_regex) || template.amount_regex;
  const amountRegex = new RegExp(amountPattern, 'i');
  const amountMatch = amountRegex.exec(body);

  if (!amountMatch) {
    logs.push(
      `  → Plantilla "${template.name}": pasó filtros de asunto y entidad, pero amount_regex no encontró ningún monto.`
    );
    return null;
  }

  const rawAmount = amountMatch[1];
  if (rawAmount === undefined) {
    logs.push(
      `  ❌ Plantilla "${template.name}": amount_regex coincidió pero no tiene grupo de captura (...). En Google Apps Script amountMatch[1] es undefined y se descarta.`
    );
    return null;
  }

  const normalizedAmount = normalizeAmount(rawAmount);
  const numericAmount = Number(normalizedAmount);
  if (Number.isNaN(numericAmount) || !normalizedAmount) {
    logs.push(
      `  → Plantilla "${template.name}": amount_regex extrajo "${rawAmount}" pero no se pudo convertir a número.`
    );
    return null;
  }

  const merchantPattern = sanitizeRegexPattern(template.merchant_regex);
  const merchantRegex = merchantPattern ? new RegExp(merchantPattern, 'i') : null;
  const merchantMatch = merchantRegex?.exec(body) ?? null;

  let merchant: string | null = null;
  if (merchantMatch) {
    if (merchantMatch[1] === undefined) {
      logs.push(
        `  ❌ Plantilla "${template.name}": merchant_regex coincidió pero no tiene grupo de captura (...). En Google Apps Script provocará TypeError al llamar a merchantMatch[1].trim().`
      );
      return null;
    }
    merchant = merchantMatch[1].trim();
  }

  const datePattern = sanitizeRegexPattern(template.date_regex);
  const timePattern = sanitizeRegexPattern(template.time_regex);
  const currencyPattern = sanitizeRegexPattern(template.currency_regex);
  const sourcePattern = sanitizeRegexPattern(template.source_account_regex);

  const dateMatch = datePattern ? new RegExp(datePattern, 'i').exec(body) : null;
  const timeMatch = timePattern ? new RegExp(timePattern, 'i').exec(body) : null;
  const currencyMatch = currencyPattern
    ? new RegExp(currencyPattern, 'i').exec(body)
    : null;
  const sourceAccountMatch = sourcePattern
    ? new RegExp(sourcePattern, 'i').exec(body)
    : null;

  const rawDate = dateMatch?.[1] ?? null;
  const rawTime = timeMatch?.[1] ?? null;

  const parsedDate = rawDate
    ? parseDateWithFormat(rawDate, template.date_format)
    : null;
  const parsedTime = rawTime
    ? parseTimeWithFormat(rawTime, template.time_format)
    : null;

  return {
    templateId: template.id,
    amount: numericAmount,
    currency: currencyMatch?.[1] || null,
    merchant,
    entity_id: template.entity_id,
    sourceAccount: sourceAccountMatch?.[1] ?? sourceAccountMatch?.[0] ?? null,
    date: parsedDate?.date || null,
    time: parsedTime,
    concept: buildConcept(template.expense_type_label, merchant),
    gmail_message_id: message.id || `sim-${Date.now()}`,
    received_at: message.date || new Date().toISOString(),
  };
}

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
  const { cleanBody: body, bodyHeadLines, forwardedSender } = getCleanEmailContext(
    message.plainBody
  );

  logs.push(
    `[Google Apps Script] 📧 Procesando correo: "${subject}" | Remitente: ${sender}`,
    `[Google Apps Script] Limpieza de cuerpo ejecutada (${body.length} caracteres de texto plano).`
  );

  const entityGroups = buildSimulationEntityGroups(templates, entities, logs);
  logs.push(
    `[Google Apps Script] ${templates.length} plantilla(s) activas agrupadas en ${entityGroups.length} entidad(es).`
  );

  for (const group of entityGroups) {
    if (group.emailPatterns.length === 0) {
      logs.push(`  → Entidad "${group.entityName}": descartada, no tiene entity_email_patterns.`);
      continue;
    }

    const entityMatch = matchEntityPatterns(
      group.emailPatterns,
      sender,
      bodyHeadLines,
      forwardedSender
    );

    if (!entityMatch.matched) {
      logs.push(
        `  → Entidad "${group.entityName}": descartada, ningún entity_email_pattern coincidió con el remitente ni con las primeras líneas del cuerpo.`
      );
      continue;
    }

    const matchedOnBody = entityMatch.matchedOn === 'body';
    logs.push(
      `  ✓ Entidad "${group.entityName}": coincidió con entity_email_pattern${matchedOnBody ? ' en las primeras líneas del cuerpo (correo reenviado)' : ''
      }. Evaluando ${group.templates.length} plantilla(s).`
    );

    for (const [, candidates] of groupTemplatesBySubject(group.templates, true).entries()) {
      const first = candidates[0];

      if (
        first.subject_pattern &&
        !matchesEitherSource(first.subject_pattern, subject, body)
      ) {
        logs.push(
          `  → Asunto "${first.subject_pattern}": no coincidió (${candidates.length} plantilla(s) descartadas).`
        );
        continue;
      }

      logs.push(
        `  ✓ Asunto coincidió: evaluando ${candidates.length} plantilla(s) candidata(s).`
      );

      const toEvaluate = filterSimulationCandidates(candidates, body, subject, logs);

      for (const template of toEvaluate) {
        try {
          const candidate = extractAppsScriptCandidate(template, message, body, logs);
          if (!candidate) continue;

          logs.push(
            `✅ [Apps Script Match] "${subject}" (de: ${sender}) → match con plantilla "${template.name}" (ID: ${template.id}), monto=${candidate.amount}, concept="${candidate.concept}"`
          );

          return {
            matched: true,
            matchedTemplate: template,
            match: candidate,
            logs,
            cleanBody: body,
          };
        } catch (err: unknown) {
          logs.push(
            `❌ Error evaluando regex en plantilla "${template.name}": ${err instanceof Error ? err.message : String(err)
            }`
          );
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
    rejectionReason:
      'Ninguna plantilla cumplió los 3 niveles de filtrado de Apps Script o la extracción de monto.',
  };
}
