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
 * Returns the timestamp corresponding to the entry/creation date (fecha de ingreso).
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

export interface DebtBreakdownItem {
  expense: Expense;
  split: ExpenseSplit;
  originalAmount: number;
  paidAmount: number;
  pendingAmount: number;
  isFullyPaid: boolean;
  isPartiallyPaid: boolean;
  participantProfile?: Profile;
  payerProfile?: Profile;
  isManagedParticipant?: boolean;
  groupName?: string;
  currency?: string;
}

export interface AppliedPaymentItem {
  payment: Payment;
  amountApplied: number;
  payerProfile?: Profile;
  receiverProfile?: Profile;
  groupName?: string;
}

export interface ReverseOffsetItem {
  expense: Expense;
  split: ExpenseSplit;
  amount: number;
  payerProfile?: Profile;
  participantProfile?: Profile;
  isManagedParticipant?: boolean;
  groupName?: string;
}

export interface ThirdPartyTriangulationExpense {
  expense: Expense;
  split?: ExpenseSplit;
  description: string;
  totalExpenseAmount: number;
  originalDebtAmount: number;
  allocatedDiscountAmount: number;
  role:
    | 'debtor_owes_third_party'
    | 'third_party_owes_creditor'
    | 'creditor_owes_third_party'
    | 'third_party_owes_debtor'
    | 'group_shared';
  payerName: string;
  payerProfile?: Profile;
  participantName: string;
  participantProfile?: Profile;
  date: string;
  groupName?: string;
  currency?: string;
  receiptUrl?: string;
}

export interface ThirdPartyTriangulation {
  thirdParty: Profile;
  thirdPartyName: string;
  amount: number;
  isDiscount: boolean;
  role:
    | 'debtor_pays_third_party'
    | 'third_party_pays_creditor'
    | 'creditor_owes_third_party'
    | 'mutual_cross_compensation'
    | 'debt_consolidation';
  shortSummary: string;
  explanation: string;
  directDebtsWithDebtor: number;
  directDebtsWithCreditor: number;
  expenses: ThirdPartyTriangulationExpense[];
}

export interface RealCompensationRelation {
  id: string;
  from: Profile;
  to: Profile;
  amount: number;
  direction:
    | 'creditor_owes_third'
    | 'third_owes_creditor'
    | 'debtor_owes_third'
    | 'third_owes_debtor'
    | 'consolidation';
  roleDescription: string;
  operation: '+' | '-';
  expenses: Expense[];
}

export interface GroupOptimizationDetail {
  simplifiedDiff: number;
  isDiscount: boolean;
  directBalance: number;
  simplifiedAmount: number;
  totalCompensated: number;
  triangulations: ThirdPartyTriangulation[];
  summaryNarrative: string;
  primaryRelation?: {
    from: Profile;
    to: Profile;
    amount: number;
  };
  relevantRelations?: RealCompensationRelation[];
  compensationFormula?: string;
  compensationLabel?: string;
  settlementFormula?: string;
  settlementLabel?: string;
  closingSummary?: string;
}

export interface SimplificationExpenseItem {
  expense: Expense;
  split?: ExpenseSplit;
  relevantAmount: number;
  role: 'debtor_owes_third_party' | 'creditor_paid_third_party';
  payerProfile?: Profile;
  participantProfile?: Profile;
  groupName?: string;
  currency?: string;
  explanation: string;
}

export interface TriangularDebtChain {
  thirdParty: Profile;
  groupName?: string;
  currency?: string;
  debtorOwesThirdPartyAmount: number;
  thirdPartyOwesCreditorAmount: number;
  debtorToThirdPartyExpenses: {
    expense: Expense;
    split?: ExpenseSplit;
    amount: number;
    groupName?: string;
    currency?: string;
  }[];
  thirdPartyToCreditorExpenses: {
    expense: Expense;
    split?: ExpenseSplit;
    amount: number;
    groupName?: string;
    currency?: string;
  }[];
  explanation: string;
}

export interface PairwiseDebtDetail {
  debtor: Profile;
  creditor: Profile;
  totalOriginalDebt: number;
  totalPaymentsApplied: number;
  totalReverseOffsets: number;
  netPendingAmount: number;
  netDirectBalance: number;
  pendingExpenses: DebtBreakdownItem[];
  settledExpenses: DebtBreakdownItem[];
  allExpenses: DebtBreakdownItem[];
  appliedPayments: AppliedPaymentItem[];
  settledPayments: AppliedPaymentItem[];
  reverseOffsetExpenses: ReverseOffsetItem[];
  simplificationExpenses: SimplificationExpenseItem[];
  triangularChains: TriangularDebtChain[];
  optimizationDetail?: GroupOptimizationDetail;
}

