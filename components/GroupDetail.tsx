'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { useExpense } from '@/lib/expense-context';
import { Group, Expense, Payment, Profile, PairwiseBalance } from '@/lib/types';
import {
  formatCurrency,
  calculateSimplifiedBalances,
  calculateDirectBalances,
  calculateUserSummaries,
  calculatePairwiseDebtDetail,
} from '@/lib/balance-utils';
import {
  DollarSign,
  Scale,
  Users,
  Activity,
  Search,
  SlidersHorizontal,
  Receipt,
  Wallet,
  Plus,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Calendar,
  Pencil,
  MoreHorizontal,
  Share2,
  List,
  Trash2,
  HandCoins,
  X,
  ExternalLink,
  CheckCircle2,
  Sparkles,
  Layers,
  Shield,
  ShieldCheck,
  UserCheck,
  UserPlus,
  Link as LinkIcon,
  User,
  Clock,
  ArrowRight,
  PlusCircle,
} from 'lucide-react';

import { getGroupImage } from '@/lib/group-utils';
import { getCategoryConfig } from '@/lib/expense-category-utils';
import { formatDisplayEmail, isTempProfile } from '@/lib/utils';
import { UserAvatar, AvatarBadge } from '@/components/UserAvatar';
import { extractNotesAndConfig } from '@/lib/split-config-utils';

import { MemberDetailModal } from '@/components/MemberDetailModal';
import { GroupExpenseFilterSheet } from '@/components/GroupExpenseFilterSheet';
import { TransactionFilterState } from '@/components/TransactionFilterBar';
import {
  getEffectiveTransactionDate,
  isDateMatchingFilter,
  getAvailableTransactionMonths,
  getRecordEntryDateInfo,
} from '@/lib/transaction-date-utils';
import { EditGroupModal } from '@/components/EditGroupModal';
import { GroupSettingsModal } from '@/components/GroupSettingsModal';
import { ConfirmModal } from '@/components/ConfirmModal';
import { PairwiseDetailModal } from '@/components/PairwiseDetailModal';

interface GroupDetailProps {
  group: Group;
  onBack: () => void;
  onOpenNewExpense: (groupId?: string) => void;
  onEditExpense?: (expense: Expense) => void;
  onEditPayment?: (payment: Payment) => void;
  onDeletePayment?: (paymentId: string) => void;
  onOpenSettleModal: (groupId: string, debtorId?: string, creditorId?: string, amount?: number) => void;
  onOpenAddMember: (groupId: string) => void;
  onOpenInviteLink: (groupId: string) => void;
}

const MONTH_NAMES_ES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

const MONTH_ABBR_ES = [
  'ENE',
  'FEB',
  'MAR',
  'ABR',
  'MAY',
  'JUN',
  'JUL',
  'AGO',
  'SEP',
  'OCT',
  'NOV',
  'DIC',
];

const MONTH_SHORT_LOWER_ES = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
];

function parseTxDate(dateInput: string | Date) {
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (!isNaN(d.getTime())) {
    const year = d.getFullYear();
    const monthIndex = d.getMonth();
    const dayNum = d.getDate();
    const dayStr = dayNum < 10 ? `0${dayNum}` : `${dayNum}`;
    const monthAbbr = MONTH_ABBR_ES[monthIndex];
    const monthLabel = `${MONTH_NAMES_ES[monthIndex]} ${year}`;
    const key = `${year}-${monthIndex < 9 ? '0' : ''}${monthIndex}`;
    return { year, monthIndex, dayStr, monthAbbr, monthLabel, key };
  }
  return { year: 2026, monthIndex: 0, dayStr: '01', monthAbbr: 'ENE', monthLabel: 'Enero 2026', key: '2026-00' };
}

function formatShortDateWithTime(dateStr?: string | null, timeStr?: string | null): string {
  if (!dateStr) return '';

  let day = 1;
  let month = 'sep';
  let hours = '20';
  let minutes = '00';
  let hasTime = false;

  if (timeStr && timeStr.trim()) {
    const cleanTime = timeStr.trim().slice(0, 5);
    const parts = cleanTime.split(':');
    if (parts.length >= 2) {
      hours = parts[0].padStart(2, '0');
      minutes = parts[1].padStart(2, '0');
      hasTime = true;
    }
  }

  if (dateStr.includes('T')) {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      day = d.getDate();
      month = MONTH_SHORT_LOWER_ES[d.getMonth()] || 'sep';
      if (!hasTime) {
        hours = String(d.getHours()).padStart(2, '0');
        minutes = String(d.getMinutes()).padStart(2, '0');
      }
      return `${day} ${month}, ${hours}:${minutes}`;
    }
  }

  const cleanDate = dateStr.split('T')[0];
  const parts = cleanDate.split('-');
  if (parts.length >= 3) {
    day = parseInt(parts[2], 10);
    const mIdx = Math.max(0, Math.min(11, (parseInt(parts[1], 10) || 1) - 1));
    month = MONTH_SHORT_LOWER_ES[mIdx] || 'sep';
  } else {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      day = d.getDate();
      month = MONTH_SHORT_LOWER_ES[d.getMonth()] || 'sep';
    }
  }

  return `${day} ${month}, ${hours}:${minutes}`;
}

