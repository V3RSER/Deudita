'use client';

import React, { useState, useEffect } from 'react';
import { ExpenseProvider, useExpense } from '@/lib/expense-context';
import { Navbar, ActiveTab } from '@/components/Navbar';
import { usePathname, useRouter } from 'next/navigation';
import { CreateGroupModal } from '@/components/CreateGroupModal';
import { NewExpenseModal } from '@/components/NewExpenseModal';
import { ProfileSettingsModal } from '@/components/ProfileSettingsModal';

function DashboardLayoutContent({ children }: { children: React.ReactNode }) {
  const { currentProfile, loading, completeOnboarding } = useExpense();
  const pathname = usePathname();
  const router = useRouter();

  const [isNewGroupOpen, setIsNewGroupOpen] = useState(false);
  const [isNewExpenseOpen, setIsNewExpenseOpen] = useState(false);
  const [hasDismissedOnboarding, setHasDismissedOnboarding] = useState(false);

  const isOnboardingOpen = !loading && currentProfile?.onboarding_completed === false && !hasDismissedOnboarding;

  // Deduce active tab from pathname
  let activeTab: ActiveTab = 'dashboard';
  if (pathname.includes('/groups')) activeTab = 'groups';
  else if (pathname.includes('/friends')) activeTab = 'friends';
  else if (pathname.includes('/balances')) activeTab = 'balances';
  else if (pathname.includes('/my-expenses')) activeTab = 'expenses';
  else if (pathname.includes('/drafts')) activeTab = 'drafts';

  useEffect(() => {
    if (!loading && !currentProfile) {
      router.push('/login');
    }
  }, [loading, currentProfile, router]);

  // Check for pending tester OAuth return or tokens in URL
  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      // Check hash params (e.g. from OAuth redirect)
      if (window.location.hash) {
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const providerToken = hashParams.get('provider_token');
        if (providerToken) {
          localStorage.setItem('google_provider_token', providerToken);
        }
      }

      // Check if user was waiting for tester auth and got bounced to dashboard/groups
      const pendingTester = localStorage.getItem('pending_tester_auth');
      const returnTo = localStorage.getItem('auth_return_to') || '/email-templates?tab=create-test';
      if (pendingTester === 'true' && (pathname === '/dashboard' || pathname === '/groups')) {
        localStorage.removeItem('pending_tester_auth');
        localStorage.removeItem('auth_return_to');
        router.replace(returnTo);
      }
    } catch {}
  }, [pathname, router]);

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
    if (tab === 'dashboard') router.push('/dashboard');
    else if (tab === 'groups') router.push('/groups');
    else if (tab === 'friends') router.push('/friends');
    else if (tab === 'balances') router.push('/balances');
    else if (tab === 'expenses') router.push('/my-expenses');
    else if (tab === 'drafts') router.push('/drafts');
  };

  return (
    <div className="min-h-screen bg-zinc-50/60 font-sans text-zinc-900 flex flex-col justify-between selection:bg-zinc-900 selection:text-white">
      <div>
        <Navbar
          activeTab={activeTab}
          setActiveTab={handleTabChange}
          onOpenNewExpense={() => setIsNewExpenseOpen(true)}
          onOpenNewGroup={() => setIsNewGroupOpen(true)}
        />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-28 lg:pb-12">
          {children}
        </main>
      </div>

      <footer className="bg-white border-t border-zinc-200 mt-auto py-8 mb-16 lg:mb-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-zinc-500">
          <div className="flex items-center space-x-2">
            <span className="font-semibold text-zinc-900">Deudita</span>
            <span>&copy; {new Date().getFullYear()}</span>
          </div>
          <p>Plataforma de Gastos Compartidos</p>
        </div>
      </footer>

      {/* Global Modals triggered from Navbar or anywhere */}
      <CreateGroupModal
        isOpen={isNewGroupOpen}
        onClose={() => setIsNewGroupOpen(false)}
      />

      <NewExpenseModal
        isOpen={isNewExpenseOpen}
        onClose={() => setIsNewExpenseOpen(false)}
      />

      {/* First-time login onboarding profile modal */}
      <ProfileSettingsModal
        isOpen={isOnboardingOpen}
        onClose={() => {
          setHasDismissedOnboarding(true);
          void completeOnboarding();
        }}
        isOnboarding={true}
        onCompleted={() => {
          setHasDismissedOnboarding(true);
          void completeOnboarding();
        }}
      />
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardLayoutContent>{children}</DashboardLayoutContent>
  );
}
