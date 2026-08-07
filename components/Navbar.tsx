'use client';

import React from 'react';
import Image from 'next/image';
import { useExpense } from '@/lib/expense-context';
import {
  Users,
  Wallet,
  Receipt,
  MailCheck,
  Plus,
  ChevronDown,
  LogOut,
  UserCheck,
  SplitSquareHorizontal
} from 'lucide-react';

export type ActiveTab = 'groups' | 'balances' | 'expenses' | 'drafts';

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
  const { currentProfile, drafts, logout } = useExpense();
  const [profileDropdownOpen, setProfileDropdownOpen] = React.useState(false);

  const pendingDraftsCount = drafts.filter((d) => d.status === 'pending').length;

  if (!currentProfile) return null;

  return (
    <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-zinc-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand Logo & Name */}
          <div className="flex items-center space-x-3 cursor-pointer group" onClick={() => setActiveTab('groups')}>
            <div className="w-9 h-9 rounded-xl bg-zinc-900 flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform duration-300">
              <SplitSquareHorizontal className="w-5 h-5 text-white" />
            </div>
            <div className="flex flex-col">
              <span className="font-semibold text-lg text-zinc-900 leading-tight tracking-tight">
                SplitPay
              </span>
            </div>
          </div>

          {/* Navigation Tabs (Desktop) */}
          <nav className="hidden lg:flex items-center space-x-2 bg-zinc-100/50 p-1 rounded-xl">
            <button
              onClick={() => setActiveTab('groups')}
              className={`flex items-center space-x-2 px-4 py-1.5 rounded-lg text-sm transition-all ${
                activeTab === 'groups'
                  ? 'bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200 font-medium'
                  : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200/50'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Grupos</span>
            </button>

            <button
              onClick={() => setActiveTab('balances')}
              className={`flex items-center space-x-2 px-4 py-1.5 rounded-lg text-sm transition-all ${
                activeTab === 'balances'
                  ? 'bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200 font-medium'
                  : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200/50'
              }`}
            >
              <Wallet className="w-4 h-4" />
              <span>Balances</span>
            </button>

            <button
              onClick={() => setActiveTab('expenses')}
              className={`flex items-center space-x-2 px-4 py-1.5 rounded-lg text-sm transition-all ${
                activeTab === 'expenses'
                  ? 'bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200 font-medium'
                  : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200/50'
              }`}
            >
              <Receipt className="w-4 h-4" />
              <span>Gastos</span>
            </button>

            <button
              onClick={() => setActiveTab('drafts')}
              className={`relative flex items-center space-x-2 px-4 py-1.5 rounded-lg text-sm transition-all ${
                activeTab === 'drafts'
                  ? 'bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200 font-medium'
                  : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200/50'
              }`}
            >
              <MailCheck className="w-4 h-4" />
              <span>Detectados</span>
              {pendingDraftsCount > 0 && (
                <span className="ml-1 px-1.5 py-0.5 text-[10px] font-semibold bg-rose-500 text-white rounded-full">
                  {pendingDraftsCount}
                </span>
              )}
            </button>
          </nav>

          {/* Right Action Area: Profile Switcher & New Expense */}
          <div className="flex items-center space-x-4">
            {/* Active Profile Selector */}
            <div className="relative">
              <button
                onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
                className="flex items-center space-x-2 bg-transparent hover:bg-zinc-100 text-zinc-700 px-2 py-1.5 rounded-xl transition text-sm font-medium"
              >
                {currentProfile.avatar_url ? (
                  <Image
                    src={currentProfile.avatar_url}
                    alt={currentProfile.full_name}
                    width={28}
                    height={28}
                    className="w-7 h-7 rounded-full object-cover ring-2 ring-white shadow-sm"
                    unoptimized
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-zinc-900 text-white flex items-center justify-center text-xs font-bold ring-2 ring-white shadow-sm">
                    {currentProfile.full_name ? currentProfile.full_name.charAt(0).toUpperCase() : 'U'}
                  </div>
                )}
                <ChevronDown className="w-4 h-4 text-zinc-400" />
              </button>

              {profileDropdownOpen && (
                <div className="absolute right-0 mt-2 w-64 bg-white border border-zinc-200 rounded-2xl shadow-xl py-2 z-50 overflow-hidden">
                  <div className="px-4 py-3 border-b border-zinc-100 bg-zinc-50">
                    <p className="text-[10px] text-zinc-500 uppercase font-semibold tracking-wider flex items-center gap-1">
                      <UserCheck className="w-3 h-3" />
                      <span>Sesión Activa</span>
                    </p>
                    <p className="text-sm font-medium text-zinc-900 truncate mt-1">
                      {currentProfile.full_name}
                    </p>
                    <p className="text-[11px] text-zinc-500 truncate">{currentProfile.email}</p>
                  </div>

                  <div className="p-1.5">
                    <button
                      onClick={() => {
                        setProfileDropdownOpen(false);
                        logout();
                      }}
                      className="w-full flex items-center space-x-2 px-3 py-2 text-left text-sm font-medium text-rose-600 hover:bg-rose-50 rounded-xl transition"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>Cerrar Sesión</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* CTA Buttons */}
            <button
              onClick={onOpenNewGroup}
              className="hidden sm:flex items-center space-x-1.5 text-zinc-600 hover:text-zinc-900 px-3 py-2 text-sm font-medium transition"
            >
              <span>Nuevo Grupo</span>
            </button>

            <button
              onClick={onOpenNewExpense}
              className="flex items-center space-x-1.5 bg-zinc-900 hover:bg-zinc-800 text-white font-medium px-4 py-2 rounded-full shadow-sm text-sm transition-all active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>Nuevo Gasto</span>
            </button>
          </div>
        </div>

        {/* Mobile Navigation Bar */}
        <div className="lg:hidden flex items-center justify-around py-3 border-t border-zinc-100 text-xs bg-white">
          <button
            onClick={() => setActiveTab('groups')}
            className={`flex flex-col items-center space-y-1 py-1 px-3 rounded-xl transition-colors ${
              activeTab === 'groups' ? 'text-zinc-900 bg-zinc-100' : 'text-zinc-500'
            }`}
          >
            <Users className="w-5 h-5" />
            <span className="font-medium">Grupos</span>
          </button>
          <button
            onClick={() => setActiveTab('balances')}
            className={`flex flex-col items-center space-y-1 py-1 px-3 rounded-xl transition-colors ${
              activeTab === 'balances' ? 'text-zinc-900 bg-zinc-100' : 'text-zinc-500'
            }`}
          >
            <Wallet className="w-5 h-5" />
            <span className="font-medium">Balances</span>
          </button>
          <button
            onClick={() => setActiveTab('expenses')}
            className={`flex flex-col items-center space-y-1 py-1 px-3 rounded-xl transition-colors ${
              activeTab === 'expenses' ? 'text-zinc-900 bg-zinc-100' : 'text-zinc-500'
            }`}
          >
            <Receipt className="w-5 h-5" />
            <span className="font-medium">Gastos</span>
          </button>
          <button
            onClick={() => setActiveTab('drafts')}
            className={`relative flex flex-col items-center space-y-1 py-1 px-3 rounded-xl transition-colors ${
              activeTab === 'drafts' ? 'text-zinc-900 bg-zinc-100' : 'text-zinc-500'
            }`}
          >
            <MailCheck className="w-5 h-5" />
            <span className="font-medium">Tickets</span>
            {pendingDraftsCount > 0 && (
              <span className="absolute top-1 right-2 w-2 h-2 bg-rose-500 rounded-full ring-2 ring-white" />
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
