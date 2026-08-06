'use client';

import React, { useState } from 'react';
import { ConsolidatedBalances } from '@/components/ConsolidatedBalances';
import { SettleDebtModal } from '@/components/SettleDebtModal';

export default function BalancesPage() {
  const [isSettleOpen, setIsSettleOpen] = useState(false);
  const [settleParams, setSettleParams] = useState<{
    groupId?: string;
    debtorId?: string;
    creditorId?: string;
    amount?: number;
  }>({});

  const handleOpenSettleModal = (
    groupId?: string,
    debtorId?: string,
    creditorId?: string,
    amount?: number
  ) => {
    setSettleParams({ groupId, debtorId, creditorId, amount });
    setIsSettleOpen(true);
  };

  return (
    <>
      <ConsolidatedBalances onOpenSettleModal={handleOpenSettleModal} />

      <SettleDebtModal
        key={`settle-${isSettleOpen}-${settleParams.groupId}-${settleParams.debtorId}-${settleParams.creditorId}`}
        isOpen={isSettleOpen}
        onClose={() => setIsSettleOpen(false)}
        defaultGroupId={settleParams.groupId}
        defaultDebtorId={settleParams.debtorId}
        defaultCreditorId={settleParams.creditorId}
        defaultAmount={settleParams.amount}
      />
    </>
  );
}
