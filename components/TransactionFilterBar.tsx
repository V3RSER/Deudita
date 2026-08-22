'use client';

import React, { useState } from 'react';
import { Group } from '@/lib/types';
import { DateFilterMode, DatePreset } from '@/lib/transaction-date-utils';
import {
  Calendar,
  Clock,
  Filter,
  Search,
  RotateCcw,
  Sparkles,
  ChevronDown,
  Layers,
  Tag,
  Info,
} from 'lucide-react';

export interface TransactionFilterState {
  scope: 'all' | 'mine';
  dateMode: DateFilterMode;
  datePreset: DatePreset | string;
  customStartDate: string;
  customEndDate: string;
  groupId: string;
  category: string;
  searchTerm: string;
}

interface TransactionFilterBarProps {
  filters: TransactionFilterState;
  onFilterChange: (updates: Partial<TransactionFilterState>) => void;
  availableMonths?: Array<{ value: string; label: string }>;
  categories?: string[];
  userGroups?: Group[];
  showGroupFilter?: boolean;
  showCategoryFilter?: boolean;
  showSearch?: boolean;
  totalCount?: number;
  myCount?: number;
}

export function TransactionFilterBar({
  filters,
  onFilterChange,
  availableMonths = [],
  categories = [],
  userGroups = [],
  showGroupFilter = false,
  showCategoryFilter = false,
  showSearch = true,
  totalCount,
  myCount,
}: TransactionFilterBarProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const isFiltered =
    filters.scope !== 'all' ||
    filters.dateMode !== 'expense_date' ||
    filters.datePreset !== 'all' ||
    Boolean(filters.customStartDate) ||
    Boolean(filters.customEndDate) ||
    filters.groupId !== 'all' ||
    filters.category !== 'all' ||
    Boolean(filters.searchTerm.trim());

  const handleReset = () => {
    onFilterChange({
      scope: 'all',
      dateMode: 'expense_date',
      datePreset: 'all',
      customStartDate: '',
      customEndDate: '',
      groupId: 'all',
      category: 'all',
      searchTerm: '',
    });
  };

  return (
    <div className="bg-white p-4 sm:p-5 rounded-2xl ring-1 ring-zinc-200/90 shadow-2xs space-y-3.5">
      {/* Top Bar: Primary Scope Tabs & Date Mode Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 border-b border-zinc-100">
        
        {/* Scope selector: All vs Mine */}
        <div className="inline-flex items-center p-1 bg-zinc-100/90 rounded-xl border border-zinc-200/70 self-start">
          <button
            type="button"
            onClick={() => onFilterChange({ scope: 'all' })}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              filters.scope === 'all'
                ? 'bg-white text-zinc-950 shadow-2xs'
                : 'text-zinc-500 hover:text-zinc-900'
            }`}
          >
            Todos {typeof totalCount === 'number' && `(${totalCount})`}
          </button>
          <button
            type="button"
            onClick={() => onFilterChange({ scope: 'mine' })}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              filters.scope === 'mine'
                ? 'bg-white text-zinc-950 shadow-2xs'
                : 'text-zinc-500 hover:text-zinc-900'
            }`}
          >
            Mis interacciones {typeof myCount === 'number' && `(${myCount})`}
          </button>
        </div>

        {/* Date Mode Selector: Fecha del gasto vs Fecha de ingreso */}
        <div className="flex items-center gap-1.5 self-start sm:self-auto">
          <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider hidden md:inline">
            Filtrar por:
          </span>
          <div className="inline-flex items-center p-0.5 bg-zinc-100 rounded-xl border border-zinc-200/70">
            <button
              type="button"
              title="Filtrar por la fecha en que ocurrió el gasto o pago"
              onClick={() => onFilterChange({ dateMode: 'expense_date' })}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                filters.dateMode === 'expense_date'
                  ? 'bg-white text-emerald-800 shadow-2xs font-bold'
                  : 'text-zinc-500 hover:text-zinc-800'
              }`}
            >
              <Calendar className="w-3.5 h-3.5 text-emerald-600" />
              <span>Fecha del gasto</span>
            </button>
            <button
              type="button"
              title="Filtrar por la fecha y hora en que se ingresó o editó el registro"
              onClick={() => onFilterChange({ dateMode: 'entry_date' })}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                filters.dateMode === 'entry_date'
                  ? 'bg-white text-indigo-900 shadow-2xs font-bold'
                  : 'text-zinc-500 hover:text-zinc-800'
              }`}
            >
              <Clock className="w-3.5 h-3.5 text-indigo-600" />
              <span>Fecha de ingreso</span>
            </button>
          </div>
        </div>
      </div>

      {/* Date Mode Explanation Banner if Entry Date is Selected */}
      {filters.dateMode === 'entry_date' && (
        <div className="flex items-center justify-between px-3 py-2 bg-indigo-50/70 border border-indigo-100 rounded-xl text-xs text-indigo-900">
          <div className="flex items-center space-x-2">
            <Info className="w-4 h-4 text-indigo-600 shrink-0" />
            <span>
              Mostrando movimientos ordenados por <strong>fecha de registro / última edición</strong>.
            </span>
          </div>
          <button
            type="button"
            onClick={() => onFilterChange({ dateMode: 'expense_date' })}
            className="text-[11px] font-bold text-indigo-700 hover:underline shrink-0 ml-2"
          >
            Volver a fecha del gasto
          </button>
        </div>
      )}

      {/* Search & Dynamic Filter Inputs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
        {/* Search Input */}
        {showSearch && (
          <div className="relative col-span-1 sm:col-span-2 lg:col-span-1">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-3" />
            <input
              type="text"
              value={filters.searchTerm}
              onChange={(e) => onFilterChange({ searchTerm: e.target.value })}
              placeholder="Buscar por descripción, persona..."
              className="w-full pl-9 pr-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-medium text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all placeholder:text-zinc-400 shadow-2xs"
            />
            {filters.searchTerm && (
              <button
                type="button"
                onClick={() => onFilterChange({ searchTerm: '' })}
                className="absolute right-2.5 top-2.5 text-xs text-zinc-400 hover:text-zinc-700"
              >
                ✕
              </button>
            )}
          </div>
        )}

        {/* Date Preset Selector */}
        <div className="relative">
          <select
            value={filters.datePreset}
            onChange={(e) => onFilterChange({ datePreset: e.target.value })}
            className="w-full bg-zinc-50 border border-zinc-200 hover:bg-zinc-100/80 hover:border-zinc-300 rounded-xl px-3 py-2 text-xs text-zinc-900 font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all cursor-pointer shadow-2xs appearance-none pr-8"
          >
            <optgroup label="Rangos rápidos">
              <option value="all">Todas las fechas</option>
              <option value="today">Hoy</option>
              <option value="yesterday">Ayer</option>
              <option value="this_week">Últimos 7 días</option>
              <option value="this_month">Este mes</option>
              <option value="last_month">Mes anterior</option>
              <option value="custom">Rango personalizado...</option>
            </optgroup>

            {availableMonths.length > 0 && (
              <optgroup label="Meses específicos">
                {availableMonths.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          <ChevronDown className="w-3.5 h-3.5 text-zinc-400 absolute right-3 top-3 pointer-events-none" />
        </div>

        {/* Group Filter (Optional) */}
        {showGroupFilter && (
          <div className="relative">
            <select
              value={filters.groupId}
              onChange={(e) => onFilterChange({ groupId: e.target.value })}
              className="w-full bg-zinc-50 border border-zinc-200 hover:bg-zinc-100/80 hover:border-zinc-300 rounded-xl px-3 py-2 text-xs text-zinc-900 font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all cursor-pointer shadow-2xs appearance-none pr-8"
            >
              <option value="all">Todos los grupos</option>
              {userGroups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-zinc-400 absolute right-3 top-3 pointer-events-none" />
          </div>
        )}

        {/* Category Filter (Optional) */}
        {showCategoryFilter && (
          <div className="relative">
            <select
              value={filters.category}
              onChange={(e) => onFilterChange({ category: e.target.value })}
              className="w-full bg-zinc-50 border border-zinc-200 hover:bg-zinc-100/80 hover:border-zinc-300 rounded-xl px-3 py-2 text-xs text-zinc-900 font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all cursor-pointer shadow-2xs appearance-none pr-8"
            >
              <option value="all">Todas las categorías</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-zinc-400 absolute right-3 top-3 pointer-events-none" />
          </div>
        )}

        {/* Reset Filters button if filtered */}
        {isFiltered && (
          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={handleReset}
              className="flex items-center space-x-1 px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded-xl border border-rose-200/60 transition-all cursor-pointer shadow-2xs"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Limpiar filtros</span>
            </button>
          </div>
        )}
      </div>

      {/* Custom Date Range Pickers (Visible when datePreset === 'custom') */}
      {filters.datePreset === 'custom' && (
        <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-xl flex flex-wrap items-center gap-3 animate-in fade-in duration-150">
          <div className="flex items-center space-x-2">
            <label className="text-[11px] font-bold text-zinc-500 uppercase">Desde:</label>
            <input
              type="date"
              value={filters.customStartDate}
              onChange={(e) => onFilterChange({ customStartDate: e.target.value })}
              className="px-2.5 py-1.5 bg-white border border-zinc-200 rounded-lg text-xs font-semibold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 shadow-2xs"
            />
          </div>

          <div className="flex items-center space-x-2">
            <label className="text-[11px] font-bold text-zinc-500 uppercase">Hasta:</label>
            <input
              type="date"
              value={filters.customEndDate}
              onChange={(e) => onFilterChange({ customEndDate: e.target.value })}
              className="px-2.5 py-1.5 bg-white border border-zinc-200 rounded-lg text-xs font-semibold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 shadow-2xs"
            />
          </div>

          {(filters.customStartDate || filters.customEndDate) && (
            <button
              type="button"
              onClick={() => onFilterChange({ customStartDate: '', customEndDate: '' })}
              className="text-xs text-zinc-500 hover:text-zinc-800 underline font-medium"
            >
              Borrar fechas
            </button>
          )}
        </div>
      )}
    </div>
  );
}
