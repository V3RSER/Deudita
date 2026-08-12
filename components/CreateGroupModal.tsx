'use client';

import React, { useState, useRef } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useExpense } from '@/lib/expense-context';
import { GroupCategory } from '@/lib/types';
import { DEFAULT_GROUP_IMAGE } from '@/lib/group-utils';
import {
  X,
  Users,
  Plane,
  Home,
  Heart,
  Calendar,
  Briefcase,
  Folder,
  Check,
  Camera,
  Sparkles,
  Upload,
  Trash2,
  Loader2,
  Calculator,
  UserPlus,
  AlertCircle,
} from 'lucide-react';

interface CreateGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const CATEGORY_OPTIONS: Array<{
  id: GroupCategory;
  label: string;
  description: string;
  icon: React.ReactNode;
  bgColor: string;
  borderColor: string;
  textColor: string;
}> = [
  {
    id: 'friends',
    label: 'Amigos',
    description: 'Reuniones, salidas y actividades con amigos',
    icon: <Users className="w-6 h-6" />,
    bgColor: 'bg-emerald-50 hover:bg-emerald-100/80',
    borderColor: 'ring-emerald-200 border-emerald-400',
    textColor: 'text-emerald-700',
  },
  {
    id: 'trip',
    label: 'Viajes',
    description: 'Vuelos, hoteles, cenas y recorridos',
    icon: <Plane className="w-6 h-6" />,
    bgColor: 'bg-sky-50 hover:bg-sky-100/80',
    borderColor: 'ring-sky-200 border-sky-400',
    textColor: 'text-sky-700',
  },
  {
    id: 'home',
    label: 'Hogar',
    description: 'Arriendo, cuentas, súper y servicios',
    icon: <Home className="w-6 h-6" />,
    bgColor: 'bg-indigo-50 hover:bg-indigo-100/80',
    borderColor: 'ring-indigo-200 border-indigo-400',
    textColor: 'text-indigo-700',
  },
  {
    id: 'couple',
    label: 'Pareja',
    description: 'Gastos compartidos en pareja',
    icon: <Heart className="w-6 h-6" />,
    bgColor: 'bg-rose-50 hover:bg-rose-100/80',
    borderColor: 'ring-rose-200 border-rose-400',
    textColor: 'text-rose-700',
  },
  {
    id: 'event',
    label: 'Eventos',
    description: 'Fiestas, cumpleaños y reuniones',
    icon: <Calendar className="w-6 h-6" />,
    bgColor: 'bg-amber-50 hover:bg-amber-100/80',
    borderColor: 'ring-amber-200 border-amber-400',
    textColor: 'text-amber-700',
  },
  {
    id: 'accounting',
    label: 'Contabilidad',
    description: 'Balances, presupuestos y control financiero',
    icon: <Calculator className="w-6 h-6" />,
    bgColor: 'bg-purple-50 hover:bg-purple-100/80',
    borderColor: 'ring-purple-200 border-purple-400',
    textColor: 'text-purple-700',
  },
  {
    id: 'work',
    label: 'Trabajo',
    description: 'Equipos, oficina y negocios',
    icon: <Briefcase className="w-6 h-6" />,
    bgColor: 'bg-blue-50 hover:bg-blue-100/80',
    borderColor: 'ring-blue-200 border-blue-400',
    textColor: 'text-blue-700',
  },
  {
    id: 'other',
    label: 'Otros',
    description: 'Cualquier otro tipo de gasto',
    icon: <Folder className="w-6 h-6" />,
    bgColor: 'bg-slate-50 hover:bg-slate-100/80',
    borderColor: 'ring-slate-200 border-slate-400',
    textColor: 'text-slate-700',
  },
];

