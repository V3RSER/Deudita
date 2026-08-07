'use client';

import React from 'react';
import Image from 'next/image';
import { useExpense } from '@/lib/expense-context';
import { formatCurrency, calculatePairwiseBalances, calculateUserSummaries } from '@/lib/balance-utils';
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  ArrowRightLeft,
  CheckCircle2,
  Users,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

interface ConsolidatedBalancesProps {
  onOpenSettleModal: (groupId?: string, debtorId?: string, creditorId?: string, amount?: number) => void;
}

export function ConsolidatedBalances({ onOpenSettleModal }: ConsolidatedBalancesProps) {
  const { currentProfile, expenses, payments, profiles, userGroups } = useExpense();

  const userGroupIds = new Set(userGroups.map((g) => g.id));
  const userExpenses = expenses.filter((e) => userGroupIds.has(e.group_id));
  const userPayments = payments.filter((s) => userGroupIds.has(s.group_id));

  // Consolidated Pairwise Balances across user's groups
  const consolidatedPairwise = calculatePairwiseBalances(userExpenses, userPayments, profiles);

  // Filter pairwise balances involving current profile
  const myOwedToMe = consolidatedPairwise.filter((p) => p.creditor.id === currentProfile?.id);
  const myIOwe = consolidatedPairwise.filter((p) => p.debtor.id === currentProfile?.id);

  const totalOwedToMe = myOwedToMe.reduce((acc, curr) => acc + curr.amount, 0);
  const totalIOwe = myIOwe.reduce((acc, curr) => acc + curr.amount, 0);
  const netConsolidated = totalOwedToMe - totalIOwe;

  return (
    <div className="space-y-8">
      {/* Top Banner */}
      <div className="bg-zinc-900 rounded-[2rem] p-8 sm:p-10 text-white shadow-xl relative overflow-hidden">
        <div className="relative z-10">
          <div className="flex items-center space-x-3 text-zinc-400 font-semibold text-[10px] uppercase tracking-widest mb-3">
            <Wallet className="w-4 h-4 text-zinc-300" />
            <span>Vista Consolidada Global</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-zinc-50">
            Balances Cuentas Claras
          </h1>
          <p className="text-zinc-400 text-base mt-3 max-w-2xl leading-relaxed">
            Resumen consolidado de todas tus deudas y cobros pendientes sumando todos los grupos en los que participas.
          </p>
        </div>

        {/* 3 Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mt-8 relative z-10">
          {/* Owed to me */}
          <div className="bg-zinc-800/50 backdrop-blur-md ring-1 ring-white/10 rounded-2xl p-6 relative overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-500/50"></div>
            <span className="text-[10px] text-zinc-400 uppercase font-bold tracking-widest block">
              Te Deben en Total
            </span>
            <div className="flex items-center space-x-2.5 mt-2">
              <TrendingUp className="w-5 h-5 text-emerald-400 shrink-0" />
              <span className="text-2xl sm:text-3xl font-semibold text-emerald-400 tracking-tight">
                {formatCurrency(totalOwedToMe)}
              </span>
            </div>
          </div>

          {/* I owe */}
          <div className="bg-zinc-800/50 backdrop-blur-md ring-1 ring-white/10 rounded-2xl p-6 relative overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-rose-500/50"></div>
            <span className="text-[10px] text-zinc-400 uppercase font-bold tracking-widest block">
              Debes en Total
            </span>
            <div className="flex items-center space-x-2.5 mt-2">
              <TrendingDown className="w-5 h-5 text-rose-400 shrink-0" />
              <span className="text-2xl sm:text-3xl font-semibold text-rose-400 tracking-tight">
                {formatCurrency(totalIOwe)}
              </span>
            </div>
          </div>

          {/* Net */}
          <div className="bg-zinc-800/50 backdrop-blur-md ring-1 ring-white/10 rounded-2xl p-6 relative overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-zinc-500/50"></div>
            <span className="text-[10px] text-zinc-400 uppercase font-bold tracking-widest block">
              Balance Neto Total
            </span>
            <div className="flex items-center space-x-2.5 mt-2">
              <ArrowRightLeft className="w-5 h-5 text-zinc-300 shrink-0" />
              <span
                className={`text-2xl sm:text-3xl font-semibold tracking-tight ${
                  netConsolidated >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {netConsolidated >= 0 ? '+' : ''}
                {formatCurrency(netConsolidated)}
              </span>
            </div>
          </div>
        </div>
        <div className="absolute right-0 top-0 w-1/2 h-full bg-gradient-to-l from-white/5 to-transparent pointer-events-none" />
      </div>

      {/* Main Section: People Owe You */}
      <div className="space-y-5">
        <h2 className="text-xl font-semibold text-zinc-900 tracking-tight flex items-center space-x-2">
          <TrendingUp className="w-5 h-5 text-emerald-500" />
          <span>Personas que te deben dinero <span className="text-zinc-400 font-normal">({myOwedToMe.length})</span></span>
        </h2>

        {myOwedToMe.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 ring-1 ring-zinc-200 text-center text-zinc-500 text-sm">
            Nadie te debe dinero actualmente.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {myOwedToMe.map((p, idx) => (
              <div
                key={idx}
                className="bg-white rounded-2xl p-6 ring-1 ring-zinc-200 shadow-sm hover:shadow-md hover:ring-zinc-300 transition-all flex items-center justify-between"
              >
                <div className="flex items-center space-x-4">
                  {p.debtor.avatar_url ? (
                    <Image
                      src={p.debtor.avatar_url}
                      alt={p.debtor.full_name}
                      width={48}
                      height={48}
                      className="w-12 h-12 rounded-full object-cover ring-2 ring-emerald-100"
                      unoptimized
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full ring-2 ring-emerald-100 bg-zinc-800 text-white flex items-center justify-center text-base font-bold">
                      {p.debtor.full_name ? p.debtor.full_name.charAt(0).toUpperCase() : 'U'}
                    </div>
                  )}
                  <div>
                    <h3 className="font-semibold text-zinc-900 text-base tracking-tight">{p.debtor.full_name}</h3>
                    <p className="text-xs text-zinc-500 mt-0.5">{p.debtor.email}</p>
                    <p className="text-sm font-semibold text-emerald-600 mt-1 tracking-tight">
                      Te debe {formatCurrency(p.amount)}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() =>
                    onOpenSettleModal(undefined, p.debtor.id, currentProfile?.id ?? '', p.amount)
                  }
                  className="bg-zinc-900 hover:bg-zinc-800 text-white font-medium px-5 py-2.5 rounded-full text-xs shadow-sm transition-all active:scale-95"
                >
                  Saldar
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Section: People You Owe */}
      <div className="space-y-5 pt-6">
        <h2 className="text-xl font-semibold text-zinc-900 tracking-tight flex items-center space-x-2">
          <TrendingDown className="w-5 h-5 text-rose-500" />
          <span>Personas a las que les debes dinero <span className="text-zinc-400 font-normal">({myIOwe.length})</span></span>
        </h2>

        {myIOwe.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 ring-1 ring-zinc-200 text-center text-zinc-500 text-sm">
            No tienes deudas pendientes con nadie.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {myIOwe.map((p, idx) => (
              <div
                key={idx}
                className="bg-white rounded-2xl p-6 ring-1 ring-zinc-200 shadow-sm hover:shadow-md hover:ring-zinc-300 transition-all flex items-center justify-between"
              >
                <div className="flex items-center space-x-4">
                  {p.creditor.avatar_url ? (
                    <Image
                      src={p.creditor.avatar_url}
                      alt={p.creditor.full_name}
                      width={48}
                      height={48}
                      className="w-12 h-12 rounded-full object-cover ring-2 ring-rose-100"
                      unoptimized
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full ring-2 ring-rose-100 bg-zinc-800 text-white flex items-center justify-center text-base font-bold">
                      {p.creditor.full_name ? p.creditor.full_name.charAt(0).toUpperCase() : 'U'}
                    </div>
                  )}
                  <div>
                    <h3 className="font-semibold text-zinc-900 text-base tracking-tight">{p.creditor.full_name}</h3>
                    <p className="text-xs text-zinc-500 mt-0.5">{p.creditor.email}</p>
                    <p className="text-sm font-semibold text-rose-600 mt-1 tracking-tight">
                      Le debes {formatCurrency(p.amount)}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() =>
                    onOpenSettleModal(undefined, currentProfile?.id ?? '', p.creditor.id, p.amount)
                  }
                  className="bg-zinc-900 hover:bg-zinc-800 text-white font-medium px-5 py-2.5 rounded-full text-xs shadow-sm transition-all active:scale-95"
                >
                  Pagar
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* All Other Member Balances (Simplified Grid) */}
      <div className="space-y-5 pt-6">
        <h2 className="text-xl font-semibold text-zinc-900 tracking-tight flex items-center space-x-2">
          <Users className="w-5 h-5 text-zinc-600" />
          <span>Todas las Cuentas entre Terceros</span>
        </h2>

        {consolidatedPairwise.length === 0 ? (
          <div className="bg-white rounded-2xl p-10 ring-1 ring-zinc-200 text-center">
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
            <h3 className="font-semibold text-zinc-900 text-lg tracking-tight">¡Cero Deudas Pendientes en la Plataforma!</h3>
          </div>
        ) : (
          <div className="bg-white rounded-2xl ring-1 ring-zinc-200 divide-y divide-zinc-100 overflow-hidden shadow-sm">
            {consolidatedPairwise.map((p, idx) => (
              <div
                key={idx}
                className="p-5 flex flex-col sm:flex-row sm:items-center justify-between text-sm hover:bg-zinc-50 transition-colors gap-4"
              >
                <div className="flex items-center space-x-3">
                  <span className="font-semibold text-zinc-900">{p.debtor.full_name}</span>
                  <span className="text-[10px] text-zinc-400 uppercase font-bold tracking-widest">le debe a</span>
                  <span className="font-semibold text-zinc-900">{p.creditor.full_name}</span>
                </div>

                <div className="flex items-center justify-between sm:justify-end w-full sm:w-auto space-x-4">
                  <span className="font-semibold text-lg text-zinc-900 tracking-tight">
                    {formatCurrency(p.amount)}
                  </span>
                  <button
                    onClick={() =>
                      onOpenSettleModal(undefined, p.debtor.id, p.creditor.id, p.amount)
                    }
                    className="text-xs bg-white hover:bg-zinc-50 text-zinc-900 font-medium px-4 py-2 rounded-full ring-1 ring-zinc-200 transition-all shadow-sm active:scale-95"
                  >
                    Saldar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
