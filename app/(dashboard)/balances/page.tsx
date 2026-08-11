'use client';

import React, { useState } from 'react';
import { ConsolidatedBalances } from '@/components/ConsolidatedBalances';
import { SettleDebtModal } from '@/components/SettleDebtModal';
import { Payment } from '@/lib/types';

export default function BalancesPage() {
  const [isSettleOpen, setIsSettleOpen] = useState(false);
  const [paymentToEdit, setPaymentToEdit] = useState<Payment | null>(null);
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
    setPaymentToEdit(null);
    setSettleParams({ groupId, debtorId, creditorId, amount });
    setIsSettleOpen(true);
  };

  const handleEditPayment = (payment: Payment) => {
    setPaymentToEdit(payment);
    setIsSettleOpen(true);
  };

  return (
    <>
      <ConsolidatedBalances
        onOpenSettleModal={handleOpenSettleModal}
        onEditPayment={handleEditPayment}
      />

      <SettleDebtModal
        key={`settle-${isSettleOpen}-${paymentToEdit?.id || 'new'}`}
        isOpen={isSettleOpen}
        onClose={() => {
          setIsSettleOpen(false);
          setPaymentToEdit(null);
        }}
        defaultGroupId={settleParams.groupId}
        defaultDebtorId={settleParams.debtorId}
        defaultCreditorId={settleParams.creditorId}
        defaultAmount={settleParams.amount}
        paymentToEdit={paymentToEdit}
      />
    </>
  );
}
