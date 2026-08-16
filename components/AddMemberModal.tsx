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
  Link as LinkIcon,
  Share2,
  Check,
  Send,
  AlertCircle,
  ArrowRight,
  Plus,
  Loader2,
  Users,
  CheckCircle2,
} from 'lucide-react';

interface AddMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupId?: string;
}

export function AddMemberModal({ isOpen, onClose, groupId }: AddMemberModalProps) {
  const { currentProfile, profiles, members, userGroups, addGroupInvite } = useExpense();

  const [activeTab, setActiveTab] = useState<'new' | 'friends'>('new');
  const [selectedGroupId, setSelectedGroupId] = useState<string>(groupId ?? userGroups[0]?.id ?? '');
  
  // New member inputs
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');

  // Friend search
  const [friendSearch, setFriendSearch] = useState('');

  // Submission state & Success result
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [addedMember, setAddedMember] = useState<{
    name: string;
    email?: string;
    id?: string;
    inviteUrl?: string;
  } | null>(null);

  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const prevIsOpenRef = useRef(false);
  const prevGroupIdRef = useRef<string | undefined>(groupId);

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
      setActiveTab('new');
      setSelectedGroupId(groupId ?? userGroups[0]?.id ?? '');
      setName('');
      setEmail('');
      setFriendSearch('');
      setAddedMember(null);
      setCopied(false);
      setErrorMsg(null);
      setIsSubmitting(false);
    }
  }, [isOpen, groupId, userGroups]);

  const activeGroupId = groupId ?? selectedGroupId ?? (userGroups[0] ? userGroups[0].id : '');

  if (!isOpen) return null;

  const group = userGroups.find((g) => g.id === activeGroupId);
  const groupName = group ? group.name : 'Grupo';

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

  // Handle smart name input (if user types/pastes an email into the name field)
  const handleNameChange = (val: string) => {
    if (val.includes('@') && !email) {
      // User entered an email in the name field
      const parts = val.trim().split('@');
      const cleanName = parts[0] ? parts[0].charAt(0).toUpperCase() + parts[0].slice(1) : '';
      setName(cleanName);
      setEmail(val.trim().toLowerCase());
    } else {
      setName(val);
    }
  };

  // Submit new member form
  const handleAddNewMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting || !name.trim() || !activeGroupId) return;

    try {
      setIsSubmitting(true);
      setErrorMsg(null);

      const cleanName = name.trim();
      const cleanEmail = email.trim() ? email.trim().toLowerCase() : undefined;

      const result = await addGroupInvite(activeGroupId, cleanEmail, cleanName);

      setAddedMember({
        name: cleanName,
        email: cleanEmail,
        id: result.memberId,
        inviteUrl: result.inviteUrl,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al añadir al integrante';
      setErrorMsg(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Add friend directly from existing contacts list
  const handleSelectFriend = async (friend: Profile) => {
    if (isSubmitting || !activeGroupId) return;
    try {
      setIsSubmitting(true);
      setErrorMsg(null);

      const friendName = friend.full_name ?? 'Amigo';
      const friendEmail = isTempEmail(friend.email) || !friend.email ? undefined : friend.email;

      const result = await addGroupInvite(activeGroupId, friendEmail, friendName, friend.id);

      setAddedMember({
        name: friendName,
        email: friendEmail,
        id: result.memberId ?? friend.id,
        inviteUrl: result.inviteUrl,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al añadir al integrante';
      setErrorMsg(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyLink = async () => {
    if (addedMember?.inviteUrl && typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(addedMember.inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleNativeShare = async () => {
    if (!addedMember?.inviteUrl) return;

    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        await (navigator as any).share({
          title: `Unirse a ${groupName}`,
          text: `¡Hola! Te agregué al grupo "${groupName}" en Deudita para compartir gastos. Únete aquí:`,
          url: addedMember.inviteUrl,
        });
        return;
      } catch {
        // Share dismissed
        return;
      }
    }
    await handleCopyLink();
  };

  const handleResetForNext = () => {
    setName('');
    setEmail('');
    setFriendSearch('');
    setAddedMember(null);
    setCopied(false);
    setErrorMsg(null);
  };

  const handleCloseModal = () => {
    handleResetForNext();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/70 backdrop-blur-sm">
      <div className="bg-white rounded-[2rem] ring-1 ring-zinc-200 shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="bg-zinc-900 text-white p-6 flex items-center justify-between">
          <div className="flex items-center space-x-3.5">
            <div className="w-10 h-10 rounded-2xl bg-zinc-800 ring-1 ring-zinc-700 flex items-center justify-center text-zinc-100 font-bold shrink-0">
              <UserPlus className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-zinc-50">
                {addedMember ? '¡Integrante Añadido!' : 'Añadir Integrante'}
              </h2>
              <p className="text-xs text-zinc-400">
                Grupo <span className="font-medium text-white">{groupName}</span>
              </p>
            </div>
          </div>

          <button
            onClick={handleCloseModal}
            className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5">
          {errorMsg && (
            <div className="p-3.5 bg-rose-50 text-rose-700 border border-rose-200 rounded-2xl text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Group Selector if modal opened without specific groupId */}
          {!groupId && userGroups.length > 1 && !addedMember && (
            <div>
              <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5">
                Grupo de Destino *
              </label>
              <select
                value={activeGroupId}
                onChange={(e) => setSelectedGroupId(e.target.value)}
                className="w-full px-3.5 py-3 bg-zinc-50 border border-zinc-200 hover:bg-zinc-100/80 hover:border-zinc-300 rounded-xl text-xs font-semibold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900 transition-all cursor-pointer"
              >
                {userGroups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* SUCCESS STATE */}
          {addedMember ? (
            <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-200">
              {/* Member Card */}
              <div className="bg-emerald-50/70 border border-emerald-100 rounded-2xl p-4 space-y-3">
                <div className="flex items-center space-x-3.5">
                  <div className="w-11 h-11 bg-zinc-900 text-white rounded-2xl flex items-center justify-center font-bold text-base shadow-sm shrink-0">
                    {addedMember.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-zinc-900 text-sm truncate">{addedMember.name}</h3>
                    {addedMember.email ? (
                      <div className="flex items-center space-x-1 text-xs text-emerald-700 font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span className="truncate">Invitación enviada a {addedMember.email}</span>
                      </div>
                    ) : (
                      <p className="text-xs text-zinc-500">
                        Integrante añadido (sin correo electrónico)
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Share & Copy Link Section */}
              <div className="space-y-3">
                <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                  Enlace de Invitación para Compartir
                </label>

                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="w-full flex items-center justify-center space-x-2 bg-zinc-900 hover:bg-zinc-800 text-white py-3 px-4 rounded-xl text-xs font-semibold shadow-sm transition-all active:scale-95"
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-400" />
                      <span className="text-emerald-300 font-bold">¡Enlace Copiado al Portapapeles!</span>
                    </>
                  ) : (
                    <>
                      <LinkIcon className="w-4 h-4 text-zinc-400" />
                      <span>Copiar Enlace de Invitación</span>
                    </>
                  )}
                </button>

                {typeof navigator !== 'undefined' && 'share' in navigator && (
                  <button
                    type="button"
                    onClick={handleNativeShare}
                    className="w-full flex items-center justify-center space-x-2 bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 text-zinc-800 py-2.5 px-4 rounded-xl text-xs font-semibold transition-all active:scale-95"
                  >
                    <Share2 className="w-4 h-4 text-zinc-600" />
                    <span>Compartir por WhatsApp u otras apps</span>
                  </button>
                )}
              </div>

              {/* Footer Actions */}
              <div className="pt-3 border-t border-zinc-100 flex gap-2">
                <button
                  type="button"
                  onClick={handleResetForNext}
                  className="flex-1 py-3 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 rounded-xl text-xs font-semibold transition-all active:scale-95"
                >
                  Añadir Otro
                </button>
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold transition-all active:scale-95"
                >
                  Listo
                </button>
              </div>
            </div>
          ) : (
            /* FORM STATE */
            <div className="space-y-4">
              {/* Tab Selector if available friends exist */}
              {availableFriends.length > 0 && (
                <div className="flex bg-zinc-100 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setActiveTab('new')}
                    className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-center space-x-1.5 ${
                      activeTab === 'new'
                        ? 'bg-white text-zinc-900 shadow-xs'
                        : 'text-zinc-600 hover:text-zinc-900'
                    }`}
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>Nuevo Integrante</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('friends')}
                    className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-center space-x-1.5 ${
                      activeTab === 'friends'
                        ? 'bg-white text-zinc-900 shadow-xs'
                        : 'text-zinc-600 hover:text-zinc-900'
                    }`}
                  >
                    <Users className="w-3.5 h-3.5" />
                    <span>Tus Amigos ({availableFriends.length})</span>
                  </button>
                </div>
              )}

              {activeTab === 'new' ? (
                <form onSubmit={handleAddNewMember} className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5">
                      Nombre o Apodo *
                    </label>
                    <div className="relative">
                      <UserPlus className="w-4 h-4 text-zinc-400 absolute left-3.5 top-3.5" />
                      <input
                        type="text"
                        required
                        placeholder="Ej: Carlos Gómez o Mamá"
                        value={name}
                        onChange={(e) => handleNameChange(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl text-sm font-medium text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:bg-white transition-all"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5">
                      Correo Electrónico (Opcional)
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-zinc-400 absolute left-3.5 top-3.5" />
                      <input
                        type="email"
                        placeholder="carlos@ejemplo.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl text-sm font-medium text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:bg-white transition-all"
                      />
                    </div>
                    <p className="text-[11px] text-zinc-500 mt-1.5 leading-relaxed">
                      {email.trim()
                        ? 'Se le enviará un correo con el enlace de invitación para unirse al grupo.'
                        : 'Si no pones correo, se creará como integrante para asignarle gastos de inmediato.'}
                    </p>
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting || !name.trim()}
                    className="w-full py-3.5 bg-zinc-900 hover:bg-zinc-800 text-white font-semibold text-xs rounded-xl shadow-sm hover:shadow-md transition-all duration-200 active:scale-95 disabled:opacity-50 flex items-center justify-center space-x-2 mt-2"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                        <span>Añadiendo...</span>
                      </>
                    ) : email.trim() ? (
                      <>
                        <Send className="w-4 h-4 text-emerald-400" />
                        <span>Añadir y Enviar Invitación</span>
                      </>
                    ) : (
                      <>
                        <span>Añadir al Grupo</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </form>
              ) : (
                /* FRIENDS TAB */
                <div className="space-y-3">
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Buscar amigo por nombre o correo..."
                      value={friendSearch}
                      onChange={(e) => setFriendSearch(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-medium text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900"
                    />
                  </div>

                  <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                    {filteredFriends.length === 0 ? (
                      <p className="text-xs text-zinc-400 text-center py-6">
                        No se encontraron amigos que coincidan con la búsqueda.
                      </p>
                    ) : (
                      filteredFriends.map((friend) => {
                        const displayEmail = formatDisplayEmail(friend.email);
                        return (
                          <div
                            key={friend.id}
                            className="flex items-center justify-between p-3 bg-zinc-50 hover:bg-zinc-100/80 border border-zinc-200/80 rounded-xl transition-all"
                          >
                            <div className="flex items-center space-x-3 overflow-hidden">
                              {friend.avatar_url ? (
                                <Image
                                  src={friend.avatar_url}
                                  alt={friend.full_name ?? 'Amigo'}
                                  width={36}
                                  height={36}
                                  className="w-9 h-9 rounded-full object-cover ring-1 ring-zinc-200 shrink-0"
                                  unoptimized
                                  referrerPolicy="no-referrer"
                                />
                              ) : (
                                <div className="w-9 h-9 rounded-full bg-zinc-900 text-white flex items-center justify-center text-xs font-bold shrink-0">
                                  {friend.full_name ? friend.full_name.charAt(0).toUpperCase() : 'A'}
                                </div>
                              )}
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-zinc-900 truncate">
                                  {friend.full_name ?? 'Sin nombre'}
                                </p>
                                <p className="text-[11px] text-zinc-500 truncate">
                                  {displayEmail}
                                </p>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleSelectFriend(friend)}
                              disabled={isSubmitting}
                              className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-semibold rounded-lg shrink-0 transition-colors flex items-center space-x-1 active:scale-95 disabled:opacity-50"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>Añadir</span>
                            </button>
                          </div>
                        );
                      })
                    )}
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
