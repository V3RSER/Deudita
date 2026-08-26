import { Expense, Payment, Profile, PairwiseBalance, UserSummaryBalance, ManagedContribution, Group, ExpenseSplit } from './types';

export function formatCurrency(amount: number, currencyCode?: string): string {
  const num = isNaN(amount) ? 0 : amount;
  const code = currencyCode && currencyCode.trim() ? currencyCode.trim().toUpperCase() : 'COP';

  const currencySymbols: Record<string, string> = {
    COP: '$',
    MXN: '$',
    CLP: '$',
    ARS: '$',
    USD: '$',
    EUR: '€',
    PEN: 'S/',
  };

  const symbol = currencySymbols[code] ?? '$';

  // Check if amount has non-zero fractional part
  const hasDecimals = Math.abs(num % 1) > 0.001;

  let formattedNumber = '';
  if (code === 'USD' || code === 'EUR') {
    formattedNumber = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: hasDecimals ? 2 : 0,
      maximumFractionDigits: 2,
    }).format(num);
  } else {
    // COP, MXN, CLP, ARS, PEN: dots for thousands, comma for decimals
    formattedNumber = new Intl.NumberFormat('es-CO', {
      minimumFractionDigits: hasDecimals ? 2 : 0,
      maximumFractionDigits: 2,
    }).format(num);
  }

  if (code === 'EUR') {
    return `${formattedNumber} ${symbol}`;
  }

  return `${symbol} ${formattedNumber}`;
}

/**
 * Returns the timestamp corresponding to the entry/creation date (fecha de ingreso al sistema).
 * Strictly prioritizes created_at over expense_date/payment_date so that backdated
 * expenses entered today are treated as recent in the FIFO debt queue.
 */
export function getEntryTimestamp(record: {
  created_at?: string | null;
  updated_at?: string | null;
  expense_date?: string | null;
  payment_date?: string | null;
}): number {
  if (record.created_at) {
    const t = new Date(record.created_at).getTime();
    if (!isNaN(t) && t > 0) return t;
  }
  if (record.payment_date) {
    const t = new Date(record.payment_date).getTime();
    if (!isNaN(t) && t > 0) return t;
  }
  if (record.expense_date) {
    const t = new Date(record.expense_date).getTime();
    if (!isNaN(t) && t > 0) return t;
  }
  return 0;
}

export function buildSponsorshipMap(profiles: Profile[]): Map<string, string> {
  const map = new Map<string, string>();
  profiles.forEach((p) => {
    if (p.managed_user_ids && Array.isArray(p.managed_user_ids)) {
      p.managed_user_ids.forEach((depId) => {
        if (depId && depId !== p.id) {
          map.set(depId, p.id);
        }
      });
    }
  });
  return map;
}

export interface ManagedUserDetail {
  user: Profile;
  sponsor: Profile;
  totalSpent: number;
  totalPaid: number;
  individualNet: number;
}

export function calculateManagedSummary(
  profiles: Profile[],
  expenses: Expense[],
  payments: Payment[],
  groupId?: string
): ManagedUserDetail[] {
  const filteredExpenses = groupId ? expenses.filter((e) => e.group_id === groupId) : expenses;
  const filteredPayments = groupId ? payments.filter((p) => p.group_id === groupId) : payments;

  const profileMap = new Map<string, Profile>();
  profiles.forEach((p) => profileMap.set(p.id, p));

  const sponsorshipMap = buildSponsorshipMap(profiles);
  const details: ManagedUserDetail[] = [];

  profiles.forEach((p) => {
    const sponsorId = sponsorshipMap.get(p.id);
    if (!sponsorId) return;
    const sponsor = profileMap.get(sponsorId);
    if (!sponsor) return;

    let totalSpent = 0;
    let totalPaid = 0;

    filteredExpenses.forEach((exp) => {
      if (exp.paid_by === p.id) {
        totalPaid += exp.total_amount;
      }
      if (exp.splits) {
        exp.splits.forEach((s) => {
          if (s.user_id === p.id) {
            totalSpent += s.amount_owed;
          }
        });
      }
    });

    filteredPayments.forEach((pay) => {
      if (pay.paid_by === p.id) {
        totalPaid += pay.amount;
      }
      if (pay.paid_to === p.id) {
        totalSpent += pay.amount;
      }
    });

    const individualNet = totalPaid - totalSpent; // positive = spent less than paid, negative = owes

    details.push({
      user: p,
      sponsor,
      totalSpent,
      totalPaid,
      individualNet,
    });
  });

  return details;
}

/**
 * Calculates FIFO settlement status for all expenses based on payments and mutual expense compensations.
 * Strictly uses entry timestamp (created_at) so that new expenses are never settled by older payments.
 */
