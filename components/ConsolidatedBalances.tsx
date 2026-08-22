'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { useExpense } from '@/lib/expense-context';
import { Payment } from '@/lib/types';
import {
  formatCurrency,
  calculateSimplifiedBalances,
  calculateDirectBalances,
} from '@/lib/balance-utils';
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  ArrowRightLeft,
  Users,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  Split,
  Layers,
  Info,
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';

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

export function ConsolidatedBalances({ onOpenSettleModal }: ConsolidatedBalancesProps) {
  const { currentProfile, expenses, payments, profiles, userGroups, sponsorshipMap } = useExpense();
  const [isSimplified, setIsSimplified] = useState(true);

  const userGroupIds = new Set(userGroups.map((g) => g.id));
  const userExpenses = expenses.filter((e) => userGroupIds.has(e.group_id));
  const userPayments = payments.filter((s) => userGroupIds.has(s.group_id));

  // Compute both simplified and direct pairwise balances with sponsorship support
  const simplifiedPairwise = calculateSimplifiedBalances(userExpenses, userPayments, profiles);
  const directPairwise = calculateDirectBalances(userExpenses, userPayments, profiles);

  const activePairwise = isSimplified ? simplifiedPairwise : directPairwise;

  // Filter pairwise balances
  const myOwedToMe = activePairwise.filter((p) => p.creditor.id === currentProfile?.id);
  const myIOwe = activePairwise.filter((p) => p.debtor.id === currentProfile?.id);
  const otherPairwise = activePairwise.filter(
    (p) => p.creditor.id !== currentProfile?.id && p.debtor.id !== currentProfile?.id
  );

  const totalOwedToMe = myOwedToMe.reduce((acc, curr) => acc + curr.amount, 0);
  const totalIOwe = myIOwe.reduce((acc, curr) => acc + curr.amount, 0);
  const netConsolidated = totalOwedToMe - totalIOwe;

  const directTransactionsCount = directPairwise.length;
  const simplifiedTransactionsCount = simplifiedPairwise.length;
  const savedTransactions = Math.max(0, directTransactionsCount - simplifiedTransactionsCount);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Balances & Pagos"
        subtitle="Resumen de deudas pendientes, cobros por recibir y liquidaciones de cuentas entre integrantes."
        icon={<Wallet className="w-5 h-5" />}
        actions={
          <div className="flex items-center gap-2">
            {isSimplified && savedTransactions > 0 && (
              <span className="hidden sm:inline-flex items-center space-x-1 text-[10px] font-bold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-200/60">
                <Sparkles className="w-3 h-3" />
                <span>Ahorra {savedTransactions} {savedTransactions === 1 ? 'pago' : 'pagos'}</span>
              </span>
            )}
            <div className="inline-flex items-center p-0.5 bg-zinc-100/90 rounded-xl border border-zinc-200/80 shrink-0">
              <button
                type="button"
                onClick={() => setIsSimplified(true)}
                className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  isSimplified
                    ? 'bg-white text-zinc-900 shadow-2xs'
                    : 'text-zinc-500 hover:text-zinc-800'
                }`}
              >
                <Sparkles className={`w-3 h-3 ${isSimplified ? 'text-emerald-600' : 'text-zinc-400'}`} />
                <span>Simplificado</span>
                <span className="text-[10px] opacity-60">({simplifiedTransactionsCount})</span>
              </button>

              <button
                type="button"
                onClick={() => setIsSimplified(false)}
                className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  !isSimplified
                    ? 'bg-white text-zinc-900 shadow-2xs'
                    : 'text-zinc-500 hover:text-zinc-800'
                }`}
              >
                <Layers className={`w-3 h-3 ${!isSimplified ? 'text-zinc-900' : 'text-zinc-400'}`} />
                <span>Directo</span>
                <span className="text-[10px] opacity-60">({directTransactionsCount})</span>
              </button>
            </div>
          </div>
        }
      />

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Por cobrar */}
        <div className="bg-gradient-to-br from-emerald-500/10 via-white to-emerald-500/5 rounded-3xl p-5 border border-emerald-200/80 shadow-xs relative overflow-hidden transition-all hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-emerald-800 uppercase tracking-wider">
              Te deben
            </span>
            <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl sm:text-3xl font-black text-emerald-700 tracking-tight block">
              {formatCurrency(totalOwedToMe)}
            </span>
            <p className="text-xs text-emerald-800/80 font-medium mt-1">
              {myOwedToMe.length === 1
                ? '1 persona te debe dinero'
                : `${myOwedToMe.length} personas te deben dinero`}
            </p>
          </div>
        </div>

        {/* Por pagar */}
        <div className="bg-gradient-to-br from-rose-500/10 via-white to-rose-500/5 rounded-3xl p-5 border border-rose-200/80 shadow-xs relative overflow-hidden transition-all hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-rose-800 uppercase tracking-wider">
              Debes
            </span>
            <div className="w-10 h-10 rounded-2xl bg-rose-500 text-white flex items-center justify-center shadow-xs">
              <TrendingDown className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl sm:text-3xl font-black text-rose-600 tracking-tight block">
              {formatCurrency(totalIOwe)}
            </span>
            <p className="text-xs text-rose-800/80 font-medium mt-1">
              {myIOwe.length === 1
                ? 'Debes a 1 persona'
                : `Debes a ${myIOwe.length} personas`}
            </p>
          </div>
        </div>

        {/* Balance neto */}
        <div className="bg-gradient-to-br from-zinc-100/90 via-white to-zinc-50 rounded-3xl p-5 border border-zinc-200/90 shadow-xs relative overflow-hidden transition-all hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-zinc-600 uppercase tracking-wider">
              Balance neto
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
                ? 'Balance total en contra'
                : 'Cuentas perfectamente al día'}
            </p>
          </div>
        </div>
      </div>

      {/* Section 1: Por cobrar */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-extrabold text-zinc-900 tracking-tight flex items-center space-x-2">
            <TrendingUp className="w-4 h-4 text-emerald-600" />
            <span>Por cobrar</span>
            <span className="ml-2 text-[11px] font-extrabold bg-emerald-100 text-emerald-900 px-2.5 py-0.5 rounded-full">
              {myOwedToMe.length}
            </span>
          </h2>
        </div>

        {myOwedToMe.length === 0 ? (
          <div className="bg-white rounded-3xl p-8 border border-zinc-200/80 text-center space-y-2 shadow-2xs">
            <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <p className="font-bold text-zinc-900 text-sm">Nadie te debe dinero</p>
            <p className="text-zinc-400 text-xs">Todos tus integrantes están al día contigo.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {myOwedToMe.map((p, idx) => (
              <div
                key={idx}
                className="bg-white rounded-3xl p-5 border border-zinc-200/80 shadow-2xs hover:shadow-md hover:border-zinc-300 transition-all flex items-center justify-between gap-4"
              >
                <div className="flex items-center space-x-3.5 min-w-0">
                  {p.debtor.avatar_url ? (
                    <Image
                      src={p.debtor.avatar_url}
                      alt={p.debtor.full_name ? p.debtor.full_name : 'Avatar'}
                      width={48}
                      height={48}
                      className="w-12 h-12 rounded-full object-cover ring-2 ring-emerald-100 shrink-0"
                      unoptimized
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full ring-2 ring-emerald-100 bg-zinc-900 text-white flex items-center justify-center text-sm font-bold shrink-0">
                      {getInitials(p.debtor.full_name)}
                    </div>
                  )}
                  <div className="min-w-0">
                    <h3 className="font-extrabold text-zinc-900 text-sm tracking-tight truncate">
                      {p.debtor.full_name ? p.debtor.full_name : 'Usuario'}
                    </h3>
                    <div className="mt-1 inline-flex items-center space-x-1 text-xs font-black text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200/60">
                      <span>Te debe {formatCurrency(p.amount)}</span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() =>
                    onOpenSettleModal(undefined, p.debtor.id, currentProfile?.id ? currentProfile.id : undefined, p.amount)
                  }
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold px-4 py-2.5 rounded-2xl text-xs transition-all shadow-xs active:scale-95 shrink-0 cursor-pointer"
                >
                  Registrar pago
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Section 2: Por pagar */}
      <div className="space-y-4 pt-2">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-extrabold text-zinc-900 tracking-tight flex items-center space-x-2">
            <TrendingDown className="w-4 h-4 text-rose-600" />
            <span>Por pagar</span>
            <span className="ml-2 text-[11px] font-extrabold bg-rose-100 text-rose-900 px-2.5 py-0.5 rounded-full">
              {myIOwe.length}
            </span>
          </h2>
        </div>

        {myIOwe.length === 0 ? (
          <div className="bg-white rounded-3xl p-8 border border-zinc-200/80 text-center space-y-2 shadow-2xs">
            <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
              <Sparkles className="w-5 h-5" />
            </div>
            <p className="font-bold text-zinc-900 text-sm">¡Estás al día!</p>
            <p className="text-zinc-400 text-xs">No tienes deudas pendientes con nadie.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {myIOwe.map((p, idx) => (
              <div
                key={idx}
                className="bg-white rounded-3xl p-5 border border-zinc-200/80 shadow-2xs hover:shadow-md hover:border-zinc-300 transition-all flex items-center justify-between gap-4"
              >
                <div className="flex items-center space-x-3.5 min-w-0">
                  {p.creditor.avatar_url ? (
                    <Image
                      src={p.creditor.avatar_url}
                      alt={p.creditor.full_name ? p.creditor.full_name : 'Avatar'}
                      width={48}
                      height={48}
                      className="w-12 h-12 rounded-full object-cover ring-2 ring-rose-100 shrink-0"
                      unoptimized
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full ring-2 ring-rose-100 bg-zinc-900 text-white flex items-center justify-center text-sm font-bold shrink-0">
                      {getInitials(p.creditor.full_name)}
                    </div>
                  )}
                  <div className="min-w-0">
                    <h3 className="font-extrabold text-zinc-900 text-sm tracking-tight truncate">
                      {p.creditor.full_name ? p.creditor.full_name : 'Usuario'}
                    </h3>
                    <div className="mt-1 inline-flex items-center space-x-1 text-xs font-black text-rose-700 bg-rose-50 px-2.5 py-0.5 rounded-full border border-rose-200/60">
                      <span>Le debes {formatCurrency(p.amount)}</span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() =>
                    onOpenSettleModal(undefined, currentProfile?.id ? currentProfile.id : undefined, p.creditor.id, p.amount)
                  }
                  className="bg-zinc-900 hover:bg-zinc-800 text-white font-extrabold px-5 py-2.5 rounded-2xl text-xs transition-all shadow-xs active:scale-95 shrink-0 cursor-pointer"
                >
                  Pagar
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Section 3: Saldos entre integrantes */}
      <div className="space-y-4 pt-2">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-extrabold text-zinc-900 tracking-tight flex items-center space-x-2">
            <Users className="w-4 h-4 text-zinc-600" />
            <span>Saldos entre integrantes</span>
            <span className="ml-2 text-[11px] font-extrabold bg-zinc-100 text-zinc-700 px-2.5 py-0.5 rounded-full">
              {otherPairwise.length}
            </span>
          </h2>
        </div>

        {otherPairwise.length === 0 ? (
          <div className="bg-white rounded-3xl p-6 border border-zinc-200/80 text-center text-zinc-400 text-xs">
            No hay deudas registradas entre otros integrantes de tus grupos.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {otherPairwise.map((p, idx) => (
              <div
                key={idx}
                className="bg-white rounded-3xl p-5 border border-zinc-200/80 shadow-2xs hover:shadow-md hover:border-zinc-300 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="flex items-center space-x-3.5 min-w-0">
                  <div className="flex items-center -space-x-2 overflow-hidden shrink-0">
                    {p.debtor.avatar_url ? (
                      <Image
                        src={p.debtor.avatar_url}
                        alt={p.debtor.full_name ? p.debtor.full_name : 'Avatar'}
                        width={36}
                        height={36}
                        className="inline-block h-9 w-9 rounded-full ring-2 ring-white object-cover"
                        unoptimized
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="inline-block h-9 w-9 rounded-full ring-2 ring-white bg-zinc-900 text-white flex items-center justify-center text-xs font-bold shrink-0">
                        {getInitials(p.debtor.full_name)}
                      </div>
                    )}
                    {p.creditor.avatar_url ? (
                      <Image
                        src={p.creditor.avatar_url}
                        alt={p.creditor.full_name ? p.creditor.full_name : 'Avatar'}
                        width={36}
                        height={36}
                        className="inline-block h-9 w-9 rounded-full ring-2 ring-white object-cover"
                        unoptimized
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="inline-block h-9 w-9 rounded-full ring-2 ring-white bg-zinc-700 text-white flex items-center justify-center text-xs font-bold shrink-0">
                        {getInitials(p.creditor.full_name)}
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center space-x-1.5 text-xs font-extrabold text-zinc-900 truncate">
                      <span className="truncate">{p.debtor.full_name ? p.debtor.full_name : 'Usuario'}</span>
                      <ArrowRight className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                      <span className="truncate">{p.creditor.full_name ? p.creditor.full_name : 'Usuario'}</span>
                    </div>
                    <p className="text-xs text-zinc-500 font-medium">
                      Debe <span className="font-extrabold text-zinc-900">{formatCurrency(p.amount)}</span>
                    </p>
                  </div>
                </div>

                <button
                  onClick={() =>
                    onOpenSettleModal(undefined, p.debtor.id, p.creditor.id, p.amount)
                  }
                  className="bg-zinc-100 hover:bg-zinc-200 text-zinc-900 font-bold px-4 py-2 rounded-xl text-xs transition-all active:scale-95 shrink-0 self-end sm:self-center cursor-pointer"
                >
                  Saldar
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
