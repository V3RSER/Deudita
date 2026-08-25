'use client';

import React, { useState, useMemo } from 'react';
import Image from 'next/image';
import { Expense, Payment, Profile, Group, PairwiseBalance } from '@/lib/types';
import {
  formatCurrency,
  calculateMemberAccountStatement,
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
  // Collapsed by default as requested: "haz que por defecto aparezca todo colapsado"
  const [expandedSections, setExpandedSections] = useState({
    debts: false,
    recovers: false,
    distribution: false,
    calculation: false,
  });

  const [showSettledDebts, setShowSettledDebts] = useState(false);
  const [showSettledRecovers, setShowSettledRecovers] = useState(false);

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

  const creditorProfile: Profile | undefined = useMemo(() => {
    if (!pairwise) return undefined;
    return profiles.find((p) => p.id === pairwise.creditor.id) || pairwise.creditor;
  }, [pairwise, profiles]);

  // Calculate comprehensive member statement
  const statement = useMemo(() => {
    if (!pairwise) return null;
    return calculateMemberAccountStatement(
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

  if (!isOpen || !pairwise || !statement) return null;

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
  const creditorName = creditorProfile?.full_name || 'Acreedor';

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

                {creditorProfile?.avatar_url ? (
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

              {/* Title & Perspective oriented to debtor */}
              <div className="min-w-0">
                <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                  <span className="text-xs font-bold text-zinc-600">
                    {isCreditor ? 'A tu favor' : isDebtor ? 'Por pagar' : 'Estado de cuenta'}
                  </span>
                  <span className="bg-purple-100 text-purple-900 text-[11px] font-bold px-2 py-0.5 rounded-full border border-purple-200">
                    {statement.pendingConsumedExpenses.length} consumos pendientes • {statement.activePaidExpenses.length + statement.activePaymentsMade.length} aportes activos
                    {statement.settledConsumedExpenses.length > 0 && (
                      <span className="text-purple-600 font-normal ml-1">
                        ({statement.consumedExpenses.length} totales)
                      </span>
                    )}
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
                    creditorProfile?.id,
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
          <div className="mt-3.5 pt-3 border-t border-zinc-100 flex items-center justify-between bg-purple-50/70 rounded-xl px-3.5 py-2.5 text-xs text-purple-950">
            <div className="flex items-center space-x-2">
              <Sparkles className="w-4 h-4 text-[#581c87] shrink-0" />
              <span>
                Mostrando el estado de cuenta integral de <strong className="font-extrabold text-[#581c87]">{debtorName}</strong> ({debtorName} debe por sus consumos y recupera por lo que pagó).
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
          {/* 1. SECCIÓN: CONSUMOS QUE DEBE (GenericExpenseList reutilizado) */}
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
                    Gastos que debe {debtorName} (Consumos pendientes)
                  </h3>
                  <p className="text-xs text-zinc-500 font-medium">
                    Gastos pagados por otros integrantes donde participó {debtorName}
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-3 shrink-0">
                <div className="text-right">
                  <span className="text-[10px] font-bold text-zinc-400 block uppercase tracking-wider">
                    Consumos pendientes
                  </span>
                  <span className="text-sm sm:text-base font-black text-[#581c87]">
                    + {formatCurrency(statement.totalPendingDebt, currency)}
                  </span>
                  {statement.totalSettledDebt > 0.009 && (
                    <span className="text-[10px] text-zinc-400 font-medium block">
                      ({formatCurrency(statement.totalConsumedDebt, currency)} histórico)
                    </span>
                  )}
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
              <div className="border-t border-zinc-200/80 bg-zinc-50/40 p-3 sm:p-4 space-y-3">
                {statement.pendingConsumedExpenses.length === 0 ? (
                  <div className="p-5 text-center text-zinc-500 text-xs bg-white rounded-xl border border-zinc-200">
                    <CheckCircle2 className="w-5 h-5 text-emerald-500 mx-auto mb-1.5" />
                    <p className="font-semibold text-zinc-700">No hay consumos pendientes por liquidar.</p>
                    {statement.settledConsumedExpenses.length > 0 && (
                      <p className="text-[11px] text-zinc-400 mt-0.5">
                        Los consumos anteriores ya fueron saldados con los pagos y aportes registrados.
                      </p>
                    )}
                  </div>
                ) : (
                  <GenericExpenseList
                    expenses={statement.pendingConsumedExpenses}
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

                {/* Optional toggle for historical settled expenses */}
                {statement.settledConsumedExpenses.length > 0 && (
                  <div className="pt-2 border-t border-zinc-200/70">
                    <button
                      type="button"
                      onClick={() => setShowSettledDebts((prev) => !prev)}
                      className="w-full py-2 px-3 bg-white hover:bg-zinc-100/80 text-zinc-600 rounded-xl border border-zinc-200 text-xs font-semibold flex items-center justify-between transition-colors cursor-pointer"
                    >
                      <span className="flex items-center space-x-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span>
                          {showSettledDebts
                            ? 'Ocultar consumos saldados anteriormente'
                            : `Ver consumos saldados anteriormente (${statement.settledConsumedExpenses.length})`}
                        </span>
                      </span>
                      {showSettledDebts ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>

                    {showSettledDebts && (
                      <div className="mt-2.5 opacity-80">
                        <GenericExpenseList
                          expenses={statement.settledConsumedExpenses}
                          payments={[]}
                          profiles={profiles}
                          userGroups={groups}
                          currentProfile={debtorProfile}
                          groupCurrency={currency}
                          showGroupBadge={!groupId}
                          onEditExpense={onEditExpense}
                          onDeleteExpense={onDeleteExpense}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 2. SECCIÓN: GASTOS Y ABONOS QUE RECUPERA (GenericExpenseList reutilizado con valores reales) */}
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
                    Gastos y abonos que recupera {debtorName} (Aportes)
                  </h3>
                  <p className="text-xs text-zinc-500 font-medium">
                    Gastos pagados por {debtorName} por los demás y pagos directos aplicados
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-3 shrink-0">
                <div className="text-right">
                  <span className="text-[10px] font-bold text-zinc-400 block uppercase tracking-wider">
                    Aportes activos aplicados
                  </span>
                  <span className="text-sm sm:text-base font-black text-emerald-600">
                    - {formatCurrency(statement.totalActiveRecoverable, currency)}
                  </span>
                  {statement.totalSettledRecoverable > 0.009 && (
                    <span className="text-[10px] text-zinc-400 font-medium block">
                      ({formatCurrency(statement.totalRecoverable, currency)} histórico)
                    </span>
                  )}
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
              <div className="border-t border-zinc-200/80 bg-zinc-50/40 p-3 sm:p-4 space-y-3">
                {statement.activePaidExpenses.length === 0 && statement.activePaymentsMade.length === 0 ? (
                  <div className="p-5 text-center text-zinc-500 text-xs bg-white rounded-xl border border-zinc-200">
                    <p className="font-semibold text-zinc-700">No hay aportes ni abonos activos pendientes de compensar.</p>
                    {(statement.settledPaidExpenses.length > 0 || statement.settledPaymentsMade.length > 0) && (
                      <p className="text-[11px] text-zinc-400 mt-0.5">
                        Los aportes o pagos anteriores ya compensaron consumos pasados.
                      </p>
                    )}
                  </div>
                ) : (
                  <GenericExpenseList
                    expenses={statement.activePaidExpenses}
                    payments={statement.activePaymentsMade}
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

                {/* Optional toggle for historical settled recovers / payments */}
                {(statement.settledPaidExpenses.length > 0 || statement.settledPaymentsMade.length > 0) && (
                  <div className="pt-2 border-t border-zinc-200/70">
                    <button
                      type="button"
                      onClick={() => setShowSettledRecovers((prev) => !prev)}
                      className="w-full py-2 px-3 bg-white hover:bg-zinc-100/80 text-zinc-600 rounded-xl border border-zinc-200 text-xs font-semibold flex items-center justify-between transition-colors cursor-pointer"
                    >
                      <span className="flex items-center space-x-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span>
                          {showSettledRecovers
                            ? 'Ocultar aportes y abonos saldados'
                            : `Ver aportes y abonos ya aplicados (${statement.settledPaidExpenses.length + statement.settledPaymentsMade.length})`}
                        </span>
                      </span>
                      {showSettledRecovers ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>

                    {showSettledRecovers && (
                      <div className="mt-2.5 opacity-80">
                        <GenericExpenseList
                          expenses={statement.settledPaidExpenses}
                          payments={statement.settledPaymentsMade}
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
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 3. SECCIÓN: DISTRIBUCIÓN DEL SALDO Y COMPENSACIONES */}
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
                    Distribución del saldo y a quién le debe {debtorName}
                  </h3>
                  <p className="text-xs text-zinc-500 font-medium">
                    {isSimplified
                      ? 'Cuentas optimizadas del grupo mediante compensaciones directas'
                      : 'Cuentas individuales directas 1 a 1 con cada integrante'}
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-3 shrink-0">
                <div className="text-right">
                  <span className="text-[10px] font-bold text-zinc-400 block uppercase tracking-wider">
                    {statement.netGlobalBalance < 0 ? 'Saldo neto por pagar' : 'Saldo neto a favor'}
                  </span>
                  <span
                    className={`text-sm sm:text-base font-black ${
                      statement.netGlobalBalance < 0 ? 'text-[#581c87]' : 'text-emerald-600'
                    }`}
                  >
                    {formatCurrency(Math.abs(statement.netGlobalBalance), currency)}
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

            {/* Section Content: Peers Cards & Triangulations */}
            {expandedSections.distribution && (
              <div className="p-4 sm:p-5 border-t border-zinc-200/80 bg-zinc-50/40 space-y-4">
                {/* 1. Peers Breakdown Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {statement.peerBalances.map((peer) => {
                    const peerName = peer.member.full_name || 'Integrante';
                    const isTarget = peer.isTargetCreditor;
                    const owesThisPeer = peer.settlementAmount > 0;
                    const peerOwesMember = peer.settlementAmount < 0;
                    const isCompensatedZero =
                      isSimplified && Math.abs(peer.settlementAmount) <= 0.009 && Math.abs(peer.netAmount) > 0.009;

                    return (
                      <div
                        key={peer.member.id}
                        className={`rounded-2xl p-3.5 border transition-all ${
                          isTarget
                            ? 'bg-purple-50/60 border-purple-300 ring-1 ring-purple-200 shadow-xs'
                            : 'bg-white border-zinc-200/80 shadow-2xs'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <div className="flex items-center space-x-2 min-w-0">
                            {peer.member.avatar_url ? (
                              <Image
                                src={peer.member.avatar_url}
                                alt={peerName}
                                width={28}
                                height={28}
                                className="w-7 h-7 rounded-full object-cover ring-1 ring-zinc-200 shrink-0"
                                unoptimized
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <div className="w-7 h-7 rounded-full bg-zinc-100 text-zinc-700 font-bold text-[10px] flex items-center justify-center shrink-0">
                                {getInitials(peerName)}
                              </div>
                            )}
                            <span className="font-extrabold text-xs text-zinc-900 truncate">
                              {peerName}
                            </span>
                          </div>

                          {isTarget && (
                            <span className="bg-[#581c87] text-white text-[9px] font-extrabold px-1.5 py-0.5 rounded-full shrink-0">
                              Seleccionado
                            </span>
                          )}
                        </div>

                        {/* Direct vs Settlement Details */}
                        <div className="space-y-1 text-[11px] text-zinc-600 bg-white/80 rounded-xl p-2.5 border border-zinc-100">
                          <div className="flex items-center justify-between">
                            <span className="text-zinc-500">Consumos pendientes con {peerName}:</span>
                            <span className="font-bold text-zinc-800">
                              + {formatCurrency(peer.pendingDebtAmount, currency)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-zinc-500">Aportes activos por {peerName}:</span>
                            <span className="font-bold text-emerald-600">
                              - {formatCurrency(peer.pendingRecoverAmount, currency)}
                            </span>
                          </div>

                          {(peer.settledDebtAmount > 0.009 || peer.settledRecoverAmount > 0.009) && (
                            <div className="text-[9.5px] text-zinc-400 font-medium pt-0.5 border-t border-zinc-100/60 flex items-center justify-between">
                              <span>Histórico total:</span>
                              <span>+{formatCurrency(peer.historicalDebtAmount, currency)} / -{formatCurrency(peer.historicalRecoverAmount, currency)}</span>
                            </div>
                          )}

                          <div className="pt-1.5 border-t border-zinc-100 flex items-center justify-between font-extrabold text-xs">
                            <span className="text-zinc-700">
                              {isSimplified ? 'Saldo a liquidar:' : 'Cuenta directa:'}
                            </span>
                            {owesThisPeer ? (
                              <span className="text-[#581c87]">
                                Debe {formatCurrency(peer.settlementAmount, currency)}
                              </span>
                            ) : peerOwesMember ? (
                              <span className="text-emerald-600">
                                Recupera {formatCurrency(Math.abs(peer.settlementAmount), currency)}
                              </span>
                            ) : isCompensatedZero ? (
                              <span className="text-sky-700 font-semibold text-[10px] flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3 text-sky-600" />
                                Compensado
                              </span>
                            ) : (
                              <span className="text-zinc-400 font-medium">Al día ($ 0)</span>
                            )}
                          </div>
                        </div>

                        {/* Direct settle button if owes this peer */}
                        {owesThisPeer && (
                          <button
                            type="button"
                            onClick={() => {
                              onClose();
                              onOpenSettleModal(
                                pairwise.group_id || groupId,
                                debtorProfile.id,
                                peer.member.id,
                                peer.settlementAmount
                              );
                            }}
                            className="w-full mt-2.5 py-1.5 px-2 bg-purple-100/70 hover:bg-purple-200/80 text-[#581c87] rounded-lg text-[11px] font-bold transition-all cursor-pointer flex items-center justify-center gap-1"
                          >
                            <span>Saldar con {peerName}</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* 2. Group Triangulations (if simplified mode and triangulations exist) */}
                {isSimplified && statement.triangulations.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-zinc-200/80 space-y-3">
                    <div className="flex items-center space-x-2">
                      <Network className="w-4 h-4 text-purple-700 shrink-0" />
                      <h4 className="text-xs font-extrabold text-zinc-900">
                        Compensaciones del grupo que optimizan el pago a {creditorName}
                      </h4>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {statement.triangulations.map((t, tIdx) => {
                        const isUnfolded = expandedTriangulationIndexes.has(tIdx);
                        const tpName = t.thirdParty.full_name || 'Tercero';

                        return (
                          <div
                            key={`triang-${tIdx}`}
                            className="bg-white rounded-2xl border border-zinc-200/90 p-4 space-y-3 shadow-2xs"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-center space-x-2.5">
                                {t.thirdParty.avatar_url ? (
                                  <Image
                                    src={t.thirdParty.avatar_url}
                                    alt={tpName}
                                    width={32}
                                    height={32}
                                    className="w-8 h-8 rounded-full object-cover ring-1 ring-zinc-200 shrink-0"
                                    unoptimized
                                    referrerPolicy="no-referrer"
                                  />
                                ) : (
                                  <div className="w-8 h-8 rounded-full bg-sky-100 text-sky-800 border border-sky-200 flex items-center justify-center text-xs font-bold shrink-0">
                                    {getInitials(tpName)}
                                  </div>
                                )}
                                <div>
                                  <span className="font-extrabold text-zinc-900 text-xs block">
                                    Compensación con {tpName}
                                  </span>
                                  <span className="text-[10px] text-zinc-500 font-medium">
                                    {tpName} le debe a {creditorName}
                                  </span>
                                </div>
                              </div>

                              <span className="text-xs font-black text-emerald-600">
                                - {formatCurrency(t.amount, currency)}
                              </span>
                            </div>

                            {/* Diagram */}
                            <div className="bg-zinc-50 rounded-xl p-2.5 border border-zinc-100">
                              <div className="flex items-center justify-between gap-1 text-center text-[10px]">
                                <span className="font-bold text-zinc-800 truncate max-w-[65px]">
                                  {debtorName}
                                </span>
                                <ArrowRight className="w-3 h-3 text-[#581c87] shrink-0" />
                                <span className="font-bold text-sky-700 truncate max-w-[65px]">
                                  {tpName}
                                </span>
                                <ArrowRight className="w-3 h-3 text-indigo-500 shrink-0" />
                                <span className="font-bold text-zinc-800 truncate max-w-[65px]">
                                  {creditorName}
                                </span>
                              </div>
                            </div>

                            {/* Expand button for underlying expenses */}
                            <button
                              type="button"
                              onClick={() => toggleTriangulationExpand(tIdx)}
                              className="w-full py-1.5 px-2.5 rounded-lg bg-purple-50 hover:bg-purple-100 text-[#581c87] text-[11px] font-bold transition-all flex items-center justify-center space-x-1 cursor-pointer border border-purple-200/60"
                            >
                              <span>
                                {isUnfolded
                                  ? 'Ocultar gastos vinculados'
                                  : `Ver ${t.expenses.length} gastos vinculados`}
                              </span>
                              <ChevronDown
                                className={`w-3.5 h-3.5 transition-transform ${
                                  isUnfolded ? 'rotate-180' : ''
                                }`}
                              />
                            </button>

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
                  {/* Consumos pendientes */}
                  <div className="flex items-start justify-between text-zinc-700">
                    <div className="space-y-0.5">
                      <div className="flex items-center space-x-2">
                        <User className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                        <span className="font-semibold text-zinc-900">Consumos pendientes de {debtorName}</span>
                      </div>
                      {statement.totalSettledDebt > 0.009 && (
                        <p className="text-[11px] text-zinc-400 pl-5.5">
                          Total histórico: {formatCurrency(statement.totalConsumedDebt, currency)} • {formatCurrency(statement.totalSettledDebt, currency)} ya saldados en el pasado
                        </p>
                      )}
                    </div>
                    <span className="font-black text-[#581c87] shrink-0">
                      + {formatCurrency(statement.totalPendingDebt, currency)}
                    </span>
                  </div>

                  {/* Aportes activos */}
                  <div className="flex items-start justify-between text-zinc-700">
                    <div className="space-y-0.5">
                      <div className="flex items-center space-x-2">
                        <Wallet className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span className="font-semibold text-zinc-900">Aportes y abonos activos aplicados</span>
                      </div>
                      {statement.totalSettledRecoverable > 0.009 && (
                        <p className="text-[11px] text-zinc-400 pl-5.5">
                          Total histórico: {formatCurrency(statement.totalRecoverable, currency)} • {formatCurrency(statement.totalSettledRecoverable, currency)} ya aplicados anteriormente
                        </p>
                      )}
                    </div>
                    <span className="font-black text-emerald-600 shrink-0">
                      - {formatCurrency(statement.totalActiveRecoverable, currency)}
                    </span>
                  </div>

                  {/* Balance neto global */}
                  <div className="pt-2 border-t border-zinc-100 flex items-center justify-between text-zinc-800 font-bold">
                    <span>Balance neto pendiente de {debtorName} en el grupo</span>
                    <span className={statement.netGlobalBalance < 0 ? 'text-[#581c87]' : 'text-emerald-600'}>
                      {statement.netGlobalBalance < 0
                        ? `Debe ${formatCurrency(Math.abs(statement.netGlobalBalance), currency)}`
                        : `A favor ${formatCurrency(statement.netGlobalBalance, currency)}`}
                    </span>
                  </div>

                  {/* Descuento triangulaciones si aplica */}
                  {isSimplified && statement.totalCompensationsApplied > 0.009 && (
                    <div className="flex items-center justify-between text-zinc-700">
                      <div className="flex items-center space-x-2">
                        <Network className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                        <span>Compensaciones grupales aplicadas a esta cuenta</span>
                      </div>
                      <span className="font-black text-emerald-600">
                        - {formatCurrency(statement.totalCompensationsApplied, currency)}
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
