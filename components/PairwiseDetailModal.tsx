'use client';

import React, { useMemo, useState } from 'react';
import Image from 'next/image';
import { Expense, Group, PairwiseBalance, Payment, Profile } from '@/lib/types';
import { calculatePairwiseDebtDetail, formatCurrency } from '@/lib/balance-utils';
import { GenericExpenseList } from '@/components/my-expenses/GenericExpenseList';
import {
    ArrowLeft,
    ArrowRight,
    Calculator,
    Check,
    ChevronDown,
    ChevronUp,
    Copy,
    GitMerge,
    Network,
    Receipt,
    Sparkles,
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
    const [expandedSections, setExpandedSections] = useState({
        debts: true,
        recovers: true,
        distribution: false,
        calculation: true,
    });

    const [copiedAmount, setCopiedAmount] = useState(false);
    const [showFlowDiagram, setShowFlowDiagram] = useState(false);
    const [showRelatedExpenses, setShowRelatedExpenses] = useState(false);

    // Reset when pairwise changes
    const currentPairwiseKey = isOpen && pairwise ? `${pairwise.debtor.id}-${pairwise.creditor.id}` : '';
    const [prevPairwiseKey, setPrevPairwiseKey] = useState(currentPairwiseKey);
    if (currentPairwiseKey !== prevPairwiseKey) {
        setPrevPairwiseKey(currentPairwiseKey);
        setExpandedSections({
            debts: true,
            recovers: true,
            distribution: false,
            calculation: true,
        });
        setCopiedAmount(false);
        setShowFlowDiagram(false);
        setShowRelatedExpenses(false);
    }

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

    const finalSettlementAmount =
        typeof detail.finalSettlementAmount === 'number'
            ? detail.finalSettlementAmount
            : isSimplified && detail.optimizationDetail
                ? detail.optimizationDetail.simplifiedAmount
                : detail.netDirectBalance;

    return (
        <div
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto animate-in fade-in duration-150"
            onClick={onClose}
        >
            <div
                className="relative w-full sm:max-w-2xl max-h-[92vh] sm:max-h-[88vh] bg-white rounded-t-3xl sm:rounded-2xl shadow-xl border border-zinc-200 flex flex-col overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* 1. COMPACT HEADER */}
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

                            {/* Perspective Title */}
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

                    {/* Compact Liquidation Box */}
                    <div
                        className={`mt-3 p-3 sm:p-3.5 rounded-xl border flex items-center justify-between gap-3 ${
                            isCreditor
                                ? 'bg-emerald-50/70 border-emerald-200/90'
                                : isDebtor
                                ? 'bg-rose-50/70 border-rose-200/90'
                                : 'bg-zinc-50 border-zinc-200'
                        }`}
                    >
                        <div className="min-w-0">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block leading-tight">
                                {isCreditor ? 'A tu favor' : isDebtor ? 'Total por pagar' : 'Saldo a liquidar'}
                            </span>
                            <div className="flex items-center gap-2 mt-0.5">
                                <span
                                    className={`text-xl sm:text-2xl font-black tracking-tight ${
                                        isCreditor
                                            ? 'text-emerald-700'
                                            : isDebtor
                                            ? 'text-rose-600'
                                            : 'text-zinc-900'
                                    }`}
                                >
                                    {isCreditor ? '+' : isDebtor ? '-' : ''}
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
                                    className="p-1 rounded text-zinc-400 hover:text-zinc-700 hover:bg-black/5 transition-colors cursor-pointer"
                                >
                                    {copiedAmount ? (
                                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                                    ) : (
                                        <Copy className="w-3.5 h-3.5" />
                                    )}
                                </button>
                            </div>
                        </div>

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
                            className={`px-4 py-2 rounded-xl font-bold text-xs sm:text-sm transition-all shadow-xs active:scale-95 cursor-pointer shrink-0 flex items-center gap-1.5 ${
                                isCreditor
                                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                    : 'bg-zinc-900 hover:bg-zinc-800 text-white'
                            }`}
                        >
                            <Wallet className="w-3.5 h-3.5" />
                            <span>{isCreditor ? 'Registrar cobro' : 'Saldar'}</span>
                        </button>
                    </div>
                </div>

                {/* 2. SCROLLABLE BODY */}
                <div className="p-3 sm:p-4 space-y-3 overflow-y-auto">
                    {/* Empty state when everything is 0 */}
                    {pendingConsumedExpenses.length === 0 &&
                        activeReverseExpenses.length === 0 &&
                        activeDirectPayments.length === 0 &&
                        !hasCompensations && (
                            <div className="p-6 text-center bg-white rounded-xl border border-zinc-200 shadow-2xs space-y-2">
                                <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
                                    <Check className="w-5 h-5" />
                                </div>
                                <p className="text-sm font-bold text-zinc-900">Cuentas al día</p>
                                <p className="text-xs text-zinc-500">No hay movimientos ni saldos pendientes entre ambos integrantes.</p>
                            </div>
                        )}

                    {/* SECCIÓN 1 (AL INICIO): RESUMEN Y CÁLCULO MATEMÁTICO */}
                    <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden shadow-2xs">
                        <button
                            type="button"
                            onClick={() =>
                                setExpandedSections((prev) => ({ ...prev, calculation: !prev.calculation }))
                            }
                            className="w-full p-3 sm:p-3.5 flex items-center justify-between gap-2.5 hover:bg-zinc-50 transition-colors cursor-pointer text-left"
                        >
                            <div className="flex items-center gap-2.5 min-w-0">
                                <div className="w-7 h-7 rounded-lg bg-zinc-100 text-zinc-700 border border-zinc-200 flex items-center justify-center shrink-0">
                                    <Calculator className="w-3.5 h-3.5" />
                                </div>
                                <div className="min-w-0">
                                    <h3 className="text-xs sm:text-sm font-bold text-zinc-900 truncate">
                                        Resumen de liquidación
                                    </h3>
                                    <p className="text-[11px] text-zinc-500 truncate">
                                        Desglose paso a paso
                                    </p>
                                </div>
                            </div>

                            {expandedSections.calculation ? (
                                <ChevronUp className="w-4 h-4 text-zinc-400 shrink-0" />
                            ) : (
                                <ChevronDown className="w-4 h-4 text-zinc-400 shrink-0" />
                            )}
                        </button>

                        {expandedSections.calculation && (
                            <div className="border-t border-zinc-100 p-3 sm:p-4 bg-zinc-50/40 space-y-2.5 text-xs sm:text-sm">
                                {/* Consumos directos (Solo si > 0) */}
                                {totalDirectConsumption > 0 && (
                                    <div className="flex items-center justify-between gap-2 text-zinc-700">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span
                                                className={`w-5 text-center font-bold shrink-0 ${
                                                    isCreditor ? 'text-emerald-500' : 'text-rose-500'
                                                }`}
                                            >
                                                +
                                            </span>
                                            <span className="truncate">
                                                {isCreditor
                                                    ? `Consumos de ${debtorName} pagados por ti`
                                                    : isDebtor
                                                    ? `Tus consumos pagados por ${creditorName}`
                                                    : `Consumos de ${debtorName} pagados por ${creditorName}`}
                                            </span>
                                        </div>
                                        <span
                                            className={`font-bold shrink-0 ${
                                                isCreditor ? 'text-emerald-600' : 'text-rose-600'
                                            }`}
                                        >
                                            {formatCurrency(totalDirectConsumption, currency)}
                                        </span>
                                    </div>
                                )}

                                {/* Aportes y pagos previos (Solo si > 0) */}
                                {totalActiveRecoverable > 0 && (
                                    <div className="flex items-center justify-between gap-2 text-zinc-700">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span
                                                className={`w-5 text-center font-bold shrink-0 ${
                                                    isCreditor ? 'text-zinc-400' : 'text-emerald-500'
                                                }`}
                                            >
                                                -
                                            </span>
                                            <span className="truncate">
                                                {isCreditor
                                                    ? `Aportes o pagos que te realizó ${debtorName}`
                                                    : isDebtor
                                                    ? 'Aportes o pagos que le realizaste'
                                                    : `Aportes o pagos que realizó ${debtorName}`}
                                            </span>
                                        </div>
                                        <span
                                            className={`font-bold shrink-0 ${
                                                isCreditor ? 'text-zinc-600' : 'text-emerald-600'
                                            }`}
                                        >
                                            {formatCurrency(totalActiveRecoverable, currency)}
                                        </span>
                                    </div>
                                )}

                                {/* Compensación grupal (Solo si > 0) */}
                                {hasCompensations && (
                                    <div className="flex items-center justify-between gap-2 text-zinc-700">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span
                                                className={`w-5 text-center font-bold shrink-0 ${
                                                    detail.optimizationDetail?.isDiscount
                                                        ? isCreditor
                                                            ? 'text-zinc-400'
                                                            : 'text-emerald-500'
                                                        : isCreditor
                                                        ? 'text-emerald-500'
                                                        : 'text-rose-500'
                                                }`}
                                            >
                                                {detail.optimizationDetail?.isDiscount ? '-' : '+'}
                                            </span>
                                            <span className="truncate">
                                                {detail.optimizationDetail?.isDiscount
                                                    ? 'Compensación grupal (descuento)'
                                                    : 'Consolidación de grupo'}
                                            </span>
                                        </div>
                                        <span
                                            className={`font-bold shrink-0 ${
                                                detail.optimizationDetail?.isDiscount
                                                    ? isCreditor
                                                        ? 'text-zinc-600'
                                                        : 'text-emerald-600'
                                                    : isCreditor
                                                    ? 'text-emerald-600'
                                                    : 'text-rose-600'
                                            }`}
                                        >
                                            {formatCurrency(detail.optimizationDetail?.totalCompensated || 0, currency)}
                                        </span>
                                    </div>
                                )}

                                {/* Total Final */}
                                <div className="pt-2.5 mt-1 border-t border-zinc-200 flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <span className="w-5 text-center font-bold text-zinc-400 shrink-0">=</span>
                                        <span className="font-bold text-zinc-900 truncate">Total neto a liquidar</span>
                                    </div>
                                    <span
                                        className={`text-base sm:text-lg font-black tracking-tight shrink-0 ${
                                            finalSettlementAmount <= 0
                                                ? 'text-zinc-900'
                                                : isCreditor
                                                ? 'text-emerald-600'
                                                : 'text-rose-600'
                                        }`}
                                    >
                                        {formatCurrency(finalSettlementAmount, currency)}
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* SECCIÓN 2: CONSUMOS QUE DEBE (Solo si > 0) */}
                    {pendingConsumedExpenses.length > 0 && totalDirectConsumption > 0 && (
                        <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden shadow-2xs">
                            <button
                                type="button"
                                onClick={() =>
                                    setExpandedSections((prev) => ({ ...prev, debts: !prev.debts }))
                                }
                                className="w-full p-3 sm:p-3.5 flex items-center justify-between gap-2.5 hover:bg-zinc-50 transition-colors cursor-pointer text-left"
                            >
                                <div className="flex items-center gap-2.5 min-w-0">
                                    <div
                                        className={`w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 ${
                                            isCreditor
                                                ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
                                                : 'bg-rose-50 text-rose-600 border-rose-100'
                                        }`}
                                    >
                                        <Receipt className="w-3.5 h-3.5" />
                                    </div>
                                    <div className="min-w-0">
                                        <h3 className="text-xs sm:text-sm font-bold text-zinc-900 truncate">
                                            {isCreditor
                                                ? `Gastos que te debe ${debtorName} (${pendingConsumedExpenses.length})`
                                                : isDebtor
                                                ? `Gastos que debes (${pendingConsumedExpenses.length})`
                                                : `Gastos que debe ${debtorName} (${pendingConsumedExpenses.length})`}
                                        </h3>
                                        <p className="text-[11px] text-zinc-500 truncate">
                                            {isCreditor ? 'Pagados por ti' : `Pagados por ${creditorName}`}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                    <span
                                        className={`text-xs sm:text-sm font-bold ${
                                            isCreditor ? 'text-emerald-600' : 'text-rose-600'
                                        }`}
                                    >
                                        {formatCurrency(totalDirectConsumption, currency)}
                                    </span>
                                    {expandedSections.debts ? (
                                        <ChevronUp className="w-4 h-4 text-zinc-400" />
                                    ) : (
                                        <ChevronDown className="w-4 h-4 text-zinc-400" />
                                    )}
                                </div>
                            </button>

                            {expandedSections.debts && (
                                <div className="border-t border-zinc-100 p-2 sm:p-3 bg-zinc-50/30">
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

                    {/* SECCIÓN 3: APORTES Y PAGOS DIRECTOS (Solo si > 0) */}
                    {(activeReverseExpenses.length > 0 || activeDirectPayments.length > 0) && totalActiveRecoverable > 0 && (
                        <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden shadow-2xs">
                            <button
                                type="button"
                                onClick={() =>
                                    setExpandedSections((prev) => ({ ...prev, recovers: !prev.recovers }))
                                }
                                className="w-full p-3 sm:p-3.5 flex items-center justify-between gap-2.5 hover:bg-zinc-50 transition-colors cursor-pointer text-left"
                            >
                                <div className="flex items-center gap-2.5 min-w-0">
                                    <div
                                        className={`w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 ${
                                            isCreditor
                                                ? 'bg-zinc-100 text-zinc-700 border-zinc-200'
                                                : 'bg-emerald-50 text-emerald-600 border-emerald-100'
                                        }`}
                                    >
                                        <Wallet className="w-3.5 h-3.5" />
                                    </div>
                                    <div className="min-w-0">
                                        <h3 className="text-xs sm:text-sm font-bold text-zinc-900 truncate">
                                            {isCreditor
                                                ? `Aportes y pagos recibidos (${activeReverseExpenses.length + activeDirectPayments.length})`
                                                : isDebtor
                                                ? `Aportes y pagos que realizaste (${activeReverseExpenses.length + activeDirectPayments.length})`
                                                : `Aportes y pagos que realizó ${debtorName} (${activeReverseExpenses.length + activeDirectPayments.length})`}
                                        </h3>
                                        <p className="text-[11px] text-zinc-500 truncate">
                                            {isCreditor ? 'Deducidos de lo que te debe' : isDebtor ? 'Deducidos de tu deuda' : 'Deducidos de la cuenta'}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                    <span
                                        className={`text-xs sm:text-sm font-bold ${
                                            isCreditor ? 'text-zinc-600' : 'text-emerald-600'
                                        }`}
                                    >
                                        {formatCurrency(totalActiveRecoverable, currency)}
                                    </span>
                                    {expandedSections.recovers ? (
                                        <ChevronUp className="w-4 h-4 text-zinc-400" />
                                    ) : (
                                        <ChevronDown className="w-4 h-4 text-zinc-400" />
                                    )}
                                </div>
                            </button>

                            {expandedSections.recovers && (
                                <div className="border-t border-zinc-100 p-2 sm:p-3 bg-zinc-50/30">
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

                    {/* SECCIÓN 4: COMPENSACIÓN GRUPAL (Solo si simplificado y hay compensación > 0) */}
                    {isSimplified && hasCompensations && (
                        <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden shadow-2xs">
                            <button
                                type="button"
                                onClick={() =>
                                    setExpandedSections((prev) => ({ ...prev, distribution: !prev.distribution }))
                                }
                                className="w-full p-3 sm:p-3.5 flex items-center justify-between gap-2.5 hover:bg-zinc-50 transition-colors cursor-pointer text-left"
                            >
                                <div className="flex items-center gap-2.5 min-w-0">
                                    <div className="w-7 h-7 rounded-lg bg-sky-50 text-sky-600 border border-sky-100 flex items-center justify-center shrink-0">
                                        <Sparkles className="w-3.5 h-3.5" />
                                    </div>
                                    <div className="min-w-0">
                                        <h3 className="text-xs sm:text-sm font-bold text-zinc-900 truncate">
                                            Compensación grupal
                                        </h3>
                                        <p className="text-[11px] text-zinc-500 truncate">
                                            Ajuste por deudas cruzadas en el grupo
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                    <span
                                        className={`text-xs sm:text-sm font-bold ${
                                            detail.optimizationDetail?.isDiscount
                                                ? isCreditor
                                                    ? 'text-zinc-600'
                                                    : 'text-emerald-600'
                                                : isCreditor
                                                ? 'text-emerald-600'
                                                : 'text-rose-600'
                                        }`}
                                    >
                                        {formatCurrency(detail.optimizationDetail?.totalCompensated || 0, currency)}
                                    </span>
                                    {expandedSections.distribution ? (
                                        <ChevronUp className="w-4 h-4 text-zinc-400" />
                                    ) : (
                                        <ChevronDown className="w-4 h-4 text-zinc-400" />
                                    )}
                                </div>
                            </button>

                            {expandedSections.distribution && (
                                <div className="border-t border-zinc-100 p-3 sm:p-4 bg-zinc-50/40 space-y-3">
                                    <p className="text-xs text-zinc-600 leading-relaxed">
                                        {detail.optimizationDetail?.compensationLabel ||
                                            `Se compensan ${formatCurrency(
                                                detail.optimizationDetail?.totalCompensated || 0,
                                                currency
                                            )} cruzando saldos con otros integrantes para reducir transferencias.`}
                                    </p>

                                    {/* Sugerencias de pago directo a terceros si existen */}
                                    {detail.optimizationDetail?.newSuggestedPayments &&
                                        detail.optimizationDetail.newSuggestedPayments.length > 0 && (
                                            <div className="space-y-2 pt-1">
                                                <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 block">
                                                    Transferencias sugeridas
                                                </span>
                                                {detail.optimizationDetail.newSuggestedPayments.map((sug, sIdx) => (
                                                    <div
                                                        key={`sug-${sIdx}`}
                                                        className="p-3 bg-white rounded-lg border border-zinc-200 flex items-center justify-between gap-2 shadow-2xs"
                                                    >
                                                        <div className="min-w-0">
                                                            <div className="text-xs font-semibold text-zinc-900 truncate">
                                                                Pagar a <strong className="text-zinc-950 font-bold">{sug.to.full_name}</strong>
                                                            </div>
                                                            <p className="text-[11px] text-zinc-500 truncate">
                                                                {sug.description}
                                                            </p>
                                                        </div>
                                                        <div className="flex items-center gap-2 shrink-0">
                                                            <span className="text-xs sm:text-sm font-bold text-zinc-900">
                                                                {formatCurrency(sug.amount, currency)}
                                                            </span>
                                                            {onOpenSettleModal && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        onClose();
                                                                        onOpenSettleModal(
                                                                            groupId || pairwise.group_id,
                                                                            sug.from.id,
                                                                            sug.to.id,
                                                                            sug.amount
                                                                        );
                                                                    }}
                                                                    className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 text-white text-[11px] font-bold rounded-md transition-colors"
                                                                >
                                                                    Saldar
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                    {/* Toggle opcional para gastos relacionados */}
                                    {detail.optimizationDetail?.relevantRelations &&
                                        detail.optimizationDetail.relevantRelations.some(
                                            (rel) => rel.expenses && rel.expenses.length > 0
                                        ) && (
                                            <div className="pt-2">
                                                <button
                                                    type="button"
                                                    onClick={() => setShowRelatedExpenses(!showRelatedExpenses)}
                                                    className="text-xs font-semibold text-zinc-600 hover:text-zinc-900 flex items-center gap-1 cursor-pointer"
                                                >
                                                    <span>{showRelatedExpenses ? 'Ocultar' : 'Ver'} gastos vinculados a la compensación</span>
                                                    <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showRelatedExpenses ? 'rotate-180' : ''}`} />
                                                </button>

                                                {showRelatedExpenses && (
                                                    <div className="mt-2.5 space-y-3">
                                                        {detail.optimizationDetail.relevantRelations.map((rel, rIdx) => {
                                                            if (!rel.expenses || rel.expenses.length === 0) return null;
                                                            return (
                                                                <div
                                                                    key={`rel-${rIdx}`}
                                                                    className="p-2.5 bg-white rounded-lg border border-zinc-200 space-y-2"
                                                                >
                                                                    <div className="flex items-center justify-between text-xs font-semibold text-zinc-700">
                                                                        <span>{rel.from.full_name} y {rel.to.full_name}</span>
                                                                        <span className="font-bold text-zinc-900">{formatCurrency(rel.amount, currency)}</span>
                                                                    </div>
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
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
