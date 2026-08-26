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

import { PageHeader } from '@/components/PageHeader';

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
      raw_snippet: `Confirmación de pago a ${pick.name} recibida por e-mail el ${new Date().toLocaleDateString()}. Total pagado ${formatCurrency(pick.amount)}.`,
      detected_amount: pick.amount,
      detected_merchant: pick.name,
      detected_date: new Date().toISOString().split('T')[0],
      confidence: 0.94,
      extracted_items: pick.items,
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Tickets y Borradores"
        subtitle="Los comprobantes escaneados o recibidos se guardan aquí. Asígnalos a un grupo para dividirlos."
        icon={<MailCheck className="w-5 h-5" />}
        actions={
          <>
            <button
              onClick={simulateGmailArrival}
              className="bg-white hover:bg-zinc-50 border border-zinc-200 text-zinc-700 font-semibold px-4 py-2 rounded-xl text-sm shadow-sm transition-all duration-150 active:scale-95 flex items-center justify-center space-x-2 shrink-0 min-h-[40px]"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Importar Ejemplo</span>
            </button>
            <button
              onClick={onOpenScanReceiptModal}
              className="bg-zinc-900 hover:bg-zinc-800 text-white font-semibold px-4 py-2 rounded-xl text-sm shadow-sm transition-all duration-150 active:scale-95 flex items-center justify-center space-x-2 shrink-0 min-h-[40px]"
            >
              <ScanLine className="w-4 h-4" />
              <span>Escanear</span>
            </button>
          </>
        }
      />

      {/* Pending Drafts Section */}
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-zinc-900 tracking-tight flex items-center space-x-2">
            <Clock className="w-5 h-5 text-amber-500" />
            <span>Pendientes de Confirmar <span className="text-zinc-400 font-normal">({pendingDrafts.length})</span></span>
          </h2>
        </div>

        {pendingDrafts.length === 0 ? (
          <div className="bg-white rounded-2xl ring-1 ring-zinc-200 p-16 text-center text-zinc-500 shadow-sm">
            <Inbox className="w-12 h-12 text-zinc-300 mx-auto mb-4" />
            <h3 className="font-semibold text-zinc-900 text-lg">No tienes borradores pendientes</h3>
            <p className="text-sm text-zinc-500 mt-1.5 mb-6 max-w-md mx-auto">
              Usa el botón de simulación o escanea un comprobante para generar un borrador automáticamente.
            </p>
            <button
              onClick={simulateGmailArrival}
              className="bg-zinc-900 hover:bg-zinc-800 text-white font-medium px-5 py-2.5 rounded-full text-xs transition-all active:scale-95"
            >
              Simular entrada de e-mail
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {pendingDrafts.map((draft) => (
              <div
                key={draft.id}
                className="bg-white rounded-2xl p-6 ring-1 ring-amber-200/60 shadow-sm hover:shadow-md transition-all flex flex-col justify-between relative overflow-hidden"
              >
                <div>
                  {/* Draft Header */}
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-amber-800 bg-amber-100/50 px-2.5 py-1 rounded-md">
                      Borrador
                    </span>
                    <span className="text-xs font-semibold text-zinc-400">
                      Verificado
                    </span>
                  </div>

                  <h3 className="font-semibold text-zinc-900 text-xl tracking-tight">
                    {draft.detected_merchant}
                  </h3>

                  <p className="text-3xl font-semibold text-emerald-600 my-2 tracking-tight">
                    {formatCurrency(draft.detected_amount)}
                  </p>

                  <p className="text-sm text-zinc-600 bg-zinc-50 p-4 rounded-xl ring-1 ring-zinc-100/80 leading-relaxed line-clamp-3 mt-4">
                    &quot;{draft.raw_snippet}&quot;
                  </p>

                  {draft.extracted_items && draft.extracted_items.length > 0 && (
                    <div className="mt-5 pt-4 border-t border-zinc-100 text-sm">
                      <span className="font-semibold text-zinc-900 block mb-2">
                        Ítems detectados <span className="text-zinc-500 font-normal">({draft.extracted_items.length})</span>
                      </span>
                      <div className="space-y-2">
                        {draft.extracted_items.map((item, idx) => (
                          <div key={idx} className="flex justify-between text-zinc-600">
                            <span>• {item.description}</span>
                            <span className="font-medium text-zinc-900">{formatCurrency(item.amount)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer Action Buttons */}
                <div className="mt-6 pt-5 border-t border-zinc-100 flex items-center justify-between gap-4">
                  <button
                    onClick={() => discardDraft(draft.id)}
                    className="flex items-center space-x-1.5 text-zinc-500 hover:text-rose-600 px-4 py-2 rounded-full text-xs font-medium hover:bg-rose-50 transition-colors"
                  >
                    <XCircle className="w-4 h-4" />
                    <span>Descartar</span>
                  </button>

                  <button
                    onClick={() => onOpenConfirmDraft(draft)}
                    className="flex items-center space-x-1.5 bg-zinc-900 hover:bg-zinc-800 text-white font-medium px-5 py-2.5 rounded-full text-xs shadow-sm hover:shadow-md transition-all duration-200 active:scale-95"
                  >
                    <span>Confirmar</span>
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
        <div className="space-y-4 pt-8 border-t border-zinc-200/60">
          <h3 className="font-semibold text-zinc-900 text-lg tracking-tight">Historial de Borradores Procesados</h3>
          <div className="bg-white rounded-2xl ring-1 ring-zinc-200 divide-y divide-zinc-100 overflow-hidden shadow-sm">
            {processedDrafts.map((d) => (
              <div key={d.id} className="p-5 flex flex-col sm:flex-row sm:items-center justify-between text-sm gap-3 hover:bg-zinc-50 transition-colors">
                <div>
                  <span className="font-semibold text-zinc-900">{d.detected_merchant}</span>
                  <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest ml-3">{d.detected_date}</span>
                </div>
                <div className="flex items-center space-x-4">
                  <span className="font-semibold text-zinc-900">
                    {formatCurrency(d.detected_amount)}
                  </span>
                  {d.status === 'confirmed' ? (
                    <span className="bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 text-[10px] uppercase tracking-widest font-bold px-2 py-1 rounded-md flex items-center space-x-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Confirmado</span>
                    </span>
                  ) : (
                    <span className="bg-zinc-100 text-zinc-500 text-[10px] uppercase tracking-widest font-bold px-2 py-1 rounded-md">
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
