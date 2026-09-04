'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import React, { useState, useMemo, useEffect } from 'react';
import { useExpense } from '@/lib/expense-context';
import { formatCurrency } from '@/lib/balance-utils';
import { GenericExpenseList } from '@/components/GenericExpenseList';
import { TransactionFilterBar, TransactionFilterState } from '@/components/TransactionFilterBar';
import { ConfirmDraftModal } from '@/components/ConfirmDraftModal';
import Link from 'next/link';
import {
  getEffectiveTransactionDate,
  isDateMatchingFilter,
  getAvailableTransactionMonths,
} from '@/lib/transaction-date-utils';

import { Expense, Payment, ExpenseDraft } from '@/lib/types';
import {
  Receipt,
  BarChart3,
  PieChart as PieChartIcon,
  MailCheck,
  Sparkles,
  CheckCircle2,
  Trash2,
  ExternalLink,
  Plus,
  Inbox,
  CreditCard,
  Building2,
  Calendar,
  Clock,
  Loader2,
  SlidersHorizontal,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
} from 'recharts';

interface AllExpensesViewProps {
  onOpenNewExpense: () => void;
  onEditExpense?: (expense: Expense) => void;
  onEditPayment?: (payment: Payment) => void;
}

const CATEGORY_COLORS: Record<string, string> = {
  Comida: '#10b981', // emerald-500
  Transporte: '#3b82f6', // blue-500
  Hospedaje: '#8b5cf6', // violet-500
  Entretenimiento: '#f59e0b', // amber-500
  Servicios: '#06b6d4', // cyan-500
  Supermercado: '#ec4899', // pink-500
  Varios: '#64748b', // slate-500
};

import { PageHeader } from '@/components/PageHeader';

