'use client';

import React, { useState, useEffect } from 'react';
import { useExpense } from '@/lib/expense-context';
import { ExpenseDraft, ExpenseSplit } from '@/lib/types';
import { formatCurrency } from '@/lib/balance-utils';
import { X, MailCheck, CheckCircle2 } from 'lucide-react';

interface ConfirmDraftModalProps {
  isOpen: boolean;
  onClose: () => void;
  draft: ExpenseDraft | null;
}

export function ConfirmDraftModal({
  isOpen,
  onClose,
  draft,
}: ConfirmDraftModalProps) {
  const { currentProfile, groups, members, profiles, confirmDraft } = useExpense();

  const [selectedGroupId, setSelectedGroupId] = useState<string>(() => {
    if (groups.length > 0) return groups[0].id;
    return '';
  });
  const [paidBy, setPaidBy] = useState<string>(currentProfile.id);

  if (!isOpen || !draft) return null;

  const groupMembers = members.filter((m) => m.group_id === selectedGroupId);
  const memberProfiles = groupMembers
    .map((m) => profiles.find((p) => p.id === m.user_id))
    .filter((p): p is NonNullable<typeof p> => p !== undefined);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedGroupId) {
      alert('Selecciona un grupo para asignar el gasto');
      return;
    }

    if (memberProfiles.length === 0) {
      alert('El grupo seleccionado no tiene integrantes');
      return;
    }

    // Default equal split among selected group members
    const share = draft.detected_amount / memberProfiles.length;
    const splits: ExpenseSplit[] = memberProfiles.map((p) => ({
      id: '',
      expense_id: '',
      user_id: p.id,
      amount_owed: Math.round(share * 100) / 100,
      created_at: new Date().toISOString(),
    }));

    confirmDraft(draft.id, selectedGroupId, paidBy, splits);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="bg-slate-900 text-white p-6 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center text-slate-950 font-bold">
              <MailCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Confirmar y Asignar Borrador</h2>
              <p className="text-xs text-slate-400">Gasto detectado por e-mail o scanner AI</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Draft Details Box */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="bg-amber-50/60 p-4 rounded-2xl border border-amber-200/80 space-y-2">
            <div className="flex justify-between items-center text-xs font-bold text-amber-900">
              <span>{draft.detected_merchant}</span>
              <span className="text-sm font-extrabold text-emerald-700">
                {formatCurrency(draft.detected_amount)}
              </span>
            </div>
            <p className="text-xs text-slate-600 line-clamp-2">&quot;{draft.raw_snippet}&quot;</p>
            <p className="text-[11px] text-slate-400">Fecha detectada: {draft.detected_date}</p>
          </div>

          {/* Group selection */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Asignar al Grupo
            </label>
            <select
              value={selectedGroupId}
              onChange={(e) => setSelectedGroupId(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            >
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>

          {/* Paid by selection */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              ¿Quién Pagó el Comprobante?
            </label>
            <select
              value={paidBy}
              onChange={(e) => setPaidBy(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            >
              {memberProfiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name} {p.id === currentProfile.id ? '(Tú)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs text-slate-600">
            Se dividirá en partes iguales entre los{' '}
            <strong>{memberProfiles.length} integrantes</strong> del grupo seleccionado.
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
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold shadow-sm transition flex items-center space-x-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Confirmar y Agregar Gasto</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