export function calculateFifoSettledExpenses(
  expenses: Expense[],
  payments: Payment[],
  profiles?: Profile[]
): Expense[] {
  const sponsorshipMap = profiles ? buildSponsorshipMap(profiles) : new Map<string, string>();
  const getFinancialActorId = (id: string) => sponsorshipMap.get(id) || id;

  // Deep clone expenses to not mutate original directly
  const clonedExpenses: Expense[] = expenses.map((e) => ({
    ...e,
    splits: e.splits ? e.splits.map((s) => ({ ...s })) : [],
  }));

  // Group by group_id (or null/standalone)
  const groupExpensesMap = new Map<string, Expense[]>();
  clonedExpenses.forEach((exp) => {
    const gId = exp.group_id || 'none';
    if (!groupExpensesMap.has(gId)) groupExpensesMap.set(gId, []);
    groupExpensesMap.get(gId)!.push(exp);
  });

  const groupPaymentsMap = new Map<string, Payment[]>();
  payments.forEach((pay) => {
    const gId = pay.group_id || 'none';
    if (!groupPaymentsMap.has(gId)) groupPaymentsMap.set(gId, []);
    groupPaymentsMap.get(gId)!.push(pay);
  });

  // Collect all unique group IDs
  const allGroupIds = new Set<string>([...groupExpensesMap.keys(), ...groupPaymentsMap.keys()]);

  allGroupIds.forEach((gId) => {
    const gExps = groupExpensesMap.get(gId) || [];
    const gPays = groupPaymentsMap.get(gId) || [];

    // Initialize all splits
    gExps.forEach((exp) => {
      const expPayerActor = getFinancialActorId(exp.paid_by);
      if (exp.splits) {
        exp.splits.forEach((s) => {
          const splitDebtorActor = getFinancialActorId(s.user_id);
          if (splitDebtorActor === expPayerActor) {
            s.paid_amount = s.amount_owed;
            s.pending_amount = 0;
            s.is_settled = true;
          } else {
            s.paid_amount = 0;
            s.pending_amount = s.amount_owed;
            s.is_settled = s.amount_owed <= 0.009;
          }
        });
      }
    });

    // Build unified chronological timeline sorted by entry timestamp ascending
    type TimelineItem =
      | { type: 'expense'; expense: Expense; timestamp: number }
      | { type: 'payment'; payment: Payment; timestamp: number };

    const timeline: TimelineItem[] = [];

    gExps.forEach((e) => {
      timeline.push({ type: 'expense', expense: e, timestamp: getEntryTimestamp(e) });
    });

    gPays.forEach((p) => {
      timeline.push({ type: 'payment', payment: p, timestamp: getEntryTimestamp(p) });
    });

    timeline.sort((a, b) => a.timestamp - b.timestamp);

    interface ActiveSplitRecord {
      split: ExpenseSplit;
      expense: Expense;
      debtorId: string;
      payerId: string;
      debtorActor: string;
      payerActor: string;
      amountOwed: number;
      paidAmount: number;
      pendingAmount: number;
      timestamp: number;
    }

    const activeSplits: ActiveSplitRecord[] = [];

    timeline.forEach((item) => {
      if (item.type === 'expense') {
        const exp = item.expense;
        if (!exp.splits) return;

        const expPayerActor = getFinancialActorId(exp.paid_by);

        exp.splits.forEach((s) => {
          const splitDebtorActor = getFinancialActorId(s.user_id);
          if (splitDebtorActor === expPayerActor || s.amount_owed <= 0.009) return;

          let splitPending = s.amount_owed;
          let splitPaid = 0;

          // 1. Direct mutual debt offset with previous debts where expPayerActor owed splitDebtorActor
          for (const openSplit of activeSplits) {
            if (
              openSplit.debtorActor === expPayerActor &&
              openSplit.payerActor === splitDebtorActor &&
              openSplit.pendingAmount > 0.009
            ) {
              const offset = Math.min(splitPending, openSplit.pendingAmount);
              if (offset > 0.009) {
                openSplit.paidAmount = Math.round((openSplit.paidAmount + offset) * 100) / 100;
                openSplit.pendingAmount = Math.max(0, Math.round((openSplit.amountOwed - openSplit.paidAmount) * 100) / 100);
                openSplit.split.paid_amount = openSplit.paidAmount;
                openSplit.split.pending_amount = openSplit.pendingAmount;
                openSplit.split.is_settled = openSplit.pendingAmount <= 0.009;

                splitPaid = Math.round((splitPaid + offset) * 100) / 100;
                splitPending = Math.max(0, Math.round((s.amount_owed - splitPaid) * 100) / 100);

                if (splitPending <= 0.009) break;
              }
            }
          }

          s.paid_amount = splitPaid;
          s.pending_amount = splitPending;
          s.is_settled = splitPending <= 0.009;

          if (splitPending > 0.009) {
            activeSplits.push({
              split: s,
              expense: exp,
              debtorId: s.user_id,
              payerId: exp.paid_by,
              debtorActor: splitDebtorActor,
              payerActor: expPayerActor,
              amountOwed: s.amount_owed,
              paidAmount: splitPaid,
              pendingAmount: splitPending,
              timestamp: item.timestamp,
            });
          }
        });
      } else if (item.type === 'payment') {
        const pay = item.payment;
        if (pay.amount <= 0.009) return;

        const payDebtorActor = getFinancialActorId(pay.paid_by);
        const payCreditorActor = getFinancialActorId(pay.paid_to);
        let rem = pay.amount;

        // Phase 1: Direct pairwise settlement (payDebtorActor -> payCreditorActor)
        for (const openSplit of activeSplits) {
          if (
            openSplit.debtorActor === payDebtorActor &&
            openSplit.payerActor === payCreditorActor &&
            openSplit.pendingAmount > 0.009
          ) {
            const take = Math.min(rem, openSplit.pendingAmount);
            if (take > 0.009) {
              openSplit.paidAmount = Math.round((openSplit.paidAmount + take) * 100) / 100;
              openSplit.pendingAmount = Math.max(0, Math.round((openSplit.amountOwed - openSplit.paidAmount) * 100) / 100);
              openSplit.split.paid_amount = openSplit.paidAmount;
              openSplit.split.pending_amount = openSplit.pendingAmount;
              openSplit.split.is_settled = openSplit.pendingAmount <= 0.009;

              rem = Math.max(0, Math.round((rem - take) * 100) / 100);
              if (rem <= 0.009) break;
            }
          }
        }

        // Phase 2: Debtor multi-party settlement in group (payer settles remaining debts in group)
        if (rem > 0.009) {
          for (const openSplit of activeSplits) {
            if (openSplit.debtorActor === payDebtorActor && openSplit.pendingAmount > 0.009) {
              const take = Math.min(rem, openSplit.pendingAmount);
              if (take > 0.009) {
                openSplit.paidAmount = Math.round((openSplit.paidAmount + take) * 100) / 100;
                openSplit.pendingAmount = Math.max(0, Math.round((openSplit.amountOwed - openSplit.paidAmount) * 100) / 100);
                openSplit.split.paid_amount = openSplit.paidAmount;
                openSplit.split.pending_amount = openSplit.pendingAmount;
                openSplit.split.is_settled = openSplit.pendingAmount <= 0.009;

                rem = Math.max(0, Math.round((rem - take) * 100) / 100);
                if (rem <= 0.009) break;
              }
            }
          }
        }

        // Phase 3: Creditor group reimbursement (payCreditorActor receives reimbursement for group expenses they funded)
        if (rem > 0.009) {
          for (const openSplit of activeSplits) {
            if (openSplit.payerActor === payCreditorActor && openSplit.pendingAmount > 0.009) {
              const take = Math.min(rem, openSplit.pendingAmount);
              if (take > 0.009) {
                openSplit.paidAmount = Math.round((openSplit.paidAmount + take) * 100) / 100;
                openSplit.pendingAmount = Math.max(0, Math.round((openSplit.amountOwed - openSplit.paidAmount) * 100) / 100);
                openSplit.split.paid_amount = openSplit.paidAmount;
                openSplit.split.pending_amount = openSplit.pendingAmount;
                openSplit.split.is_settled = openSplit.pendingAmount <= 0.009;

                rem = Math.max(0, Math.round((rem - take) * 100) / 100);
                if (rem <= 0.009) break;
              }
            }
          }
        }

        // Phase 4: General group settlement pool
        if (rem > 0.009) {
          for (const openSplit of activeSplits) {
            if (openSplit.pendingAmount > 0.009) {
              const take = Math.min(rem, openSplit.pendingAmount);
              if (take > 0.009) {
                openSplit.paidAmount = Math.round((openSplit.paidAmount + take) * 100) / 100;
                openSplit.pendingAmount = Math.max(0, Math.round((openSplit.amountOwed - openSplit.paidAmount) * 100) / 100);
                openSplit.split.paid_amount = openSplit.paidAmount;
                openSplit.split.pending_amount = openSplit.pendingAmount;
                openSplit.split.is_settled = openSplit.pendingAmount <= 0.009;

                rem = Math.max(0, Math.round((rem - take) * 100) / 100);
                if (rem <= 0.009) break;
              }
            }
          }
        }
      }
    });

    // Update expense top-level pending_amount and is_settled
    gExps.forEach((exp) => {
      if (exp.splits && exp.splits.length > 0) {
        const totalPending = exp.splits.reduce((sum, s) => sum + (s.pending_amount ?? (s.amount_owed || 0)), 0);
        const totalPaid = exp.splits.reduce((sum, s) => sum + (s.paid_amount ?? 0), 0);
        exp.pending_amount = Math.round(totalPending * 100) / 100;
        exp.paid_amount = Math.round(totalPaid * 100) / 100;
        exp.is_settled = exp.pending_amount <= 0.009;
      } else {
        exp.pending_amount = 0;
        exp.paid_amount = exp.total_amount;
        exp.is_settled = true;
      }
    });
  });

  return clonedExpenses;
}

