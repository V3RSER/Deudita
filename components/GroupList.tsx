'use client';

import React from 'react';
import { useExpense } from '@/lib/expense-context';
import { Group, GroupCategory } from '@/lib/types';
import { formatCurrency, calculateUserSummaries } from '@/lib/balance-utils';
import {
  Home,
  Plane,
  Heart,
  Calendar,
  Briefcase,
  Folder,
  Users,
  ArrowRight,
  Plus,
  Receipt,
  TrendingUp,
  TrendingDown,
  MinusCircle,
} from 'lucide-react';

interface GroupListProps {
  onSelectGroup: (group: Group) => void;
  onOpenNewGroup: () => void;
}

const CATEGORY_ICONS: Record<GroupCategory, React.ReactNode> = {
  home: <Home className="w-5 h-5 text-indigo-500" />,
  trip: <Plane className="w-5 h-5 text-sky-500" />,
  couple: <Heart className="w-5 h-5 text-rose-500" />,
  event: <Calendar className="w-5 h-5 text-amber-500" />,
  work: <Briefcase className="w-5 h-5 text-teal-500" />,
  other: <Folder className="w-5 h-5 text-slate-500" />,
};

const CATEGORY_LABELS: Record<GroupCategory, string> = {
  home: 'Hogar / Arriendo',
  trip: 'Viaje / Vacaciones',
  couple: 'Pareja',
  event: 'Evento / Asado',
  work: 'Oficina / Trabajo',
  other: 'Otro',
};

