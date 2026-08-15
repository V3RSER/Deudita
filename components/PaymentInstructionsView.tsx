'use client';

import React, { useState } from 'react';
import { Copy, Check, ExternalLink, QrCode, Building2 } from 'lucide-react';

interface PaymentInstructionsViewProps {
  instructions: string;
}

export function PaymentInstructionsView({ instructions }: PaymentInstructionsViewProps) {
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  if (!instructions || instructions.trim().length === 0) return null;

  const handleCopy = (text: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(text);
      setCopiedToken(text);
      setTimeout(() => setCopiedToken(null), 2500);
    }
  };

  // Helper to detect numeric sequences (account numbers, phones, CC, CVC, etc.) and URLs
  const regex = /(https?:\/\/[^\s]+)|(\b\d{5,20}\b)/g;

  const elements: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(instructions)) !== null) {
    const matchText = match[0];
    const matchIndex = match.index;

    // Push text before match
    if (matchIndex > lastIndex) {
      elements.push(
        <span key={`text-${lastIndex}`}>{instructions.substring(lastIndex, matchIndex)}</span>
      );
    }

    if (matchText.startsWith('http://') || matchText.startsWith('https://')) {
      // URL match
      elements.push(
        <a
          key={`url-${matchIndex}`}
          href={matchText}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center space-x-1.5 text-emerald-700 hover:text-emerald-800 underline font-bold bg-emerald-100/70 hover:bg-emerald-100 px-2.5 py-0.5 rounded-lg mx-1 transition-colors shadow-2xs"
        >
          <span>{matchText}</span>
          <ExternalLink className="w-3.5 h-3.5 shrink-0" />
        </a>
      );
    } else {
      // Account / Phone Number match
      const isCopied = copiedToken === matchText;
      elements.push(
        <button
          type="button"
          key={`num-${matchIndex}`}
          onClick={(e) => {
            e.stopPropagation();
            handleCopy(matchText);
          }}
          className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg border font-mono font-bold text-xs mx-1 transition-all active:scale-95 cursor-pointer shadow-2xs ${
            isCopied
              ? 'bg-emerald-600 border-emerald-600 text-white shadow-emerald-500/20'
              : 'bg-white border-zinc-200/90 text-zinc-900 hover:bg-zinc-50 hover:border-zinc-300'
          }`}
          title="Toca para copiar"
        >
          <span>{matchText}</span>
          {isCopied ? (
            <span className="flex items-center space-x-1 text-[10px] font-sans font-extrabold uppercase">
              <Check className="w-3.5 h-3.5" />
              <span>Copiado</span>
            </span>
          ) : (
            <Copy className="w-3.5 h-3.5 text-zinc-400 group-hover:text-zinc-600" />
          )}
        </button>
      );
    }

    lastIndex = regex.lastIndex;
  }

  // Push remaining text
  if (lastIndex < instructions.length) {
    elements.push(
      <span key={`text-${lastIndex}`}>{instructions.substring(lastIndex)}</span>
    );
  }

  return (
    <div className="relative overflow-hidden bg-gradient-to-br from-emerald-50/90 via-emerald-50/50 to-teal-50/70 border border-emerald-200/70 rounded-2xl p-4 sm:p-4.5 text-xs text-zinc-800 shadow-2xs space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center shadow-xs">
            <Building2 className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-900 block">
              Datos para transferir
            </span>
            <span className="text-[10px] text-emerald-700/80 font-medium">
              Toca los números para copiarlos al portapapeles
            </span>
          </div>
        </div>
        <div className="hidden sm:flex items-center space-x-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
          <QrCode className="w-3 h-3" />
          <span>Cobro directo</span>
        </div>
      </div>

      <div className="bg-white/80 backdrop-blur-xs p-3 rounded-xl border border-emerald-100 leading-relaxed font-medium text-zinc-800 whitespace-pre-wrap">
        {elements}
      </div>
    </div>
  );
}

