'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  MailCheck,
  Sparkles,
  Layers,
  Plus,
  RefreshCw,
  Clock,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Info,
  Link2,
  Unlink,
  Check,
  Lock,
  Search,
  Building2,
  CreditCard,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  ArrowRight,
} from 'lucide-react';
import { EmailTemplateWithPreference, EmailIngestConnection } from '@/lib/types';
import { formatCurrency } from '@/lib/balance-utils';

interface GmailIntegrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'connection' | 'templates' | 'create_template';
}

interface ConnectionResponseData extends EmailIngestConnection {
  apps_script_url?: string;
}

interface TestResults {
  amount?: { match: boolean; raw?: string; parsed?: number; error?: string };
  merchant?: { match: boolean; value?: string; error?: string };
  date?: { match: boolean; value?: string; format?: string; error?: string };
  currency?: { match: boolean; value?: string; error?: string };
  source_account?: { match: boolean; value?: string; error?: string };
  time?: { match: boolean; value?: string; error?: string };
}

const SAMPLE_EMAILS = [
  {
    bank: 'Bancolombia',
    label: 'Compra Bancolombia',
    text: 'Bancolombia le informa compra por $68.500 en RESTAURANTE EL HUERTO con tarjeta debito *4521 el 15/11/2024 13:45.',
  },
  {
    bank: 'Nequi',
    label: 'Transferencia Nequi',
    text: 'Enviaste $35.000 a Juan Pérez desde tu Nequi el 12/11/2024 a las 18:20. Tu saldo actual es $140.000.',
  },
  {
    bank: 'Nu',
    label: 'Compra Tarjeta Nu',
    text: 'Compra aprobada en SUPERMERCADO CARULLA por $112.400 con tu tarjeta Nu terminada en 8820 el 18/11/2024 16:10.',
  },
];

// Helper to assign distinctive badge styling per financial entity
function getBankBadgeStyle(entityName?: string | null) {
  const name = (entityName || '').toLowerCase();
  if (name.includes('bancolombia')) {
    return {
      bg: 'bg-amber-50',
      text: 'text-amber-900',
      border: 'border-amber-200',
      badgeBg: 'bg-amber-100 text-amber-900',
      iconColor: 'text-amber-600',
    };
  }
  if (name.includes('nequi')) {
    return {
      bg: 'bg-fuchsia-50',
      text: 'text-fuchsia-900',
      border: 'border-fuchsia-200',
      badgeBg: 'bg-fuchsia-100 text-fuchsia-900',
      iconColor: 'text-fuchsia-600',
    };
  }
  if (name.includes('nu') || name.includes('nubank')) {
    return {
      bg: 'bg-purple-50',
      text: 'text-purple-900',
      border: 'border-purple-200',
      badgeBg: 'bg-purple-100 text-purple-900',
      iconColor: 'text-purple-600',
    };
  }
  if (name.includes('davivienda') || name.includes('daviplata')) {
    return {
      bg: 'bg-red-50',
      text: 'text-red-900',
      border: 'border-red-200',
      badgeBg: 'bg-red-100 text-red-900',
      iconColor: 'text-red-600',
    };
  }
  if (name.includes('bbva')) {
    return {
      bg: 'bg-blue-50',
      text: 'text-blue-900',
      border: 'border-blue-200',
      badgeBg: 'bg-blue-100 text-blue-900',
      iconColor: 'text-blue-600',
    };
  }
  return {
    bg: 'bg-zinc-50',
    text: 'text-zinc-900',
    border: 'border-zinc-200',
    badgeBg: 'bg-zinc-100 text-zinc-800',
    iconColor: 'text-zinc-600',
  };
}

// Clean pattern for human display (removes regex noise like .*, ^, $, \\)
function cleanPatternForDisplay(pattern?: string | null): string {
  if (!pattern) return '';
  return pattern
    .replace(/\\\./g, '.')
    .replace(/\.\*/g, '')
    .replace(/[()^$]/g, '')
    .replace(/\\s\+/g, ' ')
    .trim();
}

