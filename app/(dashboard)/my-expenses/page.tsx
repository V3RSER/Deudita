'use client';

import React, { useState } from 'react';
import { AllExpensesView } from '@/components/AllExpensesView';
import { NewExpenseModal } from '@/components/NewExpenseModal';
import { Expense } from '@/lib/types';

export default function MyExpensesPage() {
  const [isNewExpenseOpen, setIsNewExpenseOpen] = useState(false);
  const [expenseToEdit, setExpenseToEdit] = useState<Expense | null>(null);

  const handleOpenNewExpense = () => {
    setExpenseToEdit(null);
    setIsNewExpenseOpen(true);
  };

  const handleEditExpense = (expense: Expense) => {
    setExpenseToEdit(expense);
    setIsNewExpenseOpen(true);
  };

  return (
    <>
      <AllExpensesView
        onOpenNewExpense={handleOpenNewExpense}
        onEditExpense={handleEditExpense}
      />
      <NewExpenseModal
        isOpen={isNewExpenseOpen}
        onClose={() => {
          setIsNewExpenseOpen(false);
          setExpenseToEdit(null);
        }}
        expenseToEdit={expenseToEdit}
      />
    </>
  );
}
