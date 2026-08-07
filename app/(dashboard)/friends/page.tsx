'use client';

import React, { useState } from 'react';
import { FriendsView } from '@/components/FriendsView';
import { SettleDebtModal } from '@/components/SettleDebtModal';

export default function FriendsPage() {
  const [isSettleOpen, setIsSettleOpen] = useState(false);
  const [settleDetails, setSettleDetails] = useState<{
    groupId?: string;
    debtorId?: string;
    creditorId?: string;
    amount?: number;
  }>({});

  const handleOpenSettle = (groupId?: string, debtorId?: string, creditorId?: string, amount?: number) => {
    setSettleDetails({ groupId, debtorId, creditorId, amount });
    setIsSettleOpen(true);
  };

  return (
    <>
      <FriendsView onOpenSettleModal={handleOpenSettle} />

      <SettleDebtModal
        isOpen={isSettleOpen}
        onClose={() => setIsSettleOpen(false)}
        defaultGroupId={settleDetails.groupId}
        defaultDebtorId={settleDetails.debtorId}
        defaultCreditorId={settleDetails.creditorId}
        defaultAmount={settleDetails.amount}
      />
    </>
  );
}
