'use client';

import React, { useState } from 'react';
import { ExpenseProvider, useExpense } from '@/lib/expense-context';
import { Navbar, ActiveTab } from '@/components/Navbar';
import { usePathname, useRouter } from 'next/navigation';

function DashboardLayoutContent({ children }: { children: React.ReactNode }) {
  const { currentProfile, loading } = useExpense();
  const pathname = usePathname();
  const router = useRouter();

  // Deduce active tab from pathname
  let activeTab: ActiveTab = 'groups';
  if (pathname.includes('/my-expenses')) activeTab = 'expenses';
  else if (pathname.includes('/drafts')) activeTab = 'drafts';
  else if (pathname.includes('/balances')) activeTab = 'balances';

  React.useEffect(() => {
    if (!loading && !currentProfile) {
      router.push('/login');
    }
  }, [loading, currentProfile, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-zinc-900 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-zinc-500 font-medium">Cargando datos de la sesión...</p>
        </div>
      </div>
    );
  }

  if (!currentProfile) {
    return null;
  }

  const handleTabChange = (tab: ActiveTab) => {
    if (tab === 'groups') router.push('/groups');
    else if (tab === 'expenses') router.push('/my-expenses');
    else if (tab === 'drafts') router.push('/drafts');
    else if (tab === 'balances') router.push('/balances');
  };

  return (
    <div className="min-h-screen bg-zinc-50/50 font-sans text-zinc-900 flex flex-col justify-between selection:bg-zinc-900 selection:text-white">
      <div>
        <Navbar
          activeTab={activeTab}
          setActiveTab={handleTabChange}
          onOpenNewExpense={() => {}} // Will be handled contextually
          onOpenNewGroup={() => {}} // Will be handled contextually
        />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12">
          {children}
        </main>
      </div>

      <footer className="bg-white border-t border-zinc-200 mt-auto py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-zinc-500">
          <div className="flex items-center space-x-2">
            <span className="font-semibold text-zinc-900">Deudita</span>
            <span>&copy; {new Date().getFullYear()}</span>
          </div>
          <p>Plataforma Multi-Grupo</p>
        </div>
      </footer>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardLayoutContent>{children}</DashboardLayoutContent>
  );
}
