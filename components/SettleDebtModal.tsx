'use client';

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

  if (!isOpen) return null;

  const isEditing = Boolean(paymentToEdit);
  const isLockedToGroup = Boolean(defaultGroupId && defaultGroupId.trim().length > 0) || isEditing;

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
  const targetGroup = userGroups.find((g) => g.id === groupId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/70 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white rounded-[2.5rem] ring-1 ring-zinc-200 shadow-2xl w-full max-w-lg my-8 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="bg-zinc-900 text-white p-6 sm:p-8 flex items-center justify-between">
          <div className="flex items-center space-x-3.5">
            <div className="w-12 h-12 rounded-2xl bg-zinc-800 ring-1 ring-zinc-700 flex items-center justify-center text-emerald-400 font-bold shrink-0">
              <Wallet className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight text-white">
                {isEditing ? 'Editar Pago' : 'Registrar Pago'}
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                {isEditing ? 'Modifica los datos del pago' : isLockedToGroup ? 'Registrando pago en el grupo' : 'Pago distribuido entre grupos'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-6 max-h-[80vh] overflow-y-auto">
          {errorMsg && (
            <div className="p-4 bg-rose-50 text-rose-700 border border-rose-200 rounded-2xl text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Group Context Selection or Locked View */}
          <div>
            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">
              Grupo de Destino
            </label>
            {isLockedToGroup ? (
              <div className="w-full px-4 py-3 bg-zinc-100 border border-zinc-200 rounded-2xl text-sm font-semibold text-zinc-900 flex items-center justify-between">
                <span>{targetGroup ? targetGroup.name : 'Grupo Seleccionado'}</span>
                <span className="text-xs bg-zinc-900 text-white px-2.5 py-0.5 rounded-md font-mono">
                  {targetGroup?.currency || 'COP'}
                </span>
              </div>
            ) : (
              <div className="p-4 bg-emerald-50/70 border border-emerald-200/80 rounded-2xl text-xs text-emerald-900 space-y-1">
                <p className="font-bold flex items-center space-x-1.5">
                  <Sparkles className="w-4 h-4 text-emerald-600" />
                  <span>Repartición Automática Multi-Grupo</span>
                </p>
                <p className="text-emerald-800 leading-relaxed">
                  Al saldar desde saldos globales, el pago se distribuirá de forma automática cubriendo primero los grupos con mayor deuda con esta persona.
                </p>
              </div>
            )}
          </div>

          {/* Payer & Receiver Pair */}
          <div className="bg-zinc-50 p-5 rounded-2xl ring-1 ring-zinc-200 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="w-full sm:flex-1">
              <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5">
                Quien Paga
              </label>
              <select
                value={payerId}
                onChange={(e) => setPayerId(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-white border-none ring-1 ring-zinc-200 rounded-xl text-xs font-semibold text-zinc-900 focus:ring-2 focus:ring-zinc-900"
              >
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name}
                  </option>
                ))}
              </select>
            </div>

            <ArrowRight className="w-5 h-5 text-zinc-400 shrink-0 hidden sm:block mt-5" />

            <div className="w-full sm:flex-1">
              <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5">
                Quien Recibe
              </label>
              <select
                value={receiverId}
                onChange={(e) => setReceiverId(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-white border-none ring-1 ring-zinc-200 rounded-xl text-xs font-semibold text-zinc-900 focus:ring-2 focus:ring-zinc-900"
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

          {/* Total Owed Information */}
          {totalOwed > 0 && (
            <div className="flex items-center justify-between text-xs px-1">
              <span className="text-zinc-500 font-medium">Deuda total calculada:</span>
              <span className="font-bold text-rose-600 bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200">
                {formatCurrency(totalOwed, targetGroup?.currency || 'COP')}
              </span>
            </div>
          )}

          {/* Amount Input with Formatted Currency */}
          <div className="space-y-1.5">
            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
              Monto
            </label>
            <FormattedCurrencyInput
              required
              value={amount}
              onChange={(val) => setAmount(val)}
              currency={targetGroup?.currency || 'COP'}
              placeholder="0"
              className="w-full px-4 py-3 bg-zinc-50 border-none ring-1 ring-zinc-200 rounded-2xl text-xl font-bold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900 transition-all placeholder:text-zinc-400 placeholder:font-normal"
            />
          </div>

          {/* Multi-group Distribution Breakdown Preview */}
          {!isLockedToGroup && distributionPreview.length > 0 && (
            <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-4 space-y-2">
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                Distribución estimada del pago por grupo:
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

          {/* Notes Input */}
          <div className="space-y-1.5">
            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
              Nota
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ej: Nequi, Transferencia Bancolombia"
              className="w-full px-4 py-3 bg-zinc-50 border-none ring-1 ring-zinc-200 rounded-2xl text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900 transition-all placeholder:text-zinc-400"
            />
          </div>

          {/* Payment Proof / Screenshot Attachment */}
          <div className="space-y-2">
            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
              Comprobante de pago
            </label>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              className="hidden"
            />

            {proofUrl ? (
              <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 p-3 rounded-2xl">
                <div className="flex items-center space-x-3">
                  <div className="relative w-12 h-12 rounded-xl overflow-hidden bg-white border border-emerald-300 shrink-0">
                    <Image
                      src={proofUrl}
                      alt="Comprobante"
                      fill
                      className="object-cover"
                      unoptimized
                      referrerPolicy="no-referrer"
                    />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-emerald-900">Comprobante adjuntado</p>
                    <p className="text-[11px] text-emerald-700">Listo para guardarse con el pago</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setProofUrl('')}
                  className="text-xs font-semibold text-rose-600 hover:text-rose-700 underline"
                >
                  Quitar
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={isUploading}
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-3 px-4 bg-zinc-50 hover:bg-zinc-100 border border-dashed border-zinc-200 rounded-2xl text-xs font-semibold text-zinc-700 flex items-center justify-center space-x-2 transition-all active:scale-98"
              >
                {isUploading ? (
                  <Loader2 className="w-4 h-4 animate-spin text-zinc-600" />
                ) : (
                  <Camera className="w-4 h-4 text-zinc-500" />
                )}
                <span>{isUploading ? 'Subiendo comprobante...' : 'Adjuntar comprobante'}</span>
              </button>
            )}
          </div>

          {/* Submit Actions */}
          <div className="pt-4 border-t border-zinc-100 flex items-center justify-between">
            {isEditing ? (
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting || isSubmitting}
                className="px-4 py-2.5 rounded-full text-rose-600 hover:bg-rose-50 border border-rose-200 text-xs font-semibold transition active:scale-95 flex items-center space-x-1.5"
              >
                {isDeleting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                <span>Eliminar Pago</span>
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center space-x-3">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 rounded-full ring-1 ring-zinc-200 text-zinc-600 hover:bg-zinc-50 text-xs font-semibold transition active:scale-95"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSubmitting || isUploading || numericAmount <= 0}
                className="px-6 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-full text-xs font-semibold shadow-md transition-all active:scale-95 disabled:opacity-50 flex items-center space-x-2"
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                ) : (
                  <>
                    <Wallet className="w-4 h-4 text-emerald-400" />
                    <span>{isEditing ? 'Guardar Cambios' : 'Confirmar Pago'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
