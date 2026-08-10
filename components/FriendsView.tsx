'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useExpense } from '@/lib/expense-context';
import { Profile } from '@/lib/types';
import { formatCurrency, calculatePairwiseBalances } from '@/lib/balance-utils';
import { isTempEmail, formatDisplayEmail } from '@/lib/utils';
import { MemberDetailModal } from '@/components/MemberDetailModal';
import {
  Users,
  UserPlus,
  TrendingUp,
  TrendingDown,
  Search,
  CheckCircle2,
  Wallet,
} from 'lucide-react';

interface FriendsViewProps {
  onOpenSettleModal: (groupId?: string, debtorId?: string, creditorId?: string, amount?: number) => void;
}

export function FriendsView({ onOpenSettleModal }: FriendsViewProps) {
  const { currentProfile, profiles, members, expenses, payments, userGroups, addGroupInvite } = useExpense();
  const [searchTerm, setSearchTerm] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [selectedFriend, setSelectedFriend] = useState<Profile | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [inviteSuccess, setInviteSuccess] = useState(false);

  // Get list of unique friends who share at least one group with current user
  const userGroupIds = new Set(userGroups.map((g) => g.id));
  const sharedMemberUserIds = new Set(
    members
      .filter((m) => userGroupIds.has(m.group_id))
      .map((m) => m.user_id)
  );

  const friendProfiles = profiles.filter(
    (p) => p.id !== currentProfile?.id && sharedMemberUserIds.has(p.id)
  );

  // Pairwise balances
  const userExpenses = expenses.filter((e) => userGroupIds.has(e.group_id));
  const userPayments = payments.filter((s) => userGroupIds.has(s.group_id));
  const consolidatedPairwise = calculatePairwiseBalances(userExpenses, userPayments, profiles);

  // Filter friends by search
  const filteredFriends = friendProfiles.filter((p) => {
    const query = searchTerm.toLowerCase();
    const nameMatch = p.full_name ? p.full_name.toLowerCase().includes(query) : false;
    const emailMatch = !isTempEmail(p.email) && p.email ? p.email.toLowerCase().includes(query) : false;
    return nameMatch || emailMatch;
  });

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim() || !userGroups[0]) return;

    setIsSubmitting(true);
    try {
      await addGroupInvite(userGroups[0].id, inviteEmail.trim());
      setInviteSuccess(true);
      setTimeout(() => {
        setInviteSuccess(false);
        setShowInviteModal(false);
        setInviteEmail('');
      }, 2000);
    } catch {
      // Error handling
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header Banner */}
      <div className="bg-zinc-900 rounded-[2rem] p-6 sm:p-10 text-white shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="inline-flex items-center space-x-2 bg-zinc-800 px-3 py-1 rounded-full text-xs font-semibold text-zinc-300">
            <Users className="w-3.5 h-3.5 text-emerald-400" />
            <span>Red de Amigos</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-white">
            Amigos y Saldos Directos
          </h1>
          <p className="text-zinc-400 text-sm sm:text-base max-w-xl leading-relaxed">
            Revisa las deudas y saldos con cada uno de tus amigos de forma transparente e individual.
          </p>
        </div>

        <button
          onClick={() => setShowInviteModal(true)}
          className="bg-white hover:bg-zinc-100 text-zinc-900 font-semibold px-6 py-3 rounded-full text-sm shadow-md transition-all active:scale-95 flex items-center justify-center space-x-2 shrink-0 min-h-[44px]"
        >
          <UserPlus className="w-4 h-4" />
          <span>Añadir o Invitar Amigo</span>
        </button>
      </div>

      {/* Search Bar */}
      <div className="bg-white p-4 rounded-2xl ring-1 ring-zinc-200 shadow-sm flex items-center space-x-3">
        <Search className="w-5 h-5 text-zinc-400" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Buscar amigo por nombre o correo..."
          className="w-full bg-transparent border-none text-sm text-zinc-900 focus:outline-none placeholder:text-zinc-400"
        />
      </div>

      {/* Friends Cards Grid */}
      {filteredFriends.length === 0 ? (
        <div className="bg-white rounded-3xl ring-1 ring-zinc-200 p-12 text-center space-y-3">
          <Users className="w-12 h-12 text-zinc-300 mx-auto" />
          <h3 className="font-semibold text-zinc-900 text-lg">No se encontraron amigos</h3>
          <p className="text-xs text-zinc-500 max-w-md mx-auto">
            Prueba invitando a tus amigos por correo electrónico para agregarlos a tus grupos.
          </p>
          <button
            onClick={() => setShowInviteModal(true)}
            className="bg-zinc-900 text-white text-xs font-semibold px-5 py-2.5 rounded-full"
          >
            Invitar Amigo
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredFriends.map((friend) => {
            // Find pairwise relations between current user and this friend
            const friendOwesMe = consolidatedPairwise.find(
              (p) => p.creditor.id === currentProfile?.id && p.debtor.id === friend.id
            );
            const iOweFriend = consolidatedPairwise.find(
              (p) => p.debtor.id === currentProfile?.id && p.creditor.id === friend.id
            );

            let debtStatus = 'al_dia';
            let amount = 0;

            if (friendOwesMe && friendOwesMe.amount > 0) {
              debtStatus = 'te_debe';
              amount = friendOwesMe.amount;
            } else if (iOweFriend && iOweFriend.amount > 0) {
              debtStatus = 'le_debes';
              amount = iOweFriend.amount;
            }

            return (
              <div
                key={friend.id}
                className="bg-white rounded-2xl ring-1 ring-zinc-200 p-6 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-5"
              >
                <Link
                  href={`/friends/${friend.id}`}
                  className="flex items-center space-x-4 cursor-pointer group"
                >
                  {friend.avatar_url ? (
                    <Image
                      src={friend.avatar_url}
                      alt={friend.full_name}
                      width={52}
                      height={52}
                      className="w-13 h-13 rounded-full object-cover ring-2 ring-zinc-100 shrink-0 group-hover:ring-zinc-900 transition-all duration-200"
                      unoptimized
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-13 h-13 rounded-full bg-zinc-900 text-white flex items-center justify-center text-lg font-bold shrink-0 group-hover:bg-zinc-800 transition-all duration-200">
                      {friend.full_name ? friend.full_name.charAt(0).toUpperCase() : 'A'}
                    </div>
                  )}

                  <div className="space-y-0.5 overflow-hidden">
                    <h3 className="font-semibold text-zinc-900 text-base group-hover:text-emerald-600 transition-colors truncate">
                      {friend.full_name}
                    </h3>
                    <p className="text-xs text-zinc-500 truncate">
                      {formatDisplayEmail(friend.email)}
                    </p>
                  </div>
                </Link>

                {/* Debt Status Card */}
                <div className="bg-zinc-50 rounded-xl p-4 ring-1 ring-zinc-100 flex items-center justify-between">
                  <span className="text-xs text-zinc-500 font-medium">Estado de Cuentas</span>
                  {debtStatus === 'te_debe' ? (
                    <span className="text-sm font-semibold text-emerald-600 flex items-center space-x-1">
                      <TrendingUp className="w-4 h-4" />
                      <span>Te debe {formatCurrency(amount)}</span>
                    </span>
                  ) : debtStatus === 'le_debes' ? (
                    <span className="text-sm font-semibold text-rose-600 flex items-center space-x-1">
                      <TrendingDown className="w-4 h-4" />
                      <span>Le debes {formatCurrency(amount)}</span>
                    </span>
                  ) : (
                    <span className="text-xs font-semibold text-zinc-600 bg-zinc-200/60 px-2.5 py-1 rounded-md flex items-center space-x-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                      <span>Al día</span>
                    </span>
                  )}
                </div>

                {/* Actions - Only show Saldar Cuenta if there is pending debt */}
                {debtStatus !== 'al_dia' && amount > 0 && (
                  <div className="pt-1">
                    <button
                      onClick={() => {
                        if (debtStatus === 'te_debe') {
                          onOpenSettleModal(undefined, friend.id, currentProfile?.id, amount);
                        } else if (debtStatus === 'le_debes') {
                          onOpenSettleModal(undefined, currentProfile?.id, friend.id, amount);
                        }
                      }}
                      className="w-full bg-zinc-900 hover:bg-zinc-800 hover:shadow-md text-white font-medium py-2.5 rounded-xl text-xs transition-all duration-200 active:scale-95 flex items-center justify-center space-x-1.5 min-h-[40px] cursor-pointer"
                    >
                      <Wallet className="w-3.5 h-3.5" />
                      <span>Saldar Cuenta</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Member Detail Modal (Friend Profile) */}
      <MemberDetailModal
        isOpen={Boolean(selectedFriend)}
        onClose={() => setSelectedFriend(null)}
        context="friends"
        memberProfile={selectedFriend}
      />

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/70 backdrop-blur-sm">
          <div className="bg-white rounded-[2rem] ring-1 ring-zinc-200 shadow-2xl w-full max-w-md p-6 sm:p-8 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-lg text-zinc-900">Invitar Nuevo Amigo</h3>
              <button
                onClick={() => setShowInviteModal(false)}
                className="p-2 text-zinc-400 hover:text-zinc-900 rounded-full"
              >
                ✕
              </button>
            </div>

            {inviteSuccess ? (
              <div className="p-4 bg-emerald-50 ring-1 ring-emerald-200 text-emerald-800 rounded-xl text-sm font-medium flex items-center space-x-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <span>¡Invitación enviada con éxito!</span>
              </div>
            ) : (
              <form onSubmit={handleSendInvite} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">
                    Correo Electrónico
                  </label>
                  <input
                    type="email"
                    required
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="amigo@ejemplo.com"
                    className="w-full px-4 py-3 bg-zinc-50 border-none ring-1 ring-zinc-200 rounded-xl text-sm focus:ring-2 focus:ring-zinc-900"
                  />
                </div>

                <div className="flex justify-end space-x-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowInviteModal(false)}
                    className="px-4 py-2.5 rounded-full ring-1 ring-zinc-200 text-xs font-medium"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || !inviteEmail.trim()}
                    className="px-5 py-2.5 rounded-full bg-zinc-900 text-white text-xs font-semibold shadow-sm hover:bg-zinc-800 disabled:opacity-50"
                  >
                    {isSubmitting ? 'Enviando...' : 'Enviar Invitación'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

