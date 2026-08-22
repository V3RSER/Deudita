import { Expense, Payment, Profile, PairwiseBalance, UserSummaryBalance } from './types';

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
  const getEffectiveId = (id: string) => sponsorshipMap.get(id) || id;

  // Track which original members are represented in each effective debt
  const debtorContributors = new Map<string, Set<string>>();
  const creditorContributors = new Map<string, Set<string>>();

  // Debt map: key = `${effective_debtor_id}->${effective_creditor_id}`
  const debtMap = new Map<string, number>();
  const getPairKey = (debtorId: string, creditorId: string) => `${debtorId}->${creditorId}`;

  // Process expenses
  filteredExpenses.forEach((exp) => {
    const rawPayer = exp.paid_by;
    const effPayer = getEffectiveId(rawPayer);
    if (!exp.splits) return;

    exp.splits.forEach((split) => {
      const rawDebtor = split.user_id;
      const effDebtor = getEffectiveId(rawDebtor);

      if (effDebtor !== effPayer && split.amount_owed > 0) {
        const key = getPairKey(effDebtor, effPayer);
        const current = debtMap.get(key) ?? 0;
        debtMap.set(key, current + split.amount_owed);

        if (rawDebtor !== effDebtor) {
          if (!debtorContributors.has(key)) debtorContributors.set(key, new Set());
          debtorContributors.get(key)!.add(rawDebtor);
        }
        if (rawPayer !== effPayer) {
          if (!creditorContributors.has(key)) creditorContributors.set(key, new Set());
          creditorContributors.get(key)!.add(rawPayer);
        }
      }
    });
  });

  // Process payments
  filteredPayments.forEach((payment) => {
    const effPayer = getEffectiveId(payment.paid_by);
    const effReceiver = getEffectiveId(payment.paid_to);

    if (effPayer !== effReceiver && payment.amount > 0) {
      const key = getPairKey(effPayer, effReceiver);
      const current = debtMap.get(key) ?? 0;
      debtMap.set(key, current - payment.amount);
    }
  });

  // Effective profiles (only those who are not managed by someone else)
  const effectiveProfiles = profiles.filter((p) => !sponsorshipMap.has(p.id));

  // Net direct pairs (A->B and B->A)
  const pairwiseResults: PairwiseBalance[] = [];
  const processedPairs = new Set<string>();

  effectiveProfiles.forEach((p1) => {
    effectiveProfiles.forEach((p2) => {
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
            const incDebtorIds = debtorContributors.get(k1To2);
            const incCreditorIds = creditorContributors.get(k1To2);
            pairwiseResults.push({
              creditor,
              debtor,
              amount: Math.round(net * 100) / 100,
              group_id: groupId,
              includedDebtors: incDebtorIds ? Array.from(incDebtorIds).map((id) => profileMap.get(id)!).filter(Boolean) : undefined,
              includedCreditors: incCreditorIds ? Array.from(incCreditorIds).map((id) => profileMap.get(id)!).filter(Boolean) : undefined,
            });
          }
        } else {
          const creditor = profileMap.get(p1.id);
          const debtor = profileMap.get(p2.id);
          if (creditor && debtor) {
            const incDebtorIds = debtorContributors.get(k2To1);
            const incCreditorIds = creditorContributors.get(k2To1);
            pairwiseResults.push({
              creditor,
              debtor,
              amount: Math.round(Math.abs(net) * 100) / 100,
              group_id: groupId,
              includedDebtors: incDebtorIds ? Array.from(incDebtorIds).map((id) => profileMap.get(id)!).filter(Boolean) : undefined,
              includedCreditors: incCreditorIds ? Array.from(incCreditorIds).map((id) => profileMap.get(id)!).filter(Boolean) : undefined,
            });
          }
        }
      }
    });
  });

  return pairwiseResults.sort((a, b) => b.amount - a.amount);
}

