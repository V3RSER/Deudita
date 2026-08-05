'use client';

import React, { useState } from 'react';
import { ExpenseProvider } from '@/lib/expense-context';
import { Navbar, ActiveTab } from '@/components/Navbar';
import { GroupList } from '@/components/GroupList';
import { GroupDetail } from '@/components/GroupDetail';
import { ConsolidatedBalances } from '@/components/ConsolidatedBalances';
import { AllExpensesView } from '@/components/AllExpensesView';
import { DraftsView } from '@/components/DraftsView';
import { DatabaseView } from '@/components/DatabaseView';

import { NewExpenseModal } from '@/components/NewExpenseModal';
import { SettleDebtModal } from '@/components/SettleDebtModal';
import { CreateGroupModal } from '@/components/CreateGroupModal';
import { AddMemberModal } from '@/components/AddMemberModal';
import { ConfirmDraftModal } from '@/components/ConfirmDraftModal';
import { ScanReceiptModal } from '@/components/ScanReceiptModal';

import { Group, ExpenseDraft } from '@/lib/types';
import { Layers } from 'lucide-react';

function AppContent() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('groups');
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);

  // Modals state
  const [isNewExpenseOpen, setIsNewExpenseOpen] = useState(false);
  const [newExpenseGroupId, setNewExpenseGroupId] = useState<string | undefined>(undefined);

  const [isNewGroupOpen, setIsNewGroupOpen] = useState(false);

  const [isSettleOpen, setIsSettleOpen] = useState(false);
  const [settleParams, setSettleParams] = useState<{
    groupId?: string;
    debtorId?: string;
    creditorId?: string;
    amount?: number;
  }>({});

  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [addMemberGroupId, setAddMemberGroupId] = useState<string>('');

  const [isConfirmDraftOpen, setIsConfirmDraftOpen] = useState(false);
  const [selectedDraft, setSelectedDraft] = useState<ExpenseDraft | null>(null);

  const [isScanReceiptOpen, setIsScanReceiptOpen] = useState(false);

  const handleOpenNewExpense = (groupId?: string) => {
    const targetGroup = groupId ? groupId : (selectedGroup ? selectedGroup.id : undefined);
    setNewExpenseGroupId(targetGroup);
    setIsNewExpenseOpen(true);
  };

  const handleOpenSettleModal = (
    groupId?: string,
    debtorId?: string,
    creditorId?: string,
    amount?: number
  ) => {
    setSettleParams({ groupId, debtorId, creditorId, amount });
    setIsSettleOpen(true);
  };

  const handleOpenAddMember = (groupId: string) => {
    setAddMemberGroupId(groupId);
    setIsAddMemberOpen(true);
  };

  const handleOpenConfirmDraft = (draft: ExpenseDraft) => {
    setSelectedDraft(draft);
    setIsConfirmDraftOpen(true);
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800 flex flex-col justify-between selection:bg-indigo-500 selection:text-white">
      <div>
        {/* Navigation Header */}
        <Navbar
          activeTab={activeTab}
          setActiveTab={(tab) => {
            setActiveTab(tab);
            if (tab !== 'groups') {
              setSelectedGroup(null);
            }
          }}
          onOpenNewExpense={() => handleOpenNewExpense()}
          onOpenNewGroup={() => setIsNewGroupOpen(true)}
        />

        {/* Main Body */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {activeTab === 'groups' && (
            selectedGroup ? (
              <GroupDetail
                group={selectedGroup}
                onBack={() => setSelectedGroup(null)}
                onOpenNewExpense={handleOpenNewExpense}
                onOpenSettleModal={handleOpenSettleModal}
                onOpenAddMember={handleOpenAddMember}
              />
            ) : (
              <GroupList
                onSelectGroup={(group) => setSelectedGroup(group)}
                onOpenNewGroup={() => setIsNewGroupOpen(true)}
              />
            )
          )}

          {activeTab === 'balances' && (
            <ConsolidatedBalances onOpenSettleModal={handleOpenSettleModal} />
          )}

          {activeTab === 'expenses' && (
            <AllExpensesView onOpenNewExpense={() => handleOpenNewExpense()} />
          )}

          {activeTab === 'drafts' && (
            <DraftsView
              onOpenConfirmDraft={handleOpenConfirmDraft}
              onOpenScanReceiptModal={() => setIsScanReceiptOpen(true)}
            />
          )}

          {activeTab === 'database' && <DatabaseView />}
        </main>
      </div>

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-400 py-8 border-t border-slate-800 mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs">
          <div className="flex items-center space-x-2">
            <Layers className="w-4 h-4 text-emerald-400" />
            <span className="font-bold text-slate-200">Gastos Compartidos</span>
            <span>• Plataforma Multi-Grupo en Next.js & Supabase</span>
          </div>
          <p className="text-slate-500">
            Splitwise Architecture • DDL SQL • Gemini AI Receipt Scanner
          </p>
        </div>
      </footer>

      {/* Modals */}
      <NewExpenseModal
        isOpen={isNewExpenseOpen}
        onClose={() => setIsNewExpenseOpen(false)}
        defaultGroupId={newExpenseGroupId}
      />

      <SettleDebtModal
        isOpen={isSettleOpen}
        onClose={() => setIsSettleOpen(false)}
        defaultGroupId={settleParams.groupId}
        defaultDebtorId={settleParams.debtorId}
        defaultCreditorId={settleParams.creditorId}
        defaultAmount={settleParams.amount}
      />

      <CreateGroupModal
        isOpen={isNewGroupOpen}
        onClose={() => setIsNewGroupOpen(false)}
      />

      <AddMemberModal
        isOpen={isAddMemberOpen}
        onClose={() => setIsAddMemberOpen(false)}
        groupId={addMemberGroupId}
      />

      <ConfirmDraftModal
        isOpen={isConfirmDraftOpen}
        onClose={() => setIsConfirmDraftOpen(false)}
        draft={selectedDraft}
      />

      <ScanReceiptModal
        isOpen={isScanReceiptOpen}
        onClose={() => setIsScanReceiptOpen(false)}
      />
    </div>
  );
}

export default function Page() {
  return (
    <ExpenseProvider>
      <AppContent />
    </ExpenseProvider>
  );
}
