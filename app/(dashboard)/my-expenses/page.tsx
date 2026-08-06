'use client';

import React, { useState } from 'react';
import { AllExpensesView } from '@/components/AllExpensesView';
import { NewExpenseModal } from '@/components/NewExpenseModal';

export default function MyExpensesPage() {
  const [isNewExpenseOpen, setIsNewExpenseOpen] = useState(false);

  return (
    <>
      <AllExpensesView onOpenNewExpense={() => setIsNewExpenseOpen(true)} />
      <NewExpenseModal
        isOpen={isNewExpenseOpen}
        onClose={() => setIsNewExpenseOpen(false)}
      />
    </>
  );
}
