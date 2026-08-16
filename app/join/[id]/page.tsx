'use client';

import React, { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Users, Sparkles, CheckCircle2, ArrowRight, Loader2, AlertCircle, ShieldCheck, Clock, RefreshCw } from 'lucide-react';
import Link from 'next/link';

interface InviteData {
  invite: {
    id: string;
    status: string;
    email?: string | null;
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
    // Save pending invite ID / token in sessionStorage & localStorage for auth callbacks
    if (inviteId && typeof window !== 'undefined') {
      window.sessionStorage.setItem('deudita_invite_token', inviteId);
      window.localStorage.setItem('deudita_pending_invite', inviteId);
    }

    async function loadData() {
      try {
        setLoading(true);
        setError(null);
        setIsExpired(false);

        // Check current user session
        const { data: { user } } = await supabase.auth.getUser();
        setCurrentUser(user);

        // Fetch invitation details by token or id
        const res = await fetch(`/api/invites/${inviteId}`);
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          if (res.status === 410 || data.isExpired) {
            setIsExpired(true);
            throw new Error(data.error || 'Este enlace de invitación ha caducado (duración: 1 día).');
          }
          throw new Error(data.error || 'La invitación no fue encontrada');
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
    }
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?returnTo=/join/${inviteId}&token=${inviteId}`,
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
      }

      setSuccessMessage('¡Te has unido al grupo exitosamente!');
      setTimeout(() => {
        router.push(`/groups/${result.groupId}`);
      }, 1000);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al procesar la invitación';
      setError(message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRejectInvite = async () => {
    try {
      setIsProcessing(true);
      await fetch(`/api/invites/${inviteId}/reject`, {
        method: 'POST',
      });
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem('deudita_pending_invite');
      }
      router.push('/groups');
    } catch (err) {
      console.error('Error al rechazar:', err);
      router.push('/groups');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center p-4">
        <Loader2 className="w-8 h-8 text-zinc-900 animate-spin" />
        <p className="text-sm font-medium text-zinc-500 mt-3">Cargando invitación...</p>
      </div>
    );
  }

  if (isExpired || (error && error.includes('caducado'))) {
    return (
      <div className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center p-4">
        <div className="bg-white rounded-3xl p-8 ring-1 ring-zinc-200 shadow-xl max-w-md w-full text-center space-y-4">
          <div className="w-14 h-14 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mx-auto">
            <Clock className="w-7 h-7" />
          </div>
          <div className="inline-flex items-center space-x-1.5 bg-amber-50 text-amber-700 text-xs font-semibold px-3 py-1 rounded-full">
            <Clock className="w-3.5 h-3.5" />
            <span>Enlace caducado (7 días)</span>
          </div>
          <h2 className="text-xl font-bold text-zinc-900">Este enlace de invitación ha expirado</h2>
          <p className="text-sm text-zinc-500">
            Por seguridad, los enlaces para unirse al grupo tienen una validez de 7 días. Puedes pedir a un integrante del grupo que genere y comparta un nuevo enlace.
          </p>
          <div className="pt-2 flex flex-col gap-2">
            <Link
              href="/groups"
              className="inline-flex items-center justify-center space-x-2 bg-zinc-900 hover:bg-zinc-800 text-white px-6 py-3 rounded-2xl text-sm font-medium transition-all shadow-sm"
            >
              <span>Ir a mis grupos</span>
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center text-xs text-zinc-500 hover:text-zinc-800 py-2 font-medium transition-colors"
            >
              <span>Ir al Panel Principal</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (error || !inviteData) {
    return (
      <div className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center p-4">
        <div className="bg-white rounded-3xl p-8 ring-1 ring-zinc-200 shadow-xl max-w-md w-full text-center space-y-4">
          <div className="w-14 h-14 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mx-auto">
            <AlertCircle className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-zinc-900">Enlace o Invitación Inválida</h2>
          <p className="text-sm text-zinc-500">
            {error || 'Esta invitación ya no está disponible o ha sido eliminada.'}
          </p>
          <div className="pt-2">
            <Link
              href="/dashboard"
              className="inline-flex items-center space-x-2 bg-zinc-900 hover:bg-zinc-800 text-white px-6 py-3 rounded-full text-sm font-medium transition-all"
            >
              <span>Ir al Panel Principal</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const { group, inviter, invite } = inviteData;
  const isAccepted = invite.status === 'accepted';

  return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-4 sm:p-6 lg:p-8 selection:bg-zinc-900 selection:text-white">
      <div className="w-full max-w-lg bg-white rounded-[2.5rem] ring-1 ring-zinc-200/80 shadow-2xl overflow-hidden">
        {/* Header Banner */}
        <div className="bg-zinc-900 text-white p-8 sm:p-10 text-center relative overflow-hidden">
          <div className="absolute -top-10 -right-10 w-40 h-40 bg-emerald-500/10 rounded-full blur-2xl" />
          
          <div className="inline-flex items-center space-x-2 bg-emerald-500/20 text-emerald-300 text-xs font-semibold px-3.5 py-1.5 rounded-full border border-emerald-500/30 mb-4">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Invitación a Grupo</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white mb-2">
            ¡Te han invitado a unirte a {group.name}!
          </h1>
          <p className="text-zinc-400 text-xs sm:text-sm max-w-xs mx-auto">
            Organiza y divide cuentas sin esfuerzo en Deudita.
          </p>
        </div>

        {/* Content Body */}
        <div className="p-8 space-y-6">
          {/* Expiration badge */}
          <div className="flex items-center justify-between px-1 text-xs">
            <span className="inline-flex items-center gap-1.5 text-emerald-700 bg-emerald-50 border border-emerald-200/60 font-semibold px-2.5 py-1 rounded-lg">
              <Clock className="w-3.5 h-3.5" />
              <span>Enlace activo • Validez de 7 días</span>
            </span>
          </div>

          {/* Group & Inviter Card */}
          <div className="bg-zinc-50 ring-1 ring-zinc-200 rounded-2xl p-5 space-y-4">
            <div className="flex items-center space-x-4">
              <div className="w-14 h-14 bg-zinc-900 text-white rounded-2xl flex items-center justify-center text-xl font-bold shrink-0 shadow-sm">
                <Users className="w-7 h-7" />
              </div>
              <div>
                <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                  {group.category ? group.category.toUpperCase() : 'GRUPO'}
                </div>
                <div className="text-lg font-bold text-zinc-900 tracking-tight">{group.name}</div>
                {group.description && (
                  <div className="text-xs text-zinc-500 mt-0.5">{group.description}</div>
                )}
              </div>
            </div>

            <div className="border-t border-zinc-200/60 pt-3 flex items-center justify-between text-xs text-zinc-600">
              <span>Invitado por:</span>
              <span className="font-semibold text-zinc-900">{inviter.full_name}</span>
            </div>
          </div>

          {/* Messages & Actions */}
          {successMessage ? (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-2xl flex items-center space-x-3 text-sm font-medium">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <span>{successMessage}</span>
            </div>
          ) : isAccepted ? (
            <div className="text-center space-y-4">
              <div className="p-4 bg-emerald-50 text-emerald-800 rounded-2xl text-sm font-medium flex items-center justify-center space-x-2">
                <ShieldCheck className="w-5 h-5 text-emerald-600" />
                <span>Ya formas parte de este grupo</span>
              </div>
              <button
                onClick={() => router.push(`/groups/${group.id}`)}
                className="w-full bg-zinc-900 hover:bg-zinc-800 text-white font-semibold py-3.5 px-6 rounded-2xl text-sm shadow-md transition-all flex items-center justify-center space-x-2"
              >
                <span>Ir al Grupo</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          ) : currentUser ? (
            <div className="space-y-4">
              <div className="p-3 bg-zinc-100 rounded-xl text-center text-xs text-zinc-600">
                Has iniciado sesión como <strong className="text-zinc-900">{currentUser.email}</strong>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={handleRejectInvite}
                  disabled={isProcessing}
                  className="w-full sm:w-1/3 ring-1 ring-zinc-200 hover:bg-zinc-50 text-zinc-700 font-medium py-3 rounded-2xl text-sm transition-colors"
                >
                  Rechazar
                </button>
                <button
                  onClick={handleAcceptInvite}
                  disabled={isProcessing}
                  className="w-full sm:w-2/3 bg-zinc-900 hover:bg-zinc-800 text-white font-semibold py-3.5 px-6 rounded-2xl text-sm shadow-md transition-all flex items-center justify-center space-x-2 disabled:opacity-50"
                >
                  {isProcessing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <span>Aceptar e Ingresar al Grupo</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4 text-center">
              <p className="text-xs text-zinc-500 leading-relaxed">
                Para unirte a este grupo y comenzar a compartir gastos, inicia sesión o regístrate en la aplicación.
              </p>

              <button
                onClick={handleGoogleLogin}
                className="w-full bg-zinc-900 hover:bg-zinc-800 text-white font-semibold py-3.5 px-6 rounded-2xl text-sm shadow-lg transition-all flex items-center justify-center space-x-3 group"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
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
                <span>Registrarse o Iniciar Sesión con Google</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
