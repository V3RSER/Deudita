'use client';

import React, { useMemo, useState } from 'react';
import Image from 'next/image';
import { Expense, Group, PairwiseBalance, Payment, Profile } from '@/lib/types';
import { calculatePairwiseDebtDetail, formatCurrency } from '@/lib/balance-utils';
import { GenericExpenseList } from '@/components/my-expenses/GenericExpenseList';
import {
    Check,
    ChevronDown,
    Copy,
    Wallet,
    X,
} from 'lucide-react';

interface PairwiseDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    pairwise: PairwiseBalance | null;
    currentProfile: Profile | null;
    expenses: Expense[];
    payments: Payment[];
    profiles: Profile[];
    groups: Group[];
    isSimplified: boolean;
    groupId?: string;
    onOpenSettleModal: (groupId?: string, debtorId?: string, creditorId?: string, amount?: number) => void;
    onEditPayment?: (payment: Payment) => void;
    onEditExpense?: (expense: Expense) => void;
    onDeleteExpense?: (expenseId: string) => void;
    onDeletePayment?: (paymentId: string) => void;
}

function getInitials(name?: string | null): string {
    if (!name) return 'U';
    const trimmed = name.trim();
    if (!trimmed) return 'U';
    const parts = trimmed.split(/\s+/);
    if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return trimmed.slice(0, 2).toUpperCase();
}

