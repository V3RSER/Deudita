'use client';

import React, { useState } from 'react';
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
} from 'lucide-react';
import Image from 'next/image';
import { calculatePairwiseBalance } from '@/lib/group-utils';
import { isTempEmail, formatDisplayEmail } from '@/lib/utils';

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

  const [prevProfileId, setPrevProfileId] = useState<string | null>(null);

  if (memberProfile && memberProfile.id !== prevProfileId) {
    setPrevProfileId(memberProfile.id);
    setName(memberProfile.full_name || '');
    const rawEmail = memberProfile.email || '';
    setEmail(isTempEmail(rawEmail) ? '' : rawEmail);
    setSuccessMsg(null);
    setErrorMsg(null);
  }

  if (!isOpen || !memberProfile) return null;

  const isTemp = isTempEmail(memberProfile.email);
  const isSelf = currentProfile?.id === memberProfile.id;
  const isRegistered = Boolean(memberProfile.email && !isTemp);
  const canEdit = !isRegistered || isSelf;

  const currentGroup = groupId ? userGroups.find((g) => g.id === groupId) : null;
  const isGroupOwner = currentGroup?.owner_id === currentProfile?.id;

  const hasPendingInvite = pendingInvites.some(
    (i) =>
      (groupId ? i.group_id === groupId : true) &&
      (i.email === memberProfile.email ||
        (memberProfile.email && i.email.toLowerCase() === memberProfile.email.toLowerCase()))
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
          email: email.trim(),
          groupId,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'No se pudo actualizar la información');
      }

      setSuccessMsg('Información del perfil actualizada correctamente.');
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
    if (!email.trim()) {
      setErrorMsg('Ingresa un correo electrónico válido para enviar la invitación.');
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMsg(null);
      setSuccessMsg(null);

      await addGroupInvite(groupId, email.trim(), name.trim(), memberProfile.id);
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
      const result = await addGroupInvite(groupId, email.trim() || undefined, name.trim(), memberProfile.id);
      if (navigator.clipboard) {
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
        throw new Error(errData.error || 'No se pudo eliminar al integrante');
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/70 backdrop-blur-sm">
      <div className="bg-white rounded-[2rem] ring-1 ring-zinc-200 shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="bg-zinc-900 text-white p-6 flex items-center justify-between">
          <div className="flex items-center space-x-3.5">
            {memberProfile.avatar_url ? (
              <Image
                src={memberProfile.avatar_url}
                alt={memberProfile.full_name}
                width={44}
                height={44}
                className="w-11 h-11 rounded-2xl object-cover ring-2 ring-zinc-700 shrink-0"
              />
            ) : (
              <div className="w-11 h-11 rounded-2xl bg-zinc-800 ring-1 ring-zinc-700 flex items-center justify-center text-zinc-100 font-bold shrink-0">
                {memberProfile.full_name?.charAt(0).toUpperCase() || 'U'}
              </div>
            )}
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-zinc-50">
                {memberProfile.full_name}
              </h2>
              {hasPendingInvite && (
                <div className="flex items-center space-x-1.5 mt-0.5">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    <Clock className="w-3 h-3 mr-1" />
                    Invitación Pendiente
                  </span>
                </div>
              )}
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {errorMsg && (
            <div className="p-3.5 bg-rose-50 text-rose-700 border border-rose-200 rounded-2xl text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-2xl text-xs flex items-center space-x-2">
              <Sparkles className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Balance Card */}
          {!isSelf && (
            <div className={`p-4 rounded-2xl border flex items-center justify-between ${
              balance > 0
                ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                : balance < 0
                ? 'bg-rose-50/70 border-rose-200 text-rose-950'
                : 'bg-zinc-50 border-zinc-200 text-zinc-800'
            }`}>
              <div className="flex items-center space-x-3">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                  balance > 0
                    ? 'bg-emerald-100 text-emerald-700'
                    : balance < 0
                    ? 'bg-rose-100 text-rose-700'
                    : 'bg-zinc-200 text-zinc-600'
                }`}>
                  {balance > 0 ? (
                    <TrendingUp className="w-5 h-5" />
                  ) : balance < 0 ? (
                    <TrendingDown className="w-5 h-5" />
                  ) : (
                    <CheckCircle className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                    {context === 'group' ? 'Saldo en este grupo' : 'Saldo total (todos los grupos)'}
                  </p>
                  <p className="text-sm font-bold">
                    {balance > 0
                      ? `Te debe $${balance.toLocaleString('es-CO', { minimumFractionDigits: 0 })}`
                      : balance < 0
                      ? `Le debes $${Math.abs(balance).toLocaleString('es-CO', { minimumFractionDigits: 0 })}`
                      : 'Al día (sin deudas)'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">
                Nombre del Integrante
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-zinc-400 absolute left-3.5 top-3.5" />
                <input
                  type="text"
                  required
                  readOnly={!canEdit}
                  disabled={!canEdit}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={`w-full pl-10 pr-4 py-2.5 rounded-xl text-xs font-semibold border ${
                    canEdit
                      ? 'bg-zinc-50 border-zinc-200 text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:bg-white'
                      : 'bg-zinc-100/80 border-zinc-200 text-zinc-600 cursor-not-allowed'
                  }`}
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">
                Correo Electrónico
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-zinc-400 absolute left-3.5 top-3.5" />
                <input
                  type="email"
                  readOnly={!canEdit}
                  disabled={!canEdit}
                  placeholder="Sin correo asignado"
                  value={isRegistered ? formatDisplayEmail(memberProfile.email) : email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={`w-full pl-10 pr-4 py-2.5 rounded-xl text-xs font-semibold border ${
                    canEdit
                      ? 'bg-zinc-50 border-zinc-200 text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:bg-white'
                      : 'bg-zinc-100/80 border-zinc-200 text-zinc-600 cursor-not-allowed'
                  }`}
                />
              </div>
              <p className="text-[11px] text-zinc-400 mt-1">
                {isRegistered
                  ? 'Usuario registrado. Solo el usuario puede modificar los datos de su cuenta.'
                  : isTemp
                  ? 'Puedes asignar su correo real para enviar la invitación.'
                  : formatDisplayEmail(email)}
              </p>
            </div>

            {canEdit && (
              <button
                type="submit"
                disabled={isSubmitting || !name.trim()}
                className="w-full py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white font-medium text-xs rounded-xl shadow-xs transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center space-x-1.5"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Guardar Cambios</span>
              </button>
            )}
          </form>

          {/* Invitation Actions if user is temp or pending invite */}
          {context === 'group' && groupId && (isTemp || hasPendingInvite) && (
            <div className="border-t border-zinc-100 pt-4 space-y-2.5">
              <span className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                Acciones de Invitación
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleCopyLink}
                  disabled={isSubmitting}
                  className="w-full flex items-center justify-center space-x-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 py-2.5 px-3 rounded-xl text-xs font-semibold border border-zinc-200 transition-all active:scale-95"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-emerald-700 font-bold">¡Copiado!</span>
                    </>
                  ) : (
                    <>
                      <LinkIcon className="w-3.5 h-3.5 text-zinc-600" />
                      <span>Copiar Enlace</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleResendInvite}
                  disabled={isSubmitting || !email.trim()}
                  className="w-full flex items-center justify-center space-x-1.5 bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 px-3 rounded-xl text-xs font-semibold shadow-xs transition-all active:scale-95 disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Reenviar Correo</span>
                </button>
              </div>
            </div>
          )}

          {/* View Full Profile Link */}
          {!isSelf && (
            <div className="border-t border-zinc-100 pt-4">
              <Link
                href={`/friends/${memberProfile.id}`}
                onClick={onClose}
                className="w-full flex items-center justify-center space-x-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 py-2.5 px-4 rounded-xl text-xs font-semibold transition-all active:scale-95"
              >
                <Eye className="w-3.5 h-3.5 text-zinc-600" />
                <span>Ver Perfil Completo en Amigos</span>
              </Link>
            </div>
          )}

          {/* Delete Action depending on context */}
          {!isSelf && (
            <div className="border-t border-zinc-100 pt-3">
              {context === 'group' && isGroupOwner && (
                <button
                  type="button"
                  onClick={() => setShowConfirmDeleteMember(true)}
                  disabled={isSubmitting}
                  className="w-full flex items-center justify-center space-x-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 py-2.5 px-4 rounded-xl text-xs font-semibold transition-all active:scale-95"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                  <span>Eliminar del Grupo</span>
                </button>
              )}

              {context === 'friends' && (
                <button
                  type="button"
                  onClick={() => setShowConfirmDeleteFriend(true)}
                  disabled={isSubmitting}
                  className="w-full flex items-center justify-center space-x-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 py-2.5 px-4 rounded-xl text-xs font-semibold transition-all active:scale-95"
                >
                  <UserMinus className="w-3.5 h-3.5 text-rose-600" />
                  <span>Eliminar Amigo</span>
                </button>
              )}
            </div>
          )}
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
        description={`¿Estás seguro de que deseas eliminar a "${memberProfile.full_name}" de tu lista de amigos?`}
        confirmText="Eliminar"
        isLoading={isSubmitting}
      />
    </div>
  );
}

