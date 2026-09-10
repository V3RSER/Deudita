'use client';

import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { useExpense } from '@/lib/expense-context';

import { Expense, ExpenseAuditLog, Group, PairwiseBalance, Payment, Profile } from '@/lib/types';
import {
    calculateDirectBalances,
    calculateSimplifiedBalances,
    calculateUserSummaries,
    formatCurrency,
} from '@/lib/balance-utils';
import {
    ArrowRight,
    CheckCircle2,
    ChevronRight,
    Clock,
    DollarSign,
    History,
    Layers,
    Link as LinkIcon,
    Plus,
    Scale,
    Search,
    Settings,
    SlidersHorizontal,
    Sparkles,
    UserPlus,
    Users,
    Wallet,
    X,
} from 'lucide-react';

import { getGroupImage } from '@/lib/group-utils';
import { formatDisplayEmail } from '@/lib/utils';
import { UserAvatar } from '@/components/UserAvatar';

import { MemberDetailModal } from '@/components/MemberDetailModal';
import { GroupExpenseFilterSheet } from '@/components/groups/GroupExpenseFilterSheet';
import { TransactionFilterState } from '@/components/my-expenses/TransactionFilterBar';
import {
    getAvailableTransactionMonths,
    getEffectiveTransactionDate,
    isDateMatchingFilter,
} from '@/lib/transaction-date-utils';
import { EditGroupModal } from '@/components/groups/EditGroupModal';
import { GroupSettingsModal } from '@/components/groups/GroupSettingsModal';
import { ConfirmModal } from '@/components/ConfirmModal';
import { PairwiseDetailModal } from '@/components/PairwiseDetailModal';
import { GenericExpenseList } from '@/components/GenericExpenseList';

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
}: Readonly<GroupDetailProps>) {
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

    const [selectedPairwiseForDetail, setSelectedPairwiseForDetail] = useState<PairwiseBalance | null>(null);
    const [selectedMemberForDetail, setSelectedMemberForDetail] = useState<Profile | null>(null);
    const [isEditGroupModalOpen, setIsEditGroupModalOpen] = useState(false);
    const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [isDeletingGroup, setIsDeletingGroup] = useState(false);

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
            (paidBy?.full_name ? paidBy.full_name.toLowerCase().includes(filters.searchTerm.toLowerCase()) : false);

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
            (payer?.full_name ? payer.full_name.toLowerCase().includes(filters.searchTerm.toLowerCase()) : false) ||
            (receiver?.full_name ? receiver.full_name.toLowerCase().includes(filters.searchTerm.toLowerCase()) : false);

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

    // Activity calculation
    const groupAuditLogs = (auditLogs ?? []).filter((a) => a.group_id === group.id);
    const sortedGroupAuditLogs = [...groupAuditLogs].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    const groupImageUrl = getGroupImage(group);

    const renderLogChanges = (log: ExpenseAuditLog) => {
        if (log.action !== 'update' || !log.changes) return null;
        const changes = log.changes as Record<string, any>;
        const detailsList: React.ReactNode[] = [];

        // 1. Array of string details from rich audit logging
        if (Array.isArray(changes.details) && changes.details.length > 0) {
            return (
                <div className="flex flex-col gap-1 pt-1">
                    {changes.details.map((detail: string, idx: number) => (
                        <div key={idx} className="flex items-center gap-1.5 text-xs text-zinc-600">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                            <span>{detail}</span>
                        </div>
                    ))}
                </div>
            );
        }

        // 2. Specific change properties
        if (changes.amount_before !== undefined && changes.amount_after !== undefined && Number(changes.amount_before) !== Number(changes.amount_after)) {
            detailsList.push(
                <span key="amount" className="inline-flex items-center gap-1">
                    <span className="text-zinc-500">Monto:</span>
                    <span className="line-through text-zinc-400">{formatCurrency(changes.amount_before, effectiveCurrency)}</span>
                    <span
                        className="font-semibold text-zinc-800">➔ {formatCurrency(changes.amount_after, effectiveCurrency)}</span>
                </span>
            );
        }

        if (changes.payer_name_before && changes.payer_name_after && changes.payer_name_before !== changes.payer_name_after) {
            detailsList.push(
                <span key="payer" className="inline-flex items-center gap-1">
                    <span className="text-zinc-500">Pagador:</span>
                    <span className="line-through text-zinc-400">{changes.payer_name_before}</span>
                    <span className="font-semibold text-zinc-800">➔ {changes.payer_name_after}</span>
                </span>
            );
        }

        if (changes.description_before && changes.description_after && changes.description_before !== changes.description_after) {
            detailsList.push(
                <span key="desc" className="inline-flex items-center gap-1">
                    <span className="text-zinc-500">Concepto:</span>
                    <span className="line-through text-zinc-400">&ldquo;{changes.description_before}&rdquo;</span>
                    <span className="font-semibold text-zinc-800">➔ &ldquo;{changes.description_after}&rdquo;</span>
                </span>
            );
        }

        if (Array.isArray(changes.added_names) && changes.added_names.length > 0) {
            detailsList.push(
                <span key="added"
                    className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-1.5 py-0.5 rounded text-[11px] font-medium">
                    + Agregó a: {changes.added_names.join(', ')}
                </span>
            );
        }

        if (Array.isArray(changes.removed_names) && changes.removed_names.length > 0) {
            detailsList.push(
                <span key="removed"
                    className="inline-flex items-center gap-1 text-rose-700 bg-rose-50 border border-rose-200/80 px-1.5 py-0.5 rounded text-[11px] font-medium">
                    - Quitó a: {changes.removed_names.join(', ')}
                </span>
            );
        }

        // 3. PostgreSQL trigger old/new structures
        if (changes.old && changes.new && typeof changes.old === 'object' && typeof changes.new === 'object') {
            const oldObj = changes.old;
            const newObj = changes.new;

            if (oldObj.total_amount !== undefined && newObj.total_amount !== undefined && Number(oldObj.total_amount) !== Number(newObj.total_amount)) {
                detailsList.push(
                    <span key="pg_amount" className="inline-flex items-center gap-1">
                        <span className="text-zinc-500">Monto:</span>
                        <span
                            className="line-through text-zinc-400">{formatCurrency(Number(oldObj.total_amount), effectiveCurrency)}</span>
                        <span
                            className="font-semibold text-zinc-800">➔ {formatCurrency(Number(newObj.total_amount), effectiveCurrency)}</span>
                    </span>
                );
            }
            if (oldObj.description && newObj.description && oldObj.description !== newObj.description) {
                detailsList.push(
                    <span key="pg_desc" className="inline-flex items-center gap-1">
                        <span className="text-zinc-500">Concepto:</span>
                        <span className="line-through text-zinc-400">&ldquo;{oldObj.description}&rdquo;</span>
                        <span className="font-semibold text-zinc-800">➔ &ldquo;{newObj.description}&rdquo;</span>
                    </span>
                );
            }
            if (oldObj.category && newObj.category && oldObj.category !== newObj.category) {
                detailsList.push(
                    <span key="pg_cat" className="inline-flex items-center gap-1">
                        <span className="text-zinc-500">Categoría:</span>
                        <span className="line-through text-zinc-400">{oldObj.category}</span>
                        <span className="font-semibold text-zinc-800">➔ {newObj.category}</span>
                    </span>
                );
            }
        }

        if (detailsList.length === 0 && changes.summary) {
            return (
                <p className="text-xs text-zinc-600 bg-zinc-50 border border-zinc-200/60 rounded-lg p-2 mt-1">
                    {changes.summary}
                </p>
            );
        }

        if (detailsList.length === 0) {
            const keys = Object.keys(changes).filter((k) => !['old', 'new', 'summary', 'details'].includes(k));
            if (keys.length > 0) {
                return (
                    <div className="flex flex-wrap gap-1 pt-1 text-[11px] text-zinc-600">
                        {keys.map((k) => (
                            <span key={k} className="bg-zinc-100 text-zinc-700 px-2 py-0.5 rounded-md font-medium">
                                {k === 'paid_by' ? 'Pagador modificado' : k === 'category' ? 'Categoría modificada' : k === 'splits' ? 'Reparto modificado' : `Modificado: ${k}`}
                            </span>
                        ))}
                    </div>
                );
            }
            return null;
        }

        return (
            <div className="flex flex-col gap-1 pt-1 text-xs text-zinc-700">
                {detailsList.map((node, i) => (
                    <div key={i} className="flex items-center gap-1.5 flex-wrap">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                        {node}
                    </div>
                ))}
            </div>
        );
    };

    return (
        <div className="w-full max-w-4xl mx-auto space-y-3 font-sans pb-16">
            {/* 1. Header: Group Banner with Background Photo, Blur, and Contrast Gradient */}
            <div
                className="relative w-full rounded-3xl overflow-hidden shadow-xs border border-zinc-800/80 bg-zinc-950 text-white">
                {/* Background photo with subtle blur */}
                {group.image_url ? (
                    <Image
                        src={groupImageUrl}
                        alt={group.name}
                        fill
                        className="object-cover scale-105 blur-[3px] brightness-[0.45] contrast-[1.05]"
                        unoptimized
                        referrerPolicy="no-referrer"
                    />
                ) : (
                    <div className="absolute inset-0 bg-gradient-to-tr from-zinc-950 via-zinc-900 to-zinc-800" />
                )}

                {/* Gradient overlay to ensure sharp contrast with foreground elements */}
                <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/95 via-zinc-950/70 to-black/40" />

                {/* Content */}
                <div className="relative z-10 p-4 sm:p-5 space-y-3 sm:space-y-3.5">
                    {/* Top Row: Group Title & Members count + Settings Button */}
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                            <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight truncate drop-shadow-sm">
                                {group.name}
                            </h1>
                            <p className="text-xs text-zinc-300 font-medium flex items-center gap-1.5 mt-0.5">
                                <Users className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                                <span>{memberProfiles.length} {memberProfiles.length === 1 ? 'miembro' : 'miembros'}</span>
                            </p>
                        </div>

                        <button
                            type="button"
                            onClick={() => setIsSettingsModalOpen(true)}
                            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 active:bg-white/30 text-white/90 hover:text-white backdrop-blur-md border border-white/15 flex items-center justify-center transition cursor-pointer shadow-sm active:scale-95 shrink-0"
                            title="Ajustes del grupo"
                            aria-label="Ajustes del grupo"
                        >
                            <Settings className="w-4.5 h-4.5" />
                        </button>
                    </div>

                    {/* Bottom Row: Balance Status & Action Buttons (Saldar + Nuevo gasto) */}
                    <div className="pt-2.5 border-t border-white/10 flex items-center justify-between gap-2.5">
                        <div className="min-w-0 flex flex-col justify-center">
                            <span
                                className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-zinc-400 leading-tight">
                                {myNetBalance > 0.01
                                    ? 'Tú recuperas'
                                    : myNetBalance < -0.01
                                        ? 'Tú debes'
                                        : 'Estás al día'}
                            </span>
                            <span
                                className={`text-lg sm:text-2xl font-black tracking-tight leading-tight mt-0.5 truncate ${myNetBalance > 0.01
                                    ? 'text-emerald-400'
                                    : myNetBalance < -0.01
                                        ? 'text-rose-400'
                                        : 'text-zinc-200'
                                    }`}
                            >
                                {formatCurrency(Math.abs(myNetBalance), effectiveCurrency)}
                            </span>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                            <button
                                type="button"
                                onClick={() => onOpenSettleModal(group.id)}
                                className="h-9 sm:h-10 px-3 sm:px-3.5 bg-white/10 hover:bg-white/20 active:bg-white/25 text-white border border-white/20 rounded-xl font-semibold text-xs sm:text-sm flex items-center gap-1.5 transition active:scale-95 backdrop-blur-md cursor-pointer"
                            >
                                <Wallet className="w-4 h-4 text-white shrink-0" />
                                <span>Saldar</span>
                            </button>

                            <button
                                type="button"
                                onClick={() => onOpenNewExpense(group.id)}
                                className="h-9 sm:h-10 px-3.5 sm:px-4 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white rounded-xl font-semibold text-xs sm:text-sm flex items-center gap-1.5 transition active:scale-95 shadow-md shadow-emerald-950/40 cursor-pointer"
                            >
                                <Plus className="w-4 h-4 stroke-[2.5] shrink-0" />
                                <span>Nuevo gasto</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* 2. Top Navigation Tabs: Gastos | Balances | Miembros | Historial */}
            <div className="bg-zinc-100/90 p-1 rounded-2xl grid grid-cols-4 gap-1 border border-zinc-200/70 shadow-2xs">
                <button
                    type="button"
                    onClick={() => setActiveTab('expenses')}
                    className={`flex items-center justify-center gap-1 sm:gap-1.5 py-2 px-1 rounded-xl text-[11px] sm:text-xs md:text-sm font-semibold transition-all cursor-pointer select-none ${activeTab === 'expenses'
                        ? 'bg-white text-emerald-800 shadow-xs border border-zinc-200/60 font-bold'
                        : 'text-zinc-500 hover:text-zinc-800 hover:bg-white/40'
                        }`}
                >
                    <DollarSign
                        className={`w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 ${activeTab === 'expenses' ? 'text-emerald-700 stroke-[2.5]' : 'text-zinc-400'}`} />
                    <span className="truncate">Gastos</span>
                </button>

                <button
                    type="button"
                    onClick={() => setActiveTab('balances')}
                    className={`flex items-center justify-center gap-1 sm:gap-1.5 py-2 px-1 rounded-xl text-[11px] sm:text-xs md:text-sm font-semibold transition-all cursor-pointer select-none ${activeTab === 'balances'
                        ? 'bg-white text-emerald-800 shadow-xs border border-zinc-200/60 font-bold'
                        : 'text-zinc-500 hover:text-zinc-800 hover:bg-white/40'
                        }`}
                >
                    <Scale
                        className={`w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 ${activeTab === 'balances' ? 'text-emerald-700 stroke-[2.5]' : 'text-zinc-400'}`} />
                    <span className="truncate">Balances</span>
                </button>

                <button
                    type="button"
                    onClick={() => setActiveTab('members')}
                    className={`flex items-center justify-center gap-1 sm:gap-1.5 py-2 px-1 rounded-xl text-[11px] sm:text-xs md:text-sm font-semibold transition-all cursor-pointer select-none ${activeTab === 'members'
                        ? 'bg-white text-emerald-800 shadow-xs border border-zinc-200/60 font-bold'
                        : 'text-zinc-500 hover:text-zinc-800 hover:bg-white/40'
                        }`}
                >
                    <Users
                        className={`w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 ${activeTab === 'members' ? 'text-emerald-700 stroke-[2.5]' : 'text-zinc-400'}`} />
                    <span className="truncate">Miembros</span>
                </button>

                <button
                    type="button"
                    onClick={() => setActiveTab('activity')}
                    className={`flex items-center justify-center gap-1 sm:gap-1.5 py-2 px-1 rounded-xl text-[11px] sm:text-xs md:text-sm font-semibold transition-all cursor-pointer select-none ${activeTab === 'activity'
                        ? 'bg-white text-emerald-800 shadow-xs border border-zinc-200/60 font-bold'
                        : 'text-zinc-500 hover:text-zinc-800 hover:bg-white/40'
                        }`}
                >
                    <History
                        className={`w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 ${activeTab === 'activity' ? 'text-emerald-700 stroke-[2.5]' : 'text-zinc-400'}`} />
                    <span className="truncate">Historial</span>
                </button>
            </div>

            {/* 3. TAB 1: GASTOS */}
            {activeTab === 'expenses' && (
                <div className="space-y-3 pt-1">
                    {/* Row 1: Dominant Search Bar + Filter Button [ 🎚️ ] */}
                    <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                            <Search
                                className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
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
                            className={`relative h-11 w-11 rounded-xl border transition flex items-center justify-center cursor-pointer shadow-2xs shrink-0 ${activeFiltersCount > 0
                                ? 'border-zinc-300 bg-white text-zinc-900'
                                : 'border-zinc-200/90 bg-white text-zinc-700 hover:bg-zinc-50'
                                }`}
                            aria-label="Abrir filtros"
                            title="Filtros"
                        >
                            <SlidersHorizontal className="w-4 h-4 text-zinc-700 rotate-90" />
                            {activeFiltersCount > 0 && (
                                <span
                                    className="absolute -top-1 -right-1 w-4.5 h-4.5 rounded-full bg-emerald-600 text-white text-[10px] font-bold flex items-center justify-center shadow-xs">
                                    {activeFiltersCount}
                                </span>
                            )}
                        </button>
                    </div>

                    <GenericExpenseList
                        expenses={filteredExpenses}
                        payments={filteredPayments}
                        profiles={profiles}
                        userGroups={userGroups.length > 0 ? userGroups : [group]}
                        currentProfile={currentProfile}
                        groupCurrency={effectiveCurrency}
                        dateFilterMode={filters.dateMode}
                        onEditExpense={onEditExpense}
                        onDeleteExpense={async (id) => {
                            await deleteExpense(id);
                        }}
                        onEditPayment={onEditPayment}
                        onDeletePayment={async (id) => {
                            if (onDeletePayment) await onDeletePayment(id);
                            else await deletePayment(id);
                        }}
                        showGroupBadge={false}
                        pageSize={30}
                        initialExpandedExpenseId={initialExpenseId}
                    />

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

                        <div
                            className="inline-flex items-center p-0.5 bg-zinc-100 rounded-xl border border-zinc-200 shrink-0">
                            <button
                                type="button"
                                onClick={() => setIsSimplifiedBalances(true)}
                                className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${isSimplifiedBalances ? 'bg-white text-zinc-900 shadow-2xs' : 'text-zinc-500 hover:text-zinc-800'
                                    }`}
                            >
                                <Sparkles
                                    className={`w-3 h-3 ${isSimplifiedBalances ? 'text-emerald-600' : 'text-zinc-400'}`} />
                                <span>Simplificado</span>
                                <span className="text-[10px] opacity-60">({simplifiedGroupPairwise.length})</span>
                            </button>

                            <button
                                type="button"
                                onClick={() => setIsSimplifiedBalances(false)}
                                className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${!isSimplifiedBalances ? 'bg-white text-zinc-900 shadow-2xs' : 'text-zinc-500 hover:text-zinc-800'
                                    }`}
                            >
                                <Layers
                                    className={`w-3 h-3 ${!isSimplifiedBalances ? 'text-zinc-900' : 'text-zinc-400'}`} />
                                <span>Directo</span>
                                <span className="text-[10px] opacity-60">({directGroupPairwise.length})</span>
                            </button>
                        </div>
                    </div>

                    {groupPairwise.length === 0 ? (
                        <div
                            className="bg-white rounded-2xl p-10 border border-zinc-200/80 text-center space-y-2 shadow-2xs">
                            <div
                                className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
                                <CheckCircle2 className="w-5 h-5" />
                            </div>
                            <h4 className="font-bold text-zinc-900 text-sm">¡Todas las cuentas están al día!</h4>
                            <p className="text-zinc-500 text-xs">No hay deudas pendientes entre los integrantes de este
                                grupo.</p>
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
                                        className={`bg-white rounded-2xl border shadow-2xs p-4 flex items-center justify-between gap-3 cursor-pointer hover:border-zinc-300 transition-all ${isOwedToMe ? 'border-emerald-200' : isMyDebt ? 'border-rose-200' : 'border-zinc-200/80'
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
                                                <div
                                                    className="flex items-center space-x-1.5 text-sm font-semibold text-zinc-900 truncate">
                                                    <span
                                                        className={isMyDebt ? 'text-[#c25a3a] font-bold' : ''}>{debtorName}</span>
                                                    <ArrowRight className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                                                    <span
                                                        className={isOwedToMe ? 'text-emerald-700 font-bold' : ''}>{creditorName}</span>
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
                                                    <span
                                                        className="bg-amber-100 text-amber-800 text-[9px] font-bold uppercase px-1.5 py-0.2 rounded-md">
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

            {/* 6. TAB 4: HISTORIAL */}
            {activeTab === 'activity' && (
                <div className="space-y-3 pt-1">
                    {sortedGroupAuditLogs.length === 0 ? (
                        <div
                            className="bg-white rounded-2xl border border-zinc-200 p-10 text-center text-zinc-500 shadow-2xs space-y-2">
                            <History className="w-10 h-10 text-zinc-300 mx-auto" />
                            <h3 className="font-semibold text-zinc-900 text-sm">Sin historial</h3>
                            <p className="text-xs text-zinc-500">Aún no hay registros de movimientos en este grupo.</p>
                        </div>
                    ) : (
                        <div
                            className="bg-white rounded-2xl border border-zinc-200/80 shadow-2xs divide-y divide-zinc-100 overflow-hidden">
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
                                        className={`p-3.5 sm:p-4 flex items-start justify-between gap-3 transition ${isClickable ? 'cursor-pointer hover:bg-zinc-50/80 active:bg-zinc-100/70' : ''
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
                                                    <strong
                                                        className="font-semibold text-zinc-900">{userName}</strong>{' '}
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
                                                        <span
                                                            className="font-bold text-zinc-900 bg-zinc-100 px-2 py-0.5 rounded-md text-[11px]">
                                                            {formatCurrency(expenseAmount, effectiveCurrency)}
                                                        </span>
                                                    )}
                                                    {associatedExpense?.category && (
                                                        <span
                                                            className="text-zinc-500 bg-zinc-50 border border-zinc-200/60 px-2 py-0.5 rounded-md text-[11px]">
                                                            {associatedExpense.category}
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Detailed change items without raw counter */}
                                                {renderLogChanges(log)}

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
        </div>
    );
}