export function CreateGroupModal({ isOpen, onClose }: CreateGroupModalProps) {
  const router = useRouter();
  const { createGroup, profiles, currentProfile, addFriend } = useExpense();

  const [name, setName] = useState('');
  const [category, setCategory] = useState<GroupCategory>('friends');
  const [selectedCurrency, setSelectedCurrency] = useState<string>(currentProfile?.currency || 'COP');
  const [groupImageUrl, setGroupImageUrl] = useState<string>('');
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [newFriendName, setNewFriendName] = useState('');
  const [isAddingNewFriend, setIsAddingNewFriend] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Available friend profiles (excluding current user)
  const availableFriends = profiles.filter((p) => p.id && p.id !== currentProfile?.id);

  if (!isOpen) return null;

  const toggleSelectFriend = (friendId: string) => {
    setSelectedMemberIds((prev) =>
      prev.includes(friendId) ? prev.filter((id) => id !== friendId) : [...prev, friendId]
    );
  };

  const handleAddNewFriendOnTheFly = async () => {
    if (!newFriendName.trim()) return;
    try {
      setIsAddingNewFriend(true);
      setErrorMessage(null);
      const newProf = await addFriend(newFriendName.trim());
      if (newProf && newProf.id) {
        setSelectedMemberIds((prev) => [...prev, newProf.id]);
      }
      setNewFriendName('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al agregar amigo';
      setErrorMessage(msg);
    } finally {
      setIsAddingNewFriend(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setErrorMessage(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', 'group_avatar');

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Error al subir la imagen');
      }

      const data = await res.json();
      if (data.url) {
        setGroupImageUrl(data.url);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo subir la foto del grupo';
      setErrorMessage(msg);
    } finally {
      setIsUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setErrorMessage(null);

    const groupName = name.trim();
    if (!groupName) {
      setErrorMessage('Por favor, ingresa el nombre del grupo.');
      return;
    }

    setIsSubmitting(true);
    try {
      const finalAvatar = groupImageUrl.trim() ? groupImageUrl.trim() : DEFAULT_GROUP_IMAGE;

      const newGroup = await createGroup(groupName, category, '', [], finalAvatar, selectedMemberIds, selectedCurrency);
      
      setName('');
      setGroupImageUrl('');
      setSelectedMemberIds([]);
      onClose();

      // Direct navigation to /groups/[groupId]
      if (newGroup && newGroup.id) {
        router.push(`/groups/${newGroup.id}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'No se pudo crear el grupo. Inténtalo nuevamente.';
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-zinc-950/40 backdrop-blur-md overflow-y-auto">
      <div className="bg-white rounded-[24px] shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100">
          <div className="flex items-center space-x-3">
            <button type="button" onClick={onClose} className="p-2 -ml-2 rounded-full hover:bg-zinc-100 text-zinc-500 transition">
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-lg font-bold text-zinc-900 tracking-tight">
              Crear Nuevo Grupo
            </h2>
          </div>
        </div>

        {/* Error Banner */}
        {errorMessage && (
          <div className="bg-rose-50 px-6 py-3 border-b border-rose-100 flex items-center text-sm font-medium text-rose-700">
            <AlertCircle className="w-4 h-4 mr-2 shrink-0" /> {errorMessage}
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* Nombre y Moneda */}
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Nombre del Grupo</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej: Viaje Cancún 2026, Arriendo Dpto"
                className="w-full px-4 py-3 bg-white border border-zinc-200 rounded-xl text-sm font-semibold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all shadow-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Moneda Principal</label>
              <select
                value={selectedCurrency}
                onChange={(e) => setSelectedCurrency(e.target.value)}
                className="w-full px-4 py-3 bg-white border border-zinc-200 rounded-xl text-sm font-medium text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all shadow-sm"
              >
                <option value="COP">COP - Peso Colombiano ($)</option>
                <option value="MXN">MXN - Peso Mexicano ($)</option>
                <option value="CLP">CLP - Peso Chileno ($)</option>
                <option value="ARS">ARS - Peso Argentino ($)</option>
                <option value="USD">USD - Dólar Estadounidense ($)</option>
                <option value="EUR">EUR - Euro (€)</option>
                <option value="PEN">PEN - Sol Peruano (S/)</option>
              </select>
            </div>
          </div>

          {/* Integrantes */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider">
                Integrantes
              </label>
              <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md">
                {selectedMemberIds.length} amigo(s)
              </span>
            </div>

            {/* Quick Add Friend */}
            <div className="flex items-center gap-2 mb-3">
              <input
                type="text"
                value={newFriendName}
                onChange={(e) => setNewFriendName(e.target.value)}
                placeholder="Añadir nuevo amigo..."
                className="flex-1 px-3.5 py-2.5 bg-white border border-zinc-200 rounded-xl text-sm font-medium text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all shadow-sm"
              />
              <button
                type="button"
                onClick={handleAddNewFriendOnTheFly}
                disabled={isAddingNewFriend || !newFriendName.trim()}
                className="px-4 py-2.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-900 rounded-xl text-sm font-bold disabled:opacity-50 transition-colors shadow-sm"
              >
                {isAddingNewFriend ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  'Añadir'
                )}
              </button>
            </div>

            {/* Friend List Selection Pills */}
            <div className="bg-zinc-50 p-3 rounded-2xl border border-zinc-100 max-h-40 overflow-y-auto shadow-inner">
              {availableFriends.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {availableFriends.map((friend) => {
                    const isSelected = selectedMemberIds.includes(friend.id);
                    return (
                      <button
                        key={friend.id}
                        type="button"
                        onClick={() => toggleSelectFriend(friend.id)}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all flex items-center space-x-1.5 border shadow-sm ${
                          isSelected
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : 'bg-white text-zinc-700 border-zinc-200 hover:border-zinc-300'
                        }`}
                      >
                        <span>{friend.full_name || friend.email || 'Amigo'}</span>
                        {isSelected ? (
                          <Check className="w-3.5 h-3.5" />
                        ) : (
                          <UserPlus className="w-3.5 h-3.5 text-zinc-400" />
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-zinc-500 italic text-center py-2">
                  No tienes amigos guardados. Añade uno arriba.
                </p>
              )}
            </div>
          </div>

          {/* Tipo de Grupo */}
          <div>
            <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3">
              Tipo de Grupo
            </label>
            <div className="grid grid-cols-2 gap-3">
              {CATEGORY_OPTIONS.map((cat) => {
                const isSelected = category === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategory(cat.id)}
                    className={`p-3 rounded-xl border text-left transition-all flex items-center space-x-3 shadow-sm ${
                      isSelected
                        ? 'border-emerald-500 bg-emerald-50/50 ring-1 ring-emerald-500'
                        : 'border-zinc-200 bg-white hover:bg-zinc-50 hover:border-zinc-300'
                    }`}
                  >
                    <div className={`p-2 rounded-lg bg-white shadow-sm border border-zinc-100 ${isSelected ? 'text-emerald-600' : 'text-zinc-600'}`}>
                      {cat.icon}
                    </div>
                    <div>
                      <p className={`text-sm font-bold ${isSelected ? 'text-emerald-900' : 'text-zinc-700'}`}>
                        {cat.label}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Foto del Grupo (Opcional) */}
          <div className="pt-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              className="hidden"
            />
            
            {groupImageUrl ? (
               <div className="flex items-center justify-between bg-zinc-50 p-3 rounded-xl border border-zinc-200 shadow-sm">
                  <div className="flex items-center space-x-3">
                    <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-zinc-100 shadow-sm">
                      <Image
                        src={groupImageUrl}
                        alt="Foto"
                        fill
                        className="object-cover"
                        unoptimized
                        referrerPolicy="no-referrer"
                      />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-zinc-900">Foto personalizada</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                     <button type="button" onClick={() => fileInputRef.current?.click()} className="text-xs font-bold text-zinc-600 hover:text-zinc-900">
                        Cambiar
                     </button>
                     <button type="button" onClick={() => setGroupImageUrl('')} className="text-xs font-bold text-rose-600 hover:text-rose-700">
                        Quitar
                     </button>
                  </div>
               </div>
            ) : (
              <button
                type="button"
                disabled={isUploading}
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center justify-center space-x-2 py-3 bg-white border border-zinc-200 hover:bg-zinc-50 rounded-xl text-sm font-semibold text-zinc-600 shadow-sm transition-all"
              >
                {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                <span>Añadir foto del grupo (opcional)</span>
              </button>
            )}
          </div>

        </form>

        {/* Footer Actions */}
        <div className="p-5 sm:px-6 border-t border-zinc-100 bg-zinc-50/80 flex items-center justify-end rounded-b-[24px]">
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || !name.trim()}
            className="w-full sm:w-auto px-8 py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl transition-all shadow-md active:scale-95 flex items-center justify-center disabled:opacity-50 cursor-pointer"
          >
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            <span>Crear Grupo</span>
          </button>
        </div>
      </div>
    </div>
  );
}
