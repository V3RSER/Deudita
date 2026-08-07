'use client';

import React, { useState } from 'react';
import { DashboardSummary } from '@/components/DashboardSummary';
import { CreateGroupModal } from '@/components/CreateGroupModal';
import { NewExpenseModal } from '@/components/NewExpenseModal';
import { SettleDebtModal } from '@/components/SettleDebtModal';
import { ScanReceiptModal } from '@/components/ScanReceiptModal';

export default function DashboardPage() {
  const [isNewGroupOpen, setIsNewGroupOpen] = useState(false);
  const [isNewExpenseOpen, setIsNewExpenseOpen] = useState(false);
  const [isSettleModalOpen, setIsSettleModalOpen] = useState(false);
  const [isScanReceiptOpen, setIsScanReceiptOpen] = useState(false);

  return (
    <>
      <DashboardSummary
        onOpenNewGroup={() => setIsNewGroupOpen(true)}
        onOpenNewExpense={() => setIsNewExpenseOpen(true)}
        onOpenSettleModal={() => setIsSettleModalOpen(true)}
        onOpenScanReceiptModal={() => setIsScanReceiptOpen(true)}
      />

      <CreateGroupModal
        isOpen={isNewGroupOpen}
        onClose={() => setIsNewGroupOpen(false)}
      />

      <NewExpenseModal
        isOpen={isNewExpenseOpen}
        onClose={() => setIsNewExpenseOpen(false)}
      />

      <SettleDebtModal
        isOpen={isSettleModalOpen}
        onClose={() => setIsSettleModalOpen(false)}
      />

      <ScanReceiptModal
        isOpen={isScanReceiptOpen}
        onClose={() => setIsScanReceiptOpen(false)}
      />
    </>
  );
}