export function calculatePairwiseDebtDetail(
  debtor: Profile,
  creditor: Profile,
  expenses: Expense[],
  payments: Payment[],
  profiles: Profile[],
  groups: Group[],
  isSimplified: boolean = true,
  groupId?: string,
  skipSimplification: boolean = false
): PairwiseDebtDetail {
  const filteredExpenses = groupId ? expenses.filter((e) => e.group_id === groupId) : expenses;
  const filteredPayments = groupId ? payments.filter((p) => p.group_id === groupId) : payments;

  const profileMap = new Map<string, Profile>();
  profiles.forEach((p) => profileMap.set(p.id, p));

  const groupMap = new Map<string, Group>();
  groups.forEach((g) => groupMap.set(g.id, g));

  // Debtor IDs & Creditor IDs
  const debtorManagedIds = (debtor.managed_user_ids || []).filter((id) => id !== debtor.id);
  const creditorManagedIds = (creditor.managed_user_ids || []).filter((id) => id !== creditor.id);

  const debtorIds = isSimplified ? [debtor.id, ...debtorManagedIds] : [debtor.id];
  const creditorIds = isSimplified ? [creditor.id, ...creditorManagedIds] : [creditor.id];

  // 1. Primary expense splits: Creditor paid, Debtor owes
  interface RawDebtSplit {
    expense: Expense;
    split: ExpenseSplit;
    originalAmount: number;
    participantProfile?: Profile;
    payerProfile?: Profile;
    isManagedParticipant?: boolean;
    date: string;
    entryTime: number;
    groupName?: string;
    currency?: string;
  }

  const rawPrimaryDebts: RawDebtSplit[] = [];

  filteredExpenses.forEach((exp) => {
    if (creditorIds.includes(exp.paid_by) && exp.splits) {
      exp.splits.forEach((s) => {
        if (debtorIds.includes(s.user_id) && s.amount_owed > 0) {
          const g = groupMap.get(exp.group_id);
          const entryTime = getEntryTimestamp(exp);
          rawPrimaryDebts.push({
            expense: exp,
            split: s,
            originalAmount: s.amount_owed,
            participantProfile: profileMap.get(s.user_id),
            payerProfile: profileMap.get(exp.paid_by),
            isManagedParticipant: s.user_id !== debtor.id,
            date: exp.expense_date || exp.created_at || '1970-01-01',
            entryTime,
            groupName: g?.name,
            currency: g?.currency || 'COP',
          });
        }
      });
    }
  });

  // Sort chronological ASC by entryTime (created_at) so FIFO settlement covers oldest entered expenses first
  rawPrimaryDebts.sort((a, b) => {
    const diff = a.entryTime - b.entryTime;
    if (diff !== 0) return diff;
    return a.originalAmount - b.originalAmount;
  });

  // 2. Direct Payments: Debtor paid to Creditor
  interface RawPaymentItem {
    payment: Payment;
    amount: number;
    payerProfile?: Profile;
    receiverProfile?: Profile;
    groupName?: string;
    date: string;
    entryTime: number;
  }

  const rawPayments: RawPaymentItem[] = [];
  let directPaymentsFromDebtor = 0;

  filteredPayments.forEach((pay) => {
    if (debtorIds.includes(pay.paid_by) && creditorIds.includes(pay.paid_to) && pay.amount > 0) {
      directPaymentsFromDebtor += pay.amount;
      const g = groupMap.get(pay.group_id);
      const entryTime = getEntryTimestamp(pay);
      rawPayments.push({
        payment: pay,
        amount: pay.amount,
        payerProfile: profileMap.get(pay.paid_by),
        receiverProfile: profileMap.get(pay.paid_to),
        groupName: g?.name,
        date: pay.payment_date || pay.created_at || '1970-01-01',
        entryTime,
      });
    }
  });

  // Payments from Creditor to Debtor (if any, reduce offset pool)
  let reversePayments = 0;
  filteredPayments.forEach((pay) => {
    if (creditorIds.includes(pay.paid_by) && debtorIds.includes(pay.paid_to)) {
      reversePayments += pay.amount;
    }
  });

  // Sort payments chronological ASC by entryTime (created_at)
  rawPayments.sort((a, b) => a.entryTime - b.entryTime);

  // 3. Reverse expense splits: Debtor paid, Creditor owes (offsets debtor's balance)
  interface RawReverseOffset {
    expense: Expense;
    split: ExpenseSplit;
    amount: number;
    payerProfile?: Profile;
    participantProfile?: Profile;
    isManagedParticipant?: boolean;
    groupName?: string;
    date: string;
    entryTime: number;
  }

  const rawReverseOffsets: RawReverseOffset[] = [];
  filteredExpenses.forEach((exp) => {
    if (debtorIds.includes(exp.paid_by) && exp.splits) {
      exp.splits.forEach((s) => {
        if (creditorIds.includes(s.user_id) && s.amount_owed > 0) {
          const g = groupMap.get(exp.group_id);
          const entryTime = getEntryTimestamp(exp);
          rawReverseOffsets.push({
            expense: exp,
            split: s,
            amount: s.amount_owed,
            payerProfile: profileMap.get(exp.paid_by),
            participantProfile: profileMap.get(s.user_id),
            isManagedParticipant: s.user_id !== creditor.id,
            groupName: g?.name,
            date: exp.expense_date || exp.created_at || '1970-01-01',
            entryTime,
          });
        }
      });
    }
  });

  // Sort reverse offsets chronological ASC by entryTime (created_at)
  rawReverseOffsets.sort((a, b) => a.entryTime - b.entryTime);

  // 4. Build unified offset pool (payments + reverse offsets) in chronological order
  interface OffsetPoolItem {
    type: 'payment' | 'reverse_offset';
    id: string;
    date: string;
    entryTime: number;
    originalAmount: number;
    remainingAmount: number;
    appliedToActive: number;
    consumedBySettled: number;
    payment?: RawPaymentItem;
    reverseOffset?: RawReverseOffset;
  }

  const offsetPool: OffsetPoolItem[] = [];

  // Reduce reverse payments from raw payments first (oldest first)
  let remainingReversePaymentDeduction = reversePayments;
  rawPayments.forEach((p, idx) => {
    let effectiveAmount = p.amount;
    if (remainingReversePaymentDeduction > 0) {
      const deduct = Math.min(effectiveAmount, remainingReversePaymentDeduction);
      effectiveAmount -= deduct;
      remainingReversePaymentDeduction -= deduct;
    }
    if (effectiveAmount > 0.009) {
      offsetPool.push({
        type: 'payment',
        id: p.payment.id || `pay_${idx}`,
        date: p.date,
        entryTime: p.entryTime,
        originalAmount: effectiveAmount,
        remainingAmount: effectiveAmount,
        appliedToActive: 0,
        consumedBySettled: 0,
        payment: p,
      });
    }
  });

  rawReverseOffsets.forEach((r, idx) => {
    offsetPool.push({
      type: 'reverse_offset',
      id: `${r.expense.id}_${r.split.user_id}_${idx}`,
      date: r.date,
      entryTime: r.entryTime,
      originalAmount: r.amount,
      remainingAmount: r.amount,
      appliedToActive: 0,
      consumedBySettled: 0,
      reverseOffset: r,
    });
  });

  // Sort offset pool chronological ASC by entryTime (created_at)
  offsetPool.sort((a, b) => a.entryTime - b.entryTime);

  // 5. FIFO Matching of offsets against primary debts
  const calculatedDebts: DebtBreakdownItem[] = [];

  rawPrimaryDebts.forEach((pDebt) => {
    let debtRemaining = Math.round(pDebt.originalAmount * 100) / 100;
    let debtPaid = 0;
    const currentMatches: { offset: OffsetPoolItem; amount: number }[] = [];

    for (const offset of offsetPool) {
      if (debtRemaining <= 0.009) break;
      if (offset.remainingAmount > 0.009) {
        const take = Math.min(debtRemaining, offset.remainingAmount);
        debtRemaining = Math.round((debtRemaining - take) * 100) / 100;
        debtPaid = Math.round((debtPaid + take) * 100) / 100;
        offset.remainingAmount = Math.round((offset.remainingAmount - take) * 100) / 100;
        currentMatches.push({ offset, amount: take });
      }
    }

    const isFullyPaid = debtRemaining < 0.009;
    const isPartiallyPaid = debtPaid > 0.009 && !isFullyPaid;

    calculatedDebts.push({
      expense: pDebt.expense,
      split: pDebt.split,
      originalAmount: pDebt.originalAmount,
      paidAmount: debtPaid,
      pendingAmount: isFullyPaid ? 0 : debtRemaining,
      isFullyPaid,
      isPartiallyPaid,
      participantProfile: pDebt.participantProfile,
      payerProfile: pDebt.payerProfile,
      isManagedParticipant: pDebt.isManagedParticipant,
      groupName: pDebt.groupName,
      currency: pDebt.currency,
    });

    if (isFullyPaid) {
      currentMatches.forEach((m) => {
        m.offset.consumedBySettled = Math.round((m.offset.consumedBySettled + m.amount) * 100) / 100;
      });
    } else {
      currentMatches.forEach((m) => {
        m.offset.appliedToActive = Math.round((m.offset.appliedToActive + m.amount) * 100) / 100;
      });
    }
  });

  // If there are unconsumed offsets remaining in pool (e.g. overpayment or advance payment), they apply to active
  offsetPool.forEach((offset) => {
    if (offset.remainingAmount > 0.009) {
      offset.appliedToActive = Math.round((offset.appliedToActive + offset.remainingAmount) * 100) / 100;
    }
  });

  // 6. Direct items between debtor and creditor
  const pendingExpenses: DebtBreakdownItem[] = rawPrimaryDebts
    .map((pDebt) => ({
      expense: pDebt.expense,
      split: pDebt.split,
      originalAmount: pDebt.originalAmount,
      paidAmount: 0,
      pendingAmount: pDebt.originalAmount,
      isFullyPaid: false,
      isPartiallyPaid: false,
      participantProfile: pDebt.participantProfile,
      payerProfile: pDebt.payerProfile,
      isManagedParticipant: pDebt.isManagedParticipant,
      groupName: pDebt.groupName,
      currency: pDebt.currency,
    }))
    .sort((a, b) => new Date(b.expense.expense_date || '').getTime() - new Date(a.expense.expense_date || '').getTime());

  const settledExpenses: DebtBreakdownItem[] = [];

  const appliedPayments: AppliedPaymentItem[] = rawPayments
    .map((p) => ({
      payment: p.payment,
      amountApplied: p.amount,
      payerProfile: p.payerProfile,
      receiverProfile: p.receiverProfile,
      groupName: p.groupName,
    }))
    .sort((a, b) => new Date(b.payment.payment_date || '').getTime() - new Date(a.payment.payment_date || '').getTime());

  const settledPayments: AppliedPaymentItem[] = [];

  const reverseOffsets: ReverseOffsetItem[] = rawReverseOffsets
    .map((r) => ({
      expense: r.expense,
      split: r.split,
      amount: r.amount,
      payerProfile: r.payerProfile,
      participantProfile: r.participantProfile,
      isManagedParticipant: r.isManagedParticipant,
      groupName: r.groupName,
    }))
    .sort((a, b) => new Date(b.expense.expense_date || '').getTime() - new Date(a.expense.expense_date || '').getTime());

  const totalOriginalDebt = pendingExpenses.reduce((sum, d) => sum + d.originalAmount, 0);
  const totalPaymentsApplied = appliedPayments.reduce((sum, p) => sum + p.amountApplied, 0);
  const totalReverseOffsets = reverseOffsets.reduce((sum, r) => sum + r.amount, 0);

  // Direct 1-to-1 balance between debtor and creditor
  const directPair = calculateDirectBalances(filteredExpenses, filteredPayments, profiles, groupId).find(
    (pb) => pb.debtor.id === debtor.id && pb.creditor.id === creditor.id
  );
  const directCalculated = Math.round((totalOriginalDebt - (totalReverseOffsets + totalPaymentsApplied)) * 100) / 100;
  const netDirectBalance = directPair ? directPair.amount : Math.max(0, directCalculated);
  const netPendingAmount = Math.max(0, netDirectBalance);

  // 7. Group optimization: Real debt network compensation & traceable graph derivation
  const simplificationExpenses: SimplificationExpenseItem[] = [];
  let optimizationDetail: GroupOptimizationDetail | undefined = undefined;

  if (isSimplified && !skipSimplification && netDirectBalance > 0.009) {
    const allDirectDebts = calculateDirectBalances(
      filteredExpenses,
      filteredPayments,
      profiles,
      groupId
    );

    const currencyForFormatting = groupId
      ? groups.find((g) => g.id === groupId)?.currency || 'COP'
      : 'COP';

    const getExpensesForPair = (payerId: string, partId: string): Expense[] => {
      return filteredExpenses.filter((e) => {
        if (e.paid_by !== payerId) return false;
        return e.splits?.some((s) => s.user_id === partId && s.amount_owed > 0);
      });
    };

    // Direct debts where Creditor owes others (Creditor -> TP)
    const creditorDebtsToOthers = allDirectDebts
      .filter((b) => b.debtor.id === creditor.id && b.creditor.id !== debtor.id)
      .sort((a, b) => b.amount - a.amount);

    // Direct debts where other third parties owe Creditor (TP -> Creditor)
    const othersDebtsToCreditor = allDirectDebts
      .filter((b) => b.creditor.id === creditor.id && b.debtor.id !== debtor.id)
      .sort((a, b) => b.amount - a.amount);

    // Direct debts where Debtor owes others (Debtor -> TP)
    const debtorDebtsToOthers = allDirectDebts
      .filter((b) => b.debtor.id === debtor.id && b.creditor.id !== creditor.id)
      .sort((a, b) => b.amount - a.amount);

    const relevantRelations: RealCompensationRelation[] = [];
    let compFormula: string | undefined = undefined;
    let compLabel: string | undefined = undefined;
    let isDiscount = true;
    let totalCompensated = 0;

    // PATH 1: Creditor has outgoing debts to other members (Creditor -> C)
    if (creditorDebtsToOthers.length > 0) {
      const grossCreditorOut = creditorDebtsToOthers.reduce((acc, b) => acc + b.amount, 0);
      const grossOthersInToCreditor = othersDebtsToCreditor.reduce((acc, b) => acc + b.amount, 0);
      const netCreditorOutgoing = Math.round((grossCreditorOut - grossOthersInToCreditor) * 100) / 100;

      if (netCreditorOutgoing > 0.009) {
        isDiscount = true;
        totalCompensated = Math.round(Math.min(netDirectBalance, netCreditorOutgoing) * 100) / 100;

        creditorDebtsToOthers.forEach((b) => {
          relevantRelations.push({
            id: `c-owes-${b.creditor.id}`,
            from: b.debtor,
            to: b.creditor,
            amount: b.amount,
            direction: 'creditor_owes_third',
            roleDescription: `${b.debtor.full_name || 'Acreedor'} debe a ${b.creditor.full_name || 'Tercero'}`,
            operation: '+',
            expenses: getExpensesForPair(b.creditor.id, b.debtor.id),
          });

          // Check for chained outgoing debt B -> C -> D
          const cDebtsToOthers = allDirectDebts
            .filter((d) => d.debtor.id === b.creditor.id && d.creditor.id !== creditor.id && d.creditor.id !== debtor.id)
            .sort((x, y) => y.amount - x.amount);
          if (cDebtsToOthers.length > 0) {
            cDebtsToOthers.forEach((d) => {
              relevantRelations.push({
                id: `c-chain-${d.creditor.id}`,
                from: d.debtor,
                to: d.creditor,
                amount: d.amount,
                direction: 'creditor_owes_third',
                roleDescription: `${d.debtor.full_name} debe a ${d.creditor.full_name}`,
                operation: '+',
                expenses: getExpensesForPair(d.creditor.id, d.debtor.id),
              });
            });
          }
        });

        othersDebtsToCreditor.forEach((b) => {
          relevantRelations.push({
            id: `owes-c-${b.debtor.id}`,
            from: b.debtor,
            to: b.creditor,
            amount: b.amount,
            direction: 'third_owes_creditor',
            roleDescription: `lo que ya recibe de ${b.debtor.full_name || 'Tercero'}`,
            operation: '-',
            expenses: getExpensesForPair(b.creditor.id, b.debtor.id),
          });
        });

        if (creditorDebtsToOthers.length === 1 && othersDebtsToCreditor.length === 1) {
          const outRel = creditorDebtsToOthers[0];
          const inRel = othersDebtsToCreditor[0];
          compFormula = `${formatCurrency(outRel.amount, currencyForFormatting)} − ${formatCurrency(inRel.amount, currencyForFormatting)} = ${formatCurrency(totalCompensated, currencyForFormatting)}`;
          compLabel = `${outRel.debtor.full_name} debe a ${outRel.creditor.full_name} − lo que ya recibe de ${inRel.debtor.full_name} = parte compensable`;
        } else if (othersDebtsToCreditor.length === 0 && creditorDebtsToOthers.length === 1) {
          const outRel = creditorDebtsToOthers[0];
          compFormula = `${formatCurrency(outRel.amount, currencyForFormatting)} = ${formatCurrency(totalCompensated, currencyForFormatting)}`;
          compLabel = `${outRel.debtor.full_name} debe a ${outRel.creditor.full_name} = parte compensable`;
        } else {
          const outParts = creditorDebtsToOthers.map((b) => formatCurrency(b.amount, currencyForFormatting)).join(' + ');
          const inParts = othersDebtsToCreditor.map((b) => formatCurrency(b.amount, currencyForFormatting)).join(' − ');
          const leftSide = inParts ? `${outParts} − ${inParts}` : outParts;
          compFormula = `${leftSide} = ${formatCurrency(totalCompensated, currencyForFormatting)}`;
          compLabel = `Obligaciones salientes de ${creditor.full_name} − ingresos recibidos de otros = parte compensable`;
        }
      }
    } else if (debtorDebtsToOthers.length > 0) {
      // PATH 2: Debtor owes third party (A -> T -> B)
      const matchingThird = debtorDebtsToOthers.find((d) =>
        allDirectDebts.some((b) => b.debtor.id === d.creditor.id && b.creditor.id === creditor.id)
      ) || debtorDebtsToOthers[0];

      if (matchingThird) {
        const tToC = allDirectDebts.find((b) => b.debtor.id === matchingThird.creditor.id && b.creditor.id === creditor.id);
        const compensableT = tToC
          ? Math.min(netDirectBalance, matchingThird.amount, tToC.amount)
          : Math.min(netDirectBalance, matchingThird.amount);

        if (compensableT > 0.009) {
          isDiscount = true;
          totalCompensated = Math.round(compensableT * 100) / 100;
          relevantRelations.push({
            id: `d-owes-${matchingThird.creditor.id}`,
            from: matchingThird.debtor,
            to: matchingThird.creditor,
            amount: matchingThird.amount,
            direction: 'debtor_owes_third',
            roleDescription: `${matchingThird.debtor.full_name} transfiere a ${matchingThird.creditor.full_name}`,
            operation: '+',
            expenses: getExpensesForPair(matchingThird.creditor.id, matchingThird.debtor.id),
          });
          if (tToC) {
            relevantRelations.push({
              id: `t-owes-c-${tToC.creditor.id}`,
              from: tToC.debtor,
              to: tToC.creditor,
              amount: tToC.amount,
              direction: 'third_owes_creditor',
              roleDescription: `${tToC.debtor.full_name} transfiere a ${tToC.creditor.full_name}`,
              operation: '+',
              expenses: getExpensesForPair(tToC.creditor.id, tToC.debtor.id),
            });
          }
          compFormula = `${formatCurrency(compensableT, currencyForFormatting)} = ${formatCurrency(totalCompensated, currencyForFormatting)}`;
          compLabel = `${matchingThird.debtor.full_name} compensa vía ${matchingThird.creditor.full_name} = parte compensable`;
        }
      }
    }

    if (totalCompensated > 0.009 && relevantRelations.length > 0) {
      const simplifiedAmount = Math.max(0, Math.round((netDirectBalance - totalCompensated) * 100) / 100);
      const debtorDisplayName = debtor.full_name || 'Deudor';
      const creditorDisplayName = creditor.full_name || 'Acreedor';

      const triangulations: ThirdPartyTriangulation[] = [];
      relevantRelations.forEach((rel) => {
        const thirdParty = rel.from.id === debtor.id || rel.from.id === creditor.id ? rel.to : rel.from;
        const tpExpenses: ThirdPartyTriangulationExpense[] = (rel.expenses || []).map((exp) => ({
          expense: exp,
          description: exp.description,
          totalExpenseAmount: exp.total_amount,
          originalDebtAmount: exp.total_amount,
          allocatedDiscountAmount: Math.min(rel.amount, exp.total_amount),
          role: rel.direction === 'creditor_owes_third' ? 'creditor_owes_third_party' : 'third_party_owes_creditor',
          payerName: rel.to.full_name || 'Integrante',
          payerProfile: rel.to,
          participantName: rel.from.full_name || 'Integrante',
          participantProfile: rel.from,
          date: exp.expense_date || 'Reciente',
          groupName: groups.find((g) => g.id === exp.group_id)?.name,
          currency: groups.find((g) => g.id === exp.group_id)?.currency || currencyForFormatting,
          receiptUrl: exp.receipt_url,
        }));

        triangulations.push({
          thirdParty,
          thirdPartyName: thirdParty.full_name || 'Tercero',
          amount: rel.amount,
          isDiscount,
          role: rel.direction === 'creditor_owes_third' ? 'creditor_owes_third_party' : 'third_party_pays_creditor',
          shortSummary: rel.roleDescription,
          explanation: `${rel.from.full_name} tiene una obligación directa de ${formatCurrency(rel.amount, currencyForFormatting)} con ${rel.to.full_name}.`,
          directDebtsWithDebtor: 0,
          directDebtsWithCreditor: rel.amount,
          expenses: tpExpenses,
        });
      });

      const summaryNarrative = `La cuenta directa 1 a 1 entre ${debtorDisplayName} y ${creditorDisplayName} es de ${formatCurrency(
        netDirectBalance,
        currencyForFormatting
      )}. Para optimizar y simplificar las cuentas del grupo, se descuentan -${formatCurrency(
        totalCompensated,
        currencyForFormatting
      )} de esta transferencia porque se compensan mediante las obligaciones de la red grupal.`;

      const settlementFormula = `${formatCurrency(netDirectBalance, currencyForFormatting)} − ${formatCurrency(
        totalCompensated,
        currencyForFormatting
      )} = ${formatCurrency(simplifiedAmount, currencyForFormatting)}`;

      const settlementLabel = 'Deuda original − compensado = saldo restante';

      const closingSummary = `Por esta compensación, de los ${formatCurrency(
        netDirectBalance,
        currencyForFormatting
      )} que ${debtorDisplayName} debía a ${creditorDisplayName}, ${formatCurrency(
        totalCompensated,
        currencyForFormatting
      )} dejan de pagarse directamente a ella. Quedan ${formatCurrency(
        simplifiedAmount,
        currencyForFormatting
      )} por transferir.`;

      optimizationDetail = {
        simplifiedDiff: -totalCompensated,
        isDiscount: true,
        directBalance: netDirectBalance,
        simplifiedAmount,
        totalCompensated,
        triangulations,
        summaryNarrative,
        primaryRelation: {
          from: debtor,
          to: creditor,
          amount: netDirectBalance,
        },
        relevantRelations,
        compensationFormula: compFormula,
        compensationLabel: compLabel,
        settlementFormula,
        settlementLabel,
        closingSummary,
      };
    }
  }

  return {
    debtor,
    creditor,
    totalOriginalDebt: Math.round(totalOriginalDebt * 100) / 100,
    totalPaymentsApplied: Math.round(totalPaymentsApplied * 100) / 100,
    totalReverseOffsets: Math.round(totalReverseOffsets * 100) / 100,
    netPendingAmount,
    netDirectBalance,
    pendingExpenses,
    settledExpenses,
    allExpenses: calculatedDebts,
    appliedPayments,
    settledPayments,
    reverseOffsetExpenses: reverseOffsets,
    simplificationExpenses: simplificationExpenses.sort(
      (a, b) => new Date(b.expense.expense_date || '').getTime() - new Date(a.expense.expense_date || '').getTime()
    ),
    triangularChains: [],
    optimizationDetail,
  };
}

