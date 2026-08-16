'use client';

import React from 'react';
import { AlertTriangle, Trash2, X, Loader2 } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info';
  isLoading?: boolean;
}

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = 'Eliminar',
  cancelText = 'Cancelar',
  variant = 'danger',
  isLoading = false,
}: ConfirmModalProps) {
  if (!isOpen) return null;

  const isDanger = variant === 'danger';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl ring-1 ring-zinc-200 shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-150 p-6 space-y-5">
        <div className="flex items-start justify-between">
          <div
            className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
              isDanger
                ? 'bg-rose-100 text-rose-600'
                : 'bg-amber-100 text-amber-600'
            }`}
          >
            {isDanger ? (
              <Trash2 className="w-6 h-6" />
            ) : (
              <AlertTriangle className="w-6 h-6" />
            )}
          </div>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="p-1.5 text-zinc-400 hover:text-zinc-600 rounded-full hover:bg-zinc-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-1.5">
          <h3 className="text-base font-bold text-zinc-900 tracking-tight">{title}</h3>
          <p className="text-xs text-zinc-500 leading-relaxed">{description}</p>
        </div>

        <div className="grid grid-cols-2 gap-2.5 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="w-full py-2.5 px-4 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 font-semibold text-xs rounded-xl transition-all active:scale-95 disabled:opacity-50"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className={`w-full py-2.5 px-4 font-semibold text-xs rounded-xl text-white shadow-sm transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center space-x-1.5 ${
              isDanger
                ? 'bg-rose-600 hover:bg-rose-700'
                : 'bg-zinc-900 hover:bg-zinc-800'
            }`}
          >
            {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1 text-white" />}
            <span>{isLoading ? 'Procesando...' : confirmText}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