export function calculateDirectBalances(
  expenses: Expense[],
  payments: Payment[],
  profiles: Profile[],
  groupId?: string
): PairwiseBalance[] {
  const filteredExpenses = groupId ? expenses.filter((e) => e.group_id === groupId) : expenses;
  const filteredPayments = groupId ? payments.filter((p) => p.group_id === groupId) : payments;

  const profileMap = new Map<string, Profile>();
  profiles.forEach((p) => profileMap.set(p.id, p));

  const sponsorshipMap = buildSponsorshipMap(profiles);

  // In direct view: calculate direct pairwise debts between ALL individual persons,
  // preserving the debts to/from people under charge, with their sponsor metadata attached.
  const debtMap = new Map<string, number>();
  const getPairKey = (debtorId: string, creditorId: string) => `${debtorId}->${creditorId}`;

  // Process individual expense splits
  filteredExpenses.forEach((exp) => {
    const rawPayer = exp.paid_by;
    if (!exp.splits) return;

    exp.splits.forEach((split) => {
      const rawDebtor = split.user_id;

      if (rawDebtor !== rawPayer && split.amount_owed > 0) {
        const key = getPairKey(rawDebtor, rawPayer);
        const current = debtMap.get(key) ?? 0;
        debtMap.set(key, current + split.amount_owed);
      }
    });
  });

  // Process individual payments
  filteredPayments.forEach((payment) => {
    const rawPayer = payment.paid_by;
    const rawReceiver = payment.paid_to;

    if (rawPayer !== rawReceiver && payment.amount > 0) {
      const key = getPairKey(rawPayer, rawReceiver);
      const current = debtMap.get(key) ?? 0;
      debtMap.set(key, current - payment.amount);
    }
  });

  // Net direct pairs between all individual profiles
  const pairwiseResults: PairwiseBalance[] = [];
  const processedPairs = new Set<string>();

  profiles.forEach((p1) => {
    profiles.forEach((p2) => {
      if (p1.id === p2.id) return;
      const pairId = [p1.id, p2.id].sort().join(':');
      if (processedPairs.has(pairId)) return;
      processedPairs.add(pairId);

      const k1To2 = getPairKey(p1.id, p2.id);
      const k2To1 = getPairKey(p2.id, p1.id);

      const d1To2 = debtMap.get(k1To2) ?? 0;
      const d2To1 = debtMap.get(k2To1) ?? 0;

      const net = d1To2 - d2To1;

      if (Math.abs(net) > 0.01) {
        if (net > 0) {
          const creditor = profileMap.get(p2.id);
          const debtor = profileMap.get(p1.id);
          if (creditor && debtor) {
            const debtorSponsorId = sponsorshipMap.get(debtor.id);
            const creditorSponsorId = sponsorshipMap.get(creditor.id);
            pairwiseResults.push({
              creditor,
              debtor,
              amount: Math.round(net * 100) / 100,
              group_id: groupId,
              debtorSponsor: debtorSponsorId ? profileMap.get(debtorSponsorId) : undefined,
              creditorSponsor: creditorSponsorId ? profileMap.get(creditorSponsorId) : undefined,
            });
          }
        } else {
          const creditor = profileMap.get(p1.id);
          const debtor = profileMap.get(p2.id);
          if (creditor && debtor) {
            const debtorSponsorId = sponsorshipMap.get(debtor.id);
            const creditorSponsorId = sponsorshipMap.get(creditor.id);
            pairwiseResults.push({
              creditor,
              debtor,
              amount: Math.round(Math.abs(net) * 100) / 100,
              group_id: groupId,
              debtorSponsor: debtorSponsorId ? profileMap.get(debtorSponsorId) : undefined,
              creditorSponsor: creditorSponsorId ? profileMap.get(creditorSponsorId) : undefined,
            });
          }
        }
      }
    });
  });

  return pairwiseResults;
}

