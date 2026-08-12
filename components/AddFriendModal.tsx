'use client';

import React, { useState } from 'react';
import { useExpense } from '@/lib/expense-context';
import { X, UserPlus, CheckCircle2, AlertCircle, Sparkles } from 'lucide-react';

interface AddFriendModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AddFriendModal({ isOpen, onClose }: AddFriendModalProps) {
  const { addFriend } = useExpense();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting || !fullName.trim()) return;

    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await addFriend(fullName.trim(), email.trim() ? email.trim() : undefined);
      setSuccessMessage(`"${fullName.trim()}" ha sido añadido a tu lista de amigos.`);
      setFullName('');
      setEmail('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al agregar amigo';
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = () => {
    setSuccessMessage(null);
    setErrorMessage(null);
    setFullName('');
    setEmail('');
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/70 backdrop-blur-sm">
      <div className="bg-white rounded-[2rem] ring-1 ring-zinc-200 shadow-2xl w-full max-w-md p-6 sm:p-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-zinc-900 text-white flex items-center justify-center shadow-sm">
              <UserPlus className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h3 className="font-semibold text-lg text-zinc-900 tracking-tight">Agregar Amigo</h3>
              <p className="text-xs text-zinc-500">Crea un contacto reutilizable para tus grupos</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMessage && (
          <div className="p-3.5 bg-rose-50 ring-1 ring-rose-200 text-rose-800 rounded-xl text-xs font-medium flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage ? (
          <div className="space-y-5 py-2">
            <div className="p-4 bg-emerald-50 ring-1 ring-emerald-200 text-emerald-900 rounded-2xl text-xs font-medium flex items-center space-x-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <span className="leading-relaxed">{successMessage}</span>
            </div>
            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={handleReset}
                className="px-4 py-2.5 rounded-full ring-1 ring-zinc-200 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 transition-colors"
              >
                Agregar otro amigo
              </button>
              <button
                type="button"
                onClick={handleClose}
                className="px-5 py-2.5 rounded-full bg-zinc-900 text-white text-xs font-semibold shadow-sm hover:bg-zinc-800 transition-colors"
              >
                Listo
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5">
                Nombre Completo *
              </label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Ej. Mateo Gómez"
                className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-semibold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:bg-white transition-all placeholder:text-zinc-400"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5">
                Correo Electrónico (Opcional)
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="amigo@ejemplo.com"
                className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-semibold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:bg-white transition-all placeholder:text-zinc-400"
              />
              <p className="text-[11px] text-zinc-400 mt-1">
                Podrás usar su correo más adelante para enviarle invitaciones a grupos.
              </p>
            </div>

            <div className="flex justify-end space-x-2 pt-3">
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2.5 rounded-full ring-1 ring-zinc-200 text-xs font-medium text-zinc-600 hover:bg-zinc-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !fullName.trim()}
                className="px-6 py-2.5 rounded-full bg-zinc-900 text-white text-xs font-semibold shadow-sm hover:bg-zinc-800 disabled:opacity-50 flex items-center space-x-2 transition-all active:scale-95"
              >
                {isSubmitting ? (
                  <span>Guardando...</span>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Guardar Amigo</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
