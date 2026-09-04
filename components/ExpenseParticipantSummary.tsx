'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { Profile } from '@/lib/types';
import { formatCurrency } from '@/lib/balance-utils';
import { ChevronDown, ChevronUp, Users, ArrowRightLeft } from 'lucide-react';

export interface ParticipantItemBreakdown {
  desc: string;
  qty: number;
  cost: number;
}

export interface ParticipantSummaryData {
  userId: string;
  profile?: Profile | null;
  amount: number;
  breakdown?: ParticipantItemBreakdown[];
  shares?: string | number;
}

interface ExpenseParticipantSummaryProps {
  participants: ParticipantSummaryData[];
  currency: string;
  currentUserId?: string;
  title?: string;
  splitTypeLabel?: string;
  defaultExpanded?: boolean;
}

const AVATAR_COLOR_PALETTES = [
  'bg-emerald-100 text-emerald-800 border-emerald-200/80',
  'bg-sky-100 text-sky-800 border-sky-200/80',
  'bg-indigo-100 text-indigo-800 border-indigo-200/80',
  'bg-violet-100 text-violet-800 border-violet-200/80',
  'bg-amber-100 text-amber-900 border-amber-200/80',
  'bg-rose-100 text-rose-800 border-rose-200/80',
  'bg-teal-100 text-teal-800 border-teal-200/80',
  'bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200/80',
];

export function getParticipantAvatarColor(idOrName: string) {
  let hash = 0;
  for (let i = 0; i < idOrName.length; i++) {
    hash = idOrName.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % AVATAR_COLOR_PALETTES.length;
  return AVATAR_COLOR_PALETTES[index];
}

export function getInitials(name?: string | null, email?: string | null): string {
  if (name && name.trim().length > 0) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return parts[0].slice(0, 2).toUpperCase();
  }
  if (email && email.trim().length > 0) {
    return email.trim().slice(0, 2).toUpperCase();
  }
  return 'U';
}

export function formatSimpleFraction(val: number): string {
  if (isNaN(val) || val <= 0) return '0';

  const roundedInt = Math.round(val);
  if (Math.abs(val - roundedInt) < 0.001) {
    return String(roundedInt);
  }

  // Only single-character vulgar fractions for values strictly between 0 and 1
  if (val > 0 && val < 1) {
    const singleCharFractions: { val: number; char: string }[] = [
      { val: 1 / 2, char: '½' },
      { val: 1 / 3, char: '⅓' },
      { val: 2 / 3, char: '⅔' },
      { val: 1 / 4, char: '¼' },
      { val: 3 / 4, char: '¾' },
      { val: 1 / 5, char: '⅕' },
      { val: 2 / 5, char: '⅖' },
      { val: 3 / 5, char: '⅗' },
      { val: 4 / 5, char: '⅘' },
      { val: 1 / 6, char: '⅙' },
      { val: 5 / 6, char: '⅚' },
      { val: 1 / 8, char: '⅛' },
      { val: 3 / 8, char: '⅜' },
      { val: 5 / 8, char: '⅝' },
      { val: 7 / 8, char: '⅞' },
    ];

    for (const f of singleCharFractions) {
      if (Math.abs(val - f.val) < 0.015) {
        return f.char;
      }
    }
  }

  // If > 1 or obscure fraction, output as clean decimal (max 2 decimals)
  const rounded = Math.round(val * 100) / 100;
  return rounded.toString().replace(/\.?0+$/, '');
}

