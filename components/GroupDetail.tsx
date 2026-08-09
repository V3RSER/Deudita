'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { useExpense } from '@/lib/expense-context';
import { Group } from '@/lib/types';
import { formatCurrency, calculatePairwiseBalances, calculateUserSummaries } from '@/lib/balance-utils';
import {
  ArrowLeft,
  Receipt,
  Wallet,
  Users,
  Plus,
  ChevronDown,
  ChevronUp,
  UserPlus,
  Trash2,
  Calendar,
  Tag,
  CheckCircle2,
  Share2,
  Copy,
  Check,
  UserCheck,
  Sparkles,
  Pencil,
  FileText,
} from 'lucide-react';
import { Expense } from '@/lib/types';

interface GroupDetailProps {
  group: Group;
  onBack: () => void;
  onOpenNewExpense: (groupId?: string) => void;
  onEditExpense?: (expense: Expense) => void;
  onOpenSettleModal: (groupId: string, debtorId?: string, creditorId?: string, amount?: number) => void;
  onOpenAddMember: (groupId: string) => void;
}

export function GroupDetail({
  group,
  onBack,
  onOpenNewExpense,
  onEditExpense,
  onOpenSettleModal,
  onOpenAddMember,
}: GroupDetailProps) {
  const { currentProfile, expenses, payments, members, profiles, deleteExpense } = useExpense();
  const [activeTab, setActiveTab] = useState<'expenses' | 'balances' | 'members'>('expenses');
  const [expandedExpenseId, setExpandedExpenseId] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  const groupExpenses = expenses.filter((e) => e.group_id === group.id);
  const totalGroupSpent = groupExpenses.reduce((acc, curr) => acc + curr.total_amount, 0);

  const groupMembers = members.filter((m) => m.group_id === group.id);
  const memberProfiles = groupMembers
    .map((m) => profiles.find((p) => p.id === m.user_id))
    .filter((p): p is NonNullable<typeof p> => p !== undefined);

  // Pairwise debts in this group
  const groupPairwise = calculatePairwiseBalances(expenses, payments, profiles, group.id);

  // Summary per member
  const userSummaries = calculateUserSummaries(expenses, payments, profiles, group.id);
  const mySummary = userSummaries.find((s) => s.user.id === currentProfile?.id);
  const myNet = mySummary ? mySummary.netBalance : 0;

  const isSoloMember = memberProfiles.length <= 1;

  const toggleExpandExpense = (id: string) => {
    setExpandedExpenseId((prev) => (prev === id ? null : id));
  };

  const handleShareOrCopyLink = async () => {
    const currentUrl = typeof window !== 'undefined' ? window.location.href : '';
    if (!currentUrl) return;

    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: `Unirse al grupo ${group.name}`,
          text: `Te invito a unirte al grupo ${group.name} en SplitPay para dividir gastos juntos.`,
          url: currentUrl,
        });
        return;
      } catch {
        // Fallback to clipboard write
      }
    }

    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(currentUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    }
  };

  // Extract clean description without image tag if present
  let cleanDescription = group.description ? group.description : '';
  let groupImageUrl = '';

  if (cleanDescription.includes('[img:')) {
    const match = cleanDescription.match(/\[img:(.*?)\]/);
    if (match && match[1]) {
      groupImageUrl = match[1];
    }
    cleanDescription = cleanDescription.replace(/\[img:.*?\]/g, '').trim();
  }

  return (
    <div className="space-y-6">
      {/* Top Header & Navigation Breadcrumb */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          onClick={onBack}
          className="inline-flex items-center space-x-2 text-sm font-medium text-zinc-600 hover:text-zinc-900 bg-white px-4 py-2.5 rounded-full ring-1 ring-zinc-200 shadow-sm transition-all active:scale-95 min-h-[44px]"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Volver a Mis Grupos</span>
        </button>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => onOpenSettleModal(group.id)}
            className="flex items-center space-x-2 bg-white hover:bg-zinc-50 text-zinc-900 font-medium px-4 sm:px-5 py-2.5 rounded-full text-xs sm:text-sm transition-all ring-1 ring-zinc-200 shadow-sm min-h-[44px]"
          >
            <Wallet className="w-4 h-4" />
            <span>Saldar Cuenta</span>
          </button>

          <button
            onClick={() => onOpenNewExpense(group.id)}
            className="flex items-center space-x-2 bg-zinc-900 hover:bg-zinc-800 text-white font-medium px-4 sm:px-5 py-2.5 rounded-full text-xs sm:text-sm shadow-sm transition-all active:scale-95 min-h-[44px]"
          >
            <Plus className="w-4 h-4" />
            <span>Nuevo Gasto</span>
          </button>
        </div>
      </div>

      {/* Group Card Banner */}
      <div className="bg-white rounded-[2rem] ring-1 ring-zinc-200 p-6 sm:p-8 md:p-10 shadow-sm overflow-hidden relative">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-start space-x-4">
            {groupImageUrl ? (
              <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-2xl overflow-hidden ring-2 ring-zinc-100 shrink-0 shadow-sm">
                <Image
                  src={groupImageUrl}
                  alt={group.name}
                  fill
                  className="object-cover"
                  unoptimized
                  referrerPolicy="no-referrer"
                />
              </div>
            ) : (
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-zinc-900 text-white flex items-center justify-center text-2xl font-bold shrink-0 shadow-sm">
                <Users className="w-8 h-8" />
              </div>
            )}

            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="text-[10px] uppercase tracking-wider font-semibold text-zinc-600 bg-zinc-100 px-3 py-1 rounded-md">
                  {group.category ? group.category.toUpperCase() : 'GENERAL'}
                </span>
                <span className="px-3 py-1 bg-emerald-50 text-emerald-700 text-[10px] uppercase tracking-wider font-semibold rounded-md">
                  {isSoloMember ? 'NUEVO (1 INTEGRANTE)' : 'ACTIVO'}
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-semibold text-zinc-900 mt-2 tracking-tight">
                {group.name}
              </h1>
              {cleanDescription ? (
                <p className="text-zinc-500 text-sm sm:text-base mt-1.5 max-w-xl leading-relaxed">
                  {cleanDescription}
                </p>
              ) : null}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <div className="bg-zinc-50 p-5 rounded-2xl ring-1 ring-zinc-100 min-w-[150px]">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                Total del Grupo
              </span>
              <span className="text-2xl font-semibold text-zinc-900 mt-1 block tracking-tight">
                {formatCurrency(totalGroupSpent)}
              </span>
            </div>
            <div
              className={`p-5 rounded-2xl ring-1 bg-white min-w-[150px] ${
                Math.abs(myNet) < 0.5
                  ? 'ring-zinc-200 border-l-4 border-l-zinc-300'
                  : myNet > 0
                  ? 'ring-emerald-100 border-l-4 border-l-emerald-500'
                  : 'ring-rose-100 border-l-4 border-l-rose-500'
              }`}
            >
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                {myNet > 0 ? 'Te deben' : myNet < 0 ? 'Debes' : 'Tu Balance'}
              </span>
              <span
                className={`text-2xl font-semibold mt-1 block tracking-tight ${
                  Math.abs(myNet) < 0.5
                    ? 'text-zinc-600'
                    : myNet > 0
                    ? 'text-emerald-600'
                    : 'text-rose-600'
                }`}
              >
                {Math.abs(myNet) < 0.5 ? 'Al día' : formatCurrency(Math.abs(myNet))}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* SOLO MEMBER EMPTY STATE STRATEGY */}
      {isSoloMember && (
        <div className="bg-gradient-to-br from-zinc-900 to-zinc-950 text-white p-6 sm:p-8 rounded-[2rem] shadow-xl relative overflow-hidden border border-zinc-800">
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2 max-w-xl">
              <div className="inline-flex items-center space-x-2 bg-emerald-500/20 text-emerald-300 text-xs font-semibold px-3 py-1 rounded-full border border-emerald-500/30">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Grupo Creado Exitosamente</span>
              </div>
              <h3 className="text-xl sm:text-2xl font-semibold tracking-tight text-white">
                ¡Actualmente eres la única persona en este grupo!
              </h3>
              <p className="text-zinc-400 text-sm leading-relaxed">
                Para empezar a dividir cuentas, añade a tus amigos directamente por correo electrónico o comparte el enlace directo de este grupo.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
              <button
                onClick={() => onOpenAddMember(group.id)}
                className="flex items-center justify-center space-x-2 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold px-5 py-3 rounded-2xl text-sm transition-all active:scale-95 shadow-lg min-h-[44px]"
              >
                <UserPlus className="w-4 h-4" />
                <span>Añadir Integrante</span>
              </button>

              <button
                onClick={handleShareOrCopyLink}
                className="flex items-center justify-center space-x-2 bg-zinc-800 hover:bg-zinc-700 text-white font-medium px-5 py-3 rounded-2xl text-sm ring-1 ring-zinc-700 transition-all active:scale-95 min-h-[44px]"
              >
                {copiedLink ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span className="text-emerald-300 font-semibold">¡Enlace Copiado!</span>
                  </>
                ) : (
                  <>
                    <Share2 className="w-4 h-4" />
                    <span>Compartir Enlace</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tabs Navigation Bar */}
      <div className="flex border-b border-zinc-200 overflow-x-auto">
        <button
          onClick={() => setActiveTab('expenses')}
          className={`flex items-center space-x-2 py-3.5 px-5 font-semibold text-sm border-b-2 whitespace-nowrap transition-all min-h-[44px] ${
            activeTab === 'expenses'
              ? 'border-zinc-900 text-zinc-900'
              : 'border-transparent text-zinc-500 hover:text-zinc-800'
          }`}
        >
          <Receipt className="w-4 h-4" />
          <span>Gastos ({groupExpenses.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('balances')}
          className={`flex items-center space-x-2 py-3.5 px-5 font-semibold text-sm border-b-2 whitespace-nowrap transition-all min-h-[44px] ${
            activeTab === 'balances'
              ? 'border-zinc-900 text-zinc-900'
              : 'border-transparent text-zinc-500 hover:text-zinc-800'
          }`}
        >
          <Wallet className="w-4 h-4" />
          <span>Balances ({groupPairwise.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('members')}
          className={`flex items-center space-x-2 py-3.5 px-5 font-semibold text-sm border-b-2 whitespace-nowrap transition-all min-h-[44px] ${
            activeTab === 'members'
              ? 'border-zinc-900 text-zinc-900'
              : 'border-transparent text-zinc-500 hover:text-zinc-800'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Miembros ({memberProfiles.length})</span>
        </button>
      </div>

      {/* TAB CONTENT: Expenses */}
      {activeTab === 'expenses' && (
        <div className="space-y-4">
          {groupExpenses.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-3xl ring-1 ring-zinc-200 p-8 shadow-sm space-y-4">
              <div className="w-16 h-16 bg-zinc-50 rounded-2xl flex items-center justify-center mx-auto text-zinc-400">
                <Receipt className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-zinc-900">Aún no hay gastos registrados</h3>
                <p className="text-sm text-zinc-500 mt-1">
                  Sé el primero en agregar un gasto para este grupo.
                </p>
              </div>
              <button
                onClick={() => onOpenNewExpense(group.id)}
                className="bg-zinc-900 hover:bg-zinc-800 text-white font-medium px-6 py-3 rounded-full text-sm shadow-sm transition-all active:scale-95 inline-flex items-center space-x-2"
              >
                <Plus className="w-4 h-4" />
                <span>Registrar Gasto</span>
              </button>
            </div>
          ) : (
            groupExpenses.map((exp) => {
              const paidByProfile = profiles.find((p) => p.id === exp.paid_by);
              const isExpanded = expandedExpenseId === exp.id;
              const hasItems = Boolean(exp.items && exp.items.length > 0);

              return (
                <div
                  key={exp.id}
                  className="bg-white rounded-2xl ring-1 ring-zinc-200 p-5 sm:p-6 shadow-sm hover:shadow-md transition-all"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-start space-x-4">
                      <div className="w-12 h-12 bg-zinc-50 rounded-2xl flex items-center justify-center text-zinc-500 font-bold shrink-0 ring-1 ring-zinc-100">
                        <Receipt className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <h4 className="font-semibold text-zinc-900 text-base">
                            {exp.description}
                          </h4>
                          {exp.source === 'gmail' && (
                            <span className="bg-zinc-900 text-white text-[10px] uppercase font-semibold tracking-widest px-2 py-0.5 rounded-md">
                              AI
                            </span>
                          )}
                        </div>
                        {exp.notes && (
                          <p className="text-xs text-zinc-600 mt-1 flex items-center space-x-1 font-normal bg-zinc-50 px-2 py-1 rounded-md border border-zinc-100 w-fit">
                            <FileText className="w-3 h-3 text-zinc-400 shrink-0" />
                            <span>{exp.notes}</span>
                          </p>
                        )}
                        <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500 mt-1">
                          <span className="flex items-center space-x-1 font-medium">
                            <Calendar className="w-3 h-3" />
                            <span>{exp.expense_date}</span>
                          </span>
                          <span>•</span>
                          <span className="flex items-center space-x-1 font-medium">
                            <Tag className="w-3 h-3" />
                            <span>{exp.category}</span>
                          </span>
                          <span>•</span>
                          <span>
                            Pagó:{' '}
                            <strong className="text-zinc-700 font-medium">
                              {paidByProfile ? paidByProfile.full_name : 'Usuario'}
                            </strong>
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-4 border-t sm:border-t-0 pt-3 sm:pt-0 border-zinc-100">
                      <div className="text-right">
                        <span className="text-xl font-semibold text-zinc-900 block tracking-tight">
                          {formatCurrency(exp.total_amount)}
                        </span>
                        <span className="text-xs text-zinc-400 block mt-0.5 font-medium">
                          {(exp.splits ? exp.splits : []).length} divididos
                        </span>
                      </div>

                      <div className="flex items-center space-x-1.5 bg-zinc-50 p-1 rounded-xl">
                        {(hasItems || exp.receipt_url) && (
                          <button
                            onClick={() => toggleExpandExpense(exp.id)}
                            className="px-3 py-1.5 hover:bg-white rounded-lg text-zinc-600 text-xs font-medium flex items-center space-x-1 transition-colors shadow-sm min-h-[36px]"
                          >
                            <span>{exp.receipt_url ? 'Detalles / Recibo' : 'Ítems'}</span>
                            {isExpanded ? (
                              <ChevronUp className="w-3.5 h-3.5" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5" />
                            )}
                          </button>
                        )}

                        {onEditExpense && (
                          <button
                            onClick={() => onEditExpense(exp)}
                            className="p-2 hover:bg-zinc-200 hover:text-zinc-900 rounded-lg text-zinc-500 transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"
                            title="Editar gasto"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                        )}

                        <button
                          onClick={() => deleteExpense(exp.id)}
                          className="p-2 hover:bg-rose-50 hover:text-rose-600 rounded-lg text-zinc-400 transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"
                          title="Eliminar gasto"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-5 pt-4 border-t border-zinc-100 space-y-4">
                      {hasItems && (
                        <div>
                          <h5 className="text-[10px] font-bold uppercase text-zinc-400 tracking-wider mb-2">
                            Desglose de Ítems ({exp.items?.length})
                          </h5>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {exp.items?.map((item) => (
                              <div
                                key={item.id}
                                className="flex items-center justify-between bg-zinc-50 px-4 py-2.5 rounded-xl text-sm"
                              >
                                <span className="font-medium text-zinc-600">{item.description}</span>
                                <span className="font-semibold text-zinc-900">
                                  {formatCurrency(item.amount)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {exp.receipt_url && (
                        <div>
                          <h5 className="text-[10px] font-bold uppercase text-zinc-400 tracking-wider mb-2">
                            Comprobante / Recibo Adjunto
                          </h5>
                          <div className="relative max-w-sm rounded-2xl overflow-hidden border border-zinc-200 bg-zinc-50 p-2">
                            <a
                              href={exp.receipt_url}
                              target="_blank"
                              rel="noreferrer"
                              className="block relative w-full h-48 rounded-xl overflow-hidden group"
                            >
                              <Image
                                src={exp.receipt_url}
                                alt="Recibo"
                                fill
                                className="object-cover group-hover:scale-105 transition-transform duration-200"
                                unoptimized
                                referrerPolicy="no-referrer"
                              />
                              <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-semibold">
                                Ver imagen completa ↗
                              </div>
                            </a>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* TAB CONTENT: Balances */}
      {activeTab === 'balances' && (
        <div className="space-y-6">
          <div className="bg-zinc-900 text-white p-6 sm:p-8 rounded-[2rem] shadow-md">
            <h3 className="text-xl font-semibold tracking-tight text-zinc-50">Cuentas Claras en {group.name}</h3>
            <p className="text-zinc-400 text-xs sm:text-sm mt-1 max-w-xl">
              Deudas calculadas entre los miembros de este grupo. Presiona &quot;Saldar&quot; para registrar un pago.
            </p>
          </div>

          {groupPairwise.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 ring-1 ring-zinc-200 text-center space-y-2">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
              <h4 className="font-semibold text-zinc-900 text-base">¡Todas las cuentas están al día!</h4>
              <p className="text-zinc-500 text-xs">Nadie tiene deudas pendientes en este grupo.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {groupPairwise.map((p, idx) => (
                <div
                  key={idx}
                  className="bg-white rounded-2xl p-5 ring-1 ring-zinc-200 shadow-sm flex items-center justify-between"
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-full bg-zinc-800 text-white flex items-center justify-center text-sm font-bold shrink-0">
                      {p.debtor.full_name ? p.debtor.full_name.charAt(0).toUpperCase() : 'U'}
                    </div>
                    <div className="text-sm">
                      <p className="font-medium text-zinc-900">
                        {p.debtor.full_name} <span className="text-zinc-400 font-normal">le debe a</span> {p.creditor.full_name}
                      </p>
                      <p className="text-base font-semibold text-emerald-600 mt-0.5">
                        {formatCurrency(p.amount)}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => onOpenSettleModal(group.id, p.debtor.id, p.creditor.id, p.amount)}
                    className="bg-zinc-900 hover:bg-zinc-800 text-white font-medium px-4 py-2 rounded-full text-xs transition-all active:scale-95"
                  >
                    Saldar
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB CONTENT: Members */}
      {activeTab === 'members' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-zinc-900 text-lg sm:text-xl">
              Integrantes ({memberProfiles.length})
            </h3>
            <button
              onClick={() => onOpenAddMember(group.id)}
              className="flex items-center space-x-1.5 bg-zinc-900 hover:bg-zinc-800 text-white px-4 py-2.5 rounded-full text-xs font-medium transition-all active:scale-95 min-h-[40px]"
            >
              <UserPlus className="w-4 h-4" />
              <span>Añadir Integrante</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {memberProfiles.map((p) => {
              const memberRecord = groupMembers.find((m) => m.user_id === p.id);
              const isOwner = memberRecord?.role === 'owner';

              return (
                <div
                  key={p.id}
                  className="bg-white rounded-2xl p-4 ring-1 ring-zinc-200 flex items-center space-x-3 shadow-sm"
                >
                  {p.avatar_url ? (
                    <Image
                      src={p.avatar_url}
                      alt={p.full_name}
                      width={44}
                      height={44}
                      className="w-11 h-11 rounded-full object-cover ring-2 ring-zinc-100"
                      unoptimized
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-11 h-11 rounded-full bg-zinc-800 text-white flex items-center justify-center text-sm font-bold">
                      {p.full_name ? p.full_name.charAt(0).toUpperCase() : 'U'}
                    </div>
                  )}
                  <div>
                    <div className="flex items-center space-x-2">
                      <h4 className="font-semibold text-zinc-900 text-sm">{p.full_name}</h4>
                      {isOwner && (
                        <span className="bg-amber-100 text-amber-800 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md">
                          Admin
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-500 mt-0.5">{p.email}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
