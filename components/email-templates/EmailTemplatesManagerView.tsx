'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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
  ArrowLeft,
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

interface TemplateDiagnosticStepsViewProps {
  evaluation: SingleTemplateEvaluation;
  isWinner?: boolean;
  onAction?: () => void;
  actionLabel?: string;
  onCopyCorrectionPrompt?: () => void;
  copiedPrompt?: boolean;
  customTitle?: string;
}

function TemplateDiagnosticStepsView({
  evaluation,
  isWinner,
  onAction,
  actionLabel,
  onCopyCorrectionPrompt,
  copiedPrompt,
  customTitle,
}: TemplateDiagnosticStepsViewProps) {
  const tmpl = evaluation.template;
  const isPassing = evaluation.overallPassed;

  return (
    <div
      className={`rounded-xl border text-xs overflow-hidden transition ${
        isPassing
          ? 'bg-emerald-50/40 border-emerald-200 shadow-2xs'
          : 'bg-zinc-50/80 border-zinc-200'
      }`}
    >
      {/* Cabecera */}
      <div className="p-3 flex items-start justify-between gap-2 border-b border-zinc-200/60 bg-white/60">
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          <span className="font-bold text-zinc-900 truncate">
            {customTitle || tmpl.name || 'Plantilla'}
          </span>
          {tmpl.entity?.name && (
            <span className="text-[10px] font-semibold text-zinc-600 bg-zinc-200/70 px-1.5 py-0.5 rounded">
              {tmpl.entity.name}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
          {isPassing ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-100/90 px-2 py-0.5 rounded-full border border-emerald-300">
              <Check className="w-3 h-3 text-emerald-600" />
              <span>{isWinner ? 'Ganadora / Coincide' : 'Coincide'}</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-700 bg-rose-100/90 px-2 py-0.5 rounded-full border border-rose-300">
              <X className="w-3 h-3 text-rose-600" />
              <span>No coincide</span>
            </span>
          )}

          {onCopyCorrectionPrompt && (
            <button
              type="button"
              onClick={onCopyCorrectionPrompt}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer border ${
                copiedPrompt
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-white hover:bg-zinc-50 text-indigo-700 border-indigo-200 hover:border-indigo-300'
              }`}
              title="Copiar mini-prompt para que la IA corrija esta plantilla"
            >
              {copiedPrompt ? (
                <>
                  <Check className="w-3 h-3 text-white" />
                  <span>¡Copiado!</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3 h-3 text-amber-500" />
                  <span>Mini-prompt IA</span>
                </>
              )}
            </button>
          )}

          {onAction && actionLabel && (
            <button
              type="button"
              onClick={onAction}
              className="text-[11px] font-bold text-zinc-700 hover:text-zinc-900 bg-white border border-zinc-200 hover:border-zinc-300 px-2.5 py-1 rounded-lg transition cursor-pointer"
            >
              {actionLabel}
            </button>
          )}
        </div>
      </div>

      {/* Fallos bloqueantes si no coincide */}
      {evaluation.criticalFailures.length > 0 && (
        <div className="p-3 pb-2">
          <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-[11px] text-rose-800 space-y-1">
            <span className="font-bold flex items-center gap-1 text-rose-900">
              <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
              Motivo(s) por los que no coincide:
            </span>
            <ul className="list-disc list-inside space-y-0.5 text-rose-800/90 pl-1">
              {evaluation.criticalFailures.map((reason, idx) => (
                <li key={idx} className="leading-snug">{reason}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Avisos en campos opcionales */}
      {evaluation.warnings.length > 0 && (
        <div className="p-3 pb-2 pt-1">
          <div className="rounded-lg bg-amber-50/80 border border-amber-200 px-3 py-1.5 text-[11px] text-amber-900 space-y-0.5">
            <span className="font-bold flex items-center gap-1 text-amber-800">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              Avisos de extracción:
            </span>
            <ul className="list-disc list-inside space-y-0.5 text-amber-800/90 pl-1">
              {evaluation.warnings.map((warn, idx) => (
                <li key={idx} className="leading-snug">{warn}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Desglose paso a paso de TODOS los filtros y extracciones */}
      <div className="p-3 space-y-1.5">
        {/* Paso 1: Entidad */}
        <div className={`flex items-center gap-1.5 text-[11px] ${evaluation.level1.passed ? 'text-zinc-700' : 'text-rose-700'}`}>
          {evaluation.level1.passed ? (
            <Check className="w-3 h-3 text-emerald-600 shrink-0" />
          ) : (
            <X className="w-3 h-3 text-rose-500 shrink-0" />
          )}
          <span className="font-semibold shrink-0">1. Entidad</span>
          <code className="bg-white/80 border border-zinc-200 rounded px-1.5 py-0.5 font-mono truncate max-w-[200px] sm:max-w-xs">
            {evaluation.level1.matchedPattern ? `/${evaluation.level1.matchedPattern}/i` : tmpl.entity?.name || 'sin patrón'}
          </code>
          {evaluation.level1.matchedOn && (
            <span className="text-[10px] text-zinc-500 shrink-0">
              ({evaluation.level1.matchedOn === 'sender' ? 'en remitente' : 'en cuerpo'})
            </span>
          )}
        </div>

        {/* Paso 2: Asunto */}
        <div className={`flex items-center gap-1.5 text-[11px] ${evaluation.level2.passed ? 'text-zinc-700' : 'text-rose-700'}`}>
          {evaluation.level2.passed ? (
            <Check className="w-3 h-3 text-emerald-600 shrink-0" />
          ) : (
            <X className="w-3 h-3 text-rose-500 shrink-0" />
          )}
          <span className="font-semibold shrink-0">2. Asunto</span>
          <code className="bg-white/80 border border-zinc-200 rounded px-1.5 py-0.5 font-mono truncate max-w-[200px] sm:max-w-xs">
            {tmpl.subject_pattern ? `/${tmpl.subject_pattern}/i` : 'sin filtro de asunto'}
          </code>
        </div>

        {/* Paso 3: Desempate */}
        <div className={`flex items-center gap-1.5 text-[11px] ${evaluation.level3.passed ? 'text-zinc-700' : 'text-rose-700'}`}>
          {evaluation.level3.passed ? (
            <Check className="w-3 h-3 text-emerald-600 shrink-0" />
          ) : (
            <X className="w-3 h-3 text-rose-500 shrink-0" />
          )}
          <span className="font-semibold shrink-0">3. Desempate</span>
          <code className="bg-white/80 border border-zinc-200 rounded px-1.5 py-0.5 font-mono truncate max-w-[200px] sm:max-w-xs">
            {tmpl.match_pattern ? `/${tmpl.match_pattern}/i` : 'no requerido'}
          </code>
        </div>

        {/* 4. Extracción de Monto (Obligatorio) */}
        {tmpl.amount_regex && (
          <div className={`flex items-center gap-1.5 text-[11px] ${evaluation.level4.fields.amount.success ? 'text-zinc-700' : 'text-rose-700'}`}>
            {evaluation.level4.fields.amount.success ? (
              <Check className="w-3 h-3 text-emerald-600 shrink-0" />
            ) : (
              <X className="w-3 h-3 text-rose-500 shrink-0" />
            )}
            <span className="font-semibold shrink-0">4. Monto</span>
            <code className="bg-white/80 border border-zinc-200 rounded px-1.5 py-0.5 font-mono truncate max-w-[180px] sm:max-w-xs">
              /{tmpl.amount_regex}/i
            </code>
            <span className="text-zinc-400 shrink-0">→</span>
            {evaluation.level4.fields.amount.success ? (
              <span className="font-bold text-emerald-800 bg-emerald-100/90 px-2 py-0.5 rounded border border-emerald-200 shrink-0">
                ${formatCurrency(evaluation.level4.extractedAmount)}
              </span>
            ) : (
              <span className="font-semibold text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-200 shrink-0">
                sin captura
              </span>
            )}
            {!evaluation.level4.fields.amount.hasCaptureGroup && evaluation.level4.fields.amount.success && (
              <span className="text-[10px] text-amber-700 font-medium shrink-0" title="Usa paréntesis (...) para capturar exactamente el valor">
                (sin grupo (...))
              </span>
            )}
          </div>
        )}

        {/* Comercio */}
        {tmpl.merchant_regex && (
          <div className={`flex items-center gap-1.5 text-[11px] ${evaluation.level4.fields.merchant.success ? 'text-zinc-700' : 'text-zinc-500'}`}>
            {evaluation.level4.fields.merchant.success ? (
              <Check className="w-3 h-3 text-emerald-600 shrink-0" />
            ) : (
              <X className="w-3 h-3 text-zinc-400 shrink-0" />
            )}
            <span className="font-semibold shrink-0">Comercio</span>
            <code className="bg-white/80 border border-zinc-200 rounded px-1.5 py-0.5 font-mono truncate max-w-[180px] sm:max-w-xs">
              /{tmpl.merchant_regex}/i
            </code>
            <span className="text-zinc-400 shrink-0">→</span>
            {evaluation.level4.fields.merchant.success ? (
              <span className="font-bold text-zinc-900 bg-white border border-zinc-200 px-2 py-0.5 rounded truncate max-w-[200px]">
                {evaluation.level4.fields.merchant.rawExtracted}
              </span>
            ) : (
              <span className="text-zinc-400">sin captura</span>
            )}
            {!evaluation.level4.fields.merchant.hasCaptureGroup && evaluation.level4.fields.merchant.success && (
              <span className="text-[10px] text-amber-700 font-medium shrink-0">
                (sin grupo (...))
              </span>
            )}
          </div>
        )}

        {/* Cuenta */}
        {tmpl.source_account_regex && (
          <div className={`flex items-center gap-1.5 text-[11px] ${evaluation.level4.fields.source_account.success ? 'text-zinc-700' : 'text-zinc-500'}`}>
            {evaluation.level4.fields.source_account.success ? (
              <Check className="w-3 h-3 text-emerald-600 shrink-0" />
            ) : (
              <X className="w-3 h-3 text-zinc-400 shrink-0" />
            )}
            <span className="font-semibold shrink-0">Cuenta</span>
            <code className="bg-white/80 border border-zinc-200 rounded px-1.5 py-0.5 font-mono truncate max-w-[180px] sm:max-w-xs">
              /{tmpl.source_account_regex}/i
            </code>
            <span className="text-zinc-400 shrink-0">→</span>
            {evaluation.level4.fields.source_account.success ? (
              <span className="font-bold text-zinc-900 bg-white border border-zinc-200 px-2 py-0.5 rounded truncate max-w-[200px]">
                {evaluation.level4.fields.source_account.rawExtracted}
              </span>
            ) : (
              <span className="text-zinc-400">sin captura</span>
            )}
            {!evaluation.level4.fields.source_account.hasCaptureGroup && evaluation.level4.fields.source_account.success && (
              <span className="text-[10px] text-amber-700 font-medium shrink-0">
                (sin grupo (...))
              </span>
            )}
          </div>
        )}

        {/* Fecha */}
        {tmpl.date_regex && (
          <div className={`flex items-center gap-1.5 text-[11px] ${evaluation.level4.fields.date.success ? 'text-zinc-700' : 'text-zinc-500'}`}>
            {evaluation.level4.fields.date.success ? (
              <Check className="w-3 h-3 text-emerald-600 shrink-0" />
            ) : (
              <X className="w-3 h-3 text-zinc-400 shrink-0" />
            )}
            <span className="font-semibold shrink-0">Fecha</span>
            <code className="bg-white/80 border border-zinc-200 rounded px-1.5 py-0.5 font-mono truncate max-w-[180px] sm:max-w-xs">
              /{tmpl.date_regex}/i
            </code>
            <span className="text-zinc-400 shrink-0">→</span>
            {evaluation.level4.fields.date.success ? (
              <span className="font-bold text-zinc-900 bg-white border border-zinc-200 px-2 py-0.5 rounded truncate max-w-[200px]">
                {evaluation.level4.fields.date.rawExtracted}
              </span>
            ) : (
              <span className="text-zinc-400">sin captura</span>
            )}
            {!evaluation.level4.fields.date.hasCaptureGroup && evaluation.level4.fields.date.success && (
              <span className="text-[10px] text-amber-700 font-medium shrink-0">
                (sin grupo (...))
              </span>
            )}
          </div>
        )}

        {/* Hora */}
        {tmpl.time_regex && (
          <div className={`flex items-center gap-1.5 text-[11px] ${evaluation.level4.fields.time.success ? 'text-zinc-700' : 'text-zinc-500'}`}>
            {evaluation.level4.fields.time.success ? (
              <Check className="w-3 h-3 text-emerald-600 shrink-0" />
            ) : (
              <X className="w-3 h-3 text-zinc-400 shrink-0" />
            )}
            <span className="font-semibold shrink-0">Hora</span>
            <code className="bg-white/80 border border-zinc-200 rounded px-1.5 py-0.5 font-mono truncate max-w-[180px] sm:max-w-xs">
              /{tmpl.time_regex}/i
            </code>
            <span className="text-zinc-400 shrink-0">→</span>
            {evaluation.level4.fields.time.success ? (
              <span className="font-bold text-zinc-900 bg-white border border-zinc-200 px-2 py-0.5 rounded truncate max-w-[200px]">
                {evaluation.level4.fields.time.rawExtracted}
              </span>
            ) : (
              <span className="text-zinc-400">sin captura</span>
            )}
            {!evaluation.level4.fields.time.hasCaptureGroup && evaluation.level4.fields.time.success && (
              <span className="text-[10px] text-amber-700 font-medium shrink-0">
                (sin grupo (...))
              </span>
            )}
          </div>
        )}

        {/* Moneda */}
        <div className="flex items-center gap-1.5 text-[11px] text-zinc-700">
          <Check className="w-3 h-3 text-emerald-600 shrink-0" />
          <span className="font-semibold shrink-0">Moneda</span>
          <code className="bg-white/80 border border-zinc-200 rounded px-1.5 py-0.5 font-mono truncate max-w-[180px] sm:max-w-xs">
            {tmpl.currency_regex ? `/${tmpl.currency_regex}/i` : 'por defecto'}
          </code>
          <span className="text-zinc-400 shrink-0">→</span>
          <span className="font-bold text-zinc-800 bg-white border border-zinc-200 px-2 py-0.5 rounded">
            {evaluation.level4.fields.currency.rawExtracted || '—'}
          </span>
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

export function EmailTemplatesManagerView({
  initialMode = 'explorer',
}: EmailTemplatesManagerViewProps) {
  const router = useRouter();
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

  // Form State for Explorer panel (WITHOUT default values)
  const [isFormVisible, setIsFormVisible] = useState<boolean>(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [templateTestFilter, setTemplateTestFilter] = useState<string>('all');
  const [testResultViewFilter, setTestResultViewFilter] = useState<'all' | 'matched' | 'failed'>('all');

  const [formName, setFormName] = useState<string>('');
  const [formEntityLabel, setFormEntityLabel] = useState<string>('');
  const [formEntityId, setFormEntityId] = useState<string | null>(null);
  const [formEntityEmailPattern, setFormEntityEmailPattern] = useState<string>('');
  const [formIsNewEntity, setFormIsNewEntity] = useState<boolean>(false);
  const [formSubjectPattern, setFormSubjectPattern] = useState<string>('');
  const [formMatchPattern, setFormMatchPattern] = useState<string>('');
  const [formAmountRegex, setFormAmountRegex] = useState<string>('');
  const [formMerchantRegex, setFormMerchantRegex] = useState<string>('');
  const [formSourceAccountRegex, setFormSourceAccountRegex] = useState<string>('');
  const [formDateRegex, setFormDateRegex] = useState<string>('');
  const [formDateFormat, setFormDateFormat] = useState<string>('');
  const [formTimeRegex, setFormTimeRegex] = useState<string>('');
  const [formTimeFormat, setFormTimeFormat] = useState<string>('');
  const [formCurrencyRegex, setFormCurrencyRegex] = useState<string>('');
  const [formExpenseType, setFormExpenseType] = useState<string>('compra');
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
  const [modalName, setModalName] = useState<string>('');
  const [modalEntityLabel, setModalEntityLabel] = useState<string>('');
  const [modalEntityId, setModalEntityId] = useState<string | null>(null);
  const [modalEntityEmailPattern, setModalEntityEmailPattern] = useState<string>('');
  const [modalIsNewEntity, setModalIsNewEntity] = useState<boolean>(false);
  const [modalSubjectPattern, setModalSubjectPattern] = useState<string>('');
  const [modalMatchPattern, setModalMatchPattern] = useState<string>('');
  const [modalAmountRegex, setModalAmountRegex] = useState<string>('');
  const [modalMerchantRegex, setModalMerchantRegex] = useState<string>('');
  const [modalSourceAccountRegex, setModalSourceAccountRegex] = useState<string>('');
  const [modalDateRegex, setModalDateRegex] = useState<string>('');
  const [modalDateFormat, setModalDateFormat] = useState<string>('DD/MM/YYYY');
  const [modalTimeRegex, setModalTimeRegex] = useState<string>('');
  const [modalTimeFormat, setModalTimeFormat] = useState<string>('HH:mm:ss');
  const [modalCurrencyRegex, setModalCurrencyRegex] = useState<string>('');
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
      const storedToken = (typeof window !== 'undefined' ? localStorage.getItem('google_provider_token') : null) || urlToken;
      const headers: Record<string, string> = {};
      if (storedToken) {
        headers['x-google-token'] = storedToken;
      }

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
      const storedToken = typeof window !== 'undefined' ? localStorage.getItem('google_provider_token') : null;
      const headers: Record<string, string> = {};
      if (storedToken) {
        headers['x-google-token'] = storedToken;
      }

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
  const selectedDiagnosis = useMemo(() => {
    if (!selectedEmail) return null;
    return emailDiagnoses.get(selectedEmail.id) || null;
  }, [selectedEmail, emailDiagnoses]);

  // Detect bank from sender or subject
  const detectEntityFromEmail = useCallback((sender: string, subject: string) => {
    const s = (sender || '').toLowerCase();
    const sub = (subject || '').toLowerCase();
    let detected = 'Bancolombia';
    if (s.includes('nu') || sub.includes('nu')) detected = 'Nu';
    else if (s.includes('davivienda') || sub.includes('davivienda')) detected = 'Davivienda';
    else if (s.includes('daviplata') || sub.includes('daviplata')) detected = 'Daviplata';
    else if (s.includes('nequi') || sub.includes('nequi')) detected = 'Nequi';
    else if (s.includes('bbva') || sub.includes('bbva')) detected = 'BBVA';
    else if (s.includes('lulo') || sub.includes('lulo')) detected = 'Lulo Bank';
    else if (s.includes('falabella') || sub.includes('falabella')) detected = 'Banco Falabella';
    else if (s.includes('bogota') || sub.includes('bogota')) detected = 'Banco de Bogotá';
    else if (s.includes('occidente') || sub.includes('occidente')) detected = 'Banco de Occidente';
    else if (s.includes('rappi') || sub.includes('rappi')) detected = 'RappiPay';

    const matchedEnt = entities.find((e) => e.name.toLowerCase() === detected.toLowerCase());
    return {
      entityName: detected,
      entityId: matchedEnt ? matchedEnt.id : null,
      isNewEntity: !matchedEnt,
    };
  }, [entities]);

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
      (t) => (entities.find((e) => e.id === t.entity_id)?.name || '').toLowerCase() === templateTestFilter.toLowerCase()
    );
  }, [templates, templateTestFilter]);

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
    if (!diagnosisForSelectedEmail || !diagnosisForSelectedEmail.reports) return [];
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
    if (!diagnosisForSelectedEmail || !diagnosisForSelectedEmail.reports) return 0;
    return diagnosisForSelectedEmail.reports.filter(
      (r) => r.level3Passed && r.extractedAmount !== null && r.extractedAmount !== undefined
    ).length;
  }, [diagnosisForSelectedEmail]);

  const testedFailedCount = useMemo(() => {
    if (!diagnosisForSelectedEmail || !diagnosisForSelectedEmail.reports) return 0;
    return diagnosisForSelectedEmail.reports.filter(
      (r) => !r.level3Passed || r.extractedAmount === null || r.extractedAmount === undefined
    ).length;
  }, [diagnosisForSelectedEmail]);

  // Plantilla activa en el formulario (creación o edición en curso)
  const activeFormTemplate = useMemo<CatalogTemplate>(() => {
    return {
      id: editingTemplateId || '__active_form_template__',
      name: formName || 'Nueva Plantilla',
      subject_pattern: formSubjectPattern || null,
      amount_regex: formAmountRegex || null,
      merchant_regex: formMerchantRegex || null,
      date_regex: formDateRegex || null,
      date_format: formDateFormat || 'DD/MM/YYYY',
      entity_id: formEntityId || null,
      match_pattern: formMatchPattern || null,
      expense_type_id: null,
      expense_type_label: formExpenseType || 'compra',
      currency_regex: formCurrencyRegex || null,
      source_account_regex: formSourceAccountRegex || null,
      time_regex: formTimeRegex || null,
      time_format: formTimeFormat || 'HH:mm:ss',
      entity_email_patterns: formEntityEmailPattern ? [formEntityEmailPattern] : [],
    };
  }, [
    editingTemplateId,
    formName,
    formSubjectPattern,
    formAmountRegex,
    formMerchantRegex,
    formDateRegex,
    formDateFormat,
    formEntityLabel,
    formEntityId,
    formMatchPattern,
    formExpenseType,
    formCurrencyRegex,
    formSourceAccountRegex,
    formTimeRegex,
    formTimeFormat,
    formEntityEmailPattern,
  ]);

  // Motor de evaluación unificado para la plantilla activa contra el correo seleccionado o muestra
  const activeFormEvaluation = useMemo<SingleTemplateEvaluation | null>(() => {
    const emailToTest = selectedEmail
      ? {
          sender: selectedEmail.sender,
          subject: selectedEmail.subject,
          body: selectedEmail.body,
          plainBody: selectedEmail.plainBody,
          snippet: selectedEmail.snippet,
        }
      : (sampleSender || sampleSubject || sampleBody)
      ? {
          sender: sampleSender,
          subject: sampleSubject,
          body: sampleBody,
          plainBody: sampleBody,
          snippet: sampleBody.slice(0, 160),
        }
      : null;

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
          name: formName || 'Plantilla',
          entity_email_pattern: formEntityEmailPattern || null,
          subject_pattern: formSubjectPattern || null,
          match_pattern: formMatchPattern || null,
          amount_regex: formAmountRegex || null,
          merchant_regex: formMerchantRegex || null,
          date_regex: formDateRegex || null,
          date_format: formDateFormat || null,
          time_regex: formTimeRegex || null,
          time_format: formTimeFormat || null,
          currency_regex: formCurrencyRegex || null,
          source_account_regex: formSourceAccountRegex || null,
          expense_type: formExpenseType || null,
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
    formName,
    formEntityLabel,
    formEntityEmailPattern,
    formSubjectPattern,
    formMatchPattern,
    formAmountRegex,
    formMerchantRegex,
    formDateRegex,
    formDateFormat,
    formTimeRegex,
    formTimeFormat,
    formCurrencyRegex,
    formSourceAccountRegex,
    formExpenseType,
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
        template: report.template,
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
    setFormName(tmpl.name);
    setFormEntityLabel(tmpl.entity?.name || '');
    setFormEntityId(tmpl.entity_id || null);
    setFormEntityEmailPattern(tmpl.entity_email_patterns?.[0] || '');
    setFormIsNewEntity(false);
    setFormSubjectPattern(tmpl.subject_pattern || '');
    setFormMatchPattern(tmpl.match_pattern || '');
    setFormAmountRegex(tmpl.amount_regex || '');
    setFormMerchantRegex(tmpl.merchant_regex || '');
    setFormSourceAccountRegex(tmpl.source_account_regex || '');
    setFormDateRegex(tmpl.date_regex || '');
    setFormDateFormat(tmpl.date_format || '');
    setFormTimeRegex(tmpl.time_regex || '');
    setFormTimeFormat(tmpl.time_format || '');
    setFormCurrencyRegex(tmpl.currency_regex || '');

    setIsFormVisible(true);
    setSaveSuccessMessage(null);
    setSaveErrorMessage(null);
    setAiError(null);
    setAiSuccess(null);
    setAiPreviewDiagnosis(null);
  }, []);

  // Open an empty form to create a template manually (zero defaults)
  const handleOpenEmptyForm = useCallback(() => {
    setEditingTemplateId(null);
    setFormName('');
    setFormEntityLabel('');
    setFormEntityId(null);
    setFormEntityEmailPattern('');
    setFormIsNewEntity(false);
    setFormSubjectPattern('');
    setFormMatchPattern('');
    setFormAmountRegex('');
    setFormMerchantRegex('');
    setFormSourceAccountRegex('');
    setFormDateRegex('');
    setFormDateFormat('');
    setFormTimeRegex('');
    setFormTimeFormat('');
    setFormCurrencyRegex('');

    setIsFormVisible(true);
    setSaveSuccessMessage(null);
    setSaveErrorMessage(null);
    setAiError(null);
    setAiSuccess(null);
    setAiPreviewDiagnosis(null);
  }, []);

  // Add custom sample email to the list and select it
  const handleAddCustomEmail = (e: React.FormEvent) => {
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

    const d = result.data;
    const senderForEntity = sampleSender || selectedEmail?.sender || '';
    const matchedByPattern = entities.find((e) => (e.patterns || []).some((p) => { try { return new RegExp(sanitizeRegexPattern(p) || p, 'i').test(senderForEntity); } catch { return false; } })) || null;
    const matchedEntity = matchedByPattern || (d.entity_label
      ? entities.find((e) => e.name.toLowerCase().trim() === d.entity_label!.toLowerCase().trim())
      : null);
    setFormEntityEmailPattern(matchedByPattern ? '' : (d.entity_email_pattern || ''));

    setFormName(d.name || '');
    if (d.entity_label) {
      setFormEntityLabel(d.entity_label);
      if (matchedEntity) {
        setFormEntityId(matchedEntity.id);
        setFormIsNewEntity(false);
      } else {
        setFormEntityId(null);
        setFormIsNewEntity(true);
      }
    } else {
      setFormEntityLabel('');
      setFormEntityId(null);
      setFormIsNewEntity(false);
    }
    setFormSubjectPattern(d.subject_pattern || '');
    setFormMatchPattern(d.match_pattern || '');
    setFormAmountRegex(d.amount_regex || '');
    setFormMerchantRegex(d.merchant_regex || '');
    setFormSourceAccountRegex(d.source_account_regex || '');
    setFormDateRegex(d.date_regex || '');
    setFormDateFormat(d.date_format || '');
    setFormTimeRegex(d.time_regex || '');
    setFormTimeFormat(d.time_format || '');
    setFormCurrencyRegex(d.currency_regex || '');
    setFormExpenseType(d.expense_type || 'compra');

    setEditingTemplateId(null);
    setIsFormVisible(true);
    setPastedAIResponse('');

    // Evaluación directa e instantánea usando el motor unificado
    const candidateTemplate: CatalogTemplate = {
      id: '__ai_pasted_template__',
      name: d.name || 'Nueva Plantilla',
      subject_pattern: d.subject_pattern,
      amount_regex: d.amount_regex,
      merchant_regex: d.merchant_regex,
      date_regex: d.date_regex,
      date_format: d.date_format,
      entity_id: matchedEntity?.id || null,
      match_pattern: d.match_pattern,
      expense_type_id: null,
      expense_type_label: d.expense_type,
      currency_regex: d.currency_regex,
      source_account_regex: d.source_account_regex,
      time_regex: d.time_regex,
      time_format: d.time_format,
      entity_email_patterns: d.entity_email_pattern ? [d.entity_email_pattern] : [],
    };

    const emailToTest = selectedEmail
      ? {
          sender: selectedEmail.sender,
          subject: selectedEmail.subject,
          body: selectedEmail.body,
          plainBody: selectedEmail.plainBody,
          snippet: selectedEmail.snippet,
        }
      : (sampleSender || sampleSubject || sampleBody)
      ? {
          sender: sampleSender,
          subject: sampleSubject,
          body: sampleBody,
          plainBody: sampleBody,
          snippet: sampleBody.slice(0, 160),
        }
      : null;

    if (emailToTest) {
      const evalResult = evaluateTemplateAgainstEmail(candidateTemplate, emailToTest, entities);
      if (evalResult.overallPassed) {
        setAiSuccess('JSON verificado con éxito: pasó los 4 niveles (Entidad, Asunto, Desempate y Monto).');
      } else {
        setAiError(
          evalResult.failureReasons[0] ||
          'La plantilla requiere ajustes en las expresiones regulares para coincidir completamente.'
        );
      }
    } else {
      setAiSuccess('JSON cargado correctamente en el formulario.');
    }
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
        setFormName(s.name || '');
        setFormEntityEmailPattern(s.entity_email_pattern || '');
        if (s.entity_label) {
          setFormEntityLabel(s.entity_label);
          const matched = entities.find((e) => e.name.toLowerCase() === s.entity_label.toLowerCase());
          if (matched) {
            setFormEntityId(matched.id);
            setFormIsNewEntity(false);
          } else {
            setFormEntityId(null);
            setFormIsNewEntity(true);
          }
        } else {
          setFormEntityLabel('');
          setFormEntityId(null);
          setFormEntityEmailPattern('');
          setFormIsNewEntity(false);
        }
        setFormSubjectPattern(s.subject_pattern || '');
        setFormMatchPattern(s.match_pattern || '');
        setFormAmountRegex(s.amount_regex || '');
        setFormMerchantRegex(s.merchant_regex || '');
        setFormSourceAccountRegex(s.source_account_regex || '');
        setFormDateRegex(s.date_regex || '');
        setFormDateFormat(s.date_format || '');
        setFormTimeRegex(s.time_regex || '');
        setFormTimeFormat(s.time_format || '');
        setFormCurrencyRegex(s.currency_regex || '');

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
  const handleSaveExplorerTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      setSaveErrorMessage('El nombre de la plantilla es obligatorio');
      return;
    }
    if (!formAmountRegex.trim()) {
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

      const payload = {
        ...(editingTemplateId ? { id: editingTemplateId } : {}),
        name: formName.trim(),
        new_entity_label: formEntityLabel.trim() || null,
        entity_id: formEntityId || null,
        entity_email_pattern: (() => { const proposed = sanitizeRegexPattern(formEntityEmailPattern.trim()); if (!proposed || !formEntityId) return proposed; const ent = entities.find(e => e.id === formEntityId); const sender = sampleSender || selectedEmail?.sender || ''; return ent?.patterns?.some(p => { try { return new RegExp(sanitizeRegexPattern(p) || p, 'i').test(sender); } catch { return false; } }) ? null : proposed; })(),
        subject_pattern: sanitizeRegexPattern(formSubjectPattern.trim()) || null,
        match_pattern: sanitizeRegexPattern(formMatchPattern.trim()) || null,
        amount_regex: sanitizeRegexPattern(formAmountRegex.trim()) || formAmountRegex.trim(),
        merchant_regex: sanitizeRegexPattern(formMerchantRegex.trim()) || null,
        source_account_regex: sanitizeRegexPattern(formSourceAccountRegex.trim()) || null,
        date_regex: sanitizeRegexPattern(formDateRegex.trim()) || null,
        date_format: formDateFormat.trim() || 'DD/MM/YYYY',
        time_regex: sanitizeRegexPattern(formTimeRegex.trim()) || null,
        time_format: formTimeFormat.trim() || (formTimeRegex.trim() ? 'HH:mm:ss' : null),
        currency_regex: sanitizeRegexPattern(formCurrencyRegex.trim()) || null,
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
      setModalName(tmpl.name);
      setModalEntityLabel(tmpl.entity?.name || '');
      setModalEntityId(tmpl.entity_id || null);
      setModalEntityEmailPattern(
        Array.isArray(tmpl.entity_email_patterns) && tmpl.entity_email_patterns.length > 0
          ? tmpl.entity_email_patterns[0]
          : ''
      );
      setModalIsNewEntity(false);
      setModalSubjectPattern(tmpl.subject_pattern || '');
      setModalMatchPattern(tmpl.match_pattern || '');
      setModalAmountRegex(tmpl.amount_regex || '');
      setModalMerchantRegex(tmpl.merchant_regex || '');
      setModalSourceAccountRegex(tmpl.source_account_regex || '');
      setModalDateRegex(tmpl.date_regex || '');
      setModalDateFormat(tmpl.date_format || 'DD/MM/YYYY');
      setModalTimeRegex(tmpl.time_regex || '');
      setModalTimeFormat(tmpl.time_format || 'HH:mm:ss');
      setModalCurrencyRegex(tmpl.currency_regex || '');
    } else {
      // Create new template from Catalog
      setEditingModalId(null);
      setModalName('Nueva Plantilla');
      setModalEntityLabel(entities[0]?.name || 'Bancolombia');
      setModalEntityId(entities[0]?.id || null);
      setModalEntityEmailPattern('');
      setModalIsNewEntity(false);
      setModalSubjectPattern('');
      setModalMatchPattern('');
      setModalAmountRegex('');
      setModalMerchantRegex('');
      setModalSourceAccountRegex('');
      setModalDateRegex('');
      setModalDateFormat('DD/MM/YYYY');
      setModalTimeRegex('');
      setModalTimeFormat('HH:mm:ss');
      setModalCurrencyRegex('');
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
      if (!pattern || !pattern.trim() || !textToTest) return { value: null, matched: false };
      const res = extractWithCaptureGroup(pattern, textToTest);
      return {
        value: res.rawExtracted,
        matched: res.success,
        error: res.reason,
      };
    };

    return {
      amount: runExtraction(modalAmountRegex),
      merchant: runExtraction(modalMerchantRegex),
      sourceAccount: runExtraction(modalSourceAccountRegex),
      date: runExtraction(modalDateRegex),
      time: runExtraction(modalTimeRegex),
    };
  }, [modalSampleText, modalAmountRegex, modalMerchantRegex, modalSourceAccountRegex, modalDateRegex, modalTimeRegex]);

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
    const modalSenderForEntity = modalSampleEmailId ? (emails.find((e) => e.id === modalSampleEmailId)?.sender || '') : '';
    const matchedByPattern = entities.find((e) => (e.patterns || []).some((p) => { try { return new RegExp(sanitizeRegexPattern(p) || p, 'i').test(modalSenderForEntity); } catch { return false; } })) || null;
    if (d.name) setModalName(d.name);
    if (d.entity_label || matchedByPattern) {
      const matched = matchedByPattern || entities.find((e) => e.name.toLowerCase() === (d.entity_label || '').toLowerCase()) || null;
      setModalEntityLabel(matched?.name || d.entity_label || '');
      setModalEntityEmailPattern(matchedByPattern ? '' : (d.entity_email_pattern || ''));
      if (matched) {
        setModalEntityId(matched.id);
        setModalIsNewEntity(false);
      } else {
        setModalEntityId(null);
        setModalIsNewEntity(true);
      }
    }
    if (d.subject_pattern) setModalSubjectPattern(d.subject_pattern);
    if (d.match_pattern) setModalMatchPattern(d.match_pattern);
    if (d.amount_regex) setModalAmountRegex(d.amount_regex);
    if (d.merchant_regex) setModalMerchantRegex(d.merchant_regex);
    if (d.source_account_regex) setModalSourceAccountRegex(d.source_account_regex);
    if (d.date_regex) setModalDateRegex(d.date_regex);
    if (d.date_format) setModalDateFormat(d.date_format);
    if (d.time_regex) setModalTimeRegex(d.time_regex);
    if (d.time_format) setModalTimeFormat(d.time_format);
    if (d.currency_regex) setModalCurrencyRegex(d.currency_regex);

    setModalPastedJson('');
    setModalSuccess('¡Campos completados con la respuesta!');
    setTimeout(() => setModalSuccess(null), 3000);
  };

  // Save Modal Form
  const handleSaveModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalName.trim()) {
      setModalError('El nombre de la plantilla es obligatorio');
      return;
    }
    if (!modalAmountRegex.trim()) {
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

      const payload = {
        id: editingModalId,
        name: modalName.trim(),
        new_entity_label: modalEntityLabel.trim() || null,
        entity_id: modalEntityId || null,
        entity_email_pattern: (() => { const proposed = sanitizeRegexPattern(modalEntityEmailPattern.trim()); if (!proposed || !modalEntityId) return proposed; const ent = entities.find(e => e.id === modalEntityId); const sender = modalSampleEmailId ? (emails.find(e => e.id === modalSampleEmailId)?.sender || '') : ''; return ent?.patterns?.some(p => { try { return new RegExp(sanitizeRegexPattern(p) || p, 'i').test(sender); } catch { return false; } }) ? null : proposed; })(),
        subject_pattern: sanitizeRegexPattern(modalSubjectPattern.trim()) || null,
        match_pattern: sanitizeRegexPattern(modalMatchPattern.trim()) || null,
        amount_regex: sanitizeRegexPattern(modalAmountRegex.trim()) || modalAmountRegex.trim(),
        merchant_regex: sanitizeRegexPattern(modalMerchantRegex.trim()) || null,
        source_account_regex: sanitizeRegexPattern(modalSourceAccountRegex.trim()) || null,
        date_regex: sanitizeRegexPattern(modalDateRegex.trim()) || null,
        date_format: modalDateFormat.trim() || 'DD/MM/YYYY',
        time_regex: sanitizeRegexPattern(modalTimeRegex.trim()) || null,
        time_format: modalTimeFormat.trim() || (modalTimeRegex.trim() ? 'HH:mm:ss' : null),
        currency_regex: sanitizeRegexPattern(modalCurrencyRegex.trim()) || null,
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
      const storedToken = typeof window !== 'undefined' ? localStorage.getItem('google_provider_token') : null;
      const headers: Record<string, string> = {};
      if (storedToken) {
        headers['x-google-token'] = storedToken;
      }

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

      setEmailDiagnoses(new Map());
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
        ((entities.find((e) => e.id === t.entity_id)?.name || '').toLowerCase().includes(templateSearchQuery.toLowerCase())) ||
        (t.subject_pattern && t.subject_pattern.toLowerCase().includes(templateSearchQuery.toLowerCase()));

      const matchesEntity =
        selectedEntityFilter === 'all' ||
        ((entities.find((e) => e.id === t.entity_id)?.name || '').toLowerCase() === selectedEntityFilter.toLowerCase());

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
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center space-x-2 ${
                activeTab === 'explorer'
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
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center space-x-2 ${
                activeTab === 'catalog'
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
                  className={`px-2.5 py-1 rounded-lg font-medium whitespace-nowrap transition cursor-pointer ${
                    emailStatusFilter === 'all'
                      ? 'bg-zinc-900 text-white'
                      : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                  }`}
                >
                  Todos ({statusCounts.all})
                </button>
                <button
                  type="button"
                  onClick={() => setEmailStatusFilter('unmatched')}
                  className={`px-2.5 py-1 rounded-lg font-medium whitespace-nowrap transition cursor-pointer ${
                    emailStatusFilter === 'unmatched'
                      ? 'bg-zinc-900 text-white'
                      : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                  }`}
                >
                  Sin plantilla ({statusCounts.unmatched})
                </button>
                <button
                  type="button"
                  onClick={() => setEmailStatusFilter('matched')}
                  className={`px-2.5 py-1 rounded-lg font-medium whitespace-nowrap transition cursor-pointer ${
                    emailStatusFilter === 'matched'
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
                    className={`px-2.5 py-1 rounded-lg font-medium whitespace-nowrap transition cursor-pointer ${
                      emailStatusFilter === 'conflict'
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
                      className={`p-3.5 rounded-2xl border transition text-left cursor-pointer flex flex-col justify-between space-y-2 ${
                        isSelected
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
                        {survivingCount === 1 && winner ? (
                          <span className="inline-flex items-center gap-1 font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md truncate">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                            <span className="truncate">{winner.template.name}</span>
                            {winner.extractedAmount ? (
                              <span className="font-semibold text-emerald-800 ml-1">
                                • ${formatCurrency(winner.extractedAmount)}
                              </span>
                            ) : null}
                          </span>
                        ) : survivingCount > 1 ? (
                          <span className="inline-flex items-center gap-1 font-bold text-amber-800 bg-amber-50 border border-amber-300 px-2 py-0.5 rounded-md">
                            <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
                            <span>Conflicto ({survivingCount})</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 font-medium text-zinc-600 bg-zinc-100 px-2 py-0.5 rounded-md">
                            <span>Sin plantilla</span>
                          </span>
                        )}

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
                      {testedMatchedCount === 1 && diagnosisForSelectedEmail?.winner ? (
                        <span className="inline-flex items-center gap-1 font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg text-[11px]">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="hidden sm:inline">{diagnosisForSelectedEmail.winner.template.name}</span>
                          <span className="sm:hidden">Coincide</span>
                        </span>
                      ) : testedMatchedCount > 1 ? (
                        <span className="inline-flex items-center gap-1 font-bold text-amber-800 bg-amber-50 border border-amber-300 px-2.5 py-1 rounded-lg text-[11px]">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                          <span>{testedMatchedCount} conflictos</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 font-medium text-zinc-600 bg-zinc-100 px-2.5 py-1 rounded-lg text-[11px]">
                          <span>Ninguna plantilla funcionó</span>
                        </span>
                      )}
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
                            className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer ${
                              testResultViewFilter === 'all'
                                ? 'bg-zinc-900 text-white'
                                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                            }`}
                          >
                            Todas ({diagnosisForSelectedEmail?.reports?.length || 0})
                          </button>
                          <button
                            type="button"
                            onClick={() => setTestResultViewFilter('matched')}
                            className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer ${
                              testResultViewFilter === 'matched'
                                ? 'bg-emerald-700 text-white'
                                : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                            }`}
                          >
                            Coinciden ({testedMatchedCount})
                          </button>
                          <button
                            type="button"
                            onClick={() => setTestResultViewFilter('failed')}
                            className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer ${
                              testResultViewFilter === 'failed'
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
                            ? `Modificando: ${formName || 'Plantilla guardada'}`
                            : formName
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
                        customTitle={`Prueba en vivo: ${formName || 'Plantilla en edición'}`}
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
                        <label className="block text-xs font-bold text-zinc-700 mb-1">
                          Nombre <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={formName}
                          onChange={(e) => setFormName(e.target.value)}
                          className="w-full px-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-zinc-400 font-medium"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-zinc-700 mb-1">Banco / Entidad</label>
                        <input
                          type="text"
                          list="entity-suggestions"
                          value={formEntityLabel}
                          onChange={(e) => {
                            const val = e.target.value;
                            setFormEntityLabel(val);
                            const match = entities.find((ent) => ent.name.toLowerCase() === val.toLowerCase());
                            if (match) {
                              setFormEntityId(match.id);
                              setFormIsNewEntity(false);
                            } else {
                              setFormEntityId(null);
                              setFormIsNewEntity(true);
                            }
                          }}
                          className="w-full px-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-zinc-400 font-medium"
                        />
                        <datalist id="entity-suggestions">
                          {entities.map((ent) => (
                            <option key={ent.id} value={ent.name} />
                          ))}
                        </datalist>
                        {formEntityLabel && formIsNewEntity && (
                          <span className="text-[10px] font-semibold text-amber-700 mt-0.5 block">
                            Entidad nueva, no existe en el catálogo
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Fila 2: Filtro de Asunto y Desempate */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-zinc-700 mb-1">Patrón de Asunto</label>
                        <input
                          type="text"
                          value={formSubjectPattern}
                          onChange={(e) => setFormSubjectPattern(e.target.value)}
                          className="w-full px-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-zinc-400 font-mono text-[11px]"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-zinc-700 mb-1">Desempate en Cuerpo</label>
                        <input
                          type="text"
                          value={formMatchPattern}
                          onChange={(e) => setFormMatchPattern(e.target.value)}
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
                          <label className="text-xs font-bold text-zinc-700 flex items-center gap-1">
                            <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Monto</span>
                            <span className="text-rose-500">*</span>
                          </label>
                          {activeFormEvaluation?.level4.fields.amount && (
                            <span className={`text-[11px] font-mono font-medium truncate max-w-[220px] ${
                              activeFormEvaluation.level4.fields.amount.matched ? 'text-emerald-700 font-bold' : 'text-zinc-400'
                            }`}>
                              {activeFormEvaluation.level4.fields.amount.matched
                                ? `Captura: ${activeFormEvaluation.level4.fields.amount.value}`
                                : (formAmountRegex ? 'Sin captura' : '')}
                            </span>
                          )}
                        </div>
                        <input
                          type="text"
                          required
                          value={formAmountRegex}
                          onChange={(e) => setFormAmountRegex(e.target.value)}
                          className="w-full px-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-zinc-400 font-mono text-[11px]"
                        />
                      </div>

                      {/* Comercio */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold text-zinc-700 flex items-center gap-1">
                            <Store className="w-3.5 h-3.5 text-zinc-500" />
                            <span>Comercio</span>
                          </label>
                          {activeFormEvaluation?.level4.fields.merchant && (
                            <span className={`text-[11px] font-mono font-medium truncate max-w-[220px] ${
                              activeFormEvaluation.level4.fields.merchant.matched ? 'text-emerald-700 font-bold' : 'text-zinc-400'
                            }`}>
                              {activeFormEvaluation.level4.fields.merchant.matched
                                ? `Captura: ${activeFormEvaluation.level4.fields.merchant.value}`
                                : (formMerchantRegex ? 'Sin captura' : '')}
                            </span>
                          )}
                        </div>
                        <input
                          type="text"
                          value={formMerchantRegex}
                          onChange={(e) => setFormMerchantRegex(e.target.value)}
                          className="w-full px-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-zinc-400 font-mono text-[11px]"
                        />
                      </div>

                      {/* Cuenta */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold text-zinc-700 flex items-center gap-1">
                            <CreditCard className="w-3.5 h-3.5 text-zinc-500" />
                            <span>Cuenta o Tarjeta</span>
                          </label>
                          {activeFormEvaluation?.level4.fields.sourceAccount && (
                            <span className={`text-[11px] font-mono font-medium truncate max-w-[220px] ${
                              activeFormEvaluation.level4.fields.sourceAccount.matched ? 'text-emerald-700 font-bold' : 'text-zinc-400'
                            }`}>
                              {activeFormEvaluation.level4.fields.sourceAccount.matched
                                ? `Captura: ${activeFormEvaluation.level4.fields.sourceAccount.value}`
                                : (formSourceAccountRegex ? 'Sin captura' : '')}
                            </span>
                          )}
                        </div>
                        <input
                          type="text"
                          value={formSourceAccountRegex}
                          onChange={(e) => setFormSourceAccountRegex(e.target.value)}
                          className="w-full px-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-zinc-400 font-mono text-[11px]"
                        />
                      </div>

                      {/* Fecha, Hora y sus formatos */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-bold text-zinc-700 flex items-center gap-1">
                              <Calendar className="w-3.5 h-3.5 text-zinc-500" />
                              <span>Fecha</span>
                            </label>
                            {activeFormEvaluation?.level4.fields.date && (
                              <span className={`text-[11px] font-mono font-medium truncate max-w-[120px] ${
                                activeFormEvaluation.level4.fields.date.matched ? 'text-emerald-700 font-bold' : 'text-zinc-400'
                              }`}>
                                {activeFormEvaluation.level4.fields.date.matched
                                  ? activeFormEvaluation.level4.fields.date.value
                                  : (formDateRegex ? 'Sin captura' : '')}
                              </span>
                            )}
                          </div>
                          <input
                            type="text"
                            value={formDateRegex}
                            onChange={(e) => setFormDateRegex(e.target.value)}
                            className="w-full px-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-zinc-400 font-mono text-[11px]"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-xs font-bold text-zinc-700">Formato de Fecha</label>
                          <input
                            type="text"
                            list="date-format-suggestions"
                            value={formDateFormat}
                            onChange={(e) => setFormDateFormat(e.target.value)}
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
                            <label className="text-xs font-bold text-zinc-700 flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5 text-zinc-500" />
                              <span>Hora</span>
                            </label>
                            {activeFormEvaluation?.level4.fields.time && (
                              <span className={`text-[11px] font-mono font-medium truncate max-w-[120px] ${
                                activeFormEvaluation.level4.fields.time.matched ? 'text-emerald-700 font-bold' : 'text-zinc-400'
                              }`}>
                                {activeFormEvaluation.level4.fields.time.matched
                                  ? activeFormEvaluation.level4.fields.time.value
                                  : (formTimeRegex ? 'Sin captura' : '')}
                              </span>
                            )}
                          </div>
                          <input
                            type="text"
                            value={formTimeRegex}
                            onChange={(e) => setFormTimeRegex(e.target.value)}
                            className="w-full px-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-zinc-400 font-mono text-[11px]"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-xs font-bold text-zinc-700">Formato de Hora</label>
                          <input
                            type="text"
                            list="time-format-suggestions"
                            value={formTimeFormat}
                            onChange={(e) => setFormTimeFormat(e.target.value)}
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
                          <label className="text-xs font-bold text-zinc-700">Patrón de Correo de Entidad</label>
                          <input
                            type="text"
                            value={formEntityEmailPattern}
                            onChange={(e) => setFormEntityEmailPattern(e.target.value)}
                            className="w-full px-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-zinc-400 font-mono text-[11px]"
                            placeholder="Se persiste como entity_email_patterns"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-bold text-zinc-700">Moneda Regex</label>
                          <input
                            type="text"
                            value={formCurrencyRegex}
                            onChange={(e) => setFormCurrencyRegex(e.target.value)}
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
                        className={`inline-flex items-center space-x-1.5 px-4 py-2 text-xs font-bold rounded-xl shadow-xs transition active:scale-95 cursor-pointer ${
                          copiedPrompt
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
      {/* VISTA 2: CATÁLOGO DE PLANTILLAS GUARDADAS                                  */}
      {/* ========================================================================= */}
      {activeTab === 'catalog' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3.5 border border-zinc-200 rounded-2xl shadow-xs">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={templateSearchQuery}
                onChange={(e) => setTemplateSearchQuery(e.target.value)}
                placeholder="Buscar por nombre, banco o asunto..."
                className="w-full pl-9 pr-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-zinc-400"
              />
            </div>

            <div className="flex items-center space-x-1 overflow-x-auto pb-1 sm:pb-0">
              <button
                type="button"
                onClick={() => setSelectedEntityFilter('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition cursor-pointer ${
                  selectedEntityFilter === 'all'
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
                  onClick={() => setSelectedEntityFilter(name)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition cursor-pointer ${
                    selectedEntityFilter.toLowerCase() === name.toLowerCase()
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
              onClick={() => openEditModal(null)}
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
                          onClick={() => openEditModal(t)}
                          className="p-1.5 text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition cursor-pointer"
                          title="Editar plantilla"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteTemplate(t.id)}
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
      )}

      {/* ========================================================================= */}
      {/* MODAL DE EDICIÓN DE PLANTILLA (ABIERTO DIRECTAMENTE DESDE EL CATÁLOGO)   */}
      {/* ========================================================================= */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-zinc-200 overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-zinc-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm sm:text-base font-bold text-zinc-900">
                  {editingModalId ? `Editar Plantilla: ${modalName}` : 'Nueva Plantilla'}
                </h3>
                <p className="text-xs text-zinc-500">
                  Modifica los patrones de extracción y prueba los resultados con un correo de ejemplo.
                </p>
              </div>

              <button
                type="button"
                onClick={closeEditModal}
                className="p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-xl transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body (Scrollable) */}
            <form onSubmit={handleSaveModal} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
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
                  <label className="text-xs font-bold text-zinc-900 flex items-center gap-1.5">
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
                  <select
                    value={modalSampleEmailId}
                    onChange={(e) => {
                      setModalSampleEmailId(e.target.value);
                      setModalCustomSampleBody('');
                    }}
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
                    onClick={handleModalCopyPrompt}
                    className={`px-3 py-2 text-xs font-bold rounded-xl border transition flex items-center justify-center gap-1.5 cursor-pointer ${
                      modalCopiedPrompt
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
                    onChange={(e) => setModalPastedJson(e.target.value)}
                    placeholder="Pega aquí el JSON devuelto por la IA..."
                    className="flex-1 px-3 py-1.5 text-xs bg-white border border-zinc-200 rounded-lg font-mono text-[11px]"
                  />
                  <button
                    type="button"
                    onClick={handleModalApplyPastedJson}
                    className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold rounded-lg transition cursor-pointer"
                  >
                    Aplicar
                  </button>
                </div>
              </div>

              {/* Campos Básicos */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-1">
                  <label className="block text-xs font-bold text-zinc-700 mb-1">
                    Nombre <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={modalName}
                    onChange={(e) => setModalName(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl font-medium"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-zinc-700">Banco / Entidad</label>
                    <button
                      type="button"
                      onClick={() => setModalIsNewEntity(!modalIsNewEntity)}
                      className="text-[11px] font-semibold text-indigo-600"
                    >
                      {modalIsNewEntity ? 'Elegir' : '+ Nuevo'}
                    </button>
                  </div>
                  {modalIsNewEntity ? (
                    <input
                      type="text"
                      value={modalEntityLabel}
                      onChange={(e) => setModalEntityLabel(e.target.value)}
                      placeholder="Nombre del banco"
                      className="w-full px-3 py-2 text-xs bg-amber-50/40 border border-amber-300 rounded-xl font-medium"
                    />
                  ) : (
                    <select
                      value={modalEntityId || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        setModalEntityId(val || null);
                        const match = entities.find((ent) => ent.id === val);
                        if (match) setModalEntityLabel(match.name);
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
                  <label className="block text-xs font-bold text-zinc-700 mb-1">Patrón de Asunto</label>
                  <input
                    type="text"
                    value={modalSubjectPattern}
                    onChange={(e) => setModalSubjectPattern(e.target.value)}
                    placeholder="Palabras clave en el asunto"
                    className="w-full px-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl font-mono text-[11px]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">
                    Desempate en Cuerpo (opcional)
                  </label>
                  <input
                    type="text"
                    value={modalMatchPattern}
                    onChange={(e) => setModalMatchPattern(e.target.value)}
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
                    <label className="text-xs font-bold text-zinc-700 flex items-center gap-1">
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
                  <input
                    type="text"
                    required
                    value={modalAmountRegex}
                    onChange={(e) => setModalAmountRegex(e.target.value)}
                    placeholder="Regex con grupo de captura () para el monto"
                    className="w-full px-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl font-mono text-[11px]"
                  />
                </div>

                {/* Comercio */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-zinc-700 flex items-center gap-1">
                      <Store className="w-3.5 h-3.5 text-zinc-500" />
                      <span>Comercio</span>
                    </label>
                    {modalLiveExtraction.merchant.matched && (
                      <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        Captura: {modalLiveExtraction.merchant.value}
                      </span>
                    )}
                  </div>
                  <input
                    type="text"
                    value={modalMerchantRegex}
                    onChange={(e) => setModalMerchantRegex(e.target.value)}
                    placeholder="Regex con grupo de captura () para el comercio"
                    className="w-full px-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl font-mono text-[11px]"
                  />
                </div>

                {/* Cuenta */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-zinc-700 flex items-center gap-1">
                      <CreditCard className="w-3.5 h-3.5 text-zinc-500" />
                      <span>Cuenta o Tarjeta</span>
                    </label>
                    {modalLiveExtraction.sourceAccount.matched && (
                      <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        Captura: {modalLiveExtraction.sourceAccount.value}
                      </span>
                    )}
                  </div>
                  <input
                    type="text"
                    value={modalSourceAccountRegex}
                    onChange={(e) => setModalSourceAccountRegex(e.target.value)}
                    placeholder="Regex con grupo de captura () para la cuenta"
                    className="w-full px-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl font-mono text-[11px]"
                  />
                </div>

                {/* Fecha */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
                  <div className="sm:col-span-2 space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-zinc-700 flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-zinc-500" />
                        <span>Fecha</span>
                      </label>
                      {modalLiveExtraction.date.matched && (
                        <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          Captura: {modalLiveExtraction.date.value}
                        </span>
                      )}
                    </div>
                    <input
                      type="text"
                      value={modalDateRegex}
                      onChange={(e) => setModalDateRegex(e.target.value)}
                      placeholder="Regex con grupo de captura () para la fecha"
                      className="w-full px-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl font-mono text-[11px]"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-zinc-700">Formato de Fecha</label>
                    <select
                      value={modalDateFormat}
                      onChange={(e) => setModalDateFormat(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl"
                    >
                      <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                      <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                      <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-zinc-700 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-zinc-500" />
                        <span>Hora</span>
                      </label>
                      {modalLiveExtraction.time.matched && (
                        <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          Captura: {modalLiveExtraction.time.value}
                        </span>
                      )}
                    </div>
                    <input
                      type="text"
                      value={modalTimeRegex}
                      onChange={(e) => setModalTimeRegex(e.target.value)}
                      placeholder="Regex con grupo de captura () para la hora"
                      className="w-full px-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl font-mono text-[11px]"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-zinc-700">Formato de Hora</label>
                    <select
                      value={modalTimeFormat}
                      onChange={(e) => setModalTimeFormat(e.target.value)}
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
                  onClick={closeEditModal}
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
      )}

      {/* Modal para Cargar Correo de Ejemplo */}
      {isCustomEmailModalOpen && (
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
                onClick={() => setIsCustomEmailModalOpen(false)}
                className="text-zinc-400 hover:text-zinc-700 p-1.5 rounded-lg hover:bg-zinc-100 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddCustomEmail} className="p-5 space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">
                  Remitente <span className="text-zinc-400 font-normal">(opcional)</span>
                </label>
                <input
                  type="text"
                  value={customSender}
                  onChange={(e) => setCustomSender(e.target.value)}
                  placeholder="ej: notificaciones@banco.com"
                  className="w-full px-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-zinc-400"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">
                  Asunto <span className="text-zinc-400 font-normal">(opcional)</span>
                </label>
                <input
                  type="text"
                  value={customSubject}
                  onChange={(e) => setCustomSubject(e.target.value)}
                  placeholder="ej: Notificación de compra con tarjeta"
                  className="w-full px-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-zinc-400"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">
                  Cuerpo del Correo <span className="text-rose-500">*</span>
                </label>
                <textarea
                  required
                  rows={6}
                  value={customBody}
                  onChange={(e) => setCustomBody(e.target.value)}
                  placeholder="Pega aquí el texto completo de la notificación bancaria..."
                  className="w-full px-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-zinc-400 font-mono text-[11px] leading-relaxed"
                />
              </div>

              <div className="pt-3 border-t border-zinc-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCustomEmailModalOpen(false)}
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
      )}
    </div>
  );
}