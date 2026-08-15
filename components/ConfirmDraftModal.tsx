'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import React, { useState, useEffect, useRef } from 'react';
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
  const { currentProfile, userGroups, members, profiles, confirmDraft } = useExpense();

  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [paidBy, setPaidBy] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const prevIsOpenRef = useRef(false);
  const prevDraftIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isOpen || !draft) {
      prevIsOpenRef.current = false;
      prevDraftIdRef.current = null;
      return;
    }

    const isOpening = !prevIsOpenRef.current;
    const isDraftChanged = draft.id !== prevDraftIdRef.current;

    if (isOpening || isDraftChanged) {
      prevIsOpenRef.current = true;
      prevDraftIdRef.current = draft.id;
      setErrorMsg(null);
      setIsSubmitting(false);

      const initialGroupId = userGroups.length > 0 ? userGroups[0].id : '';
      setSelectedGroupId(initialGroupId);

      const groupMembers = members.filter((m) => m.group_id === initialGroupId);
      const groupProfiles = groupMembers
        .map((m) => profiles.find((p) => p.id === m.user_id))
        .filter((p): p is NonNullable<typeof p> => p !== undefined);

      if (groupProfiles.length > 0) {
        const inGroup = currentProfile && groupProfiles.some((p) => p.id === currentProfile.id);
        setPaidBy(inGroup && currentProfile ? currentProfile.id : groupProfiles[0].id);
      } else {
        setPaidBy(currentProfile?.id ?? '');
      }
    }
  }, [isOpen, draft, userGroups, members, profiles, currentProfile]);

  // Update paidBy when selectedGroupId changes
  useEffect(() => {
    if (!isOpen) return;
    const groupMembers = members.filter((m) => m.group_id === selectedGroupId);
    const groupProfiles = groupMembers
      .map((m) => profiles.find((p) => p.id === m.user_id))
      .filter((p): p is NonNullable<typeof p> => p !== undefined);

    if (groupProfiles.length > 0) {
      if (!groupProfiles.some((p) => p.id === paidBy)) {
        const inGroup = currentProfile && groupProfiles.some((p) => p.id === currentProfile.id);
        setPaidBy(inGroup && currentProfile ? currentProfile.id : groupProfiles[0].id);
      }
    }
  }, [selectedGroupId, members, profiles, currentProfile, isOpen, paidBy]);

  if (!isOpen || !draft) return null;

  const groupMembers = members.filter((m) => m.group_id === selectedGroupId);
  const memberProfiles = groupMembers
    .map((m) => profiles.find((p) => p.id === m.user_id))
    .filter((p): p is NonNullable<typeof p> => p !== undefined);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    setErrorMsg(null);

    if (!selectedGroupId) {
      setErrorMsg('Selecciona un grupo para asignar el gasto');
      return;
    }

    if (memberProfiles.length === 0) {
      setErrorMsg('El grupo seleccionado no tiene integrantes');
      return;
    }

    setIsSubmitting(true);
    try {
      // Default equal split among selected group members
      const share = draft.detected_amount / memberProfiles.length;
      const splits: ExpenseSplit[] = memberProfiles.map((p) => ({
        id: '',
        expense_id: '',
        user_id: p.id,
        amount_owed: Math.round(share * 100) / 100,
        created_at: new Date().toISOString(),
      }));

      await confirmDraft(draft.id, selectedGroupId, paidBy, splits);
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error al confirmar borrador');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/70 backdrop-blur-sm">
      <div className="bg-white rounded-[2rem] ring-1 ring-zinc-200 shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="bg-zinc-900 text-white p-8 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 rounded-2xl bg-zinc-800 ring-1 ring-zinc-700 flex items-center justify-center text-zinc-100 font-bold">
              <MailCheck className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-zinc-50">Confirmar y Asignar Borrador</h2>
              <p className="text-sm text-zinc-400 mt-1">Gasto detectado automáticamente</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Draft Details Box */}
        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          <div className="bg-amber-50/50 p-5 rounded-2xl ring-1 ring-amber-200 space-y-2">
            <div className="flex justify-between items-center text-xs font-bold text-amber-900 uppercase tracking-widest">
              <span>{draft.detected_merchant}</span>
              <span className="text-sm font-extrabold text-amber-600">
                {formatCurrency(draft.detected_amount)}
              </span>
            </div>
            <p className="text-sm text-zinc-600 line-clamp-2 mt-2 leading-relaxed">&quot;{draft.raw_snippet}&quot;</p>
            <p className="text-[10px] text-zinc-400 uppercase tracking-widest mt-1">Fecha detectada: {draft.detected_date}</p>
          </div>

          {/* Group selection */}
          <div>
            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">
              Asignar al Grupo
            </label>
            <select
              value={selectedGroupId}
              onChange={(e) => setSelectedGroupId(e.target.value)}
              className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 hover:bg-zinc-100/80 hover:border-zinc-300 rounded-xl text-sm font-semibold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900 transition-all cursor-pointer"
            >
              {userGroups.map((g, idx) => (
                <option key={g.id || `dg-${idx}`} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
          
          {/* Paid by selection */}
          <div>
            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">
              ¿Quién pagó?
            </label>
            <select
              value={paidBy}
              onChange={(e) => setPaidBy(e.target.value)}
              className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 hover:bg-zinc-100/80 hover:border-zinc-300 rounded-xl text-sm font-semibold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900 transition-all cursor-pointer"
            >
              {memberProfiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </select>
          </div>

          <div className="bg-zinc-50 p-4 rounded-2xl ring-1 ring-zinc-200 text-sm text-zinc-600">
            Se dividirá en partes iguales entre los{' '}
            <strong className="text-zinc-900">{memberProfiles.length} integrantes</strong> del grupo seleccionado.
          </div>

          {/* Submit */}
          <div className="pt-6 border-t border-zinc-100 flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-full ring-1 ring-zinc-200 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 text-sm font-medium transition-all duration-200 active:scale-95"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2.5 rounded-full bg-zinc-900 hover:bg-zinc-800 text-white text-sm font-medium shadow-sm hover:shadow-md transition-all duration-200 active:scale-95 flex items-center space-x-2 disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isSubmitting ? 'Confirmando...' : 'Confirmar Gasto'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
