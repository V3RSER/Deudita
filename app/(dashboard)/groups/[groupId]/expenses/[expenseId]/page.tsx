'use client';

import { use } from 'react';
import ExpenseDetailPage from '@/app/(dashboard)/expenses/[id]/page';

export default function GroupExpenseDetailPage({
  params,
}: {
  params: Promise<{ groupId: string; expenseId: string }>;
}) {
  const { expenseId } = use(params);
  
  // Wrap params so ExpenseDetailPage receives id
  const expenseParams = Promise.resolve({ id: expenseId });

  return <ExpenseDetailPage params={expenseParams} />;
}
