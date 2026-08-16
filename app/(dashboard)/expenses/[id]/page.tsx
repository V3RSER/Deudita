'use client';

import React, { useEffect, useState, use } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useExpense } from '@/lib/expense-context';
import { Expense } from '@/lib/types';
import { formatCurrency } from '@/lib/balance-utils';
import { getCategoryConfig } from '@/lib/expense-category-utils';
import { NewExpenseModal } from '@/components/NewExpenseModal';
import { ConfirmModal } from '@/components/ConfirmModal';
import {
  ArrowLeft,
  Calendar,
  UserCheck,
  Trash2,
  Edit3,
  Receipt,
  FileText,
  Users,
  Loader2,
  AlertCircle,
  ExternalLink,
  History,
  ListChecks,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

export default function ExpenseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { currentProfile, expenses, userGroups, profiles, deleteExpense, auditLogs: allAuditLogs } = useExpense();

  const [expense, setExpense] = useState<Expense | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [expandedParticipants, setExpandedParticipants] = useState<string[]>([]);

  useEffect(() => {
    let isMounted = true;
    async function loadExpense() {
      const foundInContext = expenses.find((e) => e.id === id);
      if (foundInContext && isMounted) {
        setExpense(foundInContext);
        setExpandedParticipants((foundInContext.splits ?? []).map((s) => s.user_id));
        setLoading(false);
      }

      try {
        if (!foundInContext && isMounted) setLoading(true);
        const res = await fetch(`/api/expenses/${id}`);
        if (res.ok) {
          const data = await res.json();
          if (isMounted) {
            setExpense(data);
            setExpandedParticipants((data.splits ?? []).map((s: any) => s.user_id));
          }
        } else if (!foundInContext) {
          throw new Error('Gasto no encontrado');
        }
      } catch (err: unknown) {
        if (isMounted && !foundInContext) {
          setError(err instanceof Error ? err.message : 'Error al cargar el gasto');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    void loadExpense();

    return () => {
      isMounted = false;
    };
  }, [id, expenses]);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center space-y-3">
        <Loader2 className="w-8 h-8 text-zinc-400 animate-spin" />
        <p className="text-sm text-zinc-500 font-medium">Cargando detalles del gasto...</p>
      </div>
    );
  }

  if (error || !expense) {
    return (
      <div className="max-w-3xl mx-auto py-12 px-4">
        <div className="bg-white p-8 rounded-3xl ring-1 ring-zinc-200 text-center space-y-4 shadow-sm">
          <AlertCircle className="w-12 h-12 text-amber-500 mx-auto" />
          <h2 className="text-xl font-bold text-zinc-900">Gasto no encontrado</h2>
          <p className="text-sm text-zinc-500">
            El gasto solicitado no existe o fue eliminado previamente.
          </p>
          <button
            onClick={() => router.back()}
            className="px-5 py-2.5 bg-zinc-900 text-white rounded-xl text-sm font-semibold hover:bg-zinc-800 transition-all inline-flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Volver</span>
          </button>
        </div>
      </div>
    );
  }

  const group = userGroups.find((g) => g.id === expense.group_id);
  const currency = group?.currency ?? currentProfile?.currency ?? 'COP';
  const paidByProfile = profiles.find((p) => p.id === expense.paid_by);
  const isPaidByMe = currentProfile?.id === expense.paid_by;

  const splits = expense.splits ?? [];
  const items = expense.items ?? [];

  const toFraction = (decimal: number) => {
    if (Number.isInteger(decimal)) return decimal.toString();
    const fractions = [
      { num: 1, den: 2, char: '½' },
      { num: 1, den: 3, char: '⅓' },
      { num: 2, den: 3, char: '⅔' },
      { num: 1, den: 4, char: '¼' },
      { num: 3, den: 4, char: '¾' },
      { num: 1, den: 5, char: '⅕' },
      { num: 2, den: 5, char: '⅖' },
      { num: 3, den: 5, char: '⅗' },
      { num: 4, den: 5, char: '⅘' },
      { num: 1, den: 6, char: '⅙' },
      { num: 5, den: 6, char: '⅚' },
      { num: 1, den: 8, char: '⅛' },
      { num: 3, den: 8, char: '⅜' },
      { num: 5, den: 8, char: '⅝' },
      { num: 7, den: 8, char: '⅞' },
    ];
    const whole = Math.floor(decimal);
    const frac = decimal - whole;
    for (const f of fractions) {
      if (Math.abs(frac - (f.num / f.den)) < 0.05) {
        return (
          <span className="inline-flex items-baseline">
            {whole > 0 && <span className="mr-0.5">{whole}</span>}
            <span className="text-[15px] leading-none">{f.char}</span>
          </span>
        );
      }
    }
    return Number(decimal.toFixed(2)).toString();
  };

  const getParticipantItemBreakdown = (splitAmount: number) => {
    if (items.length === 0) return [];

    const totalExpenseAmount = expense.total_amount > 0 ? expense.total_amount : items.reduce((acc, i) => acc + i.amount, 0);
    const ratio = totalExpenseAmount > 0 ? (splitAmount / totalExpenseAmount) : (1 / Math.max(1, splits.length));

    return items.map((item) => {
      const qtyMatch = item.description?.match(/^(\d+(?:\.\d+)?)x\s*(.*)$/);
      const itemQty = qtyMatch ? parseFloat(qtyMatch[1]) : 1;
      const itemDesc = qtyMatch ? qtyMatch[2] : (item.description || 'Artículo');

      const shareQty = itemQty * ratio;
      const shareCost = item.amount * ratio;

      return {
        desc: itemDesc,
        qty: shareQty,
        cost: shareCost,
      };
    });
  };

  const mySplit = splits.find((s) => s.user_id === currentProfile?.id);
  const myOwedAmount = mySplit ? mySplit.amount_owed : 0;

  const totalOthersOwe = splits
    .filter((s) => s.user_id !== currentProfile?.id)
    .reduce((acc, curr) => acc + curr.amount_owed, 0);

  const myShareAmount = isPaidByMe
    ? (mySplit ? mySplit.amount_owed : (expense.total_amount - totalOthersOwe))
    : myOwedAmount;

  let userStatusText = '';
  let userStatusClass = '';

  if (isPaidByMe) {
    if (totalOthersOwe > 0) {
      userStatusText = 'Pagaste la cuenta completa';
      userStatusClass = 'bg-emerald-50 text-emerald-800 border border-emerald-200';
    } else {
      userStatusText = 'Gasto personal registrado';
      userStatusClass = 'bg-emerald-50 text-emerald-800 border border-emerald-200';
    }
  } else if (myOwedAmount > 0) {
    const payerName = paidByProfile?.full_name ? paidByProfile.full_name.split(' ')[0] : 'el pagador';
    userStatusText = `Te corresponde pagar tu parte a ${payerName}`;
    userStatusClass = 'bg-rose-50 text-rose-800 border border-rose-200';
  } else {
    userStatusText = 'No participas en este gasto';
    userStatusClass = 'bg-zinc-100 text-zinc-700 border border-zinc-200';
  }

  const catConfig = getCategoryConfig(expense.category || 'General');
  const IconComponent = catConfig.icon;

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteExpense(expense.id);
      setShowConfirmDelete(false);
      if (group) {
        router.push(`/groups/${group.id}`);
      } else {
        router.push('/my-expenses');
      }
    } catch (err) {
      console.error('Error al eliminar el gasto:', err);
      setIsDeleting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 space-y-6">
      {/* Top Bar Navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center space-x-2 text-sm font-semibold text-zinc-600 hover:text-zinc-900 bg-white px-4 py-2 rounded-xl border border-zinc-200/80 shadow-2xs hover:shadow-xs transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Volver</span>
        </button>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => setIsEditModalOpen(true)}
            className="px-4 py-2 bg-white border border-zinc-200 hover:bg-zinc-50 text-zinc-800 rounded-xl text-sm font-semibold transition-all inline-flex items-center space-x-1.5 shadow-2xs"
          >
            <Edit3 className="w-4 h-4 text-zinc-600" />
            <span>Editar</span>
          </button>

          <button
            onClick={() => setShowConfirmDelete(true)}
            disabled={isDeleting}
            className="px-4 py-2 bg-rose-50 hover:bg-rose-100/80 border border-rose-200 text-rose-700 rounded-xl text-sm font-semibold transition-all inline-flex items-center space-x-1.5 shadow-2xs"
          >
            <Trash2 className="w-4 h-4" />
            <span>{isDeleting ? 'Eliminando...' : 'Eliminar'}</span>
          </button>
        </div>
      </div>

      {/* Main Container */}
      <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm overflow-hidden">
        {/* Header */}
        <div className="p-6 sm:p-8 border-b border-zinc-100 bg-zinc-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="flex items-start space-x-4">
            <div className={`p-4 rounded-2xl ${catConfig.bgClass} ${catConfig.textClass} shrink-0 shadow-2xs border border-zinc-200/60`}>
              <IconComponent className="w-8 h-8" />
            </div>
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                {expense.category || 'General'}
              </span>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-zinc-900 tracking-tight mt-0.5">
                {expense.description}
              </h1>
              {group && (
                <div className="mt-2 flex items-center space-x-2 text-xs font-medium text-zinc-500">
                  <Users className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Grupo:</span>
                  <Link
                    href={`/groups/${group.id}`}
                    className="text-zinc-900 font-semibold hover:underline"
                  >
                    {group.name}
                  </Link>
                </div>
              )}
            </div>
          </div>

          <div className="text-left sm:text-right bg-zinc-900 text-white p-5 rounded-2xl shadow-md shrink-0 sm:min-w-[200px]">
            <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block">
              Monto Total
            </span>
            <span className="text-2xl sm:text-3xl font-black text-white mt-0.5 block tracking-tight">
              {formatCurrency(expense.total_amount)}
            </span>
            <div className="mt-2 text-xs font-medium text-zinc-400 flex items-center sm:justify-end gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-emerald-400" />
              <span>{expense.expense_date}</span>
            </div>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 sm:p-8 space-y-6">
          {/* User Status Banner */}
          <div className={`p-4 rounded-2xl flex items-center space-x-3 text-sm font-medium ${userStatusClass}`}>
            <UserCheck className="w-5 h-5 shrink-0" />
            <span>{userStatusText}</span>
          </div>

          {/* Breakdown Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-zinc-50 p-5 rounded-2xl border border-zinc-200/80 shadow-2xs">
              <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider block">
                Tu gasto real
              </span>
              <span className="text-2xl font-black text-zinc-900 mt-1 block">
                {formatCurrency(myShareAmount)}
              </span>
            </div>

            <div className="bg-zinc-50 p-5 rounded-2xl border border-zinc-200/80 shadow-2xs">
              <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider block">
                {isPaidByMe ? 'Te deben' : 'Debes'}
              </span>
              <span className={`text-2xl font-black mt-1 block ${isPaidByMe ? 'text-emerald-700' : myOwedAmount > 0 ? 'text-rose-700' : 'text-zinc-600'}`}>
                {isPaidByMe ? formatCurrency(totalOthersOwe) : formatCurrency(myOwedAmount)}
              </span>
            </div>
          </div>

          {/* Who Paid */}
          <div className="bg-zinc-50/80 p-4 rounded-2xl border border-zinc-200/70 flex items-center justify-between">
            <span className="text-xs font-bold uppercase text-zinc-500 tracking-wider">
              Pagado por
            </span>
            <div className="flex items-center space-x-2.5">
              {paidByProfile?.avatar_url ? (
                <Image
                  src={paidByProfile.avatar_url}
                  alt={paidByProfile.full_name ?? 'Avatar'}
                  width={32}
                  height={32}
                  className="w-8 h-8 rounded-full object-cover ring-1 ring-zinc-200"
                  unoptimized
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-zinc-900 text-white font-bold text-xs flex items-center justify-center">
                  {(paidByProfile?.full_name ?? 'U').charAt(0).toUpperCase()}
                </div>
              )}
              <div className="text-right">
                <span className="text-sm font-bold text-zinc-900 block">
                  {isPaidByMe ? 'Tú' : (paidByProfile?.full_name ?? 'Usuario')}
                </span>
                <span className="text-xs text-zinc-500 font-medium block">
                  Pagó el total ({formatCurrency(expense.total_amount)})
                </span>
              </div>
            </div>
          </div>

          {/* Notes */}
          {expense.notes && (
            <div className="bg-zinc-50 p-4 rounded-2xl border border-zinc-200/70 space-y-1">
              <div className="flex items-center space-x-1.5 text-xs font-bold uppercase text-zinc-500 tracking-wider">
                <FileText className="w-4 h-4 text-zinc-400" />
                <span>Notas adicionales</span>
              </div>
              <p className="text-sm text-zinc-800 font-medium pl-5">
                {expense.notes}
              </p>
            </div>
          )}

          {/* Items Breakdown */}
          {items.length > 0 && (
            <div className="space-y-3 pt-2">
              <h3 className="text-xs font-bold uppercase text-zinc-500 tracking-wider flex items-center space-x-1.5">
                <Receipt className="w-4 h-4 text-zinc-400" />
                <span>Desglose de Ítems ({items.length})</span>
              </h3>
              <div className="divide-y divide-zinc-100 rounded-2xl border border-zinc-200/80 overflow-hidden bg-white">
                {items.map((item, index) => (
                  <div
                    key={item.id || index}
                    className="p-3.5 flex items-center justify-between hover:bg-zinc-50/80 transition-colors text-sm"
                  >
                    <span className="font-semibold text-zinc-800">{item.description}</span>
                    <span className="font-bold text-zinc-900">{formatCurrency(item.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Splits Distribution / Resumen por participante */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase text-zinc-500 tracking-wider flex items-center space-x-1.5">
                <ListChecks className="w-4 h-4 text-emerald-600" />
                <span>Resumen por participante ({splits.length})</span>
              </h3>
              {items.length > 0 && splits.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    if (expandedParticipants.length === splits.length) {
                      setExpandedParticipants([]);
                    } else {
                      setExpandedParticipants(splits.map((s) => s.user_id));
                    }
                  }}
                  className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 transition-colors cursor-pointer"
                >
                  {expandedParticipants.length === splits.length ? 'Colapsar todos' : 'Expandir todos'}
                </button>
              )}
            </div>

            <div className="bg-white border border-zinc-200 rounded-2xl shadow-2xs overflow-hidden divide-y divide-zinc-100">
              {splits.map((split) => {
                const member = profiles.find((p) => p.id === split.user_id);
                const isMe = currentProfile?.id === split.user_id;
                const isPayer = split.user_id === expense.paid_by;
                const isExpanded = expandedParticipants.includes(split.user_id);
                const breakdown = getParticipantItemBreakdown(split.amount_owed);

                return (
                  <div key={split.id || split.user_id} className="flex flex-col py-3 px-3.5 sm:px-4 transition-colors">
                    <div
                      className={`flex items-center justify-between ${items.length > 0 ? 'cursor-pointer select-none' : ''}`}
                      onClick={() => {
                        if (items.length > 0) {
                          setExpandedParticipants(
                            isExpanded
                              ? expandedParticipants.filter((id) => id !== split.user_id)
                              : [...expandedParticipants, split.user_id]
                          );
                        }
                      }}
                    >
                      <div className="flex items-center space-x-3 text-left min-w-0">
                        {member?.avatar_url ? (
                          <Image
                            src={member.avatar_url}
                            alt={member.full_name ?? 'Member'}
                            width={28}
                            height={28}
                            className="w-7 h-7 rounded-full object-cover ring-1 ring-zinc-200 shrink-0"
                            unoptimized
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-zinc-800 text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-2xs">
                            {(member?.full_name ?? 'U').charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-zinc-900 truncate">
                              {member?.full_name ?? (member?.email || 'Usuario')}
                              {isMe && <span className="text-zinc-400 font-medium ml-1">(Tú)</span>}
                            </span>
                            {isPayer && (
                              <span className="inline-block text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 shrink-0">
                                Pagó la cuenta completa
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5 shrink-0 pl-2">
                        <span className="text-sm sm:text-base font-black text-zinc-900">
                          {formatCurrency(split.amount_owed, currency)}
                        </span>
                        {items.length > 0 && (
                          isExpanded ? (
                            <ChevronUp className="w-4 h-4 text-zinc-400" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-zinc-400" />
                          )
                        )}
                      </div>
                    </div>

                    {items.length > 0 && isExpanded && breakdown.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-zinc-100 space-y-2 px-1">
                        {breakdown.map((b, i) => (
                          <div key={i} className="flex items-center justify-between text-xs py-0.5">
                            <span className="font-medium text-zinc-700 truncate pr-2">
                              {toFraction(b.qty)} · {b.desc}
                            </span>
                            <span className="font-bold text-zinc-900 shrink-0">
                              {formatCurrency(b.cost, currency)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Receipt Image */}
          {expense.receipt_url && (
            <div className="space-y-3 pt-2">
              <h3 className="text-xs font-bold uppercase text-zinc-500 tracking-wider">
                Comprobante de Pago
              </h3>
              <div className="relative max-w-md rounded-2xl overflow-hidden border border-zinc-200 bg-zinc-50 p-2">
                <a
                  href={expense.receipt_url}
                  target="_blank"
                  rel="noreferrer"
                  className="block relative w-full h-64 rounded-xl overflow-hidden group"
                >
                  <Image
                    src={expense.receipt_url}
                    alt="Comprobante de Pago"
                    fill
                    className="object-cover group-hover:scale-105 transition-transform duration-200"
                    unoptimized
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-semibold gap-1.5">
                    <ExternalLink className="w-4 h-4" />
                    <span>Ver comprobante completo</span>
                  </div>
                </a>
              </div>
            </div>
          )}

          {/* Historial de Cambios / Participantes */}
          {(() => {
            const relevantLogs = [
              ...(expense.audit_logs || []),
              ...allAuditLogs.filter((l) => l.expense_id === expense.id),
            ].filter((v, i, a) => a.findIndex((t) => t.id === v.id) === i);

            if (relevantLogs.length === 0) return null;

            return (
              <div className="space-y-3 pt-4 border-t border-zinc-100">
                <h3 className="text-xs font-bold uppercase text-zinc-500 tracking-wider flex items-center space-x-1.5">
                  <History className="w-4 h-4 text-zinc-400" />
                  <span>Historial de Modificaciones ({relevantLogs.length})</span>
                </h3>
                <div className="space-y-2.5">
                  {relevantLogs.map((log) => {
                    const editor = profiles.find((p) => p.id === log.user_id);
                    const changes = log.changes as any;
                    const dateStr = new Date(log.created_at).toLocaleString();

                    return (
                      <div
                        key={log.id}
                        className="p-3.5 bg-zinc-50 border border-zinc-200/80 rounded-2xl text-xs space-y-1.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-zinc-900 flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-emerald-500" />
                            {editor?.full_name || 'Un participante'} editó el gasto
                          </span>
                          <span className="text-[11px] text-zinc-400 font-medium">
                            {dateStr}
                          </span>
                        </div>

                        {changes?.summary && (
                          <p className="text-zinc-700 font-medium pl-3.5">
                            {changes.summary}
                          </p>
                        )}

                        {(changes?.added_names?.length > 0 || changes?.removed_names?.length > 0) && (
                          <div className="flex flex-wrap gap-1.5 pl-3.5 pt-0.5">
                            {changes.added_names?.map((name: string, idx: number) => (
                              <span
                                key={`add-${idx}`}
                                className="bg-emerald-100/90 text-emerald-800 px-2 py-0.5 rounded-md font-semibold text-[10px]"
                              >
                                + {name}
                              </span>
                            ))}
                            {changes.removed_names?.map((name: string, idx: number) => (
                              <span
                                key={`rem-${idx}`}
                                className="bg-rose-100/90 text-rose-800 px-2 py-0.5 rounded-md font-semibold text-[10px]"
                              >
                                - {name}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* Edit Modal */}
      {isEditModalOpen && (
        <NewExpenseModal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          expenseToEdit={expense}
          defaultGroupId={expense.group_id}
        />
      )}

      <ConfirmModal
        isOpen={showConfirmDelete}
        onClose={() => setShowConfirmDelete(false)}
        onConfirm={handleDelete}
        title="Eliminar Gasto"
        description={`¿Estás seguro de que deseas eliminar el gasto "${expense.description}"?`}
        confirmText="Eliminar"
        isLoading={isDeleting}
      />
    </div>
  );
}
