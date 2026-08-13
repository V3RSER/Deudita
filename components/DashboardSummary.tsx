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

import { PageHeader } from '@/components/PageHeader';

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
      <PageHeader 
        title={`¡Hola, ${firstName}!`}
        subtitle="Aquí tienes el resumen actualizado de tus balances y actividad reciente."
        icon={<Sparkles className="w-4 h-4" />}
      />

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <div className="bg-white rounded-2xl p-6 ring-1 ring-zinc-200 shadow-sm flex flex-col justify-center">
          <span className="text-xs text-zinc-500 uppercase font-bold tracking-wider block">
            Te deben
          </span>
          <div className="flex items-center space-x-2 mt-2">
            <TrendingUp className="w-5 h-5 text-emerald-500 shrink-0" />
            <span className="text-2xl font-bold text-zinc-900 tracking-tight">
              {formatCurrency(totalOwedToMe)}
            </span>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-6 ring-1 ring-zinc-200 shadow-sm flex flex-col justify-center">
          <span className="text-xs text-zinc-500 uppercase font-bold tracking-wider block">
            Debes
          </span>
          <div className="flex items-center space-x-2 mt-2">
            <TrendingDown className="w-5 h-5 text-rose-500 shrink-0" />
            <span className="text-2xl font-bold text-zinc-900 tracking-tight">
              {formatCurrency(totalIOwe)}
            </span>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-6 ring-1 ring-zinc-200 shadow-sm flex flex-col justify-center">
          <span className="text-xs text-zinc-500 uppercase font-bold tracking-wider block">
            Balance neto
          </span>
          <div className="flex items-center space-x-2 mt-2">
            <ArrowRightLeft className="w-5 h-5 text-zinc-400 shrink-0" />
            <span
              className={`text-2xl font-bold tracking-tight ${
                netBalance >= 0 ? 'text-emerald-600' : 'text-rose-600'
              }`}
            >
              {netBalance >= 0 ? '+' : ''}
              {formatCurrency(netBalance)}
            </span>
          </div>
        </div>
      </div>

      {/* Quick Action Shortcuts */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <button
          onClick={onOpenNewExpense}
          className="p-5 bg-white hover:bg-zinc-50 rounded-2xl ring-1 ring-zinc-200 shadow-sm hover:shadow-md transition-all active:scale-95 text-left flex flex-col justify-between space-y-3 group min-h-[90px]"
        >
          <div className="w-10 h-10 rounded-xl bg-zinc-900 text-white flex items-center justify-center group-hover:scale-105 transition-transform">
            <Plus className="w-5 h-5" />
          </div>
          <div>
            <p className="font-semibold text-zinc-900 text-sm">Nuevo Gasto</p>
            <p className="text-xs text-zinc-500">Añadir gasto</p>
          </div>
        </button>

        <button
          onClick={onOpenSettleModal}
          className="p-5 bg-white hover:bg-zinc-50 rounded-2xl ring-1 ring-zinc-200 shadow-sm hover:shadow-md transition-all active:scale-95 text-left flex flex-col justify-between space-y-3 group min-h-[90px]"
        >
          <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center group-hover:scale-105 transition-transform">
            <Wallet className="w-5 h-5" />
          </div>
          <div>
            <p className="font-semibold text-zinc-900 text-sm">Saldar Cuenta</p>
            <p className="text-xs text-zinc-500">Registrar pago</p>
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
            <p className="text-xs text-zinc-500">Desglosar comprobante</p>
          </div>
        </button>

        <Link
          href="/balances"
          className="p-5 bg-white hover:bg-zinc-50 rounded-2xl ring-1 ring-zinc-200 shadow-sm hover:shadow-md transition-all active:scale-95 text-left flex flex-col justify-between space-y-3 group min-h-[90px]"
        >
          <div className="w-10 h-10 rounded-xl bg-zinc-800 text-white flex items-center justify-center group-hover:scale-105 transition-transform">
            <ArrowRightLeft className="w-5 h-5" />
          </div>
          <div>
            <p className="font-semibold text-zinc-900 text-sm">Ver Balances</p>
            <p className="text-xs text-zinc-500">Balances generales</p>
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
            <p className="text-xs text-zinc-500">Todos los comprobantes</p>
          </div>
        </Link>
      </div>
    </div>
  );
}
