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

interface AllExpensesViewProps {
  onOpenNewExpense: () => void;
  onEditExpense?: (expense: Expense) => void;
}

export function AllExpensesView({ onOpenNewExpense, onEditExpense }: AllExpensesViewProps) {
  const { expenses, userGroups, profiles, deleteExpense } = useExpense();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

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

    return matchesSearch && matchesGroup && matchesCategory;
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
      <div className="bg-white p-5 rounded-2xl ring-1 ring-zinc-200 shadow-sm flex flex-col md:flex-row gap-4">
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
            const isExpanded = expandedId === exp.id;
            const hasItems = exp.items && exp.items.length > 0;

            return (
              <div
                key={exp.id}
                className="bg-white rounded-2xl ring-1 ring-zinc-200 p-6 shadow-sm hover:shadow-md transition-all"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
                  <div className="flex items-start space-x-4">
                    <div className="w-12 h-12 bg-zinc-50 rounded-2xl flex items-center justify-center text-zinc-400 font-bold shrink-0 ring-1 ring-zinc-100">
                      <Receipt className="w-5 h-5" />
                    </div>

                    <div>
                      <div className="flex items-center space-x-2.5">
                        <h3 className="font-semibold text-zinc-900 text-base">{exp.description}</h3>
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
                          <Calendar className="w-3 h-3" />
                          <span>{exp.expense_date}</span>
                        </span>
                        <span>•</span>
                        <span>
                          Pagó:{' '}
                          <strong className="text-zinc-700 font-medium">{paidBy ? paidBy.full_name : 'Alguien'}</strong>
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-5 border-t sm:border-t-0 pt-4 sm:pt-0 border-zinc-100">
                    <div className="text-right">
                      <span className="text-xl font-semibold text-zinc-900 block tracking-tight">
                        {formatCurrency(exp.total_amount)}
                      </span>
                      <span className="text-xs text-zinc-400 block mt-0.5 font-medium">
                        {(exp.splits ? exp.splits : []).length} divididos
                      </span>
                    </div>

                    <div className="flex items-center space-x-1.5 bg-zinc-50/80 p-1 rounded-xl">
                      {(hasItems || exp.receipt_url) && (
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : exp.id)}
                          className="px-3 py-1.5 hover:bg-white rounded-lg text-zinc-600 text-xs font-medium flex items-center space-x-1.5 transition-colors shadow-sm"
                        >
                          <span>{exp.receipt_url ? 'Detalles / Recibo' : 'Ítems'}</span>
                          {isExpanded ? (
                            <ChevronUp className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5" />
                          )}
                        </button>
                      )}

                      {onEditExpense && (
                        <button
                          onClick={() => onEditExpense(exp)}
                          className="p-1.5 hover:bg-zinc-200 hover:text-zinc-900 rounded-lg text-zinc-500 transition-colors"
                          title="Editar gasto"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                      )}

                      <button
                        onClick={() => deleteExpense(exp.id)}
                        className="p-1.5 hover:bg-rose-50 hover:text-rose-600 rounded-lg text-zinc-400 transition-colors"
                        title="Eliminar gasto"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="mt-6 pt-5 border-t border-zinc-100 space-y-5">
                    {hasItems && (
                      <div>
                        <h4 className="text-[10px] font-bold uppercase text-zinc-400 tracking-widest mb-3">
                          Desglose de Ítems ({exp.items?.length})
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {exp.items?.map((item) => (
                            <div
                              key={item.id}
                              className="flex items-center justify-between bg-zinc-50 px-4 py-3 rounded-xl ring-1 ring-zinc-100 text-sm"
                            >
                              <span className="font-medium text-zinc-600">{item.description}</span>
                              <span className="font-semibold text-zinc-900">
                                {formatCurrency(item.amount)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {exp.receipt_url && (
                      <div>
                        <h4 className="text-[10px] font-bold uppercase text-zinc-400 tracking-widest mb-3">
                          Comprobante de Pago Adjunto
                        </h4>
                        <div className="relative max-w-sm rounded-2xl overflow-hidden border border-zinc-200 bg-zinc-50 p-2">
                          <a
                            href={exp.receipt_url}
                            target="_blank"
                            rel="noreferrer"
                            className="block relative w-full h-48 rounded-xl overflow-hidden group"
                          >
                            <Image
                              src={exp.receipt_url}
                              alt="Recibo"
                              fill
                              className="object-cover group-hover:scale-105 transition-transform duration-200"
                              unoptimized
                              referrerPolicy="no-referrer"
                            />
                            <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-semibold">
                              Ver imagen completa ↗
                            </div>
                          </a>
                        </div>
                      </div>
                    )}
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
