'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useExpense } from '@/lib/expense-context';
import { calculatePairwiseBalances, formatCurrency } from '@/lib/balance-utils';
import { PaymentInstructionsView } from '@/components/PaymentInstructionsView';
import { FormattedCurrencyInput } from '@/components/FormattedCurrencyInput';
import { ConfirmModal } from '@/components/ConfirmModal';
import { Payment } from '@/lib/types';
import {
  X,
  Wallet,
  ArrowRight,
  ArrowLeftRight,
  Camera,
  Loader2,
  AlertCircle,
  Trash2,
  Check,
  CheckCircle2,
  Sparkles,
  Layers,
  Image as ImageIcon,
  Calendar,
  Clock,
  ChevronDown
} from 'lucide-react';
import { CustomSelect } from '@/components/ui/CustomSelect';
import Image from 'next/image';
import {
  getTodayDateString,
  getCurrentTimeString,
  getDefaultTimeForDate,
  combineDateAndTimeToISO,
  extractTimeFromISO,
  parseCurrencyAmount,
} from '@/lib/transaction-date-utils';

interface SettleDebtModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultGroupId?: string;
  defaultDebtorId?: string;
  defaultCreditorId?: string;
  defaultAmount?: number;
  paymentToEdit?: Payment | null;
}

const PAYMENT_METHODS = [
  { id: 'transfer', label: 'Transferencia' },
  { id: 'nequi', label: 'Nequi' },
  { id: 'daviplata', label: 'Daviplata' },
  { id: 'cash', label: 'Efectivo' },
  { id: 'bizum', label: 'Bizum' },
];

