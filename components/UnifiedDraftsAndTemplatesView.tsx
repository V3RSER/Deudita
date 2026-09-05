'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Inbox,
  Search,
  Building2,
  Trash2,
  Check,
  CreditCard,
  Calendar,
  ChevronDown,
  ChevronUp,
  MailCheck,
  Loader2,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';
import { useExpense } from '@/lib/expense-context';
import { ExpenseDraft } from '@/lib/types';
import { formatCurrency } from '@/lib/balance-utils';

interface UnifiedDraftsAndTemplatesViewProps {
  initialTab?: 'drafts' | 'catalog';
  onOpenConfirmDraft: (draft: ExpenseDraft) => void;
}

export function UnifiedDraftsAndTemplatesView({
  onOpenConfirmDraft,
}: UnifiedDraftsAndTemplatesViewProps) {
  const { drafts, discardDraft } = useExpense();

  // Drafts filtering & search
  const [statusFilter, setStatusFilter] = useState<'pending' | 'confirmed' | 'discarded' | 'all'>('pending');
  const [draftSearchQuery, setDraftSearchQuery] = useState('');
  const [expandedSnippetId, setExpandedSnippetId] = useState<string | null>(null);
  const [isDiscardingId, setIsDiscardingId] = useState<string | null>(null);

  // Gmail connection state (Google Apps Script)
  const [isCheckingGmail, setIsCheckingGmail] = useState(true);
  const [isGmailConnected, setIsGmailConnected] = useState(false);
  const [gmailConnection, setGmailConnection] = useState<{
    status?: string;
    apps_script_url?: string;
    last_sync_at?: string | null;
  } | null>(null);
  const [isConnectingGmail, setIsConnectingGmail] = useState(false);
  const [connectNotice, setConnectNotice] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const fetchStatus = async () => {
      try {
        const res = await fetch('/api/gmail-connections');
        if (res.ok && isMounted) {
          const data = await res.json();
          setIsGmailConnected(Boolean(data.connected));
          setGmailConnection(data.connection || null);
        }
      } catch (err) {
        console.warn('[UnifiedDraftsAndTemplatesView] Error fetching connection status:', err);
      } finally {
        if (isMounted) {
          setIsCheckingGmail(false);
        }
      }
    };

    fetchStatus();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleConnectGmail = async () => {
    setIsConnectingGmail(true);
    setConnectNotice(null);
    try {
      const res = await fetch('/api/gmail-connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al conectar');
      }

      setIsGmailConnected(true);
      setGmailConnection(data.connection);
      setConnectNotice('¡Enlace de Google Apps Script generado!');

      const scriptUrl = data.connection?.apps_script_url || data.apps_script_url;
      if (scriptUrl) {
        window.open(scriptUrl, '_blank');
      }
    } catch (err: unknown) {
      console.error('[UnifiedDraftsAndTemplatesView] Error connecting Gmail:', err);
      setConnectNotice('No se pudo generar el enlace de conexión.');
    } finally {
      setIsConnectingGmail(false);
    }
  };

  // --- Filtered Drafts ---
  const filteredDrafts = useMemo(() => {
    return drafts.filter((d) => {
      const matchesStatus =
        statusFilter === 'all'
          ? true
          : statusFilter === 'pending'
          ? d.status === 'pending' || !d.status
          : d.status === statusFilter;

      if (!matchesStatus) return false;

      if (!draftSearchQuery.trim()) return true;

      const q = draftSearchQuery.toLowerCase();
      const matchMerchant = d.merchant?.toLowerCase().includes(q);
      const matchConcept = d.concept?.toLowerCase().includes(q);
      const matchEntity = d.entity?.toLowerCase().includes(q);
      const matchSource = d.source_account?.toLowerCase().includes(q);
      const matchAmount = String(d.amount).includes(q);

      return matchMerchant || matchConcept || matchEntity || matchSource || matchAmount;
    });
  }, [drafts, statusFilter, draftSearchQuery]);

  const pendingCount = useMemo(
    () => drafts.filter((d) => !d.status || d.status === 'pending').length,
    [drafts]
  );

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-16">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">
            Tickets y Borradores
          </h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            Comprobantes bancarios detectados automáticamente desde tus correos.
          </p>
        </div>

        {/* Connection status in header (only rendered once check finishes to prevent false positives) */}
        {!isCheckingGmail && isGmailConnected && (
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Sincronización activa</span>
            </span>
            <button
              type="button"
              onClick={handleConnectGmail}
              disabled={isConnectingGmail}
              title="Reconectar o cambiar cuenta de Google"
              className="text-xs text-zinc-500 hover:text-zinc-900 font-medium px-2.5 py-1.5 rounded-xl hover:bg-zinc-100 transition cursor-pointer"
            >
              Reconectar
            </button>
          </div>
        )}
      </div>

      {/* Google Apps Script Connection Banner: Shown ONLY when check finished and not connected (no false positives during DB delay) */}
      {!isCheckingGmail && !isGmailConnected && (
        <div className="bg-amber-50/70 border border-amber-200/90 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-all">
          <div className="flex items-start space-x-3.5">
            <div className="w-10 h-10 rounded-xl bg-amber-100 border border-amber-200 flex items-center justify-center text-amber-700 shrink-0 mt-0.5">
              <MailCheck className="w-5 h-5 text-amber-600" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-zinc-900 flex items-center gap-2">
                <span>Sincronización de correos no conectada</span>
                <span className="text-[10px] font-semibold bg-amber-200/80 text-amber-900 px-2 py-0.5 rounded-full">
                  Acción requerida
                </span>
              </h3>
              <p className="text-xs text-zinc-600 leading-relaxed max-w-xl">
                Conecta tu cuenta de Google mediante Google Apps Script para detectar comprobantes bancarios automáticamente y generar tickets listos para dividir.
              </p>
              {connectNotice && (
                <p className="text-xs text-emerald-700 font-medium pt-0.5">{connectNotice}</p>
              )}
              {gmailConnection?.apps_script_url && (
                <a
                  href={gmailConnection.apps_script_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center space-x-1 text-xs text-amber-800 hover:text-amber-950 font-semibold underline pt-0.5"
                >
                  <span>Abrir enlace de autorización de Google</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
            <button
              type="button"
              id="connect-gmail-script-btn"
              onClick={handleConnectGmail}
              disabled={isConnectingGmail}
              className="inline-flex items-center space-x-2 px-4 py-2.5 bg-zinc-900 hover:bg-zinc-800 active:scale-95 text-white text-xs font-bold rounded-xl shadow-xs transition cursor-pointer disabled:opacity-50"
            >
              {isConnectingGmail ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <MailCheck className="w-3.5 h-3.5 text-amber-400" />
              )}
              <span>Conectar con Google</span>
            </button>
          </div>
        </div>
      )}

      {/* Borradores y Tickets */}
      <div className="space-y-4">
          {/* Controls Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-zinc-200/80 shadow-2xs">
            {/* Status Pills */}
            <div className="flex items-center space-x-1.5 overflow-x-auto">
              <button
                onClick={() => setStatusFilter('pending')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                  statusFilter === 'pending'
                    ? 'bg-zinc-900 text-white shadow-xs'
                    : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100'
                }`}
              >
                Pendientes {pendingCount > 0 && `(${pendingCount})`}
              </button>

              <button
                onClick={() => setStatusFilter('confirmed')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                  statusFilter === 'confirmed'
                    ? 'bg-zinc-900 text-white shadow-xs'
                    : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100'
                }`}
              >
                Confirmados
              </button>

              <button
                onClick={() => setStatusFilter('discarded')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                  statusFilter === 'discarded'
                    ? 'bg-zinc-900 text-white shadow-xs'
                    : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100'
                }`}
              >
                Descartados
              </button>

              <button
                onClick={() => setStatusFilter('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                  statusFilter === 'all'
                    ? 'bg-zinc-900 text-white shadow-xs'
                    : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100'
                }`}
              >
                Todos ({drafts.length})
              </button>
            </div>

            {/* Search Input */}
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={draftSearchQuery}
                onChange={(e) => setDraftSearchQuery(e.target.value)}
                placeholder="Buscar en borradores..."
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-zinc-50 border border-zinc-200/80 rounded-xl focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-zinc-400 transition"
              />
            </div>
          </div>

          {/* Drafts List */}
          {filteredDrafts.length === 0 ? (
            <div className="bg-white border border-zinc-200/80 rounded-2xl p-12 text-center space-y-3 shadow-2xs">
              <div className="w-12 h-12 rounded-2xl bg-zinc-100 text-zinc-400 flex items-center justify-center mx-auto">
                <Inbox className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-zinc-900">
                  {draftSearchQuery
                    ? 'No hay resultados para la búsqueda'
                    : statusFilter === 'pending'
                    ? 'No tienes gastos pendientes por confirmar'
                    : 'No hay borradores en este estado'}
                </h3>
                <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                  {statusFilter === 'pending'
                    ? 'Cuando recibas correos de compras de tus bancos, aparecerán aquí como borradores listos para registrarse.'
                    : 'Filtra por otro estado o limpia la búsqueda para ver más borradores.'}
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredDrafts.map((draft) => {
                const isExpanded = expandedSnippetId === draft.id;
                const isPending = !draft.status || draft.status === 'pending';
                const isConfirmed = draft.status === 'confirmed';
                const isDiscarded = draft.status === 'discarded';

                return (
                  <div
                    key={draft.id}
                    className={`bg-white border rounded-2xl p-4 space-y-3 shadow-2xs hover:border-zinc-300 transition ${
                      isPending ? 'border-zinc-200' : 'border-zinc-200/60 opacity-80'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center space-x-1.5">
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-700">
                            {draft.entity || 'Banco'}
                          </span>
                          {draft.source_account && (
                            <span className="text-[11px] text-zinc-400 font-mono">
                              *{draft.source_account}
                            </span>
                          )}
                        </div>
                        <h4 className="text-sm font-bold text-zinc-900 line-clamp-1">
                          {draft.merchant || draft.concept || 'Gasto no identificado'}
                        </h4>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-base font-extrabold text-zinc-900 block">
                          {formatCurrency(draft.amount, draft.currency || 'COP')}
                        </span>
                        <span className="text-[10px] text-zinc-400 font-mono">
                          {draft.date || 'Sin fecha'} {draft.time || ''}
                        </span>
                      </div>
                    </div>

                    {/* Expandable Snippet / Raw text */}
                    {draft.raw_email_snippet && (
                      <div className="text-xs bg-zinc-50 border border-zinc-100 rounded-xl p-2.5 space-y-1 font-mono text-zinc-600">
                        <div className="flex items-center justify-between text-[10px] text-zinc-400 font-sans">
                          <span>Texto original detectado:</span>
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedSnippetId(isExpanded ? null : draft.id)
                            }
                            className="text-indigo-600 hover:text-indigo-800 flex items-center space-x-0.5 cursor-pointer font-medium"
                          >
                            <span>{isExpanded ? 'Ver menos' : 'Ver más'}</span>
                            {isExpanded ? (
                              <ChevronUp className="w-3 h-3" />
                            ) : (
                              <ChevronDown className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                        <p className={isExpanded ? 'whitespace-pre-wrap' : 'line-clamp-2'}>
                          {draft.raw_email_snippet}
                        </p>
                      </div>
                    )}

                    {/* Actions Bar */}
                    <div className="pt-2 border-t border-zinc-100 flex items-center justify-between gap-2">
                      <div className="flex items-center space-x-1">
                        {isPending && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                            Pendiente
                          </span>
                        )}
                        {isConfirmed && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                            Confirmado
                          </span>
                        )}
                        {isDiscarded && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-zinc-100 text-zinc-600 border border-zinc-200">
                            Descartado
                          </span>
                        )}
                      </div>

                      <div className="flex items-center space-x-2">
                        {isPending && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setIsDiscardingId(draft.id);
                                discardDraft(draft.id).finally(() =>
                                  setIsDiscardingId(null)
                                );
                              }}
                              disabled={isDiscardingId === draft.id}
                              className="px-2.5 py-1.5 text-xs font-semibold text-zinc-600 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition cursor-pointer flex items-center space-x-1"
                              title="Descartar borrador"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">Descartar</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => onOpenConfirmDraft(draft)}
                              className="px-3.5 py-1.5 text-xs font-bold text-white bg-zinc-900 hover:bg-zinc-800 rounded-xl transition shadow-2xs flex items-center space-x-1.5 cursor-pointer"
                            >
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                              <span>Confirmar Gasto</span>
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
  );
}
