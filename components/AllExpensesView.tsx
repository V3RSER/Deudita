'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { useExpense } from '@/lib/expense-context';
import { formatCurrency } from '@/lib/balance-utils';
import {
  Receipt,
  Search,
  Filter,
  Calendar,
  Tag,
  Trash2,
  ChevronDown,
  ChevronUp,
  Plus,
  Pencil,
  FileText,
} from 'lucide-react';
import { Expense } from '@/lib/types';

import { getCategoryConfig } from '@/lib/expense-category-utils';
import { ExpenseDetailModal } from '@/components/ExpenseDetailModal';

interface AllExpensesViewProps {
  onOpenNewExpense: () => void;
  onEditExpense?: (expense: Expense) => void;
}

export function AllExpensesView({ onOpenNewExpense, onEditExpense }: AllExpensesViewProps) {
  const { currentProfile, expenses, userGroups, profiles, deleteExpense } = useExpense();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [expenseFilter, setExpenseFilter] = useState<'all' | 'mine'>('all');
  const [selectedExpenseForModal, setSelectedExpenseForModal] = useState<Expense | null>(null);

  const userGroupIds = new Set(userGroups.map((g) => g.id));
  const myExpenses = expenses.filter((exp) => userGroupIds.has(exp.group_id));

  // Collect unique categories
  const categories = Array.from(new Set(myExpenses.map((e) => e.category || 'Varios'))).filter(Boolean);

  // Filter expenses
  const filtered = myExpenses.filter((exp) => {
    const group = userGroups.find((g) => g.id === exp.group_id);
    const paidBy = profiles.find((p) => p.id === exp.paid_by);

    const matchesSearch =
      (exp.description ? exp.description.toLowerCase() : '').includes(searchTerm.toLowerCase()) ||
      (group && group.name ? group.name.toLowerCase().includes(searchTerm.toLowerCase()) : false) ||
      (paidBy && paidBy.full_name ? paidBy.full_name.toLowerCase().includes(searchTerm.toLowerCase()) : false);

    const matchesGroup = selectedGroupId === 'all' || exp.group_id === selectedGroupId;
    const matchesCategory = selectedCategory === 'all' || exp.category === selectedCategory;

    let matchesInteraction = true;
    if (expenseFilter === 'mine') {
      const isPayer = exp.paid_by === currentProfile?.id;
      const isParticipant = Boolean(exp.splits?.some((s) => s.user_id === currentProfile?.id && s.amount_owed > 0));
      matchesInteraction = Boolean(isPayer || isParticipant);
    }

    return matchesSearch && matchesGroup && matchesCategory && matchesInteraction;
  });

  const totalFilteredSpent = filtered.reduce((acc, curr) => acc + curr.total_amount, 0);

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5 bg-white p-8 rounded-[2rem] ring-1 ring-zinc-200 shadow-sm">
        <div>
          <h1 className="text-3xl font-semibold text-zinc-900 tracking-tight">Historial de Gastos</h1>
          <p className="text-sm text-zinc-500 mt-1 max-w-xl">
            Consulta todos los gastos registrados en tus grupos con su desglose de ítems y responsables.
          </p>
        </div>

        <button
          onClick={onOpenNewExpense}
          className="flex items-center space-x-2 bg-zinc-900 hover:bg-zinc-800 text-white font-medium px-5 py-3 rounded-full text-sm shadow-sm transition-all active:scale-95 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Registrar Gasto</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-5 rounded-2xl ring-1 ring-zinc-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
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
              Todos los gastos
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
              En los que interactúo
            </button>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-4">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-zinc-400 absolute left-4 top-3.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por descripción, grupo o persona..."
              className="w-full pl-11 pr-4 py-2.5 bg-zinc-50 border-none ring-1 ring-zinc-200 rounded-xl text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900 transition-all placeholder:text-zinc-400"
            />
          </div>

          {/* Group Filter */}
          <select
            value={selectedGroupId}
            onChange={(e) => setSelectedGroupId(e.target.value)}
            className="bg-zinc-50 border-none ring-1 ring-zinc-200 rounded-xl px-4 py-2.5 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900 transition-all"
          >
            <option value="all">Todos los grupos</option>
            {userGroups.map((g, idx) => (
              <option key={g.id || `group-${idx}`} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>

          {/* Category Filter */}
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="bg-zinc-50 border-none ring-1 ring-zinc-200 rounded-xl px-4 py-2.5 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900 transition-all"
          >
            <option value="all">Todas las categorías</option>
            {categories.map((c, idx) => (
              <option key={`cat-${c}-${idx}`} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Metric Summary Bar */}
      <div className="flex items-center justify-between px-2 text-sm">
        <span className="text-zinc-500 font-medium">
          Mostrando <strong className="text-zinc-900">{filtered.length}</strong> gastos
        </span>
        <span className="text-zinc-900 font-medium tracking-tight">
          Suma total: <strong className="text-emerald-600 font-semibold text-base ml-1">{formatCurrency(totalFilteredSpent)}</strong>
        </span>
      </div>

      {/* Expense List */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl ring-1 ring-zinc-200 p-16 text-center text-zinc-500">
          <Receipt className="w-12 h-12 text-zinc-300 mx-auto mb-4" />
          <h3 className="font-semibold text-zinc-900 text-lg">No se encontraron gastos</h3>
          <p className="text-sm text-zinc-500 mt-1.5">Prueba cambiando los filtros de búsqueda.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((exp) => {
            const group = userGroups.find((g) => g.id === exp.group_id);
            const paidBy = profiles.find((p) => p.id === exp.paid_by);
            const catConfig = getCategoryConfig(exp.category);
            const CategoryIcon = catConfig.icon;

            const isPayer = exp.paid_by === currentProfile?.id;
            const mySplit = exp.splits?.find((s) => s.user_id === currentProfile?.id)?.amount_owed || 0;

            let statusText = 'No participas';
            let statusBg = 'bg-zinc-100 text-zinc-600 border-zinc-200';

            if (isPayer) {
              const recovers = exp.total_amount - mySplit;
              if (recovers > 0) {
                statusText = `Recuperas ${formatCurrency(recovers)}`;
                statusBg = 'bg-emerald-50 text-emerald-800 border-emerald-200';
              } else {
                statusText = `Pagaste ${formatCurrency(exp.total_amount)}`;
                statusBg = 'bg-emerald-50 text-emerald-800 border-emerald-200';
              }
            } else if (mySplit > 0) {
              statusText = `Debes ${formatCurrency(mySplit)}`;
              statusBg = 'bg-rose-50 text-rose-800 border-rose-200';
            }

            return (
              <div
                key={exp.id}
                onClick={() => setSelectedExpenseForModal(exp)}
                className="bg-white rounded-2xl ring-1 ring-zinc-200/90 p-5 shadow-2xs hover:shadow-md hover:ring-zinc-300 transition-all cursor-pointer group active:scale-[0.99]"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
                  <div className="flex items-start space-x-4">
                    {/* Category SVG Icon */}
                    <div className={`p-3 rounded-2xl border border-zinc-200/60 ${catConfig.bgClass} ${catConfig.textClass} shrink-0 mt-0.5`}>
                      <CategoryIcon className="w-5 h-5" />
                    </div>

                    <div>
                      <div className="flex items-center space-x-2.5">
                        <h3 className="font-bold text-zinc-900 text-base group-hover:text-emerald-700 transition-colors">
                          {exp.description}
                        </h3>
                        {exp.source === 'gmail' && (
                          <span className="bg-zinc-900 text-white text-[10px] uppercase font-semibold tracking-widest px-2 py-0.5 rounded-md">
                            AI
                          </span>
                        )}
                      </div>

                      {exp.notes && (
                        <p className="text-xs text-zinc-600 mt-1 flex items-center space-x-1 font-normal bg-zinc-50 px-2 py-1 rounded-md border border-zinc-100 w-fit">
                          <FileText className="w-3 h-3 text-zinc-400 shrink-0" />
                          <span>{exp.notes}</span>
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500 mt-1.5">
                        <span className="font-semibold text-zinc-700 bg-zinc-100 px-2.5 py-1 rounded-md">
                          {group ? group.name : 'Grupo'}
                        </span>
                        <span>•</span>
                        <span className="flex items-center space-x-1 font-medium">
                          <Calendar className="w-3 h-3 text-zinc-400" />
                          <span>{exp.expense_date}</span>
                        </span>
                        <span>•</span>
                        <span>
                          Pagó:{' '}
                          <strong className="text-zinc-800 font-semibold">{paidBy ? paidBy.full_name : 'Alguien'}</strong>
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-5 border-t sm:border-t-0 pt-4 sm:pt-0 border-zinc-100">
                    <div className="text-right">
                      <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block">
                        Total: {formatCurrency(exp.total_amount)}
                      </span>
                      <div className={`mt-1 inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold border ${statusBg}`}>
                        {statusText}
                      </div>
                    </div>

                    <div className="flex items-center space-x-1.5 bg-zinc-50/80 p-1 rounded-xl" onClick={(e) => e.stopPropagation()}>
                      {onEditExpense && (
                        <button
                          type="button"
                          onClick={() => onEditExpense(exp)}
                          className="p-1.5 hover:bg-zinc-200 hover:text-zinc-900 rounded-lg text-zinc-500 transition-colors"
                          title="Editar gasto"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => deleteExpense(exp.id)}
                        className="p-1.5 hover:bg-rose-50 hover:text-rose-600 rounded-lg text-zinc-400 transition-colors"
                        title="Eliminar gasto"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Expense Detail Modal */}
      {selectedExpenseForModal && (
        <ExpenseDetailModal
          expense={selectedExpenseForModal}
          isOpen={Boolean(selectedExpenseForModal)}
          onClose={() => setSelectedExpenseForModal(null)}
          onEditExpense={(exp) => {
            setSelectedExpenseForModal(null);
            if (onEditExpense) onEditExpense(exp);
          }}
        />
      )}
    </div>
  );
}
