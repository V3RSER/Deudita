'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { Expense, Group, Profile } from '@/lib/types';
import { useExpense } from '@/lib/expense-context';
import { formatCurrency } from '@/lib/balance-utils';
import { getCategoryConfig } from '@/lib/expense-category-utils';
import {
  X,
  Calendar,
  Users,
  Receipt,
  FileText,
  UserCheck,
  Trash2,
  Edit3,
  ExternalLink,
  Loader2,
  CheckCircle2,
} from 'lucide-react';

interface ExpenseDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  expense: Expense | null;
  group?: Group;
  onEditExpense?: (expense: Expense) => void;
}

export function ExpenseDetailModal({
  isOpen,
  onClose,
  expense,
  group,
  onEditExpense,
}: ExpenseDetailModalProps) {
  const { currentProfile, profiles, userGroups, deleteExpense } = useExpense();
  const [isDeleting, setIsDeleting] = useState(false);

  if (!isOpen || !expense) return null;

  const targetGroup = group || userGroups.find((g) => g.id === expense.group_id);
  const paidByProfile = profiles.find((p) => p.id === expense.paid_by);
  const isPaidByMe = currentProfile?.id === expense.paid_by;

  const splits = expense.splits || [];
  const items = expense.items || [];

  // Calculate my personal share
  const mySplit = splits.find((s) => s.user_id === currentProfile?.id);
  const myOwedAmount = mySplit ? mySplit.amount_owed : 0;

  let userStatusText = '';
  let userStatusClass = '';

  if (isPaidByMe) {
    const totalOthersOwe = splits
      .filter((s) => s.user_id !== currentProfile?.id)
      .reduce((acc, curr) => acc + curr.amount_owed, 0);

    if (totalOthersOwe > 0) {
      userStatusText = `Tú pagaste ${formatCurrency(expense.total_amount)} (Recuperas ${formatCurrency(totalOthersOwe)})`;
      userStatusClass = 'bg-emerald-50 text-emerald-800 border border-emerald-200';
    } else {
      userStatusText = `Tú pagaste el total (${formatCurrency(expense.total_amount)})`;
      userStatusClass = 'bg-emerald-50 text-emerald-800 border border-emerald-200';
    }
  } else if (myOwedAmount > 0) {
    userStatusText = `Debes ${formatCurrency(myOwedAmount)} a ${paidByProfile?.full_name ? paidByProfile.full_name.split(' ')[0] : 'al pagador'}`;
    userStatusClass = 'bg-rose-50 text-rose-800 border border-rose-200';
  } else {
    userStatusText = 'No participas en este gasto';
    userStatusClass = 'bg-zinc-100 text-zinc-700 border border-zinc-200';
  }

  const catConfig = getCategoryConfig(expense.category || 'General');
  const IconComponent = catConfig.icon;

  const handleDelete = async () => {
    if (!confirm('¿Estás seguro de que deseas eliminar este gasto?')) return;
    setIsDeleting(true);
    try {
      await deleteExpense(expense.id);
      onClose();
    } catch (err) {
      alert('Error al eliminar el gasto');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-3xl max-w-xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-zinc-100 flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-zinc-100 flex items-start justify-between relative bg-zinc-50/50">
          <div className="flex items-center space-x-4">
            <div className={`w-12 h-12 rounded-2xl ${catConfig.bgClass} ${catConfig.textClass} flex items-center justify-center shrink-0 shadow-sm`}>
              <IconComponent className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                {expense.category || 'General'}
              </span>
              <h2 className="text-xl font-semibold text-zinc-900 tracking-tight leading-snug">
                {expense.description}
              </h2>
              {targetGroup && (
                <p className="text-xs text-zinc-500 font-medium mt-0.5">
                  Grupo: <strong className="text-zinc-700">{targetGroup.name}</strong>
                </p>
              )}
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-200/60 rounded-full transition-all active:scale-95"
            aria-label="Cerrar modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 space-y-6 flex-1">
          {/* Amount Card & Status Banner */}
          <div className="bg-zinc-900 text-white p-6 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-lg">
            <div>
              <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider block">
                Monto Total
              </span>
              <span className="text-3xl font-semibold tracking-tight text-white mt-1 block">
                {formatCurrency(expense.total_amount)}
              </span>
            </div>

            <div className="flex items-center space-x-2 text-xs font-medium text-zinc-300 bg-zinc-800/80 px-3.5 py-1.5 rounded-full ring-1 ring-white/10">
              <Calendar className="w-3.5 h-3.5 text-emerald-400" />
              <span>{new Date(expense.expense_date).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
            </div>
          </div>

          {/* User Status Banner */}
          <div className={`p-4 rounded-2xl flex items-center space-x-3 text-sm font-medium ${userStatusClass}`}>
            <UserCheck className="w-5 h-5 shrink-0" />
            <span>{userStatusText}</span>
          </div>

          {/* Who Paid */}
          <div className="bg-zinc-50 p-4 rounded-2xl border border-zinc-100 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase text-zinc-500 tracking-wider">
              Pagado por
            </span>
            <div className="flex items-center space-x-2.5">
              {paidByProfile?.avatar_url ? (
                <Image
                  src={paidByProfile.avatar_url}
                  alt={paidByProfile.full_name || 'Avatar'}
                  width={28}
                  height={28}
                  className="w-7 h-7 rounded-full object-cover ring-1 ring-zinc-200"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-7 h-7 rounded-full bg-zinc-900 text-white font-bold text-xs flex items-center justify-center">
                  {(paidByProfile?.full_name || 'U').charAt(0).toUpperCase()}
                </div>
              )}
              <span className="text-sm font-semibold text-zinc-900">
                {isPaidByMe ? 'Tú' : (paidByProfile?.full_name || 'Usuario')}
              </span>
            </div>
          </div>

          {/* Splits Breakdown */}
          {splits.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-zinc-900 flex items-center space-x-1.5">
                  <Users className="w-4 h-4 text-zinc-500" />
                  <span>División del Gasto ({splits.length} personas)</span>
                </h3>
              </div>

              <div className="bg-white rounded-2xl border border-zinc-100 divide-y divide-zinc-100 overflow-hidden shadow-sm">
                {splits.map((s) => {
                  const p = profiles.find((prof) => prof.id === s.user_id);
                  const isMe = currentProfile?.id === s.user_id;

                  return (
                    <div key={s.user_id} className="p-3.5 flex items-center justify-between text-sm">
                      <div className="flex items-center space-x-3">
                        {p?.avatar_url ? (
                          <Image
                            src={p.avatar_url}
                            alt={p.full_name || 'Avatar'}
                            width={32}
                            height={32}
                            className="w-8 h-8 rounded-full object-cover ring-1 ring-zinc-200"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-zinc-200 text-zinc-700 font-bold text-xs flex items-center justify-center">
                            {(p?.full_name || 'U').charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <p className="font-semibold text-zinc-900">
                            {isMe ? 'Tú' : (p?.full_name || 'Integrante')}
                          </p>
                          <p className="text-[11px] text-zinc-500">
                            {s.user_id === expense.paid_by ? 'Pagó la cuenta' : 'Debe su parte'}
                          </p>
                        </div>
                      </div>

                      <span className="font-semibold text-zinc-900">
                        {formatCurrency(s.amount_owed)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Itemized Items */}
          {items.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-zinc-900 flex items-center space-x-1.5">
                <Receipt className="w-4 h-4 text-zinc-500" />
                <span>Desglose de Ítems</span>
              </h3>
              <div className="bg-white rounded-2xl border border-zinc-100 divide-y divide-zinc-100 overflow-hidden shadow-sm">
                {items.map((it, idx) => (
                  <div key={idx} className="p-3 flex items-center justify-between text-xs">
                    <span className="text-zinc-700 font-medium">{it.description}</span>
                    <span className="font-semibold text-zinc-900">{formatCurrency(it.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          {expense.notes && (
            <div className="bg-zinc-50 p-4 rounded-2xl border border-zinc-100 space-y-1">
              <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider flex items-center space-x-1">
                <FileText className="w-3.5 h-3.5" />
                <span>Notas</span>
              </p>
              <p className="text-xs text-zinc-700 leading-relaxed">{expense.notes}</p>
            </div>
          )}

          {/* Receipt Attachment */}
          {expense.receipt_url && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-zinc-900">Comprobante Adjunto</p>
              <div className="relative rounded-2xl overflow-hidden border border-zinc-200 bg-zinc-900 aspect-video group">
                <Image
                  src={expense.receipt_url}
                  alt="Comprobante de pago"
                  fill
                  className="object-contain"
                  referrerPolicy="no-referrer"
                />
                <a
                  href={expense.receipt_url}
                  target="_blank"
                  rel="noreferrer"
                  className="absolute bottom-3 right-3 bg-white/90 backdrop-blur-md text-zinc-900 px-3 py-1.5 rounded-full text-xs font-semibold shadow-md flex items-center space-x-1 hover:bg-white transition-all active:scale-95"
                >
                  <span>Ver pantalla completa</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-zinc-50 border-t border-zinc-100 flex items-center justify-between gap-3">
          <button
            onClick={handleDelete}
            disabled={isDeleting}
            className="px-4 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl text-xs font-semibold transition-all flex items-center space-x-1.5 active:scale-95 disabled:opacity-50"
          >
            {isDeleting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
            <span>Eliminar gasto</span>
          </button>

          <div className="flex items-center space-x-2">
            {onEditExpense && (
              <button
                onClick={() => {
                  onClose();
                  onEditExpense(expense);
                }}
                className="px-4 py-2.5 bg-zinc-200 hover:bg-zinc-300 text-zinc-800 rounded-xl text-xs font-semibold transition-all flex items-center space-x-1.5 active:scale-95"
              >
                <Edit3 className="w-4 h-4" />
                <span>Editar</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="px-5 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-semibold transition-all active:scale-95 shadow-sm"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
