'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="es">
      <body>
        <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-slate-50 text-slate-900 font-sans">
          <h2 className="text-2xl font-bold mb-2">Error inesperado</h2>
          <p className="text-slate-600 mb-6 text-sm">{error?.message || 'Ocurrió un error inesperado al cargar la aplicación.'}</p>
          <button
            onClick={() => reset()}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition font-medium text-sm"
          >
            Reintentar
          </button>
        </div>
      </body>
    </html>
  );
}
