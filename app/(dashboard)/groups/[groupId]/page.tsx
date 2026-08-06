'use client';

import React, { useState } from 'react';
import { GroupDetail } from '@/components/GroupDetail';
import { useExpense } from '@/lib/expense-context';
import { useRouter, useParams } from 'next/navigation';
import { NewExpenseModal } from '@/components/NewExpenseModal';
import { SettleDebtModal } from '@/components/SettleDebtModal';
import { AddMemberModal } from '@/components/AddMemberModal';

export default function GroupDetailPage() {
  const router = useRouter();
  const params = useParams();
  const groupId = params.groupId as string;
  const { groups } = useExpense();

  const [isNewExpenseOpen, setIsNewExpenseOpen] = useState(false);
  
  const [isSettleOpen, setIsSettleOpen] = useState(false);
  const [settleParams, setSettleParams] = useState<{
    debtorId?: string;
    creditorId?: string;
    amount?: number;
  }>({});

  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);

  const group = groups.find((g) => g.id === groupId);

  if (!group) {
    return <div className="p-8 text-center text-zinc-500">Grupo no encontrado.</div>;
  }

  const handleOpenSettleModal = (
    _gId?: string,
    debtorId?: string,
    creditorId?: string,
    amount?: number
  ) => {
    setSettleParams({ debtorId, creditorId, amount });
    setIsSettleOpen(true);
  };

  return (
    <>
      <GroupDetail
        group={group}
        onBack={() => router.push('/groups')}
        onOpenNewExpense={() => setIsNewExpenseOpen(true)}
        onOpenSettleModal={handleOpenSettleModal}
        onOpenAddMember={() => setIsAddMemberOpen(true)}
      />

      <NewExpenseModal
        isOpen={isNewExpenseOpen}
        onClose={() => setIsNewExpenseOpen(false)}
        defaultGroupId={groupId}
      />

      <SettleDebtModal
        isOpen={isSettleOpen}
        onClose={() => setIsSettleOpen(false)}
        defaultGroupId={groupId}
        defaultDebtorId={settleParams.debtorId}
        defaultCreditorId={settleParams.creditorId}
        defaultAmount={settleParams.amount}
      />

      <AddMemberModal
        isOpen={isAddMemberOpen}
        onClose={() => setIsAddMemberOpen(false)}
        groupId={groupId}
      />
    </>
  );
}
