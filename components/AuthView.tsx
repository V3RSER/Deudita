'use client';

import React, { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Wallet, AlertCircle, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

export function AuthView({ error }: { error?: string }) {
  const supabase = createClient();
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        router.replace('/groups');
      } else {
        setCheckingAuth(false);
      }
    };
    void checkUser();
  }, [supabase, router]);

  const handleGoogleLogin = async () => {
    setIsLoggingIn(true);
    const pendingToken = typeof window !== 'undefined' 
      ? (window.sessionStorage.getItem('deudita_invite_token') ?? window.localStorage.getItem('deudita_pending_invite'))
      : null;

    const callbackUrl = pendingToken
      ? `${window.location.origin}/auth/callback?token=${pendingToken}`
      : `${window.location.origin}/auth/callback`;

    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: callbackUrl,
      },
    });
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-50 p-4">
        <Loader2 className="w-8 h-8 text-zinc-900 animate-spin" />
        <p className="text-sm text-zinc-500 mt-3 font-medium">Verificando sesión...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-50 p-4">
      <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md text-center">
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 bg-zinc-900 rounded-2xl flex items-center justify-center shadow-lg">
            <Wallet className="w-8 h-8 text-white" />
          </div>
        </div>
        
        <h1 className="text-3xl font-bold text-zinc-900 mb-2">Deudita</h1>
        <p className="text-zinc-500 mb-8">Plataforma de Gastos Compartidos</p>

        {error && (
          <div className="mb-6 p-4 bg-red-50 text-red-600 rounded-xl flex items-center gap-3 text-sm text-left">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <button
          onClick={handleGoogleLogin}
          disabled={isLoggingIn}
          className="w-full bg-zinc-900 text-white rounded-xl py-3 px-4 font-semibold hover:bg-zinc-800 transition-all active:scale-95 shadow-sm flex items-center justify-center space-x-2 disabled:opacity-50"
        >
          {isLoggingIn ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
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
          )}
          <span>{isLoggingIn ? 'Conectando...' : 'Continuar con Google'}</span>
        </button>

        {/* --- [TEMPORARY DEV BYPASS BUTTON - EASY TO REMOVE] --- */}
        <div className="mt-6 pt-6 border-t border-zinc-100">
          <a
            href="/auth/bypass"
            className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 text-xs font-semibold text-zinc-600 bg-zinc-100 hover:bg-zinc-200 hover:text-zinc-900 rounded-xl transition-colors"
          >
            <span>🔑 Acceso directo (Restaurar sesión activa)</span>
          </a>
        </div>
        {/* ----------------------------------------------------- */}
      </div>
    </div>
  );
}
