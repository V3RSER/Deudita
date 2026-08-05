'use client';

import React from 'react';
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
  ShieldAlert,
  Inbox,
  RefreshCw,
  ScanLine,
} from 'lucide-react';

interface DraftsViewProps {
  onOpenConfirmDraft: (draft: ExpenseDraft) => void;
  onOpenScanReceiptModal: () => void;
}

export function DraftsView({
  onOpenConfirmDraft,
  onOpenScanReceiptModal,
}: DraftsViewProps) {
  const { drafts, discardDraft, addDraft } = useExpense();

  const pendingDrafts = drafts.filter((d) => d.status === 'pending');
  const processedDrafts = drafts.filter((d) => d.status !== 'pending');

  const simulateGmailArrival = () => {
    const sampleMerchants = [
      { name: 'Uber Eats', amount: 18400, items: [{ description: 'Pedido Hamburguesas', amount: 15400 }, { description: 'Propina', amount: 3000 }] },
      { name: 'Suscripción Spotify Family', amount: 8990, items: [] },
      { name: 'Mercado Libre Electrónica', amount: 32500, items: [{ description: 'Cargador USB-C y Cable 2m', amount: 32500 }] },
      { name: 'Estación de Servicio Shell', amount: 25000, items: [] },
    ];

    const pick = sampleMerchants[Math.floor(Math.random() * sampleMerchants.length)];

    addDraft({
      gmail_message_id: `msg_gmail_${Date.now()}`,
      raw_snippet: `Confirmación de pago a ${pick.name} recibida por e-mail el ${new Date().toLocaleDateString()}. Total abonado ${formatCurrency(pick.amount)}.`,
      detected_amount: pick.amount,
      detected_merchant: pick.name,
      detected_date: new Date().toISOString().split('T')[0],
      confidence: 0.94,
      extracted_items: pick.items,
    });
  };

  return (
    <div className="space-y-8">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-indigo-900 via-slate-900 to-indigo-950 rounded-3xl p-6 sm:p-8 text-white border border-indigo-900/50 shadow-lg">
        <div className="flex items-center space-x-2 text-indigo-300 font-bold text-xs uppercase tracking-wider mb-2">
          <MailCheck className="w-4 h-4 text-indigo-400" />
          <span>Detección Automática Gmail & Scanner AI</span>
        </div>

        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
          Borradores & Correos Detectados
        </h1>

        <p className="text-indigo-100/80 text-sm mt-2 max-w-3xl leading-relaxed">
          Los correos electrónicos y tickets escaneados se guardan primero como <strong>borradores aislados</strong>. Revisa los detalles, asígnales un grupo y confirma para agregarlos a tus balances reales.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            onClick={onOpenScanReceiptModal}
            className="flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-4 py-2.5 rounded-xl text-sm shadow-md transition"
          >
            <ScanLine className="w-4 h-4" />
            <span>Escanear Comprobante / Email</span>
          </button>

          <button
            onClick={simulateGmailArrival}
            className="flex items-center space-x-2 bg-white/10 hover:bg-white/20 text-indigo-100 px-4 py-2.5 rounded-xl text-sm font-semibold border border-white/10 transition"
          >
            <RefreshCw className="w-4 h-4 text-indigo-300" />
            <span>Simular Sync Gmail</span>
          </button>
        </div>
      </div>

      {/* Pending Drafts Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900 flex items-center space-x-2">
            <Clock className="w-5 h-5 text-amber-500" />
            <span>Pendientes de Confirmar ({pendingDrafts.length})</span>
          </h2>
        </div>

        {pendingDrafts.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-500 shadow-sm">
            <Inbox className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h3 className="font-bold text-slate-800">No tienes borradores pendientes</h3>
            <p className="text-xs text-slate-500 mt-1 mb-4">
              Usa el botón de simulación o escanea un comprobante para generar un borrador.
            </p>
            <button
              onClick={simulateGmailArrival}
              className="bg-slate-900 hover:bg-slate-800 text-white font-bold px-4 py-2 rounded-xl text-xs"
            >
              Simular entrada de e-mail
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {pendingDrafts.map((draft) => (
              <div
                key={draft.id}
                className="bg-white rounded-2xl p-6 border border-amber-200 shadow-sm hover:shadow-md transition flex flex-col justify-between relative overflow-hidden"
              >
                <div>
                  {/* Draft Header */}
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold text-amber-800 bg-amber-100 px-2.5 py-1 rounded-full border border-amber-200">
                      Gmail / AI Detectado
                    </span>
                    <span className="text-xs font-bold text-slate-500">
                      Confianza: {Math.round(draft.confidence * 100)}%
                    </span>
                  </div>

                  <h3 className="font-extrabold text-slate-900 text-lg">
                    {draft.detected_merchant}
                  </h3>

                  <p className="text-2xl font-black text-emerald-600 my-2">
                    {formatCurrency(draft.detected_amount)}
                  </p>

                  <p className="text-xs text-slate-500 bg-slate-50 p-3 rounded-xl border border-slate-100 font-mono leading-relaxed line-clamp-3">
                    &quot;{draft.raw_snippet}&quot;
                  </p>

                  {draft.extracted_items && draft.extracted_items.length > 0 && (
                    <div className="mt-3 pt-2 border-t border-slate-100 text-xs">
                      <span className="font-bold text-slate-600 block mb-1">
                        Ítems detectados ({draft.extracted_items.length}):
                      </span>
                      <div className="space-y-1">
                        {draft.extracted_items.map((item, idx) => (
                          <div key={idx} className="flex justify-between text-slate-600">
                            <span>• {item.description}</span>
                            <span className="font-medium">{formatCurrency(item.amount)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer Action Buttons */}
                <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between gap-3">
                  <button
                    onClick={() => discardDraft(draft.id)}
                    className="flex items-center space-x-1 text-slate-400 hover:text-rose-600 px-3 py-2 rounded-xl text-xs font-semibold hover:bg-rose-50 transition"
                  >
                    <XCircle className="w-4 h-4" />
                    <span>Descartar</span>
                  </button>

                  <button
                    onClick={() => onOpenConfirmDraft(draft)}
                    className="flex items-center space-x-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-4 py-2 rounded-xl text-xs shadow-sm transition"
                  >
                    <span>Asignar a Grupo</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* History of Processed Drafts */}
      {processedDrafts.length > 0 && (
        <div className="space-y-3 pt-6 border-t border-slate-200">
          <h3 className="font-bold text-slate-700 text-base">Historial de Borradores Procesados</h3>
          <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
            {processedDrafts.map((d) => (
              <div key={d.id} className="p-4 flex items-center justify-between text-sm">
                <div>
                  <span className="font-bold text-slate-800">{d.detected_merchant}</span>
                  <span className="text-xs text-slate-400 ml-3">{d.detected_date}</span>
                </div>
                <div className="flex items-center space-x-3">
                  <span className="font-bold text-slate-700">
                    {formatCurrency(d.detected_amount)}
                  </span>
                  {d.status === 'confirmed' ? (
                    <span className="bg-emerald-100 text-emerald-800 text-xs font-bold px-2.5 py-0.5 rounded-full flex items-center space-x-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Confirmado</span>
                    </span>
                  ) : (
                    <span className="bg-slate-100 text-slate-500 text-xs font-medium px-2.5 py-0.5 rounded-full">
                      Descartado
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