export interface MemberPeerBalance {
  member: Profile;
  debtAmount: number; // Monto de consumo pendiente activo con este par
  historicalDebtAmount: number; // Consumo histórico total
  pendingDebtAmount: number; // Consumo pendiente activo
  settledDebtAmount: number; // Consumo ya saldado
  recoverAmount: number; // Monto que recupera activo de este par
  historicalRecoverAmount: number; // Monto que recupera histórico
  pendingRecoverAmount: number; // Monto activo que recupera
  settledRecoverAmount: number; // Monto ya aplicado a saldar consumos
  netAmount: number; // positivo = member le debe al par, negativo = el par le debe a member
  settlementAmount: number; // monto final a pagar en el modo actual (simplificado o directo)
  isTargetCreditor: boolean;
  consumedExpensesCount: number;
  paidExpensesCount: number;
}

export interface MemberAccountStatement {
  member: Profile;
  targetCreditor?: Profile;
  
  // 1. Deudas / Consumos
  consumedExpenses: Expense[];
  pendingConsumedExpenses: Expense[];
  settledConsumedExpenses: Expense[];
  pendingDebtBreakdown: DebtBreakdownItem[];
  settledDebtBreakdown: DebtBreakdownItem[];
  totalConsumedDebt: number;
  totalPendingDebt: number;
  totalSettledDebt: number;
  
