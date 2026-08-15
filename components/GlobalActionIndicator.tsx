'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useExpense } from '@/lib/expense-context';
import { Loader2, Check } from 'lucide-react';

export function GlobalActionIndicator() {
  const { isMutating, activeOperation } = useExpense();
  const [showSuccess, setShowSuccess] = useState(false);
  const prevIsMutatingRef = useRef(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (prevIsMutatingRef.current && !isMutating) {
      setShowSuccess(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setShowSuccess(false);
      }, 1400);
    }
    prevIsMutatingRef.current = isMutating;

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isMutating]);

  if (!isMutating && !showSuccess) {
    return null;
  }

  const displayText = isMutating
    ? (activeOperation || 'Guardando cambios...')
    : 'Completado con éxito';

  return (
    <div
      id="global-action-indicator"
      className="fixed top-3 left-1/2 -translate-x-1/2 z-50 pointer-events-none transition-all duration-300 animate-in fade-in slide-in-from-top-2"
    >
      {/* Top progress bar line */}
      <div className="fixed top-0 left-0 right-0 h-0.5 bg-zinc-200 overflow-hidden z-50">
        <div className="h-full bg-emerald-500 animate-pulse w-full origin-left transition-all" />
      </div>

      {/* Floating Pill */}
      <div className="flex items-center space-x-2.5 px-4 py-2 rounded-full bg-zinc-900/95 text-white text-xs font-semibold shadow-xl border border-zinc-800/80 backdrop-blur-md">
        {isMutating ? (
          <Loader2 className="w-3.5 h-3.5 text-emerald-400 animate-spin shrink-0" />
        ) : (
          <div className="w-3.5 h-3.5 rounded-full bg-emerald-500 flex items-center justify-center shrink-0">
            <Check className="w-2.5 h-2.5 text-zinc-900 stroke-[3]" />
          </div>
        )}
        <span className="tracking-tight text-zinc-100">{displayText}</span>
      </div>
    </div>
  );
}

