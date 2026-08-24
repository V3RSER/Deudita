'use client';

import React, { useState, useMemo } from 'react';
import Image from 'next/image';
import { Expense, Payment, Profile, Group, PairwiseBalance, ExpenseSplit } from '@/lib/types';
import {
  formatCurrency,
  calculatePairwiseDebtDetail,
  DebtBreakdownItem,
  AppliedPaymentItem,
  ReverseOffsetItem,
  ThirdPartyTriangulation,
} from '@/lib/balance-utils';
import { getCategoryConfig } from '@/lib/expense-category-utils';
import {
  ExpenseParticipantSummary,
  ParticipantSummaryData,
  ParticipantItemBreakdown,
} from '@/components/ExpenseParticipantSummary';
import {
  ArrowLeft,
  X,
  ChevronDown,
  ChevronUp,
  User,
  Wallet,
  Network,
  Calculator,
  Info,
  Layers,
  ArrowRight,
  Receipt,
  ExternalLink,
  ShoppingBag,
  FileText,
  ImageIcon,
  Shield,
  CheckCircle2,
} from 'lucide-react';

interface PairwiseDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  pairwise: PairwiseBalance | null;
  currentProfile: Profile | null;
  expenses: Expense[];
  payments: Payment[];
  profiles: Profile[];
  groups: Group[];
  isSimplified: boolean;
  groupId?: string;
  onOpenSettleModal: (groupId?: string, debtorId?: string, creditorId?: string, amount?: number) => void;
  onEditPayment?: (payment: Payment) => void;
}

function getInitials(name?: string | null): string {
  if (!name) return 'U';
  const trimmed = name.trim();
  if (!trimmed) return 'U';
  const parts = trimmed.split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return trimmed.slice(0, 2).toUpperCase();
}

function formatExpenseDateDisplay(dateStr?: string | null): { dateStr: string; timeStr?: string } {
  if (!dateStr) return { dateStr: 'Reciente' };
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return { dateStr: dateStr };
  
  const formattedDate = d.toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const formattedTime = d.toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  return {
    dateStr: formattedDate,
    timeStr: formattedTime !== '00:00' ? formattedTime : undefined,
  };
}