  // 2. Aportes / Lo que recupera
  paidExpenses: Expense[];
  activePaidExpenses: Expense[];
  settledPaidExpenses: Expense[];
  memberPaymentsMade: Payment[];
  activePaymentsMade: Payment[];
  settledPaymentsMade: Payment[];
  memberPaymentsReceived: Payment[];
  totalDirectPaymentsMade: number;
  totalDirectPaymentsReceived: number;
  totalRecoverable: number;
  totalActiveRecoverable: number;
  totalSettledRecoverable: number;
  
  // 3. Balance Neto Global
  netGlobalBalance: number; // totalRecoverable - totalConsumedDebt (negativo = es deudor neto)
  totalNetDebt: number; // max(0, totalConsumedDebt - totalRecoverable)
  
  // 4. Distribución entre integrantes
  peerBalances: MemberPeerBalance[];
  finalCreditors: { member: Profile; amount: number }[];
  finalDebtors: { member: Profile; amount: number }[];
  
  // 5. Compensaciones y Triangulaciones
  isSimplified: boolean;
  totalCompensationsApplied: number;
  triangulations: ThirdPartyTriangulation[];
  optimizationDetail?: GroupOptimizationDetail;
  
  // 6. Paso a paso del cálculo
  calculation: {
    totalPendingDebt: number;
    totalActiveRecoverable: number;
    totalConsumedDebt: number;
    totalRecoverable: number;
    totalSettledDebt: number;
    totalSettledRecoverable: number;
    netGlobalBalance: number;
    compensationDiscount: number;
    targetSettlementAmount: number;
  };
}

