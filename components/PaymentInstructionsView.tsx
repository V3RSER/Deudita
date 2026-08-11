'use client';

import React, { useState } from 'react';
import { Copy, Check, ExternalLink, CreditCard } from 'lucide-react';

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
  // Pattern matches URLs or continuous digit strings of length >= 5
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
          className="inline-flex items-center space-x-1 text-emerald-600 hover:text-emerald-700 underline font-semibold bg-emerald-50 px-2 py-0.5 rounded-md mx-1 transition-colors"
        >
          <span>{matchText}</span>
          <ExternalLink className="w-3 h-3 shrink-0" />
        </a>
      );
    } else {
      // Account / Phone Number match
      const isCopied = copiedToken === matchText;
      elements.push(
        <span
          key={`num-${matchIndex}`}
          className="inline-flex items-center space-x-1.5 bg-zinc-100 hover:bg-zinc-200/80 text-zinc-900 font-mono font-bold text-xs px-2.5 py-1 rounded-lg border border-zinc-200 mx-1 transition-all"
        >
          <span>{matchText}</span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleCopy(matchText);
            }}
            className="p-0.5 text-zinc-500 hover:text-zinc-900 transition-colors"
            title="Copiar número"
          >
            {isCopied ? (
              <Check className="w-3.5 h-3.5 text-emerald-600" />
            ) : (
              <Copy className="w-3.5 h-3.5 text-zinc-600" />
            )}
          </button>
        </span>
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
    <div className="bg-emerald-50/80 border border-emerald-200/80 rounded-2xl p-4 text-xs text-zinc-800 space-y-2">
      <div className="flex items-center space-x-2 text-emerald-800 font-bold uppercase tracking-wider text-[10px]">
        <CreditCard className="w-4 h-4 text-emerald-600 shrink-0" />
        <span>¿Cómo pagar? — Instrucciones de cobro</span>
      </div>
      <div className="leading-relaxed whitespace-pre-wrap font-medium">
        {elements}
      </div>
    </div>
  );
}
