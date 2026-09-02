'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import React, { useState, useEffect, useMemo } from 'react';
import {
  Sparkles,
  Plus,
  Check,
  Play,
  Layers,
  CheckCircle2,
  AlertCircle,
  X,
  Search,
  Power,
  Sliders,
} from 'lucide-react';
import { EmailTemplateWithPreference } from '@/lib/types';
import { formatCurrency } from '@/lib/balance-utils';

interface EmailTemplatesManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

interface TestResults {
  amount?: { match: boolean; raw?: string; parsed?: number; error?: string };
  merchant?: { match: boolean; value?: string; error?: string };
  date?: { match: boolean; value?: string; format?: string; error?: string };
  currency?: { match: boolean; value?: string; error?: string };
  source_account?: { match: boolean; value?: string; error?: string };
  time?: { match: boolean; value?: string; error?: string };
}

export function EmailTemplatesManager({ isOpen, onClose }: EmailTemplatesManagerProps) {
  const [activeTab, setActiveTab] = useState<'catalog' | 'create'>('catalog');
  const [templates, setTemplates] = useState<EmailTemplateWithPreference[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form State for creating template
  const [sampleEmailText, setSampleEmailText] = useState('');
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [testResults, setTestResults] = useState<TestResults | null>(null);

  const [form, setForm] = useState({
    name: '',
    entity_name: '',
    sender_pattern: '',
    subject_pattern: '',
    amount_regex: '',
    merchant_regex: '',
    date_regex: '',
    date_format: 'DD/MM/YYYY',
    default_currency: 'COP',
    currency_regex: '',
    source_account_regex: '',
    time_regex: '',
  });

  const fetchTemplates = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/user-template-preferences');
      if (!res.ok) throw new Error('Error al consultar plantillas');
      const data = await res.json();
      setTemplates(data.templates || []);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Error al cargar plantillas');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchTemplates();
      setErrorMsg(null);
      setSuccessMsg(null);
      setTestResults(null);
    }
  }, [isOpen]);

  const handleToggleTemplate = async (templateId: string, currentEnabled: boolean) => {
    const nextEnabled = !currentEnabled;
    setTemplates((prev) =>
      prev.map((t) => (t.id === templateId ? { ...t, enabled: nextEnabled } : t))
    );

    try {
      const res = await fetch('/api/user-template-preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId, enabled: nextEnabled }),
      });
      if (!res.ok) throw new Error('No se pudo guardar la preferencia');
    } catch (err) {
      setTemplates((prev) =>
        prev.map((t) => (t.id === templateId ? { ...t, enabled: currentEnabled } : t))
      );
      setErrorMsg(err instanceof Error ? err.message : 'Error al actualizar preferencia');
    }
  };

  const handleSuggestAI = async () => {
    if (!sampleEmailText.trim()) {
      setErrorMsg('Pega primero el texto de un correo bancario para que la IA lo analice.');
      return;
    }

    setIsSuggesting(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await fetch('/api/email-templates/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailText: sampleEmailText.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al obtener sugerencia de IA');

      const s = data.suggestion;
      if (s) {
        setForm((prev) => ({
          ...prev,
          name: s.name || prev.name || 'Plantilla bancaria',
          entity_name: s.entity_name || prev.entity_name || '',
          sender_pattern: s.sender_pattern || prev.sender_pattern || '',
          subject_pattern: s.subject_pattern || prev.subject_pattern || '',
          amount_regex: s.amount_regex || prev.amount_regex || '',
          merchant_regex: s.merchant_regex || prev.merchant_regex || '',
          date_regex: s.date_regex || prev.date_regex || '',
          date_format: s.date_format || prev.date_format || 'DD/MM/YYYY',
          default_currency: s.default_currency || prev.default_currency || 'COP',
          currency_regex: s.currency_regex || prev.currency_regex || '',
          source_account_regex: s.source_account_regex || prev.source_account_regex || '',
          time_regex: s.time_regex || prev.time_regex || '',
        }));
        setSuccessMsg('¡Sugerencia de IA generada! Puedes probar los campos en vivo.');
        runTestInBrowser(sampleEmailText, s);
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Error en sugerencia de IA');
    } finally {
      setIsSuggesting(false);
    }
  };

  const runTestInBrowser = (text: string, currentForm = form) => {
    if (!text.trim()) return;
    setErrorMsg(null);
    const results: TestResults = {};

    // 1. Amount Regex
    if (currentForm.amount_regex) {
      try {
        const reg = new RegExp(currentForm.amount_regex, 'i');
        const match = text.match(reg);
        if (match && (match[1] || match[0])) {
          const rawAmount = match[1] || match[0];
          const clean = rawAmount.replace(/[^0-9.,]/g, '');
          let parsedNum = 0;
          if (clean.includes('.') && clean.includes(',')) {
            parsedNum = parseFloat(clean.replace(/\./g, '').replace(',', '.'));
          } else if (clean.includes(',')) {
            const parts = clean.split(',');
            parsedNum = parts[1] && parts[1].length <= 2 ? parseFloat(clean.replace(',', '.')) : parseFloat(clean.replace(/,/g, ''));
          } else if (clean.includes('.')) {
            const parts = clean.split('.');
            parsedNum = parts[1] && parts[1].length === 3 ? parseFloat(clean.replace(/\./g, '')) : parseFloat(clean);
          } else {
            parsedNum = parseFloat(clean);
          }

          results.amount = {
            match: true,
            raw: rawAmount,
            parsed: isNaN(parsedNum) ? undefined : parsedNum,
          };
        } else {
          results.amount = { match: false, error: 'No se encontró coincidencia' };
        }
      } catch (e: unknown) {
        results.amount = { match: false, error: `Regex inválida: ${e instanceof Error ? e.message : 'Error'}` };
      }
    }

    // 2. Merchant Regex
    if (currentForm.merchant_regex) {
      try {
        const reg = new RegExp(currentForm.merchant_regex, 'i');
        const match = text.match(reg);
        if (match && (match[1] || match[0])) {
          results.merchant = { match: true, value: (match[1] || match[0]).trim() };
        } else {
          results.merchant = { match: false, error: 'Sin coincidencia' };
        }
      } catch (e: unknown) {
        results.merchant = { match: false, error: `Regex inválida: ${e instanceof Error ? e.message : 'Error'}` };
      }
    }

    // 3. Date Regex
    if (currentForm.date_regex) {
      try {
        const reg = new RegExp(currentForm.date_regex, 'i');
        const match = text.match(reg);
        if (match && (match[1] || match[0])) {
          results.date = {
            match: true,
            value: (match[1] || match[0]).trim(),
            format: currentForm.date_format,
          };
        } else {
          results.date = { match: false, error: 'Sin coincidencia' };
        }
      } catch (e: unknown) {
        results.date = { match: false, error: `Regex inválida: ${e instanceof Error ? e.message : 'Error'}` };
      }
    }

    // 4. Source Account
    if (currentForm.source_account_regex) {
      try {
        const reg = new RegExp(currentForm.source_account_regex, 'i');
        const match = text.match(reg);
        if (match && (match[1] || match[0])) {
          results.source_account = { match: true, value: (match[1] || match[0]).trim() };
        } else {
          results.source_account = { match: false, error: 'Sin coincidencia' };
        }
      } catch (e: unknown) {
        results.source_account = { match: false, error: `Regex inválida: ${e instanceof Error ? e.message : 'Error'}` };
      }
    }

    setTestResults(results);
  };

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.amount_regex.trim()) {
      setErrorMsg('El nombre y la expresión regular de monto (amount_regex) son obligatorios.');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await fetch('/api/email-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al guardar plantilla');

      setSuccessMsg(`Plantilla "${data.name}" guardada con éxito`);
      setForm({
        name: '',
        entity_name: '',
        sender_pattern: '',
        subject_pattern: '',
        amount_regex: '',
        merchant_regex: '',
        date_regex: '',
        date_format: 'DD/MM/YYYY',
        default_currency: 'COP',
        currency_regex: '',
        source_account_regex: '',
        time_regex: '',
      });
      setSampleEmailText('');
      setTestResults(null);
      await fetchTemplates();
      setActiveTab('catalog');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Error al crear plantilla');
    } finally {
      setIsLoading(false);
    }
  };

  const filteredTemplates = useMemo(() => {
    if (!searchQuery.trim()) return templates;
    const q = searchQuery.toLowerCase();
    return templates.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (t.entity_name && t.entity_name.toLowerCase().includes(q)) ||
        (t.default_currency && t.default_currency.toLowerCase().includes(q))
    );
  }, [templates, searchQuery]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-zinc-950/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl ring-1 ring-zinc-200 shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden my-auto">
        {/* Header */}
        <div className="bg-zinc-900 text-white px-6 py-5 flex items-center justify-between border-b border-zinc-800 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-zinc-800 ring-1 ring-zinc-700 flex items-center justify-center text-amber-400">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-zinc-50">Plantillas Bancarias</h2>
              <p className="text-xs text-zinc-400">Patrones de extracción para correos y notificaciones bancarias</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-full transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Controls */}
        <div className="flex border-b border-zinc-200 bg-zinc-50 px-6 pt-3 gap-2 shrink-0">
          <button
            onClick={() => setActiveTab('catalog')}
            className={`flex items-center space-x-2 px-4 py-2.5 text-xs font-semibold rounded-t-xl transition-all cursor-pointer ${
              activeTab === 'catalog'
                ? 'bg-white text-zinc-900 border-t-2 border-zinc-900 shadow-xs'
                : 'text-zinc-500 hover:text-zinc-900'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Catálogo Activo ({templates.filter((t) => t.enabled).length}/{templates.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('create')}
            className={`flex items-center space-x-2 px-4 py-2.5 text-xs font-semibold rounded-t-xl transition-all cursor-pointer ${
              activeTab === 'create'
                ? 'bg-white text-zinc-900 border-t-2 border-zinc-900 shadow-xs'
                : 'text-zinc-500 hover:text-zinc-900'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Crear con IA</span>
          </button>
        </div>

        {/* Banners */}
        {errorMsg && (
          <div className="mx-6 mt-4 p-3 bg-rose-50 border border-rose-200 rounded-2xl flex items-center space-x-2 text-xs font-medium text-rose-700 shrink-0">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{errorMsg}</span>
          </div>
        )}
        {successMsg && (
          <div className="mx-6 mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center space-x-2 text-xs font-medium text-emerald-800 shrink-0">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {activeTab === 'catalog' && (
            <div className="space-y-4">
              <div className="relative">
                <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Buscar por nombre o banco (ej. Bancolombia, Nequi)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-900 placeholder:text-zinc-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900 transition"
                />
              </div>

              {filteredTemplates.length === 0 ? (
                <div className="p-12 text-center bg-zinc-50 rounded-2xl border border-zinc-200">
                  <Layers className="w-8 h-8 text-zinc-300 mx-auto mb-2" />
                  <p className="text-xs font-semibold text-zinc-700">No hay plantillas registradas</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2.5">
                  {filteredTemplates.map((t) => (
                    <div
                      key={t.id}
                      className={`p-4 rounded-2xl border transition-all ${
                        t.enabled ? 'bg-white border-zinc-200 shadow-2xs' : 'bg-zinc-50 border-zinc-200/60 opacity-60'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center space-x-2 flex-wrap">
                            <span className="font-bold text-zinc-900 text-xs">{t.name}</span>
                            {t.entity_name && (
                              <span className="text-[10px] font-bold uppercase tracking-wider bg-zinc-100 text-zinc-700 px-2 py-0.5 rounded-md">
                                {t.entity_name}
                              </span>
                            )}
                            <span className="text-[10px] font-bold bg-amber-50 text-amber-800 px-2 py-0.5 rounded-md">
                              {t.default_currency || 'COP'}
                            </span>
                          </div>
                          <p className="text-[11px] text-zinc-500 font-mono">
                            Monto: <span className="text-emerald-700 font-semibold">{t.amount_regex}</span>
                          </p>
                        </div>

                        <button
                          onClick={() => handleToggleTemplate(t.id, t.enabled)}
                          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer shrink-0 ${
                            t.enabled
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-zinc-200 text-zinc-600'
                          }`}
                        >
                          <Power className="w-3.5 h-3.5" />
                          <span>{t.enabled ? 'Activa' : 'Pausada'}</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'create' && (
            <div className="space-y-4">
              <div className="bg-indigo-50/60 border border-indigo-100 rounded-2xl p-4 space-y-2">
                <div className="flex items-center space-x-2">
                  <Sparkles className="w-4 h-4 text-indigo-600" />
                  <h4 className="text-xs font-bold text-zinc-900">Extracción inteligente con IA</h4>
                </div>
                <textarea
                  value={sampleEmailText}
                  onChange={(e) => setSampleEmailText(e.target.value)}
                  placeholder="Pega el texto del correo bancario aquí..."
                  rows={2}
                  className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-xl text-xs font-normal text-zinc-800 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <div className="flex justify-end space-x-2">
                  <button
                    type="button"
                    onClick={handleSuggestAI}
                    disabled={isSuggesting || !sampleEmailText.trim()}
                    className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>{isSuggesting ? 'Analizando...' : 'Extraer campos con IA'}</span>
                  </button>
                </div>
              </div>

              {testResults && (
                <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-3 text-xs space-y-1">
                  <span className="font-bold text-zinc-700 flex items-center gap-1">
                    <Sliders className="w-3.5 h-3.5" /> Vista previa de prueba:
                  </span>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Monto:</span>
                    <span className="font-bold text-emerald-700">
                      {testResults.amount?.parsed ? formatCurrency(testResults.amount.parsed) : 'Sin detectar'}
                    </span>
                  </div>
                </div>
              )}

              <form onSubmit={handleSaveTemplate} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-zinc-600 mb-1">Nombre *</label>
                    <input
                      type="text"
                      required
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-zinc-600 mb-1">Banco / Entidad</label>
                    <input
                      type="text"
                      value={form.entity_name}
                      onChange={(e) => setForm({ ...form, entity_name: e.target.value })}
                      className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-zinc-600 mb-1">Regex de Monto *</label>
                    <input
                      type="text"
                      required
                      value={form.amount_regex}
                      onChange={(e) => setForm({ ...form, amount_regex: e.target.value })}
                      className="w-full px-3 py-2 font-mono bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-emerald-800 font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-zinc-600 mb-1">Moneda</label>
                    <input
                      type="text"
                      value={form.default_currency}
                      onChange={(e) => setForm({ ...form, default_currency: e.target.value })}
                      className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs"
                    />
                  </div>
                </div>

                <div className="pt-3 border-t border-zinc-100 flex justify-end space-x-2">
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="px-5 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-bold transition cursor-pointer"
                  >
                    Guardar Plantilla
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
