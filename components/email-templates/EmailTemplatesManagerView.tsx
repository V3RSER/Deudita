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
  ExternalLink,
  RefreshCw,
  Sparkles,
  ArrowLeft,
  Receipt,
  CreditCard,
  Calendar,
  DollarSign,
  Store,
  Eye,
  Check,
  X,
  Loader2,
  Inbox,
  Send,
  HelpCircle,
  Copy,
  Bot,
  FileText,
  CornerDownRight,
  ArrowRight,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { cleanEmailBody, buildTemplatePrompt, parseAITemplateResponse } from '@/lib/email-cleaning';
import { CatalogEntity, CatalogTemplate } from '@/lib/email-matching';

interface EmailTemplatesManagerViewProps {
  initialMode?: 'catalog' | 'editor' | 'inbox';
}

interface IngestedEmail {
  id: string;
  sender: string;
  subject: string;
  body: string;
  date?: string;
  matchedTemplateName?: string;
  matchedAmount?: string;
}

export function EmailTemplatesManagerView({
  initialMode = 'catalog',
}: EmailTemplatesManagerViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Mode navigation: 'catalog' (list of templates), 'editor' (create/edit), 'inbox' (read emails)
  const [activeMode, setActiveMode] = useState<'catalog' | 'editor' | 'inbox'>(initialMode);

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

  // Inbox & Emails state
  const [emails, setEmails] = useState<IngestedEmail[]>([]);
  const [isLoadingEmails, setIsLoadingEmails] = useState<boolean>(false);
  const [emailSearchQuery, setEmailSearchQuery] = useState<string>('');
  const [emailsError, setEmailsError] = useState<string | null>(null);

  // Expense types catalog
  const [expenseTypes, setExpenseTypes] = useState<Array<{ id: string; name: string; label: string }>>([]);

  // Editor state
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
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
  
  // Sample email for live testing inside editor
  const [sampleSender, setSampleSender] = useState<string>('');
  const [sampleSubject, setSampleSubject] = useState<string>('');
  const [sampleBody, setSampleBody] = useState<string>('');
  const [showSampleSelector, setShowSampleSelector] = useState<boolean>(false);

  // AI Assistant Modal state
  const [isAIAssistantOpen, setIsAIAssistantOpen] = useState<boolean>(false);
  const [aiPromptText, setAiPromptText] = useState<string>('');
  const [aiPastedResponse, setAiPastedResponse] = useState<string>('');
  const [aiCopied, setAiCopied] = useState<boolean>(false);
  const [aiParseError, setAiParseError] = useState<string | null>(null);
  const [aiParseWarnings, setAiParseWarnings] = useState<string[]>([]);
  const [aiParseSuccess, setAiParseSuccess] = useState<string | null>(null);

  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Check authentication status
  const checkAuthStatus = useCallback(async () => {
    setAuthChecking(true);
    setAuthError(null);
    try {
      const storedToken = typeof window !== 'undefined' ? localStorage.getItem('google_provider_token') : null;
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
      } else if (data.authenticated) {
        setIsAuthorized(true);
        setUserEmail(data.email || null);
        setServiceDisabled(false);
      } else {
        setIsAuthorized(false);
      }
    } catch (err: unknown) {
      console.warn('[EmailTemplatesManagerView] Status check error:', err);
      setIsAuthorized(false);
    } finally {
      setAuthChecking(false);
    }
  }, []);

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

      const res = await fetch('/api/gmail/emails?maxResults=20', { headers });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'No se pudieron consultar los correos');
      }

      const rawEmails = Array.isArray(data.emails) ? data.emails : [];
      setEmails(rawEmails);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al cargar correos';
      setEmailsError(msg);
    } finally {
      setIsLoadingEmails(false);
    }
  }, []);

  // Initial load
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
          redirectTo: `${window.location.origin}/auth/callback`,
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

  // Live Regex Extraction Evaluator
  const extractionResults = useMemo(() => {
    const textToTest = cleanEmailBody(sampleBody);

    const testRegex = (pattern: string | null | undefined): { value: string | null; matched: boolean } => {
      if (!pattern || !pattern.trim() || !textToTest) return { value: null, matched: false };
      try {
        const regex = new RegExp(pattern, 'i');
        const match = textToTest.match(regex);
        if (match) {
          const val = match[1] !== undefined ? match[1].trim() : match[0].trim();
          return { value: val, matched: true };
        }
      } catch {
        // invalid regex
      }
      return { value: null, matched: false };
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

  // Open Editor for a new template
  const handleNewTemplate = () => {
    setEditingTemplateId(null);
    setFormName('');
    const defaultEntity = entities[0]?.name || 'Bancolombia';
    setFormEntityName(defaultEntity);
    setFormEntityId(entities[0]?.id || null);
    setFormIsNewEntity(false);
    setFormEntityEmailPattern('');
    setFormSubjectPattern('');
    setFormSenderPattern('');
    setFormMatchPattern('');
    setFormAmountRegex('\\$\\s*([\\d.,]+)');
    setFormMerchantRegex('en\\s+([A-Za-z0-9\\s.-]+?)(?:\\s+por|\\s+el|\\s*$)');
    setFormSourceAccountRegex('(?:cta|cuenta|tarjeta)\\s*\\*?(\\d{4})');
    setFormDateRegex('(?:el\\s+)?(\\d{1,2}[/-]\\d{1,2}[/-]\\d{2,4})');
    setFormDateFormat('DD/MM/YYYY');
    setFormTimeRegex('');
    setFormCurrencyRegex('');
    setFormCurrency('COP');
    setFormExpenseType('');
    setFormExpenseTypeId(null);
    setSaveSuccessMessage(null);
    setSaveErrorMessage(null);
    setActiveMode('editor');
  };

  // Open Editor for an existing template
  const handleEditTemplate = (tmpl: CatalogTemplate) => {
    setEditingTemplateId(tmpl.id);
    setFormName(tmpl.name);
    setFormEntityName(tmpl.entity_name || '');
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
    setSaveSuccessMessage(null);
    setSaveErrorMessage(null);
    setActiveMode('editor');
  };

  // Load an email from inbox directly into the editor
  const handleCreateTemplateFromEmail = (email: IngestedEmail) => {
    setEditingTemplateId(null);
    setSampleSender(email.sender);
    setSampleSubject(email.subject);
    setSampleBody(email.body);

    // Auto-detect entity name from sender or subject
    const lowerSender = (email.sender || '').toLowerCase();
    const lowerSubj = (email.subject || '').toLowerCase();
    let detectedEntity = 'Bancolombia';
    if (lowerSender.includes('nu') || lowerSubj.includes('nu')) detectedEntity = 'Nu';
    else if (lowerSender.includes('davivienda') || lowerSubj.includes('davivienda')) detectedEntity = 'Davivienda';
    else if (lowerSender.includes('bbva') || lowerSubj.includes('bbva')) detectedEntity = 'BBVA';
    else if (lowerSender.includes('lulo') || lowerSubj.includes('lulo')) detectedEntity = 'Lulo Bank';
    else if (lowerSender.includes('falabella') || lowerSubj.includes('falabella')) detectedEntity = 'Banco Falabella';

    const matchedEnt = entities.find((e) => e.name.toLowerCase() === detectedEntity.toLowerCase());

    setFormName(`${detectedEntity} - Notificación`);
    setFormEntityName(detectedEntity);
    setFormEntityId(matchedEnt ? matchedEnt.id : null);
    setFormIsNewEntity(!matchedEnt);
    setFormEntityEmailPattern('');
    setFormSubjectPattern(email.subject.replace(/([.*+?^${}()|[\]\\])/g, '\\$1'));
    setFormSenderPattern('');
    setFormMatchPattern('');
    setFormAmountRegex('\\$\\s*([\\d.,]+)');
    setFormMerchantRegex('en\\s+([A-Za-z0-9\\s.-]+?)(?:\\s+por|\\s+el|\\s*$)');
    setFormSourceAccountRegex('(?:cta|cuenta|tarjeta)\\s*\\*?(\\d{4})');
    setFormDateRegex('(?:el\\s+)?(\\d{1,2}[/-]\\d{1,2}[/-]\\d{2,4})');
    setFormDateFormat('DD/MM/YYYY');
    setFormTimeRegex('');
    setFormCurrencyRegex('');
    setFormCurrency('COP');
    setFormExpenseType('');
    setFormExpenseTypeId(null);

    setSaveSuccessMessage(null);
    setSaveErrorMessage(null);
    setActiveMode('editor');
  };

  // Open AI Assistant Modal
  const handleOpenAIAssistant = (customEmail?: IngestedEmail) => {
    const sender = customEmail ? customEmail.sender : sampleSender;
    const subject = customEmail ? customEmail.subject : sampleSubject;
    const rawBody = customEmail ? customEmail.body : sampleBody;

    if (customEmail) {
      setSampleSender(customEmail.sender);
      setSampleSubject(customEmail.subject);
      setSampleBody(customEmail.body);
    }

    const cleanBody = cleanEmailBody(rawBody);
    const existingEntityNames = entities.map((e) => e.name);
    const prompt = buildTemplatePrompt(sender, subject, cleanBody, existingEntityNames);

    setAiPromptText(prompt);
    setAiPastedResponse('');
    setAiParseError(null);
    setAiParseWarnings([]);
    setAiParseSuccess(null);
    setAiCopied(false);
    setIsAIAssistantOpen(true);
  };

  // Copy AI Prompt
  const handleCopyAIPrompt = async () => {
    try {
      await navigator.clipboard.writeText(aiPromptText);
      setAiCopied(true);
      setTimeout(() => setAiCopied(false), 2500);
    } catch {
      // fallback
    }
  };

  // Process and import AI response into the form
  const handleProcessAIPastedResponse = () => {
    if (!aiPastedResponse.trim()) {
      setAiParseError('Por favor pega el resultado devuelto por la IA antes de continuar.');
      return;
    }

    const result = parseAITemplateResponse(aiPastedResponse);
    if (!result.success || !result.data) {
      setAiParseError(result.error || 'No se pudo interpretar el formato JSON. Asegúrate de copiar la respuesta completa de la IA.');
      return;
    }

    const d = result.data;
    setAiParseError(null);
    setAiParseWarnings(result.warnings || []);

    if (d.name) setFormName(d.name);
    if (d.entity_name) setFormEntityName(d.entity_name);

    // Entity matching & detection
    const cleanEntName = (d.entity_name || '').toLowerCase();
    const matchedEntity = entities.find(
      (e) => e.name.toLowerCase() === cleanEntName
    );

    if (matchedEntity) {
      setFormEntityId(matchedEntity.id);
      setFormIsNewEntity(false);
      setFormEntityEmailPattern('');
    } else {
      setFormEntityId(null);
      setFormIsNewEntity(true);
      if (d.entity_email_pattern) {
        setFormEntityEmailPattern(d.entity_email_pattern);
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

    // Expense type matching
    if (d.expense_type) {
      setFormExpenseType(d.expense_type);
      const lowerEt = d.expense_type.toLowerCase();
      const matchedEt = expenseTypes.find(
        (et) => et.name.toLowerCase() === lowerEt || (et.label && et.label.toLowerCase() === lowerEt)
      );
      if (matchedEt) {
        setFormExpenseTypeId(matchedEt.id);
      }
    }

    setAiParseSuccess('¡Datos de la plantilla interpretados y cargados con éxito!');
    setTimeout(() => {
      setIsAIAssistantOpen(false);
      setAiParseSuccess(null);
      setActiveMode('editor');
    }, 900);
  };

  // Save or Update Template
  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      setSaveErrorMessage('El nombre de la plantilla es obligatorio');
      return;
    }
    if (!formAmountRegex.trim()) {
      setSaveErrorMessage('El patrón para extraer el monto es obligatorio');
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
        id: editingTemplateId,
        name: formName.trim(),
        entity_name: formEntityName.trim() || null,
        entity_id: formEntityId || null,
        entity_email_pattern: formIsNewEntity ? formEntityEmailPattern.trim() || null : null,
        subject_pattern: formSubjectPattern.trim() || null,
        sender_pattern: formSenderPattern.trim() || null,
        match_pattern: formMatchPattern.trim() || null,
        amount_regex: formAmountRegex.trim(),
        merchant_regex: formMerchantRegex.trim() || null,
        source_account_regex: formSourceAccountRegex.trim() || null,
        date_regex: formDateRegex.trim() || null,
        date_format: formDateFormat.trim() || 'DD/MM/YYYY',
        time_regex: formTimeRegex.trim() || null,
        currency_regex: formCurrencyRegex.trim() || null,
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
        editingTemplateId
          ? 'Plantilla actualizada exitosamente'
          : 'Nueva plantilla creada y guardada con éxito'
      );

      // Refresh list
      fetchTemplatesData();

      // Return to catalog after short delay
      setTimeout(() => {
        setActiveMode('catalog');
        setSaveSuccessMessage(null);
      }, 1200);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error inesperado al guardar';
      setSaveErrorMessage(msg);
    } finally {
      setIsSaving(false);
    }
  };

  // Delete Template
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

  // Filtered Templates
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

  // Filtered Emails
  const filteredEmails = useMemo(() => {
    return emails.filter((e) => {
      if (!emailSearchQuery) return true;
      const q = emailSearchQuery.toLowerCase();
      return (
        e.subject.toLowerCase().includes(q) ||
        e.sender.toLowerCase().includes(q) ||
        e.body.toLowerCase().includes(q)
      );
    });
  }, [emails, emailSearchQuery]);

  // Unique entities from templates
  const availableEntityNames = useMemo(() => {
    const set = new Set<string>();
    templates.forEach((t) => {
      if (t.entity_name) set.add(t.entity_name);
    });
    return Array.from(set);
  }, [templates]);

  // Loading Screen
  if (authChecking) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] p-8 space-y-4">
        <Loader2 className="w-8 h-8 animate-spin text-zinc-900" />
        <p className="text-sm font-medium text-zinc-600">Verificando acceso a plantillas...</p>
      </div>
    );
  }

  // Not Authorized: Sleek restricted access view
  if (!isAuthorized) {
    return (
      <div className="max-w-xl mx-auto py-12 px-4">
        <div className="bg-white border border-zinc-200 rounded-2xl p-6 sm:p-8 shadow-sm space-y-6 text-center">
          <div className="w-14 h-14 bg-indigo-50 border border-indigo-100 rounded-2xl flex items-center justify-center mx-auto text-indigo-600">
            <Sparkles className="w-7 h-7" />
          </div>

          <div className="space-y-2">
            <h2 className="text-xl font-bold text-zinc-900">
              Gestor de Plantillas de Correo
            </h2>
            <p className="text-sm text-zinc-600 leading-relaxed max-w-md mx-auto">
              Para crear, probar y administrar reglas de extracción automática de tus notificaciones bancarias, conecta tu cuenta de Google con acceso de lectura.
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
                    La API de Gmail aún no está habilitada en tu proyecto de Google Cloud. Haz clic en el siguiente enlace para activarla y luego reintenta la verificación.
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
              onClick={() => router.push('/drafts')}
              className="text-xs text-zinc-500 hover:text-zinc-900 font-medium inline-flex items-center space-x-1 transition cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Volver a Tickets</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Authorized: Full polished Template Management experience
  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-16">
      {/* Top Header & Navigation Bar */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-4 sm:p-6 shadow-2xs space-y-4">
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
              Personaliza reglas para extraer montos, comercios y cuentas de tus correos bancarios automáticamente.
            </p>
          </div>

          {/* Account status badge */}
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

        {/* Navigation Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-zinc-100">
          <div className="flex items-center space-x-1.5 bg-zinc-100 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setActiveMode('catalog')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center space-x-1.5 ${
                activeMode === 'catalog'
                  ? 'bg-white text-zinc-900 shadow-2xs'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Mis Plantillas</span>
              <span className="ml-1 px-1.5 py-0.2 rounded-full bg-zinc-200 text-zinc-800 text-[10px] font-bold">
                {templates.length}
              </span>
            </button>

            <button
              type="button"
              onClick={handleNewTemplate}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center space-x-1.5 ${
                activeMode === 'editor' && !editingTemplateId
                  ? 'bg-white text-zinc-900 shadow-2xs'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Crear Plantilla</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveMode('inbox')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center space-x-1.5 ${
                activeMode === 'inbox'
                  ? 'bg-white text-zinc-900 shadow-2xs'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              <Inbox className="w-3.5 h-3.5" />
              <span>Bandeja de Correos</span>
              {emails.length > 0 && (
                <span className="ml-1 px-1.5 py-0.2 rounded-full bg-zinc-200 text-zinc-800 text-[10px] font-bold">
                  {emails.length}
                </span>
              )}
            </button>
          </div>

          <button
            type="button"
            onClick={() => router.push('/drafts')}
            className="text-xs text-zinc-500 hover:text-zinc-900 font-medium inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl hover:bg-zinc-100 transition cursor-pointer ml-auto"
          >
            <Receipt className="w-3.5 h-3.5 text-zinc-400" />
            <span>Ver Tickets</span>
          </button>
        </div>
      </div>

      {/* ================= MODE 1: MIS PLANTILLAS (CATALOG) ================= */}
      {activeMode === 'catalog' && (
        <div className="space-y-4">
          {/* Controls: Search and Bank Filter */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3.5 border border-zinc-200 rounded-2xl shadow-2xs">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={templateSearchQuery}
                onChange={(e) => setTemplateSearchQuery(e.target.value)}
                placeholder="Buscar plantilla por nombre, banco o asunto..."
                className="w-full pl-9 pr-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-zinc-400 transition"
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
              onClick={handleNewTemplate}
              className="inline-flex items-center justify-center space-x-1.5 px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-semibold rounded-xl shadow-2xs transition cursor-pointer shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Nueva Plantilla</span>
            </button>
          </div>

          {/* Templates Grid */}
          {isLoadingTemplates ? (
            <div className="bg-white border border-zinc-200 rounded-2xl p-12 text-center space-y-2">
              <Loader2 className="w-6 h-6 animate-spin text-zinc-500 mx-auto" />
              <p className="text-xs text-zinc-500">Cargando catálogo de plantillas...</p>
            </div>
          ) : filteredTemplates.length === 0 ? (
            <div className="bg-white border border-zinc-200 rounded-2xl p-12 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-zinc-100 flex items-center justify-center mx-auto text-zinc-400">
                <Layers className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-zinc-900">No se encontraron plantillas</h3>
                <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                  {templateSearchQuery
                    ? 'No hay plantillas que coincidan con la búsqueda actual.'
                    : 'Aún no has creado plantillas personalizadas.'}
                </p>
              </div>
              <button
                type="button"
                onClick={handleNewTemplate}
                className="inline-flex items-center space-x-1.5 px-4 py-2 text-xs font-semibold bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Crear primera plantilla</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {filteredTemplates.map((t) => (
                <div
                  key={t.id}
                  className="bg-white border border-zinc-200 rounded-2xl p-4 space-y-3.5 shadow-2xs hover:border-zinc-300 transition flex flex-col justify-between"
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
                          onClick={() => handleEditTemplate(t)}
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

                  {/* Extracted fields indicator */}
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

      {/* ================= MODE 2: CREAR / EDITAR PLANTILLA ================= */}
      {activeMode === 'editor' && (
        <form onSubmit={handleSaveTemplate} className="space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setActiveMode('catalog')}
              className="inline-flex items-center space-x-1.5 text-xs font-semibold text-zinc-600 hover:text-zinc-900 transition cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Volver a Mis Plantillas</span>
            </button>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => handleOpenAIAssistant()}
                className="inline-flex items-center space-x-2 px-3.5 py-1.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs transition active:scale-95 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                <span>Asistente IA (Generar / Importar)</span>
              </button>

              <span className="text-xs font-bold px-3 py-1.5 rounded-xl bg-zinc-100 text-zinc-700 border border-zinc-200">
                {editingTemplateId ? 'Modo Edición' : 'Nueva Plantilla'}
              </span>
            </div>
          </div>

          {saveSuccessMessage && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center space-x-2 text-emerald-800 text-xs font-medium">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{saveSuccessMessage}</span>
            </div>
          )}

          {saveErrorMessage && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-center space-x-2 text-rose-800 text-xs font-medium">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{saveErrorMessage}</span>
            </div>
          )}

          {/* 2-Column Responsive Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column: Reference Email and Bank Rules (7 cols) */}
            <div className="lg:col-span-7 space-y-5">
              {/* Sample Email Reference Box */}
              <div className="bg-white border border-zinc-200 rounded-2xl p-4 sm:p-5 shadow-2xs space-y-3.5">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <h3 className="text-xs font-bold text-zinc-900 uppercase tracking-wider flex items-center gap-1.5">
                      <Mail className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Correo de Muestra / Referencia</span>
                    </h3>
                    <p className="text-xs text-zinc-500">
                      Pega o selecciona un correo real para validar las extracciones en vivo.
                    </p>
                  </div>

                  {emails.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowSampleSelector(!showSampleSelector)}
                      className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition cursor-pointer underline"
                    >
                      {showSampleSelector ? 'Cerrar selector' : 'Elegir de mi Gmail'}
                    </button>
                  )}
                </div>

                {/* Dropdown sample selector */}
                {showSampleSelector && (
                  <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-3 space-y-2 max-h-56 overflow-y-auto">
                    <p className="text-[11px] font-semibold text-zinc-600">
                      Selecciona un correo reciente para cargar su contenido:
                    </p>
                    <div className="space-y-1">
                      {emails.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            setSampleSender(m.sender);
                            setSampleSubject(m.subject);
                            setSampleBody(m.body);
                            setShowSampleSelector(false);
                            if (!formSubjectPattern) {
                              setFormSubjectPattern(m.subject.replace(/([.*+?^${}()|[\]\\])/g, '\\$1'));
                            }
                          }}
                          className="w-full text-left p-2 hover:bg-white rounded-lg transition border border-transparent hover:border-zinc-200 text-xs space-y-0.5 cursor-pointer"
                        >
                          <p className="font-semibold text-zinc-900 truncate">{m.subject}</p>
                          <p className="text-[10px] text-zinc-500 truncate">{m.sender}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                        Remitente de muestra
                      </label>
                      <input
                        type="text"
                        value={sampleSender}
                        onChange={(e) => setSampleSender(e.target.value)}
                        placeholder="Ej: alertas@bancolombia.com.co"
                        className="w-full px-3 py-1.5 text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-zinc-400 font-mono text-[11px]"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                        Asunto de muestra
                      </label>
                      <input
                        type="text"
                        value={sampleSubject}
                        onChange={(e) => setSampleSubject(e.target.value)}
                        placeholder="Ej: Bancolombia le informa Transferencia exitosa"
                        className="w-full px-3 py-1.5 text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-zinc-400 font-mono text-[11px]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                      Cuerpo del correo (texto)
                    </label>
                    <textarea
                      rows={4}
                      value={sampleBody}
                      onChange={(e) => setSampleBody(e.target.value)}
                      placeholder="Pega aquí el contenido del correo bancario para probar los patrones..."
                      className="w-full px-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-zinc-400 font-mono text-[11px] leading-relaxed"
                    />
                  </div>
                </div>
              </div>

              {/* Template Configuration */}
              <div className="bg-white border border-zinc-200 rounded-2xl p-4 sm:p-5 shadow-2xs space-y-4">
                <h3 className="text-xs font-bold text-zinc-900 uppercase tracking-wider">
                  1. Clasificación y Banco
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-zinc-700 mb-1">
                      Nombre descriptivo de la Plantilla <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      placeholder="Ej: Compra con Tarjeta Nu, Transferencia Bancolombia"
                      className="w-full px-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-zinc-400 font-medium"
                    />
                  </div>

                  {/* Bank / Entity Selector */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-semibold text-zinc-700">
                        Banco / Entidad
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setFormIsNewEntity(!formIsNewEntity);
                          if (!formIsNewEntity) {
                            setFormEntityId(null);
                          } else if (entities.length > 0) {
                            setFormEntityName(entities[0].name);
                            setFormEntityId(entities[0].id);
                          }
                        }}
                        className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 transition cursor-pointer"
                      >
                        {formIsNewEntity ? 'Elegir existente' : '+ Nuevo banco'}
                      </button>
                    </div>

                    {formIsNewEntity ? (
                      <input
                        type="text"
                        value={formEntityName}
                        onChange={(e) => setFormEntityName(e.target.value)}
                        placeholder="Nombre del nuevo banco (ej: Lulo Bank)"
                        className="w-full px-3 py-2 text-xs bg-amber-50/50 border border-amber-300 rounded-xl focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-amber-500 font-medium text-amber-900"
                      />
                    ) : (
                      <select
                        value={formEntityId || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === '__new__') {
                            setFormIsNewEntity(true);
                            setFormEntityId(null);
                          } else {
                            setFormEntityId(val);
                            const found = entities.find((ent) => ent.id === val);
                            if (found) setFormEntityName(found.name);
                          }
                        }}
                        className="w-full px-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-zinc-400"
                      >
                        {entities.map((ent) => (
                          <option key={ent.id} value={ent.id}>
                            {ent.name}
                          </option>
                        ))}
                        <option value="__new__">+ Registrar otro banco...</option>
                      </select>
                    )}
                  </div>

                  {/* Expense Type */}
                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 mb-1">
                      Tipo de Gasto Predeterminado
                    </label>
                    <select
                      value={formExpenseTypeId || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        setFormExpenseTypeId(val || null);
                        const match = expenseTypes.find((et) => et.id === val);
                        if (match) setFormExpenseType(match.name);
                      }}
                      className="w-full px-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-zinc-400"
                    >
                      <option value="">(Sin asignar o genérico)</option>
                      {expenseTypes.map((et) => (
                        <option key={et.id} value={et.id}>
                          {et.label || et.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* New Entity Pattern (If creating new bank) */}
                  {formIsNewEntity && (
                    <div className="sm:col-span-2 p-3 bg-amber-50/70 border border-amber-200 rounded-xl space-y-1">
                      <label className="block text-[11px] font-bold text-amber-900">
                        Patrón de Correo del Banco (Nivel 1)
                      </label>
                      <input
                        type="text"
                        value={formEntityEmailPattern}
                        onChange={(e) => setFormEntityEmailPattern(e.target.value)}
                        placeholder="Ej: @lulobank\\.com o @notificaciones\\.bancodebogota\\.com"
                        className="w-full px-3 py-1.5 text-xs bg-white border border-amber-300 rounded-lg font-mono text-[11px] focus:outline-hidden focus:ring-1 focus:ring-amber-500"
                      />
                      <p className="text-[10px] text-amber-700 leading-tight">
                        Se guardará como patrón de remitente para que el motor identifique automáticamente este banco al recibir correos.
                      </p>
                    </div>
                  )}

                  {/* Default currency */}
                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 mb-1">
                      Moneda por defecto
                    </label>
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

                  {/* Sender pattern (optional) */}
                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 mb-1">
                      Filtro Remitente Específico (Opcional)
                    </label>
                    <input
                      type="text"
                      value={formSenderPattern}
                      onChange={(e) => setFormSenderPattern(e.target.value)}
                      placeholder="Ej: alertas@bancolombia.com"
                      className="w-full px-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-zinc-400 font-mono text-[11px]"
                    />
                  </div>
                </div>

                <div className="pt-2 border-t border-zinc-100 space-y-3">
                  <h4 className="text-xs font-bold text-zinc-900 uppercase tracking-wider">
                    2. Reglas de Identificación (Nivel 2 y 3)
                  </h4>

                  {/* Subject pattern */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-semibold text-zinc-700">
                        Patrón para el Asunto (Nivel 2) <span className="text-rose-500">*</span>
                      </label>
                      {sampleSubject && (
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            extractionResults.subjectMatched
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-rose-50 text-rose-700 border border-rose-200'
                          }`}
                        >
                          {extractionResults.subjectMatched ? 'Coincide con muestra' : 'No coincide con muestra'}
                        </span>
                      )}
                    </div>
                    <input
                      type="text"
                      required
                      value={formSubjectPattern}
                      onChange={(e) => setFormSubjectPattern(e.target.value)}
                      placeholder="Ej: Compra exitosa|Transferencia realizada|Pago recibido"
                      className="w-full px-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-zinc-400 font-mono text-[11px]"
                    />
                  </div>

                  {/* Match pattern (body tie-breaker) */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-semibold text-zinc-700">
                        Patrón de Desempate en el Cuerpo (Nivel 3)
                      </label>
                      {formMatchPattern && sampleBody && (
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            extractionResults.matchPatternMatched
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-zinc-100 text-zinc-600'
                          }`}
                        >
                          {extractionResults.matchPatternMatched ? 'Detectado en cuerpo' : 'No encontrado en cuerpo'}
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
                    <p className="text-[10px] text-zinc-500 mt-1">
                      Opcional. Útil si el banco envía correos con el mismo asunto para dos tipos de operaciones distintas.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Extracted Data & Live Ticket Mockup (5 cols) */}
            <div className="lg:col-span-5 space-y-5">
              {/* Extraction Rules with Live Feedback */}
              <div className="bg-white border border-zinc-200 rounded-2xl p-4 sm:p-5 shadow-2xs space-y-4">
                <h3 className="text-xs font-bold text-zinc-900 uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                  <span>3. Extracción de Datos (Expresiones Regulares)</span>
                </h3>

                {/* 1. Monto */}
                <div className="space-y-1.5 bg-zinc-50/70 p-3 rounded-xl border border-zinc-200/60">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-zinc-900 flex items-center gap-1">
                      <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Monto del Gasto</span>
                      <span className="text-rose-500">*</span>
                    </label>
                    <span
                      className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${
                        extractionResults.amount.matched
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-zinc-200 text-zinc-600'
                      }`}
                    >
                      {extractionResults.amount.matched
                        ? `$ ${extractionResults.amount.value}`
                        : 'No detectado'}
                    </span>
                  </div>
                  <input
                    type="text"
                    required
                    value={formAmountRegex}
                    onChange={(e) => setFormAmountRegex(e.target.value)}
                    placeholder="Ej: \\$\\s*([\\d.,]+)"
                    className="w-full px-3 py-1.5 text-xs bg-white border border-zinc-200 rounded-lg font-mono text-[11px]"
                  />
                </div>

                {/* 2. Comercio / Concepto */}
                <div className="space-y-1.5 bg-zinc-50/70 p-3 rounded-xl border border-zinc-200/60">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-zinc-900 flex items-center gap-1">
                      <Store className="w-3.5 h-3.5 text-zinc-600" />
                      <span>Comercio o Destinatario</span>
                    </label>
                    <span
                      className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${
                        extractionResults.merchant.matched
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-zinc-200 text-zinc-600'
                      }`}
                    >
                      {extractionResults.merchant.matched
                        ? extractionResults.merchant.value
                        : 'No detectado'}
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

                {/* 3. Cuenta / Tarjeta */}
                <div className="space-y-1.5 bg-zinc-50/70 p-3 rounded-xl border border-zinc-200/60">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-zinc-900 flex items-center gap-1">
                      <CreditCard className="w-3.5 h-3.5 text-zinc-600" />
                      <span>Cuenta o Medio</span>
                    </label>
                    <span
                      className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${
                        extractionResults.sourceAccount.matched
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-zinc-200 text-zinc-600'
                      }`}
                    >
                      {extractionResults.sourceAccount.matched
                        ? extractionResults.sourceAccount.value
                        : 'No detectado'}
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

                {/* 4. Fecha y Formato */}
                <div className="space-y-1.5 bg-zinc-50/70 p-3 rounded-xl border border-zinc-200/60">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-zinc-900 flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-zinc-600" />
                      <span>Fecha del Movimiento</span>
                    </label>
                    <span
                      className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${
                        extractionResults.date.matched
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-zinc-200 text-zinc-600'
                      }`}
                    >
                      {extractionResults.date.matched
                        ? extractionResults.date.value
                        : 'No detectado'}
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

                {/* 5. Hora (Opcional) */}
                <div className="space-y-1.5 bg-zinc-50/70 p-3 rounded-xl border border-zinc-200/60">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-zinc-900 flex items-center gap-1">
                      <span>Hora (Opcional)</span>
                    </label>
                    <span
                      className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${
                        extractionResults.time.matched
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-zinc-200 text-zinc-600'
                      }`}
                    >
                      {extractionResults.time.matched
                        ? extractionResults.time.value
                        : 'No detectado'}
                    </span>
                  </div>
                  <input
                    type="text"
                    value={formTimeRegex}
                    onChange={(e) => setFormTimeRegex(e.target.value)}
                    placeholder="Ej: (\\d{1,2}:\\d{2}(?:\\s*[ap]\\.?m\\.?)?)"
                    className="w-full px-3 py-1.5 text-xs bg-white border border-zinc-200 rounded-lg font-mono text-[11px]"
                  />
                </div>
              </div>

              {/* Live Ticket Mockup */}
              <div className="bg-gradient-to-br from-zinc-900 to-zinc-800 text-white rounded-2xl p-4 sm:p-5 space-y-3 shadow-sm">
                <div className="flex items-center justify-between border-b border-zinc-700/60 pb-2.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                    Vista Previa del Ticket Generado
                  </span>
                  <span className="text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                    Automático
                  </span>
                </div>

                <div className="space-y-1.5">
                  <span className="text-xs text-zinc-400 font-medium">
                    {formEntityName || 'Banco'} {formExpenseType ? `• ${formExpenseType}` : ''}
                  </span>
                  <h4 className="text-base font-bold text-white">
                    {extractionResults.merchant.value || formName || 'Compra registrada'}
                  </h4>
                  <div className="text-2xl font-black text-emerald-400 tracking-tight">
                    {extractionResults.amount.matched
                      ? `$ ${extractionResults.amount.value} ${formCurrency}`
                      : `$ 0 ${formCurrency}`}
                  </div>
                </div>

                <div className="pt-2 border-t border-zinc-700/60 flex items-center justify-between text-xs text-zinc-400">
                  <span>
                    Cuenta: {extractionResults.sourceAccount.value || 'Por defecto'}
                  </span>
                  <span>
                    {extractionResults.date.value ? `Fecha: ${extractionResults.date.value}` : 'Listo para sincronizar'}
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-3 pt-2">
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
                  onClick={() => setActiveMode('catalog')}
                  className="px-4 py-2.5 bg-white border border-zinc-200 hover:bg-zinc-100 text-zinc-800 text-xs font-bold rounded-xl transition cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </form>
      )}

      {/* ================= MODE 3: BANDEJA DE CORREOS ================= */}
      {activeMode === 'inbox' && (
        <div className="space-y-4">
          <div className="bg-white border border-zinc-200 rounded-2xl p-4 shadow-2xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={emailSearchQuery}
                onChange={(e) => setEmailSearchQuery(e.target.value)}
                placeholder="Buscar en tus correos por remitente, asunto o palabras clave..."
                className="w-full pl-9 pr-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-zinc-400"
              />
            </div>

            <button
              type="button"
              onClick={fetchInboxEmails}
              disabled={isLoadingEmails}
              className="inline-flex items-center space-x-1.5 px-3.5 py-2 text-xs font-semibold bg-zinc-100 hover:bg-zinc-200 text-zinc-800 rounded-xl transition cursor-pointer shrink-0 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingEmails ? 'animate-spin' : ''}`} />
              <span>Actualizar Correos</span>
            </button>
          </div>

          {emailsError && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-center space-x-2 text-rose-800 text-xs">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{emailsError}</span>
            </div>
          )}

          {isLoadingEmails ? (
            <div className="bg-white border border-zinc-200 rounded-2xl p-12 text-center space-y-2">
              <Loader2 className="w-6 h-6 animate-spin text-zinc-500 mx-auto" />
              <p className="text-xs text-zinc-500">Leyendo correos de tu bandeja de entrada...</p>
            </div>
          ) : filteredEmails.length === 0 ? (
            <div className="bg-white border border-zinc-200 rounded-2xl p-12 text-center space-y-2">
              <Inbox className="w-8 h-8 text-zinc-400 mx-auto" />
              <p className="text-xs font-semibold text-zinc-700">No se encontraron correos recientes</p>
              <p className="text-xs text-zinc-400">
                Asegúrate de que tu cuenta reciba notificaciones de tus bancos.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredEmails.map((email) => (
                <div
                  key={email.id}
                  className="bg-white border border-zinc-200 rounded-2xl p-4 sm:p-5 shadow-2xs space-y-3 hover:border-zinc-300 transition"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="space-y-0.5">
                      <p className="text-xs font-bold text-zinc-900">{email.subject}</p>
                      <p className="text-[11px] text-zinc-500">{email.sender}</p>
                    </div>

                    <div className="flex items-center gap-2 self-start sm:self-center">
                      <button
                        type="button"
                        onClick={() => handleOpenAIAssistant(email)}
                        className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs transition active:scale-95 cursor-pointer"
                        title="Abrir asistente de IA con este correo"
                      >
                        <Bot className="w-3.5 h-3.5 text-amber-300" />
                        <span>Asistente IA</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleCreateTemplateFromEmail(email)}
                        className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-xs font-semibold rounded-xl transition cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Manual</span>
                      </button>
                    </div>
                  </div>

                  <p className="text-xs text-zinc-600 line-clamp-2 bg-zinc-50 p-2.5 rounded-xl font-mono text-[11px] leading-relaxed">
                    {cleanEmailBody(email.body)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ================= MODAL: ASISTENTE IA (PROMPT & PARSER) ================= */}
      {isAIAssistantOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl border border-zinc-200 shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-5 sm:p-6 border-b border-zinc-100 flex items-start justify-between gap-4 bg-zinc-50/70">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center text-white shadow-xs">
                  <Bot className="w-5 h-5 text-amber-300" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-zinc-900">
                    Asistente de Plantillas con IA
                  </h3>
                  <p className="text-xs text-zinc-500">
                    Genera el prompt estructurado, envíalo a tu IA y pega el JSON para autocompletar.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsAIAssistantOpen(false)}
                className="p-2 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-xl transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 sm:p-6 space-y-6 overflow-y-auto flex-1 text-xs text-zinc-700">
              {/* Step 1: Copy Prompt */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-zinc-900 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                    <span className="w-4 h-4 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center text-[10px] font-black">
                      1
                    </span>
                    <span>Copia el Prompt para la IA</span>
                  </span>

                  <button
                    type="button"
                    onClick={handleCopyAIPrompt}
                    className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-violet-50 hover:bg-violet-100 text-violet-700 border border-violet-200 font-bold rounded-xl transition active:scale-95 cursor-pointer text-xs"
                  >
                    {aiPromptCopied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="text-emerald-700">¡Copiado!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copiar Prompt</span>
                      </>
                    )}
                  </button>
                </div>

                <p className="text-zinc-500 text-xs">
                  Copia este prompt y envíalo a Gemini, ChatGPT o Claude. La IA analizará el correo y te devolverá el JSON con la configuración óptima.
                </p>

                <div className="bg-zinc-900 text-zinc-100 p-3.5 rounded-2xl font-mono text-[11px] max-h-40 overflow-y-auto leading-relaxed border border-zinc-800 select-all">
                  {aiGeneratedPrompt || 'Cargando correo de referencia...'}
                </div>
              </div>

              {/* Step 2: Paste Response */}
              <div className="space-y-3 pt-4 border-t border-zinc-100">
                <span className="font-bold text-zinc-900 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center text-[10px] font-black">
                    2
                  </span>
                  <span>Pega la Respuesta en JSON de la IA</span>
                </span>

                <p className="text-zinc-500 text-xs">
                  Pega aquí la respuesta recibida (puede incluir bloques de código markdown ```json):
                </p>

                <textarea
                  rows={6}
                  value={aiPastedResponse}
                  onChange={(e) => {
                    setAiPastedResponse(e.target.value);
                    if (aiParseError) setAiParseError(null);
                  }}
                  placeholder='{\n  "template_name": "Compra Tarjeta Nu",\n  "entity_name": "Nu",\n  "subject_pattern": "Compra exitosa",\n  "amount_regex": "\\\\$\\\\s*([\\\\d.,]+)",\n  "merchant_regex": "en\\\\s+([A-Za-z0-9\\\\s.-]+?)(?:\\\\s+por|$)",\n  "expense_type": "Compra"\n}'
                  className="w-full px-3.5 py-2.5 text-xs bg-zinc-50 border border-zinc-200 rounded-2xl focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-violet-500 font-mono text-[11px] leading-relaxed"
                />

                {/* Error Banner */}
                {aiParseError && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center space-x-2 text-rose-800 text-xs font-medium">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>{aiParseError}</span>
                  </div>
                )}

                {/* Warnings Banner */}
                {aiParseWarnings.length > 0 && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-1 text-amber-900 text-xs">
                    <p className="font-bold">Aviso sobre los patrones extraídos:</p>
                    <ul className="list-disc list-inside space-y-0.5 text-[11px] text-amber-800">
                      {aiParseWarnings.map((w, idx) => (
                        <li key={idx}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Success Banner */}
                {aiParseSuccess && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center space-x-2 text-emerald-800 text-xs font-medium">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{aiParseSuccess}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 sm:p-5 bg-zinc-50 border-t border-zinc-200 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsAIAssistantOpen(false)}
                className="px-4 py-2 text-xs font-bold text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200/60 rounded-xl transition cursor-pointer"
              >
                Cerrar
              </button>

              <button
                type="button"
                onClick={handleProcessAIPastedResponse}
                disabled={!aiPastedResponse.trim()}
                className="inline-flex items-center space-x-2 px-5 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs transition active:scale-95 cursor-pointer disabled:opacity-40"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                <span>Analizar y Cargar en la Plantilla</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
