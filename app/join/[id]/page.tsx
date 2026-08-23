'use client';

import React, { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Users, CheckCircle2, ArrowRight, Loader2, AlertCircle, Sparkles } from 'lucide-react';
import Link from 'next/link';

interface InviteData {
  invite: {
    id: string;
    token?: string;
    status: string;
    email?: string | null;
    inviteeProfileId?: string | null;
    expiresAt?: string;
    isExpired?: boolean;
    isGeneralLink?: boolean;
  };
  group: {
    id: string;
    name: string;
    category?: string;
    description?: string;
    image_url?: string;
  };
  inviter: {
    full_name: string;
    email?: string;
    avatar_url?: string;
  };
  invitee?: {
    id: string;
    full_name: string;
    email?: string;
  } | null;
  isAlreadyMember?: boolean;
}

export default function JoinInvitePage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const inviteId = resolvedParams.id;
  const router = useRouter();
  const supabase = createClient();

  const [inviteData, setInviteData] = useState<InviteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isExpired, setIsExpired] = useState(false);
  const [currentUser, setCurrentUser] = useState<any | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (inviteId && typeof window !== 'undefined') {
      window.sessionStorage.setItem('deudita_invite_token', inviteId);
      window.localStorage.setItem('deudita_pending_invite', inviteId);
      document.cookie = `deudita_invite_token=${inviteId}; path=/; max-age=604800; SameSite=Lax`;
    }

    async function loadData() {
      try {
        setLoading(true);
        setError(null);
        setIsExpired(false);

        const userPromise = supabase.auth.getUser();
        const timeoutPromise = new Promise<{ data: { user: null } }>((resolve) =>
          setTimeout(() => resolve({ data: { user: null } }), 1500)
        );
        const authResult = await Promise.race([userPromise, timeoutPromise]);
        setCurrentUser(authResult.data?.user ?? null);

        const res = await fetch(`/api/invites/${inviteId}`);
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          if (res.status === 410 || data.isExpired) {
            setIsExpired(true);
            throw new Error('El enlace de invitación ha expirado.');
          }
          throw new Error(data.error || 'La invitación no es válida.');
        }

        if (data.invite?.isExpired) {
          setIsExpired(true);
        }

        setInviteData(data);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'No se pudo cargar la invitación';
        setError(message);
      } finally {
        setLoading(false);
      }
    }

    void loadData();
  }, [inviteId, supabase]);

  const handleGoogleLogin = async () => {
    if (inviteId && typeof window !== 'undefined') {
      window.sessionStorage.setItem('deudita_invite_token', inviteId);
      window.localStorage.setItem('deudita_pending_invite', inviteId);
      document.cookie = `deudita_invite_token=${inviteId}; path=/; max-age=604800; SameSite=Lax`;
    }
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?token=${inviteId}`,
      },
    });
  };

  const handleAcceptInvite = async () => {
    try {
      setIsProcessing(true);
      setError(null);
      const res = await fetch(`/api/invites/${inviteId}/accept`, {
        method: 'POST',
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'No se pudo aceptar la invitación');
      }

      const result = await res.json();
      if (typeof window !== 'undefined') {
        window.sessionStorage.removeItem('deudita_invite_token');
        window.localStorage.removeItem('deudita_pending_invite');
        document.cookie = 'deudita_invite_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
      }

      setSuccessMessage('¡Te has unido al grupo!');
      setTimeout(() => {
        router.push(`/groups/${result.groupId}`);
      }, 600);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al procesar la invitación';
      setError(message);
    } finally {
      setIsProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-4">
        <Loader2 className="w-7 h-7 text-zinc-900 animate-spin" />
      </div>
    );
  }

  if (isExpired) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-4 sm:p-6">
        <div className="bg-white rounded-3xl p-8 ring-1 ring-zinc-200 shadow-sm max-w-sm w-full text-center space-y-4">
          <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-zinc-900">Enlace expirado</h2>
          <p className="text-sm text-zinc-500">
            Este enlace de invitación ya no está activo. Solicita uno nuevo a un miembro del grupo.
          </p>
          <div className="pt-2">
            <Link
              href="/groups"
              className="inline-flex items-center justify-center w-full bg-zinc-900 hover:bg-zinc-800 text-white px-5 py-3 rounded-xl text-sm font-medium transition-colors"
            >
              Ir a mis grupos
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (error || !inviteData) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-4 sm:p-6">
        <div className="bg-white rounded-3xl p-8 ring-1 ring-zinc-200 shadow-sm max-w-sm w-full text-center space-y-4">
          <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-zinc-900">Invitación no disponible</h2>
          <p className="text-sm text-zinc-500">
            {error || 'El enlace no es válido o ha sido removido.'}
          </p>
          <div className="pt-2">
            <Link
              href="/groups"
              className="inline-flex items-center justify-center w-full bg-zinc-900 hover:bg-zinc-800 text-white px-5 py-3 rounded-xl text-sm font-medium transition-colors"
            >
              Ir a mis grupos
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const { group, inviter, invite } = inviteData;
  const isAccepted = invite.status === 'accepted' || Boolean(inviteData.isAlreadyMember);

  return (
    <div className="min-h-screen bg-[#FBFBFB] flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-sm bg-white rounded-3xl ring-1 ring-zinc-200/80 shadow-lg p-7 text-center space-y-6">
        {/* Group Avatar & Info */}
        <div className="space-y-4">
          <div className="w-16 h-16 bg-zinc-900 text-white rounded-2xl flex items-center justify-center text-xl font-bold mx-auto shadow-sm overflow-hidden">
            {group.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={group.image_url} alt={group.name} className="w-full h-full object-cover" />
            ) : (
              <Users className="w-7 h-7" />
            )}
          </div>

          <div className="space-y-1">
            <h1 className="text-xl font-bold text-zinc-900 tracking-tight">
              {group.name}
            </h1>
            <p className="text-sm text-zinc-500">
              Invitación de <span className="font-medium text-zinc-700">{inviter.full_name}</span>
            </p>
          </div>

          {inviteData?.invitee && (
            <div className="inline-flex items-center gap-1.5 bg-zinc-100 text-zinc-800 text-xs font-medium px-3 py-1.5 rounded-full">
              <Sparkles className="w-3.5 h-3.5 text-zinc-600" />
              <span>{inviteData.invitee.full_name}</span>
            </div>
          )}
        </div>

        {/* Action Button */}
        <div>
          {successMessage ? (
            <div className="bg-emerald-50 text-emerald-900 p-3.5 rounded-2xl flex items-center justify-center space-x-2 text-sm font-medium">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMessage}</span>
            </div>
          ) : isAccepted ? (
            <button
              onClick={() => router.push(`/groups/${group.id}`)}
              className="w-full bg-zinc-900 hover:bg-zinc-800 text-white font-medium py-3.5 px-6 rounded-2xl text-sm transition-colors flex items-center justify-center space-x-2 shadow-sm"
            >
              <span>Entrar</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : currentUser ? (
            <button
              onClick={handleAcceptInvite}
              disabled={isProcessing}
              className="w-full bg-zinc-900 hover:bg-zinc-800 text-white font-medium py-3.5 px-6 rounded-2xl text-sm transition-colors flex items-center justify-center space-x-2 shadow-sm disabled:opacity-60"
            >
              {isProcessing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <span>Unirme</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          ) : (
            <button
              onClick={handleGoogleLogin}
              className="w-full bg-zinc-900 hover:bg-zinc-800 text-white font-medium py-3.5 px-6 rounded-2xl text-sm transition-colors flex items-center justify-center space-x-3 shadow-sm"
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="currentColor"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="currentColor"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="currentColor"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              <span>Continuar con Google</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
