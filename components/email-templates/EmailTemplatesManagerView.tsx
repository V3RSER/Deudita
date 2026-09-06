'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Mail,
  MailCheck,
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
  Sparkles,
  ArrowLeft,
  CreditCard,
  Calendar,
  DollarSign,
  Store,
  Check,
  X,
  Loader2,
  Inbox,
  ChevronRight,
  Bot,
  Clock,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Sliders,
  ShieldCheck,
  Eye,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { cleanEmailBody, sanitizeRegexPattern, parseAITemplateResponse } from '@/lib/email-cleaning';
import {
  CatalogEntity,
  CatalogTemplate,
  diagnoseEmailMatching,
  DiagnosisResult,
} from '@/lib/email-matching';
import { formatCurrency } from '@/lib/balance-utils';

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

  // Expense types catalog
  const [expenseTypes, setExpenseTypes] = useState<Array<{ id: string; name: string; label: string }>>([]);

  // Editor mode flag (when user explicitly clicks Edit on a template or wants to customize)
  const [isEditingInPanel, setIsEditingInPanel] = useState<boolean>(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);

  // Form State
  const [formName, setFormName] = useState<string>('');
  const [formEntityName, setFormEntityName] = useState<string>('');
  const [formEntityId, setFormEntityId] = useState<string | null>(null);
  const [formIsNewEntity, setFormIsNewEntity] = useState<boolean>(false);
  const [formEntityEmailPattern, setFormEntityEmailPattern] = useState<string>('');
  const [formSubjectPattern, setFormSubjectPattern] = useState<string>('');
  const [formSenderPattern, setFormSenderPattern] = useState<string>('');
  const [formMatchPattern, setFormMatchPattern] = useState<string>('');
  const [formAmountRegex, setFormAmountRegex] = useState<string>('\\$\\s*([\\d.,]+)');
  const [formMerchantRegex, setFormMerchantRegex] = useState<string>('');
  const [formSourceAccountRegex, setFormSourceAccountRegex] = useState<string>('');
  const [formDateRegex, setFormDateRegex] = useState<string>('');
  const [formDateFormat, setFormDateFormat] = useState<string>('DD/MM/YYYY');
  const [formTimeRegex, setFormTimeRegex] = useState<string>('');
  const [formCurrencyRegex, setFormCurrencyRegex] = useState<string>('');
  const [formCurrency, setFormCurrency] = useState<string>('COP');
  const [formExpenseType, setFormExpenseType] = useState<string>('');
  const [formExpenseTypeId, setFormExpenseTypeId] = useState<string | null>(null);

  // Sample email for live evaluation
  const [sampleSender, setSampleSender] = useState<string>('');
  const [sampleSubject, setSampleSubject] = useState<string>('');
  const [sampleBody, setSampleBody] = useState<string>('');
  const [isSampleBodyExpanded, setIsSampleBodyExpanded] = useState<boolean>(false);

  // AI Suggest State (Direct Autocomplete)
  const [isAISuggesting, setIsAISuggesting] = useState<boolean>(false);
  const [aiSuggestError, setAiSuggestError] = useState<string | null>(null);
  const [aiSuggestSuccess, setAiSuggestSuccess] = useState<string | null>(null);
  const [showJsonPasteFallback, setShowJsonPasteFallback] = useState<boolean>(false);
  const [rawPastedJson, setRawPastedJson] = useState<string>('');

  // Saving state
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null);

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
        if (Array.isArray(catData.expense_types)) {
          setExpenseTypes(catData.expense_types);
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
            'Tu autorización de Gmail ha caducado (los tokens de Google duran 60 min). Haz clic en "Renovar acceso a Gmail" para reactivarla al instante en 1 clic.'
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

      // Auto-select first email if none selected yet
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

  // Helper to detect bank from sender or subject
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

  // Populate form with an email (for creating a new template)
  const populateFormWithEmail = useCallback((email: IngestedEmail) => {
    setEditingTemplateId(null);
    setSampleSender(email.sender || '');
    setSampleSubject(email.subject || '');
    const cleanBody = cleanEmailBody(email.body || email.plainBody || email.snippet || '');
    setSampleBody(cleanBody);

    const { entityName, entityId, isNewEntity } = detectEntityFromEmail(email.sender, email.subject);
    setFormName(`${entityName} - Notificación`);
    setFormEntityName(entityName);
    setFormEntityId(entityId);
    setFormIsNewEntity(isNewEntity);
    setFormEntityEmailPattern('');
    setFormSubjectPattern(email.subject.replace(/([.*+?^${}()|[\]\\])/g, '\\$1'));
    setFormSenderPattern('');
    setFormMatchPattern('');
    setFormAmountRegex('(?:\\$|COP|valor|monto)\\s*\\$?([\\d.,]+)');
    setFormMerchantRegex('en\\s+([A-Za-z0-9\\s.-]+?)(?:\\s+por|\\s+el|\\s*$)');
    setFormSourceAccountRegex('(?:cta|cuenta|tarjeta)\\s*\\*?(\\d{4})');
    setFormDateRegex('(?:el\\s+)?(\\d{1,2}[/-]\\d{1,2}[/-]\\d{2,4})');
    setFormDateFormat('DD/MM/YYYY');
    setFormTimeRegex('(\\d{1,2}:\\d{2}(?:\\s*[ap]\\.?m\\.?)?)');
    setFormCurrencyRegex('');
    setFormCurrency('COP');
    setFormExpenseType('');
    setFormExpenseTypeId(null);
    setSaveSuccessMessage(null);
    setSaveErrorMessage(null);
  }, [detectEntityFromEmail]);

  // Populate form with an existing template for editing
  const populateFormWithTemplate = useCallback((tmpl: CatalogTemplate, sampleMail?: IngestedEmail | null) => {
    setEditingTemplateId(tmpl.id);
    setFormName(tmpl.name);
    setFormEntityName(tmpl.entity_name || tmpl.entity?.name || '');
    setFormEntityId(tmpl.entity_id || null);
    setFormIsNewEntity(false);
    setFormEntityEmailPattern('');
    setFormSubjectPattern(tmpl.subject_pattern || '');
    setFormSenderPattern(tmpl.sender_pattern || '');
    setFormMatchPattern(tmpl.match_pattern || '');
    setFormAmountRegex(tmpl.amount_regex || '\\$\\s*([\\d.,]+)');
    setFormMerchantRegex(tmpl.merchant_regex || '');
    setFormSourceAccountRegex(tmpl.source_account_regex || '');
    setFormDateRegex(tmpl.date_regex || '');
    setFormDateFormat(tmpl.date_format || 'DD/MM/YYYY');
    setFormTimeRegex(tmpl.time_regex || '');
    setFormCurrencyRegex(tmpl.currency_regex || '');
    setFormCurrency(tmpl.default_currency || 'COP');
    setFormExpenseTypeId(tmpl.expense_type_id || null);

    if (sampleMail) {
      setSampleSender(sampleMail.sender || '');
      setSampleSubject(sampleMail.subject || '');
      setSampleBody(cleanEmailBody(sampleMail.body || sampleMail.plainBody || sampleMail.snippet || ''));
    }

    setSaveSuccessMessage(null);
    setSaveErrorMessage(null);
    setIsEditingInPanel(true);
  }, []);

  // Sync state whenever selected email changes in explorer mode
  useEffect(() => {
    if (!selectedEmail) return;
    const diag = emailDiagnoses.get(selectedEmail.id);
    const hasSingleWinner = diag && diag.level3?.survivingTemplates?.length === 1;

    // If there is no winner, open the creation editor prefilled with this email
    if (!hasSingleWinner) {
      populateFormWithEmail(selectedEmail);
      setIsEditingInPanel(true);
    } else {
      // If there IS a winner, by default show the extracted result view
      setIsEditingInPanel(false);
      setSampleSender(selectedEmail.sender || '');
      setSampleSubject(selectedEmail.subject || '');
      setSampleBody(cleanEmailBody(selectedEmail.body || selectedEmail.plainBody || selectedEmail.snippet || ''));
    }
  }, [selectedEmail, emailDiagnoses, populateFormWithEmail]);

  // Live Extraction Evaluator against the current sample text
  const liveExtraction = useMemo(() => {
    const textToTest = cleanEmailBody(sampleBody);

    const testRegex = (pattern: string | null | undefined): { value: string | null; matched: boolean; error?: string } => {
      if (!pattern || !pattern.trim() || !textToTest) return { value: null, matched: false };
      try {
        const regex = new RegExp(pattern, 'i');
        const match = textToTest.match(regex);
        if (match) {
          const val = match[1] !== undefined ? match[1].trim() : match[0].trim();
          return { value: val, matched: true };
        }
        return { value: null, matched: false };
      } catch (err: unknown) {
        return { value: null, matched: false, error: 'Sintaxis de regex inválida' };
      }
    };

    const amount = testRegex(formAmountRegex);
    const merchant = testRegex(formMerchantRegex);
    const sourceAccount = testRegex(formSourceAccountRegex);
    const date = testRegex(formDateRegex);
    const time = testRegex(formTimeRegex);
    const currency = testRegex(formCurrencyRegex);

    let subjectMatched = true;
    if (formSubjectPattern && formSubjectPattern.trim() && sampleSubject) {
      try {
        subjectMatched = new RegExp(formSubjectPattern, 'i').test(sampleSubject);
      } catch {
        subjectMatched = false;
      }
    }

    let matchPatternMatched = true;
    if (formMatchPattern && formMatchPattern.trim() && textToTest) {
      try {
        matchPatternMatched = new RegExp(formMatchPattern, 'i').test(textToTest);
      } catch {
        matchPatternMatched = false;
      }
    }

    return {
      amount,
      merchant,
      sourceAccount,
      date,
      time,
      currency,
      subjectMatched,
      matchPatternMatched,
    };
  }, [
    sampleBody,
    sampleSubject,
    formAmountRegex,
    formMerchantRegex,
    formSourceAccountRegex,
    formDateRegex,
    formTimeRegex,
    formCurrencyRegex,
    formSubjectPattern,
    formMatchPattern,
  ]);

  // Direct AI Autocomplete handler
  const handleAISuggest = async () => {
    if (!selectedEmail) return;
    setIsAISuggesting(true);
    setAiSuggestError(null);
    setAiSuggestSuccess(null);

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
        if (s.name) setFormName(s.name);
        if (s.entity_name) {
          setFormEntityName(s.entity_name);
          const cleanName = s.entity_name.toLowerCase();
          const matchedEnt = entities.find((e) => e.name.toLowerCase() === cleanName);
          if (matchedEnt) {
            setFormEntityId(matchedEnt.id);
            setFormIsNewEntity(false);
          } else {
            setFormEntityId(null);
            setFormIsNewEntity(true);
          }
        }
        if (s.sender_pattern) setFormSenderPattern(s.sender_pattern);
        if (s.subject_pattern) setFormSubjectPattern(s.subject_pattern);
        if (s.match_pattern) setFormMatchPattern(s.match_pattern);
        if (s.amount_regex) setFormAmountRegex(s.amount_regex);
        if (s.merchant_regex) setFormMerchantRegex(s.merchant_regex);
        if (s.source_account_regex) setFormSourceAccountRegex(s.source_account_regex);
        if (s.date_regex) setFormDateRegex(s.date_regex);
        if (s.date_format) setFormDateFormat(s.date_format);
        if (s.time_regex) setFormTimeRegex(s.time_regex);
        if (s.default_currency) setFormCurrency(s.default_currency);
        if (s.currency_regex) setFormCurrencyRegex(s.currency_regex);

        setAiSuggestSuccess('¡Plantilla autocompletada con IA! Revisa las capturas inline.');
        setTimeout(() => setAiSuggestSuccess(null), 3500);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al consultar la IA';
      setAiSuggestError(msg);
    } finally {
      setIsAISuggesting(false);
    }
  };

  // Process raw pasted JSON (fallback for power users)
  const handleProcessPastedJson = () => {
    if (!rawPastedJson.trim()) return;
    const result = parseAITemplateResponse(rawPastedJson);
    if (!result.success || !result.data) {
      setAiSuggestError(result.error || 'JSON inválido');
      return;
    }

    const d = result.data;
    if (d.name) setFormName(d.name);
    if (d.entity_name) {
      setFormEntityName(d.entity_name);
      const matchedEntity = entities.find((e) => e.name.toLowerCase() === (d.entity_name || '').toLowerCase());
      if (matchedEntity) {
        setFormEntityId(matchedEntity.id);
        setFormIsNewEntity(false);
      } else {
        setFormEntityId(null);
        setFormIsNewEntity(true);
      }
    }
    if (d.subject_pattern) setFormSubjectPattern(d.subject_pattern);
    if (d.sender_pattern) setFormSenderPattern(d.sender_pattern);
    if (d.match_pattern) setFormMatchPattern(d.match_pattern);
    if (d.amount_regex) setFormAmountRegex(d.amount_regex);
    if (d.merchant_regex) setFormMerchantRegex(d.merchant_regex);
    if (d.source_account_regex) setFormSourceAccountRegex(d.source_account_regex);
    if (d.date_regex) setFormDateRegex(d.date_regex);
    if (d.date_format) setFormDateFormat(d.date_format);
    if (d.time_regex) setFormTimeRegex(d.time_regex);
    if (d.currency_regex) setFormCurrencyRegex(d.currency_regex);
    if (d.default_currency) setFormCurrency(d.default_currency);

    setShowJsonPasteFallback(false);
    setRawPastedJson('');
    setAiSuggestSuccess('¡JSON importado con éxito!');
    setTimeout(() => setAiSuggestSuccess(null), 3000);
  };

  // Save or Update Template
  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      setSaveErrorMessage('El nombre de la plantilla es obligatorio');
      return;
    }
    if (!formAmountRegex.trim()) {
      setSaveErrorMessage('El patrón de monto es obligatorio');
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

      const patternToLink =
        sanitizeRegexPattern(formEntityEmailPattern.trim()) ||
        sanitizeRegexPattern(formSenderPattern.trim()) ||
        null;

      const payload = {
        id: editingTemplateId,
        name: formName.trim(),
        entity_name: formEntityName.trim() || null,
        entity_id: formEntityId || null,
        entity_email_pattern: patternToLink,
        subject_pattern: sanitizeRegexPattern(formSubjectPattern.trim()) || null,
        sender_pattern: sanitizeRegexPattern(formSenderPattern.trim()) || null,
        match_pattern: sanitizeRegexPattern(formMatchPattern.trim()) || null,
        amount_regex: sanitizeRegexPattern(formAmountRegex.trim()) || formAmountRegex.trim(),
        merchant_regex: sanitizeRegexPattern(formMerchantRegex.trim()) || null,
        source_account_regex: sanitizeRegexPattern(formSourceAccountRegex.trim()) || null,
        date_regex: sanitizeRegexPattern(formDateRegex.trim()) || null,
        date_format: formDateFormat.trim() || 'DD/MM/YYYY',
        time_regex: sanitizeRegexPattern(formTimeRegex.trim()) || null,
        currency_regex: sanitizeRegexPattern(formCurrencyRegex.trim()) || null,
        default_currency: formCurrency.trim() || 'COP',
        expense_type: formExpenseType || null,
        expense_type_id: formExpenseTypeId || null,
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

      setSaveSuccessMessage(
        editingTemplateId ? 'Plantilla actualizada exitosamente' : 'Nueva plantilla creada y guardada con éxito'
      );

      // Refresh catalog data
      await fetchTemplatesData();

      // Return to inspector view
      setTimeout(() => {
        setIsEditingInPanel(false);
        setSaveSuccessMessage(null);
      }, 1000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error inesperado al guardar';
      setSaveErrorMessage(msg);
    } finally {
      setIsSaving(false);
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

      setTemplates((prev) => prev.filter((t) => t.id !== templateId));
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error al eliminar');
    } finally {
      setDeletingId(null);
    }
  };

  // Filtered emails in the left panel
  const filteredEmails = useMemo(() => {
    return emails.filter((e) => {
      // Text query match
      if (emailSearchQuery.trim()) {
        const q = emailSearchQuery.toLowerCase();
        const textMatches =
          (e.subject || '').toLowerCase().includes(q) ||
          (e.sender || '').toLowerCase().includes(q) ||
          (e.body || e.plainBody || '').toLowerCase().includes(q);
        if (!textMatches) return false;
      }

      // Status chip match
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
        (t.entity_name && t.entity_name.toLowerCase().includes(templateSearchQuery.toLowerCase())) ||
        (t.subject_pattern && t.subject_pattern.toLowerCase().includes(templateSearchQuery.toLowerCase()));

      const matchesEntity =
        selectedEntityFilter === 'all' ||
        (t.entity_name && t.entity_name.toLowerCase() === selectedEntityFilter.toLowerCase());

      return matchesSearch && matchesEntity;
    });
  }, [templates, templateSearchQuery, selectedEntityFilter]);

  // Unique bank names from templates
  const availableEntityNames = useMemo(() => {
    const set = new Set<string>();
    templates.forEach((t) => {
      if (t.entity_name) set.add(t.entity_name);
    });
    return Array.from(set);
  }, [templates]);

  // Email status counts for badges
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
              Para inspeccionar tus correos bancarios y crear reglas de extracción automática en tiempo real, conecta tu cuenta de Google.
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
                    La API de Gmail aún no está habilitada en tu proyecto de Google Cloud. Haz clic en el siguiente enlace para activarla y luego reintenta.
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
                  <MailCheck className="w-4 h-4 text-emerald-400" />
                )}
                <span>Conectar con Google</span>
              </button>

              {authError && (
                <p className="text-xs text-rose-600 font-medium">{authError}</p>
              )}
            </div>
          )}

          <div className="pt-4 border-t border-zinc-100 flex items-center justify-center">
            <button
              type="button"
              onClick={() => router.back()}
              className="text-xs text-zinc-500 hover:text-zinc-900 font-medium inline-flex items-center space-x-1 transition cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Volver</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-5 pb-16">
      {/* Header & Mode Tabs */}
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
              Inspecciona correos reales, verifica coincidencias y diseña reglas de extracción en tiempo real.
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

        {/* Top View Selector: Explorer (Unified 2-panel) vs Catalog */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-zinc-100">
          <div className="flex items-center space-x-1.5 bg-zinc-100 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => {
                setActiveTab('explorer');
                setIsEditingInPanel(false);
              }}
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

            <button
              type="button"
              onClick={() => router.back()}
              className="text-xs text-zinc-500 hover:text-zinc-900 font-medium inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl hover:bg-zinc-100 transition cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-zinc-400" />
              <span>Volver</span>
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* VISTA 1: EXPLORADOR UNIFICADO EN 2 PANELES (BANDEJA + INSPECTOR/EDITOR)   */}
      {/* ========================================================================= */}
      {activeTab === 'explorer' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* ----------------------------------------------------------------- */}
          {/* PANEL IZQUIERDO: BANDEJA INTELIGENTE DE CORREOS (5 columnas)       */}
          {/* ----------------------------------------------------------------- */}
          <div className="lg:col-span-5 space-y-3">
            {/* Search and Status Filter Chips */}
            <div className="bg-white border border-zinc-200 rounded-2xl p-3.5 shadow-xs space-y-3">
              <div className="relative">
                <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={emailSearchQuery}
                  onChange={(e) => setEmailSearchQuery(e.target.value)}
                  placeholder="Buscar por banco, asunto o palabra clave..."
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

            {/* Email List Items */}
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
                  {emailSearchQuery ? 'Prueba con otro término de búsqueda.' : 'No hay correos en este filtro.'}
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
                      onClick={() => {
                        setSelectedEmailId(email.id);
                      }}
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

                      {/* Single Contextual Status Badge */}
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
                            <span>Conflicto ({survivingCount} plantillas)</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 font-medium text-zinc-600 bg-zinc-100 px-2 py-0.5 rounded-md">
                            <span>Sin plantilla coincidente</span>
                          </span>
                        )}

                        <span className="text-zinc-400 font-medium flex items-center text-[10px]">
                          {isSelected ? 'Inspeccionando' : 'Ver'}
                          <ChevronRight className="w-3 h-3 ml-0.5" />
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ----------------------------------------------------------------- */}
          {/* PANEL DERECHO: INSPECTOR Y EDITOR CONTEXTUAL (7 columnas)          */}
          {/* ----------------------------------------------------------------- */}
          <div className="lg:col-span-7 space-y-4">
            {!selectedEmail ? (
              <div className="bg-white border border-zinc-200 rounded-2xl p-12 text-center space-y-3 shadow-xs">
                <div className="w-12 h-12 rounded-2xl bg-zinc-100 flex items-center justify-center mx-auto text-zinc-400">
                  <Mail className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-zinc-900">Selecciona un correo</h3>
                  <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                    Haz clic en cualquier correo de la lista de la izquierda para ver su coincidencia o crear una plantilla con él.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* 1. STEPPER HORIZONTAL COMPACTO (Sustituye al modal repetitivo de 3 capas) */}
                <div className="bg-white border border-zinc-200 rounded-2xl p-3.5 sm:p-4 shadow-xs space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-100 pb-2.5">
                    <div className="space-y-0.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                        Correo Seleccionado
                      </span>
                      <h2 className="text-xs sm:text-sm font-bold text-zinc-900 truncate">
                        {selectedEmail.subject}
                      </h2>
                    </div>

                    <button
                      type="button"
                      onClick={() => setIsSampleBodyExpanded(!isSampleBodyExpanded)}
                      className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 inline-flex items-center gap-1 cursor-pointer self-start sm:self-center"
                    >
                      <Eye className="w-3 h-3" />
                      <span>{isSampleBodyExpanded ? 'Ocultar texto' : 'Ver texto completo'}</span>
                    </button>
                  </div>

                  {/* Collapsible raw email body text */}
                  {isSampleBodyExpanded && (
                    <div className="bg-zinc-900 text-zinc-100 p-3 rounded-xl font-mono text-[11px] max-h-44 overflow-y-auto whitespace-pre-wrap leading-relaxed border border-zinc-800 select-all">
                      {sampleBody || '(Cuerpo de correo vacío)'}
                    </div>
                  )}

                  {/* Horizontal Stepper */}
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    {/* Step 1: Entity */}
                    {(() => {
                      const passedL1 = (selectedDiagnosis?.level1?.passedEntities?.length ?? 0) > 0 || (selectedDiagnosis?.level1?.matchingEntities?.length ?? 0) > 0;
                      const entName = selectedDiagnosis?.level1?.matchingEntities?.[0]?.name || selectedDiagnosis?.level1?.passedEntities?.[0]?.entityName || 'No detectado';
                      return (
                        <div
                          className={`p-2.5 rounded-xl border flex flex-col justify-between ${
                            passedL1
                              ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                              : 'bg-zinc-50 border-zinc-200 text-zinc-600'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold uppercase tracking-wider">1. Entidad</span>
                            {passedL1 ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <X className="w-3.5 h-3.5 text-zinc-400" />}
                          </div>
                          <p className="font-semibold text-[11px] truncate mt-1">{passedL1 ? entName : 'Sin banco'}</p>
                        </div>
                      );
                    })()}

                    {/* Step 2: Subject */}
                    {(() => {
                      const survivingL2Count = selectedDiagnosis?.level2?.survivingTemplates?.length ?? 0;
                      const passedL2 = survivingL2Count > 0;
                      return (
                        <div
                          className={`p-2.5 rounded-xl border flex flex-col justify-between ${
                            passedL2
                              ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                              : 'bg-zinc-50 border-zinc-200 text-zinc-600'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold uppercase tracking-wider">2. Asunto</span>
                            {passedL2 ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <X className="w-3.5 h-3.5 text-zinc-400" />}
                          </div>
                          <p className="font-semibold text-[11px] truncate mt-1">
                            {passedL2 ? `${survivingL2Count} pasan` : 'No coincide'}
                          </p>
                        </div>
                      );
                    })()}

                    {/* Step 3: Body & Extraction */}
                    {(() => {
                      const survivingL3Count = selectedDiagnosis?.level3?.survivingTemplates?.length ?? 0;
                      const isConflict = survivingL3Count > 1;
                      const passedL3 = survivingL3Count > 0;
                      return (
                        <div
                          className={`p-2.5 rounded-xl border flex flex-col justify-between ${
                            isConflict
                              ? 'bg-amber-50 border-amber-300 text-amber-950'
                              : passedL3
                              ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                              : 'bg-zinc-50 border-zinc-200 text-zinc-600'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold uppercase tracking-wider">3. Extracción</span>
                            {isConflict ? (
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                            ) : passedL3 ? (
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <X className="w-3.5 h-3.5 text-zinc-400" />
                            )}
                          </div>
                          <p className="font-semibold text-[11px] truncate mt-1">
                            {isConflict ? 'Conflicto' : passedL3 ? 'Listo' : 'Sin match'}
                          </p>
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* 2. ESTADO: COINCIDENCIA ÚNICA (Visualización limpia, sin abrir editor innecesario) */}
                {!isEditingInPanel && selectedDiagnosis && selectedDiagnosis.level3?.survivingTemplates?.length === 1 && selectedDiagnosis.winner && (
                  <div className="bg-white border border-zinc-200 rounded-2xl p-5 shadow-xs space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-emerald-50/60 border border-emerald-200 rounded-2xl p-4">
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Coincidencia Exitosa</span>
                        </span>
                        <h3 className="text-base font-bold text-emerald-950">
                          {selectedDiagnosis.winner.template.name}
                        </h3>
                        <p className="text-xs text-emerald-800">
                          Esta plantilla procesará automáticamente este correo cuando ingrese a tu bandeja.
                        </p>
                      </div>

                      <div className="flex items-center gap-2 self-start sm:self-center">
                        <button
                          type="button"
                          onClick={() => {
                            populateFormWithTemplate(selectedDiagnosis.winner!.template, selectedEmail);
                          }}
                          className="inline-flex items-center space-x-1.5 px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold rounded-xl shadow-xs transition active:scale-95 cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Editar esta Plantilla</span>
                        </button>
                      </div>
                    </div>

                    {/* Extracted Fields Cards Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-3 space-y-1">
                        <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider block">
                          Monto Extraído
                        </span>
                        <p className="text-lg font-black text-emerald-700 tracking-tight">
                          {selectedDiagnosis.winner.extractedAmount
                            ? `$ ${formatCurrency(selectedDiagnosis.winner.extractedAmount)}`
                            : 'No detectado'}
                        </p>
                        <span className="text-[10px] text-zinc-400">{formCurrency}</span>
                      </div>

                      <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-3 space-y-1">
                        <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider block">
                          Comercio / Destino
                        </span>
                        <p className="text-xs font-bold text-zinc-900 line-clamp-2">
                          {selectedDiagnosis.winner.extractedMerchant || 'No detectado'}
                        </p>
                      </div>

                      <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-3 space-y-1">
                        <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider block">
                          Cuenta / Tarjeta
                        </span>
                        <p className="text-xs font-bold text-zinc-900">
                          {selectedDiagnosis.winner.extractedSourceAccount || 'Por defecto'}
                        </p>
                      </div>

                      <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-3 space-y-1">
                        <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider block">
                          Banco Emisor
                        </span>
                        <p className="text-xs font-bold text-zinc-900">
                          {selectedDiagnosis.winner.template.entity_name || selectedDiagnosis.winner.template.entity?.name || 'General'}
                        </p>
                      </div>
                    </div>

                    <div className="pt-2 flex items-center justify-between border-t border-zinc-100">
                      <button
                        type="button"
                        onClick={() => {
                          populateFormWithEmail(selectedEmail);
                          setIsEditingInPanel(true);
                        }}
                        className="text-xs font-semibold text-zinc-500 hover:text-zinc-900 transition cursor-pointer inline-flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Crear plantilla alternativa para este correo</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* 3. ESTADO: CONFLICTO (≥2 plantillas) */}
                {!isEditingInPanel && selectedDiagnosis && (selectedDiagnosis.level3?.survivingTemplates?.length ?? 0) > 1 && (
                  <div className="bg-white border border-amber-300 rounded-2xl p-5 shadow-xs space-y-4">
                    <div className="flex items-start space-x-3 bg-amber-50 p-4 rounded-xl text-amber-900">
                      <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <h3 className="text-sm font-bold">
                          Conflicto de plantillas ({selectedDiagnosis.level3?.survivingTemplates?.length} plantillas coinciden)
                        </h3>
                        <p className="text-xs text-amber-800 leading-relaxed">
                          Múltiples plantillas pasaron los 3 filtros para este correo. Para que el motor automático no tome una al azar, añade un <strong>patrón de desempate en el cuerpo</strong> (<code>match_pattern</code>) a una de ellas.
                        </p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-600">
                        Plantillas en Conflicto
                      </span>

                      <div className="space-y-2">
                        {selectedDiagnosis.level3.survivingTemplates.map((t) => (
                          <div
                            key={t.id}
                            className="bg-zinc-50 border border-zinc-200 rounded-xl p-3 flex items-center justify-between gap-3"
                          >
                            <div className="space-y-0.5">
                              <p className="text-xs font-bold text-zinc-900">{t.name}</p>
                              <p className="text-[11px] text-zinc-500">
                                Desempate actual: <code className="font-mono bg-zinc-200/70 px-1 py-0.5 rounded text-zinc-800">{t.match_pattern || '(ninguno)'}</code>
                              </p>
                            </div>

                            <button
                              type="button"
                              onClick={() => {
                                populateFormWithTemplate(t, selectedEmail);
                              }}
                              className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold rounded-xl transition cursor-pointer shrink-0"
                            >
                              Afinar esta plantilla
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* 4. ESTADO: EDITOR EN EL PANEL (Crear o Editar, con Extracción Inline y Autocompletar IA) */}
                {isEditingInPanel && (
                  <form onSubmit={handleSaveTemplate} className="bg-white border border-zinc-200 rounded-2xl p-5 shadow-xs space-y-5">
                    {/* Header with Direct AI Action */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-100 pb-3.5">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                          {editingTemplateId ? 'Ajustar Plantilla' : 'Nueva Plantilla'}
                        </span>
                        <h3 className="text-sm font-bold text-zinc-900">
                          {editingTemplateId ? formName : 'Configurar Extracción'}
                        </h3>
                      </div>

                      <div className="flex items-center gap-2">
                        {/* Direct Autocomplete with AI Button (No separate competing modal) */}
                        <button
                          type="button"
                          onClick={handleAISuggest}
                          disabled={isAISuggesting}
                          className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs transition active:scale-95 cursor-pointer disabled:opacity-50"
                          title="Analiza este correo con Gemini y autocompleta los campos"
                        >
                          {isAISuggesting ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Bot className="w-3.5 h-3.5 text-amber-300" />
                          )}
                          <span>Autocompletar con IA</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setShowJsonPasteFallback(!showJsonPasteFallback)}
                          className="p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-xl transition cursor-pointer text-xs"
                          title="Pegar JSON externo"
                        >
                          <Sliders className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* AI notifications */}
                    {aiSuggestSuccess && (
                      <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center space-x-2 text-emerald-800 text-xs font-medium">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>{aiSuggestSuccess}</span>
                      </div>
                    )}
                    {aiSuggestError && (
                      <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center space-x-2 text-rose-800 text-xs font-medium">
                        <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                        <span>{aiSuggestError}</span>
                      </div>
                    )}

                    {/* Collapsible JSON Paste Option */}
                    {showJsonPasteFallback && (
                      <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-xl space-y-2">
                        <p className="text-[11px] font-semibold text-zinc-700">
                          Pegar JSON devuelto por una IA externa:
                        </p>
                        <textarea
                          rows={3}
                          value={rawPastedJson}
                          onChange={(e) => setRawPastedJson(e.target.value)}
                          placeholder='{"name": "...", "amount_regex": "...", "subject_pattern": "..."}'
                          className="w-full p-2 text-xs bg-white border border-zinc-200 rounded-lg font-mono text-[11px]"
                        />
                        <button
                          type="button"
                          onClick={handleProcessPastedJson}
                          className="px-3 py-1 bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold rounded-lg transition"
                        >
                          Aplicar JSON
                        </button>
                      </div>
                    )}

                    {saveSuccessMessage && (
                      <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center space-x-2 text-emerald-800 text-xs font-medium">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>{saveSuccessMessage}</span>
                      </div>
                    )}
                    {saveErrorMessage && (
                      <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center space-x-2 text-rose-800 text-xs font-medium">
                        <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                        <span>{saveErrorMessage}</span>
                      </div>
                    )}

                    {/* Basic Meta */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-bold text-zinc-700 mb-1">
                          Nombre de la Plantilla <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={formName}
                          onChange={(e) => setFormName(e.target.value)}
                          placeholder="Ej: Bancolombia - Compras Débito"
                          className="w-full px-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-zinc-400 font-medium"
                        />
                      </div>

                      {/* Bank Entity */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs font-bold text-zinc-700">Banco / Entidad</label>
                          <button
                            type="button"
                            onClick={() => {
                              setFormIsNewEntity(!formIsNewEntity);
                              if (!formIsNewEntity) setFormEntityId(null);
                            }}
                            className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 transition cursor-pointer"
                          >
                            {formIsNewEntity ? 'Elegir de la lista' : '+ Nuevo banco'}
                          </button>
                        </div>

                        {formIsNewEntity ? (
                          <input
                            type="text"
                            value={formEntityName}
                            onChange={(e) => setFormEntityName(e.target.value)}
                            placeholder="Nombre del banco nuevo (ej: Lulo)"
                            className="w-full px-3 py-2 text-xs bg-amber-50/50 border border-amber-300 rounded-xl font-medium"
                          />
                        ) : (
                          <select
                            value={formEntityId || ''}
                            onChange={(e) => {
                              const val = e.target.value;
                              setFormEntityId(val || null);
                              const match = entities.find((ent) => ent.id === val);
                              if (match) setFormEntityName(match.name);
                            }}
                            className="w-full px-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-zinc-400"
                          >
                            {entities.map((ent) => (
                              <option key={ent.id} value={ent.id}>
                                {ent.name}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>

                      {/* Currency */}
                      <div>
                        <label className="block text-xs font-bold text-zinc-700 mb-1">Moneda</label>
                        <select
                          value={formCurrency}
                          onChange={(e) => setFormCurrency(e.target.value)}
                          className="w-full px-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-zinc-400"
                        >
                          <option value="COP">COP ($ Pesos colombianos)</option>
                          <option value="USD">USD ($ Dólares)</option>
                          <option value="EUR">EUR (€ Euros)</option>
                          <option value="MXN">MXN ($ Pesos mexicanos)</option>
                        </select>
                      </div>
                    </div>

                    {/* Identification Rules (Levels 2 & 3) */}
                    <div className="space-y-3 pt-2 border-t border-zinc-100">
                      <h4 className="text-[11px] font-bold text-zinc-900 uppercase tracking-wider">
                        Filtros de Asunto y Desempate
                      </h4>

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs font-semibold text-zinc-700">
                            Patrón para el Asunto (Nivel 2) <span className="text-rose-500">*</span>
                          </label>
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              liveExtraction.subjectMatched
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-zinc-100 text-zinc-500'
                            }`}
                          >
                            {liveExtraction.subjectMatched ? 'Coincide con muestra' : 'No coincide con muestra'}
                          </span>
                        </div>
                        <input
                          type="text"
                          required
                          value={formSubjectPattern}
                          onChange={(e) => setFormSubjectPattern(e.target.value)}
                          placeholder="Ej: Compra exitosa|Transferencia realizada"
                          className="w-full px-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-zinc-400 font-mono text-[11px]"
                        />
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs font-semibold text-zinc-700">
                            Patrón de Desempate en Cuerpo (Nivel 3 - Opcional)
                          </label>
                          {formMatchPattern && (
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                liveExtraction.matchPatternMatched
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-zinc-100 text-zinc-500'
                              }`}
                            >
                              {liveExtraction.matchPatternMatched ? 'Detectado en cuerpo' : 'No encontrado'}
                            </span>
                          )}
                        </div>
                        <input
                          type="text"
                          value={formMatchPattern}
                          onChange={(e) => setFormMatchPattern(e.target.value)}
                          placeholder="Ej: cuenta de ahorros|tarjeta de credito"
                          className="w-full px-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-zinc-400 font-mono text-[11px]"
                        />
                      </div>
                    </div>

                    {/* INLINE EXTRACTIONS: COLAPSED TICKET PREVIEW DIRECTLY NEXT TO EACH REGEX FIELD */}
                    <div className="space-y-3 pt-2 border-t border-zinc-100">
                      <h4 className="text-[11px] font-bold text-zinc-900 uppercase tracking-wider flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Reglas de Extracción con Validación en Vivo</span>
                      </h4>

                      {/* 1. Monto */}
                      <div className="space-y-1.5 bg-zinc-50/70 p-3 rounded-xl border border-zinc-200/70">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold text-zinc-900 flex items-center gap-1">
                            <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Monto del Gasto</span>
                            <span className="text-rose-500">*</span>
                          </label>

                          {/* Inline Capture Chip */}
                          <span
                            className={`text-[11px] font-bold px-2.5 py-0.5 rounded-lg inline-flex items-center gap-1 ${
                              liveExtraction.amount.matched
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-zinc-200 text-zinc-600'
                            }`}
                          >
                            {liveExtraction.amount.matched ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-600" />
                                <span>Captura: ${liveExtraction.amount.value}</span>
                              </>
                            ) : (
                              <span>Sin coincidencia</span>
                            )}
                          </span>
                        </div>
                        <input
                          type="text"
                          required
                          value={formAmountRegex}
                          onChange={(e) => setFormAmountRegex(e.target.value)}
                          placeholder="Ej: (?:\\$|COP|valor)\\s*\\$?([\\d.,]+)"
                          className="w-full px-3 py-1.5 text-xs bg-white border border-zinc-200 rounded-lg font-mono text-[11px]"
                        />
                      </div>

                      {/* 2. Comercio */}
                      <div className="space-y-1.5 bg-zinc-50/70 p-3 rounded-xl border border-zinc-200/70">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold text-zinc-900 flex items-center gap-1">
                            <Store className="w-3.5 h-3.5 text-zinc-600" />
                            <span>Comercio o Destinatario</span>
                          </label>

                          {/* Inline Capture Chip */}
                          <span
                            className={`text-[11px] font-bold px-2.5 py-0.5 rounded-lg inline-flex items-center gap-1 ${
                              liveExtraction.merchant.matched
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-zinc-200 text-zinc-600'
                            }`}
                          >
                            {liveExtraction.merchant.matched ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-600" />
                                <span className="truncate max-w-[140px]">{liveExtraction.merchant.value}</span>
                              </>
                            ) : (
                              <span>Sin coincidencia</span>
                            )}
                          </span>
                        </div>
                        <input
                          type="text"
                          value={formMerchantRegex}
                          onChange={(e) => setFormMerchantRegex(e.target.value)}
                          placeholder="Ej: en\\s+([A-Za-z0-9\\s.-]+?)(?:\\s+por|\\s+el|$)"
                          className="w-full px-3 py-1.5 text-xs bg-white border border-zinc-200 rounded-lg font-mono text-[11px]"
                        />
                      </div>

                      {/* 3. Cuenta */}
                      <div className="space-y-1.5 bg-zinc-50/70 p-3 rounded-xl border border-zinc-200/70">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold text-zinc-900 flex items-center gap-1">
                            <CreditCard className="w-3.5 h-3.5 text-zinc-600" />
                            <span>Cuenta o Tarjeta</span>
                          </label>

                          {/* Inline Capture Chip */}
                          <span
                            className={`text-[11px] font-bold px-2.5 py-0.5 rounded-lg inline-flex items-center gap-1 ${
                              liveExtraction.sourceAccount.matched
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-zinc-200 text-zinc-600'
                            }`}
                          >
                            {liveExtraction.sourceAccount.matched ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-600" />
                                <span>{liveExtraction.sourceAccount.value}</span>
                              </>
                            ) : (
                              <span>Sin coincidencia</span>
                            )}
                          </span>
                        </div>
                        <input
                          type="text"
                          value={formSourceAccountRegex}
                          onChange={(e) => setFormSourceAccountRegex(e.target.value)}
                          placeholder="Ej: tarjeta\\s*\\*?(\\d{4})"
                          className="w-full px-3 py-1.5 text-xs bg-white border border-zinc-200 rounded-lg font-mono text-[11px]"
                        />
                      </div>

                      {/* 4. Fecha */}
                      <div className="space-y-1.5 bg-zinc-50/70 p-3 rounded-xl border border-zinc-200/70">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold text-zinc-900 flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5 text-zinc-600" />
                            <span>Fecha del Movimiento</span>
                          </label>

                          {/* Inline Capture Chip */}
                          <span
                            className={`text-[11px] font-bold px-2.5 py-0.5 rounded-lg inline-flex items-center gap-1 ${
                              liveExtraction.date.matched
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-zinc-200 text-zinc-600'
                            }`}
                          >
                            {liveExtraction.date.matched ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-600" />
                                <span>{liveExtraction.date.value}</span>
                              </>
                            ) : (
                              <span>Sin coincidencia</span>
                            )}
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <input
                            type="text"
                            value={formDateRegex}
                            onChange={(e) => setFormDateRegex(e.target.value)}
                            placeholder="Ej: (?:el\\s+)?(\\d{1,2}[/-]\\d{1,2}[/-]\\d{2,4})"
                            className="col-span-2 px-3 py-1.5 text-xs bg-white border border-zinc-200 rounded-lg font-mono text-[11px]"
                          />
                          <select
                            value={formDateFormat}
                            onChange={(e) => setFormDateFormat(e.target.value)}
                            className="col-span-1 px-2 py-1.5 text-[11px] bg-white border border-zinc-200 rounded-lg"
                          >
                            <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                            <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                            <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-3 pt-3 border-t border-zinc-100">
                      <button
                        type="submit"
                        disabled={isSaving}
                        className="flex-1 inline-flex items-center justify-center space-x-2 px-4 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold rounded-xl shadow-xs transition active:scale-95 cursor-pointer disabled:opacity-50"
                      >
                        {isSaving ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Check className="w-4 h-4 text-emerald-400" />
                        )}
                        <span>{editingTemplateId ? 'Actualizar Plantilla' : 'Guardar Plantilla'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setIsEditingInPanel(false);
                        }}
                        className="px-4 py-2.5 bg-white border border-zinc-200 hover:bg-zinc-100 text-zinc-700 text-xs font-bold rounded-xl transition cursor-pointer"
                      >
                        Cancelar
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* VISTA 2: CATÁLOGO DE PLANTILLAS GUARDADAS (LISTA TRADICIONAL)              */}
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
                placeholder="Buscar por nombre, banco o patrón de asunto..."
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
              onClick={() => {
                setActiveTab('explorer');
                setIsEditingInPanel(true);
                setEditingTemplateId(null);
                setFormName('Nueva Plantilla');
              }}
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
                  {templateSearchQuery ? 'Prueba con otro término de búsqueda.' : 'Aún no has creado plantillas personalizadas.'}
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
                          {t.entity_name || 'General'}
                        </span>
                        <h3 className="text-sm font-bold text-zinc-900">{t.name}</h3>
                      </div>

                      <div className="flex items-center space-x-1">
                        <button
                          type="button"
                          onClick={() => {
                            populateFormWithTemplate(t);
                            setActiveTab('explorer');
                          }}
                          className="p-1.5 text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition cursor-pointer"
                          title="Editar plantilla en el explorador"
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
    </div>
  );
}
