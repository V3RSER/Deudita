'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import React, { useState, useEffect, useMemo } from 'react';
import {
  Sparkles,
  Plus,
  Check,
  Play,
  RotateCcw,
  Layers,
  Building2,
  Calendar,
  DollarSign,
  Clock,
  CreditCard,
  Mail,
  HelpCircle,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  Search,
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
  sender?: { match: boolean; value?: string; error?: string };
  subject?: { match: boolean; value?: string; error?: string };
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
  const [sampleSender, setSampleSender] = useState('');
  const [sampleSubject, setSampleSubject] = useState('');
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
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
    }
  }, [isOpen]);

  // Toggle user preference for template
  const handleToggleTemplate = async (templateId: string, currentEnabled: boolean) => {
    const nextEnabled = !currentEnabled;
    // Optimistic UI update
    setTemplates((prev) =>
      prev.map((t) => (t.id === templateId ? { ...t, enabled: nextEnabled } : t))
    );

    try {
      const res = await fetch('/api/user-template-preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId,
          enabled: nextEnabled,
        }),
      });
      if (!res.ok) {
        throw new Error('No se pudo guardar la preferencia');
      }
    } catch (err) {
      // Revert optimistic update
      setTemplates((prev) =>
        prev.map((t) => (t.id === templateId ? { ...t, enabled: currentEnabled } : t))
      );
      setErrorMsg(err instanceof Error ? err.message : 'Error al actualizar preferencia');
    }
  };

  // AI Suggestion
  const handleSuggestAI = async () => {
    if (!sampleEmailText.trim()) {
      setErrorMsg('Pega primero el texto de un correo de ejemplo para que la IA lo analice.');
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
        setSuccessMsg('¡Sugerencia de IA generada! Revisa los campos y presiona "Probar".');
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Error en sugerencia de IA');
    } finally {
      setIsSuggesting(false);
    }
  };

  // Test regexes in browser
  const handleTestInBrowser = () => {
    if (!sampleEmailText.trim()) {
      setErrorMsg('Pega el texto del correo para probar las expresiones regulares.');
      return;
    }

    setErrorMsg(null);
    const results: TestResults = {};
    const text = sampleEmailText;

    // 1. Amount Regex
    if (form.amount_regex) {
      try {
        const reg = new RegExp(form.amount_regex, 'i');
        const match = text.match(reg);
        if (match && (match[1] || match[0])) {
          const rawAmount = match[1] || match[0];
          // parse number: remove non-digits/dots/commas
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
    } else {
      results.amount = { match: false, error: 'Monto es obligatorio' };
    }

    // 2. Merchant Regex
    if (form.merchant_regex) {
      try {
        const reg = new RegExp(form.merchant_regex, 'i');
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
    if (form.date_regex) {
      try {
        const reg = new RegExp(form.date_regex, 'i');
        const match = text.match(reg);
        if (match && (match[1] || match[0])) {
          results.date = {
            match: true,
            value: (match[1] || match[0]).trim(),
            format: form.date_format,
          };
        } else {
          results.date = { match: false, error: 'Sin coincidencia' };
        }
      } catch (e: unknown) {
        results.date = { match: false, error: `Regex inválida: ${e instanceof Error ? e.message : 'Error'}` };
      }
    }

    // 4. Currency Regex
    if (form.currency_regex) {
      try {
        const reg = new RegExp(form.currency_regex, 'i');
        const match = text.match(reg);
        if (match && (match[1] || match[0])) {
          results.currency = { match: true, value: (match[1] || match[0]).trim() };
        } else {
          results.currency = { match: false, error: 'Sin coincidencia' };
        }
      } catch (e: unknown) {
        results.currency = { match: false, error: `Regex inválida: ${e instanceof Error ? e.message : 'Error'}` };
      }
    }

    // 5. Source Account Regex
    if (form.source_account_regex) {
      try {
        const reg = new RegExp(form.source_account_regex, 'i');
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

    // 6. Time Regex
    if (form.time_regex) {
      try {
        const reg = new RegExp(form.time_regex, 'i');
        const match = text.match(reg);
        if (match && (match[1] || match[0])) {
          results.time = { match: true, value: (match[1] || match[0]).trim() };
        } else {
          results.time = { match: false, error: 'Sin coincidencia' };
        }
      } catch (e: unknown) {
        results.time = { match: false, error: `Regex inválida: ${e instanceof Error ? e.message : 'Error'}` };
      }
    }

    // 7. Sender check
    if (form.sender_pattern && sampleSender.trim()) {
      try {
        const reg = new RegExp(form.sender_pattern, 'i');
        results.sender = {
          match: reg.test(sampleSender.trim()),
          value: sampleSender.trim(),
        };
      } catch (e: unknown) {
        results.sender = { match: false, error: `Regex inválida: ${e instanceof Error ? e.message : 'Error'}` };
      }
    }

    // 8. Subject check
    if (form.subject_pattern && sampleSubject.trim()) {
      try {
        const reg = new RegExp(form.subject_pattern, 'i');
        results.subject = {
          match: reg.test(sampleSubject.trim()),
          value: sampleSubject.trim(),
        };
      } catch (e: unknown) {
        results.subject = { match: false, error: `Regex inválida: ${e instanceof Error ? e.message : 'Error'}` };
      }
    }

    setTestResults(results);
  };

  // Submit new template
  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;

    if (!form.name.trim()) {
      setErrorMsg('El nombre de la plantilla es obligatorio.');
      return;
    }
    if (!form.amount_regex.trim()) {
      setErrorMsg('La expresión regular de monto es obligatoria.');
      return;
    }

    setIsSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch('/api/email-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          entity_name: form.entity_name.trim() || undefined,
          sender_pattern: form.sender_pattern.trim() || undefined,
          subject_pattern: form.subject_pattern.trim() || undefined,
          amount_regex: form.amount_regex.trim(),
          merchant_regex: form.merchant_regex.trim() || undefined,
          date_regex: form.date_regex.trim() || undefined,
          date_format: form.date_format.trim() || 'DD/MM/YYYY',
          default_currency: form.default_currency.trim() || 'COP',
          currency_regex: form.currency_regex.trim() || undefined,
          source_account_regex: form.source_account_regex.trim() || undefined,
          time_regex: form.time_regex.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al guardar la plantilla');

      setSuccessMsg('¡Plantilla creada y activada exitosamente!');
      // Reset form
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
      setErrorMsg(err instanceof Error ? err.message : 'Error al guardar la plantilla');
    } finally {
      setIsSaving(false);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-zinc-950/60 backdrop-blur-md overflow-y-auto">
      <div className="bg-white rounded-3xl ring-1 ring-zinc-200 shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden my-auto">
        {/* Header */}
        <div className="px-6 py-5 border-b border-zinc-100 flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-200/60 flex items-center justify-center text-indigo-700">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-zinc-900 tracking-tight">
                Plantillas de Correo Bancario
              </h2>
              <p className="text-xs text-zinc-500 font-medium">
                Reglas de extracción regex globales para detectar tus gastos automáticamente
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="px-6 border-b border-zinc-100 bg-zinc-50/70 flex items-center justify-between shrink-0">
          <div className="flex space-x-2 py-2.5">
            <button
              onClick={() => setActiveTab('catalog')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-2 ${
                activeTab === 'catalog'
                  ? 'bg-white text-zinc-900 shadow-xs ring-1 ring-zinc-200'
                  : 'text-zinc-500 hover:text-zinc-800'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Catálogo Global ({templates.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('create')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-2 ${
                activeTab === 'create'
                  ? 'bg-white text-zinc-900 shadow-xs ring-1 ring-zinc-200'
                  : 'text-zinc-500 hover:text-zinc-800'
              }`}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Crear Plantilla Nueva</span>
            </button>
          </div>

          {activeTab === 'catalog' && (
            <div className="relative w-48 sm:w-64 hidden sm:block">
              <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Buscar entidad o nombre..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-white border border-zinc-200 rounded-xl text-xs text-zinc-800 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
          )}
        </div>

        {/* Notifications */}
        {errorMsg && (
          <div className="bg-rose-50 px-6 py-2.5 border-b border-rose-100 flex items-center space-x-2 text-xs font-semibold text-rose-700 shrink-0">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
        {successMsg && (
          <div className="bg-emerald-50 px-6 py-2.5 border-b border-emerald-100 flex items-center space-x-2 text-xs font-semibold text-emerald-700 shrink-0">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 bg-zinc-50/40">
          {activeTab === 'catalog' ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-zinc-900">Catálogo de Plantillas Disponibles</h3>
                  <p className="text-xs text-zinc-500">
                    Activa o desactiva las plantillas que coinciden con los bancos y servicios que utilizas.
                  </p>
                </div>
                <button
                  onClick={() => setActiveTab('create')}
                  className="bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-semibold px-3.5 py-2 rounded-xl flex items-center space-x-1.5 shadow-xs transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Nueva Plantilla</span>
                </button>
              </div>

              {isLoading ? (
                <div className="py-16 text-center space-y-2">
                  <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mx-auto" />
                  <p className="text-xs text-zinc-500">Cargando catálogo...</p>
                </div>
              ) : filteredTemplates.length === 0 ? (
                <div className="bg-white rounded-2xl border border-zinc-200/90 p-12 text-center text-zinc-500 space-y-3">
                  <Layers className="w-10 h-10 text-zinc-300 mx-auto" />
                  <p className="text-sm font-semibold text-zinc-800">No se encontraron plantillas</p>
                  <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                    Crea una plantilla personalizada con el asistente de IA o las expresiones regulares de tu banco.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredTemplates.map((template) => (
                    <div
                      key={template.id}
                      className={`bg-white rounded-2xl p-5 border transition-all duration-200 flex flex-col justify-between ${
                        template.enabled
                          ? 'border-indigo-200/80 shadow-sm ring-1 ring-indigo-500/10'
                          : 'border-zinc-200/70 opacity-75'
                      }`}
                    >
                      <div className="space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="flex items-center space-x-2">
                              <span className="text-sm font-bold text-zinc-900">{template.name}</span>
                              {template.entity_name && (
                                <span className="text-[10px] font-bold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-md border border-indigo-100">
                                  {template.entity_name}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-zinc-500 mt-0.5">
                              Moneda: <strong className="text-zinc-700">{template.default_currency || 'COP'}</strong> • Formato: {template.date_format || 'DD/MM/YYYY'}
                            </p>
                          </div>

                          {/* Switch "Usar para mí" */}
                          <button
                            type="button"
                            role="switch"
                            aria-checked={template.enabled}
                            onClick={() => handleToggleTemplate(template.id, template.enabled)}
                            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                              template.enabled ? 'bg-indigo-600' : 'bg-zinc-200'
                            }`}
                            title={template.enabled ? 'Plantilla activa para tu cuenta' : 'Plantilla desactivada'}
                          >
                            <span
                              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                                template.enabled ? 'translate-x-5' : 'translate-x-0'
                              }`}
                            />
                          </button>
                        </div>

                        {/* Regex preview pills */}
                        <div className="bg-zinc-50/80 rounded-xl p-2.5 border border-zinc-100 space-y-1.5 text-[11px] font-mono text-zinc-600">
                          <div className="truncate">
                            <span className="text-zinc-400 font-sans font-bold text-[9px] uppercase">Monto: </span>
                            <span className="text-emerald-700 font-semibold">{template.amount_regex}</span>
                          </div>
                          {template.merchant_regex && (
                            <div className="truncate">
                              <span className="text-zinc-400 font-sans font-bold text-[9px] uppercase">Comercio: </span>
                              <span className="text-zinc-800">{template.merchant_regex}</span>
                            </div>
                          )}
                          {template.sender_pattern && (
                            <div className="truncate">
                              <span className="text-zinc-400 font-sans font-bold text-[9px] uppercase">Remitente: </span>
                              <span className="text-zinc-500">{template.sender_pattern}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="mt-4 pt-3 border-t border-zinc-100 flex items-center justify-between text-xs">
                        <span className={`text-[11px] font-bold ${template.enabled ? 'text-indigo-700' : 'text-zinc-400'}`}>
                          {template.enabled ? '✓ Activa para tus correos' : 'Desactivada'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Create Template Form */
            <form onSubmit={handleSaveTemplate} className="space-y-6">
              {/* Top AI / Sample Box */}
              <div className="bg-white rounded-2xl p-5 border border-indigo-100 shadow-2xs space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Sparkles className="w-4 h-4 text-indigo-600" />
                    <span className="text-xs font-bold text-zinc-900 uppercase tracking-wider">
                      Asistente de Diseño & Pruebas
                    </span>
                  </div>
                  <span className="text-[11px] text-zinc-500">
                    Pega un correo para sugerir con IA o probar en vivo en tu navegador
                  </span>
                </div>

                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-zinc-600 uppercase tracking-wider block">
                    Pega aquí un correo de ejemplo
                  </label>
                  <textarea
                    rows={4}
                    value={sampleEmailText}
                    onChange={(e) => setSampleEmailText(e.target.value)}
                    placeholder="Ejemplo: 'Bancolombia: Compra por $45.000 en SUPERMERCADO EXITO el 31/08/2026 14:30 con tu tarjeta terminada en *9841.'"
                    className="w-full p-3 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-mono text-zinc-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={handleSuggestAI}
                    disabled={isSuggesting || !sampleEmailText.trim()}
                    className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold px-4 py-2 rounded-xl flex items-center space-x-2 shadow-xs cursor-pointer transition"
                  >
                    {isSuggesting ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5" />
                    )}
                    <span>Sugerir con IA</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleTestInBrowser}
                    disabled={!sampleEmailText.trim()}
                    className="bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50 text-white text-xs font-bold px-4 py-2 rounded-xl flex items-center space-x-2 shadow-xs cursor-pointer transition"
                  >
                    <Play className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Probar en vivo en navegador</span>
                  </button>
                </div>

                {/* Live Test Results Panel */}
                {testResults && (
                  <div className="bg-zinc-900 text-white p-4 rounded-xl space-y-3 font-mono text-xs">
                    <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                      <span className="font-bold text-emerald-400 flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4" />
                        Resultados de Prueba en el Navegador
                      </span>
                      <span className="text-[10px] text-zinc-400">Sin llamadas al backend</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                      <div className="p-2 rounded-lg bg-zinc-800/80">
                        <span className="text-zinc-400 block text-[9px] uppercase font-sans">Monto:</span>
                        {testResults.amount?.match ? (
                          <span className="text-emerald-400 font-bold">
                            {formatCurrency(testResults.amount.parsed || 0)} (raw: &quot;{testResults.amount.raw}&quot;)
                          </span>
                        ) : (
                          <span className="text-rose-400">{testResults.amount?.error}</span>
                        )}
                      </div>

                      <div className="p-2 rounded-lg bg-zinc-800/80">
                        <span className="text-zinc-400 block text-[9px] uppercase font-sans">Comercio:</span>
                        {testResults.merchant?.match ? (
                          <span className="text-zinc-100 font-bold">{testResults.merchant.value}</span>
                        ) : (
                          <span className="text-amber-400">{testResults.merchant?.error || 'Sin regex'}</span>
                        )}
                      </div>

                      <div className="p-2 rounded-lg bg-zinc-800/80">
                        <span className="text-zinc-400 block text-[9px] uppercase font-sans">Fecha:</span>
                        {testResults.date?.match ? (
                          <span className="text-zinc-100 font-bold">{testResults.date.value} ({testResults.date.format})</span>
                        ) : (
                          <span className="text-amber-400">{testResults.date?.error || 'Sin regex'}</span>
                        )}
                      </div>

                      <div className="p-2 rounded-lg bg-zinc-800/80">
                        <span className="text-zinc-400 block text-[9px] uppercase font-sans">Cuenta Origen:</span>
                        {testResults.source_account?.match ? (
                          <span className="text-zinc-100 font-bold">*{testResults.source_account.value}</span>
                        ) : (
                          <span className="text-zinc-500">{testResults.source_account?.error || 'Sin regex'}</span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Template Configuration Fields */}
              <div className="bg-white rounded-2xl p-5 border border-zinc-200/90 shadow-2xs space-y-4">
                <h4 className="text-xs font-bold text-zinc-900 uppercase tracking-wider">
                  Configuración de la Plantilla
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Name */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-zinc-600 uppercase tracking-wider block">
                      Nombre de la plantilla <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ej: Bancolombia - Compras Débito"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      className="w-full px-3.5 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-semibold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>

                  {/* Entity */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-zinc-600 uppercase tracking-wider block">
                      Entidad / Banco
                    </label>
                    <input
                      type="text"
                      placeholder="Ej: Bancolombia, Nequi, Davivienda"
                      value={form.entity_name}
                      onChange={(e) => setForm({ ...form, entity_name: e.target.value })}
                      className="w-full px-3.5 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-semibold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>

                  {/* Amount Regex */}
                  <div className="space-y-1 sm:col-span-2">
                    <label className="text-[11px] font-bold text-zinc-600 uppercase tracking-wider block">
                      Regex de Monto <span className="text-rose-500">*</span> (con grupo de captura ())
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ej: (?:por|valor|\\$)\\s*\\$?([0-9.,]+)"
                      value={form.amount_regex}
                      onChange={(e) => setForm({ ...form, amount_regex: e.target.value })}
                      className="w-full px-3.5 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-mono text-emerald-800 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>

                  {/* Merchant Regex */}
                  <div className="space-y-1 sm:col-span-2">
                    <label className="text-[11px] font-bold text-zinc-600 uppercase tracking-wider block">
                      Regex de Comercio / Descripción (opcional)
                    </label>
                    <input
                      type="text"
                      placeholder="Ej: en\\s+([A-Za-z0-9\\s._-]+?)(?:\\s+el|\\s+por|\\.|$)"
                      value={form.merchant_regex}
                      onChange={(e) => setForm({ ...form, merchant_regex: e.target.value })}
                      className="w-full px-3.5 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-mono text-zinc-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>

                  {/* Date Regex & Format */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-zinc-600 uppercase tracking-wider block">
                      Regex de Fecha (opcional)
                    </label>
                    <input
                      type="text"
                      placeholder="Ej: ([0-9]{2}/[0-9]{2}/[0-9]{4})"
                      value={form.date_regex}
                      onChange={(e) => setForm({ ...form, date_regex: e.target.value })}
                      className="w-full px-3.5 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-mono text-zinc-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-zinc-600 uppercase tracking-wider block">
                      Formato de Fecha
                    </label>
                    <select
                      value={form.date_format}
                      onChange={(e) => setForm({ ...form, date_format: e.target.value })}
                      className="w-full px-3.5 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-semibold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 cursor-pointer"
                    >
                      <option value="DD/MM/YYYY">DD/MM/YYYY (ej: 31/08/2026)</option>
                      <option value="YYYY-MM-DD">YYYY-MM-DD (ej: 2026-08-31)</option>
                      <option value="MM/DD/YYYY">MM/DD/YYYY (ej: 08/31/2026)</option>
                      <option value="DD-MM-YYYY">DD-MM-YYYY (ej: 31-08-2026)</option>
                    </select>
                  </div>

                  {/* Sender & Subject filters */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-zinc-600 uppercase tracking-wider block">
                      Patrón de Remitente (opcional)
                    </label>
                    <input
                      type="text"
                      placeholder="Ej: .*@bancolombia\\.com.*"
                      value={form.sender_pattern}
                      onChange={(e) => setForm({ ...form, sender_pattern: e.target.value })}
                      className="w-full px-3.5 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-mono text-zinc-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-zinc-600 uppercase tracking-wider block">
                      Patrón de Asunto (opcional)
                    </label>
                    <input
                      type="text"
                      placeholder="Ej: .*(compra|notificación).*"
                      value={form.subject_pattern}
                      onChange={(e) => setForm({ ...form, subject_pattern: e.target.value })}
                      className="w-full px-3.5 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-mono text-zinc-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>

                  {/* Currency & Account */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-zinc-600 uppercase tracking-wider block">
                      Moneda por defecto
                    </label>
                    <input
                      type="text"
                      placeholder="COP, USD, EUR, MXN"
                      value={form.default_currency}
                      onChange={(e) => setForm({ ...form, default_currency: e.target.value })}
                      className="w-full px-3.5 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-semibold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-zinc-600 uppercase tracking-wider block">
                      Regex Cuenta Origen (opcional)
                    </label>
                    <input
                      type="text"
                      placeholder="Ej: \\*([0-9]{4})"
                      value={form.source_account_regex}
                      onChange={(e) => setForm({ ...form, source_account_regex: e.target.value })}
                      className="w-full px-3.5 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-mono text-zinc-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>
                </div>
              </div>

              {/* Bottom Actions */}
              <div className="flex items-center justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('catalog')}
                  className="px-4 py-2.5 rounded-xl border border-zinc-200 text-xs font-semibold text-zinc-600 hover:bg-zinc-100 transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs transition flex items-center space-x-2 cursor-pointer disabled:opacity-50"
                >
                  {isSaving ? (
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  <span>{isSaving ? 'Guardando...' : 'Guardar y Activar Plantilla'}</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