export function ExpenseParticipantSummary({
  participants,
  currency,
  title = 'Resumen por participante',
  splitTypeLabel,
  defaultExpanded = false,
}: ExpenseParticipantSummaryProps) {
  const [expandedUsers, setExpandedUsers] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    participants.forEach((p) => {
      initial[p.userId] = defaultExpanded;
    });
    return initial;
  });

  const toggleUser = (userId: string) => {
    setExpandedUsers((prev) => ({
      ...prev,
      [userId]: !prev[userId],
    }));
  };

  if (!participants || participants.length === 0) {
    return null;
  }

  return (
    <div className="bg-white rounded-xl sm:rounded-2xl border border-zinc-200/90 shadow-2xs overflow-hidden">
      {title && (
        <div className="px-3 py-2 bg-zinc-50/70 border-b border-zinc-200/70 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
              {title}
            </span>
          </div>
          {splitTypeLabel && (
            <span className="text-[10px] font-semibold text-zinc-600 bg-zinc-200/70 px-2 py-0.5 rounded-md">
              {splitTypeLabel}
            </span>
          )}
        </div>
      )}

      <div className="divide-y divide-zinc-100">
        {participants.map((p) => {
          const profile = p.profile;
          const hasBreakdown = Boolean(p.breakdown && p.breakdown.length > 0);
          const isExpanded = expandedUsers[p.userId] ?? false;
          const avatarColorStyle = getParticipantAvatarColor(profile?.id || p.userId || profile?.full_name || 'user');
          const initials = getInitials(profile?.full_name, profile?.email);

          return (
            <div key={p.userId} className="px-3 py-2 sm:px-3.5 sm:py-2 transition-colors hover:bg-zinc-50/40">
              <div
                className={`flex items-center justify-between gap-2 ${
                  hasBreakdown ? 'cursor-pointer select-none' : ''
                }`}
                onClick={() => hasBreakdown && toggleUser(p.userId)}
              >
                {/* Avatar and Name */}
                <div className="flex items-center space-x-2.5 min-w-0 flex-1">
                  <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full overflow-hidden shrink-0 flex items-center justify-center border shadow-2xs ${avatarColorStyle}`}>
                    {profile?.avatar_url ? (
                      <Image
                        src={profile.avatar_url}
                        alt={profile.full_name || 'Avatar'}
                        width={32}
                        height={32}
                        className="w-full h-full object-cover"
                        unoptimized
                      />
                    ) : (
                      <span className="text-[10px] sm:text-[11px] font-extrabold tracking-tight">
                        {initials}
                      </span>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-bold text-zinc-900 truncate">
                        {profile?.full_name?.split(' ')[0] || (profile?.email || 'Usuario').split('@')[0]}
                      </span>
                      {p.shares !== undefined && p.shares !== null && String(p.shares).trim() !== '' && (
                        <span className="text-[10px] font-semibold text-zinc-600 bg-zinc-100 border border-zinc-200/70 px-1.5 py-0.2 rounded shrink-0">
                          {p.shares} {String(p.shares) === '1' ? 'cuota' : 'cuotas'}
                        </span>
                      )}
                    </div>
                    {hasBreakdown && (
                      <span className="text-[10px] text-zinc-400 font-medium block">
                        {p.breakdown!.length} {p.breakdown!.length === 1 ? 'artículo' : 'artículos'}
                      </span>
                    )}
                  </div>
                </div>

                {/* Amount and Chevron */}
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs sm:text-sm font-bold text-zinc-900">
                    {formatCurrency(p.amount, currency)}
                  </span>
                  {hasBreakdown && (
                    <button
                      type="button"
                      aria-label="Expandir artículos"
                      className="w-5 h-5 rounded-md bg-zinc-100 hover:bg-zinc-200 flex items-center justify-center text-zinc-500 transition-colors cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleUser(p.userId);
                      }}
                    >
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                  )}
                </div>
              </div>

              {/* Items Breakdown */}
              {hasBreakdown && isExpanded && (
                <div className="mt-2.5 pt-2 border-t border-dashed border-zinc-200 space-y-1.5 pl-9">
                  {p.breakdown!.map((item, idx) => {
                    const cleanQty = formatSimpleFraction(item.qty);
                    return (
                      <div
                        key={idx}
                        className="flex items-center justify-between text-xs py-0.5 text-zinc-600 hover:text-zinc-900"
                      >
                        <div className="flex items-center space-x-1.5 min-w-0 pr-2">
                          <span className="font-semibold text-zinc-800 shrink-0">{cleanQty} ·</span>
                          <span className="truncate">{item.desc}</span>
                        </div>
                        <span className="font-semibold text-zinc-800 shrink-0 text-[11px]">
                          {formatCurrency(item.cost, currency)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface ExpenseMoneyFlowProps {
  totalAmount: number;
  currency: string;
  payerProfile?: Profile | null;
  participants: ParticipantSummaryData[];
}

export function ExpenseMoneyFlow({
  totalAmount,
  currency,
  payerProfile,
  participants,
}: ExpenseMoneyFlowProps) {
  const [expandedUsers, setExpandedUsers] = useState<Record<string, boolean>>({});

  const toggleUser = (userId: string) => {
    setExpandedUsers((prev) => ({
      ...prev,
      [userId]: !prev[userId],
    }));
  };

  const payerAvatarColor = getParticipantAvatarColor(payerProfile?.id || payerProfile?.full_name || 'payer');
  const payerInitials = getInitials(payerProfile?.full_name, payerProfile?.email);

  return (
    <div className="bg-white rounded-xl sm:rounded-2xl border border-zinc-200/90 shadow-2xs overflow-hidden">
      {/* Header: Flujo del dinero (no split type badge) */}
      <div className="px-3 py-2 bg-zinc-50/70 border-b border-zinc-200/70 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <ArrowRightLeft className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
          <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
            Flujo del dinero
          </span>
        </div>
      </div>

      {/* Payer Row (Total pagado) */}
      <div className="p-3 border-b border-zinc-100 bg-zinc-50/40 flex items-center justify-between gap-2">
        <div className="flex items-center space-x-2.5 min-w-0 flex-1">
          <div className={`w-8 h-8 rounded-full overflow-hidden shrink-0 flex items-center justify-center border shadow-2xs ${payerAvatarColor}`}>
            {payerProfile?.avatar_url ? (
              <Image
                src={payerProfile.avatar_url}
                alt={payerProfile.full_name || 'Pagador'}
                width={32}
                height={32}
                className="w-full h-full object-cover"
                unoptimized
              />
            ) : (
              <span className="text-[11px] font-extrabold tracking-tight">
                {payerInitials}
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-bold text-zinc-900 truncate">
              {payerProfile?.full_name || (payerProfile?.email || 'Usuario').split('@')[0]}
            </div>
            <span className="text-[10px] text-zinc-500 font-medium block">
              Pagó el total del gasto
            </span>
          </div>
        </div>

        {/* Total pagado number - styled with identical visual style and color */}
        <div className="text-right shrink-0">
          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">
            Total pagado
          </span>
          <span className="text-xs sm:text-sm font-bold text-zinc-900">
            {formatCurrency(totalAmount, currency)}
          </span>
        </div>
      </div>

      {/* Participants Distribution */}
      <div className="p-2 sm:p-2.5 space-y-1">
        <div className="px-2 pt-1 pb-1 flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
            Distribución de participantes ({participants.length})
          </span>
        </div>

        <div className="divide-y divide-zinc-100 rounded-xl border border-zinc-200/70 overflow-hidden bg-white">
          {participants.map((p) => {
            const profile = p.profile;
            const hasBreakdown = Boolean(p.breakdown && p.breakdown.length > 0);
            const isExpanded = expandedUsers[p.userId] ?? false;
            const avatarColorStyle = getParticipantAvatarColor(profile?.id || p.userId || profile?.full_name || 'user');
            const initials = getInitials(profile?.full_name, profile?.email);

            return (
              <div key={p.userId} className="px-3 py-2 sm:px-3.5 sm:py-2 transition-colors hover:bg-zinc-50/50">
                <div
                  className={`flex items-center justify-between gap-2 ${
                    hasBreakdown ? 'cursor-pointer select-none' : ''
                  }`}
                  onClick={() => hasBreakdown && toggleUser(p.userId)}
                >
                  {/* Avatar and Name */}
                  <div className="flex items-center space-x-2.5 min-w-0 flex-1">
                    <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full overflow-hidden shrink-0 flex items-center justify-center border shadow-2xs ${avatarColorStyle}`}>
                      {profile?.avatar_url ? (
                        <Image
                          src={profile.avatar_url}
                          alt={profile.full_name || 'Avatar'}
                          width={32}
                          height={32}
                          className="w-full h-full object-cover"
                          unoptimized
                        />
                      ) : (
                        <span className="text-[10px] sm:text-[11px] font-extrabold tracking-tight">
                          {initials}
                        </span>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-bold text-zinc-900 truncate">
                          {profile?.full_name?.split(' ')[0] || (profile?.email || 'Usuario').split('@')[0]}
                        </span>
                        {p.shares !== undefined && p.shares !== null && String(p.shares).trim() !== '' && (
                          <span className="text-[10px] font-semibold text-zinc-600 bg-zinc-100 border border-zinc-200/70 px-1.5 py-0.2 rounded shrink-0">
                            {p.shares} {String(p.shares) === '1' ? 'cuota' : 'cuotas'}
                          </span>
                        )}
                      </div>
                      {hasBreakdown && (
                        <span className="text-[10px] text-zinc-400 font-medium block">
                          {p.breakdown!.length} {p.breakdown!.length === 1 ? 'artículo' : 'artículos'}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Amount and Expand Button - matching styling and color */}
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs sm:text-sm font-bold text-zinc-900">
                      {formatCurrency(p.amount, currency)}
                    </span>
                    {hasBreakdown && (
                      <button
                        type="button"
                        aria-label="Expandir artículos"
                        className="w-5 h-5 rounded-md bg-zinc-100 hover:bg-zinc-200 flex items-center justify-center text-zinc-500 transition-colors cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleUser(p.userId);
                        }}
                      >
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>
                    )}
                  </div>
                </div>

                {/* Items Breakdown */}
                {hasBreakdown && isExpanded && (
                  <div className="mt-2.5 pt-2 border-t border-dashed border-zinc-200 space-y-1.5 pl-9">
                    {p.breakdown!.map((item, idx) => {
                      const cleanQty = formatSimpleFraction(item.qty);
                      return (
                        <div
                          key={idx}
                          className="flex items-center justify-between text-xs py-0.5 text-zinc-600 hover:text-zinc-900"
                        >
                          <div className="flex items-center space-x-1.5 min-w-0 pr-2">
                            <span className="font-semibold text-zinc-800 shrink-0">{cleanQty} ·</span>
                            <span className="truncate">{item.desc}</span>
                          </div>
                          <span className="font-semibold text-zinc-800 shrink-0 text-xs">
                            {formatCurrency(item.cost, currency)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