function simplifySingleScopeBalances(
  expenses: Expense[],
  payments: Payment[],
  profiles: Profile[],
  groupId?: string
): PairwiseBalance[] {
  const profileMap = new Map<string, Profile>();
  profiles.forEach((p) => profileMap.set(p.id, p));

  const sponsorshipMap = buildSponsorshipMap(profiles);
  const getEffectiveId = (id: string) => sponsorshipMap.get(id) || id;

  const netMap = new Map<string, number>();

  expenses.forEach((exp) => {
    const rawPayer = exp.paid_by;
    const effPayer = getEffectiveId(rawPayer);

    if (exp.splits && exp.splits.length > 0) {
      let totalSplits = 0;
      exp.splits.forEach((split) => {
        const rawDebtor = split.user_id;
        const effDebtor = getEffectiveId(rawDebtor);

        totalSplits += split.amount_owed;
        if (split.amount_owed > 0) {
          const currentDebtor = netMap.get(effDebtor) ?? 0;
          netMap.set(effDebtor, currentDebtor - split.amount_owed);
        }
      });
      const currentPayer = netMap.get(effPayer) ?? 0;
      netMap.set(effPayer, currentPayer + totalSplits);
    } else {
      const currentPayer = netMap.get(effPayer) ?? 0;
      netMap.set(effPayer, currentPayer + exp.total_amount);
    }
  });

  payments.forEach((p) => {
    const effPayer = getEffectiveId(p.paid_by);
    const effReceiver = getEffectiveId(p.paid_to);

    if (effPayer !== effReceiver) {
      const currentPayer = netMap.get(effPayer) ?? 0;
      netMap.set(effPayer, currentPayer + p.amount);

      const currentReceiver = netMap.get(effReceiver) ?? 0;
      netMap.set(effReceiver, currentReceiver - p.amount);
    }
  });

  interface BalanceNode {
    id: string;
    amount: number;
  }

  const creditors: BalanceNode[] = [];
  const debtors: BalanceNode[] = [];

  netMap.forEach((net, userId) => {
    const rounded = Math.round(net * 100) / 100;
    if (rounded > 0.01) {
      creditors.push({ id: userId, amount: rounded });
    } else if (rounded < -0.01) {
      debtors.push({ id: userId, amount: Math.abs(rounded) });
    }
  });

  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);

  const simplified: PairwiseBalance[] = [];
  let cIdx = 0;
  let dIdx = 0;

  while (cIdx < creditors.length && dIdx < debtors.length) {
    const creditor = creditors[cIdx];
    const debtor = debtors[dIdx];

    const settleAmount = Math.min(creditor.amount, debtor.amount);
    const roundedSettle = Math.round(settleAmount * 100) / 100;

    if (roundedSettle > 0.01) {
      const creditorProfile = profileMap.get(creditor.id);
      const debtorProfile = profileMap.get(debtor.id);

      if (creditorProfile && debtorProfile) {
        // Collect managed profiles if any
        const debtorManagedProfiles = debtorProfile.managed_user_ids
          ? debtorProfile.managed_user_ids.map((id) => profileMap.get(id)!).filter(Boolean)
          : undefined;
        const creditorManagedProfiles = creditorProfile.managed_user_ids
          ? creditorProfile.managed_user_ids.map((id) => profileMap.get(id)!).filter(Boolean)
          : undefined;

        simplified.push({
          creditor: creditorProfile,
          debtor: debtorProfile,
          amount: roundedSettle,
          group_id: groupId,
          includedDebtors: debtorManagedProfiles && debtorManagedProfiles.length > 0 ? debtorManagedProfiles : undefined,
          includedCreditors: creditorManagedProfiles && creditorManagedProfiles.length > 0 ? creditorManagedProfiles : undefined,
        });
      }
    }

    creditor.amount = Math.round((creditor.amount - settleAmount) * 100) / 100;
    debtor.amount = Math.round((debtor.amount - settleAmount) * 100) / 100;

    if (creditor.amount <= 0.01) cIdx++;
    if (debtor.amount <= 0.01) dIdx++;
  }

  return simplified;
}