export function calculateSimplifiedBalances(
  expenses: Expense[],
  payments: Payment[],
  profiles: Profile[],
  groupId?: string
): PairwiseBalance[] {
  const profileMap = new Map<string, Profile>();
  profiles.forEach((p) => profileMap.set(p.id, p));

  const sponsorshipMap = buildSponsorshipMap(profiles);
  const getFinancialActorId = (id: string) => sponsorshipMap.get(id) || id;

  // Determine groups to process
  const targetGroupIds = groupId
    ? [groupId]
    : Array.from(
        new Set([
          ...expenses.map((e) => e.group_id).filter(Boolean),
          ...payments.map((p) => p.group_id).filter(Boolean),
        ])
      );

  if (targetGroupIds.length === 0 && (expenses.length > 0 || payments.length > 0)) {
    targetGroupIds.push('__all__');
  }

  const allPairwise: PairwiseBalance[] = [];

  targetGroupIds.forEach((gId) => {
    const groupExpenses = gId === '__all__' ? expenses : expenses.filter((e) => e.group_id === gId);
    const groupPayments = gId === '__all__' ? payments : payments.filter((p) => p.group_id === gId);

    // Track total spent per individual
    const individualDebts = new Map<string, number>();
    const individualCredits = new Map<string, number>();

    // Consolidated actor net balance:
    const actorNetMap = new Map<string, number>();

    const addActorAmount = (actorId: string, amount: number) => {
      actorNetMap.set(actorId, (actorNetMap.get(actorId) ?? 0) + amount);
    };

    groupExpenses.forEach((exp) => {
      const payerActorId = getFinancialActorId(exp.paid_by);
      addActorAmount(payerActorId, exp.total_amount);

      const currentCred = individualCredits.get(exp.paid_by) ?? 0;
      individualCredits.set(exp.paid_by, currentCred + exp.total_amount);

      if (exp.splits) {
        exp.splits.forEach((split) => {
          const debtorActorId = getFinancialActorId(split.user_id);
          addActorAmount(debtorActorId, -split.amount_owed);

          const currentDebt = individualDebts.get(split.user_id) ?? 0;
          individualDebts.set(split.user_id, currentDebt + split.amount_owed);
        });
      }
    });

    groupPayments.forEach((payment) => {
      const payerActorId = getFinancialActorId(payment.paid_by);
      const receiverActorId = getFinancialActorId(payment.paid_to);

      addActorAmount(payerActorId, payment.amount);
      addActorAmount(receiverActorId, -payment.amount);

      const currentCred = individualCredits.get(payment.paid_by) ?? 0;
      individualCredits.set(payment.paid_by, currentCred + payment.amount);

      const currentDebt = individualDebts.get(payment.paid_to) ?? 0;
      individualDebts.set(payment.paid_to, currentDebt + payment.amount);
    });

    // Build debtors and creditors lists
    const debtors: { id: string; amount: number }[] = [];
    const creditors: { id: string; amount: number }[] = [];

    actorNetMap.forEach((net, actorId) => {
      const rounded = Math.round(net * 100) / 100;
      if (rounded < -0.01) {
        debtors.push({ id: actorId, amount: -rounded });
      } else if (rounded > 0.01) {
        creditors.push({ id: actorId, amount: rounded });
      }
    });

    // Greedy matching for minimal transactions
    debtors.sort((a, b) => b.amount - a.amount);
    creditors.sort((a, b) => b.amount - a.amount);

    let dIdx = 0;
    let cIdx = 0;

    while (dIdx < debtors.length && cIdx < creditors.length) {
      const debtorObj = debtors[dIdx];
      const creditorObj = creditors[cIdx];

      const settleAmount = Math.min(debtorObj.amount, creditorObj.amount);
      const roundedSettle = Math.round(settleAmount * 100) / 100;

      if (roundedSettle > 0.01) {
        const debtorProfile = profileMap.get(debtorObj.id);
        const creditorProfile = profileMap.get(creditorObj.id);

        if (debtorProfile && creditorProfile) {
          // Identify included dependents for sponsor
          const includedDebtors: Profile[] = [];
          const debtorBreakdown: { profile: Profile; amount: number; isSelf?: boolean }[] = [];

          if (debtorProfile.managed_user_ids && debtorProfile.managed_user_ids.length > 0) {
            debtorProfile.managed_user_ids.forEach((depId) => {
              const depProf = profileMap.get(depId);
              if (depProf && depProf.id !== debtorProfile.id) {
                const depSpent = individualDebts.get(depId) ?? 0;
                const depPaid = individualCredits.get(depId) ?? 0;
                const depNetOwed = Math.max(0, depSpent - depPaid);
                if (depNetOwed > 0.01) {
                  includedDebtors.push(depProf);
                  debtorBreakdown.push({ profile: depProf, amount: Math.round(depNetOwed * 100) / 100 });
                }
              }
            });
          }

          allPairwise.push({
            creditor: creditorProfile,
            debtor: debtorProfile,
            amount: roundedSettle,
            group_id: gId === '__all__' ? undefined : gId,
            includedDebtors: includedDebtors.length > 0 ? includedDebtors : undefined,
            debtorBreakdown: debtorBreakdown.length > 0 ? debtorBreakdown : undefined,
          });
        }
      }

      debtorObj.amount = Math.round((debtorObj.amount - settleAmount) * 100) / 100;
      creditorObj.amount = Math.round((creditorObj.amount - settleAmount) * 100) / 100;

      if (debtorObj.amount <= 0.01) dIdx++;
      if (creditorObj.amount <= 0.01) cIdx++;
    }
  });

  return allPairwise;
}

