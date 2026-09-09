'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Mail,
  Copy,
  Check,
  Sparkles,
  Plus,
  Search,
  Layers,
  Edit3,
  Trash2,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  ExternalLink,
  RefreshCw,
  CreditCard,
  Calendar,
  DollarSign,
  Store,
  X,
  Loader2,
  Inbox,
  ChevronRight,
  Bot,
  Clock,
  FileText,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import {
  cleanEmailBody,
  sanitizeRegexPattern,
  parseAITemplateResponse,
  buildTemplatePrompt,
  buildCorrectionPrompt,
  getHeadLines,
  extractForwardedSenderFromBody,
  inferEntityEmailPattern,
} from '@/lib/email-cleaning';
import {
  CatalogEntity,
  CatalogTemplate,
  diagnoseEmailMatching,
  DiagnosisResult,
  SingleTemplateEvaluation,
  evaluateTemplateAgainstEmail,
  DiagnosisTemplateReport,
  extractWithCaptureGroup,
} from '@/lib/email-matching';
import { formatCurrency } from '@/lib/balance-utils';

type TemplateFormState = {
  name: string;
  entityLabel: string;
  entityId: string | null;
  entityEmailPattern: string;
  isNewEntity: boolean;
  subjectPattern: string;
  matchPattern: string;
  amountRegex: string;
  merchantRegex: string;
  sourceAccountRegex: string;
  dateRegex: string;
  dateFormat: string;
  timeRegex: string;
  timeFormat: string;
  currencyRegex: string;
  expenseType: string;
};

const EMPTY_TEMPLATE_FORM: TemplateFormState = {
  name: '',
  entityLabel: '',
  entityId: null,
  entityEmailPattern: '',
  isNewEntity: false,
  subjectPattern: '',
  matchPattern: '',
  amountRegex: '',
  merchantRegex: '',
  sourceAccountRegex: '',
  dateRegex: '',
  dateFormat: '',
  timeRegex: '',
  timeFormat: '',
  currencyRegex: '',
  expenseType: 'compra',
};

const MODAL_TEMPLATE_FORM_DEFAULTS: TemplateFormState = {
  ...EMPTY_TEMPLATE_FORM,
  dateFormat: 'DD/MM/YYYY',
  timeFormat: 'HH:mm:ss',
};

function useTemplateFormState(initialState: TemplateFormState) {
  const [state, setState] = useState<TemplateFormState>(initialState);

  const update = useCallback((patch: Partial<TemplateFormState>) => {
    setState((current) => ({ ...current, ...patch }));
  }, []);

  const reset = useCallback(() => {
    setState({ ...initialState });
  }, [initialState]);

  return { state, update, reset };
}

const findEntityByName = (entities: CatalogEntity[], name: string | null | undefined) => {
  const normalized = (name || '').trim().toLowerCase();
  if (!normalized) return null;
  return entities.find((entity) => entity.name.trim().toLowerCase() === normalized) || null;
};

const entityPatternMatchesEmail = (
  pattern: string,
  sender: string,
  forwardedSender: string,
  bodyHead: string,
) => {
  try {
    const normalizedPattern = sanitizeRegexPattern(pattern) || pattern;
    const regex = new RegExp(normalizedPattern, 'i');
    return Boolean(
      (sender && regex.test(sender)) ||
      (forwardedSender && regex.test(forwardedSender)) ||
      (bodyHead && regex.test(bodyHead)),
    );
  } catch {
    return false;
  }
};

interface TemplateDiagnosticStepsViewProps {
  evaluation: SingleTemplateEvaluation;
  isWinner?: boolean;
  onAction?: () => void;
  actionLabel?: string;
  onCopyCorrectionPrompt?: () => void;
  copiedPrompt?: boolean;
  customTitle?: string;
}

interface DiagnosticLevelRowProps {
  label: string;
  passed: boolean;
  pattern: string;
  matchedOn?: string | null;
}

function DiagnosticLevelRow({ label, passed, pattern, matchedOn }: Readonly<DiagnosticLevelRowProps>) {
  const tone = passed ? 'text-zinc-700' : 'text-rose-700';
  const location = matchedOn === 'sender' ? 'en remitente' : 'en cuerpo';

  return (
    <div className={`flex items-center gap-1.5 text-[11px] ${tone}`}>
      {passed ? <Check className="w-3 h-3 text-emerald-600 shrink-0" /> : <X className="w-3 h-3 text-rose-500 shrink-0" />}
      <span className="font-semibold shrink-0">{label}</span>
      <code className="bg-white/80 border border-zinc-200 rounded px-1.5 py-0.5 font-mono truncate max-w-[200px] sm:max-w-xs">{pattern}</code>
      {matchedOn && <span className="text-[10px] text-zinc-500 shrink-0">({location})</span>}
    </div>
  );
}

interface DiagnosticExtractionRowProps {
  label: string;
  pattern: string;
  field: { success: boolean; rawExtracted?: string | null; hasCaptureGroup?: boolean };
  amount?: number | null;
}

function DiagnosticExtractionValue({ field, amount }: Readonly<{
  field: DiagnosticExtractionRowProps['field'];
  amount?: number | null;
}>) {
  if (!field.success) {
    return <span className="text-zinc-400">sin captura</span>;
  }

  if (amount !== undefined) {
    return (
      <span className="font-bold text-emerald-800 bg-emerald-100/90 px-2 py-0.5 rounded border border-emerald-200 shrink-0">
        ${formatCurrency(amount ?? 0)}
      </span>
    );
  }

  return (
    <span className="font-bold text-zinc-900 bg-white border border-zinc-200 px-2 py-0.5 rounded truncate max-w-[200px]">
      {field.rawExtracted}
    </span>
  );
}

function DiagnosticExtractionRow({ label, pattern, field, amount }: Readonly<DiagnosticExtractionRowProps>) {
  const valueClass = field.success ? 'text-zinc-700' : 'text-zinc-500';
  const icon = field.success
    ? <Check className="w-3 h-3 text-emerald-600 shrink-0" />
    : <X className="w-3 h-3 text-zinc-400 shrink-0" />;

  return (
    <div className={`flex items-center gap-1.5 text-[11px] ${valueClass}`}>
      {icon}
      <span className="font-semibold shrink-0">{label}</span>
      <code className="bg-white/80 border border-zinc-200 rounded px-1.5 py-0.5 font-mono truncate max-w-[180px] sm:max-w-xs">/{pattern}/i</code>
      <span className="text-zinc-400 shrink-0">→</span>
      <DiagnosticExtractionValue field={field} amount={amount} />
      {!field.hasCaptureGroup && field.success && (
        <span className="text-[10px] text-amber-700 font-medium shrink-0">(sin grupo (...))</span>
      )}
    </div>
  );
}

function DiagnosticStatusBadge({ passed, isWinner }: Readonly<{ passed: boolean; isWinner?: boolean }>) {
  let label = 'No coincide';
  let tone = 'text-rose-700 bg-rose-100/90 border-rose-300';
  let icon = <X className="w-3 h-3 text-rose-600" />;

  if (passed) {
    label = isWinner ? 'Ganadora / Coincide' : 'Coincide';
    tone = 'text-emerald-700 bg-emerald-100/90 border-emerald-300';
    icon = <Check className="w-3 h-3 text-emerald-600" />;
  }

  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${tone}`}>
      {icon}
      <span>{label}</span>
    </span>
  );
}

function EmailCardMatchStatus({
  survivingCount,
  winner,
}: Readonly<{ survivingCount: number; winner?: DiagnosisResult['winner'] }>) {
  if (survivingCount === 1 && winner) {
    return (
      <span className="inline-flex items-center gap-1 font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md truncate">
        <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
        <span className="truncate">{winner.template.name}</span>
        {winner.extractedAmount ? (
          <span className="font-semibold text-emerald-800 ml-1">
            • ${formatCurrency(winner.extractedAmount)}
          </span>
        ) : null}
      </span>
    );
  }

  if (survivingCount > 1) {
    return (
      <span className="inline-flex items-center gap-1 font-bold text-amber-800 bg-amber-50 border border-amber-300 px-2 py-0.5 rounded-md">
        <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
        <span>Conflicto ({survivingCount})</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 font-medium text-zinc-600 bg-zinc-100 px-2 py-0.5 rounded-md">
      <span>Sin plantilla</span>
    </span>
  );
}

function DiagnosisSummaryBadge({
  matchedCount,
  winner,
}: Readonly<{ matchedCount: number; winner?: DiagnosisResult['winner'] }>) {
  if (matchedCount === 1 && winner) {
    return (
      <span className="inline-flex items-center gap-1 font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg text-[11px]">
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
        <span className="hidden sm:inline">{winner.template.name}</span>
        <span className="sm:hidden">Coincide</span>
      </span>
    );
  }

  if (matchedCount > 1) {
    return (
      <span className="inline-flex items-center gap-1 font-bold text-amber-800 bg-amber-50 border border-amber-300 px-2.5 py-1 rounded-lg text-[11px]">
        <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
        <span>{matchedCount} conflictos</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 font-medium text-zinc-600 bg-zinc-100 px-2.5 py-1 rounded-lg text-[11px]">
      <span>Ninguna plantilla funcionó</span>
    </span>
  );
}

function DiagnosticIssueList({ title, items, kind }: Readonly<{ title: string; items: string[]; kind: 'error' | 'warning' }>) {
  const isError = kind === 'error';
  const wrapper = isError ? 'bg-rose-50 border-rose-200 text-rose-800' : 'bg-amber-50/80 border-amber-200 text-amber-900';
  const titleTone = isError ? 'text-rose-900' : 'text-amber-800';
  const icon = isError ? <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />;

  return (
    <div className="p-3 pb-2 pt-1">
      <div className={`rounded-lg border px-3 py-2 text-[11px] space-y-1 ${wrapper}`}>
        <span className={`font-bold flex items-center gap-1 ${titleTone}`}>{icon}{title}</span>
        <ul className="list-disc list-inside space-y-0.5 pl-1">
          {items.map((item) => <li key={item} className="leading-snug">{item}</li>)}
        </ul>
      </div>
    </div>
  );
}

function TemplateDiagnosticStepsView({
  evaluation,
  isWinner,
  onAction,
  actionLabel,
  onCopyCorrectionPrompt,
  copiedPrompt,
  customTitle,
}: Readonly<TemplateDiagnosticStepsViewProps>) {
  const { template: tmpl, level1, level2, level3, level4 } = evaluation;
  const isPassing = evaluation.overallPassed;
  const entityName = tmpl.entity?.name || evaluation.level1.entityName;
  const rows = [
    { label: '4. Monto', pattern: tmpl.amount_regex, field: level4.fields.amount, amount: level4.extractedAmount },
    { label: 'Comercio', pattern: tmpl.merchant_regex, field: level4.fields.merchant },
    { label: 'Cuenta', pattern: tmpl.source_account_regex, field: level4.fields.source_account },
    { label: 'Fecha', pattern: tmpl.date_regex, field: level4.fields.date },
    { label: 'Hora', pattern: tmpl.time_regex, field: level4.fields.time },
  ].filter((row) => Boolean(row.pattern));

  return (
    <div className={`rounded-xl border text-xs overflow-hidden transition ${isPassing ? 'bg-emerald-50/40 border-emerald-200 shadow-2xs' : 'bg-zinc-50/80 border-zinc-200'}`}>
      <div className="p-3 flex items-start justify-between gap-2 border-b border-zinc-200/60 bg-white/60">
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          <span className="font-bold text-zinc-900 truncate">{customTitle || tmpl.name || 'Plantilla'}</span>
          {entityName && <span className="text-[10px] font-semibold text-zinc-600 bg-zinc-200/70 px-1.5 py-0.5 rounded">{entityName}</span>}
        </div>
        <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
          <DiagnosticStatusBadge passed={isPassing} isWinner={isWinner} />
          {onCopyCorrectionPrompt && (
            <button type="button" onClick={onCopyCorrectionPrompt} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer border ${copiedPrompt ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white hover:bg-zinc-50 text-indigo-700 border-indigo-200 hover:border-indigo-300'}`} title="Copiar mini-prompt para que la IA corrija esta plantilla">
              {copiedPrompt ? <><Check className="w-3 h-3 text-white" /><span>¡Copiado!</span></> : <><Sparkles className="w-3 h-3 text-amber-500" /><span>Mini-prompt IA</span></>}
            </button>
          )}
          {onAction && actionLabel && <button type="button" onClick={onAction} className="text-[11px] font-bold text-zinc-700 hover:text-zinc-900 bg-white border border-zinc-200 hover:border-zinc-300 px-2.5 py-1 rounded-lg transition cursor-pointer">{actionLabel}</button>}
        </div>
      </div>

      {evaluation.criticalFailures.length > 0 && <DiagnosticIssueList title="Motivo(s) por los que no coincide:" items={evaluation.criticalFailures} kind="error" />}
      {evaluation.warnings.length > 0 && <DiagnosticIssueList title="Avisos de extracción:" items={evaluation.warnings} kind="warning" />}

      <div className="p-3 space-y-1.5">
        <DiagnosticLevelRow label="1. Entidad" passed={level1.passed} pattern={level1.matchedPattern ? `/${level1.matchedPattern}/i` : level1.entityName || entityName || 'sin patrón'} matchedOn={level1.matchedOn} />
        <DiagnosticLevelRow label="2. Asunto" passed={level2.passed} pattern={tmpl.subject_pattern ? `/${tmpl.subject_pattern}/i` : 'sin filtro de asunto'} matchedOn={level2.matchedOn} />
        <DiagnosticLevelRow label="3. Desempate" passed={level3.passed} pattern={tmpl.match_pattern ? `/${tmpl.match_pattern}/i` : 'no requerido'} />
        {rows.map((row) => (
          <DiagnosticExtractionRow key={row.label} label={row.label} pattern={row.pattern || ''} field={row.field} amount={row.amount} />
        ))}
        <div className="flex items-center gap-1.5 text-[11px] text-zinc-700">
          <Check className="w-3 h-3 text-emerald-600 shrink-0" />
          <span className="font-semibold shrink-0">Moneda</span>
          <code className="bg-white/80 border border-zinc-200 rounded px-1.5 py-0.5 font-mono truncate max-w-[180px] sm:max-w-xs">{tmpl.currency_regex ? `/${tmpl.currency_regex}/i` : 'por defecto'}</code>
          <span className="text-zinc-400 shrink-0">→</span>
          <span className="font-bold text-zinc-800 bg-white border border-zinc-200 px-2 py-0.5 rounded">{evaluation.level4.fields.currency.rawExtracted || '—'}</span>
        </div>
      </div>
    </div>
  );
}

