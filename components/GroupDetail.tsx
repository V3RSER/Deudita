'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { useExpense } from '@/lib/expense-context';
import { Group, Expense, Payment, Profile } from '@/lib/types';
import { formatCurrency, calculatePairwiseBalances, calculateUserSummaries } from '@/lib/balance-utils';
import {
  Receipt,
  Wallet,
  Users,
  Plus,
  UserPlus,
  Trash2,
  CheckCircle2,
  Share2,
  Check,
  Sparkles,
  Pencil,
  FileText,
} from 'lucide-react';

import { getGroupImage, getCleanGroupDescription } from '@/lib/group-utils';
import { getCategoryConfig } from '@/lib/expense-category-utils';
import { formatDisplayEmail, isTempProfile } from '@/lib/utils';
import { ExpenseDetailModal } from '@/components/ExpenseDetailModal';
import { MemberDetailModal } from '@/components/MemberDetailModal';
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
  const { currentProfile, expenses, payments, members, profiles, userGroups, pendingInvites, deleteExpense, deletePayment } = useExpense();
  const [activeTab, setActiveTab] = useState<'expenses' | 'balances' | 'members'>('expenses');
  const [expenseFilter, setExpenseFilter] = useState<'all' | 'mine'>('all');
  const [selectedExpenseForModal, setSelectedExpenseForModal] = useState<Expense | null>(null);
  const [selectedMemberForDetail, setSelectedMemberForDetail] = useState<Profile | null>(null);
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

  // Pairwise debts in this group
  const groupPairwise = calculatePairwiseBalances(expenses, payments, profiles, group.id);

  const isSoloMember = memberProfiles.length <= 1;

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
    <div className="space-y-6">
      {/* Group Card Header */}
      <div className="bg-white rounded-[2rem] ring-1 ring-zinc-200 p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="flex items-center space-x-4 min-w-0">
            {/* Foto a la izquierda */}
            {groupImageUrl ? (
              <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-2xl overflow-hidden ring-2 ring-zinc-100 shrink-0 shadow-sm">
                <Image
                  src={groupImageUrl}
                  alt={group.name}
                  fill
                  className="object-cover"
                  unoptimized
                  referrerPolicy="no-referrer"
                />
              </div>
            ) : (
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-zinc-900 text-white flex items-center justify-center text-2xl font-bold shrink-0 shadow-sm">
                <Users className="w-8 h-8" />
              </div>
            )}

            {/* A la derecha de la foto: Nombre en grande arriba, pequeña descripción de la cantidad de personas abajo */}
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl sm:text-3xl font-semibold text-zinc-900 tracking-tight truncate">
                {group.name}
              </h1>
            </div>
          </div>

          {/* A la derecha de todo esto: Botones de saldar y nuevo gasto */}
          <div className="flex items-center space-x-2.5 shrink-0 self-start sm:self-center">
            <button
              onClick={() => onOpenSettleModal(group.id)}
              className="flex items-center space-x-2 bg-white hover:bg-zinc-50 text-zinc-900 font-medium px-4 sm:px-5 py-2.5 rounded-full text-xs sm:text-sm transition-all ring-1 ring-zinc-200 shadow-sm active:scale-95 min-h-[44px]"
            >
              <Wallet className="w-4 h-4" />
              <span>Saldar</span>
            </button>

            <button
              onClick={() => onOpenNewExpense(group.id)}
              className="flex items-center space-x-2 bg-zinc-900 hover:bg-zinc-800 text-white font-medium px-4 sm:px-5 py-2.5 rounded-full text-xs sm:text-sm shadow-sm transition-all active:scale-95 min-h-[44px]"
            >
              <Plus className="w-4 h-4" />
              <span>Nuevo gasto</span>
            </button>
          </div>
        </div>
      </div>

      {/* SOLO MEMBER STRATEGY */}
      {isSoloMember && (
        <div className="bg-zinc-900 text-white p-6 sm:p-8 rounded-[2rem] shadow-lg relative overflow-hidden border border-zinc-800">
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-1.5 max-w-xl">
              <div className="inline-flex items-center space-x-2 bg-emerald-500/20 text-emerald-300 text-xs font-semibold px-3 py-1 rounded-full border border-emerald-500/30">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Grupo Listo</span>
              </div>
              <h3 className="text-xl font-semibold tracking-tight text-white">
                Eres la única persona en este grupo
              </h3>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
              <button
                onClick={() => onOpenAddMember(group.id)}
                className="flex items-center justify-center space-x-2 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold px-5 py-3 rounded-2xl text-sm transition-all active:scale-95 shadow-md min-h-[44px] cursor-pointer"
              >
                <UserPlus className="w-4 h-4" />
                <span>Añadir Integrante</span>
              </button>

              <button
                onClick={handleShareOrCopyLink}
                className="flex items-center justify-center space-x-2 bg-zinc-800 hover:bg-zinc-700 text-white font-medium px-5 py-3 rounded-2xl text-sm ring-1 ring-zinc-700 transition-all active:scale-95 min-h-[44px] cursor-pointer"
              >
                {copiedLink ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span className="text-emerald-300 font-semibold">¡Enlace Copiado!</span>
                  </>
                ) : (
                  <>
                    <Share2 className="w-4 h-4" />
                    <span>Compartir Enlace</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pestañas de Gastos, Balances y Miembros */}
      <div className="flex border-b border-zinc-200 overflow-x-auto">
        <button
          onClick={() => setActiveTab('expenses')}
          className={`flex items-center space-x-2 py-3.5 px-5 font-semibold text-sm border-b-2 whitespace-nowrap transition-all min-h-[44px] ${
            activeTab === 'expenses'
              ? 'border-zinc-900 text-zinc-900'
              : 'border-transparent text-zinc-500 hover:text-zinc-800'
          }`}
        >
          <Receipt className="w-4 h-4" />
          <span>Gastos ({groupExpenses.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('balances')}
          className={`flex items-center space-x-2 py-3.5 px-5 font-semibold text-sm border-b-2 whitespace-nowrap transition-all min-h-[44px] ${
            activeTab === 'balances'
              ? 'border-zinc-900 text-zinc-900'
              : 'border-transparent text-zinc-500 hover:text-zinc-800'
          }`}
        >
          <Wallet className="w-4 h-4" />
          <span>Balances ({groupPairwise.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('members')}
          className={`flex items-center space-x-2 py-3.5 px-5 font-semibold text-sm border-b-2 whitespace-nowrap transition-all min-h-[44px] ${
            activeTab === 'members'
              ? 'border-zinc-900 text-zinc-900'
              : 'border-transparent text-zinc-500 hover:text-zinc-800'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Miembros ({memberProfiles.length})</span>
        </button>
      </div>

      {/* TAB CONTENT: Expenses */}
      {activeTab === 'expenses' && (
        <div className="space-y-4">
          {/* Expenses Filter Bar */}
          <div className="flex items-center justify-between bg-zinc-50 p-1.5 rounded-2xl border border-zinc-200/80">
            <div className="flex items-center space-x-1">
              <button
                type="button"
                onClick={() => setExpenseFilter('all')}
                className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                  expenseFilter === 'all'
                    ? 'bg-white text-zinc-900 shadow-2xs'
                    : 'text-zinc-500 hover:text-zinc-900'
                }`}
              >
                Todos los gastos ({groupExpenses.length})
              </button>
              <button
                type="button"
                onClick={() => setExpenseFilter('mine')}
                className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                  expenseFilter === 'mine'
                    ? 'bg-white text-zinc-900 shadow-2xs'
                    : 'text-zinc-500 hover:text-zinc-900'
                }`}
              >
                En los que interactúo
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
            onSelectExpense={(exp) => setSelectedExpenseForModal(exp)}
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
          {groupPairwise.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 ring-1 ring-zinc-200 text-center space-y-2">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
              <h4 className="font-semibold text-zinc-900 text-base">¡Todas las cuentas están al día!</h4>
              <p className="text-zinc-500 text-xs">Nadie tiene deudas pendientes en este grupo.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {groupPairwise.map((p, idx) => (
                <div
                  key={idx}
                  className="bg-white rounded-2xl p-5 ring-1 ring-zinc-200 shadow-sm flex items-center justify-between"
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-full bg-zinc-800 text-white flex items-center justify-center text-sm font-bold shrink-0">
                      {p.debtor.full_name ? p.debtor.full_name.charAt(0).toUpperCase() : 'U'}
                    </div>
                    <div className="text-sm">
                      <p className="font-medium text-zinc-900">
                        {p.debtor.full_name} <span className="text-zinc-400 font-normal">le debe a</span> {p.creditor.full_name}
                      </p>
                      <p className="text-base font-semibold text-emerald-600 mt-0.5">
                        {formatCurrency(p.amount)}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => onOpenSettleModal(group.id, p.debtor.id, p.creditor.id, p.amount)}
                    className="bg-zinc-900 hover:bg-zinc-800 text-white font-medium px-4 py-2 rounded-full text-xs transition-all active:scale-95"
                  >
                    Saldar
                  </button>
                </div>
              ))}
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
      {/* Expense Detail Modal */}
      {selectedExpenseForModal && (
        <ExpenseDetailModal
          expense={selectedExpenseForModal}
          isOpen={Boolean(selectedExpenseForModal)}
          onClose={() => setSelectedExpenseForModal(null)}
          onEditExpense={(exp) => {
            setSelectedExpenseForModal(null);
            if (onEditExpense) onEditExpense(exp);
          }}
        />
      )}
    </div>
  );
}

