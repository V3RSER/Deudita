'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { useExpense } from '@/lib/expense-context';
import { GroupCategory } from '@/lib/types';
import { X, Users, Plus, Check } from 'lucide-react';

interface CreateGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CreateGroupModal({ isOpen, onClose }: CreateGroupModalProps) {
  const { currentProfile, createGroup } = useExpense();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<GroupCategory>('home');
  const [emails, setEmails] = useState<string[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleAddEmail = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!newEmail.trim() || !newEmail.includes('@')) return;
    if (!emails.includes(newEmail.trim().toLowerCase())) {
      setEmails([...emails, newEmail.trim().toLowerCase()]);
    }
    setNewEmail('');
  };

  const handleRemoveEmail = (emailToRemove: string) => {
    setEmails(emails.filter(e => e !== emailToRemove));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name || name.trim().length === 0) {
      alert('Ingresa el nombre del grupo');
      return;
    }

    setIsSubmitting(true);
    await createGroup(name, category, description, emails);
    setIsSubmitting(false);
    
    setName('');
    setDescription('');
    setEmails([]);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/70 backdrop-blur-sm">
      <div className="bg-white rounded-[2rem] ring-1 ring-zinc-200 shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="bg-zinc-900 text-white p-8 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 rounded-2xl bg-zinc-800 ring-1 ring-zinc-700 flex items-center justify-center text-zinc-100 font-bold">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-zinc-50">Crear Nuevo Grupo</h2>
              <p className="text-sm text-zinc-400 mt-1">Organiza gastos para un viaje, casa o evento</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          <div>
            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">
              Nombre del Grupo
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Depa Roomies 402 o Viaje Bariloche"
              className="w-full px-4 py-3 bg-zinc-50 border-none ring-1 ring-zinc-200 rounded-xl text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900 transition-all placeholder:text-zinc-400"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">
              Categoría
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as GroupCategory)}
              className="w-full px-4 py-3 bg-zinc-50 border-none ring-1 ring-zinc-200 rounded-xl text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900 transition-all"
            >
              <option value="home">Hogar / Departamento</option>
              <option value="trip">Viaje / Vacaciones</option>
              <option value="event">Evento / Asado</option>
              <option value="couple">Pareja</option>
              <option value="work">Oficina / Trabajo</option>
              <option value="other">Otro</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">
              Descripción (Opcional)
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ej: Cuentas del depa y compras mensuales"
              className="w-full px-4 py-3 bg-zinc-50 border-none ring-1 ring-zinc-200 rounded-xl text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900 transition-all placeholder:text-zinc-400"
            />
          </div>

          {/* Member Selection */}
          <div>
            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">
              Invitar Integrantes Iniciales (Emails)
            </label>

            <div className="flex space-x-2 mb-3">
              <input
                type="email"
                placeholder="correo@ejemplo.com"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className="flex-1 px-4 py-2.5 bg-white border-none ring-1 ring-zinc-200 rounded-xl text-sm transition-all focus:ring-2 focus:ring-zinc-900"
              />
              <button
                type="button"
                onClick={handleAddEmail}
                className="px-4 py-2.5 bg-zinc-900 text-white rounded-xl text-sm font-medium hover:bg-zinc-800 transition-all active:scale-95"
              >
                Añadir
              </button>
            </div>

            <div className="space-y-3 max-h-52 overflow-y-auto pr-2">
              {/* Pinned Current Profile (Creator) */}
              {currentProfile && (
                <div className="flex items-center justify-between p-3 rounded-xl ring-1 ring-emerald-200 bg-emerald-50/50 text-sm shadow-sm">
                  <div className="flex items-center space-x-3">
                    <Image src={currentProfile.avatar_url} alt={currentProfile.full_name} width={32} height={32} className="w-8 h-8 rounded-full object-cover ring-2 ring-emerald-100" unoptimized referrerPolicy="no-referrer" />
                    <div>
                      <p className="text-zinc-900 font-semibold tracking-tight">
                        {currentProfile.full_name} <span className="text-[10px] text-emerald-700 font-bold uppercase tracking-widest ml-1">(Creador)</span>
                      </p>
                      <p className="text-[11px] text-zinc-500 mt-0.5">{currentProfile.email}</p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-1.5 px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-lg text-[10px] font-bold uppercase tracking-widest">
                    <Check className="w-3 h-3" />
                    <span>Incluido</span>
                  </div>
                </div>
              )}

              {emails.map((email) => (
                <div
                  key={email}
                  className="flex items-center justify-between p-3 rounded-xl ring-1 bg-white ring-zinc-200 shadow-sm text-sm"
                >
                  <p className="font-medium text-zinc-900">{email}</p>
                  <button
                    type="button"
                    onClick={() => handleRemoveEmail(email)}
                    className="p-1 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Submit */}
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
              disabled={isSubmitting}
              className="px-6 py-2.5 rounded-full bg-zinc-900 hover:bg-zinc-800 text-white text-sm font-medium shadow-sm transition-all active:scale-95 disabled:opacity-50"
            >
              {isSubmitting ? 'Creando...' : 'Crear Grupo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
