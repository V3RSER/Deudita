'use client';

import React from 'react';
import Image from 'next/image';
import { useExpense } from '@/lib/expense-context';
import { Group } from '@/lib/types';
import { formatCurrency, calculateUserSummaries } from '@/lib/balance-utils';
import {
  Users,
  TrendingUp,
  TrendingDown,
  MinusCircle,
  ChevronRight,
  Plus,
} from 'lucide-react';

import { getGroupImage, getGroupCategoryConfig } from '@/lib/group-utils';
import { PageHeader } from '@/components/PageHeader';

interface GroupListProps {
  onSelectGroup: (group: Group) => void;
  onOpenNewGroup?: () => void;
}

export function GroupList({ onSelectGroup, onOpenNewGroup }: GroupListProps) {
  const { currentProfile, userGroups, expenses, payments, profiles, pendingInvites, acceptGroupInvite, rejectGroupInvite } = useExpense();
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
        title="Mis Grupos"
        subtitle="Administra los grupos donde compartes gastos."
        icon={<Users className="w-5 h-5" />}
        actions={
          onOpenNewGroup && (
            <button
              onClick={onOpenNewGroup}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-2 rounded-xl text-xs sm:text-sm shadow-xs transition-all active:scale-95 flex items-center space-x-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Crear grupo</span>
            </button>
          )
        }
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
                    className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl text-xs font-medium transition cursor-pointer"
                  >
                    Rechazar
                  </button>
                  <button
                    onClick={() => handleAcceptInvite(invite.id)}
                    disabled={processingInviteId === invite.id}
                    className="px-5 py-2 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 rounded-xl text-xs font-semibold shadow-sm transition cursor-pointer"
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
        <div className="text-center py-16 bg-white rounded-3xl border border-zinc-200/80 p-8 shadow-sm space-y-4">
          <div className="w-16 h-16 bg-zinc-100 rounded-2xl flex items-center justify-center mx-auto text-zinc-400">
            <Users className="w-8 h-8" />
          </div>
          <h3 className="text-base font-bold text-zinc-900">Aún no perteneces a ningún grupo</h3>
          <p className="text-zinc-500 text-sm max-w-md mx-auto">
            Crea un nuevo grupo para comenzar a dividir gastos con tus amigos o compañeros.
          </p>
          {onOpenNewGroup && (
            <div className="pt-2">
              <button
                onClick={onOpenNewGroup}
                className="inline-flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-2 rounded-xl text-sm shadow-xs transition-all active:scale-95 cursor-pointer"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
                <span>Crear mi primer grupo</span>
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
                className="group bg-white rounded-2xl p-4 ring-1 ring-zinc-200 shadow-xs hover:shadow-md hover:ring-emerald-500/30 transition-all cursor-pointer flex items-center gap-3.5 relative overflow-hidden active:scale-[0.98]"
              >
                {/* Square rounded image or Icon */}
                <div className={`relative w-14 h-14 shrink-0 rounded-xl flex items-center justify-center overflow-hidden border border-zinc-100 ${!groupImg ? catConfig.bgColor : ''}`}>
                  {groupImg ? (
                    <Image src={groupImg} alt={group.name} fill className="object-cover group-hover:scale-105 transition-transform duration-300" unoptimized referrerPolicy="no-referrer" />
                  ) : (
                    <div className={catConfig.textColor}>
                      <CategoryIcon className="w-6 h-6" />
                    </div>
                  )}
                </div>

                {/* Info: Group Name and How much they owe */}
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm sm:text-base font-bold text-zinc-900 truncate group-hover:text-emerald-700 transition-colors">
                    {group.name}
                  </h3>
                  
                  {/* Balance Status */}
                  <div className="mt-1 text-xs">
                    {Math.abs(netBalance) < 0.5 ? (
                      <span className="font-medium text-zinc-500 flex items-center">
                        <MinusCircle className="w-3.5 h-3.5 mr-1" /> Al día
                      </span>
                    ) : netBalance > 0 ? (
                      <span className="font-bold text-emerald-600 flex items-center">
                        <TrendingUp className="w-3.5 h-3.5 mr-1" /> Te deben {formatCurrency(netBalance, group.currency)}
                      </span>
                    ) : (
                      <span className="font-bold text-rose-600 flex items-center">
                        <TrendingDown className="w-3.5 h-3.5 mr-1" /> Debes {formatCurrency(Math.abs(netBalance), group.currency)}
                      </span>
                    )}
                  </div>
                </div>
                
                <ChevronRight className="w-4 h-4 text-zinc-300 group-hover:text-emerald-500 group-hover:translate-x-0.5 transition-all shrink-0" />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
