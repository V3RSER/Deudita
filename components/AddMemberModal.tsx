'use client';

import React, { useState } from 'react';
import { useExpense } from '@/lib/expense-context';
import { X, UserPlus, Mail, Link as LinkIcon, Share2, Check, Send, AlertCircle, Sparkles } from 'lucide-react';

interface AddMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupId: string;
}

export function AddMemberModal({ isOpen, onClose, groupId }: AddMemberModalProps) {
  const { userGroups, addGroupInvite } = useExpense();
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const group = userGroups.find((g) => g.id === groupId);
  const groupName = group ? group.name : 'Grupo';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    try {
      setIsSubmitting(true);
      setErrorMsg(null);
      setSuccessMsg(null);

      const result = await addGroupInvite(groupId, email.trim());
      setSuccessMsg(result.message || `Invitación enviada por correo a ${email}`);
      setGeneratedLink(result.inviteUrl);
      setEmail('');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al enviar la invitación';
      setErrorMsg(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGetShareLink = async () => {
    try {
      setIsSubmitting(true);
      setErrorMsg(null);
      const result = await addGroupInvite(groupId);
      setGeneratedLink(result.inviteUrl);

      if (navigator.clipboard) {
        await navigator.clipboard.writeText(result.inviteUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al generar el enlace';
      setErrorMsg(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleShareWhatsApp = async () => {
    let link = generatedLink;
    if (!link) {
      try {
        setIsSubmitting(true);
        const result = await addGroupInvite(groupId);
        link = result.inviteUrl;
        setGeneratedLink(link);
      } catch (err) {
        console.error('Error al generar enlace:', err);
        return;
      } finally {
        setIsSubmitting(false);
      }
    }

    const messageText = `¡Hola! Te invito a unirte a nuestro grupo "${groupName}" en Deudita para dividir gastos juntos. Haz clic aquí para unirte: ${link}`;
    const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(messageText)}`;
    window.open(whatsappUrl, '_blank');
  };

  const handleNativeShare = async () => {
    let link = generatedLink;
    if (!link) {
      try {
        setIsSubmitting(true);
        const result = await addGroupInvite(groupId);
        link = result.inviteUrl;
        setGeneratedLink(link);
      } catch (err) {
        console.error('Error al generar enlace:', err);
        return;
      } finally {
        setIsSubmitting(false);
      }
    }

    if (navigator.share) {
      try {
        await navigator.share({
          title: `Unirse al grupo ${groupName}`,
          text: `Te invito a unirte al grupo ${groupName} en Deudita.`,
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
  };

  const handleResetModal = () => {
    setEmail('');
    setSuccessMsg(null);
    setErrorMsg(null);
    setGeneratedLink(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/70 backdrop-blur-sm">
      <div className="bg-white rounded-[2rem] ring-1 ring-zinc-200 shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="bg-zinc-900 text-white p-6 sm:p-8 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 rounded-2xl bg-zinc-800 ring-1 ring-zinc-700 flex items-center justify-center text-zinc-100 font-bold shrink-0">
              <UserPlus className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-zinc-50">Invitar Integrante</h2>
              <p className="text-sm text-zinc-400 mt-1">
                Añadir persona a <span className="font-medium text-white">{groupName}</span>
              </p>
            </div>
          </div>

          <button
            onClick={handleResetModal}
            className="p-2.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 sm:p-8 space-y-6">
          {errorMsg && (
            <div className="p-4 bg-rose-50 text-rose-700 border border-rose-200 rounded-2xl text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-4 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-2xl text-xs flex items-center space-x-2">
              <Sparkles className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* FORM: Send by Email */}
          <form onSubmit={handleSubmit} className="space-y-3">
            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
              Enviar invitación por Correo
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Mail className="w-4 h-4 text-zinc-400 absolute left-3.5 top-3.5" />
                <input
                  type="email"
                  placeholder="amigo@correo.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-zinc-50 border-none ring-1 ring-zinc-200 rounded-xl text-sm transition-all focus:ring-2 focus:ring-zinc-900"
                />
              </div>
              <button
                type="submit"
                disabled={isSubmitting || !email.trim()}
                className="px-5 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white font-medium text-xs rounded-xl shadow-sm transition-all active:scale-95 disabled:opacity-50 flex items-center space-x-1.5 shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Enviar</span>
              </button>
            </div>
          </form>

          <div className="relative flex items-center justify-center">
            <div className="border-t border-zinc-200 w-full" />
            <span className="bg-white px-3 text-[10px] uppercase font-bold text-zinc-400 absolute tracking-widest">
              O compartir enlace directo
            </span>
          </div>

          {/* Direct Share Options */}
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={handleShareWhatsApp}
                disabled={isSubmitting}
                className="flex items-center justify-center space-x-2 bg-emerald-600 hover:bg-emerald-500 text-white py-3 px-4 rounded-xl text-xs font-semibold shadow-sm transition-all active:scale-95 min-h-[44px]"
              >
                <span>Compartir en WhatsApp</span>
              </button>

              <button
                type="button"
                onClick={handleGetShareLink}
                disabled={isSubmitting}
                className="flex items-center justify-center space-x-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 py-3 px-4 rounded-xl text-xs font-semibold ring-1 ring-zinc-200 transition-all active:scale-95 min-h-[44px]"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-600" />
                    <span className="text-emerald-700 font-bold">¡Enlace Copiado!</span>
                  </>
                ) : (
                  <>
                    <LinkIcon className="w-4 h-4" />
                    <span>Copiar Enlace</span>
                  </>
                )}
              </button>
            </div>

            {typeof navigator !== 'undefined' && 'share' in navigator && (
              <button
                type="button"
                onClick={handleNativeShare}
                disabled={isSubmitting}
                className="w-full flex items-center justify-center space-x-2 bg-white hover:bg-zinc-50 text-zinc-700 py-2.5 px-4 rounded-xl text-xs font-medium ring-1 ring-zinc-200 transition-all"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>Más opciones de compartir</span>
              </button>
            )}
          </div>

          {generatedLink && (
            <div className="bg-zinc-50 border border-zinc-200 p-3 rounded-2xl space-y-1">
              <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                Enlace generado
              </div>
              <p className="text-xs text-zinc-700 font-mono break-all">{generatedLink}</p>
            </div>
          )}

          <div className="pt-4 border-t border-zinc-100 flex justify-end">
            <button
              type="button"
              onClick={handleResetModal}
              className="px-6 py-2.5 rounded-full ring-1 ring-zinc-200 text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 text-xs font-medium transition-colors"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
