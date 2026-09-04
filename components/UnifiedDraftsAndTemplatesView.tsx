'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Inbox,
  Layers,
  Sparkles,
  Search,
  Building2,
  Trash2,
  Check,
  CreditCard,
  Calendar,
  ChevronDown,
  ChevronUp,
  KeyRound,
  ShieldCheck,
  AlertCircle,
  X,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useExpense } from '@/lib/expense-context';
import { ExpenseDraft } from '@/lib/types';
import { CatalogEntity, CatalogTemplate } from '@/lib/email-matching';
import { formatCurrency } from '@/lib/balance-utils';
import { TemplatesCatalogSection } from '@/components/email-templates/TemplatesCatalogSection';
import { CreateAndTestTemplateSection } from '@/components/email-templates/CreateAndTestTemplateSection';

interface UnifiedDraftsAndTemplatesViewProps {
  initialTab?: 'drafts' | 'catalog' | 'create-test';
  onOpenConfirmDraft: (draft: ExpenseDraft) => void;
}

export function UnifiedDraftsAndTemplatesView({
  initialTab = 'drafts',
  onOpenConfirmDraft,
}: UnifiedDraftsAndTemplatesViewProps) {
  const { drafts, discardDraft } = useExpense();

  // 1. Tester authorization state (Google development mode check)
  const [isTesterAuthorized, setIsTesterAuthorized] = useState<boolean>(false);
  const [testerEmail, setTesterEmail] = useState<string | null>(null);
  const [showTesterAuthModal, setShowTesterAuthModal] = useState<boolean>(false);
  const [isAuthorizingTester, setIsAuthorizingTester] = useState<boolean>(false);
  const [testerAuthError, setTesterAuthError] = useState<string | null>(null);

  // 2. Navigation tab state (defaults to 'drafts')
  const [activeTab, setActiveTab] = useState<'drafts' | 'catalog' | 'create-test'>(
    initialTab === 'create-test' ? 'drafts' : initialTab
  );

  // 3. Drafts filtering & search
  const [statusFilter, setStatusFilter] = useState<'pending' | 'confirmed' | 'discarded' | 'all'>('pending');
  const [draftSearchQuery, setDraftSearchQuery] = useState('');
  const [expandedSnippetId, setExpandedSnippetId] = useState<string | null>(null);
  const [isDiscardingId, setIsDiscardingId] = useState<string | null>(null);

  // 4. Catalog state
  const [templates, setTemplates] = useState<(CatalogTemplate & { enabled?: boolean })[]>([]);
  const [entities, setEntities] = useState<CatalogEntity[]>([]);
  const [expenseTypes, setExpenseTypes] = useState<Array<{ id: string; name?: string; label?: string }>>([]);
  const [ambiguousTemplates, setAmbiguousTemplates] = useState<Array<{
    entity_id: string;
    subject_pattern: string;
    template_ids: string[];
    template_names: string[];
  }>>([]);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(true);

  // 5. Cross-tab testing targets
  const [draftToTest, setDraftToTest] = useState<ExpenseDraft | null>(null);
  const [templateToTest, setTemplateToTest] = useState<CatalogTemplate | null>(null);

  // --- Check Google Tester Status on mount ---
  const checkTesterAuth = useCallback(async () => {
    try {
      const supabase = createClient();

      // 1. Check URL query params from OAuth redirect
      let tokenToUse: string | null = null;
      let fromOAuthRedirect = false;

      if (typeof window !== 'undefined') {
        const searchParams = new URLSearchParams(window.location.search);
        const urlToken = searchParams.get('tester_token');
        const urlAuthorized = searchParams.get('tester_authorized');

        if (urlToken) {
          tokenToUse = urlToken;
          try {
            localStorage.setItem('google_provider_token', urlToken);
          } catch {}
          fromOAuthRedirect = true;
        }

        if (urlAuthorized === 'true') {
          fromOAuthRedirect = true;
        }

        // Clean query parameters so URL stays clean
        if (urlToken || urlAuthorized) {
          window.history.replaceState({}, '', window.location.pathname);
        }

        if (!tokenToUse) {
          try {
            tokenToUse = localStorage.getItem('google_provider_token');
          } catch {}
        }
      }

      // 2. Check Supabase client session for provider_token
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData?.session;
      if (!tokenToUse && session?.provider_token) {
        tokenToUse = session.provider_token;
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem('google_provider_token', tokenToUse);
          } catch {}
        }
      }

      // 3. Prepare headers
      const headers: Record<string, string> = {};
      if (tokenToUse) {
        headers['x-google-token'] = tokenToUse;
      }

      // 4. Call /api/gmail/status
      const res = await fetch('/api/gmail/status', {
        headers,
        cache: 'no-store',
      });

      if (res.ok) {
        const data = await res.json();
        const authorized = Boolean(data.authorized);

        // If server hasn't saved the token yet, sync via POST
        if (tokenToUse && !data.authorized && fromOAuthRedirect) {
          try {
            const syncRes = await fetch('/api/gmail/status', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ token: tokenToUse }),
            });
            if (syncRes.ok) {
              const syncData = await syncRes.json();
              if (syncData.authorized) {
                setIsTesterAuthorized(true);
                setTesterEmail(syncData.email || syncData.userEmail || null);
                setShowTesterAuthModal(false);
                setActiveTab('create-test');
                return;
              }
            }
          } catch (syncErr) {
            console.warn('[UnifiedView] Error syncing token via POST:', syncErr);
          }
        }

        setIsTesterAuthorized(authorized);
        if (data.email || data.userEmail) {
          setTesterEmail(data.email || data.userEmail);
        }
        if (authorized) {
          setShowTesterAuthModal(false);
          if (initialTab === 'create-test' || fromOAuthRedirect) {
            setActiveTab('create-test');
          }
        }
      } else {
        // Fallback: check user metadata directly
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.user_metadata?.is_tester || user?.email === 'wizdeiko@gmail.com') {
          setIsTesterAuthorized(true);
          setTesterEmail(user.email || null);
          setShowTesterAuthModal(false);
        } else {
          setIsTesterAuthorized(false);
        }
      }
    } catch (err) {
      console.error('[UnifiedView] Error al comprobar autorización de tester:', err);
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.user_metadata?.is_tester || user?.email === 'wizdeiko@gmail.com') {
          setIsTesterAuthorized(true);
          setTesterEmail(user.email || null);
        } else {
          setIsTesterAuthorized(false);
        }
      } catch {
        setIsTesterAuthorized(false);
      }
    }
  }, [initialTab]);

  useEffect(() => {
    checkTesterAuth();

    const supabase = createClient();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.provider_token) {
        try {
          localStorage.setItem('google_provider_token', session.provider_token);
        } catch {}
      }
      checkTesterAuth();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [checkTesterAuth]);

  // Handle manual activation of tester access
  const handleActivateTesterManually = async () => {
    setIsAuthorizingTester(true);
    setTesterAuthError(null);
    try {
      const res = await fetch('/api/gmail/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'enable_tester' }),
      });
      if (res.ok) {
        setIsTesterAuthorized(true);
        setShowTesterAuthModal(false);
        setActiveTab('create-test');
      } else {
        await checkTesterAuth();
      }
    } catch (err: unknown) {
      console.error('[UnifiedView] Error activating tester mode:', err);
      setTesterAuthError(err instanceof Error ? err.message : 'Error al activar modo tester');
    } finally {
      setIsAuthorizingTester(false);
    }
  };

  // Handle Tester OAuth with Google
  const handleAuthorizeTester = async () => {
    setIsAuthorizingTester(true);
    setTesterAuthError(null);
    try {
      const supabase = createClient();
      const returnUrl = `${window.location.origin}/auth/callback?returnTo=${encodeURIComponent('/email-templates')}`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: returnUrl,
          scopes: 'https://www.googleapis.com/auth/gmail.readonly',
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });
      if (error) throw error;
    } catch (err: unknown) {
      console.error('[UnifiedView] Error al conectar con Google:', err);
      setTesterAuthError(err instanceof Error ? err.message : 'Error al conectar con Google');
      setIsAuthorizingTester(false);
    }
  };

  // Handle Disconnect / Exit Tester Mode
  const handleDisconnectTester = async () => {
    try {
      if (typeof window !== 'undefined') {
        try {
          localStorage.removeItem('google_provider_token');
        } catch {}
      }
      await fetch('/api/gmail/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'disconnect' }),
      });
      setIsTesterAuthorized(false);
      setTesterEmail(null);
      if (activeTab === 'create-test') {
        setActiveTab('drafts');
      }
    } catch (err) {
      console.error('[UnifiedView] Error al desconectar tester:', err);
    }
  };

  // --- Fetch Catalog & Preferences ---
  const fetchCatalogData = useCallback(async () => {
    setIsLoadingCatalog(true);
    try {
      const [catalogRes, prefsRes] = await Promise.all([
        fetch('/api/email-templates/catalog'),
        fetch('/api/user-template-preferences'),
      ]);

      let templatesList: CatalogTemplate[] = [];
      let entitiesList: CatalogEntity[] = [];
      let expenseTypesList: Array<{ id: string; name?: string; label?: string }> = [];
      let ambList: typeof ambiguousTemplates = [];

      if (catalogRes.ok) {
        const catData = await catalogRes.json();
        templatesList = catData.templates || [];
        entitiesList = catData.entities || [];
        expenseTypesList = catData.expense_types || [];
        ambList = catData.ambiguous_templates || [];
      }

      const prefMap = new Map<string, boolean>();
      if (prefsRes.ok) {
        const prefsData = await prefsRes.json();
        if (prefsData.templates && Array.isArray(prefsData.templates)) {
          prefsData.templates.forEach((t: { id: string; enabled: boolean }) => {
            prefMap.set(t.id, t.enabled);
          });
        }
      }

      const merged = templatesList.map((tmpl) => ({
        ...tmpl,
        enabled: prefMap.has(tmpl.id) ? prefMap.get(tmpl.id)! : true,
      }));

      setTemplates(merged);
      setEntities(entitiesList);
      setExpenseTypes(expenseTypesList);
      setAmbiguousTemplates(ambList);
    } catch (err) {
      console.error('[UnifiedView] Error al consultar catálogo:', err);
    } finally {
      setIsLoadingCatalog(false);
    }
  }, []);

  useEffect(() => {
    fetchCatalogData();
  }, [fetchCatalogData]);

  // --- Toggle template preference ---
  const handleTogglePreference = async (templateId: string, enabled: boolean) => {
    setTemplates((prev) =>
      prev.map((t) => (t.id === templateId ? { ...t, enabled } : t))
    );

    try {
      const res = await fetch('/api/user-template-preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template_id: templateId,
          enabled,
        }),
      });

      if (!res.ok) {
        console.error('Error al guardar preferencia');
      }
    } catch (err) {
      console.error('Error guardando preferencia de plantilla:', err);
    }
  };

  // --- Filtered Drafts ---
  const filteredDrafts = useMemo(() => {
    return drafts.filter((d) => {
      const matchesStatus =
        statusFilter === 'all'
          ? true
          : statusFilter === 'pending'
          ? d.status === 'pending' || !d.status
          : d.status === statusFilter;

      if (!matchesStatus) return false;

      if (!draftSearchQuery.trim()) return true;

      const q = draftSearchQuery.toLowerCase();
      const matchMerchant = d.merchant?.toLowerCase().includes(q);
      const matchConcept = d.concept?.toLowerCase().includes(q);
      const matchEntity = d.entity?.toLowerCase().includes(q);
      const matchSource = d.source_account?.toLowerCase().includes(q);
      const matchAmount = String(d.amount).includes(q);

      return matchMerchant || matchConcept || matchEntity || matchSource || matchAmount;
    });
  }, [drafts, statusFilter, draftSearchQuery]);

  const pendingCount = useMemo(
    () => drafts.filter((d) => !d.status || d.status === 'pending').length,
    [drafts]
  );
  const confirmedCount = useMemo(
    () => drafts.filter((d) => d.status === 'confirmed').length,
    [drafts]
  );
  const discardedCount = useMemo(
    () => drafts.filter((d) => d.status === 'discarded').length,
    [drafts]
  );

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-16">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">
            Tickets y Borradores
          </h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            Comprobantes bancarios detectados automáticamente y catálogo de formatos.
          </p>
        </div>

        {/* Tab Switcher & Tester Access */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center p-1 bg-zinc-100 rounded-2xl w-fit">
            <button
              onClick={() => setActiveTab('drafts')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-2 ${
                activeTab === 'drafts'
                  ? 'bg-white text-zinc-900 shadow-xs ring-1 ring-zinc-200'
                  : 'text-zinc-500 hover:text-zinc-900'
              }`}
            >
              <Inbox className="w-3.5 h-3.5" />
              <span>Borradores</span>
              {pendingCount > 0 && (
                <span className="ml-1 px-1.5 py-0.5 text-[10px] font-black rounded-full bg-amber-500 text-white">
                  {pendingCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('catalog')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-2 ${
                activeTab === 'catalog'
                  ? 'bg-white text-zinc-900 shadow-xs ring-1 ring-zinc-200'
                  : 'text-zinc-500 hover:text-zinc-900'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Formatos Bancarios</span>
              <span className="ml-1 px-1.5 py-0.5 text-[10px] font-semibold rounded-full bg-zinc-200 text-zinc-700">
                {templates.length}
              </span>
            </button>

            {/* Solo se muestra si el usuario ya logró autorizarse como Tester con Google */}
            {isTesterAuthorized && (
              <button
                onClick={() => setActiveTab('create-test')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-2 ${
                  activeTab === 'create-test'
                    ? 'bg-white text-zinc-900 shadow-xs ring-1 ring-zinc-200'
                    : 'text-zinc-500 hover:text-zinc-900'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                <span>Probador</span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" title="Tester Autorizado" />
              </button>
            )}
          </div>

          {/* Badge o Botón discreto de acceso tester */}
          {isTesterAuthorized ? (
            <div className="flex items-center space-x-2 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[11px] font-medium text-emerald-900">
                Tester activo: <span className="font-semibold">{testerEmail}</span>
              </span>
              <button
                type="button"
                onClick={handleDisconnectTester}
                className="text-[11px] text-emerald-800 hover:text-rose-700 font-semibold underline ml-1 cursor-pointer transition"
                title="Cerrar sesión de tester y ocultar probador para usuarios normales"
              >
                Ocultar
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowTesterAuthModal(true)}
              className="flex items-center space-x-1.5 px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-xl transition cursor-pointer border border-transparent hover:border-zinc-200"
              title="Acceso restringido para desarrolladores y testers aprobados"
            >
              <KeyRound className="w-3.5 h-3.5 text-zinc-400" />
              <span>Acceso Tester</span>
            </button>
          )}
        </div>
      </div>

      {/* Tab 1: Borradores y Tickets */}
      {activeTab === 'drafts' && (
        <div className="space-y-4">
          {/* Controls Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-zinc-200/80 shadow-2xs">
            {/* Status Pills */}
            <div className="flex items-center space-x-1.5 overflow-x-auto">
              <button
                onClick={() => setStatusFilter('pending')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                  statusFilter === 'pending'
                    ? 'bg-zinc-900 text-white shadow-2xs'
                    : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200/70'
                }`}
              >
                Pendientes ({pendingCount})
              </button>
              <button
                onClick={() => setStatusFilter('confirmed')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                  statusFilter === 'confirmed'
                    ? 'bg-zinc-900 text-white shadow-2xs'
                    : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200/70'
                }`}
              >
                Confirmados ({confirmedCount})
              </button>
              <button
                onClick={() => setStatusFilter('discarded')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                  statusFilter === 'discarded'
                    ? 'bg-zinc-900 text-white shadow-2xs'
                    : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200/70'
                }`}
              >
                Descartados ({discardedCount})
              </button>
              <button
                onClick={() => setStatusFilter('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                  statusFilter === 'all'
                    ? 'bg-zinc-900 text-white shadow-2xs'
                    : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200/70'
                }`}
              >
                Todos ({drafts.length})
              </button>
            </div>

            {/* Search Input */}
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Buscar por comercio o concepto..."
                value={draftSearchQuery}
                onChange={(e) => setDraftSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-zinc-50 border border-zinc-200 rounded-xl text-zinc-800 placeholder-zinc-400 focus:outline-none focus:border-zinc-400"
              />
            </div>
          </div>

          {/* Drafts List */}
          {filteredDrafts.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-2xl border border-zinc-200/80 p-8 space-y-3 shadow-2xs">
              <div className="w-12 h-12 bg-zinc-100 rounded-2xl flex items-center justify-center mx-auto text-zinc-400">
                <Inbox className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-zinc-900">
                No hay borradores en esta sección
              </h3>
              <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                Los gastos extraídos automáticamente de tus correos bancarios aparecerán aquí para que los confirmes con un solo clic.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {filteredDrafts.map((draft) => {
                const isPending = !draft.status || draft.status === 'pending';
                const isConfirmed = draft.status === 'confirmed';
                const isDiscarded = draft.status === 'discarded';
                const isExpanded = expandedSnippetId === draft.id;

                return (
                  <div
                    key={draft.id}
                    className={`bg-white rounded-2xl border transition-all p-4 flex flex-col justify-between space-y-3.5 ${
                      isPending
                        ? 'border-amber-200/80 shadow-xs hover:border-amber-300'
                        : isConfirmed
                        ? 'border-emerald-200/80 bg-emerald-50/20'
                        : 'border-zinc-200/80 opacity-60'
                    }`}
                  >
                    {/* Header: Entity + Status */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-0.5">
                        <div className="flex items-center space-x-2">
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-zinc-100 text-zinc-700 border border-zinc-200">
                            {draft.entity || 'Banco'}
                          </span>
                          {draft.source_account && (
                            <span className="text-[11px] text-zinc-400 font-mono">
                              *{draft.source_account}
                            </span>
                          )}
                        </div>
                        <h4 className="text-sm font-bold text-zinc-900 line-clamp-1">
                          {draft.merchant || draft.concept || 'Gasto no identificado'}
                        </h4>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-base font-extrabold text-zinc-900 block">
                          {formatCurrency(draft.amount, draft.currency || 'COP')}
                        </span>
                        <span className="text-[10px] text-zinc-400 font-mono">
                          {draft.date || 'Sin fecha'} {draft.time || ''}
                        </span>
                      </div>
                    </div>

                    {/* Expandable Snippet / Raw text */}
                    {draft.raw_email_snippet && (
                      <div className="text-xs bg-zinc-50 border border-zinc-100 rounded-xl p-2.5 space-y-1 font-mono text-zinc-600">
                        <div className="flex items-center justify-between text-[10px] text-zinc-400 font-sans">
                          <span>Texto original detectado:</span>
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedSnippetId(isExpanded ? null : draft.id)
                            }
                            className="text-indigo-600 hover:text-indigo-800 flex items-center space-x-0.5 cursor-pointer font-medium"
                          >
                            <span>{isExpanded ? 'Ver menos' : 'Ver más'}</span>
                            {isExpanded ? (
                              <ChevronUp className="w-3 h-3" />
                            ) : (
                              <ChevronDown className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                        <p className={isExpanded ? 'whitespace-pre-wrap' : 'line-clamp-2'}>
                          {draft.raw_email_snippet}
                        </p>
                      </div>
                    )}

                    {/* Actions Bar */}
                    <div className="pt-2 border-t border-zinc-100 flex items-center justify-between gap-2">
                      <div className="flex items-center space-x-1">
                        {isPending && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                            Pendiente
                          </span>
                        )}
                        {isConfirmed && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                            Confirmado
                          </span>
                        )}
                        {isDiscarded && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-zinc-100 text-zinc-600 border border-zinc-200">
                            Descartado
                          </span>
                        )}
                      </div>

                      <div className="flex items-center space-x-2">
                        {isPending && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setIsDiscardingId(draft.id);
                                discardDraft(draft.id).finally(() =>
                                  setIsDiscardingId(null)
                                );
                              }}
                              disabled={isDiscardingId === draft.id}
                              className="px-2.5 py-1.5 text-xs font-semibold text-zinc-600 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition cursor-pointer flex items-center space-x-1"
                              title="Descartar borrador"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">Descartar</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => onOpenConfirmDraft(draft)}
                              className="px-3.5 py-1.5 text-xs font-bold text-white bg-zinc-900 hover:bg-zinc-800 rounded-xl transition shadow-2xs flex items-center space-x-1.5 cursor-pointer"
                            >
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                              <span>Confirmar Gasto</span>
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Catálogo de Formatos Bancarios */}
      {activeTab === 'catalog' && (
        <TemplatesCatalogSection
          templates={templates}
          entities={entities}
          expenseTypes={expenseTypes}
          ambiguousTemplates={ambiguousTemplates}
          isLoading={isLoadingCatalog}
          isTesterAuthorized={isTesterAuthorized}
          onRefresh={fetchCatalogData}
          onTogglePreference={handleTogglePreference}
          onTestTemplate={(tmpl) => {
            if (isTesterAuthorized) {
              setTemplateToTest(tmpl);
              setActiveTab('create-test');
            } else {
              setShowTesterAuthModal(true);
            }
          }}
        />
      )}

      {/* Tab 3: Crear y Probar Plantilla (Exclusivo para Testers Autorizados) */}
      {activeTab === 'create-test' && isTesterAuthorized && (
        <CreateAndTestTemplateSection
          entities={entities}
          expenseTypes={expenseTypes}
          existingTemplates={templates}
          drafts={drafts}
          initialTemplateToTest={templateToTest}
          initialDraftToTest={draftToTest}
          onTemplateCreated={() => {
            fetchCatalogData();
            setActiveTab('catalog');
          }}
        />
      )}

      {/* Modal para Autorización de Tester con Google */}
      {showTesterAuthModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full border border-zinc-200 shadow-2xl p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div className="w-10 h-10 rounded-xl bg-zinc-900 text-white flex items-center justify-center shadow-xs">
                <KeyRound className="w-5 h-5 text-amber-400" />
              </div>
              <button
                type="button"
                onClick={() => setShowTesterAuthModal(false)}
                className="p-1.5 text-zinc-400 hover:text-zinc-600 rounded-lg transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1.5">
              <h3 className="text-base font-bold text-zinc-900">
                Acceso a Modo Tester y Probador
              </h3>
              <p className="text-xs text-zinc-500 leading-relaxed">
                Esta aplicación opera con la capa gratuita de Google Cloud (en modo desarrollo). Por políticas estrictas de Google, <strong>únicamente los correos que hayas agregado a la lista de Test Users en Google Cloud Console</strong> pueden autorizar el acceso de lectura de Gmail.
              </p>
            </div>

            <div className="p-3.5 bg-amber-50 border border-amber-200/80 rounded-xl text-xs text-amber-900 space-y-1.5">
              <div className="flex items-center space-x-1.5 font-semibold text-amber-950">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Protección para usuarios finales</span>
              </div>
              <p className="text-[11px] text-amber-800 leading-relaxed">
                El probador de correos y la edición de expresiones regulares están protegidos para evitar modificaciones indebidas en la base de datos de plantillas.
              </p>
            </div>

            {testerAuthError && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{testerAuthError}</span>
              </div>
            )}

            <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
              <button
                type="button"
                onClick={handleActivateTesterManually}
                disabled={isAuthorizingTester}
                className="px-3 py-2 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/80 rounded-xl transition cursor-pointer flex items-center justify-center space-x-1.5"
                title="Si ya autorizaste en Google o eres el administrador del proyecto, pulsa aquí para activar de inmediato"
              >
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span>¿Ya autorizaste? Activar ahora</span>
              </button>

              <div className="flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowTesterAuthModal(false)}
                  className="px-3.5 py-2 text-xs font-medium text-zinc-600 hover:text-zinc-800 rounded-xl transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleAuthorizeTester}
                  disabled={isAuthorizingTester}
                  className="px-4 py-2 text-xs font-semibold bg-zinc-900 hover:bg-zinc-800 text-white disabled:bg-zinc-300 rounded-xl transition shadow-2xs flex items-center justify-center space-x-2 cursor-pointer"
                >
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>{isAuthorizingTester ? 'Conectando con Google...' : 'Autorizar con Google'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
