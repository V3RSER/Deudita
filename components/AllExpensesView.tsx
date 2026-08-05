'use client';

import React, { useState } from 'react';
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
} from 'lucide-react';

interface AllExpensesViewProps {
  onOpenNewExpense: () => void;
}

export function AllExpensesView({ onOpenNewExpense }: AllExpensesViewProps) {
  const { expenses, groups, profiles, deleteExpense } = useExpense();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Collect unique categories
  const categories = Array.from(new Set(expenses.map((e) => e.category)));

  // Filter expenses
  const filtered = expenses.filter((exp) => {
    const group = groups.find((g) => g.id === exp.group_id);
    const paidBy = profiles.find((p) => p.id === exp.paid_by);

    const matchesSearch =
      exp.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (group && group.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (paidBy && paidBy.full_name.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesGroup = selectedGroupId === 'all' || exp.group_id === selectedGroupId;
    const matchesCategory = selectedCategory === 'all' || exp.category === selectedCategory;

    return matchesSearch && matchesGroup && matchesCategory;
  });

  const totalFilteredSpent = filtered.reduce((acc, curr) => acc + curr.total_amount, 0);

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Historial de Gastos</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Consulta todos los gastos registrados en tus grupos con su desglose de ítems y responsables.
          </p>
        </div>

        <button
          onClick={onOpenNewExpense}
          className="flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-4 py-2.5 rounded-xl text-sm shadow-sm transition self-start sm:self-auto"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span>+ Registrar Gasto</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por descripción, grupo o persona..."
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
          />
        </div>

        {/* Group Filter */}
        <select
          value={selectedGroupId}
          onChange={(e) => setSelectedGroupId(e.target.value)}
          className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
        >
          <option value="all">Todos los grupos</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>

        {/* Category Filter */}
        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
        >
          <option value="all">Todas las categorías</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {/* Metric Summary Bar */}
      <div className="flex items-center justify-between px-2 text-sm">
        <span className="text-slate-500 font-medium">
          Mostrando <strong>{filtered.length}</strong> gastos
        </span>
        <span className="text-slate-800 font-bold">
          Suma total: <strong className="text-emerald-600">{formatCurrency(totalFilteredSpent)}</strong>
        </span>
      </div>

      {/* Expense List */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-500">
          <Receipt className="w-12 h-12 text-slate-300 mx-auto mb-2" />
          <h3 className="font-bold text-slate-800">No se encontraron gastos</h3>
          <p className="text-xs text-slate-500 mt-1">Prueba cambiando los filtros de búsqueda.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((exp) => {
            const group = groups.find((g) => g.id === exp.group_id);
            const paidBy = profiles.find((p) => p.id === exp.paid_by);
            const isExpanded = expandedId === exp.id;
            const hasItems = exp.items && exp.items.length > 0;

            return (
              <div
                key={exp.id}
                className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:border-slate-300 transition"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-start space-x-3">
                    <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600 font-bold shrink-0 border border-indigo-100">
                      <Receipt className="w-5 h-5 text-indigo-600" />
                    </div>

                    <div>
                      <div className="flex items-center space-x-2">
                        <h3 className="font-bold text-slate-900 text-base">{exp.description}</h3>
                        {exp.source === 'gmail' && (
                          <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                            Gmail AI
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 mt-1">
                        <span className="font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100/60">
                          {group ? group.name : 'Grupo'}
                        </span>
                        <span>•</span>
                        <span className="flex items-center space-x-1">
                          <Calendar className="w-3.5 h-3.5" />
                          <span>{exp.expense_date}</span>
                        </span>
                        <span>•</span>
                        <span>
                          Pagó:{' '}
                          <strong className="text-slate-700">{paidBy ? paidBy.full_name : 'Alguien'}</strong>
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-4 border-t sm:border-t-0 pt-3 sm:pt-0 border-slate-100">
                    <div className="text-right">
                      <span className="text-lg font-extrabold text-slate-900 block">
                        {formatCurrency(exp.total_amount)}
                      </span>
                      <span className="text-xs text-slate-400 block">
                        {(exp.splits ? exp.splits : []).length} divididos
                      </span>
                    </div>

                    <div className="flex items-center space-x-1">
                      {hasItems && (
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : exp.id)}
                          className="p-2 hover:bg-slate-100 rounded-xl text-slate-600 text-xs font-semibold flex items-center space-x-1 transition"
                        >
                          <span>Ítems</span>
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </button>
                      )}

                      <button
                        onClick={() => deleteExpense(exp.id)}
                        className="p-2 hover:bg-rose-50 rounded-xl text-slate-400 hover:text-rose-600 transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && hasItems && (
                  <div className="mt-4 pt-4 border-t border-slate-100 bg-slate-50/80 -mx-5 -mb-5 p-5 rounded-b-2xl space-y-3">
                    <h4 className="text-xs font-bold uppercase text-slate-500 tracking-wider">
                      Desglose de Ítems ({exp.items?.length})
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {exp.items?.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between bg-white px-3 py-2 rounded-xl border border-slate-200 text-xs"
                        >
                          <span className="font-medium text-slate-700">{item.description}</span>
                          <span className="font-bold text-slate-900">
                            {formatCurrency(item.amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
