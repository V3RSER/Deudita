import { Expense, Payment, Profile, PairwiseBalance, UserSummaryBalance } from './types';

export function formatCurrency(amount: number): string {
  const rounded = Math.round(amount);
  const formatted = new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(rounded);
  // Replace CLP with $ for cleaner display
  return formatted.replace('CLP', '$').trim();
}

export function calculatePairwiseBalances(
  expenses: Expense[],
  payments: Payment[],
  profiles: Profile[],
  groupId?: string
): PairwiseBalance[] {
  const filteredExpenses = groupId ? expenses.filter((e) => e.group_id === groupId) : expenses;
  const filteredPayments = groupId ? payments.filter((p) => p.group_id === groupId) : payments;

  const profileMap = new Map<string, Profile>();
  profiles.forEach((p) => profileMap.set(p.id, p));

  // Debt map: key = `${debtor_id}->${creditor_id}`
  const debtMap = new Map<string, number>();

  const getPairKey = (debtorId: string, creditorId: string) => `${debtorId}->${creditorId}`;

  // Process expenses
  filteredExpenses.forEach((exp) => {
    const paidBy = exp.paid_by;
    if (!exp.splits) return;

    exp.splits.forEach((split) => {
      if (split.user_id !== paidBy && split.amount_owed > 0) {
        const key = getPairKey(split.user_id, paidBy);
        const current = debtMap.get(key) || 0;
        debtMap.set(key, current + split.amount_owed);
      }
    });
  });

  // Process payments
  filteredPayments.forEach((payment) => {
    // Payer paid Receiver, so Payer's debt to Receiver decreases
    const key = getPairKey(payment.paid_by, payment.paid_to);
    const current = debtMap.get(key) || 0;
    debtMap.set(key, current - payment.amount);
  });

  // Simplify pairs (netting A->B and B->A)
  const pairwiseResults: PairwiseBalance[] = [];
  const processedPairs = new Set<string>();

  profiles.forEach((p1) => {
    profiles.forEach((p2) => {
      if (p1.id === p2.id) return;
      const pairId = [p1.id, p2.id].sort().join(':');
      if (processedPairs.has(pairId)) return;
      processedPairs.add(pairId);

      const d1To2 = debtMap.get(getPairKey(p1.id, p2.id)) || 0;
      const d2To1 = debtMap.get(getPairKey(p2.id, p1.id)) || 0;

      const net = d1To2 - d2To1;

      if (Math.abs(net) > 0.01) {
        if (net > 0) {
          // p1 owes p2
          const creditor = profileMap.get(p2.id);
          const debtor = profileMap.get(p1.id);
          if (creditor && debtor) {
            pairwiseResults.push({
              creditor,
              debtor,
              amount: net,
              group_id: groupId,
            });
          }
        } else {
          // p2 owes p1
          const creditor = profileMap.get(p1.id);
          const debtor = profileMap.get(p2.id);
          if (creditor && debtor) {
            pairwiseResults.push({
              creditor,
              debtor,
              amount: Math.abs(net),
              group_id: groupId,
            });
          }
        }
      }
    });
  });

  return pairwiseResults.sort((a, b) => b.amount - a.amount);
}

export function calculateUserSummaries(
  expenses: Expense[],
  payments: Payment[],
  profiles: Profile[],
  groupId?: string
): UserSummaryBalance[] {
  const filteredExpenses = groupId ? expenses.filter((e) => e.group_id === groupId) : expenses;
  const filteredPayments = groupId ? payments.filter((p) => p.group_id === groupId) : payments;

  return profiles.map((user) => {
    let totalPaid = 0;
    let totalOwedShare = 0;
    let totalPaymentsMade = 0;
    let totalPaymentsReceived = 0;

    filteredExpenses.forEach((exp) => {
      if (exp.paid_by === user.id) {
        totalPaid += exp.total_amount;
      }
      if (exp.splits) {
        const mySplit = exp.splits.find((s) => s.user_id === user.id);
        if (mySplit) {
          totalOwedShare += mySplit.amount_owed;
        }
      }
    });

    filteredPayments.forEach((p) => {
      if (p.paid_by === user.id) {
        totalPaymentsMade += p.amount;
      }
      if (p.paid_to === user.id) {
        totalPaymentsReceived += p.amount;
      }
    });

    const netBalance = (totalPaid + totalPaymentsMade) - (totalOwedShare + totalPaymentsReceived);

    return {
      user,
      totalPaid,
      totalOwedShare,
      netBalance,
    };
  });
}
