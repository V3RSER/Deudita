'use client';

import React from 'react';
import Image from 'next/image';
import { useExpense } from '@/lib/expense-context';
import { Group } from '@/lib/types';
import { formatCurrency, calculateUserSummaries } from '@/lib/balance-utils';
import {
  Plus,
  Users,
  TrendingUp,
  TrendingDown,
  MinusCircle,
  ChevronRight,
} from 'lucide-react';

import { getGroupImage, getGroupCategoryConfig } from '@/lib/group-utils';

interface GroupListProps {
  onSelectGroup: (group: Group) => void;
  onOpenNewGroup: () => void;
}

import { PageHeader } from '@/components/PageHeader';

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
    <div className="space-y-6">
      <PageHeader 
        title={`Mis Grupos (${userGroups.length})`}
        subtitle="Administra los grupos donde compartes gastos."
        icon={<Users className="w-5 h-5" />}
      />

      {/* PENDING INVITES BANNER */}
      {pendingInvites.length > 0 && (
        <div className="bg-amber-50 text-amber-900 rounded-[1.5rem] p-5 shadow-sm border border-amber-200/60 space-y-4">
          <div className="flex items-center space-x-2">
            <span className="bg-amber-200/50 text-amber-800 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md">
              Invitación Pendiente
            </span>
          </div>

          {pendingInvites.map((invite) => {
            const groupName = invite.group ? invite.group.name : 'Un grupo';
            const inviterName = invite.inviter ? invite.inviter.full_name : 'Un integrante';

            return (
              <div key={invite.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-amber-100 shadow-sm">
                <div>
                  <h4 className="font-semibold text-zinc-900 text-sm">
                    Te han invitado al grupo <span className="font-bold">&quot;{groupName}&quot;</span>
                  </h4>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    Invitado por <strong className="text-zinc-700">{inviterName}</strong>
                  </p>
                </div>

                <div className="flex items-center space-x-2 shrink-0">
                  <button
                    onClick={() => handleRejectInvite(invite.id)}
                    disabled={processingInviteId === invite.id}
                    className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl text-xs font-medium transition"
                  >
                    Rechazar
                  </button>
                  <button
                    onClick={() => handleAcceptInvite(invite.id)}
                    disabled={processingInviteId === invite.id}
                    className="px-5 py-2 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 rounded-xl text-xs font-semibold shadow-sm transition"
                  >
                    Aceptar e Ingresar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

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
            // Calculate current user's balance in this specific group
            const userSummaries = calculateUserSummaries(expenses, payments, profiles, group.id);
            const mySummary = userSummaries.find((s) => s.user.id === currentProfile?.id);
            const netBalance = mySummary ? mySummary.netBalance : 0;

            const groupImg = getGroupImage(group);
            const catConfig = getGroupCategoryConfig(group.category);
            const CategoryIcon = catConfig.icon;

            return (
              <div
                key={group.id}
                onClick={() => onSelectGroup(group)}
                className="group bg-white rounded-2xl p-4 ring-1 ring-zinc-200 shadow-sm hover:shadow-md hover:ring-emerald-500/30 transition-all cursor-pointer flex items-center gap-4 relative overflow-hidden active:scale-[0.98]"
              >
                {/* Square rounded image or Icon */}
                <div className={`relative w-16 h-16 sm:w-20 sm:h-20 shrink-0 rounded-xl flex items-center justify-center overflow-hidden border border-zinc-100 ${!groupImg ? catConfig.bgColor : ''}`}>
                  {groupImg ? (
                    <Image src={groupImg} alt={group.name} fill className="object-cover group-hover:scale-105 transition-transform duration-300" unoptimized referrerPolicy="no-referrer" />
                  ) : (
                    <div className={catConfig.textColor}>
                      <CategoryIcon className="w-6 h-6" />
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-bold text-zinc-900 truncate group-hover:text-emerald-700 transition-colors">
                    {group.name}
                  </h3>
                  
                  {/* Balance Status */}
                  <div className="mt-1.5">
                    {Math.abs(netBalance) < 0.5 ? (
                      <span className="text-sm font-medium text-zinc-500 flex items-center">
                        <MinusCircle className="w-4 h-4 mr-1.5" /> Al día
                      </span>
                    ) : netBalance > 0 ? (
                      <span className="text-sm font-bold text-emerald-600 flex items-center">
                        <TrendingUp className="w-4 h-4 mr-1.5" /> Te deben {formatCurrency(netBalance)}
                      </span>
                    ) : (
                      <span className="text-sm font-bold text-rose-600 flex items-center">
                        <TrendingDown className="w-4 h-4 mr-1.5" /> Debes {formatCurrency(Math.abs(netBalance))}
                      </span>
                    )}
                  </div>
                </div>
                
                <ChevronRight className="w-5 h-5 text-zinc-300 group-hover:text-emerald-500 transition-colors shrink-0" />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
