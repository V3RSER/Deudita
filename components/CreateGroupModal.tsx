'use client';

import React, { useState } from 'react';
import { useExpense } from '@/lib/expense-context';
import { GroupCategory } from '@/lib/types';
import { X, Users, Plus, Check } from 'lucide-react';

interface CreateGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CreateGroupModal({ isOpen, onClose }: CreateGroupModalProps) {
  const { currentProfile, profiles, createGroup, addProfile } = useExpense();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<GroupCategory>('home');
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);

  const [showAddContact, setShowAddContact] = useState(false);
  const [newContactName, setNewContactName] = useState('');
  const [newContactEmail, setNewContactEmail] = useState('');

  if (!isOpen) return null;

  const otherProfiles = profiles.filter((p) => p.id !== currentProfile.id);

  const toggleMember = (id: string) => {
    if (selectedMemberIds.includes(id)) {
      setSelectedMemberIds(selectedMemberIds.filter((item) => item !== id));
    } else {
      setSelectedMemberIds([...selectedMemberIds, id]);
    }
  };

  const handleAddNewContact = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!newContactName.trim()) return;
    const created = addProfile(newContactName, newContactEmail);
    setSelectedMemberIds((prev) => [...prev, created.id]);
    setNewContactName('');
    setNewContactEmail('');
    setShowAddContact(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!name || name.trim().length === 0) {
      alert('Ingresa el nombre del grupo');
      return;
    }

    createGroup(name, category, description, selectedMemberIds);
    setName('');
    setDescription('');
    setSelectedMemberIds([]);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="bg-slate-900 text-white p-6 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center text-slate-950 font-bold">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Crear Nuevo Grupo</h2>
              <p className="text-xs text-slate-400">Organiza gastos para un viaje, casa o evento</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Nombre del Grupo
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Depa Roomies 402 o Viaje Bariloche"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Categoría
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as GroupCategory)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
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
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Descripción (Opcional)
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ej: Cuentas del depa y compras mensuales"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>

          {/* Member Selection */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Invitar Integrantes Iniciales
              </label>
              <button
                type="button"
                onClick={() => setShowAddContact(!showAddContact)}
                className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center space-x-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{showAddContact ? 'Cancelar' : 'Nuevo Contacto'}</span>
              </button>
            </div>

            {showAddContact && (
              <div className="bg-indigo-50/60 border border-indigo-100 rounded-2xl p-3 mb-3 space-y-2">
                <p className="text-xs font-bold text-indigo-900">Agregar nuevo amigo o contacto:</p>
                <input
                  type="text"
                  placeholder="Nombre y Apellido"
                  value={newContactName}
                  onChange={(e) => setNewContactName(e.target.value)}
                  className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                />
                <input
                  type="email"
                  placeholder="Email (opcional)"
                  value={newContactEmail}
                  onChange={(e) => setNewContactEmail(e.target.value)}
                  className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                />
                <button
                  type="button"
                  onClick={handleAddNewContact}
                  className="w-full py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 transition"
                >
                  Guardar y Seleccionar
                </button>
              </div>
            )}

            <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
              {otherProfiles.length === 0 && !showAddContact ? (
                <p className="text-xs text-slate-500 text-center py-2">
                  Usa &quot;Nuevo Contacto&quot; arriba para agregar a tus amigos.
                </p>
              ) : (
                otherProfiles.map((p) => {
                  const isSelected = selectedMemberIds.includes(p.id);

                  return (
                    <div
                      key={p.id}
                      onClick={() => toggleMember(p.id)}
                      className={`flex items-center justify-between p-2.5 rounded-xl border cursor-pointer text-xs transition ${
                        isSelected
                          ? 'bg-indigo-50 border-indigo-200 font-semibold'
                          : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <div className="flex items-center space-x-2">
                        <img src={p.avatar_url} alt={p.full_name} className="w-6 h-6 rounded-full" />
                        <div>
                          <p className="text-slate-800 leading-tight">{p.full_name}</p>
                          <p className="text-[10px] text-slate-400">{p.email}</p>
                        </div>
                      </div>

                      <div
                        className={`w-5 h-5 rounded-md flex items-center justify-center border ${
                          isSelected
                            ? 'bg-indigo-600 border-indigo-600 text-white'
                            : 'border-slate-300'
                        }`}
                      >
                        {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Submit */}
          <div className="pt-4 border-t border-slate-100 flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-semibold transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold shadow-sm transition"
            >
              Crear Grupo
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
