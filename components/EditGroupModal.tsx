'use client';

import React, { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import { useExpense } from '@/lib/expense-context';
import { Group, GroupCategory } from '@/lib/types';
import { getGroupImage, getCleanGroupDescription, DEFAULT_GROUP_IMAGE } from '@/lib/group-utils';
import {
  X,
  Users,
  Plane,
  Home,
  Heart,
  Calendar,
  Briefcase,
  Folder,
  Camera,
  Loader2,
  Calculator,
  AlertCircle,
  FileText,
  ListChecks,
  ChevronDown
} from 'lucide-react';

interface EditGroupModalProps {
  isOpen: boolean;
  group: Group;
  onClose: () => void;
}

const CATEGORY_OPTIONS: Array<{
  id: GroupCategory;
  label: string;
  icon: any;
  bgColor: string;
  textColor: string;
}> = [
  { id: 'friends', label: 'Amigos', icon: Users, bgColor: 'bg-emerald-50', textColor: 'text-emerald-700' },
  { id: 'trip', label: 'Viajes', icon: Plane, bgColor: 'bg-sky-50', textColor: 'text-sky-700' },
  { id: 'home', label: 'Hogar', icon: Home, bgColor: 'bg-indigo-50', textColor: 'text-indigo-700' },
  { id: 'couple', label: 'Pareja', icon: Heart, bgColor: 'bg-rose-50', textColor: 'text-rose-700' },
  { id: 'event', label: 'Eventos', icon: Calendar, bgColor: 'bg-amber-50', textColor: 'text-amber-700' },
  { id: 'accounting', label: 'Contabilidad', icon: Calculator, bgColor: 'bg-purple-50', textColor: 'text-purple-700' },
  { id: 'work', label: 'Trabajo', icon: Briefcase, bgColor: 'bg-blue-50', textColor: 'text-blue-700' },
  { id: 'other', label: 'Otros', icon: Folder, bgColor: 'bg-slate-50', textColor: 'text-slate-700' },
];

export function EditGroupModal({ isOpen, group, onClose }: EditGroupModalProps) {
  const { updateGroup } = useExpense();

  const [name, setName] = useState(group.name);
  const [category, setCategory] = useState<GroupCategory>(group.category || 'home');
  const [description, setDescription] = useState(getCleanGroupDescription(group.description));
  const [selectedCurrency, setSelectedCurrency] = useState<string>(group.currency || 'COP');
  const [groupImageUrl, setGroupImageUrl] = useState<string>(getGroupImage(group) || '');
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setName(group.name);
      setCategory(group.category || 'home');
      setDescription(getCleanGroupDescription(group.description));
      setSelectedCurrency(group.currency || 'COP');
      setGroupImageUrl(getGroupImage(group) || '');
      setErrorMessage(null);
    }
  }, [isOpen, group]);

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

  const handleSubmit = async () => {
    if (isSubmitting) return;
    setErrorMessage(null);

    const groupName = name.trim();
    if (!groupName) {
      setErrorMessage('Por favor, ingresa el nombre del grupo.');
      return;
    }

    setIsSubmitting(true);
    try {
      await updateGroup(
        group.id,
        groupName,
        category,
        description.trim(),
        groupImageUrl.trim(),
        selectedCurrency
      );
      
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'No se pudo actualizar el grupo. Inténtalo nuevamente.';
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedCatConfig = CATEGORY_OPTIONS.find(c => c.id === category) || CATEGORY_OPTIONS[0];
  const CategoryIcon = selectedCatConfig.icon;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-zinc-950/40 backdrop-blur-md overflow-y-auto">
      <div className="bg-white rounded-[24px] shadow-2xl w-full max-w-md flex flex-col my-auto max-h-[95vh] overflow-hidden transition-all duration-300">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 shrink-0">
          <h2 className="text-lg font-bold text-zinc-900 tracking-tight">
            Editar grupo
          </h2>
          <button onClick={onClose} className="p-2 -mr-2 rounded-full hover:bg-zinc-100 text-zinc-500 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error Banner */}
        {errorMessage && (
          <div className="bg-rose-50 px-6 py-3 border-b border-rose-100 flex items-center text-sm font-medium text-rose-700 shrink-0">
            <AlertCircle className="w-4 h-4 mr-2 shrink-0" /> {errorMessage}
          </div>
        )}

        {/* Form Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
          
          {/* General Info */}
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-sm font-bold text-zinc-900 flex items-center">
                <FileText className="w-4 h-4 mr-2 text-emerald-600" />
                Información general
              </h3>
            </div>
            <div className="flex items-center gap-4 bg-white p-4 rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
              <div className={`w-12 h-12 rounded-full ${groupImageUrl ? '' : selectedCatConfig.bgColor} flex items-center justify-center shrink-0 border border-black/5 overflow-hidden relative`}>
                {groupImageUrl ? (
                  <Image src={groupImageUrl} alt="Group" fill className="object-cover" unoptimized referrerPolicy="no-referrer" />
                ) : (
                  <CategoryIcon className={`w-6 h-6 ${selectedCatConfig.textColor}`} />
                )}
              </div>
              <div className="flex-1 flex flex-col gap-2">
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Nombre del grupo (ej. Viaje Cancún)"
                  className="w-full text-left text-lg text-zinc-800 bg-transparent border-b border-dashed border-zinc-300 pb-1 focus:outline-none focus:ring-0 placeholder:text-zinc-400 focus:border-zinc-500 transition-colors font-bold"
                  autoFocus
                />
              </div>
            </div>
          </div>

          {/* Details */}
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-sm font-bold text-zinc-900 flex items-center">
                <ListChecks className="w-4 h-4 mr-2 text-emerald-600" />
                Detalles
              </h3>
            </div>
            <div className="bg-white border border-zinc-200 rounded-2xl p-3 space-y-2 shadow-sm overflow-hidden">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider pl-0.5">Descripción (opcional)</label>
                <input
                  type="text"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Breve descripción del grupo"
                  className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 focus:bg-white rounded-lg text-xs font-semibold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-colors"
                />
              </div>

              <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider pl-0.5">Categoría</label>
                  <div className="relative shadow-sm rounded-lg bg-white border border-zinc-200">
                    <select
                      value={category}
                      onChange={e => setCategory(e.target.value as GroupCategory)}
                      className="w-full pl-2.5 pr-8 py-1.5 text-xs font-semibold text-zinc-900 appearance-none bg-transparent focus:outline-none focus:ring-2 focus:ring-emerald-500/20 rounded-lg"
                    >
                      {CATEGORY_OPTIONS.map(cat => (
                        <option key={cat.id} value={cat.id}>{cat.label}</option>
                      ))}
                    </select>
                    <ChevronDown className="w-3.5 h-3.5 text-zinc-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider pl-0.5">Moneda principal</label>
                  <div className="relative shadow-sm rounded-lg bg-white border border-zinc-200">
                    <select
                      value={selectedCurrency}
                      onChange={e => setSelectedCurrency(e.target.value)}
                      className="w-full pl-2.5 pr-8 py-1.5 text-xs font-semibold text-zinc-900 appearance-none bg-transparent focus:outline-none focus:ring-2 focus:ring-emerald-500/20 rounded-lg"
                    >
                      <option value="COP">COP ($)</option>
                      <option value="MXN">MXN ($)</option>
                      <option value="CLP">CLP ($)</option>
                      <option value="ARS">ARS ($)</option>
                      <option value="USD">USD ($)</option>
                      <option value="EUR">EUR (€)</option>
                      <option value="PEN">PEN (S/)</option>
                    </select>
                    <ChevronDown className="w-3.5 h-3.5 text-zinc-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>
              </div>

              <div className="flex gap-2 pt-2 border-t border-zinc-100 mt-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className={`w-full flex items-center justify-center space-x-1.5 py-2 text-xs font-bold transition-all ${groupImageUrl
                      ? 'border border-solid bg-emerald-50 border-emerald-200 text-emerald-700 rounded-xl shadow-sm'
                      : 'border border-dashed border-zinc-300 rounded-xl text-zinc-500 hover:border-emerald-300 hover:text-emerald-600 bg-zinc-50/50 hover:bg-emerald-50/50'
                    }`}
                >
                  {isUploading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Camera className="w-3.5 h-3.5" />
                  )}
                  <span>{groupImageUrl ? 'Cambiar foto de grupo' : 'Añadir foto de grupo'}</span>
                </button>
                <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept="image/*" className="hidden" />
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-zinc-100 bg-zinc-50/80 shrink-0 rounded-b-[24px]">
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || !name.trim()}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl transition-all shadow-md active:scale-95 flex items-center justify-center disabled:opacity-50 cursor-pointer"
          >
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            <span>Guardar cambios</span>
          </button>
        </div>
      </div>
    </div>
  );
}
