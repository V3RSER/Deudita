'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { useExpense } from '@/lib/expense-context';
import { Group, Expense } from '@/lib/types';
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
  AlertCircle,
  HelpCircle,
  Sparkles,
} from 'lucide-react';

interface GroupDetailProps {
  group: Group;
  onBack: () => void;
  onOpenNewExpense: (groupId?: string) => void;
  onOpenSettleModal: (groupId: string, debtorId?: string, creditorId?: string, amount?: number) => void;
  onOpenAddMember: (groupId: string) => void;
}

export function GroupDetail({
  group,
  onBack,
  onOpenNewExpense,
  onOpenSettleModal,
  onOpenAddMember,
}: GroupDetailProps) {
  const { currentProfile, expenses, payments, members, profiles, deleteExpense } = useExpense();
  const [activeTab, setActiveTab] = useState<'expenses' | 'balances' | 'members'>('expenses');
  const [expandedExpenseId, setExpandedExpenseId] = useState<string | null>(null);

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

  const toggleExpandExpense = (id: string) => {
    setExpandedExpenseId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Back Button */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <button
          onClick={onBack}
          className="inline-flex items-center space-x-2 text-sm font-medium text-zinc-500 hover:text-zinc-900 bg-white px-4 py-2 rounded-full ring-1 ring-zinc-200 shadow-sm transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Volver a Mis Grupos</span>
        </button>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => onOpenSettleModal(group.id)}
            className="flex items-center space-x-2 bg-white hover:bg-zinc-50 text-zinc-900 font-medium px-5 py-2.5 rounded-full text-sm transition-all ring-1 ring-zinc-200 shadow-sm"
          >
            <Wallet className="w-4 h-4" />
            <span>Saldar Cuenta</span>
          </button>

          <button
            onClick={() => onOpenNewExpense(group.id)}
            className="flex items-center space-x-2 bg-zinc-900 hover:bg-zinc-800 text-white font-medium px-5 py-2.5 rounded-full text-sm shadow-sm transition-all active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>Nuevo Gasto</span>
          </button>
        </div>
      </div>

      {/* Group Card Banner & Stat Cards */}
      <div className="bg-white rounded-[2rem] ring-1 ring-zinc-200 p-8 sm:p-10 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">
          <div>
            <div className="flex items-center gap-3">
              <span className="text-[10px] uppercase tracking-widest font-semibold text-zinc-500 bg-zinc-100 px-3 py-1.5 rounded-md">
                {(group?.category ? group.category : 'general').toUpperCase()}
              </span>
              <span className="px-3 py-1.5 bg-emerald-50 text-emerald-700 text-[10px] uppercase tracking-widest font-semibold rounded-md">
                Activo
              </span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-semibold text-zinc-900 mt-4 tracking-tight">
              {group.name}
            </h1>
            {group.description && (
              <p className="text-zinc-500 text-base mt-2 max-w-xl leading-relaxed">{group.description}</p>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-4">
            <div className="bg-zinc-50 p-6 rounded-2xl ring-1 ring-zinc-100 min-w-[160px]">
              <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block">
                Total Grupo
              </span>
              <span className="text-2xl font-semibold text-zinc-900 mt-2 block tracking-tight">
                {formatCurrency(totalGroupSpent)}
              </span>
            </div>
            <div className={`p-6 rounded-2xl ring-1 bg-white min-w-[160px] ${
              Math.abs(myNet) < 0.5
                ? 'ring-zinc-200 border-l-4 border-l-zinc-300'
                : myNet > 0
                ? 'ring-emerald-100 border-l-4 border-l-emerald-500'
                : 'ring-rose-100 border-l-4 border-l-rose-500'
            }`}>
              <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block">
                {myNet > 0 ? 'Te deben' : myNet < 0 ? 'Debes' : 'Tu Estado'}
              </span>
              <span
                className={`text-2xl font-semibold mt-2 block tracking-tight ${
                  Math.abs(myNet) < 0.5
                    ? 'text-zinc-600'
                    : myNet > 0
                    ? 'text-emerald-600'
                    : 'text-rose-600'
                }`}
              >
                {Math.abs(myNet) < 0.5
                  ? 'Al día'
                  : formatCurrency(Math.abs(myNet))}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs Bar */}
      <div className="flex border-b border-zinc-200">
        <button
          onClick={() => setActiveTab('expenses')}
          className={`flex items-center space-x-2 py-4 px-6 font-medium text-sm border-b-2 transition-all ${
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
          className={`flex items-center space-x-2 py-4 px-6 font-medium text-sm border-b-2 transition-all ${
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
          className={`flex items-center space-x-2 py-4 px-6 font-medium text-sm border-b-2 transition-all ${
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
            <div className="text-center py-16 bg-white rounded-2xl ring-1 ring-zinc-200 p-8 shadow-sm">
              <div className="w-16 h-16 bg-zinc-50 rounded-2xl flex items-center justify-center mx-auto text-zinc-400 mb-5">
                <Receipt className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-semibold text-zinc-900">Aún no hay gastos registrados</h3>
              <p className="text-sm text-zinc-500 mt-2 mb-6">
                Sé el primero en agregar un gasto para este grupo.
              </p>
              <button
                onClick={() => onOpenNewExpense(group.id)}
                className="bg-white hover:bg-zinc-50 text-zinc-900 font-medium px-5 py-2.5 rounded-full text-sm ring-1 ring-zinc-200 shadow-sm transition-all"
              >
                Registrar Gasto
              </button>
            </div>
          ) : (
            groupExpenses.map((exp) => {
              const paidByProfile = profiles.find((p) => p.id === exp.paid_by);
              const isExpanded = expandedExpenseId === exp.id;
              const hasItems = exp.items && exp.items.length > 0;

              return (
                <div
                  key={exp.id}
                  className="bg-white rounded-2xl ring-1 ring-zinc-200 p-6 shadow-sm hover:shadow-md transition-all"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
                    {/* Left: Date, Description, Paid By */}
                    <div className="flex items-start space-x-4">
                      <div className="w-12 h-12 bg-zinc-50 rounded-2xl flex items-center justify-center text-zinc-400 font-bold shrink-0 ring-1 ring-zinc-100">
                        <Receipt className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center space-x-2.5">
                          <h4 className="font-semibold text-zinc-900 text-base">
                            {exp.description}
                          </h4>
                          {exp.source === 'gmail' && (
                            <span className="bg-zinc-900 text-white text-[10px] uppercase font-semibold tracking-widest px-2 py-0.5 rounded-md">
                              AI
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500 mt-1.5">
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
                            Pagado por:{' '}
                            <strong className="text-zinc-700 font-medium">
                              {paidByProfile ? paidByProfile.full_name : 'Desconocido'}
                            </strong>
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Right: Amount & Actions */}
                    <div className="flex items-center justify-between sm:justify-end gap-5 border-t sm:border-t-0 pt-4 sm:pt-0 border-zinc-100">
                      <div className="text-right">
                        <span className="text-xl font-semibold text-zinc-900 block tracking-tight">
                          {formatCurrency(exp.total_amount)}
                        </span>
                        <span className="text-xs text-zinc-400 block mt-0.5 font-medium">
                          {(exp.splits ? exp.splits : []).length} divididos
                        </span>
                      </div>

                      <div className="flex items-center space-x-1.5 bg-zinc-50/80 p-1 rounded-xl">
                        {hasItems && (
                          <button
                            onClick={() => toggleExpandExpense(exp.id)}
                            className="px-3 py-1.5 hover:bg-white rounded-lg text-zinc-600 text-xs font-medium flex items-center space-x-1.5 transition-colors shadow-sm"
                            title="Ver desglose de ítems"
                          >
                            <span>Ítems</span>
                            {isExpanded ? (
                              <ChevronUp className="w-3.5 h-3.5" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5" />
                            )}
                          </button>
                        )}

                        <button
                          onClick={() => deleteExpense(exp.id)}
                          className="p-1.5 hover:bg-rose-50 hover:text-rose-600 rounded-lg text-zinc-400 transition-colors"
                          title="Eliminar gasto"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Expanded Itemized Breakdown & Splits */}
                  {isExpanded && hasItems && (
                    <div className="mt-6 pt-5 border-t border-zinc-100 space-y-5">
                      <div>
                        <h5 className="text-[10px] font-bold uppercase text-zinc-400 tracking-widest mb-3">
                          Desglose de Ítems ({exp.items?.length})
                        </h5>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {exp.items?.map((item) => (
                            <div
                              key={item.id}
                              className="flex items-center justify-between bg-zinc-50 px-4 py-3 rounded-xl ring-1 ring-zinc-100 text-sm"
                            >
                              <span className="font-medium text-zinc-600">{item.description}</span>
                              <span className="font-semibold text-zinc-900">
                                {formatCurrency(item.amount)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Splits breakdown */}
                      <div>
                        <h5 className="text-[10px] font-bold uppercase text-zinc-400 tracking-widest mb-3">
                          Reparto entre Miembros
                        </h5>
                        <div className="flex flex-wrap gap-2.5">
                          {exp.splits?.map((split) => {
                            const splitUser = profiles.find((p) => p.id === split.user_id);
                            return (
                              <div
                                key={split.id}
                                className="bg-white px-3 py-2 rounded-xl ring-1 ring-zinc-200 text-xs flex items-center space-x-2.5"
                              >
                                {splitUser?.avatar_url && (
                                  <Image
                                    src={splitUser.avatar_url}
                                    alt={splitUser.full_name ?? 'Usuario'}
                                    width={20}
                                    height={20}
                                    className="w-5 h-5 rounded-full object-cover"
                                    unoptimized
                                    referrerPolicy="no-referrer"
                                  />
                                )}
                                <span className="text-zinc-600 font-medium">{splitUser?.full_name}</span>
                                <span className="font-semibold text-zinc-900">
                                  {formatCurrency(split.amount_owed)}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
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
          <div className="bg-zinc-900 text-white p-8 rounded-[2rem] shadow-md relative overflow-hidden">
            <div className="relative z-10">
              <h3 className="text-xl font-semibold tracking-tight text-zinc-50">Cuentas Claras en {group.name}</h3>
              <p className="text-zinc-400 text-sm mt-2 max-w-xl">
                Aquí ves quién le debe a quién dentro de este grupo. Presiona &quot;Saldar&quot; para registrar una transferencia o pago en efectivo.
              </p>
            </div>
            <div className="absolute right-0 top-0 w-1/2 h-full bg-gradient-to-l from-white/5 to-transparent pointer-events-none" />
          </div>

          {groupPairwise.length === 0 ? (
            <div className="bg-white rounded-2xl p-10 ring-1 ring-zinc-200 text-center">
              <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
              <h4 className="font-semibold text-zinc-900 text-lg tracking-tight">¡Todas las cuentas están al día!</h4>
              <p className="text-zinc-500 text-sm mt-1.5">
                Nadie tiene deudas pendientes en este grupo.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {groupPairwise.map((p, idx) => {
                const isIOWed = p.creditor.id === currentProfile?.id;
                const isIOwe = p.debtor.id === currentProfile?.id;

                return (
                  <div
                    key={idx}
                    className="bg-white rounded-2xl p-6 ring-1 ring-zinc-200 shadow-sm flex items-center justify-between hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-center space-x-4">
                      <div className="relative">
                        <Image
                          src={p.debtor.avatar_url}
                          alt={p.debtor.full_name}
                          width={48}
                          height={48}
                          className="w-12 h-12 rounded-full ring-2 ring-rose-100 object-cover"
                          unoptimized
                          referrerPolicy="no-referrer"
                        />
                        <span className="absolute -bottom-2 -right-1 bg-rose-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md shadow-sm">
                          DEBE
                        </span>
                      </div>

                      <div className="text-sm">
                        <p className="font-medium text-zinc-900">
                          {p.debtor.full_name}{' '}
                          <span className="font-normal text-zinc-500">le debe a</span>{' '}
                          {p.creditor.full_name}
                        </p>
                        <p className="text-lg font-semibold text-emerald-600 mt-1 tracking-tight">
                          {formatCurrency(p.amount)}
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() =>
                        onOpenSettleModal(group.id, p.debtor.id, p.creditor.id, p.amount)
                      }
                      className="bg-zinc-900 hover:bg-zinc-800 text-white font-medium px-4 py-2 rounded-full text-xs transition-all active:scale-95"
                    >
                      Saldar
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB CONTENT: Members */}
      {activeTab === 'members' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-zinc-900 text-xl tracking-tight">Integrantes del Grupo</h3>
            <button
              onClick={() => onOpenAddMember(group.id)}
              className="flex items-center space-x-1.5 bg-zinc-900 hover:bg-zinc-800 text-white px-4 py-2 rounded-full text-xs font-medium transition-all active:scale-95"
            >
              <UserPlus className="w-4 h-4" />
              <span>Añadir Integrante</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {memberProfiles.map((p) => {
              const memberRecord = groupMembers.find((m) => m.user_id === p.id);
              const isOwner = memberRecord?.role === 'owner';

              return (
                <div
                  key={p.id}
                  className="bg-white rounded-2xl p-5 ring-1 ring-zinc-200 flex items-center space-x-4 shadow-sm hover:shadow-md transition-shadow"
                >
                  <Image
                    src={p.avatar_url}
                    alt={p.full_name}
                    width={48}
                    height={48}
                    className="w-12 h-12 rounded-full object-cover ring-2 ring-zinc-100"
                    unoptimized
                    referrerPolicy="no-referrer"
                  />
                  <div>
                    <div className="flex items-center space-x-2">
                      <h4 className="font-semibold text-zinc-900 text-sm tracking-tight">{p.full_name}</h4>
                      {isOwner && (
                        <span className="bg-amber-100 text-amber-800 text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-md">
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