export function calculatePairwiseBalances(
  expenses: Expense[],
  payments: Payment[],
  profiles: Profile[],
  groupId?: string
): PairwiseBalance[] {
  return calculateSimplifiedBalances(expenses, payments, profiles, groupId);
}

export function calculateUserSummaries(
  expenses: Expense[],
  payments: Payment[],
  profiles: Profile[],
  currentUserId: string,
  groupId?: string
): UserSummaryBalance[] {
  const pairwise = calculateSimplifiedBalances(expenses, payments, profiles, groupId);
  const summaryMap = new Map<string, { owedToMe: number; iOwe: number }>();

  profiles.forEach((p) => {
    if (p.id !== currentUserId) {
      summaryMap.set(p.id, { owedToMe: 0, iOwe: 0 });
    }
  });

  pairwise.forEach((pair) => {
    if (pair.creditor.id === currentUserId && pair.debtor.id !== currentUserId) {
      const entry = summaryMap.get(pair.debtor.id) ?? { owedToMe: 0, iOwe: 0 };
      entry.owedToMe += pair.amount;
      summaryMap.set(pair.debtor.id, entry);
    } else if (pair.debtor.id === currentUserId && pair.creditor.id !== currentUserId) {
      const entry = summaryMap.get(pair.creditor.id) ?? { owedToMe: 0, iOwe: 0 };
      entry.iOwe += pair.amount;
      summaryMap.set(pair.creditor.id, entry);
    }
  });

  const results: UserSummaryBalance[] = [];
  summaryMap.forEach((val, userId) => {
    const profile = profiles.find((p) => p.id === userId);
    if (profile) {
      const net = val.owedToMe - val.iOwe;
      results.push({
        user: profile,
        netBalance: Math.round(net * 100) / 100,
        owedToUser: Math.round(val.owedToMe * 100) / 100,
        userOwes: Math.round(val.iOwe * 100) / 100,
      });
    }
  });

  return results;
}

export interface DebtBreakdownItem {
  expense: Expense;
  splitAmount: number;
  paidAmount: number;
  pendingAmount: number;
  isFullyPaid: boolean;
  isPartiallyPaid: boolean;
  actualDebtor: Profile;
  actualCreditor: Profile;
  isManagedDebtor?: boolean;
  isManagedCreditor?: boolean;
}

export interface PairwiseDebtDetail {
  debtor: Profile;
  creditor: Profile;
  pendingExpenses: DebtBreakdownItem[];
  settledExpenses: DebtBreakdownItem[];
  appliedPayments: Payment[];
  settledPayments: Payment[];
  reverseOffsetExpenses: DebtBreakdownItem[];
  netPendingAmount: number;
  totalPaymentsApplied: number;
  totalReverseOffsets: number;
  totalActiveRecoverable: number;
  netDirectBalance: number;
  simplifiedAmount: number;
  simplifiedDiff: number;
  isSimplified: boolean;
  isFullySettled: boolean;
  optimizationDetail?: {
    isOptimized: boolean;
    directBalance: number;
    simplifiedBalance: number;
    difference: number;
    explanation: string;
  };
}

