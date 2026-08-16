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
  Clock,
  RefreshCw,
  Copy,
} from 'lucide-react';

interface AddMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupId?: string;
  initialTab?: 'link' | 'new' | 'friends';
}

function formatExpirationText(expiresAtStr?: string): string {
  if (!expiresAtStr) return 'Válido durante 7 días';
  const expDate = new Date(expiresAtStr);
  if (isNaN(expDate.getTime())) return 'Válido durante 7 días';

  const now = new Date();
  const diffMs = expDate.getTime() - now.getTime();
  if (diffMs <= 0) return 'Enlace caducado';

  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  if (diffDays > 0) {
    if (diffHours > 0) {
      return `Expira en ${diffDays} día${diffDays > 1 ? 's' : ''} y ${diffHours}h (validez: 7 días)`;
    }
    return `Expira en ${diffDays} día${diffDays > 1 ? 's' : ''} (validez: 7 días)`;
  }

  if (diffHours > 0) {
    return `Expira en ${diffHours}h ${diffMinutes}m (validez: 7 días)`;
  }
  return `Expira en ${diffMinutes} minutos (validez: 7 días)`;
}

export function AddMemberModal({
  isOpen,
  onClose,
  groupId,
  initialTab = 'link',
}: AddMemberModalProps) {
  const {
    currentProfile,
    profiles,
    members,
    userGroups,
    addGroupInvite,
    getGroupInviteLink,
    regenerateGroupInviteLink,
  } = useExpense();

  const [activeTab, setActiveTab] = useState<'link' | 'new' | 'friends'>(initialTab);
  const [selectedGroupId, setSelectedGroupId] = useState<string>(groupId ?? userGroups[0]?.id ?? '');

  // Direct link state
  const [linkData, setLinkData] = useState<{
    inviteUrl: string;
    expiresAt: string;
    token: string;
  } | null>(null);
  const [isLoadingLink, setIsLoadingLink] = useState(false);
  const [isRegeneratingLink, setIsRegeneratingLink] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  // New member inputs
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');

  // Friend search
  const [friendSearch, setFriendSearch] = useState('');

  // Submission state & Success result for individual add
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

  const activeGroupId = groupId ?? selectedGroupId ?? (userGroups[0] ? userGroups[0].id : '');
  const group = userGroups.find((g) => g.id === activeGroupId);
  const groupName = group ? group.name : 'Grupo';

  // Load link when activeGroupId changes or modal opens
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
      setActiveTab(initialTab);
      setSelectedGroupId(groupId ?? userGroups[0]?.id ?? '');
      setName('');
      setEmail('');
      setFriendSearch('');
      setAddedMember(null);
      setCopied(false);
      setLinkCopied(false);
      setErrorMsg(null);
      setIsSubmitting(false);
      setLinkData(null);
    }
  }, [isOpen, groupId, initialTab, userGroups]);

  // Fetch direct invite link when on 'link' tab
  useEffect(() => {
    if (!isOpen || !activeGroupId || activeTab !== 'link') return;

    let isMounted = true;
    async function loadLink() {
      try {
        setIsLoadingLink(true);
        setErrorMsg(null);
        const data = await getGroupInviteLink(activeGroupId);
        if (isMounted && data) {
          setLinkData({
            inviteUrl: data.inviteUrl,
            expiresAt: data.expiresAt,
            token: data.token,
          });
        }
      } catch (err: unknown) {
        if (isMounted) {
          const message = err instanceof Error ? err.message : 'No se pudo cargar el enlace de invitación';
          setErrorMsg(message);
        }
      } finally {
        if (isMounted) {
          setIsLoadingLink(false);
        }
      }
    }

    void loadLink();
    return () => {
      isMounted = false;
    };
  }, [isOpen, activeGroupId, activeTab, getGroupInviteLink]);

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

  // Handle direct link regeneration
  const handleRegenerateLink = async () => {
    if (!activeGroupId || isRegeneratingLink) return;
    try {
      setIsRegeneratingLink(true);
      setErrorMsg(null);
      const res = await regenerateGroupInviteLink(activeGroupId);
      if (res) {
        setLinkData({
          inviteUrl: res.inviteUrl,
          expiresAt: res.expiresAt,
          token: res.token,
        });
        setLinkCopied(false);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'No se pudo generar un nuevo enlace';
      setErrorMsg(message);
    } finally {
      setIsRegeneratingLink(false);
    }
  };

  // Copy direct invite link
  const handleCopyDirectLink = async () => {
    if (linkData?.inviteUrl && typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(linkData.inviteUrl);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2500);
    }
  };

  // Share direct invite link via Web Share or WhatsApp
  const handleShareDirectLink = async () => {
    if (!linkData?.inviteUrl) return;

    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: `Invitación al grupo ${groupName}`,
          text: `¡Hola! Únete al grupo "${groupName}" en Deudita para organizar y dividir gastos:`,
          url: linkData.inviteUrl,
        });
        return;
      } catch {
        // Dismissed or fallback
      }
    }
    await handleCopyDirectLink();
  };

  // Handle smart name input (if user types/pastes an email into the name field)
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
    setLinkCopied(false);
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
                {addedMember ? '¡Integrante Añadido!' : 'Invitar al Grupo'}
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

          {/* SUCCESS STATE FOR INDIVIDUAL ADD */}
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
            /* MAIN TABS */
            <div className="space-y-4">
              {/* Tab Selector */}
              <div className="flex bg-zinc-100 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setActiveTab('link')}
                  className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-center space-x-1.5 ${
                    activeTab === 'link'
                      ? 'bg-white text-zinc-900 shadow-xs'
                      : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  <LinkIcon className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Enlace de invitación</span>
                </button>
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
                  <span>Nuevo integrante</span>
                </button>
                {availableFriends.length > 0 && (
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
                    <span>Amigos ({availableFriends.length})</span>
                  </button>
                )}
              </div>

              {/* TAB 1: ENLACE DE INVITACIÓN (DIRECT LINK WITH 1-DAY EXPIRATION) */}
              {activeTab === 'link' && (
                <div className="space-y-4 animate-in fade-in duration-150">
                  <div className="bg-zinc-50 border border-zinc-200/80 rounded-2xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                        Enlace de acceso directo
                      </span>
                      <div className="inline-flex items-center space-x-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/60">
                        <Clock className="w-3 h-3 text-emerald-600" />
                        <span>Caducidad de 7 días</span>
                      </div>
                    </div>

                    <p className="text-xs text-zinc-600 leading-relaxed">
                      Cualquier persona que abra este enlace podrá entrar directamente al grupo sin necesidad de registrarla previamente.
                    </p>

                    {isLoadingLink ? (
                      <div className="py-4 flex items-center justify-center space-x-2 text-xs text-zinc-500">
                        <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                        <span>Generando enlace de invitación...</span>
                      </div>
                    ) : linkData ? (
                      <div className="space-y-3 pt-1">
                        <div className="flex items-center bg-white border border-zinc-200 rounded-xl px-3 py-2 text-xs font-mono text-zinc-600 select-all overflow-x-auto">
                          <span className="truncate flex-1">{linkData.inviteUrl}</span>
                        </div>

                        <div className="text-[11px] text-zinc-500 font-medium flex items-center justify-between">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3 text-zinc-400" />
                            {formatExpirationText(linkData.expiresAt)}
                          </span>
                        </div>

                        <div className="flex flex-col gap-2 pt-1">
                          <button
                            type="button"
                            onClick={handleCopyDirectLink}
                            className="w-full flex items-center justify-center space-x-2 bg-zinc-900 hover:bg-zinc-800 text-white py-3 px-4 rounded-xl text-xs font-semibold shadow-sm transition-all active:scale-95 cursor-pointer"
                          >
                            {linkCopied ? (
                              <>
                                <Check className="w-4 h-4 text-emerald-400" />
                                <span className="text-emerald-300 font-bold">¡Enlace Copiado al Portapapeles!</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-4 h-4 text-zinc-300" />
                                <span>Copiar Enlace de Invitación</span>
                              </>
                            )}
                          </button>

                          {typeof navigator !== 'undefined' && 'share' in navigator && (
                            <button
                              type="button"
                              onClick={handleShareDirectLink}
                              className="w-full flex items-center justify-center space-x-2 bg-white hover:bg-zinc-50 border border-zinc-200 text-zinc-800 py-2.5 px-4 rounded-xl text-xs font-semibold transition-all active:scale-95 cursor-pointer"
                            >
                              <Share2 className="w-4 h-4 text-emerald-600" />
                              <span>Compartir por WhatsApp u otras apps</span>
                            </button>
                          )}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  {/* Regenerate link button */}
                  <div className="flex items-center justify-between pt-1 px-1">
                    <span className="text-[11px] text-zinc-400">
                      ¿Necesitas renovar la validez?
                    </span>
                    <button
                      type="button"
                      onClick={handleRegenerateLink}
                      disabled={isRegeneratingLink || isLoadingLink}
                      className="inline-flex items-center space-x-1.5 text-xs font-semibold text-zinc-700 hover:text-zinc-900 transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isRegeneratingLink ? 'animate-spin' : ''}`} />
                      <span>Generar nuevo enlace</span>
                    </button>
                  </div>
                </div>
              )}

              {/* TAB 2: NUEVO INTEGRANTE (INDIVIDUAL PROFILE/EMAIL) */}
              {activeTab === 'new' && (
                <form onSubmit={handleAddNewMember} className="space-y-4 animate-in fade-in duration-150">
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
                    className="w-full py-3.5 bg-zinc-900 hover:bg-zinc-800 text-white font-semibold text-xs rounded-xl shadow-sm hover:shadow-md transition-all duration-200 active:scale-95 disabled:opacity-50 flex items-center justify-center space-x-2 mt-2 cursor-pointer"
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
              )}

              {/* TAB 3: FRIENDS TAB */}
              {activeTab === 'friends' && (
                <div className="space-y-3 animate-in fade-in duration-150">
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
                              className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-semibold rounded-lg shrink-0 transition-colors flex items-center space-x-1 active:scale-95 disabled:opacity-50 cursor-pointer"
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
