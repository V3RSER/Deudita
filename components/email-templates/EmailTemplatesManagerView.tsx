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
  ChevronDown,
  ChevronRight
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import {
  cleanEmailBody,
  sanitizeRegexPattern,
  parseAITemplateResponse,
  buildTemplatePrompt,
  buildCorrectionPrompt,
  resolveEmailEntity
} from '@/lib/email-cleaning';
import {
  CatalogEntity,
  CatalogTemplate,
  diagnoseEmailMatching,
  DiagnosisResult,
  SingleTemplateEvaluation,
  evaluateTemplateAgainstEmail,
  DiagnosisTemplateReport
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
      <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-emerald-700">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
        <span>Coincide</span>
      </span>
    );
  }

  if (survivingCount > 1) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-amber-700">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
        <span>Conflicto ({survivingCount})</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-zinc-500">
      <span className="w-1.5 h-1.5 rounded-full bg-zinc-300 shrink-0" />
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
    { label: 'Monto', pattern: tmpl.amount_regex, field: level4.fields.amount, amount: level4.extractedAmount },
    { label: 'Comercio', pattern: tmpl.merchant_regex, field: level4.fields.merchant },
    { label: 'Cuenta', pattern: tmpl.source_account_regex, field: level4.fields.source_account },
    { label: 'Fecha', pattern: tmpl.date_regex, field: level4.fields.date },
    { label: 'Hora', pattern: tmpl.time_regex, field: level4.fields.time },
  ].filter((row) => Boolean(row.pattern));

  return (
    <details
      open={Boolean(customTitle) || Boolean(isWinner)}
      className={`group rounded-xl border overflow-hidden transition ${isPassing
        ? 'bg-emerald-50/40 border-emerald-200'
        : 'bg-white border-zinc-200'
        }`}
    >
      <summary className="list-none cursor-pointer px-3 py-2.5 flex items-center justify-between gap-3 hover:bg-white/60 transition [&::-webkit-details-marker]:hidden">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${isPassing ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-100 text-zinc-500'}`}>
            {isPassing ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-xs font-bold text-zinc-900 truncate">{customTitle || tmpl.name || 'Plantilla'}</span>
              {entityName && <span className="text-[9px] font-semibold text-zinc-500 bg-zinc-100 px-1.5 py-0.5 rounded shrink-0">{entityName}</span>}
            </div>
            <span className="text-[10px] text-zinc-400">{evaluation.criticalFailures.length ? `${evaluation.criticalFailures.length} error(es)` : `${rows.length + 4} comprobaciones`}</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <DiagnosticStatusBadge passed={isPassing} isWinner={isWinner} />
          {onCopyCorrectionPrompt && (
            <button type="button" onClick={(event: React.MouseEvent<HTMLButtonElement>) => { event.preventDefault(); onCopyCorrectionPrompt(); }} className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold border transition cursor-pointer ${copiedPrompt ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-indigo-700 border-zinc-200 hover:bg-indigo-50'}`}>
              {copiedPrompt ? <Check className="w-3 h-3" /> : <Sparkles className="w-3 h-3 text-amber-500" />}
              {copiedPrompt ? 'Copiado' : 'IA'}
            </button>
          )}
          {onAction && actionLabel && (
            <button type="button" onClick={(event) => { event.preventDefault(); onAction(); }} className="px-2 py-1 rounded-lg bg-white border border-zinc-200 text-[10px] font-bold text-zinc-700 hover:bg-zinc-50 transition cursor-pointer">{actionLabel}</button>
          )}
          <ChevronDown className="w-3.5 h-3.5 text-zinc-400 transition-transform group-open:rotate-180" />
        </div>
      </summary>

      <div className="border-t border-zinc-200/80 p-3 space-y-2.5">
        {evaluation.criticalFailures.length > 0 && <DiagnosticIssueList title="Motivo(s) por los que no coincide:" items={evaluation.criticalFailures} kind="error" />}
        {evaluation.warnings.length > 0 && <DiagnosticIssueList title="Avisos de extracción:" items={evaluation.warnings} kind="warning" />}

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-x-4 gap-y-1.5">
          <DiagnosticLevelRow label="1. Entidad" passed={level1.passed} pattern={level1.matchedPattern ? `/${level1.matchedPattern}/i` : level1.entityName || entityName || 'sin patrón'} matchedOn={level1.matchedOn} />
          <DiagnosticLevelRow label="2. Asunto" passed={level2.passed} pattern={tmpl.subject_pattern ? `/${tmpl.subject_pattern}/i` : 'sin filtro de asunto'} matchedOn={level2.matchedOn} />
          <DiagnosticLevelRow label="3. Desempate" passed={level3.passed} pattern={tmpl.match_pattern ? `/${tmpl.match_pattern}/i` : 'no requerido'} />
          {rows.map((row) => (
            <DiagnosticExtractionRow key={row.label} label={row.label} pattern={row.pattern || ''} field={row.field} amount={row.amount} />
          ))}
          <div className="flex items-center gap-1.5 text-[11px] text-zinc-700 min-w-0">
            <Check className="w-3 h-3 text-emerald-600 shrink-0" />
            <span className="font-semibold shrink-0">Moneda</span>
            <code className="bg-white/80 border border-zinc-200 rounded px-1.5 py-0.5 font-mono truncate max-w-[180px]">{tmpl.currency_regex ? `/${tmpl.currency_regex}/i` : 'por defecto'}</code>
            <span className="text-zinc-400 shrink-0">→</span>
            <span className="font-bold text-zinc-800 bg-white border border-zinc-200 px-2 py-0.5 rounded truncate">{evaluation.level4.fields.currency.rawExtracted || '—'}</span>
          </div>
        </div>
      </div>
    </details>
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


interface EmailBodyModalProps {
  subject: string;
  sender: string;
  date?: string;
  body: string;
  onClose: () => void;
}

function EmailBodyModal({ subject, sender, date, body, onClose }: Readonly<EmailBodyModalProps>) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-zinc-200 shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-zinc-100 shrink-0">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Correo completo</p>
            <h3 className="text-sm font-bold text-zinc-900 break-words mt-0.5">{subject || '(Sin asunto)'}</h3>
            <div className="flex items-center gap-2 text-[10px] text-zinc-400 mt-1 flex-wrap">
              <span className="break-all">{sender || '(Sin remitente)'}</span>
              {date && <span>{new Date(date).toLocaleString()}</span>}
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-zinc-400 hover:text-zinc-700 p-1.5 rounded-lg hover:bg-zinc-100 transition cursor-pointer shrink-0" aria-label="Cerrar">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="overflow-y-auto p-5 sm:p-7 select-text cursor-text">
          <div className="font-mono text-[12px] sm:text-[13px] text-zinc-800 whitespace-pre-wrap leading-7 break-words">{body || '(Sin cuerpo disponible)'}</div>
        </div>
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

const buildTemplateSavePayload = (
  form: TemplateFormState,
  editingTemplateId: string | null,
  entityId: string | null,
  entityEmailPattern: string | null,
) => ({
  ...(editingTemplateId ? { id: editingTemplateId } : {}),
  name: form.name.trim(),
  new_entity_name: form.entityLabel.trim() || null,
  new_entity_label: form.entityLabel.trim() || null,
  entity_id: entityId,
  entity_email_pattern: entityEmailPattern,
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
});

export function EmailTemplatesManagerView({
  initialMode = 'explorer',
}: Readonly<EmailTemplatesManagerViewProps>) {
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
  const [emailFetchLimit, setEmailFetchLimit] = useState<number>(25);
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


  const [isEmailBodyModalOpen, setIsEmailBodyModalOpen] = useState<boolean>(false);

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
        setUserEmail(null);
      } else {
        const authorized = Boolean(
          data.authorized ||
          data.authenticated ||
          (searchParams.get('tester_authorized') === 'true' && urlToken)
        );

        setServiceDisabled(false);
        setIsAuthorized(authorized);
        setUserEmail(authorized ? data.email || data.userEmail || null : null);

        if (!authorized && typeof window !== 'undefined') {
          localStorage.removeItem('google_provider_token');
        }
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

  // Fetch recent emails from Gmail. Re-fetching with a larger limit gives the
  // user a simple progressive "Cargar más" flow without introducing a second
  // pagination state model in the UI.
  const fetchInboxEmails = useCallback(async (nextLimit = 25, append = false) => {
    setIsLoadingEmails(true);
    setEmailsError(null);
    try {
      const storedToken = getStoredGoogleToken();
      const headers = buildAuthHeaders(storedToken);

      const res = await fetch(`/api/gmail/emails?maxResults=${nextLimit}`, { headers });
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
      const normalizedEmails: IngestedEmail[] = rawEmails
        .map((value: unknown): IngestedEmail | null => {
          if (!value || typeof value !== 'object') return null;
          const email = value as Record<string, unknown>;
          const id = typeof email.id === 'string' ? email.id : '';
          if (!id) return null;
          const bodyContent = typeof email.body === 'string'
            ? email.body
            : typeof email.plainBody === 'string'
              ? email.plainBody
              : typeof email.snippet === 'string'
                ? email.snippet
                : '';
          return {
            id,
            sender: typeof email.sender === 'string' ? email.sender : '',
            subject: typeof email.subject === 'string' ? email.subject : '',
            body: bodyContent,
            plainBody: bodyContent,
            snippet: typeof email.snippet === 'string' ? email.snippet : bodyContent.substring(0, 160),
            date: typeof email.date === 'string' ? email.date : undefined,
          };
        })
        .filter((email: IngestedEmail | null): email is IngestedEmail => email !== null);

      setEmails((previous) => {
        if (!append) return normalizedEmails;

        const merged = new Map(previous.map((email: IngestedEmail) => [email.id, email]));
        normalizedEmails.forEach((email: IngestedEmail) => merged.set(email.id, email));
        return Array.from(merged.values());
      });

      setEmailFetchLimit(nextLimit);

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

  const handleLoadMoreEmails = useCallback(() => {
    fetchInboxEmails(emailFetchLimit + 25, true);
  }, [emailFetchLimit, fetchInboxEmails]);

  const handleRefreshEmails = useCallback(() => {
    setSelectedEmailId(null);
    setEmailFetchLimit(25);
    fetchInboxEmails(25, false);
  }, [fetchInboxEmails]);

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
    return emails.find((e: IngestedEmail) => e.id === selectedEmailId) || emails[0] || null;
  }, [emails, selectedEmailId]);

  // Diagnosis for the currently selected email
  // Detect bank from sender or subject
  // Reset transient AI preview when the selected email changes.
  useEffect(() => {
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
    const bodyContent = selectedEmail.body || selectedEmail.plainBody || selectedEmail.snippet || '';
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

  const testReportCounts = useMemo(() => {
    const reports = diagnosisForSelectedEmail?.reports ?? [];
    let matched = 0;
    for (const report of reports) {
      if (report.level3Passed && report.extractedAmount !== null && report.extractedAmount !== undefined) {
        matched += 1;
      }
    }
    return { matched, failed: reports.length - matched };
  }, [diagnosisForSelectedEmail]);

  // Plantilla activa en el formulario (creación o edición en curso)
  const activeFormTemplate = useMemo<CatalogTemplate>(() => {
    const matchedEnt = form.entityId
      ? entities.find((entity) => entity.id === form.entityId) || null
      : entities.find((entity) => entity.name.trim().toLowerCase() === form.entityLabel.trim().toLowerCase()) || null;

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
    if (!selectedEmail) return null;
    return evaluateTemplateAgainstEmail(activeFormTemplate, selectedEmail, entities);
  }, [activeFormTemplate, selectedEmail, entities]);

  // Copiar mini-prompt de corrección para IA con los fallos exactos detectados
  const handleCopyCorrectionPrompt = useCallback(async () => {
    if (!selectedEmail || !activeFormEvaluation) return;

    const emailToTest = selectedEmail;
    const cleanBody = cleanEmailBody(emailToTest.body || emailToTest.plainBody || emailToTest.snippet || '');
    const promptText = buildCorrectionPrompt(
      emailToTest.sender,
      emailToTest.subject,
      cleanBody,
      {
        template: buildTemplateCorrectionDetails(activeFormTemplate),
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
    setActiveTab('explorer');
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
    setActiveTab('explorer');
    if (!selectedEmail && emails.length > 0) {
      setSelectedEmailId(emails[0].id);
    }
    setEditingTemplateId(null);
    resetForm();
    setIsFormVisible(true);
    setSaveSuccessMessage(null);
    setSaveErrorMessage(null);
    setAiError(null);
    setAiSuccess(null);
    setAiPreviewDiagnosis(null);
  }, [emails, resetForm, selectedEmail]);

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
      selectedEmail?.sender || '',
      selectedEmail?.subject || '',
      cleanEmailBody(selectedEmail?.body || selectedEmail?.plainBody || selectedEmail?.snippet || ''),
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
    const sender = selectedEmail?.sender || '';
    const body = cleanEmailBody(selectedEmail?.body || selectedEmail?.plainBody || selectedEmail?.snippet || '');
    const resolved = resolveEmailEntity({ entities, entityLabel: data.entity_label, requestedPattern: data.entity_email_pattern, sender, body });

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

    if (!selectedEmail) {
      setAiSuccess('JSON cargado correctamente en el formulario.');
      return;
    }

    const evaluation = evaluateTemplateAgainstEmail(candidateTemplate, selectedEmail, entities);
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
      const emailBody = cleanEmailBody(selectedEmail.body || selectedEmail.plainBody || selectedEmail.snippet || '');
      const emailText = `Remitente: ${selectedEmail.sender}\nAsunto: ${selectedEmail.subject}\n\n${emailBody}`;

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
        const resolved = resolveEmailEntity({ entities, entityLabel: s.entity_label, requestedPattern: s.entity_email_pattern, sender: senderForEntity, body: bodyForEntity });
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

      const sender = selectedEmail?.sender || '';
      const body = selectedEmail?.body || selectedEmail?.plainBody || selectedEmail?.snippet || '';
      const resolved = resolveEmailEntity({
        entities,
        entityId: form.entityId,
        entityLabel: form.entityId ? null : form.entityLabel,
        requestedPattern: form.entityEmailPattern,
        sender,
        body,
      });
      const payload = buildTemplateSavePayload(
        form,
        editingTemplateId,
        resolved.entity?.id || null,
        resolved.effectivePattern || null,
      );

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


  const handleDeleteTemplate = async (templateId: string) => {
    if (!confirm('¿Estás seguro de que deseas eliminar esta plantilla?')) return;

    setDeletingId(templateId);
    try {
      const res = await fetch(`/api/email-templates?id=${templateId}`, {
        method: 'DELETE',
        headers: buildAuthHeaders(getStoredGoogleToken()),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Error al eliminar plantilla');
      }

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
    return emails.filter((e: IngestedEmail) => {
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
    <div className="max-w-[1600px] mx-auto space-y-4 px-2 sm:px-0 pb-10">
      <div className="bg-white border border-zinc-200 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
                <Sparkles className="w-4 h-4" />
              </div>
              <h1 className="text-lg sm:text-xl font-bold text-zinc-900 truncate">Plantillas de Notificaciones Bancarias</h1>
            </div>
            <p className="text-xs sm:text-sm text-zinc-500">Revisa correos, identifica la plantilla correcta y crea o corrige reglas de extracción.</p>
          </div>

          <div className="flex items-center gap-2 self-start lg:self-center shrink-0">
            <div className="flex items-center gap-2 bg-zinc-50 border border-zinc-200 px-3 py-1.5 rounded-xl">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-xs font-medium text-zinc-700 max-w-[180px] truncate">{userEmail || 'Cuenta conectada'}</span>
              <button type="button" onClick={handleDisconnect} className="text-[11px] text-zinc-400 hover:text-rose-600 transition underline cursor-pointer">Desconectar</button>
            </div>
            <button
              type="button"
              onClick={handleRefreshEmails}
              disabled={isLoadingEmails}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-zinc-50 text-zinc-700 text-xs font-semibold border border-zinc-200 rounded-xl transition cursor-pointer disabled:opacity-50"
              title="Actualizar correos de Gmail"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingEmails ? 'animate-spin' : ''}`} />
              Actualizar
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 pt-2 border-t border-zinc-100">
          <div className="inline-flex items-center gap-1.5 bg-zinc-100 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setActiveTab('explorer')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${activeTab === 'explorer' ? 'bg-white text-zinc-900 shadow-xs' : 'text-zinc-600 hover:text-zinc-900'}`}
            >
              <Inbox className="w-3.5 h-3.5" />
              <span>Correos</span>
              <span className="px-1.5 py-0.5 rounded-full bg-zinc-200 text-zinc-800 text-[10px] font-bold">{emails.length}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('catalog')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${activeTab === 'catalog' ? 'bg-white text-zinc-900 shadow-xs' : 'text-zinc-600 hover:text-zinc-900'}`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Plantillas</span>
              <span className="px-1.5 py-0.5 rounded-full bg-zinc-200 text-zinc-800 text-[10px] font-bold">{templates.length}</span>
            </button>
          </div>
          <p className="hidden sm:block text-[10px] text-zinc-400">Selecciona un correo para empezar</p>
        </div>
      </div>

      {activeTab === 'explorer' && (
        <div className="grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)] gap-4 items-start">
          <aside className="bg-white border border-zinc-200 rounded-2xl shadow-xs overflow-hidden lg:h-[calc(100vh-230px)] lg:min-h-[560px] flex flex-col lg:sticky lg:top-4">
            <div className="p-3 border-b border-zinc-100 space-y-2.5 shrink-0">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-bold text-zinc-900">Bandeja de correos</p>
                  <p className="text-[10px] text-zinc-400">Asunto y resultado</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCustomEmailModalOpen(true)}
                  className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-[10px] font-bold transition cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                  Ejemplo
                </button>
              </div>
              <div className="relative">
                <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={emailSearchQuery}
                  onChange={(e) => setEmailSearchQuery(e.target.value)}
                  placeholder="Buscar asunto, remitente o texto..."
                  className="w-full pl-9 pr-3 py-2.5 text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-indigo-500/40"
                />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {([
                  ['all', `Todos ${statusCounts.all}`],
                  ['unmatched', `Sin plantilla ${statusCounts.unmatched}`],
                  ['matched', `Coinciden ${statusCounts.matched}`],
                  ['conflict', `Conflictos ${statusCounts.conflict}`],
                ] as const).map(([filter, label]) => {
                  if (filter === 'conflict' && statusCounts.conflict === 0) return null;
                  return (
                    <button
                      key={filter}
                      type="button"
                      onClick={() => setEmailStatusFilter(filter)}
                      className={`px-2.5 py-1.5 rounded-lg text-[10px] font-semibold transition cursor-pointer ${emailStatusFilter === filter
                        ? filter === 'conflict' ? 'bg-amber-600 text-white' : 'bg-zinc-900 text-white'
                        : filter === 'conflict' ? 'bg-amber-50 text-amber-700 hover:bg-amber-100' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                        }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1.5">
              {isLoadingEmails ? (
                <div className="h-full min-h-[240px] flex flex-col items-center justify-center text-center gap-2 p-6">
                  <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
                  <p className="text-xs text-zinc-500">Cargando correos...</p>
                </div>
              ) : filteredEmails.length === 0 ? (
                <div className="h-full min-h-[240px] flex flex-col items-center justify-center text-center gap-2 p-6">
                  <Inbox className="w-7 h-7 text-zinc-300" />
                  <p className="text-xs font-semibold text-zinc-800">No se encontraron correos</p>
                  <p className="text-[10px] text-zinc-500 leading-relaxed">{emailsError || (emails.length === 0 ? 'Carga un ejemplo o actualiza la bandeja.' : 'Prueba otro filtro o término.')}</p>
                </div>
              ) : (
                filteredEmails.map((email: IngestedEmail) => {
                  const isSelected = selectedEmail?.id === email.id;
                  const diag = emailDiagnoses.get(email.id);
                  const survivingCount = diag?.level3?.survivingTemplates?.length ?? 0;
                  const status = survivingCount === 1 ? 'matched' : survivingCount > 1 ? 'conflict' : 'unmatched';
                  const statusText = status === 'matched' ? 'Coincide' : status === 'conflict' ? 'Conflicto' : 'Sin plantilla';
                  const statusDot = status === 'matched' ? 'bg-emerald-500' : status === 'conflict' ? 'bg-amber-500' : 'bg-zinc-300';
                  const statusTone = status === 'matched' ? 'text-emerald-700' : status === 'conflict' ? 'text-amber-700' : 'text-zinc-500';
                  return (
                    <button
                      key={email.id}
                      type="button"
                      onClick={() => { setSelectedEmailId(email.id); setIsFormVisible(false); }}
                      className={`w-full text-left rounded-xl border px-3 py-2.5 transition cursor-pointer ${isSelected ? 'bg-indigo-50 border-indigo-300 shadow-xs' : 'bg-white border-zinc-200 hover:bg-zinc-50/70 hover:border-zinc-300'}`}
                    >
                      <div className="flex items-start gap-2">
                        <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${statusDot}`} />
                        <p className={`text-[11px] font-semibold leading-snug line-clamp-2 min-w-0 ${isSelected ? 'text-indigo-950' : 'text-zinc-800'}`}>
                          {email.subject || '(Sin asunto)'}
                        </p>
                      </div>
                      <div className="mt-1.5 pl-3.5 flex items-center justify-between gap-2">
                        <span className={`text-[10px] font-semibold ${statusTone}`}>{statusText}</span>
                        {email.date && <span className="text-[9px] text-zinc-400 shrink-0">{new Date(email.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>}
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            <div className="border-t border-zinc-100 p-2 shrink-0 bg-zinc-50/70 space-y-1.5">
              <button
                type="button"
                onClick={handleLoadMoreEmails}
                disabled={isLoadingEmails}
                className="w-full inline-flex items-center justify-center gap-2 px-3 py-2.5 bg-white border border-zinc-200 rounded-xl text-xs font-semibold text-zinc-700 hover:bg-zinc-50 transition cursor-pointer disabled:opacity-50"
                title="Recuperar más correos de Gmail"
              >
                {isLoadingEmails ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                {isLoadingEmails ? 'Cargando...' : 'Cargar más correos'}
              </button>
              <button type="button" onClick={handleRefreshEmails} disabled={isLoadingEmails} className="w-full inline-flex items-center justify-center gap-2 py-1.5 text-[10px] font-semibold text-zinc-500 hover:text-zinc-800 transition cursor-pointer disabled:opacity-50">
                <RefreshCw className={`w-3 h-3 ${isLoadingEmails ? 'animate-spin' : ''}`} />
                Actualizar bandeja
              </button>
            </div>
          </aside>

          <main className="min-w-0 bg-white border border-zinc-200 rounded-2xl shadow-xs">
            {!selectedEmail ? (
              <div className="min-h-[520px] flex items-center justify-center text-center p-10">
                <div className="max-w-md space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center mx-auto text-indigo-600"><Inbox className="w-6 h-6" /></div>
                  <h3 className="text-sm font-bold text-zinc-900">Selecciona un correo</h3>
                  <p className="text-xs text-zinc-500 leading-relaxed">El resultado de matching y las acciones para crear o corregir la plantilla aparecerán aquí.</p>
                </div>
              </div>
            ) : isFormVisible ? (
              <div>
                <div className="px-4 sm:px-5 py-3 border-b border-zinc-100 flex items-center justify-between gap-3 bg-white">
                  <div className="min-w-0 flex items-center gap-2.5">
                    <button type="button" onClick={() => setIsFormVisible(false)} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-lg text-[10px] font-bold transition cursor-pointer shrink-0">
                      <ChevronRight className="w-3 h-3 rotate-180" />
                      Correo
                    </button>
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">Editor de plantilla</p>
                      <p className="text-sm font-bold text-zinc-900 truncate">{form.name || (editingTemplateId ? 'Plantilla guardada' : 'Nueva plantilla')}</p>
                      <p className="text-[10px] text-zinc-400 truncate">{selectedEmail.subject || '(Sin asunto)'}</p>
                    </div>
                  </div>
                  <span className="hidden sm:inline-flex text-[10px] text-zinc-400 shrink-0">Los cambios se prueban contra el correo seleccionado</span>
                </div>

                <form onSubmit={handleSaveExplorerTemplate} className="p-4 sm:p-5 space-y-3.5">
                  {(aiSuccess || aiError || saveSuccessMessage || saveErrorMessage) && (
                    <div className="space-y-2">
                      {aiSuccess && <div className="p-2.5 rounded-xl border border-emerald-200 bg-emerald-50 text-xs text-emerald-800 flex items-start gap-2"><CheckCircle2 className="w-3.5 h-3.5 mt-0.5 text-emerald-600 shrink-0" /><span>{aiSuccess}</span></div>}
                      {aiError && <div className="p-2.5 rounded-xl border border-rose-200 bg-rose-50 text-xs text-rose-800 flex items-start gap-2"><AlertCircle className="w-3.5 h-3.5 mt-0.5 text-rose-600 shrink-0" /><span className="whitespace-pre-line">{aiError}</span></div>}
                      {saveSuccessMessage && <div className="p-2.5 rounded-xl border border-emerald-200 bg-emerald-50 text-xs text-emerald-800 flex items-start gap-2"><CheckCircle2 className="w-3.5 h-3.5 mt-0.5 text-emerald-600 shrink-0" /><span>{saveSuccessMessage}</span></div>}
                      {saveErrorMessage && <div className="p-2.5 rounded-xl border border-rose-200 bg-rose-50 text-xs text-rose-800 flex items-start gap-2"><AlertCircle className="w-3.5 h-3.5 mt-0.5 text-rose-600 shrink-0" /><span>{saveErrorMessage}</span></div>}
                    </div>
                  )}

                  <section className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-3.5">
                    <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">Asistencia IA</p>
                        <p className="text-xs font-semibold text-zinc-900">Genera una plantilla o corrige la actual</p>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <button type="button" onClick={handleCopyPrompt} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold transition cursor-pointer">{copiedPrompt ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}{copiedPrompt ? 'Copiado' : 'Copiar prompt'}</button>
                        <button type="button" onClick={handleDirectAISuggest} disabled={isAISuggestingDirect} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white border border-zinc-200 hover:bg-zinc-50 text-zinc-700 text-[10px] font-bold transition cursor-pointer disabled:opacity-50">{isAISuggestingDirect ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3 text-amber-500" />}Generar directo</button>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-col sm:flex-row gap-2">
                      <input type="text" value={pastedAIResponse} onChange={(e) => setPastedAIResponse(e.target.value)} placeholder="Pega aquí el JSON devuelto por la IA" className="flex-1 min-w-0 px-3 py-2 rounded-xl border border-zinc-200 bg-white text-[11px] font-mono focus:outline-hidden focus:ring-1 focus:ring-indigo-500/40" />
                      <button type="button" onClick={handleApplyPastedAIResponse} className="px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-[10px] font-bold cursor-pointer">Cargar JSON</button>
                    </div>
                  </section>

                  <section className="rounded-2xl border border-zinc-200 bg-white p-3.5 sm:p-4 space-y-3">
                    <div className="flex items-center gap-2"><span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Identificación y clasificación</span><div className="h-px flex-1 bg-zinc-100" /></div>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                      <div className="xl:col-span-2 space-y-1"><label htmlFor="email-template-field-16" className="text-xs font-bold text-zinc-700">Nombre *</label><input id="email-template-field-16" required value={form.name} onChange={(e) => setFormField('name', e.target.value)} className="w-full px-3 py-2.5 text-xs bg-zinc-50 border border-zinc-200 rounded-xl" /></div>
                      <div className="xl:col-span-2 space-y-1"><label htmlFor="email-template-field-17" className="text-xs font-bold text-zinc-700">Banco / Entidad</label><input id="email-template-field-17" list="entity-suggestions" value={form.entityLabel} onChange={(e) => { const val = e.target.value; setFormField('entityLabel', val); const match = entities.find((ent) => ent.name.toLowerCase() === val.toLowerCase()); setFormField('entityId', match?.id || null); setFormField('isNewEntity', !match); }} className="w-full px-3 py-2.5 text-xs bg-zinc-50 border border-zinc-200 rounded-xl" /><datalist id="entity-suggestions">{entities.map((ent) => <option key={ent.id} value={ent.name} />)}</datalist></div>
                      <div className="xl:col-span-2 space-y-1"><label htmlFor="email-template-field-18" className="text-xs font-bold text-zinc-700">Patrón de asunto</label><input id="email-template-field-18" value={form.subjectPattern} onChange={(e) => setFormField('subjectPattern', e.target.value)} className="w-full px-3 py-2.5 text-xs bg-zinc-50 border border-zinc-200 rounded-xl font-mono" /></div>
                      <div className="xl:col-span-2 space-y-1"><label htmlFor="email-template-field-19" className="text-xs font-bold text-zinc-700">Desempate en cuerpo</label><input id="email-template-field-19" value={form.matchPattern} onChange={(e) => setFormField('matchPattern', e.target.value)} className="w-full px-3 py-2.5 text-xs bg-zinc-50 border border-zinc-200 rounded-xl font-mono" /></div>
                    </div>
                  </section>

                  <section className="rounded-2xl border border-zinc-200 bg-white p-3.5 sm:p-4 space-y-3">
                    <div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Reglas de extracción</p><p className="text-[10px] text-zinc-400 mt-0.5">Patrones aplicados sobre el cuerpo limpio.</p></div><span className="text-[10px] font-semibold text-zinc-400">Monto obligatorio</span></div>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                      <div className="space-y-1"><label htmlFor="email-template-field-20" className="text-xs font-bold text-zinc-700">Monto *</label><input id="email-template-field-20" required value={form.amountRegex} onChange={(e) => setFormField('amountRegex', e.target.value)} className="w-full px-3 py-2.5 text-xs bg-zinc-50 border border-zinc-200 rounded-xl font-mono" /></div>
                      <div className="space-y-1"><label htmlFor="email-template-field-21" className="text-xs font-bold text-zinc-700">Comercio</label><input id="email-template-field-21" value={form.merchantRegex} onChange={(e) => setFormField('merchantRegex', e.target.value)} className="w-full px-3 py-2.5 text-xs bg-zinc-50 border border-zinc-200 rounded-xl font-mono" /></div>
                      <div className="space-y-1"><label htmlFor="email-template-field-22" className="text-xs font-bold text-zinc-700">Cuenta / Tarjeta</label><input id="email-template-field-22" value={form.sourceAccountRegex} onChange={(e) => setFormField('sourceAccountRegex', e.target.value)} className="w-full px-3 py-2.5 text-xs bg-zinc-50 border border-zinc-200 rounded-xl font-mono" /></div>
                      <div className="space-y-1"><label htmlFor="email-template-field-23" className="text-xs font-bold text-zinc-700">Moneda</label><input id="email-template-field-23" value={form.currencyRegex} onChange={(e) => setFormField('currencyRegex', e.target.value)} className="w-full px-3 py-2.5 text-xs bg-zinc-50 border border-zinc-200 rounded-xl font-mono" /></div>
                      <div className="space-y-1"><label htmlFor="email-template-field-24" className="text-xs font-bold text-zinc-700">Fecha</label><input id="email-template-field-24" value={form.dateRegex} onChange={(e) => setFormField('dateRegex', e.target.value)} className="w-full px-3 py-2.5 text-xs bg-zinc-50 border border-zinc-200 rounded-xl font-mono" /></div>
                      <div className="space-y-1"><label htmlFor="email-template-field-25" className="text-xs font-bold text-zinc-700">Hora</label><input id="email-template-field-25" value={form.timeRegex} onChange={(e) => setFormField('timeRegex', e.target.value)} className="w-full px-3 py-2.5 text-xs bg-zinc-50 border border-zinc-200 rounded-xl font-mono" /></div>
                      <div className="space-y-1"><label htmlFor="email-template-field-26" className="text-xs font-bold text-zinc-700">Patrón de correo de entidad</label><input id="email-template-field-26" value={form.entityEmailPattern} onChange={(e) => setFormField('entityEmailPattern', e.target.value)} className="w-full px-3 py-2.5 text-xs bg-zinc-50 border border-zinc-200 rounded-xl font-mono" /></div>
                      <div className="space-y-1"><label htmlFor="email-template-field-27" className="text-xs font-bold text-zinc-700">Tipo de gasto</label><input id="email-template-field-27" value={form.expenseType} onChange={(e) => setFormField('expenseType', e.target.value)} className="w-full px-3 py-2.5 text-xs bg-zinc-50 border border-zinc-200 rounded-xl" /></div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                      <div className="space-y-1"><label htmlFor="email-template-field-28" className="text-xs font-bold text-zinc-700">Formato de fecha</label><input id="email-template-field-28" list="date-format-suggestions" value={form.dateFormat} onChange={(e) => setFormField('dateFormat', e.target.value)} className="w-full px-3 py-2.5 text-xs bg-zinc-50 border border-zinc-200 rounded-xl font-mono" /><datalist id="date-format-suggestions"><option value="DD/MM/YYYY" /><option value="YYYY-MM-DD" /><option value="YYYY/MM/DD" /><option value="MM/DD/YYYY" /></datalist></div>
                      <div className="space-y-1"><label htmlFor="email-template-field-29" className="text-xs font-bold text-zinc-700">Formato de hora</label><input id="email-template-field-29" list="time-format-suggestions" value={form.timeFormat} onChange={(e) => setFormField('timeFormat', e.target.value)} className="w-full px-3 py-2.5 text-xs bg-zinc-50 border border-zinc-200 rounded-xl font-mono" /><datalist id="time-format-suggestions"><option value="HH:mm:ss" /><option value="HH:mm" /><option value="HH:mm a" /></datalist></div>
                      <div className="space-y-1"><label htmlFor="email-template-field-30" className="text-xs font-bold text-zinc-700">ID de entidad</label><input id="email-template-field-30" readOnly value={form.entityId || ''} className="w-full px-3 py-2.5 text-xs bg-zinc-100 border border-zinc-200 rounded-xl font-mono text-zinc-500" /></div>
                      <div className="space-y-1"><label htmlFor="email-template-field-31" className="text-xs font-bold text-zinc-700">Entidad nueva</label><input id="email-template-field-31" readOnly value={form.isNewEntity ? 'Sí' : 'No'} className="w-full px-3 py-2.5 text-xs bg-zinc-100 border border-zinc-200 rounded-xl text-zinc-500" /></div>
                    </div>
                  </section>

                  {activeFormEvaluation && (
                    <section className={`rounded-2xl border overflow-hidden ${activeFormEvaluation.overallPassed ? 'border-emerald-200 bg-emerald-50/30' : 'border-zinc-200 bg-zinc-50/50'}`}>
                      <div className="px-4 py-3 border-b border-zinc-200/70 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Prueba en vivo</p>
                          <p className="text-xs font-semibold text-zinc-800">{activeFormEvaluation.overallPassed ? 'La plantilla coincide con el correo' : 'Revisa los puntos que impiden la coincidencia'}</p>
                        </div>
                        <button type="button" onClick={handleCopyCorrectionPrompt} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white border border-zinc-200 text-indigo-700 text-[10px] font-bold cursor-pointer self-start sm:self-auto">{copiedCorrectionPrompt ? <Check className="w-3 h-3" /> : <Sparkles className="w-3 h-3 text-amber-500" />}{copiedCorrectionPrompt ? 'Copiado' : 'Mini-prompt IA'}</button>
                      </div>
                      <div className="p-3 sm:p-4"><TemplateDiagnosticStepsView evaluation={activeFormEvaluation} isWinner={activeFormEvaluation.overallPassed} customTitle={form.name || 'Plantilla en edición'} /></div>
                    </section>
                  )}

                  <div className="flex items-center justify-between gap-3 pt-1">
                    <button type="button" onClick={() => setIsFormVisible(false)} className="px-3.5 py-2 rounded-xl border border-zinc-200 bg-white text-xs font-bold text-zinc-700 hover:bg-zinc-50 cursor-pointer">Cancelar</button>
                    <button type="submit" disabled={isSaving} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold cursor-pointer disabled:opacity-50">{isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4 text-emerald-400" />}{editingTemplateId ? 'Actualizar plantilla' : 'Guardar plantilla'}</button>
                  </div>
                </form>
              </div>
            ) : (
              <div className="p-4 sm:p-5 space-y-4">
                <section className="rounded-2xl border border-zinc-200 bg-white px-4 py-3">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-zinc-100 flex items-center justify-center text-zinc-500 shrink-0"><Mail className="w-4 h-4" /></div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h2 className="text-sm font-bold text-zinc-900 truncate">{selectedEmail.subject || '(Sin asunto)'}</h2>
                          <DiagnosisSummaryBadge matchedCount={testReportCounts.matched} winner={diagnosisForSelectedEmail?.winner} />
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-[10px] text-zinc-400 min-w-0">
                          <span className="truncate">{selectedEmail.sender || '(Sin remitente)'}</span>
                          {selectedEmail.date && <span className="shrink-0">{new Date(selectedEmail.date).toLocaleString()}</span>}
                        </div>
                      </div>
                    </div>
                    <button type="button" onClick={() => setIsEmailBodyModalOpen(true)} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-zinc-50 border border-zinc-200 hover:bg-zinc-100 text-zinc-700 text-[10px] font-bold cursor-pointer shrink-0">
                      <ExternalLink className="w-3 h-3" />
                      Ver contenido
                    </button>
                  </div>
                </section>

                <section className="rounded-2xl border border-zinc-200 overflow-hidden">
                  <div className="px-4 py-3 bg-white border-b border-zinc-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${testReportCounts.matched === 1 ? 'bg-emerald-50 text-emerald-600' : testReportCounts.matched > 1 ? 'bg-amber-50 text-amber-600' : 'bg-zinc-100 text-zinc-500'}`}>
                          <Layers className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-zinc-900">Prueba de plantillas</p>
                          <p className="text-[10px] text-zinc-400">{testReportCounts.matched} coinciden · {testReportCounts.failed} no pasan · {diagnosisForSelectedEmail?.reports?.length || 0} evaluadas</p>
                        </div>
                      </div>
                    </div>
                    {testReportCounts.matched === 0 && (
                      <button type="button" onClick={handleOpenEmptyForm} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold transition cursor-pointer shrink-0">
                        <Plus className="w-3 h-3" />
                        Crear plantilla
                      </button>
                    )}
                  </div>

                  {testReportCounts.matched > 0 ? (
                    <div className="p-3 sm:p-4 space-y-3 bg-zinc-50/50">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Plantilla(s) que coinciden</p>
                        {testReportCounts.matched === 1 && diagnosisForSelectedEmail?.winner && (
                          <span className="text-[10px] font-semibold text-emerald-700">Resultado listo</span>
                        )}
                      </div>
                      {diagnosisForSelectedEmail?.reports.filter((report) => report.level3Passed && report.extractedAmount !== null && report.extractedAmount !== undefined).map((report) => (
                        <TemplateDiagnosticStepsView
                          key={report.template.id}
                          evaluation={report.evaluation || evaluateTemplateAgainstEmail(report.template, selectedEmail, entities)}
                          isWinner={report.isWinner}
                          onAction={() => handleLoadTemplateIntoForm(report.template)}
                          actionLabel={report.isWinner ? 'Editar plantilla' : 'Cargar'}
                          onCopyCorrectionPrompt={() => handleCopyCorrectionPromptForReport(report)}
                          copiedPrompt={copiedReportPromptId === report.template.id}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 sm:p-5 bg-zinc-50/60">
                      <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-4 sm:p-5">
                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-zinc-900">Este correo no tiene una plantilla que lo procese.</p>
                            <p className="text-[11px] text-zinc-500 mt-1 max-w-2xl">Desde aquí puedes generar la plantilla directamente o copiar el prompt para trabajar con la IA. No necesitas ir a otra pantalla para comenzar.</p>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap shrink-0">
                            <button type="button" onClick={handleDirectAISuggest} disabled={isAISuggestingDirect} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold cursor-pointer disabled:opacity-50">{isAISuggestingDirect ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}Generar directo</button>
                            <button type="button" onClick={handleCopyPrompt} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white hover:bg-zinc-50 border border-zinc-200 text-zinc-700 text-[10px] font-bold cursor-pointer">{copiedPrompt ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}{copiedPrompt ? 'Prompt copiado' : 'Copiar prompt'}</button>
                          </div>
                        </div>
                        <div className="mt-3 pt-3 border-t border-zinc-100 flex flex-col sm:flex-row gap-2">
                          <input type="text" value={pastedAIResponse} onChange={(e) => setPastedAIResponse(e.target.value)} placeholder="¿Ya tienes el JSON de la IA? Pégalo aquí" className="flex-1 min-w-0 px-3 py-2 rounded-xl border border-zinc-200 bg-zinc-50 text-[11px] font-mono focus:outline-hidden focus:ring-1 focus:ring-indigo-500/40" />
                          <button type="button" onClick={handleApplyPastedAIResponse} className="px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-[10px] font-bold cursor-pointer">Cargar JSON</button>
                        </div>
                      </div>
                    </div>
                  )}

                  {testReportCounts.failed > 0 && (
                    <details className="border-t border-zinc-200 bg-white group">
                      <summary className="list-none cursor-pointer px-4 py-3 flex items-center justify-between gap-3 hover:bg-zinc-50 transition [&::-webkit-details-marker]:hidden">
                        <div>
                          <p className="text-xs font-semibold text-zinc-800">Ver evaluaciones que no pasaron</p>
                          <p className="text-[10px] text-zinc-400">Incluye fallos de entidad, asunto, desempate y extracción.</p>
                        </div>
                        <ChevronDown className="w-4 h-4 text-zinc-400 transition-transform group-open:rotate-180" />
                      </summary>
                      <div className="border-t border-zinc-100 p-3 sm:p-4 space-y-3 bg-zinc-50/40">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            {(['all', 'matched', 'failed'] as const).map((filter) => (
                              <button key={filter} type="button" onClick={() => setTestResultViewFilter(filter)} className={`px-2.5 py-1.5 rounded-lg text-[10px] font-semibold transition cursor-pointer ${testResultViewFilter === filter ? 'bg-zinc-900 text-white' : 'bg-white border border-zinc-200 text-zinc-600 hover:bg-zinc-100'}`}>
                                {filter === 'all' ? `Todas (${diagnosisForSelectedEmail?.reports?.length || 0})` : filter === 'matched' ? `Coinciden (${testReportCounts.matched})` : `Fallan (${testReportCounts.failed})`}
                              </button>
                            ))}
                          </div>
                          <select value={templateTestFilter} onChange={(e) => setTemplateTestFilter(e.target.value)} className="text-[10px] bg-white border border-zinc-200 rounded-lg px-2.5 py-1.5 font-semibold text-zinc-700 focus:outline-hidden">
                            <option value="all">Todas las plantillas ({templates.length})</option>
                            {Array.from(new Set(templates.map((t) => entities.find((e) => e.id === t.entity_id)?.name).filter(Boolean))).map((ent) => <option key={ent} value={ent as string}>{String(ent)}</option>)}
                          </select>
                        </div>
                        <div className="space-y-2">
                          {filteredTestReports.filter((report) => !(report.level3Passed && report.extractedAmount !== null && report.extractedAmount !== undefined)).length === 0 ? (
                            <div className="p-5 text-center text-xs text-zinc-500 bg-white rounded-xl border border-dashed border-zinc-200">No hay evaluaciones fallidas para este filtro.</div>
                          ) : (
                            filteredTestReports.filter((report) => !(report.level3Passed && report.extractedAmount !== null && report.extractedAmount !== undefined)).map((report) => (
                              <TemplateDiagnosticStepsView
                                key={report.template.id}
                                evaluation={report.evaluation || evaluateTemplateAgainstEmail(report.template, selectedEmail, entities)}
                                isWinner={false}
                                onAction={() => handleLoadTemplateIntoForm(report.template)}
                                actionLabel="Cargar"
                                onCopyCorrectionPrompt={() => handleCopyCorrectionPromptForReport(report)}
                                copiedPrompt={copiedReportPromptId === report.template.id}
                              />
                            ))
                          )}
                        </div>
                      </div>
                    </details>
                  )}
                </section>
              </div>
            )}
          </main>
        </div>
      )}

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
          onOpenNew={handleOpenEmptyForm}
          onEdit={handleLoadTemplateIntoForm}
          onDelete={handleDeleteTemplate}
        />
      )}

      {isEmailBodyModalOpen && selectedEmail && (
        <EmailBodyModal
          subject={selectedEmail.subject}
          sender={selectedEmail.sender}
          date={selectedEmail.date}
          body={diagnosisForSelectedEmail?.cleanedBody || ''}
          onClose={() => setIsEmailBodyModalOpen(false)}
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
