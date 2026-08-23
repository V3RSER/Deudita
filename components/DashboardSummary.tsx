'use client';

import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useExpense } from '@/lib/expense-context';
import { formatCurrency, calculatePairwiseBalances, calculateUserSummaries } from '@/lib/balance-utils';
import { getGroupImage, getGroupCategoryConfig, getGroupCategoryLabel } from '@/lib/group-utils';
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  ArrowRightLeft,
  Users,
  Plus,
  Receipt,
  ArrowRight,
  Sparkles,
  Calendar,
  CheckCircle2,
  MinusCircle,
  ChevronRight,
  Clock,
  UserPlus,
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';

interface DashboardSummaryProps {
  onOpenNewExpense: () => void;
  onOpenNewGroup: () => void;
  onOpenSettleModal: () => void;
  onOpenScanReceiptModal: () => void;
}

export function DashboardSummary({
  onOpenNewExpense,
  onOpenNewGroup,
  onOpenSettleModal,
  onOpenScanReceiptModal,
}: DashboardSummaryProps) {
  const router = useRouter();
  const {
    currentProfile,
    userGroups,
    members,
    expenses,
    payments,
    profiles,
    pendingInvites,
    acceptGroupInvite,
    rejectGroupInvite,
  } = useExpense();

  const [processingInviteId, setProcessingInviteId] = React.useState<string | null>(null);

  const handleAcceptInvite = async (inviteId: string) => {
    try {
      setProcessingInviteId(inviteId);
      await acceptGroupInvite(inviteId);
    } catch (err) {
      console.error('Error al aceptar invitación:', err);
    } finally {
      setProcessingInviteId(null);
    }
  };

  const handleRejectInvite = async (inviteId: string) => {
    try {
      setProcessingInviteId(inviteId);
      await rejectGroupInvite(inviteId);
    } catch (err) {
      console.error('Error al rechazar invitación:', err);
    } finally {
      setProcessingInviteId(null);
    }
  };

  const userGroupIds = new Set(userGroups.map((g) => g.id));
  const userExpenses = expenses.filter((e) => userGroupIds.has(e.group_id));
  const userPayments = payments.filter((s) => userGroupIds.has(s.group_id));

  // Pairwise balances
  const consolidatedPairwise = calculatePairwiseBalances(userExpenses, userPayments, profiles);
  const myOwedToMe = consolidatedPairwise.filter((p) => p.creditor.id === currentProfile?.id);
  const myIOwe = consolidatedPairwise.filter((p) => p.debtor.id === currentProfile?.id);

  const totalOwedToMe = myOwedToMe.reduce((acc, curr) => acc + curr.amount, 0);
  const totalIOwe = myIOwe.reduce((acc, curr) => acc + curr.amount, 0);
  const netBalance = totalOwedToMe - totalIOwe;

  // Recent Expenses (top 4)
  const recentExpenses = [...userExpenses]
    .sort((a, b) => new Date(b.expense_date || b.created_at).getTime() - new Date(a.expense_date || a.created_at).getTime())
    .slice(0, 4);

  const groupMap = new Map(userGroups.map((g) => [g.id, g]));
  const profileMap = new Map(profiles.map((p) => [p.id, p]));

  const firstName = currentProfile?.full_name ? currentProfile.full_name.split(' ')[0] : 'Usuario';

  return (
    <div className="space-y-8">
      <PageHeader
        title={`¡Hola, ${firstName}!`}
        subtitle="Aquí tienes el resumen actualizado de tus balances y actividad reciente."
        icon={<Sparkles className="w-4 h-4" />}
      />

      {/* Pending Invites Alert */}
      {pendingInvites && pendingInvites.length > 0 && (
        <div className="bg-amber-50 text-amber-900 rounded-2xl p-5 shadow-sm ring-1 ring-amber-200/70 space-y-3">
          <div className="flex items-center space-x-2">
            <span className="bg-amber-200/60 text-amber-900 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md">
              Invitación Pendiente ({pendingInvites.length})
            </span>
          </div>

          {pendingInvites.map((invite) => {
            const groupName = invite.group ? invite.group.name : 'Un grupo';
            const inviterName = invite.inviter ? invite.inviter.full_name : 'Un compañero';

            return (
              <div
                key={invite.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-amber-100 shadow-xs"
              >
                <div>
                  <h4 className="font-semibold text-zinc-900 text-sm">
                    Te han invitado a unirte a <span className="font-bold">&quot;{groupName}&quot;</span>
                  </h4>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    Enviada por <strong className="text-zinc-700">{inviterName}</strong>
                  </p>
                </div>

                <div className="flex items-center space-x-2 shrink-0">
                  <button
                    onClick={() => handleRejectInvite(invite.id)}
                    disabled={processingInviteId === invite.id}
                    className="px-3.5 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-lg text-xs font-medium transition cursor-pointer"
                  >
                    Rechazar
                  </button>
                  <button
                    onClick={() => handleAcceptInvite(invite.id)}
                    disabled={processingInviteId === invite.id}
                    className="px-4 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 rounded-lg text-xs font-semibold shadow-xs transition cursor-pointer"
                  >
                    Aceptar e Ingresar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <div className="bg-white rounded-2xl p-6 ring-1 ring-zinc-200 shadow-sm flex flex-col justify-center">
          <span className="text-xs text-zinc-500 uppercase font-bold tracking-wider block">
            Te deben
          </span>
          <div className="flex items-center space-x-2 mt-2">
            <TrendingUp className="w-5 h-5 text-emerald-500 shrink-0" />
            <span className="text-2xl font-bold text-zinc-900 tracking-tight">
              {formatCurrency(totalOwedToMe)}
            </span>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-6 ring-1 ring-zinc-200 shadow-sm flex flex-col justify-center">
          <span className="text-xs text-zinc-500 uppercase font-bold tracking-wider block">
            Debes
          </span>
          <div className="flex items-center space-x-2 mt-2">
            <TrendingDown className="w-5 h-5 text-rose-500 shrink-0" />
            <span className="text-2xl font-bold text-zinc-900 tracking-tight">
              {formatCurrency(totalIOwe)}
            </span>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-6 ring-1 ring-zinc-200 shadow-sm flex flex-col justify-center">
          <span className="text-xs text-zinc-500 uppercase font-bold tracking-wider block">
            Balance neto
          </span>
          <div className="flex items-center space-x-2 mt-2">
            <ArrowRightLeft className="w-5 h-5 text-zinc-400 shrink-0" />
            <span
              className={`text-2xl font-bold tracking-tight ${
                netBalance >= 0 ? 'text-emerald-600' : 'text-rose-600'
              }`}
            >
              {netBalance >= 0 ? '+' : ''}
              {formatCurrency(netBalance)}
            </span>
          </div>
        </div>
      </div>

      {/* Quick Action Shortcuts */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <button
          onClick={onOpenNewExpense}
          className="p-4 sm:p-5 bg-white hover:bg-zinc-50 rounded-2xl ring-1 ring-zinc-200 shadow-sm hover:shadow-md transition-all active:scale-95 text-left flex flex-col justify-between space-y-3 group min-h-[90px] cursor-pointer"
        >
          <div className="w-10 h-10 rounded-xl bg-zinc-900 text-white flex items-center justify-center group-hover:scale-105 transition-transform">
            <Plus className="w-5 h-5" />
          </div>
          <div>
            <p className="font-semibold text-zinc-900 text-sm">Nuevo Gasto</p>
          </div>
        </button>

        <button
          onClick={onOpenSettleModal}
          className="p-4 sm:p-5 bg-white hover:bg-zinc-50 rounded-2xl ring-1 ring-zinc-200 shadow-sm hover:shadow-md transition-all active:scale-95 text-left flex flex-col justify-between space-y-3 group min-h-[90px] cursor-pointer"
        >
          <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center group-hover:scale-105 transition-transform">
            <Wallet className="w-5 h-5" />
          </div>
          <div>
            <p className="font-semibold text-zinc-900 text-sm">Saldar Cuenta</p>
          </div>
        </button>

        <button
          onClick={onOpenScanReceiptModal}
          className="p-4 sm:p-5 bg-white hover:bg-zinc-50 rounded-2xl ring-1 ring-zinc-200 shadow-sm hover:shadow-md transition-all active:scale-95 text-left flex flex-col justify-between space-y-3 group min-h-[90px] cursor-pointer"
        >
          <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center group-hover:scale-105 transition-transform">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <p className="font-semibold text-zinc-900 text-sm">Escanear Ticket</p>
          </div>
        </button>

        <Link
          href="/balances"
          className="p-4 sm:p-5 bg-white hover:bg-zinc-50 rounded-2xl ring-1 ring-zinc-200 shadow-sm hover:shadow-md transition-all active:scale-95 text-left flex flex-col justify-between space-y-3 group min-h-[90px]"
        >
          <div className="w-10 h-10 rounded-xl bg-zinc-800 text-white flex items-center justify-center group-hover:scale-105 transition-transform">
            <ArrowRightLeft className="w-5 h-5" />
          </div>
          <div>
            <p className="font-semibold text-zinc-900 text-sm">Ver Balances</p>
          </div>
        </Link>

        <Link
          href="/my-expenses"
          className="p-4 sm:p-5 bg-white hover:bg-zinc-50 rounded-2xl ring-1 ring-zinc-200 shadow-sm hover:shadow-md transition-all active:scale-95 text-left flex flex-col justify-between space-y-3 group min-h-[90px]"
        >
          <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center group-hover:scale-105 transition-transform">
            <Receipt className="w-5 h-5" />
          </div>
          <div>
            <p className="font-semibold text-zinc-900 text-sm">Historial Gastos</p>
          </div>
        </Link>
      </div>

      {/* ACCESO DIRECTO A MIS GRUPOS (DIRECT ACCESS TO MY GROUPS) */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-zinc-900 tracking-tight">
                Mis Grupos
              </h2>
              <p className="text-xs text-zinc-500">
                Acceso directo a los grupos en los que participas
              </p>
            </div>
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-zinc-100 text-zinc-700 border border-zinc-200">
              {userGroups.length}
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={onOpenNewGroup}
              className="hidden sm:inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-xs font-semibold transition active:scale-95 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Crear Grupo</span>
            </button>
            <Link
              href="/groups"
              className="inline-flex items-center space-x-1 text-xs font-semibold text-emerald-600 hover:text-emerald-700 px-2.5 py-1.5 rounded-lg hover:bg-emerald-50 transition"
            >
              <span>Ver todos</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {userGroups.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 ring-1 ring-zinc-200 shadow-sm text-center">
            <div className="w-14 h-14 bg-zinc-100 text-zinc-400 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <Users className="w-7 h-7" />
            </div>
            <h3 className="text-base font-bold text-zinc-900">Aún no perteneces a ningún grupo</h3>
            <p className="text-xs text-zinc-500 max-w-sm mx-auto mt-1 mb-5">
              Crea un grupo para comenzar a dividir gastos con amigos, familiares o compañeros de piso.
            </p>
            <button
              onClick={onOpenNewGroup}
              className="inline-flex items-center space-x-2 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold px-4 py-2 rounded-xl text-sm transition shadow-sm cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Crear mi primer grupo</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {userGroups.map((group) => {
              // Calculate user's specific balance in this group
              const userSummaries = calculateUserSummaries(expenses, payments, profiles, group.id);
              const mySummary = userSummaries.find((s) => s.user.id === currentProfile?.id);
              const groupNetBalance = mySummary ? mySummary.netBalance : 0;

              // Member count
              const groupMemberCount = members.filter((m) => m.group_id === group.id).length;

              const groupImg = getGroupImage(group);
              const catConfig = getGroupCategoryConfig(group.category);
              const CategoryIcon = catConfig.icon;
              const catLabel = getGroupCategoryLabel(group.category);

              return (
                <div
                  key={group.id}
                  onClick={() => router.push(`/groups/${group.id}`)}
                  className="group bg-white rounded-2xl p-4 ring-1 ring-zinc-200 shadow-sm hover:shadow-md hover:ring-emerald-500/40 transition-all cursor-pointer flex flex-col justify-between gap-3 relative overflow-hidden active:scale-[0.99]"
                >
                  <div className="flex items-start gap-3.5">
                    {/* Thumbnail / Category Icon */}
                    <div
                      className={`relative w-14 h-14 shrink-0 rounded-xl flex items-center justify-center overflow-hidden border border-zinc-100 ${
                        !groupImg ? catConfig.bgColor : ''
                      }`}
                    >
                      {groupImg ? (
                        <Image
                          src={groupImg}
                          alt={group.name}
                          fill
                          className="object-cover group-hover:scale-105 transition-transform duration-300"
                          unoptimized
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className={catConfig.textColor}>
                          <CategoryIcon className="w-6 h-6" />
                        </div>
                      )}
                    </div>

                    {/* Title & Category Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${catConfig.bgColor} ${catConfig.textColor}`}>
                          {catLabel}
                        </span>
                        <span className="text-[11px] text-zinc-400 font-medium">
                          {groupMemberCount} {groupMemberCount === 1 ? 'miembro' : 'miembros'}
                        </span>
                      </div>
                      <h3 className="text-base font-bold text-zinc-900 truncate group-hover:text-emerald-700 transition-colors">
                        {group.name}
                      </h3>
                    </div>
                  </div>

                  {/* Balance status bar & direct arrow */}
                  <div className="pt-2 border-t border-zinc-100 flex items-center justify-between text-xs">
                    <div>
                      {Math.abs(groupNetBalance) < 0.5 ? (
                        <span className="font-medium text-zinc-500 flex items-center">
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-zinc-400" /> Al día
                        </span>
                      ) : groupNetBalance > 0 ? (
                        <span className="font-bold text-emerald-600 flex items-center">
                          <TrendingUp className="w-3.5 h-3.5 mr-1 text-emerald-500" /> Te deben{' '}
                          {formatCurrency(groupNetBalance, group.currency)}
                        </span>
                      ) : (
                        <span className="font-bold text-rose-600 flex items-center">
                          <TrendingDown className="w-3.5 h-3.5 mr-1 text-rose-500" /> Debes{' '}
                          {formatCurrency(Math.abs(groupNetBalance), group.currency)}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center text-zinc-400 group-hover:text-emerald-600 font-medium transition-colors">
                      <span className="text-[11px] mr-0.5 hidden sm:inline">Entrar</span>
                      <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Quick add card at the end of the grid */}
            <button
              onClick={onOpenNewGroup}
              className="bg-zinc-50/70 hover:bg-zinc-100/80 rounded-2xl p-4 border-2 border-dashed border-zinc-200 hover:border-zinc-300 transition-all flex items-center justify-center gap-3 text-zinc-600 hover:text-zinc-900 group cursor-pointer min-h-[100px]"
            >
              <div className="w-10 h-10 rounded-xl bg-white ring-1 ring-zinc-200 flex items-center justify-center text-zinc-600 group-hover:scale-105 group-hover:text-emerald-600 transition-all shadow-xs">
                <Plus className="w-5 h-5" />
              </div>
              <div className="text-left">
                <p className="font-semibold text-sm">Nuevo Grupo</p>
                <p className="text-[11px] text-zinc-400">Crear otro espacio</p>
              </div>
            </button>
          </div>
        )}
      </section>

      {/* RECENT EXPENSES SECTION */}
      {recentExpenses.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <div className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-800 flex items-center justify-center">
                <Receipt className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-zinc-900 tracking-tight">
                  Actividad Reciente
                </h2>
                <p className="text-xs text-zinc-500">Últimos gastos registrados</p>
              </div>
            </div>

            <Link
              href="/my-expenses"
              className="inline-flex items-center space-x-1 text-xs font-semibold text-zinc-600 hover:text-zinc-900 px-2.5 py-1.5 rounded-lg hover:bg-zinc-100 transition"
            >
              <span>Ver todos</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="bg-white rounded-2xl ring-1 ring-zinc-200 shadow-sm divide-y divide-zinc-100 overflow-hidden">
            {recentExpenses.map((expense) => {
              const payer = profileMap.get(expense.paid_by);
              const group = groupMap.get(expense.group_id);
              const isPayerMe = expense.paid_by === currentProfile?.id;
              const formattedDate = expense.expense_date
                ? new Date(expense.expense_date).toLocaleDateString('es-ES', {
                    day: 'numeric',
                    month: 'short',
                  })
                : 'Reciente';

              return (
                <div
                  key={expense.id}
                  onClick={() => {
                    if (group) {
                      router.push(`/groups/${group.id}`);
                    } else {
                      router.push('/my-expenses');
                    }
                  }}
                  className="p-4 hover:bg-zinc-50/80 transition-colors flex items-center justify-between gap-3 cursor-pointer group"
                >
                  <div className="flex items-center space-x-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-zinc-100 flex items-center justify-center shrink-0 text-zinc-600 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
                      <Receipt className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-semibold text-sm text-zinc-900 truncate group-hover:text-indigo-600 transition-colors">
                        {expense.description}
                      </h4>
                      <p className="text-xs text-zinc-500 truncate">
                        {group ? <span className="font-medium text-zinc-700">{group.name}</span> : 'Grupo'} •{' '}
                        {isPayerMe ? 'Pagaste tú' : `Pagó ${payer?.full_name?.split(' ')[0] || 'alguien'}`}
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="font-bold text-sm text-zinc-900 block">
                      {formatCurrency(expense.total_amount, group?.currency)}
                    </span>
                    <span className="text-[11px] text-zinc-400 flex items-center justify-end gap-1 mt-0.5">
                      <Calendar className="w-3 h-3" />
                      {formattedDate}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