export function calculateMemberAccountStatement(
  member: Profile,
  targetCreditor: Profile | undefined,
  expenses: Expense[],
  payments: Payment[],
  profiles: Profile[],
  groups: Group[],
  isSimplified: boolean = true,
  groupId?: string
): MemberAccountStatement {
  const filteredExpenses = groupId ? expenses.filter((e) => e.group_id === groupId) : expenses;
  const filteredPayments = groupId ? payments.filter((p) => p.group_id === groupId) : payments;

  const profileMap = new Map<string, Profile>();
  profiles.forEach((p) => profileMap.set(p.id, p));

  const groupMap = new Map<string, Group>();
  groups.forEach((g) => groupMap.set(g.id, g));

  const memberId = member.id;

  // Track active pending consumptions and active aportes per peer
  const pendingDebtBreakdown: DebtBreakdownItem[] = [];
  const settledDebtBreakdown: DebtBreakdownItem[] = [];
  const activePaidExpensesMap = new Map<string, Expense>();
  const settledPaidExpensesMap = new Map<string, Expense>();
  const activePaymentsMadeMap = new Map<string, Payment>();
  const settledPaymentsMadeMap = new Map<string, Payment>();
  const pendingExpensesMap = new Map<string, Expense>();
  const settledExpensesMap = new Map<string, Expense>();
  const allConsumedExpensesMap = new Map<string, Expense>();
  const allPaidExpensesMap = new Map<string, Expense>();

  const otherProfiles = profiles.filter((p) => p.id !== memberId);
  const peerBreakdowns = new Map<
    string,
    {
      pendingDebtAmount: number;
      settledDebtAmount: number;
      pendingRecoverAmount: number;
      settledRecoverAmount: number;
      consumedExpensesCount: number;
      paidExpensesCount: number;
    }
  >();

  otherProfiles.forEach((other) => {
    const peerId = other.id;

    // 1. Consumptions: expenses where 'other' paid and 'member' owes
    interface PeerSplit {
      expense: Expense;
      split: ExpenseSplit;
      amount: number;
      entryTime: number;
    }
    const debtsFromMember: PeerSplit[] = [];
    let consumedCount = 0;

    filteredExpenses.forEach((exp) => {
      if (exp.paid_by === peerId && exp.splits) {
        const split = exp.splits.find((s) => s.user_id === memberId);
        if (split && split.amount_owed > 0) {
          debtsFromMember.push({
            expense: exp,
            split,
            amount: split.amount_owed,
            entryTime: getEntryTimestamp(exp),
          });
          consumedCount++;
          allConsumedExpensesMap.set(exp.id, exp);
        }
      }
    });
    debtsFromMember.sort((a, b) => a.entryTime - b.entryTime);

    // 2. Aportes: expenses where 'member' paid and 'other' owes
    const debtsFromPeer: PeerSplit[] = [];
    let paidCount = 0;

    filteredExpenses.forEach((exp) => {
      if (exp.paid_by === memberId && exp.splits) {
        allPaidExpensesMap.set(exp.id, exp);
        const split = exp.splits.find((s) => s.user_id === peerId);
        if (split && split.amount_owed > 0) {
          debtsFromPeer.push({
            expense: exp,
            split,
            amount: split.amount_owed,
            entryTime: getEntryTimestamp(exp),
          });
          paidCount++;
        }
      }
    });
    debtsFromPeer.sort((a, b) => a.entryTime - b.entryTime);

    // 3. Payments between member and peer
    interface PeerPayment {
      payment: Payment;
      amount: number;
      entryTime: number;
    }
    const paymentsMemberToPeer: PeerPayment[] = [];
    const paymentsPeerToMember: PeerPayment[] = [];

    filteredPayments.forEach((pay) => {
      if (pay.paid_by === memberId && pay.paid_to === peerId && pay.amount > 0) {
        paymentsMemberToPeer.push({
          payment: pay,
          amount: pay.amount,
          entryTime: getEntryTimestamp(pay),
        });
      }
      if (pay.paid_by === peerId && pay.paid_to === memberId && pay.amount > 0) {
        paymentsPeerToMember.push({
          payment: pay,
          amount: pay.amount,
          entryTime: getEntryTimestamp(pay),
        });
      }
    });
    paymentsMemberToPeer.sort((a, b) => a.entryTime - b.entryTime);
    paymentsPeerToMember.sort((a, b) => a.entryTime - b.entryTime);

    // Total gross money provided by member to peer (payments + expenses paid for peer)
    const grossCreditFromMember =
      paymentsMemberToPeer.reduce((sum, p) => sum + p.amount, 0) +
      debtsFromPeer.reduce((sum, d) => sum + d.amount, 0);

    // Total gross money provided by peer to member (payments + expenses peer paid for member)
    const grossCreditFromPeer =
      paymentsPeerToMember.reduce((sum, p) => sum + p.amount, 0) +
      debtsFromMember.reduce((sum, d) => sum + d.amount, 0);

    // Net pairwise balance
    const netDirect = Math.round((grossCreditFromPeer - grossCreditFromMember) * 100) / 100;

    let pendingDebtWithPeer = 0;
    let settledDebtWithPeer = 0;
    let pendingRecoverWithPeer = 0;
    let settledRecoverWithPeer = 0;

    if (netDirect > 0.009) {
      // Member owes peer netDirect.
      let creditRemaining = Math.max(
        0,
        grossCreditFromMember - paymentsPeerToMember.reduce((sum, p) => sum + p.amount, 0)
      );

      debtsFromMember.forEach((item) => {
        let splitOwed = item.amount;
        let splitPaid = 0;
        if (creditRemaining > 0.009) {
          const take = Math.min(splitOwed, creditRemaining);
          splitOwed = Math.round((splitOwed - take) * 100) / 100;
          splitPaid = take;
          creditRemaining = Math.round((creditRemaining - take) * 100) / 100;
        }

        const isFullyPaid = splitOwed < 0.009;
        const isPartiallyPaid = splitPaid > 0.009 && !isFullyPaid;
        const g = groupMap.get(item.expense.group_id);

        const breakdownItem: DebtBreakdownItem = {
          expense: item.expense,
          split: item.split,
          originalAmount: item.amount,
          paidAmount: splitPaid,
          pendingAmount: isFullyPaid ? 0 : splitOwed,
          isFullyPaid,
          isPartiallyPaid,
          participantProfile: profileMap.get(memberId),
          payerProfile: profileMap.get(peerId),
          groupName: g?.name,
          currency: g?.currency || 'COP',
        };

        if (isFullyPaid) {
          settledDebtBreakdown.push(breakdownItem);
          settledExpensesMap.set(item.expense.id, item.expense);
          settledDebtWithPeer += item.amount;
        } else {
          pendingDebtBreakdown.push(breakdownItem);
          pendingExpensesMap.set(item.expense.id, item.expense);
          pendingDebtWithPeer += splitOwed;
          settledDebtWithPeer += splitPaid;
        }
      });

      // Peer debts and payments are fully settled against this balance
      debtsFromPeer.forEach((d) => settledPaidExpensesMap.set(d.expense.id, d.expense));
      paymentsMemberToPeer.forEach((p) => settledPaymentsMadeMap.set(p.payment.id, p.payment));
      settledRecoverWithPeer += debtsFromPeer.reduce((sum, d) => sum + d.amount, 0);
    } else if (netDirect < -0.009) {
      // Peer owes member |netDirect|.
      let peerCreditRemaining = Math.max(
        0,
        grossCreditFromPeer - paymentsMemberToPeer.reduce((sum, p) => sum + p.amount, 0)
      );

      debtsFromPeer.forEach((item) => {
        let splitOwed = item.amount;
        let splitPaid = 0;
        if (peerCreditRemaining > 0.009) {
          const take = Math.min(splitOwed, peerCreditRemaining);
          splitOwed = Math.round((splitOwed - take) * 100) / 100;
          splitPaid = take;
          peerCreditRemaining = Math.round((peerCreditRemaining - take) * 100) / 100;
        }

        if (splitOwed > 0.009) {
          activePaidExpensesMap.set(item.expense.id, item.expense);
          pendingRecoverWithPeer += splitOwed;
        } else {
          settledPaidExpensesMap.set(item.expense.id, item.expense);
        }
        settledRecoverWithPeer += splitPaid;
      });

      // Excess payments made
      const totalDebtsFromPeer = debtsFromPeer.reduce((sum, d) => sum + d.amount, 0);
      const excessPayments = Math.max(
        0,
        grossCreditFromMember - totalDebtsFromPeer - grossCreditFromPeer
      );
      if (excessPayments > 0.009 && paymentsMemberToPeer.length > 0) {
        pendingRecoverWithPeer += excessPayments;
        const lastPay = paymentsMemberToPeer[paymentsMemberToPeer.length - 1].payment;
        activePaymentsMadeMap.set(lastPay.id, lastPay);
      } else {
        paymentsMemberToPeer.forEach((p) => settledPaymentsMadeMap.set(p.payment.id, p.payment));
      }

      // Member's consumptions from peer are fully settled
      debtsFromMember.forEach((item) => {
        const g = groupMap.get(item.expense.group_id);
        settledDebtBreakdown.push({
          expense: item.expense,
          split: item.split,
          originalAmount: item.amount,
          paidAmount: item.amount,
          pendingAmount: 0,
          isFullyPaid: true,
          isPartiallyPaid: false,
          participantProfile: profileMap.get(memberId),
          payerProfile: profileMap.get(peerId),
          groupName: g?.name,
          currency: g?.currency || 'COP',
        });
        settledExpensesMap.set(item.expense.id, item.expense);
        settledDebtWithPeer += item.amount;
      });
    } else {
      // Net is 0 (fully settled)
      debtsFromMember.forEach((item) => {
        const g = groupMap.get(item.expense.group_id);
        settledDebtBreakdown.push({
          expense: item.expense,
          split: item.split,
          originalAmount: item.amount,
          paidAmount: item.amount,
          pendingAmount: 0,
          isFullyPaid: true,
          isPartiallyPaid: false,
          participantProfile: profileMap.get(memberId),
          payerProfile: profileMap.get(peerId),
          groupName: g?.name,
          currency: g?.currency || 'COP',
        });
        settledExpensesMap.set(item.expense.id, item.expense);
        settledDebtWithPeer += item.amount;
      });
      debtsFromPeer.forEach((d) => settledPaidExpensesMap.set(d.expense.id, d.expense));
      paymentsMemberToPeer.forEach((p) => settledPaymentsMadeMap.set(p.payment.id, p.payment));
      settledRecoverWithPeer += debtsFromPeer.reduce((sum, d) => sum + d.amount, 0);
    }

    peerBreakdowns.set(peerId, {
      pendingDebtAmount: Math.round(pendingDebtWithPeer * 100) / 100,
      settledDebtAmount: Math.round(settledDebtWithPeer * 100) / 100,
      pendingRecoverAmount: Math.round(pendingRecoverWithPeer * 100) / 100,
      settledRecoverAmount: Math.round(settledRecoverWithPeer * 100) / 100,
      consumedExpensesCount: consumedCount,
      paidExpensesCount: paidCount,
    });
  });

  const pendingConsumedExpenses = Array.from(pendingExpensesMap.values()).sort(
    (a, b) => new Date(b.expense_date || '').getTime() - new Date(a.expense_date || '').getTime()
  );
  const settledConsumedExpenses = Array.from(settledExpensesMap.values()).sort(
    (a, b) => new Date(b.expense_date || '').getTime() - new Date(a.expense_date || '').getTime()
  );
  const consumedExpenses = Array.from(allConsumedExpensesMap.values()).sort(
    (a, b) => new Date(b.expense_date || '').getTime() - new Date(a.expense_date || '').getTime()
  );

  const activePaidExpenses = Array.from(activePaidExpensesMap.values()).sort(
    (a, b) => new Date(b.expense_date || '').getTime() - new Date(a.expense_date || '').getTime()
  );
  const settledPaidExpenses = Array.from(settledPaidExpensesMap.values()).sort(
    (a, b) => new Date(b.expense_date || '').getTime() - new Date(a.expense_date || '').getTime()
  );
  const paidExpenses = Array.from(allPaidExpensesMap.values()).sort(
    (a, b) => new Date(b.expense_date || '').getTime() - new Date(a.expense_date || '').getTime()
  );

  const activePaymentsMade = Array.from(activePaymentsMadeMap.values()).sort(
    (a, b) => new Date(b.payment_date || '').getTime() - new Date(a.payment_date || '').getTime()
  );
  const settledPaymentsMade = Array.from(settledPaymentsMadeMap.values()).sort(
    (a, b) => new Date(b.payment_date || '').getTime() - new Date(a.payment_date || '').getTime()
  );

  const memberPaymentsMade = filteredPayments.filter((p) => p.paid_by === memberId);
  const memberPaymentsReceived = filteredPayments.filter((p) => p.paid_to === memberId);
  const totalDirectPaymentsMade = memberPaymentsMade.reduce((acc, p) => acc + p.amount, 0);
  const totalDirectPaymentsReceived = memberPaymentsReceived.reduce((acc, p) => acc + p.amount, 0);

  const totalPendingDebt = Math.round(
    pendingDebtBreakdown.reduce((sum, item) => sum + item.pendingAmount, 0) * 100
  ) / 100;
  const totalSettledDebt = Math.round(
    settledDebtBreakdown.reduce((sum, item) => sum + item.originalAmount, 0) * 100
  ) / 100;
  const totalConsumedDebt = Math.round((totalPendingDebt + totalSettledDebt) * 100) / 100;

  const totalActiveRecoverable = Math.round(
    Array.from(peerBreakdowns.values()).reduce((sum, p) => sum + p.pendingRecoverAmount, 0) * 100
  ) / 100;
  const totalSettledRecoverable = Math.round(
    Array.from(peerBreakdowns.values()).reduce((sum, p) => sum + p.settledRecoverAmount, 0) * 100
  ) / 100;
  const totalRecoverable = Math.round((totalActiveRecoverable + totalSettledRecoverable) * 100) / 100;

  const netGlobalBalance = Math.round((totalActiveRecoverable - totalPendingDebt) * 100) / 100;
  const totalNetDebt = netGlobalBalance < 0 ? Math.abs(netGlobalBalance) : 0;

  // Active pairwise balances
  const activePairwise = isSimplified
    ? calculateSimplifiedBalances(filteredExpenses, filteredPayments, profiles, groupId)
    : calculateDirectBalances(filteredExpenses, filteredPayments, profiles, groupId);

  const peerBalances: MemberPeerBalance[] = [];
  otherProfiles.forEach((other) => {
    const b = peerBreakdowns.get(other.id) || {
      pendingDebtAmount: 0,
      settledDebtAmount: 0,
      pendingRecoverAmount: 0,
      settledRecoverAmount: 0,
      consumedExpensesCount: 0,
      paidExpensesCount: 0,
    };

    const netAmount = Math.round((b.pendingDebtAmount - b.pendingRecoverAmount) * 100) / 100;

    const settlementPair = activePairwise.find(
      (pb) =>
        (pb.debtor.id === memberId && pb.creditor.id === other.id) ||
        (pb.debtor.id === other.id && pb.creditor.id === memberId)
    );

    let settlementAmount = 0;
    if (settlementPair) {
      settlementAmount =
        settlementPair.debtor.id === memberId
          ? settlementPair.amount
          : -settlementPair.amount;
    }

    if (
      Math.abs(netAmount) > 0.009 ||
      Math.abs(settlementAmount) > 0.009 ||
      b.pendingDebtAmount > 0.009 ||
      b.pendingRecoverAmount > 0.009 ||
      b.consumedExpensesCount > 0 ||
      b.paidExpensesCount > 0 ||
      (targetCreditor && targetCreditor.id === other.id)
    ) {
      peerBalances.push({
        member: other,
        debtAmount: b.pendingDebtAmount,
        historicalDebtAmount: b.pendingDebtAmount + b.settledDebtAmount,
        pendingDebtAmount: b.pendingDebtAmount,
        settledDebtAmount: b.settledDebtAmount,
        recoverAmount: b.pendingRecoverAmount,
        historicalRecoverAmount: b.pendingRecoverAmount + b.settledRecoverAmount,
        pendingRecoverAmount: b.pendingRecoverAmount,
        settledRecoverAmount: b.settledRecoverAmount,
        netAmount,
        settlementAmount: Math.round(settlementAmount * 100) / 100,
        isTargetCreditor: targetCreditor ? targetCreditor.id === other.id : false,
        consumedExpensesCount: b.consumedExpensesCount,
        paidExpensesCount: b.paidExpensesCount,
      });
    }
  });

  peerBalances.sort((a, b) => {
    if (a.isTargetCreditor) return -1;
    if (b.isTargetCreditor) return 1;
    return Math.abs(b.settlementAmount) - Math.abs(a.settlementAmount);
  });

  const finalCreditors = activePairwise
    .filter((pb) => pb.debtor.id === memberId)
    .map((pb) => ({ member: pb.creditor, amount: pb.amount }));

  const finalDebtors = activePairwise
    .filter((pb) => pb.creditor.id === memberId)
    .map((pb) => ({ member: pb.debtor, amount: pb.amount }));

  // Triangulation / Compensation calculation when targetCreditor is specified
  let optimizationDetail: GroupOptimizationDetail | undefined = undefined;
  let triangulations: ThirdPartyTriangulation[] = [];
  let totalCompensationsApplied = 0;

  if (targetCreditor) {
    const pairwiseDetail = calculatePairwiseDebtDetail(
      member,
      targetCreditor,
      filteredExpenses,
      filteredPayments,
      profiles,
      groups,
      isSimplified,
      groupId
    );

    if (pairwiseDetail.optimizationDetail) {
      optimizationDetail = pairwiseDetail.optimizationDetail;
      triangulations = pairwiseDetail.optimizationDetail.triangulations;
      totalCompensationsApplied = pairwiseDetail.optimizationDetail.totalCompensated;
    }
  }

  // Buscar el monto objetivo a liquidar con el targetCreditor
  let targetSettlementAmount = 0;
  if (targetCreditor) {
    const targetPair = activePairwise.find(
      (pb) => pb.debtor.id === memberId && pb.creditor.id === targetCreditor.id
    );
    targetSettlementAmount = targetPair ? targetPair.amount : 0;
  } else {
    targetSettlementAmount = totalNetDebt;
  }

  return {
    member,
    targetCreditor,
    consumedExpenses,
    pendingConsumedExpenses,
    settledConsumedExpenses,
    pendingDebtBreakdown,
    settledDebtBreakdown,
    totalConsumedDebt,
    totalPendingDebt,
    totalSettledDebt,
    paidExpenses,
    activePaidExpenses,
    settledPaidExpenses,
    memberPaymentsMade,
    activePaymentsMade,
    settledPaymentsMade,
    memberPaymentsReceived,
    totalDirectPaymentsMade,
    totalDirectPaymentsReceived,
    totalRecoverable,
    totalActiveRecoverable,
    totalSettledRecoverable,
    netGlobalBalance,
    totalNetDebt,
    peerBalances,
    finalCreditors,
    finalDebtors,
    isSimplified,
    totalCompensationsApplied,
    triangulations,
    optimizationDetail,
    calculation: {
      totalPendingDebt,
      totalActiveRecoverable,
      totalConsumedDebt,
      totalRecoverable,
      totalSettledDebt,
      totalSettledRecoverable,
      netGlobalBalance,
      compensationDiscount: totalCompensationsApplied,
      targetSettlementAmount,
    },
  };
}
