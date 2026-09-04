'use client';

import React, { useState, useEffect } from 'react';
import {
  CalendarDays,
  Tag,
  SlidersHorizontal,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  X,
  Check,
  Calendar,
  Clock,
  UserCheck,
  RotateCcw,
} from 'lucide-react';
import { TransactionFilterState } from '@/components/TransactionFilterBar';
import { DatePreset, DateFilterMode } from '@/lib/transaction-date-utils';
import { getCategoryConfig } from '@/lib/expense-category-utils';

interface GroupExpenseFilterSheetProps {
  isOpen: boolean;
  onClose: () => void;
  filters: TransactionFilterState;
  onApplyFilters: (newFilters: TransactionFilterState) => void;
  availableMonths?: Array<{ value: string; label: string }>;
  categories?: string[];
}

const DATE_PRESET_OPTIONS: Array<{ id: DatePreset; label: string; shortLabel: string }> = [
  { id: 'all', label: 'Todas las fechas', shortLabel: 'Todas' },
  { id: 'this_month', label: 'Este mes', shortLabel: 'Este mes' },
  { id: 'last_month', label: 'Mes anterior', shortLabel: 'Mes anterior' },
  { id: 'this_week', label: 'Últimos 7 días', shortLabel: 'Últimos 7 días' },
  { id: 'today', label: 'Hoy', shortLabel: 'Hoy' },
  { id: 'yesterday', label: 'Ayer', shortLabel: 'Ayer' },
  { id: 'custom', label: 'Rango personalizado...', shortLabel: 'Personalizado' },
];

export function GroupExpenseFilterSheet({
  isOpen,
  onClose,
  filters,
  onApplyFilters,
  availableMonths = [],
  categories = [],
}: GroupExpenseFilterSheetProps) {
  if (!isOpen) return null;

  return (
    <GroupExpenseFilterSheetModal
      onClose={onClose}
      filters={filters}
      onApplyFilters={onApplyFilters}
      availableMonths={availableMonths}
      categories={categories}
    />
  );
}