export function GmailIntegrationModal({
  isOpen,
  onClose,
  initialTab = 'connection',
}: GmailIntegrationModalProps) {
  const [activeTab, setActiveTab] = useState<'connection' | 'templates' | 'create_template'>(initialTab);
  const [isLoading, setIsLoading] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionData, setConnectionData] = useState<ConnectionResponseData | null>(null);
  const [templates, setTemplates] = useState<EmailTemplateWithPreference[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [authUrlOpened, setAuthUrlOpened] = useState<string | null>(null);

  // Template creation states
  const [sampleEmailText, setSampleEmailText] = useState('');
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [testResults, setTestResults] = useState<TestResults | null>(null);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [expandedTemplateId, setExpandedTemplateId] = useState<string | null>(null);

  const [templateForm, setTemplateForm] = useState({
    name: '',
    entity_name: '',
    sender_pattern: '',
    subject_pattern: '',
    amount_regex: '',
    merchant_regex: '',
    date_regex: '',
    date_format: 'DD/MM/YYYY',
    default_currency: 'COP',
    currency_regex: '',
    source_account_regex: '',
    time_regex: '',
  });

  const fetchData = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      // 1. Connection data
      const connRes = await fetch('/api/gmail-connections');
      if (connRes.ok) {
        const connJson = await connRes.json();
        setConnectionData(connJson.connection || null);
      }

      // 2. Templates with user preferences
      const tmplRes = await fetch('/api/user-template-preferences');
      if (tmplRes.ok) {
        const tmplJson = await tmplRes.json();
        setTemplates(tmplJson.templates || []);
      }
    } catch (err) {
      console.error('Error al cargar datos de sincronización:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchData();
      setActiveTab(initialTab);
      setErrorMsg(null);
      setSuccessMsg(null);
      setAuthUrlOpened(null);
      setTestResults(null);
      setShowAdvancedSettings(false);
      setExpandedTemplateId(null);
    }
  }, [isOpen, initialTab]);

  const isConnected = connectionData?.status === 'active';

  // Filter templates
  const filteredTemplates = useMemo(() => {
    if (!searchQuery.trim()) return templates;
    const q = searchQuery.toLowerCase();
    return templates.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (t.entity_name && t.entity_name.toLowerCase().includes(q)) ||
        (t.default_currency && t.default_currency.toLowerCase().includes(q))
    );
  }, [templates, searchQuery]);

  const activeTemplatesCount = useMemo(() => {
    return templates.filter((t) => t.enabled).length;
  }, [templates]);

  // Connect flow
  const handleConnectWithGoogle = async () => {
    setIsConnecting(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await fetch('/api/gmail-connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo iniciar la conexión con Google');

      setConnectionData(data.connection || {
        user_id: '',
        webhook_token: data.webhook_token,
        status: 'active',
        created_at: new Date().toISOString(),
        apps_script_url: data.apps_script_url,
      });

      const scriptUrl = data.apps_script_url;
      if (scriptUrl) {
        setAuthUrlOpened(scriptUrl);
        const newWindow = window.open(scriptUrl, '_blank');
        if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
          setSuccessMsg('Enlace de conexión generado. Haz clic en "Abrir ventana de autorización" si tu navegador bloqueó la apertura automática.');
        } else {
          setSuccessMsg('Ventana de Google abierta. Haz clic en "Permitir" con tu cuenta para activar la detección automática.');
        }
      } else {
        setSuccessMsg('¡Conexión iniciada con éxito!');
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Error al conectar');
    } finally {
      setIsConnecting(false);
    }
  };

  // Disconnect flow
  const handleDisconnect = async () => {
    if (!confirm('¿Deseas pausar la detección automática de gastos por correo? No recibirás nuevos borradores hasta que vuelvas a conectar.')) {
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/gmail-connections', {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al desactivar la conexión');

      setConnectionData(null);
      setAuthUrlOpened(null);
      setSuccessMsg('Detección automática desactivada');
      await fetchData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Error al desactivar');
    } finally {
      setIsLoading(false);
    }
  };

  // Toggle bank active state
  const handleToggleTemplate = async (templateId: string, currentEnabled: boolean) => {
    const nextEnabled = !currentEnabled;
    setTemplates((prev) =>
      prev.map((t) => (t.id === templateId ? { ...t, enabled: nextEnabled } : t))
    );

    try {
      const res = await fetch('/api/user-template-preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId, enabled: nextEnabled }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Error al guardar el ajuste');
      }
    } catch (err) {
      console.error('Error al actualizar estado del banco:', err);
      setTemplates((prev) =>
        prev.map((t) => (t.id === templateId ? { ...t, enabled: currentEnabled } : t))
      );
      setErrorMsg('No se pudo actualizar el estado del banco');
    }
  };

  // AI extraction flow
  const handleSuggestAI = async () => {
    if (!sampleEmailText.trim()) {
      setErrorMsg('Pega el texto de una notificación o correo bancario para analizarlo');
      return;
    }

    setIsSuggesting(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/email-templates/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailText: sampleEmailText.trim() }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al analizar el correo');

      const sug = data.suggestion;
      setTemplateForm({
        name: sug.name || (sug.entity_name ? `${sug.entity_name} - Notificaciones` : 'Nuevo Banco'),
        entity_name: sug.entity_name || '',
        sender_pattern: sug.sender_pattern || '',
        subject_pattern: sug.subject_pattern || '',
        amount_regex: sug.amount_regex || '',
        merchant_regex: sug.merchant_regex || '',
        date_regex: sug.date_regex || '',
        date_format: sug.date_format || 'DD/MM/YYYY',
        default_currency: sug.default_currency || 'COP',
        currency_regex: sug.currency_regex || '',
        source_account_regex: sug.source_account_regex || '',
        time_regex: sug.time_regex || '',
      });
      setSuccessMsg('¡Datos y formato bancario detectados con éxito!');
      runRegexTest(sampleEmailText, sug);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Error al analizar el formato');
    } finally {
      setIsSuggesting(false);
    }
  };

  const runRegexTest = (text: string, currentForm = templateForm) => {
    if (!text.trim()) return;
    const results: TestResults = {};

    // 1. Amount
    if (currentForm.amount_regex) {
      try {
        const reg = new RegExp(currentForm.amount_regex, 'i');
        const match = text.match(reg);
        if (match && (match[1] || match[0])) {
          const rawAmount = match[1] || match[0];
          const clean = rawAmount.replace(/[^0-9.,]/g, '');
          let parsedNum = 0;
          if (clean.includes('.') && clean.includes(',')) {
            parsedNum = parseFloat(clean.replace(/\./g, '').replace(',', '.'));
          } else if (clean.includes(',')) {
            const parts = clean.split(',');
            parsedNum = parts[1] && parts[1].length <= 2 ? parseFloat(clean.replace(',', '.')) : parseFloat(clean.replace(/,/g, ''));
          } else if (clean.includes('.')) {
            const parts = clean.split('.');
            parsedNum = parts[1] && parts[1].length === 3 ? parseFloat(clean.replace(/\./g, '')) : parseFloat(clean);
          } else {
            parsedNum = parseFloat(clean);
          }
          results.amount = {
            match: true,
            raw: rawAmount,
            parsed: isNaN(parsedNum) ? undefined : parsedNum,
          };
        } else {
          results.amount = { match: false, error: 'No se encontró el monto en el texto' };
        }
      } catch (e: unknown) {
        results.amount = { match: false, error: `Error: ${e instanceof Error ? e.message : 'invalido'}` };
      }
    }

    // 2. Merchant
    if (currentForm.merchant_regex) {
      try {
        const reg = new RegExp(currentForm.merchant_regex, 'i');
        const match = text.match(reg);
        if (match && (match[1] || match[0])) {
          results.merchant = { match: true, value: (match[1] || match[0]).trim() };
        } else {
          results.merchant = { match: false, error: 'Opcional' };
        }
      } catch {
        results.merchant = { match: false, error: 'Error' };
      }
    }

    // 3. Date
    if (currentForm.date_regex) {
      try {
        const reg = new RegExp(currentForm.date_regex, 'i');
        const match = text.match(reg);
        if (match && (match[1] || match[0])) {
          results.date = {
            match: true,
            value: (match[1] || match[0]).trim(),
            format: currentForm.date_format,
          };
        } else {
          results.date = { match: false, error: 'Opcional' };
        }
      } catch {
        results.date = { match: false, error: 'Error' };
      }
    }

    // 4. Source Account
    if (currentForm.source_account_regex) {
      try {
        const reg = new RegExp(currentForm.source_account_regex, 'i');
        const match = text.match(reg);
        if (match && (match[1] || match[0])) {
          results.source_account = { match: true, value: (match[1] || match[0]).trim() };
        } else {
          results.source_account = { match: false, error: 'Opcional' };
        }
      } catch {
        results.source_account = { match: false, error: 'Error' };
      }
    }

    setTestResults(results);
  };

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!templateForm.name.trim() || !templateForm.amount_regex.trim()) {
      setErrorMsg('Debes ingresar al menos el nombre del banco y el monto a detectar');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/email-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(templateForm),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar el banco');

      setSuccessMsg(`¡Banco "${data.name}" agregado con éxito a tus entidades activas!`);
      setSampleEmailText('');
      setTestResults(null);
      setTemplateForm({
        name: '',
        entity_name: '',
        sender_pattern: '',
        subject_pattern: '',
        amount_regex: '',
        merchant_regex: '',
        date_regex: '',
        date_format: 'DD/MM/YYYY',
        default_currency: 'COP',
        currency_regex: '',
        source_account_regex: '',
        time_regex: '',
      });
      await fetchData();
      setActiveTab('templates');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Error al guardar el banco');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      id="gmail-integration-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-zinc-950/70 backdrop-blur-sm animate-in fade-in duration-150"
    >
      <div
        id="gmail-integration-modal-container"
        className="bg-white rounded-3xl ring-1 ring-zinc-200 shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden my-auto"
      >
        {/* Modal Header */}
        <div className="bg-zinc-900 text-white px-6 py-5 sm:px-7 sm:py-5 flex items-center justify-between border-b border-zinc-800 shrink-0">
          <div className="flex items-center space-x-3.5">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-zinc-800 ring-1 ring-zinc-700 flex items-center justify-center text-emerald-400 shrink-0">
              <MailCheck className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold tracking-tight text-zinc-50">
                Sincronización de Correos Bancarios
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5 font-normal">
                Detecta compras y comprobantes automáticamente para dividirlos en tus grupos
              </p>
            </div>
          </div>
          <button
            id="btn-close-gmail-modal"
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-full transition-colors cursor-pointer"
            aria-label="Cerrar ventana"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation - Clean Segmented Bar */}
        <div className="flex border-b border-zinc-200 bg-zinc-50/80 px-6 pt-3 gap-2 overflow-x-auto shrink-0">
          <button
            id="tab-btn-connection"
            onClick={() => setActiveTab('connection')}
            className={`flex items-center space-x-2 px-4 py-2.5 text-xs font-semibold rounded-t-xl transition-all cursor-pointer ${
              activeTab === 'connection'
                ? 'bg-white text-zinc-900 border-t-2 border-zinc-900 shadow-xs'
                : 'text-zinc-500 hover:text-zinc-900'
            }`}
          >
            <Link2 className="w-4 h-4" />
            <span>1. Conexión</span>
            <span
              className={`w-2 h-2 rounded-full ml-1 inline-block ${
                isConnected ? 'bg-emerald-500 ring-2 ring-emerald-200' : 'bg-zinc-300'
              }`}
            />
          </button>

          <button
            id="tab-btn-templates"
            onClick={() => setActiveTab('templates')}
            className={`flex items-center space-x-2 px-4 py-2.5 text-xs font-semibold rounded-t-xl transition-all cursor-pointer ${
              activeTab === 'templates'
                ? 'bg-white text-zinc-900 border-t-2 border-zinc-900 shadow-xs'
                : 'text-zinc-500 hover:text-zinc-900'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>2. Bancos Admitidos</span>
            <span className="text-[10px] font-bold bg-zinc-200 text-zinc-700 px-1.5 py-0.5 rounded-full ml-0.5">
              {activeTemplatesCount}/{templates.length}
            </span>
          </button>

          <button
            id="tab-btn-create-template"
            onClick={() => setActiveTab('create_template')}
            className={`flex items-center space-x-2 px-4 py-2.5 text-xs font-semibold rounded-t-xl transition-all cursor-pointer ${
              activeTab === 'create_template'
                ? 'bg-white text-zinc-900 border-t-2 border-zinc-900 shadow-xs'
                : 'text-zinc-500 hover:text-zinc-900'
            }`}
          >
            <Sparkles className="w-4 h-4 text-indigo-600" />
            <span>3. Agregar Banco con IA</span>
          </button>
        </div>

        {/* Global Feedback Banners */}
        {errorMsg && (
          <div className="mx-6 mt-4 p-3.5 bg-rose-50 border border-rose-200 rounded-2xl flex items-center space-x-2.5 text-xs font-medium text-rose-700 shrink-0">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span className="flex-1">{errorMsg}</span>
            <button
              onClick={() => setErrorMsg(null)}
              className="text-rose-500 hover:text-rose-700 p-0.5 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        {successMsg && (
          <div className="mx-6 mt-4 p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center space-x-2.5 text-xs font-medium text-emerald-800 shrink-0">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            <span className="flex-1">{successMsg}</span>
            <button
              onClick={() => setSuccessMsg(null)}
              className="text-emerald-600 hover:text-emerald-800 p-0.5 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-7 space-y-6">
          {/* TAB 1: CONEXIÓN */}
          {activeTab === 'connection' && (
            <div className="space-y-6">
              {isConnected ? (
                /* ESTADO: CONECTADO Y ACTIVO */
                <div className="bg-emerald-50/70 border border-emerald-200/90 rounded-3xl p-6 sm:p-7 space-y-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center space-x-3.5">
                      <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-xs shrink-0">
                        <CheckCircle2 className="w-7 h-7" />
                      </div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <h3 className="text-base font-bold text-zinc-900">
                            Sincronización Activa con Google
                          </h3>
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            <span>Conectado</span>
                          </span>
                        </div>
                        <p className="text-xs text-zinc-600 mt-1 leading-relaxed">
                          Tu cuenta está lista para detectar compras bancarias y transferencias. Cada gasto detectado aparecerá como borrador para que lo revises antes de dividirlo.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Summary Metric Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                    <div className="bg-white/90 border border-emerald-200/80 rounded-2xl p-3.5 space-y-1">
                      <div className="flex items-center space-x-1.5 text-zinc-500 text-[11px] font-semibold">
                        <Clock className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Última verificación</span>
                      </div>
                      <p className="text-xs font-bold text-zinc-900">
                        {connectionData?.last_sync_at
                          ? new Date(connectionData.last_sync_at).toLocaleString('es-CO', {
                              dateStyle: 'short',
                              timeStyle: 'short',
                            })
                          : 'Listo para recibir compras'}
                      </p>
                    </div>

                    <div className="bg-white/90 border border-emerald-200/80 rounded-2xl p-3.5 space-y-1">
                      <div className="flex items-center space-x-1.5 text-zinc-500 text-[11px] font-semibold">
                        <Building2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Bancos activos</span>
                      </div>
                      <p className="text-xs font-bold text-zinc-900">
                        {activeTemplatesCount} entidades configuradas
                      </p>
                    </div>

                    <div className="bg-white/90 border border-emerald-200/80 rounded-2xl p-3.5 space-y-1">
                      <div className="flex items-center space-x-1.5 text-zinc-500 text-[11px] font-semibold">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Privacidad</span>
                      </div>
                      <p className="text-xs font-bold text-zinc-900">
                        Solo lectura de bancos
                      </p>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="pt-2 flex flex-wrap items-center gap-3 border-t border-emerald-200/60">
                    <button
                      id="btn-reconnect-google"
                      onClick={handleConnectWithGoogle}
                      disabled={isConnecting || isLoading}
                      className="px-4 py-2.5 bg-white hover:bg-zinc-50 border border-emerald-300 text-emerald-950 font-semibold rounded-xl text-xs shadow-2xs flex items-center space-x-2 transition-all cursor-pointer"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isConnecting ? 'animate-spin' : ''}`} />
                      <span>Reconectar o cambiar cuenta</span>
                    </button>

                    <button
                      id="btn-view-banks-from-connection"
                      onClick={() => setActiveTab('templates')}
                      className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl text-xs shadow-2xs flex items-center space-x-2 transition-all cursor-pointer"
                    >
                      <span>Ver bancos admitidos</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>

                    <button
                      id="btn-disconnect-google"
                      onClick={handleDisconnect}
                      disabled={isLoading}
                      className="px-4 py-2.5 bg-transparent hover:bg-rose-50 border border-rose-200 text-rose-700 font-semibold rounded-xl text-xs transition-all flex items-center space-x-1.5 cursor-pointer ml-auto"
                    >
                      <Unlink className="w-3.5 h-3.5" />
                      <span>Desconectar</span>
                    </button>
                  </div>
                </div>
              ) : (
                /* ESTADO: NO CONECTADO */
                <div className="space-y-6">
                  {/* Hero Connection Card */}
                  <div className="bg-gradient-to-b from-zinc-50 to-white border border-zinc-200 rounded-3xl p-6 sm:p-8 text-center space-y-4 shadow-2xs">
                    <div className="w-14 h-14 rounded-2xl bg-zinc-900 text-white flex items-center justify-center mx-auto shadow-sm">
                      <MailCheck className="w-7 h-7 text-amber-400" />
                    </div>

                    <div className="max-w-lg mx-auto space-y-1.5">
                      <h3 className="text-lg font-bold text-zinc-900 tracking-tight">
                        Detecta tus compras bancarias automáticamente
                      </h3>
                      <p className="text-xs sm:text-sm text-zinc-600 leading-relaxed">
                        Conecta tu correo una sola vez. Cuando hagas una compra con tarjeta o transferencia, aparecerá aquí como un borrador listo para asignar a tus grupos.
                      </p>
                    </div>

                    {/* Single Connect Button */}
                    <div className="pt-2 flex flex-col items-center justify-center gap-3">
                      <button
                        id="btn-connect-google-account"
                        onClick={handleConnectWithGoogle}
                        disabled={isConnecting || isLoading}
                        className="w-full sm:w-auto min-w-[260px] px-7 py-3.5 bg-zinc-900 hover:bg-zinc-800 active:bg-zinc-950 text-white font-bold rounded-2xl text-sm shadow-md flex items-center justify-center space-x-3 transition-all active:scale-98 cursor-pointer disabled:opacity-75"
                      >
                        {isConnecting ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />
                            <span>Conectando con Google...</span>
                          </>
                        ) : (
                          <>
                            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                              <path
                                fill="#4285F4"
                                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                              />
                              <path
                                fill="#34A853"
                                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                              />
                              <path
                                fill="#FBBC05"
                                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                              />
                              <path
                                fill="#EA4335"
                                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                              />
                            </svg>
                            <span>Conectar con Google</span>
                          </>
                        )}
                      </button>

                      {authUrlOpened && (
                        <div className="mt-2 text-xs text-zinc-600 bg-amber-50 border border-amber-200 rounded-2xl p-4 max-w-md text-left flex items-start space-x-2.5">
                          <Info className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                          <div className="space-y-1">
                            <p className="font-semibold text-amber-900">
                              ¿No se abrió la ventana de autorización?
                            </p>
                            <p className="text-[11px] text-amber-800">
                              Si tu navegador bloqueó la ventana emergente de Google, haz clic aquí:
                            </p>
                            <a
                              href={authUrlOpened}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center space-x-1 text-xs font-bold text-amber-950 underline hover:text-black pt-1"
                            >
                              <span>Abrir pantalla de autorización oficial de Google</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Value Props Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                    <div className="p-4 bg-zinc-50 border border-zinc-200/80 rounded-2xl space-y-1.5">
                      <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center">
                        <Lock className="w-4 h-4 text-emerald-700" />
                      </div>
                      <p className="text-xs font-bold text-zinc-900">100% Privado</p>
                      <p className="text-[11px] text-zinc-500 leading-relaxed">
                        Solo se reconocen correos de tus bancos admitidos. Nunca se leen tus correos personales.
                      </p>
                    </div>

                    <div className="p-4 bg-zinc-50 border border-zinc-200/80 rounded-2xl space-y-1.5">
                      <div className="w-7 h-7 rounded-lg bg-zinc-200 text-zinc-800 flex items-center justify-center">
                        <Check className="w-4 h-4 text-zinc-800" />
                      </div>
                      <p className="text-xs font-bold text-zinc-900">Cero trabajo manual</p>
                      <p className="text-[11px] text-zinc-500 leading-relaxed">
                        Olvídate de ingresar montos o pedir tickets. Las compras entran solas a la aplicación.
                      </p>
                    </div>

                    <div className="p-4 bg-zinc-50 border border-zinc-200/80 rounded-2xl space-y-1.5">
                      <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center">
                        <MailCheck className="w-4 h-4 text-amber-700" />
                      </div>
                      <p className="text-xs font-bold text-zinc-900">Tú tienes el control</p>
                      <p className="text-[11px] text-zinc-500 leading-relaxed">
                        Cada gasto entra como borrador en Tickets para que lo asignes a tus grupos con un toque.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: BANCOS ADMITIDOS */}
          {activeTab === 'templates' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-zinc-900">
                    Bancos y Entidades Compatibles
                  </h3>
                  <p className="text-xs text-zinc-500">
                    Elige qué entidades financieras deseas sincronizar desde tus notificaciones.
                  </p>
                </div>

                <button
                  id="btn-goto-add-bank"
                  onClick={() => setActiveTab('create_template')}
                  className="px-3.5 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-semibold flex items-center space-x-1.5 shadow-xs transition-all cursor-pointer shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Agregar otro banco</span>
                </button>
              </div>

              {/* Search Bar */}
              <div className="relative">
                <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="input-search-banks"
                  type="text"
                  placeholder="Buscar banco o entidad (ej: Bancolombia, Nequi, Nu, Davivienda)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-900 placeholder:text-zinc-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900 transition"
                />
              </div>

              {filteredTemplates.length === 0 ? (
                <div className="p-12 text-center bg-zinc-50 rounded-2xl border border-zinc-200">
                  <Building2 className="w-8 h-8 text-zinc-300 mx-auto mb-2" />
                  <p className="text-xs font-semibold text-zinc-700">No se encontraron bancos</p>
                  <p className="text-xs text-zinc-400 mt-1">
                    Puedes agregar un formato nuevo fácilmente en la pestaña de &quot;Agregar Banco con IA&quot;.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {filteredTemplates.map((tmpl) => {
                    const badge = getBankBadgeStyle(tmpl.entity_name || tmpl.name);
                    const isExpanded = expandedTemplateId === tmpl.id;

                    return (
                      <div
                        key={tmpl.id}
                        className={`p-4 sm:p-5 rounded-2xl border transition-all ${
                          tmpl.enabled
                            ? 'bg-white border-zinc-200 shadow-2xs'
                            : 'bg-zinc-50/70 border-zinc-200/60 opacity-75'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center space-x-3.5 flex-1 min-w-0">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${badge.bg} ${badge.border} ${badge.iconColor}`}>
                              <CreditCard className="w-5 h-5" />
                            </div>

                            <div className="space-y-1 min-w-0 flex-1">
                              <div className="flex items-center space-x-2 flex-wrap gap-y-0.5">
                                <span className="font-bold text-zinc-900 text-sm truncate">
                                  {tmpl.name}
                                </span>
                                {tmpl.entity_name && (
                                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${badge.badgeBg} ${badge.border}`}>
                                    {tmpl.entity_name}
                                  </span>
                                )}
                                <span className="text-[10px] font-bold bg-zinc-100 text-zinc-700 px-2 py-0.5 rounded-md border border-zinc-200">
                                  {tmpl.default_currency || 'COP'}
                                </span>
                              </div>

                              <p className="text-xs text-zinc-500 truncate">
                                Notificaciones de compras con débito, crédito y transferencias
                              </p>
                            </div>
                          </div>

                          {/* Toggle Switch */}
                          <div className="flex items-center space-x-2 shrink-0">
                            <button
                              id={`toggle-bank-${tmpl.id}`}
                              onClick={() => handleToggleTemplate(tmpl.id, tmpl.enabled)}
                              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:ring-offset-2 ${
                                tmpl.enabled ? 'bg-emerald-600' : 'bg-zinc-300'
                              }`}
                              role="switch"
                              aria-checked={tmpl.enabled}
                              aria-label={`Activar o desactivar ${tmpl.name}`}
                            >
                              <span
                                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                  tmpl.enabled ? 'translate-x-5' : 'translate-x-0'
                                }`}
                              />
                            </button>

                            <button
                              onClick={() => setExpandedTemplateId(isExpanded ? null : tmpl.id)}
                              className="p-1.5 text-zinc-400 hover:text-zinc-600 rounded-lg hover:bg-zinc-100 transition cursor-pointer"
                              title="Ver detalles"
                              aria-label="Ver detalles del banco"
                            >
                              {isExpanded ? (
                                <ChevronUp className="w-4 h-4" />
                              ) : (
                                <ChevronDown className="w-4 h-4" />
                              )}
                            </button>
                          </div>
                        </div>

                        {/* Collapsed Details Drawer (for users who want to know what it looks for) */}
                        {isExpanded && (
                          <div className="mt-3 pt-3 border-t border-zinc-100 text-xs space-y-1.5 text-zinc-600 bg-zinc-50 p-3 rounded-xl animate-in fade-in duration-100">
                            {tmpl.sender_pattern && (
                              <div className="flex items-center justify-between">
                                <span className="text-zinc-400">Remitente admitido:</span>
                                <span className="font-medium text-zinc-800">
                                  {cleanPatternForDisplay(tmpl.sender_pattern)}
                                </span>
                              </div>
                            )}
                            {tmpl.subject_pattern && (
                              <div className="flex items-center justify-between">
                                <span className="text-zinc-400">Asunto de correo:</span>
                                <span className="font-medium text-zinc-800">
                                  {cleanPatternForDisplay(tmpl.subject_pattern)}
                                </span>
                              </div>
                            )}
                            <div className="flex items-center justify-between">
                              <span className="text-zinc-400">Formato de fecha:</span>
                              <span className="font-medium text-zinc-800">
                                {tmpl.date_format || 'DD/MM/YYYY'}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: AGREGAR BANCO CON IA */}
          {activeTab === 'create_template' && (
            <div className="space-y-6">
              {/* AI Extraction Prompt */}
              <div className="bg-gradient-to-br from-indigo-50/60 via-white to-amber-50/40 border border-indigo-100 rounded-3xl p-5 sm:p-6 space-y-3.5 shadow-2xs">
                <div className="flex items-center space-x-2.5">
                  <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-zinc-900">
                      Aprender formato de un nuevo banco con IA
                    </h3>
                    <p className="text-xs text-zinc-500">
                      Pega una notificación de compra de tu banco. La IA identificará automáticamente el monto, comercio y fecha.
                    </p>
                  </div>
                </div>

                {/* Quick Sample Buttons */}
                <div className="flex items-center space-x-1.5 flex-wrap gap-y-1.5 pt-1">
                  <span className="text-[11px] font-semibold text-zinc-400 mr-1">O prueba con un ejemplo:</span>
                  {SAMPLE_EMAILS.map((sample) => (
                    <button
                      key={sample.bank}
                      type="button"
                      onClick={() => {
                        setSampleEmailText(sample.text);
                      }}
                      className="text-[11px] font-semibold px-2.5 py-1 bg-white hover:bg-indigo-50 border border-zinc-200 hover:border-indigo-200 text-zinc-700 hover:text-indigo-900 rounded-lg shadow-2xs transition cursor-pointer"
                    >
                      {sample.label}
                    </button>
                  ))}
                </div>

                <textarea
                  id="textarea-sample-email"
                  value={sampleEmailText}
                  onChange={(e) => setSampleEmailText(e.target.value)}
                  placeholder="Pega aquí el texto completo del correo de tu banco (ej: Bancolombia le informa compra por $45.000 en Supermercado...)"
                  rows={3}
                  className="w-full px-3.5 py-2.5 bg-white border border-zinc-200 rounded-xl text-xs font-normal text-zinc-800 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
                />

                <div className="flex items-center justify-end space-x-2 pt-1">
                  <button
                    id="btn-analyze-with-ai"
                    type="button"
                    onClick={handleSuggestAI}
                    disabled={isSuggesting || !sampleEmailText.trim()}
                    className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center space-x-2 shadow-xs transition-all disabled:opacity-50 cursor-pointer"
                  >
                    <Sparkles className={`w-3.5 h-3.5 ${isSuggesting ? 'animate-spin' : ''}`} />
                    <span>{isSuggesting ? 'Identificando datos...' : 'Identificar datos con IA'}</span>
                  </button>
                </div>
              </div>

              {/* Human Test Results Preview */}
              {testResults && (
                <div className="bg-emerald-50/60 border border-emerald-200/90 rounded-2xl p-4 sm:p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-950 uppercase tracking-wider flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>Datos identificados de la notificación</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setTestResults(null)}
                      className="text-[11px] text-zinc-400 hover:text-zinc-600 cursor-pointer"
                    >
                      Ocultar
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                    <div className="p-3 bg-white border border-emerald-200/80 rounded-xl flex justify-between items-center shadow-2xs">
                      <span className="text-zinc-500 font-medium">Monto detectado:</span>
                      {testResults.amount?.match ? (
                        <span className="font-bold text-emerald-700 text-sm">
                          {testResults.amount.parsed
                            ? formatCurrency(testResults.amount.parsed, templateForm.default_currency || 'COP')
                            : testResults.amount.raw}
                        </span>
                      ) : (
                        <span className="text-rose-600 font-semibold text-[11px]">No detectado</span>
                      )}
                    </div>

                    <div className="p-3 bg-white border border-emerald-200/80 rounded-xl flex justify-between items-center shadow-2xs">
                      <span className="text-zinc-500 font-medium">Comercio / Destino:</span>
                      <span className="font-bold text-zinc-900">
                        {testResults.merchant?.match ? testResults.merchant.value : 'No especificado'}
                      </span>
                    </div>

                    <div className="p-3 bg-white border border-emerald-200/80 rounded-xl flex justify-between items-center shadow-2xs">
                      <span className="text-zinc-500 font-medium">Fecha:</span>
                      <span className="font-bold text-zinc-900">
                        {testResults.date?.match ? testResults.date.value : 'Hoy'}
                      </span>
                    </div>

                    <div className="p-3 bg-white border border-emerald-200/80 rounded-xl flex justify-between items-center shadow-2xs">
                      <span className="text-zinc-500 font-medium">Cuenta / Tarjeta:</span>
                      <span className="font-bold text-zinc-900 font-mono">
                        {testResults.source_account?.match ? `*${testResults.source_account.value}` : 'No detectada'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Friendly Configuration Form */}
              <form onSubmit={handleSaveTemplate} className="space-y-4">
                <div className="border-b border-zinc-100 pb-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                    Datos del Banco a Guardar
                  </h4>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 mb-1">
                      Nombre para este formato *
                    </label>
                    <input
                      id="input-template-name"
                      type="text"
                      required
                      placeholder="Ej: Bancolombia - Compras Débito"
                      value={templateForm.name}
                      onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
                      className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-900 focus:bg-white focus:ring-2 focus:ring-zinc-900 transition"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 mb-1">
                      Banco o Entidad Emisora
                    </label>
                    <input
                      id="input-template-entity"
                      type="text"
                      placeholder="Ej: Bancolombia, Nequi, Nu, Davivienda"
                      value={templateForm.entity_name}
                      onChange={(e) => setTemplateForm({ ...templateForm, entity_name: e.target.value })}
                      className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-900 focus:bg-white focus:ring-2 focus:ring-zinc-900 transition"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 mb-1">
                      Moneda Principal
                    </label>
                    <input
                      id="input-template-currency"
                      type="text"
                      placeholder="Ej: COP, USD, EUR"
                      value={templateForm.default_currency}
                      onChange={(e) => setTemplateForm({ ...templateForm, default_currency: e.target.value })}
                      className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-900 focus:bg-white focus:ring-2 focus:ring-zinc-900 transition"
                    />
                  </div>
                </div>

                {/* Collapsible Advanced Technical Section (Optional for Power Users) */}
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
                    className="text-xs font-semibold text-zinc-500 hover:text-zinc-800 flex items-center space-x-1.5 transition cursor-pointer"
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                    <span>Configuración técnica avanzada (opcional)</span>
                    {showAdvancedSettings ? (
                      <ChevronUp className="w-3.5 h-3.5 ml-1" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5 ml-1" />
                    )}
                  </button>

                  {showAdvancedSettings && (
                    <div className="mt-3 p-4 bg-zinc-50 border border-zinc-200 rounded-2xl space-y-3 text-xs animate-in fade-in duration-100">
                      <p className="text-[11px] text-zinc-500">
                        Los siguientes campos son generados automáticamente por la IA para filtrar correos. Solo modifícalos si deseas ajustar los patrones manualmente.
                      </p>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 font-mono text-[11px]">
                        <div>
                          <label className="block text-zinc-600 font-sans font-semibold mb-1">Patrón de monto *</label>
                          <input
                            type="text"
                            required
                            value={templateForm.amount_regex}
                            onChange={(e) => setTemplateForm({ ...templateForm, amount_regex: e.target.value })}
                            className="w-full px-2.5 py-1.5 bg-white border border-zinc-200 rounded-lg text-emerald-800 font-bold"
                          />
                        </div>
                        <div>
                          <label className="block text-zinc-600 font-sans font-semibold mb-1">Patrón de comercio</label>
                          <input
                            type="text"
                            value={templateForm.merchant_regex}
                            onChange={(e) => setTemplateForm({ ...templateForm, merchant_regex: e.target.value })}
                            className="w-full px-2.5 py-1.5 bg-white border border-zinc-200 rounded-lg text-zinc-800"
                          />
                        </div>
                        <div>
                          <label className="block text-zinc-600 font-sans font-semibold mb-1">Filtro de remitente</label>
                          <input
                            type="text"
                            value={templateForm.sender_pattern}
                            onChange={(e) => setTemplateForm({ ...templateForm, sender_pattern: e.target.value })}
                            className="w-full px-2.5 py-1.5 bg-white border border-zinc-200 rounded-lg text-zinc-800"
                          />
                        </div>
                        <div>
                          <label className="block text-zinc-600 font-sans font-semibold mb-1">Filtro de asunto</label>
                          <input
                            type="text"
                            value={templateForm.subject_pattern}
                            onChange={(e) => setTemplateForm({ ...templateForm, subject_pattern: e.target.value })}
                            className="w-full px-2.5 py-1.5 bg-white border border-zinc-200 rounded-lg text-zinc-800"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="pt-4 border-t border-zinc-100 flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => setActiveTab('templates')}
                    className="px-4 py-2 text-xs font-semibold text-zinc-600 hover:bg-zinc-100 rounded-xl transition-all cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    id="btn-save-bank-template"
                    type="submit"
                    disabled={isLoading || !templateForm.name || !templateForm.amount_regex}
                    className="px-5 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-bold shadow-xs flex items-center space-x-1.5 transition-all cursor-pointer disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>Guardar y Activar Banco</span>
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-zinc-50 border-t border-zinc-200 flex justify-between items-center text-xs text-zinc-500 px-6 sm:px-8 shrink-0">
          <div className="flex items-center space-x-1.5">
            <Info className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
            <span>Los comprobantes detectados aparecen en Tickets para dividirlos con 1 toque.</span>
          </div>
          <button
            id="btn-modal-footer-close"
            onClick={onClose}
            className="px-4 py-2 bg-white border border-zinc-200 text-zinc-700 font-semibold rounded-xl hover:bg-zinc-100 transition-all text-xs cursor-pointer shadow-2xs"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
