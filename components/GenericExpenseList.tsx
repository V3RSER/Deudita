'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { Expense, Payment, Profile, Group } from '@/lib/types';
import { formatCurrency } from '@/lib/balance-utils';
import { getCategoryConfig } from '@/lib/expense-category-utils';
import {
  DateFilterMode,
  getEffectiveTransactionDate,
  getRecordEventDateInfo,
  getRecordEntryDateInfo,
  formatHumanDate,
  extractTimeFromISO,
} from '@/lib/transaction-date-utils';
import { ExpenseParticipantSummary, ParticipantSummaryData, ParticipantItemBreakdown } from '@/components/ExpenseParticipantSummary';
import { ConfirmModal } from '@/components/ConfirmModal';
import {
  Receipt,
  HandCoins,
  FileText,
  Pencil,
  Trash2,
  ExternalLink,
  ArrowRight,
  CheckCircle2,
  X,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  User,
  Users,
  Clock,
  Calendar,
  ImageIcon,
  ShoppingBag,
  Layers,
  Loader2,
} from 'lucide-react';

type UnifiedTransaction =
  | {
      type: 'expense';
      date: string;
      dateObj: Date;
      isUpdated: boolean;
      hasExplicitTime: boolean;
      data: Expense;
    }
  | {
      type: 'payment';
      date: string;
      dateObj: Date;
      isUpdated: boolean;
      hasExplicitTime: boolean;
      data: Payment;
    };

interface GenericExpenseListProps {
  expenses: Expense[];
  payments: Payment[];
  profiles: Profile[];
  userGroups: Group[];
  currentProfile: Profile | null;
  pairwisePartnerProfile?: Profile | null;
  isSimplified?: boolean;
  groupCurrency?: string;
  dateFilterMode?: DateFilterMode;
  onSelectExpense?: (expense: Expense) => void;
  onEditExpense?: (expense: Expense) => void;
  onDeleteExpense?: (expenseId: string) => void;
  onEditPayment?: (payment: Payment) => void;
  onDeletePayment?: (paymentId: string) => void;
  showGroupBadge?: boolean;
  initialExpandedExpenseId?: string | null;
  pageSize?: number;
}

const MONTH_NAMES_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

const MONTH_ABBR_ES = [
  'ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN',
  'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'
];

function parseTxDate(dateInput: string | Date) {
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (!isNaN(d.getTime())) {
    const year = d.getFullYear();
    const monthIndex = d.getMonth();
    const dayNum = d.getDate();
    const dayStr = dayNum < 10 ? `0${dayNum}` : `${dayNum}`;
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const timeStr = `${hours}:${minutes}`;
    const monthAbbr = MONTH_ABBR_ES[monthIndex];
    const monthLabel = `${MONTH_NAMES_ES[monthIndex]} ${year}`;
    const key = `${year}-${monthIndex < 9 ? '0' : ''}${monthIndex}`;
    return { year, monthIndex, dayStr, timeStr, monthAbbr, monthLabel, key };
  }
  return { year: 2026, monthIndex: 0, dayStr: '01', timeStr: '00:00', monthAbbr: 'ENE', monthLabel: 'Enero 2026', key: '2026-00' };
}

function formatFullDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const dateFormatted = d.toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const timeFormatted = d.toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return `${dateFormatted}, ${timeFormatted}`;
}

