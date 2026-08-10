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
  const { createGroup } = useExpense();

  const [name, setName] = useState('');
  const [category, setCategory] = useState<GroupCategory>('friends');
  const [groupImageUrl, setGroupImageUrl] = useState<string>('');
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

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
    setErrorMessage(null);

    const groupName = name.trim();
    if (!groupName) {
      setErrorMessage('Por favor, ingresa el nombre del grupo.');
      return;
    }

    setIsSubmitting(true);
    try {
      const finalAvatar = groupImageUrl.trim() ? groupImageUrl.trim() : DEFAULT_GROUP_IMAGE;

      const newGroup = await createGroup(groupName, category, '', [], finalAvatar);
      
      setName('');
      setGroupImageUrl('');
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

          {/* 2. Foto del Grupo (Opcional) */}
          <div>
            <label className="block text-xs font-bold text-zinc-700 uppercase tracking-wider mb-2">
              2. Foto del Grupo (Opcional)
            </label>

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              className="hidden"
            />

            <div className="bg-zinc-50 p-4 rounded-2xl border border-dashed border-zinc-200">
              {groupImageUrl ? (
                <div className="flex items-center gap-4 bg-white p-3 rounded-xl ring-1 ring-zinc-200">
                  <div className="relative w-16 h-16 rounded-xl overflow-hidden bg-zinc-100 shrink-0 shadow-2xs">
                    <Image
                      src={groupImageUrl}
                      alt="Foto de grupo cargada"
                      fill
                      className="object-cover"
                      unoptimized
                      referrerPolicy="no-referrer"
                    />
                    {isUploading && (
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-white">
                        <Loader2 className="w-5 h-5 animate-spin" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 space-y-1">
                    <p className="text-xs font-semibold text-zinc-900">Foto personalizada seleccionada</p>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="text-xs text-zinc-600 hover:text-zinc-900 font-medium underline"
                      >
                        Cambiar foto
                      </button>
                      <button
                        type="button"
                        onClick={() => setGroupImageUrl('')}
                        className="text-xs text-rose-600 hover:text-rose-700 font-medium underline flex items-center gap-1"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Eliminar</span>
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-2 flex flex-col items-center justify-center text-center space-y-2">
                  <button
                    type="button"
                    disabled={isUploading}
                    onClick={() => fileInputRef.current?.click()}
                    className="px-4 py-2.5 rounded-xl bg-white border border-zinc-200 text-zinc-800 text-xs font-semibold hover:bg-zinc-100 shadow-2xs flex items-center gap-2 transition-all active:scale-95"
                  >
                    {isUploading ? (
                      <Loader2 className="w-4 h-4 animate-spin text-zinc-600" />
                    ) : (
                      <Camera className="w-4 h-4 text-zinc-600" />
                    )}
                    <span>Subir foto personalizada</span>
                  </button>
                  <p className="text-[11px] text-zinc-400">
                    Si no subes una foto, se asignará automáticamente una según el tipo de grupo.
                  </p>
                </div>
              )}
            </div>
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
              className="px-5 py-3 rounded-full ring-1 ring-zinc-200 text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 text-sm font-medium transition-colors active:scale-95"
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
