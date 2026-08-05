'use client';

import React from 'react';
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
  const { currentProfile, expenses, settlements, profiles, groups } = useExpense();

  // Consolidated Pairwise Balances across ALL groups
  const consolidatedPairwise = calculatePairwiseBalances(expenses, settlements, profiles);

  // Filter pairwise balances involving current profile
  const myOwedToMe = consolidatedPairwise.filter((p) => p.creditor.id === currentProfile.id);
  const myIOwe = consolidatedPairwise.filter((p) => p.debtor.id === currentProfile.id);

  const totalOwedToMe = myOwedToMe.reduce((acc, curr) => acc + curr.amount, 0);
  const totalIOwe = myIOwe.reduce((acc, curr) => acc + curr.amount, 0);
  const netConsolidated = totalOwedToMe - totalIOwe;

  return (
    <div className="space-y-8">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-indigo-900 via-slate-900 to-indigo-950 rounded-3xl p-6 sm:p-8 text-white border border-indigo-900/50 shadow-lg">
        <div className="flex items-center space-x-3 text-indigo-300 font-bold text-xs uppercase tracking-wider mb-2">
          <Wallet className="w-4 h-4 text-indigo-400" />
          <span>Vista Consolidada Global</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
          Balances Cuentas Claras
        </h1>
        <p className="text-indigo-100/80 text-sm mt-1 max-w-2xl leading-relaxed">
          Resumen consolidado de todas tus deudas y cobros pendientes sumando todos los grupos en los que participas.
        </p>

        {/* 3 Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
          {/* Owed to me */}
          <div className="bg-white/10 backdrop-blur-md border border-white/10 border-l-4 border-l-emerald-500 rounded-xl p-4">
            <span className="text-xs text-indigo-200 uppercase font-semibold block">
              Te Deben en Total
            </span>
            <div className="flex items-center space-x-2 mt-1">
              <TrendingUp className="w-5 h-5 text-emerald-400 shrink-0" />
              <span className="text-xl sm:text-2xl font-bold text-emerald-400">
                {formatCurrency(totalOwedToMe)}
              </span>
            </div>
          </div>

          {/* I owe */}
          <div className="bg-white/10 backdrop-blur-md border border-white/10 border-l-4 border-l-rose-500 rounded-xl p-4">
            <span className="text-xs text-indigo-200 uppercase font-semibold block">
              Debes en Total
            </span>
            <div className="flex items-center space-x-2 mt-1">
              <TrendingDown className="w-5 h-5 text-rose-400 shrink-0" />
              <span className="text-xl sm:text-2xl font-bold text-rose-400">
                {formatCurrency(totalIOwe)}
              </span>
            </div>
          </div>

          {/* Net */}
          <div className="bg-white/10 backdrop-blur-md border border-white/10 border-l-4 border-l-indigo-400 rounded-xl p-4">
            <span className="text-xs text-indigo-200 uppercase font-semibold block">
              Balance Neto Total
            </span>
            <div className="flex items-center space-x-2 mt-1">
              <ArrowRightLeft className="w-5 h-5 text-indigo-300 shrink-0" />
              <span
                className={`text-xl sm:text-2xl font-bold ${
                  netConsolidated >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {netConsolidated >= 0 ? '+' : ''}
                {formatCurrency(netConsolidated)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Section: People Owe You */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-slate-900 flex items-center space-x-2">
          <TrendingUp className="w-5 h-5 text-emerald-500" />
          <span>Personas que te deben dinero ({myOwedToMe.length})</span>
        </h2>

        {myOwedToMe.length === 0 ? (
          <div className="bg-white rounded-2xl p-6 border border-slate-200 text-center text-slate-500 text-sm">
            Nadie te debe dinero actualmente.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {myOwedToMe.map((p, idx) => (
              <div
                key={idx}
                className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm hover:border-emerald-300 transition flex items-center justify-between"
              >
                <div className="flex items-center space-x-3">
                  <img
                    src={p.debtor.avatar_url}
                    alt={p.debtor.full_name}
                    className="w-12 h-12 rounded-full object-cover border-2 border-emerald-200"
                  />
                  <div>
                    <h3 className="font-bold text-slate-900 text-base">{p.debtor.full_name}</h3>
                    <p className="text-xs text-slate-500">{p.debtor.email}</p>
                    <p className="text-xs font-semibold text-emerald-600 mt-1">
                      Te debe {formatCurrency(p.amount)}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() =>
                    onOpenSettleModal(undefined, p.debtor.id, currentProfile.id, p.amount)
                  }
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-3.5 py-2 rounded-xl text-xs shadow-sm transition"
                >
                  Saldar
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Section: People You Owe */}
      <div className="space-y-4 pt-4">
        <h2 className="text-lg font-bold text-slate-900 flex items-center space-x-2">
          <TrendingDown className="w-5 h-5 text-rose-500" />
          <span>Personas a las que les debes dinero ({myIOwe.length})</span>
        </h2>

        {myIOwe.length === 0 ? (
          <div className="bg-white rounded-2xl p-6 border border-slate-200 text-center text-slate-500 text-sm">
            No tienes deudas pendientes con nadie.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {myIOwe.map((p, idx) => (
              <div
                key={idx}
                className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm hover:border-rose-300 transition flex items-center justify-between"
              >
                <div className="flex items-center space-x-3">
                  <img
                    src={p.creditor.avatar_url}
                    alt={p.creditor.full_name}
                    className="w-12 h-12 rounded-full object-cover border-2 border-rose-200"
                  />
                  <div>
                    <h3 className="font-bold text-slate-900 text-base">{p.creditor.full_name}</h3>
                    <p className="text-xs text-slate-500">{p.creditor.email}</p>
                    <p className="text-xs font-semibold text-rose-600 mt-1">
                      Le debes {formatCurrency(p.amount)}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() =>
                    onOpenSettleModal(undefined, currentProfile.id, p.creditor.id, p.amount)
                  }
                  className="bg-slate-900 hover:bg-slate-800 text-white font-bold px-3.5 py-2 rounded-xl text-xs transition"
                >
                  Registrar Pago
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* All Other Member Balances (Simplified Grid) */}
      <div className="space-y-4 pt-4">
        <h2 className="text-lg font-bold text-slate-900 flex items-center space-x-2">
          <Users className="w-5 h-5 text-slate-600" />
          <span>Todas las Cuentas entre Terceros</span>
        </h2>

        {consolidatedPairwise.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 border border-slate-200 text-center">
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-2" />
            <h3 className="font-bold text-slate-800">¡Cero Deudas Pendientes en la Plataforma!</h3>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden shadow-sm">
            {consolidatedPairwise.map((p, idx) => (
              <div
                key={idx}
                className="p-4 flex items-center justify-between text-sm hover:bg-slate-50/80 transition"
              >
                <div className="flex items-center space-x-3">
                  <span className="font-bold text-slate-800">{p.debtor.full_name}</span>
                  <span className="text-xs text-slate-400 uppercase font-semibold">le debe a</span>
                  <span className="font-bold text-slate-800">{p.creditor.full_name}</span>
                </div>

                <div className="flex items-center space-x-3">
                  <span className="font-extrabold text-emerald-600">
                    {formatCurrency(p.amount)}
                  </span>
                  <button
                    onClick={() =>
                      onOpenSettleModal(undefined, p.debtor.id, p.creditor.id, p.amount)
                    }
                    className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold px-2.5 py-1 rounded-lg transition"
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
