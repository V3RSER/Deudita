'use client';

import React, { useState, useMemo } from 'react';
import { useExpense } from '@/lib/expense-context';
import { formatCurrency } from '@/lib/balance-utils';
import { GenericExpenseList } from '@/components/GenericExpenseList';
import { TransactionFilterBar, TransactionFilterState } from '@/components/TransactionFilterBar';
import {
  getEffectiveTransactionDate,
  isDateMatchingFilter,
  getAvailableTransactionMonths,
} from '@/lib/transaction-date-utils';

import { Expense, Payment } from '@/lib/types';
import {
  Receipt,
  BarChart3,
  PieChart as PieChartIcon,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
} from 'recharts';

interface AllExpensesViewProps {
  onOpenNewExpense: () => void;
  onEditExpense?: (expense: Expense) => void;
  onEditPayment?: (payment: Payment) => void;
}

const CATEGORY_COLORS: Record<string, string> = {
  Comida: '#10b981', // emerald-500
  Transporte: '#3b82f6', // blue-500
  Hospedaje: '#8b5cf6', // violet-500
  Entretenimiento: '#f59e0b', // amber-500
  Servicios: '#06b6d4', // cyan-500
  Supermercado: '#ec4899', // pink-500
  Varios: '#64748b', // slate-500
};

import { PageHeader } from '@/components/PageHeader';

