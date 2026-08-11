'use client';

import React from 'react';
import Image from 'next/image';
import { useExpense } from '@/lib/expense-context';
import { Payment } from '@/lib/types';
import { formatCurrency, calculatePairwiseBalances } from '@/lib/balance-utils';
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  ArrowRightLeft,
  Users,
  CheckCircle2,
  ArrowRight,
} from 'lucide-react';

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
  const { currentProfile, expenses, payments, profiles, userGroups } = useExpense();

  const userGroupIds = new Set(userGroups.map((g) => g.id));
  const userExpenses = expenses.filter((e) => userGroupIds.has(e.group_id));
  const userPayments = payments.filter((s) => userGroupIds.has(s.group_id));

  // Pairwise Balances across user's groups
  const consolidatedPairwise = calculatePairwiseBalances(userExpenses, userPayments, profiles);

  // Filter pairwise balances
  const myOwedToMe = consolidatedPairwise.filter((p) => p.creditor.id === currentProfile?.id);
  const myIOwe = consolidatedPairwise.filter((p) => p.debtor.id === currentProfile?.id);
  const otherPairwise = consolidatedPairwise.filter(
    (p) => p.creditor.id !== currentProfile?.id && p.debtor.id !== currentProfile?.id
  );

  const totalOwedToMe = myOwedToMe.reduce((acc, curr) => acc + curr.amount, 0);
  const totalIOwe = myIOwe.reduce((acc, curr) => acc + curr.amount, 0);
  const netConsolidated = totalOwedToMe - totalIOwe;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center space-x-2 bg-zinc-100 text-zinc-700 px-3 py-1 rounded-full text-xs font-semibold mb-2 ring-1 ring-zinc-200/80">
            <Wallet className="w-3.5 h-3.5 text-zinc-500" />
            <span>Saldos y deudas</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-zinc-900">
            Balances
          </h1>
          <p className="text-zinc-500 text-sm sm:text-base mt-1 max-w-2xl leading-relaxed">
            Resumen de cobros, pagos pendientes y saldos entre integrantes de tus grupos.
          </p>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Por cobrar */}
        <div className="bg-white rounded-2xl p-5 ring-1 ring-zinc-200/80 shadow-2xs relative overflow-hidden transition-all hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
              Por cobrar
            </span>
            <div className="w-9 h-9 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl sm:text-3xl font-bold text-emerald-600 tracking-tight">
              {formatCurrency(totalOwedToMe)}
            </span>
            <p className="text-xs text-zinc-500 mt-1">
              {myOwedToMe.length === 1
                ? '1 persona te debe'
                : `${myOwedToMe.length} personas te deben`}
            </p>
          </div>
        </div>

        {/* Por pagar */}
        <div className="bg-white rounded-2xl p-5 ring-1 ring-zinc-200/80 shadow-2xs relative overflow-hidden transition-all hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
              Por pagar
            </span>
            <div className="w-9 h-9 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
              <TrendingDown className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl sm:text-3xl font-bold text-rose-600 tracking-tight">
              {formatCurrency(totalIOwe)}
            </span>
            <p className="text-xs text-zinc-500 mt-1">
              {myIOwe.length === 1
                ? 'Debes a 1 persona'
                : `Debes a ${myIOwe.length} personas`}
            </p>
          </div>
        </div>

        {/* Balance neto */}
        <div className="bg-white rounded-2xl p-5 ring-1 ring-zinc-200/80 shadow-2xs relative overflow-hidden transition-all hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
              Balance neto
            </span>
            <div className="w-9 h-9 rounded-full bg-zinc-100 text-zinc-700 flex items-center justify-center shrink-0">
              <ArrowRightLeft className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span
              className={`text-2xl sm:text-3xl font-bold tracking-tight ${
                netConsolidated > 0
                  ? 'text-emerald-600'
                  : netConsolidated < 0
                  ? 'text-rose-600'
                  : 'text-zinc-900'
              }`}
            >
              {netConsolidated > 0 ? '+' : ''}
              {formatCurrency(netConsolidated)}
            </span>
            <p className="text-xs text-zinc-500 mt-1">
              {netConsolidated > 0
                ? 'Balance general a tu favor'
                : netConsolidated < 0
                ? 'Balance general en contra'
                : 'Todas tus cuentas están al día'}
            </p>
          </div>
        </div>
      </div>

      {/* Section 1: Por cobrar */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-900 tracking-tight flex items-center space-x-2">
            <TrendingUp className="w-5 h-5 text-emerald-600" />
            <span>Por cobrar</span>
            <span className="ml-2 text-xs font-medium bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full">
              {myOwedToMe.length}
            </span>
          </h2>
        </div>

        {myOwedToMe.length === 0 ? (
          <div className="bg-white rounded-2xl p-6 ring-1 ring-zinc-200/80 text-center text-zinc-500 text-sm">
            Nadie te debe dinero actualmente.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {myOwedToMe.map((p, idx) => (
              <div
                key={idx}
                className="bg-white rounded-2xl p-5 ring-1 ring-zinc-200/80 shadow-2xs hover:shadow-md hover:ring-zinc-300 transition-all flex items-center justify-between gap-4"
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
                    <div className="w-12 h-12 rounded-full ring-2 ring-emerald-100 bg-zinc-900 text-white flex items-center justify-center text-base font-bold shrink-0">
                      {getInitials(p.debtor.full_name)}
                    </div>
                  )}
                  <div className="min-w-0">
                    <h3 className="font-semibold text-zinc-900 text-sm tracking-tight truncate">
                      {p.debtor.full_name ? p.debtor.full_name : 'Usuario'}
                    </h3>
                    {p.debtor.email ? (
                      <p className="text-xs text-zinc-500 truncate mt-0.5">{p.debtor.email}</p>
                    ) : null}
                    <div className="mt-1.5 inline-flex items-center space-x-1 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full ring-1 ring-emerald-200/60">
                      <span>Te debe {formatCurrency(p.amount)}</span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() =>
                    onOpenSettleModal(undefined, p.debtor.id, currentProfile?.id ? currentProfile.id : '', p.amount)
                  }
                  className="bg-zinc-900 hover:bg-zinc-800 text-white font-medium px-4 py-2.5 rounded-full text-xs transition-all active:scale-95 shrink-0 shadow-2xs"
                >
                  Saldar
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Section 2: Por pagar */}
      <div className="space-y-4 pt-2">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-900 tracking-tight flex items-center space-x-2">
            <TrendingDown className="w-5 h-5 text-rose-600" />
            <span>Por pagar</span>
            <span className="ml-2 text-xs font-medium bg-rose-100 text-rose-800 px-2.5 py-0.5 rounded-full">
              {myIOwe.length}
            </span>
          </h2>
        </div>

        {myIOwe.length === 0 ? (
          <div className="bg-white rounded-2xl p-6 ring-1 ring-zinc-200/80 text-center text-zinc-500 text-sm">
            No tienes deudas pendientes con nadie.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {myIOwe.map((p, idx) => (
              <div
                key={idx}
                className="bg-white rounded-2xl p-5 ring-1 ring-zinc-200/80 shadow-2xs hover:shadow-md hover:ring-zinc-300 transition-all flex items-center justify-between gap-4"
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
                    <div className="w-12 h-12 rounded-full ring-2 ring-rose-100 bg-zinc-900 text-white flex items-center justify-center text-base font-bold shrink-0">
                      {getInitials(p.creditor.full_name)}
                    </div>
                  )}
                  <div className="min-w-0">
                    <h3 className="font-semibold text-zinc-900 text-sm tracking-tight truncate">
                      {p.creditor.full_name ? p.creditor.full_name : 'Usuario'}
                    </h3>
                    {p.creditor.email ? (
                      <p className="text-xs text-zinc-500 truncate mt-0.5">{p.creditor.email}</p>
                    ) : null}
                    <div className="mt-1.5 inline-flex items-center space-x-1 text-xs font-semibold text-rose-700 bg-rose-50 px-2.5 py-0.5 rounded-full ring-1 ring-rose-200/60">
                      <span>Le debes {formatCurrency(p.amount)}</span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() =>
                    onOpenSettleModal(undefined, currentProfile?.id ? currentProfile.id : '', p.creditor.id, p.amount)
                  }
                  className="bg-zinc-900 hover:bg-zinc-800 text-white font-medium px-4 py-2.5 rounded-full text-xs transition-all active:scale-95 shrink-0 shadow-2xs"
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
          <h2 className="text-lg font-semibold text-zinc-900 tracking-tight flex items-center space-x-2">
            <Users className="w-5 h-5 text-zinc-600" />
            <span>Saldos entre integrantes</span>
            <span className="ml-2 text-xs font-medium bg-zinc-100 text-zinc-700 px-2.5 py-0.5 rounded-full">
              {otherPairwise.length}
            </span>
          </h2>
        </div>

        {otherPairwise.length === 0 ? (
          <div className="bg-white rounded-2xl p-6 ring-1 ring-zinc-200/80 text-center text-zinc-500 text-sm">
            No hay deudas pendientes entre otros integrantes de tus grupos.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {otherPairwise.map((p, idx) => (
              <div
                key={idx}
                className="bg-white rounded-2xl p-5 ring-1 ring-zinc-200/80 shadow-2xs hover:shadow-md hover:ring-zinc-300 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
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
                    <div className="flex items-center space-x-1.5 text-sm font-semibold text-zinc-900 truncate">
                      <span className="truncate">{p.debtor.full_name ? p.debtor.full_name : 'Usuario'}</span>
                      <ArrowRight className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                      <span className="truncate">{p.creditor.full_name ? p.creditor.full_name : 'Usuario'}</span>
                    </div>
                    <p className="text-xs text-zinc-500">
                      Debe <span className="font-semibold text-zinc-800">{formatCurrency(p.amount)}</span>
                    </p>
                  </div>
                </div>

                <button
                  onClick={() =>
                    onOpenSettleModal(undefined, p.debtor.id, p.creditor.id, p.amount)
                  }
                  className="bg-zinc-900 hover:bg-zinc-800 text-white font-medium px-4 py-2 rounded-full text-xs transition-all active:scale-95 shrink-0 shadow-2xs self-end sm:self-center"
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

