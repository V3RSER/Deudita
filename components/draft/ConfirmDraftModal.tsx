'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useExpense } from '@/lib/expense-context';
import { ExpenseDraft, ExpenseSplit } from '@/lib/types';
import { distributeAmountEqually, formatCurrency } from '@/lib/balance-utils';
import { CheckCircle2, Loader2, MailCheck, Trash2, X, } from 'lucide-react';
import Image from 'next/image';
import { CustomSelect } from '@/components/ui/CustomSelect';

interface ConfirmDraftModalProps {
    readonly isOpen: boolean;
    readonly onClose: () => void;
    readonly draft: ExpenseDraft | null;
}

export function ConfirmDraftModal({
    isOpen,
    onClose,
    draft,
}: ConfirmDraftModalProps) {
    const {
        currentProfile,
        userGroups,
        members,
        profiles,
        confirmDraft,
        discardDraft,
    } = useExpense();

    const [selectedGroupId, setSelectedGroupId] = useState('');
    const [paidBy, setPaidBy] = useState('');
    const [description, setDescription] = useState('');
    const [amount, setAmount] = useState(0);
    const [expenseDate, setExpenseDate] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isDiscarding, setIsDiscarding] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const profileById = useMemo(
        () => new Map(profiles.map((profile) => [profile.id, profile])),
        [profiles],
    );

    const membersByGroupId = useMemo(() => {
        const groupedMembers = new Map<string, typeof members>();

        members.forEach((member) => {
            const groupMembers = groupedMembers.get(member.group_id) ?? [];
            groupMembers.push(member);
            groupedMembers.set(member.group_id, groupMembers);
        });

        return groupedMembers;
    }, [members]);

    const selectedGroupMemberProfiles = useMemo(() => {
        const groupMembers = membersByGroupId.get(selectedGroupId) ?? [];

        return groupMembers
            .map((member) => profileById.get(member.user_id))
            .filter((profile): profile is NonNullable<typeof profile> => profile !== undefined);
    }, [membersByGroupId, profileById, selectedGroupId]);

    useEffect(() => {
        if (!isOpen || !draft) {
            return;
        }

        const initialGroupId = userGroups[0]?.id ?? '';
        setErrorMsg(null);
        setIsSubmitting(false);
        setIsDiscarding(false);
        setDescription(draft.detected_merchant || 'Gasto detectado');
        setAmount(draft.detected_amount || 0);
        setExpenseDate(
            draft.detected_date || new Date().toISOString().split('T')[0],
        );
        setSelectedGroupId(initialGroupId);
    }, [draft, isOpen, userGroups]);

    useEffect(() => {
        if (!isOpen || !selectedGroupId) {
            return;
        }

        const firstMemberProfile = selectedGroupMemberProfiles[0];

        if (!firstMemberProfile) {
            setPaidBy(currentProfile?.id ?? '');
            return;
        }

        const currentProfileInGroup = currentProfile
            ? selectedGroupMemberProfiles.some(
                (profile) => profile.id === currentProfile.id,
            )
            : false;

        if (
            !selectedGroupMemberProfiles.some((profile) => profile.id === paidBy)
        ) {
            setPaidBy(
                currentProfileInGroup && currentProfile
                    ? currentProfile.id
                    : firstMemberProfile.id,
            );
        }
    }, [
        currentProfile,
        isOpen,
        paidBy,
        selectedGroupId,
        selectedGroupMemberProfiles,
    ]);

    if (!isOpen || !draft) {
        return null;
    }

    const handleSubmit = async (
        event: React.SyntheticEvent<HTMLFormElement>,
    ) => {
        event.preventDefault();

        if (isSubmitting || isDiscarding) {
            return;
        }

        setErrorMsg(null);

        if (!selectedGroupId) {
            setErrorMsg('Selecciona un grupo para asignar el gasto');
            return;
        }

        if (selectedGroupMemberProfiles.length === 0) {
            setErrorMsg('El grupo seleccionado no tiene integrantes');
            return;
        }

        if (!amount || amount <= 0) {
            setErrorMsg('El monto debe ser mayor a 0');
            return;
        }

        setIsSubmitting(true);

        try {
            const rawSplits = distributeAmountEqually(
                amount,
                selectedGroupMemberProfiles.map((profile) => profile.id),
                paidBy,
            );

            const splits: ExpenseSplit[] = rawSplits.map((split) => ({
                id: '',
                expense_id: '',
                user_id: split.user_id,
                amount_owed: split.amount_owed,
                created_at: new Date().toISOString(),
            }));

            await confirmDraft(draft.id, selectedGroupId, paidBy, splits, {
                description: description.trim(),
                totalAmount: amount,
                expenseDate: expenseDate || undefined,
            });

            onClose();
        } catch (error) {
            setErrorMsg(
                error instanceof Error
                    ? error.message
                    : 'Error al confirmar borrador',
            );
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDiscard = async () => {
        if (isDiscarding || isSubmitting) {
            return;
        }

        setIsDiscarding(true);
        setErrorMsg(null);

        try {
            await discardDraft(draft.id);
            onClose();
        } catch (error) {
            setErrorMsg(
                error instanceof Error
                    ? error.message
                    : 'Error al descartar borrador',
            );
        } finally {
            setIsDiscarding(false);
        }
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-zinc-950/70 backdrop-blur-sm overflow-y-auto">
            <div
                className="bg-white rounded-3xl ring-1 ring-zinc-200 shadow-2xl w-full max-w-lg overflow-hidden my-auto">
                <div className="bg-zinc-900 text-white p-6 flex items-center justify-between">
                    <div className="flex items-center space-x-3.5">
                        <div
                            className="w-10 h-10 rounded-2xl bg-zinc-800 ring-1 ring-zinc-700 flex items-center justify-center text-zinc-100 font-bold">
                            <MailCheck className="w-5 h-5 text-indigo-400" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold tracking-tight text-zinc-50">
                                Confirmar y Asignar Gasto
                            </h2>
                            <p className="text-xs text-zinc-400">
                                Detectado automáticamente desde tu correo
                            </p>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Cerrar modal"
                        className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-full transition-colors cursor-pointer"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-5">
                    {errorMsg && (
                        <div
                            className="bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold p-3 rounded-xl">
                            {errorMsg}
                        </div>
                    )}

                    <div className="bg-indigo-50/40 p-4 rounded-2xl border border-indigo-100 space-y-2">
                        <div
                            className="flex justify-between items-center text-xs font-bold text-indigo-950 uppercase tracking-wider">
                            <div className="flex items-center space-x-2">
                                <span>{draft.entity || 'Correo'}</span>
                                {draft.source_account && (
                                    <span
                                        className="text-[10px] font-mono bg-white text-zinc-600 px-2 py-0.5 rounded-md border border-indigo-200">
                                        *{draft.source_account}
                                    </span>
                                )}
                            </div>
                            <span className="text-xs font-extrabold text-indigo-700">
                                {draft.currency || 'COP'}{' '}
                                {formatCurrency(
                                    draft.detected_amount,
                                    draft.currency || 'COP',
                                )}
                            </span>
                        </div>

                        {draft.raw_snippet && (
                            <p className="text-xs text-zinc-600 line-clamp-2 leading-relaxed bg-white/70 p-2 rounded-xl border border-indigo-100/60 font-mono text-[11px]">
                                &quot;{draft.raw_snippet}&quot;
                            </p>
                        )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                        <div className="space-y-1 sm:col-span-2">
                            <label
                                htmlFor="confirm-draft-description"
                                className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider"
                            >
                                Descripción / Comercio
                            </label>
                            <input
                                id="confirm-draft-description"
                                type="text"
                                required
                                value={description}
                                onChange={(event) => setDescription(event.target.value)}
                                className="w-full px-3.5 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-semibold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900"
                            />
                        </div>

                        <div className="space-y-1">
                            <label
                                htmlFor="confirm-draft-amount"
                                className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider"
                            >
                                Monto ({draft.currency || 'COP'})
                            </label>
                            <input
                                id="confirm-draft-amount"
                                type="number"
                                step="any"
                                required
                                value={amount}
                                onChange={(event) =>
                                    setAmount(Number.parseFloat(event.target.value) || 0)
                                }
                                className="w-full px-3.5 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-bold text-emerald-800 focus:outline-none focus:ring-2 focus:ring-zinc-900"
                            />
                        </div>

                        <div className="space-y-1">
                            <label
                                htmlFor="confirm-draft-expense-date"
                                className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider"
                            >
                                Fecha del Gasto
                            </label>
                            <input
                                id="confirm-draft-expense-date"
                                type="date"
                                required
                                value={expenseDate}
                                onChange={(event) => setExpenseDate(event.target.value)}
                                className="w-full px-3.5 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-semibold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900"
                            />
                        </div>
                    </div>

                    <div className="space-y-1">
                        <span className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                            Asignar al Grupo <span className="text-rose-500">*</span>
                        </span>
                        <CustomSelect
                            value={selectedGroupId}
                            onChange={setSelectedGroupId}
                            options={userGroups.map((group) => ({
                                value: group.id,
                                label: group.name,
                            }))}
                            size="md"
                            placeholder="Seleccionar grupo..."
                        />
                    </div>

                    <div className="space-y-1">
                        <span className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                            ¿Quién pagó?
                        </span>
                        <CustomSelect
                            value={paidBy}
                            onChange={setPaidBy}
                            options={selectedGroupMemberProfiles.map((profile) => ({
                                value: profile.id,
                                label: profile.full_name,
                                icon: profile.avatar_url ? (
                                    <Image
                                        src={profile.avatar_url}
                                        alt=""
                                        width={20}
                                        height={20}
                                        className="w-5 h-5 rounded-full object-cover shrink-0 ring-1 ring-zinc-200"
                                        unoptimized
                                    />
                                ) : (
                                    <div
                                        className="w-5 h-5 rounded-full bg-zinc-900 text-white flex items-center justify-center text-[9px] font-bold shrink-0">
                                        {(profile.full_name || 'U').charAt(0).toUpperCase()}
                                    </div>
                                ),
                            }))}
                            size="md"
                            placeholder="Seleccionar pagador..."
                        />
                    </div>

                    <div
                        className="bg-zinc-50 p-3 rounded-xl border border-zinc-200 text-xs text-zinc-600 flex items-center justify-between">
                        <span>
                            División entre{' '}
                            <strong className="text-zinc-900">
                                {selectedGroupMemberProfiles.length} integrantes
                            </strong>
                            :
                        </span>
                        <span className="font-bold text-zinc-900">
                            {formatCurrency(
                                selectedGroupMemberProfiles.length > 0
                                    ? amount / selectedGroupMemberProfiles.length
                                    : 0,
                                draft.currency || 'COP',
                            )}{' '}
                            c/u
                        </span>
                    </div>

                    <div className="pt-4 border-t border-zinc-100 flex items-center justify-between">
                        <button
                            type="button"
                            onClick={handleDiscard}
                            disabled={isDiscarding || isSubmitting}
                            className="px-3.5 py-2 rounded-xl text-rose-600 hover:bg-rose-50 text-xs font-semibold transition flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                        >
                            {isDiscarding ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                                <Trash2 className="w-3.5 h-3.5" />
                            )}
                            <span>Descartar</span>
                        </button>

                        <div className="flex items-center space-x-2">
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-4 py-2 rounded-xl border border-zinc-200 text-zinc-600 hover:bg-zinc-100 text-xs font-semibold transition cursor-pointer"
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                disabled={isSubmitting || isDiscarding}
                                className="px-5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold shadow-xs transition flex items-center space-x-2 cursor-pointer disabled:opacity-50"
                            >
                                {isSubmitting ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                                ) : (
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                )}
                                <span>
                                    {isSubmitting ? 'Confirmando...' : 'Confirmar Gasto'}
                                </span>
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
}
