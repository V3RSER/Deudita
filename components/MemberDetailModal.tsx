'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useExpense } from '@/lib/expense-context';
import { Profile } from '@/lib/types';
import { ConfirmModal } from '@/components/ConfirmModal';
import {
  X,
  User,
  Mail,
  Link as LinkIcon,
  Send,
  Trash2,
  Check,
  AlertCircle,
  Sparkles,
  Save,
  Clock,
  UserMinus,
  TrendingUp,
  TrendingDown,
  CheckCircle,
  Eye,
  Loader2,
  CheckCircle2,
} from 'lucide-react';
import Image from 'next/image';
import { calculatePairwiseBalance } from '@/lib/group-utils';
import { isTempEmail, formatDisplayEmail, isTempProfile } from '@/lib/utils';

interface MemberDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupId?: string;
  context?: 'group' | 'friends';
  memberProfile: Profile | null;
}

export function MemberDetailModal({
  isOpen,
  onClose,
  groupId,
  context = 'group',
  memberProfile,
}: MemberDetailModalProps) {
  const {
    currentProfile,
    userGroups,
    expenses,
    payments,
    pendingInvites,
    addGroupInvite,
    deleteFriend,
    refreshData,
  } = useExpense();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showConfirmDeleteMember, setShowConfirmDeleteMember] = useState(false);
  const [showConfirmDeleteFriend, setShowConfirmDeleteFriend] = useState(false);

  const prevIsOpenRef = useRef(false);
  const prevProfileIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isOpen || !memberProfile) {
      prevIsOpenRef.current = false;
      prevProfileIdRef.current = null;
      return;
    }

    const isOpening = !prevIsOpenRef.current;
    const isProfileChanged = memberProfile.id !== prevProfileIdRef.current;

    if (isOpening || isProfileChanged) {
      prevIsOpenRef.current = true;
      prevProfileIdRef.current = memberProfile.id;
      setName(memberProfile.full_name ?? '');
      const rawEmail = memberProfile.email ?? '';
      setEmail(isTempEmail(rawEmail) ? '' : rawEmail);
      setSuccessMsg(null);
      setErrorMsg(null);
      setCopied(false);
      setIsSubmitting(false);
      setShowConfirmDeleteMember(false);
      setShowConfirmDeleteFriend(false);
    }
  }, [isOpen, memberProfile]);

  if (!isOpen || !memberProfile) return null;

  const isTemp = isTempProfile(memberProfile);
  const isRegistered = !isTemp;
  const isSelf = currentProfile?.id === memberProfile.id;
  const canEdit = isSelf || isTemp;

  const currentGroup = groupId ? userGroups.find((g) => g.id === groupId) : null;
  const isGroupOwner = currentGroup?.owner_id === currentProfile?.id;

  const hasPendingInvite = pendingInvites.some(
    (i) =>
      (groupId ? i.group_id === groupId : true) &&
      (i.invitee_profile_id === memberProfile.id ||
        (Boolean(i.email) && Boolean(memberProfile.email) && i.email?.toLowerCase() === memberProfile.email?.toLowerCase()))
  );

  const balance = currentProfile && memberProfile
    ? calculatePairwiseBalance(
        currentProfile.id,
        memberProfile.id,
        expenses,
        payments,
        context === 'group' ? groupId : undefined
      )
    : 0;

  const hasValidEmailEntered = Boolean(email.trim() && email.includes('@'));

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit || !name.trim()) return;

    try {
      setIsSubmitting(true);
      setErrorMsg(null);
      setSuccessMsg(null);

      const res = await fetch(`/api/members/${memberProfile.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim() ? email.trim().toLowerCase() : undefined,
          groupId,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error ?? 'No se pudo actualizar la información');
      }

      const result = await res.json();
      setSuccessMsg(
        result.message ??
        (hasValidEmailEntered
          ? `Invitación enviada por correo a ${email.trim()}`
          : 'Información guardada correctamente.')
      );

      if (refreshData) await refreshData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al guardar cambios';
      setErrorMsg(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendInvite = async () => {
    if (!groupId) return;
    if (!email.trim() || !email.includes('@')) {
      setErrorMsg('Ingresa un correo electrónico válido para enviar la invitación.');
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMsg(null);
      setSuccessMsg(null);

      await addGroupInvite(groupId, email.trim().toLowerCase(), name.trim(), memberProfile.id);
      setSuccessMsg(`Invitación enviada por correo a ${email.trim()}`);
      if (refreshData) await refreshData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al enviar la invitación';
      setErrorMsg(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyLink = async () => {
    if (!groupId) return;
    try {
      setIsSubmitting(true);
      setErrorMsg(null);
      const result = await addGroupInvite(
        groupId,
        email.trim() ? email.trim().toLowerCase() : undefined,
        name.trim(),
        memberProfile.id
      );
      if (navigator.clipboard && result.inviteUrl) {
        await navigator.clipboard.writeText(result.inviteUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al generar enlace';
      setErrorMsg(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteMemberFromGroup = async () => {
    if (isSelf || !groupId) return;

    try {
      setIsSubmitting(true);
      setErrorMsg(null);

      const res = await fetch(`/api/members/${memberProfile.id}?groupId=${groupId}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error ?? 'No se pudo eliminar al integrante');
      }

      if (refreshData) await refreshData();
      setShowConfirmDeleteMember(false);
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al eliminar integrante';
      setErrorMsg(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteFriend = async () => {
    if (isSelf) return;

    try {
      setIsSubmitting(true);
      setErrorMsg(null);

      await deleteFriend(memberProfile.id);
      setShowConfirmDeleteFriend(false);
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al eliminar amigo';
      setErrorMsg(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-xs">
      <div className="bg-white rounded-3xl ring-1 ring-zinc-200/80 shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-5 pb-4 flex items-center justify-between border-b border-zinc-100">
          <div className="flex items-center space-x-3 min-w-0">
            {memberProfile.avatar_url ? (
              <Image
                src={memberProfile.avatar_url}
                alt={memberProfile.full_name}
                width={40}
                height={40}
                className="w-10 h-10 rounded-2xl object-cover ring-1 ring-zinc-200 shrink-0"
              />
            ) : (
              <div className="w-10 h-10 rounded-2xl bg-zinc-900 text-white flex items-center justify-center font-bold text-sm shrink-0">
                {memberProfile.full_name?.charAt(0).toUpperCase() || 'U'}
              </div>
            )}
            <div className="min-w-0">
              <h2 className="text-base font-bold tracking-tight text-zinc-900 truncate">
                {memberProfile.full_name}
              </h2>
              {isTemp ? (
                <span className="inline-flex items-center text-[11px] font-medium text-amber-600">
                  <Clock className="w-3 h-3 mr-1 shrink-0" />
                  Pendiente
                </span>
              ) : (
                <span className="text-[11px] text-zinc-500 truncate block">
                  {formatDisplayEmail(memberProfile.email) || 'Miembro'}
                </span>
              )}
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-full transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {errorMsg && (
            <div className="p-3 bg-rose-50 text-rose-700 rounded-xl text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-50 text-emerald-800 rounded-xl text-xs flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Balance pill */}
          {!isSelf && (
            <div className={`p-3 rounded-2xl flex items-center justify-between text-xs font-semibold ${
              balance > 0
                ? 'bg-emerald-50 text-emerald-900'
                : balance < 0
                ? 'bg-rose-50 text-rose-900'
                : 'bg-zinc-50 text-zinc-600'
            }`}>
              <span className="text-zinc-500 font-medium">Saldo</span>
              <span className="font-bold">
                {balance > 0
                  ? `Te debe $${balance.toLocaleString('es-CO', { minimumFractionDigits: 0 })}`
                  : balance < 0
                  ? `Le debes $${Math.abs(balance).toLocaleString('es-CO', { minimumFractionDigits: 0 })}`
                  : 'Al día'}
              </span>
            </div>
          )}

          {/* Form */}
          {canEdit && (
            <form onSubmit={handleSave} className="space-y-3">
              <div>
                <label className="block text-[11px] font-medium text-zinc-600 mb-1">
                  Nombre
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl text-xs font-medium border bg-zinc-50 border-zinc-200 text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-zinc-600 mb-1">
                  Correo electrónico
                </label>
                <input
                  type="email"
                  placeholder="correo@ejemplo.com"
                  value={isRegistered ? formatDisplayEmail(memberProfile.email) : email}
                  onChange={(e) => setEmail(e.target.value)}
                  readOnly={!canEdit || isRegistered}
                  disabled={!canEdit || isRegistered}
                  className={`w-full px-3 py-2 rounded-xl text-xs font-medium border ${
                    isRegistered
                      ? 'bg-zinc-100 border-zinc-200 text-zinc-500 cursor-not-allowed'
                      : 'bg-zinc-50 border-zinc-200 text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:bg-white'
                  }`}
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting || !name.trim()}
                className="w-full py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white font-medium text-xs rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center space-x-1.5 shadow-sm"
              >
                {isSubmitting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <span>Guardar</span>
                )}
              </button>
            </form>
          )}

          {/* Quick Actions */}
          <div className="pt-2 border-t border-zinc-100 space-y-2">
            {context === 'group' && groupId && (isTemp || hasPendingInvite) && (
              <button
                type="button"
                onClick={handleCopyLink}
                disabled={isSubmitting}
                className="w-full flex items-center justify-center space-x-2 py-2.5 px-3 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 rounded-xl text-xs font-medium transition-colors"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-emerald-700 font-semibold">Enlace copiado</span>
                  </>
                ) : (
                  <>
                    <LinkIcon className="w-3.5 h-3.5 text-zinc-600" />
                    <span>Copiar enlace de invitación</span>
                  </>
                )}
              </button>
            )}

            {!isSelf && (
              <div className="flex items-center gap-2">
                <Link
                  href={`/friends/${memberProfile.id}`}
                  onClick={onClose}
                  className="flex-1 flex items-center justify-center space-x-1.5 py-2 px-3 bg-zinc-50 hover:bg-zinc-100 text-zinc-700 rounded-xl text-xs font-medium transition-colors"
                >
                  <Eye className="w-3.5 h-3.5 text-zinc-500" />
                  <span>Ver historial</span>
                </Link>

                {context === 'group' && isGroupOwner && (
                  <button
                    type="button"
                    onClick={() => setShowConfirmDeleteMember(true)}
                    disabled={isSubmitting}
                    className="p-2 text-rose-600 hover:bg-rose-50 rounded-xl transition-colors"
                    title="Eliminar del grupo"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}

                {context === 'friends' && (
                  <button
                    type="button"
                    onClick={() => setShowConfirmDeleteFriend(true)}
                    disabled={isSubmitting}
                    className="p-2 text-rose-600 hover:bg-rose-50 rounded-xl transition-colors"
                    title="Eliminar amigo"
                  >
                    <UserMinus className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <ConfirmModal
        isOpen={showConfirmDeleteMember}
        onClose={() => setShowConfirmDeleteMember(false)}
        onConfirm={handleDeleteMemberFromGroup}
        title="Eliminar del Grupo"
        description={`¿Estás seguro de que deseas eliminar a "${memberProfile.full_name}" de este grupo?`}
        confirmText="Eliminar"
        isLoading={isSubmitting}
      />

      <ConfirmModal
        isOpen={showConfirmDeleteFriend}
        onClose={() => setShowConfirmDeleteFriend(false)}
        onConfirm={handleDeleteFriend}
        title="Eliminar Amigo"
        description={`¿Estás seguro de que deseas eliminar a "${memberProfile.full_name}" de tu lista de amigos? Seguirá formando parte de los grupos que compartan y se conservarán todos sus gastos.`}
        confirmText="Eliminar"
        isLoading={isSubmitting}
      />
    </div>
  );
}
