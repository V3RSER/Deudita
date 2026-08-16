'use client';

import React, { useState, useEffect } from 'react';
import { useExpense } from '@/lib/expense-context';
import {
  X,
  Link as LinkIcon,
  Copy,
  Check,
  Share2,
  RefreshCw,
  Loader2,
  MessageCircle,
} from 'lucide-react';

interface InviteLinkModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupId: string;
}

export function InviteLinkModal({ isOpen, onClose, groupId }: InviteLinkModalProps) {
  const { userGroups, getGroupInviteLink, regenerateGroupInviteLink } = useExpense();

  const [linkData, setLinkData] = useState<{
    inviteUrl: string;
    token: string;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const group = userGroups.find((g) => g.id === groupId);
  const groupName = group ? group.name : 'Grupo';

  useEffect(() => {
    if (!isOpen || !groupId) return;

    let isMounted = true;
    async function loadLink() {
      try {
        setIsLoading(true);
        setErrorMsg(null);
        setCopied(false);
        const data = await getGroupInviteLink(groupId);
        if (isMounted && data) {
          setLinkData({
            inviteUrl: data.inviteUrl,
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
          setIsLoading(false);
        }
      }
    }

    void loadLink();
    return () => {
      isMounted = false;
    };
  }, [isOpen, groupId, getGroupInviteLink]);

  if (!isOpen) return null;

  const handleCopy = async () => {
    if (!linkData?.inviteUrl) return;
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(linkData.inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleShare = async () => {
    if (!linkData?.inviteUrl) return;

    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        await navigator.share({
          title: `Únete al grupo ${groupName}`,
          text: `¡Hola! Únete al grupo "${groupName}" en Deudita para organizar y dividir gastos:`,
          url: linkData.inviteUrl,
        });
        return;
      } catch {
        // User dismissed share dialog
      }
    }
    await handleCopy();
  };

  const handleWhatsAppShare = () => {
    if (!linkData?.inviteUrl) return;
    const text = encodeURIComponent(`¡Hola! Únete al grupo "${groupName}" en Deudita para organizar y dividir gastos juntos: ${linkData.inviteUrl}`);
    if (typeof window !== 'undefined') {
      window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
    }
  };

  const handleRegenerate = async () => {
    if (!groupId || isRegenerating) return;
    try {
      setIsRegenerating(true);
      setErrorMsg(null);
      const res = await regenerateGroupInviteLink(groupId);
      if (res) {
        setLinkData({
          inviteUrl: res.inviteUrl,
          token: res.token,
        });
        setCopied(false);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'No se pudo generar un nuevo enlace';
      setErrorMsg(message);
    } finally {
      setIsRegenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden border border-zinc-200 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-zinc-100">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-zinc-900 text-white flex items-center justify-center shrink-0">
              <LinkIcon className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <h3 className="font-bold text-zinc-900 text-sm">Enlace de Invitación</h3>
              <p className="text-xs text-zinc-500 truncate max-w-[180px]">{groupName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 rounded-full transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {errorMsg && (
            <div className="p-3 bg-rose-50 text-rose-700 border border-rose-200 rounded-xl text-xs">
              {errorMsg}
            </div>
          )}

          {isLoading ? (
            <div className="py-6 flex flex-col items-center justify-center space-y-2 text-zinc-500">
              <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
              <span className="text-xs">Cargando enlace...</span>
            </div>
          ) : linkData ? (
            <>
              {/* URL Display */}
              <div
                onClick={handleCopy}
                className="flex items-center bg-zinc-50 hover:bg-zinc-100/80 border border-zinc-200 rounded-xl px-3 py-2.5 text-xs font-mono text-zinc-700 select-all cursor-pointer transition-colors"
                title="Haz clic para copiar"
              >
                <span className="truncate flex-1">{linkData.inviteUrl}</span>
              </div>

              {/* Action Buttons Menu */}
              <div className="space-y-2 pt-1">
                <button
                  type="button"
                  onClick={handleCopy}
                  className={`w-full flex items-center justify-center space-x-2 py-3 px-4 rounded-xl text-xs font-semibold shadow-xs transition-all active:scale-98 cursor-pointer ${
                    copied
                      ? 'bg-emerald-600 text-white'
                      : 'bg-zinc-900 hover:bg-zinc-800 text-white'
                  }`}
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4 text-white" />
                      <span>¡Enlace copiado!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 text-zinc-300" />
                      <span>Copiar enlace</span>
                    </>
                  )}
                </button>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={handleShare}
                    className="flex items-center justify-center space-x-1.5 py-2.5 px-3 bg-zinc-100 hover:bg-zinc-200/80 text-zinc-800 rounded-xl text-xs font-medium transition-all active:scale-98 cursor-pointer"
                  >
                    <Share2 className="w-3.5 h-3.5 text-zinc-600" />
                    <span>Compartir</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleWhatsAppShare}
                    className="flex items-center justify-center space-x-1.5 py-2.5 px-3 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-medium transition-all active:scale-98 cursor-pointer"
                  >
                    <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                    <span>WhatsApp</span>
                  </button>
                </div>
              </div>

              {/* Footer: Renew link */}
              <div className="pt-2 border-t border-zinc-100 flex items-center justify-between">
                <button
                  type="button"
                  onClick={handleRegenerate}
                  disabled={isRegenerating || isLoading}
                  className="inline-flex items-center space-x-1.5 text-[11px] font-medium text-zinc-500 hover:text-zinc-800 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  <RefreshCw className={`w-3 h-3 ${isRegenerating ? 'animate-spin' : ''}`} />
                  <span>Renovar enlace</span>
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="text-xs font-semibold text-zinc-600 hover:text-zinc-900 cursor-pointer"
                >
                  Cerrar
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