export function SettleDebtModal({
  isOpen,
  onClose,
  defaultGroupId,
  defaultDebtorId,
  defaultCreditorId,
  defaultAmount,
  paymentToEdit,
}: SettleDebtModalProps) {
  const { currentProfile, userGroups, profiles, expenses, payments, addPayment, updatePayment, deletePayment, isMutating } = useExpense();

  const [groupId, setGroupId] = useState<string>('');
  const [payerId, setPayerId] = useState<string>('');
  const [receiverId, setReceiverId] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [notes, setNotes] = useState<string>('Transferencia');
  const [date, setDate] = useState<string>(getTodayDateString());
  const [time, setTime] = useState<string>(getCurrentTimeString());
  const [isManualTime, setIsManualTime] = useState(false);
  const [showTimeInput, setShowTimeInput] = useState(false);
  const [proofUrl, setProofUrl] = useState<string>('');
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const prevIsOpenRef = useRef(false);
  const prevPaymentIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      prevIsOpenRef.current = false;
      prevPaymentIdRef.current = null;
      return;
    }

    const currentPaymentId = paymentToEdit ? paymentToEdit.id : null;
    const isOpening = !prevIsOpenRef.current;
    const isPaymentChanged = currentPaymentId !== prevPaymentIdRef.current;

    if (isOpening || isPaymentChanged) {
      prevIsOpenRef.current = true;
      prevPaymentIdRef.current = currentPaymentId;
      setErrorMsg(null);
      setIsSubmitting(false);
      setIsUploading(false);
      setIsDeleting(false);

      if (paymentToEdit) {
        setGroupId(paymentToEdit.group_id);
        setPayerId(paymentToEdit.paid_by);
        setReceiverId(paymentToEdit.paid_to);
        setAmount(paymentToEdit.amount ? paymentToEdit.amount.toString() : '');
        setNotes(paymentToEdit.note ?? '');
        setProofUrl(paymentToEdit.proof_url ?? '');
        const payDate = paymentToEdit.payment_date ?? getTodayDateString();
        setDate(payDate);
        const payTime = paymentToEdit.payment_time
          ? extractTimeFromISO(paymentToEdit.payment_time)
          : getDefaultTimeForDate(payDate);
        setTime(payTime || '00:00');
        setIsManualTime(Boolean(paymentToEdit.payment_time));
        setShowTimeInput(Boolean(paymentToEdit.payment_time));
      } else {
        setProofUrl('');
        const activeGroup = defaultGroupId && userGroups.some((g) => g.id === defaultGroupId) ? defaultGroupId : '';
        setGroupId(activeGroup);

        const activePayer = defaultDebtorId ?? currentProfile?.id ?? profiles[0]?.id ?? '';
        setPayerId(activePayer);

        const activeReceiver = defaultCreditorId ?? profiles.find((p) => p.id !== activePayer)?.id ?? '';
        setReceiverId(activeReceiver);

        setAmount(defaultAmount && defaultAmount > 0 ? defaultAmount.toString() : '');
        setNotes('Transferencia');
        const today = getTodayDateString();
        setDate(today);
        setTime(getCurrentTimeString());
        setIsManualTime(false);
        setShowTimeInput(false);
      }
    }
  }, [isOpen, paymentToEdit, defaultGroupId, userGroups, defaultDebtorId, currentProfile?.id, profiles, defaultCreditorId, defaultAmount]);

  const isEditing = Boolean(paymentToEdit);
  const isLockedToGroup = Boolean(defaultGroupId && defaultGroupId.trim().length > 0) || isEditing;
  const targetGroup = userGroups.find((g) => g.id === groupId);
  const currency = targetGroup?.currency || currentProfile?.currency || 'COP';

  // Compute breakdown of group debts between payer and receiver
  const getGroupDebtBreakdown = () => {
    if (!payerId || !receiverId || payerId === receiverId) return [];

    const groupDebts: Array<{ group: typeof userGroups[0]; debt: number }> = [];

    const targetGroups = isLockedToGroup
      ? userGroups.filter((g) => g.id === groupId)
      : userGroups;

    targetGroups.forEach((group) => {
      const groupPairwise = calculatePairwiseBalances(expenses, payments, profiles, group.id);
      const pair = groupPairwise.find((p) => p.debtor.id === payerId && p.creditor.id === receiverId);
      const debt = pair ? pair.amount : 0;
      if (debt > 0 || isLockedToGroup) {
        groupDebts.push({ group, debt });
      }
    });

    return groupDebts;
  };

  const groupDebts = getGroupDebtBreakdown();
  const totalOwed = groupDebts.reduce((sum, item) => sum + item.debt, 0);

  // Auto-fill amount when payer or receiver changes and they have a debt
  useEffect(() => {
    if (!isEditing && isOpen && totalOwed > 0) {
      setAmount(totalOwed.toString());
    }
  }, [payerId, receiverId, totalOwed, isEditing, isOpen]);

  const handleSwapPayerReceiver = () => {
    const temp = payerId;
    setPayerId(receiverId);
    setReceiverId(temp);
  };

  const memberOptions = useMemo(() => {
    return profiles.map((p) => ({
      value: p.id,
      label: p.id === currentProfile?.id ? `${p.full_name} (Tú)` : p.full_name,
      icon: p.avatar_url ? (
        <Image
          src={p.avatar_url}
          alt={p.full_name}
          width={24}
          height={24}
          className="w-6 h-6 rounded-full object-cover ring-1 ring-zinc-200 shrink-0"
          unoptimized
        />
      ) : (
        <div className="w-6 h-6 rounded-full bg-zinc-900 text-white flex items-center justify-center text-[10px] font-bold shrink-0">
          {p.full_name?.charAt(0).toUpperCase() || 'U'}
        </div>
      ),
    }));
  }, [profiles, currentProfile?.id]);

  if (!isOpen) return null;

  // Calculate distributed allocation preview
  const numericAmount = parseCurrencyAmount(amount, currency);
  const getDistributionPreview = () => {
    if (numericAmount <= 0 || groupDebts.length === 0) return [];

    let remaining = numericAmount;
    const distribution: Array<{ groupName: string; currency: string; allocated: number; totalDebt: number }> = [];

    const sorted = [...groupDebts].sort((a, b) => b.debt - a.debt);

    for (const item of sorted) {
      if (remaining <= 0) break;
      const alloc = Math.min(remaining, item.debt > 0 ? item.debt : remaining);
      distribution.push({
        groupName: item.group.name,
        currency: item.group.currency || 'COP',
        allocated: alloc,
        totalDebt: item.debt,
      });
      remaining -= alloc;
    }

    if (remaining > 0 && distribution.length > 0) {
      distribution[0].allocated += remaining;
    } else if (remaining > 0 && userGroups.length > 0) {
      const fallbackGroup = targetGroup || userGroups[0];
      distribution.push({
        groupName: fallbackGroup.name,
        currency: fallbackGroup.currency || 'COP',
        allocated: remaining,
        totalDebt: 0,
      });
    }

    return distribution;
  };

  const distributionPreview = getDistributionPreview();

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploading(true);
      setErrorMsg(null);

      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', 'payment_proof');

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Error al subir la imagen del comprobante');
      }

      const data = await res.json();
      if (data.url) {
        setProofUrl(data.url);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al subir el comprobante';
      setErrorMsg(msg);
    } finally {
      setIsUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setErrorMsg(null);

    if (isNaN(numericAmount) || numericAmount <= 0) {
      setErrorMsg('Ingresa un monto válido mayor a 0');
      return;
    }

    if (payerId === receiverId) {
      setErrorMsg('El pagador y el receptor deben ser personas distintas');
      return;
    }

    setIsSubmitting(true);
    try {
      const paymentTimeISO = combineDateAndTimeToISO(date, time);

      if (isEditing && paymentToEdit) {
        await updatePayment(paymentToEdit.id, {
          group_id: groupId || paymentToEdit.group_id,
          paid_by: payerId,
          paid_to: receiverId,
          amount: numericAmount,
          payment_date: date,
          payment_time: paymentTimeISO,
          note: notes,
          proof_url: proofUrl || undefined,
        });
      } else if (isLockedToGroup && groupId) {
        await addPayment({
          group_id: groupId,
          paid_by: payerId,
          paid_to: receiverId,
          amount: numericAmount,
          payment_date: date,
          payment_time: paymentTimeISO,
          note: notes,
          proof_url: proofUrl || undefined,
        });
      } else {
        // Calculate exact distributed allocations per group (aligned with distribution preview)
        const allocations: Array<{ groupId: string; amount: number }> = [];
        let remaining = numericAmount;
        const sortedDebts = [...groupDebts].sort((a, b) => b.debt - a.debt);

        for (const item of sortedDebts) {
          if (remaining <= 0) break;
          const alloc = Math.min(remaining, item.debt > 0 ? item.debt : remaining);
          if (alloc > 0) {
            allocations.push({ groupId: item.group.id, amount: alloc });
            remaining -= alloc;
          }
        }

        if (remaining > 0) {
          if (allocations.length > 0) {
            allocations[0].amount += remaining;
          } else if (userGroups.length > 0) {
            const fallbackGroup = targetGroup || userGroups[0];
            allocations.push({ groupId: fallbackGroup.id, amount: remaining });
          }
        }

        for (const alloc of allocations) {
          await addPayment({
            group_id: alloc.groupId,
            paid_by: payerId,
            paid_to: receiverId,
            amount: alloc.amount,
            payment_date: date,
            payment_time: paymentTimeISO,
            note: notes ? notes : 'Pago registrado',
            proof_url: proofUrl || undefined,
          });
        }
      }

      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al guardar el pago';
      setErrorMsg(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!paymentToEdit || isDeleting) return;
    setErrorMsg(null);
    setIsDeleting(true);
    try {
      await deletePayment(paymentToEdit.id);
      setShowDeleteConfirm(false);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al eliminar el pago';
      setErrorMsg(msg);
      setShowDeleteConfirm(false);
    } finally {
      setIsDeleting(false);
    }
  };

  const payerProfile = profiles.find((p) => p.id === payerId);
  const receiverProfile = profiles.find((p) => p.id === receiverId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-zinc-950/50 backdrop-blur-md overflow-y-auto">
      <div className="bg-white rounded-[28px] shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[92vh] ring-1 ring-zinc-200/80 animate-in fade-in zoom-in-95 duration-150">
        
        {/* Top Bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 bg-white shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shadow-xs ring-1 ring-emerald-100">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-zinc-900 tracking-tight">
                {isEditing ? 'Editar pago' : 'Registrar pago'}
              </h2>
              <p className="text-xs text-zinc-500 font-medium">
                {targetGroup ? `En "${targetGroup.name}"` : 'Pago general de cuentas'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error Banner */}
        {errorMsg && (
          <div className="bg-rose-50 px-6 py-3 border-b border-rose-100 flex items-center text-xs font-semibold text-rose-700">
            <AlertCircle className="w-4 h-4 mr-2 shrink-0" /> {errorMsg}
          </div>
        )}

        {/* Form Content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
          
          {/* Transfer Flow Card: Single-line Payer ⇄ Receiver */}
          <div className="bg-zinc-50/90 border border-zinc-200/90 rounded-2xl p-3 sm:p-3.5 relative shadow-xs">
            <div className="text-[10px] font-black uppercase tracking-wider text-zinc-400 text-center mb-2.5">
              Flujo del dinero
            </div>

            <div className="flex items-center justify-between gap-1.5 sm:gap-2">
              {/* Payer Custom Card with Round Avatar */}
              <div className="flex-1 min-w-0">
                <CustomSelect
                  value={payerId}
                  onChange={(val) => setPayerId(val)}
                  options={memberOptions}
                  ariaLabel="Seleccionar pagador"
                  renderTrigger={(_, isOpen) => (
                    <div className={`relative flex items-center space-x-2 bg-white rounded-xl p-2 sm:p-2.5 border transition-all min-w-0 group cursor-pointer ${
                      isOpen
                        ? 'border-rose-400 ring-2 ring-rose-500/20 shadow-xs'
                        : 'border-zinc-200 shadow-2xs hover:border-zinc-300 hover:bg-zinc-50/50'
                    }`}>
                      <div className="relative shrink-0">
                        {payerProfile?.avatar_url ? (
                          <Image
                            src={payerProfile.avatar_url}
                            alt="Payer"
                            width={36}
                            height={36}
                            className="w-8 h-8 sm:w-9 sm:h-9 rounded-full object-cover ring-2 ring-zinc-100 group-hover:ring-rose-200 transition-all"
                            unoptimized
                          />
                        ) : (
                          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-zinc-900 text-white flex items-center justify-center text-xs font-bold shadow-xs">
                            {payerProfile?.full_name?.charAt(0).toUpperCase() || 'U'}
                          </div>
                        )}
                        <span className="absolute -bottom-1 -right-1 bg-rose-500 text-white text-[8px] font-black px-1 rounded-full ring-1 ring-white">
                          PAGA
                        </span>
                      </div>

                      <div className="min-w-0 flex-1 text-left">
                        <div className="text-xs font-extrabold text-zinc-900 truncate">
                          {payerProfile?.full_name?.split(' ')[0] || 'Pagador'}
                        </div>
                        <div className="text-[10px] text-zinc-400 font-medium truncate">
                          {payerProfile?.id === currentProfile?.id ? '(Tú)' : 'Integrante'}
                        </div>
                      </div>

                      <ChevronDown
                        className={`shrink-0 w-3.5 h-3.5 text-zinc-400 transition-transform duration-200 ${
                          isOpen ? 'rotate-180 text-rose-600' : ''
                        }`}
                      />
                    </div>
                  )}
                />
              </div>

              {/* Swap Button */}
              <div className="shrink-0">
                <button
                  type="button"
                  onClick={handleSwapPayerReceiver}
                  className="p-2 sm:p-2.5 rounded-full bg-white border border-zinc-200 text-zinc-600 hover:text-emerald-600 hover:border-emerald-300 hover:bg-emerald-50 transition-all shadow-2xs active:scale-90 cursor-pointer"
                  title="Invertir pagador y receptor"
                  aria-label="Invertir pagador y receptor"
                >
                  <ArrowLeftRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </button>
              </div>

              {/* Receiver Custom Card with Round Avatar */}
              <div className="flex-1 min-w-0">
                <CustomSelect
                  value={receiverId}
                  onChange={(val) => setReceiverId(val)}
                  options={memberOptions}
                  ariaLabel="Seleccionar receptor"
                  renderTrigger={(_, isOpen) => (
                    <div className={`relative flex items-center space-x-2 bg-white rounded-xl p-2 sm:p-2.5 border transition-all min-w-0 group cursor-pointer ${
                      isOpen
                        ? 'border-emerald-400 ring-2 ring-emerald-500/20 shadow-xs'
                        : 'border-zinc-200 shadow-2xs hover:border-zinc-300 hover:bg-zinc-50/50'
                    }`}>
                      <div className="relative shrink-0">
                        {receiverProfile?.avatar_url ? (
                          <Image
                            src={receiverProfile.avatar_url}
                            alt="Receiver"
                            width={36}
                            height={36}
                            className="w-8 h-8 sm:w-9 sm:h-9 rounded-full object-cover ring-2 ring-zinc-100 group-hover:ring-emerald-200 transition-all"
                            unoptimized
                          />
                        ) : (
                          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs font-bold shadow-xs">
                            {receiverProfile?.full_name?.charAt(0).toUpperCase() || 'U'}
                          </div>
                        )}
                        <span className="absolute -bottom-1 -right-1 bg-emerald-600 text-white text-[8px] font-black px-1 rounded-full ring-1 ring-white">
                          RECIBE
                        </span>
                      </div>

                      <div className="min-w-0 flex-1 text-left">
                        <div className="text-xs font-extrabold text-zinc-900 truncate">
                          {receiverProfile?.full_name?.split(' ')[0] || 'Receptor'}
                        </div>
                        <div className="text-[10px] text-zinc-400 font-medium truncate">
                          {receiverProfile?.id === currentProfile?.id ? '(Tú)' : 'Integrante'}
                        </div>
                      </div>

                      <ChevronDown
                        className={`shrink-0 w-3.5 h-3.5 text-zinc-400 transition-transform duration-200 ${
                          isOpen ? 'rotate-180 text-emerald-600' : ''
                        }`}
                      />
                    </div>
                  )}
                />
              </div>
            </div>

            {/* Pending Debt Pill */}
            {totalOwed > 0 ? (
              <div className="mt-2.5 flex items-center justify-center">
                <div className="inline-flex items-center space-x-1.5 bg-emerald-100/70 border border-emerald-200/80 px-2.5 py-0.5 rounded-full text-[11px] font-bold text-emerald-800 shadow-2xs">
                  <Sparkles className="w-3 h-3 text-emerald-600" />
                  <span>Deuda pendiente: {formatCurrency(totalOwed, currency)}</span>
                </div>
              </div>
            ) : (
              <div className="mt-2 text-center text-[10px] text-zinc-400 font-medium">
                Sin deudas calculadas previas
              </div>
            )}
          </div>

          {/* Amount Stage */}
          <div className="bg-white rounded-3xl p-5 border border-zinc-200/90 shadow-xs text-center space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-wider">
                Monto transferido
              </span>
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/60">
                Moneda: {currency}
              </span>
            </div>

            <div className="py-1">
              <FormattedCurrencyInput
                required
                value={amount}
                onChange={(val) => setAmount(val)}
                currency={currency}
                placeholder="0"
                className="bg-transparent text-center text-4xl sm:text-5xl font-black text-zinc-950 focus:outline-none w-full tracking-tight placeholder:text-zinc-200"
              />
            </div>

            {/* Fast Percentage Presets */}
            {totalOwed > 0 && (
              <div className="flex items-center justify-center gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={() => setAmount(totalOwed.toString())}
                  className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${
                    numericAmount === totalOwed
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-zinc-100 hover:bg-zinc-200/80 text-zinc-700'
                  }`}
                >
                  Pagar total (100%)
                </button>
                <button
                  type="button"
                  onClick={() => setAmount((Math.round(totalOwed / 2)).toString())}
                  className="px-3 py-1 rounded-full text-xs font-bold bg-zinc-100 hover:bg-zinc-200/80 text-zinc-700 transition-all"
                >
                  50%
                </button>
                <button
                  type="button"
                  onClick={() => setAmount('')}
                  className="px-2.5 py-1 rounded-full text-xs font-bold text-zinc-400 hover:text-zinc-700 transition-all"
                >
                  Borrar
                </button>
              </div>
            )}
          </div>

          {/* Receiver Instructions Card (If profile has bank / phone data) */}
          {receiverProfile?.payment_instructions && (
            <PaymentInstructionsView instructions={receiverProfile.payment_instructions} />
          )}

          {/* Payment Method / Concept */}
          <div className="space-y-2">
            <label className="text-[11px] font-extrabold uppercase tracking-wider text-zinc-500 block">
              Método o concepto
            </label>
            
            {/* Quick chips */}
            <div className="flex flex-wrap gap-1.5 pb-1">
              {PAYMENT_METHODS.map((method) => {
                const isSelected = notes.toLowerCase().includes(method.label.toLowerCase());
                return (
                  <button
                    key={method.id}
                    type="button"
                    onClick={() => setNotes(method.label)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                      isSelected
                        ? 'bg-zinc-900 text-white shadow-xs'
                        : 'bg-zinc-100 hover:bg-zinc-200/80 text-zinc-700 border border-zinc-200/50'
                    }`}
                  >
                    {method.label}
                  </button>
                );
              })}
            </div>

            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Nota o descripción (ej. Transferencia Nequi)"
              className="w-full px-4 py-3 bg-white border border-zinc-200 rounded-2xl text-sm font-semibold text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all shadow-2xs"
            />
          </div>

          {/* Date & Time Picker */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-extrabold uppercase tracking-wider text-zinc-500 block">
                Fecha y hora del pago
              </label>
              <button
                type="button"
                onClick={() => setShowTimeInput(!showTimeInput)}
                className="text-[11px] font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 cursor-pointer transition-colors"
              >
                <Clock className="w-3.5 h-3.5" />
                <span>{time || 'Ajustar hora'}</span>
              </button>
            </div>

            <div className="relative">
              <input
                type="date"
                value={date}
                onChange={(e) => {
                  const newDate = e.target.value;
                  setDate(newDate);
                  if (!isManualTime) {
                    setTime(getDefaultTimeForDate(newDate));
                  }
                }}
                className="w-full px-4 py-3 bg-white border border-zinc-200 rounded-2xl text-sm font-semibold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all shadow-2xs"
              />
            </div>

            {/* Time Adjustments (Collapsible / Advanced) */}
            {showTimeInput && (
              <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-2xl space-y-2 animate-in fade-in duration-150">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-500 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-emerald-600" />
                    Hora del pago (zona horaria local)
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setTime(getCurrentTimeString());
                        setIsManualTime(true);
                      }}
                      className="px-2.5 py-1 text-[10px] font-bold rounded-lg bg-white border border-zinc-200 text-zinc-700 hover:bg-emerald-50 hover:text-emerald-700 transition shadow-2xs"
                    >
                      Ahora
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTime('00:00');
                        setIsManualTime(true);
                      }}
                      className="px-2.5 py-1 text-[10px] font-bold rounded-lg bg-white border border-zinc-200 text-zinc-700 hover:bg-zinc-100 transition shadow-2xs"
                    >
                      00:00
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    value={time}
                    onChange={(e) => {
                      setTime(e.target.value);
                      setIsManualTime(true);
                    }}
                    className="flex-1 px-3.5 py-2 bg-white border border-zinc-200 rounded-xl text-xs font-bold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 shadow-2xs"
                  />
                  <span className="text-xs text-zinc-500 font-medium shrink-0">
                    {date === getTodayDateString() ? 'Hoy' : 'Día seleccionado'}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Receipt / Proof Upload Section */}
          <div className="space-y-2">
            <label className="text-[11px] font-extrabold uppercase tracking-wider text-zinc-500 block">
              Comprobante de pago (Opcional)
            </label>

            {proofUrl ? (
              <div className="flex items-center justify-between p-3 bg-emerald-50/70 border border-emerald-200/80 rounded-2xl">
                <div className="flex items-center space-x-3 min-w-0">
                  <div className="relative w-12 h-12 rounded-xl overflow-hidden shrink-0 border border-emerald-200">
                    <Image
                      src={proofUrl}
                      alt="Comprobante"
                      fill
                      className="object-cover"
                      unoptimized
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-emerald-950 flex items-center space-x-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Comprobante adjuntado</span>
                    </div>
                    <p className="text-[10px] text-emerald-700/80 truncate">
                      Listo para guardar con la transferencia
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="px-2.5 py-1.5 bg-white text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold hover:bg-emerald-100/50 transition"
                  >
                    Cambiar
                  </button>
                  <button
                    type="button"
                    onClick={() => setProofUrl('')}
                    className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-xl transition"
                    title="Quitar"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                disabled={isUploading}
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center justify-center space-x-2 py-3 px-4 bg-zinc-50/70 hover:bg-zinc-100/80 border border-dashed border-zinc-300 rounded-2xl text-xs font-bold text-zinc-600 hover:text-zinc-900 transition-all shadow-2xs group cursor-pointer"
              >
                {isUploading ? (
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                ) : (
                  <Camera className="w-4 h-4 text-zinc-400 group-hover:text-zinc-600" />
                )}
                <span>{isUploading ? 'Subiendo comprobante...' : 'Subir foto o captura del comprobante'}</span>
              </button>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              className="hidden"
            />
          </div>

          {/* Multi-group Distribution Breakdown Preview */}
          {!isLockedToGroup && distributionPreview.length > 0 && (
            <div className="bg-zinc-50/80 border border-zinc-200/70 rounded-2xl p-4 space-y-2.5">
              <div className="flex items-center space-x-1.5 text-[10px] font-black text-zinc-500 uppercase tracking-wider">
                <Layers className="w-3.5 h-3.5 text-zinc-400" />
                <span>Distribución del pago entre tus grupos:</span>
              </div>
              <div className="space-y-1.5">
                {distributionPreview.map((item, idx) => (
                  <div
                    key={`dist-${idx}`}
                    className="flex items-center justify-between text-xs bg-white p-2.5 rounded-xl border border-zinc-200/60 shadow-2xs"
                  >
                    <div className="font-semibold text-zinc-800">{item.groupName}</div>
                    <div className="font-extrabold text-emerald-700">
                      {formatCurrency(item.allocated, item.currency)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </form>

        {/* Modal Footer */}
        <div className="p-4 sm:px-6 border-t border-zinc-100 bg-zinc-50/90 flex items-center justify-between shrink-0">
          {isEditing ? (
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={isDeleting || isSubmitting}
              className="p-3 rounded-2xl text-rose-500 hover:text-rose-600 hover:bg-rose-50 transition-colors border border-transparent hover:border-rose-200 cursor-pointer"
              title="Eliminar este pago"
            >
              {isDeleting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />}
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-xs font-bold text-zinc-500 hover:text-zinc-800 transition cursor-pointer"
            >
              Cancelar
            </button>
          )}

          <button
            onClick={handleSubmit}
            disabled={isSubmitting || isMutating || isUploading || numericAmount <= 0}
            className="px-6 sm:px-8 py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-extrabold rounded-2xl transition-all shadow-md shadow-emerald-600/20 active:scale-95 flex items-center justify-center space-x-2 disabled:opacity-50 cursor-pointer ml-auto"
          >
            {(isSubmitting || isMutating) ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Check className="w-4 h-4 mr-1.5" />
            )}
            <span>{isEditing ? 'Guardar Cambios' : 'Confirmar Pago'}</span>
          </button>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDelete}
        title="¿Eliminar pago?"
        description="¿Estás seguro de que deseas eliminar este pago? Esta acción restaurará la deuda correspondiente en los balances y no se puede deshacer."
        confirmText="Eliminar pago"
        cancelText="Cancelar"
        variant="danger"
        isLoading={isDeleting}
      />
    </div>
  );
}