function formatActivityDateTime(dateStr: string | null | undefined): string {
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

type UnifiedTransaction =
  | {
      type: 'expense';
      dateObj: Date;
      data: Expense;
    }
  | {
      type: 'payment';
      dateObj: Date;
      data: Payment;
    };

export function GroupDetail({
  group,
  onBack,
  onOpenNewExpense,
  onEditExpense,
  onEditPayment,
  onDeletePayment,
  onOpenSettleModal,
  onOpenAddMember,
  onOpenInviteLink,
}: GroupDetailProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialExpenseId = searchParams.get('expenseId');

  const {
    currentProfile,
    expenses,
    auditLogs,
    payments,
    members,
    profiles,
    userGroups,
    pendingInvites,
    managedUserIds,
    sponsorshipMap,
    deleteExpense,
    deletePayment,
    deleteGroup,
  } = useExpense();

  const [activeTab, setActiveTab] = useState<'expenses' | 'balances' | 'members' | 'activity'>('expenses');
  const [filters, setFilters] = useState<TransactionFilterState>({
    scope: 'all',
    dateMode: 'expense_date',
    datePreset: 'all',
    customStartDate: '',
    customEndDate: '',
    groupId: group.id,
    category: 'all',
    searchTerm: '',
  });

  const handleFilterChange = (updates: Partial<TransactionFilterState>) => {
    setFilters((prev) => ({ ...prev, ...updates }));
  };

  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [isSimplifiedBalances, setIsSimplifiedBalances] = useState(true);
  const [expandedExpenseIds, setExpandedExpenseIds] = useState<Set<string>>(
    new Set(initialExpenseId ? [initialExpenseId] : [])
  );
  const [expandedPaymentIds, setExpandedPaymentIds] = useState<Set<string>>(new Set());
  const [openMenuExpenseId, setOpenMenuExpenseId] = useState<string | null>(null);

  const [selectedPairwiseForDetail, setSelectedPairwiseForDetail] = useState<PairwiseBalance | null>(null);
  const [selectedMemberForDetail, setSelectedMemberForDetail] = useState<Profile | null>(null);
  const [isEditGroupModalOpen, setIsEditGroupModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeletingGroup, setIsDeletingGroup] = useState(false);

  const [expenseToDelete, setExpenseToDelete] = useState<string | null>(null);
  const [paymentToDelete, setPaymentToDelete] = useState<string | null>(null);
  const [isDeletingExpense, setIsDeletingExpense] = useState(false);
  const [isDeletingPayment, setIsDeletingPayment] = useState(false);
  const [selectedProofUrl, setSelectedProofUrl] = useState<string | null>(null);

  const menuRef = useRef<HTMLDivElement | null>(null);

  // Close card menu on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpenMenuExpenseId(null);
      }
    }
    if (openMenuExpenseId) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [openMenuExpenseId]);

  const toggleExpenseExpand = (id: string) => {
    setExpandedExpenseIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const togglePaymentExpand = (id: string) => {
    setExpandedPaymentIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const isOwner = Boolean(currentProfile?.id && group.owner_id === currentProfile.id);
  const groupExpenses = expenses.filter((e) => e.group_id === group.id);
  const groupPayments = payments.filter((p) => p.group_id === group.id);

  const activeFiltersCount =
    (filters.datePreset !== 'all' ? 1 : 0) +
    (filters.category !== 'all' ? 1 : 0) +
    (filters.scope === 'mine' ? 1 : 0) +
    (filters.dateMode !== 'expense_date' ? 1 : 0) +
    (filters.customStartDate || filters.customEndDate ? 1 : 0);

  const groupCategories = useMemo(() => {
    return Array.from(new Set(groupExpenses.map((e) => e.category || 'Varios'))).filter(Boolean);
  }, [groupExpenses]);

  const groupAvailableMonths = useMemo(() => {
    return getAvailableTransactionMonths([...groupExpenses, ...groupPayments], filters.dateMode);
  }, [groupExpenses, groupPayments, filters.dateMode]);

  const groupMembers = members.filter((m) => m.group_id === group.id);
  const memberProfiles = groupMembers
    .map((m) => profiles.find((p) => p.id === m.user_id))
    .filter((p): p is NonNullable<typeof p> => p !== undefined);

  // Balances
  const simplifiedGroupPairwise = calculateSimplifiedBalances(expenses, payments, profiles, group.id);
  const directGroupPairwise = calculateDirectBalances(expenses, payments, profiles, group.id);
  const groupPairwise = isSimplifiedBalances ? simplifiedGroupPairwise : directGroupPairwise;

  const groupUserSummaries = useMemo(() => {
    return calculateUserSummaries(expenses, payments, profiles, group.id);
  }, [expenses, payments, profiles, group.id]);

  const mySummary = groupUserSummaries.find((s) => s.user.id === currentProfile?.id);
  const myNetBalance = mySummary ? mySummary.netBalance : 0;
  const effectiveCurrency = group.currency ?? currentProfile?.currency ?? 'COP';

  // Filtered transactions
  const filteredExpenses = groupExpenses.filter((exp) => {
    const paidBy = profiles.find((p) => p.id === exp.paid_by);
    const matchesSearch =
      !filters.searchTerm.trim() ||
      (exp.description ? exp.description.toLowerCase() : '').includes(filters.searchTerm.toLowerCase()) ||
      (paidBy && paidBy.full_name ? paidBy.full_name.toLowerCase().includes(filters.searchTerm.toLowerCase()) : false);

    if (!matchesSearch) return false;
    if (filters.category !== 'all' && (exp.category || 'Varios') !== filters.category) return false;

    if (filters.scope === 'mine') {
      const isPayer = exp.paid_by === currentProfile?.id;
      const isParticipant = Boolean(exp.splits?.some((s) => s.user_id === currentProfile?.id && s.amount_owed > 0));
      if (!isPayer && !isParticipant) return false;
    }

    const { dateObj } = getEffectiveTransactionDate(exp, filters.dateMode);
    return isDateMatchingFilter(dateObj, filters.datePreset, {
      start: filters.customStartDate,
      end: filters.customEndDate,
    });
  });

  const filteredPayments = groupPayments.filter((p) => {
    const payer = profiles.find((prof) => prof.id === p.paid_by);
    const receiver = profiles.find((prof) => prof.id === p.paid_to);
    const matchesSearch =
      !filters.searchTerm.trim() ||
      (p.note ? p.note.toLowerCase() : '').includes(filters.searchTerm.toLowerCase()) ||
      (payer && payer.full_name ? payer.full_name.toLowerCase().includes(filters.searchTerm.toLowerCase()) : false) ||
      (receiver && receiver.full_name ? receiver.full_name.toLowerCase().includes(filters.searchTerm.toLowerCase()) : false);

    if (!matchesSearch) return false;

    if (filters.scope === 'mine') {
      const isInteracted = p.paid_by === currentProfile?.id || p.paid_to === currentProfile?.id;
      if (!isInteracted) return false;
    }

    const { dateObj } = getEffectiveTransactionDate(p, filters.dateMode);
    return isDateMatchingFilter(dateObj, filters.datePreset, {
      start: filters.customStartDate,
      end: filters.customEndDate,
    });
  });

  // Combine and sort chronologically
  const transactions: UnifiedTransaction[] = [
    ...filteredExpenses.map((e) => {
      const eff = getEffectiveTransactionDate(e, filters.dateMode);
      return {
        type: 'expense' as const,
        dateObj: eff.dateObj,
        data: e,
      };
    }),
    ...filteredPayments.map((p) => {
      const eff = getEffectiveTransactionDate(p, filters.dateMode);
      return {
        type: 'payment' as const,
        dateObj: eff.dateObj,
        data: p,
      };
    }),
  ].sort((a, b) => b.dateObj.getTime() - a.dateObj.getTime());

  // Group transactions by month
  const groupedByMonth: { key: string; label: string; items: UnifiedTransaction[] }[] = [];
  transactions.forEach((tx) => {
    const parsed = parseTxDate(tx.dateObj);
    let existing = groupedByMonth.find((g) => g.key === parsed.key);
    if (!existing) {
      existing = { key: parsed.key, label: parsed.monthLabel, items: [] };
      groupedByMonth.push(existing);
    }
    existing.items.push(tx);
  });

  const handleDeleteGroup = async () => {
    setIsDeletingGroup(true);
    try {
      await deleteGroup(group.id);
      setIsDeleteModalOpen(false);
      onBack();
    } finally {
      setIsDeletingGroup(false);
    }
  };

  const handleConfirmDeleteExpense = async () => {
    if (!expenseToDelete) return;
    setIsDeletingExpense(true);
    try {
      await deleteExpense(expenseToDelete);
      setExpenseToDelete(null);
    } finally {
      setIsDeletingExpense(false);
    }
  };

  const handleConfirmDeletePayment = async () => {
    if (!paymentToDelete) return;
    setIsDeletingPayment(true);
    try {
      if (onDeletePayment) {
        await onDeletePayment(paymentToDelete);
      } else {
        await deletePayment(paymentToDelete);
      }
      setPaymentToDelete(null);
    } finally {
      setIsDeletingPayment(false);
    }
  };

  // Activity calculation
  const groupAuditLogs = (auditLogs ?? []).filter((a) => a.group_id === group.id);
  const sortedGroupAuditLogs = [...groupAuditLogs].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  const groupImageUrl = getGroupImage(group);

  return (
    <div className="w-full max-w-4xl mx-auto space-y-3 font-sans pb-16">
      {/* 1. Header: Group avatar, title, members count and right chevron */}
      <div className="flex items-center justify-between py-1 px-1">
        <div className="flex items-center space-x-3 min-w-0">
          <div className="w-12 h-12 rounded-2xl overflow-hidden relative shadow-2xs border border-zinc-100 shrink-0 bg-gradient-to-br from-amber-100 via-orange-100 to-amber-200 flex items-center justify-center">
            {group.image_url ? (
              <Image
                src={groupImageUrl}
                alt={group.name}
                fill
                className="object-cover"
                unoptimized
                referrerPolicy="no-referrer"
              />
            ) : (
              <span className="font-bold text-base text-amber-800 tracking-tight">
                {group.name.slice(0, 2).toUpperCase()}
              </span>
            )}
          </div>

          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-bold text-zinc-900 tracking-tight truncate leading-snug">
              {group.name}
            </h1>
            <p className="text-xs text-zinc-500 font-normal leading-none mt-0.5">
              {memberProfiles.length} {memberProfiles.length === 1 ? 'miembro' : 'miembros'}
            </p>
          </div>
        </div>

        {/* Right chevron to open Group Settings */}
        <button
          onClick={() => setIsSettingsModalOpen(true)}
          className="w-9 h-9 rounded-full hover:bg-zinc-100 flex items-center justify-center text-zinc-400 hover:text-zinc-700 transition cursor-pointer shrink-0"
          title="Opciones del grupo"
          aria-label="Opciones del grupo"
        >
          <ChevronRight className="w-5 h-5 text-zinc-400" />
        </button>
      </div>

      {/* 2. Top Navigation Tabs: Gastos | Balances | Miembros | Actividad */}
      <div className="flex border-b border-zinc-200 justify-between sm:justify-start sm:space-x-8 px-1">
        <button
          onClick={() => setActiveTab('expenses')}
          className={`flex items-center space-x-1.5 pb-2.5 text-sm font-semibold transition-colors cursor-pointer border-b-2 ${
            activeTab === 'expenses'
              ? 'border-emerald-600 text-emerald-700 font-bold'
              : 'border-transparent text-zinc-500 hover:text-zinc-800'
          }`}
        >
          <DollarSign className={`w-4 h-4 ${activeTab === 'expenses' ? 'text-emerald-700 stroke-[2.5]' : 'text-zinc-500'}`} />
          <span>Gastos</span>
        </button>

        <button
          onClick={() => setActiveTab('balances')}
          className={`flex items-center space-x-1.5 pb-2.5 text-sm font-semibold transition-colors cursor-pointer border-b-2 ${
            activeTab === 'balances'
              ? 'border-emerald-600 text-emerald-700 font-bold'
              : 'border-transparent text-zinc-500 hover:text-zinc-800'
          }`}
        >
          <Scale className="w-4 h-4" />
          <span>Balances</span>
        </button>

        <button
          onClick={() => setActiveTab('members')}
          className={`flex items-center space-x-1.5 pb-2.5 text-sm font-semibold transition-colors cursor-pointer border-b-2 ${
            activeTab === 'members'
              ? 'border-emerald-600 text-emerald-700 font-bold'
              : 'border-transparent text-zinc-500 hover:text-zinc-800'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Miembros</span>
        </button>

        <button
          onClick={() => setActiveTab('activity')}
          className={`flex items-center space-x-1.5 pb-2.5 text-sm font-semibold transition-colors cursor-pointer border-b-2 ${
            activeTab === 'activity'
              ? 'border-emerald-600 text-emerald-700 font-bold'
              : 'border-transparent text-zinc-500 hover:text-zinc-800'
          }`}
        >
          <Activity className="w-4 h-4" />
          <span>Actividad</span>
        </button>
      </div>

      {/* 3. TAB 1: GASTOS (Exact reproduction of uploaded reference image) */}
      {activeTab === 'expenses' && (
        <div className="space-y-3.5 pt-1">
          {/* Row 1: Dominant Search Bar + Filter Button [ 🎚️ ] */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={filters.searchTerm}
                onChange={(e) => handleFilterChange({ searchTerm: e.target.value })}
                placeholder="Buscar gastos"
                className="w-full h-11 pl-10 pr-9 bg-white border border-zinc-200/90 rounded-xl text-sm text-zinc-800 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-300 focus:ring-1 focus:ring-emerald-500/20 shadow-2xs transition"
              />
              {filters.searchTerm && (
                <button
                  type="button"
                  onClick={() => handleFilterChange({ searchTerm: '' })}
                  className="p-1 text-zinc-400 hover:text-zinc-600 absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer"
                  aria-label="Borrar búsqueda"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => setIsFiltersOpen(true)}
              className={`relative h-11 w-11 rounded-xl border transition flex items-center justify-center cursor-pointer shadow-2xs shrink-0 ${
                activeFiltersCount > 0
                  ? 'border-zinc-300 bg-white text-zinc-900'
                  : 'border-zinc-200/90 bg-white text-zinc-700 hover:bg-zinc-50'
              }`}
              aria-label="Abrir filtros"
              title="Filtros"
            >
              <SlidersHorizontal className="w-4 h-4 text-zinc-700 rotate-90" />
              {activeFiltersCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4.5 h-4.5 rounded-full bg-emerald-600 text-white text-[10px] font-bold flex items-center justify-center shadow-xs">
                  {activeFiltersCount}
                </span>
              )}
            </button>
          </div>

          {/* Row 2: Balance Status & Action Buttons (Saldar + Nuevo gasto) */}
          <div className="flex items-center justify-between gap-3 pt-1 pb-1 px-0.5">
            <div className="flex flex-col justify-center">
              <p className="text-xs sm:text-[13px] font-semibold text-zinc-500 leading-tight">
                {myNetBalance > 0.01
                  ? 'Tú recuperas'
                  : myNetBalance < -0.01
                  ? 'Tú debes'
                  : 'Estás al día'}
              </p>
              <p
                className={`text-2xl sm:text-[28px] font-extrabold tracking-tight leading-tight mt-0.5 ${
                  myNetBalance > 0.01
                    ? 'text-emerald-600'
                    : myNetBalance < -0.01
                    ? 'text-rose-600'
                    : 'text-zinc-800'
                }`}
              >
                {formatCurrency(Math.abs(myNetBalance), effectiveCurrency)}
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => onOpenSettleModal(group.id)}
                className="h-10 px-3.5 bg-white hover:bg-zinc-50 text-zinc-800 border border-zinc-200/90 rounded-xl font-semibold text-xs sm:text-sm flex items-center gap-1.5 transition active:scale-[0.98] shadow-2xs cursor-pointer"
              >
                <Wallet className="w-4 h-4 text-zinc-700" />
                <span>Saldar</span>
              </button>

              <button
                type="button"
                onClick={() => onOpenNewExpense(group.id)}
                className="h-10 px-4 bg-[#c25737] hover:bg-[#b04d30] text-white rounded-xl font-semibold text-xs sm:text-sm flex items-center gap-1.5 transition active:scale-[0.98] shadow-xs cursor-pointer"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
                <span>Nuevo gasto</span>
              </button>
            </div>
          </div>

          {/* Empty state */}
          {transactions.length === 0 && (
            <div className="bg-white rounded-2xl border border-zinc-200/80 p-10 text-center text-zinc-500 shadow-2xs space-y-2">
              <Receipt className="w-10 h-10 text-zinc-300 mx-auto" />
              <h3 className="font-semibold text-zinc-900 text-sm">No hay gastos</h3>
              <p className="text-xs text-zinc-500">
                {filters.searchTerm
                  ? 'No se encontraron gastos para tu búsqueda.'
                  : 'Aún no se han registrado gastos en este grupo.'}
              </p>
            </div>
          )}

          {/* Month Grouped Transaction List */}
          {groupedByMonth.map((mGroup) => (
            <div key={mGroup.key} className="space-y-1.5 pt-1">
              <div className="flex items-center space-x-2.5 px-1 py-0.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 bg-zinc-100 px-2.5 py-0.5 rounded-full border border-zinc-200/80 flex items-center space-x-1.5">
                  <Calendar className="w-3 h-3 text-zinc-500" />
                  <span>{mGroup.label}</span>
                </span>
                <div className="h-px bg-zinc-200/70 flex-1" />
              </div>

              <div className="space-y-2">
                {mGroup.items.map((tx) => {
                  const parsed = parseTxDate(tx.dateObj);

                  if (tx.type === 'expense') {
                    const exp = tx.data;
                    const paidBy = profiles.find((p) => p.id === exp.paid_by);
                    const createdBy = profiles.find((p) => p.id === exp.created_by);
                    const isExpanded = expandedExpenseIds.has(exp.id);
                    const catConfig = getCategoryConfig(exp.category);
                    const CategoryIcon = catConfig.icon;
                    const currency = group.currency || 'COP';

                    const isPayer = currentProfile?.id === exp.paid_by;
                    const mySplit = exp.splits?.find((s) => s.user_id === currentProfile?.id);
                    const myOwed = mySplit ? mySplit.amount_owed : 0;
                    const recovers = isPayer ? Math.max(0, exp.total_amount - myOwed) : 0;

                    let badgeText = '';
                    let badgeColorClass = 'text-zinc-400';

                    if (isPayer) {
                      if (recovers > 0) {
                        badgeText = `recuperas ${formatCurrency(recovers, currency)}`;
                        badgeColorClass = 'text-emerald-600 font-semibold';
                      } else {
                        badgeText = 'pagaste todo';
                        badgeColorClass = 'text-emerald-600 font-semibold';
                      }
                    } else if (myOwed > 0) {
                      badgeText = `debes ${formatCurrency(myOwed, currency)}`;
                      badgeColorClass = 'text-[#c25a3a] font-semibold';
                    } else {
                      badgeText = 'no participas';
                      badgeColorClass = 'text-zinc-400';
                    }

                    // Participants list for expanded distribution
                    const participants = (exp.splits || []).map((s) => {
                      const pProf = profiles.find((p) => p.id === s.user_id);
                      const isUserPayer = s.user_id === exp.paid_by;
                      const isMe = s.user_id === currentProfile?.id;
                      const baseName = pProf?.full_name || 'Integrante';
                      const displayName = isMe ? `${baseName} (tú)` : baseName;
                      const initial = baseName.trim().charAt(0).toUpperCase();

                      return {
                        id: s.user_id,
                        profile: pProf,
                        name: displayName,
                        initial,
                        amount: s.amount_owed,
                        isPayer: isUserPayer,
                        badgeType: isUserPayer ? ('aportó' as const) : s.amount_owed > 0 ? ('debe' as const) : null,
                      };
                    });

                    // Itemized breakdown if present
                    const items = (() => {
                      if (exp.items && exp.items.length > 0) {
                        return exp.items.map((it) => ({
                          description: it.description,
                          amount: it.amount,
                        }));
                      }
                      if (exp.split_config?.items && Array.isArray(exp.split_config.items) && exp.split_config.items.length > 0) {
                        return exp.split_config.items.map((it) => {
                          const qty = parseFloat(it.quantity) || 1;
                          const amt = parseFloat(it.amount) || 0;
                          const total = it.amountType === 'each' ? qty * amt : amt;
                          const desc = it.quantity && it.quantity !== '1' ? `${it.quantity} ${it.desc}` : it.desc;
                          return {
                            description: desc || 'Artículo',
                            amount: total,
                          };
                        });
                      }
                      return [];
                    })();

                    return (
                      <div
                        id={`expense-${exp.id}`}
                        key={`exp-${exp.id}`}
                        className="bg-white rounded-2xl border border-zinc-200/90 shadow-2xs overflow-hidden transition-all"
                      >
                        {/* Collapsed/Header Row */}
                        <div
                          onClick={() => toggleExpenseExpand(exp.id)}
                          className="p-2.5 sm:p-3 flex items-center justify-between gap-2.5 cursor-pointer select-none hover:bg-zinc-50/50 transition-colors"
                        >
                          <div className="flex items-center space-x-2.5 min-w-0 flex-1">
                            {/* Date Box: Day on top, month below */}
                            <div className="w-8 text-center shrink-0 flex flex-col items-center justify-center">
                              <span className="text-sm sm:text-base font-bold text-zinc-900 leading-none">
                                {parsed.dayStr}
                              </span>
                              <span className="text-[9px] sm:text-[10px] font-semibold uppercase text-zinc-400 leading-none mt-1">
                                {parsed.monthAbbr}
                              </span>
                            </div>

                            {/* Category Icon Box (Soft pastel background) */}
                            <div
                              className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0 shadow-2xs ${catConfig.bgClass} ${catConfig.textClass}`}
                            >
                              <CategoryIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                            </div>

                            {/* Description & Payer */}
                            <div className="min-w-0 flex-1">
                              <h3 className="text-sm font-semibold text-zinc-900 truncate leading-snug">
                                {exp.description}
                              </h3>
                              <p className="text-xs text-zinc-500 truncate mt-0.5 leading-none">
                                Pagó {paidBy ? paidBy.full_name : 'Alguien'}
                              </p>
                            </div>
                          </div>

                          {/* Right side: Amount & Personal Status & Chevron */}
                          <div className="flex items-center gap-2 shrink-0">
                            <div className="text-right">
                              <div className="text-sm sm:text-base font-bold text-zinc-900 leading-tight">
                                {formatCurrency(exp.total_amount, currency)}
                              </div>
                              <div className={`text-xs mt-0.5 leading-none ${badgeColorClass}`}>
                                {badgeText}
                              </div>
                            </div>

                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4 text-zinc-400 shrink-0" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-zinc-400 shrink-0" />
                            )}
                          </div>
                        </div>

                        {/* Expanded Content Section */}
                        {isExpanded && (() => {
                          const entryInfo = getRecordEntryDateInfo(exp);
                          const isEdited = entryInfo.isUpdated || Boolean(exp.updated_by && exp.updated_by !== exp.created_by);
                          const updatedByProfile = exp.updated_by ? profiles.find((p) => p.id === exp.updated_by) : null;
                          const actionUser = isEdited ? (updatedByProfile || createdBy) : createdBy;
                          const actionUserName = actionUser?.full_name?.split(' ')[0] || actionUser?.full_name || 'Luis';

                          return (
                          <div className="border-t border-zinc-100 bg-white">
                            {/* Metadata Row */}
                            <div className="px-3.5 sm:px-4 py-2 flex items-center justify-between text-xs text-zinc-500">
                              <div className="space-y-1">
                                <div className="flex items-center gap-2 whitespace-nowrap">
                                  <span className="w-20 sm:w-24 shrink-0 text-zinc-600 font-normal">
                                    {formatShortDateWithTime(exp.expense_date, exp.expense_time)}
                                  </span>
                                  <div className="flex items-center gap-1.5 text-zinc-500">
                                    <Calendar className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                                    <span>Fecha del gasto</span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 whitespace-nowrap">
                                  <span className="w-20 sm:w-24 shrink-0 text-zinc-600 font-normal">
                                    {formatShortDateWithTime(entryInfo.timestamp)}
                                  </span>
                                  <div className="flex items-center gap-1.5 text-zinc-500">
                                    <Pencil className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                                    <span>
                                      {isEdited ? `Actualizado por ${actionUserName}` : `Registrado por ${actionUserName}`}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              {/* More Options Dropdown button */}
                              <div className="relative" ref={openMenuExpenseId === exp.id ? menuRef : undefined}>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setOpenMenuExpenseId(openMenuExpenseId === exp.id ? null : exp.id);
                                  }}
                                  className="w-8 h-8 rounded-full hover:bg-zinc-100 flex items-center justify-center text-zinc-400 hover:text-zinc-700 transition cursor-pointer"
                                  title="Opciones del gasto"
                                  aria-label="Opciones del gasto"
                                >
                                  <MoreHorizontal className="w-4 h-4" />
                                </button>

                                {openMenuExpenseId === exp.id && (
                                  <div className="absolute right-0 top-9 w-44 bg-white rounded-xl shadow-lg border border-zinc-200/90 py-1 z-30 divide-y divide-zinc-100 text-xs">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setOpenMenuExpenseId(null);
                                        onEditExpense?.(exp);
                                      }}
                                      className="w-full px-3 py-2 text-left text-zinc-700 hover:bg-zinc-50 flex items-center gap-2 cursor-pointer font-medium"
                                    >
                                      <Pencil className="w-3.5 h-3.5 text-zinc-500" />
                                      <span>Editar gasto</span>
                                    </button>

                                    {exp.receipt_url && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setOpenMenuExpenseId(null);
                                          setSelectedProofUrl(exp.receipt_url || null);
                                        }}
                                        className="w-full px-3 py-2 text-left text-zinc-700 hover:bg-zinc-50 flex items-center gap-2 cursor-pointer font-medium"
                                      >
                                        <ExternalLink className="w-3.5 h-3.5 text-zinc-500" />
                                        <span>Ver comprobante</span>
                                      </button>
                                    )}

                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setOpenMenuExpenseId(null);
                                        setExpenseToDelete(exp.id);
                                      }}
                                      className="w-full px-3 py-2 text-left text-rose-600 hover:bg-rose-50 flex items-center gap-2 cursor-pointer font-medium"
                                    >
                                      <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                                      <span>Eliminar gasto</span>
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Divider */}
                            <div className="border-t border-zinc-100" />

                            {/* Section: Distribución entre participantes */}
                            <div className="px-3.5 sm:px-4 pt-2.5 pb-1.5 flex items-center gap-1.5 text-xs font-semibold text-zinc-500">
                              <Share2 className="w-3.5 h-3.5 text-zinc-400" />
                              <span>Distribución entre participantes</span>
                            </div>

                            <div className="px-3.5 sm:px-4 pb-2.5 space-y-2">
                              {participants.map((part) => (
                                <div
                                  key={part.id}
                                  className="flex items-center justify-between text-sm py-0.5"
                                >
                                  <div className="flex items-center space-x-2.5 min-w-0">
                                    <UserAvatar
                                      profile={part.profile}
                                      name={part.name}
                                      badge={part.badgeType as AvatarBadge}
                                      size="sm"
                                    />

                                    <span className="font-medium text-zinc-800 truncate text-xs sm:text-sm">
                                      {part.name}
                                    </span>
                                  </div>

                                  <span className="font-semibold text-zinc-800 text-xs sm:text-sm shrink-0">
                                    {formatCurrency(part.amount, currency)}
                                  </span>
                                </div>
                              ))}
                            </div>

                            {/* Section: Desglose de artículos (if items exist) */}
                            {items.length > 0 && (
                              <>
                                <div className="border-t border-zinc-100" />
                                <div className="px-3.5 sm:px-4 pt-2.5 pb-1.5 flex items-center gap-1.5 text-xs font-semibold text-zinc-500">
                                  <List className="w-3.5 h-3.5 text-zinc-400" />
                                  <span>Desglose de artículos</span>
                                </div>
                                <div className="px-3.5 sm:px-4 pb-2.5 space-y-1.5">
                                  {items.map((it, idx) => (
                                    <div key={idx} className="flex items-center justify-between text-xs sm:text-sm py-0.5">
                                      <span className="font-medium text-zinc-800 truncate mr-2">{it.description}</span>
                                      <span className="font-semibold text-zinc-800 shrink-0">
                                        {formatCurrency(it.amount, currency)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </>
                            )}

                            {/* Optional: Notes if present */}
                            {(() => {
                              const cleanUserNote = extractNotesAndConfig(exp.notes).userNote;
                              if (!cleanUserNote) return null;
                              return (
                                <>
                                  <div className="border-t border-zinc-100" />
                                  <div className="px-3.5 sm:px-4 py-2 text-xs text-zinc-500">
                                    <span className="font-semibold text-zinc-600 mr-1">Notas:</span>
                                    <span>{cleanUserNote}</span>
                                  </div>
                                </>
                              );
                            })()}
                          </div>
                          );
                        })()}
                      </div>
                    );
                  }

                  // tx.type === 'payment'
                  const pay = tx.data;
                  const payer = profiles.find((p) => p.id === pay.paid_by);
                  const receiver = profiles.find((p) => p.id === pay.paid_to);
                  const isExpanded = expandedPaymentIds.has(pay.id);
                  const currency = group.currency || 'COP';

                  return (
                    <div
                      key={`pay-${pay.id}`}
                      className="bg-white rounded-2xl border border-zinc-200/90 shadow-2xs overflow-hidden transition-all"
                    >
                      <div
                        onClick={() => togglePaymentExpand(pay.id)}
                        className="p-2.5 sm:p-3 flex items-center justify-between gap-2.5 cursor-pointer select-none hover:bg-zinc-50/50 transition-colors"
                      >
                        <div className="flex items-center space-x-2.5 min-w-0 flex-1">
                          <div className="w-8 text-center shrink-0 flex flex-col items-center justify-center">
                            <span className="text-sm sm:text-base font-bold text-zinc-900 leading-none">
                              {parsed.dayStr}
                            </span>
                            <span className="text-[9px] sm:text-[10px] font-semibold uppercase text-zinc-400 leading-none mt-1">
                              {parsed.monthAbbr}
                            </span>
                          </div>

                          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0 shadow-2xs bg-emerald-50 text-emerald-700">
                            <HandCoins className="w-4 h-4 sm:w-5 sm:h-5" />
                          </div>

                          <div className="min-w-0 flex-1">
                            <h3 className="text-sm font-semibold text-zinc-900 truncate leading-snug">
                              Pago a {receiver ? receiver.full_name : 'Integrante'}
                            </h3>
                            <p className="text-xs text-zinc-500 truncate mt-0.5 leading-none">
                              Saldado por {payer ? payer.full_name : 'Integrante'}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <div className="text-right">
                            <div className="text-sm sm:text-base font-bold text-zinc-900 leading-tight">
                              {formatCurrency(pay.amount, currency)}
                            </div>
                            <div className="text-xs font-semibold text-emerald-600 mt-0.5 leading-none">
                              saldado
                            </div>
                          </div>

                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4 text-zinc-400 shrink-0" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-zinc-400 shrink-0" />
                          )}
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="border-t border-zinc-100 bg-white p-4 space-y-2.5 text-xs text-zinc-600">
                          <div className="flex items-center justify-between">
                            <span>
                              <strong>{payer?.full_name || 'Alguien'}</strong> pagó{' '}
                              <strong>{formatCurrency(pay.amount, currency)}</strong> a{' '}
                              <strong>{receiver?.full_name || 'Alguien'}</strong>
                            </span>
                            <div className="flex items-center gap-2">
                              {onEditPayment && (
                                <button
                                  type="button"
                                  onClick={() => onEditPayment(pay)}
                                  className="text-zinc-600 hover:text-zinc-900 font-medium cursor-pointer"
                                >
                                  Editar
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => setPaymentToDelete(pay.id)}
                                className="text-rose-600 hover:text-rose-700 font-medium cursor-pointer"
                              >
                                Eliminar
                              </button>
                            </div>
                          </div>
                          {pay.note && <p className="text-zinc-500">Nota: {pay.note}</p>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 4. TAB 2: BALANCES */}
      {activeTab === 'balances' && (
        <div className="space-y-4 pt-1">
          {/* Non-invasive mode switcher */}
          <div className="flex items-center justify-between px-1 py-1">
            <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
              {isSimplifiedBalances ? 'Deudas simplificadas' : 'Deudas directas'}
            </span>

            <div className="inline-flex items-center p-0.5 bg-zinc-100 rounded-xl border border-zinc-200 shrink-0">
              <button
                type="button"
                onClick={() => setIsSimplifiedBalances(true)}
                className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  isSimplifiedBalances ? 'bg-white text-zinc-900 shadow-2xs' : 'text-zinc-500 hover:text-zinc-800'
                }`}
              >
                <Sparkles className={`w-3 h-3 ${isSimplifiedBalances ? 'text-emerald-600' : 'text-zinc-400'}`} />
                <span>Simplificado</span>
                <span className="text-[10px] opacity-60">({simplifiedGroupPairwise.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setIsSimplifiedBalances(false)}
                className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  !isSimplifiedBalances ? 'bg-white text-zinc-900 shadow-2xs' : 'text-zinc-500 hover:text-zinc-800'
                }`}
              >
                <Layers className={`w-3 h-3 ${!isSimplifiedBalances ? 'text-zinc-900' : 'text-zinc-400'}`} />
                <span>Directo</span>
                <span className="text-[10px] opacity-60">({directGroupPairwise.length})</span>
              </button>
            </div>
          </div>

          {groupPairwise.length === 0 ? (
            <div className="bg-white rounded-2xl p-10 border border-zinc-200/80 text-center space-y-2 shadow-2xs">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <h4 className="font-bold text-zinc-900 text-sm">¡Todas las cuentas están al día!</h4>
              <p className="text-zinc-500 text-xs">No hay deudas pendientes entre los integrantes de este grupo.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {groupPairwise.map((p, idx) => {
                const isMyDebt = p.debtor.id === currentProfile?.id;
                const isOwedToMe = p.creditor.id === currentProfile?.id;
                const debtorName = p.debtor.full_name || 'Integrante';
                const creditorName = p.creditor.full_name || 'Integrante';

                return (
                  <div
                    key={idx}
                    onClick={() => setSelectedPairwiseForDetail(p)}
                    className={`bg-white rounded-2xl border shadow-2xs p-4 flex items-center justify-between gap-3 cursor-pointer hover:border-zinc-300 transition-all ${
                      isOwedToMe ? 'border-emerald-200' : isMyDebt ? 'border-rose-200' : 'border-zinc-200/80'
                    }`}
                  >
                    <div className="flex items-center space-x-3 min-w-0">
                      <div className="flex items-center -space-x-2 shrink-0">
                        <UserAvatar
                          profile={p.debtor}
                          name={debtorName}
                          size="md"
                          className="ring-2 ring-white rounded-full"
                        />
                        <UserAvatar
                          profile={p.creditor}
                          name={creditorName}
                          size="md"
                          className="ring-2 ring-white rounded-full"
                        />
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center space-x-1.5 text-sm font-semibold text-zinc-900 truncate">
                          <span className={isMyDebt ? 'text-[#c25a3a] font-bold' : ''}>{debtorName}</span>
                          <ArrowRight className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                          <span className={isOwedToMe ? 'text-emerald-700 font-bold' : ''}>{creditorName}</span>
                        </div>
                        <div className="text-xs font-bold text-zinc-900 mt-0.5">
                          {formatCurrency(p.amount, effectiveCurrency)}
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenSettleModal(group.id, p.debtor.id, p.creditor.id, p.amount);
                      }}
                      className="h-9 px-4 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-semibold shadow-2xs cursor-pointer transition active:scale-95 shrink-0"
                    >
                      Saldar
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 5. TAB 3: MIEMBROS */}
      {activeTab === 'members' && (
        <div className="space-y-4 pt-1">
          <div className="flex items-center justify-between gap-3 px-1">
            <h3 className="font-semibold text-zinc-900 text-base">
              Integrantes ({memberProfiles.length})
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onOpenInviteLink(group.id)}
                className="h-9 px-3 bg-white hover:bg-zinc-50 border border-zinc-200 text-zinc-800 rounded-xl text-xs font-semibold shadow-2xs transition active:scale-95 cursor-pointer flex items-center gap-1.5"
              >
                <LinkIcon className="w-3.5 h-3.5 text-emerald-600" />
                <span>Invitar</span>
              </button>
              <button
                onClick={() => onOpenAddMember(group.id)}
                className="h-9 px-3 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-semibold shadow-2xs transition active:scale-95 cursor-pointer flex items-center gap-1.5"
              >
                <UserPlus className="w-3.5 h-3.5 text-emerald-400" />
                <span>Añadir</span>
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {memberProfiles.map((p) => {
              const memberRecord = groupMembers.find((m) => m.user_id === p.id);
              const isGroupOwner = memberRecord?.role === 'owner';

              return (
                <div
                  key={p.id}
                  onClick={() => setSelectedMemberForDetail(p)}
                  className="bg-white hover:bg-zinc-50 rounded-2xl p-3.5 border border-zinc-200/80 flex items-center justify-between shadow-2xs cursor-pointer transition"
                >
                  <div className="flex items-center space-x-3 overflow-hidden">
                    <UserAvatar
                      profile={p}
                      name={p.full_name}
                      size="lg"
                      className="shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center space-x-2">
                        <h4 className="font-semibold text-zinc-900 text-sm truncate">{p.full_name}</h4>
                        {isGroupOwner && (
                          <span className="bg-amber-100 text-amber-800 text-[9px] font-bold uppercase px-1.5 py-0.2 rounded-md">
                            Admin
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-zinc-500 truncate mt-0.5">{formatDisplayEmail(p.email)}</p>
                    </div>
                  </div>

                  <ChevronRight className="w-4 h-4 text-zinc-400 shrink-0" />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 6. TAB 4: ACTIVIDAD */}
      {activeTab === 'activity' && (
        <div className="space-y-3 pt-1">
          {sortedGroupAuditLogs.length === 0 ? (
            <div className="bg-white rounded-2xl border border-zinc-200 p-10 text-center text-zinc-500 shadow-2xs space-y-2">
              <Activity className="w-10 h-10 text-zinc-300 mx-auto" />
              <h3 className="font-semibold text-zinc-900 text-sm">Sin actividad</h3>
              <p className="text-xs text-zinc-500">Aún no hay registros de movimientos en este grupo.</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-2xs divide-y divide-zinc-100 overflow-hidden">
              {sortedGroupAuditLogs.map((log) => {
                const user = profiles.find((p) => p.id === log.user_id);
                const userName = user?.full_name ?? 'Usuario';
                const associatedExpense = groupExpenses.find((e) => e.id === log.expense_id);
                const expenseTitle = associatedExpense?.description || log.changes?.description || 'Gasto';
                const expenseAmount = associatedExpense?.total_amount ?? log.changes?.total_amount;
                const isClickable = Boolean(associatedExpense);

                return (
                  <div
                    key={log.id}
                    onClick={() => {
                      if (associatedExpense) {
                        setActiveTab('expenses');
                        setExpandedExpenseIds((prev) => {
                          const next = new Set(prev);
                          next.add(associatedExpense.id);
                          return next;
                        });
                        setTimeout(() => {
                          const el = document.getElementById(`expense-${associatedExpense.id}`);
                          if (el) {
                            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                          }
                        }, 100);
                      }
                    }}
                    className={`p-3.5 sm:p-4 flex items-start justify-between gap-3 transition ${
                      isClickable ? 'cursor-pointer hover:bg-zinc-50/80 active:bg-zinc-100/70' : ''
                    }`}
                  >
                    <div className="flex items-start space-x-3 min-w-0 flex-1">
                      <UserAvatar
                        profile={user}
                        name={userName}
                        size="md"
                        className="mt-0.5 shrink-0"
                      />
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="text-xs sm:text-sm text-zinc-800 leading-snug">
                          <strong className="font-semibold text-zinc-900">{userName}</strong>{' '}
                          {log.action === 'create' && (
                            <span className="text-zinc-600">
                              agregó el gasto <strong className="text-zinc-900 font-semibold">&ldquo;{expenseTitle}&rdquo;</strong>
                            </span>
                          )}
                          {log.action === 'update' && (
                            <span className="text-zinc-600">
                              editó el gasto <strong className="text-zinc-900 font-semibold">&ldquo;{expenseTitle}&rdquo;</strong>
                            </span>
                          )}
                          {log.action === 'delete' && (
                            <span className="text-zinc-600">
                              eliminó el gasto <strong className="text-zinc-900 font-semibold">&ldquo;{expenseTitle}&rdquo;</strong>
                            </span>
                          )}
                        </p>

                        <div className="flex items-center gap-2 flex-wrap text-xs pt-0.5">
                          {expenseAmount !== undefined && expenseAmount !== null && (
                            <span className="font-bold text-zinc-900 bg-zinc-100 px-2 py-0.5 rounded-md text-[11px]">
                              {formatCurrency(expenseAmount, effectiveCurrency)}
                            </span>
                          )}
                          {associatedExpense?.category && (
                            <span className="text-zinc-500 bg-zinc-50 border border-zinc-200/60 px-2 py-0.5 rounded-md text-[11px]">
                              {associatedExpense.category}
                            </span>
                          )}
                          {log.changes && log.action === 'update' && (
                            <span className="text-[11px] text-zinc-500">
                              {Object.keys(log.changes).length} cambio(s)
                            </span>
                          )}
                        </div>

                        <p className="text-[10px] text-zinc-400 flex items-center gap-1 pt-0.5">
                          <Clock className="w-2.5 h-2.5" />
                          <span>{formatActivityDateTime(log.created_at)}</span>
                        </p>
                      </div>
                    </div>

                    {isClickable && (
                      <div className="shrink-0 text-zinc-400 self-center pl-1">
                        <ChevronRight className="w-4 h-4 text-zinc-400" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Filter Bottom Sheet */}
      <GroupExpenseFilterSheet
        isOpen={isFiltersOpen}
        onClose={() => setIsFiltersOpen(false)}
        filters={filters}
        onApplyFilters={(newFilters) => setFilters(newFilters)}
        availableMonths={groupAvailableMonths}
        categories={groupCategories}
      />

      {/* Group Settings Modal (opened via header chevron) */}
      <GroupSettingsModal
        isOpen={isSettingsModalOpen}
        canEdit={isOwner}
        onClose={() => setIsSettingsModalOpen(false)}
        onEditGroup={() => {
          setIsSettingsModalOpen(false);
          setIsEditGroupModalOpen(true);
        }}
        onAddMembers={() => {
          setIsSettingsModalOpen(false);
          onOpenAddMember(group.id);
        }}
        onInviteLink={() => {
          setIsSettingsModalOpen(false);
          onOpenInviteLink(group.id);
        }}
        onDeleteGroup={() => {
          setIsSettingsModalOpen(false);
          setIsDeleteModalOpen(true);
        }}
      />

      {/* Edit Group Modal */}
      {isEditGroupModalOpen && (
        <EditGroupModal
          isOpen={isEditGroupModalOpen}
          group={group}
          onClose={() => setIsEditGroupModalOpen(false)}
        />
      )}

      {/* Delete Group Confirm Modal */}
      <ConfirmModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={handleDeleteGroup}
        title="¿Eliminar grupo?"
        description="Esta acción no se puede deshacer. Todos los gastos y pagos registrados en este grupo serán eliminados permanentemente."
        confirmText="Sí, eliminar"
        cancelText="Cancelar"
        variant="danger"
        isLoading={isDeletingGroup}
      />

      {/* Delete Expense Confirm Modal */}
      <ConfirmModal
        isOpen={Boolean(expenseToDelete)}
        onClose={() => setExpenseToDelete(null)}
        onConfirm={handleConfirmDeleteExpense}
        title="¿Eliminar gasto?"
        description="Esta acción eliminará el gasto y recalculará los balances del grupo."
        confirmText="Eliminar"
        cancelText="Cancelar"
        variant="danger"
        isLoading={isDeletingExpense}
      />

      {/* Delete Payment Confirm Modal */}
      <ConfirmModal
        isOpen={Boolean(paymentToDelete)}
        onClose={() => setPaymentToDelete(null)}
        onConfirm={handleConfirmDeletePayment}
        title="¿Eliminar pago?"
        description="Esta acción eliminará este registro de pago y restaurará la deuda."
        confirmText="Eliminar"
        cancelText="Cancelar"
        variant="danger"
        isLoading={isDeletingPayment}
      />

      {/* Pairwise Debt Detail Modal */}
      <PairwiseDetailModal
        isOpen={Boolean(selectedPairwiseForDetail)}
        onClose={() => setSelectedPairwiseForDetail(null)}
        pairwise={selectedPairwiseForDetail}
        currentProfile={currentProfile}
        expenses={expenses}
        payments={payments}
        profiles={profiles}
        groups={userGroups}
        isSimplified={isSimplifiedBalances}
        groupId={group.id}
        onOpenSettleModal={(gId, debtorId, creditorId, amount) => {
          onOpenSettleModal(gId || group.id, debtorId, creditorId, amount);
        }}
        onEditPayment={onEditPayment}
      />

      {/* Member Detail Modal */}
      {selectedMemberForDetail && (
        <MemberDetailModal
          isOpen={Boolean(selectedMemberForDetail)}
          memberProfile={selectedMemberForDetail}
          groupId={group.id}
          onClose={() => setSelectedMemberForDetail(null)}
        />
      )}

      {/* Receipt Proof Lightbox / Modal */}
      {selectedProofUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 backdrop-blur-xs"
          onClick={() => setSelectedProofUrl(null)}
        >
          <div
            className="relative max-w-lg w-full bg-white rounded-2xl overflow-hidden p-2 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-2">
              <h4 className="text-sm font-semibold text-zinc-900">Comprobante</h4>
              <button
                type="button"
                onClick={() => setSelectedProofUrl(null)}
                className="p-1 rounded-lg hover:bg-zinc-100 text-zinc-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="relative w-full h-80 sm:h-96 rounded-xl overflow-hidden bg-zinc-100">
              <Image
                src={selectedProofUrl}
                alt="Comprobante"
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
