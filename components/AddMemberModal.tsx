'use client';

import React, { useState } from 'react';
import { useExpense } from '@/lib/expense-context';
import { X, UserPlus, Mail, Link as LinkIcon, Share2, Check, Send, AlertCircle, CheckCircle2, ArrowRight } from 'lucide-react';

interface AddMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupId: string;
}

export function AddMemberModal({ isOpen, onClose, groupId }: AddMemberModalProps) {
  const { userGroups, addGroupInvite } = useExpense();
  
  // Step 1 = Add Name, Step 2 = How to Invite
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState('');
  const [addedMemberName, setAddedMemberName] = useState('');
  const [addedMemberId, setAddedMemberId] = useState<string | null>(null);
  
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const group = userGroups.find((g) => g.id === groupId);
  const groupName = group ? group.name : 'Grupo';

  // Step 1 Submit: Create Temporary Member immediately
  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      setIsSubmitting(true);
      setErrorMsg(null);
      setSuccessMsg(null);

      const result = await addGroupInvite(groupId, undefined, name.trim());
      setAddedMemberName(name.trim());
      setAddedMemberId(result.memberId || null);
      setGeneratedLink(result.inviteUrl);
      setStep(2);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al añadir al integrante';
      setErrorMsg(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Step 2: Send Email Invite
  const handleSendEmailInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    try {
      setIsSubmitting(true);
      setErrorMsg(null);
      setSuccessMsg(null);

      const result = await addGroupInvite(groupId, email.trim(), addedMemberName, addedMemberId || undefined);
      setSuccessMsg(`Invitación enviada por correo a ${email.trim()}`);
      if (result.inviteUrl) setGeneratedLink(result.inviteUrl);
      if (result.memberId) setAddedMemberId(result.memberId);
      setEmail('');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al enviar invitación por correo';
      setErrorMsg(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyLink = async () => {
    let link = generatedLink;
    if (!link) {
      try {
        setIsSubmitting(true);
        const result = await addGroupInvite(groupId, undefined, addedMemberName || name, addedMemberId || undefined);
        link = result.inviteUrl;
        if (result.memberId) setAddedMemberId(result.memberId);
        setGeneratedLink(link);
      } catch {
        return;
      } finally {
        setIsSubmitting(false);
      }
    }

    if (link && navigator.clipboard) {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleNativeShare = async () => {
    let link = generatedLink;
    if (!link) {
      try {
        setIsSubmitting(true);
        const result = await addGroupInvite(groupId, undefined, addedMemberName || name, addedMemberId || undefined);
        link = result.inviteUrl;
        if (result.memberId) setAddedMemberId(result.memberId);
        setGeneratedLink(link);
      } catch {
        return;
      } finally {
        setIsSubmitting(false);
      }
    }

    if (link) {
      if (navigator.share) {
        try {
          await navigator.share({
            title: `Unirse al grupo ${groupName}`,
            text: `¡Hola! Te agregué al grupo ${groupName} en Deudita para dividir gastos. Haz clic aquí para unirte:`,
            url: link,
          });
        } catch {
          // Share cancelled
        }
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(link);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }
    }
  };

  const handleResetAndClose = () => {
    setStep(1);
    setName('');
    setAddedMemberName('');
    setAddedMemberId(null);
    setEmail('');
    setSuccessMsg(null);
    setErrorMsg(null);
    setGeneratedLink(null);
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
                {step === 1 ? 'Añadir Integrante' : 'Invitación al Grupo'}
              </h2>
              <p className="text-xs text-zinc-400">
                Grupo <span className="font-medium text-white">{groupName}</span>
              </p>
            </div>
          </div>

          <button
            onClick={handleResetAndClose}
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

          {/* STEP 1: Add Name First */}
          {step === 1 ? (
            <form onSubmit={handleAddMember} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5">
                  1. Nombre de la Persona *
                </label>
                <div className="relative">
                  <UserPlus className="w-4 h-4 text-zinc-400 absolute left-3.5 top-3.5" />
                  <input
                    type="text"
                    required
                    placeholder="Ej: Carlos, Mamá, María Gómez"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl text-sm font-medium text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:bg-white transition-all"
                  />
                </div>
                <p className="text-[11px] text-zinc-500 mt-2 leading-relaxed">
                  Esta persona aparecerá de inmediato en la lista de integrantes del grupo para que puedas asignarle gastos.
                </p>
              </div>

              <button
                type="submit"
                disabled={isSubmitting || !name.trim()}
                className="w-full py-3.5 bg-zinc-900 hover:bg-zinc-800 text-white font-medium text-xs rounded-xl shadow-sm transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center space-x-2"
              >
                <span>Añadir al Grupo</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          ) : (
            /* STEP 2: How to Invite Options */
            <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-200">
              {successMsg && (
                <div className="p-3 bg-zinc-100 text-zinc-800 border border-zinc-200 rounded-xl text-xs font-medium">
                  {successMsg}
                </div>
              )}

              <div className="space-y-3">
                <p className="text-xs font-bold text-zinc-700 uppercase tracking-wider">
                  ¿Cómo deseas invitar a {addedMemberName}?
                </p>

                {/* Option A: Send Email */}
                <form onSubmit={handleSendEmailInvite} className="space-y-2">
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                    Opción A: Por correo electrónico
                  </label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Mail className="w-4 h-4 text-zinc-400 absolute left-3 top-3" />
                      <input
                        type="email"
                        placeholder="correo@ejemplo.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-zinc-900 focus:outline-none"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={isSubmitting || !email.trim()}
                      className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white font-medium text-xs rounded-xl transition-all active:scale-95 disabled:opacity-50 flex items-center space-x-1 shrink-0"
                    >
                      <Send className="w-3 h-3" />
                      <span>Enviar</span>
                    </button>
                  </div>
                </form>

                <div className="relative flex items-center justify-center my-3">
                  <div className="border-t border-zinc-200 w-full" />
                  <span className="bg-white px-2.5 text-[10px] uppercase font-bold text-zinc-400 absolute tracking-widest">
                    O
                  </span>
                </div>

                {/* Option B: Copy Invite Link */}
                <div className="space-y-2">
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                    Opción B: Compartir enlace de invitación
                  </label>

                  <button
                    type="button"
                    onClick={handleCopyLink}
                    disabled={isSubmitting}
                    className="w-full flex items-center justify-center space-x-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 py-2.5 px-4 rounded-xl text-xs font-semibold border border-zinc-200 transition-all active:scale-95"
                  >
                    {copied ? (
                      <>
                        <Check className="w-4 h-4 text-emerald-600" />
                        <span className="text-emerald-700 font-bold">¡Enlace Copiado al Portapapeles!</span>
                      </>
                    ) : (
                      <>
                        <LinkIcon className="w-4 h-4 text-zinc-600" />
                        <span>Copiar Enlace de Invitación</span>
                      </>
                    )}
                  </button>

                  {typeof navigator !== 'undefined' && 'share' in navigator && (
                    <button
                      type="button"
                      onClick={handleNativeShare}
                      disabled={isSubmitting}
                      className="w-full flex items-center justify-center space-x-2 bg-white hover:bg-zinc-50 text-zinc-700 py-2 px-4 rounded-xl text-xs font-medium border border-zinc-200 transition-all active:scale-95"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                      <span>Más opciones de compartir</span>
                    </button>
                  )}
                </div>
              </div>

              <div className="pt-3 border-t border-zinc-100 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={handleResetAndClose}
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-2xs transition-all active:scale-95"
                >
                  Listo / Finalizar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
