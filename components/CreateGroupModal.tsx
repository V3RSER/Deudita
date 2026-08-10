'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useExpense } from '@/lib/expense-context';
import { GroupCategory } from '@/lib/types';
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
    id: 'work',
    label: 'Trabajo',
    description: 'Equipos, oficina y negocios',
    icon: <Briefcase className="w-6 h-6" />,
    bgColor: 'bg-emerald-50 hover:bg-emerald-100/80',
    borderColor: 'ring-emerald-200 border-emerald-400',
    textColor: 'text-emerald-700',
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

const PRESET_AVATARS = [
  'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=150&auto=format&fit=crop&q=80', // Playita
  'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=150&auto=format&fit=crop&q=80', // Casa
  'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=150&auto=format&fit=crop&q=80', // Resto
  'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=150&auto=format&fit=crop&q=80', // Fiesta
  'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=150&auto=format&fit=crop&q=80', // Equipo
];

export function CreateGroupModal({ isOpen, onClose }: CreateGroupModalProps) {
  const router = useRouter();
  const { createGroup } = useExpense();

  const [name, setName] = useState('');
  const [category, setCategory] = useState<GroupCategory>('trip');
  const [selectedAvatar, setSelectedAvatar] = useState<string>(PRESET_AVATARS[0]);
  const [customAvatarUrl, setCustomAvatarUrl] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const groupName = name.trim();
    if (!groupName) {
      setErrorMessage('Por favor, ingresa el nombre del grupo.');
      return;
    }

    setIsSubmitting(true);
    try {
      const finalAvatar = showCustomInput && customAvatarUrl.trim()
        ? customAvatarUrl.trim()
        : selectedAvatar;

      const newGroup = await createGroup(groupName, category, '', [], finalAvatar);
      
      setName('');
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/70 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white rounded-[2rem] ring-1 ring-zinc-200 shadow-2xl w-full max-w-lg my-8 overflow-hidden">
        {/* Header */}
        <div className="bg-zinc-900 text-white p-6 sm:p-8 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 rounded-2xl bg-zinc-800 ring-1 ring-zinc-700 flex items-center justify-center text-zinc-100 font-bold">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-zinc-50">Crear Nuevo Grupo</h2>
              <p className="text-xs text-zinc-400 mt-1">Sigue el flujo rápido para crear tu grupo</p>
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
        <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-6">
          {errorMessage && (
            <div className="p-3.5 bg-red-50 ring-1 ring-red-200 rounded-xl text-sm text-red-700 font-medium">
              {errorMessage}
            </div>
          )}

          {/* 1. Nombre del Grupo */}
          <div>
            <label className="block text-xs font-bold text-zinc-700 uppercase tracking-wider mb-2">
              1. Nombre del Grupo
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Viaje Cancún 2026, Arriendo Dpto, Asado Fin de Semana"
              className="w-full px-4 py-3.5 bg-zinc-50 border-none ring-1 ring-zinc-200 rounded-2xl text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900 transition-all placeholder:text-zinc-400"
            />
          </div>

          {/* 2. Foto o Portada del Grupo */}
          <div>
            <label className="block text-xs font-bold text-zinc-700 uppercase tracking-wider mb-2 flex items-center justify-between">
              <span>2. Foto del Grupo</span>
              <button
                type="button"
                onClick={() => setShowCustomInput(!showCustomInput)}
                className="text-[11px] text-zinc-500 hover:text-zinc-900 underline font-normal normal-case"
              >
                {showCustomInput ? 'Usar fotos predefinidas' : 'Usar URL de foto personalizada'}
              </button>
            </label>

            {showCustomInput ? (
              <input
                type="url"
                value={customAvatarUrl}
                onChange={(e) => setCustomAvatarUrl(e.target.value)}
                placeholder="https://ejemplo.com/foto-grupo.jpg"
                className="w-full px-4 py-3 bg-zinc-50 border-none ring-1 ring-zinc-200 rounded-2xl text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900 transition-all"
              />
            ) : (
              <div className="flex items-center space-x-3 overflow-x-auto pb-2">
                {PRESET_AVATARS.map((url, idx) => {
                  const isSelected = selectedAvatar === url;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setSelectedAvatar(url)}
                      className={`relative w-14 h-14 rounded-2xl overflow-hidden ring-2 transition-all shrink-0 ${
                        isSelected ? 'ring-zinc-900 scale-105 shadow-md' : 'ring-transparent opacity-75 hover:opacity-100'
                      }`}
                    >
                      <Image
                        src={url}
                        alt={`Foto preset ${idx + 1}`}
                        fill
                        className="object-cover"
                        unoptimized
                        referrerPolicy="no-referrer"
                      />
                      {isSelected && (
                        <div className="absolute inset-0 bg-zinc-900/30 flex items-center justify-center text-white">
                          <Check className="w-5 h-5 stroke-[3]" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* 3. Tipo de Grupo (con Gráficos Representativos) */}
          <div>
            <label className="block text-xs font-bold text-zinc-700 uppercase tracking-wider mb-3">
              3. Tipo de Grupo
            </label>

            <div className="grid grid-cols-2 gap-3 max-h-64 overflow-y-auto p-1">
              {CATEGORY_OPTIONS.map((cat) => {
                const isSelected = category === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategory(cat.id)}
                    className={`p-3.5 rounded-2xl ring-1 text-left transition-all flex flex-col justify-between space-y-2 ${
                      cat.bgColor
                    } ${
                      isSelected
                        ? `${cat.borderColor} ring-2 bg-white shadow-md scale-[1.02]`
                        : 'ring-zinc-200/80 opacity-90 hover:opacity-100 hover:scale-[1.01]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className={`p-2 rounded-xl bg-white shadow-sm ${cat.textColor}`}>
                        {cat.icon}
                      </div>
                      {isSelected && (
                        <span className="w-5 h-5 rounded-full bg-zinc-900 text-white flex items-center justify-center">
                          <Check className="w-3 h-3" />
                        </span>
                      )}
                    </div>
                    <div>
                      <p className={`font-semibold text-sm ${cat.textColor}`}>
                        {cat.label}
                      </p>
                      <p className="text-[11px] text-zinc-500 line-clamp-1 mt-0.5">
                        {cat.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 4. Confirmación de Crear el Grupo */}
          <div className="pt-6 border-t border-zinc-100 flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-5 py-3 rounded-full ring-1 ring-zinc-200 text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 text-sm font-medium transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !name.trim()}
              className="px-8 py-3 rounded-full bg-zinc-900 hover:bg-zinc-800 text-white text-sm font-semibold shadow-md transition-all active:scale-95 disabled:opacity-50 flex items-center space-x-2"
            >
              {isSubmitting ? (
                <span>Creando grupo...</span>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-emerald-400" />
                  <span>Crear Grupo</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