/**
 * Calculates detailed breakdown between two profiles using pure FIFO debt settlement.
 * Only unsettled expenses (pendingAmount > 0) are listed in pendingExpenses.
 */
export function calculatePairwiseDebtDetail(
  debtor: Profile,
  creditor: Profile,
  expenses: Expense[],
  payments: Payment[],
  profiles: Profile[],
  groups: Group[],
  isSimplified: boolean = true,
  groupId?: string
): PairwiseDebtDetail {
  const profileMap = new Map<string, Profile>();
  profiles.forEach((p) => profileMap.set(p.id, p));

  // Filter expenses and payments by group if applicable
  const filteredExpenses = groupId ? expenses.filter((e) => e.group_id === groupId) : expenses;
  const filteredPayments = groupId ? payments.filter((p) => p.group_id === groupId) : payments;

  // Run FIFO settlement engine on filtered transactions
  const fifoSettledExpenses = calculateFifoSettledExpenses(filteredExpenses, filteredPayments, profiles);

  // Determine debtor and creditor ID sets
  const debtorIds = new Set<string>([debtor.id]);
  const creditorIds = new Set<string>([creditor.id]);

  if (isSimplified) {
    if (debtor.managed_user_ids) {
      debtor.managed_user_ids.forEach((id) => debtorIds.add(id));
    }
    if (creditor.managed_user_ids) {
      creditor.managed_user_ids.forEach((id) => creditorIds.add(id));
    }
  }

  // 1. Debts where creditor paid and debtor participated
  const pendingExpenses: DebtBreakdownItem[] = [];
  const settledExpenses: DebtBreakdownItem[] = [];

  fifoSettledExpenses.forEach((exp) => {
    if (creditorIds.has(exp.paid_by) && exp.splits) {
      const actualCreditor = profileMap.get(exp.paid_by) || creditor;
      exp.splits.forEach((s) => {
        if (debtorIds.has(s.user_id) && s.user_id !== exp.paid_by && s.amount_owed > 0) {
          const actualDebtor = profileMap.get(s.user_id) || debtor;
          const pendingAmount = s.pending_amount ?? (s.is_settled ? 0 : s.amount_owed);
          const paidAmount = s.paid_amount ?? (s.amount_owed - pendingAmount);
          const isFullyPaid = s.is_settled || pendingAmount <= 0.009;
          const isPartiallyPaid = paidAmount > 0.009 && !isFullyPaid;

          const item: DebtBreakdownItem = {
            expense: exp,
            splitAmount: s.amount_owed,
            paidAmount: Math.round(paidAmount * 100) / 100,
            pendingAmount: Math.round(pendingAmount * 100) / 100,
            isFullyPaid,
            isPartiallyPaid,
            actualDebtor,
            actualCreditor,
            isManagedDebtor: actualDebtor.id !== debtor.id,
            isManagedCreditor: actualCreditor.id !== creditor.id,
          };

          if (isFullyPaid) {
            settledExpenses.push(item);
          } else {
            pendingExpenses.push(item);
          }
        }
      });
    }
  });

  // Sort pending by entry timestamp descending (newest first for UI display)
  pendingExpenses.sort((a, b) => getEntryTimestamp(b.expense) - getEntryTimestamp(a.expense));
  settledExpenses.sort((a, b) => getEntryTimestamp(b.expense) - getEntryTimestamp(a.expense));

  // 2. Reverse offsets where debtor paid and creditor participated
  const reverseOffsetExpenses: DebtBreakdownItem[] = [];
  fifoSettledExpenses.forEach((exp) => {
    if (debtorIds.has(exp.paid_by) && exp.splits) {
      const actualCreditor = profileMap.get(exp.paid_by) || debtor;
      exp.splits.forEach((s) => {
        if (creditorIds.has(s.user_id) && s.user_id !== exp.paid_by && s.amount_owed > 0) {
          const actualDebtor = profileMap.get(s.user_id) || creditor;
          const pendingAmount = s.pending_amount ?? (s.is_settled ? 0 : s.amount_owed);
          const paidAmount = s.paid_amount ?? (s.amount_owed - pendingAmount);
          const isFullyPaid = s.is_settled || pendingAmount <= 0.009;

          if (!isFullyPaid && pendingAmount > 0.009) {
            reverseOffsetExpenses.push({
              expense: exp,
              splitAmount: s.amount_owed,
              paidAmount: Math.round(paidAmount * 100) / 100,
              pendingAmount: Math.round(pendingAmount * 100) / 100,
              isFullyPaid: false,
              isPartiallyPaid: paidAmount > 0.009,
              actualDebtor,
              actualCreditor,
              isManagedDebtor: actualDebtor.id !== debtor.id,
              isManagedCreditor: actualCreditor.id !== creditor.id,
            });
          }
        }
      });
    }
  });

  // 3. Direct payments between debtor and creditor
  const appliedPayments: Payment[] = [];
  const settledPayments: Payment[] = [];

  filteredPayments.forEach((p) => {
    if (
      (debtorIds.has(p.paid_by) && creditorIds.has(p.paid_to)) ||
      (creditorIds.has(p.paid_by) && debtorIds.has(p.paid_to))
    ) {
      if (pendingExpenses.length > 0 || reverseOffsetExpenses.length > 0) {
        appliedPayments.push(p);
      } else {
        settledPayments.push(p);
      }
    }
  });

  const netPendingAmount = Math.round(pendingExpenses.reduce((sum, d) => sum + d.pendingAmount, 0) * 100) / 100;
  const totalPaymentsApplied = 0; // Already factored into split.pending_amount by calculateFifoSettledExpenses
  const totalReverseOffsets = Math.round(reverseOffsetExpenses.reduce((sum, r) => sum + r.pendingAmount, 0) * 100) / 100;
  const totalActiveRecoverable = Math.round((totalPaymentsApplied + totalReverseOffsets) * 100) / 100;

  const netDirectBalance = Math.max(0, Math.round((netPendingAmount - totalActiveRecoverable) * 100) / 100);

  // Simplified balance from simplified engine
  const simplifiedPairs = calculateSimplifiedBalances(filteredExpenses, filteredPayments, profiles, groupId);
  const matchingSimplified = simplifiedPairs.find(
    (p) => p.debtor.id === debtor.id && p.creditor.id === creditor.id
  );
  const simplifiedAmount = matchingSimplified ? matchingSimplified.amount : 0;
  const simplifiedDiff = Math.round((netDirectBalance - simplifiedAmount) * 100) / 100;

  const isFullySettled = (isSimplified ? simplifiedAmount : netDirectBalance) <= 0.009;

  let optimizationDetail: PairwiseDebtDetail['optimizationDetail'] = undefined;
  if (isSimplified && Math.abs(simplifiedDiff) > 0.01) {
    optimizationDetail = {
      isOptimized: true,
      directBalance: netDirectBalance,
      simplifiedBalance: simplifiedAmount,
      difference: simplifiedDiff,
      explanation:
        simplifiedDiff > 0
          ? `La simplificación de deudas reduce el pago directo de ${formatCurrency(netDirectBalance)} a ${formatCurrency(simplifiedAmount)} al compensar saldos compartidos dentro del grupo.`
          : `El saldo simplificado es ${formatCurrency(simplifiedAmount)} considerando las transferencias consolidadas del grupo.`,
    };
  }

  return {
    debtor,
    creditor,
    pendingExpenses,
    settledExpenses,
    appliedPayments,
    settledPayments,
    reverseOffsetExpenses,
    netPendingAmount: Math.round(netPendingAmount * 100) / 100,
    totalPaymentsApplied: Math.round(totalPaymentsApplied * 100) / 100,
    totalReverseOffsets: Math.round(totalReverseOffsets * 100) / 100,
    totalActiveRecoverable,
    netDirectBalance,
    simplifiedAmount,
    simplifiedDiff,
    isSimplified,
    isFullySettled,
    optimizationDetail,
  };
}

