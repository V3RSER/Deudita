'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import React, { useState, useEffect } from 'react';
import { useExpense } from '@/lib/expense-context';
import { ExpenseDraft } from '@/lib/types';
import { formatCurrency } from '@/lib/balance-utils';
import {
  MailCheck,
  Sparkles,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRight,
  Inbox,
  RefreshCw,
  ScanLine,
  SlidersHorizontal,
  ChevronRight,
  ShieldCheck,
  Check,
  Trash2,
  Building2,
  ExternalLink,
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';

interface DraftsViewProps {
  onOpenConfirmDraft: (draft: ExpenseDraft) => void;
  onOpenScanReceiptModal: () => void;
  onOpenGmailIntegration?: (tab?: 'connection' | 'templates' | 'create_template') => void;
}

export function DraftsView({
  onOpenConfirmDraft,
  onOpenScanReceiptModal,
  onOpenGmailIntegration,
}: DraftsViewProps) {
  const { drafts, discardDraft, userGroups } = useExpense();

  const [activeTab, setActiveTab] = useState<'pending' | 'history'>('pending');
  const [historyFilter, setHistoryFilter] = useState<'all' | 'confirmed' | 'discarded'>('all');
  const [gmailStatus, setGmailStatus] = useState<{
    connected: boolean;
    last_sync_at?: string | null;
    apps_script_url?: string;
  }>({ connected: false });
  const [isConnectingGmail, setIsConnectingGmail] = useState(false);
  const [isDiscardingId, setIsDiscardingId] = useState<string | null>(null);

  const pendingDrafts = drafts.filter((d) => d.status === 'pending');
  const processedDrafts = drafts.filter((d) => d.status !== 'pending');

  const filteredHistory = processedDrafts.filter((d) => {
    if (historyFilter === 'confirmed') return d.status === 'confirmed';
    if (historyFilter === 'discarded') return d.status === 'discarded';
    return true;
  });

  const fetchGmailStatus = async () => {
    try {
      const res = await fetch('/api/gmail-connections');
      if (res.ok) {
        const data = await res.json();
        setGmailStatus({
          connected: Boolean(data.connected),
          last_sync_at: data.connection?.last_sync_at,
          apps_script_url: data.connection?.apps_script_url,
        });
      }
    } catch {
      // Ignorar errores menores de consulta
    }
  };

  useEffect(() => {
    fetchGmailStatus();
  }, []);

  const handleConnectWithGoogle = async () => {
    setIsConnectingGmail(true);
    try {
      const res = await fetch('/api/gmail-connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (res.ok && data.apps_script_url) {
        setGmailStatus({
          connected: true,
          apps_script_url: data.apps_script_url,
        });
        window.open(data.apps_script_url, '_blank');
      } else if (onOpenGmailIntegration) {
        onOpenGmailIntegration('connection');
      }
    } catch (err) {
      console.error('Error al conectar Gmail:', err);
      if (onOpenGmailIntegration) onOpenGmailIntegration('connection');
    } finally {
      setIsConnectingGmail(false);
    }
  };

  const handleDiscard = async (draftId: string) => {
    try {
      setIsDiscardingId(draftId);
      await discardDraft(draftId);
    } catch (err) {
      console.error('Error al descartar borrador:', err);
    } finally {
      setIsDiscardingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tickets y Borradores"
        subtitle="Notificaciones bancarias y comprobantes detectados automáticamente listos para asignar y dividir."
        icon={<MailCheck className="w-5 h-5" />}
        actions={
          <>
            {onOpenGmailIntegration && (
              <button
                id="btn-open-email-settings"
                onClick={() => onOpenGmailIntegration('templates')}
                className="bg-white hover:bg-zinc-50 border border-zinc-200 text-zinc-800 font-semibold px-4 py-2 rounded-xl text-xs sm:text-sm shadow-2xs transition-all active:scale-95 flex items-center justify-center space-x-2 shrink-0 min-h-[40px] cursor-pointer"
              >
                <SlidersHorizontal className="w-4 h-4 text-zinc-600" />
                <span>Ajustes y Bancos</span>
              </button>
            )}

            <button
              onClick={onOpenScanReceiptModal}
              className="bg-zinc-900 hover:bg-zinc-800 text-white font-semibold px-4 py-2 rounded-xl text-xs sm:text-sm shadow-sm transition-all active:scale-95 flex items-center justify-center space-x-2 shrink-0 min-h-[40px] cursor-pointer"
            >
              <ScanLine className="w-4 h-4 text-emerald-400" />
              <span>Escanear Comprobante</span>
            </button>
          </>
        }
      />

      {/* Gmail Status Integration Hero Banner */}
      <div className="bg-white rounded-3xl p-5 sm:p-6 ring-1 ring-zinc-200 shadow-2xs overflow-hidden relative">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start space-x-4">
            <div
              className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-xs ${
                gmailStatus.connected
                  ? 'bg-emerald-600 text-white ring-4 ring-emerald-50'
                  : 'bg-zinc-900 text-white ring-4 ring-zinc-100'
              }`}
            >
              <MailCheck className={`w-6 h-6 ${gmailStatus.connected ? 'text-white' : 'text-amber-400'}`} />
            </div>

            <div className="space-y-1">
              <div className="flex items-center space-x-2.5 flex-wrap">
                <h3 className="text-base font-bold text-zinc-900">
                  {gmailStatus.connected
                    ? 'Sincronización de Compras Activa'
                    : 'Detecta tus compras bancarias automáticamente'}
                </h3>
                {gmailStatus.connected ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span>Conectado</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-zinc-100 text-zinc-600 border border-zinc-200">
                    Sin conectar
                  </span>
                )}
              </div>

              <p className="text-xs text-zinc-500 max-w-2xl leading-relaxed">
                {gmailStatus.connected
                  ? 'Tus compras con tarjetas y transferencias se detectan automáticamente para que las revises y dividas con tus grupos en un solo toque.'
                  : 'Conecta tu cuenta de Google una sola vez para recibir comprobantes automáticamente, sin escribir montos a mano.'}
              </p>

              {gmailStatus.last_sync_at && (
                <div className="flex items-center space-x-1.5 text-[11px] text-zinc-400 pt-1 font-mono">
                  <Clock className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Última sincronización: {new Date(gmailStatus.last_sync_at).toLocaleString('es-CO')}</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0 self-start md:self-center">
            {gmailStatus.connected ? (
              <button
                id="btn-manage-sync-settings"
                onClick={() => onOpenGmailIntegration && onOpenGmailIntegration('connection')}
                className="px-4 py-2.5 bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 text-zinc-800 font-semibold rounded-xl text-xs transition flex items-center space-x-1.5 cursor-pointer shadow-2xs"
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-zinc-500" />
                <span>Ajustes de Sincronización</span>
              </button>
            ) : (
              <>
                {onOpenGmailIntegration && (
                  <button
                    id="btn-banner-view-banks"
                    onClick={() => onOpenGmailIntegration('templates')}
                    className="px-3.5 py-2.5 bg-white hover:bg-zinc-50 border border-zinc-200 text-zinc-700 font-semibold rounded-xl text-xs transition cursor-pointer shadow-2xs"
                  >
                    Bancos compatibles
                  </button>
                )}
                <button
                  id="btn-banner-connect-google"
                  onClick={handleConnectWithGoogle}
                  disabled={isConnectingGmail}
                  className="px-5 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white font-bold rounded-xl text-xs transition flex items-center space-x-2 shadow-xs cursor-pointer active:scale-95 disabled:opacity-75"
                >
                  {isConnectingGmail ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-400" />
                  ) : (
                    <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24">
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
                  )}
                  <span>Conectar con Google</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Main Tabs (Pendientes / Historial) */}
      <div className="flex items-center justify-between border-b border-zinc-200/80 pb-3">
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setActiveTab('pending')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center space-x-2 cursor-pointer ${
              activeTab === 'pending'
                ? 'bg-zinc-900 text-white shadow-xs'
                : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>Pendientes por Confirmar</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[11px] font-bold ml-1 ${
                activeTab === 'pending'
                  ? 'bg-zinc-800 text-amber-400'
                  : 'bg-zinc-200 text-zinc-700'
              }`}
            >
              {pendingDrafts.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center space-x-2 cursor-pointer ${
              activeTab === 'history'
                ? 'bg-zinc-900 text-white shadow-xs'
                : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100'
            }`}
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Historial</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[11px] font-bold ml-1 ${
                activeTab === 'history'
                  ? 'bg-zinc-800 text-zinc-300'
                  : 'bg-zinc-200 text-zinc-700'
              }`}
            >
              {processedDrafts.length}
            </span>
          </button>
        </div>

        {activeTab === 'history' && (
          <div className="flex items-center space-x-1 bg-zinc-100 p-1 rounded-xl">
            <button
              onClick={() => setHistoryFilter('all')}
              className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition ${
                historyFilter === 'all'
                  ? 'bg-white text-zinc-900 shadow-2xs'
                  : 'text-zinc-500 hover:text-zinc-900'
              }`}
            >
              Todos
            </button>
            <button
              onClick={() => setHistoryFilter('confirmed')}
              className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition ${
                historyFilter === 'confirmed'
                  ? 'bg-white text-emerald-800 shadow-2xs'
                  : 'text-zinc-500 hover:text-zinc-900'
              }`}
            >
              Confirmados
            </button>
            <button
              onClick={() => setHistoryFilter('discarded')}
              className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition ${
                historyFilter === 'discarded'
                  ? 'bg-white text-rose-800 shadow-2xs'
                  : 'text-zinc-500 hover:text-zinc-900'
              }`}
            >
              Descartados
            </button>
          </div>
        )}
      </div>

      {/* TAB 1: PENDING DRAFTS */}
      {activeTab === 'pending' && (
        <div className="space-y-4">
          {pendingDrafts.length === 0 ? (
            <div className="bg-white rounded-3xl ring-1 ring-zinc-200 p-12 sm:p-16 text-center text-zinc-500 shadow-2xs">
              <div className="w-16 h-16 rounded-3xl bg-zinc-100 flex items-center justify-center mx-auto mb-4 text-zinc-400">
                <Inbox className="w-8 h-8" />
              </div>
              <h3 className="font-bold text-zinc-900 text-base sm:text-lg">
                No tienes borradores pendientes
              </h3>
              <p className="text-xs sm:text-sm text-zinc-500 mt-1.5 mb-6 max-w-md mx-auto leading-relaxed">
                Cuando recibas una notificación de compra por correo o escanees un recibo físico, aparecerá aquí listo para dividirlo en tu grupo.
              </p>

              <div className="flex flex-wrap items-center justify-center gap-3">
                {!gmailStatus.connected && (
                  <button
                    onClick={handleConnectWithGoogle}
                    disabled={isConnectingGmail}
                    className="bg-zinc-900 hover:bg-zinc-800 text-white font-bold px-5 py-2.5 rounded-xl text-xs transition-all active:scale-95 flex items-center space-x-2 cursor-pointer shadow-xs"
                  >
                    <MailCheck className="w-4 h-4 text-amber-400" />
                    <span>Conectar Gmail</span>
                  </button>
                )}

                <button
                  onClick={onOpenScanReceiptModal}
                  className="bg-white hover:bg-zinc-50 border border-zinc-200 text-zinc-800 font-semibold px-5 py-2.5 rounded-xl text-xs transition-all active:scale-95 flex items-center space-x-2 cursor-pointer shadow-2xs"
                >
                  <ScanLine className="w-4 h-4 text-emerald-600" />
                  <span>Escanear con Cámara o Archivo</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
              {pendingDrafts.map((draft) => (
                <div
                  key={draft.id}
                  className="bg-white rounded-3xl p-6 ring-1 ring-zinc-200 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between relative overflow-hidden"
                >
                  <div className="space-y-4">
                    {/* Header Card Badges */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 bg-amber-50 px-2.5 py-0.5 rounded-md border border-amber-200">
                          Borrador
                        </span>
                        {draft.entity && (
                          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-700 bg-zinc-100 px-2.5 py-0.5 rounded-md border border-zinc-200">
                            {draft.entity}
                          </span>
                        )}
                        {draft.source_account && (
                          <span className="text-[10px] font-mono text-zinc-500 bg-zinc-50 px-2 py-0.5 rounded-md border border-zinc-200">
                            *{draft.source_account}
                          </span>
                        )}
                      </div>

                      <span className="text-xs font-semibold text-zinc-400">
                        {draft.detected_date || 'Hoy'}
                      </span>
                    </div>

                    {/* Merchant & Amount */}
                    <div>
                      <h4 className="font-bold text-zinc-900 text-lg sm:text-xl tracking-tight">
                        {draft.detected_merchant || 'Gasto detectado'}
                      </h4>
                      <p className="text-2xl sm:text-3xl font-bold text-emerald-600 tracking-tight mt-1">
                        {draft.currency ? `${draft.currency} ` : '$'}
                        {formatCurrency(draft.detected_amount, draft.currency || 'COP')}
                      </p>
                    </div>

                    {/* Email raw snippet */}
                    {draft.raw_snippet && (
                      <div className="bg-zinc-50 border border-zinc-100 p-3.5 rounded-2xl">
                        <p className="text-xs text-zinc-600 font-mono text-[11px] leading-relaxed line-clamp-3 italic">
                          &quot;{draft.raw_snippet}&quot;
                        </p>
                      </div>
                    )}

                    {/* Extracted items breakdown */}
                    {draft.extracted_items && draft.extracted_items.length > 0 && (
                      <div className="pt-2 border-t border-zinc-100 text-xs">
                        <span className="font-bold text-zinc-800 block mb-2">
                          Ítems detallados ({draft.extracted_items.length}):
                        </span>
                        <div className="space-y-1.5">
                          {draft.extracted_items.map((item, idx) => (
                            <div key={idx} className="flex justify-between text-zinc-600">
                              <span>• {item.description}</span>
                              <span className="font-semibold text-zinc-900">
                                {formatCurrency(item.amount, draft.currency || 'COP')}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="mt-6 pt-4 border-t border-zinc-100 flex items-center justify-between gap-3">
                    <button
                      onClick={() => handleDiscard(draft.id)}
                      disabled={isDiscardingId === draft.id}
                      className="flex items-center space-x-1.5 text-zinc-500 hover:text-rose-600 px-3.5 py-2 rounded-xl text-xs font-semibold hover:bg-rose-50 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>{isDiscardingId === draft.id ? 'Descartando...' : 'Descartar'}</span>
                    </button>

                    <button
                      onClick={() => onOpenConfirmDraft(draft)}
                      className="flex items-center space-x-1.5 bg-zinc-900 hover:bg-zinc-800 text-white font-bold px-5 py-2.5 rounded-xl text-xs shadow-xs transition-all duration-150 active:scale-95 cursor-pointer"
                    >
                      <span>Confirmar y Dividir</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: HISTORY */}
      {activeTab === 'history' && (
        <div className="space-y-3">
          {filteredHistory.length === 0 ? (
            <div className="p-12 text-center bg-white rounded-3xl border border-zinc-200">
              <Inbox className="w-8 h-8 text-zinc-300 mx-auto mb-2" />
              <p className="text-xs font-semibold text-zinc-700">No hay borradores en este filtro</p>
              <p className="text-xs text-zinc-400 mt-1">
                Los comprobantes procesados se registrarán en este historial.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-3xl ring-1 ring-zinc-200 divide-y divide-zinc-100 overflow-hidden shadow-2xs">
              {filteredHistory.map((d) => (
                <div
                  key={d.id}
                  className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between text-xs sm:text-sm gap-3 hover:bg-zinc-50 transition-colors"
                >
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-zinc-900">{d.detected_merchant || 'Gasto'}</span>
                      {d.entity && (
                        <span className="text-[10px] font-bold uppercase tracking-wider bg-zinc-100 text-zinc-600 px-2 py-0.5 rounded-md">
                          {d.entity}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-400">
                      Fecha: {d.detected_date || 'Sin fecha'}
                    </p>
                  </div>

                  <div className="flex items-center space-x-4">
                    <span className="font-bold text-zinc-900 text-sm">
                      {formatCurrency(d.detected_amount, d.currency || 'COP')}
                    </span>

                    {d.status === 'confirmed' ? (
                      <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] uppercase tracking-wider font-bold px-2.5 py-1 rounded-lg flex items-center space-x-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Confirmado</span>
                      </span>
                    ) : (
                      <span className="bg-zinc-100 text-zinc-600 border border-zinc-200 text-[10px] uppercase tracking-wider font-bold px-2.5 py-1 rounded-lg flex items-center space-x-1.5">
                        <XCircle className="w-3.5 h-3.5 text-zinc-400" />
                        <span>Descartado</span>
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
