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

  const pendingConsumedExpenses = Array.from(
    new Map(detail.pendingExpenses.map((d) => [d.expense.id, d.expense])).values()
  );
  const activeReverseExpenses = Array.from(
    new Map(detail.reverseOffsetExpenses.map((r) => [r.expense.id, r.expense])).values()
  );
  const activeDirectPayments = Array.from(
    new Map(detail.appliedPayments.map((p) => [p.payment.id, p.payment])).values()
  );

  const totalDirectConsumption = detail.pendingExpenses.reduce((sum, d) => sum + d.originalAmount, 0);
  const totalReverseOffsets = detail.reverseOffsetExpenses.reduce((sum, r) => sum + r.amount, 0);
  const totalPaymentsApplied = detail.appliedPayments.reduce((sum, p) => sum + p.amountApplied, 0);
  const totalActiveRecoverable = Math.round((totalReverseOffsets + totalPaymentsApplied) * 100) / 100;

  const triangulations = detail.optimizationDetail?.triangulations || [];
  const hasCompensations = isSimplified && (detail.optimizationDetail?.totalCompensated || 0) > 0.009;

  const allSectionsExpanded =
    expandedSections.debts &&
    expandedSections.recovers &&
    (!hasCompensations || expandedSections.distribution) &&
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

  const finalSettlementAmount =
    isSimplified && detail.optimizationDetail?.totalCompensated
      ? detail.optimizationDetail.simplifiedAmount
      : pairwise.amount;

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
                <div className="w-9 h-9 rounded-full bg-rose-50 border border-rose-100 text-rose-600 flex items-center justify-center shrink-0">
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
                  <span className="text-sm sm:text-base font-black text-rose-600">
                    + {formatCurrency(totalDirectConsumption, currency)}
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
                    pairwisePartnerProfile={creditorProfile}
                    isSimplified={isSimplified}
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
                    pairwisePartnerProfile={creditorProfile}
                    isSimplified={isSimplified}
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

          {/* 3. SECCIÓN: COMPENSACIONES DEL GRUPO Y SIMPLIFICACIÓN (Solo visible si hay compensaciones con terceros) */}
          {isSimplified && hasCompensations && (
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
                      Compensaciones grupales y triangulaciones
                    </h3>
                    <p className="text-xs text-zinc-500 font-medium">
                      Compensaciones del grupo que optimizan el saldo a liquidar
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-3 shrink-0">
                  <div className="text-right">
                    <span className="text-[10px] font-bold text-zinc-400 block uppercase tracking-wider">
                      {detail.optimizationDetail?.isDiscount
                        ? 'Descuento aplicado'
                        : 'Consolidación aplicada'}
                    </span>
                    <span
                      className={`text-sm sm:text-base font-black ${
                        detail.optimizationDetail?.isDiscount
                          ? 'text-emerald-600'
                          : 'text-[#581c87]'
                      }`}
                    >
                      {detail.optimizationDetail?.isDiscount ? '- ' : '+ '}
                      {formatCurrency(detail.optimizationDetail?.totalCompensated || 0, currency)}
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

              {/* Section Content: Compact Visual Graph & Traceable Compensation Explanation */}
              {expandedSections.distribution && (
                <div className="p-4 sm:p-5 border-t border-zinc-200/80 bg-zinc-50/40 space-y-4">
                  <div className="bg-white rounded-2xl p-4 sm:p-6 border border-zinc-200/90 shadow-2xs space-y-5">
                    {/* SVG Visual Graph */}
                    {(() => {
                      const rels = detail.optimizationDetail?.relevantRelations || [];
                      const relThirdIn = rels.find(
                        (r) =>
                          r.direction === 'third_owes_creditor' ||
                          r.direction === 'consolidation'
                      );
                      const relThirdOut = rels.find(
                        (r) => r.direction === 'creditor_owes_third'
                      );
                      const relDebtorOut = rels.find(
                        (r) => r.direction === 'debtor_owes_third'
                      );

                      const thirdInProfile = relThirdIn?.from;
                      const thirdOutProfile = relThirdOut?.to;
                      const thirdDebtorProfile = relDebtorOut?.to;

                      const thirdInName = thirdInProfile?.full_name || 'Tercero';
                      const thirdOutName = thirdOutProfile?.full_name || 'Tercero';
                      const thirdDebtorName = thirdDebtorProfile?.full_name || 'Tercero';

                      const hasBottomLeft = !!(thirdInProfile || thirdDebtorProfile);
                      const hasBottomRight = !!thirdOutProfile;
                      const hasSecondary = hasBottomLeft || hasBottomRight;

                      const svgHeight = hasSecondary ? 240 : 120;

                      return (
                        <div className="w-full overflow-x-auto py-2">
                          <div className="min-w-[420px] max-w-[540px] mx-auto">
                            <svg
                              viewBox={`0 0 540 ${svgHeight}`}
                              className="w-full h-auto select-none"
                            >
                              <defs>
                                <marker
                                  id="arrow-blue"
                                  markerWidth="8"
                                  markerHeight="8"
                                  refX="6"
                                  refY="4"
                                  orient="auto"
                                >
                                  <path d="M 0 1.5 L 6 4 L 0 6.5 z" fill="#2563eb" />
                                </marker>
                                <marker
                                  id="arrow-amber"
                                  markerWidth="8"
                                  markerHeight="8"
                                  refX="6"
                                  refY="4"
                                  orient="auto"
                                >
                                  <path d="M 0 1.5 L 6 4 L 0 6.5 z" fill="#d97706" />
                                </marker>
                                <marker
                                  id="arrow-purple"
                                  markerWidth="8"
                                  markerHeight="8"
                                  refX="6"
                                  refY="4"
                                  orient="auto"
                                >
                                  <path d="M 0 1.5 L 6 4 L 0 6.5 z" fill="#7c3aed" />
                                </marker>
                                <marker
                                  id="arrow-emerald"
                                  markerWidth="8"
                                  markerHeight="8"
                                  refX="6"
                                  refY="4"
                                  orient="auto"
                                >
                                  <path d="M 0 1.5 L 6 4 L 0 6.5 z" fill="#059669" />
                                </marker>

                                {debtorProfile.avatar_url && (
                                  <clipPath id="clip-debtor">
                                    <circle cx="70" cy="55" r="22" />
                                  </clipPath>
                                )}
                                {creditorProfile.avatar_url && (
                                  <clipPath id="clip-creditor">
                                    <circle cx="450" cy="55" r="22" />
                                  </clipPath>
                                )}
                                {thirdInProfile?.avatar_url && (
                                  <clipPath id="clip-third-in">
                                    <circle cx="70" cy="180" r="22" />
                                  </clipPath>
                                )}
                                {thirdOutProfile?.avatar_url && (
                                  <clipPath id="clip-third-out">
                                    <circle cx="450" cy="180" r="22" />
                                  </clipPath>
                                )}
                              </defs>

                              {/* 1. Primary Arrow (Debtor -> Creditor) */}
                              <line
                                x1="98"
                                y1="55"
                                x2="420"
                                y2="55"
                                stroke="#2563eb"
                                strokeWidth="2.5"
                                markerEnd="url(#arrow-blue)"
                              />
                              <text
                                x="260"
                                y="34"
                                fill="#2563eb"
                                textAnchor="middle"
                                fontWeight="800"
                                fontSize="14px"
                                className="font-mono"
                              >
                                {formatCurrency(detail.netDirectBalance, currency)}
                              </text>
                              <text
                                x="260"
                                y="48"
                                fill="#64748b"
                                textAnchor="middle"
                                fontWeight="500"
                                fontSize="11px"
                              >
                                {debtorProfile.id === currentProfile?.id
                                  ? `debías a ${creditorName}`
                                  : `${debtorName} debe a ${creditorName}`}
                              </text>

                              {/* 2. Secondary Arrow: Third In -> Creditor (e.g. Robado -> Mari) */}
                              {relThirdIn && (
                                <>
                                  <line
                                    x1="94"
                                    y1="165"
                                    x2="424"
                                    y2="72"
                                    stroke="#d97706"
                                    strokeWidth="2"
                                    markerEnd="url(#arrow-amber)"
                                  />
                                  <text
                                    x="250"
                                    y="136"
                                    fill="#d97706"
                                    textAnchor="middle"
                                    fontWeight="800"
                                    fontSize="13px"
                                    className="font-mono"
                                  >
                                    {formatCurrency(relThirdIn.amount, currency)}
                                  </text>
                                  <text
                                    x="250"
                                    y="150"
                                    fill="#64748b"
                                    textAnchor="middle"
                                    fontWeight="500"
                                    fontSize="10.5px"
                                  >
                                    {thirdInName} debe a {creditorName}
                                  </text>
                                </>
                              )}

                              {/* 3. Secondary Arrow: Creditor -> Third Out (e.g. Mari -> Luis) */}
                              {relThirdOut && (
                                <>
                                  <line
                                    x1="450"
                                    y1="102"
                                    x2="450"
                                    y2="152"
                                    stroke="#7c3aed"
                                    strokeWidth="2"
                                    markerEnd="url(#arrow-purple)"
                                  />
                                  <text
                                    x="480"
                                    y="122"
                                    fill="#7c3aed"
                                    textAnchor="start"
                                    fontWeight="800"
                                    fontSize="13px"
                                    className="font-mono"
                                  >
                                    {formatCurrency(relThirdOut.amount, currency)}
                                  </text>
                                  <text
                                    x="480"
                                    y="136"
                                    fill="#64748b"
                                    textAnchor="start"
                                    fontWeight="500"
                                    fontSize="10.5px"
                                  >
                                    {creditorName} debe
                                  </text>
                                  <text
                                    x="480"
                                    y="148"
                                    fill="#64748b"
                                    textAnchor="start"
                                    fontWeight="500"
                                    fontSize="10.5px"
                                  >
                                    a {thirdOutName}
                                  </text>
                                </>
                              )}

                              {/* 4. Secondary Arrow: Debtor -> Third (e.g. Debtor transfer) */}
                              {relDebtorOut && !relThirdIn && (
                                <>
                                  <line
                                    x1="70"
                                    y1="102"
                                    x2="70"
                                    y2="152"
                                    stroke="#059669"
                                    strokeWidth="2"
                                    markerEnd="url(#arrow-emerald)"
                                  />
                                  <text
                                    x="100"
                                    y="126"
                                    fill="#059669"
                                    textAnchor="start"
                                    fontWeight="800"
                                    fontSize="13px"
                                    className="font-mono"
                                  >
                                    {formatCurrency(relDebtorOut.amount, currency)}
                                  </text>
                                  <text
                                    x="100"
                                    y="140"
                                    fill="#64748b"
                                    textAnchor="start"
                                    fontWeight="500"
                                    fontSize="10.5px"
                                  >
                                    {debtorName} debe a {thirdDebtorName}
                                  </text>
                                </>
                              )}

                              {/* Top Left Node: Debtor (WD) */}
                              <circle
                                cx="70"
                                cy="55"
                                r="22"
                                fill="#eff6ff"
                                stroke="#bfdbfe"
                                strokeWidth="2"
                              />
                              {debtorProfile.avatar_url ? (
                                <image
                                  href={debtorProfile.avatar_url}
                                  x="48"
                                  y="33"
                                  width="44"
                                  height="44"
                                  clipPath="url(#clip-debtor)"
                                  preserveAspectRatio="xMidYMid slice"
                                />
                              ) : (
                                <text
                                  x="70"
                                  y="60"
                                  textAnchor="middle"
                                  fill="#1d4ed8"
                                  fontWeight="800"
                                  fontSize="13px"
                                >
                                  {getInitials(debtorName)}
                                </text>
                              )}
                              <text
                                x="70"
                                y="93"
                                textAnchor="middle"
                                fill="#18181b"
                                fontWeight="800"
                                fontSize="12px"
                              >
                                {debtorName}
                              </text>

                              {/* Top Right Node: Creditor (M) */}
                              <circle
                                cx="450"
                                cy="55"
                                r="22"
                                fill="#fff1f2"
                                stroke="#fecdd3"
                                strokeWidth="2"
                              />
                              {creditorProfile.avatar_url ? (
                                <image
                                  href={creditorProfile.avatar_url}
                                  x="428"
                                  y="33"
                                  width="44"
                                  height="44"
                                  clipPath="url(#clip-creditor)"
                                  preserveAspectRatio="xMidYMid slice"
                                />
                              ) : (
                                <text
                                  x="450"
                                  y="60"
                                  textAnchor="middle"
                                  fill="#e11d48"
                                  fontWeight="800"
                                  fontSize="13px"
                                >
                                  {getInitials(creditorName)}
                                </text>
                              )}
                              <text
                                x="450"
                                y="93"
                                textAnchor="middle"
                                fill="#18181b"
                                fontWeight="800"
                                fontSize="12px"
                              >
                                {creditorName}
                              </text>

                              {/* Bottom Left Node: Third In (RO) */}
                              {hasBottomLeft && (
                                <>
                                  <circle
                                    cx="70"
                                    cy="180"
                                    r="22"
                                    fill="#fffbeb"
                                    stroke="#fde68a"
                                    strokeWidth="2"
                                  />
                                  {thirdInProfile?.avatar_url ? (
                                    <image
                                      href={thirdInProfile.avatar_url}
                                      x="48"
                                      y="158"
                                      width="44"
                                      height="44"
                                      clipPath="url(#clip-third-in)"
                                      preserveAspectRatio="xMidYMid slice"
                                    />
                                  ) : (
                                    <text
                                      x="70"
                                      y="185"
                                      textAnchor="middle"
                                      fill="#b45309"
                                      fontWeight="800"
                                      fontSize="13px"
                                    >
                                      {getInitials(
                                        thirdInProfile ? thirdInName : thirdDebtorName
                                      )}
                                    </text>
                                  )}
                                  <text
                                    x="70"
                                    y="218"
                                    textAnchor="middle"
                                    fill="#18181b"
                                    fontWeight="800"
                                    fontSize="12px"
                                  >
                                    {thirdInProfile ? thirdInName : thirdDebtorName}
                                  </text>
                                </>
                              )}

                              {/* Bottom Right Node: Third Out (L) */}
                              {hasBottomRight && (
                                <>
                                  <circle
                                    cx="450"
                                    cy="180"
                                    r="22"
                                    fill="#ecfdf5"
                                    stroke="#a7f3d0"
                                    strokeWidth="2"
                                  />
                                  {thirdOutProfile?.avatar_url ? (
                                    <image
                                      href={thirdOutProfile.avatar_url}
                                      x="428"
                                      y="158"
                                      width="44"
                                      height="44"
                                      clipPath="url(#clip-third-out)"
                                      preserveAspectRatio="xMidYMid slice"
                                    />
                                  ) : (
                                    <text
                                      x="450"
                                      y="185"
                                      textAnchor="middle"
                                      fill="#047857"
                                      fontWeight="800"
                                      fontSize="13px"
                                    >
                                      {getInitials(thirdOutName)}
                                    </text>
                                  )}
                                  <text
                                    x="450"
                                    y="218"
                                    textAnchor="middle"
                                    fill="#18181b"
                                    fontWeight="800"
                                    fontSize="12px"
                                  >
                                    {thirdOutName}
                                  </text>
                                </>
                              )}
                            </svg>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Calculation Justifying the Compensation */}
                    {detail.optimizationDetail?.compensationFormula && (
                      <div className="bg-zinc-50/90 rounded-2xl p-4 sm:p-5 border border-zinc-200/90 space-y-1 text-center sm:text-left">
                        <div className="text-base sm:text-lg font-black text-zinc-900 tracking-tight font-mono">
                          {detail.optimizationDetail.compensationFormula}
                        </div>
                        <div className="text-xs text-zinc-500 font-medium">
                          {detail.optimizationDetail.compensationLabel}
                        </div>
                      </div>
                    )}

                    {/* Optional Expandable Section for linked expenses */}
                    {detail.optimizationDetail?.relevantRelations &&
                      detail.optimizationDetail.relevantRelations.some(
                        (rel) => rel.expenses && rel.expenses.length > 0
                      ) && (
                        <div className="pt-2 border-t border-zinc-100 space-y-3">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedTriangulationIndexes((prev) => {
                                const next = new Set(prev);
                                if (next.has(999)) {
                                  next.delete(999);
                                } else {
                                  next.add(999);
                                }
                                return next;
                              })
                            }
                            className="w-full py-2 px-3 rounded-xl bg-purple-50 hover:bg-purple-100 text-[#581c87] text-xs font-bold transition-all flex items-center justify-center space-x-1.5 cursor-pointer border border-purple-200/60"
                          >
                            <span>
                              {expandedTriangulationIndexes.has(999)
                                ? 'Ocultar gastos vinculados a las compensaciones'
                                : 'Ver gastos vinculados a las compensaciones'}
                            </span>
                            <ChevronDown
                              className={`w-4 h-4 transition-transform ${
                                expandedTriangulationIndexes.has(999) ? 'rotate-180' : ''
                              }`}
                            />
                          </button>

                          {expandedTriangulationIndexes.has(999) && (
                            <div className="pt-2 space-y-4">
                              {detail.optimizationDetail.relevantRelations.map((rel, rIdx) => {
                                if (!rel.expenses || rel.expenses.length === 0) return null;
                                return (
                                  <div
                                    key={`rel-exp-${rIdx}`}
                                    className="bg-zinc-50/60 rounded-xl p-3 border border-zinc-200/70 space-y-2"
                                  >
                                    <div className="flex items-center justify-between text-xs font-bold text-zinc-700">
                                      <span>
                                        Gastos entre {rel.from.full_name} y {rel.to.full_name}
                                      </span>
                                      <span className="font-mono">
                                        {formatCurrency(rel.amount, currency)}
                                      </span>
                                    </div>
                                    <GenericExpenseList
                                      expenses={rel.expenses}
                                      payments={[]}
                                      profiles={profiles}
                                      userGroups={groups}
                                      currentProfile={debtorProfile}
                                      groupCurrency={currency}
                                      showGroupBadge={!groupId}
                                    />
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
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
                      <User className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                      <span className="font-semibold text-zinc-900">Total consumos directos de {debtorName} con {creditorName}</span>
                    </div>
                    <span className="font-black text-rose-600 shrink-0">
                      + {formatCurrency(totalDirectConsumption, currency)}
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

                  {/* Saldo directo intermedio solo si hay compensaciones que cambian el valor */}
                  {hasCompensations && (
                    <div className="pt-2 border-t border-zinc-100 flex items-center justify-between text-zinc-800 font-bold">
                      <span>Saldo directo 1 a 1 entre ambos</span>
                      <span className="text-zinc-900 font-black">
                        {formatCurrency(detail.netDirectBalance, currency)}
                      </span>
                    </div>
                  )}

                  {/* Descuento o consolidación de triangulaciones si aplica */}
                  {hasCompensations && (
                    <div className="flex items-center justify-between text-zinc-700">
                      <div className="flex items-center space-x-2">
                        <Network className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                        <span>
                          {detail.optimizationDetail?.isDiscount
                            ? 'Descuento por compensación con integrantes'
                            : 'Consolidación de cuentas del grupo'}
                        </span>
                      </div>
                      <span
                        className={`font-black ${
                          detail.optimizationDetail?.isDiscount ? 'text-emerald-600' : 'text-[#581c87]'
                        }`}
                      >
                        {detail.optimizationDetail?.isDiscount ? '- ' : '+ '}
                        {formatCurrency(detail.optimizationDetail?.totalCompensated || 0, currency)}
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
