'use client';

import React, { useState } from 'react';
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
  const { currentProfile, expenses, settlements, members, profiles, deleteExpense } = useExpense();
  const [activeTab, setActiveTab] = useState<'expenses' | 'balances' | 'members'>('expenses');
  const [expandedExpenseId, setExpandedExpenseId] = useState<string | null>(null);

  const groupExpenses = expenses.filter((e) => e.group_id === group.id);
  const totalGroupSpent = groupExpenses.reduce((acc, curr) => acc + curr.total_amount, 0);

  const groupMembers = members.filter((m) => m.group_id === group.id);
  const memberProfiles = groupMembers
    .map((m) => profiles.find((p) => p.id === m.user_id))
    .filter((p): p is NonNullable<typeof p> => p !== undefined);

  // Pairwise debts in this group
  const groupPairwise = calculatePairwiseBalances(expenses, settlements, profiles, group.id);

  // Summary per member
  const userSummaries = calculateUserSummaries(expenses, settlements, profiles, group.id);
  const mySummary = userSummaries.find((s) => s.user.id === currentProfile.id);
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
          className="inline-flex items-center space-x-2 text-sm font-semibold text-slate-600 hover:text-slate-900 bg-white px-3.5 py-2 rounded-xl border border-slate-200 shadow-sm transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Volver a Mis Grupos</span>
        </button>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => onOpenSettleModal(group.id)}
            className="flex items-center space-x-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold px-4 py-2 rounded-xl text-sm transition border border-slate-200 shadow-sm"
          >
            <Wallet className="w-4 h-4 text-indigo-600" />
            <span>Saldar Cuenta</span>
          </button>

          <button
            onClick={() => onOpenNewExpense(group.id)}
            className="flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-4 py-2 rounded-xl text-sm shadow-sm transition"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>+ Nuevo Gasto</span>
          </button>
        </div>
      </div>

      {/* Group Card Banner & Stat Cards */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-wider font-bold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded border border-indigo-100">
                {group.category.toUpperCase()}
              </span>
              <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-semibold rounded">
                Activo
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mt-2 tracking-tight">
              {group.name}
            </h1>
            {group.description && (
              <p className="text-slate-500 text-sm mt-1 max-w-xl">{group.description}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 min-w-[140px]">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                Total Grupo
              </span>
              <span className="text-xl font-bold text-slate-900 mt-1 block">
                {formatCurrency(totalGroupSpent)}
              </span>
            </div>
            <div className={`p-4 rounded-xl border border-slate-200 bg-white min-w-[140px] ${
              Math.abs(myNet) < 0.5
                ? 'border-l-4 border-l-slate-400'
                : myNet > 0
                ? 'border-l-4 border-l-emerald-500'
                : 'border-l-4 border-l-rose-500'
            }`}>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                {myNet > 0 ? 'Te deben' : myNet < 0 ? 'Debes' : 'Tu Estado'}
              </span>
              <span
                className={`text-xl font-bold mt-1 block ${
                  Math.abs(myNet) < 0.5
                    ? 'text-slate-600'
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
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveTab('expenses')}
          className={`flex items-center space-x-2 py-3 px-5 font-semibold text-sm border-b-2 transition ${
            activeTab === 'expenses'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Receipt className="w-4 h-4" />
          <span>Gastos ({groupExpenses.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('balances')}
          className={`flex items-center space-x-2 py-3 px-5 font-semibold text-sm border-b-2 transition ${
            activeTab === 'balances'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Wallet className="w-4 h-4" />
          <span>Balances ({groupPairwise.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('members')}
          className={`flex items-center space-x-2 py-3 px-5 font-semibold text-sm border-b-2 transition ${
            activeTab === 'members'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
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
            <div className="text-center py-12 bg-white rounded-2xl border border-slate-200 p-8">
              <Receipt className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h3 className="font-bold text-slate-800">Aún no hay gastos registrados</h3>
              <p className="text-sm text-slate-500 mt-1 mb-4">
                Sé el primero en agregar un gasto para este grupo.
              </p>
              <button
                onClick={() => onOpenNewExpense(group.id)}
                className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-4 py-2 rounded-xl text-sm"
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
                  className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:border-slate-300 transition"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    {/* Left: Date, Description, Paid By */}
                    <div className="flex items-start space-x-3">
                      <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center text-slate-600 font-bold shrink-0">
                        <Receipt className="w-6 h-6 text-emerald-600" />
                      </div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <h4 className="font-bold text-slate-900 text-base">
                            {exp.description}
                          </h4>
                          {exp.source === 'gmail' && (
                            <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                              Gmail AI
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 mt-1">
                          <span className="flex items-center space-x-1">
                            <Calendar className="w-3.5 h-3.5" />
                            <span>{exp.expense_date}</span>
                          </span>
                          <span>•</span>
                          <span className="flex items-center space-x-1">
                            <Tag className="w-3.5 h-3.5" />
                            <span>{exp.category}</span>
                          </span>
                          <span>•</span>
                          <span>
                            Pagado por:{' '}
                            <strong className="text-slate-700">
                              {paidByProfile ? paidByProfile.full_name : 'Desconocido'}
                            </strong>
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Right: Amount & Actions */}
                    <div className="flex items-center justify-between sm:justify-end gap-4 border-t sm:border-t-0 pt-3 sm:pt-0 border-slate-100">
                      <div className="text-right">
                        <span className="text-lg font-extrabold text-slate-900 block">
                          {formatCurrency(exp.total_amount)}
                        </span>
                        <span className="text-xs text-slate-400 block">
                          {(exp.splits ? exp.splits : []).length} divididos
                        </span>
                      </div>

                      <div className="flex items-center space-x-1">
                        {hasItems && (
                          <button
                            onClick={() => toggleExpandExpense(exp.id)}
                            className="p-2 hover:bg-slate-100 rounded-xl text-slate-600 text-xs font-semibold flex items-center space-x-1 transition"
                            title="Ver desglose de ítems"
                          >
                            <span>Ítems</span>
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4" />
                            ) : (
                              <ChevronDown className="w-4 h-4" />
                            )}
                          </button>
                        )}

                        <button
                          onClick={() => deleteExpense(exp.id)}
                          className="p-2 hover:bg-rose-50 rounded-xl text-slate-400 hover:text-rose-600 transition"
                          title="Eliminar gasto"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Expanded Itemized Breakdown & Splits */}
                  {isExpanded && hasItems && (
                    <div className="mt-4 pt-4 border-t border-slate-100 bg-slate-50/80 -mx-5 -mb-5 p-5 rounded-b-2xl space-y-3">
                      <h5 className="text-xs font-bold uppercase text-slate-500 tracking-wider">
                        Desglose de Ítems ({exp.items?.length})
                      </h5>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {exp.items?.map((item) => (
                          <div
                            key={item.id}
                            className="flex items-center justify-between bg-white px-3 py-2 rounded-xl border border-slate-200 text-xs"
                          >
                            <span className="font-medium text-slate-700">{item.description}</span>
                            <span className="font-bold text-slate-900">
                              {formatCurrency(item.amount)}
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* Splits breakdown */}
                      <h5 className="text-xs font-bold uppercase text-slate-500 tracking-wider pt-2">
                        Reparto entre Miembros
                      </h5>
                      <div className="flex flex-wrap gap-2">
                        {exp.splits?.map((split) => {
                          const splitUser = profiles.find((p) => p.id === split.user_id);
                          return (
                            <div
                              key={split.id}
                              className="bg-white px-3 py-1.5 rounded-lg border border-slate-200 text-xs flex items-center space-x-2"
                            >
                              <img
                                src={splitUser?.avatar_url}
                                alt={splitUser?.full_name}
                                className="w-4 h-4 rounded-full"
                              />
                              <span className="text-slate-700">{splitUser?.full_name}</span>
                              <span className="font-bold text-slate-900">
                                {formatCurrency(split.amount_owed)}
                              </span>
                            </div>
                          );
                        })}
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
          <div className="bg-slate-900 text-white p-6 rounded-3xl shadow-md border border-slate-800">
            <h3 className="text-lg font-bold">Cuentas Claras en {group.name}</h3>
            <p className="text-slate-400 text-sm mt-1">
              Aquí ves quién le debe a quién dentro de este grupo. Presiona &quot;Saldar&quot; para registrar una transferencia o pago en efectivo.
            </p>
          </div>

          {groupPairwise.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 border border-slate-200 text-center">
              <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-2" />
              <h4 className="font-bold text-slate-800 text-lg">¡Todas las cuentas están al día!</h4>
              <p className="text-slate-500 text-sm mt-1">
                Nadie tiene deudas pendientes en este grupo.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {groupPairwise.map((p, idx) => {
                const isIOWed = p.creditor.id === currentProfile.id;
                const isIOwe = p.debtor.id === currentProfile.id;

                return (
                  <div
                    key={idx}
                    className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center justify-between"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="relative">
                        <img
                          src={p.debtor.avatar_url}
                          alt={p.debtor.full_name}
                          className="w-10 h-10 rounded-full border-2 border-rose-200 object-cover"
                        />
                        <span className="absolute -bottom-1 -right-1 bg-rose-500 text-white text-[9px] font-black px-1 rounded-full">
                          DEBE
                        </span>
                      </div>

                      <div className="text-sm">
                        <p className="font-bold text-slate-900">
                          {p.debtor.full_name}{' '}
                          <span className="font-normal text-slate-500">le debe a</span>{' '}
                          {p.creditor.full_name}
                        </p>
                        <p className="text-base font-extrabold text-emerald-600 mt-0.5">
                          {formatCurrency(p.amount)}
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() =>
                        onOpenSettleModal(group.id, p.debtor.id, p.creditor.id, p.amount)
                      }
                      className="bg-slate-900 hover:bg-slate-800 text-white font-bold px-3.5 py-2 rounded-xl text-xs transition"
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
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-900 text-lg">Integrantes del Grupo</h3>
            <button
              onClick={() => onOpenAddMember(group.id)}
              className="flex items-center space-x-1.5 bg-slate-900 hover:bg-slate-800 text-white px-3.5 py-2 rounded-xl text-xs font-semibold transition"
            >
              <UserPlus className="w-4 h-4" />
              <span>Añadir Integrante</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {memberProfiles.map((p) => {
              const memberRecord = groupMembers.find((m) => m.user_id === p.id);
              const isOwner = memberRecord?.role === 'owner';

              return (
                <div
                  key={p.id}
                  className="bg-white rounded-2xl p-4 border border-slate-200 flex items-center space-x-3 shadow-sm"
                >
                  <img
                    src={p.avatar_url}
                    alt={p.full_name}
                    className="w-12 h-12 rounded-full object-cover border border-slate-200"
                  />
                  <div>
                    <div className="flex items-center space-x-1.5">
                      <h4 className="font-bold text-slate-900 text-sm">{p.full_name}</h4>
                      {isOwner && (
                        <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-1.5 py-0.5 rounded-md">
                          Admin
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500">{p.email}</p>
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
