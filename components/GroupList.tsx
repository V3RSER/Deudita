'use client';

import React from 'react';
import Image from 'next/image';
import { useExpense } from '@/lib/expense-context';
import { Group, GroupCategory } from '@/lib/types';
import { formatCurrency, calculateUserSummaries } from '@/lib/balance-utils';
import {
  Home,
  Plane,
  Heart,
  Calendar,
  Briefcase,
  Folder,
  Users,
  ArrowRight,
  Plus,
  Receipt,
  TrendingUp,
  TrendingDown,
  MinusCircle,
  Calculator,
} from 'lucide-react';

import { getGroupImage, getCleanGroupDescription, getGroupCategoryLabel } from '@/lib/group-utils';

interface GroupListProps {
  onSelectGroup: (group: Group) => void;
  onOpenNewGroup: () => void;
}

const CATEGORY_ICONS: Record<GroupCategory, React.ReactNode> = {
  friends: <Users className="w-5 h-5 text-emerald-500" />,
  trip: <Plane className="w-5 h-5 text-sky-500" />,
  home: <Home className="w-5 h-5 text-indigo-500" />,
  couple: <Heart className="w-5 h-5 text-rose-500" />,
  event: <Calendar className="w-5 h-5 text-amber-500" />,
  accounting: <Calculator className="w-5 h-5 text-purple-500" />,
  work: <Briefcase className="w-5 h-5 text-blue-500" />,
  other: <Folder className="w-5 h-5 text-slate-500" />,
};

const CATEGORY_LABELS: Record<GroupCategory, string> = {
  friends: 'Amigos',
  trip: 'Viajes',
  home: 'Hogar',
  couple: 'Pareja',
  event: 'Eventos',
  accounting: 'Contabilidad',
  work: 'Trabajo',
  other: 'Otros',
};