export interface PeerBalanceItem {
  peer: Profile;
  isOwedToPeer: boolean;
  amount: number;
  directBalance: number;
  isSettled: boolean;
}

export interface MemberAccountStatement {
  member: Profile;
  pendingConsumedExpenses: DebtBreakdownItem[];
  settledConsumedExpenses: DebtBreakdownItem[];
  pendingDebtBreakdown: DebtBreakdownItem[];
  settledDebtBreakdown: DebtBreakdownItem[];
  totalPendingDebt: number;
  totalSettledDebt: number;
  totalConsumedDebt: number;
  activePaidExpenses: Expense[];
  settledPaidExpenses: Expense[];
  activePaymentsMade: Payment[];
  settledPaymentsMade: Payment[];
  totalActiveRecoverable: number;
  totalSettledRecoverable: number;
  netGlobalBalance: number;
  totalNetDebt: number;
  isFullySettled: boolean;
  peerBalances: PeerBalanceItem[];
  finalCreditors: PeerBalanceItem[];
  finalDebtors: PeerBalanceItem[];
  isSimplified: boolean;
  optimizationDetail?: {
    isOptimized: boolean;
    directBalance: number;
    simplifiedBalance: number;
    difference: number;
  };
  calculation: {
    totalDirectDebts: number;
    totalRecoverable: number;
    netDirect: number;
    simplifiedSettlement: number;
  };
}