export function AllExpensesView({ onOpenNewExpense, onEditExpense, onEditPayment }: AllExpensesViewProps) {
  const { currentProfile, expenses, payments, userGroups, profiles, deleteExpense, deletePayment } = useExpense();

  const [filters, setFilters] = useState<TransactionFilterState>({
    scope: 'all',
    dateMode: 'expense_date',
    datePreset: 'all',
    customStartDate: '',
    customEndDate: '',
    groupId: 'all',
    category: 'all',
    searchTerm: '',
  });

  const handleFilterChange = (updates: Partial<TransactionFilterState>) => {
    setFilters((prev) => ({ ...prev, ...updates }));
  };

  const userGroupIds = useMemo(() => new Set(userGroups.map((g) => g.id)), [userGroups]);
  const myExpenses = useMemo(() => expenses.filter((exp) => userGroupIds.has(exp.group_id)), [expenses, userGroupIds]);
  const myPayments = useMemo(() => payments.filter((p) => userGroupIds.has(p.group_id)), [payments, userGroupIds]);

  // Unique categories available
  const categories = useMemo(() => {
    return Array.from(new Set(myExpenses.map((e) => e.category || 'Varios'))).filter(Boolean);
  }, [myExpenses]);

  // Available months according to selected dateMode
  const availableMonths = useMemo(() => {
    return getAvailableTransactionMonths([...myExpenses, ...myPayments], filters.dateMode);
  }, [myExpenses, myPayments, filters.dateMode]);

  // Counts for scope buttons
  const totalTransactionsCount = myExpenses.length + myPayments.length;
  const myInteractionsCount = useMemo(() => {
    const myExpCount = myExpenses.filter((exp) => {
      const isPayer = exp.paid_by === currentProfile?.id;
      const isParticipant = Boolean(exp.splits?.some((s) => s.user_id === currentProfile?.id && s.amount_owed > 0));
      return isPayer || isParticipant;
    }).length;

    const myPayCount = myPayments.filter((p) => {
      return p.paid_by === currentProfile?.id || p.paid_to === currentProfile?.id;
    }).length;

    return myExpCount + myPayCount;
  }, [myExpenses, myPayments, currentProfile?.id]);

  // Filtered expenses
  const filteredExpenses = useMemo(() => {
    return myExpenses.filter((exp) => {
      const group = userGroups.find((g) => g.id === exp.group_id);
      const paidBy = profiles.find((p) => p.id === exp.paid_by);

      // Search term matching
      const matchesSearch =
        !filters.searchTerm.trim() ||
        (exp.description ? exp.description.toLowerCase() : '').includes(filters.searchTerm.toLowerCase()) ||
        (group && group.name ? group.name.toLowerCase().includes(filters.searchTerm.toLowerCase()) : false) ||
        (paidBy && paidBy.full_name ? paidBy.full_name.toLowerCase().includes(filters.searchTerm.toLowerCase()) : false);

      if (!matchesSearch) return false;

      // Group and category
      if (filters.groupId !== 'all' && exp.group_id !== filters.groupId) return false;
      if (filters.category !== 'all' && (exp.category || 'Varios') !== filters.category) return false;

      // Scope (interaction)
      if (filters.scope === 'mine') {
        const isPayer = exp.paid_by === currentProfile?.id;
        const isParticipant = Boolean(exp.splits?.some((s) => s.user_id === currentProfile?.id && s.amount_owed > 0));
        if (!isPayer && !isParticipant) return false;
      }

      // Date filtering using effective date (event vs entry/update)
      const { dateObj } = getEffectiveTransactionDate(exp, filters.dateMode);
      return isDateMatchingFilter(dateObj, filters.datePreset, {
        start: filters.customStartDate,
        end: filters.customEndDate,
      });
    });
  }, [myExpenses, userGroups, profiles, filters, currentProfile?.id]);

  // Filtered payments
  const filteredPayments = useMemo(() => {
    return myPayments.filter((p) => {
      const group = userGroups.find((g) => g.id === p.group_id);
      const payer = profiles.find((prof) => prof.id === p.paid_by);
      const receiver = profiles.find((prof) => prof.id === p.paid_to);

      // Search term matching
      const matchesSearch =
        !filters.searchTerm.trim() ||
        (p.note ? p.note.toLowerCase() : '').includes(filters.searchTerm.toLowerCase()) ||
        (group && group.name ? group.name.toLowerCase().includes(filters.searchTerm.toLowerCase()) : false) ||
        (payer && payer.full_name ? payer.full_name.toLowerCase().includes(filters.searchTerm.toLowerCase()) : false) ||
        (receiver && receiver.full_name ? receiver.full_name.toLowerCase().includes(filters.searchTerm.toLowerCase()) : false);

      if (!matchesSearch) return false;

      // Group
      if (filters.groupId !== 'all' && p.group_id !== filters.groupId) return false;

      // Scope (interaction)
      if (filters.scope === 'mine') {
        const isInteracted = p.paid_by === currentProfile?.id || p.paid_to === currentProfile?.id;
        if (!isInteracted) return false;
      }

      // Date filtering
      const { dateObj } = getEffectiveTransactionDate(p, filters.dateMode);
      return isDateMatchingFilter(dateObj, filters.datePreset, {
        start: filters.customStartDate,
        end: filters.customEndDate,
      });
    });
  }, [myPayments, userGroups, profiles, filters, currentProfile?.id]);

  // Aggregate stats for Chart
  const categoryStats = useMemo(() => {
    const totals: Record<string, number> = {};
    filteredExpenses.forEach((exp) => {
      const cat = exp.category || 'Varios';
      totals[cat] = (totals[cat] || 0) + exp.total_amount;
    });

    return Object.entries(totals).map(([name, value]) => ({
      name,
      value,
      color: CATEGORY_COLORS[name] || '#64748b',
    }));
  }, [filteredExpenses]);

  const totalFilteredSpent = useMemo(() => {
    return filteredExpenses.reduce((acc, curr) => acc + curr.total_amount, 0);
  }, [filteredExpenses]);

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Historial de Gastos y Pagos"
        subtitle="Revisa, filtra por fecha de gasto o fecha de registro, y analiza todos tus movimientos."
        icon={<Receipt className="w-5 h-5" />}
      />

      {/* Chart & Summary Dashboard */}
      {filteredExpenses.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Summary Card */}
          <div className="lg:col-span-1 bg-zinc-900 text-white p-6 rounded-[2rem] shadow-sm flex flex-col justify-between space-y-6">
            <div>
              <div className="flex items-center space-x-2 text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-2">
                <BarChart3 className="w-4 h-4 text-emerald-400" />
                <span>Resumen de Gastos</span>
              </div>
              <p className="text-3xl font-black text-white tracking-tight">
                {formatCurrency(totalFilteredSpent, currentProfile?.currency || 'COP')}
              </p>
              <p className="text-xs text-zinc-400 mt-1">
                Suma total de {filteredExpenses.length} gastos filtrados
              </p>
            </div>

            <div className="pt-4 border-t border-zinc-800 space-y-2">
              <div className="flex justify-between text-xs text-zinc-300">
                <span>Gastos registrados:</span>
                <span className="font-bold text-white">{filteredExpenses.length}</span>
              </div>
              <div className="flex justify-between text-xs text-zinc-300">
                <span>Pagos de deuda registrados:</span>
                <span className="font-bold text-emerald-400">{filteredPayments.length}</span>
              </div>
            </div>
          </div>

          {/* Category Bar Chart */}
          <div className="lg:col-span-2 bg-white p-6 rounded-[2rem] ring-1 ring-zinc-200 shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-zinc-900 text-sm flex items-center space-x-2">
                <PieChartIcon className="w-4 h-4 text-emerald-600" />
                <span>Distribución por Categoría</span>
              </h3>
              <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-widest">Visualización</span>
            </div>

            <div className="h-44 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categoryStats} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#71717a' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#71717a' }} />
                  <Tooltip
                    formatter={(val) => formatCurrency(Number(val) || 0, currentProfile?.currency || 'COP')}
                    contentStyle={{
                      backgroundColor: '#18181b',
                      borderRadius: '12px',
                      color: '#fff',
                      fontSize: '12px',
                      border: 'none',
                    }}
                  />
                  <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                    {categoryStats.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* Unified Transaction Filter Bar */}
      <TransactionFilterBar
        filters={filters}
        onFilterChange={handleFilterChange}
        availableMonths={availableMonths}
        categories={categories}
        userGroups={userGroups}
        showGroupFilter={true}
        showCategoryFilter={true}
        showSearch={true}
        totalCount={totalTransactionsCount}
        myCount={myInteractionsCount}
      />

      {/* Unified Reusable Transaction Feed */}
      <GenericExpenseList
        expenses={filteredExpenses}
        payments={filteredPayments}
        profiles={profiles}
        userGroups={userGroups}
        currentProfile={currentProfile}
        dateFilterMode={filters.dateMode}
        onEditExpense={onEditExpense}
        onDeleteExpense={(expId) => deleteExpense(expId)}
        onEditPayment={onEditPayment}
        onDeletePayment={(payId) => deletePayment(payId)}
        showGroupBadge={true}
      />
    </div>
  );
}
