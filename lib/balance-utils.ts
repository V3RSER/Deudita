import { Expense, Payment, Profile, PairwiseBalance, UserSummaryBalance, ManagedContribution } from './types';

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
  const individualNetMap = new Map<string, number>();

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
          const currentEffDebtor = netMap.get(effDebtor) ?? 0;
          netMap.set(effDebtor, currentEffDebtor - split.amount_owed);

          const currentRawDebtor = individualNetMap.get(rawDebtor) ?? 0;
          individualNetMap.set(rawDebtor, currentRawDebtor - split.amount_owed);
        }
      });
      const currentEffPayer = netMap.get(effPayer) ?? 0;
      netMap.set(effPayer, currentEffPayer + totalSplits);

      const currentRawPayer = individualNetMap.get(rawPayer) ?? 0;
      individualNetMap.set(rawPayer, currentRawPayer + totalSplits);
    } else {
      const currentEffPayer = netMap.get(effPayer) ?? 0;
      netMap.set(effPayer, currentEffPayer + exp.total_amount);

      const currentRawPayer = individualNetMap.get(rawPayer) ?? 0;
      individualNetMap.set(rawPayer, currentRawPayer + exp.total_amount);
    }
  });

  payments.forEach((p) => {
    const rawPayer = p.paid_by;
    const rawReceiver = p.paid_to;
    const effPayer = getEffectiveId(rawPayer);
    const effReceiver = getEffectiveId(rawReceiver);

    if (effPayer !== effReceiver) {
      const currentPayer = netMap.get(effPayer) ?? 0;
      netMap.set(effPayer, currentPayer + p.amount);

      const currentReceiver = netMap.get(effReceiver) ?? 0;
      netMap.set(effReceiver, currentReceiver - p.amount);
    }

    if (rawPayer !== rawReceiver) {
      const currentRawPayer = individualNetMap.get(rawPayer) ?? 0;
      individualNetMap.set(rawPayer, currentRawPayer + p.amount);

      const currentRawReceiver = individualNetMap.get(rawReceiver) ?? 0;
      individualNetMap.set(rawReceiver, currentRawReceiver - p.amount);
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
        // Collect managed profiles and breakdown for debtor
        const debtorManagedIds = debtorProfile.managed_user_ids?.filter((id) => id !== debtorProfile.id) || [];
        const debtorManagedProfiles = debtorManagedIds.map((id) => profileMap.get(id)!).filter(Boolean);

        const debtorBreakdown = [
          {
            profile: debtorProfile,
            amount: Math.abs(Math.min(0, individualNetMap.get(debtorProfile.id) ?? 0)),
            isSelf: true,
          },
          ...debtorManagedProfiles.map((dep) => ({
            profile: dep,
            amount: Math.abs(Math.min(0, individualNetMap.get(dep.id) ?? 0)),
            isSelf: false,
          })),
        ].filter((b) => b.amount > 0);

        // Collect managed profiles and breakdown for creditor
        const creditorManagedIds = creditorProfile.managed_user_ids?.filter((id) => id !== creditorProfile.id) || [];
        const creditorManagedProfiles = creditorManagedIds.map((id) => profileMap.get(id)!).filter(Boolean);

        const creditorBreakdown = [
          {
            profile: creditorProfile,
            amount: Math.max(0, individualNetMap.get(creditorProfile.id) ?? 0),
            isSelf: true,
          },
          ...creditorManagedProfiles.map((dep) => ({
            profile: dep,
            amount: Math.max(0, individualNetMap.get(dep.id) ?? 0),
            isSelf: false,
          })),
        ].filter((b) => b.amount > 0);

        simplified.push({
          creditor: creditorProfile,
          debtor: debtorProfile,
          amount: roundedSettle,
          group_id: groupId,
          includedDebtors: debtorManagedProfiles && debtorManagedProfiles.length > 0 ? debtorManagedProfiles : undefined,
          includedCreditors: creditorManagedProfiles && creditorManagedProfiles.length > 0 ? creditorManagedProfiles : undefined,
          debtorBreakdown: debtorBreakdown.length > 1 ? debtorBreakdown : undefined,
          creditorBreakdown: creditorBreakdown.length > 1 ? creditorBreakdown : undefined,
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
  const debtorBreakdownMap = new Map<string, ManagedContribution[]>();
  const creditorBreakdownMap = new Map<string, ManagedContribution[]>();
  const includedDebtorsMap = new Map<string, Profile[]>();
  const includedCreditorsMap = new Map<string, Profile[]>();

  const getPairKey = (debtorId: string, creditorId: string) => `${debtorId}->${creditorId}`;

  groupIds.forEach((gid) => {
    const gExpenses = expenses.filter((e) => e.group_id === gid);
    const gPayments = payments.filter((p) => p.group_id === gid);
    const gSimplified = simplifySingleScopeBalances(gExpenses, gPayments, profiles, gid);

    gSimplified.forEach((item) => {
      const key = getPairKey(item.debtor.id, item.creditor.id);
      const current = combinedDebtMap.get(key) ?? 0;
      combinedDebtMap.set(key, current + item.amount);

      if (item.debtorBreakdown) {
        debtorBreakdownMap.set(key, item.debtorBreakdown);
      }
      if (item.creditorBreakdown) {
        creditorBreakdownMap.set(key, item.creditorBreakdown);
      }
      if (item.includedDebtors) {
        includedDebtorsMap.set(key, item.includedDebtors);
      }
      if (item.includedCreditors) {
        includedCreditorsMap.set(key, item.includedCreditors);
      }
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

      const k1To2 = getPairKey(p1.id, p2.id);
      const k2To1 = getPairKey(p2.id, p1.id);

      const d1To2 = combinedDebtMap.get(k1To2) ?? 0;
      const d2To1 = combinedDebtMap.get(k2To1) ?? 0;
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
              debtorBreakdown: debtorBreakdownMap.get(k1To2),
              creditorBreakdown: creditorBreakdownMap.get(k1To2),
              includedDebtors: includedDebtorsMap.get(k1To2),
              includedCreditors: includedCreditorsMap.get(k1To2),
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
              debtorBreakdown: debtorBreakdownMap.get(k2To1),
              creditorBreakdown: creditorBreakdownMap.get(k2To1),
              includedDebtors: includedDebtorsMap.get(k2To1),
              includedCreditors: includedCreditorsMap.get(k2To1),
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