export function GroupList({ onSelectGroup, onOpenNewGroup }: GroupListProps) {
  const { currentProfile, groups, members, expenses, settlements, profiles } = useExpense();

  // Filter groups where current user is a member
  const myGroupIds = new Set(
    members.filter((m) => m.user_id === currentProfile.id).map((m) => m.group_id)
  );

  const userGroups = groups.filter((g) => myGroupIds.has(g.id));

  return (
    <div className="space-y-8">
      {/* Overview Banner */}
      <div className="bg-gradient-to-r from-indigo-900 via-slate-900 to-indigo-950 rounded-3xl p-6 sm:p-8 border border-indigo-900/50 text-white shadow-lg relative overflow-hidden">
        <div className="relative z-10 max-w-3xl">
          <span className="text-xs font-semibold uppercase tracking-wider text-indigo-300 bg-indigo-500/20 px-3 py-1 rounded-full border border-indigo-400/30">
            Plataforma Multi-Grupo
          </span>
          <h1 className="text-2xl sm:text-3xl font-bold mt-3 tracking-tight">
            Hola, {currentProfile.full_name.split(' ')[0]} 👋
          </h1>
          <p className="text-indigo-100/80 mt-2 text-sm sm:text-base leading-relaxed">
            Administra tus grupos compartidos, registra gastos con desglose de ítems y consulta cuántas cuentas tienes pendientes en tiempo real.
          </p>

          <div className="mt-6 flex flex-wrap gap-4 items-center">
            <button
              onClick={onOpenNewGroup}
              className="flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-5 py-2.5 rounded-xl shadow-md transition"
            >
              <Plus className="w-5 h-5" />
              <span>Crear Nuevo Grupo</span>
            </button>
          </div>
        </div>

        {/* Decorative background grid */}
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-indigo-500/10 blur-2xl pointer-events-none" />
      </div>

      {/* Group Grid Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Mis Grupos ({userGroups.length})</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Selecciona un grupo para ver gastos, divisiones e ítems.
          </p>
        </div>
      </div>

      {/* Group Cards */}
      {userGroups.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-3xl border border-slate-200 p-8 shadow-sm">
          <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto text-slate-400 mb-4">
            <Users className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-slate-800">Aún no perteneces a ningún grupo</h3>
          <p className="text-slate-500 text-sm max-w-md mx-auto mt-1 mb-6">
            Crea tu primer grupo para empezar a dividir gastos con tus amigos, roomies o familiares.
          </p>
          <button
            onClick={onOpenNewGroup}
            className="inline-flex items-center space-x-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-5 py-2.5 rounded-xl transition"
          >
            <Plus className="w-5 h-5" />
            <span>Crear un Grupo</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {userGroups.map((group) => {
            const groupMembers = members.filter((m) => m.group_id === group.id);
            const memberProfiles = groupMembers
              .map((m) => profiles.find((p) => p.id === m.user_id))
              .filter((p): p is NonNullable<typeof p> => p !== undefined);

            const groupExpenses = expenses.filter((e) => e.group_id === group.id);
            const totalGroupSpent = groupExpenses.reduce((acc, curr) => acc + curr.total_amount, 0);

            // Calculate current user's balance in this specific group
            const userSummaries = calculateUserSummaries(expenses, settlements, profiles, group.id);
            const mySummary = userSummaries.find((s) => s.user.id === currentProfile.id);
            const netBalance = mySummary ? mySummary.netBalance : 0;

            return (
              <div
                key={group.id}
                onClick={() => onSelectGroup(group)}
                className="group bg-white rounded-2xl border border-slate-200 p-6 shadow-sm hover:shadow-md hover:border-indigo-300 transition-all cursor-pointer flex flex-col justify-between relative overflow-hidden"
              >
                <div>
                  {/* Category & Status Header */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-2.5 bg-indigo-50/80 px-3 py-1.5 rounded-xl border border-indigo-100/50">
                      {CATEGORY_ICONS[group.category]}
                      <span className="text-xs font-semibold text-indigo-900">
                        {CATEGORY_LABELS[group.category]}
                      </span>
                    </div>

                    <span className="text-xs text-slate-400 font-medium flex items-center space-x-1">
                      <Receipt className="w-3.5 h-3.5" />
                      <span>{groupExpenses.length} gastos</span>
                    </span>
                  </div>

                  {/* Group Name & Description */}
                  <h3 className="text-lg font-bold text-slate-900 group-hover:text-indigo-600 transition">
                    {group.name}
                  </h3>
                  {group.description && (
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                      {group.description}
                    </p>
                  )}

                  {/* Member Avatars */}
                  <div className="mt-5 flex items-center justify-between">
                    <div className="flex -space-x-2 overflow-hidden">
                      {memberProfiles.map((p) => (
                        <img
                          key={p.id}
                          src={p.avatar_url}
                          alt={p.full_name}
                          title={p.full_name}
                          className="w-8 h-8 rounded-full border-2 border-white object-cover shadow-sm"
                        />
                      ))}
                    </div>
                    <span className="text-xs font-medium text-slate-500">
                      {memberProfiles.length} integrantes
                    </span>
                  </div>
                </div>

                {/* Footer Metrics */}
                <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
                  <div>
                    <span className="text-[11px] uppercase font-semibold text-slate-400 tracking-wider block">
                      Total Gastado
                    </span>
                    <span className="text-sm font-bold text-slate-800">
                      {formatCurrency(totalGroupSpent)}
                    </span>
                  </div>

                  <div className="text-right">
                    <span className="text-[11px] uppercase font-semibold text-slate-400 tracking-wider block">
                      Tu Estado
                    </span>
                    {Math.abs(netBalance) < 0.5 ? (
                      <span className="inline-flex items-center text-xs font-semibold text-slate-500">
                        <MinusCircle className="w-3.5 h-3.5 mr-1 text-slate-400" />
                        Al día
                      </span>
                    ) : netBalance > 0 ? (
                      <span className="inline-flex items-center text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                        <TrendingUp className="w-3.5 h-3.5 mr-1 text-emerald-500" />
                        Te deben {formatCurrency(netBalance)}
                      </span>
                    ) : (
                      <span className="inline-flex items-center text-xs font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">
                        <TrendingDown className="w-3.5 h-3.5 mr-1 text-rose-500" />
                        Debes {formatCurrency(Math.abs(netBalance))}
                      </span>
                    )}
                  </div>
                </div>

                {/* Arrow indicator */}
                <div className="mt-3 flex justify-end">
                  <span className="text-xs font-semibold text-emerald-600 group-hover:translate-x-1 transition-transform inline-flex items-center space-x-1">
                    <span>Ver grupo</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
