import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-slate-50 text-slate-900">
      <h2 className="text-2xl font-bold mb-2">Página no encontrada (404)</h2>
      <p className="text-slate-600 mb-6">La página que buscas no existe o ha sido movida.</p>
      <Link
        href="/"
        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition font-medium text-sm"
      >
        Volver al inicio
      </Link>
    </div>
  );
}
