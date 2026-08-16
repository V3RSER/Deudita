'use client';

import React, { useEffect, useState, use } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useExpense } from '@/lib/expense-context';
import { Profile, Group, Expense } from '@/lib/types';
import { formatCurrency, calculatePairwiseBalances } from '@/lib/balance-utils';
import { getCategoryConfig } from '@/lib/expense-category-utils';
import { formatDisplayEmail, isTempEmail } from '@/lib/utils';
import { ConfirmModal } from '@/components/ConfirmModal';
import { SettleDebtModal } from '@/components/SettleDebtModal';
import {
  ArrowLeft,
  Users,
  Wallet,
  UserMinus,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  Calendar,
  ChevronRight,
  ShieldCheck,
  Clock,
  Sparkles,
} from 'lucide-react';

export default function FriendDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const friendId = resolvedParams.id;
  const router = useRouter();

  const {
    currentProfile,
    profiles,
    userGroups,
    groups,
    members,
    expenses,
    payments,
    deleteFriend,
    refreshData,
  } = useExpense();

  const [isDeleting, setIsDeleting] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [showSettleModal, setShowSettleModal] = useState(false);

  // Friend Profile from context
  const friendProfile = profiles.find((p) => p.id === friendId);

  // Groups in common
  const sharedGroupIds = new Set(
    members
      .filter((m) => m.user_id === friendId && userGroups.some((g) => g.id === m.group_id))
      .map((m) => m.group_id)
  );

  const sharedGroups = groups.filter((g) => sharedGroupIds.has(g.id));

  // Shared expenses
  const sharedExpenses = expenses.filter((e) => sharedGroupIds.has(e.group_id));
  const sharedPayments = payments.filter((p) => sharedGroupIds.has(p.group_id));

  // Pairwise balance
  const pairwise = calculatePairwiseBalances(sharedExpenses, sharedPayments, profiles);
  const friendOwesMe = pairwise.find(
    (b) => b.debtor.id === friendId && b.creditor.id === currentProfile?.id
  );
  const iOweFriend = pairwise.find(
    (b) => b.debtor.id === currentProfile?.id && b.creditor.id === friendId
  );

  let netBalance = 0;
  if (friendOwesMe) netBalance += friendOwesMe.amount;
  if (iOweFriend) netBalance -= iOweFriend.amount;

  const isRegistered = Boolean(friendProfile?.email && !isTempEmail(friendProfile.email));

  const handleDeleteFriend = async () => {
    try {
      setIsDeleting(true);
      await deleteFriend(friendId);
      setShowConfirmDelete(false);
      router.push('/friends');
    } catch (err) {
      console.error('Error al eliminar amigo:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  if (!friendProfile) {
    return (
      <div className="max-w-4xl mx-auto py-12 px-4 text-center space-y-4">
        <p className="text-zinc-500 font-medium">Cargando perfil del amigo...</p>
        <Link
          href="/friends"
          className="inline-flex items-center space-x-2 text-xs font-semibold text-zinc-900 bg-zinc-100 px-4 py-2 rounded-xl hover:bg-zinc-200 transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Volver a Amigos</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 space-y-6 animate-in fade-in duration-200">
      {/* Navigation Header */}
      <div className="flex items-center justify-between">
        <Link
          href="/friends"
          className="inline-flex items-center space-x-2 text-xs font-semibold text-zinc-600 hover:text-zinc-900 bg-white hover:bg-zinc-50 border border-zinc-200/80 px-3.5 py-2 rounded-xl transition-all shadow-2xs active:scale-95"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Volver a Amigos</span>
        </Link>

        <button
          onClick={() => setShowConfirmDelete(true)}
          disabled={isDeleting}
          className="inline-flex items-center space-x-1.5 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100/80 border border-rose-200 px-3.5 py-2 rounded-xl transition-all active:scale-95 disabled:opacity-50"
        >
          <UserMinus className="w-4 h-4 text-rose-600" />
          <span>Eliminar de Mis Amigos</span>
        </button>
      </div>

      {/* Main Profile Header Card */}
      <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="p-6 sm:p-8 bg-zinc-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="flex items-center space-x-4">
            {friendProfile.avatar_url ? (
              <Image
                src={friendProfile.avatar_url}
                alt={friendProfile.full_name}
                width={72}
                height={72}
                className="w-18 h-18 rounded-2xl object-cover ring-2 ring-zinc-700 shrink-0"
                unoptimized
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-18 h-18 rounded-2xl bg-zinc-800 ring-2 ring-zinc-700 flex items-center justify-center text-white text-2xl font-bold shrink-0">
                {friendProfile.full_name?.charAt(0).toUpperCase() || 'A'}
              </div>
            )}

            <div className="space-y-1">
              <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                <h1 className="text-2xl font-extrabold text-zinc-50 tracking-tight">
                  {friendProfile.full_name}
                </h1>
                {isRegistered ? (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    <ShieldCheck className="w-3 h-3 mr-1" />
                    Registrado
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    <Clock className="w-3 h-3 mr-1" />
                    Invitado
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-400 font-medium">
                {formatDisplayEmail(friendProfile.email)}
              </p>
            </div>
          </div>

          {/* Balance Status Card */}
          <div className="bg-zinc-800/80 ring-1 ring-zinc-700/80 p-5 rounded-2xl shrink-0 sm:min-w-[220px] space-y-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">
              Estado de Cuentas
            </span>

            {netBalance > 0 ? (
              <div className="space-y-1">
                <div className="flex items-center space-x-1.5 text-emerald-400">
                  <TrendingUp className="w-4 h-4 shrink-0" />
                  <span className="text-xs font-bold uppercase">Te debe</span>
                </div>
                <span className="text-2xl font-black text-white block tracking-tight">
                  {formatCurrency(netBalance)}
                </span>
              </div>
            ) : netBalance < 0 ? (
              <div className="space-y-1">
                <div className="flex items-center space-x-1.5 text-rose-400">
                  <TrendingDown className="w-4 h-4 shrink-0" />
                  <span className="text-xs font-bold uppercase">Le debes</span>
                </div>
                <span className="text-2xl font-black text-white block tracking-tight">
                  {formatCurrency(Math.abs(netBalance))}
                </span>
              </div>
            ) : (
              <div className="flex items-center space-x-2 text-zinc-300 pt-1">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                <span className="text-sm font-bold">Al día (Sin deudas)</span>
              </div>
            )}

            {netBalance !== 0 && (
              <button
                onClick={() => setShowSettleModal(true)}
                className="w-full mt-3 py-2 px-3 bg-white hover:bg-zinc-100 text-zinc-900 text-xs font-bold rounded-xl transition-all active:scale-95 flex items-center justify-center space-x-1.5 shadow-sm"
              >
                <Wallet className="w-3.5 h-3.5" />
                <span>Saldar Cuenta</span>
              </button>
            )}
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 sm:p-8 space-y-8">
          {/* Groups in Common */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-500 flex items-center space-x-2">
                <Users className="w-4 h-4 text-zinc-400" />
                <span>Grupos en Común ({sharedGroups.length})</span>
              </h2>
            </div>

            {sharedGroups.length === 0 ? (
              <div className="p-6 bg-zinc-50 rounded-2xl text-center border border-dashed border-zinc-200">
                <p className="text-xs text-zinc-500 font-medium">
                  No compartes grupos actualmente con {friendProfile.full_name}.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {sharedGroups.map((group) => {
                  const groupMembers = members.filter((m) => m.group_id === group.id);
                  return (
                    <Link
                      key={group.id}
                      href={`/groups/${group.id}`}
                      className="p-4 bg-zinc-50 hover:bg-zinc-100/80 border border-zinc-200/80 rounded-2xl transition-all flex items-center justify-between group active:scale-98"
                    >
                      <div className="space-y-1 overflow-hidden pr-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md inline-block">
                          {group.category || 'General'}
                        </span>
                        <h3 className="font-semibold text-zinc-900 text-sm group-hover:text-emerald-700 transition-colors truncate">
                          {group.name}
                        </h3>
                        <p className="text-xs text-zinc-500">
                          {groupMembers.length} integrantes
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-zinc-400 group-hover:text-zinc-900 transition-colors shrink-0" />
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          {/* Shared Expenses */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-500 flex items-center space-x-2">
                <Sparkles className="w-4 h-4 text-zinc-400" />
                <span>Gastos Compartidos ({sharedExpenses.length})</span>
              </h2>
            </div>

            {sharedExpenses.length === 0 ? (
              <div className="p-6 bg-zinc-50 rounded-2xl text-center border border-dashed border-zinc-200">
                <p className="text-xs text-zinc-500 font-medium">
                  No hay gastos registrados en común con {friendProfile.full_name}.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {sharedExpenses.slice(0, 10).map((expense) => {
                  const catConfig = getCategoryConfig(expense.category || 'General');
                  const IconComp = catConfig.icon;
                  const payer = profiles.find((p) => p.id === expense.paid_by);

                  return (
                    <Link
                      key={expense.id}
                      href={`/expenses/${expense.id}`}
                      className="p-4 bg-white hover:bg-zinc-50 border border-zinc-200/80 rounded-2xl transition-all flex items-center justify-between gap-4 group active:scale-98"
                    >
                      <div className="flex items-center space-x-3.5 overflow-hidden">
                        <div className={`w-10 h-10 rounded-xl ${catConfig.bgClass} ${catConfig.textClass} flex items-center justify-center shrink-0 border border-zinc-200/60`}>
                          <IconComp className="w-5 h-5" />
                        </div>
                        <div className="space-y-0.5 overflow-hidden">
                          <h4 className="font-semibold text-zinc-900 text-sm group-hover:text-emerald-700 transition-colors truncate">
                            {expense.description}
                          </h4>
                          <p className="text-xs text-zinc-500 flex items-center space-x-2">
                            <span>Pagado por {payer ? (payer.id === currentProfile?.id ? 'ti' : payer.full_name) : 'alguien'}</span>
                            <span>•</span>
                            <span className="flex items-center space-x-1">
                              <Calendar className="w-3 h-3 text-zinc-400" />
                              <span>{expense.expense_date}</span>
                            </span>
                          </p>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="font-extrabold text-zinc-900 text-sm block">
                          {formatCurrency(expense.total_amount)}
                        </span>
                        <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider block">
                          {expense.category || 'General'}
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Settle Up Modal */}
      {showSettleModal && (
        <SettleDebtModal
          isOpen={showSettleModal}
          onClose={() => setShowSettleModal(false)}
          defaultDebtorId={netBalance < 0 ? currentProfile?.id : friendId}
          defaultCreditorId={netBalance < 0 ? friendId : currentProfile?.id}
          defaultAmount={Math.abs(netBalance)}
        />
      )}

      {/* Confirm Delete Modal */}
      <ConfirmModal
        isOpen={showConfirmDelete}
        onClose={() => setShowConfirmDelete(false)}
        onConfirm={handleDeleteFriend}
        title="Eliminar de Mis Amigos"
        description={`¿Estás seguro de que deseas eliminar a "${friendProfile.full_name}" de tu lista de amigos? Seguirá formando parte de los grupos que compartan y se conservarán todos sus gastos.`}
        confirmText="Eliminar"
        isLoading={isDeleting}
      />
    </div>
  );
}
