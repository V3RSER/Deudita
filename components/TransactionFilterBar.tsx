'use client';

import React, { useState } from 'react';
import { Group } from '@/lib/types';
import { DateFilterMode, DatePreset } from '@/lib/transaction-date-utils';
import {
  Search,
  SlidersHorizontal,
  X,
  RotateCcw,
  Calendar,
  Clock,
  Tag,
  FolderKanban,
  UserCheck,
  ChevronDown,
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

const DATE_PRESET_OPTIONS: Array<{ id: DatePreset; label: string }> = [
  { id: 'all', label: 'Todas las fechas' },
  { id: 'today', label: 'Hoy' },
  { id: 'yesterday', label: 'Ayer' },
  { id: 'this_week', label: 'Últimos 7 días' },
  { id: 'this_month', label: 'Este mes' },
  { id: 'last_month', label: 'Mes anterior' },
  { id: 'custom', label: 'Rango personalizado...' },
];

export function TransactionFilterBar({
  filters,
  onFilterChange,
  availableMonths = [],
  categories = [],
  userGroups = [],
  showGroupFilter = false,
  showCategoryFilter = false,
  showSearch = true,
}: TransactionFilterBarProps) {
  const [isOpen, setIsOpen] = useState(false);

  const activeFiltersCount =
    (filters.scope === 'mine' ? 1 : 0) +
    (filters.datePreset !== 'all' ? 1 : 0) +
    (filters.dateMode !== 'expense_date' ? 1 : 0) +
    (filters.category !== 'all' ? 1 : 0) +
    (filters.groupId !== 'all' ? 1 : 0) +
    (filters.customStartDate || filters.customEndDate ? 1 : 0);

  const isFiltered = activeFiltersCount > 0 || filters.searchTerm.trim().length > 0;

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

  const getPresetLabel = (preset: DatePreset | string) => {
    const found = DATE_PRESET_OPTIONS.find((p) => p.id === preset);
    if (found) return found.label;
    const foundMonth = availableMonths.find((m) => m.value === preset);
    if (foundMonth) return foundMonth.label;
    return preset;
  };

  const selectedGroup = userGroups.find((g) => g.id === filters.groupId);

  // Active filter chips
  const activeChips: { id: string; label: string; onRemove: () => void }[] = [];

  if (filters.scope === 'mine') {
    activeChips.push({
      id: 'scope',
      label: 'Mis movimientos',
      onRemove: () => onFilterChange({ scope: 'all' }),
    });
  }

  if (filters.datePreset !== 'all') {
    activeChips.push({
      id: 'datePreset',
      label: getPresetLabel(filters.datePreset),
      onRemove: () => onFilterChange({ datePreset: 'all', customStartDate: '', customEndDate: '' }),
    });
  } else if (filters.customStartDate || filters.customEndDate) {
    const start = filters.customStartDate || '...';
    const end = filters.customEndDate || '...';
    activeChips.push({
      id: 'customDate',
      label: `${start} a ${end}`,
      onRemove: () => onFilterChange({ customStartDate: '', customEndDate: '', datePreset: 'all' }),
    });
  }

  if (filters.dateMode === 'entry_date') {
    activeChips.push({
      id: 'dateMode',
      label: 'Por fecha de registro',
      onRemove: () => onFilterChange({ dateMode: 'expense_date' }),
    });
  }

  if (showCategoryFilter && filters.category !== 'all') {
    activeChips.push({
      id: 'category',
      label: `Categoría: ${filters.category}`,
      onRemove: () => onFilterChange({ category: 'all' }),
    });
  }

  if (showGroupFilter && filters.groupId !== 'all' && selectedGroup) {
    activeChips.push({
      id: 'group',
      label: `Grupo: ${selectedGroup.name}`,
      onRemove: () => onFilterChange({ groupId: 'all' }),
    });
  }

  return (
    <div className="rounded-2xl border border-zinc-200/90 bg-white shadow-xs transition-all">
      {/* Search and Filters Toggle Header */}
      <div className="p-2 sm:p-2.5 flex items-center gap-2">
        {showSearch && (
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              value={filters.searchTerm}
              onChange={(e) => onFilterChange({ searchTerm: e.target.value })}
              placeholder="Buscar gastos, personas, notas..."
              className="w-full h-10 rounded-xl border border-zinc-200 bg-zinc-50/60 pl-10 pr-9 text-xs sm:text-sm text-zinc-800 placeholder:text-zinc-400 transition-colors focus:border-zinc-400 focus:bg-white focus:outline-none"
            />
            {filters.searchTerm && (
              <button
                type="button"
                onClick={() => onFilterChange({ searchTerm: '' })}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-md text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors cursor-pointer"
                aria-label="Borrar búsqueda"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}

        {/* Clean Filter Action Button */}
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          aria-expanded={isOpen}
          className={`inline-flex items-center justify-center gap-2 h-10 px-3.5 sm:px-4 rounded-xl border text-xs sm:text-sm font-semibold transition-all cursor-pointer shrink-0 ${
            isOpen || activeFiltersCount > 0
              ? 'border-zinc-900 bg-zinc-900 text-white shadow-xs'
              : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50'
          }`}
        >
          <SlidersHorizontal className="h-4 w-4" />
          <span>Filtros</span>
          {activeFiltersCount > 0 && (
            <span
              className={`flex h-4.5 min-w-[18px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold ${
                isOpen || activeFiltersCount > 0
                  ? 'bg-emerald-500 text-zinc-950'
                  : 'bg-emerald-600 text-white'
              }`}
            >
              {activeFiltersCount}
            </span>
          )}
        </button>
      </div>

      {/* Active Filter Chips Ribbon (only visible when filters are active) */}
      {activeChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-zinc-100 bg-zinc-50/50 px-3 py-2 sm:px-4">
          <span className="text-[11px] font-medium text-zinc-400 mr-1">Filtros activos:</span>
          {activeChips.map((chip) => (
            <span
              key={chip.id}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200/90 bg-white py-1 pl-2.5 pr-1.5 text-xs font-medium text-zinc-700 shadow-2xs"
            >
              <span className="max-w-[160px] truncate">{chip.label}</span>
              <button
                type="button"
                onClick={chip.onRemove}
                className="rounded-md p-0.5 text-zinc-400 hover:bg-zinc-100 hover:text-rose-600 transition-colors cursor-pointer"
                title="Quitar filtro"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}

          <button
            type="button"
            onClick={handleReset}
            className="ml-auto text-xs font-semibold text-zinc-400 hover:text-rose-600 transition-colors cursor-pointer"
          >
            Limpiar todo
          </button>
        </div>
      )}

      {/* Structured, Coherent Filter Menu */}
      {isOpen && (
        <div className="border-t border-zinc-200/90 bg-zinc-50/50 p-4 sm:p-5 space-y-4 rounded-b-2xl animate-in fade-in duration-150">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {/* Filter 1: Participación */}
            <div className="bg-white p-3 rounded-xl border border-zinc-200/90 shadow-2xs space-y-1.5">
              <label className="flex items-center gap-1.5 text-xs font-semibold text-zinc-700">
                <UserCheck className="w-3.5 h-3.5 text-zinc-400" />
                <span>Participación</span>
              </label>
              <div className="relative">
                <select
                  value={filters.scope}
                  onChange={(e) => onFilterChange({ scope: e.target.value as 'all' | 'mine' })}
                  className="w-full h-9 rounded-lg border border-zinc-200 bg-zinc-50/50 px-2.5 pr-8 text-xs font-medium text-zinc-800 appearance-none focus:border-zinc-400 focus:bg-white focus:outline-none cursor-pointer"
                >
                  <option value="all">Todos los movimientos</option>
                  <option value="mine">Solo mis movimientos</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
              </div>
            </div>

            {/* Filter 2: Periodo de Fechas */}
            <div className="bg-white p-3 rounded-xl border border-zinc-200/90 shadow-2xs space-y-1.5">
              <label className="flex items-center gap-1.5 text-xs font-semibold text-zinc-700">
                <Calendar className="w-3.5 h-3.5 text-zinc-400" />
                <span>Periodo</span>
              </label>
              <div className="relative">
                <select
                  value={filters.datePreset}
                  onChange={(e) => {
                    const val = e.target.value;
                    onFilterChange({
                      datePreset: val,
                      ...(val !== 'custom' ? { customStartDate: '', customEndDate: '' } : {}),
                    });
                  }}
                  className="w-full h-9 rounded-lg border border-zinc-200 bg-zinc-50/50 px-2.5 pr-8 text-xs font-medium text-zinc-800 appearance-none focus:border-zinc-400 focus:bg-white focus:outline-none cursor-pointer"
                >
                  <optgroup label="Rangos estándar">
                    {DATE_PRESET_OPTIONS.map((preset) => (
                      <option key={preset.id} value={preset.id}>
                        {preset.label}
                      </option>
                    ))}
                  </optgroup>
                  {availableMonths.length > 0 && (
                    <optgroup label="Meses con actividad">
                      {availableMonths.map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
              </div>
            </div>

            {/* Filter 3: Criterio de Fecha */}
            <div className="bg-white p-3 rounded-xl border border-zinc-200/90 shadow-2xs space-y-1.5">
              <label className="flex items-center gap-1.5 text-xs font-semibold text-zinc-700">
                <Clock className="w-3.5 h-3.5 text-zinc-400" />
                <span>Criterio de fecha</span>
              </label>
              <div className="relative">
                <select
                  value={filters.dateMode}
                  onChange={(e) =>
                    onFilterChange({ dateMode: e.target.value as DateFilterMode })
                  }
                  className="w-full h-9 rounded-lg border border-zinc-200 bg-zinc-50/50 px-2.5 pr-8 text-xs font-medium text-zinc-800 appearance-none focus:border-zinc-400 focus:bg-white focus:outline-none cursor-pointer"
                >
                  <option value="expense_date">Fecha del gasto</option>
                  <option value="entry_date">Fecha de registro</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
              </div>
            </div>

            {/* Filter 4: Categoría (si aplica) */}
            {showCategoryFilter && (
              <div className="bg-white p-3 rounded-xl border border-zinc-200/90 shadow-2xs space-y-1.5">
                <label className="flex items-center gap-1.5 text-xs font-semibold text-zinc-700">
                  <Tag className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Categoría</span>
                </label>
                <div className="relative">
                  <select
                    value={filters.category}
                    onChange={(e) => onFilterChange({ category: e.target.value })}
                    className="w-full h-9 rounded-lg border border-zinc-200 bg-zinc-50/50 px-2.5 pr-8 text-xs font-medium text-zinc-800 appearance-none focus:border-zinc-400 focus:bg-white focus:outline-none cursor-pointer"
                  >
                    <option value="all">Todas las categorías</option>
                    {categories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
                </div>
              </div>
            )}

            {/* Filter 5: Grupo (si aplica) */}
            {showGroupFilter && (
              <div className="bg-white p-3 rounded-xl border border-zinc-200/90 shadow-2xs space-y-1.5">
                <label className="flex items-center gap-1.5 text-xs font-semibold text-zinc-700">
                  <FolderKanban className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Grupo</span>
                </label>
                <div className="relative">
                  <select
                    value={filters.groupId}
                    onChange={(e) => onFilterChange({ groupId: e.target.value })}
                    className="w-full h-9 rounded-lg border border-zinc-200 bg-zinc-50/50 px-2.5 pr-8 text-xs font-medium text-zinc-800 appearance-none focus:border-zinc-400 focus:bg-white focus:outline-none cursor-pointer"
                  >
                    <option value="all">Todos los grupos</option>
                    {userGroups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
                </div>
              </div>
            )}
          </div>

          {/* Custom Date Inputs (only when 'custom' is selected) */}
          {(filters.datePreset === 'custom' || filters.customStartDate || filters.customEndDate) && (
            <div className="bg-white p-3.5 rounded-xl border border-zinc-200/90 shadow-2xs space-y-2">
              <span className="block text-xs font-semibold text-zinc-700">
                Rango de fechas personalizado
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                    Desde
                  </label>
                  <input
                    type="date"
                    value={filters.customStartDate}
                    onChange={(e) =>
                      onFilterChange({
                        customStartDate: e.target.value,
                        datePreset: 'custom',
                      })
                    }
                    className="w-full h-9 rounded-lg border border-zinc-200 bg-zinc-50/50 px-2.5 text-xs font-medium text-zinc-800 focus:border-zinc-400 focus:bg-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                    Hasta
                  </label>
                  <input
                    type="date"
                    value={filters.customEndDate}
                    onChange={(e) =>
                      onFilterChange({
                        customEndDate: e.target.value,
                        datePreset: 'custom',
                      })
                    }
                    className="w-full h-9 rounded-lg border border-zinc-200 bg-zinc-50/50 px-2.5 text-xs font-medium text-zinc-800 focus:border-zinc-400 focus:bg-white focus:outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Action Footer */}
          <div className="flex items-center justify-between pt-2 border-t border-zinc-200/70">
            {isFiltered ? (
              <button
                type="button"
                onClick={handleReset}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-rose-600 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Restablecer filtros</span>
              </button>
            ) : (
              <div />
            )}

            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="px-4 py-2 rounded-xl bg-zinc-900 text-white text-xs font-semibold hover:bg-zinc-800 transition-colors cursor-pointer shadow-xs"
            >
              Listo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
