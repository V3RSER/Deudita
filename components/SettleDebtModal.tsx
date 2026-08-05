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
  const { currentProfile, groups, profiles, addSettlement } = useExpense();

  const [groupId, setGroupId] = useState<string>(() => {
    if (defaultGroupId) return defaultGroupId;
    if (groups.length > 0) return groups[0].id;
    return '';
  });
  const [payerId, setPayerId] = useState<string>(
    () => (defaultDebtorId ? defaultDebtorId : currentProfile.id)
  );
  const [receiverId, setReceiverId] = useState<string>(() => {
    if (defaultCreditorId) return defaultCreditorId;
    const activeDebtorId = defaultDebtorId ? defaultDebtorId : currentProfile.id;
    const other = profiles.find((p) => p.id !== activeDebtorId);
    return other ? other.id : '';
  });
  const [amount, setAmount] = useState<string>(
    () => (defaultAmount && defaultAmount > 0 ? defaultAmount.toString() : '')
  );
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

    const selectedGroup = groupId ? groupId : (groups.length > 0 ? groups[0].id : '');

    addSettlement({
      group_id: selectedGroup,
      payer_id: payerId,
      receiver_id: receiverId,
      amount: numericAmount,
      date: new Date().toISOString().split('T')[0],
      notes,
    });

    onClose();
  };

  const payerProfile = profiles.find((p) => p.id === payerId);
  const receiverProfile = profiles.find((p) => p.id === receiverId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="bg-slate-900 text-white p-6 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center text-slate-950 font-bold">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Saldar Deuda / Registrar Pago</h2>
              <p className="text-xs text-slate-400">Registra un pago directo entre dos integrantes</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Group */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Grupo
            </label>
            <select
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            >
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>

          {/* Payer & Receiver Visual Pair */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 flex items-center justify-between gap-2">
            <div className="flex-1">
              <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">
                Quien Paga (Deudor)
              </label>
              <select
                value={payerId}
                onChange={(e) => setPayerId(e.target.value)}
                className="w-full p-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
              >
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name}
                  </option>
                ))}
              </select>
            </div>

            <ArrowRight className="w-5 h-5 text-emerald-500 shrink-0 mt-4" />

            <div className="flex-1">
              <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">
                Quien Recibe (Acreedor)
              </label>
              <select
                value={receiverId}
                onChange={(e) => setReceiverId(e.target.value)}
                className="w-full p-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
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
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Monto Pagado ($)
            </label>
            <input
              type="number"
              required
              step="any"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Ej: 25000"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-lg font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Nota / Método de Pago
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ej: Transferencia, Efectivo, MercadoPago"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>

          {/* Submit */}
          <div className="pt-4 border-t border-slate-100 flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-semibold transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold shadow-sm transition"
            >
              Confirmar Pago
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
