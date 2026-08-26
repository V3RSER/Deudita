'use client';

import React, { useState, useMemo } from 'react';
import Image from 'next/image';
import { useExpense } from '@/lib/expense-context';
import { Payment, PairwiseBalance, Group, Profile, Expense } from '@/lib/types';
import {
  formatCurrency,
  calculateSimplifiedBalances,
  calculateDirectBalances,
} from '@/lib/balance-utils';
import {
  TrendingUp,
  TrendingDown,
  ArrowRightLeft,
  CheckCircle2,
  Sparkles,
  Layers,
  Shield,
  UserCheck,
  Search,
  X,
  ChevronRight,
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { PairwiseDetailModal } from '@/components/PairwiseDetailModal';

interface ConsolidatedBalancesProps {
  onOpenSettleModal: (groupId?: string, debtorId?: string, creditorId?: string, amount?: number) => void;
  onEditPayment?: (payment: Payment) => void;
}

function getInitials(name?: string): string {
  if (!name) return 'U';
  const trimmed = name.trim();
  if (!trimmed) return 'U';
  return trimmed.charAt(0).toUpperCase();
}

type FilterType = 'all' | 'mine' | 'to_receive' | 'to_pay' | 'third_party';

interface BalanceCardProps {
  pairwise: PairwiseBalance;
  currentProfile: Profile | null;
  isSimplified: boolean;
  onOpenSettleModal: (groupId?: string, debtorId?: string, creditorId?: string, amount?: number) => void;
  onSelectPairwise: (pairwise: PairwiseBalance) => void;
}

function UnifiedBalanceCard({
  pairwise,
  currentProfile,
  isSimplified,
  onOpenSettleModal,
  onSelectPairwise,
}: BalanceCardProps) {
  const isDebtor =
    pairwise.debtor.id === currentProfile?.id ||
    (!isSimplified && pairwise.debtorSponsor?.id === currentProfile?.id);

  const isCreditor =
    pairwise.creditor.id === currentProfile?.id ||
    (!isSimplified && pairwise.creditorSponsor?.id === currentProfile?.id);

  const isDebtorMyDependent = !isSimplified && pairwise.debtorSponsor?.id === currentProfile?.id;
  const isCreditorMyDependent = !isSimplified && pairwise.creditorSponsor?.id === currentProfile?.id;

  // Determine card type styling
  const cardTheme = isCreditor
    ? {
        borderClass: 'border-emerald-200/90 hover:border-emerald-300',
        bgGradient: 'bg-gradient-to-r from-emerald-500/5 via-white to-white',
        badgeClass: 'bg-emerald-100 text-emerald-900 border-emerald-200/80',
        badgeText: '+ Por cobrar',
        amountClass: 'text-emerald-700',
        sign: '+',
        btnClass: 'bg-emerald-600 hover:bg-emerald-700 text-white',
        btnText: 'Registrar pago',
        ringClass: 'ring-emerald-200',
      }
    : isDebtor
    ? {
        borderClass: 'border-rose-200/90 hover:border-rose-300',
        bgGradient: 'bg-gradient-to-r from-rose-500/5 via-white to-white',
        badgeClass: 'bg-rose-100 text-rose-900 border-rose-200/80',
        badgeText: '- Por pagar',
        amountClass: 'text-rose-600',
        sign: '-',
        btnClass: 'bg-zinc-900 hover:bg-zinc-800 text-white',
        btnText: 'Pagar',
        ringClass: 'ring-rose-200',
      }
    : {
        borderClass: 'border-zinc-200/90 hover:border-zinc-300',
        bgGradient: 'bg-white',
        badgeClass: 'bg-zinc-100 text-zinc-700 border-zinc-200/80',
        badgeText: 'Entre integrantes',
        amountClass: 'text-zinc-900',
        sign: '',
        btnClass: 'bg-zinc-100 hover:bg-zinc-200 text-zinc-900',
        btnText: 'Saldar',
        ringClass: 'ring-zinc-200',
      };

  return (
    <div
      onClick={() => onSelectPairwise(pairwise)}
      className={`rounded-3xl border ${cardTheme.borderClass} ${cardTheme.bgGradient} shadow-2xs hover:shadow-md transition-all overflow-hidden flex flex-col cursor-pointer group`}
    >
      {/* Top Header Card */}
      <div className="p-4 sm:p-5 flex flex-col gap-3.5">
        <div className="flex items-start justify-between gap-3 flex-wrap sm:flex-nowrap">
          {/* Profiles & Relationship */}
          <div className="flex items-start space-x-3 min-w-0 flex-1">
            {/* Avatars */}
            <div className="flex items-center -space-x-2 shrink-0 pt-0.5">
              {pairwise.debtor.avatar_url ? (
                <Image
                  src={pairwise.debtor.avatar_url}
                  alt={pairwise.debtor.full_name || 'Deudor'}
                  width={40}
                  height={40}
                  className={`w-10 h-10 rounded-full object-cover ring-2 ${cardTheme.ringClass} shrink-0`}
                  unoptimized
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div
                  className={`w-10 h-10 rounded-full ring-2 ${cardTheme.ringClass} bg-zinc-900 text-white flex items-center justify-center text-xs font-bold shrink-0`}
                >
                  {getInitials(pairwise.debtor.full_name)}
                </div>
              )}

              {pairwise.creditor.avatar_url ? (
                <Image
                  src={pairwise.creditor.avatar_url}
                  alt={pairwise.creditor.full_name || 'Acreedor'}
                  width={40}
                  height={40}
                  className="w-10 h-10 rounded-full object-cover ring-2 ring-white shrink-0"
                  unoptimized
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-10 h-10 rounded-full ring-2 ring-white bg-zinc-700 text-white flex items-center justify-center text-xs font-bold shrink-0">
                  {getInitials(pairwise.creditor.full_name)}
                </div>
              )}
            </div>

            {/* Names & Narrative */}
            <div className="min-w-0 space-y-1">
              <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                <span
                  className={`inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-black border tracking-wide uppercase ${cardTheme.badgeClass}`}
                >
                  {cardTheme.badgeText}
                </span>
              </div>

              {/* Relationship description */}
              <div className="text-sm font-extrabold text-zinc-900 tracking-tight flex items-center space-x-1.5 flex-wrap">
                {isCreditor ? (
                  <>
                    <span className="text-zinc-900 font-black">
                      {pairwise.debtor.full_name || 'Usuario'}
                    </span>
                    <span className="text-zinc-500 font-medium">te debe dinero</span>
                  </>
                ) : isDebtor ? (
                  <>
                    <span className="text-zinc-500 font-medium">Le debes a</span>
                    <span className="text-zinc-900 font-black">
                      {pairwise.creditor.full_name || 'Usuario'}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-zinc-900 font-bold">
                      {pairwise.debtor.full_name || 'Usuario'}
                    </span>
                    <span className="text-zinc-500 font-medium">le debe a</span>
                    <span className="text-zinc-900 font-bold">
                      {pairwise.creditor.full_name || 'Usuario'}
                    </span>
                  </>
                )}
              </div>

              {/* Sponsor context in direct view */}
              {!isSimplified && (pairwise.debtorSponsor || pairwise.creditorSponsor) && (
                <div className="flex items-center space-x-1 text-[10px] text-indigo-700 font-semibold pt-0.5">
                  <Shield className="w-3 h-3 shrink-0" />
                  <span>
                    {isDebtorMyDependent && 'Deuda de persona vinculada a ti'}
                    {isCreditorMyDependent && 'Cobro de persona vinculada a ti'}
                    {!isDebtorMyDependent &&
                      !isCreditorMyDependent &&
                      pairwise.debtorSponsor &&
                      `Deudor vinculado a ${pairwise.debtorSponsor.full_name}`}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Amount and Action Button */}
          <div className="flex items-center sm:items-end justify-between sm:justify-end gap-3 w-full sm:w-auto pt-1 sm:pt-0 border-t sm:border-t-0 border-zinc-100">
            <div className="text-left sm:text-right">
              <span className="text-[10px] font-black uppercase text-zinc-400 tracking-wider block">
                {isCreditor ? 'A tu favor' : isDebtor ? 'Total a pagar' : 'Saldo total'}
              </span>
              <span className={`text-xl sm:text-2xl font-black tracking-tight ${cardTheme.amountClass} block`}>
                {cardTheme.sign}
                {formatCurrency(pairwise.amount)}
              </span>
            </div>

            <button
              onClick={(e) => {
                e.stopPropagation();
                onOpenSettleModal(pairwise.group_id, pairwise.debtor.id, pairwise.creditor.id, pairwise.amount);
              }}
              className={`px-4 py-2.5 rounded-2xl text-xs font-extrabold transition-all shadow-xs active:scale-95 cursor-pointer shrink-0 ${cardTheme.btnClass}`}
            >
              {cardTheme.btnText}
            </button>
          </div>
        </div>

        {/* Simplified breakdown tags if present */}
        {isSimplified &&
          (pairwise.includedDebtors ||
            pairwise.debtorBreakdown ||
            pairwise.includedCreditors ||
            pairwise.creditorBreakdown) && (
            <div className="pt-2 border-t border-zinc-100 text-[11px] text-zinc-500 space-y-1">
              {pairwise.debtorBreakdown && pairwise.debtorBreakdown.length > 1 ? (
                <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
                  <span className="font-semibold text-zinc-700 flex items-center space-x-1">
                    <UserCheck className="w-3 h-3 text-indigo-600" />
                    <span>Desglose por personas:</span>
                  </span>
                  {pairwise.debtorBreakdown.map((b, bIdx) => (
                    <span
                      key={bIdx}
                      className="inline-flex items-center space-x-1 bg-white px-2 py-0.5 rounded-md border border-zinc-200 text-zinc-700 font-medium shadow-2xs"
                    >
                      <span>{b.isSelf ? (isDebtor ? 'Tu consumo' : b.profile.full_name) : b.profile.full_name}:</span>
                      <strong className="text-zinc-900">{formatCurrency(b.amount)}</strong>
                    </span>
                  ))}
                </div>
              ) : pairwise.includedDebtors && pairwise.includedDebtors.length > 0 ? (
                <div className="flex items-center space-x-1.5 text-zinc-600">
                  <Shield className="w-3 h-3 text-indigo-600 shrink-0" />
                  <span>
                    Incluye consumo de personas vinculadas:{' '}
                    <strong>{pairwise.includedDebtors.map((d) => d.full_name).join(', ')}</strong>
                  </span>
                </div>
              ) : null}
            </div>
          )}

        {/* Bottom click affordance */}
        <div className="pt-2 border-t border-zinc-100 flex items-center justify-between text-xs text-zinc-500 group-hover:text-zinc-800 transition-colors">
          <span className="font-medium text-[11px] text-zinc-400 group-hover:text-zinc-600">
            Haz clic para ver el desglose detallado de cuentas
          </span>
          <div className="flex items-center space-x-1 text-xs font-bold text-indigo-700">
            <span>Ver desglose</span>
            <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function ConsolidatedBalances({ onOpenSettleModal }: ConsolidatedBalancesProps) {
  const { currentProfile, expenses, payments, profiles, userGroups } = useExpense();
  const [isSimplified, setIsSimplified] = useState(true);
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProofUrl, setSelectedProofUrl] = useState<string | null>(null);
  const [selectedPairwiseForDetail, setSelectedPairwiseForDetail] = useState<PairwiseBalance | null>(null);

  const userGroupIds = useMemo(() => new Set(userGroups.map((g) => g.id)), [userGroups]);
  const userExpenses = useMemo(() => expenses.filter((e) => userGroupIds.has(e.group_id)), [expenses, userGroupIds]);
  const userPayments = useMemo(() => payments.filter((s) => userGroupIds.has(s.group_id)), [payments, userGroupIds]);

  // Compute both simplified and direct pairwise balances
  const simplifiedPairwise = useMemo(
    () => calculateSimplifiedBalances(userExpenses, userPayments, profiles),
    [userExpenses, userPayments, profiles]
  );
  const directPairwise = useMemo(
    () => calculateDirectBalances(userExpenses, userPayments, profiles),
    [userExpenses, userPayments, profiles]
  );

  const activePairwise = isSimplified ? simplifiedPairwise : directPairwise;

  // Filter into categories for count badges and KPI summaries
  const myOwedToMe = useMemo(() => {
    return activePairwise.filter((p) => {
      if (isSimplified) {
        return p.creditor.id === currentProfile?.id;
      }
      return p.creditor.id === currentProfile?.id || p.creditorSponsor?.id === currentProfile?.id;
    });
  }, [activePairwise, isSimplified, currentProfile]);

  const myIOwe = useMemo(() => {
    return activePairwise.filter((p) => {
      if (isSimplified) {
        return p.debtor.id === currentProfile?.id;
      }
      return p.debtor.id === currentProfile?.id || p.debtorSponsor?.id === currentProfile?.id;
    });
  }, [activePairwise, isSimplified, currentProfile]);

  const otherPairwise = useMemo(() => {
    return activePairwise.filter((p) => {
      if (isSimplified) {
        return p.creditor.id !== currentProfile?.id && p.debtor.id !== currentProfile?.id;
      }
      const isCreditorMeOrMine =
        p.creditor.id === currentProfile?.id || p.creditorSponsor?.id === currentProfile?.id;
      const isDebtorMeOrMine =
        p.debtor.id === currentProfile?.id || p.debtorSponsor?.id === currentProfile?.id;
      return !isCreditorMeOrMine && !isDebtorMeOrMine;
    });
  }, [activePairwise, isSimplified, currentProfile]);

  const totalOwedToMe = useMemo(() => myOwedToMe.reduce((acc, curr) => acc + curr.amount, 0), [myOwedToMe]);
  const totalIOwe = useMemo(() => myIOwe.reduce((acc, curr) => acc + curr.amount, 0), [myIOwe]);
  const netConsolidated = totalOwedToMe - totalIOwe;

  const directTransactionsCount = directPairwise.length;
  const simplifiedTransactionsCount = simplifiedPairwise.length;

  // Unified List Filtering (Filter pills + Search)
  const filteredPairwiseList = useMemo(() => {
    return activePairwise.filter((p) => {
      const isDebtorMe =
        p.debtor.id === currentProfile?.id ||
        (!isSimplified && p.debtorSponsor?.id === currentProfile?.id);
      const isCreditorMe =
        p.creditor.id === currentProfile?.id ||
        (!isSimplified && p.creditorSponsor?.id === currentProfile?.id);

      if (activeFilter === 'mine') {
        if (!isDebtorMe && !isCreditorMe) return false;
      } else if (activeFilter === 'to_receive') {
        if (!isCreditorMe) return false;
      } else if (activeFilter === 'to_pay') {
        if (!isDebtorMe) return false;
      } else if (activeFilter === 'third_party') {
        if (isDebtorMe || isCreditorMe) return false;
      }

      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const debtorName = (p.debtor.full_name || '').toLowerCase();
        const creditorName = (p.creditor.full_name || '').toLowerCase();
        const matchDebtor = debtorName.includes(query);
        const matchCreditor = creditorName.includes(query);
        if (!matchDebtor && !matchCreditor) return false;
      }

      return true;
    });
  }, [activePairwise, activeFilter, searchQuery, currentProfile, isSimplified]);

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-20 sm:pb-12">
      {/* Header */}
      <PageHeader
        title="Balance consolidado"
        subtitle="Estado general de tus cuentas y deudas entre integrantes de todos tus grupos"
        actions={
          <div className="flex items-center gap-2">
            {/* Optimization Toggle */}
            <div className="bg-zinc-100 p-1 rounded-xl flex items-center border border-zinc-200">
              <button
                type="button"
                onClick={() => setIsSimplified(true)}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  isSimplified
                    ? 'bg-white text-indigo-950 shadow-2xs'
                    : 'text-zinc-500 hover:text-zinc-800'
                }`}
              >
                <Sparkles className={`w-3.5 h-3.5 ${isSimplified ? 'text-indigo-600' : 'text-zinc-400'}`} />
                <span>Simplificado</span>
                <span className="text-[10px] opacity-60 font-bold">({simplifiedTransactionsCount})</span>
              </button>

              <button
                type="button"
                onClick={() => setIsSimplified(false)}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  !isSimplified
                    ? 'bg-white text-zinc-900 shadow-2xs'
                    : 'text-zinc-500 hover:text-zinc-800'
                }`}
              >
                <Layers className={`w-3.5 h-3.5 ${!isSimplified ? 'text-zinc-900' : 'text-zinc-400'}`} />
                <span>Directo</span>
                <span className="text-[10px] opacity-60 font-bold">({directTransactionsCount})</span>
              </button>
            </div>
          </div>
        }
      />

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Por cobrar (Suma +) */}
        <div
          onClick={() => setActiveFilter('to_receive')}
          className={`rounded-3xl p-5 border shadow-xs relative overflow-hidden transition-all cursor-pointer hover:shadow-md ${
            activeFilter === 'to_receive'
              ? 'ring-2 ring-emerald-500 bg-emerald-50/80 border-emerald-300'
              : 'bg-gradient-to-br from-emerald-500/10 via-white to-emerald-500/5 border-emerald-200/80'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-emerald-800 uppercase tracking-wider">
              + Te deben
            </span>
            <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl sm:text-3xl font-black text-emerald-700 tracking-tight block">
              +{formatCurrency(totalOwedToMe)}
            </span>
            <p className="text-xs text-emerald-800/80 font-medium mt-1">
              {myOwedToMe.length === 1
                ? '1 cobro pendiente'
                : `${myOwedToMe.length} cobros pendientes`}
            </p>
          </div>
        </div>

        {/* Por pagar (Resta -) */}
        <div
          onClick={() => setActiveFilter('to_pay')}
          className={`rounded-3xl p-5 border shadow-xs relative overflow-hidden transition-all cursor-pointer hover:shadow-md ${
            activeFilter === 'to_pay'
              ? 'ring-2 ring-rose-500 bg-rose-50/80 border-rose-300'
              : 'bg-gradient-to-br from-rose-500/10 via-white to-rose-500/5 border-rose-200/80'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-rose-800 uppercase tracking-wider">
              - Debes
            </span>
            <div className="w-10 h-10 rounded-2xl bg-rose-500 text-white flex items-center justify-center shadow-xs">
              <TrendingDown className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl sm:text-3xl font-black text-rose-600 tracking-tight block">
              -{formatCurrency(totalIOwe)}
            </span>
            <p className="text-xs text-rose-800/80 font-medium mt-1">
              {myIOwe.length === 1 ? '1 pago pendiente' : `${myIOwe.length} pagos pendientes`}
            </p>
          </div>
        </div>

        {/* Balance neto */}
        <div
          onClick={() => setActiveFilter('mine')}
          className={`rounded-3xl p-5 border shadow-xs relative overflow-hidden transition-all cursor-pointer hover:shadow-md ${
            activeFilter === 'mine'
              ? 'ring-2 ring-zinc-900 bg-zinc-100/90 border-zinc-400'
              : 'bg-gradient-to-br from-zinc-100/90 via-white to-zinc-50 border-zinc-200/90'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-zinc-600 uppercase tracking-wider">
              = Tu balance neto
            </span>
            <div className="w-10 h-10 rounded-2xl bg-zinc-900 text-white flex items-center justify-center shadow-xs">
              <ArrowRightLeft className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <span
              className={`text-2xl sm:text-3xl font-black tracking-tight block ${
                netConsolidated > 0
                  ? 'text-emerald-700'
                  : netConsolidated < 0
                  ? 'text-rose-600'
                  : 'text-zinc-900'
              }`}
            >
              {netConsolidated > 0 ? '+' : ''}
              {formatCurrency(netConsolidated)}
            </span>
            <p className="text-xs text-zinc-500 font-medium mt-1">
              {netConsolidated > 0
                ? 'Balance a tu favor'
                : netConsolidated < 0
                ? 'Balance total por pagar'
                : 'Cuentas perfectamente al día'}
            </p>
          </div>
        </div>
      </div>

      {/* UNIFIED BALANCES SECTION */}
      <div className="space-y-4">
        {/* Controls & Filter Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-3xl border border-zinc-200/80 shadow-2xs">
          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
            <button
              type="button"
              onClick={() => setActiveFilter('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold whitespace-nowrap transition-all cursor-pointer flex items-center space-x-1.5 ${
                activeFilter === 'all'
                  ? 'bg-zinc-900 text-white shadow-xs'
                  : 'bg-zinc-100/80 text-zinc-600 hover:bg-zinc-200/70'
              }`}
            >
              <span>Todos los saldos</span>
              <span className="text-[10px] opacity-70">({activePairwise.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveFilter('mine')}
              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold whitespace-nowrap transition-all cursor-pointer flex items-center space-x-1.5 ${
                activeFilter === 'mine'
                  ? 'bg-zinc-900 text-white shadow-xs'
                  : 'bg-zinc-100/80 text-zinc-600 hover:bg-zinc-200/70'
              }`}
            >
              <span>Mis saldos</span>
              <span className="text-[10px] opacity-70">({myOwedToMe.length + myIOwe.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveFilter('to_receive')}
              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold whitespace-nowrap transition-all cursor-pointer flex items-center space-x-1.5 ${
                activeFilter === 'to_receive'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100/80 border border-emerald-200/60'
              }`}
            >
              <span>+ Por cobrar</span>
              <span className="text-[10px] opacity-80">({myOwedToMe.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveFilter('to_pay')}
              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold whitespace-nowrap transition-all cursor-pointer flex items-center space-x-1.5 ${
                activeFilter === 'to_pay'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'bg-rose-50 text-rose-800 hover:bg-rose-100/80 border border-rose-200/60'
              }`}
            >
              <span>- Por pagar</span>
              <span className="text-[10px] opacity-80">({myIOwe.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveFilter('third_party')}
              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold whitespace-nowrap transition-all cursor-pointer flex items-center space-x-1.5 ${
                activeFilter === 'third_party'
                  ? 'bg-zinc-700 text-white shadow-xs'
                  : 'bg-zinc-100/80 text-zinc-600 hover:bg-zinc-200/70'
              }`}
            >
              <span>Entre otros</span>
              <span className="text-[10px] opacity-70">({otherPairwise.length})</span>
            </button>
          </div>

          {/* Search Input */}
          <div className="relative shrink-0 sm:w-60">
            <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por integrante..."
              className="w-full bg-zinc-50 border border-zinc-200/80 rounded-xl pl-8 pr-3 py-1.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:outline-hidden focus:ring-2 focus:ring-zinc-900 transition-all"
            />
          </div>
        </div>

        {/* List of Unified Cards */}
        {filteredPairwiseList.length === 0 ? (
          <div className="bg-white rounded-3xl p-10 border border-zinc-200/80 text-center space-y-3 shadow-2xs">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto ring-1 ring-emerald-200/60 shadow-xs">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h3 className="font-black text-zinc-900 text-base">
              {searchQuery ? 'No se encontraron resultados' : '¡Todas las cuentas están al día!'}
            </h3>
            <p className="text-zinc-500 text-xs max-w-md mx-auto">
              {searchQuery
                ? `No hay deudas registradas que coincidan con "${searchQuery}".`
                : 'No hay deudas pendientes en este filtro. Todos los integrantes están en paz y salvo.'}
            </p>
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="text-xs font-bold text-indigo-700 hover:underline cursor-pointer"
              >
                Limpiar búsqueda
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {filteredPairwiseList.map((pairwise) => {
              const cardKey = `${pairwise.debtor.id}->${pairwise.creditor.id}`;

              return (
                <UnifiedBalanceCard
                  key={cardKey}
                  pairwise={pairwise}
                  currentProfile={currentProfile}
                  isSimplified={isSimplified}
                  onOpenSettleModal={onOpenSettleModal}
                  onSelectPairwise={setSelectedPairwiseForDetail}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Spacious Full-View Pairwise Detail Modal */}
      <PairwiseDetailModal
        isOpen={Boolean(selectedPairwiseForDetail)}
        onClose={() => setSelectedPairwiseForDetail(null)}
        pairwise={selectedPairwiseForDetail}
        currentProfile={currentProfile}
        expenses={userExpenses}
        payments={userPayments}
        profiles={profiles}
        groups={userGroups}
        isSimplified={isSimplified}
        onOpenSettleModal={onOpenSettleModal}
      />

      {/* Proof/Receipt Modal */}
      {selectedProofUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={() => setSelectedProofUrl(null)}
        >
          <div
            className="relative max-w-3xl max-h-[90vh] w-full bg-zinc-950 rounded-2xl overflow-hidden shadow-2xl border border-zinc-800 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-3 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-300">Comprobante de gasto</span>
              <button
                onClick={() => setSelectedProofUrl(null)}
                className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="relative w-full h-[70vh] bg-zinc-900">
              <Image
                src={selectedProofUrl}
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
  );
}