export function AllExpensesView({ onOpenNewExpense, onEditExpense, onEditPayment }: AllExpensesViewProps) {
  const { currentProfile, expenses, payments, userGroups, profiles, drafts, discardDraft, deleteExpense, deletePayment } = useExpense();

  const [activeTab, setActiveTab] = useState<'transactions' | 'detected'>('transactions');
  const [selectedDraftToConfirm, setSelectedDraftToConfirm] = useState<ExpenseDraft | null>(null);
  const [isConnectingGmail, setIsConnectingGmail] = useState(false);
  const [gmailStatus, setGmailStatus] = useState<{ connected: boolean; apps_script_url?: string } | null>(null);

  const pendingDrafts = useMemo(() => {
    return (drafts || []).filter((d) => d.status === 'pending');
  }, [drafts]);

  const fetchGmailStatus = async () => {
    try {
      const res = await fetch('/api/gmail-connections');
      if (res.ok) {
        const data = await res.json();
        setGmailStatus({
          connected: Boolean(data.connected),
          apps_script_url: data.connection?.apps_script_url,
        });
      }
    } catch {
      // Ignorar errores silenciosos
    }
  };

  useEffect(() => {
    fetchGmailStatus();
  }, []);

  const handleConnectGmail = async () => {
    setIsConnectingGmail(true);
    try {
      const res = await fetch('/api/gmail-connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (res.ok && data.connection?.apps_script_url) {
        setGmailStatus({
          connected: true,
          apps_script_url: data.connection.apps_script_url,
        });
        window.open(data.connection.apps_script_url, '_blank');
      }
    } catch {
      // no-op
    } finally {
      setIsConnectingGmail(false);
    }
  };

  const [filters, setFilters] = useState<TransactionFilterState>({
    scope: 'all',
    dateMode: 'expense_date',
    datePreset: 'all',
    customStartDate: '',
    customEndDate: '',
    groupId: 'all',
    category: 'all',
    searchTerm: '',
  });

  const handleFilterChange = (updates: Partial<TransactionFilterState>) => {
    setFilters((prev) => ({ ...prev, ...updates }));
  };

  const userGroupIds = useMemo(() => new Set(userGroups.map((g) => g.id)), [userGroups]);
  const myExpenses = useMemo(() => expenses.filter((exp) => userGroupIds.has(exp.group_id)), [expenses, userGroupIds]);
  const myPayments = useMemo(() => payments.filter((p) => userGroupIds.has(p.group_id)), [payments, userGroupIds]);

  // Unique categories available
  const categories = useMemo(() => {
    return Array.from(new Set(myExpenses.map((e) => e.category || 'Varios'))).filter(Boolean);
  }, [myExpenses]);

  // Available months according to selected dateMode
  const availableMonths = useMemo(() => {
    return getAvailableTransactionMonths([...myExpenses, ...myPayments], filters.dateMode);
  }, [myExpenses, myPayments, filters.dateMode]);

  // Counts for scope buttons
  const totalTransactionsCount = myExpenses.length + myPayments.length;
  const myInteractionsCount = useMemo(() => {
    const myExpCount = myExpenses.filter((exp) => {
      const isPayer = exp.paid_by === currentProfile?.id;
      const isParticipant = Boolean(exp.splits?.some((s) => s.user_id === currentProfile?.id && s.amount_owed > 0));
      return isPayer || isParticipant;
    }).length;

    const myPayCount = myPayments.filter((p) => {
      return p.paid_by === currentProfile?.id || p.paid_to === currentProfile?.id;
    }).length;

    return myExpCount + myPayCount;
  }, [myExpenses, myPayments, currentProfile?.id]);

  // Filtered expenses
  const filteredExpenses = useMemo(() => {
    return myExpenses.filter((exp) => {
      const group = userGroups.find((g) => g.id === exp.group_id);
      const paidBy = profiles.find((p) => p.id === exp.paid_by);

      // Search term matching
      const matchesSearch =
        !filters.searchTerm.trim() ||
        (exp.description ? exp.description.toLowerCase() : '').includes(filters.searchTerm.toLowerCase()) ||
        (group && group.name ? group.name.toLowerCase().includes(filters.searchTerm.toLowerCase()) : false) ||
        (paidBy && paidBy.full_name ? paidBy.full_name.toLowerCase().includes(filters.searchTerm.toLowerCase()) : false);

      if (!matchesSearch) return false;

      // Group and category
      if (filters.groupId !== 'all' && exp.group_id !== filters.groupId) return false;
      if (filters.category !== 'all' && (exp.category || 'Varios') !== filters.category) return false;

      // Scope (interaction)
      if (filters.scope === 'mine') {
        const isPayer = exp.paid_by === currentProfile?.id;
        const isParticipant = Boolean(exp.splits?.some((s) => s.user_id === currentProfile?.id && s.amount_owed > 0));
        if (!isPayer && !isParticipant) return false;
      }

      // Date filtering using effective date (event vs entry/update)
      const { dateObj } = getEffectiveTransactionDate(exp, filters.dateMode);
      return isDateMatchingFilter(dateObj, filters.datePreset, {
        start: filters.customStartDate,
        end: filters.customEndDate,
      });
    });
  }, [myExpenses, userGroups, profiles, filters, currentProfile?.id]);

  // Filtered payments
  const filteredPayments = useMemo(() => {
    return myPayments.filter((p) => {
      const group = userGroups.find((g) => g.id === p.group_id);
      const payer = profiles.find((prof) => prof.id === p.paid_by);
      const receiver = profiles.find((prof) => prof.id === p.paid_to);

      // Search term matching
      const matchesSearch =
        !filters.searchTerm.trim() ||
        (p.note ? p.note.toLowerCase() : '').includes(filters.searchTerm.toLowerCase()) ||
        (group && group.name ? group.name.toLowerCase().includes(filters.searchTerm.toLowerCase()) : false) ||
        (payer && payer.full_name ? payer.full_name.toLowerCase().includes(filters.searchTerm.toLowerCase()) : false) ||
        (receiver && receiver.full_name ? receiver.full_name.toLowerCase().includes(filters.searchTerm.toLowerCase()) : false);

      if (!matchesSearch) return false;

      // Group
      if (filters.groupId !== 'all' && p.group_id !== filters.groupId) return false;

      // Scope (interaction)
      if (filters.scope === 'mine') {
        const isInteracted = p.paid_by === currentProfile?.id || p.paid_to === currentProfile?.id;
        if (!isInteracted) return false;
      }

      // Date filtering
      const { dateObj } = getEffectiveTransactionDate(p, filters.dateMode);
      return isDateMatchingFilter(dateObj, filters.datePreset, {
        start: filters.customStartDate,
        end: filters.customEndDate,
      });
    });
  }, [myPayments, userGroups, profiles, filters, currentProfile?.id]);

  // Aggregate stats for Chart
  const categoryStats = useMemo(() => {
    const totals: Record<string, number> = {};
    filteredExpenses.forEach((exp) => {
      const cat = exp.category || 'Varios';
      totals[cat] = (totals[cat] || 0) + exp.total_amount;
    });

    return Object.entries(totals).map(([name, value]) => ({
      name,
      value,
      color: CATEGORY_COLORS[name] || '#64748b',
    }));
  }, [filteredExpenses]);

  const totalFilteredSpent = useMemo(() => {
    return filteredExpenses.reduce((acc, curr) => acc + curr.total_amount, 0);
  }, [filteredExpenses]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <PageHeader 
          title="Historial de Gastos y Movimientos"
          subtitle="Revisa, filtra por fecha, y gestiona tus gastos confirmados y detectados por correo."
          icon={<Receipt className="w-5 h-5" />}
        />

        {/* Top Tab Switcher */}
        <div className="flex items-center space-x-1.5 p-1 bg-zinc-100 rounded-2xl self-start sm:self-auto border border-zinc-200/80 shrink-0">
          <button
            onClick={() => setActiveTab('transactions')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-2 ${
              activeTab === 'transactions'
                ? 'bg-white text-zinc-900 shadow-xs'
                : 'text-zinc-500 hover:text-zinc-900'
            }`}
          >
            <Receipt className="w-3.5 h-3.5" />
            <span>Historial ({myExpenses.length + myPayments.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('detected')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-2 relative ${
              activeTab === 'detected'
                ? 'bg-white text-indigo-950 shadow-xs ring-1 ring-indigo-200'
                : 'text-zinc-500 hover:text-zinc-900'
            }`}
          >
            <MailCheck className="w-3.5 h-3.5 text-indigo-600" />
            <span>Detectados</span>
            {pendingDrafts.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 text-[10px] font-black rounded-full bg-indigo-600 text-white animate-pulse">
                {pendingDrafts.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {activeTab === 'transactions' ? (
        <>
          {/* Chart & Summary Dashboard */}
          {filteredExpenses.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              {/* Summary Card */}
              <div className="lg:col-span-1 bg-zinc-900 text-white p-6 rounded-[2rem] shadow-sm flex flex-col justify-between space-y-6">
                <div>
                  <div className="flex items-center space-x-2 text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-2">
                    <BarChart3 className="w-4 h-4 text-emerald-400" />
                    <span>Resumen de Gastos</span>
                  </div>
                  <p className="text-3xl font-black text-white tracking-tight">
                    {formatCurrency(totalFilteredSpent, currentProfile?.currency || 'COP')}
                  </p>
                  <p className="text-xs text-zinc-400 mt-1">
                    Suma total de {filteredExpenses.length} gastos filtrados
                  </p>
                </div>

                <div className="pt-4 border-t border-zinc-800 space-y-2">
                  <div className="flex justify-between text-xs text-zinc-300">
                    <span>Gastos registrados:</span>
                    <span className="font-bold text-white">{filteredExpenses.length}</span>
                  </div>
                  <div className="flex justify-between text-xs text-zinc-300">
                    <span>Pagos de deuda registrados:</span>
                    <span className="font-bold text-emerald-400">{filteredPayments.length}</span>
                  </div>
                </div>
              </div>

              {/* Category Bar Chart */}
              <div className="lg:col-span-2 bg-white p-6 rounded-[2rem] ring-1 ring-zinc-200 shadow-2xs space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-zinc-900 text-sm flex items-center space-x-2">
                    <PieChartIcon className="w-4 h-4 text-emerald-600" />
                    <span>Distribución por Categoría</span>
                  </h3>
                  <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-widest">Visualización</span>
                </div>

                <div className="h-44 w-full pt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={categoryStats} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#71717a' }} />
                      <YAxis tick={{ fontSize: 10, fill: '#71717a' }} />
                      <Tooltip
                        formatter={(val) => formatCurrency(Number(val) || 0, currentProfile?.currency || 'COP')}
                        contentStyle={{
                          backgroundColor: '#18181b',
                          borderRadius: '12px',
                          color: '#fff',
                          fontSize: '12px',
                          border: 'none',
                        }}
                      />
                      <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                        {categoryStats.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          {/* Unified Transaction Filter Bar */}
          <TransactionFilterBar
            filters={filters}
            onFilterChange={handleFilterChange}
            availableMonths={availableMonths}
            categories={categories}
            userGroups={userGroups}
            showGroupFilter={true}
            showCategoryFilter={true}
            showSearch={true}
            totalCount={totalTransactionsCount}
            myCount={myInteractionsCount}
          />

          {/* Unified Reusable Transaction Feed */}
          <GenericExpenseList
            expenses={filteredExpenses}
            payments={filteredPayments}
            profiles={profiles}
            userGroups={userGroups}
            currentProfile={currentProfile}
            dateFilterMode={filters.dateMode}
            onEditExpense={onEditExpense}
            onDeleteExpense={(expId) => deleteExpense(expId)}
            onEditPayment={onEditPayment}
            onDeletePayment={(payId) => deletePayment(payId)}
            showGroupBadge={true}
          />
        </>
      ) : (
        /* Detected Drafts Tab */
        <div className="space-y-6">
          {/* Top Quick Actions Banner */}
          <div className="bg-zinc-900 text-white rounded-3xl p-6 ring-1 ring-zinc-800 shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center space-x-2">
                <MailCheck className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-bold text-white">Sincronización de Compras Bancarias</h3>
              </div>
              <p className="text-xs text-zinc-300 max-w-xl leading-relaxed">
                Tus compras con tarjetas y transferencias se detectan automáticamente para que las dividas en tus grupos con un solo toque.
              </p>
            </div>

            <div className="flex items-center flex-wrap gap-2.5">
              <button
                type="button"
                onClick={handleConnectGmail}
                disabled={isConnectingGmail}
                className="bg-white hover:bg-zinc-100 text-zinc-900 text-xs font-bold px-4 py-2.5 rounded-xl shadow-xs transition flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
              >
                {isConnectingGmail ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-900" />
                ) : (
                  <MailCheck className="w-3.5 h-3.5 text-zinc-900" />
                )}
                <span>{gmailStatus?.connected ? 'Reconectar o cambiar cuenta' : 'Conectar con Google'}</span>
              </button>

              <button
                type="button"
                onClick={() => setIsTemplatesOpen(true)}
                className="bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-700 text-xs font-bold px-4 py-2.5 rounded-xl shadow-xs transition flex items-center space-x-1.5 cursor-pointer"
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-zinc-400" />
                <span>Configuración y Bancos</span>
              </button>
            </div>
          </div>

          {/* Drafts List */}
          {pendingDrafts.length === 0 ? (
            <div className="bg-white rounded-3xl border border-zinc-200/90 p-12 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-zinc-100 border border-zinc-200 flex items-center justify-center text-zinc-600 mx-auto">
                <Inbox className="w-6 h-6 text-zinc-400" />
              </div>
              <h4 className="text-sm font-bold text-zinc-900">No tienes gastos pendientes por confirmar</h4>
              <p className="text-xs text-zinc-500 max-w-md mx-auto">
                Cuando recibas notificaciones bancarias en tu correo conectado, aparecerán aquí para que los asignes a un grupo.
              </p>
              <div className="pt-2 flex justify-center gap-2">
                <Link
                  href="/drafts"
                  className="bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-xs font-semibold px-4 py-2 rounded-xl transition cursor-pointer"
                >
                  Ver tickets y bancos
                </Link>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
                  {pendingDrafts.length} {pendingDrafts.length === 1 ? 'gasto detectado' : 'gastos detectados'} pendientes
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {pendingDrafts.map((draft) => (
                  <div
                    key={draft.id}
                    className="bg-white rounded-2xl p-5 border border-indigo-100/90 shadow-2xs hover:shadow-sm transition-all duration-200 flex flex-col justify-between space-y-4"
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="text-sm font-bold text-zinc-900">
                              {draft.detected_merchant || 'Gasto detectado'}
                            </span>
                            {draft.entity && (
                              <span className="text-[10px] font-bold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-md border border-indigo-100">
                                {draft.entity}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center space-x-3 text-xs text-zinc-500 mt-1">
                            <span>{draft.detected_date || 'Sin fecha'}</span>
                            {draft.detected_time && <span>• {draft.detected_time}</span>}
                            {draft.source_account && (
                              <span className="font-mono text-zinc-600 bg-zinc-100 px-1.5 py-0.5 rounded text-[10px]">
                                *{draft.source_account}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="text-right">
                          <span className="text-base font-extrabold text-indigo-900 block">
                            {formatCurrency(draft.detected_amount, draft.currency || 'COP')}
                          </span>
                          <span className="text-[10px] text-zinc-400 uppercase font-semibold">
                            {draft.currency || 'COP'}
                          </span>
                        </div>
                      </div>

                      {draft.raw_snippet && (
                        <p className="text-xs text-zinc-600 font-mono bg-zinc-50 p-2.5 rounded-xl border border-zinc-100 line-clamp-2 text-[11px]">
                          &quot;{draft.raw_snippet}&quot;
                        </p>
                      )}
                    </div>

                    <div className="pt-3 border-t border-zinc-100 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => discardDraft(draft.id)}
                        className="text-xs font-semibold text-rose-600 hover:bg-rose-50 px-3 py-1.5 rounded-lg transition flex items-center space-x-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Descartar</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setSelectedDraftToConfirm(draft)}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2 rounded-xl shadow-xs transition flex items-center space-x-1.5 cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Confirmar y Asignar</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Confirm Draft Modal */}
      <ConfirmDraftModal
        isOpen={Boolean(selectedDraftToConfirm)}
        onClose={() => setSelectedDraftToConfirm(null)}
        draft={selectedDraftToConfirm}
      />
    </div>
  );
}
