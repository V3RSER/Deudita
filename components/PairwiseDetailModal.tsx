'use client';

import React, { useState, useMemo } from 'react';
import Image from 'next/image';
import { Expense, Payment, Profile, Group, PairwiseBalance } from '@/lib/types';
import {
  formatCurrency,
  calculatePairwiseDebtDetail,
} from '@/lib/balance-utils';
import { GenericExpenseList } from '@/components/GenericExpenseList';
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  User,
  Wallet,
  Network,
  Calculator,
  Info,
  Layers,
  ArrowRight,
  Sparkles,
  Users,
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
  // Collapsed by default
  const [expandedSections, setExpandedSections] = useState({
    debts: false,
    recovers: false,
    distribution: false,
    calculation: false,
  });

  const [expandedTriangulationIndexes, setExpandedTriangulationIndexes] = useState<Set<number>>(new Set());

  // Find creditor and debtor profiles
  const debtorProfile: Profile = useMemo(() => {
    if (!pairwise) {
      return (
        currentProfile || {
          id: '',
          full_name: 'Deudor',
          email: '',
          avatar_url: '',
          currency: 'COP',
          created_at: new Date().toISOString(),
        }
      );
    }
    return (
      profiles.find((p) => p.id === pairwise.debtor.id) || {
        id: pairwise.debtor.id,
        full_name: pairwise.debtor.full_name || 'Deudor',
        email: pairwise.debtor.email || '',
        avatar_url: pairwise.debtor.avatar_url || '',
        currency: 'COP',
        created_at: new Date().toISOString(),
      }
    );
  }, [pairwise, profiles, currentProfile]);

  const creditorProfile: Profile = useMemo(() => {
    if (!pairwise) {
      return {
        id: '',
        full_name: 'Acreedor',
        email: '',
        avatar_url: '',
        currency: 'COP',
        created_at: new Date().toISOString(),
      };
    }
    return (
      profiles.find((p) => p.id === pairwise.creditor.id) || {
        id: pairwise.creditor.id,
        full_name: pairwise.creditor.full_name || 'Acreedor',
        email: pairwise.creditor.email || '',
        avatar_url: pairwise.creditor.avatar_url || '',
        currency: 'COP',
        created_at: new Date().toISOString(),
      }
    );
  }, [pairwise, profiles]);

  // Calculate pairwise debt detail specifically between debtor and creditor
  const detail = useMemo(() => {
    if (!pairwise || !debtorProfile || !creditorProfile) return null;
    return calculatePairwiseDebtDetail(
      debtorProfile,
      creditorProfile,
      expenses,
      payments,
      profiles,
      groups,
      isSimplified,
      groupId || pairwise.group_id
    );
  }, [debtorProfile, creditorProfile, expenses, payments, profiles, groups, isSimplified, groupId, pairwise]);

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

  const debtorName = debtorProfile.full_name || 'Deudor';
  const creditorName = creditorProfile.full_name || 'Acreedor';

  const pendingConsumedExpenses = detail.pendingExpenses.map((d) => d.expense);
  const activeReverseExpenses = detail.reverseOffsetExpenses.map((r) => r.expense);
  const activeDirectPayments = detail.appliedPayments;

  const totalPendingDebt = detail.netPendingAmount;
  const totalReverseOffsets = detail.totalReverseOffsets;
  const totalPaymentsApplied = detail.totalPaymentsApplied;
  const totalActiveRecoverable = detail.totalActiveRecoverable;

  const hasOptimization = isSimplified && detail.optimizationDetail?.isOptimized;

  const allSectionsExpanded =
    expandedSections.debts &&
    expandedSections.recovers &&
    expandedSections.distribution &&
    expandedSections.calculation;

  const toggleAllSections = () => {
    const nextState = !allSectionsExpanded;
    setExpandedSections({
      debts: nextState,
      recovers: nextState,
      distribution: nextState,
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

  const finalSettlementAmount = pairwise.amount;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 lg:p-6 overflow-y-auto animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-5xl max-h-[94vh] bg-zinc-50 rounded-3xl shadow-2xl border border-zinc-200/90 flex flex-col overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* TOP MODAL HEADER */}
        <div className="bg-white px-4 sm:px-6 py-4 border-b border-zinc-200/80 shrink-0">
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
                {debtorProfile.avatar_url ? (
                  <Image
                    src={debtorProfile.avatar_url}
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

                {creditorProfile.avatar_url ? (
                  <Image
                    src={creditorProfile.avatar_url}
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

              {/* Title & Perspective */}
              <div className="min-w-0">
                <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                  <span className="text-xs font-bold text-zinc-600">
                    {isCreditor ? 'A tu favor' : isDebtor ? 'Por pagar' : 'Detalle de deuda'}
                  </span>
                  <span className="bg-purple-100 text-purple-900 text-[11px] font-bold px-2 py-0.5 rounded-full border border-purple-200">
                    {pendingConsumedExpenses.length} consumos directos • {activeReverseExpenses.length + activeDirectPayments.length} aportes directos
                  </span>
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
                    debtorProfile.id,
                    creditorProfile.id,
                    finalSettlementAmount
                  );
                }}
                className="bg-[#581c87] hover:bg-[#4a1470] active:scale-95 text-white font-extrabold px-6 py-2.5 rounded-xl text-sm transition-all shadow-md cursor-pointer shrink-0"
              >
                Saldar
              </button>
            </div>
          </div>

          {/* Perspective Greeting Banner */}
          <div className="mt-3.5 pt-3 border-t border-zinc-100 flex items-center justify-between bg-purple-50/70 rounded-xl px-3.5 py-2.5 text-xs text-purple-950">
            <div className="flex items-center space-x-2">
              <Sparkles className="w-4 h-4 text-[#581c87] shrink-0" />
              <span>
                Mostrando el detalle de la cuenta entre <strong className="font-extrabold text-[#581c87]">{debtorName}</strong> y <strong className="font-extrabold text-zinc-900">{creditorName}</strong> (solo gastos y aportes pendientes de saldar).
              </span>
            </div>
            <span className="text-[11px] font-semibold text-purple-700 hidden sm:inline">
              Cálculo transparente
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
          {/* 1. SECCIÓN: CONSUMOS QUE DEBE (Gastos pagados por Acreedor donde participó Deudor) */}
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
                    Gastos que debe {debtorName} a {creditorName} (Consumos directos)
                  </h3>
                  <p className="text-xs text-zinc-500 font-medium">
                    Gastos pagados por {creditorName} donde participó {debtorName}
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-3 shrink-0">
                <div className="text-right">
                  <span className="text-[10px] font-bold text-zinc-400 block uppercase tracking-wider">
                    Total consumos directos
                  </span>
                  <span className="text-sm sm:text-base font-black text-[#581c87]">
                    + {formatCurrency(totalPendingDebt, currency)}
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
              <div className="border-t border-zinc-200/80 bg-zinc-50/40 p-3 sm:p-4 space-y-3">
                {pendingConsumedExpenses.length === 0 ? (
                  <div className="p-5 text-center text-zinc-500 text-xs bg-white rounded-xl border border-zinc-200">
                    <CheckCircle2 className="w-5 h-5 text-emerald-500 mx-auto mb-1.5" />
                    <p className="font-semibold text-zinc-700">No hay consumos directos pendientes entre {debtorName} y {creditorName}.</p>
                  </div>
                ) : (
                  <GenericExpenseList
                    expenses={pendingConsumedExpenses}
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

          {/* 2. SECCIÓN: GASTOS Y PAGOS QUE RECUPERA (Aportes directos a favor de Deudor con Acreedor) */}
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
                    Gastos y pagos a favor de {debtorName} (Aportes directos)
                  </h3>
                  <p className="text-xs text-zinc-500 font-medium">
                    Gastos pagados por {debtorName} donde participó {creditorName} y pagos directos registrados
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-3 shrink-0">
                <div className="text-right">
                  <span className="text-[10px] font-bold text-zinc-400 block uppercase tracking-wider">
                    Total aportes directos
                  </span>
                  <span className="text-sm sm:text-base font-black text-emerald-600">
                    - {formatCurrency(totalActiveRecoverable, currency)}
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
              <div className="border-t border-zinc-200/80 bg-zinc-50/40 p-3 sm:p-4 space-y-3">
                {activeReverseExpenses.length === 0 && activeDirectPayments.length === 0 ? (
                  <div className="p-5 text-center text-zinc-500 text-xs bg-white rounded-xl border border-zinc-200">
                    <p className="font-semibold text-zinc-700">No hay aportes ni pagos directos pendientes a favor de {debtorName}.</p>
                  </div>
                ) : (
                  <GenericExpenseList
                    expenses={activeReverseExpenses}
                    payments={activeDirectPayments}
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

          {/* 3. SECCIÓN: COMPENSACIONES DEL GRUPO Y SIMPLIFICACIÓN */}
          <div className="bg-white rounded-2xl border border-zinc-200/90 shadow-2xs overflow-hidden">
            {/* Section Header */}
            <div
              onClick={() =>
                setExpandedSections((prev) => ({ ...prev, distribution: !prev.distribution }))
              }
              className="p-4 sm:p-4.5 flex items-center justify-between gap-3 cursor-pointer hover:bg-zinc-50/70 transition-colors select-none"
            >
              <div className="flex items-center space-x-3 min-w-0">
                <div className="w-9 h-9 rounded-full bg-sky-50 border border-sky-100 text-sky-700 flex items-center justify-center shrink-0">
                  <Users className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm sm:text-base font-extrabold text-zinc-900 tracking-tight">
                    {isSimplified ? 'Compensaciones y simplificación de grupo' : 'Cuenta directa 1 a 1'}
                  </h3>
                  <p className="text-xs text-zinc-500 font-medium">
                    {isSimplified
                      ? 'Compensaciones del grupo que optimizan el saldo a liquidar'
                      : 'Liquidación directa 1 a 1 sin intermediarios'}
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-3 shrink-0">
                <div className="text-right">
                  <span className="text-[10px] font-bold text-zinc-400 block uppercase tracking-wider">
                    {hasOptimization
                      ? 'Compensación aplicada'
                      : 'Saldo directo'}
                  </span>
                  <span
                    className={`text-sm sm:text-base font-black ${
                      hasOptimization
                        ? 'text-emerald-600'
                        : 'text-[#581c87]'
                    }`}
                  >
                    {hasOptimization
                      ? `${formatCurrency(detail.simplifiedAmount, currency)}`
                      : formatCurrency(detail.netDirectBalance, currency)}
                  </span>
                </div>
                <div className="w-7 h-7 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-500">
                  {expandedSections.distribution ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </div>
              </div>
            </div>

            {/* Section Content */}
            {expandedSections.distribution && (
              <div className="p-4 sm:p-5 border-t border-zinc-200/80 bg-zinc-50/40 space-y-4">
                {/* Saldo Directo Card */}
                <div className="bg-white rounded-2xl p-4 border border-zinc-200/80 shadow-2xs flex items-center justify-between">
                  <div>
                    <span className="text-xs font-extrabold text-zinc-900 block">Saldo directo 1 a 1</span>
                    <span className="text-[11px] text-zinc-500">Consumos directos menos aportes directos entre ambos</span>
                  </div>
                  <span className="text-sm sm:text-base font-black text-zinc-900">
                    {formatCurrency(detail.netDirectBalance, currency)}
                  </span>
                </div>

                {isSimplified && detail.optimizationDetail ? (
                  <div className="bg-white rounded-2xl border border-purple-200/90 p-4 sm:p-5 space-y-4 shadow-2xs">
                    {/* Visual Flow / Triangulation Diagram */}
                    <div className="bg-gradient-to-br from-purple-50/70 via-white to-sky-50/50 rounded-2xl p-4 border border-purple-100 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <Network className="w-4 h-4 text-purple-700 shrink-0" />
                          <span className="text-xs font-extrabold text-purple-950 uppercase tracking-wider">
                            Esquema de Triangulación y Compensación
                          </span>
                        </div>
                        <span className="text-[11px] font-black bg-purple-100 text-purple-900 px-2.5 py-0.5 rounded-full border border-purple-200">
                          {detail.optimizationDetail.difference > 0 ? 'Compensación multilateral' : 'Ajuste de grupo'}
                        </span>
                      </div>

                      {/* Interactive Visual Graph Nodes */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center pt-1">
                        {/* Debtor Node */}
                        <div className="bg-white rounded-xl p-3 border border-zinc-200 shadow-2xs flex items-center space-x-3">
                          {debtorProfile.avatar_url ? (
                            <Image
                              src={debtorProfile.avatar_url}
                              alt={debtorName}
                              width={32}
                              height={32}
                              className="w-8 h-8 rounded-full object-cover shrink-0"
                              unoptimized
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-[#581c87] text-white flex items-center justify-center text-xs font-bold shrink-0">
                              {getInitials(debtorName)}
                            </div>
                          )}
                          <div className="min-w-0">
                            <span className="text-[10px] font-bold uppercase text-zinc-400 block">Deudor</span>
                            <span className="text-xs font-black text-zinc-900 truncate block">{debtorName}</span>
                          </div>
                        </div>

                        {/* Central Flow / Bridge */}
                        <div className="bg-purple-100/70 border border-purple-200/80 rounded-xl p-2.5 text-center flex flex-col items-center justify-center">
                          <div className="flex items-center space-x-1.5 text-purple-900 font-extrabold text-[11px]">
                            <span>Deuda 1 a 1:</span>
                            <span>{formatCurrency(detail.netDirectBalance, currency)}</span>
                          </div>
                          <div className="flex items-center space-x-1 text-emerald-700 font-black text-xs my-0.5">
                            <ArrowRight className="w-3.5 h-3.5" />
                            <span>{detail.optimizationDetail.difference > 0 ? '-' : '+'}{formatCurrency(detail.optimizationDetail.difference, currency)}</span>
                          </div>
                          <span className="text-[10px] text-purple-700 font-medium">Compensado por grupo</span>
                        </div>

                        {/* Creditor Node */}
                        <div className="bg-white rounded-xl p-3 border border-zinc-200 shadow-2xs flex items-center space-x-3">
                          {creditorProfile.avatar_url ? (
                            <Image
                              src={creditorProfile.avatar_url}
                              alt={creditorName}
                              width={32}
                              height={32}
                              className="w-8 h-8 rounded-full object-cover shrink-0"
                              unoptimized
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-slate-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
                              {getInitials(creditorName)}
                            </div>
                          )}
                          <div className="min-w-0">
                            <span className="text-[10px] font-bold uppercase text-zinc-400 block">Acreedor</span>
                            <span className="text-xs font-black text-zinc-900 truncate block">{creditorName}</span>
                          </div>
                        </div>
                      </div>

                      {/* Explanation box */}
                      <p className="text-xs text-zinc-700 leading-relaxed bg-white/80 rounded-xl p-3 border border-purple-100/80">
                        {detail.optimizationDetail.explanation}
                      </p>
                    </div>
                  </div>
                ) : isSimplified ? (
                  <div className="p-4 text-center text-zinc-500 text-xs bg-white rounded-xl border border-zinc-200">
                    <p className="font-medium text-zinc-600">
                      No se requieren compensaciones adicionales para esta cuenta. El saldo liquidable coincide exactamente con los consumos y aportes directos.
                    </p>
                  </div>
                ) : (
                  <div className="p-4 text-center text-zinc-500 text-xs bg-white rounded-xl border border-zinc-200">
                    <p className="font-medium text-zinc-600">
                      En modo directo, todas las deudas se liquidan exclusivamente entre los dos integrantes involucrados sin triangulaciones.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

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
                  Resumen y cálculo matemático del balance
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
                  {/* Consumos directos */}
                  <div className="flex items-center justify-between text-zinc-700">
                    <div className="flex items-center space-x-2">
                      <User className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                      <span className="font-semibold text-zinc-900">Total consumos directos pendientes de {debtorName} con {creditorName}</span>
                    </div>
                    <span className="font-black text-[#581c87] shrink-0">
                      + {formatCurrency(totalPendingDebt, currency)}
                    </span>
                  </div>

                  {/* Aportes directos */}
                  <div className="flex items-center justify-between text-zinc-700">
                    <div className="flex items-center space-x-2">
                      <Wallet className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span className="font-semibold text-zinc-900">Total aportes y pagos directos aplicados</span>
                    </div>
                    <span className="font-black text-emerald-600 shrink-0">
                      - {formatCurrency(totalActiveRecoverable, currency)}
                    </span>
                  </div>

                  {/* Saldo directo */}
                  <div className="pt-2 border-t border-zinc-100 flex items-center justify-between text-zinc-800 font-bold">
                    <span>Saldo directo 1 a 1 entre ambos</span>
                    <span className="text-zinc-900 font-black">
                      {formatCurrency(detail.netDirectBalance, currency)}
                    </span>
                  </div>

                  {/* Compensación simplificada si aplica */}
                  {hasOptimization && detail.optimizationDetail && (
                    <div className="flex items-center justify-between text-zinc-700">
                      <div className="flex items-center space-x-2">
                        <Network className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                        <span>Compensación por simplificación de grupo</span>
                      </div>
                      <span className="font-black text-emerald-600">
                        {detail.optimizationDetail.difference > 0 ? '- ' : '+ '}
                        {formatCurrency(Math.abs(detail.optimizationDetail.difference), currency)}
                      </span>
                    </div>
                  )}
                </div>

                {/* Total Final Line */}
                <div className="pt-3 border-t border-purple-200/80 flex items-center justify-between">
                  <span className="text-sm sm:text-base font-black text-[#581c87]">
                    Saldo final a liquidar con {creditorName}
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
