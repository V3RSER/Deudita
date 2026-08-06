'use client';

import React, { useState, useEffect } from 'react';
import { useExpense } from '@/lib/expense-context';
import { formatCurrency } from '@/lib/balance-utils';
import { X, Wallet, CheckCircle2, ArrowRight } from 'lucide-react';

interface SettleDebtModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultGroupId?: string;
  defaultDebtorId?: string;
  defaultCreditorId?: string;
  defaultAmount?: number;
}

export function SettleDebtModal({
  isOpen,
  onClose,
  defaultGroupId,
  defaultDebtorId,
  defaultCreditorId,
  defaultAmount,
}: SettleDebtModalProps) {
  const { currentProfile, userGroups, profiles, addPayment } = useExpense();

  const [groupId, setGroupId] = useState<string>(() => {
    if (defaultGroupId && userGroups.some((g) => g.id === defaultGroupId)) return defaultGroupId;
    if (userGroups.length > 0) return userGroups[0].id;
    return '';
  });

  const [payerId, setPayerId] = useState<string>(() => {
    if (defaultDebtorId) return defaultDebtorId;
    if (currentProfile?.id) return currentProfile.id;
    if (profiles.length > 0) return profiles[0].id;
    return '';
  });

  const [receiverId, setReceiverId] = useState<string>(() => {
    if (defaultCreditorId) return defaultCreditorId;
    const activePayer = defaultDebtorId || currentProfile?.id || profiles[0]?.id || '';
    const other = profiles.find((p) => p.id !== activePayer);
    return other ? other.id : '';
  });

  const [amount, setAmount] = useState<string>(() => {
    return defaultAmount && defaultAmount > 0 ? defaultAmount.toString() : '';
  });

  const [notes, setNotes] = useState<string>('Transferencia bancaria');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      alert('Ingresa un monto válido');
      return;
    }

    if (payerId === receiverId) {
      alert('El pagador y el receptor deben ser personas distintas');
      return;
    }

    const selectedGroup = groupId ? groupId : (userGroups.length > 0 ? userGroups[0].id : '');

    addPayment({
      group_id: selectedGroup,
      paid_by: payerId,
      paid_to: receiverId,
      amount: numericAmount,
      payment_date: new Date().toISOString().split('T')[0],
      note: notes,
    });

    onClose();
  };

  const payerProfile = profiles.find((p) => p.id === payerId);
  const receiverProfile = profiles.find((p) => p.id === receiverId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/70 backdrop-blur-sm">
      <div className="bg-white rounded-[2rem] ring-1 ring-zinc-200 shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="bg-zinc-900 text-white p-8 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 rounded-2xl bg-zinc-800 ring-1 ring-zinc-700 flex items-center justify-center text-zinc-100 font-bold">
              <Wallet className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-zinc-50">Saldar Deuda / Registrar Pago</h2>
              <p className="text-sm text-zinc-400 mt-1">Registra un pago directo entre dos integrantes</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          {/* Group */}
          <div>
            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">
              Grupo
            </label>
            <select
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              className="w-full px-4 py-3 bg-zinc-50 border-none ring-1 ring-zinc-200 rounded-xl text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900 transition-all"
            >
              {userGroups.map((g, idx) => (
                <option key={g.id || `sg-${idx}`} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>

          {/* Payer & Receiver Visual Pair */}
          <div className="bg-zinc-50 p-5 rounded-2xl ring-1 ring-zinc-200 flex items-center justify-between gap-3">
            <div className="flex-1">
              <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">
                Quien Paga (Deudor)
              </label>
              <select
                value={payerId}
                onChange={(e) => setPayerId(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border-none ring-1 ring-zinc-200 rounded-xl text-sm font-medium text-zinc-900 focus:ring-2 focus:ring-zinc-900"
              >
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name}
                  </option>
                ))}
              </select>
            </div>

            <ArrowRight className="w-5 h-5 text-zinc-400 shrink-0 mt-6" />

            <div className="flex-1">
              <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">
                Quien Recibe (Acreedor)
              </label>
              <select
                value={receiverId}
                onChange={(e) => setReceiverId(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border-none ring-1 ring-zinc-200 rounded-xl text-sm font-medium text-zinc-900 focus:ring-2 focus:ring-zinc-900"
              >
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Amount & Method */}
          <div>
            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">
              Monto Pagado ($)
            </label>
            <input
              type="number"
              required
              step="any"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Ej: 25000"
              className="w-full px-4 py-3 bg-zinc-50 border-none ring-1 ring-zinc-200 rounded-xl text-xl font-bold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900 transition-all placeholder:text-zinc-400 placeholder:font-normal"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">
              Nota / Método de Pago
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ej: Transferencia, Efectivo, MercadoPago"
              className="w-full px-4 py-3 bg-zinc-50 border-none ring-1 ring-zinc-200 rounded-xl text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900 transition-all placeholder:text-zinc-400"
            />
          </div>

          {/* Submit */}
          <div className="pt-6 border-t border-zinc-100 flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-full ring-1 ring-zinc-200 text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 text-sm font-medium transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 rounded-full bg-zinc-900 hover:bg-zinc-800 text-white text-sm font-medium shadow-sm transition-all active:scale-95"
            >
              Confirmar Pago
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
