'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import React, { useState, useEffect } from 'react';
import {
  X,
  MailCheck,
  Key,
  Copy,
  Check,
  Sparkles,
  Layers,
  Plus,
  RefreshCw,
  Clock,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Code2,
  Power,
  Info,
} from 'lucide-react';
import { EmailTemplateWithPreference, EmailIngestConnection } from '@/lib/types';

interface GmailIntegrationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function GmailIntegrationModal({ isOpen, onClose }: GmailIntegrationModalProps) {
  const [activeTab, setActiveTab] = useState<'connection' | 'templates' | 'create_template'>('connection');
  const [copiedToken, setCopiedToken] = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [connectionData, setConnectionData] = useState<EmailIngestConnection | null>(null);
  const [templates, setTemplates] = useState<EmailTemplateWithPreference[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // AI Suggestion and Template creation state
  const [sampleEmailText, setSampleEmailText] = useState('');
  const [isSuggesting, setIsSuggesting] = useState(false);
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
      // 1. Fetch connection info
      const connRes = await fetch('/api/gmail-connections');
      if (connRes.ok) {
        const connJson = await connRes.json();
        setConnectionData(connJson.connection);
      }

      // 2. Fetch templates with user preferences
      const tmplRes = await fetch('/api/user-template-preferences');
      if (tmplRes.ok) {
        const tmplJson = await tmplRes.json();
        setTemplates(tmplJson.templates || []);
      }
    } catch (err) {
      console.error('Error al cargar datos de integración:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchData();
      setErrorMsg(null);
      setSuccessMsg(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleGenerateConnection = async (regenerate: boolean = false) => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/gmail-connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ regenerateToken: regenerate }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al conectar');

      setConnectionData(data.connection);
      setSuccessMsg('Token de integración generado con éxito');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Error al generar conexión');
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleTemplate = async (templateId: string, currentEnabled: boolean) => {
    const nextEnabled = !currentEnabled;
    // Optimistic update
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
        throw new Error(data.error || 'Error al actualizar preferencia');
      }
    } catch (err) {
      console.error('Error al actualizar preferencia:', err);
      // Revert optimistic update
      setTemplates((prev) =>
        prev.map((t) => (t.id === templateId ? { ...t, enabled: currentEnabled } : t))
      );
      setErrorMsg('No se pudo guardar la preferencia');
    }
  };