export function calculateMemberAccountStatement(
  member: Profile,
  expenses: Expense[],
  payments: Payment[],
  profiles: Profile[],
  groups: Group[],
  isSimplified: boolean = true,
  groupId?: string
): MemberAccountStatement {
  const profileMap = new Map<string, Profile>();
  profiles.forEach((p) => profileMap.set(p.id, p));

  const filteredExpenses = groupId ? expenses.filter((e) => e.group_id === groupId) : expenses;
  const filteredPayments = groupId ? payments.filter((p) => p.group_id === groupId) : payments;

  // Compute FIFO status for all expenses in this scope
  const fifoExpenses = calculateFifoSettledExpenses(filteredExpenses, filteredPayments, profiles);

  const pendingConsumedExpenses: DebtBreakdownItem[] = [];
  const settledConsumedExpenses: DebtBreakdownItem[] = [];

  fifoExpenses.forEach((exp) => {
    if (exp.splits) {
      const payerProfile = profileMap.get(exp.paid_by) || {
        id: exp.paid_by,
        full_name: 'Integrante',
        email: null,
        avatar_url: '',
        created_at: '',
      };

      exp.splits.forEach((s) => {
        if (s.user_id === member.id && exp.paid_by !== member.id && s.amount_owed > 0) {
          const paidAmt = s.paid_amount ?? 0;
          const pendingAmt = s.pending_amount ?? (s.amount_owed - paidAmt);
          const isSettled = s.is_settled ?? pendingAmt <= 0.009;

          const item: DebtBreakdownItem = {
            expense: exp,
            splitAmount: s.amount_owed,
            paidAmount: paidAmt,
            pendingAmount: pendingAmt,
            isFullyPaid: isSettled,
            isPartiallyPaid: paidAmt > 0.009 && !isSettled,
            actualDebtor: member,
            actualCreditor: payerProfile,
          };

          if (isSettled) {
            settledConsumedExpenses.push(item);
          } else {
            pendingConsumedExpenses.push(item);
          }
        }
      });
    }
  });

  // Sort by entry timestamp descending
  pendingConsumedExpenses.sort((a, b) => getEntryTimestamp(b.expense) - getEntryTimestamp(a.expense));
  settledConsumedExpenses.sort((a, b) => getEntryTimestamp(b.expense) - getEntryTimestamp(a.expense));

  const totalPendingDebt = pendingConsumedExpenses.reduce((sum, d) => sum + d.pendingAmount, 0);
  const totalSettledDebt = settledConsumedExpenses.reduce((sum, d) => sum + d.splitAmount, 0);
  const totalConsumedDebt = totalPendingDebt + totalSettledDebt;

  // Paid expenses
  const activePaidExpenses = fifoExpenses.filter((e) => e.paid_by === member.id && !e.is_settled);
  const settledPaidExpenses = fifoExpenses.filter((e) => e.paid_by === member.id && e.is_settled);

  // Payments made
  const activePaymentsMade = filteredPayments.filter((p) => p.paid_by === member.id);
  const settledPaymentsMade: Payment[] = [];

  const totalActiveRecoverable = activePaidExpenses.reduce((sum, e) => sum + (e.pending_amount ?? e.total_amount), 0);
  const totalSettledRecoverable = settledPaidExpenses.reduce((sum, e) => sum + (e.paid_amount ?? e.total_amount), 0);

  // Peer balances
  const simplifiedPairs = calculateSimplifiedBalances(fifoExpenses, filteredPayments, profiles, groupId);
  const directPairs = calculateDirectBalances(fifoExpenses, filteredPayments, profiles, groupId);

  const peerBalances: PeerBalanceItem[] = [];
  const finalCreditors: PeerBalanceItem[] = [];
  const finalDebtors: PeerBalanceItem[] = [];

  profiles.forEach((p) => {
    if (p.id === member.id) return;

    const directAsDebtor = directPairs.find((d) => d.debtor.id === member.id && d.creditor.id === p.id);
    const directAsCreditor = directPairs.find((d) => d.creditor.id === member.id && d.debtor.id === p.id);
    const directNet = directAsDebtor ? -directAsDebtor.amount : directAsCreditor ? directAsCreditor.amount : 0;

    const simpAsDebtor = simplifiedPairs.find((d) => d.debtor.id === member.id && d.creditor.id === p.id);
    const simpAsCreditor = simplifiedPairs.find((d) => d.creditor.id === member.id && d.debtor.id === p.id);
    const simpNet = simpAsDebtor ? -simpAsDebtor.amount : simpAsCreditor ? simpAsCreditor.amount : 0;

    const chosenNet = isSimplified ? simpNet : directNet;

    if (Math.abs(chosenNet) > 0.01) {
      const peerItem: PeerBalanceItem = {
        peer: p,
        isOwedToPeer: chosenNet < 0,
        amount: Math.abs(chosenNet),
        directBalance: directNet,
        isSettled: false,
      };
      peerBalances.push(peerItem);
      if (chosenNet < 0) {
        finalCreditors.push(peerItem);
      } else {
        finalDebtors.push(peerItem);
      }
    }
  });

  const netGlobalBalance = finalDebtors.reduce((sum, d) => sum + d.amount, 0) - finalCreditors.reduce((sum, c) => sum + c.amount, 0);
  const totalNetDebt = finalCreditors.reduce((sum, c) => sum + c.amount, 0);
  const isFullySettled = Math.abs(netGlobalBalance) <= 0.01 && finalCreditors.length === 0;

  return {
    member,
    pendingConsumedExpenses,
    settledConsumedExpenses,
    pendingDebtBreakdown: pendingConsumedExpenses,
    settledDebtBreakdown: settledConsumedExpenses,
    totalPendingDebt: Math.round(totalPendingDebt * 100) / 100,
    totalSettledDebt: Math.round(totalSettledDebt * 100) / 100,
    totalConsumedDebt: Math.round(totalConsumedDebt * 100) / 100,
    activePaidExpenses,
    settledPaidExpenses,
    activePaymentsMade,
    settledPaymentsMade,
    totalActiveRecoverable: Math.round(totalActiveRecoverable * 100) / 100,
    totalSettledRecoverable: Math.round(totalSettledRecoverable * 100) / 100,
    netGlobalBalance: Math.round(netGlobalBalance * 100) / 100,
    totalNetDebt: Math.round(totalNetDebt * 100) / 100,
    isFullySettled,
    peerBalances,
    finalCreditors,
    finalDebtors,
    isSimplified,
    calculation: {
      totalDirectDebts: Math.round(totalPendingDebt * 100) / 100,
      totalRecoverable: Math.round(totalActiveRecoverable * 100) / 100,
      netDirect: Math.round((totalActiveRecoverable - totalPendingDebt) * 100) / 100,
      simplifiedSettlement: Math.round(netGlobalBalance * 100) / 100,
    },
  };
}
