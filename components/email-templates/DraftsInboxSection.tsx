'use client';

import React, { useState, useMemo } from 'react';
import {
  Inbox,
  CheckCircle2,
  XCircle,
  Clock,
  Search,
  RefreshCw,
  Eye,
  Check,
  Trash2,
  RotateCcw,
  Sparkles,
  DollarSign,
  Building2,
  CreditCard,
  Tag,
  Send,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Layers,
} from 'lucide-react';
import { ExpenseDraft } from '@/lib/types';
import { formatCurrency } from '@/lib/balance-utils';
import { ConfirmDraftModal } from '@/components/ConfirmDraftModal';

interface DraftsInboxSectionProps {
  drafts: ExpenseDraft[];
  isLoading?: boolean;
  onRefresh: () => void;
  onTestWithDraft?: (draft: ExpenseDraft) => void;
  webhookToken?: string | null;
}

export function DraftsInboxSection({
  drafts,
  isLoading = false,
  onRefresh,
  onTestWithDraft,
  webhookToken,
}: DraftsInboxSectionProps) {
  const [selectedStatus, setSelectedStatus] = useState<'all' | 'pending' | 'confirmed' | 'dismissed'>('pending');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedSnippetId, setExpandedSnippetId] = useState<string | null>(null);
  const [activeConfirmDraft, setActiveConfirmDraft] = useState<ExpenseDraft | null>(null);
  const [isActionLoading, setIsActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Webhook simulator state
  const [showSimulator, setShowSimulator] = useState(false);
  const [simEntity, setSimEntity] = useState('Bancolombia');
  const [simAmount, setSimAmount] = useState('45000');
  const [simCurrency, setSimCurrency] = useState('COP');
  const [simMerchant, setSimMerchant] = useState('Supermercado Exito');
  const [simSourceAccount, setSimSourceAccount] = useState('*4521');
  const [simConcept, setSimConcept] = useState('Compra de despensa');
  const [simSnippet, setSimSnippet] = useState(
    'Bancolombia le informa compra con tarjeta *4521 por $45.000 en Supermercado Exito el 24/09/2024 16:45.'
  );
  const [isSimulating, setIsSimulating] = useState(false);
  const [simResult, setSimResult] = useState<{ success: boolean; message: string } | null>(null);

  // Status counters
  const counts = useMemo(() => {
    return {
      all: drafts.length,
      pending: drafts.filter((d) => d.status === 'pending').length,
      confirmed: drafts.filter((d) => d.status === 'confirmed').length,
      dismissed: drafts.filter((d) => d.status === 'dismissed' || d.status === 'discarded').length,
    };
  }, [drafts]);

  // Filtered drafts
  const filteredDrafts = useMemo(() => {
    return drafts.filter((draft) => {
      // Status filter
      if (selectedStatus === 'pending' && draft.status !== 'pending') return false;
      if (selectedStatus === 'confirmed' && draft.status !== 'confirmed') return false;
      if (selectedStatus === 'dismissed' && draft.status !== 'dismissed' && draft.status !== 'discarded')
        return false;

      // Search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const merchantMatch = draft.detected_merchant?.toLowerCase().includes(query);
        const entityMatch = draft.entity?.toLowerCase().includes(query);
        const conceptMatch = draft.concept?.toLowerCase().includes(query);
        const snippetMatch = draft.raw_snippet?.toLowerCase().includes(query);
        const amountMatch = String(draft.detected_amount).includes(query);
        if (!merchantMatch && !entityMatch && !conceptMatch && !snippetMatch && !amountMatch) {
          return false;
        }
      }

      return true;
    });
  }, [drafts, selectedStatus, searchQuery]);

  const handleStatusChange = async (draftId: string, newStatus: 'pending' | 'dismissed') => {
    setIsActionLoading(draftId);
    setActionError(null);
    try {
      const res = await fetch(`/api/drafts/${draftId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Error al actualizar estado');
      }
      onRefresh();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Error al modificar borrador');
    } finally {
      setIsActionLoading(null);
    }
  };

  const handleSimulateWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!webhookToken) {
      setSimResult({
        success: false,
        message: 'No tienes una conexión activa con Webhook Token. Actívala primero en la pestaña de Conexión.',
      });
      return;
    }

    setIsSimulating(true);
    setSimResult(null);
    try {
      const parsedAmount = parseFloat(simAmount);
      const res = await fetch('/api/expense-candidate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${webhookToken}`,
        },
        body: JSON.stringify({
          gmail_message_id: `test-sim-${Date.now()}`,
          entity: simEntity.trim() || undefined,
          amount: isNaN(parsedAmount) ? undefined : parsedAmount,
          currency: simCurrency.trim() || undefined,
          merchant: simMerchant.trim() || undefined,
          source_account: simSourceAccount.trim() || undefined,
          concept: simConcept.trim() || undefined,
          body: simSnippet.trim() || undefined,
          received_at: new Date().toISOString(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al enviar simulación');
      }

      setSimResult({
        success: true,
        message: `¡Candidato recibido con éxito! Borrador creado ID: ${data.draft_id || 'OK'}`,
      });
      onRefresh();
    } catch (err: unknown) {
      setSimResult({
        success: false,
        message: err instanceof Error ? err.message : 'Error al ejecutar simulación',
      });
    } finally {
      setIsSimulating(false);
    }
  };

  return (
    <div className="space-y-6" id="section-drafts-inbox">
      {/* Top Controls: Filter tabs & Actions */}
      <div className="bg-white border border-zinc-200/80 rounded-2xl p-4 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Status Tabs */}
          <div className="flex items-center space-x-1.5 p-1 bg-zinc-100 rounded-xl overflow-x-auto">
            <button
              onClick={() => setSelectedStatus('pending')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center space-x-1.5 whitespace-nowrap ${
                selectedStatus === 'pending'
                  ? 'bg-white text-zinc-900 shadow-2xs font-semibold'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              <span>Pendientes</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                  selectedStatus === 'pending' ? 'bg-amber-100 text-amber-800' : 'bg-zinc-200 text-zinc-600'
                }`}
              >
                {counts.pending}
              </span>
            </button>

            <button
              onClick={() => setSelectedStatus('confirmed')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center space-x-1.5 whitespace-nowrap ${
                selectedStatus === 'confirmed'
                  ? 'bg-white text-zinc-900 shadow-2xs font-semibold'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              <span>Confirmados</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                  selectedStatus === 'confirmed' ? 'bg-emerald-100 text-emerald-800' : 'bg-zinc-200 text-zinc-600'
                }`}
              >
                {counts.confirmed}
              </span>
            </button>

            <button
              onClick={() => setSelectedStatus('dismissed')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center space-x-1.5 whitespace-nowrap ${
                selectedStatus === 'dismissed'
                  ? 'bg-white text-zinc-900 shadow-2xs font-semibold'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              <span>Descartados</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                  selectedStatus === 'dismissed' ? 'bg-zinc-200 text-zinc-700' : 'bg-zinc-200 text-zinc-600'
                }`}
              >
                {counts.dismissed}
              </span>
            </button>

            <button
              onClick={() => setSelectedStatus('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center space-x-1.5 whitespace-nowrap ${
                selectedStatus === 'all'
                  ? 'bg-white text-zinc-900 shadow-2xs font-semibold'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              <span>Todos</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-zinc-200 text-zinc-600">
                {counts.all}
              </span>
            </button>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowSimulator(!showSimulator)}
              className={`px-3 py-1.5 text-xs font-medium rounded-xl border transition flex items-center space-x-1.5 shadow-2xs ${
                showSimulator
                  ? 'bg-amber-50 text-amber-800 border-amber-300'
                  : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50'
              }`}
            >
              <Send className="w-3.5 h-3.5 text-amber-600" />
              <span>{showSimulator ? 'Ocultar Simulador' : 'Simular Webhook'}</span>
            </button>

            <button
              onClick={onRefresh}
              disabled={isLoading}
              className="p-2 text-zinc-600 hover:text-zinc-900 bg-white border border-zinc-200 hover:bg-zinc-50 rounded-xl transition shadow-2xs"
              title="Actualizar borradores"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-zinc-900' : ''}`} />
            </button>
          </div>
        </div>

        {/* Search input */}
        <div className="mt-3 relative">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            placeholder="Buscar por comercio, entidad, concepto o monto..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl text-zinc-800 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400 transition"
          />
        </div>
      </div>

      {actionError && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Webhook Ingestion Simulator Collapsible Panel */}
      {showSimulator && (
        <div className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-5 space-y-4 shadow-2xs animate-in fade-in duration-150">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center">
                <Send className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-semibold text-zinc-900">Simulador de Ingestión (Webhook)</h4>
                <p className="text-[11px] text-zinc-500">
                  Prueba el pipeline de recepción simulando el payload que enviará el cronjob de Google Apps Script.
                </p>
              </div>
            </div>
            <span className="text-[10px] font-mono bg-amber-100/80 text-amber-900 px-2 py-0.5 rounded-md border border-amber-300/60">
              POST /api/expense-candidate
            </span>
          </div>

          <form onSubmit={handleSimulateWebhook} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-zinc-600 mb-1">Entidad / Banco</label>
                <input
                  type="text"
                  value={simEntity}
                  onChange={(e) => setSimEntity(e.target.value)}
                  placeholder="ej. Bancolombia, RappiCard"
                  className="w-full px-3 py-1.5 text-xs bg-white border border-zinc-200 rounded-lg text-zinc-800 focus:outline-none focus:border-zinc-400"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-zinc-600 mb-1">Monto</label>
                <input
                  type="number"
                  step="any"
                  value={simAmount}
                  onChange={(e) => setSimAmount(e.target.value)}
                  placeholder="45000"
                  className="w-full px-3 py-1.5 text-xs bg-white border border-zinc-200 rounded-lg text-zinc-800 focus:outline-none focus:border-zinc-400"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-zinc-600 mb-1">Moneda</label>
                <input
                  type="text"
                  value={simCurrency}
                  onChange={(e) => setSimCurrency(e.target.value)}
                  placeholder="COP, USD"
                  className="w-full px-3 py-1.5 text-xs bg-white border border-zinc-200 rounded-lg text-zinc-800 focus:outline-none focus:border-zinc-400"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-zinc-600 mb-1">Comercio / Destinatario</label>
                <input
                  type="text"
                  value={simMerchant}
                  onChange={(e) => setSimMerchant(e.target.value)}
                  placeholder="ej. Supermercado Exito"
                  className="w-full px-3 py-1.5 text-xs bg-white border border-zinc-200 rounded-lg text-zinc-800 focus:outline-none focus:border-zinc-400"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-zinc-600 mb-1">Cuenta Origen</label>
                <input
                  type="text"
                  value={simSourceAccount}
                  onChange={(e) => setSimSourceAccount(e.target.value)}
                  placeholder="ej. *4521"
                  className="w-full px-3 py-1.5 text-xs bg-white border border-zinc-200 rounded-lg text-zinc-800 focus:outline-none focus:border-zinc-400"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-zinc-600 mb-1">Concepto</label>
                <input
                  type="text"
                  value={simConcept}
                  onChange={(e) => setSimConcept(e.target.value)}
                  placeholder="ej. Compra de despensa"
                  className="w-full px-3 py-1.5 text-xs bg-white border border-zinc-200 rounded-lg text-zinc-800 focus:outline-none focus:border-zinc-400"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-zinc-600 mb-1">Texto del Correo (Snippet)</label>
              <textarea
                rows={2}
                value={simSnippet}
                onChange={(e) => setSimSnippet(e.target.value)}
                placeholder="Texto extraído del correo..."
                className="w-full px-3 py-1.5 text-xs font-mono bg-white border border-zinc-200 rounded-lg text-zinc-800 focus:outline-none focus:border-zinc-400"
              />
            </div>

            {simResult && (
              <div
                className={`p-3 rounded-xl text-xs flex items-center space-x-2 ${
                  simResult.success
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-rose-50 text-rose-800 border border-rose-200'
                }`}
              >
                {simResult.success ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                )}
                <span>{simResult.message}</span>
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={isSimulating}
                className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-semibold transition flex items-center space-x-1.5 shadow-2xs"
              >
                <Send className="w-3.5 h-3.5 text-emerald-400" />
                <span>{isSimulating ? 'Enviando...' : 'Enviar Borrador de Prueba al Webhook'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Drafts List */}
      {filteredDrafts.length === 0 ? (
        <div className="bg-white border border-zinc-200/80 rounded-2xl p-10 text-center shadow-2xs">
          <div className="w-12 h-12 rounded-2xl bg-zinc-100 text-zinc-400 flex items-center justify-center mx-auto mb-3">
            <Inbox className="w-6 h-6" />
          </div>
          <h4 className="text-sm font-semibold text-zinc-800">No hay borradores en esta sección</h4>
          <p className="text-xs text-zinc-500 max-w-md mx-auto mt-1">
            {searchQuery
              ? 'No se encontraron borradores que coincidan con la búsqueda.'
              : selectedStatus === 'pending'
              ? '¡Todo al día! No tienes borradores pendientes por clasificar o confirmar.'
              : 'No hay registros en este estado.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3.5">
          {filteredDrafts.map((draft) => {
            const isExpanded = expandedSnippetId === draft.id;
            const isDismissed = draft.status === 'dismissed' || draft.status === 'discarded';
            const isConfirmed = draft.status === 'confirmed';

            return (
              <div
                key={draft.id}
                className={`bg-white border rounded-2xl p-5 transition shadow-2xs ${
                  isDismissed
                    ? 'border-zinc-200/60 bg-zinc-50/40 opacity-75'
                    : isConfirmed
                    ? 'border-emerald-200/60 bg-white'
                    : 'border-zinc-200/80 bg-white hover:border-zinc-300'
                }`}
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  {/* Left: Entity, Amount, Merchant, Concept */}
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Entity badge */}
                      {draft.entity ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-zinc-100 text-zinc-800 border border-zinc-200">
                          <Building2 className="w-3 h-3 mr-1 text-zinc-500" />
                          {draft.entity}
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-zinc-50 text-zinc-500 border border-zinc-200/60">
                          Entidad no identificada
                        </span>
                      )}

                      {/* Account badge */}
                      {draft.source_account && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-mono bg-zinc-50 text-zinc-600 border border-zinc-200">
                          <CreditCard className="w-3 h-3 mr-1 text-zinc-400" />
                          {draft.source_account}
                        </span>
                      )}

                      {/* Template badge */}
                      {draft.template_id && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">
                          <Layers className="w-3 h-3 mr-1" />
                          Plantilla vinculada
                        </span>
                      )}

                      {/* Status badge */}
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${
                          isConfirmed
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : isDismissed
                            ? 'bg-zinc-100 text-zinc-600 border border-zinc-200'
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}
                      >
                        {isConfirmed ? 'Confirmado' : isDismissed ? 'Descartado' : 'Pendiente'}
                      </span>
                    </div>

                    {/* Merchant & Concept */}
                    <div>
                      <h4 className="text-sm font-semibold text-zinc-900">
                        {draft.detected_merchant || draft.concept || 'Gasto no identificado'}
                      </h4>
                      {draft.concept && draft.detected_merchant && draft.concept !== draft.detected_merchant && (
                        <p className="text-xs text-zinc-500 mt-0.5">{draft.concept}</p>
                      )}
                    </div>

                    {/* Date and Time telemetry */}
                    <div className="flex items-center space-x-3 text-xs text-zinc-500">
                      <span className="flex items-center space-x-1">
                        <Clock className="w-3.5 h-3.5 text-zinc-400" />
                        <span>
                          {draft.detected_date ||
                            new Date(draft.created_at).toLocaleDateString('es-CO', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                            })}
                        </span>
                        {draft.detected_time && (
                          <span className="font-mono text-zinc-600">({draft.detected_time})</span>
                        )}
                      </span>
                    </div>
                  </div>

                  {/* Right: Detected Amount & Currency + Action Buttons */}
                  <div className="flex flex-col sm:flex-row md:flex-col lg:flex-row items-start sm:items-center md:items-end lg:items-center gap-3 shrink-0">
                    <div className="text-right">
                      <div className="text-base font-bold text-zinc-900">
                        {draft.detected_amount ? (
                          <>
                            {formatCurrency(draft.detected_amount)}
                            {draft.currency && (
                              <span className="ml-1 text-xs font-semibold text-zinc-500 font-mono">
                                {draft.currency}
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-xs text-zinc-400 italic">Monto no detectado</span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center space-x-1.5">
                      {!isConfirmed && !isDismissed && (
                        <button
                          onClick={() => setActiveConfirmDraft(draft)}
                          className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-semibold transition flex items-center space-x-1 shadow-2xs"
                        >
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Confirmar</span>
                        </button>
                      )}

                      {!isDismissed && !isConfirmed && (
                        <button
                          onClick={() => handleStatusChange(draft.id, 'dismissed')}
                          disabled={isActionLoading === draft.id}
                          className="p-1.5 text-zinc-500 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition border border-zinc-200"
                          title="Descartar borrador"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {isDismissed && (
                        <button
                          onClick={() => handleStatusChange(draft.id, 'pending')}
                          disabled={isActionLoading === draft.id}
                          className="px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 rounded-xl transition border border-zinc-200 flex items-center space-x-1"
                          title="Restaurar a pendientes"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Restaurar</span>
                        </button>
                      )}

                      {onTestWithDraft && (
                        <button
                          onClick={() => onTestWithDraft(draft)}
                          className="px-2.5 py-1 text-xs font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl transition flex items-center space-x-1"
                          title="Cargar este correo en el probador de plantillas"
                        >
                          <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                          <span>Probar Plantilla</span>
                        </button>
                      )}

                      {draft.raw_snippet && (
                        <button
                          onClick={() => setExpandedSnippetId(isExpanded ? null : draft.id)}
                          className="p-1.5 text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100 rounded-xl transition border border-zinc-200"
                          title={isExpanded ? 'Ocultar correo crudo' : 'Ver correo crudo'}
                        >
                          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Expandable Snippet View */}
                {isExpanded && draft.raw_snippet && (
                  <div className="mt-4 pt-3 border-t border-zinc-100 animate-in fade-in duration-100">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[11px] font-medium text-zinc-500">Cuerpo del correo recibido:</span>
                      <span className="text-[10px] font-mono text-zinc-400">ID: {draft.gmail_message_id}</span>
                    </div>
                    <pre className="text-xs font-mono bg-zinc-50 p-3 rounded-xl text-zinc-800 overflow-x-auto whitespace-pre-wrap leading-relaxed border border-zinc-200/70 max-h-48">
                      {draft.raw_snippet}
                    </pre>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Confirmation Modal */}
      {activeConfirmDraft && (
        <ConfirmDraftModal
          isOpen={Boolean(activeConfirmDraft)}
          draft={activeConfirmDraft}
          onClose={() => {
            setActiveConfirmDraft(null);
            onRefresh();
          }}
        />
      )}
    </div>
  );
}
