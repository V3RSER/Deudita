'use client';

import React, { useState } from 'react';
import { GroupDetail } from '@/components/GroupDetail';
import { useExpense } from '@/lib/expense-context';
import { Expense, Payment } from '@/lib/types';
import { useRouter, useParams } from 'next/navigation';
import { NewExpenseModal } from '@/components/NewExpenseModal';
import { SettleDebtModal } from '@/components/SettleDebtModal';
import { AddMemberModal } from '@/components/AddMemberModal';
import { InviteLinkModal } from '@/components/InviteLinkModal';

export default function GroupDetailPage() {
  const router = useRouter();
  const params = useParams();
  const groupId = params.groupId as string;
  const { groups, deletePayment } = useExpense();

  const [isNewExpenseOpen, setIsNewExpenseOpen] = useState(false);
  const [expenseToEdit, setExpenseToEdit] = useState<Expense | null>(null);
  
  const [isSettleOpen, setIsSettleOpen] = useState(false);
  const [paymentToEdit, setPaymentToEdit] = useState<Payment | null>(null);
  const [settleParams, setSettleParams] = useState<{
    debtorId?: string;
    creditorId?: string;
    amount?: number;
  }>({});

  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [isInviteLinkOpen, setIsInviteLinkOpen] = useState(false);

  const group = groups.find((g) => g.id === groupId);

  if (!group) {
    return <div className="p-8 text-center text-zinc-500">Grupo no encontrado.</div>;
  }

  const handleOpenNewExpense = () => {
    setExpenseToEdit(null);
    setIsNewExpenseOpen(true);
  };

  const handleEditExpense = (exp: Expense) => {
    setExpenseToEdit(exp);
    setIsNewExpenseOpen(true);
  };

  const handleOpenSettleModal = (
    _gId?: string,
    debtorId?: string,
    creditorId?: string,
    amount?: number
  ) => {
    setPaymentToEdit(null);
    setSettleParams({ debtorId, creditorId, amount });
    setIsSettleOpen(true);
  };

  const handleEditPayment = (payment: Payment) => {
    setPaymentToEdit(payment);
    setIsSettleOpen(true);
  };

  const handleOpenAddMember = () => {
    setIsAddMemberOpen(true);
  };

  const handleOpenInviteLink = () => {
    setIsInviteLinkOpen(true);
  };

  return (
    <>
      <GroupDetail
        group={group}
        onBack={() => router.push('/groups')}
        onOpenNewExpense={handleOpenNewExpense}
        onEditExpense={handleEditExpense}
        onEditPayment={handleEditPayment}
        onDeletePayment={(payId) => deletePayment(payId)}
        onOpenSettleModal={handleOpenSettleModal}
        onOpenAddMember={handleOpenAddMember}
        onOpenInviteLink={handleOpenInviteLink}
      />

      <NewExpenseModal
        isOpen={isNewExpenseOpen}
        onClose={() => {
          setIsNewExpenseOpen(false);
          setExpenseToEdit(null);
        }}
        defaultGroupId={groupId}
        expenseToEdit={expenseToEdit}
      />

      <SettleDebtModal
        key={`settle-${isSettleOpen}-${paymentToEdit?.id || 'new'}`}
        isOpen={isSettleOpen}
        onClose={() => {
          setIsSettleOpen(false);
          setPaymentToEdit(null);
        }}
        defaultGroupId={groupId}
        defaultDebtorId={settleParams.debtorId}
        defaultCreditorId={settleParams.creditorId}
        defaultAmount={settleParams.amount}
        paymentToEdit={paymentToEdit}
      />

      <AddMemberModal
        isOpen={isAddMemberOpen}
        onClose={() => setIsAddMemberOpen(false)}
        groupId={groupId}
      />

      <InviteLinkModal
        isOpen={isInviteLinkOpen}
        onClose={() => setIsInviteLinkOpen(false)}
        groupId={groupId}
      />
    </>
  );
}