export function calculateSimplifiedBalances(
  expenses: Expense[],
  payments: Payment[],
  profiles: Profile[],
  groupId?: string
): PairwiseBalance[] {
  if (groupId) {
    const filteredExpenses = expenses.filter((e) => e.group_id === groupId);
    const filteredPayments = payments.filter((p) => p.group_id === groupId);
    return simplifySingleScopeBalances(filteredExpenses, filteredPayments, profiles, groupId).sort(
      (a, b) => b.amount - a.amount
    );
  }

  // Consolidated across multiple groups: simplify within each group then aggregate
  const groupIds = new Set<string>();
  expenses.forEach((e) => {
    if (e.group_id) groupIds.add(e.group_id);
  });
  payments.forEach((p) => {
    if (p.group_id) groupIds.add(p.group_id);
  });

  const profileMap = new Map<string, Profile>();
  profiles.forEach((p) => profileMap.set(p.id, p));

  const combinedDebtMap = new Map<string, number>();
  const getPairKey = (debtorId: string, creditorId: string) => `${debtorId}->${creditorId}`;

  groupIds.forEach((gid) => {
    const gExpenses = expenses.filter((e) => e.group_id === gid);
    const gPayments = payments.filter((p) => p.group_id === gid);
    const gSimplified = simplifySingleScopeBalances(gExpenses, gPayments, profiles, gid);

    gSimplified.forEach((item) => {
      const key = getPairKey(item.debtor.id, item.creditor.id);
      const current = combinedDebtMap.get(key) ?? 0;
      combinedDebtMap.set(key, current + item.amount);
    });
  });

  // Net across groups if symmetric debts exist
  const results: PairwiseBalance[] = [];
  const processedPairs = new Set<string>();

  profiles.forEach((p1) => {
    profiles.forEach((p2) => {
      if (p1.id === p2.id) return;
      const pairId = [p1.id, p2.id].sort().join(':');
      if (processedPairs.has(pairId)) return;
      processedPairs.add(pairId);

      const d1To2 = combinedDebtMap.get(getPairKey(p1.id, p2.id)) ?? 0;
      const d2To1 = combinedDebtMap.get(getPairKey(p2.id, p1.id)) ?? 0;
      const net = d1To2 - d2To1;

      if (Math.abs(net) > 0.01) {
        if (net > 0) {
          const creditor = profileMap.get(p2.id);
          const debtor = profileMap.get(p1.id);
          if (creditor && debtor) {
            results.push({
              creditor,
              debtor,
              amount: Math.round(net * 100) / 100,
            });
          }
        } else {
          const creditor = profileMap.get(p1.id);
          const debtor = profileMap.get(p2.id);
          if (creditor && debtor) {
            results.push({
              creditor,
              debtor,
              amount: Math.round(Math.abs(net) * 100) / 100,
            });
          }
        }
      }
    });
  });

  return results.sort((a, b) => b.amount - a.amount);
}

export function calculatePairwiseBalances(
  expenses: Expense[],
  payments: Payment[],
  profiles: Profile[],
  groupId?: string,
  simplify: boolean = true
): PairwiseBalance[] {
  if (simplify) {
    return calculateSimplifiedBalances(expenses, payments, profiles, groupId);
  }
  return calculateDirectBalances(expenses, payments, profiles, groupId);
}

export function calculateUserSummaries(
  expenses: Expense[],
  payments: Payment[],
  profiles: Profile[],
  groupId?: string
): UserSummaryBalance[] {
  const filteredExpenses = groupId ? expenses.filter((e) => e.group_id === groupId) : expenses;
  const filteredPayments = groupId ? payments.filter((p) => p.group_id === groupId) : payments;

  const profileMap = new Map<string, Profile>();
  profiles.forEach((p) => profileMap.set(p.id, p));

  const sponsorshipMap = buildSponsorshipMap(profiles);

  return profiles.map((user) => {
    const isManaged = sponsorshipMap.has(user.id);
    const sponsorId = sponsorshipMap.get(user.id);
    const sponsorProfile = sponsorId ? profileMap.get(sponsorId) : undefined;

    // Users this person takes responsibility for
    const managedIds = user.managed_user_ids && Array.isArray(user.managed_user_ids)
      ? user.managed_user_ids.filter((id) => id !== user.id)
      : [];
    const managedProfiles = managedIds.map((id) => profileMap.get(id)!).filter(Boolean);

    // If managed by someone else, individual settlement balance is delegated to sponsor
    // All IDs to sum for this user's effective calculations:
    const targetUserIds = [user.id, ...managedIds];

    let totalPaid = 0;
    let totalOwedShare = 0;
    let totalPaymentsMade = 0;
    let totalPaymentsReceived = 0;

    filteredExpenses.forEach((exp) => {
      if (targetUserIds.includes(exp.paid_by)) {
        totalPaid += exp.total_amount;
      }
      if (exp.splits) {
        exp.splits.forEach((s) => {
          if (targetUserIds.includes(s.user_id)) {
            totalOwedShare += s.amount_owed;
          }
        });
      }
    });

    filteredPayments.forEach((p) => {
      if (targetUserIds.includes(p.paid_by)) {
        totalPaymentsMade += p.amount;
      }
      if (targetUserIds.includes(p.paid_to)) {
        totalPaymentsReceived += p.amount;
      }
    });

    const netBalance = isManaged
      ? 0
      : (totalPaid + totalPaymentsMade) - (totalOwedShare + totalPaymentsReceived);

    return {
      user,
      totalPaid,
      totalOwedShare,
      netBalance,
      managedUsers: managedProfiles.length > 0 ? managedProfiles : undefined,
      managedBy: sponsorProfile,
    };
  });
}
