'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { Expense, Payment, Profile, Group } from '@/lib/types';
import { formatCurrency } from '@/lib/balance-utils';
import { getCategoryConfig } from '@/lib/expense-category-utils';
import {
  Receipt,
  HandCoins,
  FileText,
  Pencil,
  Trash2,
  ExternalLink,
  ArrowRight,
  CheckCircle2,
  X,
  ChevronDown,
  ChevronUp,
  User,
  Clock,
  ImageIcon
} from 'lucide-react';

type UnifiedTransaction =
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
  onEditPayment?: (payment: Payment) => void;
  onDeletePayment?: (paymentId: string) => void;
  showGroupBadge?: boolean;
}

const MONTH_NAMES_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

const MONTH_ABBR_ES = [
  'ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN',
  'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'
];

function parseTxDate(dateStr: string) {
  if (!dateStr) return { year: 2026, monthIndex: 0, dayStr: '01', monthAbbr: 'ENE', monthLabel: 'Enero 2026', key: '2026-00' };
  const cleanDate = dateStr.split('T')[0];
  const parts = cleanDate.split('-');
  if (parts.length >= 3) {
    const year = parseInt(parts[0], 10) || 2026;
    const monthIndex = Math.max(0, Math.min(11, (parseInt(parts[1], 10) || 1) - 1));
    const dayNum = parseInt(parts[2], 10) || 1;
    const dayStr = dayNum < 10 ? `0${dayNum}` : `${dayNum}`;
    const monthAbbr = MONTH_ABBR_ES[monthIndex];
    const monthLabel = `${MONTH_NAMES_ES[monthIndex]} ${year}`;
    const key = `${year}-${monthIndex < 9 ? '0' : ''}${monthIndex}`;
    return { year, monthIndex, dayStr, monthAbbr, monthLabel, key };
  }
  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) {
    const year = d.getFullYear();
    const monthIndex = d.getMonth();
    const dayNum = d.getDate();
    const dayStr = dayNum < 10 ? `0${dayNum}` : `${dayNum}`;
    const monthAbbr = MONTH_ABBR_ES[monthIndex];
    const monthLabel = `${MONTH_NAMES_ES[monthIndex]} ${year}`;
    const key = `${year}-${monthIndex < 9 ? '0' : ''}${monthIndex}`;
    return { year, monthIndex, dayStr, monthAbbr, monthLabel, key };
  }
  return { year: 2026, monthIndex: 0, dayStr: '01', monthAbbr: 'ENE', monthLabel: 'Enero 2026', key: '2026-00' };
}

function formatFullDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const dateFormatted = d.toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const timeFormatted = d.toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return `${dateFormatted}, ${timeFormatted}`;
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
  onEditPayment,
  onDeletePayment,
  showGroupBadge = true,
}: GenericExpenseListProps) {
  const [selectedProofUrl, setSelectedProofUrl] = useState<string | null>(null);
  const [expandedExpenseId, setExpandedExpenseId] = useState<string | null>(null);
  const [expenseToDelete, setExpenseToDelete] = useState<string | null>(null);

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

  // Group transactions by month
  const groupedByMonth: { key: string; label: string; items: UnifiedTransaction[] }[] = [];

  transactions.forEach((tx) => {
    const parsed = parseTxDate(tx.date);
    let existing = groupedByMonth.find((g) => g.key === parsed.key);
    if (!existing) {
      existing = { key: parsed.key, label: parsed.monthLabel, items: [] };
      groupedByMonth.push(existing);
    }
    existing.items.push(tx);
  });

  return (
    <div className="space-y-4">
      {groupedByMonth.map((group) => (
        <div key={group.key} className="space-y-2">
          {/* Monthly Section Header Cut */}
          <div className="flex items-center space-x-2.5 px-1 py-0.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 bg-zinc-100 px-2.5 py-0.5 rounded-full border border-zinc-200/80">
              {group.label}
            </span>
            <div className="h-px bg-zinc-200/70 flex-1" />
          </div>

          <div className="bg-white rounded-2xl ring-1 ring-zinc-200/80 shadow-2xs divide-y divide-zinc-100 overflow-hidden">
            {group.items.map((tx) => {
              const parsed = parseTxDate(tx.date);

              if (tx.type === 'expense') {
                const exp = tx.data;
                const groupObj = userGroups.find((g) => g.id === exp.group_id);
                const paidBy = profiles.find((p) => p.id === exp.paid_by);
                const createdBy = profiles.find((p) => p.id === exp.created_by);
                const updatedBy = exp.updated_by ? profiles.find((p) => p.id === exp.updated_by) : null;
                const catConfig = getCategoryConfig(exp.category);
                const CategoryIcon = catConfig.icon;
                const currency = groupCurrency || groupObj?.currency || currentProfile?.currency || 'COP';

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

                const isExpanded = expandedExpenseId === exp.id;

                return (
                  <div
                    key={`exp-${exp.id}`}
                    className={`flex flex-col relative transition-colors ${
                      isExpanded ? 'bg-zinc-50/40' : ''
                    }`}
                  >
                    {isExpanded && (
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-500 rounded-l" />
                    )}
                    <div
                      className={`px-3.5 py-2.5 sm:px-4 sm:py-3 flex items-center justify-between gap-3 min-w-0 cursor-pointer group transition-colors select-none ${
                        isExpanded
                          ? 'bg-zinc-100/70 hover:bg-zinc-200/50'
                          : 'hover:bg-zinc-50/60 active:bg-zinc-100/50'
                      }`}
                      onClick={() => setExpandedExpenseId(isExpanded ? null : exp.id)}
                    >
                      <div className="flex items-center space-x-2.5 min-w-0 flex-1">
                        {/* Date Block */}
                        <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-zinc-100 border border-zinc-200/90 flex flex-col items-center justify-center shrink-0 text-center select-none shadow-2xs">
                          <span className="text-[8px] font-black uppercase tracking-wider text-zinc-500 leading-none">
                            {parsed.monthAbbr}
                          </span>
                          <span className="text-xs sm:text-sm font-black text-zinc-900 leading-none mt-0.5">
                            {parsed.dayStr}
                          </span>
                        </div>

                        {/* Category SVG Icon Box */}
                        <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl border border-zinc-200/60 ${catConfig.bgClass} ${catConfig.textClass} flex items-center justify-center shrink-0`}>
                          <CategoryIcon className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
                        </div>

                        {/* Expense Name & Details */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center space-x-1.5">
                            <h3 className={`font-semibold text-zinc-900 text-xs sm:text-sm transition-colors truncate ${
                              !isExpanded ? 'group-hover:text-emerald-700' : ''
                            }`}>
                              {exp.description}
                            </h3>
                            {exp.source === 'gmail' && (
                              <span className="bg-zinc-900 text-white text-[9px] uppercase font-semibold tracking-widest px-1.5 py-0.5 rounded shrink-0">
                                AI
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-500 mt-0.5">
                            {showGroupBadge && groupObj && (
                              <>
                                <span className="font-medium text-zinc-700 bg-zinc-100 px-1.5 py-0.2 rounded text-[10px]">
                                  {groupObj.name}
                                </span>
                                <span>•</span>
                              </>
                            )}
                            <span className="truncate">
                              Pagó <strong className="text-zinc-700 font-medium">{paidBy ? paidBy.full_name : 'Alguien'}</strong>
                            </span>
                            {exp.notes && (
                              <span className="inline-flex items-center text-zinc-400 hover:text-zinc-600" title="Contiene notas">
                                <FileText className="w-3 h-3 ml-0.5" />
                              </span>
                            )}
                            {exp.receipt_url && (
                              <span className="inline-flex items-center text-zinc-400 hover:text-zinc-600" title="Contiene comprobante adjunto">
                                <ImageIcon className="w-3 h-3 ml-0.5" />
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right Amount & Status & Actions */}
                      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                        <div className="text-right">
                          <span className="text-xs sm:text-sm font-bold text-zinc-900 block tracking-tight">
                            {formatCurrency(exp.total_amount, currency)}
                          </span>
                          <div className={`mt-0.5 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${statusBg}`}>
                            {statusText}
                          </div>
                        </div>

                        <div className="flex items-center space-x-0.5 text-zinc-400" onClick={(e) => e.stopPropagation()}>
                          {!isExpanded && (
                            <div className="p-1 text-zinc-400 hover:text-zinc-600 transition-colors">
                              <ChevronDown className="w-4 h-4" />
                            </div>
                          )}
                          {isExpanded && (
                            <div className="p-1 text-zinc-400 hover:text-zinc-600 transition-colors">
                              <ChevronUp className="w-4 h-4" />
                            </div>
                          )}
                          {!isExpanded && onDeleteExpense && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpenseToDelete(exp.id);
                              }}
                              className="p-1 hover:bg-rose-50 hover:text-rose-600 rounded-md text-zinc-400 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100 hidden sm:block"
                              title="Eliminar gasto"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* EXPANDED CONTENT */}
                    {isExpanded && (
                      <div className="border-t border-zinc-200/70 bg-zinc-50/40 p-4 sm:p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                          {/* Participation without redundant "Pagó" badges */}
                          <div className="bg-white p-3.5 rounded-xl border border-zinc-200/70 shadow-2xs space-y-2.5">
                            <h4 className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                              División del gasto
                            </h4>
                            <div className="space-y-2">
                              {exp.splits?.map((split) => {
                                const profile = profiles.find((p) => p.id === split.user_id);
                                return (
                                  <div key={split.id} className="flex items-center justify-between group/split">
                                    <div className="flex items-center space-x-2.5">
                                      <div className="w-6 h-6 rounded-full bg-zinc-100 overflow-hidden shrink-0 border border-zinc-200">
                                        {profile?.avatar_url ? (
                                          <Image src={profile.avatar_url} alt={profile.full_name} width={24} height={24} className="w-full h-full object-cover" unoptimized />
                                        ) : (
                                          <User className="w-3.5 h-3.5 m-[5px] text-zinc-400" />
                                        )}
                                      </div>
                                      <span className="text-xs sm:text-sm font-medium text-zinc-800 group-hover/split:text-zinc-900 transition-colors">
                                        {profile ? profile.full_name : 'Usuario'}
                                      </span>
                                    </div>
                                    <span className="text-xs sm:text-sm font-semibold text-zinc-900">
                                      {formatCurrency(split.amount_owed, currency)}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          {/* Notes and Receipt (if available) */}
                          {(exp.notes || exp.receipt_url) && (
                            <div className="bg-white p-3.5 rounded-xl border border-zinc-200/70 shadow-2xs space-y-3">
                              {exp.notes && (
                                <div className="space-y-1">
                                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 flex items-center space-x-1">
                                    <FileText className="w-3 h-3" />
                                    <span>Notas</span>
                                  </h4>
                                  <p className="text-xs text-zinc-700 whitespace-pre-wrap leading-relaxed bg-zinc-50 p-2.5 rounded-lg border border-zinc-100">
                                    {exp.notes}
                                  </p>
                                </div>
                              )}

                              {exp.receipt_url && (
                                <div className="space-y-1.5">
                                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 flex items-center space-x-1">
                                    <ImageIcon className="w-3 h-3" />
                                    <span>Comprobante / Recibo</span>
                                  </h4>
                                  <div
                                    onClick={() => setSelectedProofUrl(exp.receipt_url ?? null)}
                                    className="group/img relative w-20 h-20 rounded-lg overflow-hidden border border-zinc-200 cursor-pointer bg-zinc-100 hover:border-zinc-400 transition-all"
                                  >
                                    <Image
                                      src={exp.receipt_url}
                                      alt="Comprobante"
                                      fill
                                      className="object-cover group-hover/img:scale-105 transition-transform"
                                      unoptimized
                                    />
                                    <div className="absolute inset-0 bg-black/30 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center text-white text-[10px] font-semibold">
                                      <ExternalLink className="w-3.5 h-3.5" />
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Streamlined Informative Footer: exact timestamp with date & hour, author & actions */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2.5 border-t border-zinc-200/60 text-xs text-zinc-500">
                          <div className="space-y-0.5">
                            <div className="flex items-center space-x-1.5 flex-wrap">
                              <Clock className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                              <span>
                                Registrado por <strong className="font-medium text-zinc-700">{createdBy ? createdBy.full_name : 'Usuario'}</strong> el {formatFullDateTime(exp.created_at)}
                              </span>
                            </div>
                            {exp.updated_at && exp.updated_at !== exp.created_at && (
                              <p className="text-[11px] text-zinc-400 pl-5">
                                Última modificación por <strong className="font-medium text-zinc-600">{updatedBy ? updatedBy.full_name : 'Usuario'}</strong> el {formatFullDateTime(exp.updated_at)}
                              </p>
                            )}
                          </div>

                          <div className="flex items-center space-x-2 shrink-0 self-end sm:self-auto">
                            {onEditExpense && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onEditExpense(exp);
                                }}
                                className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-zinc-200 text-zinc-700 hover:bg-zinc-100 transition-colors shadow-2xs"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                                <span>Editar</span>
                              </button>
                            )}
                            
                            {onDeleteExpense && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setExpenseToDelete(exp.id);
                                }}
                                className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-50 border border-rose-100 text-rose-700 hover:bg-rose-100 transition-colors shadow-2xs"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>Eliminar</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              }

              // Render PAYMENT transaction with visual harmony!
              const payment = tx.data;
              const payer = profiles.find((p) => p.id === payment.paid_by);
              const receiver = profiles.find((p) => p.id === payment.paid_to);
              const groupObj = userGroups.find((g) => g.id === payment.group_id);
              const currency = groupCurrency || groupObj?.currency || currentProfile?.currency || 'COP';

              const isIpaid = payment.paid_by === currentProfile?.id;
              const isIreceived = payment.paid_to === currentProfile?.id;

              return (
                <div
                  key={`pay-${payment.id}`}
                  className="px-3.5 py-2.5 sm:px-4 sm:py-3 transition-colors cursor-pointer group hover:bg-zinc-50/60 active:bg-zinc-100/50"
                >
                  <div className="flex items-center justify-between gap-3 min-w-0">
                    <div className="flex items-center space-x-2.5 min-w-0 flex-1">
                      {/* Date Block */}
                      <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-zinc-100 border border-zinc-200/90 flex flex-col items-center justify-center shrink-0 text-center select-none shadow-2xs">
                        <span className="text-[8px] font-black uppercase tracking-wider text-zinc-500 leading-none">
                          {parsed.monthAbbr}
                        </span>
                        <span className="text-xs sm:text-sm font-black text-zinc-900 leading-none mt-0.5">
                          {parsed.dayStr}
                        </span>
                      </div>

                      {/* Payment SVG Icon Box */}
                      <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200/80 flex items-center justify-center shrink-0">
                        <HandCoins className="w-4 h-4 sm:w-4.5 sm:h-4.5 text-emerald-700" />
                      </div>

                      {/* Payment Description & Details */}
                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold text-zinc-900 text-xs sm:text-sm group-hover:text-emerald-700 transition-colors flex items-center space-x-1 flex-wrap truncate">
                          <span className={isIpaid ? 'text-emerald-700 font-bold' : ''}>
                            {payer ? payer.full_name : 'Usuario'}
                          </span>
                          <ArrowRight className="w-3 h-3 text-emerald-600 shrink-0" />
                          <span className={isIreceived ? 'text-emerald-700 font-bold' : ''}>
                            {receiver ? receiver.full_name : 'Usuario'}
                          </span>
                        </h3>

                        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-500 mt-0.5">
                          {showGroupBadge && groupObj && (
                            <>
                              <span className="font-medium text-zinc-700 bg-zinc-100 px-1.5 py-0.2 rounded text-[10px]">
                                {groupObj.name}
                              </span>
                              <span>•</span>
                            </>
                          )}

                          {payment.note && (
                            <span className="text-zinc-500 truncate max-w-[120px] sm:max-w-[200px]">
                              {payment.note}
                            </span>
                          )}

                          {payment.proof_url && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedProofUrl(payment.proof_url ?? null);
                              }}
                              className="text-[11px] text-emerald-700 font-semibold hover:underline flex items-center space-x-0.5"
                            >
                              <ExternalLink className="w-2.5 h-2.5" />
                              <span>Comprobante</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right Amount & Status & Action Buttons */}
                    <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                      <div className="text-right">
                        <span className="text-xs sm:text-sm font-bold text-zinc-900 block tracking-tight">
                          {formatCurrency(payment.amount, currency)}
                        </span>
                        <div className="mt-0.5 inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                          <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" />
                          <span>Abono</span>
                        </div>
                      </div>

                      <div className="flex items-center space-x-0.5" onClick={(e) => e.stopPropagation()}>
                        {onEditPayment && (
                          <button
                            type="button"
                            onClick={() => onEditPayment(payment)}
                            className="p-1 hover:bg-zinc-200 hover:text-zinc-900 rounded-md text-zinc-400 transition-colors"
                            title="Editar pago"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {onDeletePayment && (
                          <button
                            type="button"
                            onClick={() => onDeletePayment(payment.id)}
                            className="p-1 hover:bg-rose-50 hover:text-rose-600 rounded-md text-zinc-400 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100 hidden sm:block"
                            title="Eliminar pago"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Delete Expense Modal */}
      {expenseToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-sm">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full space-y-6 shadow-2xl">
            <div>
              <h3 className="font-bold text-zinc-900 text-xl">Eliminar Gasto</h3>
              <p className="text-zinc-600 mt-2">
                ¿Estás seguro de que deseas eliminar este gasto? Esta acción no se puede deshacer y afectará los balances de todos los participantes.
              </p>
            </div>
            
            <div className="flex items-center space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setExpenseToDelete(null)}
                className="flex-1 px-4 py-2.5 rounded-xl font-semibold text-zinc-700 bg-zinc-100 hover:bg-zinc-200 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  if (onDeleteExpense && expenseToDelete) {
                    onDeleteExpense(expenseToDelete);
                  }
                  setExpenseToDelete(null);
                }}
                className="flex-1 px-4 py-2.5 rounded-xl font-semibold text-white bg-rose-600 hover:bg-rose-700 transition-colors"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

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
