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
  ChevronUp,
  Tag,
  Info,
  X,
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
  const [isOpen, setIsOpen] = useState(false);

  const activeFiltersCount =
    (filters.searchTerm.trim() ? 1 : 0) +
    (filters.datePreset !== 'all' ? 1 : 0) +
    (filters.dateMode !== 'expense_date' ? 1 : 0) +
    (filters.category !== 'all' ? 1 : 0) +
    (filters.groupId !== 'all' ? 1 : 0) +
    (filters.customStartDate || filters.customEndDate ? 1 : 0);

  const isFiltered = activeFiltersCount > 0 || filters.scope === 'mine';

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

  const getActiveFilterSummary = () => {
    const labels: string[] = [];
    if (filters.searchTerm.trim()) labels.push(`"${filters.searchTerm}"`);
    if (filters.category !== 'all') labels.push(filters.category);
    if (filters.datePreset !== 'all') {
      const monthObj = availableMonths.find((m) => m.value === filters.datePreset);
      labels.push(monthObj ? monthObj.label : filters.datePreset);
    }
    if (filters.dateMode === 'entry_date') labels.push('Por fecha de ingreso');
    return labels;
  };

  const activeLabels = getActiveFilterSummary();

  return (
    <div className="bg-white rounded-2xl ring-1 ring-zinc-200/90 shadow-2xs overflow-hidden transition-all">
      {/* Sleek Compact Toolbar (Always visible, ~40px) */}
      <div className="px-3 py-2 sm:px-4 sm:py-2.5 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
          {/* Quick Scope Filter Chip: Mis interacciones */}
          <div className="inline-flex items-center p-0.5 bg-zinc-100/90 rounded-xl border border-zinc-200/70">
            <button
              type="button"
              onClick={() => onFilterChange({ scope: 'all' })}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                filters.scope === 'all'
                  ? 'bg-white text-zinc-950 font-bold shadow-2xs'
                  : 'text-zinc-500 hover:text-zinc-900'
              }`}
            >
              Todos {typeof totalCount === 'number' && `(${totalCount})`}
            </button>
            <button
              type="button"
              onClick={() => onFilterChange({ scope: 'mine' })}
              className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                filters.scope === 'mine'
                  ? 'bg-white text-emerald-800 font-bold shadow-2xs'
                  : 'text-zinc-500 hover:text-zinc-900'
              }`}
            >
              <Sparkles className={`w-3 h-3 ${filters.scope === 'mine' ? 'text-emerald-600' : 'text-zinc-400'}`} />
              <span>Mis interacciones</span>
              {typeof myCount === 'number' && <span className="opacity-75">({myCount})</span>}
            </button>
          </div>

          {/* Quick Active Filter Badges on Toolbar if closed */}
          {!isOpen && activeLabels.length > 0 && (
            <div className="hidden sm:flex items-center gap-1.5 flex-wrap">
              {activeLabels.map((lbl, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center px-2 py-0.5 bg-zinc-100 text-zinc-700 text-[11px] font-medium rounded-md border border-zinc-200/80 max-w-[140px] truncate"
                >
                  {lbl}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Right side: Toggle Filter Panel Button & Quick Reset */}
        <div className="flex items-center space-x-1.5">
          {isFiltered && (
            <button
              type="button"
              onClick={handleReset}
              title="Limpiar todos los filtros"
              className="inline-flex items-center space-x-1 px-2.5 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded-xl border border-rose-200/60 transition-all cursor-pointer shadow-2xs"
            >
              <RotateCcw className="w-3 h-3" />
              <span className="hidden sm:inline">Limpiar</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className={`inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-2xs ${
              isOpen || activeFiltersCount > 0
                ? 'bg-zinc-900 text-white border border-zinc-900'
                : 'bg-zinc-50 hover:bg-zinc-100 text-zinc-700 border border-zinc-200'
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            <span>Filtros</span>
            {activeFiltersCount > 0 && (
              <span className="w-4 h-4 rounded-full bg-emerald-500 text-zinc-950 text-[10px] font-black flex items-center justify-center">
                {activeFiltersCount}
              </span>
            )}
            {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Expandable Filter Drawer Panel */}
      {isOpen && (
        <div className="p-3.5 sm:p-4 border-t border-zinc-100 bg-zinc-50/50 space-y-3 animate-in fade-in duration-150">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            {/* Search Input */}
            {showSearch && (
              <div className="relative col-span-1 sm:col-span-2 lg:col-span-1">
                <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-2.5" />
                <input
                  type="text"
                  value={filters.searchTerm}
                  onChange={(e) => onFilterChange({ searchTerm: e.target.value })}
                  placeholder="Buscar por descripción, persona..."
                  className="w-full pl-9 pr-7 py-1.5 bg-white border border-zinc-200 rounded-xl text-xs font-medium text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all placeholder:text-zinc-400 shadow-2xs"
                />
                {filters.searchTerm && (
                  <button
                    type="button"
                    onClick={() => onFilterChange({ searchTerm: '' })}
                    className="absolute right-2.5 top-2 text-xs text-zinc-400 hover:text-zinc-700 cursor-pointer"
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
                className="w-full bg-white border border-zinc-200 hover:border-zinc-300 rounded-xl px-3 py-1.5 text-xs text-zinc-900 font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all cursor-pointer shadow-2xs appearance-none pr-8"
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
              <ChevronDown className="w-3.5 h-3.5 text-zinc-400 absolute right-3 top-2.5 pointer-events-none" />
            </div>

            {/* Category Filter (Optional) */}
            {showCategoryFilter && (
              <div className="relative">
                <select
                  value={filters.category}
                  onChange={(e) => onFilterChange({ category: e.target.value })}
                  className="w-full bg-white border border-zinc-200 hover:border-zinc-300 rounded-xl px-3 py-1.5 text-xs text-zinc-900 font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all cursor-pointer shadow-2xs appearance-none pr-8"
                >
                  <option value="all">Todas las categorías</option>
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-zinc-400 absolute right-3 top-2.5 pointer-events-none" />
              </div>
            )}

            {/* Group Filter (Optional) */}
            {showGroupFilter && (
              <div className="relative">
                <select
                  value={filters.groupId}
                  onChange={(e) => onFilterChange({ groupId: e.target.value })}
                  className="w-full bg-white border border-zinc-200 hover:border-zinc-300 rounded-xl px-3 py-1.5 text-xs text-zinc-900 font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all cursor-pointer shadow-2xs appearance-none pr-8"
                >
                  <option value="all">Todos los grupos</option>
                  {userGroups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-zinc-400 absolute right-3 top-2.5 pointer-events-none" />
              </div>
            )}
          </div>

          {/* Integrated Date Mode Selector (Inside filter panel instead of separate permanent header) */}
          <div className="pt-2 border-t border-zinc-200/60 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center space-x-2">
              <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                Criterio de fecha:
              </span>
              <div className="inline-flex items-center p-0.5 bg-zinc-100 rounded-xl border border-zinc-200/80">
                <button
                  type="button"
                  title="Filtrar por la fecha en que ocurrió el gasto o abono"
                  onClick={() => onFilterChange({ dateMode: 'expense_date' })}
                  className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    filters.dateMode === 'expense_date'
                      ? 'bg-white text-emerald-800 shadow-2xs font-bold'
                      : 'text-zinc-500 hover:text-zinc-800'
                  }`}
                >
                  <Calendar className="w-3 h-3 text-emerald-600" />
                  <span>Fecha del gasto</span>
                </button>
                <button
                  type="button"
                  title="Filtrar por la fecha y hora en que se ingresó o editó el registro"
                  onClick={() => onFilterChange({ dateMode: 'entry_date' })}
                  className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    filters.dateMode === 'entry_date'
                      ? 'bg-white text-indigo-900 shadow-2xs font-bold'
                      : 'text-zinc-500 hover:text-zinc-800'
                  }`}
                >
                  <Clock className="w-3 h-3 text-indigo-600" />
                  <span>Fecha de ingreso</span>
                </button>
              </div>
            </div>

            {filters.dateMode === 'entry_date' && (
              <span className="text-[11px] text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100 font-medium">
                Mostrando por orden de registro/edición
              </span>
            )}
          </div>

          {/* Custom Date Range Pickers (Visible when datePreset === 'custom') */}
          {filters.datePreset === 'custom' && (
            <div className="p-2.5 bg-white border border-zinc-200 rounded-xl flex flex-wrap items-center gap-3 animate-in fade-in duration-150">
              <div className="flex items-center space-x-2">
                <label className="text-[11px] font-bold text-zinc-500 uppercase">Desde:</label>
                <input
                  type="date"
                  value={filters.customStartDate}
                  onChange={(e) => onFilterChange({ customStartDate: e.target.value })}
                  className="px-2 py-1 bg-zinc-50 border border-zinc-200 rounded-lg text-xs font-semibold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 shadow-2xs"
                />
              </div>

              <div className="flex items-center space-x-2">
                <label className="text-[11px] font-bold text-zinc-500 uppercase">Hasta:</label>
                <input
                  type="date"
                  value={filters.customEndDate}
                  onChange={(e) => onFilterChange({ customEndDate: e.target.value })}
                  className="px-2 py-1 bg-zinc-50 border border-zinc-200 rounded-lg text-xs font-semibold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 shadow-2xs"
                />
              </div>

              {(filters.customStartDate || filters.customEndDate) && (
                <button
                  type="button"
                  onClick={() => onFilterChange({ customStartDate: '', customEndDate: '' })}
                  className="text-xs text-zinc-500 hover:text-zinc-800 underline font-medium cursor-pointer"
                >
                  Borrar fechas
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