function GroupExpenseFilterSheetModal({
  onClose,
  filters,
  onApplyFilters,
  availableMonths = [],
  categories = [],
}: Omit<GroupExpenseFilterSheetProps, 'isOpen'>) {
  // Temporary staging state inside the bottom sheet
  const [stagedFilters, setStagedFilters] = useState<TransactionFilterState>(() => ({ ...filters }));
  const [isMoreFiltersOpen, setIsMoreFiltersOpen] = useState(
    () =>
      filters.scope === 'mine' ||
      filters.dateMode !== 'expense_date' ||
      Boolean(filters.customStartDate || filters.customEndDate)
  );
  const [activePicker, setActivePicker] = useState<'period' | 'category' | null>(null);

  const handlePeriodSelect = (presetId: DatePreset | string) => {
    setStagedFilters((prev) => ({
      ...prev,
      datePreset: presetId,
      ...(presetId !== 'custom' ? { customStartDate: '', customEndDate: '' } : {}),
    }));
    setActivePicker(null);
  };

  const handleCategorySelect = (category: string) => {
    setStagedFilters((prev) => ({
      ...prev,
      category,
    }));
    setActivePicker(null);
  };

  const handleReset = () => {
    setStagedFilters({
      ...stagedFilters,
      scope: 'all',
      dateMode: 'expense_date',
      datePreset: 'all',
      customStartDate: '',
      customEndDate: '',
      category: 'all',
    });
    setActivePicker(null);
  };

  const handleApply = () => {
    onApplyFilters(stagedFilters);
    onClose();
  };

  // Get human-readable label for selected period
  const getSelectedPeriodLabel = () => {
    const found = DATE_PRESET_OPTIONS.find((p) => p.id === stagedFilters.datePreset);
    if (found) return found.shortLabel;
    const foundMonth = availableMonths.find((m) => m.value === stagedFilters.datePreset);
    if (foundMonth) return foundMonth.label;
    if (stagedFilters.customStartDate || stagedFilters.customEndDate) return 'Personalizado';
    return 'Todas';
  };

  // Get human-readable label for selected category
  const getSelectedCategoryLabel = () => {
    if (!stagedFilters.category || stagedFilters.category === 'all') {
      return 'Todas';
    }
    return stagedFilters.category;
  };

  // Count active filters in the "Más filtros" section
  const moreFiltersCount =
    (stagedFilters.scope === 'mine' ? 1 : 0) +
    (stagedFilters.dateMode !== 'expense_date' ? 1 : 0) +
    (stagedFilters.customStartDate || stagedFilters.customEndDate ? 1 : 0);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      {/* Dimmed backdrop overlay */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-[2px] transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Bottom sheet content container */}
      <div
        className="relative z-50 w-full max-w-lg bg-white rounded-t-[32px] shadow-2xl px-5 pt-3.5 pb-7 space-y-4 animate-in slide-in-from-bottom duration-250 border-t border-zinc-100 max-h-[90vh] overflow-y-auto"
        role="dialog"
        aria-modal="true"
        aria-labelledby="filter-sheet-title"
      >
        {/* Top Centered Drag Handle */}
        <div className="w-12 h-1.5 bg-zinc-300 rounded-full mx-auto mb-1" />

        {/* Clean Header: "Filtros" + "Limpiar" */}
        <div className="flex items-center justify-between pt-1">
          <h2 id="filter-sheet-title" className="text-xl font-bold text-zinc-900 tracking-tight">
            Filtros
          </h2>
          <button
            type="button"
            onClick={handleReset}
            className="text-sm font-semibold text-emerald-600 hover:text-emerald-700 transition cursor-pointer active:scale-95"
          >
            Limpiar
          </button>
        </div>

        {/* Two Main Filters (Período & Categoría) */}
        <div className="grid grid-cols-2 gap-2.5">
          {/* Período Control */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setActivePicker(activePicker === 'period' ? null : 'period')}
              className={`w-full text-left p-3 rounded-2xl border transition-all flex items-center justify-between gap-2 cursor-pointer ${
                activePicker === 'period'
                  ? 'border-emerald-600 bg-emerald-50/20 ring-1 ring-emerald-500/30'
                  : stagedFilters.datePreset !== 'all'
                  ? 'border-zinc-300 bg-zinc-50/60'
                  : 'border-zinc-200/90 bg-white hover:border-zinc-300'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <CalendarDays className="w-5 h-5 text-zinc-600 shrink-0" />
                <div className="min-w-0">
                  <span className="block text-[11px] font-medium text-zinc-400 leading-tight">
                    Período
                  </span>
                  <span className="block text-sm font-semibold text-zinc-900 truncate">
                    {getSelectedPeriodLabel()}
                  </span>
                </div>
              </div>
              <ChevronDown
                className={`w-4 h-4 text-zinc-400 shrink-0 transition-transform ${
                  activePicker === 'period' ? 'rotate-180 text-emerald-600' : ''
                }`}
              />
            </button>

            {/* Período Dropdown Picker */}
            {activePicker === 'period' && (
              <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-zinc-200 rounded-2xl shadow-xl p-1.5 z-50 max-h-60 overflow-y-auto animate-in fade-in zoom-in-95 duration-150">
                <div className="space-y-0.5">
                  {DATE_PRESET_OPTIONS.map((option) => {
                    const isSelected = stagedFilters.datePreset === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => handlePeriodSelect(option.id)}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold text-left transition cursor-pointer ${
                          isSelected
                            ? 'bg-emerald-50 text-emerald-700 font-bold'
                            : 'text-zinc-700 hover:bg-zinc-100/80'
                        }`}
                      >
                        <span className="truncate">{option.label}</span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 ml-2" />}
                      </button>
                    );
                  })}

                  {availableMonths.length > 0 && (
                    <div className="pt-1.5 mt-1.5 border-t border-zinc-100">
                      <span className="px-3 py-1 text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                        Meses con actividad
                      </span>
                      {availableMonths.map((month) => {
                        const isSelected = stagedFilters.datePreset === month.value;
                        return (
                          <button
                            key={month.value}
                            type="button"
                            onClick={() => handlePeriodSelect(month.value)}
                            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold text-left transition cursor-pointer ${
                              isSelected
                                ? 'bg-emerald-50 text-emerald-700 font-bold'
                                : 'text-zinc-700 hover:bg-zinc-100/80'
                            }`}
                          >
                            <span className="truncate">{month.label}</span>
                            {isSelected && <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 ml-2" />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Categoría Control */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setActivePicker(activePicker === 'category' ? null : 'category')}
              className={`w-full text-left p-3 rounded-2xl border transition-all flex items-center justify-between gap-2 cursor-pointer ${
                activePicker === 'category'
                  ? 'border-emerald-600 bg-emerald-50/20 ring-1 ring-emerald-500/30'
                  : stagedFilters.category !== 'all'
                  ? 'border-zinc-300 bg-zinc-50/60'
                  : 'border-zinc-200/90 bg-white hover:border-zinc-300'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                {stagedFilters.category !== 'all' ? (
                  (() => {
                    const catConfig = getCategoryConfig(stagedFilters.category);
                    const CatIcon = catConfig.icon;
                    return (
                      <div className={`w-5 h-5 rounded-full ${catConfig.bgClass} ${catConfig.textClass} flex items-center justify-center shrink-0`}>
                        <CatIcon className="w-3 h-3" />
                      </div>
                    );
                  })()
                ) : (
                  <Tag className="w-5 h-5 text-zinc-600 shrink-0" />
                )}
                <div className="min-w-0">
                  <span className="block text-[11px] font-medium text-zinc-400 leading-tight">
                    Categoría
                  </span>
                  <span className="block text-sm font-semibold text-zinc-900 truncate">
                    {getSelectedCategoryLabel()}
                  </span>
                </div>
              </div>
              <ChevronDown
                className={`w-4 h-4 text-zinc-400 shrink-0 transition-transform ${
                  activePicker === 'category' ? 'rotate-180 text-emerald-600' : ''
                }`}
              />
            </button>

            {/* Categoría Dropdown Picker */}
            {activePicker === 'category' && (
              <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-zinc-200 rounded-2xl shadow-xl p-1.5 z-50 max-h-60 overflow-y-auto animate-in fade-in zoom-in-95 duration-150">
                <div className="space-y-0.5">
                  <button
                    type="button"
                    onClick={() => handleCategorySelect('all')}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold text-left transition cursor-pointer ${
                      stagedFilters.category === 'all'
                        ? 'bg-emerald-50 text-emerald-700 font-bold'
                        : 'text-zinc-700 hover:bg-zinc-100/80'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-5 h-5 rounded-full bg-zinc-100 text-zinc-600 flex items-center justify-center shrink-0">
                        <Tag className="w-3 h-3" />
                      </div>
                      <span className="truncate">Todas las categorías</span>
                    </div>
                    {stagedFilters.category === 'all' && (
                      <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 ml-2" />
                    )}
                  </button>

                  {categories.map((cat) => {
                    const isSelected = stagedFilters.category === cat;
                    const catConfig = getCategoryConfig(cat);
                    const CatIcon = catConfig.icon;
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => handleCategorySelect(cat)}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold text-left transition cursor-pointer ${
                          isSelected
                            ? 'bg-emerald-50 text-emerald-700 font-bold'
                            : 'text-zinc-700 hover:bg-zinc-100/80'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div className={`w-5 h-5 rounded-full ${catConfig.bgClass} ${catConfig.textClass} flex items-center justify-center shrink-0`}>
                            <CatIcon className="w-3 h-3" />
                          </div>
                          <span className="truncate">{cat}</span>
                        </div>
                        {isSelected && <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 ml-2" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Full-width "Más filtros" Row */}
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => {
              setActivePicker(null);
              setIsMoreFiltersOpen(!isMoreFiltersOpen);
            }}
            className="w-full p-3.5 rounded-2xl border border-zinc-200/90 bg-white hover:border-zinc-300 transition flex items-center justify-between cursor-pointer"
          >
            <div className="flex items-center gap-2.5">
              <SlidersHorizontal className="w-4 h-4 text-zinc-600 shrink-0" />
              <span className="text-sm font-semibold text-zinc-900">Más filtros</span>
              {moreFiltersCount > 0 && (
                <span className="w-5 h-5 rounded-full bg-emerald-600 text-white text-[11px] font-bold flex items-center justify-center">
                  {moreFiltersCount}
                </span>
              )}
            </div>
            {isMoreFiltersOpen ? (
              <ChevronUp className="w-4 h-4 text-zinc-400" />
            ) : (
              <ChevronRight className="w-4 h-4 text-zinc-400" />
            )}
          </button>

          {/* Expandable "Más filtros" Panel */}
          {isMoreFiltersOpen && (
            <div className="p-3.5 bg-zinc-50/70 border border-zinc-200/80 rounded-2xl space-y-3.5 animate-in fade-in duration-150">
              {/* Participación (Scope) */}
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-xs font-semibold text-zinc-700">
                  <UserCheck className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Participación</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setStagedFilters({ ...stagedFilters, scope: 'all' })}
                    className={`h-9 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                      stagedFilters.scope === 'all'
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                        : 'border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50'
                    }`}
                  >
                    Todos los movimientos
                  </button>
                  <button
                    type="button"
                    onClick={() => setStagedFilters({ ...stagedFilters, scope: 'mine' })}
                    className={`h-9 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                      stagedFilters.scope === 'mine'
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                        : 'border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50'
                    }`}
                  >
                    Solo mis movimientos
                  </button>
                </div>
              </div>

              {/* Criterio de fecha */}
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-xs font-semibold text-zinc-700">
                  <Clock className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Criterio de fecha</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setStagedFilters({ ...stagedFilters, dateMode: 'expense_date' })}
                    className={`h-9 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                      stagedFilters.dateMode === 'expense_date'
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                        : 'border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50'
                    }`}
                  >
                    Fecha del gasto
                  </button>
                  <button
                    type="button"
                    onClick={() => setStagedFilters({ ...stagedFilters, dateMode: 'entry_date' })}
                    className={`h-9 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                      stagedFilters.dateMode === 'entry_date'
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                        : 'border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50'
                    }`}
                  >
                    Fecha de registro
                  </button>
                </div>
              </div>

              {/* Custom Date Range if Custom selected or dates entered */}
              {(stagedFilters.datePreset === 'custom' || stagedFilters.customStartDate || stagedFilters.customEndDate) && (
                <div className="pt-2 border-t border-zinc-200/60 space-y-2">
                  <span className="block text-xs font-semibold text-zinc-700">
                    Rango personalizado
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-medium text-zinc-400 mb-1">
                        Desde
                      </label>
                      <input
                        type="date"
                        value={stagedFilters.customStartDate}
                        onChange={(e) =>
                          setStagedFilters({
                            ...stagedFilters,
                            customStartDate: e.target.value,
                            datePreset: 'custom',
                          })
                        }
                        className="w-full h-8.5 rounded-lg border border-zinc-200 bg-white px-2 text-xs font-medium text-zinc-800 focus:border-emerald-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-zinc-400 mb-1">
                        Hasta
                      </label>
                      <input
                        type="date"
                        value={stagedFilters.customEndDate}
                        onChange={(e) =>
                          setStagedFilters({
                            ...stagedFilters,
                            customEndDate: e.target.value,
                            datePreset: 'custom',
                          })
                        }
                        className="w-full h-8.5 rounded-lg border border-zinc-200 bg-white px-2 text-xs font-medium text-zinc-800 focus:border-emerald-500 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Primary Action Button: "Aplicar filtros" */}
        <div className="pt-1">
          <button
            type="button"
            onClick={handleApply}
            className="w-full h-12 bg-emerald-600 hover:bg-emerald-500 active:scale-[0.99] text-white font-semibold text-sm rounded-2xl transition shadow-xs flex items-center justify-center cursor-pointer"
          >
            Aplicar filtros
          </button>
        </div>
      </div>
    </div>
  );
}
