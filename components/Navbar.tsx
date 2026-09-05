'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useExpense } from '@/lib/expense-context';
import {
  LayoutDashboard,
  Users,
  UserPlus,
  Wallet,
  Receipt,
  MailCheck,
  Plus,
  ChevronDown,
  LogOut,
  UserCheck,
  Settings,
  SplitSquareHorizontal,
  Menu,
  X,
  Sparkles,
} from 'lucide-react';

import { NotificationCenter } from '@/components/NotificationCenter';
import { ProfileSettingsModal } from '@/components/ProfileSettingsModal';

export type ActiveTab = 'dashboard' | 'groups' | 'friends' | 'balances' | 'expenses' | 'drafts';

interface NavbarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  onOpenNewExpense: () => void;
  onOpenNewGroup?: () => void;
}

export function Navbar({
  activeTab,
  setActiveTab,
  onOpenNewExpense,
}: NavbarProps) {
  const { currentProfile, drafts, logout } = useExpense();
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const pendingDraftsCount = drafts.filter((d) => d.status === 'pending').length;

  if (!currentProfile) return null;

  const isTabActive = (tab: ActiveTab) => activeTab === tab;

  return (
    <>
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-zinc-100/90 shadow-2xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-15 sm:h-16">
            {/* Brand Logo & Name */}
            <div
              className="flex items-center space-x-2.5 cursor-pointer group"
              onClick={() => setActiveTab('dashboard')}
            >
              <div className="w-9 h-9 rounded-xl bg-zinc-950 flex items-center justify-center shadow-xs group-hover:scale-105 transition-transform duration-300">
                <SplitSquareHorizontal className="w-5 h-5 text-white" />
              </div>
              <span className="font-bold text-lg text-zinc-900 leading-tight tracking-tight">
                Deudita
              </span>
            </div>

            {/* Navigation Tabs (Desktop) */}
            <nav className="hidden lg:flex items-center space-x-1 bg-zinc-100/70 p-1.5 rounded-2xl ring-1 ring-zinc-200/50">
              <button
                onClick={() => setActiveTab('dashboard')}
                className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-xl text-sm transition-all cursor-pointer ${
                  activeTab === 'dashboard'
                    ? 'bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200 font-semibold'
                    : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200/50'
                }`}
              >
                <LayoutDashboard className="w-4 h-4" />
                <span>Dashboard</span>
              </button>

              <button
                onClick={() => setActiveTab('groups')}
                className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-xl text-sm transition-all cursor-pointer ${
                  activeTab === 'groups'
                    ? 'bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200 font-semibold'
                    : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200/50'
                }`}
              >
                <Users className="w-4 h-4" />
                <span>Grupos</span>
              </button>

              <button
                onClick={() => setActiveTab('friends')}
                className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-xl text-sm transition-all cursor-pointer ${
                  activeTab === 'friends'
                    ? 'bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200 font-semibold'
                    : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200/50'
                }`}
              >
                <UserPlus className="w-4 h-4" />
                <span>Amigos</span>
              </button>

              <button
                onClick={() => setActiveTab('balances')}
                className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-xl text-sm transition-all cursor-pointer ${
                  activeTab === 'balances'
                    ? 'bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200 font-semibold'
                    : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200/50'
                }`}
              >
                <Wallet className="w-4 h-4" />
                <span>Balances</span>
              </button>

              <button
                onClick={() => setActiveTab('expenses')}
                className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-xl text-sm transition-all cursor-pointer ${
                  activeTab === 'expenses'
                    ? 'bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200 font-semibold'
                    : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200/50'
                }`}
              >
                <Receipt className="w-4 h-4" />
                <span>Gastos</span>
              </button>

              <button
                onClick={() => setActiveTab('drafts')}
                className={`relative flex items-center space-x-2 px-3.5 py-1.5 rounded-xl text-sm transition-all cursor-pointer ${
                  activeTab === 'drafts'
                    ? 'bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200 font-semibold'
                    : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200/50'
                }`}
              >
                <MailCheck className="w-4 h-4" />
                <span>Tickets</span>
                {pendingDraftsCount > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 text-[10px] font-bold bg-rose-500 text-white rounded-full">
                    {pendingDraftsCount}
                  </span>
                )}
              </button>
            </nav>

            {/* Right Action Area */}
            <div className="flex items-center space-x-2 sm:space-x-3">
              {/* Desktop Global Add Button (only on desktop where bottom bar is hidden) */}
              <div className="hidden lg:flex items-center space-x-2 mr-1">
                <button
                  onClick={onOpenNewExpense}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-3.5 py-2 rounded-xl text-sm shadow-xs transition-all active:scale-95 flex items-center space-x-1.5 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Nuevo gasto</span>
                </button>
              </div>

              {/* Notifications Bell */}
              <NotificationCenter />

              {/* Profile Avatar Button */}
              <div className="relative">
                <button
                  onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
                  className="flex items-center space-x-1.5 p-1 rounded-full hover:bg-zinc-100 transition cursor-pointer min-h-[40px]"
                  title="Opciones de perfil"
                  aria-label="Opciones de perfil"
                >
                  {currentProfile.avatar_url ? (
                    <Image
                      src={currentProfile.avatar_url}
                      alt={currentProfile.full_name}
                      width={34}
                      height={34}
                      className="w-8.5 h-8.5 rounded-full object-cover ring-2 ring-zinc-100 shadow-2xs"
                      unoptimized
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-8.5 h-8.5 rounded-full bg-zinc-950 text-white flex items-center justify-center text-xs font-bold shadow-2xs">
                      {currentProfile.full_name ? currentProfile.full_name.charAt(0).toUpperCase() : 'U'}
                    </div>
                  )}
                </button>

                {profileDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-64 bg-white border border-zinc-200 rounded-2xl shadow-xl py-2 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                    <div className="px-4 py-3 border-b border-zinc-100 bg-zinc-50">
                      <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider flex items-center gap-1">
                        <UserCheck className="w-3 h-3 text-emerald-600" />
                        <span>Sesión Activa</span>
                      </p>
                      <p className="text-sm font-semibold text-zinc-900 truncate mt-1">
                        {currentProfile.full_name}
                      </p>
                      <p className="text-xs text-zinc-500 truncate">{currentProfile.email}</p>
                    </div>

                    <div className="p-1.5 space-y-0.5">
                      <Link
                        href="/drafts"
                        onClick={() => setProfileDropdownOpen(false)}
                        className="w-full flex items-center space-x-2 px-3 py-2.5 text-left text-sm font-medium text-zinc-700 hover:bg-zinc-100 rounded-xl transition cursor-pointer"
                      >
                        <Receipt className="w-4 h-4 text-zinc-500" />
                        <span>Tickets y Borradores</span>
                      </Link>

                      <Link
                        href="/email-templates"
                        onClick={() => setProfileDropdownOpen(false)}
                        className="w-full flex items-center space-x-2 px-3 py-2.5 text-left text-sm font-medium text-zinc-700 hover:bg-zinc-100 rounded-xl transition cursor-pointer"
                      >
                        <Sparkles className="w-4 h-4 text-indigo-600" />
                        <span>Plantillas de Correos</span>
                      </Link>

                      <button
                        onClick={() => {
                          setProfileDropdownOpen(false);
                          setIsProfileModalOpen(true);
                        }}
                        className="w-full flex items-center space-x-2 px-3 py-2.5 text-left text-sm font-medium text-zinc-700 hover:bg-zinc-100 rounded-xl transition cursor-pointer"
                      >
                        <Settings className="w-4 h-4 text-zinc-500" />
                        <span>Mi Perfil y Ajustes</span>
                      </button>

                      <button
                        onClick={() => {
                          setProfileDropdownOpen(false);
                          logout();
                        }}
                        className="w-full flex items-center space-x-2 px-3 py-2.5 text-left text-sm font-medium text-rose-600 hover:bg-rose-50 rounded-xl transition cursor-pointer"
                      >
                        <LogOut className="w-4 h-4" />
                        <span>Cerrar Sesión</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Bottom Navigation Bar (Cellular Optimized matching screenshot) */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-zinc-200/80 px-2 py-1.5 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] flex items-center justify-around shadow-lg">
        {/* Tab 1: Inicio */}
        <button
          onClick={() => setActiveTab('dashboard')}
          className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition-all min-h-[44px] flex-1 cursor-pointer ${
            isTabActive('dashboard')
              ? 'text-emerald-600 font-bold'
              : 'text-zinc-500 hover:text-zinc-800 font-medium'
          }`}
        >
          <LayoutDashboard className={`w-5 h-5 ${isTabActive('dashboard') ? 'text-emerald-600' : 'text-zinc-600'}`} />
          <span className="text-[10.5px] mt-1 leading-none">Inicio</span>
        </button>

        {/* Tab 2: Grupos */}
        <button
          onClick={() => setActiveTab('groups')}
          className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition-all min-h-[44px] flex-1 cursor-pointer ${
            isTabActive('groups')
              ? 'text-emerald-600 font-bold'
              : 'text-zinc-500 hover:text-zinc-800 font-medium'
          }`}
        >
          <Users className={`w-5 h-5 ${isTabActive('groups') ? 'text-emerald-600 stroke-[2.2]' : 'text-zinc-600'}`} />
          <span className="text-[10.5px] mt-1 leading-none">Grupos</span>
        </button>

        {/* Tab 3: Center Floating Plus Action Button */}
        <div className="flex items-center justify-center flex-1">
          <button
            onClick={onOpenNewExpense}
            className="w-12 h-12 -mt-5 rounded-full bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white flex items-center justify-center shadow-lg shadow-emerald-600/30 ring-4 ring-white transition-transform cursor-pointer"
            title="Nuevo gasto"
            aria-label="Nuevo gasto"
          >
            <Plus className="w-6 h-6 stroke-[2.5]" />
          </button>
        </div>

        {/* Tab 4: Balances */}
        <button
          onClick={() => setActiveTab('balances')}
          className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition-all min-h-[44px] flex-1 cursor-pointer ${
            isTabActive('balances')
              ? 'text-emerald-600 font-bold'
              : 'text-zinc-500 hover:text-zinc-800 font-medium'
          }`}
        >
          <Wallet className={`w-5 h-5 ${isTabActive('balances') ? 'text-emerald-600' : 'text-zinc-600'}`} />
          <span className="text-[10.5px] mt-1 leading-none">Balances</span>
        </button>

        {/* Tab 5: Más */}
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition-all min-h-[44px] flex-1 cursor-pointer ${
            isMobileMenuOpen || isTabActive('friends') || isTabActive('expenses') || isTabActive('drafts')
              ? 'text-emerald-600 font-bold'
              : 'text-zinc-500 hover:text-zinc-800 font-medium'
          }`}
        >
          <Menu className={`w-5 h-5 ${isMobileMenuOpen ? 'text-emerald-600' : 'text-zinc-600'}`} />
          <span className="text-[10.5px] mt-1 leading-none">Más</span>
        </button>
      </nav>

      {/* Mobile Drawer / Menu when tapping "Más" */}
      {isMobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex flex-col justify-end animate-in fade-in duration-150">
          <div className="bg-white rounded-t-3xl p-5 space-y-3 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] shadow-2xl border-t border-zinc-200">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
              <span className="text-sm font-bold text-zinc-900">Opciones adicionales</span>
              <button
                onClick={() => setIsMobileMenuOpen(false)}
                className="p-1 rounded-full text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-1">
              <button
                onClick={() => {
                  setActiveTab('friends');
                  setIsMobileMenuOpen(false);
                }}
                className="w-full flex items-center justify-between p-3 rounded-2xl hover:bg-zinc-50 text-left transition cursor-pointer"
              >
                <div className="flex items-center space-x-3">
                  <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
                    <UserPlus className="w-5 h-5" />
                  </div>
                  <span className="font-semibold text-sm text-zinc-900">Amigos</span>
                </div>
              </button>

              <button
                onClick={() => {
                  setActiveTab('expenses');
                  setIsMobileMenuOpen(false);
                }}
                className="w-full flex items-center justify-between p-3 rounded-2xl hover:bg-zinc-50 text-left transition cursor-pointer"
              >
                <div className="flex items-center space-x-3">
                  <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
                    <Receipt className="w-5 h-5" />
                  </div>
                  <span className="font-semibold text-sm text-zinc-900">Todos los gastos</span>
                </div>
              </button>

              <button
                onClick={() => {
                  setActiveTab('drafts');
                  setIsMobileMenuOpen(false);
                }}
                className="w-full flex items-center justify-between p-3 rounded-2xl hover:bg-zinc-50 text-left transition cursor-pointer"
              >
                <div className="flex items-center space-x-3">
                  <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
                    <MailCheck className="w-5 h-5" />
                  </div>
                  <span className="font-semibold text-sm text-zinc-900">Tickets y Borradores</span>
                </div>
                {pendingDraftsCount > 0 && (
                  <span className="px-2 py-0.5 text-xs font-bold bg-rose-500 text-white rounded-full">
                    {pendingDraftsCount}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <ProfileSettingsModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
      />
    </>
  );
}
