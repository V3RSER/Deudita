'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AuthSuccessPage() {
  const router = useRouter();

  useEffect(() => {
    // Si estamos dentro de un popup (ventana emergente), lo cerramos
    if (window.opener) {
      window.close();
    } else {
      // Si no es un popup, redirigimos normalmente
      router.push('/groups');
    }
  }, [router]);

  return (
    <div className="flex h-screen w-full items-center justify-center bg-zinc-50">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-zinc-900 mb-2">¡Inicio de sesión exitoso!</h2>
        <p className="text-zinc-500">Redirigiendo...</p>
      </div>
    </div>
  );
}