export function PairwiseDetailModal({
    isOpen,
    onClose,
    pairwise,
    currentProfile,
    expenses,
    payments,
    profiles,
    groups,
    isSimplified,
    groupId,
    onOpenSettleModal,
    onEditPayment,
    onEditExpense,
    onDeleteExpense,
    onDeletePayment,
}: PairwiseDetailModalProps) {
    const [expandedTerms, setExpandedTerms] = useState<{ [key: string]: boolean }>({
        debts: false,
        recovers: false,
        compensations: false,
    });

    const [expandedRelations, setExpandedRelations] = useState<{ [key: string]: boolean }>({});
    const [copiedAmount, setCopiedAmount] = useState(false);

    // Reset when pairwise changes
    const currentPairwiseKey = isOpen && pairwise ? `${pairwise.debtor.id}-${pairwise.creditor.id}` : '';
    const [prevPairwiseKey, setPrevPairwiseKey] = useState(currentPairwiseKey);
    if (currentPairwiseKey !== prevPairwiseKey) {
        setPrevPairwiseKey(currentPairwiseKey);
        setExpandedTerms({
            debts: false,
            recovers: false,
            compensations: false,
        });
        setExpandedRelations({});
        setCopiedAmount(false);
    }

    const toggleTerm = (term: 'debts' | 'recovers' | 'compensations') => {
        setExpandedTerms((prev) => ({ ...prev, [term]: !prev[term] }));
    };

    const toggleRelation = (relKey: string) => {
        setExpandedRelations((prev) => ({ ...prev, [relKey]: !prev[relKey] }));
    };

    // Find creditor and debtor profiles
    const debtorProfile: Profile = useMemo(() => {
        if (!pairwise) {
            if (currentProfile) return currentProfile;
            return {
                id: '',
                full_name: 'Deudor',
                email: '',
                avatar_url: '',
                currency: '',
                created_at: new Date().toISOString(),
            };
        }
        return (
            profiles.find((p) => p.id === pairwise.debtor.id) || {
                id: pairwise.debtor.id,
                full_name: pairwise.debtor.full_name || 'Deudor',
                email: pairwise.debtor.email || '',
                avatar_url: pairwise.debtor.avatar_url || '',
                currency: currentProfile?.currency || '',
                created_at: new Date().toISOString(),
            }
        );
    }, [pairwise, profiles, currentProfile]);

    const creditorProfile: Profile = useMemo(() => {
        if (!pairwise) {
            return {
                id: '',
                full_name: 'Acreedor',
                email: '',
                avatar_url: '',
                currency: currentProfile?.currency || '',
                created_at: new Date().toISOString(),
            };
        }
        return (
            profiles.find((p) => p.id === pairwise.creditor.id) || {
                id: pairwise.creditor.id,
                full_name: pairwise.creditor.full_name || 'Acreedor',
                email: pairwise.creditor.email || '',
                avatar_url: pairwise.creditor.avatar_url || '',
                currency: currentProfile?.currency || '',
                created_at: new Date().toISOString(),
            }
        );
    }, [pairwise, profiles, currentProfile]);

    // Calculate pairwise debt detail specifically between debtor and creditor
    const detail = useMemo(() => {
        if (!pairwise || !debtorProfile || !creditorProfile) return null;
        return calculatePairwiseDebtDetail(
            debtorProfile,
            creditorProfile,
            expenses,
            payments,
            profiles,
            groups,
            isSimplified,
            groupId || pairwise.group_id
        );
    }, [debtorProfile, creditorProfile, expenses, payments, profiles, groups, isSimplified, groupId, pairwise]);

    if (!isOpen || !pairwise || !detail) return null;

    const currency = groupId
        ? groups.find((g) => g.id === groupId)?.currency || pairwise.currency || currentProfile?.currency || ''
        : pairwise.group_id
            ? groups.find((g) => g.id === pairwise.group_id)?.currency || pairwise.currency || currentProfile?.currency || ''
            : pairwise.currency || currentProfile?.currency || '';

    const isDebtor =
        pairwise.debtor.id === currentProfile?.id ||
        (!isSimplified && pairwise.debtorSponsor?.id === currentProfile?.id);

    const isCreditor =
        pairwise.creditor.id === currentProfile?.id ||
        (!isSimplified && pairwise.creditorSponsor?.id === currentProfile?.id);

    const debtorName = debtorProfile.full_name || 'Deudor';
    const creditorName = creditorProfile.full_name || 'Acreedor';

    const pendingConsumedExpenses = Array.from(
        new Map(detail.pendingExpenses.map((d) => [d.expense.id, d.expense])).values()
    );
    const activeReverseExpenses = Array.from(
        new Map(detail.reverseOffsetExpenses.map((r) => [r.expense.id, r.expense])).values()
    );
    const activeDirectPayments = Array.from(
        new Map(detail.appliedPayments.map((p) => [p.payment.id, p.payment])).values()
    );

    const totalDirectConsumption = detail.pendingExpenses.reduce((sum, d) => sum + d.originalAmount, 0);
    const totalReverseOffsets = detail.reverseOffsetExpenses.reduce((sum, r) => sum + r.amount, 0);
    const totalPaymentsApplied = detail.appliedPayments.reduce((sum, p) => sum + p.amountApplied, 0);
    const totalActiveRecoverable = Math.round((totalReverseOffsets + totalPaymentsApplied) * 100) / 100;

    const hasCompensations = isSimplified && (detail.optimizationDetail?.totalCompensated || 0) > 0.009;
    const totalCompensated = detail.optimizationDetail?.totalCompensated || 0;

    const finalSettlementAmount =
        typeof detail.finalSettlementAmount === 'number'
            ? detail.finalSettlementAmount
            : isSimplified && detail.optimizationDetail
                ? detail.optimizationDetail.simplifiedAmount
                : detail.netDirectBalance;

    const isCompletelyEmpty =
        pendingConsumedExpenses.length === 0 &&
        totalActiveRecoverable === 0 &&
        !hasCompensations;

    // Cross-debt relations list for group consolidation
    const relevantRelations = detail.optimizationDetail?.relevantRelations || [];
    const suggestedPayments = detail.optimizationDetail?.newSuggestedPayments || [];

    return (
        <div
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto animate-in fade-in duration-150"
            onClick={onClose}
        >
            <div
                className="relative w-full sm:max-w-xl max-h-[92vh] sm:max-h-[88vh] bg-white rounded-t-3xl sm:rounded-2xl shadow-xl border border-zinc-200 flex flex-col overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* 1. HEADER */}
                <div className="bg-white px-4 py-3 sm:px-5 sm:py-3.5 border-b border-zinc-200 shrink-0">
                    {/* Mobile drag handle */}
                    <div className="w-10 h-1 bg-zinc-200 rounded-full mx-auto mb-2 sm:hidden" />

                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            {/* Double Avatars */}
                            <div className="flex items-center -space-x-2 shrink-0">
                                {debtorProfile.avatar_url ? (
                                    <Image
                                        src={debtorProfile.avatar_url}
                                        alt={debtorName}
                                        width={32}
                                        height={32}
                                        className="w-8 h-8 rounded-full object-cover ring-2 ring-white shrink-0"
                                        unoptimized
                                        referrerPolicy="no-referrer"
                                    />
                                ) : (
                                    <div className="w-8 h-8 rounded-full bg-zinc-800 text-white flex items-center justify-center text-xs font-bold ring-2 ring-white shrink-0">
                                        {getInitials(debtorName)}
                                    </div>
                                )}

                                {creditorProfile.avatar_url ? (
                                    <Image
                                        src={creditorProfile.avatar_url}
                                        alt={creditorName}
                                        width={32}
                                        height={32}
                                        className="w-8 h-8 rounded-full object-cover ring-2 ring-white shrink-0"
                                        unoptimized
                                        referrerPolicy="no-referrer"
                                    />
                                ) : (
                                    <div className="w-8 h-8 rounded-full bg-emerald-700 text-white flex items-center justify-center text-xs font-bold ring-2 ring-white shrink-0">
                                        {getInitials(creditorName)}
                                    </div>
                                )}
                            </div>

                            {/* Title & Type */}
                            <div className="min-w-0 flex-1">
                                <h2 className="text-sm sm:text-base font-bold text-zinc-900 truncate leading-snug">
                                    {isCreditor ? (
                                        <span>{debtorName} te debe</span>
                                    ) : isDebtor ? (
                                        <span>Le debes a {creditorName}</span>
                                    ) : (
                                        <span>{debtorName} le debe a {creditorName}</span>
                                    )}
                                </h2>
                                <p className="text-xs text-zinc-500 truncate">
                                    {isSimplified ? 'Balance simplificado' : 'Balance directo'}
                                </p>
                            </div>
                        </div>

                        {/* Close button */}
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label="Cerrar"
                            className="w-8 h-8 rounded-full bg-zinc-100 hover:bg-zinc-200 active:bg-zinc-300 text-zinc-600 flex items-center justify-center transition-colors cursor-pointer shrink-0"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* 2. CUERPO: SECCIONES EQUILIBRADAS DE ANCHO COMPLETO */}
                <div className="flex-1 overflow-y-auto divide-y divide-zinc-100">
                    {isCompletelyEmpty ? (
                        <div className="p-8 text-center bg-white space-y-2">
                            <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
                                <Check className="w-5 h-5" />
                            </div>
                            <p className="text-sm font-bold text-zinc-900">Cuentas al día</p>
                            <p className="text-xs text-zinc-500">No hay movimientos ni saldos pendientes entre ambos integrantes.</p>
                        </div>
                    ) : (
                        <>
                            {/* FILA 1: CONSUMOS DIRECTOS (+) */}
                            {totalDirectConsumption > 0 && (
                                <div>
                                    <button
                                        type="button"
                                        aria-expanded={expandedTerms.debts}
                                        onClick={() => toggleTerm('debts')}
                                        className="w-full px-4 sm:px-5 py-3 sm:py-3.5 flex items-center justify-between gap-3 hover:bg-zinc-50 active:bg-zinc-100/70 transition-colors cursor-pointer text-left select-none"
                                    >
                                        <div className="flex items-center gap-3 min-w-0">
                                            {/* Cajita con "+" */}
                                            <div
                                                className={`w-6.5 h-6.5 sm:w-7 sm:h-7 rounded-lg border font-bold text-xs flex items-center justify-center shrink-0 ${
                                                    isCreditor
                                                        ? 'bg-emerald-50 text-emerald-600 border-emerald-200/90'
                                                        : 'bg-rose-50 text-rose-600 border-rose-200/90'
                                                }`}
                                            >
                                                +
                                            </div>
                                            {/* Nombre limpio sin subtítulo */}
                                            <span className="text-xs sm:text-sm font-bold text-zinc-900 truncate">
                                                {isCreditor
                                                    ? `Consumos de ${debtorName} pagados por ti`
                                                    : isDebtor
                                                    ? `Tus consumos pagados por ${creditorName}`
                                                    : `Consumos de ${debtorName} pagados por ${creditorName}`}
                                            </span>
                                        </div>

                                        <div className="flex items-center gap-2 shrink-0">
                                            {/* Monto con tipografía estándar bien proporcionada */}
                                            <span
                                                className={`text-xs sm:text-sm font-bold ${
                                                    isCreditor ? 'text-emerald-600' : 'text-rose-600'
                                                }`}
                                            >
                                                {formatCurrency(totalDirectConsumption, currency)}
                                            </span>
                                            {/* Chevrón que rota 180° */}
                                            <ChevronDown
                                                className={`w-4 h-4 text-zinc-400 transition-transform duration-200 shrink-0 ${
                                                    expandedTerms.debts ? 'rotate-180 text-zinc-600' : ''
                                                }`}
                                            />
                                        </div>
                                    </button>

                                    {/* Componente genérico reutilizado para el desglose de gastos */}
                                    {expandedTerms.debts && (
                                        <div className="px-3 sm:px-4 py-2.5 bg-zinc-50/60 border-t border-zinc-100">
                                            <GenericExpenseList
                                                expenses={pendingConsumedExpenses}
                                                payments={[]}
                                                profiles={profiles}
                                                userGroups={groups}
                                                currentProfile={debtorProfile}
                                                groupCurrency={currency}
                                                onEditExpense={onEditExpense}
                                                onDeleteExpense={onDeleteExpense}
                                                showGroupBadge={!groupId}
                                            />
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* FILA 2: APORTES Y PAGOS PREVIOS (-) */}
                            {totalActiveRecoverable > 0 && (
                                <div>
                                    <button
                                        type="button"
                                        aria-expanded={expandedTerms.recovers}
                                        onClick={() => toggleTerm('recovers')}
                                        className="w-full px-4 sm:px-5 py-3 sm:py-3.5 flex items-center justify-between gap-3 hover:bg-zinc-50 active:bg-zinc-100/70 transition-colors cursor-pointer text-left select-none"
                                    >
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div
                                                className={`w-6.5 h-6.5 sm:w-7 sm:h-7 rounded-lg border font-bold text-xs flex items-center justify-center shrink-0 ${
                                                    isCreditor
                                                        ? 'bg-rose-50 text-rose-600 border-rose-200/90'
                                                        : 'bg-emerald-50 text-emerald-600 border-emerald-200/90'
                                                }`}
                                            >
                                                -
                                            </div>
                                            <span className="text-xs sm:text-sm font-bold text-zinc-900 truncate">
                                                {isCreditor
                                                    ? `Aportes o pagos que te realizó ${debtorName}`
                                                    : isDebtor
                                                    ? 'Aportes o pagos que le realizaste'
                                                    : `Aportes o pagos que realizó ${debtorName}`}
                                            </span>
                                        </div>

                                        <div className="flex items-center gap-2 shrink-0">
                                            <span
                                                className={`text-xs sm:text-sm font-bold ${
                                                    isCreditor ? 'text-rose-600' : 'text-emerald-600'
                                                }`}
                                            >
                                                {formatCurrency(totalActiveRecoverable, currency)}
                                            </span>
                                            <ChevronDown
                                                className={`w-4 h-4 text-zinc-400 transition-transform duration-200 shrink-0 ${
                                                    expandedTerms.recovers ? 'rotate-180 text-zinc-600' : ''
                                                }`}
                                            />
                                        </div>
                                    </button>

                                    {/* Componente genérico para pagos y aportes */}
                                    {expandedTerms.recovers && (
                                        <div className="px-3 sm:px-4 py-2.5 bg-zinc-50/60 border-t border-zinc-100">
                                            <GenericExpenseList
                                                expenses={activeReverseExpenses}
                                                payments={activeDirectPayments}
                                                profiles={profiles}
                                                userGroups={groups}
                                                currentProfile={debtorProfile}
                                                groupCurrency={currency}
                                                onEditExpense={onEditExpense}
                                                onDeleteExpense={onDeleteExpense}
                                                onEditPayment={onEditPayment}
                                                onDeletePayment={onDeletePayment}
                                                showGroupBadge={!groupId}
                                            />
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* FILA 3: CONSOLIDACIÓN DE GRUPO (+) */}
                            {hasCompensations && (
                                <div>
                                    <button
                                        type="button"
                                        aria-expanded={expandedTerms.compensations}
                                        onClick={() => toggleTerm('compensations')}
                                        className="w-full px-4 sm:px-5 py-3 sm:py-3.5 flex items-center justify-between gap-3 hover:bg-zinc-50 active:bg-zinc-100/70 transition-colors cursor-pointer text-left select-none"
                                    >
                                        <div className="flex items-center gap-3 min-w-0">
                                            {/* Cajita con "+" y montos en verde */}
                                            <div className="w-6.5 h-6.5 sm:w-7 sm:h-7 rounded-lg border font-bold text-xs flex items-center justify-center shrink-0 bg-emerald-50 text-emerald-600 border-emerald-200/90">
                                                +
                                            </div>
                                            <span className="text-xs sm:text-sm font-bold text-zinc-900 truncate">
                                                Consolidación de grupo
                                            </span>
                                        </div>

                                        <div className="flex items-center gap-2 shrink-0">
                                            <span className="text-xs sm:text-sm font-bold text-emerald-600">
                                                {formatCurrency(totalCompensated, currency)}
                                            </span>
                                            <ChevronDown
                                                className={`w-4 h-4 text-zinc-400 transition-transform duration-200 shrink-0 ${
                                                    expandedTerms.compensations ? 'rotate-180 text-zinc-600' : ''
                                                }`}
                                            />
                                        </div>
                                    </button>

                                    {/* Deudas cruzadas con el componente genérico reutilizado para sus gastos */}
                                    {expandedTerms.compensations && (
                                        <div className="px-3 sm:px-4 py-3 bg-zinc-50/60 border-t border-zinc-100 space-y-2">
                                            {relevantRelations.length > 0 ? (
                                                relevantRelations.map((rel, rIdx) => {
                                                    const isFromMe = rel.from.id === currentProfile?.id;
                                                    const isToMe = rel.to.id === currentProfile?.id;
                                                    const fromName = isFromMe ? 'Tú' : rel.from.full_name || 'Integrante';
                                                    const toName = isToMe ? 'ti' : rel.to.full_name || 'Integrante';

                                                    let relationText = '';
                                                    if (isFromMe) {
                                                        relationText = `Tú le debes a ${toName}`;
                                                    } else if (isToMe) {
                                                        relationText = `${fromName} te debe a ti`;
                                                    } else {
                                                        relationText = `${fromName} le debe a ${toName}`;
                                                    }

                                                    const isNegative = isFromMe;
                                                    const amountText = isNegative
                                                        ? `− ${formatCurrency(rel.amount, currency)}`
                                                        : formatCurrency(rel.amount, currency);

                                                    const hasExpenses = Boolean(rel.expenses && rel.expenses.length > 0);
                                                    const relKey = rel.id || `rel-${rIdx}`;
                                                    const isRelExpanded = Boolean(expandedRelations[relKey]);

                                                    return (
                                                        <div
                                                            key={relKey}
                                                            className="p-3 bg-white rounded-xl border border-zinc-200/90 shadow-2xs space-y-2"
                                                        >
                                                            <div
                                                                role={hasExpenses ? 'button' : undefined}
                                                                tabIndex={hasExpenses ? 0 : undefined}
                                                                onClick={hasExpenses ? () => toggleRelation(relKey) : undefined}
                                                                className={`flex items-center justify-between gap-3 text-xs ${
                                                                    hasExpenses ? 'cursor-pointer hover:text-zinc-950 select-none' : ''
                                                                }`}
                                                            >
                                                                <span className="font-semibold text-zinc-800 truncate">
                                                                    {relationText}
                                                                </span>
                                                                <div className="flex items-center gap-1.5 shrink-0">
                                                                    <span
                                                                        className={`font-bold ${
                                                                            isNegative ? 'text-rose-600' : 'text-zinc-900'
                                                                        }`}
                                                                    >
                                                                        {amountText}
                                                                    </span>
                                                                    {hasExpenses && (
                                                                        <ChevronDown
                                                                            className={`w-3.5 h-3.5 text-zinc-400 transition-transform ${
                                                                                isRelExpanded ? 'rotate-180 text-zinc-600' : ''
                                                                            }`}
                                                                        />
                                                                    )}
                                                                </div>
                                                            </div>

                                                            {/* Reutilización del componente genérico para los gastos asociados */}
                                                            {hasExpenses && isRelExpanded && (
                                                                <div className="pt-2 border-t border-zinc-100">
                                                                    <GenericExpenseList
                                                                        expenses={rel.expenses}
                                                                        payments={[]}
                                                                        profiles={profiles}
                                                                        userGroups={groups}
                                                                        currentProfile={debtorProfile}
                                                                        groupCurrency={currency}
                                                                        showGroupBadge={!groupId}
                                                                    />
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })
                                            ) : suggestedPayments.length > 0 ? (
                                                suggestedPayments.map((sug, sIdx) => {
                                                    const isFromMe = sug.from.id === currentProfile?.id;
                                                    const isToMe = sug.to.id === currentProfile?.id;
                                                    const fromName = isFromMe ? 'Tú' : sug.from.full_name;
                                                    const toName = isToMe ? 'ti' : sug.to.full_name;
                                                    const text = isFromMe
                                                        ? `Tú le debes a ${toName}`
                                                        : `${fromName} le debe a ${toName}`;
                                                    const amountText = isFromMe
                                                        ? `− ${formatCurrency(sug.amount, currency)}`
                                                        : formatCurrency(sug.amount, currency);

                                                    return (
                                                        <div
                                                            key={`sug-${sIdx}`}
                                                            className="p-3 bg-white rounded-xl border border-zinc-200/90 shadow-2xs flex items-center justify-between gap-3 text-xs"
                                                        >
                                                            <span className="font-semibold text-zinc-800 truncate">{text}</span>
                                                            <span
                                                                className={`font-bold shrink-0 ${
                                                                    isFromMe ? 'text-rose-600' : 'text-zinc-900'
                                                                }`}
                                                            >
                                                                {amountText}
                                                            </span>
                                                        </div>
                                                    );
                                                })
                                            ) : (
                                                <div className="p-3 bg-white rounded-xl border border-zinc-200/90 text-xs text-zinc-600">
                                                    {detail.optimizationDetail?.compensationLabel ||
                                                        `Se compensan ${formatCurrency(
                                                            totalCompensated,
                                                            currency
                                                        )} mediante optimización del grupo.`}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* 3. PIE: PROPORCIONES EQUILIBRADAS */}
                <div className="p-3.5 sm:p-4 bg-zinc-50 border-t border-zinc-200 shrink-0">
                    {/* Fila del total: proporciones sobrias y equilibradas */}
                    <div className="flex items-center justify-between gap-3">
                        {/* Caja "=" y etiqueta */}
                        <div className="flex items-center gap-2.5 min-w-0">
                            <div
                                className={`w-6.5 h-6.5 sm:w-7 sm:h-7 rounded-lg font-black text-xs flex items-center justify-center shrink-0 border ${
                                    finalSettlementAmount <= 0
                                        ? 'bg-zinc-100 text-zinc-500 border-zinc-200'
                                        : isCreditor
                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                        : 'bg-rose-50 text-rose-700 border-rose-200'
                                }`}
                            >
                                =
                            </div>
                            <span className="text-xs sm:text-sm font-bold text-zinc-900 truncate">
                                Total neto a liquidar
                            </span>
                        </div>

                        {/* Monto en tamaño armónico (no desproporcionado) con botón de copiar */}
                        <div className="flex items-center gap-1.5 shrink-0">
                            <span
                                className={`text-xl sm:text-2xl font-black tracking-tight ${
                                    finalSettlementAmount <= 0
                                        ? 'text-zinc-700'
                                        : isCreditor
                                        ? 'text-emerald-700'
                                        : 'text-rose-600'
                                }`}
                            >
                                {formatCurrency(finalSettlementAmount, currency)}
                            </span>
                            <button
                                type="button"
                                onClick={() => {
                                    navigator.clipboard.writeText(String(finalSettlementAmount));
                                    setCopiedAmount(true);
                                    setTimeout(() => setCopiedAmount(false), 2000);
                                }}
                                title="Copiar monto"
                                className="p-1 rounded-md text-zinc-400 hover:text-zinc-700 hover:bg-black/5 transition-colors cursor-pointer"
                            >
                                {copiedAmount ? (
                                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                                ) : (
                                    <Copy className="w-3.5 h-3.5" />
                                )}
                            </button>
                        </div>
                    </div>

                    {/* Botón "Registrar cobro" o "Saldar" a todo el ancho */}
                    {finalSettlementAmount > 0 && onOpenSettleModal && (
                        <button
                            type="button"
                            onClick={() => {
                                onClose();
                                onOpenSettleModal(
                                    pairwise.group_id || groupId,
                                    debtorProfile.id,
                                    creditorProfile.id,
                                    finalSettlementAmount
                                );
                            }}
                            className={`w-full mt-3 py-2.5 sm:py-3 rounded-xl font-bold text-xs sm:text-sm transition-all shadow-xs active:scale-[0.99] cursor-pointer flex items-center justify-center gap-1.5 ${
                                isCreditor
                                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                    : 'bg-zinc-900 hover:bg-zinc-800 text-white'
                            }`}
                        >
                            <Wallet className="w-3.5 h-3.5" />
                            <span>{isCreditor ? 'Registrar cobro' : 'Saldar'}</span>
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
