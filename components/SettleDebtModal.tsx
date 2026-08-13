'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import React, { useState, useEffect, useRef } from 'react';
import { useExpense } from '@/lib/expense-context';
import { calculatePairwiseBalances, formatCurrency } from '@/lib/balance-utils';
import { PaymentInstructionsView } from '@/components/PaymentInstructionsView';
import { FormattedCurrencyInput } from '@/components/FormattedCurrencyInput';
import { Payment } from '@/lib/types';
import { X, Wallet, ArrowRight, Camera, Loader2, Sparkles, AlertCircle, FileText, Trash2 } from 'lucide-react';
import Image from 'next/image';

interface SettleDebtModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultGroupId?: string;
  defaultDebtorId?: string;
  defaultCreditorId?: string;
  defaultAmount?: number;
  paymentToEdit?: Payment | null;
}

export function SettleDebtModal({
  isOpen,
  onClose,
  defaultGroupId,
  defaultDebtorId,
  defaultCreditorId,
  defaultAmount,
  paymentToEdit,
}: SettleDebtModalProps) {
  const { currentProfile, userGroups, profiles, expenses, payments, addPayment, updatePayment, deletePayment } = useExpense();

  const [groupId, setGroupId] = useState<string>('');
  const [payerId, setPayerId] = useState<string>('');
  const [receiverId, setReceiverId] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [notes, setNotes] = useState<string>('Transferencia bancaria');
  const [proofUrl, setProofUrl] = useState<string>('');
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [prevIsOpen, setPrevIsOpen] = useState(false);

  useEffect(() => {
    if (isOpen && !prevIsOpen) {
      setPrevIsOpen(true);
      setErrorMsg(null);

      if (paymentToEdit) {
        setGroupId(paymentToEdit.group_id);
        setPayerId(paymentToEdit.paid_by);
        setReceiverId(paymentToEdit.paid_to);
        setAmount(paymentToEdit.amount ? paymentToEdit.amount.toString() : '');
        setNotes(paymentToEdit.note ?? '');
        setProofUrl(paymentToEdit.proof_url ?? '');
      } else {
        setProofUrl('');
        const activeGroup = defaultGroupId && userGroups.some((g) => g.id === defaultGroupId) ? defaultGroupId : '';
        setGroupId(activeGroup);

        const activePayer = defaultDebtorId ?? currentProfile?.id ?? profiles[0]?.id ?? '';
        setPayerId(activePayer);

        const activeReceiver = defaultCreditorId ?? profiles.find((p) => p.id !== activePayer)?.id ?? '';
        setReceiverId(activeReceiver);

        setAmount(defaultAmount && defaultAmount > 0 ? defaultAmount.toString() : '');
        setNotes('Transferencia bancaria');
      }
    } else if (!isOpen && prevIsOpen) {
      setPrevIsOpen(false);
    }
  }, [isOpen, prevIsOpen, paymentToEdit, defaultGroupId, userGroups, defaultDebtorId, currentProfile?.id, profiles, defaultCreditorId, defaultAmount]);

  const isEditing = Boolean(paymentToEdit);
  const isLockedToGroup = Boolean(defaultGroupId && defaultGroupId.trim().length > 0) || isEditing;
  const targetGroup = userGroups.find((g) => g.id === groupId);

  // Compute breakdown of group debts between payer and receiver
  const getGroupDebtBreakdown = () => {
    if (!payerId || !receiverId || payerId === receiverId) return [];

    const groupDebts: Array<{ group: typeof userGroups[0]; debt: number }> = [];

    // Filter relevant groups (if locked to a group, only consider that group)
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

  if (!isOpen) return null;

  // Calculate distributed allocation preview
  const numericAmount = parseFloat(amount) || 0;
  const getDistributionPreview = () => {
    if (numericAmount <= 0 || groupDebts.length === 0) return [];

    let remaining = numericAmount;
    const distribution: Array<{ groupName: string; currency: string; allocated: number }> = [];

    // Sort group debts descending
    const sorted = [...groupDebts].sort((a, b) => b.debt - a.debt);

    for (const item of sorted) {
      if (remaining <= 0) break;
      const alloc = Math.min(remaining, item.debt > 0 ? item.debt : remaining);
      distribution.push({
        groupName: item.group.name,
        currency: item.group.currency || 'COP',
        allocated: alloc,
      });
      remaining -= alloc;
    }

    // If remaining amount left and no group allocated all, add remainder to first group
    if (remaining > 0 && distribution.length > 0) {
      distribution[0].allocated += remaining;
    } else if (remaining > 0 && userGroups.length > 0) {
      // If debtor had 0 registered debt, assign to active/first group
      const fallbackGroup = targetGroup || userGroups[0];
      distribution.push({
        groupName: fallbackGroup.name,
        currency: fallbackGroup.currency || 'COP',
        allocated: remaining,
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
      const paymentDate = isEditing && paymentToEdit ? (paymentToEdit.payment_date || new Date().toISOString().split('T')[0]) : new Date().toISOString().split('T')[0];

      if (isEditing && paymentToEdit) {
        await updatePayment(paymentToEdit.id, {
          group_id: groupId || paymentToEdit.group_id,
          paid_by: payerId,
          paid_to: receiverId,
          amount: numericAmount,
          payment_date: paymentDate,
          note: notes,
          proof_url: proofUrl || undefined,
        });
      } else if (isLockedToGroup && groupId) {
        // Single group payment
        await addPayment({
          group_id: groupId,
          paid_by: payerId,
          paid_to: receiverId,
          amount: numericAmount,
          payment_date: paymentDate,
          note: notes,
          proof_url: proofUrl || undefined,
        });
      } else {
        // Multi-group distributed payment from consolidated balances view
        let remainingToPay = numericAmount;
        const sortedDebts = [...groupDebts].sort((a, b) => b.debt - a.debt);

        if (sortedDebts.length > 0) {
          for (const item of sortedDebts) {
            if (remainingToPay <= 0) break;
            const payForThisGroup = item.debt > 0 ? Math.min(remainingToPay, item.debt) : remainingToPay;

            await addPayment({
              group_id: item.group.id,
              paid_by: payerId,
              paid_to: receiverId,
              amount: payForThisGroup,
              payment_date: paymentDate,
              note: notes ? notes : 'Abono distribuido',
              proof_url: proofUrl || undefined,
            });

            remainingToPay -= payForThisGroup;
          }
        }

        // If leftover or no prior registered debt, assign remaining to first available group
        if (remainingToPay > 0 && userGroups.length > 0) {
          const targetG = sortedDebts[0]?.group || userGroups[0];
          await addPayment({
            group_id: targetG.id,
            paid_by: payerId,
            paid_to: receiverId,
            amount: remainingToPay,
            payment_date: paymentDate,
            note: notes ? notes : 'Abono extra',
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
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al eliminar el pago';
      setErrorMsg(msg);
    } finally {
      setIsDeleting(false);
    }
  };

  const payerProfile = profiles.find((p) => p.id === payerId);
  const receiverProfile = profiles.find((p) => p.id === receiverId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-zinc-950/40 backdrop-blur-md overflow-y-auto">
      <div className="bg-white rounded-[24px] shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100">
          <div className="flex items-center space-x-3">
            <button onClick={onClose} className="p-2 -ml-2 rounded-full hover:bg-zinc-100 text-zinc-500 transition">
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-lg font-bold text-zinc-900 tracking-tight">
              {isEditing ? 'Editar pago' : 'Registrar pago'}
            </h2>
          </div>
        </div>

        {/* Error Banner */}
        {errorMsg && (
          <div className="bg-rose-50 px-6 py-3 border-b border-rose-100 flex items-center text-sm font-medium text-rose-700">
            <AlertCircle className="w-4 h-4 mr-2 shrink-0" /> {errorMsg}
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* Amount Hero */}
          <div className="text-center py-2">
            <p className="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-2">Monto a pagar</p>
            <div className="flex items-center justify-center text-5xl font-black text-zinc-900">
              <FormattedCurrencyInput
                required
                value={amount}
                onChange={(val) => setAmount(val)}
                currency={targetGroup?.currency || 'COP'}
                placeholder="0"
                className="bg-transparent text-center focus:outline-none w-full max-w-[250px] placeholder:text-zinc-200"
                autoFocus
              />
            </div>
          </div>

          {/* Payer & Receiver Pair with Avatars */}
          <div className="flex items-center justify-between bg-zinc-50 p-2 rounded-2xl border border-zinc-100 relative shadow-inner">
            {/* Payer */}
            <div className="flex-1 relative bg-white border border-zinc-200 rounded-xl flex items-center p-2 sm:px-3 sm:py-2.5 shadow-sm overflow-hidden group">
              {payerProfile?.avatar_url ? (
                <Image src={payerProfile.avatar_url} alt="Payer" width={32} height={32} className="w-8 h-8 rounded-full object-cover shrink-0" unoptimized />
              ) : (
                <div className="w-8 h-8 rounded-full bg-zinc-800 text-white flex items-center justify-center text-xs font-bold shrink-0">
                  {payerProfile?.full_name?.charAt(0).toUpperCase() || 'U'}
                </div>
              )}
              <div className="ml-2.5 overflow-hidden flex-1">
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Quien paga</p>
                <p className="text-sm font-bold text-zinc-900 truncate">
                  {payerProfile?.full_name?.split(' ')[0] || payerProfile?.email}
                </p>
              </div>
              <select
                value={payerId}
                onChange={(e) => setPayerId(e.target.value)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              >
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name}
                  </option>
                ))}
              </select>
            </div>

            {/* Arrow */}
            <div className="w-8 flex justify-center shrink-0 z-10 mx-1">
              <div className="bg-white border border-zinc-200 p-1.5 rounded-full shadow-sm text-zinc-400">
                <ArrowRight className="w-4 h-4" />
              </div>
            </div>

            {/* Receiver */}
            <div className="flex-1 relative bg-white border border-zinc-200 rounded-xl flex items-center p-2 sm:px-3 sm:py-2.5 shadow-sm overflow-hidden group">
              {receiverProfile?.avatar_url ? (
                <Image src={receiverProfile.avatar_url} alt="Receiver" width={32} height={32} className="w-8 h-8 rounded-full object-cover shrink-0" unoptimized />
              ) : (
                <div className="w-8 h-8 rounded-full bg-zinc-800 text-white flex items-center justify-center text-xs font-bold shrink-0">
                  {receiverProfile?.full_name?.charAt(0).toUpperCase() || 'U'}
                </div>
              )}
              <div className="ml-2.5 overflow-hidden flex-1">
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Recibe</p>
                <p className="text-sm font-bold text-zinc-900 truncate">
                  {receiverProfile?.full_name?.split(' ')[0] || receiverProfile?.email}
                </p>
              </div>
              <select
                value={receiverId}
                onChange={(e) => setReceiverId(e.target.value)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              >
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Receiver Payment Instructions Card */}
          {receiverProfile?.payment_instructions && (
            <PaymentInstructionsView instructions={receiverProfile.payment_instructions} />
          )}

          {/* Details / Notes / File */}
          <div className="space-y-4 pt-2">
            <div>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Notas (Ej. Transferencia Bancolombia)"
                className="w-full px-4 py-3 bg-white border border-zinc-200 rounded-xl text-sm font-semibold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all shadow-sm"
              />
            </div>
            
            <div className="flex gap-2">
               <button
                type="button"
                disabled={isUploading}
                onClick={() => fileInputRef.current?.click()}
                className={`flex-1 flex items-center justify-center space-x-2 py-3 border rounded-xl text-sm font-semibold transition-all shadow-sm ${proofUrl ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50'}`}
              >
                {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                <span>{proofUrl ? 'Cambiar comprobante' : 'Adjuntar comprobante'}</span>
              </button>
              {proofUrl && (
                <button
                  type="button"
                  onClick={() => setProofUrl('')}
                  className="px-4 py-3 bg-white border border-zinc-200 text-rose-600 hover:bg-rose-50 rounded-xl text-sm font-semibold shadow-sm transition-all"
                >
                  Quitar
                </button>
              )}
            </div>
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
            <div className="bg-zinc-50 border border-zinc-100 rounded-2xl p-4 space-y-2">
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                Distribución estimada por grupo:
              </p>
              <div className="space-y-1.5">
                {distributionPreview.map((item, idx) => (
                  <div key={`dist-${idx}`} className="flex items-center justify-between text-xs">
                    <span className="text-zinc-700 font-medium">{item.groupName}</span>
                    <span className="font-bold text-emerald-700">
                      {formatCurrency(item.allocated, item.currency)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </form>

        {/* Footer Actions */}
        <div className="p-5 sm:px-6 border-t border-zinc-100 bg-zinc-50/80 flex items-center justify-between rounded-b-[24px]">
          {isEditing ? (
             <button
              type="button"
              onClick={handleDelete}
              disabled={isDeleting || isSubmitting}
              className="p-3 rounded-xl text-rose-500 hover:text-rose-600 hover:bg-rose-50 transition-colors"
            >
              {isDeleting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />}
            </button>
          ) : <div />}

          <button
            onClick={handleSubmit}
            disabled={isSubmitting || isUploading || numericAmount <= 0}
            className="w-full sm:w-auto px-8 py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl transition-all shadow-md active:scale-95 flex items-center justify-center disabled:opacity-50 cursor-pointer ml-auto"
          >
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            <span>{isEditing ? 'Guardar Cambios' : 'Confirmar Pago'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
