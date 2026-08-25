'use client';

import React, { useState, useMemo } from 'react';
import Image from 'next/image';
import { Expense, Payment, Profile, Group, PairwiseBalance } from '@/lib/types';
import {
  formatCurrency,
  calculatePairwiseDebtDetail,
} from '@/lib/balance-utils';
import { GenericExpenseList } from '@/components/GenericExpenseList';
import { getCategoryConfig } from '@/lib/expense-category-utils';
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
  Sparkles,
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
  onEditExpense?: (expense: Expense) => void;
  onDeleteExpense?: (expenseId: string) => void;
  onDeletePayment?: (paymentId: string) => void;
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
  onEditPayment,
  onEditExpense,
  onDeleteExpense,
  onDeletePayment,
}: PairwiseDetailModalProps) {
  // Collapsed by default as requested: "haz que por defecto aparezca todo colapsado"
  const [expandedSections, setExpandedSections] = useState({
    debts: false,
    recovers: false,
    triangulations: false,
    calculation: false,
  });

  const [expandedTriangulationIndexes, setExpandedTriangulationIndexes] = useState<Set<number>>(new Set());

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

  // Debtor profile to evaluate perspective for GenericExpenseList
  const debtorProfile: Profile =
    profiles.find((p) => p.id === pairwise.debtor.id) || {
      id: pairwise.debtor.id,
      full_name: debtorName,
      email: pairwise.debtor.email || '',
      avatar_url: pairwise.debtor.avatar_url || '',
      currency: currency,
      created_at: new Date().toISOString(),
    };

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

  const toggleTriangulationExpand = (idx: number) => {
    setExpandedTriangulationIndexes((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  // Calculations for summary & calculations section
  const totalDebtsFromCreditor = detail.pendingExpenses.reduce((acc, d) => acc + d.originalAmount, 0);
  const totalRecoversFromDebtor = detail.reverseOffsetExpenses.reduce((acc, r) => acc + r.amount, 0);
  const totalDirectPayments = detail.appliedPayments.reduce((acc, p) => acc + p.amountApplied, 0);
  const triangulationDiscount = detail.optimizationDetail?.totalCompensated || 0;
  const finalSettlementAmount = pairwise.amount;

  const pendingExpensesCount = detail.pendingExpenses.length;
  const recoversCount = detail.reverseOffsetExpenses.length + detail.appliedPayments.length;

  // Expenses paid by creditor that debtor owes
  const debtExpensesList: Expense[] = detail.pendingExpenses.map((pe) => pe.expense);

  // Expenses and Payments from debtor to creditor that reduce debt
  const recoverExpensesList: Expense[] = detail.reverseOffsetExpenses.map((ro) => ro.expense);
  const appliedPaymentsList: Payment[] = detail.appliedPayments.map((ap) => ap.payment);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 lg:p-6 overflow-y-auto animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-5xl max-h-[94vh] bg-zinc-50 rounded-3xl shadow-2xl border border-zinc-200/90 flex flex-col overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* TOP MODAL HEADER (Oriented to debtor) */}
        <div className="bg-white px-4 sm:px-6 py-4 border-b border-zinc-200/80 shrink-0">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            {/* Left Header info: Saludo y orientación al deudor */}
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

              {/* Title & Perspective oriented to debtor */}
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

            {/* Right: Saldo a liquidar & Saldar button */}
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
                  onOpenSettleModal(
                    pairwise.group_id || groupId,
                    pairwise.debtor.id,
                    pairwise.creditor.id,
                    finalSettlementAmount
                  );
                }}
                className="bg-[#581c87] hover:bg-[#4a1470] active:scale-95 text-white font-extrabold px-6 py-2.5 rounded-xl text-sm transition-all shadow-md cursor-pointer shrink-0"
              >
                Saldar
              </button>
            </div>
          </div>

          {/* Perspective Greeting Banner for the debtor */}
          <div className="mt-3.5 pt-3 border-t border-zinc-100 flex items-center justify-between bg-purple-50/60 rounded-xl px-3.5 py-2 text-xs text-purple-950">
            <div className="flex items-center space-x-2">
              <Sparkles className="w-4 h-4 text-[#581c87] shrink-0" />
              <span>
                Desglose desde la perspectiva de <strong className="font-bold text-[#581c87]">{debtorName}</strong> ({debtorName} debe / recupera frente a {creditorName})
              </span>
            </div>
            <span className="text-[11px] font-semibold text-purple-700 hidden sm:inline">
              Movimientos sincronizados
            </span>
          </div>
        </div>

        {/* SUB-HEADER TOOLBAR (Expandir / Colapsar todo) */}
        <div className="px-4 sm:px-6 py-2 bg-zinc-100/70 border-b border-zinc-200/70 flex items-center justify-between text-xs text-zinc-500 shrink-0">
          <button
            type="button"
            onClick={toggleAllSections}
            className="flex items-center space-x-1.5 font-bold text-zinc-700 hover:text-zinc-900 transition-colors cursor-pointer"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>{allSectionsExpanded ? 'Colapsar todas las secciones' : 'Expandir todas las secciones'}</span>
            {allSectionsExpanded ? (
              <ChevronUp className="w-3.5 h-3.5 ml-0.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 ml-0.5" />
            )}
          </button>

          <div className="flex items-center space-x-1 text-zinc-500 text-[11px] font-medium hidden sm:flex">
            <span>Haz clic en cada sección o gasto para ver su detalle</span>
            <Info className="w-3.5 h-3.5 text-zinc-400" />
          </div>
        </div>

        {/* SCROLLABLE MODAL CONTENT */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-5 lg:p-6 space-y-4">
          {/* 1. SECCIÓN: GASTOS QUE GENERAN LA DEUDA (Componente GenericExpenseList reutilizado) */}
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
                    Gastos que generan la deuda de {debtorName}
                  </h3>
                  <p className="text-xs text-zinc-500 font-medium">
                    Pagados por {creditorName} donde participa {debtorName}
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-3 shrink-0">
                <div className="text-right">
                  <span className="text-[10px] font-bold text-zinc-400 block uppercase tracking-wider">
                    Total que debe {debtorName}
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

            {/* Section Content with REUSED GenericExpenseList */}
            {expandedSections.debts && (
              <div className="border-t border-zinc-200/80 bg-zinc-50/40 p-3 sm:p-4">
                {debtExpensesList.length === 0 ? (
                  <div className="p-6 text-center text-zinc-500 text-xs bg-white rounded-xl border border-zinc-200">
                    No hay gastos directos pendientes pagados por {creditorName}.
                  </div>
                ) : (
                  <GenericExpenseList
                    expenses={debtExpensesList}
                    payments={[]}
                    profiles={profiles}
                    userGroups={groups}
                    currentProfile={debtorProfile}
                    groupCurrency={currency}
                    showGroupBadge={!groupId}
                    onEditExpense={onEditExpense}
                    onDeleteExpense={onDeleteExpense}
                  />
                )}
              </div>
            )}
          </div>

          {/* 2. SECCIÓN: GASTOS Y ABONOS QUE PERMITEN RECUPERAR (GenericExpenseList reutilizado) */}
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
                    Gastos y abonos que recupera {debtorName}
                  </h3>
                  <p className="text-xs text-zinc-500 font-medium">
                    Pagados por {debtorName} que compensan o reducen la deuda frente a {creditorName}
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-3 shrink-0">
                <div className="text-right">
                  <span className="text-[10px] font-bold text-zinc-400 block uppercase tracking-wider">
                    Total que recupera {debtorName}
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

            {/* Section Content with REUSED GenericExpenseList */}
            {expandedSections.recovers && (
              <div className="border-t border-zinc-200/80 bg-zinc-50/40 p-3 sm:p-4">
                {recoverExpensesList.length === 0 && appliedPaymentsList.length === 0 ? (
                  <div className="p-6 text-center text-zinc-500 text-xs bg-white rounded-xl border border-zinc-200">
                    No hay gastos pagados ni abonos directos registrados por {debtorName} hacia {creditorName}.
                  </div>
                ) : (
                  <GenericExpenseList
                    expenses={recoverExpensesList}
                    payments={appliedPaymentsList}
                    profiles={profiles}
                    userGroups={groups}
                    currentProfile={debtorProfile}
                    groupCurrency={currency}
                    showGroupBadge={!groupId}
                    onEditExpense={onEditExpense}
                    onDeleteExpense={onDeleteExpense}
                    onEditPayment={onEditPayment}
                    onDeletePayment={onDeletePayment}
                  />
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
                              <GenericExpenseList
                                expenses={t.expenses.map((te) => te.expense)}
                                payments={[]}
                                profiles={profiles}
                                userGroups={groups}
                                currentProfile={debtorProfile}
                                groupCurrency={currency}
                                showGroupBadge={!groupId}
                              />
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
            <div
              onClick={() =>
                setExpandedSections((prev) => ({ ...prev, calculation: !prev.calculation }))
              }
              className="p-4 sm:p-4.5 bg-gradient-to-r from-purple-50/50 via-white to-white flex items-center justify-between border-b border-purple-100 cursor-pointer hover:bg-purple-50/80 transition-colors select-none"
            >
              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 rounded-full bg-purple-100 text-[#581c87] flex items-center justify-center shrink-0">
                  <Calculator className="w-4.5 h-4.5" />
                </div>
                <h3 className="text-sm sm:text-base font-extrabold text-zinc-900 tracking-tight">
                  Cálculo del saldo a liquidar
                </h3>
              </div>

              <div className="flex items-center space-x-2.5">
                <span className="bg-purple-100/80 text-purple-900 text-[11px] font-bold px-2.5 py-0.5 rounded-full border border-purple-200">
                  {isSimplified ? 'Modo simplificado' : 'Modo directo'}
                </span>
                <div className="w-7 h-7 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-500">
                  {expandedSections.calculation ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </div>
              </div>
            </div>

            {/* Calculations Box */}
            {expandedSections.calculation && (
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
                      <span>Lo que recupera {debtorName} por gastos y abonos</span>
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
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
