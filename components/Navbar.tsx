'use client';

import React from 'react';
import { useExpense } from '@/lib/expense-context';
import {
  Users,
  Wallet,
  Receipt,
  MailCheck,
  Database,
  Plus,
  ChevronDown,
  Sparkles,
  Layers,
} from 'lucide-react';

export type ActiveTab = 'groups' | 'balances' | 'expenses' | 'drafts' | 'database';

interface NavbarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  onOpenNewExpense: () => void;
  onOpenNewGroup: () => void;
}

export function Navbar({
  activeTab,
  setActiveTab,
  onOpenNewExpense,
  onOpenNewGroup,
}: NavbarProps) {
  const { currentProfile, setCurrentProfile, profiles, drafts } = useExpense();
  const [profileDropdownOpen, setProfileDropdownOpen] = React.useState(false);

  const pendingDraftsCount = drafts.filter((d) => d.status === 'pending').length;

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-slate-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand Logo & Name */}
          <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setActiveTab('groups')}>
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-lg shadow-sm">
              S
            </div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-xl text-slate-900 tracking-tight">
                SplitPay
              </span>
              <span className="hidden md:inline-block text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-100">
                Multi-Grupo
              </span>
            </div>
          </div>

          {/* Navigation Tabs (Desktop) */}
          <nav className="hidden lg:flex items-center space-x-1 bg-slate-100/80 p-1 rounded-xl border border-slate-200/60">
            <button
              onClick={() => setActiveTab('groups')}
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'groups'
                  ? 'bg-white text-indigo-700 shadow-sm font-semibold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
              }`}
            >
              <Users className="w-4 h-4 text-indigo-600" />
              <span>Grupos</span>
            </button>

            <button
              onClick={() => setActiveTab('balances')}
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'balances'
                  ? 'bg-white text-indigo-700 shadow-sm font-semibold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
              }`}
            >
              <Wallet className="w-4 h-4 text-indigo-600" />
              <span>Balances Consolidados</span>
            </button>

            <button
              onClick={() => setActiveTab('expenses')}
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'expenses'
                  ? 'bg-white text-indigo-700 shadow-sm font-semibold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
              }`}
            >
              <Receipt className="w-4 h-4 text-indigo-600" />
              <span>Mis Gastos</span>
            </button>

            <button
              onClick={() => setActiveTab('drafts')}
              className={`relative flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'drafts'
                  ? 'bg-white text-indigo-700 shadow-sm font-semibold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
              }`}
            >
              <MailCheck className="w-4 h-4 text-indigo-600" />
              <span>Detectados</span>
              {pendingDraftsCount > 0 && (
                <span className="ml-1 px-2 py-0.5 text-[10px] font-bold bg-gradient-to-r from-rose-500 to-pink-500 text-white rounded-full">
                  {pendingDraftsCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('database')}
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'database'
                  ? 'bg-white text-indigo-700 shadow-sm font-semibold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
              }`}
            >
              <Database className="w-4 h-4 text-indigo-600" />
              <span>Esquema SQL</span>
            </button>
          </nav>

          {/* Right Action Area: Profile Switcher & New Expense */}
          <div className="flex items-center space-x-3">
            {/* Active Profile Selector */}
            <div className="relative">
              <button
                onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
                className="flex items-center space-x-2 bg-slate-50 hover:bg-slate-100 text-slate-700 px-3 py-1.5 rounded-xl border border-slate-200 transition text-sm font-medium"
              >
                <img
                  src={currentProfile.avatar_url}
                  alt={currentProfile.full_name}
                  className="w-6 h-6 rounded-full object-cover border border-indigo-500/40"
                />
                <span className="hidden sm:inline max-w-[110px] truncate">
                  {currentProfile.full_name}
                </span>
                <ChevronDown className="w-4 h-4 text-slate-400" />
              </button>

              {profileDropdownOpen && (
                <div className="absolute right-0 mt-2 w-64 bg-white border border-slate-200 rounded-2xl shadow-xl py-2 z-50">
                  <div className="px-4 py-2 border-b border-slate-100">
                    <p className="text-xs text-slate-400 uppercase font-semibold tracking-wider">
                      Cambiar Usuario Activo
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Simula la vista desde la perspectiva de:
                    </p>
                  </div>
                  <div className="max-h-60 overflow-y-auto py-1">
                    {profiles.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => {
                          setCurrentProfile(p);
                          setProfileDropdownOpen(false);
                        }}
                        className={`w-full flex items-center space-x-3 px-4 py-2 text-left text-sm hover:bg-slate-50 transition ${
                          p.id === currentProfile.id
                            ? 'bg-indigo-50 text-indigo-700 font-semibold border-l-2 border-indigo-600'
                            : 'text-slate-600'
                        }`}
                      >
                        <img
                          src={p.avatar_url}
                          alt={p.full_name}
                          className="w-7 h-7 rounded-full object-cover"
                        />
                        <div className="truncate">
                          <p className="leading-none">{p.full_name}</p>
                          <p className="text-xs text-slate-400 truncate mt-0.5">{p.email}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* CTA Buttons */}
            <button
              onClick={onOpenNewGroup}
              className="hidden sm:flex items-center space-x-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-2 rounded-xl text-sm font-medium border border-slate-200 transition"
            >
              <Plus className="w-4 h-4 text-slate-600" />
              <span>Nuevo Grupo</span>
            </button>

            <button
              onClick={onOpenNewExpense}
              className="flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-4 py-2 rounded-xl shadow-sm text-sm transition transform active:scale-95"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>+ Nuevo Gasto</span>
            </button>
          </div>
        </div>

        {/* Mobile Navigation Bar */}
        <div className="lg:hidden flex items-center justify-around py-2 border-t border-slate-200 text-xs bg-slate-50">
          <button
            onClick={() => setActiveTab('groups')}
            className={`flex flex-col items-center space-y-1 py-1 px-2 rounded-lg ${
              activeTab === 'groups' ? 'text-indigo-600 font-bold' : 'text-slate-500'
            }`}
          >
            <Users className="w-5 h-5" />
            <span>Grupos</span>
          </button>
          <button
            onClick={() => setActiveTab('balances')}
            className={`flex flex-col items-center space-y-1 py-1 px-2 rounded-lg ${
              activeTab === 'balances' ? 'text-indigo-600 font-bold' : 'text-slate-500'
            }`}
          >
            <Wallet className="w-5 h-5" />
            <span>Balances</span>
          </button>
          <button
            onClick={() => setActiveTab('expenses')}
            className={`flex flex-col items-center space-y-1 py-1 px-2 rounded-lg ${
              activeTab === 'expenses' ? 'text-indigo-600 font-bold' : 'text-slate-500'
            }`}
          >
            <Receipt className="w-5 h-5" />
            <span>Gastos</span>
          </button>
          <button
            onClick={() => setActiveTab('drafts')}
            className={`relative flex flex-col items-center space-y-1 py-1 px-2 rounded-lg ${
              activeTab === 'drafts' ? 'text-indigo-600 font-bold' : 'text-slate-500'
            }`}
          >
            <MailCheck className="w-5 h-5" />
            <span>Detectados</span>
            {pendingDraftsCount > 0 && (
              <span className="absolute -top-1 right-1 w-2.5 h-2.5 bg-rose-500 rounded-full" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('database')}
            className={`flex flex-col items-center space-y-1 py-1 px-2 rounded-lg ${
              activeTab === 'database' ? 'text-indigo-600 font-bold' : 'text-slate-500'
            }`}
          >
            <Database className="w-5 h-5" />
            <span>SQL</span>
          </button>
        </div>
      </div>
    </header>
  );
}