  const handleSuggestAI = async () => {
    if (!sampleEmailText.trim()) {
      setErrorMsg('Pega el texto de un correo bancario para que la IA lo analice');
      return;
    }

    setIsSuggesting(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/email-templates/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailText: sampleEmailText }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al analizar el correo');

      const sug = data.suggestion;
      setTemplateForm({
        name: sug.name || 'Plantilla de Notificación Bancaria',
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
      setSuccessMsg('¡Patrones regex extraídos con éxito por la IA! Revisa y ajusta si lo deseas.');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Error al obtener sugerencia');
    } finally {
      setIsSuggesting(false);
    }
  };

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!templateForm.name.trim() || !templateForm.amount_regex.trim()) {
      setErrorMsg('El nombre y el patrón de monto (amount_regex) son obligatorios');
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
      if (!res.ok) throw new Error(data.error || 'Error al guardar la plantilla');

      setSuccessMsg(`Plantilla "${data.name}" creada globalmente con éxito`);
      setSampleEmailText('');
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
      setErrorMsg(err instanceof Error ? err.message : 'Error al guardar plantilla');
    } finally {
      setIsLoading(false);
    }
  };

  const token = connectionData?.webhook_token || '';
  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://deudita.app';

  const appsScriptCode = `/**
 * SCRIPT DE DETECCIÓN DE GASTOS EN GMAIL - DEUDITA
 * Corre bajo tu propia cuenta de Google.
 * Nunca envía correos no reconocidos ni almacena contenido fuera de los patrones.
 */
const CONFIG = {
  WEBHOOK_TOKEN: '${token || 'GENERA_TU_TOKEN_EN_DEUDITA'}',
  TEMPLATES_URL: '${currentOrigin}/api/email-templates',
  CANDIDATE_URL: '${currentOrigin}/api/expense-candidate',
  LABEL_NAME: 'Deudita/Procesados',
  MAX_THREADS: 15
};

function procesarGastosGmail() {
  const token = CONFIG.WEBHOOK_TOKEN;
  if (!token || token.startsWith('GENERA_TU_TOKEN')) {
    Logger.log('Configura tu WEBHOOK_TOKEN en la variable CONFIG.');
    return;
  }

  // 1. Obtener plantillas activas de Deudita
  let templates = [];
  try {
    const res = UrlFetchApp.fetch(CONFIG.TEMPLATES_URL, {
      method: 'get',
      headers: { 'Authorization': 'Bearer ' + token },
      muteHttpExceptions: true
    });
    if (res.getResponseCode() !== 200) {
      Logger.log('Error al consultar plantillas: ' + res.getContentText());
      return;
    }
    templates = JSON.parse(res.getContentText());
  } catch (err) {
    Logger.log('Error de red al consultar plantillas: ' + err);
    return;
  }

  if (!templates || templates.length === 0) {
    Logger.log('No hay plantillas activas para este usuario.');
    return;
  }

  // 2. Obtener o crear etiqueta para no re-procesar
  let label = GmailApp.getUserLabelByName(CONFIG.LABEL_NAME);
  if (!label) {
    label = GmailApp.createLabel(CONFIG.LABEL_NAME);
  }

  // 3. Buscar correos recientes no procesados
  const query = 'label:inbox -label:' + CONFIG.LABEL_NAME + ' newer_than:2d';
  const threads = GmailApp.search(query, 0, CONFIG.MAX_THREADS);

  for (let t = 0; t < threads.length; t++) {
    const thread = threads[t];
    const messages = thread.getMessages();

    for (let m = 0; m < messages.length; m++) {
      const msg = messages[m];
      const from = msg.getFrom();
      const subject = msg.getSubject();
      const body = msg.getPlainBody();
      const msgId = msg.getId();
      const date = msg.getDate();

      // Comparar contra cada plantilla
      for (let i = 0; i < templates.length; i++) {
        const tmpl = templates[i];

        // Filtro de remitente
        if (tmpl.sender_pattern) {
          const reSender = new RegExp(tmpl.sender_pattern, 'i');
          if (!reSender.test(from)) continue;
        }

        // Filtro de asunto
        if (tmpl.subject_pattern) {
          const reSubject = new RegExp(tmpl.subject_pattern, 'i');
          if (!reSubject.test(subject)) continue;
        }

        // Extracción de monto (obligatorio)
        const reAmount = new RegExp(tmpl.amount_regex, 'i');
        const amountMatch = (subject + ' ' + body).match(reAmount);
        if (!amountMatch || !amountMatch[1]) continue;

        const rawAmount = amountMatch[1];

        // Extracción de comercio
        let merchant = null;
        if (tmpl.merchant_regex) {
          const reMerchant = new RegExp(tmpl.merchant_regex, 'i');
          const mMatch = (subject + ' ' + body).match(reMerchant);
          if (mMatch && mMatch[1]) merchant = mMatch[1].trim();
        }

        // Extracción de cuenta
        let sourceAccount = null;
        if (tmpl.source_account_regex) {
          const reAcc = new RegExp(tmpl.source_account_regex, 'i');
          const aMatch = (subject + ' ' + body).match(reAcc);
          if (aMatch && aMatch[1]) sourceAccount = aMatch[1].trim();
        }

        // Extracción de hora
        let time = null;
        if (tmpl.time_regex) {
          const reTime = new RegExp(tmpl.time_regex, 'i');
          const tMatch = (subject + ' ' + body).match(reTime);
          if (tMatch && tMatch[1]) time = tMatch[1].trim();
        }

        // 4. Enviar candidato de gasto a Deudita
        const payload = {
          gmail_message_id: msgId,
          template_id: tmpl.id,
          amount: rawAmount,
          currency: tmpl.default_currency || 'COP',
          merchant: merchant || tmpl.entity_name || 'Comercio',
          entity: tmpl.entity_name || 'Banco',
          sourceAccount: sourceAccount,
          date: Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd'),
          time: time,
          received_at: date.toISOString()
        };

        try {
          UrlFetchApp.fetch(CONFIG.CANDIDATE_URL, {
            method: 'post',
            contentType: 'application/json',
            headers: { 'Authorization': 'Bearer ' + token },
            payload: JSON.stringify(payload),
            muteHttpExceptions: true
          });
          Logger.log('Gasto detectado y enviado: ' + payload.merchant + ' ' + payload.amount);
        } catch (postErr) {
          Logger.log('Error enviando borrador: ' + postErr);
        }

        break; // Coincidió con una plantilla, pasar al siguiente mensaje
      }
    }

    // Marcar hilo como procesado
    thread.addLabel(label);
  }
}
`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/70 backdrop-blur-sm">
      <div className="bg-white rounded-3xl ring-1 ring-zinc-200 shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="bg-zinc-900 text-white p-6 sm:p-8 flex items-center justify-between border-b border-zinc-800">
          <div className="flex items-center space-x-3.5">
            <div className="w-11 h-11 rounded-2xl bg-zinc-800 ring-1 ring-zinc-700 flex items-center justify-center text-amber-400">
              <MailCheck className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-zinc-50">
                Detección Automática con Gmail
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Privacidad total: tu script corre bajo tu cuenta y solo envía borradores reconocidos
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-zinc-200 bg-zinc-50/70 px-6 pt-3 gap-2 overflow-x-auto">
          <button
            onClick={() => setActiveTab('connection')}
            className={`flex items-center space-x-2 px-4 py-2.5 text-xs font-semibold rounded-t-xl transition-all ${
              activeTab === 'connection'
                ? 'bg-white text-zinc-900 border-t-2 border-zinc-900 shadow-xs'
                : 'text-zinc-500 hover:text-zinc-900'
            }`}
          >
            <Key className="w-4 h-4" />
            <span>1. Conexión y Script</span>
            {connectionData?.status === 'active' && (
              <span className="w-2 h-2 rounded-full bg-emerald-500 ml-1" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('templates')}
            className={`flex items-center space-x-2 px-4 py-2.5 text-xs font-semibold rounded-t-xl transition-all ${
              activeTab === 'templates'
                ? 'bg-white text-zinc-900 border-t-2 border-zinc-900 shadow-xs'
                : 'text-zinc-500 hover:text-zinc-900'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>2. Plantillas Activas ({templates.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('create_template')}
            className={`flex items-center space-x-2 px-4 py-2.5 text-xs font-semibold rounded-t-xl transition-all ${
              activeTab === 'create_template'
                ? 'bg-white text-zinc-900 border-t-2 border-zinc-900 shadow-xs'
                : 'text-zinc-500 hover:text-zinc-900'
            }`}
          >
            <Plus className="w-4 h-4" />
            <span>3. Crear Plantilla (con IA)</span>
          </button>
        </div>

        {/* Alerts */}
        {errorMsg && (
          <div className="mx-6 mt-4 p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-center space-x-2.5 text-xs font-medium text-rose-700">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{errorMsg}</span>
          </div>
        )}
        {successMsg && (
          <div className="mx-6 mt-4 p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center space-x-2.5 text-xs font-medium text-emerald-800">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Tab Contents */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-6">
          {/* TAB 1: CONEXIÓN & SCRIPT */}
          {activeTab === 'connection' && (
            <div className="space-y-6">
              {/* Privacy Banner */}
              <div className="bg-zinc-50 border border-zinc-200/80 rounded-2xl p-4.5 flex items-start space-x-3.5">
                <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div className="text-xs text-zinc-600 space-y-1">
                  <p className="font-semibold text-zinc-900">
                    Tu bandeja de entrada nunca sale de tu cuenta
                  </p>
                  <p>
                    El script de Google Apps Script se ejecuta dentro de tu propio Google Workspace.
                    Solo evalúa si los correos coinciden con las plantillas regex y envía únicamente los datos del comprobante a Deudita.
                  </p>
                </div>
              </div>

              {/* Webhook Token Box */}
              <div className="bg-white border border-zinc-200 rounded-2xl p-5 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 block mb-1">
                      Token de Integración Personal (Webhook)
                    </span>
                    {connectionData?.webhook_token ? (
                      <div className="flex items-center space-x-2">
                        <code className="font-mono text-xs bg-zinc-100 text-zinc-800 px-3 py-1.5 rounded-lg border border-zinc-200 font-semibold">
                          {connectionData.webhook_token}
                        </code>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(connectionData.webhook_token);
                            setCopiedToken(true);
                            setTimeout(() => setCopiedToken(false), 2000);
                          }}
                          className="p-1.5 text-zinc-500 hover:text-zinc-900 rounded-lg hover:bg-zinc-100 transition-colors"
                          title="Copiar token"
                        >
                          {copiedToken ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                        </button>
                      </div>
                    ) : (
                      <p className="text-xs text-zinc-500">Aún no has generado tu token de conexión.</p>
                    )}
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => handleGenerateConnection(!connectionData?.webhook_token)}
                      disabled={isLoading}
                      className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-semibold shadow-xs flex items-center space-x-1.5 transition-all"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                      <span>{connectionData?.webhook_token ? 'Regenerar Token' : 'Generar Token'}</span>
                    </button>
                  </div>
                </div>

                {connectionData?.last_sync_at && (
                  <div className="flex items-center space-x-2 text-[11px] text-zinc-500 pt-2 border-t border-zinc-100">
                    <Clock className="w-3.5 h-3.5 text-zinc-400" />
                    <span>
                      Última sincronización recibida:{' '}
                      <strong>{new Date(connectionData.last_sync_at).toLocaleString()}</strong>
                    </span>
                  </div>
                )}
              </div>

              {/* Instructions & Ready-to-use Apps Script Code */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-zinc-900 flex items-center space-x-2">
                    <Code2 className="w-4 h-4 text-zinc-700" />
                    <span>Instalación en 3 sencillos pasos</span>
                  </h3>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(appsScriptCode);
                      setCopiedScript(true);
                      setTimeout(() => setCopiedScript(false), 2000);
                    }}
                    className="px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-lg text-xs font-medium flex items-center space-x-1.5 transition-colors"
                  >
                    {copiedScript ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedScript ? '¡Código Copiado!' : 'Copiar Código del Script'}</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                  <div className="p-4 bg-zinc-50 border border-zinc-200 rounded-xl space-y-1.5">
                    <span className="w-5 h-5 rounded-full bg-zinc-200 text-zinc-800 font-bold flex items-center justify-center text-[10px]">
                      1
                    </span>
                    <p className="font-semibold text-zinc-900">Abre Google Apps Script</p>
                    <p className="text-zinc-500 text-[11px]">
                      Ve a{' '}
                      <a
                        href="https://script.google.com"
                        target="_blank"
                        rel="noreferrer"
                        className="text-indigo-600 font-medium underline inline-flex items-center"
                      >
                        script.google.com <ExternalLink className="w-2.5 h-2.5 ml-0.5" />
                      </a>{' '}
                      y crea un &quot;Nuevo proyecto&quot;.
                    </p>
                  </div>

                  <div className="p-4 bg-zinc-50 border border-zinc-200 rounded-xl space-y-1.5">
                    <span className="w-5 h-5 rounded-full bg-zinc-200 text-zinc-800 font-bold flex items-center justify-center text-[10px]">
                      2
                    </span>
                    <p className="font-semibold text-zinc-900">Pega el código</p>
                    <p className="text-zinc-500 text-[11px]">
                      Borra el contenido de <code>Código.gs</code>, pega el script con el botón superior y guarda (Ctrl+S).
                    </p>
                  </div>

                  <div className="p-4 bg-zinc-50 border border-zinc-200 rounded-xl space-y-1.5">
                    <span className="w-5 h-5 rounded-full bg-zinc-200 text-zinc-800 font-bold flex items-center justify-center text-[10px]">
                      3
                    </span>
                    <p className="font-semibold text-zinc-900">Activa el temporizador</p>
                    <p className="text-zinc-500 text-[11px]">
                      En el menú lateral de Apps Script haz clic en <strong>Activadores</strong> ⏱️ &gt; Añadir activador &gt; Función <code>procesarGastosGmail</code> &gt; Cada 5 minutos.
                    </p>
                  </div>
                </div>

                <div className="relative rounded-2xl bg-zinc-950 text-zinc-300 p-4 font-mono text-[11px] max-h-56 overflow-y-auto border border-zinc-800">
                  <pre className="whitespace-pre-wrap">{appsScriptCode}</pre>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: PLANTILLAS ACTIVAS */}
          {activeTab === 'templates' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-900">
                    Plantillas Globales Disponibles
                  </h3>
                  <p className="text-xs text-zinc-500">
                    Puedes desactivar individualmente cualquier plantilla que no desees procesar en tu Gmail.
                  </p>
                </div>
                <button
                  onClick={() => setActiveTab('create_template')}
                  className="px-3.5 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-semibold flex items-center space-x-1.5 shadow-xs transition-all"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Crear Plantilla</span>
                </button>
              </div>

              {templates.length === 0 ? (
                <div className="p-12 text-center bg-zinc-50 rounded-2xl border border-zinc-200">
                  <Layers className="w-8 h-8 text-zinc-300 mx-auto mb-2" />
                  <p className="text-xs font-semibold text-zinc-700">No hay plantillas registradas</p>
                  <p className="text-xs text-zinc-400 mt-1">Crea la primera plantilla o usa el asistente con IA.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3.5">
                  {templates.map((tmpl) => (
                    <div
                      key={tmpl.id}
                      className={`p-5 rounded-2xl border transition-all ${
                        tmpl.enabled
                          ? 'bg-white border-zinc-200 shadow-xs'
                          : 'bg-zinc-50/60 border-zinc-200/60 opacity-60'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1.5">
                          <div className="flex items-center space-x-2">
                            <span className="font-semibold text-zinc-900 text-sm">{tmpl.name}</span>
                            {tmpl.entity_name && (
                              <span className="text-[10px] font-bold uppercase tracking-wider bg-zinc-100 text-zinc-700 px-2 py-0.5 rounded-md border border-zinc-200">
                                {tmpl.entity_name}
                              </span>
                            )}
                            <span className="text-[10px] font-bold bg-amber-50 text-amber-700 px-2 py-0.5 rounded-md border border-amber-200">
                              {tmpl.default_currency || 'COP'}
                            </span>
                          </div>

                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-zinc-500 font-mono">
                            {tmpl.sender_pattern && <span>De: {tmpl.sender_pattern}</span>}
                            {tmpl.subject_pattern && <span>Asunto: {tmpl.subject_pattern}</span>}
                            <span className="text-emerald-700 font-medium">Monto: {tmpl.amount_regex}</span>
                          </div>
                        </div>

                        {/* Toggle Button */}
                        <button
                          onClick={() => handleToggleTemplate(tmpl.id, tmpl.enabled)}
                          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                            tmpl.enabled
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                              : 'bg-zinc-200 text-zinc-600 hover:bg-zinc-300'
                          }`}
                        >
                          <Power className="w-3.5 h-3.5" />
                          <span>{tmpl.enabled ? 'Activa' : 'Desactivada'}</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: CREAR PLANTILLA (MANUAL / CON ASISTENTE IA) */}
          {activeTab === 'create_template' && (
            <div className="space-y-6">
              {/* AI Assistant Section */}
              <div className="bg-gradient-to-br from-indigo-50/80 via-white to-amber-50/50 border border-indigo-100 rounded-2xl p-5 space-y-3">
                <div className="flex items-center space-x-2">
                  <Sparkles className="w-5 h-5 text-indigo-600" />
                  <h3 className="text-sm font-semibold text-zinc-900">
                    Asistente de IA: Generar regex a partir de un correo de ejemplo
                  </h3>
                </div>
                <p className="text-xs text-zinc-600">
                  Pega aquí el texto completo o fragmento de una notificación bancaria real (sin datos personales sensibles). La IA analizará los patrones y auto-completará las expresiones regulares.
                </p>

                <textarea
                  value={sampleEmailText}
                  onChange={(e) => setSampleEmailText(e.target.value)}
                  placeholder="Ejemplo: Notificación de compra Bancolombia. Compraste en STARBUCKS el 24/10/2024 por $ 18.500 con tu tarjeta débito *4521..."
                  rows={3}
                  className="w-full px-3.5 py-2.5 bg-white border border-zinc-200 rounded-xl text-xs font-normal text-zinc-800 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleSuggestAI}
                    disabled={isSuggesting || !sampleEmailText.trim()}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold flex items-center space-x-1.5 shadow-xs transition-all disabled:opacity-50"
                  >
                    <Sparkles className={`w-3.5 h-3.5 ${isSuggesting ? 'animate-spin' : ''}`} />
                    <span>{isSuggesting ? 'Analizando con IA...' : 'Sugerir Patrones con IA'}</span>
                  </button>
                </div>
              </div>

              {/* Template Form */}
              <form onSubmit={handleSaveTemplate} className="space-y-4">
                <div className="flex items-center justify-between border-b border-zinc-100 pb-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                    Campos de la Plantilla
                  </h4>
                  <span className="text-[11px] text-zinc-400">
                    Reutilizable globalmente por toda la comunidad
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 mb-1">
                      Nombre de la Plantilla *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ej: Bancolombia - Compras Débito"
                      value={templateForm.name}
                      onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
                      className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-900 focus:bg-white focus:ring-2 focus:ring-zinc-900"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 mb-1">
                      Entidad / Banco Emisor
                    </label>
                    <input
                      type="text"
                      placeholder="Ej: Bancolombia, Nequi, BBVA"
                      value={templateForm.entity_name}
                      onChange={(e) => setTemplateForm({ ...templateForm, entity_name: e.target.value })}
                      className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-900 focus:bg-white focus:ring-2 focus:ring-zinc-900"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 mb-1">
                      Patrón de Remitente (Sender Regex)
                    </label>
                    <input
                      type="text"
                      placeholder="Ej: .*@bancolombia\.com.*"
                      value={templateForm.sender_pattern}
                      onChange={(e) => setTemplateForm({ ...templateForm, sender_pattern: e.target.value })}
                      className="w-full px-3 py-2 font-mono bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-900 focus:bg-white focus:ring-2 focus:ring-zinc-900"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 mb-1">
                      Patrón de Asunto (Subject Regex)
                    </label>
                    <input
                      type="text"
                      placeholder="Ej: .*(compra|pago|aprobada).*"
                      value={templateForm.subject_pattern}
                      onChange={(e) => setTemplateForm({ ...templateForm, subject_pattern: e.target.value })}
                      className="w-full px-3 py-2 font-mono bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-900 focus:bg-white focus:ring-2 focus:ring-zinc-900"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 mb-1">
                      Regex de Monto * (debe contener grupo ())
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ej: por\s*\$?\s*([0-9.,]+)"
                      value={templateForm.amount_regex}
                      onChange={(e) => setTemplateForm({ ...templateForm, amount_regex: e.target.value })}
                      className="w-full px-3 py-2 font-mono bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-emerald-800 font-medium focus:bg-white focus:ring-2 focus:ring-zinc-900"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 mb-1">
                      Regex de Comercio / Destinatario
                    </label>
                    <input
                      type="text"
                      placeholder="Ej: en\s+([A-Za-z0-9\s._-]+?)(?:\s+el|\.|$)"
                      value={templateForm.merchant_regex}
                      onChange={(e) => setTemplateForm({ ...templateForm, merchant_regex: e.target.value })}
                      className="w-full px-3 py-2 font-mono bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-900 focus:bg-white focus:ring-2 focus:ring-zinc-900"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 mb-1">
                      Regex de Fecha
                    </label>
                    <input
                      type="text"
                      placeholder="Ej: ([0-9]{2}/[0-9]{2}/[0-9]{4})"
                      value={templateForm.date_regex}
                      onChange={(e) => setTemplateForm({ ...templateForm, date_regex: e.target.value })}
                      className="w-full px-3 py-2 font-mono bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-900 focus:bg-white focus:ring-2 focus:ring-zinc-900"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 mb-1">
                      Moneda por Defecto
                    </label>
                    <input
                      type="text"
                      placeholder="Ej: COP, USD, EUR, MXN"
                      value={templateForm.default_currency}
                      onChange={(e) => setTemplateForm({ ...templateForm, default_currency: e.target.value })}
                      className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-900 focus:bg-white focus:ring-2 focus:ring-zinc-900"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 mb-1">
                      Regex de Cuenta / Tarjeta
                    </label>
                    <input
                      type="text"
                      placeholder="Ej: cuenta\s*\*?([0-9]{4})"
                      value={templateForm.source_account_regex}
                      onChange={(e) => setTemplateForm({ ...templateForm, source_account_regex: e.target.value })}
                      className="w-full px-3 py-2 font-mono bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-900 focus:bg-white focus:ring-2 focus:ring-zinc-900"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 mb-1">
                      Regex de Hora
                    </label>
                    <input
                      type="text"
                      placeholder="Ej: ([0-9]{1,2}:[0-9]{2})"
                      value={templateForm.time_regex}
                      onChange={(e) => setTemplateForm({ ...templateForm, time_regex: e.target.value })}
                      className="w-full px-3 py-2 font-mono bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-900 focus:bg-white focus:ring-2 focus:ring-zinc-900"
                    />
                  </div>
                </div>

                <div className="pt-4 border-t border-zinc-100 flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => setActiveTab('templates')}
                    className="px-4 py-2 text-xs font-medium text-zinc-600 hover:bg-zinc-100 rounded-xl transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="px-5 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-semibold shadow-xs flex items-center space-x-1.5 transition-all"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Guardar Plantilla</span>
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-zinc-50 border-t border-zinc-200 flex justify-between items-center text-xs text-zinc-500 px-6 sm:px-8">
          <div className="flex items-center space-x-1.5">
            <Info className="w-3.5 h-3.5 text-zinc-400" />
            <span>Los borradores generados aparecerán en la pestaña de Borradores para tu revisión.</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white border border-zinc-200 text-zinc-700 font-semibold rounded-xl hover:bg-zinc-100 transition-all text-xs"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
