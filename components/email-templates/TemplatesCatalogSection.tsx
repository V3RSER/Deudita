'use client';

import React, { useState, useMemo } from 'react';
import {
  Layers,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Building2,
  Tag,
  ChevronDown,
  ChevronUp,
  Sparkles,
  RefreshCw,
  Hash,
  Clock,
  CreditCard,
  DollarSign,
  Calendar,
  AlertCircle,
} from 'lucide-react';
import { CatalogTemplate, CatalogEntity } from '@/lib/email-matching';

interface TemplatesCatalogSectionProps {
  templates: (CatalogTemplate & { enabled?: boolean })[];
  entities: CatalogEntity[];
  expenseTypes: Array<{ id: string; name?: string; label?: string }>;
  ambiguousTemplates?: Array<{
    entity_id: string;
    subject_pattern: string;
    template_ids: string[];
    template_names: string[];
  }>;
  isLoading?: boolean;
  isTesterAuthorized?: boolean;
  onRefresh: () => void;
  onTogglePreference: (templateId: string, enabled: boolean) => Promise<void>;
  onTestTemplate: (template: CatalogTemplate) => void;
}

export function TemplatesCatalogSection({
  templates,
  entities,
  expenseTypes,
  ambiguousTemplates = [],
  isLoading = false,
  isTesterAuthorized = false,
  onRefresh,
  onTogglePreference,
  onTestTemplate,
}: TemplatesCatalogSectionProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEntityId, setSelectedEntityId] = useState<string>('all');
  const [selectedExpenseTypeId, setSelectedExpenseTypeId] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'enabled' | 'disabled'>('all');
  const [expandedTemplateId, setExpandedTemplateId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Filter templates
  const filteredTemplates = useMemo(() => {
    return templates.filter((template) => {
      // Status filter
      const isEnabled = template.enabled !== false;
      if (statusFilter === 'enabled' && !isEnabled) return false;
      if (statusFilter === 'disabled' && isEnabled) return false;

      // Entity filter
      if (selectedEntityId !== 'all') {
        if (template.entity_id !== selectedEntityId && template.entity_name !== selectedEntityId) {
          return false;
        }
      }

      // Expense type filter
      if (selectedExpenseTypeId !== 'all') {
        if (template.expense_type_id !== selectedExpenseTypeId) return false;
      }

      // Search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const nameMatch = template.name.toLowerCase().includes(query);
        const entityMatch = template.entity_name?.toLowerCase().includes(query);
        const subjectMatch = template.subject_pattern?.toLowerCase().includes(query);
        const matchPatternMatch = template.match_pattern?.toLowerCase().includes(query);
        if (!nameMatch && !entityMatch && !subjectMatch && !matchPatternMatch) {
          return false;
        }
      }

      return true;
    });
  }, [templates, statusFilter, selectedEntityId, selectedExpenseTypeId, searchQuery]);

  const handleToggle = async (templateId: string, currentEnabled: boolean) => {
    setUpdatingId(templateId);
    try {
      await onTogglePreference(templateId, !currentEnabled);
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="space-y-6" id="section-templates-catalog">
      {/* Top Filter Bar */}
      <div className="bg-white border border-zinc-200/80 rounded-2xl p-4 shadow-2xs space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Status Quick Filter */}
          <div className="flex items-center space-x-1.5 p-1 bg-zinc-100 rounded-xl">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                statusFilter === 'all'
                  ? 'bg-white text-zinc-900 shadow-2xs font-semibold'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              Todas ({templates.length})
            </button>
            <button
              onClick={() => setStatusFilter('enabled')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                statusFilter === 'enabled'
                  ? 'bg-white text-zinc-900 shadow-2xs font-semibold'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              Habilitadas ({templates.filter((t) => t.enabled !== false).length})
            </button>
            <button
              onClick={() => setStatusFilter('disabled')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                statusFilter === 'disabled'
                  ? 'bg-white text-zinc-900 shadow-2xs font-semibold'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              Deshabilitadas ({templates.filter((t) => t.enabled === false).length})
            </button>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={onRefresh}
              disabled={isLoading}
              className="p-2 text-zinc-600 hover:text-zinc-900 bg-white border border-zinc-200 hover:bg-zinc-50 rounded-xl transition shadow-2xs"
              title="Actualizar catálogo"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-zinc-900' : ''}`} />
            </button>
          </div>
        </div>

        {/* Dropdowns and Search */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
          {/* Search */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              placeholder="Buscar plantilla o patrón..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-zinc-50 border border-zinc-200 rounded-xl text-zinc-800 focus:outline-none focus:border-zinc-400"
            />
          </div>

          {/* Entity Dropdown */}
          <div>
            <select
              value={selectedEntityId}
              onChange={(e) => setSelectedEntityId(e.target.value)}
              className="w-full px-3 py-1.5 text-xs bg-zinc-50 border border-zinc-200 rounded-xl text-zinc-800 focus:outline-none focus:border-zinc-400"
            >
              <option value="all">Todas las entidades ({entities.length})</option>
              {entities.map((ent) => (
                <option key={ent.id} value={ent.id}>
                  {ent.name}
                </option>
              ))}
            </select>
          </div>

          {/* Expense Type Dropdown */}
          <div>
            <select
              value={selectedExpenseTypeId}
              onChange={(e) => setSelectedExpenseTypeId(e.target.value)}
              className="w-full px-3 py-1.5 text-xs bg-zinc-50 border border-zinc-200 rounded-xl text-zinc-800 focus:outline-none focus:border-zinc-400"
            >
              <option value="all">Todos los tipos de gasto</option>
              {expenseTypes.map((et) => (
                <option key={et.id} value={et.id}>
                  {et.label || et.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Ambiguity Alert Banner if applicable */}
      {ambiguousTemplates.length > 0 && (
        <div className="p-4 bg-amber-50 border border-amber-200/80 rounded-2xl flex items-start space-x-3 text-xs text-amber-900 shadow-2xs">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="font-semibold text-amber-950">Atención: Se detectaron plantillas ambiguas</h4>
            <p className="text-amber-800/90 text-[11px] leading-relaxed">
              Existen plantillas activas de la misma entidad que comparten el mismo patrón de asunto sin tener un
              patrón de desempate (<code className="font-mono bg-amber-100/80 px-1 py-0.5 rounded">match_pattern</code>).
              Esto puede provocar que ambas compitan por el mismo correo.
            </p>
          </div>
        </div>
      )}

      {/* Templates Cards Grid */}
      {filteredTemplates.length === 0 ? (
        <div className="bg-white border border-zinc-200/80 rounded-2xl p-10 text-center shadow-2xs">
          <div className="w-12 h-12 rounded-2xl bg-zinc-100 text-zinc-400 flex items-center justify-center mx-auto mb-3">
            <Layers className="w-6 h-6" />
          </div>
          <h4 className="text-sm font-semibold text-zinc-800">No hay plantillas con estos filtros</h4>
          <p className="text-xs text-zinc-500 max-w-md mx-auto mt-1">
            Prueba cambiando los filtros de entidad o estado, o crea una plantilla nueva en la pestaña siguiente.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3.5">
          {filteredTemplates.map((template) => {
            const isEnabled = template.enabled !== false;
            const isExpanded = expandedTemplateId === template.id;
            const isUpdating = updatingId === template.id;

            return (
              <div
                key={template.id}
                className={`bg-white border rounded-2xl p-5 transition shadow-2xs ${
                  isEnabled
                    ? 'border-zinc-200/80 hover:border-zinc-300'
                    : 'border-zinc-200/60 bg-zinc-50/40 opacity-70'
                }`}
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  {/* Left: Template Info & Badges */}
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Entity badge */}
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-zinc-100 text-zinc-800 border border-zinc-200">
                        <Building2 className="w-3 h-3 mr-1 text-zinc-500" />
                        {template.entity_name || 'Entidad general'}
                      </span>

                      {/* Expense Type badge */}
                      {template.expense_type_label && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-zinc-50 text-zinc-600 border border-zinc-200">
                          <Tag className="w-3 h-3 mr-1 text-zinc-400" />
                          {template.expense_type_label}
                        </span>
                      )}

                      {/* Match Pattern Badge (Desempate) */}
                      {template.match_pattern && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">
                          <Hash className="w-3 h-3 mr-1" />
                          Tiene Desempate
                        </span>
                      )}
                    </div>

                    <div>
                      <h4 className="text-sm font-semibold text-zinc-900">{template.name}</h4>
                      {template.subject_pattern && (
                        <p className="text-xs font-mono text-zinc-500 mt-0.5">
                          Asunto: {template.subject_pattern}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Right: Toggle Switch & Action Buttons */}
                  <div className="flex items-center space-x-3 shrink-0">
                    {isTesterAuthorized && (
                      <button
                        onClick={() => onTestTemplate(template)}
                        className="px-3 py-1.5 text-xs font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl transition flex items-center space-x-1.5"
                        title="Probar esta plantilla con un correo en el probador"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Probar Plantilla</span>
                      </button>
                    )}

                    {/* Enable/Disable Toggle */}
                    <div className="flex items-center space-x-2 border-l border-zinc-200 pl-3">
                      <span className="text-xs font-medium text-zinc-600">
                        {isEnabled ? 'Habilitada' : 'Deshabilitada'}
                      </span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={isEnabled}
                        disabled={isUpdating}
                        onClick={() => handleToggle(template.id, isEnabled)}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          isEnabled ? 'bg-zinc-900' : 'bg-zinc-200'
                        } ${isUpdating ? 'opacity-50 cursor-wait' : ''}`}
                      >
                        <span
                          aria-hidden="true"
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                            isEnabled ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>

                    <button
                      onClick={() => setExpandedTemplateId(isExpanded ? null : template.id)}
                      className="p-1.5 text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100 rounded-xl transition border border-zinc-200"
                      title={isExpanded ? 'Ocultar reglas' : 'Ver reglas completas'}
                    >
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {/* Expanded Technical Details */}
                {isExpanded && (
                  <div className="mt-4 pt-4 border-t border-zinc-100 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs animate-in fade-in duration-100">
                    <div className="bg-zinc-50 p-2.5 rounded-xl border border-zinc-200/60">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 block mb-1">
                        Regex de Monto (Obligatorio)
                      </span>
                      <code className="text-xs font-mono text-zinc-800 break-all">{template.amount_regex}</code>
                    </div>

                    <div className="bg-zinc-50 p-2.5 rounded-xl border border-zinc-200/60">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 block mb-1">
                        Regex de Comercio
                      </span>
                      <code className="text-xs font-mono text-zinc-800 break-all">
                        {template.merchant_regex || <span className="text-zinc-400 italic">No configurado</span>}
                      </code>
                    </div>

                    <div className="bg-zinc-50 p-2.5 rounded-xl border border-zinc-200/60">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 block mb-1">
                        Regex de Fecha & Formato
                      </span>
                      <code className="text-xs font-mono text-zinc-800 break-all">
                        {template.date_regex || <span className="text-zinc-400 italic">No configurado</span>}
                      </code>
                      {template.date_format && (
                        <div className="mt-1 text-[11px] text-zinc-500">
                          Formato: <span className="font-mono font-medium">{template.date_format}</span>
                        </div>
                      )}
                    </div>

                    <div className="bg-zinc-50 p-2.5 rounded-xl border border-zinc-200/60">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 block mb-1">
                        Regex de Hora
                      </span>
                      <code className="text-xs font-mono text-zinc-800 break-all">
                        {template.time_regex || <span className="text-zinc-400 italic">No configurado</span>}
                      </code>
                    </div>

                    <div className="bg-zinc-50 p-2.5 rounded-xl border border-zinc-200/60">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 block mb-1">
                        Moneda & Regex
                      </span>
                      <code className="text-xs font-mono text-zinc-800 break-all">
                        {template.currency_regex || <span className="text-zinc-400 italic">No configurado</span>}
                      </code>
                      {template.default_currency && (
                        <div className="mt-1 text-[11px] text-zinc-500">
                          Default: <span className="font-mono font-medium">{template.default_currency}</span>
                        </div>
                      )}
                    </div>

                    <div className="bg-zinc-50 p-2.5 rounded-xl border border-zinc-200/60">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 block mb-1">
                        Cuenta Origen Regex
                      </span>
                      <code className="text-xs font-mono text-zinc-800 break-all">
                        {template.source_account_regex || (
                          <span className="text-zinc-400 italic">No configurado</span>
                        )}
                      </code>
                    </div>

                    {template.match_pattern && (
                      <div className="bg-indigo-50/70 p-2.5 rounded-xl border border-indigo-200/60 sm:col-span-2 lg:col-span-3">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-indigo-700 block mb-1">
                          Patrón de Desempate (Nivel 3)
                        </span>
                        <code className="text-xs font-mono text-indigo-950 break-all">
                          {template.match_pattern}
                        </code>
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
