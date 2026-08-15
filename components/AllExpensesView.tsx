'use client';

import React, { useState, useMemo } from 'react';
import { useExpense } from '@/lib/expense-context';
import { formatCurrency } from '@/lib/balance-utils';
import { GenericExpenseList } from '@/components/GenericExpenseList';

import { Expense, Payment } from '@/lib/types';
import {
  Receipt,
  Search,
  Plus,
  BarChart3,
  PieChart as PieChartIcon,
  Calendar,
  Filter,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  PieChart,
  Pie,
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
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [expenseFilter, setExpenseFilter] = useState<'all' | 'mine'>('all');


  const userGroupIds = useMemo(() => new Set(userGroups.map((g) => g.id)), [userGroups]);
  const myExpenses = useMemo(() => expenses.filter((exp) => userGroupIds.has(exp.group_id)), [expenses, userGroupIds]);
  const myPayments = useMemo(() => payments.filter((p) => userGroupIds.has(p.group_id)), [payments, userGroupIds]);

  // Unique categories and months available
  const categories = useMemo(() => {
    return Array.from(new Set(myExpenses.map((e) => e.category || 'Varios'))).filter(Boolean);
  }, [myExpenses]);

  const months = useMemo(() => {
    const monthSet = new Set<string>();
    myExpenses.forEach((e) => {
      if (e.expense_date) {
        monthSet.add(e.expense_date.substring(0, 7)); // YYYY-MM
      }
    });
    return Array.from(monthSet).sort().reverse();
  }, [myExpenses]);

  // Filtered expenses and payments
  const filteredExpenses = useMemo(() => {
    return myExpenses.filter((exp) => {
      const group = userGroups.find((g) => g.id === exp.group_id);
      const paidBy = profiles.find((p) => p.id === exp.paid_by);

      const matchesSearch =
        (exp.description ? exp.description.toLowerCase() : '').includes(searchTerm.toLowerCase()) ||
        (group && group.name ? group.name.toLowerCase().includes(searchTerm.toLowerCase()) : false) ||
        (paidBy && paidBy.full_name ? paidBy.full_name.toLowerCase().includes(searchTerm.toLowerCase()) : false);

      const matchesGroup = selectedGroupId === 'all' || exp.group_id === selectedGroupId;
      const matchesCategory = selectedCategory === 'all' || exp.category === selectedCategory;
      const matchesMonth = selectedMonth === 'all' || (exp.expense_date && exp.expense_date.startsWith(selectedMonth));

      let matchesInteraction = true;
      if (expenseFilter === 'mine') {
        const isPayer = exp.paid_by === currentProfile?.id;
        const isParticipant = Boolean(exp.splits?.some((s) => s.user_id === currentProfile?.id && s.amount_owed > 0));
        matchesInteraction = Boolean(isPayer || isParticipant);
      }

      return matchesSearch && matchesGroup && matchesCategory && matchesMonth && matchesInteraction;
    });
  }, [myExpenses, userGroups, profiles, searchTerm, selectedGroupId, selectedCategory, selectedMonth, expenseFilter, currentProfile]);

  const filteredPayments = useMemo(() => {
    return myPayments.filter((p) => {
      const matchesGroup = selectedGroupId === 'all' || p.group_id === selectedGroupId;
      const matchesMonth = selectedMonth === 'all' || (p.payment_date && p.payment_date.startsWith(selectedMonth));

      let matchesInteraction = true;
      if (expenseFilter === 'mine') {
        matchesInteraction = p.paid_by === currentProfile?.id || p.paid_to === currentProfile?.id;
      }

      return matchesGroup && matchesMonth && matchesInteraction;
    });
  }, [myPayments, selectedGroupId, selectedMonth, expenseFilter, currentProfile]);

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
        subtitle="Revisa, filtra y analiza todos tus movimientos."
        icon={<Receipt className="w-5 h-5" />}
      />

      {/* Chart & Summary Dashboard */}
      {filteredExpenses.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Summary Cards */}
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

      {/* Filter Controls Bar */}
      <div className="bg-white p-5 rounded-2xl ring-1 ring-zinc-200 shadow-2xs space-y-4">
        <div className="flex flex-wrap items-center justify-between border-b border-zinc-100 pb-3 gap-3">
          <div className="flex items-center space-x-1 bg-zinc-100/80 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setExpenseFilter('all')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                expenseFilter === 'all'
                  ? 'bg-white text-zinc-900 shadow-2xs'
                  : 'text-zinc-500 hover:text-zinc-900'
              }`}
            >
              Todos los movimientos
            </button>
            <button
              type="button"
              onClick={() => setExpenseFilter('mine')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                expenseFilter === 'mine'
                  ? 'bg-white text-zinc-900 shadow-2xs'
                  : 'text-zinc-500 hover:text-zinc-900'
              }`}
            >
              Mis interacciones
            </button>
          </div>

          <div className="flex items-center space-x-2 text-xs font-semibold text-zinc-500">
            <Filter className="w-3.5 h-3.5 text-zinc-400" />
            <span>Filtros avanzados</span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          {/* Search */}
          <div className="relative col-span-1 sm:col-span-2 md:col-span-1">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-3" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar..."
              className="w-full pl-10 pr-3 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent transition-all placeholder:text-zinc-400"
            />
          </div>

          {/* Month / Date Filter */}
          <div>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-full bg-zinc-50 border border-zinc-200 hover:bg-zinc-100/80 hover:border-zinc-300 rounded-xl px-3 py-2.5 text-xs text-zinc-900 font-semibold focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent transition-all cursor-pointer"
            >
              <option value="all">Todos los meses / fechas</option>
              {months.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          {/* Group Filter */}
          <div>
            <select
              value={selectedGroupId}
              onChange={(e) => setSelectedGroupId(e.target.value)}
              className="w-full bg-zinc-50 border border-zinc-200 hover:bg-zinc-100/80 hover:border-zinc-300 rounded-xl px-3 py-2.5 text-xs text-zinc-900 font-semibold focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent transition-all cursor-pointer"
            >
              <option value="all">Todos los grupos</option>
              {userGroups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>

          {/* Category Filter */}
          <div>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full bg-zinc-50 border border-zinc-200 hover:bg-zinc-100/80 hover:border-zinc-300 rounded-xl px-3 py-2.5 text-xs text-zinc-900 font-semibold focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent transition-all cursor-pointer"
            >
              <option value="all">Todas las categorías</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Unified Reusable Transaction Feed */}
      <GenericExpenseList
        expenses={filteredExpenses}
        payments={filteredPayments}
        profiles={profiles}
        userGroups={userGroups}
        currentProfile={currentProfile}
        onEditExpense={onEditExpense}
        onDeleteExpense={(expId) => deleteExpense(expId)}
        onEditPayment={onEditPayment}
        onDeletePayment={(payId) => deletePayment(payId)}
        showGroupBadge={true}
      />


    </div>
  );
}
