'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { useExpense } from '@/lib/expense-context';
import { Group, Expense, Payment, Profile } from '@/lib/types';
import {
  formatCurrency,
  calculatePairwiseBalances,
  calculateSimplifiedBalances,
  calculateDirectBalances,
  calculateUserSummaries,
} from '@/lib/balance-utils';
import {
  Receipt,
  Wallet,
  Users,
  User,
  Plus,
  UserPlus,
  Trash2,
  CheckCircle2,
  Share2,
  Check,
  Sparkles,
  Layers,
  Pencil,
  FileText,
  Settings,
  Activity,
  Folder,
  ArrowRight,
  Clock,
  HandCoins,
  PlusCircle,
  Link as LinkIcon,
} from 'lucide-react';

import { getGroupImage, getCleanGroupDescription, getGroupCategoryConfig, getGroupCategoryLabel } from '@/lib/group-utils';
import { formatDisplayEmail, isTempProfile } from '@/lib/utils';

import { MemberDetailModal } from '@/components/MemberDetailModal';
import { GenericExpenseList } from '@/components/GenericExpenseList';
import { EditGroupModal } from '@/components/EditGroupModal';
import { GroupSettingsModal } from '@/components/GroupSettingsModal';
import { ConfirmModal } from '@/components/ConfirmModal';

