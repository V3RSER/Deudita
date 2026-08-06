'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Unhandled app error:', error);
  }, [error]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-slate-50 text-slate-900">
      <h2 className="text-2xl font-bold mb-2">Algo salió mal</h2>
      <p className="text-slate-600 mb-6 text-sm">Ocurrió un error inesperado al cargar la aplicación.</p>
      <button
        onClick={() => reset()}
        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition font-medium text-sm"
      >
        Reintentar
      </button>
    </div>
  );
}
