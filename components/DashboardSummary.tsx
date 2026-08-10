'use client';

import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useExpense } from '@/lib/expense-context';
import { formatCurrency, calculatePairwiseBalances } from '@/lib/balance-utils';
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  ArrowRightLeft,
  Users,
  Plus,
  Receipt,
  ArrowRight,
  Sparkles,
  Calendar,
  CheckCircle2,
} from 'lucide-react';

interface DashboardSummaryProps {
  onOpenNewExpense: () => void;
  onOpenNewGroup: () => void;
  onOpenSettleModal: () => void;
  onOpenScanReceiptModal: () => void;
}

export function DashboardSummary({
  onOpenNewExpense,
  onOpenNewGroup,
  onOpenSettleModal,
  onOpenScanReceiptModal,
}: DashboardSummaryProps) {
  const router = useRouter();
  const { currentProfile, userGroups, expenses, payments, profiles } = useExpense();

  const userGroupIds = new Set(userGroups.map((g) => g.id));
  const userExpenses = expenses.filter((e) => userGroupIds.has(e.group_id));
  const userPayments = payments.filter((s) => userGroupIds.has(s.group_id));

  // Pairwise balances
  const consolidatedPairwise = calculatePairwiseBalances(userExpenses, userPayments, profiles);
  const myOwedToMe = consolidatedPairwise.filter((p) => p.creditor.id === currentProfile?.id);
  const myIOwe = consolidatedPairwise.filter((p) => p.debtor.id === currentProfile?.id);

  const totalOwedToMe = myOwedToMe.reduce((acc, curr) => acc + curr.amount, 0);
  const totalIOwe = myIOwe.reduce((acc, curr) => acc + curr.amount, 0);
  const netBalance = totalOwedToMe - totalIOwe;

  // Recent Expenses (top 5)
  const recentExpenses = userExpenses.slice(0, 5);

  const firstName = currentProfile?.full_name ? currentProfile.full_name.split(' ')[0] : 'Usuario';

  return (
    <div className="space-y-8">
      {/* Welcome Banner */}
      <div className="bg-zinc-900 rounded-[2rem] p-6 sm:p-10 text-white shadow-xl relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center space-x-2 bg-zinc-800/80 px-3 py-1 rounded-full text-xs font-semibold text-zinc-300 ring-1 ring-white/10">
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              <span>Resumen General</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-zinc-50">
              ¡Hola, {firstName}!
            </h1>
            <p className="text-zinc-400 text-sm sm:text-base max-w-xl leading-relaxed">
              Aquí tienes el resumen actualizado de tus grupos, balances y actividad reciente.
            </p>
          </div>
        </div>

        {/* 3 Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-8 relative z-10">
          <div className="bg-zinc-800/50 backdrop-blur-md ring-1 ring-white/10 rounded-2xl p-5">
            <span className="text-[10px] text-zinc-400 uppercase font-bold tracking-wider block">
              Te deben en total
            </span>
            <div className="flex items-center space-x-2 mt-2">
              <TrendingUp className="w-5 h-5 text-emerald-400 shrink-0" />
              <span className="text-2xl font-semibold text-emerald-400 tracking-tight">
                {formatCurrency(totalOwedToMe)}
              </span>
            </div>
          </div>

          <div className="bg-zinc-800/50 backdrop-blur-md ring-1 ring-white/10 rounded-2xl p-5">
            <span className="text-[10px] text-zinc-400 uppercase font-bold tracking-wider block">
              Debes en total
            </span>
            <div className="flex items-center space-x-2 mt-2">
              <TrendingDown className="w-5 h-5 text-rose-400 shrink-0" />
              <span className="text-2xl font-semibold text-rose-400 tracking-tight">
                {formatCurrency(totalIOwe)}
              </span>
            </div>
          </div>

          <div className="bg-zinc-800/50 backdrop-blur-md ring-1 ring-white/10 rounded-2xl p-5">
            <span className="text-[10px] text-zinc-400 uppercase font-bold tracking-wider block">
              Balance Neto
            </span>
            <div className="flex items-center space-x-2 mt-2">
              <ArrowRightLeft className="w-5 h-5 text-zinc-300 shrink-0" />
              <span
                className={`text-2xl font-semibold tracking-tight ${
                  netBalance >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {netBalance >= 0 ? '+' : ''}
                {formatCurrency(netBalance)}
              </span>
            </div>
          </div>
        </div>
        <div className="absolute right-0 top-0 w-1/2 h-full bg-gradient-to-l from-white/5 to-transparent pointer-events-none" />
      </div>

      {/* Quick Action Shortcuts */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <button
          onClick={onOpenSettleModal}
          className="p-5 bg-white hover:bg-zinc-50 rounded-2xl ring-1 ring-zinc-200 shadow-sm hover:shadow-md transition-all active:scale-95 text-left flex flex-col justify-between space-y-3 group min-h-[90px]"
        >
          <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center group-hover:scale-105 transition-transform">
            <Wallet className="w-5 h-5" />
          </div>
          <div>
            <p className="font-semibold text-zinc-900 text-sm">Saldar Cuenta</p>
            <p className="text-xs text-zinc-500">Registrar transferencia</p>
          </div>
        </button>

        <button
          onClick={onOpenScanReceiptModal}
          className="p-5 bg-white hover:bg-zinc-50 rounded-2xl ring-1 ring-zinc-200 shadow-sm hover:shadow-md transition-all active:scale-95 text-left flex flex-col justify-between space-y-3 group min-h-[90px]"
        >
          <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center group-hover:scale-105 transition-transform">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <p className="font-semibold text-zinc-900 text-sm">Escanear Ticket</p>
            <p className="text-xs text-zinc-500">Desglosa foto de boleta</p>
          </div>
        </button>

        <Link
          href="/balances"
          className="p-5 bg-white hover:bg-zinc-50 rounded-2xl ring-1 ring-zinc-200 shadow-sm hover:shadow-md transition-all active:scale-95 text-left flex flex-col justify-between space-y-3 group min-h-[90px]"
        >
          <div className="w-10 h-10 rounded-xl bg-zinc-900 text-white flex items-center justify-center group-hover:scale-105 transition-transform">
            <ArrowRightLeft className="w-5 h-5" />
          </div>
          <div>
            <p className="font-semibold text-zinc-900 text-sm">Ver Balances</p>
            <p className="text-xs text-zinc-500">Cuentas por cobrar y pagar</p>
          </div>
        </Link>

        <Link
          href="/my-expenses"
          className="p-5 bg-white hover:bg-zinc-50 rounded-2xl ring-1 ring-zinc-200 shadow-sm hover:shadow-md transition-all active:scale-95 text-left flex flex-col justify-between space-y-3 group min-h-[90px]"
        >
          <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center group-hover:scale-105 transition-transform">
            <Receipt className="w-5 h-5" />
          </div>
          <div>
            <p className="font-semibold text-zinc-900 text-sm">Historial Gastos</p>
            <p className="text-xs text-zinc-500">Revisar todos los comprobantes</p>
          </div>
        </Link>
      </div>

      {/* Active Groups & Recent Activity Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left 2 Cols: Active Groups */}
        <div className="lg:col-span-2 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-zinc-900 tracking-tight">Mis Grupos Activos</h2>
            <Link
              href="/groups"
              className="text-xs font-semibold text-zinc-600 hover:text-zinc-900 flex items-center space-x-1"
            >
              <span>Ver todos</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {userGroups.length === 0 ? (
            <div className="bg-white rounded-3xl p-8 ring-1 ring-zinc-200 text-center space-y-3">
              <Users className="w-10 h-10 text-zinc-300 mx-auto" />
              <h3 className="font-semibold text-zinc-900 text-base">Aún no tienes grupos activos</h3>
              <p className="text-xs text-zinc-500">Crea un grupo para empezar a dividir cuentas.</p>
              <button
                onClick={onOpenNewGroup}
                className="bg-zinc-900 hover:bg-zinc-800 text-white font-medium px-5 py-2.5 rounded-full text-xs transition-all active:scale-95 shadow-sm"
              >
                Crear primer grupo
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {userGroups.slice(0, 4).map((group) => {
                const groupExp = userExpenses.filter((e) => e.group_id === group.id);
                const totalSpent = groupExp.reduce((acc, curr) => acc + curr.total_amount, 0);

                return (
                  <div
                    key={group.id}
                    onClick={() => router.push(`/groups/${group.id}`)}
                    className="p-5 bg-white rounded-2xl ring-1 ring-zinc-200 hover:ring-zinc-300 shadow-sm hover:shadow-md transition-all cursor-pointer flex flex-col justify-between space-y-4"
                  >
                    <div>
                      <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">
                        {group.category ? group.category : 'GENERAL'}
                      </span>
                      <h3 className="font-semibold text-zinc-900 text-base mt-1 line-clamp-1">
                        {group.name}
                      </h3>
                    </div>

                    <div className="flex items-center justify-between border-t border-zinc-100 pt-3 text-xs text-zinc-500">
                      <span>Total: <strong className="text-zinc-900 font-semibold">{formatCurrency(totalSpent)}</strong></span>
                      <span className="text-emerald-600 font-medium flex items-center space-x-1">
                        <span>Ingresar</span>
                        <ArrowRight className="w-3 h-3" />
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Col: Recent Activity */}
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-zinc-900 tracking-tight">Actividad Reciente</h2>
            <Link
              href="/my-expenses"
              className="text-xs font-semibold text-zinc-600 hover:text-zinc-900 flex items-center space-x-1"
            >
              <span>Ver todos</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="bg-white rounded-2xl ring-1 ring-zinc-200 p-4 divide-y divide-zinc-100 shadow-sm">
            {recentExpenses.length === 0 ? (
              <div className="py-8 text-center text-xs text-zinc-400">
                Aún no hay actividad de gastos registrada.
              </div>
            ) : (
              recentExpenses.map((exp) => {
                const group = userGroups.find((g) => g.id === exp.group_id);
                const paidBy = profiles.find((p) => p.id === exp.paid_by);

                return (
                  <div key={exp.id} className="py-3 text-sm flex items-center justify-between gap-3">
                    <div className="space-y-0.5">
                      <p className="font-semibold text-zinc-900 line-clamp-1">{exp.description}</p>
                      <p className="text-xs text-zinc-500">
                        {group ? group.name : 'Grupo'} • {paidBy ? paidBy.full_name : 'Usuario'}
                      </p>
                    </div>
                    <span className="font-semibold text-zinc-900 shrink-0 text-right">
                      {formatCurrency(exp.total_amount)}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
