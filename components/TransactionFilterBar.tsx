'use client';

import React, { useState } from 'react';
import { Group } from '@/lib/types';
import { DateFilterMode, DatePreset } from '@/lib/transaction-date-utils';
import {
  Calendar,
  Clock,
  Search,
  SlidersHorizontal,
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

/* ---------- Estilos compartidos ---------- */

const selectClasses =
  'w-full appearance-none rounded-lg border border-zinc-200 bg-white px-3 py-2 pr-8 text-sm font-medium text-zinc-800 shadow-sm transition-colors hover:border-zinc-300 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/15';

const fieldLabelClasses =
  'mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-zinc-400';

function FieldWrap({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className={fieldLabelClasses}>{label}</label>
      {children}
    </div>
  );
}

function SelectChevron() {
  return (
    <svg
      className="pointer-events-none absolute right-2.5 top-[34px] h-3.5 w-3.5 text-zinc-400"
      viewBox="0 0 20 20"
      fill="none"
    >
      <path
        d="M5 7.5L10 12.5L15 7.5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
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
    const labels: { text: string; onClear: () => void }[] = [];
    if (filters.searchTerm.trim())
      labels.push({
        text: `"${filters.searchTerm}"`,
        onClear: () => onFilterChange({ searchTerm: '' }),
      });
    if (filters.category !== 'all')
      labels.push({
        text: filters.category,
        onClear: () => onFilterChange({ category: 'all' }),
      });
    if (filters.groupId !== 'all') {
      const g = userGroups.find((g) => g.id === filters.groupId);
      labels.push({
        text: g ? g.name : 'Grupo',
        onClear: () => onFilterChange({ groupId: 'all' }),
      });
    }
    if (filters.datePreset !== 'all') {
      const monthObj = availableMonths.find((m) => m.value === filters.datePreset);
      labels.push({
        text: monthObj ? monthObj.label : String(filters.datePreset),
        onClear: () =>
          onFilterChange({ datePreset: 'all', customStartDate: '', customEndDate: '' }),
      });
    }
    if (filters.dateMode === 'entry_date')
      labels.push({
        text: 'Por fecha de ingreso',
        onClear: () => onFilterChange({ dateMode: 'expense_date' }),
      });
    return labels;
  };

  const activeLabels = getActiveFilterSummary();

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
      {/* Barra superior */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 sm:px-4">
        {/* Toggle Todos / Mis interacciones */}
        <div className="inline-flex rounded-lg bg-zinc-100 p-0.5">
          <button
            type="button"
            onClick={() => onFilterChange({ scope: 'all' })}
            className={`rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${
              filters.scope === 'all'
                ? 'bg-white text-zinc-900 shadow-sm'
                : 'text-zinc-500 hover:text-zinc-800'
            }`}
          >
            Todos
            {typeof totalCount === 'number' && (
              <span className="ml-1 text-zinc-400">({totalCount})</span>
            )}
          </button>
          <button
            type="button"
            onClick={() => onFilterChange({ scope: 'mine' })}
            className={`rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${
              filters.scope === 'mine'
                ? 'bg-white text-teal-700 shadow-sm'
                : 'text-zinc-500 hover:text-zinc-800'
            }`}
          >
            Mis movimientos
            {typeof myCount === 'number' && (
              <span className="ml-1 opacity-70">({myCount})</span>
            )}
          </button>
        </div>

        <div className="mx-1 hidden h-5 w-px bg-zinc-200 sm:block" />

        {/* Búsqueda inline (siempre visible si está habilitada) */}
        {showSearch && (
          <div className="relative min-w-[180px] flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              value={filters.searchTerm}
              onChange={(e) => onFilterChange({ searchTerm: e.target.value })}
              placeholder="Buscar movimientos..."
              className="w-full rounded-lg border border-zinc-200 bg-zinc-50 py-1.5 pl-8 pr-7 text-sm text-zinc-800 placeholder:text-zinc-400 transition-colors focus:border-teal-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/15"
            />
            {filters.searchTerm && (
              <button
                type="button"
                onClick={() => onFilterChange({ searchTerm: '' })}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700"
                aria-label="Borrar búsqueda"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          {isFiltered && (
            <button
              type="button"
              onClick={handleReset}
              className="text-sm font-medium text-zinc-400 transition-colors hover:text-rose-600"
            >
              Limpiar
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            aria-expanded={isOpen}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors ${
              isOpen
                ? 'border-zinc-900 bg-zinc-900 text-white'
                : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50'
            }`}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Filtros
            {activeFiltersCount > 0 && (
              <span
                className={`flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-bold ${
                  isOpen ? 'bg-white text-zinc-900' : 'bg-teal-600 text-white'
                }`}
              >
                {activeFiltersCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Chips de filtros activos (barra colapsada) */}
      {!isOpen && activeLabels.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-zinc-100 px-3 py-2 sm:px-4">
          {activeLabels.map((l, idx) => (
            <button
              key={idx}
              type="button"
              onClick={l.onClear}
              className="group inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50 py-1 pl-2.5 pr-1.5 text-xs font-medium text-zinc-600 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
            >
              <span className="max-w-[160px] truncate">{l.text}</span>
              <X className="h-3 w-3 text-zinc-400 group-hover:text-rose-500" />
            </button>
          ))}
        </div>
      )}

      {/* Panel de filtros expandido */}
      {isOpen && (
        <div className="space-y-4 border-t border-zinc-100 bg-zinc-50/60 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {/* Rango de fechas */}
            <FieldWrap label="Periodo">
              <div className="relative">
                <select
                  value={filters.datePreset}
                  onChange={(e) => onFilterChange({ datePreset: e.target.value })}
                  className={selectClasses}
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
                <SelectChevron />
              </div>
            </FieldWrap>

            {/* Categoría */}
            {showCategoryFilter && (
              <FieldWrap label="Categoría">
                <div className="relative">
                  <select
                    value={filters.category}
                    onChange={(e) => onFilterChange({ category: e.target.value })}
                    className={selectClasses}
                  >
                    <option value="all">Todas las categorías</option>
                    {categories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <SelectChevron />
                </div>
              </FieldWrap>
            )}

            {/* Grupo */}
            {showGroupFilter && (
              <FieldWrap label="Grupo">
                <div className="relative">
                  <select
                    value={filters.groupId}
                    onChange={(e) => onFilterChange({ groupId: e.target.value })}
                    className={selectClasses}
                  >
                    <option value="all">Todos los grupos</option>
                    {userGroups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                  <SelectChevron />
                </div>
              </FieldWrap>
            )}
          </div>

          {/* Rango personalizado */}
          {filters.datePreset === 'custom' && (
            <div className="flex flex-wrap items-end gap-3 rounded-lg border border-zinc-200 bg-white p-3">
              <div>
                <label className={fieldLabelClasses}>Desde</label>
                <input
                  type="date"
                  value={filters.customStartDate}
                  onChange={(e) => onFilterChange({ customStartDate: e.target.value })}
                  className="rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-sm text-zinc-800 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/15"
                />
              </div>
              <div>
                <label className={fieldLabelClasses}>Hasta</label>
                <input
                  type="date"
                  value={filters.customEndDate}
                  onChange={(e) => onFilterChange({ customEndDate: e.target.value })}
                  className="rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-sm text-zinc-800 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/15"
                />
              </div>
              {(filters.customStartDate || filters.customEndDate) && (
                <button
                  type="button"
                  onClick={() => onFilterChange({ customStartDate: '', customEndDate: '' })}
                  className="pb-1.5 text-xs font-medium text-zinc-400 underline-offset-2 hover:text-zinc-700 hover:underline"
                >
                  Borrar fechas
                </button>
              )}
            </div>
          )}

          {/* Modo de fecha */}
          <div className="flex flex-wrap items-center gap-3 border-t border-zinc-200/70 pt-3">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
              Filtrar por
            </span>
            <div className="inline-flex rounded-lg bg-zinc-100 p-0.5">
              <button
                type="button"
                title="Fecha en que ocurrió el gasto o abono"
                onClick={() => onFilterChange({ dateMode: 'expense_date' })}
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                  filters.dateMode === 'expense_date'
                    ? 'bg-white text-teal-700 shadow-sm'
                    : 'text-zinc-500 hover:text-zinc-800'
                }`}
              >
                <Calendar className="h-3.5 w-3.5" />
                Fecha del gasto
              </button>
              <button
                type="button"
                title="Fecha y hora en que se ingresó o editó el registro"
                onClick={() => onFilterChange({ dateMode: 'entry_date' })}
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                  filters.dateMode === 'entry_date'
                    ? 'bg-white text-indigo-700 shadow-sm'
                    : 'text-zinc-500 hover:text-zinc-800'
                }`}
              >
                <Clock className="h-3.5 w-3.5" />
                Fecha de ingreso
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
