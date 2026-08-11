'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { Expense, Payment, Profile, Group } from '@/lib/types';
import { formatCurrency } from '@/lib/balance-utils';
import { getCategoryConfig } from '@/lib/expense-category-utils';
import {
  Receipt,
  HandCoins,
  Calendar,
  FileText,
  Pencil,
  Trash2,
  ExternalLink,
  ArrowRight,
  CheckCircle2,
  X,
} from 'lucide-react';

export type UnifiedTransaction =
  | { type: 'expense'; date: string; data: Expense }
  | { type: 'payment'; date: string; data: Payment };

interface GenericExpenseListProps {
  expenses: Expense[];
  payments: Payment[];
  profiles: Profile[];
  userGroups: Group[];
  currentProfile: Profile | null;
  groupCurrency?: string;
  onSelectExpense?: (expense: Expense) => void;
  onEditExpense?: (expense: Expense) => void;
  onDeleteExpense?: (expenseId: string) => void;
  showGroupBadge?: boolean;
}

export function GenericExpenseList({
  expenses,
  payments,
  profiles,
  userGroups,
  currentProfile,
  groupCurrency,
  onSelectExpense,
  onEditExpense,
  onDeleteExpense,
  showGroupBadge = true,
}: GenericExpenseListProps) {
  const [selectedProofUrl, setSelectedProofUrl] = useState<string | null>(null);

  // Combine and sort chronologically (most recent first)
  const transactions: UnifiedTransaction[] = [
    ...expenses.map((e) => ({
      type: 'expense' as const,
      date: e.expense_date || e.created_at,
      data: e,
    })),
    ...payments.map((p) => ({
      type: 'payment' as const,
      date: p.payment_date || p.created_at,
      data: p,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (transactions.length === 0) {
    return (
      <div className="bg-white rounded-2xl ring-1 ring-zinc-200 p-12 text-center text-zinc-500">
        <Receipt className="w-12 h-12 text-zinc-300 mx-auto mb-3" />
        <h3 className="font-semibold text-zinc-900 text-base">No hay movimientos registrados</h3>
        <p className="text-xs text-zinc-500 mt-1">Los gastos y abonos de deuda aparecerán aquí.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3.5">
      {transactions.map((tx) => {
        if (tx.type === 'expense') {
          const exp = tx.data;
          const group = userGroups.find((g) => g.id === exp.group_id);
          const paidBy = profiles.find((p) => p.id === exp.paid_by);
          const catConfig = getCategoryConfig(exp.category);
          const CategoryIcon = catConfig.icon;
          const currency = groupCurrency || group?.currency || currentProfile?.currency || 'COP';

          const isPayer = exp.paid_by === currentProfile?.id;
          const mySplit = exp.splits?.find((s) => s.user_id === currentProfile?.id)?.amount_owed ?? 0;

          let statusText = 'No participas';
          let statusBg = 'bg-zinc-100 text-zinc-600 border-zinc-200';

          if (isPayer) {
            const recovers = exp.total_amount - mySplit;
            if (recovers > 0) {
              statusText = `Recuperas ${formatCurrency(recovers, currency)}`;
              statusBg = 'bg-emerald-50 text-emerald-800 border-emerald-200';
            } else {
              statusText = 'Pagaste todo';
              statusBg = 'bg-emerald-50 text-emerald-800 border-emerald-200';
            }
          } else if (mySplit > 0) {
            statusText = `Debes ${formatCurrency(mySplit, currency)}`;
            statusBg = 'bg-rose-50 text-rose-800 border-rose-200';
          }

          return (
            <div
              key={`exp-${exp.id}`}
              onClick={() => onSelectExpense?.(exp)}
              className="bg-white rounded-2xl ring-1 ring-zinc-200 p-4 sm:p-5 shadow-2xs hover:shadow-md hover:ring-zinc-300 transition-all cursor-pointer group active:scale-[0.99]"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start space-x-3.5">
                  <div className={`p-3 rounded-2xl border border-zinc-200/60 ${catConfig.bgClass} ${catConfig.textClass} shrink-0 mt-0.5`}>
                    <CategoryIcon className="w-5 h-5" />
                  </div>

                  <div>
                    <div className="flex items-center space-x-2">
                      <h3 className="font-bold text-zinc-900 text-sm sm:text-base group-hover:text-emerald-700 transition-colors">
                        {exp.description}
                      </h3>
                      {exp.source === 'gmail' && (
                        <span className="bg-zinc-900 text-white text-[10px] uppercase font-semibold tracking-widest px-2 py-0.5 rounded-md">
                          AI
                        </span>
                      )}
                    </div>

                    {exp.notes && (
                      <p className="text-xs text-zinc-600 mt-1 flex items-center space-x-1 font-normal bg-zinc-50 px-2 py-1 rounded-md border border-zinc-100 w-fit">
                        <FileText className="w-3 h-3 text-zinc-400 shrink-0" />
                        <span>{exp.notes}</span>
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500 mt-1.5">
                      {showGroupBadge && group && (
                        <>
                          <span className="font-semibold text-zinc-700 bg-zinc-100 px-2.5 py-0.5 rounded-md">
                            {group.name}
                          </span>
                          <span>•</span>
                        </>
                      )}
                      <span className="flex items-center space-x-1 font-medium">
                        <Calendar className="w-3 h-3 text-zinc-400" />
                        <span>{exp.expense_date}</span>
                      </span>
                      <span>•</span>
                      <span>
                        Pagó:{' '}
                        <strong className="text-zinc-800 font-semibold">{paidBy ? paidBy.full_name : 'Alguien'}</strong>
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-4 border-t sm:border-t-0 pt-3 sm:pt-0 border-zinc-100">
                  <div className="text-right">
                    <span className="text-sm sm:text-base font-bold text-zinc-900 block tracking-tight">
                      {formatCurrency(exp.total_amount, currency)}
                    </span>
                    <div className={`mt-1 inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${statusBg}`}>
                      {statusText}
                    </div>
                  </div>

                  <div className="flex items-center space-x-1 bg-zinc-50/80 p-1 rounded-xl" onClick={(e) => e.stopPropagation()}>
                    {onEditExpense && (
                      <button
                        type="button"
                        onClick={() => onEditExpense(exp)}
                        className="p-1.5 hover:bg-zinc-200 hover:text-zinc-900 rounded-lg text-zinc-500 transition-colors"
                        title="Editar gasto"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                    )}

                    {onDeleteExpense && (
                      <button
                        type="button"
                        onClick={() => onDeleteExpense(exp.id)}
                        className="p-1.5 hover:bg-rose-50 hover:text-rose-600 rounded-lg text-zinc-400 transition-colors"
                        title="Eliminar gasto"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        }

        // Render PAYMENT transaction with distinctive styling!
        const payment = tx.data;
        const payer = profiles.find((p) => p.id === payment.paid_by);
        const receiver = profiles.find((p) => p.id === payment.paid_to);
        const group = userGroups.find((g) => g.id === payment.group_id);
        const currency = groupCurrency || group?.currency || currentProfile?.currency || 'COP';

        const isIpaid = payment.paid_by === currentProfile?.id;
        const isIreceived = payment.paid_to === currentProfile?.id;

        return (
          <div
            key={`pay-${payment.id}`}
            className="bg-emerald-50/40 border border-emerald-200/90 rounded-2xl p-4 sm:p-5 shadow-2xs hover:shadow-md transition-all"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start space-x-3.5">
                <div className="p-3 rounded-2xl bg-emerald-100 text-emerald-800 border border-emerald-200/80 shrink-0 mt-0.5">
                  <HandCoins className="w-5 h-5 text-emerald-700" />
                </div>

                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="bg-emerald-600 text-white text-[10px] uppercase font-extrabold tracking-wider px-2.5 py-0.5 rounded-full">
                      Pago de Deuda
                    </span>
                    {showGroupBadge && group && (
                      <span className="bg-white border border-emerald-200 font-semibold text-emerald-900 text-xs px-2.5 py-0.5 rounded-md">
                        {group.name}
                      </span>
                    )}
                  </div>

                  <h3 className="font-bold text-zinc-900 text-sm sm:text-base mt-1 flex items-center space-x-1.5 flex-wrap">
                    <span className={isIpaid ? 'text-emerald-700 font-extrabold' : ''}>
                      {payer ? payer.full_name : 'Usuario'}
                    </span>
                    <ArrowRight className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span className={isIreceived ? 'text-emerald-700 font-extrabold' : ''}>
                      {receiver ? receiver.full_name : 'Usuario'}
                    </span>
                  </h3>

                  {payment.note && (
                    <p className="text-xs text-zinc-600 mt-1 flex items-center space-x-1 font-medium bg-white/80 px-2 py-0.5 rounded-md border border-emerald-100 w-fit">
                      <span>{payment.note}</span>
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500 mt-1.5">
                    <span className="flex items-center space-x-1 font-medium">
                      <Calendar className="w-3 h-3 text-zinc-400" />
                      <span>{payment.payment_date}</span>
                    </span>

                    {payment.proof_url && (
                      <>
                        <span>•</span>
                        <button
                          type="button"
                          onClick={() => setSelectedProofUrl(payment.proof_url || null)}
                          className="text-xs text-emerald-700 font-semibold hover:underline flex items-center space-x-1"
                        >
                          <ExternalLink className="w-3 h-3" />
                          <span>Ver comprobante</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between sm:justify-end gap-4 border-t sm:border-t-0 pt-3 sm:pt-0 border-emerald-100">
                <div className="text-right">
                  <span className="text-base sm:text-lg font-black text-emerald-800 block tracking-tight">
                    {formatCurrency(payment.amount, currency)}
                  </span>
                  <div className="mt-0.5 inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-300">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                    <span>Saldado</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })}

      {/* Proof Modal */}
      {selectedProofUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-sm">
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full space-y-4 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
              <h3 className="font-bold text-zinc-900 text-base">Comprobante de Pago</h3>
              <button
                type="button"
                onClick={() => setSelectedProofUrl(null)}
                className="p-1.5 text-zinc-400 hover:text-zinc-900 rounded-full"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="relative w-full h-80 rounded-2xl overflow-hidden bg-zinc-100 ring-1 ring-zinc-200">
              <Image
                src={selectedProofUrl}
                alt="Comprobante de pago"
                fill
                className="object-contain"
                unoptimized
                referrerPolicy="no-referrer"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
