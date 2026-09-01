'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import React, { useState, useEffect } from 'react';
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
  Power,
  Info,
  Link2,
  Unlink,
  Check,
  Lock,
} from 'lucide-react';
import { EmailTemplateWithPreference, EmailIngestConnection } from '@/lib/types';

interface GmailIntegrationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ConnectionResponseData extends EmailIngestConnection {
  apps_script_url?: string;
}

export function GmailIntegrationModal({ isOpen, onClose }: GmailIntegrationModalProps) {
  const [activeTab, setActiveTab] = useState<'connection' | 'templates' | 'create_template'>('connection');
  const [isLoading, setIsLoading] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionData, setConnectionData] = useState<ConnectionResponseData | null>(null);
  const [templates, setTemplates] = useState<EmailTemplateWithPreference[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [authUrlOpened, setAuthUrlOpened] = useState<string | null>(null);

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
        setConnectionData(connJson.connection || null);
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
      setAuthUrlOpened(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const isConnected = connectionData?.status === 'active';

  /**
   * Conectar con Google:
   * 1. Llama a POST /api/gmail-connections para generar/reutilizar el webhook_token y obtener la URL del Web App de Apps Script.
   * 2. Abre directamente la URL de autorización de Google para que el usuario solo haga clic en "Permitir".
   */
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
      if (!res.ok) throw new Error(data.error || 'Error al conectar con Google');

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
        // Abrir la pantalla oficial de autorización de Google Apps Script
        const newWindow = window.open(scriptUrl, '_blank');
        if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
          // Si el navegador bloqueó el popup emergente, mantener el botón de acceso directo visible
          setSuccessMsg('Se ha generado tu enlace de conexión. Haz clic en "Abrir ventana de autorización" si no se abrió automáticamente.');
        } else {
          setSuccessMsg('Se ha abierto la pantalla de autorización de Google. Haz clic en "Permitir" con tu cuenta para activar la sincronización.');
        }
      } else {
        setSuccessMsg('Conexión con Google iniciada con éxito');
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Error al conectar con Google');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('¿Deseas pausar la detección automática de Gmail? No recibirás nuevos borradores automáticos hasta que vuelvas a conectar.')) {
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/gmail-connections', {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al desconectar');

      setConnectionData(null);
      setAuthUrlOpened(null);
      setSuccessMsg('Detección de Gmail desactivada');
      await fetchData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Error al desactivar integración');
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/70 backdrop-blur-sm">
      <div className="bg-white rounded-3xl ring-1 ring-zinc-200 shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="bg-zinc-900 text-white p-6 sm:p-7 flex items-center justify-between border-b border-zinc-800">
          <div className="flex items-center space-x-3.5">
            <div className="w-11 h-11 rounded-2xl bg-zinc-800 ring-1 ring-zinc-700 flex items-center justify-center text-amber-400">
              <MailCheck className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-semibold tracking-tight text-zinc-50">
                Detección Automática con Gmail
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Sincroniza tus notificaciones bancarias de forma automática y privada
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
        <div className="flex border-b border-zinc-200 bg-zinc-50/80 px-6 pt-3 gap-2 overflow-x-auto">
          <button
            onClick={() => setActiveTab('connection')}
            className={`flex items-center space-x-2 px-4 py-2.5 text-xs font-semibold rounded-t-xl transition-all ${
              activeTab === 'connection'
                ? 'bg-white text-zinc-900 border-t-2 border-zinc-900 shadow-xs'
                : 'text-zinc-500 hover:text-zinc-900'
            }`}
          >
            <Link2 className="w-4 h-4" />
            <span>1. Conexión con Google</span>
            {isConnected ? (
              <span className="w-2 h-2 rounded-full bg-emerald-500 ml-1 inline-block" />
            ) : (
              <span className="w-2 h-2 rounded-full bg-zinc-300 ml-1 inline-block" />
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
          {/* TAB 1: CONEXIÓN CON GOOGLE */}
          {activeTab === 'connection' && (
            <div className="space-y-6">
              {isConnected ? (
                /* ESTADO: CONECTADO */
                <div className="bg-emerald-50/80 border border-emerald-200 rounded-3xl p-6 sm:p-7 space-y-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center space-x-3.5">
                      <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-sm">
                        <CheckCircle2 className="w-7 h-7" />
                      </div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <h3 className="text-base font-bold text-zinc-900">
                            Gmail Conectado
                          </h3>
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                            Activo
                          </span>
                        </div>
                        <p className="text-xs text-zinc-600 mt-1">
                          Tu cuenta de Gmail está vinculada para detectar automáticamente gastos y comprobantes bancarios.
                        </p>
                      </div>
                    </div>
                  </div>

                  {connectionData?.last_sync_at ? (
                    <div className="flex items-center space-x-2 text-xs text-emerald-900 bg-white/70 border border-emerald-200/80 px-3.5 py-2 rounded-xl">
                      <Clock className="w-4 h-4 text-emerald-700 shrink-0" />
                      <span>
                        Última sincronización recibida:{' '}
                        <strong>{new Date(connectionData.last_sync_at).toLocaleString()}</strong>
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center space-x-2 text-xs text-emerald-900 bg-white/70 border border-emerald-200/80 px-3.5 py-2 rounded-xl">
                      <Check className="w-4 h-4 text-emerald-700 shrink-0" />
                      <span>
                        Listo para recibir notificaciones bancarias en segundo plano.
                      </span>
                    </div>
                  )}

                  <div className="pt-2 flex flex-wrap items-center gap-3">
                    <button
                      onClick={handleConnectWithGoogle}
                      disabled={isConnecting || isLoading}
                      className="px-4 py-2.5 bg-white hover:bg-zinc-50 border border-emerald-300 text-emerald-900 font-semibold rounded-xl text-xs shadow-2xs flex items-center space-x-2 transition-all cursor-pointer"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isConnecting ? 'animate-spin' : ''}`} />
                      <span>Reconectar o Actualizar Permisos</span>
                    </button>

                    <button
                      onClick={handleDisconnect}
                      disabled={isLoading}
                      className="px-4 py-2.5 bg-transparent hover:bg-rose-50 border border-rose-200 text-rose-700 font-semibold rounded-xl text-xs transition-all flex items-center space-x-1.5 cursor-pointer ml-auto"
                    >
                      <Unlink className="w-3.5 h-3.5" />
                      <span>Desconectar Gmail</span>
                    </button>
                  </div>
                </div>
              ) : (
                /* ESTADO: NO CONECTADO */
                <div className="space-y-6">
                  {/* Hero Box */}
                  <div className="bg-gradient-to-b from-zinc-50 to-white border border-zinc-200 rounded-3xl p-6 sm:p-8 text-center space-y-4 shadow-2xs">
                    <div className="w-14 h-14 rounded-2xl bg-zinc-900 text-white flex items-center justify-center mx-auto shadow-md">
                      <MailCheck className="w-7 h-7 text-amber-400" />
                    </div>

                    <div className="max-w-lg mx-auto space-y-1.5">
                      <h3 className="text-lg font-bold text-zinc-900">
                        Conecta tu correo para detectar gastos bancarios
                      </h3>
                      <p className="text-xs sm:text-sm text-zinc-600 leading-relaxed">
                        Detecta automáticamente transferencias, pagos con tarjeta y comprobantes bancarios en tu Gmail. No requiere configuración manual.
                      </p>
                    </div>

                    {/* Single Connect Button */}
                    <div className="pt-2 flex flex-col items-center justify-center gap-3">
                      <button
                        onClick={handleConnectWithGoogle}
                        disabled={isConnecting || isLoading}
                        className="w-full sm:w-auto min-w-[240px] px-6 py-3.5 bg-zinc-900 hover:bg-zinc-800 text-white font-semibold rounded-2xl text-sm shadow-md flex items-center justify-center space-x-2.5 transition-all active:scale-98 cursor-pointer disabled:opacity-75"
                      >
                        {isConnecting ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />
                            <span>Conectando con Google...</span>
                          </>
                        ) : (
                          <>
                            {/* Google Colors G Icon SVG */}
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
                        <div className="mt-2 text-xs text-zinc-600 bg-amber-50 border border-amber-200 rounded-xl p-3 max-w-md text-left flex items-start space-x-2.5">
                          <Info className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                          <div className="space-y-1">
                            <p className="font-semibold text-amber-900">
                              ¿No se abrió la ventana de autorización?
                            </p>
                            <p className="text-[11px] text-amber-800">
                              Si tu navegador bloqueó la ventana emergente, haz clic aquí:
                            </p>
                            <a
                              href={authUrlOpened}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center space-x-1 text-xs font-bold text-amber-900 underline hover:text-amber-950 pt-1"
                            >
                              <span>Abrir pantalla de autorización de Google</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Highlights Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                    <div className="p-4 bg-zinc-50 border border-zinc-200/80 rounded-2xl space-y-1.5">
                      <div className="w-7 h-7 rounded-lg bg-zinc-200 text-zinc-800 flex items-center justify-center">
                        <Check className="w-4 h-4 text-zinc-800" />
                      </div>
                      <p className="text-xs font-bold text-zinc-900">Sin código manual</p>
                      <p className="text-[11px] text-zinc-500 leading-relaxed">
                        Solo autorizas con tu cuenta de Google. Todo se configura y ejecuta automáticamente.
                      </p>
                    </div>

                    <div className="p-4 bg-zinc-50 border border-zinc-200/80 rounded-2xl space-y-1.5">
                      <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center">
                        <Lock className="w-4 h-4 text-emerald-700" />
                      </div>
                      <p className="text-xs font-bold text-zinc-900">Privacidad estricta</p>
                      <p className="text-[11px] text-zinc-500 leading-relaxed">
                        Solo se extraen datos de correos que coincidan con las plantillas bancarias activas.
                      </p>
                    </div>

                    <div className="p-4 bg-zinc-50 border border-zinc-200/80 rounded-2xl space-y-1.5">
                      <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center">
                        <MailCheck className="w-4 h-4 text-amber-700" />
                      </div>
                      <p className="text-xs font-bold text-zinc-900">Tú apruebas todo</p>
                      <p className="text-[11px] text-zinc-500 leading-relaxed">
                        Cada gasto detectado entra como borrador en Tickets para que lo asignes a tus grupos con un toque.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Privacy Footer Notice */}
              <div className="bg-zinc-50 border border-zinc-200/80 rounded-2xl p-4 flex items-start space-x-3">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div className="text-[11px] text-zinc-600 space-y-0.5">
                  <span className="font-semibold text-zinc-900">Procesamiento seguro: </span>
                  <span>
                    La lectura de notificaciones se ejecuta bajo tu propia sesión de Google. Nunca se almacenan contraseñas ni se leen correos personales fuera de los patrones bancarios definidos.
                  </span>
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
                    Plantillas de Notificaciones Bancarias
                  </h3>
                  <p className="text-xs text-zinc-500">
                    Activa o desactiva las entidades que deseas detectar en tu correo de Gmail.
                  </p>
                </div>
                <button
                  onClick={() => setActiveTab('create_template')}
                  className="px-3.5 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-semibold flex items-center space-x-1.5 shadow-xs transition-all cursor-pointer"
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
                <div className="grid grid-cols-1 gap-3">
                  {templates.map((tmpl) => (
                    <div
                      key={tmpl.id}
                      className={`p-4 sm:p-5 rounded-2xl border transition-all ${
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
                          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
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

          {/* TAB 3: CREAR PLANTILLA (CON ASISTENTE IA) */}
          {activeTab === 'create_template' && (
            <div className="space-y-6">
              {/* AI Assistant Section */}
              <div className="bg-gradient-to-br from-indigo-50/80 via-white to-amber-50/50 border border-indigo-100 rounded-2xl p-5 space-y-3">
                <div className="flex items-center space-x-2">
                  <Sparkles className="w-5 h-5 text-indigo-600" />
                  <h3 className="text-sm font-semibold text-zinc-900">
                    Asistente de IA: Generar patrones a partir de un correo de ejemplo
                  </h3>
                </div>
                <p className="text-xs text-zinc-600">
                  Pega aquí el texto completo de una notificación bancaria real (sin datos personales sensibles). La IA extraerá automáticamente las expresiones regulares.
                </p>

                <textarea
                  value={sampleEmailText}
                  onChange={(e) => setSampleEmailText(e.target.value)}
                  placeholder="Ejemplo: Notificación Bancolombia: Compraste en RESTAURANTE EL ROBLE el 24/10/2024 por $ 45.000 con tu tarjeta débito *4521..."
                  rows={3}
                  className="w-full px-3.5 py-2.5 bg-white border border-zinc-200 rounded-xl text-xs font-normal text-zinc-800 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleSuggestAI}
                    disabled={isSuggesting || !sampleEmailText.trim()}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold flex items-center space-x-1.5 shadow-xs transition-all disabled:opacity-50 cursor-pointer"
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
                    Disponible globalmente para todos los usuarios
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
                      placeholder="Ej: Bancolombia, Nequi, BBVA, Davivienda"
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
                      placeholder="Ej: .*(compra|pago|transferencia).*"
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
                    className="px-4 py-2 text-xs font-medium text-zinc-600 hover:bg-zinc-100 rounded-xl transition-all cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="px-5 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-semibold shadow-xs flex items-center space-x-1.5 transition-all cursor-pointer"
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
            <span>Los comprobantes detectados se guardarán como borradores en la sección de Tickets.</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white border border-zinc-200 text-zinc-700 font-semibold rounded-xl hover:bg-zinc-100 transition-all text-xs cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