interface EmailTemplatesManagerViewProps {
  initialMode?: 'explorer' | 'catalog';
}

interface IngestedEmail {
  id: string;
  sender: string;
  subject: string;
  body: string;
  plainBody?: string;
  snippet?: string;
  date?: string;
  matchedTemplateName?: string;
  matchedAmount?: string;
}


interface TemplateCatalogPanelProps {
  templates: CatalogTemplate[];
  entities: CatalogEntity[];
  isLoadingTemplates: boolean;
  templateSearchQuery: string;
  selectedEntityFilter: string;
  deletingId: string | null;
  availableEntityNames: string[];
  filteredTemplates: CatalogTemplate[];
  onSearchChange: (value: string) => void;
  onEntityFilterChange: (value: string) => void;
  onOpenNew: () => void;
  onEdit: (template: CatalogTemplate) => void;
  onDelete: (templateId: string) => void;
}

function TemplateCatalogPanel({
  templates, entities, isLoadingTemplates, templateSearchQuery, selectedEntityFilter, deletingId,
  availableEntityNames, filteredTemplates, onSearchChange, onEntityFilterChange, onOpenNew, onEdit, onDelete,
}: Readonly<TemplateCatalogPanelProps>) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3.5 border border-zinc-200 rounded-2xl shadow-xs">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={templateSearchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Buscar por nombre, banco o asunto..."
            className="w-full pl-9 pr-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-zinc-400"
          />
        </div>

        <div className="flex items-center space-x-1 overflow-x-auto pb-1 sm:pb-0">
          <button
            type="button"
            onClick={() => onEntityFilterChange('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition cursor-pointer ${selectedEntityFilter === 'all'
              ? 'bg-zinc-900 text-white'
              : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
              }`}
          >
            Todos ({templates.length})
          </button>
          {availableEntityNames.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => onEntityFilterChange(name)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition cursor-pointer ${selectedEntityFilter.toLowerCase() === name.toLowerCase()
                ? 'bg-zinc-900 text-white'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                }`}
            >
              {name}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => onOpenNew()}
          className="inline-flex items-center justify-center space-x-1.5 px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-semibold rounded-xl shadow-xs transition cursor-pointer shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Nueva Plantilla</span>
        </button>
      </div>

      {isLoadingTemplates ? (
        <div className="bg-white border border-zinc-200 rounded-2xl p-12 text-center space-y-2">
          <Loader2 className="w-6 h-6 animate-spin text-zinc-500 mx-auto" />
          <p className="text-xs text-zinc-500">Cargando plantillas guardadas...</p>
        </div>
      ) : filteredTemplates.length === 0 ? (
        <div className="bg-white border border-zinc-200 rounded-2xl p-12 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-zinc-100 flex items-center justify-center mx-auto text-zinc-400">
            <Layers className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-zinc-900">No hay plantillas que coincidan</h3>
            <p className="text-xs text-zinc-500 max-w-sm mx-auto">
              {templateSearchQuery ? 'Prueba con otro término de búsqueda.' : 'Crea una nueva plantilla para empezar.'}
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {filteredTemplates.map((t) => (
            <div
              key={t.id}
              className="bg-white border border-zinc-200 rounded-2xl p-4 space-y-3 shadow-xs hover:border-zinc-300 transition flex flex-col justify-between"
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-0.5">
                    <span className="inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-700">
                      {entities.find((e) => e.id === t.entity_id)?.name || 'General'}
                    </span>
                    <h3 className="text-sm font-bold text-zinc-900">{t.name}</h3>
                  </div>

                  <div className="flex items-center space-x-1">
                    {/* AQUI: Al hacer clic en editar, abre el modal sin redireccionar a correos */}
                    <button
                      type="button"
                      onClick={() => onEdit(t)}
                      className="p-1.5 text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition cursor-pointer"
                      title="Editar plantilla"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(t.id)}
                      disabled={deletingId === t.id}
                      className="p-1.5 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer disabled:opacity-50"
                      title="Eliminar plantilla"
                    >
                      {deletingId === t.id ? (
                        <Loader2 className="w-4 h-4 animate-spin text-rose-600" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {t.subject_pattern && (
                  <p className="text-xs text-zinc-500 line-clamp-1">
                    <span className="font-semibold text-zinc-700">Asunto:</span>{' '}
                    <code className="text-[11px] bg-zinc-100 px-1.5 py-0.5 rounded font-mono text-zinc-800">
                      {t.subject_pattern}
                    </code>
                  </p>
                )}
              </div>

              <div className="pt-2 border-t border-zinc-100 flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <DollarSign className="w-3 h-3" />
                  Monto
                </span>
                {t.merchant_regex && (
                  <span className="text-[10px] font-medium text-zinc-600 bg-zinc-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Store className="w-3 h-3 text-zinc-400" />
                    Comercio
                  </span>
                )}
                {t.source_account_regex && (
                  <span className="text-[10px] font-medium text-zinc-600 bg-zinc-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <CreditCard className="w-3 h-3 text-zinc-400" />
                    Cuenta
                  </span>
                )}
                {t.date_regex && (
                  <span className="text-[10px] font-medium text-zinc-600 bg-zinc-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-zinc-400" />
                    Fecha
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface TemplateEditModalProps {
  modal: TemplateFormState;
  updateModal: (patch: Partial<TemplateFormState>) => void;
  editingModalId: string | null;
  isModalSaving: boolean;
  modalError: string | null;
  modalSuccess: string | null;
  modalCopiedPrompt: boolean;
  modalPastedJson: string;
  modalSampleEmailId: string;
  modalSampleText: string;
  modalLiveExtraction: {
    amount: { value: string | null; matched: boolean; error?: string };
    merchant: { value: string | null; matched: boolean; error?: string };
    sourceAccount: { value: string | null; matched: boolean; error?: string };
    date: { value: string | null; matched: boolean; error?: string };
    time: { value: string | null; matched: boolean; error?: string };
  };
  emails: IngestedEmail[];
  entities: CatalogEntity[];
  onClose: () => void; onSave: (event: React.SubmitEvent<HTMLFormElement>) => void; onCopyPrompt: () => void; onApplyPastedJson: () => void;
  onSampleEmailChange: (value: string) => void; onCustomSampleBodyChange: (value: string) => void; onPastedJsonChange: (value: string) => void;
}

function TemplateEditModal({
  modal, updateModal, editingModalId, isModalSaving, modalError, modalSuccess, modalCopiedPrompt, modalPastedJson,
  modalSampleEmailId, modalSampleText, modalLiveExtraction, emails, entities, onClose, onSave, onCopyPrompt,
  onApplyPastedJson, onSampleEmailChange, onCustomSampleBodyChange, onPastedJsonChange,
}: Readonly<TemplateEditModalProps>) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-zinc-200 overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-zinc-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-zinc-900">
              {editingModalId ? `Editar Plantilla: ${modal.name}` : 'Nueva Plantilla'}
            </h3>
            <p className="text-xs text-zinc-500">
              Modifica los patrones de extracción y prueba los resultados con un correo de ejemplo.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-xl transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body (Scrollable) */}
        <form onSubmit={onSave} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {modalError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 font-medium flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{modalError}</span>
            </div>
          )}
          {modalSuccess && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-medium flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{modalSuccess}</span>
            </div>
          )}

          {/* SECCIÓN: CARGAR CORREO DE EJEMPLO PARA PROBAR */}
          <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <label htmlFor="email-template-field-1" className="text-xs font-bold text-zinc-900 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-indigo-600" />
                <span>Cargar correo de ejemplo para probar (opcional)</span>
              </label>
              {modalSampleText && (
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  Muestra activa
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <select id="email-template-field-1"
                value={modalSampleEmailId}
                onChange={(e) => onSampleEmailChange(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-white border border-zinc-200 rounded-xl focus:outline-hidden focus:ring-1 focus:ring-zinc-400"
              >
                <option value="">-- Seleccionar de correos recientes --</option>
                {emails.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.subject.slice(0, 45)} ({m.sender.split('@')[0]})
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={onCopyPrompt}
                className={`px-3 py-2 text-xs font-bold rounded-xl border transition flex items-center justify-center gap-1.5 cursor-pointer ${modalCopiedPrompt
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                  : 'bg-white border-zinc-200 hover:bg-zinc-100 text-zinc-700'
                  }`}
              >
                {modalCopiedPrompt ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{modalCopiedPrompt ? '¡Prompt Copiado!' : 'Copiar Prompt con Muestra'}</span>
              </button>
            </div>

            {/* Pegar respuesta JSON en el modal */}
            <div className="flex items-center gap-2 pt-1">
              <input
                type="text"
                value={modalPastedJson}
                onChange={(e) => onPastedJsonChange(e.target.value)}
                placeholder="Pega aquí el JSON devuelto por la IA..."
                className="flex-1 px-3 py-1.5 text-xs bg-white border border-zinc-200 rounded-lg font-mono text-[11px]"
              />
              <button
                type="button"
                onClick={onApplyPastedJson}
                className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold rounded-lg transition cursor-pointer"
              >
                Aplicar
              </button>
            </div>
          </div>

          {/* Campos Básicos */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-1">
              <label htmlFor="email-template-field-2" className="block text-xs font-bold text-zinc-700 mb-1">
                Nombre <span className="text-rose-500">*</span>
              </label>
              <input id="email-template-field-2"
                type="text"
                required
                value={modal.name}
                onChange={(e) => updateModal({ name: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl font-medium"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="email-template-field-3" className="text-xs font-bold text-zinc-700">Banco / Entidad</label>
                <button
                  type="button"
                  onClick={() => updateModal({ isNewEntity: !modal.isNewEntity })}
                  className="text-[11px] font-semibold text-indigo-600"
                >
                  {modal.isNewEntity ? 'Elegir' : '+ Nuevo'}
                </button>
              </div>
              {modal.isNewEntity ? (
                <input id="email-template-field-3"
                  type="text"
                  value={modal.entityLabel}
                  onChange={(e) => updateModal({ entityLabel: e.target.value })}
                  placeholder="Nombre del banco"
                  className="w-full px-3 py-2 text-xs bg-amber-50/40 border border-amber-300 rounded-xl font-medium"
                />
              ) : (
                <select
                  value={modal.entityId || ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    updateModal({ entityId: val || null });
                    const match = entities.find((ent) => ent.id === val);
                    if (match) updateModal({ entityLabel: match.name });
                  }}
                  className="w-full px-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl"
                >
                  {entities.map((ent) => (
                    <option key={ent.id} value={ent.id}>
                      {ent.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Asunto y Desempate */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="email-template-field-4" className="block text-xs font-bold text-zinc-700 mb-1">Patrón de Asunto</label>
              <input id="email-template-field-4"
                type="text"
                value={modal.subjectPattern}
                onChange={(e) => updateModal({ subjectPattern: e.target.value })}
                placeholder="Palabras clave en el asunto"
                className="w-full px-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl font-mono text-[11px]"
              />
            </div>

            <div>
              <label htmlFor="email-template-field-5" className="block text-xs font-bold text-zinc-700 mb-1">
                Desempate en Cuerpo (opcional)
              </label>
              <input id="email-template-field-5"
                type="text"
                value={modal.matchPattern}
                onChange={(e) => updateModal({ matchPattern: e.target.value })}
                placeholder="Palabra única para diferenciar"
                className="w-full px-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl font-mono text-[11px]"
              />
            </div>
          </div>

          {/* Regexes con Validación en Vivo sobre el correo cargado */}
          <div className="space-y-3 pt-2 border-t border-zinc-100">
            <span className="text-[11px] font-bold text-zinc-900 uppercase tracking-wider block">
              Reglas de Extracción
            </span>

            {/* Monto */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label htmlFor="email-template-field-6" className="text-xs font-bold text-zinc-700 flex items-center gap-1">
                  <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Monto</span>
                  <span className="text-rose-500">*</span>
                </label>
                {modalLiveExtraction.amount.matched && (
                  <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    Captura: ${modalLiveExtraction.amount.value}
                  </span>
                )}
              </div>
              <input id="email-template-field-6"
                type="text"
                required
                value={modal.amountRegex}
                onChange={(e) => updateModal({ amountRegex: e.target.value })}
                placeholder="Regex con grupo de captura () para el monto"
                className="w-full px-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl font-mono text-[11px]"
              />
            </div>

            {/* Comercio */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label htmlFor="email-template-field-7" className="text-xs font-bold text-zinc-700 flex items-center gap-1">
                  <Store className="w-3.5 h-3.5 text-zinc-500" />
                  <span>Comercio</span>
                </label>
                {modalLiveExtraction.merchant.matched && (
                  <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    Captura: {modalLiveExtraction.merchant.value}
                  </span>
                )}
              </div>
              <input id="email-template-field-7"
                type="text"
                value={modal.merchantRegex}
                onChange={(e) => updateModal({ merchantRegex: e.target.value })}
                placeholder="Regex con grupo de captura () para el comercio"
                className="w-full px-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl font-mono text-[11px]"
              />
            </div>

            {/* Cuenta */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label htmlFor="email-template-field-8" className="text-xs font-bold text-zinc-700 flex items-center gap-1">
                  <CreditCard className="w-3.5 h-3.5 text-zinc-500" />
                  <span>Cuenta o Tarjeta</span>
                </label>
                {modalLiveExtraction.sourceAccount.matched && (
                  <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    Captura: {modalLiveExtraction.sourceAccount.value}
                  </span>
                )}
              </div>
              <input id="email-template-field-8"
                type="text"
                value={modal.sourceAccountRegex}
                onChange={(e) => updateModal({ sourceAccountRegex: e.target.value })}
                placeholder="Regex con grupo de captura () para la cuenta"
                className="w-full px-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl font-mono text-[11px]"
              />
            </div>

            {/* Fecha */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
              <div className="sm:col-span-2 space-y-1">
                <div className="flex items-center justify-between">
                  <label htmlFor="email-template-field-9" className="text-xs font-bold text-zinc-700 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-zinc-500" />
                    <span>Fecha</span>
                  </label>
                  {modalLiveExtraction.date.matched && (
                    <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      Captura: {modalLiveExtraction.date.value}
                    </span>
                  )}
                </div>
                <input id="email-template-field-9"
                  type="text"
                  value={modal.dateRegex}
                  onChange={(e) => updateModal({ dateRegex: e.target.value })}
                  placeholder="Regex con grupo de captura () para la fecha"
                  className="w-full px-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl font-mono text-[11px]"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="email-template-field-10" className="text-xs font-bold text-zinc-700">Formato de Fecha</label>
                <select id="email-template-field-10"
                  value={modal.dateFormat}
                  onChange={(e) => updateModal({ dateFormat: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl"
                >
                  <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                  <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                  <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                </select>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label htmlFor="email-template-field-11" className="text-xs font-bold text-zinc-700 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-zinc-500" />
                    <span>Hora</span>
                  </label>
                  {modalLiveExtraction.time.matched && (
                    <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      Captura: {modalLiveExtraction.time.value}
                    </span>
                  )}
                </div>
                <input id="email-template-field-11"
                  type="text"
                  value={modal.timeRegex}
                  onChange={(e) => updateModal({ timeRegex: e.target.value })}
                  placeholder="Regex con grupo de captura () para la hora"
                  className="w-full px-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl font-mono text-[11px]"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="email-template-field-12" className="text-xs font-bold text-zinc-700">Formato de Hora</label>
                <select id="email-template-field-12"
                  value={modal.timeFormat}
                  onChange={(e) => updateModal({ timeFormat: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl"
                >
                  <option value="HH:mm:ss">HH:mm:ss</option>
                  <option value="HH:mm">HH:mm</option>
                </select>
              </div>
            </div>
          </div>

          {/* Modal Footer Actions */}
          <div className="pt-4 border-t border-zinc-100 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 bg-white border border-zinc-200 hover:bg-zinc-100 text-zinc-700 text-xs font-bold rounded-xl transition cursor-pointer"
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={isModalSaving}
              className="px-5 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold rounded-xl shadow-xs transition active:scale-95 cursor-pointer inline-flex items-center gap-2 disabled:opacity-50"
            >
              {isModalSaving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Check className="w-4 h-4 text-emerald-400" />
              )}
              <span>Guardar Cambios</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface CustomEmailModalProps {
  sender: string; subject: string; body: string;
  onSenderChange: (value: string) => void; onSubjectChange: (value: string) => void; onBodyChange: (value: string) => void;
  onSubmit: (event: React.SubmitEvent<HTMLFormElement>) => void; onClose: () => void;
}

function CustomEmailModal({ sender, subject, body, onSenderChange, onSubjectChange, onBodyChange, onSubmit, onClose }: Readonly<CustomEmailModalProps>) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-zinc-200 shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100">
          <div>
            <h3 className="text-sm font-bold text-zinc-900">Cargar Correo de Ejemplo</h3>
            <p className="text-xs text-zinc-500">
              Agrega el contenido de una notificación bancaria para probar o calibrar plantillas.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onClose()}
            className="text-zinc-400 hover:text-zinc-700 p-1.5 rounded-lg hover:bg-zinc-100 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="p-5 space-y-3.5">
          <div>
            <label htmlFor="email-template-field-13" className="block text-xs font-bold text-zinc-700 mb-1">
              Remitente <span className="text-zinc-400 font-normal">(opcional)</span>
            </label>
            <input id="email-template-field-13"
              type="text"
              value={sender}
              onChange={(e) => onSenderChange(e.target.value)}
              placeholder="ej: notificaciones@banco.com"
              className="w-full px-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-zinc-400"
            />
          </div>

          <div>
            <label htmlFor="email-template-field-14" className="block text-xs font-bold text-zinc-700 mb-1">
              Asunto <span className="text-zinc-400 font-normal">(opcional)</span>
            </label>
            <input id="email-template-field-14"
              type="text"
              value={subject}
              onChange={(e) => onSubjectChange(e.target.value)}
              placeholder="ej: Notificación de compra con tarjeta"
              className="w-full px-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-zinc-400"
            />
          </div>

          <div>
            <label htmlFor="email-template-field-15" className="block text-xs font-bold text-zinc-700 mb-1">
              Cuerpo del Correo <span className="text-rose-500">*</span>
            </label>
            <textarea id="email-template-field-15"
              required
              rows={6}
              value={body}
              onChange={(e) => onBodyChange(e.target.value)}
              placeholder="Pega aquí el texto completo de la notificación bancaria..."
              className="w-full px-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-zinc-400 font-mono text-[11px] leading-relaxed"
            />
          </div>

          <div className="pt-3 border-t border-zinc-100 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => onClose()}
              className="px-4 py-2 bg-white border border-zinc-200 hover:bg-zinc-100 text-zinc-700 text-xs font-bold rounded-xl transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold rounded-xl shadow-xs transition active:scale-95 cursor-pointer"
            >
              Cargar y Probar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


interface EmailTestData {
  sender: string;
  subject: string;
  body: string;
  plainBody?: string;
  snippet?: string;
}

const toEmailTestData = (
  selectedEmail: IngestedEmail | null,
  sampleSender: string,
  sampleSubject: string,
  sampleBody: string,
): EmailTestData | null => {
  if (selectedEmail) {
    return {
      sender: selectedEmail.sender,
      subject: selectedEmail.subject,
      body: selectedEmail.body,
      plainBody: selectedEmail.plainBody,
      snippet: selectedEmail.snippet,
    };
  }

  if (sampleSender || sampleSubject || sampleBody) {
    return {
      sender: sampleSender,
      subject: sampleSubject,
      body: sampleBody,
      plainBody: sampleBody,
      snippet: sampleBody.slice(0, 160),
    };
  }

  return null;
};

interface ResolvedEntityMatch {
  entity: CatalogEntity | null;
  effectivePattern: string | null;
  senderAlreadyCovered: boolean;
}

const resolveEntityMatch = (
  entities: CatalogEntity[],
  entityLabel: string | null | undefined,
  sender: string,
  body: string,
): ResolvedEntityMatch => {
  const bodyHead = getHeadLines(body, 15);
  const forwardedSender = extractForwardedSenderFromBody(body, 15);
  const matchesPattern = (pattern: string) =>
    entityPatternMatchesEmail(pattern, sender, forwardedSender || '', bodyHead);

  const matchedByName = findEntityByName(entities, entityLabel);
  const matchedByPattern = entities.find((entity) =>
    (entity.patterns || []).some(matchesPattern)
  ) || null;
  const entity = matchedByName || matchedByPattern;
  const senderAlreadyCovered = entity
    ? (entity.patterns || []).some(matchesPattern)
    : false;

  return { entity, effectivePattern: null, senderAlreadyCovered };
};

const resolveEntityAndPattern = (
  entities: CatalogEntity[],
  entityLabel: string | null | undefined,
  requestedPattern: string | null | undefined,
  sender: string,
  body: string,
): ResolvedEntityMatch => {
  const resolved = resolveEntityMatch(entities, entityLabel, sender, body);
  let effectivePattern = requestedPattern ? sanitizeRegexPattern(requestedPattern) : null;

  if (!effectivePattern && !resolved.senderAlreadyCovered) {
    effectivePattern = inferEntityEmailPattern(sender, body);
  }

  return { ...resolved, effectivePattern };
};

const getStoredGoogleToken = (): string | null => (
  typeof window === 'undefined' ? null : localStorage.getItem('google_provider_token')
);

const buildAuthHeaders = (token?: string | null): Record<string, string> => (
  token ? { 'x-google-token': token } : {}
);

const buildTemplateCorrectionDetails = (template: CatalogTemplate) => ({
  name: template.name || 'Plantilla',
  entity_label: template.entity?.name || null,
  entity_email_pattern: template.entity_email_patterns?.[0] || null,
  subject_pattern: template.subject_pattern || null,
  match_pattern: template.match_pattern || null,
  amount_regex: template.amount_regex || null,
  merchant_regex: template.merchant_regex || null,
  date_regex: template.date_regex || null,
  date_format: template.date_format || null,
  time_regex: template.time_regex || null,
  time_format: template.time_format || null,
  currency_regex: template.currency_regex || null,
  source_account_regex: template.source_account_regex || null,
  expense_type: template.expense_type_label || null,
});

export function EmailTemplatesManagerView({
  initialMode = 'explorer',
}: EmailTemplatesManagerViewProps) {
  const searchParams = useSearchParams();

  // Top level tabs: 'explorer' (2-panel email-driven flow) vs 'catalog' (saved templates list)
  const tabParam = searchParams.get('tab') || searchParams.get('mode');
  const resolvedTab = tabParam === 'catalog' ? 'catalog' : initialMode;
  const [activeTab, setActiveTab] = useState<'explorer' | 'catalog'>(resolvedTab);

  // Authentication & Access state
  const [authChecking, setAuthChecking] = useState<boolean>(true);
  const [isAuthorized, setIsAuthorized] = useState<boolean>(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [serviceDisabled, setServiceDisabled] = useState<boolean>(false);
  const [activationUrl, setActivationUrl] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Templates list state
  const [templates, setTemplates] = useState<CatalogTemplate[]>([]);
  const [entities, setEntities] = useState<CatalogEntity[]>([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState<boolean>(false);
  const [templateSearchQuery, setTemplateSearchQuery] = useState<string>('');
  const [selectedEntityFilter, setSelectedEntityFilter] = useState<string>('all');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Inbox & Emails state
  const [emails, setEmails] = useState<IngestedEmail[]>([]);
  const [isLoadingEmails, setIsLoadingEmails] = useState<boolean>(false);
  const [emailSearchQuery, setEmailSearchQuery] = useState<string>('');
  const [emailStatusFilter, setEmailStatusFilter] = useState<'all' | 'unmatched' | 'matched' | 'conflict'>('all');
  const [emailsError, setEmailsError] = useState<string | null>(null);

  // Selected Email for Right Panel Inspector
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);

  // Form State for Explorer panel
  const [isFormVisible, setIsFormVisible] = useState<boolean>(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [templateTestFilter, setTemplateTestFilter] = useState<string>('all');
  const [testResultViewFilter, setTestResultViewFilter] = useState<'all' | 'matched' | 'failed'>('all');
  const explorerForm = useTemplateFormState(EMPTY_TEMPLATE_FORM);
  const form = explorerForm.state;
  const { update: updateForm, reset: resetForm } = explorerForm;
  const setFormField = useCallback(<K extends keyof TemplateFormState>(field: K, value: TemplateFormState[K]) => {
    updateForm({ [field]: value } as Partial<TemplateFormState>);
  }, [updateForm]);

  const [copiedCorrectionPrompt, setCopiedCorrectionPrompt] = useState<boolean>(false);


  // Sample email reference for explorer right panel
  const [sampleSender, setSampleSender] = useState<string>('');
  const [sampleSubject, setSampleSubject] = useState<string>('');
  const [sampleBody, setSampleBody] = useState<string>('');
  const [isDiagnosisExpanded, setIsDiagnosisExpanded] = useState<boolean>(false);

  // AI Prompt & Paste state (Default Workflow)
  const [copiedPrompt, setCopiedPrompt] = useState<boolean>(false);
  const [pastedAIResponse, setPastedAIResponse] = useState<string>('');
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiSuccess, setAiSuccess] = useState<string | null>(null);
  const [aiPreviewDiagnosis, setAiPreviewDiagnosis] = useState<DiagnosisResult | null>(null);
  const [aiPreviewEmailId, setAiPreviewEmailId] = useState<string | null>(null);
  const [isAISuggestingDirect, setIsAISuggestingDirect] = useState<boolean>(false);

  // Saving state in Explorer
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null);

  // Custom Sample Email Modal
  const [isCustomEmailModalOpen, setIsCustomEmailModalOpen] = useState<boolean>(false);
  const [customSender, setCustomSender] = useState<string>('');
  const [customSubject, setCustomSubject] = useState<string>('');
  const [customBody, setCustomBody] = useState<string>('');

  // ---------------------------------------------------------------------------
  // Dedicated Modal Edit State (For editing templates directly from Catalog)
  // ---------------------------------------------------------------------------
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);
  const [editingModalId, setEditingModalId] = useState<string | null>(null);
  const modalFormState = useTemplateFormState(MODAL_TEMPLATE_FORM_DEFAULTS);
  const modal = modalFormState.state;
  const { update: updateModalForm } = modalFormState;
  const [modalSampleEmailId, setModalSampleEmailId] = useState<string>('');
  const [modalCustomSampleBody, setModalCustomSampleBody] = useState<string>('');
  const [isModalSaving, setIsModalSaving] = useState<boolean>(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [modalSuccess, setModalSuccess] = useState<string | null>(null);
  const [modalCopiedPrompt, setModalCopiedPrompt] = useState<boolean>(false);
  const [modalPastedJson, setModalPastedJson] = useState<string>('');


  // Check authentication status
  const checkAuthStatus = useCallback(async () => {
    setAuthChecking(true);
    setAuthError(null);
    try {
      const urlToken = searchParams.get('tester_token') || searchParams.get('token') || searchParams.get('provider_token');
      if (urlToken && typeof window !== 'undefined') {
        localStorage.setItem('google_provider_token', urlToken);
        document.cookie = `google_provider_token=${encodeURIComponent(urlToken)}; path=/; max-age=604800; SameSite=Lax`;
      }
      const storedToken = getStoredGoogleToken() || urlToken;
      const headers = buildAuthHeaders(storedToken);

      const res = await fetch('/api/gmail/status', { headers });
      const data = await res.json();

      if (data.serviceDisabled) {
        setServiceDisabled(true);
        setActivationUrl(data.activationUrl || 'https://console.cloud.google.com/apis/library/gmail.googleapis.com');
        setIsAuthorized(false);
      } else if (data.authorized || data.authenticated) {
        setIsAuthorized(true);
        setUserEmail(data.email || data.userEmail || null);
        setServiceDisabled(false);
      } else if (searchParams.get('tester_authorized') === 'true' && urlToken) {
        setIsAuthorized(true);
        setUserEmail(data.email || data.userEmail || null);
        setServiceDisabled(false);
      } else {
        if (typeof window !== 'undefined') {
          localStorage.removeItem('google_provider_token');
        }
        setIsAuthorized(false);
      }
    } catch (err: unknown) {
      console.warn('[EmailTemplatesManagerView] Status check error:', err);
      if (searchParams.get('tester_authorized') === 'true') {
        setIsAuthorized(true);
      } else {
        if (typeof window !== 'undefined') {
          localStorage.removeItem('google_provider_token');
        }
        setIsAuthorized(false);
      }
    } finally {
      setAuthChecking(false);
    }
  }, [searchParams]);

  // Fetch templates and entities
  const fetchTemplatesData = useCallback(async () => {
    setIsLoadingTemplates(true);
    try {
      const [tmplRes, catRes] = await Promise.all([
        fetch('/api/email-templates'),
        fetch('/api/email-templates/catalog'),
      ]);

      if (tmplRes.ok) {
        const tmplData = await tmplRes.json();
        setTemplates(Array.isArray(tmplData) ? tmplData : []);
      }

      if (catRes.ok) {
        const catData = await catRes.json();
        if (Array.isArray(catData.entities)) {
          setEntities(catData.entities);
        }
      }
    } catch (err) {
      console.error('[EmailTemplatesManagerView] Error fetching templates:', err);
    } finally {
      setIsLoadingTemplates(false);
    }
  }, []);

  // Fetch recent emails from Gmail
  const fetchInboxEmails = useCallback(async () => {
    setIsLoadingEmails(true);
    setEmailsError(null);
    try {
      const storedToken = getStoredGoogleToken();
      const headers = buildAuthHeaders(storedToken);

      const res = await fetch('/api/gmail/emails?maxResults=25', { headers });
      const data = await res.json();

      if (!res.ok) {
        if (res.status === 401 || data.error === 'AUTH_REQUIRED' || data.requiresAuth) {
          if (typeof window !== 'undefined') {
            localStorage.removeItem('google_provider_token');
          }
          setIsAuthorized(false);
          setEmailsError(
            'Tu autorización de Gmail ha caducado. Vuelve a conectar tu cuenta para actualizar los correos.'
          );
          return;
        }
        throw new Error(data.error || 'No se pudieron consultar los correos');
      }

      const rawEmails = Array.isArray(data.emails) ? data.emails : [];
      const normalizedEmails: IngestedEmail[] = rawEmails.map((e: any) => {
        const bodyContent = e.body || e.plainBody || e.snippet || '';
        return {
          id: e.id,
          sender: e.sender || '',
          subject: e.subject || '',
          body: bodyContent,
          plainBody: bodyContent,
          snippet: e.snippet || bodyContent.substring(0, 160),
          date: e.date,
          matchedTemplateName: e.matchedTemplateName,
          matchedAmount: e.matchedAmount,
        };
      });
      setEmails(normalizedEmails);

      if (normalizedEmails.length > 0) {
        setSelectedEmailId((prev) => prev || normalizedEmails[0].id);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al cargar correos';
      setEmailsError(msg);
    } finally {
      setIsLoadingEmails(false);
    }
  }, []);

  useEffect(() => {
    checkAuthStatus();
  }, [checkAuthStatus]);

  useEffect(() => {
    if (isAuthorized) {
      fetchTemplatesData();
      fetchInboxEmails();
    }
  }, [isAuthorized, fetchTemplatesData, fetchInboxEmails]);

  // Handle OAuth Connect
  const handleConnectGoogle = async () => {
    setIsConnecting(true);
    setAuthError(null);
    try {
      const supabase = createClient();
      if (typeof window !== 'undefined') {
        localStorage.setItem('auth_return_to', '/email-templates');
      }

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback?returnTo=/email-templates`,
          scopes: 'https://www.googleapis.com/auth/gmail.readonly',
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });

      if (error) throw error;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al iniciar conexión con Google';
      setAuthError(msg);
      setIsConnecting(false);
    }
  };

  // Disconnect Google account
  const handleDisconnect = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('google_provider_token');
    }
    setIsAuthorized(false);
    setUserEmail(null);
  };

  // Pre-calculate diagnoses for all emails in memory
  const emailDiagnoses = useMemo(() => {
    const map = new Map<string, DiagnosisResult>();
    if (!emails || emails.length === 0) return map;
    for (const email of emails) {
      const bodyContent = email.body || email.plainBody || email.snippet || '';
      const diag = diagnoseEmailMatching(
        email.sender || '',
        email.subject || '',
        bodyContent,
        templates,
        entities
      );
      map.set(email.id, diag);
    }
    return map;
  }, [emails, templates, entities]);

  // Currently selected email object
  const selectedEmail = useMemo(() => {
    if (!selectedEmailId) return emails[0] || null;
    return emails.find((e) => e.id === selectedEmailId) || emails[0] || null;
  }, [emails, selectedEmailId]);

  // Diagnosis for the currently selected email
  // Detect bank from sender or subject
  // Sync sample email whenever selected email changes in explorer mode (WITHOUT pre-filling form defaults)
  useEffect(() => {
    if (!selectedEmail) return;
    setSampleSender(selectedEmail.sender || '');
    setSampleSubject(selectedEmail.subject || '');
    setSampleBody(cleanEmailBody(selectedEmail.body || selectedEmail.plainBody || selectedEmail.snippet || ''));
    setAiPreviewDiagnosis(null);
    setAiPreviewEmailId(null);
  }, [selectedEmail]);

  // Templates to test against the selected email (default: 'all')
  const templatesToTest = useMemo(() => {
    if (templateTestFilter === 'all') return templates;
    return templates.filter(
      (t) => (entities.find((e) => e.id === t.entity_id)?.name ?? '').toLowerCase() === templateTestFilter.toLowerCase()
    );
  }, [templates, templateTestFilter, entities]);

  // Diagnosis report of the selected email. When an AI JSON preview is active for this
  // exact email, use that same complete diagnosis everywhere in the UI so the preview
  // cannot disagree with the summary shown above.
  const diagnosisForSelectedEmail = useMemo(() => {
    if (!selectedEmail) return null;
    if (aiPreviewDiagnosis && aiPreviewEmailId === selectedEmail.id) {
      return aiPreviewDiagnosis;
    }
    const bodyContent = cleanEmailBody(selectedEmail.body || selectedEmail.plainBody || selectedEmail.snippet || '');
    return diagnoseEmailMatching(
      selectedEmail.sender || '',
      selectedEmail.subject || '',
      bodyContent,
      templatesToTest,
      entities
    );
  }, [selectedEmail, templatesToTest, entities, aiPreviewDiagnosis, aiPreviewEmailId]);

  // Filtered reports according to view filter ('all' | 'matched' | 'failed')
  const filteredTestReports = useMemo(() => {
    if (!diagnosisForSelectedEmail?.reports) return [];
    if (testResultViewFilter === 'matched') {
      return diagnosisForSelectedEmail.reports.filter(
        (r) => r.level3Passed && r.extractedAmount !== null && r.extractedAmount !== undefined
      );
    }
    if (testResultViewFilter === 'failed') {
      return diagnosisForSelectedEmail.reports.filter(
        (r) => !r.level3Passed || r.extractedAmount === null || r.extractedAmount === undefined
      );
    }
    return diagnosisForSelectedEmail.reports;
  }, [diagnosisForSelectedEmail, testResultViewFilter]);

  const testedMatchedCount = useMemo(() => {
    if (!diagnosisForSelectedEmail?.reports) return 0;
    return diagnosisForSelectedEmail.reports.filter(
      (r) => r.level3Passed && r.extractedAmount !== null && r.extractedAmount !== undefined
    ).length;
  }, [diagnosisForSelectedEmail]);

  const testedFailedCount = useMemo(() => {
    if (!diagnosisForSelectedEmail?.reports) return 0;
    return diagnosisForSelectedEmail.reports.filter(
      (r) => !r.level3Passed || r.extractedAmount === null || r.extractedAmount === undefined
    ).length;
  }, [diagnosisForSelectedEmail]);

  // Plantilla activa en el formulario (creación o edición en curso)
  const activeFormTemplate = useMemo<CatalogTemplate>(() => {
    const matchedEnt = form.entityId
      ? entities.find((e) => e.id === form.entityId)
      : findEntityByName(entities, form.entityLabel);

    return {
      id: editingTemplateId || '__active_form_template__',
      name: form.name || 'Nueva Plantilla',
      subject_pattern: form.subjectPattern || '',
      amount_regex: form.amountRegex || '',
      merchant_regex: form.merchantRegex || '',
      date_regex: form.dateRegex || '',
      date_format: form.dateFormat || 'DD/MM/YYYY',
      entity_id: form.entityId || matchedEnt?.id || null,
      entity: { name: form.entityLabel || matchedEnt?.name || '' },
      match_pattern: form.matchPattern || '',
      expense_type_id: null,
      expense_type_label: form.expenseType || 'compra',
      currency_regex: form.currencyRegex || '',
      source_account_regex: form.sourceAccountRegex || '',
      time_regex: form.timeRegex || '',
      time_format: form.timeFormat || 'HH:mm:ss',
      entity_email_patterns: Array.from(new Set([
        ...(matchedEnt?.patterns || []),
        ...(form.entityEmailPattern ? [sanitizeRegexPattern(form.entityEmailPattern) || form.entityEmailPattern] : []),
      ])).filter(Boolean),
    };
  }, [
    editingTemplateId,
    form.name,
    form.subjectPattern,
    form.amountRegex,
    form.merchantRegex,
    form.dateRegex,
    form.dateFormat,
    form.entityLabel,
    form.entityId,
    form.matchPattern,
    form.expenseType,
    form.currencyRegex,
    form.sourceAccountRegex,
    form.timeRegex,
    form.timeFormat,
    form.entityEmailPattern,
    entities,
  ]);

  // Motor de evaluación unificado para la plantilla activa contra el correo seleccionado o muestra
  const activeFormEvaluation = useMemo<SingleTemplateEvaluation | null>(() => {
    const emailToTest = toEmailTestData(selectedEmail, sampleSender, sampleSubject, sampleBody);

    if (!emailToTest) return null;

    return evaluateTemplateAgainstEmail(activeFormTemplate, emailToTest, entities);
  }, [activeFormTemplate, selectedEmail, sampleSender, sampleSubject, sampleBody, entities]);

  // Copiar mini-prompt de corrección para IA con los fallos exactos detectados
  const handleCopyCorrectionPrompt = useCallback(async () => {
    const emailToTest = selectedEmail
      ? {
        sender: selectedEmail.sender || '',
        subject: selectedEmail.subject || '',
        body: selectedEmail.body || selectedEmail.plainBody || selectedEmail.snippet || '',
      }
      : {
        sender: sampleSender || '',
        subject: sampleSubject || '',
        body: sampleBody || '',
      };

    if (!emailToTest.sender && !emailToTest.subject && !emailToTest.body) return;
    if (!activeFormEvaluation) return;

    const cleanBody = cleanEmailBody(emailToTest.body);
    const promptText = buildCorrectionPrompt(
      emailToTest.sender,
      emailToTest.subject,
      cleanBody,
      {
        template: {
          name: form.name || 'Plantilla',
          entity_label: form.entityLabel || null,
          entity_email_pattern: form.entityEmailPattern || null,
          subject_pattern: form.subjectPattern || '',
          match_pattern: form.matchPattern || '',
          amount_regex: form.amountRegex || '',
          merchant_regex: form.merchantRegex || '',
          date_regex: form.dateRegex || '',
          date_format: form.dateFormat || null,
          time_regex: form.timeRegex || '',
          time_format: form.timeFormat || null,
          currency_regex: form.currencyRegex || '',
          source_account_regex: form.sourceAccountRegex || '',
          expense_type: form.expenseType || null,
        },
        failures: activeFormEvaluation.criticalFailures,
        warnings: activeFormEvaluation.warnings,
      }
    );

    try {
      await navigator.clipboard.writeText(promptText);
      setCopiedCorrectionPrompt(true);
      setTimeout(() => setCopiedCorrectionPrompt(false), 3000);
    } catch {
      setAiError('No se pudo copiar automáticamente. Copia el texto manualmente.');
    }
  }, [
    selectedEmail,
    sampleSender,
    sampleSubject,
    sampleBody,
    activeFormEvaluation,
    form.name,
    form.entityLabel,
    form.entityEmailPattern,
    form.subjectPattern,
    form.matchPattern,
    form.amountRegex,
    form.merchantRegex,
    form.dateRegex,
    form.dateFormat,
    form.timeRegex,
    form.timeFormat,
    form.currencyRegex,
    form.sourceAccountRegex,
    form.expenseType,
  ]);

  const [copiedReportPromptId, setCopiedReportPromptId] = useState<string | null>(null);

  // Copiar mini-prompt de corrección para cualquier plantilla del diagnóstico
  const handleCopyCorrectionPromptForReport = useCallback(async (report: DiagnosisTemplateReport) => {
    if (!selectedEmail) return;
    const cleanBody = cleanEmailBody(selectedEmail.body || selectedEmail.plainBody || selectedEmail.snippet || '');
    const evalData = report.evaluation || evaluateTemplateAgainstEmail(report.template, {
      sender: selectedEmail.sender || '',
      subject: selectedEmail.subject || '',
      body: selectedEmail.body || selectedEmail.plainBody || selectedEmail.snippet || '',
    }, entities);

    const promptText = buildCorrectionPrompt(
      selectedEmail.sender || '',
      selectedEmail.subject || '',
      cleanBody,
      {
        template: buildTemplateCorrectionDetails(report.template),
        failures: evalData.criticalFailures,
        warnings: evalData.warnings,
      }
    );

    try {
      await navigator.clipboard.writeText(promptText);
      setCopiedReportPromptId(report.template.id);
      setTimeout(() => setCopiedReportPromptId(null), 3000);
    } catch {
      setAiError('No se pudo copiar automáticamente.');
    }
  }, [selectedEmail, entities]);


  // Load an existing template into the explorer form to edit or inspect
  const handleLoadTemplateIntoForm = useCallback((tmpl: CatalogTemplate) => {
    setEditingTemplateId(tmpl.id);
    updateForm({
      name: tmpl.name,
      entityLabel: tmpl.entity?.name || '',
      entityId: tmpl.entity_id || null,
      entityEmailPattern: tmpl.entity_email_patterns?.[0] || '',
      isNewEntity: false,
      subjectPattern: tmpl.subject_pattern || '',
      matchPattern: tmpl.match_pattern || '',
      amountRegex: tmpl.amount_regex || '',
      merchantRegex: tmpl.merchant_regex || '',
      sourceAccountRegex: tmpl.source_account_regex || '',
      dateRegex: tmpl.date_regex || '',
      dateFormat: tmpl.date_format || '',
      timeRegex: tmpl.time_regex || '',
      timeFormat: tmpl.time_format || '',
      currencyRegex: tmpl.currency_regex || '',
      expenseType: tmpl.expense_type_label || 'compra',
    });

    setIsFormVisible(true);
    setSaveSuccessMessage(null);
    setSaveErrorMessage(null);
    setAiError(null);
    setAiSuccess(null);
    setAiPreviewDiagnosis(null);
  }, [updateForm]);

  // Open an empty form to create a template manually (zero defaults)
  const handleOpenEmptyForm = useCallback(() => {
    setEditingTemplateId(null);
    resetForm();
    setIsFormVisible(true);
    setSaveSuccessMessage(null);
    setSaveErrorMessage(null);
    setAiError(null);
    setAiSuccess(null);
    setAiPreviewDiagnosis(null);
  }, [resetForm]);

  // Add custom sample email to the list and select it
  const handleAddCustomEmail = (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!customBody.trim()) return;
    const newEmail: IngestedEmail = {
      id: `sample-${Date.now()}`,
      sender: customSender.trim() || 'notificaciones@banco.com',
      subject: customSubject.trim() || 'Notificación de Transacción Bancaria',
      body: customBody.trim(),
      plainBody: customBody.trim(),
      date: new Date().toISOString(),
    };
    setEmails((prev) => [newEmail, ...prev]);
    setSelectedEmailId(newEmail.id);
    setIsCustomEmailModalOpen(false);
    setCustomSender('');
    setCustomSubject('');
    setCustomBody('');
  };

  // ---------------------------------------------------------------------------
  // AI Prompt Copy / Paste Handlers (Default Flow)
  // ---------------------------------------------------------------------------
  const handleCopyPrompt = async () => {
    setAiError(null);
    const existingEntityCatalog = entities.map((e) => ({ id: e.id, name: e.name, patterns: e.patterns || [] }));
    const promptText = buildTemplatePrompt(
      sampleSender || selectedEmail?.sender || '',
      sampleSubject || selectedEmail?.subject || '',
      cleanEmailBody(sampleBody || selectedEmail?.body || selectedEmail?.plainBody || selectedEmail?.snippet || ''),
      existingEntityCatalog
    );

    try {
      await navigator.clipboard.writeText(promptText);
      setCopiedPrompt(true);
      setTimeout(() => setCopiedPrompt(false), 2500);
    } catch {
      setAiError('No se pudo copiar automáticamente. Copia el texto manualmente.');
    }
  };

  const handleApplyPastedAIResponse = () => {
    setAiError(null);
    setAiSuccess(null);
    setAiPreviewDiagnosis(null);
    setAiPreviewEmailId(null);

    if (!pastedAIResponse.trim()) {
      setAiError('Pega primero la respuesta JSON de la IA.');
      return;
    }

    const result = parseAITemplateResponse(pastedAIResponse);
    if (!result.success || !result.data) {
      setAiError(result.error || 'No se pudo interpretar el formato JSON.');
      return;
    }

    const data = result.data;
    const sender = sampleSender || selectedEmail?.sender || '';
    const body = cleanEmailBody(sampleBody || selectedEmail?.body || selectedEmail?.plainBody || selectedEmail?.snippet || '');
    const resolved = resolveEntityAndPattern(entities, data.entity_label, data.entity_email_pattern, sender, body);

    updateForm({
      name: data.name || '',
      entityLabel: resolved.entity?.name || data.entity_label || '',
      entityId: resolved.entity?.id || null,
      entityEmailPattern: resolved.effectivePattern || '',
      isNewEntity: !resolved.entity && Boolean(data.entity_label),
      subjectPattern: data.subject_pattern || '',
      matchPattern: data.match_pattern || '',
      amountRegex: data.amount_regex || '',
      merchantRegex: data.merchant_regex || '',
      sourceAccountRegex: data.source_account_regex || '',
      dateRegex: data.date_regex || '',
      dateFormat: data.date_format || '',
      timeRegex: data.time_regex || '',
      timeFormat: data.time_format || '',
      currencyRegex: data.currency_regex || '',
      expenseType: data.expense_type || 'compra',
    });

    setEditingTemplateId(null);
    setIsFormVisible(true);
    setPastedAIResponse('');

    const candidateTemplate: CatalogTemplate = {
      id: '__ai_pasted_template__',
      name: data.name || 'Nueva Plantilla',
      subject_pattern: data.subject_pattern,
      amount_regex: data.amount_regex,
      merchant_regex: data.merchant_regex,
      date_regex: data.date_regex,
      date_format: data.date_format,
      entity_id: resolved.entity?.id || null,
      entity: { name: resolved.entity?.name || data.entity_label || '' },
      match_pattern: data.match_pattern,
      expense_type_id: null,
      expense_type_label: data.expense_type,
      currency_regex: data.currency_regex,
      source_account_regex: data.source_account_regex,
      time_regex: data.time_regex,
      time_format: data.time_format,
      entity_email_patterns: Array.from(new Set([
        ...(resolved.entity?.patterns || []),
        ...(resolved.effectivePattern ? [resolved.effectivePattern] : []),
      ])).filter(Boolean),
    };

    const emailToTest = toEmailTestData(selectedEmail, sampleSender, sampleSubject, sampleBody);
    if (!emailToTest) {
      setAiSuccess('JSON cargado correctamente en el formulario.');
      return;
    }

    const evaluation = evaluateTemplateAgainstEmail(candidateTemplate, emailToTest, entities);
    if (!evaluation.overallPassed) {
      setAiError(
        evaluation.failureReasons[0] ||
        'La plantilla requiere ajustes en las expresiones regulares para coincidir completamente.'
      );
      return;
    }

    const hasNewPattern = !resolved.senderAlreadyCovered && Boolean(resolved.effectivePattern);
    if (hasNewPattern) {
      setAiSuccess(
        `JSON verificado con éxito: pasó los 4 niveles. Se asignó el patrón de remitente "${resolved.effectivePattern}" para registrarlo en ${resolved.entity?.name || data.entity_label || 'la entidad'} al guardar.`
      );
      return;
    }

    setAiSuccess('JSON verificado con éxito: pasó los 4 niveles (Entidad, Asunto, Desempate y Monto).');
  };


  // Direct AI Autocomplete helper (via Gemini API)
  const handleDirectAISuggest = async () => {
    if (!selectedEmail) return;
    setIsAISuggestingDirect(true);
    setAiError(null);
    setAiSuccess(null);

    try {
      const emailText = `Remitente: ${selectedEmail.sender}\nAsunto: ${selectedEmail.subject}\n\n${cleanEmailBody(
        selectedEmail.body || selectedEmail.plainBody || selectedEmail.snippet || ''
      )}`;

      const res = await fetch('/api/email-templates/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailText }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'No se pudo obtener sugerencia de la IA');
      }

      const s = data.suggestion;
      if (s) {
        const senderForEntity = selectedEmail.sender || '';
        const bodyForEntity = cleanEmailBody(selectedEmail.body || selectedEmail.plainBody || selectedEmail.snippet || '');
        const resolved = resolveEntityAndPattern(entities, s.entity_label, s.entity_email_pattern, senderForEntity, bodyForEntity);
        const matched = resolved.entity;
        const effectivePattern = resolved.effectivePattern;

        updateForm({
          name: s.name || '',
          entityLabel: matched?.name || s.entity_label || '',
          entityId: matched?.id || null,
          entityEmailPattern: effectivePattern || '',
          isNewEntity: !matched,
          subjectPattern: s.subject_pattern || '',
          matchPattern: s.match_pattern || '',
          amountRegex: s.amount_regex || '',
          merchantRegex: s.merchant_regex || '',
          sourceAccountRegex: s.source_account_regex || '',
          dateRegex: s.date_regex || '',
          dateFormat: s.date_format || '',
          timeRegex: s.time_regex || '',
          timeFormat: s.time_format || '',
          currencyRegex: s.currency_regex || '',
          expenseType: s.expense_type || 'compra',
        });

        setEditingTemplateId(null);
        setIsFormVisible(true);
        setAiSuccess('¡Campos completados directamente con Gemini! El formulario se ha desplegado abajo.');
        setTimeout(() => setAiSuccess(null), 4000);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al consultar la IA';
      setAiError(msg);
    } finally {
      setIsAISuggestingDirect(false);
    }
  };

  // Save or Create Template from Explorer Panel
  const handleSaveExplorerTemplate = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setSaveErrorMessage('El nombre de la plantilla es obligatorio');
      return;
    }
    if (!form.amountRegex.trim()) {
      setSaveErrorMessage('Debes definir la expresión regular para el monto');
      return;
    }

    setIsSaving(true);
    setSaveSuccessMessage(null);
    setSaveErrorMessage(null);

    try {
      const storedToken = typeof window !== 'undefined' ? localStorage.getItem('google_provider_token') : null;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (storedToken) {
        headers['x-google-token'] = storedToken;
      }

      // Resolve entity_id if an entity with this name already exists in catalog
      let effectiveEntityId = form.entityId || null;
      if (!effectiveEntityId && form.entityLabel.trim()) {
        const found = entities.find((ent) => ent.name.trim().toLowerCase() === form.entityLabel.trim().toLowerCase());
        if (found) {
          effectiveEntityId = found.id;
        }
      }

      const sender = sampleSender || selectedEmail?.sender || '';
      const body = sampleBody || selectedEmail?.body || selectedEmail?.plainBody || '';
      const ent = effectiveEntityId ? entities.find((e) => e.id === effectiveEntityId) : null;
      const proposed = sanitizeRegexPattern(form.entityEmailPattern.trim());
      const patternAlreadyInEntity = Boolean(
        proposed && ent?.patterns?.some((p) => p.trim().toLowerCase() === proposed.toLowerCase())
      );
      const fallbackInferred = (!proposed && (!ent?.patterns || ent.patterns.length === 0))
        ? inferEntityEmailPattern(sender, body)
        : null;
      const patternToSend = proposed ? (patternAlreadyInEntity ? null : proposed) : fallbackInferred;

      const payload = {
        ...(editingTemplateId ? { id: editingTemplateId } : {}),
        name: form.name.trim(),
        new_entity_name: form.entityLabel.trim() || null,
        new_entity_label: form.entityLabel.trim() || null,
        entity_id: effectiveEntityId,
        entity_email_pattern: patternToSend || null,
        subject_pattern: sanitizeRegexPattern(form.subjectPattern.trim()) || null,
        match_pattern: sanitizeRegexPattern(form.matchPattern.trim()) || null,
        amount_regex: sanitizeRegexPattern(form.amountRegex.trim()) || form.amountRegex.trim(),
        merchant_regex: sanitizeRegexPattern(form.merchantRegex.trim()) || null,
        source_account_regex: sanitizeRegexPattern(form.sourceAccountRegex.trim()) || null,
        date_regex: sanitizeRegexPattern(form.dateRegex.trim()) || null,
        date_format: form.dateFormat.trim() || 'DD/MM/YYYY',
        time_regex: sanitizeRegexPattern(form.timeRegex.trim()) || null,
        time_format: form.timeFormat.trim() || (form.timeRegex.trim() ? 'HH:mm:ss' : null),
        currency_regex: sanitizeRegexPattern(form.currencyRegex.trim()) || null,
      };

      const method = editingTemplateId ? 'PUT' : 'POST';
      const res = await fetch('/api/email-templates', {
        method,
        headers,
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al guardar la plantilla');
      }

      setSaveSuccessMessage(editingTemplateId ? 'Plantilla actualizada exitosamente.' : 'Plantilla guardada exitosamente.');
      await fetchTemplatesData();
      setTimeout(() => setSaveSuccessMessage(null), 3000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error inesperado al guardar';
      setSaveErrorMessage(msg);
    } finally {
      setIsSaving(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Modal Edit Actions (Opens Modal directly, never redirects to emails)
  // ---------------------------------------------------------------------------
  const openEditModal = (tmpl?: CatalogTemplate | null) => {
    setModalError(null);
    setModalSuccess(null);
    setModalPastedJson('');

    if (tmpl) {
      setEditingModalId(tmpl.id);
      updateModalForm({
        name: tmpl.name,
        entityLabel: tmpl.entity?.name || '',
        entityId: tmpl.entity_id || null,
        entityEmailPattern: Array.isArray(tmpl.entity_email_patterns) && tmpl.entity_email_patterns.length > 0
          ? tmpl.entity_email_patterns[0]
          : '',
        isNewEntity: false,
        subjectPattern: tmpl.subject_pattern || '',
        matchPattern: tmpl.match_pattern || '',
        amountRegex: tmpl.amount_regex || '',
        merchantRegex: tmpl.merchant_regex || '',
        sourceAccountRegex: tmpl.source_account_regex || '',
        dateRegex: tmpl.date_regex || '',
        dateFormat: tmpl.date_format || 'DD/MM/YYYY',
        timeRegex: tmpl.time_regex || '',
        timeFormat: tmpl.time_format || 'HH:mm:ss',
        currencyRegex: tmpl.currency_regex || '',
        expenseType: tmpl.expense_type_label || 'compra',
      });
    } else {
      setEditingModalId(null);
      updateModalForm({
        ...MODAL_TEMPLATE_FORM_DEFAULTS,
        name: 'Nueva Plantilla',
        entityLabel: entities[0]?.name || 'Bancolombia',
        entityId: entities[0]?.id || null,
      });
    }

    setModalSampleEmailId('');
    setModalCustomSampleBody('');
    setIsEditModalOpen(true);
  };

  const closeEditModal = () => {
    setIsEditModalOpen(false);
    setEditingModalId(null);
  };

  // Sample email text selected inside the modal
  const modalSampleText = useMemo(() => {
    if (modalCustomSampleBody.trim()) {
      return cleanEmailBody(modalCustomSampleBody);
    }
    if (modalSampleEmailId) {
      const email = emails.find((e) => e.id === modalSampleEmailId);
      if (email) {
        return cleanEmailBody(email.body || email.plainBody || email.snippet || '');
      }
    }
    return '';
  }, [modalCustomSampleBody, modalSampleEmailId, emails]);

  // Live Extraction within the Modal using unified extractWithCaptureGroup
  const modalLiveExtraction = useMemo(() => {
    const textToTest = cleanEmailBody(modalSampleText || '');

    const runExtraction = (pattern: string | null | undefined): { value: string | null; matched: boolean; error?: string } => {
      if (!pattern?.trim() || !textToTest) return { value: null, matched: false };
      const res = extractWithCaptureGroup(textToTest, pattern, 'Extracción');
      return {
        value: res.rawExtracted,
        matched: res.success,
        error: res.reason,
      };
    };

    return {
      amount: runExtraction(modal.amountRegex),
      merchant: runExtraction(modal.merchantRegex),
      sourceAccount: runExtraction(modal.sourceAccountRegex),
      date: runExtraction(modal.dateRegex),
      time: runExtraction(modal.timeRegex),
    };
  }, [modalSampleText, modal.amountRegex, modal.merchantRegex, modal.sourceAccountRegex, modal.dateRegex, modal.timeRegex]);

  // Copy Prompt from Modal
  const handleModalCopyPrompt = async () => {
    const existingEntityCatalog = entities.map((e) => ({ id: e.id, name: e.name, patterns: e.patterns || [] }));
    let sampleSubj = '';
    let sampleSenderAddr = '';
    if (modalSampleEmailId) {
      const email = emails.find((e) => e.id === modalSampleEmailId);
      if (email) {
        sampleSubj = email.subject;
        sampleSenderAddr = email.sender;
      }
    }
    const promptText = buildTemplatePrompt(
      sampleSenderAddr,
      sampleSubj,
      modalSampleText,
      existingEntityCatalog
    );

    try {
      await navigator.clipboard.writeText(promptText);
      setModalCopiedPrompt(true);
      setTimeout(() => setModalCopiedPrompt(false), 2500);
    } catch {
      setModalError('No se pudo copiar automáticamente al portapapeles.');
    }
  };

  // Apply JSON pasted into the Modal
  const handleModalApplyPastedJson = () => {
    setModalError(null);
    setModalSuccess(null);
    if (!modalPastedJson.trim()) {
      setModalError('Pega primero la respuesta JSON de la IA.');
      return;
    }

    const result = parseAITemplateResponse(modalPastedJson);
    if (!result.success || !result.data) {
      setModalError(result.error || 'No se pudo interpretar el formato JSON.');
      return;
    }

    const d = result.data;
    const modalSampleEmail = modalSampleEmailId ? emails.find((e) => e.id === modalSampleEmailId) : null;
    const modalSenderForEntity = modalSampleEmail?.sender || '';
    const modalBodyForEntity = cleanEmailBody(modalSampleEmail?.body || modalSampleEmail?.plainBody || modalSampleEmail?.snippet || '');
    const modalBodyHeadForEntity = getHeadLines(modalBodyForEntity, 15);
    const modalForwardedSender = extractForwardedSenderFromBody(modalBodyForEntity, 15);

    const matchesModalEntityPattern = (pattern: string) =>
      entityPatternMatchesEmail(
        pattern,
        modalSenderForEntity,
        modalForwardedSender || '',
        modalBodyHeadForEntity,
      );

    const matchedByName = findEntityByName(entities, d.entity_label);
    const matchedByPattern = entities.find((e) => (e.patterns || []).some(matchesModalEntityPattern)) || null;
    const matched = matchedByName || matchedByPattern || null;

    let effectiveModalPattern = d.entity_email_pattern
      ? sanitizeRegexPattern(d.entity_email_pattern)
      : null;
    const senderAlreadyCovered = matched
      ? (matched.patterns || []).some(matchesModalEntityPattern)
      : false;
    if (!effectiveModalPattern && !senderAlreadyCovered) {
      effectiveModalPattern = inferEntityEmailPattern(modalSenderForEntity, modalBodyForEntity);
    }

    const modalPatch: Partial<TemplateFormState> = {};
    if (d.name) modalPatch.name = d.name;
    if (d.entity_label || matched) {
      modalPatch.entityLabel = matched?.name || d.entity_label || '';
      modalPatch.entityEmailPattern = effectiveModalPattern || '';
      modalPatch.entityId = matched?.id || null;
      modalPatch.isNewEntity = !matched;
    }
    if (d.subject_pattern) modalPatch.subjectPattern = d.subject_pattern;
    if (d.match_pattern) modalPatch.matchPattern = d.match_pattern;
    if (d.amount_regex) modalPatch.amountRegex = d.amount_regex;
    if (d.merchant_regex) modalPatch.merchantRegex = d.merchant_regex;
    if (d.source_account_regex) modalPatch.sourceAccountRegex = d.source_account_regex;
    if (d.date_regex) modalPatch.dateRegex = d.date_regex;
    if (d.date_format) modalPatch.dateFormat = d.date_format;
    if (d.time_regex) modalPatch.timeRegex = d.time_regex;
    if (d.time_format) modalPatch.timeFormat = d.time_format;
    if (d.currency_regex) modalPatch.currencyRegex = d.currency_regex;
    if (d.expense_type) modalPatch.expenseType = d.expense_type;
    updateModalForm(modalPatch);

    setModalPastedJson('');
    setModalSuccess('¡Campos completados con la respuesta!');
    setTimeout(() => setModalSuccess(null), 3000);
  };

  // Save Modal Form
  const handleSaveModal = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!modal.name.trim()) {
      setModalError('El nombre de la plantilla es obligatorio');
      return;
    }
    if (!modal.amountRegex.trim()) {
      setModalError('Debes definir el patrón para el monto');
      return;
    }

    setIsModalSaving(true);
    setModalError(null);
    setModalSuccess(null);

    try {
      const storedToken = typeof window !== 'undefined' ? localStorage.getItem('google_provider_token') : null;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (storedToken) {
        headers['x-google-token'] = storedToken;
      }

      // Resolve entity_id if an entity with this name already exists in catalog
      let effectiveEntityId = modal.entityId || null;
      if (!effectiveEntityId && modal.entityLabel.trim()) {
        const found = entities.find((ent) => ent.name.trim().toLowerCase() === modal.entityLabel.trim().toLowerCase());
        if (found) {
          effectiveEntityId = found.id;
        }
      }

      const modalSampleEmail = modalSampleEmailId ? emails.find((e) => e.id === modalSampleEmailId) : null;
      const sender = modalSampleEmail?.sender || '';
      const body = modalSampleEmail?.body || modalSampleEmail?.plainBody || '';
      const ent = effectiveEntityId ? entities.find((e) => e.id === effectiveEntityId) : null;
      const proposed = sanitizeRegexPattern(modal.entityEmailPattern.trim());
      const patternAlreadyInEntity = Boolean(
        proposed && ent?.patterns?.some((p) => p.trim().toLowerCase() === proposed.toLowerCase())
      );
      const fallbackInferred = (!proposed && (!ent?.patterns || ent.patterns.length === 0))
        ? inferEntityEmailPattern(sender, body)
        : null;
      const patternToSend = proposed ? (patternAlreadyInEntity ? null : proposed) : fallbackInferred;

      const payload = {
        id: editingModalId,
        name: modal.name.trim(),
        new_entity_name: modal.entityLabel.trim() || null,
        new_entity_label: modal.entityLabel.trim() || null,
        entity_id: effectiveEntityId,
        entity_email_pattern: patternToSend || null,
        subject_pattern: sanitizeRegexPattern(modal.subjectPattern.trim()) || null,
        match_pattern: sanitizeRegexPattern(modal.matchPattern.trim()) || null,
        amount_regex: sanitizeRegexPattern(modal.amountRegex.trim()) || modal.amountRegex.trim(),
        merchant_regex: sanitizeRegexPattern(modal.merchantRegex.trim()) || null,
        source_account_regex: sanitizeRegexPattern(modal.sourceAccountRegex.trim()) || null,
        date_regex: sanitizeRegexPattern(modal.dateRegex.trim()) || null,
        date_format: modal.dateFormat.trim() || 'DD/MM/YYYY',
        time_regex: sanitizeRegexPattern(modal.timeRegex.trim()) || null,
        time_format: modal.timeFormat.trim() || (modal.timeRegex.trim() ? 'HH:mm:ss' : null),
        currency_regex: sanitizeRegexPattern(modal.currencyRegex.trim()) || null,
      };

      const method = editingModalId ? 'PUT' : 'POST';
      const res = await fetch('/api/email-templates', {
        method,
        headers,
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al guardar la plantilla');
      }

      await fetchTemplatesData();
      closeEditModal();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al guardar plantilla';
      setModalError(msg);
    } finally {
      setIsModalSaving(false);
    }
  };

  // Delete Template from Catalog
  const handleDeleteTemplate = async (templateId: string) => {
    if (!confirm('¿Estás seguro de que deseas eliminar esta plantilla?')) return;
    setDeletingId(templateId);
    try {
      const storedToken = getStoredGoogleToken();
      const headers = buildAuthHeaders(storedToken);

      const res = await fetch(`/api/email-templates?id=${templateId}`, {
        method: 'DELETE',
        headers,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Error al eliminar plantilla');
      }

      // Re-fetch from the server so the UI reflects the actual database state
      // (hard delete or soft delete). This also refreshes entity/template data
      // used by the diagnostics instead of relying only on local state.
      await fetchTemplatesData();

      setAiPreviewDiagnosis(null);
      setAiPreviewEmailId(null);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error al eliminar');
    } finally {
      setDeletingId(null);
    }
  };

  // Filtered emails in the left panel
  const filteredEmails = useMemo(() => {
    return emails.filter((e) => {
      if (emailSearchQuery.trim()) {
        const q = emailSearchQuery.toLowerCase();
        const textMatches =
          (e.subject || '').toLowerCase().includes(q) ||
          (e.sender || '').toLowerCase().includes(q) ||
          (e.body || e.plainBody || '').toLowerCase().includes(q);
        if (!textMatches) return false;
      }

      const diag = emailDiagnoses.get(e.id);
      const count = diag?.level3?.survivingTemplates?.length ?? 0;
      if (emailStatusFilter === 'unmatched') return count === 0;
      if (emailStatusFilter === 'matched') return count === 1;
      if (emailStatusFilter === 'conflict') return count > 1;
      return true;
    });
  }, [emails, emailSearchQuery, emailStatusFilter, emailDiagnoses]);

  // Filtered Templates for Catalog tab
  const filteredTemplates = useMemo(() => {
    return templates.filter((t) => {
      const matchesSearch =
        templateSearchQuery === '' ||
        t.name.toLowerCase().includes(templateSearchQuery.toLowerCase()) ||
        ((entities.find((e) => e.id === t.entity_id)?.name ?? '').toLowerCase().includes(templateSearchQuery.toLowerCase())) ||
        (t.subject_pattern?.toLowerCase().includes(templateSearchQuery.toLowerCase()));

      const matchesEntity =
        selectedEntityFilter === 'all' ||
        ((entities.find((e) => e.id === t.entity_id)?.name ?? '').toLowerCase() === selectedEntityFilter.toLowerCase());

      return matchesSearch && matchesEntity;
    });
  }, [templates, entities, templateSearchQuery, selectedEntityFilter]);

  const availableEntityNames = useMemo(() => {
    const set = new Set<string>();
    templates.forEach((t) => {
      const entityName = entities.find((e) => e.id === t.entity_id)?.name;
      if (entityName) set.add(entityName);
    });
    return Array.from(set);
  }, [templates, entities]);

  const statusCounts = useMemo(() => {
    let unmatched = 0;
    let matched = 0;
    let conflict = 0;
    for (const email of emails) {
      const diag = emailDiagnoses.get(email.id);
      const c = diag?.level3?.survivingTemplates?.length ?? 0;
      if (c === 0) unmatched++;
      else if (c === 1) matched++;
      else conflict++;
    }
    return { all: emails.length, unmatched, matched, conflict };
  }, [emails, emailDiagnoses]);

  // Loading Screen
  if (authChecking) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] p-8 space-y-4">
        <Loader2 className="w-8 h-8 animate-spin text-zinc-900" />
        <p className="text-sm font-medium text-zinc-600">Verificando acceso a plantillas...</p>
      </div>
    );
  }

  // Not Authorized View
  if (!isAuthorized) {
    return (
      <div className="max-w-xl mx-auto py-12 px-4">
        <div className="bg-white border border-zinc-200 rounded-2xl p-6 sm:p-8 shadow-xs space-y-6 text-center">
          <div className="w-14 h-14 bg-indigo-50 border border-indigo-100 rounded-2xl flex items-center justify-center mx-auto text-indigo-600">
            <Sparkles className="w-7 h-7" />
          </div>

          <div className="space-y-2">
            <h2 className="text-xl font-bold text-zinc-900">
              Gestor de Plantillas de Correo
            </h2>
            <p className="text-sm text-zinc-600 leading-relaxed max-w-md mx-auto">
              Conecta tu cuenta de Google para inspeccionar tus correos bancarios y configurar reglas de extracción.
            </p>
          </div>

          {serviceDisabled ? (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-left space-y-3">
              <div className="flex items-start space-x-2.5">
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-xs font-bold text-amber-900">
                    Activación requerida en Google Cloud Console
                  </p>
                  <p className="text-xs text-amber-700 leading-normal">
                    La API de Gmail aún no está habilitada. Actívala y reintenta la verificación.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                {activationUrl && (
                  <a
                    href={activationUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center space-x-1.5 px-3.5 py-2 text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition"
                  >
                    <span>Activar API en Google Cloud</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
                <button
                  type="button"
                  onClick={checkAuthStatus}
                  className="inline-flex items-center space-x-1.5 px-3.5 py-2 text-xs font-semibold bg-white border border-amber-300 text-amber-900 hover:bg-amber-100/50 rounded-lg transition cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Reintentar Verificación</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3 pt-2">
              <button
                type="button"
                id="connect-google-templates-btn"
                onClick={handleConnectGoogle}
                disabled={isConnecting}
                className="w-full sm:w-auto inline-flex items-center justify-center space-x-2.5 px-6 py-3 bg-zinc-900 hover:bg-zinc-800 text-white text-sm font-semibold rounded-xl shadow-xs transition-all active:scale-95 cursor-pointer disabled:opacity-50"
              >
                {isConnecting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Mail className="w-4 h-4 text-emerald-400" />
                )}
                <span>Conectar con Google</span>
              </button>

              {authError && (
                <p className="text-xs text-rose-600 font-medium">{authError}</p>
              )}
            </div>
          )}

        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-5 pb-16">
      {/* Header Bar & Tabs */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center space-x-2.5">
              <div className="w-8 h-8 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
                <Sparkles className="w-4 h-4" />
              </div>
              <h1 className="text-lg sm:text-xl font-bold text-zinc-900">
                Plantillas de Notificaciones Bancarias
              </h1>
            </div>
            <p className="text-xs sm:text-sm text-zinc-500">
              Inspecciona correos reales, copia el prompt para IA y gestiona tus plantillas de extracción.
            </p>
          </div>

          <div className="flex items-center space-x-2 bg-zinc-50 border border-zinc-200 px-3 py-1.5 rounded-xl self-start sm:self-center">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-xs font-medium text-zinc-700">
              {userEmail || 'Cuenta conectada'}
            </span>
            <button
              type="button"
              onClick={handleDisconnect}
              className="text-[11px] text-zinc-400 hover:text-rose-600 transition underline cursor-pointer ml-1"
            >
              Desconectar
            </button>
          </div>
        </div>

        {/* View Switcher: Explorer (2 panels) vs Catalog */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-zinc-100">
          <div className="flex items-center space-x-1.5 bg-zinc-100 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setActiveTab('explorer')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center space-x-2 ${activeTab === 'explorer'
                ? 'bg-white text-zinc-900 shadow-xs'
                : 'text-zinc-600 hover:text-zinc-900'
                }`}
            >
              <Inbox className="w-3.5 h-3.5" />
              <span>Explorador de Correos</span>
              {emails.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-zinc-200 text-zinc-800 text-[10px] font-bold">
                  {emails.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('catalog')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center space-x-2 ${activeTab === 'catalog'
                ? 'bg-white text-zinc-900 shadow-xs'
                : 'text-zinc-600 hover:text-zinc-900'
                }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Plantillas Guardadas</span>
              <span className="px-1.5 py-0.2 rounded-full bg-zinc-200 text-zinc-800 text-[10px] font-bold">
                {templates.length}
              </span>
            </button>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={fetchInboxEmails}
              disabled={isLoadingEmails}
              className="inline-flex items-center space-x-1 px-3 py-1.5 bg-zinc-50 hover:bg-zinc-100 text-zinc-700 text-xs font-medium border border-zinc-200 rounded-xl transition cursor-pointer disabled:opacity-50"
              title="Refrescar correos de Gmail"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingEmails ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Actualizar</span>
            </button>

          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* VISTA 1: EXPLORADOR DE CORREOS (2 PANELES)                                */}
      {/* ========================================================================= */}
      {activeTab === 'explorer' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Panel Izquierdo: Lista de Correos */}
          <div className="lg:col-span-5 space-y-3">
            <div className="bg-white border border-zinc-200 rounded-2xl p-3.5 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-zinc-900">Bandeja de Correos</span>
                <button
                  type="button"
                  onClick={() => setIsCustomEmailModalOpen(true)}
                  className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 inline-flex items-center gap-1 bg-indigo-50 hover:bg-indigo-100/80 px-2.5 py-1 rounded-lg transition cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                  <span>Cargar correo de ejemplo</span>
                </button>
              </div>

              <div className="relative">
                <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={emailSearchQuery}
                  onChange={(e) => setEmailSearchQuery(e.target.value)}
                  placeholder="Buscar por banco, asunto o texto..."
                  className="w-full pl-9 pr-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-zinc-400"
                />
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
                <button
                  type="button"
                  onClick={() => setEmailStatusFilter('all')}
                  className={`px-2.5 py-1 rounded-lg font-medium whitespace-nowrap transition cursor-pointer ${emailStatusFilter === 'all'
                    ? 'bg-zinc-900 text-white'
                    : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                    }`}
                >
                  Todos ({statusCounts.all})
                </button>
                <button
                  type="button"
                  onClick={() => setEmailStatusFilter('unmatched')}
                  className={`px-2.5 py-1 rounded-lg font-medium whitespace-nowrap transition cursor-pointer ${emailStatusFilter === 'unmatched'
                    ? 'bg-zinc-900 text-white'
                    : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                    }`}
                >
                  Sin plantilla ({statusCounts.unmatched})
                </button>
                <button
                  type="button"
                  onClick={() => setEmailStatusFilter('matched')}
                  className={`px-2.5 py-1 rounded-lg font-medium whitespace-nowrap transition cursor-pointer ${emailStatusFilter === 'matched'
                    ? 'bg-zinc-900 text-white'
                    : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                    }`}
                >
                  Coinciden ({statusCounts.matched})
                </button>
                {statusCounts.conflict > 0 && (
                  <button
                    type="button"
                    onClick={() => setEmailStatusFilter('conflict')}
                    className={`px-2.5 py-1 rounded-lg font-medium whitespace-nowrap transition cursor-pointer ${emailStatusFilter === 'conflict'
                      ? 'bg-amber-600 text-white'
                      : 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                      }`}
                  >
                    Conflictos ({statusCounts.conflict})
                  </button>
                )}
              </div>
            </div>

            {/* Email Cards List */}
            {isLoadingEmails ? (
              <div className="bg-white border border-zinc-200 rounded-2xl p-10 text-center space-y-2">
                <Loader2 className="w-6 h-6 animate-spin text-zinc-500 mx-auto" />
                <p className="text-xs text-zinc-500">Cargando correos bancarios...</p>
              </div>
            ) : filteredEmails.length === 0 ? (
              <div className="bg-white border border-zinc-200 rounded-2xl p-8 text-center space-y-2">
                <Inbox className="w-8 h-8 text-zinc-300 mx-auto" />
                <p className="text-xs font-bold text-zinc-800">No se encontraron correos</p>
                <p className="text-[11px] text-zinc-500">
                  {emailsError || 'Prueba con otro filtro o término de búsqueda.'}
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[calc(100vh-280px)] overflow-y-auto pr-1">
                {filteredEmails.map((email) => {
                  const isSelected = selectedEmail?.id === email.id;
                  const diag = emailDiagnoses.get(email.id);
                  const survivingCount = diag?.level3?.survivingTemplates?.length ?? 0;
                  const winner = diag?.winner;

                  return (
                    <div
                      key={email.id}
                      onClick={() => setSelectedEmailId(email.id)}
                      className={`p-3.5 rounded-2xl border transition text-left cursor-pointer flex flex-col justify-between space-y-2 ${isSelected
                        ? 'bg-indigo-50/40 border-indigo-500 shadow-xs ring-2 ring-indigo-500/20'
                        : 'bg-white border-zinc-200 hover:border-zinc-300'
                        }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-semibold text-zinc-500 truncate">
                            {email.sender}
                          </span>
                          {email.date && (
                            <span className="text-[10px] text-zinc-400 shrink-0">
                              {new Date(email.date).toLocaleDateString(undefined, {
                                month: 'short',
                                day: 'numeric',
                              })}
                            </span>
                          )}
                        </div>

                        <p className={`text-xs font-bold line-clamp-1 ${isSelected ? 'text-indigo-950' : 'text-zinc-900'}`}>
                          {email.subject}
                        </p>

                        <p className="text-[11px] text-zinc-500 line-clamp-1 font-mono leading-tight">
                          {email.snippet || cleanEmailBody(email.body || email.plainBody).slice(0, 100)}
                        </p>
                      </div>

                      <div className="pt-1.5 border-t border-zinc-100 flex items-center justify-between text-[11px]">
                        <EmailCardMatchStatus survivingCount={survivingCount} winner={winner} />

                        <span className="text-zinc-400 font-medium flex items-center text-[10px]">
                          {isSelected ? 'Seleccionado' : 'Ver'}
                          <ChevronRight className="w-3 h-3 ml-0.5" />
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Panel Derecho: Inspector & Creación Concisa */}
          <div className="lg:col-span-7 space-y-4">
            {!selectedEmail ? (
              <div className="bg-white border border-zinc-200 rounded-2xl p-12 text-center space-y-3 shadow-xs">
                <div className="w-12 h-12 rounded-2xl bg-zinc-100 flex items-center justify-center mx-auto text-zinc-400">
                  <Mail className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-zinc-900">Selecciona un correo</h3>
                  <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                    Haz clic en cualquier correo de la lista para ver su estado o crear una plantilla para él.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Sección Unificada: Correo + Diagnóstico contra Plantillas (colapsada por defecto) */}
                <div className="bg-white border border-zinc-200 rounded-2xl shadow-xs overflow-hidden">
                  {/* Cabecera siempre visible: resumen de 1 línea */}
                  <button
                    type="button"
                    onClick={() => setIsDiagnosisExpanded(!isDiagnosisExpanded)}
                    className="w-full p-4 flex items-center justify-between gap-3 text-left cursor-pointer hover:bg-zinc-50/60 transition"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-zinc-100 flex items-center justify-center text-zinc-500 shrink-0">
                        <Mail className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 space-y-0.5">
                        <p className="text-xs font-bold text-zinc-900 truncate">{selectedEmail.subject}</p>
                        <p className="text-[11px] text-zinc-500 truncate">{selectedEmail.sender}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <DiagnosisSummaryBadge
                        matchedCount={testedMatchedCount}
                        winner={diagnosisForSelectedEmail?.winner}
                      />
                      {isDiagnosisExpanded ? (
                        <ChevronUp className="w-4 h-4 text-zinc-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-zinc-400" />
                      )}
                    </div>
                  </button>

                  {/* Contenido expandible: texto del correo + diagnóstico detallado por plantilla */}
                  {isDiagnosisExpanded && (
                    <div className="border-t border-zinc-100 p-4 space-y-3">
                      {/* Texto del correo */}
                      <div className="bg-zinc-900 text-zinc-100 p-3 rounded-xl font-mono text-[11px] max-h-40 overflow-y-auto whitespace-pre-wrap leading-relaxed border border-zinc-800 select-all">
                        {sampleBody || '(Sin cuerpo disponible)'}
                      </div>

                      {/* Controles del diagnóstico */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 text-xs">
                          <button
                            type="button"
                            onClick={() => setTestResultViewFilter('all')}
                            className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer ${testResultViewFilter === 'all'
                              ? 'bg-zinc-900 text-white'
                              : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                              }`}
                          >
                            Todas ({diagnosisForSelectedEmail?.reports?.length || 0})
                          </button>
                          <button
                            type="button"
                            onClick={() => setTestResultViewFilter('matched')}
                            className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer ${testResultViewFilter === 'matched'
                              ? 'bg-emerald-700 text-white'
                              : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                              }`}
                          >
                            Coinciden ({testedMatchedCount})
                          </button>
                          <button
                            type="button"
                            onClick={() => setTestResultViewFilter('failed')}
                            className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer ${testResultViewFilter === 'failed'
                              ? 'bg-zinc-700 text-white'
                              : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                              }`}
                          >
                            Fallan ({testedFailedCount})
                          </button>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-zinc-500 font-medium">Probar:</span>
                          <select
                            value={templateTestFilter}
                            onChange={(e) => setTemplateTestFilter(e.target.value)}
                            className="text-xs bg-zinc-50 border border-zinc-200 rounded-lg px-2.5 py-1 font-medium text-zinc-700 focus:outline-hidden"
                          >
                            <option value="all">Todas las plantillas ({templates.length})</option>
                            {Array.from(new Set(templates.map((t) => entities.find((e) => e.id === t.entity_id)?.name).filter(Boolean))).map((ent) => (
                              <option key={ent} value={ent as string}>
                                Solo {ent} ({templates.filter((t) => entities.find((e) => e.id === t.entity_id)?.name === ent).length})
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Listado detallado: paso a paso por plantilla, con regex y valor intentado */}
                      {filteredTestReports.length === 0 ? (
                        <div className="p-6 text-center text-xs text-zinc-500 bg-zinc-50 rounded-xl border border-dashed border-zinc-200">
                          No hay plantillas que coincidan con este filtro.
                        </div>
                      ) : (
                        <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                          {filteredTestReports.map((report) => (
                            <TemplateDiagnosticStepsView
                              key={report.template.id}
                              evaluation={report.evaluation || evaluateTemplateAgainstEmail(report.template, {
                                sender: selectedEmail?.sender || '',
                                subject: selectedEmail?.subject || '',
                                body: selectedEmail?.body || selectedEmail?.plainBody || selectedEmail?.snippet || '',
                              }, entities)}
                              isWinner={report.isWinner}
                              onAction={() => handleLoadTemplateIntoForm(report.template)}
                              actionLabel={report.isWinner ? 'Editar' : 'Cargar'}
                              onCopyCorrectionPrompt={() => handleCopyCorrectionPromptForReport(report)}
                              copiedPrompt={copiedReportPromptId === report.template.id}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Formulario de Plantilla — el protagonista de este panel. Si no hay nada cargado, solo se ve la entrada IA */}
                {isFormVisible ? (
                  <form
                    onSubmit={handleSaveExplorerTemplate}
                    className="bg-white border-2 border-indigo-500/30 rounded-2xl p-5 shadow-sm space-y-4 transition"
                  >
                    <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
                      <div>
                        <h3 className="text-xs font-bold text-zinc-900 uppercase tracking-wider">
                          {editingTemplateId ? 'Editar Plantilla' : 'Configurar Plantilla'}
                        </h3>
                        <p className="text-[11px] text-zinc-500">
                          {editingTemplateId
                            ? `Modificando: ${form.name || 'Plantilla guardada'}`
                            : form.name
                              ? 'Valores completados a partir del JSON'
                              : 'Plantilla vacía (sin valores por defecto)'}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => setIsFormVisible(false)}
                        className="text-xs text-zinc-500 hover:text-zinc-800 font-semibold inline-flex items-center gap-1 cursor-pointer bg-zinc-100 hover:bg-zinc-200/80 px-2.5 py-1 rounded-lg transition"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>Ocultar formulario</span>
                      </button>
                    </div>

                    {aiSuccess && (
                      <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center space-x-2 text-emerald-800 text-xs font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span>{aiSuccess}</span>
                      </div>
                    )}

                    {/* Prueba unificada en vivo de la plantilla en edición contra el correo actual */}
                    {activeFormEvaluation && (
                      <TemplateDiagnosticStepsView
                        evaluation={activeFormEvaluation}
                        isWinner={activeFormEvaluation.overallPassed}
                        customTitle={`Prueba en vivo: ${form.name || 'Plantilla en edición'}`}
                        onCopyCorrectionPrompt={handleCopyCorrectionPrompt}
                        copiedPrompt={copiedCorrectionPrompt}
                      />
                    )}

                    {aiError && (
                      <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2 text-rose-800 text-xs font-medium">
                        <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
                        <span className="whitespace-pre-line">{aiError}</span>
                      </div>
                    )}

                    {saveSuccessMessage && (
                      <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center space-x-2 text-emerald-800 text-xs font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span>{saveSuccessMessage}</span>
                      </div>
                    )}
                    {saveErrorMessage && (
                      <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl flex items-center space-x-2 text-rose-800 text-xs font-medium">
                        <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                        <span>{saveErrorMessage}</span>
                      </div>
                    )}

                    {/* Fila 1: Nombre, Banco y Moneda — todo texto libre, refleja exactamente lo pegado */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="sm:col-span-1">
                        <label htmlFor="email-template-field-16" className="block text-xs font-bold text-zinc-700 mb-1">
                          Nombre <span className="text-rose-500">*</span>
                        </label>
                        <input id="email-template-field-16"
                          type="text"
                          required
                          value={form.name}
                          onChange={(e) => setFormField('name', e.target.value)}
                          className="w-full px-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-zinc-400 font-medium"
                        />
                      </div>

                      <div>
                        <label htmlFor="email-template-field-17" className="block text-xs font-bold text-zinc-700 mb-1">Banco / Entidad</label>
                        <input id="email-template-field-17"
                          type="text"
                          list="entity-suggestions"
                          value={form.entityLabel}
                          onChange={(e) => {
                            const val = e.target.value;
                            setFormField('entityLabel', val);
                            const match = entities.find((ent) => ent.name.toLowerCase() === val.toLowerCase());
                            if (match) {
                              setFormField('entityId', match.id);
                              setFormField('isNewEntity', false);
                            } else {
                              setFormField('entityId', null);
                              setFormField('isNewEntity', true);
                            }
                          }}
                          className="w-full px-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-zinc-400 font-medium"
                        />
                        <datalist id="entity-suggestions">
                          {entities.map((ent) => (
                            <option key={ent.id} value={ent.name} />
                          ))}
                        </datalist>
                        {form.entityLabel && form.isNewEntity && (
                          <span className="text-[10px] font-semibold text-amber-700 mt-0.5 block">
                            Entidad nueva, no existe en el catálogo
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Fila 2: Filtro de Asunto y Desempate */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="email-template-field-18" className="block text-xs font-bold text-zinc-700 mb-1">Patrón de Asunto</label>
                        <input id="email-template-field-18"
                          type="text"
                          value={form.subjectPattern}
                          onChange={(e) => setFormField('subjectPattern', e.target.value)}
                          className="w-full px-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-zinc-400 font-mono text-[11px]"
                        />
                      </div>

                      <div>
                        <label htmlFor="email-template-field-19" className="block text-xs font-bold text-zinc-700 mb-1">Desempate en Cuerpo</label>
                        <input id="email-template-field-19"
                          type="text"
                          value={form.matchPattern}
                          onChange={(e) => setFormField('matchPattern', e.target.value)}
                          className="w-full px-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-zinc-400 font-mono text-[11px]"
                        />
                      </div>
                    </div>

                    {/* Fila 3: Campos de Extracción */}
                    <div className="space-y-3 pt-2 border-t border-zinc-100">
                      <span className="text-[11px] font-bold text-zinc-900 uppercase tracking-wider block">
                        Reglas de Extracción
                      </span>

                      {/* Monto */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <label htmlFor="email-template-field-20" className="text-xs font-bold text-zinc-700 flex items-center gap-1">
                            <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Monto</span>
                            <span className="text-rose-500">*</span>
                          </label>
                          {activeFormEvaluation?.level4.fields.amount && (
                            <span className={`text-[11px] font-mono font-medium truncate max-w-[220px] ${activeFormEvaluation.level4.fields.amount.success ? 'text-emerald-700 font-bold' : 'text-zinc-400'
                              }`}>
                              {activeFormEvaluation.level4.fields.amount.success
                                ? `Captura: ${activeFormEvaluation.level4.fields.amount.rawExtracted}`
                                : (form.amountRegex ? 'Sin captura' : '')}
                            </span>
                          )}
                        </div>
                        <input id="email-template-field-20"
                          type="text"
                          required
                          value={form.amountRegex}
                          onChange={(e) => setFormField('amountRegex', e.target.value)}
                          className="w-full px-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-zinc-400 font-mono text-[11px]"
                        />
                      </div>

                      {/* Comercio */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <label htmlFor="email-template-field-21" className="text-xs font-bold text-zinc-700 flex items-center gap-1">
                            <Store className="w-3.5 h-3.5 text-zinc-500" />
                            <span>Comercio</span>
                          </label>
                          {activeFormEvaluation?.level4.fields.merchant && (
                            <span className={`text-[11px] font-mono font-medium truncate max-w-[220px] ${activeFormEvaluation.level4.fields.merchant.success ? 'text-emerald-700 font-bold' : 'text-zinc-400'
                              }`}>
                              {activeFormEvaluation.level4.fields.merchant.success
                                ? `Captura: ${activeFormEvaluation.level4.fields.merchant.rawExtracted}`
                                : (form.merchantRegex ? 'Sin captura' : '')}
                            </span>
                          )}
                        </div>
                        <input id="email-template-field-21"
                          type="text"
                          value={form.merchantRegex}
                          onChange={(e) => setFormField('merchantRegex', e.target.value)}
                          className="w-full px-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-zinc-400 font-mono text-[11px]"
                        />
                      </div>

                      {/* Cuenta */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <label htmlFor="email-template-field-22" className="text-xs font-bold text-zinc-700 flex items-center gap-1">
                            <CreditCard className="w-3.5 h-3.5 text-zinc-500" />
                            <span>Cuenta o Tarjeta</span>
                          </label>
                          {activeFormEvaluation?.level4.fields.source_account && (
                            <span className={`text-[11px] font-mono font-medium truncate max-w-[220px] ${activeFormEvaluation.level4.fields.source_account.success ? 'text-emerald-700 font-bold' : 'text-zinc-400'
                              }`}>
                              {activeFormEvaluation.level4.fields.source_account.success
                                ? `Captura: ${activeFormEvaluation.level4.fields.source_account.rawExtracted}`
                                : (form.sourceAccountRegex ? 'Sin captura' : '')}
                            </span>
                          )}
                        </div>
                        <input id="email-template-field-22"
                          type="text"
                          value={form.sourceAccountRegex}
                          onChange={(e) => setFormField('sourceAccountRegex', e.target.value)}
                          className="w-full px-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-zinc-400 font-mono text-[11px]"
                        />
                      </div>

                      {/* Fecha, Hora y sus formatos */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <label htmlFor="email-template-field-23" className="text-xs font-bold text-zinc-700 flex items-center gap-1">
                              <Calendar className="w-3.5 h-3.5 text-zinc-500" />
                              <span>Fecha</span>
                            </label>
                            {activeFormEvaluation?.level4.fields.date && (
                              <span className={`text-[11px] font-mono font-medium truncate max-w-[120px] ${activeFormEvaluation.level4.fields.date.success ? 'text-emerald-700 font-bold' : 'text-zinc-400'
                                }`}>
                                {activeFormEvaluation.level4.fields.date.success
                                  ? activeFormEvaluation.level4.fields.date.rawExtracted
                                  : (form.dateRegex ? 'Sin captura' : '')}
                              </span>
                            )}
                          </div>
                          <input id="email-template-field-23"
                            type="text"
                            value={form.dateRegex}
                            onChange={(e) => setFormField('dateRegex', e.target.value)}
                            className="w-full px-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-zinc-400 font-mono text-[11px]"
                          />
                        </div>

                        <div className="space-y-1">
                          <label htmlFor="email-template-field-24" className="text-xs font-bold text-zinc-700">Formato de Fecha</label>
                          <input id="email-template-field-24"
                            type="text"
                            list="date-format-suggestions"
                            value={form.dateFormat}
                            onChange={(e) => setFormField('dateFormat', e.target.value)}
                            className="w-full px-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-zinc-400 font-mono"
                          />
                          <datalist id="date-format-suggestions">
                            <option value="DD/MM/YYYY" />
                            <option value="YYYY-MM-DD" />
                            <option value="YYYY/MM/DD" />
                            <option value="MM/DD/YYYY" />
                          </datalist>
                        </div>

                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <label htmlFor="email-template-field-25" className="text-xs font-bold text-zinc-700 flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5 text-zinc-500" />
                              <span>Hora</span>
                            </label>
                            {activeFormEvaluation?.level4.fields.time && (
                              <span className={`text-[11px] font-mono font-medium truncate max-w-[120px] ${activeFormEvaluation.level4.fields.time.success ? 'text-emerald-700 font-bold' : 'text-zinc-400'
                                }`}>
                                {activeFormEvaluation.level4.fields.time.success
                                  ? activeFormEvaluation.level4.fields.time.rawExtracted
                                  : (form.timeRegex ? 'Sin captura' : '')}
                              </span>
                            )}
                          </div>
                          <input id="email-template-field-25"
                            type="text"
                            value={form.timeRegex}
                            onChange={(e) => setFormField('timeRegex', e.target.value)}
                            className="w-full px-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-zinc-400 font-mono text-[11px]"
                          />
                        </div>

                        <div className="space-y-1">
                          <label htmlFor="email-template-field-26" className="text-xs font-bold text-zinc-700">Formato de Hora</label>
                          <input id="email-template-field-26"
                            type="text"
                            list="time-format-suggestions"
                            value={form.timeFormat}
                            onChange={(e) => setFormField('timeFormat', e.target.value)}
                            className="w-full px-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-zinc-400 font-mono"
                            placeholder="HH:mm:ss"
                          />
                          <datalist id="time-format-suggestions">
                            <option value="HH:mm:ss" />
                            <option value="HH:mm" />
                            <option value="HH:mm a" />
                          </datalist>
                        </div>
                      </div>

                      {/* Regex adicionales */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <label htmlFor="email-template-field-27" className="text-xs font-bold text-zinc-700">Patrón de Correo de Entidad</label>
                          <input id="email-template-field-27"
                            type="text"
                            value={form.entityEmailPattern}
                            onChange={(e) => setFormField('entityEmailPattern', e.target.value)}
                            className="w-full px-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-zinc-400 font-mono text-[11px]"
                            placeholder="Se persiste como entity_email_patterns"
                          />
                        </div>
                        <div className="space-y-1">
                          <label htmlFor="email-template-field-28" className="text-xs font-bold text-zinc-700">Moneda Regex</label>
                          <input id="email-template-field-28"
                            type="text"
                            value={form.currencyRegex}
                            onChange={(e) => setFormField('currencyRegex', e.target.value)}
                            className="w-full px-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-zinc-400 font-mono text-[11px]"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Acciones de Formulario */}
                    <div className="pt-3 border-t border-zinc-100 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => setIsFormVisible(false)}
                        className="px-4 py-2 bg-white border border-zinc-200 hover:bg-zinc-100 text-zinc-700 text-xs font-bold rounded-xl transition cursor-pointer"
                      >
                        Cancelar
                      </button>

                      <button
                        type="submit"
                        disabled={isSaving}
                        className="px-5 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold rounded-xl shadow-xs transition active:scale-95 cursor-pointer inline-flex items-center gap-2 disabled:opacity-50"
                      >
                        {isSaving ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Check className="w-4 h-4 text-emerald-400" />
                        )}
                        <span>{editingTemplateId ? 'Actualizar Plantilla' : 'Guardar Plantilla'}</span>
                      </button>
                    </div>
                  </form>
                ) : (
                  /* Sin formulario cargado aún: la entrada principal es copiar el prompt y pegar el JSON */
                  <div className="bg-white border-2 border-dashed border-zinc-300 rounded-2xl p-6 space-y-4">
                    <div className="text-center space-y-1">
                      <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 mx-auto">
                        <Bot className="w-5 h-5" />
                      </div>
                      <h3 className="text-sm font-bold text-zinc-900">Genera una plantilla para este correo</h3>
                      <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                        Copia el prompt, pégalo en tu IA, y trae la respuesta aquí. El formulario aparecerá con exactamente lo que traiga el JSON.
                      </p>
                    </div>

                    <div className="flex items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={handleCopyPrompt}
                        className={`inline-flex items-center space-x-1.5 px-4 py-2 text-xs font-bold rounded-xl shadow-xs transition active:scale-95 cursor-pointer ${copiedPrompt
                          ? 'bg-emerald-600 text-white'
                          : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                          }`}
                      >
                        {copiedPrompt ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedPrompt ? '¡Prompt Copiado!' : 'Copiar Prompt'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleDirectAISuggest}
                        disabled={isAISuggestingDirect}
                        className="inline-flex items-center space-x-1 px-3 py-2 bg-white border border-zinc-300 hover:bg-zinc-50 text-zinc-700 text-xs font-semibold rounded-xl transition cursor-pointer disabled:opacity-50"
                        title="Generar automáticamente con Gemini"
                      >
                        {isAISuggestingDirect ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                        )}
                        <span>Generar directo</span>
                      </button>
                    </div>

                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                      <input
                        type="text"
                        value={pastedAIResponse}
                        onChange={(e) => setPastedAIResponse(e.target.value)}
                        placeholder="Pega aquí el JSON de la IA"
                        className="flex-1 px-3 py-2 text-xs bg-zinc-50 border border-zinc-300 rounded-xl focus:outline-hidden focus:ring-1 focus:ring-indigo-500 font-mono text-[11px]"
                      />
                      <button
                        type="button"
                        onClick={handleApplyPastedAIResponse}
                        className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold rounded-xl shadow-xs transition active:scale-95 cursor-pointer shrink-0"
                      >
                        Cargar en Formulario
                      </button>
                    </div>

                    {aiError && (
                      <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl flex items-center space-x-2 text-rose-800 text-xs font-medium">
                        <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                        <span>{aiError}</span>
                      </div>
                    )}

                    <div className="flex items-center justify-center text-[11px]">
                      <button
                        type="button"
                        onClick={handleOpenEmptyForm}
                        className="font-medium text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer"
                      >
                        + Crear plantilla vacía manualmente
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {activeTab === 'catalog' && (
        <TemplateCatalogPanel
          templates={templates}
          entities={entities}
          isLoadingTemplates={isLoadingTemplates}
          templateSearchQuery={templateSearchQuery}
          selectedEntityFilter={selectedEntityFilter}
          deletingId={deletingId}
          availableEntityNames={availableEntityNames}
          filteredTemplates={filteredTemplates}
          onSearchChange={setTemplateSearchQuery}
          onEntityFilterChange={setSelectedEntityFilter}
          onOpenNew={() => openEditModal(null)}
          onEdit={openEditModal}
          onDelete={handleDeleteTemplate}
        />
      )}

      {/* ========================================================================= */}
      {isEditModalOpen && (
        <TemplateEditModal
          modal={modalFormState.state}
          updateModal={modalFormState.update}
          editingModalId={editingModalId}
          isModalSaving={isModalSaving}
          modalError={modalError}
          modalSuccess={modalSuccess}
          modalCopiedPrompt={modalCopiedPrompt}
          modalPastedJson={modalPastedJson}
          modalSampleEmailId={modalSampleEmailId}
          modalSampleText={modalSampleText}
          modalLiveExtraction={modalLiveExtraction}
          emails={emails}
          entities={entities}
          onClose={closeEditModal}
          onSave={handleSaveModal}
          onCopyPrompt={handleModalCopyPrompt}
          onApplyPastedJson={handleModalApplyPastedJson}
          onSampleEmailChange={(value) => {
            setModalSampleEmailId(value);
            setModalCustomSampleBody('');
          }}
          onCustomSampleBodyChange={setModalCustomSampleBody}
          onPastedJsonChange={setModalPastedJson}
        />
      )}

      {isCustomEmailModalOpen && (
        <CustomEmailModal
          sender={customSender}
          subject={customSubject}
          body={customBody}
          onSenderChange={setCustomSender}
          onSubjectChange={setCustomSubject}
          onBodyChange={setCustomBody}
          onSubmit={handleAddCustomEmail}
          onClose={() => setIsCustomEmailModalOpen(false)}
        />
      )}
    </div>
  );
}
