'use client';

import React, { useState, useMemo } from 'react';
import {
  Sparkles,
  Play,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Copy,
  Check,
  FileText,
  Building2,
  Tag,
  DollarSign,
  Calendar,
  Clock,
  CreditCard,
  Hash,
  Send,
  Plus,
  ArrowRight,
  Code2,
  Info,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { cleanEmailBody, buildTemplatePrompt } from '@/lib/email-cleaning';
import { CatalogEntity, CatalogTemplate } from '@/lib/email-matching';
import { ExpenseDraft } from '@/lib/types';
import { formatCurrency } from '@/lib/balance-utils';
import { EmailTesterFeed } from './EmailTesterFeed';

interface CreateAndTestTemplateSectionProps {
  entities: CatalogEntity[];
  expenseTypes: Array<{ id: string; name?: string; label?: string }>;
  existingTemplates: CatalogTemplate[];
  drafts?: ExpenseDraft[];
  initialTemplateToTest?: CatalogTemplate | null;
  initialDraftToTest?: ExpenseDraft | null;
  onTemplateCreated: () => void;
}

interface ExtractionFieldResult {
  label: string;
  field: string;
  pattern: string;
  success: boolean;
  rawExtracted: string | null;
  cleanedValue: string | number | null;
  reason?: string;
  hasCaptureGroup: boolean;
}

function parseAmountValue(rawAmount: string | null): number | null {
  if (!rawAmount) return null;
  const sanitized = rawAmount.replace(/[$\s]/g, '').trim();
  if (sanitized.includes('.') && !sanitized.includes(',')) {
    const parts = sanitized.split('.');
    if (parts.length === 2 && parts[1].length === 3) {
      return parseFloat(sanitized.replace(/\./g, ''));
    }
  }
  const normalized = sanitized.replace(/\./g, '').replace(',', '.');
  const parsed = parseFloat(normalized);
  return isNaN(parsed) ? null : parsed;
}

function testFieldRegex(
  text: string,
  pattern: string | null | undefined,
  fieldLabel: string
): { success: boolean; rawExtracted: string | null; reason?: string; hasCaptureGroup: boolean } {
  if (!pattern || !pattern.trim()) {
    return {
      success: false,
      rawExtracted: null,
      reason: 'No configurado (vacío o null)',
      hasCaptureGroup: false,
    };
  }

  try {
    const regex = new RegExp(pattern, 'i');
    const match = regex.exec(text);

    if (!match) {
      return {
        success: false,
        rawExtracted: null,
        reason: 'El regex no encontró coincidencias en el texto',
        hasCaptureGroup: false,
      };
    }

    if (match.length < 2 || match[1] === undefined) {
      return {
        success: false,
        rawExtracted: match[0],
        reason: 'El regex no tiene grupo de captura (...) para extraer el valor',
        hasCaptureGroup: false,
      };
    }

    return {
      success: true,
      rawExtracted: match[1].trim(),
      hasCaptureGroup: true,
    };
  } catch (err: unknown) {
    return {
      success: false,
      rawExtracted: null,
      reason: `Sintaxis de regex inválida: ${err instanceof Error ? err.message : String(err)}`,
      hasCaptureGroup: false,
    };
  }
}

export function CreateAndTestTemplateSection({
  entities,
  expenseTypes,
  existingTemplates,
  drafts,
  initialTemplateToTest = null,
  initialDraftToTest = null,
  onTemplateCreated,
}: CreateAndTestTemplateSectionProps) {
  // 1. Email input state (Read on our side!)
  const [senderInput, setSenderInput] = useState(
    initialDraftToTest?.entity ? `Notificaciones <notificaciones@${initialDraftToTest.entity.toLowerCase()}.com>` : ''
  );
  const [subjectInput, setSubjectInput] = useState(initialDraftToTest?.concept || '');
  const [rawBodyInput, setRawBodyInput] = useState(initialDraftToTest?.raw_snippet || '');
  const [showCleanBody, setShowCleanBody] = useState(true);

  // 2. Template form state
  const [templateName, setTemplateName] = useState(initialTemplateToTest?.name || '');
  const [selectedEntityId, setSelectedEntityId] = useState(initialTemplateToTest?.entity_id || '');
  const [customEntityName, setCustomEntityName] = useState(initialTemplateToTest?.entity_name || '');
  const [selectedExpenseTypeId, setSelectedExpenseTypeId] = useState(initialTemplateToTest?.expense_type_id || '');
  const [senderPattern, setSenderPattern] = useState(initialTemplateToTest?.sender_pattern || '');
  const [subjectPattern, setSubjectPattern] = useState(initialTemplateToTest?.subject_pattern || '');
  const [matchPattern, setMatchPattern] = useState(initialTemplateToTest?.match_pattern || '');
  const [amountRegex, setAmountRegex] = useState(initialTemplateToTest?.amount_regex || '');
  const [merchantRegex, setMerchantRegex] = useState(initialTemplateToTest?.merchant_regex || '');
  const [dateRegex, setDateRegex] = useState(initialTemplateToTest?.date_regex || '');
  const [dateFormat, setDateFormat] = useState(initialTemplateToTest?.date_format || 'DD/MM/YYYY');
  const [timeRegex, setTimeRegex] = useState(initialTemplateToTest?.time_regex || '');
  const [currencyRegex, setCurrencyRegex] = useState(initialTemplateToTest?.currency_regex || '');
  const [defaultCurrency, setDefaultCurrency] = useState(initialTemplateToTest?.default_currency || 'COP');
  const [sourceAccountRegex, setSourceAccountRegex] = useState(initialTemplateToTest?.source_account_regex || '');

  // 3. UI states
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [showPromptModal, setShowPromptModal] = useState(false);

  // Computed clean body
  const cleanedBody = useMemo(() => {
    return cleanEmailBody(rawBodyInput);
  }, [rawBodyInput]);

  // Load an email and optional template into the manual editor
  const handleLoadEmailIntoEditor = (
    email: { sender: string; subject: string; plainBody: string },
    template?: CatalogTemplate | null
  ) => {
    setSenderInput(email.sender);
    setSubjectInput(email.subject);
    setRawBodyInput(email.plainBody);
    if (template) {
      handleLoadTemplate(template.id);
    }
    const target = document.getElementById('template-manual-editor');
    if (target) {
      target.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // Load a catalog template into the form
  const handleLoadTemplate = (templateId: string) => {
    const tmpl = existingTemplates.find((t) => t.id === templateId);
    if (!tmpl) return;
    setTemplateName(tmpl.name);
    setSelectedEntityId(tmpl.entity_id || '');
    setCustomEntityName(tmpl.entity_name || '');
    setSelectedExpenseTypeId(tmpl.expense_type_id || '');
    setSenderPattern(tmpl.sender_pattern || '');
    setSubjectPattern(tmpl.subject_pattern || '');
    setMatchPattern(tmpl.match_pattern || '');
    setAmountRegex(tmpl.amount_regex || '');
    setMerchantRegex(tmpl.merchant_regex || '');
    setDateRegex(tmpl.date_regex || '');
    setDateFormat(tmpl.date_format || 'DD/MM/YYYY');
    setTimeRegex(tmpl.time_regex || '');
    setCurrencyRegex(tmpl.currency_regex || '');
    setDefaultCurrency(tmpl.default_currency || 'COP');
    setSourceAccountRegex(tmpl.source_account_regex || '');
  };

  // Test extraction results in real time
  const extractionResults = useMemo<ExtractionFieldResult[]>(() => {
    const targetText = cleanedBody || rawBodyInput;
    if (!targetText.trim()) return [];

    // Amount
    const amt = testFieldRegex(targetText, amountRegex, 'Monto');
    const amtParsed = amt.success ? parseAmountValue(amt.rawExtracted) : null;

    // Merchant
    const mer = testFieldRegex(targetText, merchantRegex, 'Comercio');

    // Date
    const dat = testFieldRegex(targetText, dateRegex, 'Fecha');

    // Time
    const tim = testFieldRegex(targetText, timeRegex, 'Hora');

    // Currency
    const cur = testFieldRegex(targetText, currencyRegex, 'Moneda');

    // Source Account
    const acc = testFieldRegex(targetText, sourceAccountRegex, 'Cuenta Origen');

    return [
      {
        label: 'Monto ($)',
        field: 'amount',
        pattern: amountRegex,
        success: amt.success,
        rawExtracted: amt.rawExtracted,
        cleanedValue: amtParsed !== null ? formatCurrency(amtParsed) : null,
        reason: amt.reason,
        hasCaptureGroup: amt.hasCaptureGroup,
      },
      {
        label: 'Comercio / Destinatario',
        field: 'merchant',
        pattern: merchantRegex,
        success: mer.success,
        rawExtracted: mer.rawExtracted,
        cleanedValue: mer.rawExtracted,
        reason: mer.reason,
        hasCaptureGroup: mer.hasCaptureGroup,
      },
      {
        label: 'Fecha',
        field: 'date',
        pattern: dateRegex,
        success: dat.success,
        rawExtracted: dat.rawExtracted,
        cleanedValue: dat.rawExtracted,
        reason: dat.reason,
        hasCaptureGroup: dat.hasCaptureGroup,
      },
      {
        label: 'Hora',
        field: 'time',
        pattern: timeRegex,
        success: tim.success,
        rawExtracted: tim.rawExtracted,
        cleanedValue: tim.rawExtracted,
        reason: tim.reason,
        hasCaptureGroup: tim.hasCaptureGroup,
      },
      {
        label: 'Moneda',
        field: 'currency',
        pattern: currencyRegex,
        success: cur.success,
        rawExtracted: cur.rawExtracted,
        cleanedValue: cur.rawExtracted || defaultCurrency,
        reason: cur.reason,
        hasCaptureGroup: cur.hasCaptureGroup,
      },
      {
        label: 'Cuenta Origen',
        field: 'source_account',
        pattern: sourceAccountRegex,
        success: acc.success,
        rawExtracted: acc.rawExtracted,
        cleanedValue: acc.rawExtracted,
        reason: acc.reason,
        hasCaptureGroup: acc.hasCaptureGroup,
      },
    ];
  }, [
    cleanedBody,
    rawBodyInput,
    amountRegex,
    merchantRegex,
    dateRegex,
    timeRegex,
    currencyRegex,
    defaultCurrency,
    sourceAccountRegex,
  ]);

  // Check matching levels
  const matchingLevels = useMemo(() => {
    const targetText = cleanedBody || rawBodyInput;

    // Level 1: Entity / Sender
    let level1Matched = false;
    let level1Reason = 'Sin remitente o entidad ingresada';
    if (senderPattern && senderPattern.trim()) {
      try {
        const regex = new RegExp(senderPattern.trim(), 'i');
        level1Matched = regex.test(senderInput) || regex.test(targetText);
        level1Reason = level1Matched ? 'Coincide con sender_pattern' : 'No coincide con sender_pattern';
      } catch {
        level1Reason = 'Regex de sender inválido';
      }
    } else if (selectedEntityId) {
      const ent = entities.find((e) => e.id === selectedEntityId);
      if (ent && ent.patterns && ent.patterns.length > 0) {
        level1Matched = ent.patterns.some((p) => {
          try {
            return new RegExp(p, 'i').test(senderInput) || new RegExp(p, 'i').test(targetText);
          } catch {
            return false;
          }
        });
        level1Reason = level1Matched ? `Coincide con patrones de ${ent.name}` : `No coincide con patrones de ${ent.name}`;
      } else {
        level1Matched = true;
        level1Reason = 'Entidad seleccionada (sin patrones de remitente específicos)';
      }
    } else {
      level1Matched = true;
      level1Reason = 'Nivel 1 abierto (sin filtro estricto)';
    }

    // Level 2: Subject pattern
    let level2Matched = false;
    let level2Reason = 'Sin subject_pattern configurado';
    if (subjectPattern && subjectPattern.trim()) {
      try {
        const regex = new RegExp(subjectPattern.trim(), 'i');
        level2Matched = regex.test(subjectInput) || regex.test(targetText);
        level2Reason = level2Matched ? 'Coincide con subject_pattern' : 'No coincide con subject_pattern';
      } catch {
        level2Reason = 'Regex de asunto inválido';
      }
    } else {
      level2Matched = true;
      level2Reason = 'Sin subject_pattern (pasa por defecto)';
    }

    // Level 3: Match pattern (desempate)
    let level3Matched = true;
    let level3Reason = 'Sin match_pattern de desempate (no requerido)';
    if (matchPattern && matchPattern.trim()) {
      try {
        const regex = new RegExp(matchPattern.trim(), 'i');
        level3Matched = regex.test(targetText);
        level3Reason = level3Matched ? 'Coincide con el patrón de desempate' : 'No coincide con match_pattern';
      } catch {
        level3Matched = false;
        level3Reason = 'Regex de match_pattern inválido';
      }
    }

    return {
      level1: { matched: level1Matched, reason: level1Reason },
      level2: { matched: level2Matched, reason: level2Reason },
      level3: { matched: level3Matched, reason: level3Reason },
      allLevelsPassed: level1Matched && level2Matched && level3Matched,
    };
  }, [
    senderPattern,
    senderInput,
    subjectPattern,
    subjectInput,
    matchPattern,
    cleanedBody,
    rawBodyInput,
    selectedEntityId,
    entities,
  ]);

  // Handle Save Template
  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);
    setSaveSuccess(null);

    if (!templateName.trim()) {
      setSaveError('El nombre de la plantilla es obligatorio');
      return;
    }

    if (!amountRegex.trim()) {
      setSaveError('El regex de monto (amount_regex) es obligatorio');
      return;
    }

    // Validate capture group in amount_regex
    if (!amountRegex.includes('(') || !amountRegex.includes(')')) {
      setSaveError('El regex de monto debe contener al menos un grupo de captura (...) para extraer el valor');
      return;
    }

    setIsSaving(true);
    try {
      const selectedEntity = entities.find((e) => e.id === selectedEntityId);
      const entityName = selectedEntity ? selectedEntity.name : customEntityName || null;

      const payload = {
        name: templateName.trim(),
        entity_id: selectedEntityId || null,
        entity_name: entityName,
        expense_type_id: selectedExpenseTypeId || null,
        sender_pattern: senderPattern.trim() || null,
        subject_pattern: subjectPattern.trim() || null,
        match_pattern: matchPattern.trim() || null,
        amount_regex: amountRegex.trim(),
        merchant_regex: merchantRegex.trim() || null,
        date_regex: dateRegex.trim() || null,
        date_format: dateFormat.trim() || 'DD/MM/YYYY',
        time_regex: timeRegex.trim() || null,
        currency_regex: currencyRegex.trim() || null,
        default_currency: defaultCurrency.trim() || 'COP',
        source_account_regex: sourceAccountRegex.trim() || null,
      };

      const res = await fetch('/api/email-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al guardar la plantilla');
      }

      setSaveSuccess(`¡Plantilla "${templateName}" guardada exitosamente en Supabase!`);
      onTemplateCreated();
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Error inesperado al guardar');
    } finally {
      setIsSaving(false);
    }
  };

  // Generate Prompt
  const generatedPrompt = useMemo(() => {
    return buildTemplatePrompt(
      senderInput || 'Remitente <banco@ejemplo.com>',
      subjectInput || 'Asunto del correo de notificación',
      cleanedBody || 'Cuerpo del correo bancario...'
    );
  }, [senderInput, subjectInput, cleanedBody]);

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(generatedPrompt);
      setCopiedPrompt(true);
      setTimeout(() => setCopiedPrompt(false), 2500);
    } catch {
      alert('Error al copiar al portapapeles');
    }
  };

  return (
    <div className="space-y-6" id="section-create-and-test">
      {/* 1. Bandeja de Pruebas de Correos y Simulación Google Apps Script */}
      <EmailTesterFeed
        templates={existingTemplates}
        entities={entities}
        onLoadIntoEditor={handleLoadEmailIntoEditor}
      />

      {/* 2. Editor Manual y Diagnóstico de Regexes */}
      <div id="template-manual-editor" className="bg-white border border-zinc-200/80 rounded-2xl p-6 shadow-2xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-zinc-900">Editor y Diagnóstico de Plantilla</h3>
              <p className="text-xs text-zinc-500 mt-0.5">
                Ajusta las expresiones regulares y diagnostica los 3 niveles de coincidencia con el correo seleccionado arriba.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => setShowPromptModal(true)}
              className="px-3 py-1.5 text-xs font-medium text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-xl transition flex items-center space-x-1.5 shadow-2xs shrink-0 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-600" />
              <span>Generar Prompt para IA</span>
            </button>
          </div>
        </div>

        {/* Inputs */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
          <div>
            <label className="block text-xs font-medium text-zinc-600 mb-1">Remitente (From)</label>
            <input
              type="text"
              placeholder="ej. Alertas y Notificaciones <alertas@bancolombia.com.co>"
              value={senderInput}
              onChange={(e) => setSenderInput(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl text-zinc-800 focus:outline-none focus:border-zinc-400"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600 mb-1">Asunto (Subject)</label>
            <input
              type="text"
              placeholder="ej. Bancolombia le informa una transferencia"
              value={subjectInput}
              onChange={(e) => setSubjectInput(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl text-zinc-800 focus:outline-none focus:border-zinc-400"
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-xs font-medium text-zinc-600">
              Cuerpo del Correo ({showCleanBody ? 'Cuerpo Limpio Exacto' : 'Cuerpo Crudo'})
            </label>
            <button
              type="button"
              onClick={() => setShowCleanBody(!showCleanBody)}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-medium transition"
            >
              {showCleanBody ? 'Ver Texto Crudo' : 'Ver Texto Limpio (cleanEmailBody)'}
            </button>
          </div>
          <textarea
            rows={4}
            placeholder="Pega aquí el texto del correo bancario que deseas probar..."
            value={showCleanBody ? cleanedBody || rawBodyInput : rawBodyInput}
            onChange={(e) => setRawBodyInput(e.target.value)}
            className="w-full px-3 py-2 text-xs font-mono bg-zinc-50 border border-zinc-200 rounded-xl text-zinc-800 focus:outline-none focus:border-zinc-400 leading-relaxed"
          />
        </div>
      </div>

      {/* Matching & Extraction Diagnostic Results Card */}
      <div className="bg-white border border-zinc-200/80 rounded-2xl p-6 shadow-2xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Play className="w-4 h-4 text-emerald-600" />
            <h4 className="text-sm font-semibold text-zinc-900">Diagnóstico de Coincidencia y Extracción</h4>
          </div>
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
              matchingLevels.allLevelsPassed
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-amber-50 text-amber-700 border border-amber-200'
            }`}
          >
            {matchingLevels.allLevelsPassed ? 'Niveles 1, 2 y 3 Coinciden' : 'Filtros de coincidencia incompletos'}
          </span>
        </div>

        {/* 3-Level Matching Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div
            className={`p-3 rounded-xl border text-xs ${
              matchingLevels.level1.matched
                ? 'bg-emerald-50/50 border-emerald-200 text-emerald-950'
                : 'bg-rose-50/50 border-rose-200 text-rose-950'
            }`}
          >
            <div className="flex items-center space-x-1.5 font-semibold mb-1">
              {matchingLevels.level1.matched ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <XCircle className="w-3.5 h-3.5 text-rose-600" />
              )}
              <span>Nivel 1: Entidad / Remitente</span>
            </div>
            <p className="text-[11px] opacity-80">{matchingLevels.level1.reason}</p>
          </div>

          <div
            className={`p-3 rounded-xl border text-xs ${
              matchingLevels.level2.matched
                ? 'bg-emerald-50/50 border-emerald-200 text-emerald-950'
                : 'bg-rose-50/50 border-rose-200 text-rose-950'
            }`}
          >
            <div className="flex items-center space-x-1.5 font-semibold mb-1">
              {matchingLevels.level2.matched ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <XCircle className="w-3.5 h-3.5 text-rose-600" />
              )}
              <span>Nivel 2: Asunto (Subject)</span>
            </div>
            <p className="text-[11px] opacity-80">{matchingLevels.level2.reason}</p>
          </div>

          <div
            className={`p-3 rounded-xl border text-xs ${
              matchingLevels.level3.matched
                ? 'bg-emerald-50/50 border-emerald-200 text-emerald-950'
                : 'bg-amber-50/50 border-amber-200 text-amber-950'
            }`}
          >
            <div className="flex items-center space-x-1.5 font-semibold mb-1">
              {matchingLevels.level3.matched ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
              )}
              <span>Nivel 3: Desempate</span>
            </div>
            <p className="text-[11px] opacity-80">{matchingLevels.level3.reason}</p>
          </div>
        </div>

        {/* Extracted Fields Table/Grid */}
        <div>
          <h5 className="text-xs font-semibold text-zinc-700 mb-2">Campos Extraídos por las Regexes:</h5>
          {extractionResults.length === 0 ? (
            <p className="text-xs text-zinc-400 italic">
              Ingresa el texto del correo arriba para ver qué valores extraen tus expresiones regulares.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {extractionResults.map((res) => (
                <div
                  key={res.field}
                  className={`p-3 rounded-xl border transition ${
                    res.success
                      ? 'bg-emerald-50/30 border-emerald-200/80'
                      : 'bg-zinc-50 border-zinc-200/70'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-zinc-700">{res.label}</span>
                    {res.success ? (
                      <span className="inline-flex items-center text-[10px] font-medium text-emerald-700 bg-emerald-100/70 px-1.5 py-0.5 rounded">
                        <Check className="w-3 h-3 mr-0.5" /> Extraído
                      </span>
                    ) : (
                      <span className="text-[10px] text-zinc-400 italic">No extrajo</span>
                    )}
                  </div>

                  <div className="text-xs font-bold text-zinc-900 mt-1">
                    {res.cleanedValue ? (
                      String(res.cleanedValue)
                    ) : (
                      <span className="text-zinc-400 font-normal italic">Sin valor</span>
                    )}
                  </div>

                  {res.rawExtracted && res.rawExtracted !== String(res.cleanedValue) && (
                    <div className="text-[10px] text-zinc-500 font-mono mt-0.5">
                      Texto crudo: &quot;{res.rawExtracted}&quot;
                    </div>
                  )}

                  {res.reason && !res.success && (
                    <div className="text-[10px] text-zinc-400 mt-1 leading-tight">{res.reason}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Form: Create or Edit Template */}
      <div className="bg-white border border-zinc-200/80 rounded-2xl p-6 shadow-2xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-zinc-100 text-zinc-800 flex items-center justify-center shrink-0">
              <Plus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-zinc-900">Configurar y Guardar Plantilla</h3>
              <p className="text-xs text-zinc-500 mt-0.5">
                Define las expresiones regulares. Toda plantilla debe contar con al menos un regex de monto con grupo de captura.
              </p>
            </div>
          </div>

          {existingTemplates.length > 0 && (
            <select
              onChange={(e) => handleLoadTemplate(e.target.value)}
              defaultValue=""
              className="px-3 py-1.5 text-xs bg-zinc-50 border border-zinc-200 rounded-xl text-zinc-800 focus:outline-none focus:border-zinc-400 shrink-0"
            >
              <option value="" disabled>
                Cargar plantilla existente como base...
              </option>
              {existingTemplates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.entity_name || 'General'})
                </option>
              ))}
            </select>
          )}
        </div>

        <form onSubmit={handleSaveTemplate} className="space-y-4 pt-1">
          {saveError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{saveError}</span>
            </div>
          )}

          {saveSuccess && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-700 flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{saveSuccess}</span>
            </div>
          )}

          {/* Core Info */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-700 mb-1">
                Nombre de la Plantilla <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="ej. Bancolombia Transferencia a Llave"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl text-zinc-800 focus:outline-none focus:border-zinc-400"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-700 mb-1">Entidad (Banco)</label>
              <select
                value={selectedEntityId}
                onChange={(e) => {
                  setSelectedEntityId(e.target.value);
                  const ent = entities.find((item) => item.id === e.target.value);
                  if (ent) setCustomEntityName(ent.name);
                }}
                className="w-full px-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl text-zinc-800 focus:outline-none focus:border-zinc-400"
              >
                <option value="">Seleccionar entidad existente...</option>
                {entities.map((ent) => (
                  <option key={ent.id} value={ent.id}>
                    {ent.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-700 mb-1">Tipo de Gasto</label>
              <select
                value={selectedExpenseTypeId}
                onChange={(e) => setSelectedExpenseTypeId(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl text-zinc-800 focus:outline-none focus:border-zinc-400"
              >
                <option value="">Seleccionar tipo...</option>
                {expenseTypes.map((et) => (
                  <option key={et.id} value={et.id}>
                    {et.label || et.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Patterns Nivel 1, 2, 3 */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-700 mb-1">
                Patrón Remitente (sender_pattern)
              </label>
              <input
                type="text"
                placeholder="ej. alertasynotificaciones@bancolombia.com"
                value={senderPattern}
                onChange={(e) => setSenderPattern(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono bg-zinc-50 border border-zinc-200 rounded-xl text-zinc-800 focus:outline-none focus:border-zinc-400"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-700 mb-1">
                Patrón Asunto (subject_pattern)
              </label>
              <input
                type="text"
                placeholder="ej. informa una transferencia"
                value={subjectPattern}
                onChange={(e) => setSubjectPattern(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono bg-zinc-50 border border-zinc-200 rounded-xl text-zinc-800 focus:outline-none focus:border-zinc-400"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-700 mb-1">
                Patrón Desempate (match_pattern)
              </label>
              <input
                type="text"
                placeholder="ej. a la llave|código QR"
                value={matchPattern}
                onChange={(e) => setMatchPattern(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono bg-zinc-50 border border-zinc-200 rounded-xl text-zinc-800 focus:outline-none focus:border-zinc-400"
              />
            </div>
          </div>

          {/* Extraction Regexes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div>
              <label className="block text-xs font-medium text-zinc-700 mb-1">
                Regex de Monto <span className="text-rose-500">* (Con grupo de captura)</span>
              </label>
              <input
                type="text"
                required
                placeholder="ej. transferiste\\s*\\$([\\d.,]+)"
                value={amountRegex}
                onChange={(e) => setAmountRegex(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono bg-zinc-50 border border-zinc-200 rounded-xl text-zinc-800 focus:outline-none focus:border-zinc-400"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-700 mb-1">
                Regex de Comercio / Destinatario
              </label>
              <input
                type="text"
                placeholder="ej. a\\s+([A-Za-z\\s]+?)\\s+el"
                value={merchantRegex}
                onChange={(e) => setMerchantRegex(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono bg-zinc-50 border border-zinc-200 rounded-xl text-zinc-800 focus:outline-none focus:border-zinc-400"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-700 mb-1">
                Regex de Fecha y Formato
              </label>
              <div className="flex space-x-2">
                <input
                  type="text"
                  placeholder="ej. el\\s+(\\d{2}\\/\\d{2}\\/\\d{4})"
                  value={dateRegex}
                  onChange={(e) => setDateRegex(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono bg-zinc-50 border border-zinc-200 rounded-xl text-zinc-800 focus:outline-none focus:border-zinc-400"
                />
                <input
                  type="text"
                  placeholder="DD/MM/YYYY"
                  value={dateFormat}
                  onChange={(e) => setDateFormat(e.target.value)}
                  className="w-28 px-3 py-2 text-xs font-mono bg-zinc-50 border border-zinc-200 rounded-xl text-zinc-800 focus:outline-none focus:border-zinc-400"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-700 mb-1">Regex de Hora</label>
              <input
                type="text"
                placeholder="ej. a las\\s+(\\d{1,2}:\\d{2})"
                value={timeRegex}
                onChange={(e) => setTimeRegex(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono bg-zinc-50 border border-zinc-200 rounded-xl text-zinc-800 focus:outline-none focus:border-zinc-400"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-700 mb-1">
                Cuenta Origen Regex
              </label>
              <input
                type="text"
                placeholder="ej. desde tu cuenta\\s*(\\*?\\d{4})"
                value={sourceAccountRegex}
                onChange={(e) => setSourceAccountRegex(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono bg-zinc-50 border border-zinc-200 rounded-xl text-zinc-800 focus:outline-none focus:border-zinc-400"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-700 mb-1">
                Moneda Regex & Default
              </label>
              <div className="flex space-x-2">
                <input
                  type="text"
                  placeholder="ej. (COP|USD|\\$)"
                  value={currencyRegex}
                  onChange={(e) => setCurrencyRegex(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono bg-zinc-50 border border-zinc-200 rounded-xl text-zinc-800 focus:outline-none focus:border-zinc-400"
                />
                <input
                  type="text"
                  placeholder="COP"
                  value={defaultCurrency}
                  onChange={(e) => setDefaultCurrency(e.target.value)}
                  className="w-24 px-3 py-2 text-xs font-mono bg-zinc-50 border border-zinc-200 rounded-xl text-zinc-800 focus:outline-none focus:border-zinc-400"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-3">
            <button
              type="submit"
              disabled={isSaving}
              className="px-5 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-semibold transition flex items-center space-x-2 shadow-xs"
            >
              <Check className="w-4 h-4 text-emerald-400" />
              <span>{isSaving ? 'Guardando Plantilla...' : 'Guardar Plantilla en Supabase'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Prompt Generator Modal */}
      {showPromptModal && (
        <div className="fixed inset-0 z-50 bg-zinc-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-xl border border-zinc-200 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Sparkles className="w-5 h-5 text-amber-600" />
                <h4 className="text-sm font-semibold text-zinc-900">Prompt Asistente para IA</h4>
              </div>
              <button
                onClick={() => setShowPromptModal(false)}
                className="text-xs text-zinc-500 hover:text-zinc-800"
              >
                Cerrar
              </button>
            </div>

            <p className="text-xs text-zinc-600">
              Copia este prompt e introdúcelo en Gemini o cualquier modelo para que deduzca las expresiones regulares a partir del correo que acabas de ingresar.
            </p>

            <pre className="p-3.5 bg-zinc-900 text-zinc-200 text-xs font-mono rounded-xl max-h-72 overflow-y-auto whitespace-pre-wrap leading-relaxed">
              {generatedPrompt}
            </pre>

            <div className="flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => setShowPromptModal(false)}
                className="px-3 py-2 text-xs font-medium text-zinc-600 hover:text-zinc-900"
              >
                Cerrar
              </button>
              <button
                type="button"
                onClick={handleCopyPrompt}
                className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-semibold transition flex items-center space-x-1.5"
              >
                {copiedPrompt ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedPrompt ? '¡Copiado!' : 'Copiar Prompt'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
