'use client';

import React, { useState, useEffect } from 'react';
import { useExpense } from '@/lib/expense-context';
import { Profile } from '@/lib/types';
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
  ShieldCheck,
} from 'lucide-react';
import Image from 'next/image';

interface MemberDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupId: string;
  memberProfile: Profile | null;
}

export function MemberDetailModal({
  isOpen,
  onClose,
  groupId,
  memberProfile,
}: MemberDetailModalProps) {
  const { currentProfile, addGroupInvite, refreshData } = useExpense();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [prevProfileId, setPrevProfileId] = useState<string | null>(null);

  if (memberProfile && memberProfile.id !== prevProfileId) {
    setPrevProfileId(memberProfile.id);
    setName(memberProfile.full_name || '');
    const rawEmail = memberProfile.email || '';
    setEmail(rawEmail.startsWith('temp_') ? '' : rawEmail);
    setSuccessMsg(null);
    setErrorMsg(null);
  }

  if (!isOpen || !memberProfile) return null;

  const isTemp = !memberProfile.email || memberProfile.email.startsWith('temp_');
  const isSelf = currentProfile?.id === memberProfile.id;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

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

      setSuccessMsg('Información del integrante actualizada correctamente.');
      if (refreshData) await refreshData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al guardar cambios';
      setErrorMsg(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendInvite = async () => {
    if (!email.trim()) {
      setErrorMsg('Ingresa un correo electrónico válido para enviar la invitación.');
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMsg(null);
      setSuccessMsg(null);

      const result = await addGroupInvite(groupId, email.trim(), name.trim());
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
    try {
      setIsSubmitting(true);
      setErrorMsg(null);
      const result = await addGroupInvite(groupId, email.trim() || undefined, name.trim());
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

  const handleDeleteMember = async () => {
    if (isSelf) return;
    if (!confirm(`¿Estás seguro de eliminar a "${memberProfile.full_name}" del grupo?`)) return;

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
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al eliminar integrante';
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
              <div className="flex items-center space-x-1.5 mt-0.5">
                {isTemp ? (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    <Clock className="w-3 h-3 mr-1" />
                    Usuario Temporal / Pendiente
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    <ShieldCheck className="w-3 h-3 mr-1" />
                    Miembro Registrado
                  </span>
                )}
              </div>
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
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-semibold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:bg-white"
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
                  placeholder="Sin correo asignado"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-semibold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:bg-white"
                />
              </div>
              <p className="text-[11px] text-zinc-400 mt-1">
                {isTemp
                  ? 'Si añades su correo real, se asociará cuando se registre o acepte la invitación.'
                  : 'Correo registrado de la cuenta.'}
              </p>
            </div>

            <button
              type="submit"
              disabled={isSubmitting || !name.trim()}
              className="w-full py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white font-medium text-xs rounded-xl shadow-xs transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center space-x-1.5"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Guardar Cambios</span>
            </button>
          </form>

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

          {!isSelf && (
            <div className="border-t border-zinc-100 pt-3">
              <button
                type="button"
                onClick={handleDeleteMember}
                disabled={isSubmitting}
                className="w-full flex items-center justify-center space-x-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 py-2.5 px-4 rounded-xl text-xs font-semibold transition-all active:scale-95"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                <span>Eliminar del Grupo</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
