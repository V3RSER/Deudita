'use client';

import React, { useState } from 'react';
import { useExpense } from '@/lib/expense-context';
import { X, UserPlus, Check } from 'lucide-react';

interface AddMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupId: string;
}

export function AddMemberModal({ isOpen, onClose, groupId }: AddMemberModalProps) {
  const { userGroups, addGroupInvite } = useExpense();
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const group = userGroups.find((g) => g.id === groupId);
  const groupName = group ? group.name : 'Grupo';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setIsSubmitting(true);
    await addGroupInvite(groupId, email);
    setIsSubmitting(false);
    setEmail('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/70 backdrop-blur-sm">
      <div className="bg-white rounded-[2rem] ring-1 ring-zinc-200 shadow-2xl w-full max-w-md overflow-hidden">
        <div className="bg-zinc-900 text-white p-8 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 rounded-2xl bg-zinc-800 ring-1 ring-zinc-700 flex items-center justify-center text-zinc-100 font-bold">
              <UserPlus className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-zinc-50">Invitar Integrante</h2>
              <p className="text-sm text-zinc-400 mt-1">
                Añadir persona a <span className="font-medium text-white">{groupName}</span>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          <div className="bg-zinc-50 ring-1 ring-zinc-200 rounded-2xl p-4 space-y-3">
            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
              Email del invitado
            </label>
            <input
              type="email"
              placeholder="amigo@correo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-2.5 bg-white border-none ring-1 ring-zinc-200 rounded-xl text-sm transition-all focus:ring-2 focus:ring-zinc-900"
            />
          </div>

          <div className="pt-6 border-t border-zinc-100 flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-full ring-1 ring-zinc-200 text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 text-sm font-medium transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !email.trim()}
              className="px-6 py-2.5 rounded-full bg-zinc-900 hover:bg-zinc-800 text-white text-sm font-medium shadow-sm transition-all active:scale-95 disabled:opacity-50"
            >
              {isSubmitting ? 'Enviando...' : 'Invitar al Grupo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
