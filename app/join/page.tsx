'use client';

import React, { useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';

function JoinContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const inviteId =
      searchParams.get('token') ??
      searchParams.get('id') ??
      searchParams.get('group') ??
      searchParams.get('code') ??
      searchParams.get('invite');

    if (inviteId) {
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem('deudita_invite_token', inviteId);
        window.localStorage.setItem('deudita_pending_invite', inviteId);
      }
      router.replace(`/join/${inviteId}`);
    } else if (typeof window !== 'undefined') {
      const storedInvite =
        window.sessionStorage.getItem('deudita_invite_token') ??
        window.localStorage.getItem('deudita_pending_invite');
      if (storedInvite) {
        router.replace(`/join/${storedInvite}`);
      } else {
        router.replace('/groups');
      }
    }
  }, [router, searchParams]);

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center p-4">
      <Loader2 className="w-8 h-8 text-zinc-900 animate-spin" />
      <p className="text-sm font-medium text-zinc-500 mt-3">Redirigiendo a la invitación...</p>
    </div>
  );
}

export default function JoinGeneralPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center p-4">
          <Loader2 className="w-8 h-8 text-zinc-900 animate-spin" />
          <p className="text-sm font-medium text-zinc-500 mt-3">Cargando...</p>
        </div>
      }
    >
      <JoinContent />
    </Suspense>
  );
}
