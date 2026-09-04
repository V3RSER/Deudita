'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Mail,
  Search,
  RotateCcw,
  Play,
  CheckCircle2,
  AlertCircle,
  Terminal,
  Send,
  X,
  Edit3,
  FileText,
  ShieldCheck,
  ExternalLink,
  KeyRound,
  Check,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { CatalogTemplate, CatalogEntity, simulateGoogleAppsScriptProcess, AppsScriptSimulationResult } from '@/lib/email-matching';
import { EmailItem } from '@/app/api/gmail/emails/route';
import { formatCurrency } from '@/lib/balance-utils';

interface EmailTesterFeedProps {
  templates: CatalogTemplate[];
  entities: CatalogEntity[];
  onLoadIntoEditor: (email: { sender: string; subject: string; plainBody: string }, template?: CatalogTemplate | null) => void;
}

const LIMIT_OPTIONS = [10, 20, 50];

export function EmailTesterFeed({ templates, entities, onLoadIntoEditor }: EmailTesterFeedProps) {
  const [emails, setEmails] = useState<EmailItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);

  // Filters
  const [searchSubject, setSearchSubject] = useState('');
  const [limit, setLimit] = useState<number>(10);
  const [selectedEntity, setSelectedEntity] = useState<string>('all');
  const [serverInfo, setServerInfo] = useState<{
    connected: boolean;
    live: boolean;
    requiresAuth?: boolean;
    userEmail?: string;
    notice?: string;
  } | null>(null);

  // Simulation modal state
  const [activeSimulation, setActiveSimulation] = useState<{
    email: EmailItem;
    result: AppsScriptSimulationResult;
  } | null>(null);

  const [isSendingCandidate, setIsSendingCandidate] = useState(false);
  const [candidateSentSuccess, setCandidateSentSuccess] = useState<string | null>(null);
  const [candidateSentError, setCandidateSentError] = useState<string | null>(null);
  const [showFullLogs, setShowFullLogs] = useState(false);

  // Custom token modal / accordion for manual token support
  const [showManualToken, setShowManualToken] = useState(false);
  const [manualTokenInput, setManualTokenInput] = useState('');
  const [manualTokenSaving, setManualTokenSaving] = useState(false);
  const [manualTokenMsg, setManualTokenMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // 1. Check logged-in user on mount
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user?.email) {
        setCurrentUserEmail(data.user.email);
      }
    });
  }, []);

  // 2. Fetch real emails from logged-in user's Gmail
  const fetchEmails = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData?.session;

      const headers: Record<string, string> = {};
      if (session?.provider_token) {
        headers['x-google-token'] = session.provider_token;
      }

      const params = new URLSearchParams();
      params.set('limit', String(limit));
      if (searchSubject.trim()) {
        params.set('subject', searchSubject.trim());
      }
      if (selectedEntity !== 'all') {
        params.set('entity', selectedEntity);
      }

      const res = await fetch(`/api/gmail/emails?${params.toString()}`, {
        headers,
      });

      const data = await res.json();

      if (!res.ok && res.status !== 401) {
        throw new Error(data.error || `Error ${res.status}: no se pudieron cargar los correos`);
      }

      setEmails(data.emails || []);
      setServerInfo({
        connected: Boolean(data.connected),
        live: Boolean(data.live),
        requiresAuth: Boolean(data.requiresAuth || res.status === 401),
        userEmail: data.userEmail || currentUserEmail || undefined,
        notice: data.notice,
      });

      if (data.userEmail) {
        setCurrentUserEmail(data.userEmail);
      }

      if (data.error && res.status !== 401) {
        setError(data.error);
      }

      setHasLoadedOnce(true);
    } catch (err: unknown) {
      console.error('[EmailTesterFeed] Error fetching emails:', err);
      setError(err instanceof Error ? err.message : 'Error al consultar correos de Gmail');
    } finally {
      setIsLoading(false);
    }
  }, [limit, searchSubject, selectedEntity, currentUserEmail]);

  // Initial load when filter parameters change
  useEffect(() => {
    fetchEmails();
  }, [fetchEmails]);

  // Handle Google OAuth authorization
  const handleAuthorizeGmail = async () => {
    setIsAuthorizing(true);
    setError(null);
    try {
      const supabase = createClient();
      const returnUrl = `${window.location.origin}/auth/callback?returnTo=${encodeURIComponent(window.location.pathname)}`;
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: returnUrl,
          scopes: 'https://www.googleapis.com/auth/gmail.readonly',
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });

      if (oauthError) {
        throw oauthError;
      }
    } catch (err: unknown) {
      console.error('[EmailTesterFeed] Error en signInWithOAuth:', err);
      setError(err instanceof Error ? err.message : 'No se pudo iniciar la autorización con Google');
      setIsAuthorizing(false);
    }
  };

  // Handle manual token save
  const handleSaveManualToken = async () => {
    if (!manualTokenInput.trim()) return;
    setManualTokenSaving(true);
    setManualTokenMsg(null);
    try {
      const res = await fetch('/api/gmail/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: manualTokenInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Token inválido');
      }
      setManualTokenMsg({
        type: 'success',
        text: `¡Token validado! Conectado a ${data.email} (${data.messagesTotal} mensajes disponibles).`,
      });
      setManualTokenInput('');
      setShowManualToken(false);
      await fetchEmails();
    } catch (err: unknown) {
      setManualTokenMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Error al validar token',
      });
    } finally {
      setManualTokenSaving(false);
    }
  };

  // Execute Google Apps Script simulation on a specific real email
  const handleTestScan = (email: EmailItem) => {
    setCandidateSentSuccess(null);
    setCandidateSentError(null);
    setShowFullLogs(false);

    const simulationResult = simulateGoogleAppsScriptProcess(
      {
        id: email.id,
        subject: email.subject,
        sender: email.sender,
        plainBody: email.plainBody,
        date: email.date,
      },
      templates,
      entities
    );

    setActiveSimulation({
      email,
      result: simulationResult,
    });
  };

  // Send candidate to /api/expense-candidate (real webhook simulation)
  const handleSendAsRealDraft = async () => {
    if (!activeSimulation?.result?.match) return;

    setIsSendingCandidate(true);
    setCandidateSentError(null);
    setCandidateSentSuccess(null);

    try {
      const match = activeSimulation.result.match;
      const res = await fetch('/api/expense-candidate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          gmail_message_id: match.gmail_message_id || activeSimulation.email.id,
          template_id: match.templateId,
          amount: match.amount,
          currency: match.currency || 'COP',
          merchant: match.merchant,
          entity: match.entity,
          source_account: match.sourceAccount,
          date: match.date,
          time: match.time,
          received_at: match.received_at,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al registrar candidato');
      }

      setCandidateSentSuccess('¡Borrador registrado exitosamente en Deudita! Ya puedes verlo en la pestaña "Borradores".');
    } catch (err: unknown) {
      setCandidateSentError(err instanceof Error ? err.message : 'Error al enviar candidato a Deudita');
    } finally {
      setIsSendingCandidate(false);
    }
  };

  // Extract distinct entities from templates
  const entityOptions = useMemo(() => {
    const set = new Set<string>();
    entities.forEach((e) => set.add(e.name));
    templates.forEach((t) => {
      if (t.entity_name) set.add(t.entity_name);
    });
    return Array.from(set).sort();
  }, [entities, templates]);

  const isFiltered = searchSubject.trim().length > 0 || selectedEntity !== 'all' || limit !== 10;

  const handleResetFilters = () => {
    setSearchSubject('');
    setSelectedEntity('all');
    setLimit(10);
  };

  const isGmailConnected = Boolean(serverInfo?.connected && !serverInfo?.requiresAuth);

  return (
    <div className="space-y-4" id="probador-email-feed">
      {/* Main Feed Card */}
      <div className="bg-white border border-zinc-200/80 rounded-2xl p-5 sm:p-6 shadow-2xs space-y-4">
        {/* Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-zinc-100">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-zinc-900 text-white flex items-center justify-center shrink-0">
                <Mail className="w-4 h-4" />
              </div>
              <h3 className="text-base font-semibold text-zinc-900">Bandeja de Gmail del Usuario</h3>
              {isGmailConnected ? (
                <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <span>Conectado: {currentUserEmail || serverInfo?.userEmail}</span>
                </span>
              ) : (
                <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 text-amber-800 border border-amber-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                  <span>Requiere Autorización de Gmail</span>
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-500">
              Recupera tus correos reales de Gmail ({currentUserEmail || 'tu cuenta'}) para probar el escaneo y extracción de plantillas con Google Apps Script.
            </p>
          </div>

          <div className="flex items-center space-x-2 self-start sm:self-auto">
            {isGmailConnected ? (
              <button
                type="button"
                id="btn-cargar-correos"
                onClick={fetchEmails}
                disabled={isLoading}
                className="inline-flex items-center space-x-2 px-3.5 py-2 text-xs font-semibold bg-zinc-900 text-white hover:bg-zinc-800 disabled:bg-zinc-300 rounded-xl transition shadow-2xs cursor-pointer"
              >
                <RotateCcw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                <span>{isLoading ? 'Consultando Gmail...' : 'Cargar Correos'}</span>
              </button>
            ) : (
              <button
                type="button"
                id="btn-autorizar-gmail"
                onClick={handleAuthorizeGmail}
                disabled={isAuthorizing}
                className="inline-flex items-center space-x-2 px-4 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white disabled:bg-emerald-300 rounded-xl transition shadow-2xs cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>{isAuthorizing ? 'Conectando...' : 'Autorizar Gmail con Google'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Authorization Banner if not connected */}
        {!isGmailConnected && hasLoadedOnce && (
          <div className="p-4 bg-amber-50/70 border border-amber-200 rounded-xl space-y-3">
            <div className="flex items-start space-x-3">
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1 flex-1">
                <h4 className="text-xs font-bold text-amber-950 uppercase tracking-wide">
                  Autorización de lectura de Gmail requerida
                </h4>
                <p className="text-xs text-amber-900 leading-relaxed">
                  Para recuperar los correos de tu cuenta{' '}
                  <strong className="font-semibold text-amber-950">
                    {currentUserEmail || serverInfo?.userEmail || 'de Google'}
                  </strong>{' '}
                  y probar el escaneo con tus plantillas, debes conceder permiso de lectura de Gmail.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-amber-200/60">
              <button
                type="button"
                onClick={handleAuthorizeGmail}
                disabled={isAuthorizing}
                className="inline-flex items-center space-x-2 px-3.5 py-1.5 text-xs font-semibold bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl transition shadow-2xs cursor-pointer"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>{isAuthorizing ? 'Iniciando autorización...' : 'Conectar y Autorizar Gmail Ahora'}</span>
              </button>

              <button
                type="button"
                onClick={() => setShowManualToken(!showManualToken)}
                className="px-2.5 py-1.5 text-xs text-zinc-600 hover:text-zinc-900 transition flex items-center space-x-1 cursor-pointer"
              >
                <KeyRound className="w-3.5 h-3.5 text-zinc-400" />
                <span>{showManualToken ? 'Ocultar entrada de token' : 'Ingresar token manualmente'}</span>
              </button>
            </div>

            {/* Optional manual token input for testing */}
            {showManualToken && (
              <div className="pt-2 border-t border-amber-200/60 space-y-2">
                <label className="text-[11px] font-medium text-zinc-700 block">
                  Pega un Access Token de Google OAuth (ya generado):
                </label>
                <div className="flex items-center space-x-2">
                  <input
                    type="password"
                    placeholder="ya29.a0AfH6SM..."
                    value={manualTokenInput}
                    onChange={(e) => setManualTokenInput(e.target.value)}
                    className="flex-1 px-3 py-1.5 text-xs bg-white border border-zinc-200 rounded-lg text-zinc-800 font-mono focus:outline-none focus:border-zinc-400"
                  />
                  <button
                    type="button"
                    onClick={handleSaveManualToken}
                    disabled={manualTokenSaving || !manualTokenInput.trim()}
                    className="px-3 py-1.5 text-xs font-semibold bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 disabled:bg-zinc-300 transition cursor-pointer"
                  >
                    {manualTokenSaving ? 'Validando...' : 'Guardar Token'}
                  </button>
                </div>
                {manualTokenMsg && (
                  <p
                    className={`text-[11px] font-medium ${
                      manualTokenMsg.type === 'success' ? 'text-emerald-700' : 'text-rose-700'
                    }`}
                  >
                    {manualTokenMsg.text}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Filter Bar */}
        <div className="bg-zinc-50/80 border border-zinc-200/70 rounded-xl p-3 space-y-3">
          <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2.5">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                id="filter-email-subject"
                placeholder="Buscar por asunto, remitente o palabra clave en tu Gmail..."
                value={searchSubject}
                onChange={(e) => setSearchSubject(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') fetchEmails();
                }}
                className="w-full pl-9 pr-8 py-1.5 text-xs bg-white border border-zinc-200 rounded-lg text-zinc-800 placeholder-zinc-400 focus:outline-none focus:border-zinc-400"
              />
              {searchSubject && (
                <button
                  type="button"
                  onClick={() => setSearchSubject('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Entity Select */}
            {entityOptions.length > 0 && (
              <div className="w-full md:w-48">
                <select
                  id="filter-email-entity"
                  value={selectedEntity}
                  onChange={(e) => setSelectedEntity(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-white border border-zinc-200 rounded-lg text-zinc-800 focus:outline-none focus:border-zinc-400 cursor-pointer"
                >
                  <option value="all">Todas las entidades</option>
                  {entityOptions.map((ent) => (
                    <option key={ent} value={ent}>
                      {ent}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Quantity Limit Pills */}
            <div className="flex items-center space-x-1 bg-zinc-200/60 p-0.5 rounded-lg shrink-0">
              {LIMIT_OPTIONS.map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setLimit(val)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition cursor-pointer ${
                    limit === val ? 'bg-white text-zinc-900 shadow-2xs font-semibold' : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  {val} correos
                </button>
              ))}
            </div>

            {/* Reset Button */}
            {isFiltered && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="px-2.5 py-1.5 text-xs text-zinc-500 hover:text-zinc-800 hover:bg-zinc-200/60 rounded-lg transition flex items-center space-x-1 shrink-0 cursor-pointer"
                title="Restablecer filtros"
              >
                <RotateCcw className="w-3 h-3" />
                <span className="hidden sm:inline">Limpiar</span>
              </button>
            )}
          </div>

          {serverInfo?.notice && (
            <p className="text-[11px] text-zinc-500 flex items-center space-x-1.5">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-zinc-400" />
              <span>{serverInfo.notice}</span>
            </p>
          )}
        </div>

        {/* Error notice */}
        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Email Cards List */}
        {isLoading ? (
          <div className="py-12 text-center space-y-3">
            <div className="w-8 h-8 border-2 border-zinc-900 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs text-zinc-500 font-medium">
              Consultando bandeja de entrada de Gmail ({currentUserEmail || 'tu cuenta'})...
            </p>
          </div>
        ) : !isGmailConnected ? (
          <div className="py-12 text-center space-y-3 border border-dashed border-zinc-200 rounded-xl bg-zinc-50/50">
            <Mail className="w-9 h-9 text-zinc-400 mx-auto" />
            <div className="space-y-1">
              <p className="text-xs font-semibold text-zinc-800">
                Conecta tu cuenta de Gmail ({currentUserEmail || 'de Google'})
              </p>
              <p className="text-[11px] text-zinc-500 max-w-sm mx-auto">
                No hay datos de prueba cargados. Para ver tus correos reales, presiona el botón de autorizar acceso con Google.
              </p>
            </div>
            <button
              type="button"
              onClick={handleAuthorizeGmail}
              disabled={isAuthorizing}
              className="inline-flex items-center space-x-2 px-4 py-2 text-xs font-semibold bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl transition shadow-2xs cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Autorizar Gmail con Google</span>
            </button>
          </div>
        ) : emails.length === 0 ? (
          <div className="py-10 text-center space-y-2 border border-dashed border-zinc-200 rounded-xl">
            <Mail className="w-8 h-8 text-zinc-300 mx-auto" />
            <p className="text-xs font-semibold text-zinc-700">No se encontraron correos en tu bandeja de Gmail</p>
            <p className="text-[11px] text-zinc-400">
              {searchSubject
                ? `No hay correos que coincidan con "${searchSubject}". Intenta con otra búsqueda.`
                : 'Tu bandeja de entrada no arrojó resultados para los filtros seleccionados.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-xs text-zinc-500 px-1">
              <span>
                Mostrando <strong>{emails.length}</strong> correos reales de tu cuenta ({currentUserEmail})
              </span>
              <span className="text-[11px]">Haz clic en &quot;Probar Escaneo&quot; para simular Google Apps Script</span>
            </div>

            <div className="grid grid-cols-1 gap-2.5">
              {emails.map((email) => {
                const dateObj = new Date(email.date);
                const formattedDate = isNaN(dateObj.getTime())
                  ? email.date
                  : dateObj.toLocaleDateString('es-CO', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    });

                return (
                  <div
                    key={email.id}
                    className="p-3.5 bg-white border border-zinc-200/90 hover:border-zinc-300 rounded-xl shadow-2xs hover:shadow-xs transition flex flex-col md:flex-row md:items-center justify-between gap-3 group"
                  >
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {email.entityName ? (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-zinc-100 text-zinc-800 border border-zinc-200">
                            {email.entityName}
                          </span>
                        ) : null}
                        <span className="text-[11px] text-zinc-400 font-mono">{formattedDate}</span>
                      </div>

                      <h4 className="text-xs font-semibold text-zinc-900 group-hover:text-black line-clamp-1">
                        {email.subject || '(Sin Asunto)'}
                      </h4>

                      <div className="text-[11px] text-zinc-500 flex items-center space-x-1 line-clamp-1">
                        <span className="font-medium text-zinc-600">De:</span>
                        <span className="truncate">{email.sender}</span>
                      </div>

                      <p className="text-[11px] text-zinc-500 line-clamp-2 bg-zinc-50/70 p-1.5 rounded-lg border border-zinc-100 font-mono">
                        {email.snippet || email.plainBody.substring(0, 140)}
                      </p>
                    </div>

                    <div className="flex items-center space-x-2 shrink-0 self-end md:self-center pt-2 md:pt-0 border-t md:border-t-0 border-zinc-100 w-full md:w-auto justify-end">
                      <button
                        type="button"
                        onClick={() => onLoadIntoEditor({ sender: email.sender, subject: email.subject, plainBody: email.plainBody })}
                        className="px-2.5 py-1.5 text-xs font-medium text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 border border-zinc-200 rounded-xl transition flex items-center space-x-1.5 cursor-pointer"
                        title="Cargar texto en el editor de plantilla manual"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Cargar en Editor</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleTestScan(email)}
                        className="px-3 py-1.5 text-xs font-semibold text-white bg-zinc-900 hover:bg-zinc-800 rounded-xl transition flex items-center space-x-1.5 shadow-2xs cursor-pointer"
                        title="Simular escaneo de Google Apps Script"
                      >
                        <Play className="w-3.5 h-3.5 text-emerald-400 fill-emerald-400" />
                        <span>Probar Escaneo</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Simulation Result Modal */}
      {activeSimulation && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full border border-zinc-200 shadow-2xl overflow-hidden my-6 animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/80">
              <div className="flex items-center space-x-2.5">
                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                    activeSimulation.result.matched
                      ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                      : 'bg-amber-50 text-amber-600 border border-amber-200'
                  }`}
                >
                  {activeSimulation.result.matched ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : (
                    <AlertCircle className="w-4 h-4" />
                  )}
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-zinc-900">Resultado de Simulación Apps Script</h3>
                  <p className="text-[11px] text-zinc-500 truncate max-w-md">
                    {activeSimulation.email.subject}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setActiveSimulation(null)}
                className="p-1.5 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-200/50 rounded-lg transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
              {/* Verdict Banner */}
              {activeSimulation.result.matched ? (
                <div className="p-4 bg-emerald-50/80 border border-emerald-200 rounded-xl space-y-2">
                  <div className="flex items-center space-x-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <h4 className="text-xs font-bold text-emerald-900 uppercase tracking-wide">
                      ¡Match Exitoso en Google Apps Script!
                    </h4>
                  </div>
                  <p className="text-xs text-emerald-800">
                    El mensaje cumplió los 3 niveles de filtrado de Google Apps Script y extrajo un monto numérico válido con la plantilla{' '}
                    <span className="font-semibold text-emerald-950">
                      &quot;{activeSimulation.result.matchedTemplate?.name}&quot;
                    </span>.
                  </p>
                </div>
              ) : (
                <div className="p-4 bg-amber-50/80 border border-amber-200 rounded-xl space-y-2">
                  <div className="flex items-center space-x-2">
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    <h4 className="text-xs font-bold text-amber-900 uppercase tracking-wide">
                      Sin Coincidencia (Descartado por Google Apps Script)
                    </h4>
                  </div>
                  <p className="text-xs text-amber-800">
                    {activeSimulation.result.rejectionReason ||
                      'El mensaje fue descartado en los filtros de entidad, asunto o no se pudo extraer el monto numérico.'}
                  </p>
                </div>
              )}

              {/* Extracted Data Card (If matched) */}
              {activeSimulation.result.match && (
                <div className="space-y-3">
                  <h4 className="text-xs font-semibold text-zinc-800 flex items-center space-x-1.5">
                    <FileText className="w-3.5 h-3.5 text-zinc-500" />
                    <span>Datos Detectados por la Plantilla</span>
                  </h4>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                    <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-xl space-y-0.5">
                      <span className="text-[10px] text-zinc-400 font-medium uppercase">Monto</span>
                      <p className="text-sm font-bold text-zinc-900">
                        {formatCurrency(activeSimulation.result.match.amount, activeSimulation.result.match.currency || 'COP')}
                      </p>
                    </div>

                    <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-xl space-y-0.5">
                      <span className="text-[10px] text-zinc-400 font-medium uppercase">Comercio</span>
                      <p className="text-xs font-semibold text-zinc-800 truncate">
                        {activeSimulation.result.match.merchant || '(No detectado)'}
                      </p>
                    </div>

                    <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-xl space-y-0.5">
                      <span className="text-[10px] text-zinc-400 font-medium uppercase">Entidad</span>
                      <p className="text-xs font-semibold text-zinc-800 truncate">
                        {activeSimulation.result.match.entity || '(No detectada)'}
                      </p>
                    </div>

                    <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-xl space-y-0.5">
                      <span className="text-[10px] text-zinc-400 font-medium uppercase">Concepto Armado</span>
                      <p className="text-xs font-semibold text-zinc-800 truncate">
                        {activeSimulation.result.match.concept || '(No generado)'}
                      </p>
                    </div>

                    <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-xl space-y-0.5">
                      <span className="text-[10px] text-zinc-400 font-medium uppercase">Fecha y Hora</span>
                      <p className="text-xs font-semibold text-zinc-800">
                        {activeSimulation.result.match.date || 'Hoy'}{' '}
                        {activeSimulation.result.match.time || ''}
                      </p>
                    </div>

                    <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-xl space-y-0.5">
                      <span className="text-[10px] text-zinc-400 font-medium uppercase">Cuenta Origen</span>
                      <p className="text-xs font-semibold text-zinc-800">
                        {activeSimulation.result.match.sourceAccount ? `*${activeSimulation.result.match.sourceAccount}` : '(Sin cuenta)'}
                      </p>
                    </div>
                  </div>

                  {/* Webhook Payload JSON preview */}
                  <div className="space-y-1 pt-1">
                    <span className="text-[11px] font-medium text-zinc-500">
                      Payload que enviaría Apps Script a <code className="text-[10px] bg-zinc-100 px-1 py-0.5 rounded">POST /api/expense-candidate</code>:
                    </span>
                    <pre className="p-3 bg-zinc-900 text-emerald-400 rounded-xl text-[11px] font-mono overflow-x-auto leading-relaxed">
                      {JSON.stringify(
                        {
                          gmail_message_id: activeSimulation.result.match.gmail_message_id,
                          template_id: activeSimulation.result.match.templateId,
                          amount: activeSimulation.result.match.amount,
                          currency: activeSimulation.result.match.currency,
                          merchant: activeSimulation.result.match.merchant,
                          entity: activeSimulation.result.match.entity,
                          sourceAccount: activeSimulation.result.match.sourceAccount,
                          date: activeSimulation.result.match.date,
                          time: activeSimulation.result.match.time,
                          concept: activeSimulation.result.match.concept,
                        },
                        null,
                        2
                      )}
                    </pre>
                  </div>

                  {/* Candidate creation success or error */}
                  {candidateSentSuccess && (
                    <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center space-x-2">
                      <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                      <span>{candidateSentSuccess}</span>
                    </div>
                  )}

                  {candidateSentError && (
                    <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex items-center space-x-2">
                      <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                      <span>{candidateSentError}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Execution Logs Terminal */}
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between text-xs text-zinc-500">
                  <span className="font-medium flex items-center space-x-1.5">
                    <Terminal className="w-3.5 h-3.5" />
                    <span>Logs de Ejecución Apps Script ({activeSimulation.result.logs.length})</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowFullLogs(!showFullLogs)}
                    className="text-[11px] text-indigo-600 hover:text-indigo-800 font-medium"
                  >
                    {showFullLogs ? 'Ocultar detalles' : 'Ver todos los pasos'}
                  </button>
                </div>

                <div className="p-3 bg-zinc-950 text-zinc-300 rounded-xl text-[11px] font-mono space-y-1 max-h-48 overflow-y-auto">
                  {(showFullLogs
                    ? activeSimulation.result.logs
                    : activeSimulation.result.logs.slice(-6)
                  ).map((log, i) => {
                    const isSuccess = log.includes('✅') || log.includes('✓');
                    const isWarning = log.includes('⚠️') || log.includes('✋');
                    const isError = log.includes('❌');

                    return (
                      <div
                        key={i}
                        className={`leading-relaxed ${
                          isSuccess
                            ? 'text-emerald-400'
                            : isWarning
                            ? 'text-amber-300'
                            : isError
                            ? 'text-rose-400'
                            : 'text-zinc-400'
                        }`}
                      >
                        {log}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Modal Footer Actions */}
            <div className="px-5 py-3.5 bg-zinc-50 border-t border-zinc-100 flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  onLoadIntoEditor(
                    {
                      sender: activeSimulation.email.sender,
                      subject: activeSimulation.email.subject,
                      plainBody: activeSimulation.email.plainBody,
                    },
                    activeSimulation.result.matchedTemplate
                  );
                  setActiveSimulation(null);
                }}
                className="px-3 py-1.5 text-xs font-medium text-zinc-700 hover:text-zinc-900 hover:bg-zinc-200/60 border border-zinc-200 rounded-xl transition flex items-center space-x-1.5 cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Cargar en Editor de Plantilla</span>
              </button>

              <div className="flex items-center space-x-2">
                {activeSimulation.result.match && !candidateSentSuccess && (
                  <button
                    type="button"
                    onClick={handleSendAsRealDraft}
                    disabled={isSendingCandidate}
                    className="px-3.5 py-1.5 text-xs font-semibold text-white bg-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-300 rounded-xl transition flex items-center space-x-1.5 shadow-2xs cursor-pointer"
                  >
                    <Send className="w-3 h-3 text-emerald-400" />
                    <span>
                      {isSendingCandidate ? 'Registrando...' : 'Enviar como Borrador Real a Deudita'}
                    </span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setActiveSimulation(null)}
                  className="px-3 py-1.5 text-xs font-medium text-zinc-600 hover:text-zinc-800 rounded-xl transition cursor-pointer"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