export function PairwiseDetailModal({
  isOpen,
  onClose,
  pairwise,
  currentProfile,
  expenses,
  payments,
  profiles,
  groups,
  isSimplified,
  groupId,
  onOpenSettleModal,
}: PairwiseDetailModalProps) {
  const [expandedSections, setExpandedSections] = useState({
    debts: true,
    recovers: true,
    triangulations: true,
    calculation: true,
  });

  const [expandedExpenseIds, setExpandedExpenseIds] = useState<Set<string>>(new Set());
  const [expandedTriangulationIndexes, setExpandedTriangulationIndexes] = useState<Set<number>>(new Set());
  const [selectedReceiptUrl, setSelectedReceiptUrl] = useState<string | null>(null);

  const detail = useMemo(() => {
    if (!pairwise) return null;
    return calculatePairwiseDebtDetail(
      pairwise.debtor,
      pairwise.creditor,
      expenses,
      payments,
      profiles,
      groups,
      isSimplified,
      groupId || pairwise.group_id
    );
  }, [pairwise, expenses, payments, profiles, groups, isSimplified, groupId]);

  if (!isOpen || !pairwise || !detail) return null;

  const currency = groupId
    ? groups.find((g) => g.id === groupId)?.currency || 'COP'
    : pairwise.group_id
    ? groups.find((g) => g.id === pairwise.group_id)?.currency || 'COP'
    : currentProfile?.currency || 'COP';

  const isDebtor =
    pairwise.debtor.id === currentProfile?.id ||
    (!isSimplified && pairwise.debtorSponsor?.id === currentProfile?.id);

  const isCreditor =
    pairwise.creditor.id === currentProfile?.id ||
    (!isSimplified && pairwise.creditorSponsor?.id === currentProfile?.id);

  const debtorName = pairwise.debtor.full_name || 'Deudor';
  const creditorName = pairwise.creditor.full_name || 'Acreedor';

  const allSectionsExpanded =
    expandedSections.debts &&
    expandedSections.recovers &&
    expandedSections.triangulations &&
    expandedSections.calculation;

  const toggleAllSections = () => {
    const nextState = !allSectionsExpanded;
    setExpandedSections({
      debts: nextState,
      recovers: nextState,
      triangulations: nextState,
      calculation: nextState,
    });
  };

  const toggleExpenseExpand = (id: string) => {
    setExpandedExpenseIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleTriangulationExpand = (idx: number) => {
    setExpandedTriangulationIndexes((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  // Calculations for summary card
  const totalDebtsFromCreditor = detail.pendingExpenses.reduce((acc, d) => acc + d.originalAmount, 0);
  const totalRecoversFromDebtor = detail.reverseOffsetExpenses.reduce((acc, r) => acc + r.amount, 0);
  const totalDirectPayments = detail.appliedPayments.reduce((acc, p) => acc + p.amountApplied, 0);
  const triangulationDiscount = detail.optimizationDetail?.totalCompensated || 0;
  const finalSettlementAmount = pairwise.amount;

  const pendingExpensesCount = detail.pendingExpenses.length;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 lg:p-6 overflow-y-auto animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-5xl max-h-[94vh] bg-zinc-50 rounded-3xl shadow-2xl border border-zinc-200/90 flex flex-col overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* TOP MODAL HEADER (Matching image layout) */}
        <div className="bg-white px-4 sm:px-6 py-3.5 border-b border-zinc-200/80 shrink-0">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            {/* Left Header info */}
            <div className="flex items-center space-x-3.5 min-w-0">
              <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar detalle"
                className="w-9 h-9 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-700 flex items-center justify-center transition-all cursor-pointer shrink-0"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>

              {/* Double Avatars */}
              <div className="flex items-center -space-x-2 shrink-0">
                {pairwise.debtor.avatar_url ? (
                  <Image
                    src={pairwise.debtor.avatar_url}
                    alt={debtorName}
                    width={40}
                    height={40}
                    className="w-10 h-10 rounded-full object-cover ring-2 ring-white shrink-0 shadow-2xs"
                    unoptimized
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-[#581c87] text-white flex items-center justify-center text-xs font-bold ring-2 ring-white shrink-0 shadow-2xs">
                    {getInitials(debtorName)}
                  </div>
                )}

                {pairwise.creditor.avatar_url ? (
                  <Image
                    src={pairwise.creditor.avatar_url}
                    alt={creditorName}
                    width={40}
                    height={40}
                    className="w-10 h-10 rounded-full object-cover ring-2 ring-white shrink-0 shadow-2xs"
                    unoptimized
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-slate-600 text-white flex items-center justify-center text-xs font-bold ring-2 ring-white shrink-0 shadow-2xs">
                    {getInitials(creditorName)}
                  </div>
                )}
              </div>

              {/* Title & Badges */}
              <div className="min-w-0">
                <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                  <span className="text-xs font-bold text-zinc-600">
                    {isCreditor ? 'A tu favor' : isDebtor ? 'Por pagar' : 'Entre integrantes'}
                  </span>
                  {pendingExpensesCount > 0 && (
                    <span className="bg-zinc-100 text-zinc-600 text-[11px] font-bold px-2 py-0.5 rounded-full border border-zinc-200/80">
                      {pendingExpensesCount === 1 ? '1 gasto pendiente' : `${pendingExpensesCount} gastos pendientes`}
                    </span>
                  )}
                </div>
                <h2 className="text-sm sm:text-base font-extrabold text-zinc-900 tracking-tight truncate mt-0.5">
                  <span className="text-[#581c87] font-black">{debtorName}</span>{' '}
                  <span className="text-zinc-500 font-medium">le debe a</span>{' '}
                  <span className="text-zinc-900 font-black">{creditorName}</span>
                </h2>
              </div>
            </div>

            {/* Right Saldo a liquidar & Saldar button */}
            <div className="flex items-center justify-between md:justify-end space-x-4 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-zinc-100">
              <div className="text-left md:text-right">
                <span className="text-[10px] font-black uppercase text-zinc-400 tracking-wider block">
                  SALDO A LIQUIDAR
                </span>
                <span className="text-2xl sm:text-3xl font-black text-zinc-950 tracking-tight">
                  {formatCurrency(finalSettlementAmount, currency)}
                </span>
              </div>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenSettleModal(pairwise.group_id || groupId, pairwise.debtor.id, pairwise.creditor.id, finalSettlementAmount);
                }}
                className="bg-[#581c87] hover:bg-[#4a1470] active:scale-95 text-white font-extrabold px-6 py-2.5 rounded-xl text-sm transition-all shadow-md cursor-pointer shrink-0"
              >
                Saldar
              </button>
            </div>
          </div>
        </div>

        {/* SUB-HEADER TOOLBAR (Ocultar detalles / Expande cada gasto) */}
        <div className="px-4 sm:px-6 py-2 bg-zinc-100/70 border-b border-zinc-200/70 flex items-center justify-between text-xs text-zinc-500 shrink-0">
          <button
            type="button"
            onClick={toggleAllSections}
            className="flex items-center space-x-1.5 font-bold text-zinc-700 hover:text-zinc-900 transition-colors cursor-pointer"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>{allSectionsExpanded ? 'Ocultar detalles' : 'Mostrar todos los detalles'}</span>
            {allSectionsExpanded ? (
              <ChevronUp className="w-3.5 h-3.5 ml-0.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 ml-0.5" />
            )}
          </button>

          <div className="flex items-center space-x-1 text-zinc-500 text-[11px] font-medium hidden sm:flex">
            <span>Expande cada gasto para ver sus artículos</span>
            <Info className="w-3.5 h-3.5 text-zinc-400" />
          </div>
        </div>

        {/* SCROLLABLE MODAL CONTENT */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-5 lg:p-6 space-y-4">
          {/* 1. SECCIÓN: GASTOS QUE GENERAN LA DEUDA */}
          <div className="bg-white rounded-2xl border border-zinc-200/90 shadow-2xs overflow-hidden">
            {/* Section Header */}
            <div
              onClick={() =>
                setExpandedSections((prev) => ({ ...prev, debts: !prev.debts }))
              }
              className="p-4 sm:p-4.5 flex items-center justify-between gap-3 cursor-pointer hover:bg-zinc-50/70 transition-colors select-none"
            >
              <div className="flex items-center space-x-3 min-w-0">
                <div className="w-9 h-9 rounded-full bg-purple-50 border border-purple-100 text-purple-700 flex items-center justify-center shrink-0">
                  <User className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm sm:text-base font-extrabold text-zinc-900 tracking-tight">
                    {isDebtor
                      ? 'Gastos que generan tu deuda'
                      : `Gastos que generan la deuda de ${debtorName}`}
                  </h3>
                  <p className="text-xs text-zinc-500 font-medium">
                    Pagados por {creditorName}
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-3 shrink-0">
                <div className="text-right">
                  <span className="text-[10px] font-bold text-zinc-400 block uppercase tracking-wider">
                    {isDebtor ? `Total que debes a ${creditorName}` : `Total adeudado a ${creditorName}`}
                  </span>
                  <span className="text-sm sm:text-base font-black text-[#581c87]">
                    + {formatCurrency(totalDebtsFromCreditor, currency)}
                  </span>
                </div>
                <div className="w-7 h-7 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-500">
                  {expandedSections.debts ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </div>
              </div>
            </div>

            {/* Section Content */}
            {expandedSections.debts && (
              <div className="border-t border-zinc-200/80 bg-zinc-50/40 divide-y divide-zinc-200/60">
                {detail.pendingExpenses.length === 0 ? (
                  <div className="p-6 text-center text-zinc-500 text-xs">
                    No hay gastos directos pendientes pagados por {creditorName}.
                  </div>
                ) : (
                  <>
                    {/* Header Columns */}
                    <div className="hidden lg:grid grid-cols-12 gap-3 px-4 py-2 text-[11px] font-bold text-zinc-400 uppercase tracking-wider bg-zinc-100/60">
                      <div className="col-span-2">Fecha</div>
                      <div className="col-span-3">Gasto</div>
                      <div className="col-span-2">Pagó</div>
                      <div className="col-span-2">Participantes</div>
                      <div className="col-span-1 text-right">Total gasto</div>
                      <div className="col-span-1 text-right">Tu parte</div>
                      <div className="col-span-1 text-right">Efecto</div>
                    </div>

                    {/* Expense Rows */}
                    {detail.pendingExpenses.map((item, idx) => {
                      const exp = item.expense;
                      const isExpanded = expandedExpenseIds.has(exp.id);
                      const catConfig = getCategoryConfig(exp.category);
                      const CategoryIcon = catConfig.icon;
                      const dateInfo = formatExpenseDateDisplay(exp.expense_date || exp.created_at);

                      return (
                        <div key={`${exp.id}-${idx}`} className="bg-white">
                          <div
                            onClick={() => toggleExpenseExpand(exp.id)}
                            className="p-3 sm:px-4 sm:py-3 flex flex-col lg:grid lg:grid-cols-12 gap-2 lg:gap-3 items-start lg:items-center cursor-pointer hover:bg-zinc-50 transition-colors select-none"
                          >
                            {/* Fecha */}
                            <div className="lg:col-span-2 flex items-center space-x-2 text-xs font-semibold text-zinc-700">
                              <div className="flex flex-col">
                                <span>{dateInfo.dateStr}</span>
                                {dateInfo.timeStr && (
                                  <span className="text-[10px] text-zinc-400 font-normal">
                                    {dateInfo.timeStr}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Gasto Description + Category Badge */}
                            <div className="lg:col-span-3 flex items-center space-x-2 min-w-0">
                              <div
                                className={`w-6 h-6 rounded-md ${catConfig.bgClass} ${catConfig.textClass} flex items-center justify-center shrink-0 shadow-2xs`}
                              >
                                <CategoryIcon className="w-3.5 h-3.5" />
                              </div>
                              <span className="text-xs sm:text-sm font-bold text-zinc-900 truncate">
                                {exp.description}
                              </span>
                            </div>

                            {/* Pagó */}
                            <div className="lg:col-span-2 flex items-center space-x-1.5 text-xs text-zinc-700">
                              <div className="w-5 h-5 rounded-full bg-slate-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0">
                                {getInitials(item.payerProfile?.full_name || creditorName)}
                              </div>
                              <span className="truncate font-medium">
                                {item.payerProfile?.full_name || creditorName}
                              </span>
                            </div>

                            {/* Participantes */}
                            <div className="lg:col-span-2 flex items-center -space-x-1 text-xs">
                              {(exp.splits || []).slice(0, 3).map((split, sIdx) => {
                                const pProf = profiles.find((p) => p.id === split.user_id);
                                return (
                                  <div
                                    key={sIdx}
                                    title={pProf?.full_name || 'Participante'}
                                    className="w-5 h-5 rounded-full bg-zinc-800 text-white flex items-center justify-center text-[9px] font-bold ring-1 ring-white shrink-0"
                                  >
                                    {getInitials(pProf?.full_name)}
                                  </div>
                                );
                              })}
                              {(exp.splits?.length || 0) > 3 && (
                                <span className="text-[10px] font-bold text-zinc-500 pl-2">
                                  +{(exp.splits?.length || 0) - 3}
                                </span>
                              )}
                            </div>

                            {/* Total del gasto */}
                            <div className="lg:col-span-1 text-right text-xs font-semibold text-zinc-700">
                              <span className="lg:hidden text-zinc-400 font-normal mr-1">Total:</span>
                              {formatCurrency(exp.total_amount, currency)}
                            </div>

                            {/* Tu parte */}
                            <div className="lg:col-span-1 text-right text-xs font-semibold text-zinc-900">
                              <span className="lg:hidden text-zinc-400 font-normal mr-1">Tu parte:</span>
                              {formatCurrency(item.originalAmount, currency)}
                            </div>

                            {/* Efecto + Chevron */}
                            <div className="lg:col-span-1 flex items-center justify-end space-x-1.5 text-right w-full lg:w-auto">
                              <span className="text-xs sm:text-sm font-black text-[#581c87]">
                                + {formatCurrency(item.originalAmount, currency)}
                              </span>
                              <div className="text-zinc-400">
                                {isExpanded ? (
                                  <ChevronUp className="w-3.5 h-3.5" />
                                ) : (
                                  <ChevronDown className="w-3.5 h-3.5" />
                                )}
                              </div>
                            </div>
                          </div>

                          {/* EXPANDED RICH DETAILS */}
                          {isExpanded && (
                            <div className="bg-zinc-50/80 p-3 sm:p-4 border-t border-zinc-100 space-y-3">
                              <RenderExpenseSubDetails
                                expense={exp}
                                profiles={profiles}
                                currency={currency}
                                currentProfile={currentProfile}
                                onSelectReceipt={(url) => setSelectedReceiptUrl(url)}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Section Footer */}
                    <div className="p-3 sm:px-4 bg-white flex items-center justify-between text-xs font-bold border-t border-zinc-200/80">
                      <span className="text-zinc-500">
                        {pendingExpensesCount === 1 ? '1 gasto' : `${pendingExpensesCount} gastos`}
                      </span>
                      <div className="flex items-center space-x-2">
                        <span className="text-zinc-700">Total que debes a {creditorName}:</span>
                        <span className="text-sm font-black text-[#581c87]">
                          + {formatCurrency(totalDebtsFromCreditor, currency)}
                        </span>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* 2. SECCIÓN: GASTOS QUE TE PERMITEN RECUPERAR */}
          <div className="bg-white rounded-2xl border border-zinc-200/90 shadow-2xs overflow-hidden">
            {/* Section Header */}
            <div
              onClick={() =>
                setExpandedSections((prev) => ({ ...prev, recovers: !prev.recovers }))
              }
              className="p-4 sm:p-4.5 flex items-center justify-between gap-3 cursor-pointer hover:bg-zinc-50/70 transition-colors select-none"
            >
              <div className="flex items-center space-x-3 min-w-0">
                <div className="w-9 h-9 rounded-full bg-emerald-50 border border-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                  <Wallet className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm sm:text-base font-extrabold text-zinc-900 tracking-tight">
                    {isDebtor
                      ? 'Gastos que te permiten recuperar'
                      : `Gastos compensados por ${debtorName}`}
                  </h3>
                  <p className="text-xs text-zinc-500 font-medium">
                    Pagados por {debtorName}
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-3 shrink-0">
                <div className="text-right">
                  <span className="text-[10px] font-bold text-zinc-400 block uppercase tracking-wider">
                    Total que recuperas
                  </span>
                  <span className="text-sm sm:text-base font-black text-emerald-600">
                    - {formatCurrency(totalRecoversFromDebtor + totalDirectPayments, currency)}
                  </span>
                </div>
                <div className="w-7 h-7 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-500">
                  {expandedSections.recovers ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </div>
              </div>
            </div>

            {/* Section Content */}
            {expandedSections.recovers && (
              <div className="border-t border-zinc-200/80 bg-zinc-50/40 divide-y divide-zinc-200/60">
                {detail.reverseOffsetExpenses.length === 0 && detail.appliedPayments.length === 0 ? (
                  <div className="p-6 text-center text-zinc-500 text-xs">
                    No hay gastos pagados por {debtorName} donde participe {creditorName}.
                  </div>
                ) : (
                  <>
                    {/* Header Columns */}
                    <div className="hidden lg:grid grid-cols-12 gap-3 px-4 py-2 text-[11px] font-bold text-zinc-400 uppercase tracking-wider bg-zinc-100/60">
                      <div className="col-span-2">Fecha</div>
                      <div className="col-span-3">Gasto / Movimiento</div>
                      <div className="col-span-2">Debe</div>
                      <div className="col-span-2">Total gasto</div>
                      <div className="col-span-2 text-right">Tu parte pendiente</div>
                      <div className="col-span-1 text-right">Efecto</div>
                    </div>

                    {/* Reverse Expense Rows */}
                    {detail.reverseOffsetExpenses.map((item, idx) => {
                      const exp = item.expense;
                      const isExpanded = expandedExpenseIds.has(exp.id);
                      const catConfig = getCategoryConfig(exp.category);
                      const CategoryIcon = catConfig.icon;
                      const dateInfo = formatExpenseDateDisplay(exp.expense_date || exp.created_at);

                      return (
                        <div key={`rev-${exp.id}-${idx}`} className="bg-white">
                          <div
                            onClick={() => toggleExpenseExpand(exp.id)}
                            className="p-3 sm:px-4 sm:py-3 flex flex-col lg:grid lg:grid-cols-12 gap-2 lg:gap-3 items-start lg:items-center cursor-pointer hover:bg-zinc-50 transition-colors select-none"
                          >
                            {/* Fecha */}
                            <div className="lg:col-span-2 flex items-center space-x-2 text-xs font-semibold text-zinc-700">
                              <div className="flex flex-col">
                                <span>{dateInfo.dateStr}</span>
                                {dateInfo.timeStr && (
                                  <span className="text-[10px] text-zinc-400 font-normal">
                                    {dateInfo.timeStr}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Gasto Description */}
                            <div className="lg:col-span-3 flex items-center space-x-2 min-w-0">
                              <div
                                className={`w-6 h-6 rounded-md ${catConfig.bgClass} ${catConfig.textClass} flex items-center justify-center shrink-0 shadow-2xs`}
                              >
                                <CategoryIcon className="w-3.5 h-3.5" />
                              </div>
                              <span className="text-xs sm:text-sm font-bold text-zinc-900 truncate">
                                {exp.description}
                              </span>
                            </div>

                            {/* Debe (Creditor) */}
                            <div className="lg:col-span-2 flex items-center space-x-1.5 text-xs text-zinc-700">
                              <div className="w-5 h-5 rounded-full bg-slate-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0">
                                {getInitials(creditorName)}
                              </div>
                              <span className="truncate font-medium">{creditorName}</span>
                            </div>

                            {/* Total del gasto */}
                            <div className="lg:col-span-2 text-xs font-semibold text-zinc-700">
                              <span className="lg:hidden text-zinc-400 font-normal mr-1">Total:</span>
                              {formatCurrency(exp.total_amount, currency)}
                            </div>

                            {/* Tu parte pendiente */}
                            <div className="lg:col-span-2 text-right text-xs font-semibold text-zinc-900">
                              <span className="lg:hidden text-zinc-400 font-normal mr-1">Recuperas:</span>
                              {formatCurrency(item.amount, currency)}
                            </div>

                            {/* Efecto */}
                            <div className="lg:col-span-1 flex items-center justify-end space-x-1.5 text-right w-full lg:w-auto">
                              <span className="text-xs sm:text-sm font-black text-emerald-600">
                                - {formatCurrency(item.amount, currency)}
                              </span>
                              <div className="text-zinc-400">
                                {isExpanded ? (
                                  <ChevronUp className="w-3.5 h-3.5" />
                                ) : (
                                  <ChevronDown className="w-3.5 h-3.5" />
                                )}
                              </div>
                            </div>
                          </div>

                          {/* EXPANDED DETAILS */}
                          {isExpanded && (
                            <div className="bg-zinc-50/80 p-3 sm:p-4 border-t border-zinc-100 space-y-3">
                              <RenderExpenseSubDetails
                                expense={exp}
                                profiles={profiles}
                                currency={currency}
                                currentProfile={currentProfile}
                                onSelectReceipt={(url) => setSelectedReceiptUrl(url)}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Direct Payments (if any) */}
                    {detail.appliedPayments.map((p, pIdx) => {
                      const dateInfo = formatExpenseDateDisplay(p.payment.payment_date || p.payment.created_at);
                      return (
                        <div key={`pay-${p.payment.id}-${pIdx}`} className="p-3 sm:px-4 sm:py-3 bg-emerald-50/40 flex items-center justify-between text-xs">
                          <div className="flex items-center space-x-3">
                            <span className="font-bold text-zinc-700">{dateInfo.dateStr}</span>
                            <span className="font-semibold text-emerald-900">
                              Pago / Abono directo registrado
                            </span>
                          </div>
                          <span className="font-black text-emerald-700 text-sm">
                            - {formatCurrency(p.amountApplied, currency)}
                          </span>
                        </div>
                      );
                    })}

                    {/* Section Footer */}
                    <div className="p-3 sm:px-4 bg-white flex items-center justify-between text-xs font-bold border-t border-zinc-200/80">
                      <span className="text-zinc-500">
                        {detail.reverseOffsetExpenses.length + detail.appliedPayments.length === 1
                          ? '1 movimiento'
                          : `${detail.reverseOffsetExpenses.length + detail.appliedPayments.length} movimientos`}
                      </span>
                      <div className="flex items-center space-x-2">
                        <span className="text-zinc-700">Total que recuperas:</span>
                        <span className="text-sm font-black text-emerald-600">
                          - {formatCurrency(totalRecoversFromDebtor + totalDirectPayments, currency)}
                        </span>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* 3. SECCIÓN: TRIANGULACIONES (DESCUENTO APLICADO) */}
          {isSimplified && detail.optimizationDetail && detail.optimizationDetail.triangulations.length > 0 && (
            <div className="bg-white rounded-2xl border border-zinc-200/90 shadow-2xs overflow-hidden">
              {/* Section Header */}
              <div
                onClick={() =>
                  setExpandedSections((prev) => ({ ...prev, triangulations: !prev.triangulations }))
                }
                className="p-4 sm:p-4.5 flex items-center justify-between gap-3 cursor-pointer hover:bg-zinc-50/70 transition-colors select-none"
              >
                <div className="flex items-center space-x-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-purple-50 border border-purple-100 text-purple-700 flex items-center justify-center shrink-0">
                    <Network className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm sm:text-base font-extrabold text-zinc-900 tracking-tight">
                      Triangulaciones (descuento aplicado)
                    </h3>
                    <p className="text-xs text-zinc-500 font-medium truncate">
                      Se descuentan importes porque otros integrantes tienen deudas entre sí que compensan parte de lo que debes a {creditorName}.
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-3 shrink-0">
                  <div className="text-right">
                    <span className="text-[10px] font-bold text-zinc-400 block uppercase tracking-wider">
                      Descuento total
                    </span>
                    <span className="text-sm sm:text-base font-black text-emerald-600">
                      - {formatCurrency(triangulationDiscount, currency)}
                    </span>
                  </div>
                  <div className="w-7 h-7 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-500">
                    {expandedSections.triangulations ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </div>
                </div>
              </div>

              {/* Section Content: Cards Grid */}
              {expandedSections.triangulations && (
                <div className="p-4 sm:p-5 border-t border-zinc-200/80 bg-zinc-50/40 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {detail.optimizationDetail.triangulations.map((t, tIdx) => {
                      const isUnfolded = expandedTriangulationIndexes.has(tIdx);
                      const tpName = t.thirdParty.full_name || 'Tercero';

                      return (
                        <div
                          key={`triang-${tIdx}`}
                          className="bg-white rounded-2xl border border-zinc-200/90 p-4 sm:p-5 space-y-4 shadow-2xs"
                        >
                          {/* Triangulation Card Header */}
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center space-x-2.5">
                              {t.thirdParty.avatar_url ? (
                                <Image
                                  src={t.thirdParty.avatar_url}
                                  alt={tpName}
                                  width={36}
                                  height={36}
                                  className="w-9 h-9 rounded-full object-cover ring-1 ring-zinc-200 shrink-0"
                                  unoptimized
                                  referrerPolicy="no-referrer"
                                />
                              ) : (
                                <div className="w-9 h-9 rounded-full bg-rose-100 text-rose-800 border border-rose-200 flex items-center justify-center text-xs font-bold shrink-0">
                                  {getInitials(tpName)}
                                </div>
                              )}

                              <div>
                                <div className="flex items-center space-x-2">
                                  <span className="font-extrabold text-zinc-900 text-sm">
                                    {tpName}
                                  </span>
                                  <span className="bg-sky-100 text-sky-800 text-[10px] font-bold px-2 py-0.5 rounded-full border border-sky-200/70">
                                    Compensación aplicada
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div className="text-right">
                              <span className="text-sm sm:text-base font-black text-emerald-600 block">
                                - {formatCurrency(t.amount, currency)}
                              </span>
                              <span className="text-[10px] font-semibold text-zinc-400">
                                {t.expenses.length === 1
                                  ? '1 gasto vinculado'
                                  : `${t.expenses.length} gastos vinculados`}
                              </span>
                            </div>
                          </div>

                          {/* Visual Flow Diagram */}
                          <div className="bg-zinc-50 rounded-xl p-3 border border-zinc-100">
                            <div className="flex items-center justify-between gap-1 text-center">
                              {/* Node 1: Debtor */}
                              <div className="flex flex-col items-center min-w-0 flex-1">
                                <div className="w-8 h-8 rounded-full bg-[#581c87] text-white text-[10px] font-bold flex items-center justify-center shadow-xs">
                                  {getInitials(debtorName)}
                                </div>
                                <span className="text-[10px] font-bold text-zinc-800 mt-1 truncate max-w-[70px]">
                                  {debtorName}
                                </span>
                              </div>

                              {/* Arrow 1 */}
                              <div className="flex flex-col items-center flex-1 px-1">
                                <span className="text-[9px] font-black text-zinc-600 whitespace-nowrap mb-0.5">
                                  {formatCurrency(t.amount, currency)}
                                </span>
                                <div className="w-full flex items-center">
                                  <div className="h-0.5 bg-[#581c87]/60 flex-1" />
                                  <ArrowRight className="w-3 h-3 text-[#581c87] -ml-1 shrink-0" />
                                </div>
                              </div>

                              {/* Node 2: Third Party */}
                              <div className="flex flex-col items-center min-w-0 flex-1">
                                <div className="w-8 h-8 rounded-full bg-sky-600 text-white text-[10px] font-bold flex items-center justify-center shadow-xs">
                                  {getInitials(tpName)}
                                </div>
                                <span className="text-[10px] font-bold text-zinc-800 mt-1 truncate max-w-[70px]">
                                  {tpName}
                                </span>
                              </div>

                              {/* Arrow 2 */}
                              <div className="flex flex-col items-center flex-1 px-1">
                                <span className="text-[9px] font-black text-zinc-600 whitespace-nowrap mb-0.5">
                                  {formatCurrency(t.amount, currency)}
                                </span>
                                <div className="w-full flex items-center">
                                  <div className="h-0.5 bg-indigo-500/60 flex-1" />
                                  <ArrowRight className="w-3 h-3 text-indigo-500 -ml-1 shrink-0" />
                                </div>
                              </div>

                              {/* Node 3: Creditor */}
                              <div className="flex flex-col items-center min-w-0 flex-1">
                                <div className="w-8 h-8 rounded-full bg-slate-700 text-white text-[10px] font-bold flex items-center justify-center shadow-xs">
                                  {getInitials(creditorName)}
                                </div>
                                <span className="text-[10px] font-bold text-zinc-800 mt-1 truncate max-w-[70px]">
                                  {creditorName}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Button to expand underlying expenses */}
                          <button
                            type="button"
                            onClick={() => toggleTriangulationExpand(tIdx)}
                            className="w-full py-2 px-3 rounded-xl bg-purple-50 hover:bg-purple-100 text-[#581c87] text-xs font-bold transition-all flex items-center justify-center space-x-1.5 cursor-pointer border border-purple-200/60"
                          >
                            <span>
                              {isUnfolded
                                ? 'Ocultar gastos de esta compensación'
                                : `Ver ${t.expenses.length} gastos que componen esta compensación`}
                            </span>
                            <ChevronDown
                              className={`w-3.5 h-3.5 transition-transform ${
                                isUnfolded ? 'rotate-180' : ''
                              }`}
                            />
                          </button>

                          {/* Unfolded Underlying Expenses */}
                          {isUnfolded && (
                            <div className="pt-2 border-t border-zinc-100 space-y-2">
                              {t.expenses.map((tExp, teIdx) => {
                                const catConfig = getCategoryConfig(tExp.expense.category);
                                const CategoryIcon = catConfig.icon;
                                const isExpExpanded = expandedExpenseIds.has(tExp.expense.id);

                                return (
                                  <div
                                    key={`texp-${teIdx}`}
                                    className="bg-zinc-50 rounded-xl border border-zinc-200/70 p-2.5 space-y-2"
                                  >
                                    <div
                                      onClick={() => toggleExpenseExpand(tExp.expense.id)}
                                      className="flex items-center justify-between cursor-pointer"
                                    >
                                      <div className="flex items-center space-x-2 min-w-0">
                                        <div
                                          className={`w-6 h-6 rounded-md ${catConfig.bgClass} ${catConfig.textClass} flex items-center justify-center shrink-0`}
                                        >
                                          <CategoryIcon className="w-3.5 h-3.5" />
                                        </div>
                                        <div className="min-w-0">
                                          <span className="text-xs font-bold text-zinc-900 truncate block">
                                            {tExp.description}
                                          </span>
                                          <span className="text-[10px] text-zinc-500 font-medium">
                                            Pagó: {tExp.payerName}
                                          </span>
                                        </div>
                                      </div>

                                      <div className="text-right shrink-0">
                                        <span className="text-xs font-black text-emerald-700 block">
                                          - {formatCurrency(tExp.allocatedDiscountAmount, currency)}
                                        </span>
                                        <span className="text-[10px] text-zinc-400">
                                          Total: {formatCurrency(tExp.totalExpenseAmount, currency)}
                                        </span>
                                      </div>
                                    </div>

                                    {isExpExpanded && (
                                      <div className="pt-2 border-t border-zinc-200/60">
                                        <RenderExpenseSubDetails
                                          expense={tExp.expense}
                                          profiles={profiles}
                                          currency={currency}
                                          currentProfile={currentProfile}
                                          onSelectReceipt={(url) => setSelectedReceiptUrl(url)}
                                        />
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Triangulation Footer */}
                  <div className="pt-2 flex items-center justify-between text-xs font-bold text-zinc-700">
                    <span>Total descontado por triangulaciones</span>
                    <span className="text-sm font-black text-emerald-600">
                      - {formatCurrency(triangulationDiscount, currency)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 4. SECCIÓN: CÁLCULO DEL SALDO A LIQUIDAR */}
          <div className="bg-white rounded-2xl border border-purple-200/90 shadow-2xs overflow-hidden">
            {/* Header */}
            <div className="p-4 sm:p-4.5 bg-gradient-to-r from-purple-50/50 via-white to-white flex items-center justify-between border-b border-purple-100">
              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 rounded-full bg-purple-100 text-[#581c87] flex items-center justify-center shrink-0">
                  <Calculator className="w-4.5 h-4.5" />
                </div>
                <h3 className="text-sm sm:text-base font-extrabold text-zinc-900 tracking-tight">
                  Cálculo del saldo a liquidar
                </h3>
              </div>

              <span className="bg-purple-100/80 text-purple-900 text-[11px] font-bold px-2.5 py-0.5 rounded-full border border-purple-200">
                {isSimplified ? 'Modo simplificado' : 'Modo directo'}
              </span>
            </div>

            {/* Calculations Box */}
            <div className="p-4 sm:p-6 space-y-3">
              <div className="space-y-2.5 text-xs sm:text-sm">
                {/* Deuda generada */}
                <div className="flex items-center justify-between text-zinc-700">
                  <div className="flex items-center space-x-2">
                    <User className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                    <span>Deuda generada por gastos de {creditorName}</span>
                  </div>
                  <span className="font-black text-[#581c87]">
                    + {formatCurrency(totalDebtsFromCreditor, currency)}
                  </span>
                </div>

                {/* Lo que recuperas */}
                <div className="flex items-center justify-between text-zinc-700">
                  <div className="flex items-center space-x-2">
                    <Wallet className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>Lo que recuperas por gastos tuyos</span>
                  </div>
                  <span className="font-black text-emerald-600">
                    - {formatCurrency(totalRecoversFromDebtor + totalDirectPayments, currency)}
                  </span>
                </div>

                {/* Descuento triangulaciones */}
                {isSimplified && triangulationDiscount > 0.009 && (
                  <div className="flex items-center justify-between text-zinc-700">
                    <div className="flex items-center space-x-2">
                      <Network className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                      <span>Descuento por triangulaciones</span>
                    </div>
                    <span className="font-black text-emerald-600">
                      - {formatCurrency(triangulationDiscount, currency)}
                    </span>
                  </div>
                )}
              </div>

              {/* Total Final Line */}
              <div className="pt-3 border-t border-purple-200/80 flex items-center justify-between">
                <span className="text-sm sm:text-base font-black text-[#581c87]">
                  Saldo a liquidar
                </span>
                <span className="text-xl sm:text-2xl font-black text-[#581c87] tracking-tight">
                  {formatCurrency(finalSettlementAmount, currency)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Proof/Receipt Modal (nested for image viewing) */}
        {selectedReceiptUrl && (
          <div
            className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xs animate-in fade-in duration-200"
            onClick={() => setSelectedReceiptUrl(null)}
          >
            <div
              className="relative max-w-3xl max-h-[90vh] w-full bg-zinc-950 rounded-2xl overflow-hidden shadow-2xl border border-zinc-800 flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-3 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between">
                <span className="text-xs font-bold text-zinc-300">Comprobante de gasto</span>
                <button
                  type="button"
                  onClick={() => setSelectedReceiptUrl(null)}
                  className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="relative w-full h-[70vh] bg-zinc-900">
                <Image
                  src={selectedReceiptUrl}
                  alt="Comprobante"
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
    </div>
  );
}

/**
 * Reusable helper component to render items breakdown, participant summary, notes, and receipt
 */
function RenderExpenseSubDetails({
  expense,
  profiles,
  currency,
  currentProfile,
  onSelectReceipt,
}: {
  expense: Expense;
  profiles: Profile[];
  currency: string;
  currentProfile: Profile | null;
  onSelectReceipt: (url: string) => void;
}) {
  const hasItems = Boolean(expense.items && expense.items.length > 0);
  const hasNotes = Boolean(expense.notes && expense.notes.trim().length > 0);
  const hasReceipt = Boolean(expense.receipt_url);

  const participantSummaryList: ParticipantSummaryData[] = (expense.splits || []).map((split) => {
    const profile = profiles.find((p) => p.id === split.user_id);
    const userAmt = split.amount_owed;
    const breakdown: ParticipantItemBreakdown[] = [];

    if (expense.items && expense.items.length > 0 && expense.total_amount > 0) {
      expense.items.forEach((item) => {
        const match = item.description.match(/^(\d+(?:\.\d+)?)\s*(?:·|x)\s*(.*)$/);
        const totalQty = match ? parseFloat(match[1]) || 1 : 1;
        const cleanDesc = match ? match[2].trim() : item.description;
        const ratio = expense.total_amount > 0 ? userAmt / expense.total_amount : 0;
        const userItemQty = totalQty * ratio;
        const userItemCost = item.amount * ratio;

        breakdown.push({
          desc: cleanDesc,
          qty: userItemQty,
          cost: userItemCost,
        });
      });
    }

    return {
      userId: split.user_id,
      profile,
      amount: userAmt,
      breakdown: breakdown.length > 0 ? breakdown : undefined,
    };
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start text-xs">
      {/* Participation list */}
      <ExpenseParticipantSummary
        participants={participantSummaryList}
        currency={currency}
        currentUserId={currentProfile?.id}
        title="Resumen por participante"
        defaultExpanded={false}
      />

      {/* Items, Notes and Receipt (right col) */}
      <div className="space-y-2.5">
        {hasItems && (
          <div className="bg-white rounded-xl border border-zinc-200/90 shadow-2xs overflow-hidden">
            <div className="px-3 py-2 bg-zinc-50 border-b border-zinc-200/70 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <ShoppingBag className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
                  Desglose de artículos ({expense.items?.length || 0})
                </span>
              </div>
            </div>
            <div className="divide-y divide-zinc-100 max-h-48 overflow-y-auto">
              {expense.items?.map((item, idx) => (
                <div
                  key={item.id || idx}
                  className="flex items-center justify-between text-xs py-2 px-3 hover:bg-zinc-50/40 transition-colors"
                >
                  <div className="flex items-center space-x-2 min-w-0 pr-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-600 shrink-0" />
                    <span className="font-medium text-zinc-800 truncate">{item.description}</span>
                  </div>
                  <span className="text-zinc-900 font-bold shrink-0 text-xs">
                    {formatCurrency(item.amount, currency)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {hasReceipt && (
          <div className="bg-white rounded-xl border border-zinc-200/90 shadow-2xs overflow-hidden">
            <div className="px-3 py-2 bg-zinc-50 border-b border-zinc-200/70 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <ImageIcon className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
                  Comprobante
                </span>
              </div>
            </div>
            <div className="p-3">
              <div
                onClick={() => onSelectReceipt(expense.receipt_url!)}
                className="group/img relative w-20 h-20 rounded-xl overflow-hidden border border-zinc-200 cursor-pointer bg-zinc-100 hover:border-purple-500 transition-all shadow-2xs"
              >
                <Image
                  src={expense.receipt_url!}
                  alt="Comprobante"
                  fill
                  className="object-cover group-hover/img:scale-105 transition-transform"
                  unoptimized
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center text-white text-[10px] font-semibold gap-1">
                  <ExternalLink className="w-3 h-3" />
                  <span>Ver</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {hasNotes && (
          <div className="bg-white rounded-xl border border-zinc-200/90 shadow-2xs overflow-hidden">
            <div className="px-3 py-2 bg-zinc-50 border-b border-zinc-200/70 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
                  Notas
                </span>
              </div>
            </div>
            <div className="p-3">
              <p className="text-xs text-zinc-700 whitespace-pre-wrap leading-relaxed">
                {expense.notes}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
