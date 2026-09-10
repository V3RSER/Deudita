'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Profile } from '@/lib/types';
import { formatCurrency } from '@/lib/balance-utils';
import { ArrowRightLeft, ChevronDown, ChevronUp, Users } from 'lucide-react';
import { UserAvatar } from '@/components/UserAvatar';

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
    for (let i = 0; i < idOrName.length; i += 1) {
        hash = idOrName.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % AVATAR_COLOR_PALETTES.length;
    return AVATAR_COLOR_PALETTES[index];
}

export function getInitials(name?: string | null, email?: string | null): string {
    if (name && name.trim().length > 0) {
        const parts = name.trim().split(/\s+/);
        if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
        return parts[0].slice(0, 2).toUpperCase();
    }
    if (email && email.trim().length > 0) return email.trim().slice(0, 2).toUpperCase();
    return 'U';
}

export function formatSimpleFraction(val: number): string {
    if (!Number.isFinite(val) || val <= 0) return '0';

    const roundedInt = Math.round(val);
    if (Math.abs(val - roundedInt) < 0.001) return String(roundedInt);

    if (val > 0 && val < 1) {
        const singleCharFractions = [
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

        for (const fraction of singleCharFractions) {
            if (Math.abs(val - fraction.val) < 0.008) return fraction.char;
        }
    }

    return (Math.round(val * 100) / 100).toString().replace(/\.?0+$/, '');
}

function useExpandedUsers(participants: ParticipantSummaryData[], defaultExpanded: boolean) {
    const initialState = useMemo(() => {
        const next: Record<string, boolean> = {};
        participants.forEach((participant) => {
            next[participant.userId] = defaultExpanded && Boolean(participant.breakdown?.length);
        });
        return next;
    }, [participants, defaultExpanded]);

    const [expandedUsers, setExpandedUsers] = useState<Record<string, boolean>>(initialState);

    useEffect(() => {
        setExpandedUsers((previous) => {
            const next: Record<string, boolean> = {};
            let changed = Object.keys(previous).length !== participants.length;

            participants.forEach((participant) => {
                const hasExisting = Object.prototype.hasOwnProperty.call(previous, participant.userId);
                const nextValue = hasExisting
                    ? previous[participant.userId]
                    : defaultExpanded && Boolean(participant.breakdown?.length);
                next[participant.userId] = nextValue;
                if (!hasExisting || previous[participant.userId] !== nextValue) changed = true;
            });

            return changed ? next : previous;
        });
    }, [participants, defaultExpanded]);

    return [expandedUsers, setExpandedUsers] as const;
}

function BreakdownList({ breakdown, currency }: { breakdown: ParticipantItemBreakdown[]; currency: string }) {
    const occurrenceMap = new Map<string, number>();

    return (
        <div className="mt-2.5 pt-2 border-t border-dashed border-zinc-200 space-y-1.5 pl-9">
            {breakdown.map((item) => {
                const baseKey = `${item.desc}|${item.qty}|${item.cost}`;
                const occurrence = occurrenceMap.get(baseKey) ?? 0;
                occurrenceMap.set(baseKey, occurrence + 1);
                const cleanQty = formatSimpleFraction(item.qty);

                return (
                    <div
                        key={`${baseKey}|${occurrence}`}
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
    );
}

function ParticipantRow({
    participant,
    currency,
    isExpanded,
    currentUserId,
    onToggle,
}: {
    participant: ParticipantSummaryData;
    currency: string;
    isExpanded: boolean;
    currentUserId?: string;
    onToggle: () => void;
}) {
    const profile = participant.profile;
    const hasBreakdown = Boolean(participant.breakdown?.length);
    const isCurrentUser = participant.userId === currentUserId;
    const displayName = profile?.full_name?.split(' ')[0] || (profile?.email || 'Usuario').split('@')[0];

    const content = (
        <>
            <div className="flex items-center space-x-2.5 min-w-0 flex-1 text-left">
                <UserAvatar profile={profile} name={profile?.full_name} size="sm" />
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`text-xs font-bold truncate ${isCurrentUser ? 'text-emerald-700' : 'text-zinc-900'}`}>
                            {displayName}
                        </span>
                        {isCurrentUser && (
                            <span className="text-[9px] font-bold uppercase tracking-wide text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-md shrink-0">
                                Tú
                            </span>
                        )}
                        {participant.shares !== undefined && participant.shares !== null && String(participant.shares).trim() !== '' && (
                            <span className="text-[10px] font-semibold text-zinc-600 bg-zinc-100 border border-zinc-200/70 px-1.5 py-0.2 rounded shrink-0">
                                {participant.shares} {String(participant.shares) === '1' ? 'cuota' : 'cuotas'}
                            </span>
                        )}
                    </div>
                    {hasBreakdown && (
                        <span className="text-[10px] text-zinc-400 font-medium block">
                            {participant.breakdown!.length} {participant.breakdown!.length === 1 ? 'artículo' : 'artículos'}
                        </span>
                    )}
                </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs sm:text-sm font-bold text-zinc-900">
                    {formatCurrency(participant.amount, currency)}
                </span>
                {hasBreakdown && (
                    <span className="w-5 h-5 rounded-md bg-zinc-100 text-zinc-500 flex items-center justify-center transition-colors">
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </span>
                )}
            </div>
        </>
    );

    return (
        <div className="px-3 py-2 sm:px-3.5 sm:py-2 transition-colors hover:bg-zinc-50/40">
            {hasBreakdown ? (
                <button
                    type="button"
                    onClick={onToggle}
                    aria-expanded={isExpanded}
                    aria-label={`${isExpanded ? 'Colapsar' : 'Expandir'} artículos de ${displayName}`}
                    className="w-full flex items-center justify-between gap-2 rounded-lg text-left cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30"
                >
                    {content}
                </button>
            ) : (
                <div className="w-full flex items-center justify-between gap-2">{content}</div>
            )}

            {hasBreakdown && isExpanded && <BreakdownList breakdown={participant.breakdown!} currency={currency} />}
        </div>
    );
}

export function ExpenseParticipantSummary({
    participants,
    currency,
    currentUserId,
    title = 'Resumen por participante',
    splitTypeLabel,
    defaultExpanded = false,
}: ExpenseParticipantSummaryProps) {
    const [expandedUsers, setExpandedUsers] = useExpandedUsers(participants, defaultExpanded);

    if (!participants || participants.length === 0) return null;

    const toggleUser = (userId: string) => {
        setExpandedUsers((previous) => ({ ...previous, [userId]: !previous[userId] }));
    };

    return (
        <div className="bg-white rounded-xl sm:rounded-2xl border border-zinc-200/90 shadow-2xs overflow-hidden">
            {title && (
                <div className="px-3 py-2 bg-zinc-50/70 border-b border-zinc-200/70 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                        <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">{title}</span>
                    </div>
                    {splitTypeLabel && (
                        <span className="text-[10px] font-semibold text-zinc-600 bg-zinc-200/70 px-2 py-0.5 rounded-md">
                            {splitTypeLabel}
                        </span>
                    )}
                </div>
            )}

            <div className="divide-y divide-zinc-100">
                {participants.map((participant) => (
                    <ParticipantRow
                        key={participant.userId}
                        participant={participant}
                        currency={currency}
                        currentUserId={currentUserId}
                        isExpanded={expandedUsers[participant.userId] ?? false}
                        onToggle={() => toggleUser(participant.userId)}
                    />
                ))}
            </div>
        </div>
    );
}

interface ExpenseMoneyFlowProps {
    totalAmount: number;
    currency: string;
    payerProfile?: Profile | null;
    participants: ParticipantSummaryData[];
    defaultExpanded?: boolean;
}

export function ExpenseMoneyFlow({
    totalAmount,
    currency,
    payerProfile,
    participants,
    defaultExpanded = false,
}: ExpenseMoneyFlowProps) {
    const [expandedUsers, setExpandedUsers] = useExpandedUsers(participants, defaultExpanded);

    const hasAnyBreakdown = participants.some((participant) => participant.breakdown?.length);
    const allBreakdownsExpanded = hasAnyBreakdown && participants.every(
        (participant) => !participant.breakdown?.length || Boolean(expandedUsers[participant.userId])
    );

    const toggleUser = (userId: string) => {
        setExpandedUsers((previous) => ({ ...previous, [userId]: !previous[userId] }));
    };

    const toggleAllBreakdowns = () => {
        const nextState = !allBreakdownsExpanded;
        setExpandedUsers((previous) => {
            const next = { ...previous };
            participants.forEach((participant) => {
                if (participant.breakdown?.length) next[participant.userId] = nextState;
            });
            return next;
        });
    };

    return (
        <div className="bg-white rounded-xl sm:rounded-2xl border border-zinc-200/90 shadow-2xs overflow-hidden">
            <div className="px-3 py-2 bg-zinc-50/70 border-b border-zinc-200/70 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                    <ArrowRightLeft className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                    <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">Flujo del dinero</span>
                </div>
            </div>

            <div className="p-3 border-b border-zinc-100 bg-zinc-50/40 flex items-center justify-between gap-2">
                <div className="flex items-center space-x-2.5 min-w-0 flex-1">
                    <UserAvatar profile={payerProfile} name={payerProfile?.full_name} size="sm" />
                    <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold text-zinc-900 truncate">
                            {payerProfile?.full_name || (payerProfile?.email || 'Usuario').split('@')[0]}
                        </div>
                        <span className="text-[10px] text-zinc-500 font-medium block">Pagó el total del gasto</span>
                    </div>
                </div>
                <div className="text-right shrink-0">
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Total pagado</span>
                    <span className="text-xs sm:text-sm font-bold text-zinc-900">{formatCurrency(totalAmount, currency)}</span>
                </div>
            </div>

            <div className="p-2 sm:p-2.5 space-y-1">
                <div className="px-2 pt-1 pb-1 flex items-center justify-between gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                        Distribución de participantes ({participants.length})
                    </span>
                    {hasAnyBreakdown && (
                        <button
                            type="button"
                            onClick={toggleAllBreakdowns}
                            aria-label={allBreakdownsExpanded ? 'Colapsar todos los artículos' : 'Desplegar todos los artículos'}
                            className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100/80 px-2 py-0.5 rounded-md transition cursor-pointer flex items-center gap-1 border border-emerald-200/60 shadow-2xs"
                        >
                            {allBreakdownsExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            <span>{allBreakdownsExpanded ? 'Colapsar artículos' : 'Desplegar artículos'}</span>
                        </button>
                    )}
                </div>

                <div className="divide-y divide-zinc-100 rounded-xl border border-zinc-200/70 overflow-hidden bg-white">
                    {participants.map((participant) => (
                        <ParticipantRow
                            key={participant.userId}
                            participant={participant}
                            currency={currency}
                            isExpanded={expandedUsers[participant.userId] ?? false}
                            onToggle={() => toggleUser(participant.userId)}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}
