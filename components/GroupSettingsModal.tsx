'use client';

import React from 'react';
import { X, Pencil, UserPlus, Link as LinkIcon, Trash2 } from 'lucide-react';

interface GroupSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onEditGroup: () => void;
  onAddMembers: () => void;
  onInviteLink: () => void;
  onDeleteGroup: () => void;
}

export function GroupSettingsModal({
  isOpen,
  onClose,
  onEditGroup,
  onAddMembers,
  onInviteLink,
  onDeleteGroup
}: GroupSettingsModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-zinc-950/40 backdrop-blur-md">
      <div className="bg-white rounded-[24px] shadow-2xl w-full max-w-sm flex flex-col overflow-hidden transition-all duration-300">
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 shrink-0">
          <h2 className="text-lg font-bold text-zinc-900 tracking-tight">
            Configuración del grupo
          </h2>
          <button onClick={onClose} className="p-2 -mr-2 rounded-full hover:bg-zinc-100 text-zinc-500 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-2 space-y-1">
          <button
            onClick={onEditGroup}
            className="w-full flex items-center px-4 py-3 rounded-xl hover:bg-zinc-50 text-left transition-colors"
          >
            <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mr-4 shrink-0">
              <Pencil className="w-5 h-5" />
            </div>
            <div>
              <div className="font-semibold text-zinc-900 text-sm">Editar grupo</div>
              <div className="text-xs text-zinc-500 font-medium">Cambiar nombre, foto, moneda...</div>
            </div>
          </button>
          
          <button
            onClick={onAddMembers}
            className="w-full flex items-center px-4 py-3 rounded-xl hover:bg-zinc-50 text-left transition-colors"
          >
            <div className="w-10 h-10 rounded-full bg-sky-50 text-sky-600 flex items-center justify-center mr-4 shrink-0">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <div className="font-semibold text-zinc-900 text-sm">Añadir personas</div>
              <div className="text-xs text-zinc-500 font-medium">Agregar participantes al grupo</div>
            </div>
          </button>

          <button
            onClick={onInviteLink}
            className="w-full flex items-center px-4 py-3 rounded-xl hover:bg-zinc-50 text-left transition-colors"
          >
            <div className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center mr-4 shrink-0">
              <LinkIcon className="w-5 h-5" />
            </div>
            <div>
              <div className="font-semibold text-zinc-900 text-sm">Enlace de invitación</div>
              <div className="text-xs text-zinc-500 font-medium">Copiar o compartir enlace del grupo</div>
            </div>
          </button>
        </div>

        <div className="p-2 border-t border-zinc-100 mt-2 bg-zinc-50/50">
          <button
            onClick={onDeleteGroup}
            className="w-full flex items-center px-4 py-3 rounded-xl hover:bg-rose-50 hover:text-rose-700 text-rose-600 text-left transition-colors"
          >
            <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center mr-4 shrink-0">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <div className="font-bold text-sm">Eliminar grupo</div>
              <div className="text-xs opacity-80 font-medium">Esta acción no se puede deshacer</div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
