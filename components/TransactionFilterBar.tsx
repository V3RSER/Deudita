'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Group } from '@/lib/types';
import { DateFilterMode, DatePreset } from '@/lib/transaction-date-utils';
import { getCategoryConfig } from '@/lib/expense-category-utils';
import {
  Calendar,
  Clock,
  Search,
  SlidersHorizontal,
  X,
  ChevronDown,
  Filter,
  Check,
  RotateCcw,
  CalendarDays,
  FolderKanban,
  Tag,
  ArrowUpDown,
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

const DATE_PRESET_OPTIONS: Array<{ id: DatePreset; label: string; shortLabel: string }> = [
  { id: 'all', label: 'Todas las fechas', shortLabel: 'Todo' },
  { id: 'today', label: 'Hoy', shortLabel: 'Hoy' },
  { id: 'yesterday', label: 'Ayer', shortLabel: 'Ayer' },
  { id: 'this_week', label: 'Últimos 7 días', shortLabel: '7 días' },
  { id: 'this_month', label: 'Este mes', shortLabel: 'Este mes' },
  { id: 'last_month', label: 'Mes anterior', shortLabel: 'Mes ant.' },
  { id: 'custom', label: 'Rango personalizado...', shortLabel: 'Personalizado' },
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
  totalCount,
  myCount,
}: TransactionFilterBarProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<'date' | 'category' | 'group' | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // Close floating dropdowns on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpenDropdown(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
    setOpenDropdown(null);
  };

  const getPresetLabel = (preset: DatePreset | string) => {
    const found = DATE_PRESET_OPTIONS.find((p) => p.id === preset);
    if (found) return found.label;
    const foundMonth = availableMonths.find((m) => m.value === preset);
    if (foundMonth) return foundMonth.label;
    return preset;
  };

  const selectedGroup = userGroups.find((g) => g.id === filters.groupId);

  // Active filter chip labels
  const activeChips: { id: string; label: string; categoryName?: string; onRemove: () => void }[] = [];

  if (filters.searchTerm.trim()) {
    activeChips.push({
      id: 'search',
      label: `"${filters.searchTerm}"`,
      onRemove: () => onFilterChange({ searchTerm: '' }),
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
      label: `${start} → ${end}`,
      onRemove: () => onFilterChange({ customStartDate: '', customEndDate: '', datePreset: 'all' }),
    });
  }

  if (filters.dateMode === 'entry_date') {
    activeChips.push({
      id: 'dateMode',
      label: 'Por registro en sistema',
      onRemove: () => onFilterChange({ dateMode: 'expense_date' }),
    });
  }

  if (filters.category !== 'all') {
    activeChips.push({
      id: 'category',
      label: filters.category,
      categoryName: filters.category,
      onRemove: () => onFilterChange({ category: 'all' }),
    });
  }

  if (filters.groupId !== 'all' && selectedGroup) {
    activeChips.push({
      id: 'group',
      label: selectedGroup.name,
      onRemove: () => onFilterChange({ groupId: 'all' }),
    });
  }

  return (
    <div
      ref={containerRef}
      className="relative rounded-2xl border border-zinc-200/90 bg-white shadow-xs transition-all duration-200"
    >
      {/* Top Primary Control Bar */}
      <div className="p-2 sm:p-3 space-y-2.5">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5">
          {/* Left: Scope Segmented Toggle (Todos vs Mis movimientos) */}
          <div className="flex items-center gap-2">
            <div className="inline-flex p-1 bg-zinc-100/90 rounded-xl border border-zinc-200/60 shrink-0 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => onFilterChange({ scope: 'all' })}
                className={`flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 cursor-pointer ${
                  filters.scope === 'all'
                    ? 'bg-white text-zinc-900 shadow-xs ring-1 ring-black/5'
                    : 'text-zinc-500 hover:text-zinc-800'
                }`}
              >
                <span>Todos</span>
                {typeof totalCount === 'number' && (
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                      filters.scope === 'all'
                        ? 'bg-zinc-100 text-zinc-700'
                        : 'bg-zinc-200/70 text-zinc-500'
                    }`}
                  >
                    {totalCount}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => onFilterChange({ scope: 'mine' })}
                className={`flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 cursor-pointer ${
                  filters.scope === 'mine'
                    ? 'bg-emerald-600 text-white shadow-xs shadow-emerald-600/20'
                    : 'text-zinc-500 hover:text-zinc-800'
                }`}
              >
                <span>Mis movimientos</span>
                {typeof myCount === 'number' && (
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                      filters.scope === 'mine'
                        ? 'bg-emerald-700 text-emerald-100'
                        : 'bg-zinc-200/70 text-zinc-500'
                    }`}
                  >
                    {myCount}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Right: Search Input + Filter Actions */}
          <div className="flex items-center gap-2 flex-1 md:justify-end">
            {showSearch && (
              <div className="relative flex-1 max-w-full md:max-w-xs">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
                <input
                  type="text"
                  value={filters.searchTerm}
                  onChange={(e) => onFilterChange({ searchTerm: e.target.value })}
                  placeholder="Buscar gastos, personas, notas..."
                  className="w-full h-9 rounded-xl border border-zinc-200/90 bg-zinc-50/70 pl-8.5 pr-8 text-xs sm:text-sm text-zinc-800 placeholder:text-zinc-400 transition-all focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/15"
                />
                {filters.searchTerm && (
                  <button
                    type="button"
                    onClick={() => onFilterChange({ searchTerm: '' })}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-md text-zinc-400 hover:text-zinc-700 hover:bg-zinc-200/60 transition-colors cursor-pointer"
                    aria-label="Borrar búsqueda"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )}

            {/* Quick Reset Action */}
            {isFiltered && (
              <button
                type="button"
                onClick={handleReset}
                title="Restablecer todos los filtros"
                className="hidden sm:inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-zinc-200 text-xs font-semibold text-zinc-500 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50/50 transition-all cursor-pointer shrink-0"
              >
                <RotateCcw className="h-3 w-3" />
                <span>Limpiar</span>
              </button>
            )}

            {/* Expand / Collapse Filters Studio Button */}
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              aria-expanded={isExpanded}
              className={`inline-flex items-center justify-center gap-1.5 h-9 px-3.5 rounded-xl border text-xs font-semibold transition-all duration-150 cursor-pointer shrink-0 ${
                isExpanded || activeFiltersCount > 0
                  ? 'border-zinc-900 bg-zinc-900 text-white shadow-xs'
                  : 'border-zinc-200/90 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50'
              }`}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <span>Filtros</span>
              {activeFiltersCount > 0 && (
                <span
                  className={`flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-black ${
                    isExpanded || activeFiltersCount > 0
                      ? 'bg-emerald-500 text-zinc-950'
                      : 'bg-emerald-600 text-white'
                  }`}
                >
                  {activeFiltersCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Quick Filter Pill Buttons (Dropdowns for fast filtering without expanding whole panel) */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-0.5 pb-1">
          {/* Quick Date Dropdown */}
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setOpenDropdown(openDropdown === 'date' ? null : 'date')}
              className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg border text-xs font-medium transition-all cursor-pointer ${
                filters.datePreset !== 'all' || filters.customStartDate || filters.customEndDate
                  ? 'border-emerald-200 bg-emerald-50/70 text-emerald-800 font-semibold'
                  : 'border-zinc-200/80 bg-zinc-50 text-zinc-600 hover:border-zinc-300 hover:bg-zinc-100/80'
              }`}
            >
              <Calendar className="w-3 h-3 text-zinc-400" />
              <span className="max-w-[130px] truncate">
                {filters.datePreset === 'all' && !filters.customStartDate
                  ? 'Periodo'
                  : getPresetLabel(filters.datePreset)}
              </span>
              <ChevronDown className="w-3 h-3 opacity-60" />
            </button>

            {openDropdown === 'date' && (
              <div className="absolute left-0 top-full mt-1.5 w-64 rounded-xl border border-zinc-200 bg-white p-1.5 shadow-xl z-30 animate-in fade-in zoom-in-95 duration-100">
                <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                  Seleccionar Periodo
                </div>
                <div className="space-y-0.5">
                  {DATE_PRESET_OPTIONS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => {
                        onFilterChange({
                          datePreset: preset.id,
                          ...(preset.id !== 'custom' ? { customStartDate: '', customEndDate: '' } : {}),
                        });
                        if (preset.id !== 'custom') {
                          setOpenDropdown(null);
                        }
                      }}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                        filters.datePreset === preset.id
                          ? 'bg-emerald-50 text-emerald-900 font-bold'
                          : 'text-zinc-700 hover:bg-zinc-100'
                      }`}
                    >
                      <span>{preset.label}</span>
                      {filters.datePreset === preset.id && (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      )}
                    </button>
                  ))}
                </div>

                {availableMonths.length > 0 && (
                  <>
                    <div className="my-1.5 border-t border-zinc-100" />
                    <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                      Meses con movimientos
                    </div>
                    <div className="max-h-36 overflow-y-auto space-y-0.5">
                      {availableMonths.map((m) => (
                        <button
                          key={m.value}
                          type="button"
                          onClick={() => {
                            onFilterChange({
                              datePreset: m.value,
                              customStartDate: '',
                              customEndDate: '',
                            });
                            setOpenDropdown(null);
                          }}
                          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                            filters.datePreset === m.value
                              ? 'bg-emerald-50 text-emerald-900 font-bold'
                              : 'text-zinc-700 hover:bg-zinc-100'
                          }`}
                        >
                          <span>{m.label}</span>
                          {filters.datePreset === m.value && (
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                          )}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Quick Category Dropdown */}
          {showCategoryFilter && categories.length > 0 && (
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setOpenDropdown(openDropdown === 'category' ? null : 'category')}
                className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg border text-xs font-medium transition-all cursor-pointer ${
                  filters.category !== 'all'
                    ? 'border-emerald-200 bg-emerald-50/70 text-emerald-800 font-semibold'
                    : 'border-zinc-200/80 bg-zinc-50 text-zinc-600 hover:border-zinc-300 hover:bg-zinc-100/80'
                }`}
              >
                <Tag className="w-3 h-3 text-zinc-400" />
                <span className="max-w-[120px] truncate">
                  {filters.category === 'all' ? 'Categoría' : filters.category}
                </span>
                <ChevronDown className="w-3 h-3 opacity-60" />
              </button>

              {openDropdown === 'category' && (
                <div className="absolute left-0 top-full mt-1.5 w-56 rounded-xl border border-zinc-200 bg-white p-1.5 shadow-xl z-30 animate-in fade-in zoom-in-95 duration-100">
                  <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                    Filtrar por Categoría
                  </div>
                  <div className="max-h-56 overflow-y-auto space-y-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        onFilterChange({ category: 'all' });
                        setOpenDropdown(null);
                      }}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                        filters.category === 'all'
                          ? 'bg-emerald-50 text-emerald-900 font-bold'
                          : 'text-zinc-700 hover:bg-zinc-100'
                      }`}
                    >
                      <span>Todas las categorías</span>
                      {filters.category === 'all' && (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      )}
                    </button>
                    {categories.map((cat) => {
                      const config = getCategoryConfig(cat);
                      const CatIcon = config.icon;
                      return (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => {
                            onFilterChange({ category: cat });
                            setOpenDropdown(null);
                          }}
                          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                            filters.category === cat
                              ? 'bg-emerald-50 text-emerald-900 font-bold'
                              : 'text-zinc-700 hover:bg-zinc-100'
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate">
                            <div
                              className={`w-5 h-5 rounded-md flex items-center justify-center ${config.bgClass} ${config.textClass}`}
                            >
                              <CatIcon className="w-3 h-3" />
                            </div>
                            <span className="truncate">{cat}</span>
                          </div>
                          {filters.category === cat && (
                            <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 ml-1" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Quick Group Dropdown */}
          {showGroupFilter && userGroups.length > 0 && (
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setOpenDropdown(openDropdown === 'group' ? null : 'group')}
                className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg border text-xs font-medium transition-all cursor-pointer ${
                  filters.groupId !== 'all'
                    ? 'border-emerald-200 bg-emerald-50/70 text-emerald-800 font-semibold'
                    : 'border-zinc-200/80 bg-zinc-50 text-zinc-600 hover:border-zinc-300 hover:bg-zinc-100/80'
                }`}
              >
                <FolderKanban className="w-3 h-3 text-zinc-400" />
                <span className="max-w-[120px] truncate">
                  {filters.groupId === 'all'
                    ? 'Grupo'
                    : selectedGroup?.name || 'Grupo'}
                </span>
                <ChevronDown className="w-3 h-3 opacity-60" />
              </button>

              {openDropdown === 'group' && (
                <div className="absolute left-0 top-full mt-1.5 w-56 rounded-xl border border-zinc-200 bg-white p-1.5 shadow-xl z-30 animate-in fade-in zoom-in-95 duration-100">
                  <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                    Filtrar por Grupo
                  </div>
                  <div className="max-h-56 overflow-y-auto space-y-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        onFilterChange({ groupId: 'all' });
                        setOpenDropdown(null);
                      }}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                        filters.groupId === 'all'
                          ? 'bg-emerald-50 text-emerald-900 font-bold'
                          : 'text-zinc-700 hover:bg-zinc-100'
                      }`}
                    >
                      <span>Todos los grupos</span>
                      {filters.groupId === 'all' && (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      )}
                    </button>
                    {userGroups.map((group) => (
                      <button
                        key={group.id}
                        type="button"
                        onClick={() => {
                          onFilterChange({ groupId: group.id });
                          setOpenDropdown(null);
                        }}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                          filters.groupId === group.id
                            ? 'bg-emerald-50 text-emerald-900 font-bold'
                            : 'text-zinc-700 hover:bg-zinc-100'
                        }`}
                      >
                        <span className="truncate">{group.name}</span>
                        {filters.groupId === group.id && (
                          <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 ml-1" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Quick Date Mode Toggle Button */}
          <button
            type="button"
            onClick={() =>
              onFilterChange({
                dateMode: filters.dateMode === 'expense_date' ? 'entry_date' : 'expense_date',
              })
            }
            title={
              filters.dateMode === 'expense_date'
                ? 'Actualmente filtrando por fecha del gasto. Clic para cambiar a fecha de registro.'
                : 'Actualmente filtrando por fecha de registro en el sistema. Clic para cambiar a fecha del gasto.'
            }
            className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg border text-xs font-medium transition-all cursor-pointer shrink-0 ${
              filters.dateMode === 'entry_date'
                ? 'border-indigo-200 bg-indigo-50/80 text-indigo-800 font-semibold'
                : 'border-zinc-200/80 bg-zinc-50 text-zinc-600 hover:border-zinc-300 hover:bg-zinc-100/80'
            }`}
          >
            {filters.dateMode === 'entry_date' ? (
              <Clock className="w-3 h-3 text-indigo-600" />
            ) : (
              <Calendar className="w-3 h-3 text-zinc-400" />
            )}
            <span>{filters.dateMode === 'entry_date' ? 'Por registro' : 'Por gasto'}</span>
          </button>
        </div>
      </div>

      {/* Active Filter Chips Ribbon (Visible when there are active filters) */}
      {activeChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-zinc-100 bg-zinc-50/50 px-3 py-2 sm:px-4">
          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mr-1 flex items-center gap-1">
            <Filter className="w-3 h-3 text-zinc-400" />
            Activos:
          </span>

          {activeChips.map((chip) => {
            const catConfig = chip.categoryName ? getCategoryConfig(chip.categoryName) : null;
            const CatIcon = catConfig?.icon;

            return (
              <span
                key={chip.id}
                className="group inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white py-1 pl-2.5 pr-1.5 text-xs font-semibold text-zinc-700 shadow-2xs transition-colors hover:border-zinc-300"
              >
                {CatIcon && (
                  <span className={`w-3.5 h-3.5 rounded-full flex items-center justify-center ${catConfig.bgClass} ${catConfig.textClass}`}>
                    <CatIcon className="w-2.5 h-2.5" />
                  </span>
                )}
                <span className="max-w-[180px] truncate">{chip.label}</span>
                <button
                  type="button"
                  onClick={chip.onRemove}
                  className="rounded-full p-0.5 text-zinc-400 hover:bg-rose-50 hover:text-rose-600 transition-colors cursor-pointer"
                  title="Quitar filtro"
                  aria-label={`Quitar filtro ${chip.label}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            );
          })}

          <button
            type="button"
            onClick={handleReset}
            className="ml-auto text-xs font-semibold text-zinc-400 hover:text-rose-600 transition-colors cursor-pointer"
          >
            Limpiar todo
          </button>
        </div>
      )}

      {/* Expanded Filter Studio Panel */}
      {isExpanded && (
        <div className="border-t border-zinc-200/80 bg-zinc-50/70 p-4 sm:p-5 space-y-5 rounded-b-2xl animate-in fade-in duration-150">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Left Block: Date Range & Presets (7 cols on large) */}
            <div className="lg:col-span-7 space-y-3.5 bg-white p-4 rounded-xl border border-zinc-200/90 shadow-2xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-600">
                  <CalendarDays className="w-4 h-4 text-emerald-600" />
                  <span>Periodo y Fechas</span>
                </div>
                <span className="text-[11px] text-zinc-400">Selecciona rango rápido o personalizado</span>
              </div>

              {/* Fast Preset Chips */}
              <div className="flex flex-wrap gap-1.5">
                {DATE_PRESET_OPTIONS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => {
                      onFilterChange({
                        datePreset: preset.id,
                        ...(preset.id !== 'custom' ? { customStartDate: '', customEndDate: '' } : {}),
                      });
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      filters.datePreset === preset.id
                        ? 'bg-zinc-900 text-white shadow-xs'
                        : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200/80 hover:text-zinc-900'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              {/* Specific Month selector if available */}
              {availableMonths.length > 0 && (
                <div className="pt-2 border-t border-zinc-100">
                  <span className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wide mb-1.5">
                    Meses con actividad
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {availableMonths.map((m) => (
                      <button
                        key={m.value}
                        type="button"
                        onClick={() =>
                          onFilterChange({
                            datePreset: m.value,
                            customStartDate: '',
                            customEndDate: '',
                          })
                        }
                        className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                          filters.datePreset === m.value
                            ? 'bg-emerald-600 text-white font-bold'
                            : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200/80'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Custom Date Inputs (shown when custom is selected or if custom dates exist) */}
              {(filters.datePreset === 'custom' || filters.customStartDate || filters.customEndDate) && (
                <div className="pt-3 border-t border-zinc-100 space-y-2">
                  <span className="block text-[11px] font-bold text-zinc-600 uppercase tracking-wide">
                    Rango personalizado de fechas
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-zinc-400 mb-1">
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
                        className="w-full h-9 rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-xs font-medium text-zinc-800 focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/15"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-zinc-400 mb-1">
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
                        className="w-full h-9 rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-xs font-medium text-zinc-800 focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/15"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Right Block: Category, Group & Date Mode Studio (5 cols on large) */}
            <div className="lg:col-span-5 space-y-4">
              {/* Date Mode Card */}
              <div className="bg-white p-4 rounded-xl border border-zinc-200/90 shadow-2xs space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-zinc-600">
                    <ArrowUpDown className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Criterio de Tiempo</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => onFilterChange({ dateMode: 'expense_date' })}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                      filters.dateMode === 'expense_date'
                        ? 'border-emerald-500 bg-emerald-50/50 ring-2 ring-emerald-500/15'
                        : 'border-zinc-200 bg-zinc-50/50 hover:bg-zinc-100/80'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <Calendar className={`w-4 h-4 ${filters.dateMode === 'expense_date' ? 'text-emerald-600' : 'text-zinc-400'}`} />
                      {filters.dateMode === 'expense_date' && (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      )}
                    </div>
                    <div>
                      <span className={`block text-xs font-bold ${filters.dateMode === 'expense_date' ? 'text-emerald-950' : 'text-zinc-800'}`}>
                        Fecha del gasto
                      </span>
                      <span className="block text-[10.5px] text-zinc-500 leading-tight mt-0.5">
                        Momento en que se realizó el gasto
                      </span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => onFilterChange({ dateMode: 'entry_date' })}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                      filters.dateMode === 'entry_date'
                        ? 'border-indigo-500 bg-indigo-50/50 ring-2 ring-indigo-500/15'
                        : 'border-zinc-200 bg-zinc-50/50 hover:bg-zinc-100/80'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <Clock className={`w-4 h-4 ${filters.dateMode === 'entry_date' ? 'text-indigo-600' : 'text-zinc-400'}`} />
                      {filters.dateMode === 'entry_date' && (
                        <Check className="w-3.5 h-3.5 text-indigo-600" />
                      )}
                    </div>
                    <div>
                      <span className={`block text-xs font-bold ${filters.dateMode === 'entry_date' ? 'text-indigo-950' : 'text-zinc-800'}`}>
                        Fecha de registro
                      </span>
                      <span className="block text-[10.5px] text-zinc-500 leading-tight mt-0.5">
                        Cuándo se creó o editó en el sistema
                      </span>
                    </div>
                  </button>
                </div>
              </div>

              {/* Categories Studio */}
              {showCategoryFilter && categories.length > 0 && (
                <div className="bg-white p-4 rounded-xl border border-zinc-200/90 shadow-2xs space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-zinc-600">
                      <Tag className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Categorías ({categories.length})</span>
                    </div>
                    {filters.category !== 'all' && (
                      <button
                        type="button"
                        onClick={() => onFilterChange({ category: 'all' })}
                        className="text-[11px] font-semibold text-zinc-400 hover:text-zinc-700 cursor-pointer"
                      >
                        Todas
                      </button>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-1">
                    <button
                      type="button"
                      onClick={() => onFilterChange({ category: 'all' })}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                        filters.category === 'all'
                          ? 'bg-zinc-900 text-white font-bold'
                          : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200/80'
                      }`}
                    >
                      Todas
                    </button>
                    {categories.map((cat) => {
                      const config = getCategoryConfig(cat);
                      const CatIcon = config.icon;
                      const isSelected = filters.category === cat;
                      return (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => onFilterChange({ category: isSelected ? 'all' : cat })}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-emerald-600 text-white font-bold shadow-xs'
                              : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200/80'
                          }`}
                        >
                          <CatIcon className="w-3 h-3" />
                          <span>{cat}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Groups Studio */}
              {showGroupFilter && userGroups.length > 0 && (
                <div className="bg-white p-4 rounded-xl border border-zinc-200/90 shadow-2xs space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-zinc-600">
                      <FolderKanban className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Grupos ({userGroups.length})</span>
                    </div>
                    {filters.groupId !== 'all' && (
                      <button
                        type="button"
                        onClick={() => onFilterChange({ groupId: 'all' })}
                        className="text-[11px] font-semibold text-zinc-400 hover:text-zinc-700 cursor-pointer"
                      >
                        Todos
                      </button>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto pr-1">
                    <button
                      type="button"
                      onClick={() => onFilterChange({ groupId: 'all' })}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                        filters.groupId === 'all'
                          ? 'bg-zinc-900 text-white font-bold'
                          : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200/80'
                      }`}
                    >
                      Todos
                    </button>
                    {userGroups.map((group) => {
                      const isSelected = filters.groupId === group.id;
                      return (
                        <button
                          key={group.id}
                          type="button"
                          onClick={() => onFilterChange({ groupId: isSelected ? 'all' : group.id })}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-emerald-600 text-white font-bold shadow-xs'
                              : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200/80'
                          }`}
                        >
                          {group.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Bottom Actions inside Expanded Panel */}
          <div className="flex items-center justify-between pt-3 border-t border-zinc-200/60">
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-500 hover:text-rose-600 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Restablecer todos los filtros</span>
            </button>

            <button
              type="button"
              onClick={() => setIsExpanded(false)}
              className="px-4 py-1.5 rounded-xl bg-zinc-900 text-white text-xs font-bold hover:bg-zinc-800 transition-all active:scale-95 shadow-xs cursor-pointer"
            >
              Aplicar y cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