interface GroupDetailProps {
  group: Group;
  onBack: () => void;
  onOpenNewExpense: (groupId?: string) => void;
  onEditExpense?: (expense: Expense) => void;
  onEditPayment?: (payment: Payment) => void;
  onDeletePayment?: (paymentId: string) => void;
  onOpenSettleModal: (groupId: string, debtorId?: string, creditorId?: string, amount?: number) => void;
  onOpenAddMember: (groupId: string, tab?: 'link' | 'new' | 'friends') => void;
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

function parseExpenseDate(dateStr: string) {
  if (!dateStr) return { year: 2026, monthIndex: 0, day: 1 };
  const parts = dateStr.split('-');
  if (parts.length >= 3) {
    const year = parseInt(parts[0], 10) || 2026;
    const monthIndex = Math.max(0, Math.min(11, (parseInt(parts[1], 10) || 1) - 1));
    const day = parseInt(parts[2].slice(0, 2), 10) || 1;
    return { year, monthIndex, day };
  }
  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) {
    return { year: d.getFullYear(), monthIndex: d.getMonth(), day: d.getDate() };
  }
  return { year: 2026, monthIndex: 0, day: 1 };
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

import { PageHeader } from '@/components/PageHeader';

export function GroupDetail({
  group,
  onBack,
  onOpenNewExpense,
  onEditExpense,
  onEditPayment,
  onDeletePayment,
  onOpenSettleModal,
  onOpenAddMember,
}: GroupDetailProps) {
  const { currentProfile, expenses, auditLogs, payments, members, profiles, userGroups, pendingInvites, deleteExpense, deletePayment, deleteGroup } = useExpense();
  const [activeTab, setActiveTab] = useState<'expenses' | 'balances' | 'members' | 'activity'>('expenses');
  const [expenseFilter, setExpenseFilter] = useState<'all' | 'mine'>('all');
  const [isSimplifiedBalances, setIsSimplifiedBalances] = useState(true);

  const [selectedMemberForDetail, setSelectedMemberForDetail] = useState<Profile | null>(null);
  const [isEditGroupModalOpen, setIsEditGroupModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeletingGroup, setIsDeletingGroup] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const groupExpenses = expenses.filter((e) => e.group_id === group.id);
  const groupPayments = payments.filter((p) => p.group_id === group.id);

  const filteredExpenses = groupExpenses.filter((exp) => {
    if (expenseFilter === 'all') return true;
    const isPayer = exp.paid_by === currentProfile?.id;
    const isParticipant = Boolean(exp.splits?.some((s) => s.user_id === currentProfile?.id && s.amount_owed > 0));
    return Boolean(isPayer || isParticipant);
  });

  const filteredPayments = groupPayments.filter((p) => {
    if (expenseFilter === 'all') return true;
    return p.paid_by === currentProfile?.id || p.paid_to === currentProfile?.id;
  });

  const groupMembers = members.filter((m) => m.group_id === group.id);
  const memberProfiles = groupMembers
    .map((m) => profiles.find((p) => p.id === m.user_id))
    .filter((p): p is NonNullable<typeof p> => p !== undefined);

  // Simplified and direct pairwise debts in this group
  const simplifiedGroupPairwise = calculateSimplifiedBalances(expenses, payments, profiles, group.id);
  const directGroupPairwise = calculateDirectBalances(expenses, payments, profiles, group.id);
  const groupPairwise = isSimplifiedBalances ? simplifiedGroupPairwise : directGroupPairwise;
  const savedGroupTransactions = Math.max(0, directGroupPairwise.length - simplifiedGroupPairwise.length);

  const isSoloMember = memberProfiles.length <= 1;

  // Group activities calculation (creates, updates, deletes, payments)
  const effectiveCurrency = group.currency ?? currentProfile?.currency ?? 'COP';
  const groupAuditLogs = (auditLogs ?? []).filter((a) => a.group_id === group.id);
  const expenseIdsWithCreateLog = new Set(
    groupAuditLogs.filter((l) => l.action === 'create').map((l) => l.expense_id)
  );

  interface GroupActivityItem {
    id: string;
    type: 'create' | 'update' | 'delete' | 'payment';
    user: Profile | null;
    userName: string;
    timestamp: string;
    titleAction: string;
    targetTitle: string;
    amount?: number;
    currency: string;
    badgeLabel: string;
    badgeClass: string;
    IconComponent: React.ElementType;
    iconBgClass: string;
    iconTextClass: string;
    changesList?: string[];
  }

  const activities: GroupActivityItem[] = [];

  // 1. Audit logs
  groupAuditLogs.forEach((log) => {
    const user = profiles.find((p) => p.id === log.user_id) ?? null;
    const userName = user?.full_name ?? 'Usuario';
    const oldData = log.changes?.old;
    const newData = log.changes?.new;
    const currentExp = expenses.find((e) => e.id === log.expense_id);

    if (log.action === 'create') {
      const data = newData ?? currentExp;
      const desc = data?.description ?? 'Gasto';
      const amount = typeof data?.total_amount === 'number' ? data.total_amount : undefined;
      activities.push({
        id: `audit-${log.id}`,
        type: 'create',
        user,
        userName,
        timestamp: log.created_at,
        titleAction: 'agregó el gasto',
        targetTitle: desc,
        amount,
        currency: effectiveCurrency,
        badgeLabel: 'Nuevo',
        badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
        IconComponent: PlusCircle,
        iconBgClass: 'bg-emerald-50',
        iconTextClass: 'text-emerald-700',
      });
    } else if (log.action === 'update') {
      const desc = newData?.description ?? oldData?.description ?? currentExp?.description ?? 'Gasto';
      const changesList: string[] = [];

      if (oldData && newData) {
        if (typeof oldData.total_amount === 'number' && typeof newData.total_amount === 'number' && oldData.total_amount !== newData.total_amount) {
          changesList.push(`Monto modificado: ${formatCurrency(oldData.total_amount, effectiveCurrency)} → ${formatCurrency(newData.total_amount, effectiveCurrency)}`);
        }
        if (oldData.description && newData.description && oldData.description !== newData.description) {
          changesList.push(`Nombre: "${oldData.description}" → "${newData.description}"`);
        }
        if (oldData.category && newData.category && oldData.category !== newData.category) {
          changesList.push(`Categoría actualizada`);
        }
        if (oldData.notes !== newData.notes) {
          changesList.push(`Notas del gasto modificadas`);
        }
      }

      activities.push({
        id: `audit-${log.id}`,
        type: 'update',
        user,
        userName,
        timestamp: log.created_at,
        titleAction: 'editó el gasto',
        targetTitle: desc,
        amount: typeof newData?.total_amount === 'number' ? newData.total_amount : currentExp?.total_amount,
        currency: effectiveCurrency,
        badgeLabel: 'Editado',
        badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
        IconComponent: Pencil,
        iconBgClass: 'bg-amber-50',
        iconTextClass: 'text-amber-700',
        changesList,
      });
    } else if (log.action === 'delete') {
      const desc = oldData?.description ?? 'Gasto';
      const amount = typeof oldData?.total_amount === 'number' ? oldData.total_amount : undefined;
      activities.push({
        id: `audit-${log.id}`,
        type: 'delete',
        user,
        userName,
        timestamp: log.created_at,
        titleAction: 'eliminó el gasto',
        targetTitle: desc,
        amount,
        currency: effectiveCurrency,
        badgeLabel: 'Eliminado',
        badgeClass: 'bg-rose-50 text-rose-800 border-rose-200',
        IconComponent: Trash2,
        iconBgClass: 'bg-rose-50',
        iconTextClass: 'text-rose-700',
      });
    }
  });

  // 2. Pre-audit expenses
  groupExpenses.forEach((exp) => {
    if (!expenseIdsWithCreateLog.has(exp.id)) {
      const user = profiles.find((p) => p.id === exp.created_by) ?? null;
      const userName = user?.full_name ?? 'Usuario';
      activities.push({
        id: `exp-init-${exp.id}`,
        type: 'create',
        user,
        userName,
        timestamp: exp.created_at,
        titleAction: 'agregó el gasto',
        targetTitle: exp.description,
        amount: exp.total_amount,
        currency: effectiveCurrency,
        badgeLabel: 'Nuevo',
        badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
        IconComponent: PlusCircle,
        iconBgClass: 'bg-emerald-50',
        iconTextClass: 'text-emerald-700',
      });
    }
  });

  // 3. Group payments (abonos)
  groupPayments.forEach((p) => {
    const payer = profiles.find((prof) => prof.id === p.paid_by) ?? null;
    const receiver = profiles.find((prof) => prof.id === p.paid_to) ?? null;
    const payerName = payer?.full_name ?? 'Usuario';
    const receiverName = receiver?.full_name ?? 'Usuario';
    activities.push({
      id: `payment-${p.id}`,
      type: 'payment',
      user: payer,
      userName: payerName,
      timestamp: p.created_at || p.payment_date,
      titleAction: `registró un abono a ${receiverName}`,
      targetTitle: p.note ?? 'Abono registrado',
      amount: p.amount,
      currency: effectiveCurrency,
      badgeLabel: 'Abono',
      badgeClass: 'bg-sky-50 text-sky-800 border-sky-200',
      IconComponent: HandCoins,
      iconBgClass: 'bg-sky-50',
      iconTextClass: 'text-sky-700',
    });
  });

  // Sort chronologically descending
  activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const handleDeleteGroup = async () => {
    setIsDeletingGroup(true);
    try {
      await deleteGroup(group.id);
      setIsDeleteModalOpen(false);
      onBack();
    } catch (err: unknown) {
      console.error('Error al eliminar grupo:', err);
    } finally {
      setIsDeletingGroup(false);
    }
  };

  const handleShareOrCopyLink = async () => {
    const currentUrl = typeof window !== 'undefined' ? window.location.href : '';
    if (!currentUrl) return;

    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: `Unirse al grupo ${group.name}`,
          text: `Te invito a unirte al grupo ${group.name} en Deudita para dividir gastos juntos.`,
          url: currentUrl,
        });
        return;
      } catch {
        // Fallback to clipboard write
      }
    }

    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(currentUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    }
  };

  const groupImageUrl = getGroupImage(group);

  // Group filtered expenses by Month & Year
  const sortedExpenses = [...filteredExpenses].sort((a, b) => {
    return new Date(b.expense_date).getTime() - new Date(a.expense_date).getTime();
  });

  const groupedByMonth: { key: string; label: string; expenses: Expense[] }[] = [];

  sortedExpenses.forEach((exp) => {
    const { year, monthIndex } = parseExpenseDate(exp.expense_date);
    const key = `${year}-${monthIndex}`;
    const label = `${MONTH_NAMES_ES[monthIndex]} ${year}`;

    let existing = groupedByMonth.find((g) => g.key === key);
    if (!existing) {
      existing = { key, label, expenses: [] };
      groupedByMonth.push(existing);
    }
    existing.expenses.push(exp);
  });

  return (
    <div className="space-y-4">
      <div className="relative w-full h-32 sm:h-40 rounded-3xl overflow-hidden shadow-sm ring-1 ring-zinc-200/50 bg-zinc-900 group flex items-end">
        {groupImageUrl ? (
          <Image
            src={groupImageUrl}
            alt={group.name}
            fill
            className="object-cover opacity-50"
            unoptimized
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-zinc-800 to-zinc-950 opacity-90" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/90 via-zinc-900/60 to-transparent" />
        
        {/* Top actions */}
        <div className="absolute top-3 left-3 right-3 flex justify-between items-start">
          <button
            onClick={onBack}
            className="px-3 py-1.5 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-xl text-white text-xs font-semibold transition-all shadow-sm ring-1 ring-white/20 active:scale-95"
          >
            Volver
          </button>
          <button
            onClick={() => setIsSettingsModalOpen(true)}
            className="p-1.5 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full text-white transition-all shadow-sm ring-1 ring-white/20 active:scale-95"
            title="Configuración del grupo"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>

        {/* Bottom info & actions */}
        <div className="relative z-10 w-full p-4 sm:p-5 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              {(() => {
                const catConfig = getGroupCategoryConfig(group.category);
                const GroupCategoryIcon = catConfig.icon;
                return (
                  <div className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-white/20 backdrop-blur-md text-white text-[11px] uppercase tracking-wider font-bold ring-1 ring-white/20 shadow-xs">
                    <GroupCategoryIcon className="w-3.5 h-3.5" />
                    <span>{catConfig.label}</span>
                  </div>
                );
              })()}
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight drop-shadow-md">
              {group.name}
            </h1>
            {getCleanGroupDescription(group.description) && (
              <p className="text-white/80 text-xs max-w-xl line-clamp-1">
                {getCleanGroupDescription(group.description)}
              </p>
            )}
          </div>
          
          {/* Actions: Settle and New Expense */}
          <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
            <button
              onClick={() => onOpenSettleModal(group.id)}
              className="flex-1 sm:flex-none flex items-center justify-center space-x-1.5 bg-white/10 hover:bg-white/20 backdrop-blur-md text-white font-semibold px-3 py-2 rounded-xl text-xs transition-all active:scale-95 shadow-sm ring-1 ring-white/20"
            >
              <Wallet className="w-4 h-4" />
              <span>Saldar</span>
            </button>
            <button
              onClick={() => onOpenNewExpense(group.id)}
              className="flex-1 sm:flex-none flex items-center justify-center space-x-1.5 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold px-3 py-2 rounded-xl text-xs transition-all active:scale-95 shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>Nuevo gasto</span>
            </button>
          </div>
        </div>
      </div>

      {/* SOLO MEMBER STRATEGY */}
      {isSoloMember && (
        <div className="bg-amber-50 text-amber-900 p-6 rounded-[2rem] shadow-sm relative overflow-hidden border border-amber-200/60">
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-1.5 max-w-xl">
              <div className="inline-flex items-center space-x-2 bg-amber-200/50 text-amber-800 text-[10px] font-bold px-2.5 py-1 rounded-md tracking-wider uppercase">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Grupo Listo</span>
              </div>
              <h3 className="text-lg font-semibold tracking-tight text-amber-950">
                Eres la única persona en este grupo
              </h3>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
              <button
                onClick={() => onOpenAddMember(group.id, 'new')}
                className="flex items-center justify-center space-x-2 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold px-4 py-2.5 rounded-xl text-sm transition-all active:scale-95 shadow-sm min-h-[40px] cursor-pointer"
              >
                <UserPlus className="w-4 h-4" />
                <span>Añadir Integrante</span>
              </button>

              <button
                onClick={() => onOpenAddMember(group.id, 'link')}
                className="flex items-center justify-center space-x-2 bg-white hover:bg-zinc-50 text-zinc-900 font-medium px-4 py-2.5 rounded-xl text-sm ring-1 ring-zinc-200 shadow-sm transition-all active:scale-95 min-h-[40px] cursor-pointer"
              >
                <LinkIcon className="w-4 h-4 text-emerald-600" />
                <span>Invitar con enlace</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pestañas de Gastos, Balances y Miembros */}
      <div className="flex border-b border-zinc-200 overflow-x-auto">
        <button
          onClick={() => setActiveTab('expenses')}
          className={`flex items-center space-x-1.5 py-2.5 px-4 font-semibold text-xs border-b-2 whitespace-nowrap transition-all ${
            activeTab === 'expenses'
              ? 'border-zinc-900 text-zinc-900'
              : 'border-transparent text-zinc-500 hover:text-zinc-800'
          }`}
        >
          <Receipt className="w-3.5 h-3.5" />
          <span>Gastos ({groupExpenses.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('balances')}
          className={`flex items-center space-x-1.5 py-2.5 px-4 font-semibold text-xs border-b-2 whitespace-nowrap transition-all ${
            activeTab === 'balances'
              ? 'border-zinc-900 text-zinc-900'
              : 'border-transparent text-zinc-500 hover:text-zinc-800'
          }`}
        >
          <Wallet className="w-3.5 h-3.5" />
          <span>Balances ({groupPairwise.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('members')}
          className={`flex items-center space-x-1.5 py-2.5 px-4 font-semibold text-xs border-b-2 whitespace-nowrap transition-all ${
            activeTab === 'members'
              ? 'border-zinc-900 text-zinc-900'
              : 'border-transparent text-zinc-500 hover:text-zinc-800'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Miembros ({memberProfiles.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('activity')}
          className={`flex items-center space-x-1.5 py-2.5 px-4 font-semibold text-xs border-b-2 whitespace-nowrap transition-all ${
            activeTab === 'activity'
              ? 'border-zinc-900 text-zinc-900'
              : 'border-transparent text-zinc-500 hover:text-zinc-800'
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          <span>Actividad</span>
        </button>
      </div>

      {/* TAB CONTENT: Expenses */}
      {activeTab === 'expenses' && (
        <div className="space-y-3">
          {/* Expenses Filter Bar */}
          <div className="flex items-center justify-between">
            <div className="inline-flex items-center p-0.5 bg-zinc-100 rounded-xl border border-zinc-200/60">
              <button
                type="button"
                onClick={() => setExpenseFilter('all')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                  expenseFilter === 'all'
                    ? 'bg-white text-zinc-900 shadow-2xs'
                    : 'text-zinc-500 hover:text-zinc-900'
                }`}
              >
                Todos ({groupExpenses.length})
              </button>
              <button
                type="button"
                onClick={() => setExpenseFilter('mine')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                  expenseFilter === 'mine'
                    ? 'bg-white text-zinc-900 shadow-2xs'
                    : 'text-zinc-500 hover:text-zinc-900'
                }`}
              >
                Mis gastos
              </button>
            </div>
          </div>

          <GenericExpenseList
            expenses={filteredExpenses}
            payments={filteredPayments}
            profiles={profiles}
            userGroups={userGroups}
            currentProfile={currentProfile}
            groupCurrency={group.currency || 'COP'}
            onEditExpense={onEditExpense}
            onDeleteExpense={(expId) => deleteExpense(expId)}
            onEditPayment={onEditPayment}
            onDeletePayment={onDeletePayment || ((payId) => deletePayment(payId))}
            showGroupBadge={false}
          />
        </div>
      )}

      {/* TAB CONTENT: Balances */}
      {activeTab === 'balances' && (
        <div className="space-y-6">
          {/* Mode Switcher & Explanation Banner */}
          <div className="bg-white rounded-3xl p-4 sm:p-5 border border-zinc-200/90 shadow-2xs space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-black uppercase tracking-wider text-zinc-500">
                    Modo de cálculo
                  </span>
                  {isSimplifiedBalances && savedGroupTransactions > 0 && (
                    <span className="inline-flex items-center space-x-1 text-[10px] font-extrabold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full border border-emerald-200/80">
                      <Sparkles className="w-3 h-3" />
                      <span>Ahorra {savedGroupTransactions} {savedGroupTransactions === 1 ? 'pago' : 'pagos'}</span>
                    </span>
                  )}
                </div>
                <p className="text-xs text-zinc-600 font-medium mt-0.5">
                  {isSimplifiedBalances
                    ? 'Simplificación activada: Se agrupan los saldos para que el grupo salde cuentas en el menor número de pagos.'
                    : 'Vista sin simplificar: Muestra los saldos directos calculados gasto por gasto entre cada integrante.'}
                </p>
              </div>

              {/* Segmented Switcher */}
              <div className="inline-flex items-center p-1 bg-zinc-100/90 rounded-2xl border border-zinc-200/80 shrink-0 self-start sm:self-center">
                <button
                  type="button"
                  onClick={() => setIsSimplifiedBalances(true)}
                  className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    isSimplifiedBalances
                      ? 'bg-white text-zinc-900 shadow-xs ring-1 ring-zinc-200/80'
                      : 'text-zinc-500 hover:text-zinc-800'
                  }`}
                >
                  <Sparkles className={`w-3.5 h-3.5 ${isSimplifiedBalances ? 'text-emerald-600' : 'text-zinc-400'}`} />
                  <span>Simplificado</span>
                  <span className="text-[10px] opacity-70">({simplifiedGroupPairwise.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsSimplifiedBalances(false)}
                  className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    !isSimplifiedBalances
                      ? 'bg-white text-zinc-900 shadow-xs ring-1 ring-zinc-200/80'
                      : 'text-zinc-500 hover:text-zinc-800'
                  }`}
                >
                  <Layers className={`w-3.5 h-3.5 ${!isSimplifiedBalances ? 'text-zinc-900' : 'text-zinc-400'}`} />
                  <span>Sin simplificar</span>
                  <span className="text-[10px] opacity-70">({directGroupPairwise.length})</span>
                </button>
              </div>
            </div>
          </div>

          {groupPairwise.length === 0 ? (
            <div className="bg-white rounded-3xl p-10 border border-zinc-200/80 text-center space-y-3 shadow-2xs">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto ring-1 ring-emerald-200/60 shadow-xs">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h4 className="font-extrabold text-zinc-900 text-base">¡Todas las cuentas están al día!</h4>
              <p className="text-zinc-500 text-xs max-w-sm mx-auto">
                No hay deudas pendientes entre los integrantes de este grupo.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {groupPairwise.map((p, idx) => {
                const isMyDebt = p.debtor.id === currentProfile?.id;
                const isOwedToMe = p.creditor.id === currentProfile?.id;

                const debtorInitial = p.debtor.full_name?.trim() ? p.debtor.full_name.trim().charAt(0).toUpperCase() : 'U';
                const creditorInitial = p.creditor.full_name?.trim() ? p.creditor.full_name.trim().charAt(0).toUpperCase() : 'U';
                const debtorDisplayName = p.debtor.full_name?.trim() ? p.debtor.full_name.split(' ')[0] : 'Integrante';
                const creditorDisplayName = p.creditor.full_name?.trim() ? p.creditor.full_name.split(' ')[0] : 'Integrante';

                return (
                  <div
                    key={idx}
                    className="bg-white rounded-3xl p-5 border border-zinc-200/80 shadow-2xs hover:shadow-md hover:border-zinc-300 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="flex items-center space-x-3.5 min-w-0">
                      <div className="flex items-center -space-x-2 shrink-0">
                        {p.debtor.avatar_url ? (
                          <Image
                            src={p.debtor.avatar_url}
                            alt={p.debtor.full_name ? p.debtor.full_name : 'Deudor'}
                            width={40}
                            height={40}
                            className="w-10 h-10 rounded-full object-cover ring-2 ring-white"
                            unoptimized
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-zinc-900 text-white flex items-center justify-center text-xs font-bold ring-2 ring-white">
                            {debtorInitial}
                          </div>
                        )}
                        {p.creditor.avatar_url ? (
                          <Image
                            src={p.creditor.avatar_url}
                            alt={p.creditor.full_name ? p.creditor.full_name : 'Acreedor'}
                            width={40}
                            height={40}
                            className="w-10 h-10 rounded-full object-cover ring-2 ring-white"
                            unoptimized
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-emerald-700 text-white flex items-center justify-center text-xs font-bold ring-2 ring-white">
                            {creditorInitial}
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center space-x-1.5 text-sm font-extrabold text-zinc-900 truncate">
                          <span className={isMyDebt ? 'text-rose-600 font-black' : ''}>
                            {debtorDisplayName}
                          </span>
                          <ArrowRight className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                          <span className={isOwedToMe ? 'text-emerald-700 font-black' : ''}>
                            {creditorDisplayName}
                          </span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                            isMyDebt
                              ? 'bg-rose-50 text-rose-700 border border-rose-200/60'
                              : isOwedToMe
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200/60'
                              : 'bg-zinc-100 text-zinc-700'
                          }`}>
                            {formatCurrency(p.amount, group.currency ?? 'COP')}
                          </span>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => onOpenSettleModal(group.id, p.debtor.id, p.creditor.id, p.amount)}
                      className="bg-zinc-900 hover:bg-zinc-800 text-white font-extrabold px-5 py-2.5 rounded-2xl text-xs transition-all active:scale-95 shadow-xs shrink-0 self-end sm:self-center cursor-pointer"
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

      {/* TAB CONTENT: Members */}
      {activeTab === 'members' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-zinc-900 text-lg sm:text-xl">
              Integrantes ({memberProfiles.length})
            </h3>
            <button
              onClick={() => onOpenAddMember(group.id)}
              className="flex items-center space-x-1.5 bg-zinc-900 hover:bg-zinc-800 text-white px-4 py-2.5 rounded-full text-xs font-medium transition-all active:scale-95 min-h-[40px]"
            >
              <UserPlus className="w-4 h-4" />
              <span>Añadir Integrante</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {memberProfiles.map((p) => {
              const memberRecord = groupMembers.find((m) => m.user_id === p.id);
              const isOwner = memberRecord?.role === 'owner';

              return (
                <div
                  key={p.id}
                  onClick={() => setSelectedMemberForDetail(p)}
                  className="bg-white hover:bg-zinc-50/80 rounded-2xl p-4 ring-1 ring-zinc-200/80 flex items-center justify-between shadow-2xs cursor-pointer transition-all active:scale-[0.99] group"
                >
                  <div className="flex items-center space-x-3.5 overflow-hidden">
                    {p.avatar_url ? (
                      <Image
                        src={p.avatar_url}
                        alt={p.full_name}
                        width={44}
                        height={44}
                        className="w-11 h-11 rounded-full object-cover ring-2 ring-zinc-100 shrink-0"
                        unoptimized
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-11 h-11 rounded-full bg-zinc-900 text-white flex items-center justify-center text-sm font-bold shrink-0">
                        {p.full_name ? p.full_name.charAt(0).toUpperCase() : 'U'}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                        <h4 className="font-semibold text-zinc-900 text-sm truncate group-hover:text-zinc-950">
                          {p.full_name}
                        </h4>
                        {isOwner && (
                          <span className="bg-amber-100 text-amber-800 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md">
                            Admin
                          </span>
                        )}
                        {isTempProfile(p) && (
                          <span className="bg-sky-100 text-sky-800 border border-sky-200 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md">
                            Pendiente de registro
                          </span>
                        )}
                        {pendingInvites.some((i) => i.group_id === group.id && (i.invitee_profile_id === p.id || (Boolean(i.email) && Boolean(p.email) && i.email?.toLowerCase() === p.email?.toLowerCase()))) && !isTempProfile(p) && (
                          <span className="bg-amber-50 text-amber-700 border border-amber-200 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md">
                            Invitación Pendiente
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-zinc-500 mt-0.5 truncate">
                        {formatDisplayEmail(p.email)}
                      </p>
                    </div>
                  </div>

                  <span className="text-xs font-semibold text-zinc-400 group-hover:text-zinc-700 shrink-0 pl-2">
                    Ver perfil
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Member Detail Modal */}
      {selectedMemberForDetail && (
        <MemberDetailModal
          isOpen={Boolean(selectedMemberForDetail)}
          memberProfile={selectedMemberForDetail}
          groupId={group.id}
          onClose={() => setSelectedMemberForDetail(null)}
        />
      )}


      {/* TAB CONTENT: Activity */}
      {activeTab === 'activity' && (
        <div className="space-y-3">
          {activities.length === 0 ? (
            <div className="bg-white rounded-2xl ring-1 ring-zinc-200 p-12 text-center text-zinc-500 shadow-2xs">
              <Activity className="w-12 h-12 text-zinc-300 mx-auto mb-3" />
              <h3 className="font-semibold text-zinc-900 text-base">Sin actividad</h3>
              <p className="text-xs text-zinc-500 mt-1">Aún no hay registros de movimientos o modificaciones en este grupo.</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl ring-1 ring-zinc-200/80 shadow-2xs divide-y divide-zinc-100 overflow-hidden">
              {activities.map((act) => {
                const IconComponent = act.IconComponent;
                return (
                  <div key={act.id} className="p-3 sm:p-3.5 flex items-start space-x-3 hover:bg-zinc-50/70 transition-colors">
                    {/* User Avatar with Action icon badge */}
                    <div className="relative shrink-0 mt-0.5">
                      <div className="w-8 h-8 rounded-full overflow-hidden bg-zinc-100 border border-zinc-200/90 shadow-2xs">
                        {act.user?.avatar_url ? (
                          <Image src={act.user.avatar_url} alt={act.userName} width={32} height={32} className="w-full h-full object-cover" unoptimized />
                        ) : (
                          <User className="w-4 h-4 m-2 text-zinc-400" />
                        )}
                      </div>
                      <div className={`absolute -bottom-1 -right-1 w-4.5 h-4.5 rounded-full ${act.iconBgClass} ${act.iconTextClass} border border-white flex items-center justify-center shadow-2xs`}>
                        <IconComponent className="w-2.5 h-2.5" />
                      </div>
                    </div>

                    {/* Activity Content */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs sm:text-sm text-zinc-800 leading-snug min-w-0">
                          <strong className="font-semibold text-zinc-900">{act.userName}</strong>{' '}
                          <span className="text-zinc-600">{act.titleAction}</span>{' '}
                          <strong className="font-medium text-zinc-900">{act.targetTitle}</strong>
                        </p>
                        <div className="shrink-0 flex items-center space-x-1.5 self-start">
                          {act.amount !== undefined && (
                            <span className="text-xs sm:text-sm font-bold text-zinc-900">
                              {formatCurrency(act.amount, act.currency)}
                            </span>
                          )}
                          <span className={`inline-flex items-center px-1.5 py-0.2 rounded text-[9px] font-bold border ${act.badgeClass}`}>
                            {act.badgeLabel}
                          </span>
                        </div>
                      </div>

                      {/* Compact change badges / details */}
                      {act.changesList && act.changesList.length > 0 && (
                        <div className="mt-1 flex flex-wrap items-center gap-1">
                          {act.changesList.map((chg, idx) => (
                            <span
                              key={idx}
                              className="inline-flex items-center text-[10px] text-zinc-600 bg-zinc-100/90 px-1.5 py-0.5 rounded border border-zinc-200/60 leading-none"
                            >
                              {chg}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Exact Date & Time */}
                      <div className="flex items-center space-x-1 text-[10px] text-zinc-400 mt-1">
                        <Clock className="w-2.5 h-2.5 text-zinc-400 shrink-0" />
                        <span>{formatActivityDateTime(act.timestamp)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Edit Group Modal */}
      {isEditGroupModalOpen && (
        <EditGroupModal
          isOpen={isEditGroupModalOpen}
          group={group}
          onClose={() => setIsEditGroupModalOpen(false)}
        />
      )}

      {/* Group Settings Menu */}
      <GroupSettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        onEditGroup={() => {
          setIsSettingsModalOpen(false);
          setIsEditGroupModalOpen(true);
        }}
        onAddMembers={() => {
          setIsSettingsModalOpen(false);
          onOpenAddMember(group.id, 'new');
        }}
        onInviteLink={() => {
          setIsSettingsModalOpen(false);
          onOpenAddMember(group.id, 'link');
        }}
        onDeleteGroup={() => {
          setIsSettingsModalOpen(false);
          setIsDeleteModalOpen(true);
        }}
      />

      {/* Delete Group Confirm */}
      <ConfirmModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={handleDeleteGroup}
        title="¿Eliminar grupo?"
        description="Esta acción no se puede deshacer. Todos los gastos y pagos registrados en este grupo serán eliminados de forma permanente."
        confirmText="Sí, eliminar"
        cancelText="Cancelar"
        variant="danger"
        isLoading={isDeletingGroup}
      />
    </div>
  );
}

