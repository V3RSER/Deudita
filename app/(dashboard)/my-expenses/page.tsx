'use client';

import React, { useState } from 'react';
import { AllExpensesView } from '@/components/AllExpensesView';
import { NewExpenseModal } from '@/components/NewExpenseModal';
import { SettleDebtModal } from '@/components/SettleDebtModal';
import { Expense, Payment } from '@/lib/types';

export default function MyExpensesPage() {
  const [isNewExpenseOpen, setIsNewExpenseOpen] = useState(false);
  const [expenseToEdit, setExpenseToEdit] = useState<Expense | null>(null);
  const [isSettleOpen, setIsSettleOpen] = useState(false);
  const [paymentToEdit, setPaymentToEdit] = useState<Payment | null>(null);

  const handleOpenNewExpense = () => {
    setExpenseToEdit(null);
    setIsNewExpenseOpen(true);
  };

  const handleEditExpense = (expense: Expense) => {
    setExpenseToEdit(expense);
    setIsNewExpenseOpen(true);
  };

  const handleEditPayment = (payment: Payment) => {
    setPaymentToEdit(payment);
    setIsSettleOpen(true);
  };

  return (
    <>
      <AllExpensesView
        onOpenNewExpense={handleOpenNewExpense}
        onEditExpense={handleEditExpense}
        onEditPayment={handleEditPayment}
      />
      <NewExpenseModal
        isOpen={isNewExpenseOpen}
        onClose={() => {
          setIsNewExpenseOpen(false);
          setExpenseToEdit(null);
        }}
        expenseToEdit={expenseToEdit}
      />
      <SettleDebtModal
        key={`settle-${isSettleOpen}-${paymentToEdit?.id || 'new'}`}
        isOpen={isSettleOpen}
        onClose={() => {
          setIsSettleOpen(false);
          setPaymentToEdit(null);
        }}
        paymentToEdit={paymentToEdit}
      />
    </>
  );
}
