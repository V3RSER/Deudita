'use client';

import React, { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { useExpense } from '@/lib/expense-context';
import { Profile } from '@/lib/types';
import { formatDisplayEmail, isTempEmail } from '@/lib/utils';
import {
  X,
  UserPlus,
  Mail,
  AlertCircle,
  Plus,
  Loader2,
  Users,
  CheckCircle2,
  Search,
} from 'lucide-react';

interface AddMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupId?: string;
  initialTab?: 'link' | 'new' | 'friends';
}

export function AddMemberModal({
  isOpen,
  onClose,
  groupId,
}: AddMemberModalProps) {
  const {
    currentProfile,
    profiles,
    members,
    userGroups,
    addGroupInvite,
  } = useExpense();

  const [selectedGroupId, setSelectedGroupId] = useState<string>(groupId ?? userGroups[0]?.id ?? '');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [friendSearch, setFriendSearch] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [addedMemberName, setAddedMemberName] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const prevIsOpenRef = useRef(false);
  const prevGroupIdRef = useRef<string | undefined>(groupId);

  const activeGroupId = groupId ?? selectedGroupId ?? (userGroups[0] ? userGroups[0].id : '');
  const group = userGroups.find((g) => g.id === activeGroupId);
  const groupName = group ? group.name : 'Grupo';

  useEffect(() => {
    if (!isOpen) {
      prevIsOpenRef.current = false;
      return;
    }
    const isOpening = !prevIsOpenRef.current;
    const isGroupChanged = groupId !== prevGroupIdRef.current;

    if (isOpening || isGroupChanged) {
      prevIsOpenRef.current = true;
      prevGroupIdRef.current = groupId;
      setSelectedGroupId(groupId ?? userGroups[0]?.id ?? '');
      setName('');
      setEmail('');
      setFriendSearch('');
      setAddedMemberName(null);
      setErrorMsg(null);
      setIsSubmitting(false);
    }
  }, [isOpen, groupId, userGroups]);

  if (!isOpen) return null;

  // Filter friends who are NOT currently in this group
  const groupMemberUserIds = new Set(
    members.filter((m) => m.group_id === activeGroupId).map((m) => m.user_id)
  );

  const availableFriends = profiles.filter((p) => {
    if (!p.id || p.id === currentProfile?.id) return false;
    if (groupMemberUserIds.has(p.id)) return false;
    return true;
  });

  const query = friendSearch.trim().toLowerCase();
  const filteredFriends = availableFriends.filter((p) => {
    if (!query) return true;
    const nameMatch = p.full_name ? p.full_name.toLowerCase().includes(query) : false;
    const emailMatch = !isTempEmail(p.email) && p.email ? p.email.toLowerCase().includes(query) : false;
    return nameMatch || emailMatch;
  });

  const handleNameChange = (val: string) => {
    if (val.includes('@') && !email) {
      const parts = val.trim().split('@');
      const cleanName = parts[0] ? parts[0].charAt(0).toUpperCase() + parts[0].slice(1) : '';
      setName(cleanName);
      setEmail(val.trim().toLowerCase());
    } else {
      setName(val);
    }
  };

  const handleAddNewMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting || !name.trim() || !activeGroupId) return;

    try {
      setIsSubmitting(true);
      setErrorMsg(null);

      const cleanName = name.trim();
      const cleanEmail = email.trim() ? email.trim().toLowerCase() : undefined;

      await addGroupInvite(activeGroupId, cleanEmail, cleanName);
      setAddedMemberName(cleanName);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al añadir al integrante';
      setErrorMsg(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSelectFriend = async (friend: Profile) => {
    if (isSubmitting || !activeGroupId) return;
    try {
      setIsSubmitting(true);
      setErrorMsg(null);

      const friendName = friend.full_name ?? 'Amigo';
      const friendEmail = isTempEmail(friend.email) || !friend.email ? undefined : friend.email;

      await addGroupInvite(activeGroupId, friendEmail, friendName, friend.id);
      setAddedMemberName(friendName);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al añadir al integrante';
      setErrorMsg(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetForNext = () => {
    setName('');
    setEmail('');
    setFriendSearch('');
    setAddedMemberName(null);
    setErrorMsg(null);
  };

  const handleCloseModal = () => {
    handleResetForNext();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-zinc-200 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="bg-zinc-900 text-white px-6 py-5 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-zinc-800 flex items-center justify-center text-zinc-100 font-bold shrink-0">
              <UserPlus className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                {addedMemberName ? '¡Integrante añadido!' : 'Añadir Integrante'}
              </h2>
              <p className="text-xs text-zinc-400">
                Grupo <span className="font-medium text-zinc-200">{groupName}</span>
              </p>
            </div>
          </div>

          <button
            onClick={handleCloseModal}
            className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-full transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5">
          {errorMsg && (
            <div className="p-3.5 bg-rose-50 text-rose-700 border border-rose-200 rounded-xl text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Group Selector if opened without specific groupId */}
          {!groupId && userGroups.length > 1 && !addedMemberName && (
            <div>
              <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5">
                Grupo de Destino *
              </label>
              <select
                value={activeGroupId}
                onChange={(e) => setSelectedGroupId(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-zinc-50 border border-zinc-200 hover:bg-zinc-100/80 rounded-xl text-xs font-semibold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900 transition-all cursor-pointer"
              >
                {userGroups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Success State */}
          {addedMemberName ? (
            <div className="space-y-4 py-2">
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-2xl p-4 flex items-center space-x-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <div>
                  <p className="text-xs font-bold text-emerald-950">
                    {addedMemberName} ahora forma parte del grupo
                  </p>
                  <p className="text-[11px] text-emerald-800 mt-0.5">
                    Ya puedes seleccionarlo al registrar y dividir gastos.
                  </p>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleResetForNext}
                  className="flex-1 py-2.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 rounded-xl text-xs font-semibold transition-all cursor-pointer"
                >
                  Añadir otro
                </button>
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="flex-1 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-semibold transition-all cursor-pointer"
                >
                  Listo
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Form to add by name & optional email */}
              <form onSubmit={handleAddNewMember} className="space-y-3.5">
                <div>
                  <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5">
                    Nombre o Apodo *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Mateo Gómez o Mamá"
                    value={name}
                    onChange={(e) => handleNameChange(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-semibold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:bg-white transition-all placeholder:text-zinc-400"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5">
                    Correo Electrónico (Opcional)
                  </label>
                  <div className="relative">
                    <Mail className="w-3.5 h-3.5 text-zinc-400 absolute left-3.5 top-3" />
                    <input
                      type="email"
                      placeholder="mateo@ejemplo.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full pl-9 pr-3.5 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-semibold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:bg-white transition-all placeholder:text-zinc-400"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting || !name.trim()}
                  className="w-full py-3 bg-zinc-900 hover:bg-zinc-800 text-white font-semibold text-xs rounded-xl shadow-xs transition-all active:scale-98 disabled:opacity-50 flex items-center justify-center space-x-2 cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                      <span>Añadiendo...</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4 text-emerald-400" />
                      <span>Añadir al Grupo</span>
                    </>
                  )}
                </button>
              </form>

              {/* Friends list to add with 1 click */}
              {availableFriends.length > 0 && (
                <div className="pt-3 border-t border-zinc-100 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center space-x-1">
                      <Users className="w-3.5 h-3.5" />
                      <span>O añade desde tus amigos ({availableFriends.length})</span>
                    </span>
                  </div>

                  {availableFriends.length > 4 && (
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        placeholder="Buscar amigo..."
                        value={friendSearch}
                        onChange={(e) => setFriendSearch(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 bg-zinc-50 border border-zinc-200 rounded-lg text-xs font-medium text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                      />
                    </div>
                  )}

                  <div className="max-h-40 overflow-y-auto space-y-1.5 pr-0.5">
                    {filteredFriends.slice(0, 8).map((friend) => {
                      const displayEmail = formatDisplayEmail(friend.email);
                      return (
                        <div
                          key={friend.id}
                          className="flex items-center justify-between p-2 hover:bg-zinc-50 border border-zinc-100 rounded-xl transition-colors"
                        >
                          <div className="flex items-center space-x-2.5 min-w-0">
                            {friend.avatar_url ? (
                              <Image
                                src={friend.avatar_url}
                                alt={friend.full_name ?? 'Amigo'}
                                width={28}
                                height={28}
                                className="w-7 h-7 rounded-full object-cover shrink-0"
                                unoptimized
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <div className="w-7 h-7 rounded-full bg-zinc-900 text-white flex items-center justify-center text-[10px] font-bold shrink-0">
                                {friend.full_name ? friend.full_name.charAt(0).toUpperCase() : 'A'}
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-zinc-900 truncate">
                                {friend.full_name ?? 'Sin nombre'}
                              </p>
                              {displayEmail && (
                                <p className="text-[10px] text-zinc-400 truncate">
                                  {displayEmail}
                                </p>
                              )}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleSelectFriend(friend)}
                            disabled={isSubmitting}
                            className="px-2.5 py-1 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-[11px] font-semibold rounded-lg shrink-0 transition-colors flex items-center space-x-1 cursor-pointer"
                          >
                            <Plus className="w-3 h-3" />
                            <span>Añadir</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
