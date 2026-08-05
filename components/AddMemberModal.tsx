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
  const { groups, members, profiles, addMemberToGroup, addProfile } = useExpense();
  const [selectedUserId, setSelectedUserId] = useState<string>('');

  const [showAddContact, setShowAddContact] = useState(false);
  const [newContactName, setNewContactName] = useState('');
  const [newContactEmail, setNewContactEmail] = useState('');

  if (!isOpen) return null;

  const group = groups.find((g) => g.id === groupId);
  const groupName = group ? group.name : 'Grupo';

  const currentGroupMemberUserIds = new Set(
    members.filter((m) => m.group_id === groupId).map((m) => m.user_id)
  );

  const availableProfiles = profiles.filter((p) => !currentGroupMemberUserIds.has(p.id));

  const handleAddNewContact = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!newContactName.trim()) return;
    const created = addProfile(newContactName, newContactEmail);
    addMemberToGroup(groupId, created.id);
    setNewContactName('');
    setNewContactEmail('');
    setShowAddContact(false);
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId) {
      alert('Selecciona un integrante para añadir');
      return;
    }

    addMemberToGroup(groupId, selectedUserId);
    setSelectedUserId('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden">
        <div className="bg-slate-900 text-white p-6 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center text-slate-950 font-bold">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Añadir Integrante</h2>
              <p className="text-xs text-slate-400">
                Añadir persona a {groupName}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Seleccionar de Contactos
            </label>
            <button
              type="button"
              onClick={() => setShowAddContact(!showAddContact)}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-700"
            >
              {showAddContact ? 'Cancelar' : '+ Nuevo Contacto'}
            </button>
          </div>

          {showAddContact && (
            <div className="bg-indigo-50/60 border border-indigo-100 rounded-2xl p-3 space-y-2">
              <p className="text-xs font-bold text-indigo-900">Agregar nuevo amigo:</p>
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
                Crear y Añadir a {groupName}
              </button>
            </div>
          )}

          {availableProfiles.length === 0 && !showAddContact ? (
            <p className="text-sm text-slate-500 text-center py-4">
              Usa &quot;+ Nuevo Contacto&quot; arriba para crear un nuevo integrante.
            </p>
          ) : (
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                Selecciona la Persona
              </label>

              <div className="space-y-2 max-h-52 overflow-y-auto">
                {availableProfiles.map((p) => {
                  const isSelected = selectedUserId === p.id;

                  return (
                    <div
                      key={p.id}
                      onClick={() => setSelectedUserId(p.id)}
                      className={`flex items-center justify-between p-3 rounded-2xl border cursor-pointer text-xs transition ${
                        isSelected
                          ? 'bg-indigo-50 border-indigo-200 font-semibold'
                          : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        <img src={p.avatar_url} alt={p.full_name} className="w-8 h-8 rounded-full" />
                        <div>
                          <p className="text-slate-900 font-bold">{p.full_name}</p>
                          <p className="text-slate-400 text-[11px]">{p.email}</p>
                        </div>
                      </div>

                      {isSelected && (
                        <div className="w-5 h-5 bg-indigo-600 text-white rounded-full flex items-center justify-center">
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="pt-4 border-t border-slate-100 flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-semibold transition"
            >
              Cancelar
            </button>
            {availableProfiles.length > 0 && (
              <button
                type="submit"
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold shadow-sm transition"
              >
                Añadir al Grupo
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