export function GenericExpenseList({
  expenses,
  payments,
  profiles,
  userGroups,
  currentProfile,
  pairwisePartnerProfile,
  isSimplified = true,
  groupCurrency,
  dateFilterMode = 'expense_date',
  onSelectExpense,
  onEditExpense,
  onDeleteExpense,
  onEditPayment,
  onDeletePayment,
  showGroupBadge = true,
  initialExpandedExpenseId,
  pageSize = 20,
}: GenericExpenseListProps) {
  const [selectedProofUrl, setSelectedProofUrl] = useState<string | null>(null);
  const [userToggledExpenseIds, setUserToggledExpenseIds] = useState<Map<string, boolean>>(new Map());
  const [userToggledPaymentIds, setUserToggledPaymentIds] = useState<Map<string, boolean>>(new Map());
  const [expenseToDelete, setExpenseToDelete] = useState<string | null>(null);
  const [paymentToDelete, setPaymentToDelete] = useState<string | null>(null);
  const [isDeletingExpense, setIsDeletingExpense] = useState(false);
  const [isDeletingPayment, setIsDeletingPayment] = useState(false);
  const [extraPages, setExtraPages] = useState<number>(0);
  const [prevFilterKey, setPrevFilterKey] = useState<string>(`${expenses.length}_${payments.length}_${dateFilterMode}`);
  const currentFilterKey = `${expenses.length}_${payments.length}_${dateFilterMode}`;
  if (prevFilterKey !== currentFilterKey) {
    setPrevFilterKey(currentFilterKey);
    setExtraPages(0);
  }
  const visibleCount = pageSize + extraPages * pageSize;

  // Scroll to targeted expense card if initialExpandedExpenseId provided
  React.useEffect(() => {
    if (initialExpandedExpenseId) {
      const timer = setTimeout(() => {
        const el = document.getElementById(`expense-card-${initialExpandedExpenseId}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 150);

      return () => clearTimeout(timer);
    }
  }, [initialExpandedExpenseId]);

  const isExpenseExpanded = (id: string) => {
    if (userToggledExpenseIds.has(id)) {
      return Boolean(userToggledExpenseIds.get(id));
    }
    return id === initialExpandedExpenseId;
  };

  const toggleExpenseExpanded = (id: string) => {
    setUserToggledExpenseIds((prev) => {
      const next = new Map(prev);
      const currently = isExpenseExpanded(id);
      next.set(id, !currently);
      return next;
    });
  };

  const isPaymentExpanded = (id: string) => {
    return Boolean(userToggledPaymentIds.get(id));
  };

  const togglePaymentExpanded = (id: string) => {
    setUserToggledPaymentIds((prev) => {
      const next = new Map(prev);
      const currently = Boolean(next.get(id));
      next.set(id, !currently);
      return next;
    });
  };

  // Combine and sort chronologically (most recent first) according to active date filter mode
  const transactions: UnifiedTransaction[] = [
    ...expenses.map((e) => {
      const eff = getEffectiveTransactionDate(e, dateFilterMode);
      return {
        type: 'expense' as const,
        date: eff.timestamp,
        dateObj: eff.dateObj,
        isUpdated: eff.isUpdated,
        hasExplicitTime: eff.hasExplicitTime,
        data: e,
      };
    }),
    ...payments.map((p) => {
      const eff = getEffectiveTransactionDate(p, dateFilterMode);
      return {
        type: 'payment' as const,
        date: eff.timestamp,
        dateObj: eff.dateObj,
        isUpdated: eff.isUpdated,
        hasExplicitTime: eff.hasExplicitTime,
        data: p,
      };
    }),
  ].sort((a, b) => b.dateObj.getTime() - a.dateObj.getTime());

  if (transactions.length === 0) {
    return (
      <div className="bg-white rounded-2xl ring-1 ring-zinc-200 p-12 text-center text-zinc-500">
        <Receipt className="w-12 h-12 text-zinc-300 mx-auto mb-3" />
        <h3 className="font-semibold text-zinc-900 text-base">No hay movimientos registrados</h3>
        <p className="text-xs text-zinc-500 mt-1">Los gastos y pagos de deuda aparecerán aquí.</p>
      </div>
    );
  }

  // Paginated visible transactions
  const visibleTransactions = transactions.slice(0, visibleCount);
  const hasMoreTransactions = transactions.length > visibleCount;
  const remainingCount = transactions.length - visibleCount;

  // Group visible transactions by month
  const groupedByMonth: { key: string; label: string; items: UnifiedTransaction[] }[] = [];

  visibleTransactions.forEach((tx) => {
    const parsed = parseTxDate(tx.dateObj);
    let existing = groupedByMonth.find((g) => g.key === parsed.key);
    if (!existing) {
      existing = { key: parsed.key, label: parsed.monthLabel, items: [] };
      groupedByMonth.push(existing);
    }
    existing.items.push(tx);
  });

  return (
    <div className="space-y-4">
      {groupedByMonth.map((group) => (
        <div key={group.key} className="space-y-2">
          {/* Monthly Section Header Cut */}
          <div className="flex items-center space-x-2.5 px-1 py-0.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 bg-zinc-100 px-2.5 py-0.5 rounded-full border border-zinc-200/80 flex items-center space-x-1.5">
              {dateFilterMode === 'entry_date' ? (
                <Clock className="w-3 h-3 text-indigo-600" />
              ) : (
                <Calendar className="w-3 h-3 text-zinc-500" />
              )}
              <span>{group.label}</span>
            </span>
            <div className="h-px bg-zinc-200/70 flex-1" />
          </div>

          <div className="space-y-2.5">
            {group.items.map((tx) => {
              const parsed = parseTxDate(tx.dateObj);

              if (tx.type === 'expense') {
                const exp = tx.data;
                const groupObj = userGroups.find((g) => g.id === exp.group_id);
                const paidBy = profiles.find((p) => p.id === exp.paid_by);
                const createdBy = profiles.find((p) => p.id === exp.created_by);
                const updatedBy = exp.updated_by ? profiles.find((p) => p.id === exp.updated_by) : null;
                const catConfig = getCategoryConfig(exp.category);
                const CategoryIcon = catConfig.icon;
                const currency = groupCurrency || groupObj?.currency || currentProfile?.currency || 'COP';

                const managedIds = isSimplified
                  ? (currentProfile?.managed_user_ids || []).filter((id) => id !== currentProfile?.id)
                  : [];
                const myEffectiveIds = currentProfile ? [currentProfile.id, ...managedIds] : [];

                const partnerManagedIds = isSimplified
                  ? (pairwisePartnerProfile?.managed_user_ids || []).filter((id) => id !== pairwisePartnerProfile?.id)
                  : [];
                const partnerEffectiveIds = pairwisePartnerProfile ? [pairwisePartnerProfile.id, ...partnerManagedIds] : [];

                const isPayer = Boolean(currentProfile && myEffectiveIds.includes(exp.paid_by));
                const isPartnerPayer = Boolean(pairwisePartnerProfile && partnerEffectiveIds.includes(exp.paid_by));

                const myFamilySplits = exp.splits?.filter((s) => myEffectiveIds.includes(s.user_id)) || [];
                const myTotalOwed = myFamilySplits.reduce((acc, s) => acc + s.amount_owed, 0);

                const partnerFamilySplits = exp.splits?.filter((s) => partnerEffectiveIds.includes(s.user_id)) || [];
                const partnerTotalOwed = partnerFamilySplits.reduce((acc, s) => acc + s.amount_owed, 0);

                let badgeText = '';
                let badgeColorClass = 'text-zinc-400';

                if (pairwisePartnerProfile) {
                  // In 1-to-1 pairwise context:
                  if (isPayer) {
                    // Current profile paid: recovers ONLY what partner owes in this expense
                    if (partnerTotalOwed > 0) {
                      badgeText = `recuperas ${formatCurrency(partnerTotalOwed, currency)}`;
                      badgeColorClass = 'text-emerald-600';
                    } else {
                      badgeText = 'sin aporte de ' + (pairwisePartnerProfile.full_name?.split(' ')[0] || 'contraparte');
                      badgeColorClass = 'text-zinc-400';
                    }
                  } else if (isPartnerPayer) {
                    // Partner paid: current profile owes what they split
                    if (myTotalOwed > 0) {
                      badgeText = `debes ${formatCurrency(myTotalOwed, currency)}`;
                      badgeColorClass = 'text-rose-600';
                    } else {
                      badgeText = 'no participas';
                      badgeColorClass = 'text-zinc-400';
                    }
                  } else {
                    // 3rd party paid
                    if (myTotalOwed > 0) {
                      badgeText = `debes ${formatCurrency(myTotalOwed, currency)}`;
                      badgeColorClass = 'text-rose-600';
                    } else {
                      badgeText = 'no participas';
                      badgeColorClass = 'text-zinc-400';
                    }
                  }
                } else {
                  // General / Group feed context
                  const recovers = isPayer ? exp.total_amount - myTotalOwed : 0;
                  if (isPayer && recovers > 0) {
                    badgeText = `recuperas ${formatCurrency(recovers, currency)}`;
                    badgeColorClass = 'text-emerald-600';
                  } else if (isPayer) {
                    badgeText = 'pagaste todo';
                    badgeColorClass = 'text-emerald-600';
                  } else if (myTotalOwed > 0) {
                    badgeText = `debes ${formatCurrency(myTotalOwed, currency)}`;
                    badgeColorClass = 'text-rose-600';
                  } else {
                    badgeText = 'no participas';
                    badgeColorClass = 'text-zinc-400';
                  }
                }

                const isExpanded = isExpenseExpanded(exp.id);
                const isTargeted = initialExpandedExpenseId === exp.id;

                // Event and Entry date infos
                const eventInfo = getRecordEventDateInfo(exp);
                const entryInfo = getRecordEntryDateInfo(exp);

                return (
                  <div
                    id={`expense-card-${exp.id}`}
                    key={`exp-${exp.id}`}
                    className={`bg-white rounded-2xl border transition-all overflow-hidden mb-2.5 ${
                      isTargeted
                        ? 'border-emerald-500 ring-2 ring-emerald-500/20 shadow-md'
                        : isExpanded
                        ? 'border-emerald-300 ring-2 ring-emerald-500/10 shadow-xs'
                        : 'border-zinc-100/90 shadow-2xs hover:shadow-xs hover:border-zinc-200'
                    }`}
                  >
                    <div
                      className={`px-3 py-2.5 sm:px-4 sm:py-3 flex items-center justify-between gap-3 min-w-0 cursor-pointer group transition-colors select-none ${
                        isExpanded
                          ? 'bg-zinc-50/80 border-b border-zinc-200/70'
                          : 'hover:bg-zinc-50/60 active:bg-zinc-100/50'
                      }`}
                      onClick={() => toggleExpenseExpanded(exp.id)}
                    >
                      <div className="flex items-center space-x-3 min-w-0 flex-1">
                        {/* Date Block: Only Month & Day (e.g. 24 AGO) */}
                        <div
                          className={`w-11 h-11 rounded-xl flex flex-col items-center justify-center shrink-0 text-center select-none shadow-2xs border ${
                            dateFilterMode === 'entry_date'
                              ? 'bg-indigo-50/80 border-indigo-200/90 text-indigo-950'
                              : 'bg-zinc-50 border-zinc-100/90 text-zinc-900'
                          }`}
                        >
                          <span className="text-sm font-bold text-zinc-900 leading-none">
                            {parsed.dayStr}
                          </span>
                          <span
                            className={`text-[9px] font-bold uppercase tracking-tight leading-none mt-1 ${
                              dateFilterMode === 'entry_date' ? 'text-indigo-600' : 'text-zinc-400'
                            }`}
                          >
                            {parsed.monthAbbr}
                          </span>
                        </div>

                        {/* Category Circular Badge */}
                        <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100/80 flex items-center justify-center shrink-0 shadow-2xs">
                          <CategoryIcon className="w-4 h-4" />
                        </div>

                        {/* Expense Name & Details */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center space-x-1.5">
                            <h3
                              className={`font-semibold text-zinc-900 text-sm transition-colors truncate ${
                                !isExpanded ? 'group-hover:text-emerald-700' : 'text-zinc-950 font-bold'
                              }`}
                            >
                              {exp.description}
                            </h3>
                            {exp.source === 'gmail' && (
                              <span className="bg-zinc-900 text-white text-[8px] uppercase font-semibold tracking-widest px-1 py-0.2 rounded shrink-0">
                                AI
                              </span>
                            )}
                            {dateFilterMode === 'entry_date' && tx.isUpdated && (
                              <span className="bg-amber-100 text-amber-800 text-[8.5px] font-bold px-1.5 py-0.2 rounded border border-amber-200 shrink-0">
                                Editado
                              </span>
                            )}
                          </div>

                          {/* Subtitle row */}
                          <div className="flex flex-wrap items-center gap-1 text-xs text-zinc-500 mt-0.5 leading-none">
                            {showGroupBadge && groupObj && (
                              <>
                                <span className="font-medium text-zinc-700 bg-zinc-100 px-1 py-0.2 rounded text-[10px]">
                                  {groupObj.name}
                                </span>
                                <span>•</span>
                              </>
                            )}
                            <span className="truncate">
                              Pagó <span className="font-medium text-zinc-700">{paidBy ? paidBy.full_name : 'Alguien'}</span>
                              {isPayer && (
                                <span className="ml-1 text-xs text-emerald-600 font-semibold">(Tú)</span>
                              )}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Right Amount & Personal Share info beneath amount */}
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="flex flex-col items-end justify-center text-right">
                          <span className="text-sm font-bold text-zinc-900 leading-tight">
                            {formatCurrency(exp.total_amount, currency)}
                          </span>
                          <span className={`text-xs font-semibold leading-tight mt-0.5 ${badgeColorClass}`}>
                            {badgeText}
                          </span>
                        </div>

                        {/* Icon-only buttons when expanded */}
                        {isExpanded && (
                          <div className="flex items-center gap-1 pl-1 border-l border-zinc-200/80" onClick={(e) => e.stopPropagation()}>
                            {onEditExpense && (
                              <button
                                type="button"
                                onClick={() => onEditExpense(exp)}
                                title="Editar gasto"
                                aria-label="Editar gasto"
                                className="p-1 sm:p-1.5 rounded-lg text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200/80 active:scale-95 transition-all cursor-pointer"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {onDeleteExpense && (
                              <button
                                type="button"
                                onClick={() => setExpenseToDelete(exp.id)}
                                title="Eliminar gasto"
                                aria-label="Eliminar gasto"
                                className="p-1 sm:p-1.5 rounded-lg text-zinc-400 hover:text-rose-600 hover:bg-rose-50 active:scale-95 transition-all cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        )}

                        <ChevronRight
                          className={`w-4 h-4 text-zinc-400 ml-1 transition-transform ${
                            isExpanded ? 'rotate-90 text-emerald-600' : ''
                          }`}
                        />
                      </div>
                    </div>

                    {/* EXPANDED CONTENT */}
                    {isExpanded && (
                      <div className="bg-zinc-50/40 p-2.5 sm:p-3 space-y-2">
                        {/* Content Grid */}
                        {(() => {
                          const hasItems = Boolean(exp.items && exp.items.length > 0);
                          const hasNotes = Boolean(exp.notes && exp.notes.trim().length > 0);
                          const hasReceipt = Boolean(exp.receipt_url);
                          const hasSecondaryDetails = hasItems || hasNotes || hasReceipt;

                          const participantSummaryList: ParticipantSummaryData[] = (exp.splits || []).map((split) => {
                            const profile = profiles.find((p) => p.id === split.user_id);
                            const userAmt = split.amount_owed;
                            const breakdown: ParticipantItemBreakdown[] = [];

                            if (exp.items && exp.items.length > 0 && exp.total_amount > 0) {
                              exp.items.forEach((item) => {
                                const match = item.description.match(/^(\d+(?:\.\d+)?)\s*(?:·|x)\s*(.*)$/);
                                const totalQty = match ? parseFloat(match[1]) || 1 : 1;
                                const cleanDesc = match ? match[2].trim() : item.description;
                                const ratio = exp.total_amount > 0 ? (userAmt / exp.total_amount) : 0;
                                const userItemQty = totalQty * ratio;
                                const userItemCost = item.amount * ratio;

                                breakdown.push({
                                  desc: cleanDesc,
                                  qty: userItemQty,
                                  cost: userItemCost,
                                });
                              });
                            }

                            return {
                              userId: split.user_id,
                              profile,
                              amount: userAmt,
                              breakdown: breakdown.length > 0 ? breakdown : undefined,
                            };
                          });

                          if (hasSecondaryDetails) {
                            return (
                              <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 items-start">
                                {/* Participation list (ExpenseParticipantSummary) */}
                                <ExpenseParticipantSummary
                                  participants={participantSummaryList}
                                  currency={currency}
                                  currentUserId={currentProfile?.id}
                                  title="Resumen por participante"
                                  defaultExpanded={false}
                                />

                                {/* Items, Notes and Receipt (right col) */}
                                <div className="space-y-2">
                                  {hasItems && (
                                    <div className="bg-white rounded-xl sm:rounded-2xl border border-zinc-200/90 shadow-2xs overflow-hidden">
                                      <div className="px-3 py-2 bg-zinc-50/70 border-b border-zinc-200/70 flex items-center justify-between">
                                        <div className="flex items-center gap-1.5">
                                          <ShoppingBag className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                                          <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
                                            Desglose de artículos ({exp.items?.length || 0})
                                          </span>
                                        </div>
                                      </div>
                                      <div className="divide-y divide-zinc-100 max-h-48 overflow-y-auto">
                                        {exp.items?.map((item, idx) => (
                                          <div key={item.id || idx} className="flex items-center justify-between text-xs py-2 px-3 hover:bg-zinc-50/40 transition-colors">
                                            <div className="flex items-center space-x-2 min-w-0 pr-2">
                                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                                              <span className="font-medium text-zinc-800 truncate">{item.description}</span>
                                            </div>
                                            <span className="text-zinc-900 font-bold shrink-0 text-xs">
                                              {formatCurrency(item.amount, currency)}
                                            </span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {hasReceipt && (
                                    <div className="bg-white rounded-xl sm:rounded-2xl border border-zinc-200/90 shadow-2xs overflow-hidden">
                                      <div className="px-3 py-2 bg-zinc-50/70 border-b border-zinc-200/70 flex items-center justify-between">
                                        <div className="flex items-center gap-1.5">
                                          <ImageIcon className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                                          <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
                                            Comprobante
                                          </span>
                                        </div>
                                      </div>
                                      <div className="p-3">
                                        <div
                                          onClick={() => setSelectedProofUrl(exp.receipt_url ?? null)}
                                          className="group/img relative w-24 h-24 rounded-xl overflow-hidden border border-zinc-200 cursor-pointer bg-zinc-100 hover:border-emerald-500 transition-all shadow-2xs"
                                        >
                                          <Image
                                            src={exp.receipt_url!}
                                            alt="Comprobante"
                                            fill
                                            className="object-cover group-hover/img:scale-105 transition-transform"
                                            unoptimized
                                            referrerPolicy="no-referrer"
                                          />
                                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center text-white text-[11px] font-semibold gap-1">
                                            <ExternalLink className="w-3.5 h-3.5" />
                                            <span>Ver</span>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  )}

                                  {hasNotes && (
                                    <div className="bg-white rounded-xl sm:rounded-2xl border border-zinc-200/90 shadow-2xs overflow-hidden">
                                      <div className="px-3 py-2 bg-zinc-50/70 border-b border-zinc-200/70 flex items-center justify-between">
                                        <div className="flex items-center gap-1.5">
                                          <FileText className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                                          <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
                                            Notas
                                          </span>
                                        </div>
                                      </div>
                                      <div className="p-3">
                                        <p className="text-xs text-zinc-700 whitespace-pre-wrap leading-relaxed">
                                          {exp.notes}
                                        </p>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          }

                          // Full-width balanced splits card when there are no extra notes/items
                          return (
                            <ExpenseParticipantSummary
                              participants={participantSummaryList}
                              currency={currency}
                              currentUserId={currentProfile?.id}
                              title="Resumen por participante"
                              defaultExpanded={false}
                            />
                          );
                        })()}

                        {/* Dedicated Detailed Date & Timestamp Metadata Footer */}
                        <div className="pt-2.5 border-t border-zinc-200/60 text-[11px] text-zinc-500 space-y-1 bg-white/60 p-2.5 rounded-xl">
                          <div className="flex items-center space-x-2 flex-wrap">
                            <Calendar className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                            <span>
                              Fecha del gasto: <strong className="font-semibold text-zinc-700">
                                {formatHumanDate(eventInfo.dateObj, { includeTime: Boolean(exp.expense_time) })}
                              </strong>
                            </span>
                          </div>

                          <div className="flex items-center space-x-2 flex-wrap">
                            <Clock className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                            <span>
                              Registrado por <strong className="font-medium text-zinc-700">{createdBy ? createdBy.full_name : 'Usuario'}</strong> el {formatFullDateTime(exp.created_at)}
                            </span>
                          </div>

                          {exp.updated_at && exp.updated_at !== exp.created_at && (
                            <div className="flex items-center space-x-2 flex-wrap">
                              <Clock className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                              <span>
                                Última modificación por <strong className="font-medium text-zinc-700">{updatedBy ? updatedBy.full_name : 'Usuario'}</strong> el {formatFullDateTime(exp.updated_at)}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              }

              // Render PAYMENT transaction with visual harmony & full parity!
              const payment = tx.data;
              const payer = profiles.find((p) => p.id === payment.paid_by);
              const receiver = profiles.find((p) => p.id === payment.paid_to);
              const groupObj = userGroups.find((g) => g.id === payment.group_id);
              const currency = groupCurrency || groupObj?.currency || currentProfile?.currency || 'COP';

              const isIpaid = payment.paid_by === currentProfile?.id;
              const isIreceived = payment.paid_to === currentProfile?.id;
              const isExpanded = isPaymentExpanded(payment.id);

              const eventInfo = getRecordEventDateInfo(payment);
              const explicitPayTime = payment.payment_time ? extractTimeFromISO(payment.payment_time) : '';

              const updatedBy = payment.updated_by ? profiles.find((p) => p.id === payment.updated_by) : null;
              const hasProof = Boolean(payment.proof_url);
              const hasNote = Boolean(payment.note && payment.note.trim().length > 0);

              return (
                <div
                  key={`pay-${payment.id}`}
                  id={`payment-card-${payment.id}`}
                  className={`bg-white rounded-2xl border transition-all overflow-hidden mb-2.5 ${
                    isExpanded
                      ? 'border-emerald-300 ring-2 ring-emerald-500/10 shadow-xs'
                      : 'border-zinc-100/90 shadow-2xs hover:shadow-xs hover:border-zinc-200'
                  }`}
                >
                  {/* Collapsed / Summary Header (Click toggles expansion) */}
                  <div
                    onClick={() => togglePaymentExpanded(payment.id)}
                    className={`px-3 py-2.5 sm:px-4 sm:py-3 flex items-center justify-between gap-3 min-w-0 transition-colors cursor-pointer select-none ${
                      isExpanded
                        ? 'bg-zinc-50/80 border-b border-zinc-200/70'
                        : 'hover:bg-zinc-50/60 active:bg-zinc-100/50'
                    }`}
                  >
                    <div className="flex items-center space-x-3 min-w-0 flex-1">
                      {/* Date Block: Day on top, Month below */}
                      <div
                        className={`w-11 h-11 rounded-xl flex flex-col items-center justify-center shrink-0 text-center select-none shadow-2xs border ${
                          dateFilterMode === 'entry_date'
                            ? 'bg-indigo-50/80 border-indigo-200/90 text-indigo-950'
                            : 'bg-zinc-50 border-zinc-100/90 text-zinc-900'
                        }`}
                      >
                        <span className="text-sm font-bold text-zinc-900 leading-none">
                          {parsed.dayStr}
                        </span>
                        <span
                          className={`text-[9px] font-bold uppercase tracking-tight leading-none mt-1 ${
                            dateFilterMode === 'entry_date' ? 'text-indigo-600' : 'text-zinc-400'
                          }`}
                        >
                          {parsed.monthAbbr}
                        </span>
                      </div>

                      {/* Payment Circular Badge */}
                      <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100/80 flex items-center justify-center shrink-0 shadow-2xs">
                        <HandCoins className="w-4 h-4 text-emerald-600" />
                      </div>

                      {/* Payment Description & Details */}
                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold text-zinc-900 text-sm flex items-center space-x-1 flex-wrap truncate">
                          <span className={isIpaid ? 'text-emerald-700 font-bold' : ''}>
                            {payer ? payer.full_name : 'Usuario'}
                          </span>
                          <ArrowRight className="w-3 h-3 text-emerald-600 shrink-0" />
                          <span className={isIreceived ? 'text-emerald-700 font-bold' : ''}>
                            {receiver ? receiver.full_name : 'Usuario'}
                          </span>
                          {dateFilterMode === 'entry_date' && tx.isUpdated && (
                            <span className="bg-amber-100 text-amber-800 text-[8.5px] font-bold px-1.5 py-0.2 rounded border border-amber-200 shrink-0 ml-1">
                              Editado
                            </span>
                          )}
                        </h3>

                        {/* Subtitle row */}
                        <div className="flex flex-wrap items-center gap-1 text-xs text-zinc-500 mt-0.5 leading-none">
                          {showGroupBadge && groupObj && (
                            <>
                              <span className="font-medium text-zinc-700 bg-zinc-100 px-1 py-0.2 rounded text-[10px]">
                                {groupObj.name}
                              </span>
                              <span>•</span>
                            </>
                          )}
                          <span className="truncate">
                            {isIpaid ? 'Transferiste a ' : 'Pagó a '}
                            <span className="font-medium text-zinc-700">{receiver ? receiver.full_name : 'Usuario'}</span>
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Right Amount & Personal Share info beneath amount */}
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="flex flex-col items-end justify-center text-right">
                        <span className="text-sm font-bold text-zinc-900 leading-tight">
                          {formatCurrency(payment.amount, currency)}
                        </span>
                        <span
                          className={`text-xs font-semibold leading-tight mt-0.5 ${
                            isIpaid
                              ? 'text-emerald-600'
                              : isIreceived
                              ? 'text-emerald-600'
                              : 'text-zinc-400'
                          }`}
                        >
                          {isIpaid ? 'pagaste' : isIreceived ? 'recibiste' : 'no participas'}
                        </span>
                      </div>

                      {/* Icon-only buttons when expanded */}
                      {isExpanded && (
                        <div className="flex items-center gap-1 pl-1 border-l border-zinc-200/80" onClick={(e) => e.stopPropagation()}>
                          {onEditPayment && (
                            <button
                              type="button"
                              onClick={() => onEditPayment(payment)}
                              title="Editar pago"
                              aria-label="Editar pago"
                              className="p-1 sm:p-1.5 rounded-lg text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200/80 active:scale-95 transition-all cursor-pointer"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {onDeletePayment && (
                            <button
                              type="button"
                              onClick={() => setPaymentToDelete(payment.id)}
                              title="Eliminar pago"
                              aria-label="Eliminar pago"
                              className="p-1 sm:p-1.5 rounded-lg text-zinc-400 hover:text-rose-600 hover:bg-rose-50 active:scale-95 transition-all cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      )}

                      <ChevronRight
                        className={`w-4 h-4 text-zinc-400 ml-1 transition-transform ${
                          isExpanded ? 'rotate-90 text-emerald-600' : ''
                        }`}
                      />
                    </div>
                  </div>

                  {/* EXPANDED PAYMENT CONTENT */}
                  {isExpanded && (
                    <div className="bg-zinc-50/40 p-2.5 sm:p-3 space-y-2">
                      {/* Transfer Summary Card */}
                      <div className="bg-white rounded-xl sm:rounded-2xl border border-zinc-200/90 shadow-2xs overflow-hidden">
                        <div className="p-3.5 sm:p-4">
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
                            {/* Payer Side */}
                            <div className="flex items-center space-x-3 p-2.5 rounded-xl bg-zinc-50 border border-zinc-100">
                              <div className="relative w-10 h-10 rounded-full overflow-hidden shrink-0 bg-emerald-100 flex items-center justify-center border border-emerald-200">
                                {payer?.avatar_url ? (
                                  <Image
                                    src={payer.avatar_url}
                                    alt={payer.full_name}
                                    fill
                                    className="object-cover"
                                    unoptimized
                                    referrerPolicy="no-referrer"
                                  />
                                ) : (
                                  <User className="w-5 h-5 text-emerald-700" />
                                )}
                              </div>
                              <div className="min-w-0">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 block">
                                  Pagó
                                </span>
                                <span className="text-xs font-bold text-zinc-900 truncate block">
                                  {payer ? payer.full_name : 'Usuario'} {isIpaid && '(Tú)'}
                                </span>
                              </div>
                            </div>

                            {/* Center Amount Transfer Display */}
                            <div className="flex flex-col items-center justify-center text-center p-2">
                              <div className="inline-flex items-center space-x-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200/80 mb-1">
                                <span>Monto pagado</span>
                                <ArrowRight className="w-3.5 h-3.5 text-emerald-600" />
                              </div>
                              <span className="text-lg sm:text-xl font-black text-zinc-900 tracking-tight">
                                {formatCurrency(payment.amount, currency)}
                              </span>
                            </div>

                            {/* Receiver Side */}
                            <div className="flex items-center space-x-3 p-2.5 rounded-xl bg-zinc-50 border border-zinc-100">
                              <div className="relative w-10 h-10 rounded-full overflow-hidden shrink-0 bg-blue-100 flex items-center justify-center border border-blue-200">
                                {receiver?.avatar_url ? (
                                  <Image
                                    src={receiver.avatar_url}
                                    alt={receiver.full_name}
                                    fill
                                    className="object-cover"
                                    unoptimized
                                    referrerPolicy="no-referrer"
                                  />
                                ) : (
                                  <User className="w-5 h-5 text-blue-700" />
                                )}
                              </div>
                              <div className="min-w-0">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 block">
                                  Recibió
                                </span>
                                <span className="text-xs font-bold text-zinc-900 truncate block">
                                  {receiver ? receiver.full_name : 'Usuario'} {isIreceived && '(Tú)'}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Extra Details: Notes & Proof of Payment in separated, unified cards */}
                      {(hasNote || hasProof) && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {hasProof && (
                            <div className="bg-white rounded-xl sm:rounded-2xl border border-zinc-200/90 shadow-2xs overflow-hidden">
                              <div className="px-3 py-2 bg-zinc-50/70 border-b border-zinc-200/70 flex items-center justify-between">
                                <div className="flex items-center gap-1.5">
                                  <ImageIcon className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                                  <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
                                    Comprobante
                                  </span>
                                </div>
                              </div>
                              <div className="p-3">
                                <div
                                  onClick={() => setSelectedProofUrl(payment.proof_url ?? null)}
                                  className="group/img relative w-24 h-24 rounded-xl overflow-hidden border border-zinc-200 cursor-pointer bg-zinc-100 hover:border-emerald-500 transition-all shadow-2xs"
                                >
                                  <Image
                                    src={payment.proof_url!}
                                    alt="Comprobante de pago"
                                    fill
                                    className="object-cover group-hover/img:scale-105 transition-transform"
                                    unoptimized
                                    referrerPolicy="no-referrer"
                                  />
                                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center text-white text-[11px] font-semibold gap-1">
                                    <ExternalLink className="w-3.5 h-3.5" />
                                    <span>Ver</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}

                          {hasNote && (
                            <div className="bg-white rounded-xl sm:rounded-2xl border border-zinc-200/90 shadow-2xs overflow-hidden">
                              <div className="px-3 py-2 bg-zinc-50/70 border-b border-zinc-200/70 flex items-center justify-between">
                                <div className="flex items-center gap-1.5">
                                  <FileText className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                                  <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
                                    Notas
                                  </span>
                                </div>
                              </div>
                              <div className="p-3">
                                <p className="text-xs text-zinc-700 whitespace-pre-wrap leading-relaxed">
                                  {payment.note}
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Dedicated Detailed Date & Timestamp Metadata Footer */}
                      <div className="pt-2.5 border-t border-zinc-200/60 text-[11px] text-zinc-500 space-y-1 bg-white/60 p-2.5 rounded-xl">
                        <div className="flex items-center space-x-2 flex-wrap">
                          <Calendar className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                          <span>
                            Fecha del pago: <strong className="font-semibold text-zinc-700">
                              {formatHumanDate(eventInfo.dateObj, { includeTime: Boolean(payment.payment_time) })}
                            </strong>
                          </span>
                        </div>

                        <div className="flex items-center space-x-2 flex-wrap">
                          <Clock className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                          <span>
                            Registrado el {formatFullDateTime(payment.created_at)}
                          </span>
                        </div>

                        {payment.updated_at && payment.updated_at !== payment.created_at && (
                          <div className="flex items-center space-x-2 flex-wrap">
                            <Clock className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                            <span>
                              Última modificación por <strong className="font-medium text-zinc-700">{updatedBy ? updatedBy.full_name : 'Usuario'}</strong> el {formatFullDateTime(payment.updated_at)}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Pagination / Load More Controls */}
      {transactions.length > pageSize && (
        <div className="pt-2 pb-4 flex flex-col items-center justify-center gap-2">
          {hasMoreTransactions ? (
            <button
              type="button"
              onClick={() => setExtraPages((prev) => prev + 1)}
              className="w-full sm:w-auto px-6 py-2.5 bg-white hover:bg-zinc-50 active:scale-[0.98] border border-zinc-200/90 hover:border-zinc-300 text-zinc-900 rounded-xl font-bold text-xs shadow-2xs hover:shadow-xs transition-all flex items-center justify-center space-x-2 cursor-pointer"
            >
              <ChevronDown className="w-4 h-4 text-emerald-600" />
              <span>
                Cargar más ({Math.min(pageSize, remainingCount)} de {remainingCount} restantes)
              </span>
            </button>
          ) : (
            <div className="text-center py-4">
              <span className="text-xs font-medium text-zinc-400">
                No hay más gastos
              </span>
            </div>
          )}
          <span className="text-[11px] font-medium text-zinc-400">
            Mostrando {visibleTransactions.length} de {transactions.length} movimientos
          </span>
        </div>
      )}

      {/* Delete Expense Modal (Generic & Reusable) */}
      <ConfirmModal
        isOpen={Boolean(expenseToDelete)}
        onClose={() => setExpenseToDelete(null)}
        onConfirm={async () => {
          if (onDeleteExpense && expenseToDelete) {
            try {
              setIsDeletingExpense(true);
              await onDeleteExpense(expenseToDelete);
              setExpenseToDelete(null);
            } finally {
              setIsDeletingExpense(false);
            }
          }
        }}
        title="¿Eliminar gasto?"
        description="¿Estás seguro de que deseas eliminar este gasto? Esta acción actualizará los balances del grupo y no se puede deshacer."
        confirmText="Eliminar gasto"
        cancelText="Cancelar"
        variant="danger"
        isLoading={isDeletingExpense}
      />

      {/* Delete Payment Modal (Generic & Reusable) */}
      <ConfirmModal
        isOpen={Boolean(paymentToDelete)}
        onClose={() => setPaymentToDelete(null)}
        onConfirm={async () => {
          if (onDeletePayment && paymentToDelete) {
            try {
              setIsDeletingPayment(true);
              await onDeletePayment(paymentToDelete);
              setPaymentToDelete(null);
            } finally {
              setIsDeletingPayment(false);
            }
          }
        }}
        title="¿Eliminar pago?"
        description="¿Estás seguro de que deseas eliminar este pago? Esta acción restaurará la deuda correspondiente en los balances y no se puede deshacer."
        confirmText="Eliminar pago"
        cancelText="Cancelar"
        variant="danger"
        isLoading={isDeletingPayment}
      />

      {/* Proof Modal */}
      {selectedProofUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-sm">
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full space-y-4 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
              <h3 className="font-bold text-zinc-900 text-base">Comprobante de Pago</h3>
              <button
                type="button"
                onClick={() => setSelectedProofUrl(null)}
                className="p-1.5 text-zinc-400 hover:text-zinc-900 rounded-full"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="relative w-full h-80 rounded-2xl overflow-hidden bg-zinc-100 ring-1 ring-zinc-200">
              <Image
                src={selectedProofUrl}
                alt="Comprobante de pago"
                fill
                className="object-contain"
                unoptimized
                referrerPolicy="no-referrer"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