export function GroupList({ onSelectGroup, onOpenNewGroup }: GroupListProps) {
  const { currentProfile, userGroups, members, expenses, payments, profiles, pendingInvites, acceptGroupInvite, rejectGroupInvite } = useExpense();
  const [processingInviteId, setProcessingInviteId] = React.useState<string | null>(null);

  const handleAcceptInvite = async (inviteId: string) => {
    try {
      setProcessingInviteId(inviteId);
      await acceptGroupInvite(inviteId);
    } catch (err) {
      console.error('Error al aceptar:', err);
    } finally {
      setProcessingInviteId(null);
    }
  };

  const handleRejectInvite = async (inviteId: string) => {
    try {
      setProcessingInviteId(inviteId);
      await rejectGroupInvite(inviteId);
    } catch (err) {
      console.error('Error al rechazar:', err);
    } finally {
      setProcessingInviteId(null);
    }
  };

  return (
    <div className="space-y-8">
      {/* PENDING INVITES BANNER */}
      {pendingInvites.length > 0 && (
        <div className="bg-zinc-900 text-white rounded-[2rem] p-6 shadow-xl border border-zinc-800 space-y-4">
          <div className="flex items-center space-x-2">
            <span className="bg-emerald-500/20 text-emerald-300 text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full border border-emerald-500/30">
              Invitación Pendiente
            </span>
          </div>

          {pendingInvites.map((invite) => {
            const groupName = invite.group ? invite.group.name : 'Un grupo';
            const inviterName = invite.inviter ? invite.inviter.full_name : 'Un integrante';

            return (
              <div key={invite.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-zinc-800/80 p-4 rounded-2xl border border-zinc-700/60">
                <div>
                  <h4 className="font-bold text-white text-base">
                    Te han invitado al grupo <span className="text-emerald-400">&quot;{groupName}&quot;</span>
                  </h4>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Invitado por <strong className="text-zinc-200">{inviterName}</strong>
                  </p>
                </div>

                <div className="flex items-center space-x-2 shrink-0">
                  <button
                    onClick={() => handleRejectInvite(invite.id)}
                    disabled={processingInviteId === invite.id}
                    className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 rounded-xl text-xs font-medium transition"
                  >
                    Rechazar
                  </button>
                  <button
                    onClick={() => handleAcceptInvite(invite.id)}
                    disabled={processingInviteId === invite.id}
                    className="px-5 py-2 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 rounded-xl text-xs font-semibold shadow-md transition"
                  >
                    Aceptar e Ingresar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Group Grid Header */}
      <div className="flex items-center justify-between pt-2">
        <div>
          <h2 className="text-xl sm:text-2xl font-semibold text-zinc-900 tracking-tight">
            Mis Grupos <span className="text-zinc-400 font-normal">({userGroups.length})</span>
          </h2>
          <p className="text-xs text-zinc-500 mt-1">
            Selecciona un grupo para ver gastos o crea uno nuevo en segundos.
          </p>
        </div>

        <button
          onClick={onOpenNewGroup}
          className="flex items-center space-x-2 bg-zinc-900 hover:bg-zinc-800 text-white font-semibold px-4 sm:px-5 py-2.5 rounded-full text-xs sm:text-sm shadow-md transition-all active:scale-95 min-h-[44px]"
        >
          <Plus className="w-4 h-4" />
          <span>Crear Grupo</span>
        </button>
      </div>

      {/* Group Cards */}
      {userGroups.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-3xl border border-slate-200 p-8 shadow-sm">
          <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto text-slate-400 mb-4">
            <Users className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-slate-800">Aún no perteneces a ningún grupo</h3>
          <p className="text-slate-500 text-sm max-w-md mx-auto mt-1 mb-6">
            Crea tu primer grupo para empezar a dividir gastos con tus amigos, roomies o familiares.
          </p>
          <button
            onClick={onOpenNewGroup}
            className="inline-flex items-center space-x-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-5 py-2.5 rounded-xl transition"
          >
            <Plus className="w-5 h-5" />
            <span>Crear un Grupo</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {userGroups.map((group) => {
            const groupMembers = members.filter((m) => m.group_id === group.id);
            const memberProfiles = groupMembers
              .map((m) => profiles.find((p) => p.id === m.user_id))
              .filter((p): p is NonNullable<typeof p> => p !== undefined);

            const groupExpenses = expenses.filter((e) => e.group_id === group.id);
            const totalGroupSpent = groupExpenses.reduce((acc, curr) => acc + curr.total_amount, 0);

            // Calculate current user's balance in this specific group
            const userSummaries = calculateUserSummaries(expenses, payments, profiles, group.id);
            const mySummary = userSummaries.find((s) => s.user.id === currentProfile?.id);
            const netBalance = mySummary ? mySummary.netBalance : 0;

            const groupImg = getGroupImage(group);
            const cleanDesc = getCleanGroupDescription(group.description);

            return (
              <div
                key={group.id}
                onClick={() => onSelectGroup(group)}
                className="group bg-white rounded-[1.5rem] p-6 ring-1 ring-zinc-200 shadow-sm hover:shadow-md hover:ring-zinc-300 transition-all cursor-pointer flex flex-col justify-between relative overflow-hidden active:scale-[0.98]"
              >
                <div>
                  {/* Optional Group Banner Image */}
                  {groupImg && (
                    <div className="relative w-[calc(100%+3rem)] h-28 -mt-6 -mx-6 mb-4 overflow-hidden border-b border-zinc-100 bg-zinc-100">
                      <Image
                        src={groupImg}
                        alt={group.name}
                        fill
                        className="object-cover group-hover:scale-105 transition-transform duration-300"
                        unoptimized
                        referrerPolicy="no-referrer"
                      />
                    </div>
                  )}

                  {/* Category & Status Header */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-2.5 bg-zinc-50 px-3 py-1.5 rounded-lg ring-1 ring-zinc-100">
                      {CATEGORY_ICONS[group.category] ?? CATEGORY_ICONS.other}
                      <span className="text-[11px] font-medium text-zinc-600 uppercase tracking-wider">
                        {getGroupCategoryLabel(group.category)}
                      </span>
                    </div>

                    <span className="text-xs text-zinc-400 font-medium flex items-center space-x-1">
                      <Receipt className="w-3.5 h-3.5" />
                      <span>{groupExpenses.length}</span>
                    </span>
                  </div>

                  {/* Group Name & Description */}
                  <h3 className="text-lg font-semibold text-zinc-900 group-hover:text-zinc-700 transition-colors">
                    {group.name}
                  </h3>
                  {cleanDesc && (
                    <p className="text-sm text-zinc-500 mt-1.5 line-clamp-2 leading-relaxed">
                      {cleanDesc}
                    </p>
                  )}

                  {/* Member Avatars */}
                  <div className="mt-6 flex items-center justify-between">
                    <div className="flex -space-x-2 overflow-hidden">
                      {memberProfiles.map((p) =>
                        p.avatar_url ? (
                          <Image
                            key={p.id}
                            src={p.avatar_url}
                            alt={p.full_name}
                            title={p.full_name}
                            width={32}
                            height={32}
                            className="w-8 h-8 rounded-full ring-2 ring-white object-cover"
                            unoptimized
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div
                            key={p.id}
                            title={p.full_name}
                            className="w-8 h-8 rounded-full ring-2 ring-white bg-zinc-800 text-white flex items-center justify-center text-xs font-semibold"
                          >
                            {p.full_name ? p.full_name.charAt(0).toUpperCase() : 'U'}
                          </div>
                        )
                      )}
                    </div>
                    <span className="text-xs font-medium text-zinc-400">
                      {memberProfiles.length} integrantes
                    </span>
                  </div>
                </div>

                {/* Footer Metrics */}
                <div className="mt-8 pt-5 border-t border-zinc-100 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] uppercase font-semibold text-zinc-400 tracking-wider block">
                      Total Gastado
                    </span>
                    <span className="text-sm font-semibold text-zinc-900 mt-0.5 block">
                      {formatCurrency(totalGroupSpent)}
                    </span>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] uppercase font-semibold text-zinc-400 tracking-wider block mb-1">
                      Tu Estado
                    </span>
                    {Math.abs(netBalance) < 0.5 ? (
                      <span className="inline-flex items-center text-xs font-medium text-zinc-500 bg-zinc-50 px-2 py-1 rounded-md">
                        <MinusCircle className="w-3.5 h-3.5 mr-1.5 text-zinc-400" />
                        Al día
                      </span>
                    ) : netBalance > 0 ? (
                      <span className="inline-flex items-center text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-1 rounded-md">
                        <TrendingUp className="w-3.5 h-3.5 mr-1.5 text-emerald-500" />
                        +{formatCurrency(netBalance)}
                      </span>
                    ) : (
                      <span className="inline-flex items-center text-xs font-medium text-rose-700 bg-rose-50 px-2 py-1 rounded-md">
                        <TrendingDown className="w-3.5 h-3.5 mr-1.5 text-rose-500" />
                        -{formatCurrency(Math.abs(netBalance))}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
