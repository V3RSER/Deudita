import {
  Profile,
  Expense,
  Payment,
  Settlement,
  Group,
  PairwiseBalance,
  UserSummaryBalance,
  ManagedContribution,
} from './types';

// ============================================================================
// 1. FORMATTING & CURRENCY UTILITIES
// ============================================================================

export function formatCurrency(amount: number | null | undefined, currency: string = 'ARS'): string {
  if (amount === null || amount === undefined || isNaN(amount)) {
    amount = 0;
  }
  const numericAmount = Math.round(Number(amount) * 100) / 100;
  const curr = (currency || 'ARS').toUpperCase().trim();

  let symbol = '$';
  let fractionDigits = 2;

  switch (curr) {
    case 'USD':
      symbol = 'US$';
      break;
    case 'EUR':
      symbol = '€';
      break;
    case 'COP':
      symbol = 'COL$';
      fractionDigits = 0;
      break;
    case 'CLP':
      symbol = 'CLP$';
      fractionDigits = 0;
      break;
    case 'MXN':
      symbol = 'MEX$';
      break;
    case 'BRL':
      symbol = 'R$';
      break;
    case 'ARS':
    default:
      symbol = '$';
      break;
  }

  const formattedNumber = new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(numericAmount);

  return `${symbol} ${formattedNumber}`;
}

export function getInitials(name?: string): string {
  if (!name) return 'U';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ============================================================================
// 2. SPONSORSHIP / MANAGED USERS HELPERS
// ============================================================================

export function buildSponsorshipMap(profiles: Profile[]): {
  userToSponsor: Map<string, string>;
  sponsorToManaged: Map<string, string[]>;
} {
  const userToSponsor = new Map<string, string>();
  const sponsorToManaged = new Map<string, string[]>();

  for (const p of profiles) {
    if (p.managed_by) {
      userToSponsor.set(p.id, p.managed_by);
      const list = sponsorToManaged.get(p.managed_by) || [];
      list.push(p.id);
      sponsorToManaged.set(p.managed_by, list);
    }
    if (Array.isArray(p.managed_user_ids)) {
      for (const mId of p.managed_user_ids) {
        userToSponsor.set(mId, p.id);
        const list = sponsorToManaged.get(p.id) || [];
        if (!list.includes(mId)) {
          list.push(mId);
        }
        sponsorToManaged.set(p.id, list);
      }
    }
  }

  return { userToSponsor, sponsorToManaged };
}

// ============================================================================
// 3. SETTLEMENT CUTOFF RESOLVER (BY PAIR)
// ============================================================================

/**
 * Returns the latest timestamp (in milliseconds) at which the pair (userA, userB)
 * was settled in the given group (or across all groups if groupId is not specified).
 * Returns 0 if no settlement has occurred between this pair.
 */
export function getPairwiseLatestSettlementCutoff(
  settlements: Settlement[] | undefined,
  userAId: string,
  userBId: string,
  groupId?: string
): number {
  if (!settlements || settlements.length === 0 || !userAId || !userBId) {
    return 0;
  }

  let latestTimestamp = 0;

  for (const s of settlements) {
    if (groupId && s.group_id !== groupId) continue;

    const isMatch =
      (s.user_a === userAId && s.user_b === userBId) ||
      (s.user_a === userBId && s.user_b === userAId);

    if (isMatch) {
      const ts = new Date(s.settled_at).getTime();
      if (ts > latestTimestamp) {
        latestTimestamp = ts;
      }
    }
  }

  return latestTimestamp;
}

// ============================================================================
// 4. CORE DIRECT PAIRWISE CALCULATION
// ============================================================================

/**
 * Calculates the direct net balance between userA and userB.
 * Returns:
 *   > 0 : userB owes userA
 *   < 0 : userA owes userB
 *   = 0 : Account is even
 *
 * Rules:
 * - Only transactions registered AFTER the most recent pairwise settlement (created_at > settled_at) count.
 * - If no settlement exists, the full history counts.
 */
export function calculateDirectPairwiseBalance(
  userAId: string,
  userBId: string,
  expenses: Expense[],
  payments: Payment[],
  groupId?: string,
  settlements?: Settlement[],
  sponsorshipMap?: Map<string, string>
): number {
  if (!userAId || !userBId || userAId === userBId) return 0;

  const getEffectiveId = (id: string) => (sponsorshipMap ? sponsorshipMap.get(id) || id : id);
  const effA = getEffectiveId(userAId);
  const effB = getEffectiveId(userBId);

  if (effA === effB) return 0;

  // Cutoff timestamp is based on the pair of effective users
  const cutoff = getPairwiseLatestSettlementCutoff(settlements, effA, effB, groupId);

  let balance = 0; // Positive = B owes A, Negative = A owes B

  // 1. Expenses: Splits where one paid and the other consumed
  for (const exp of expenses) {
    if (groupId && exp.group_id !== groupId) continue;

    // Filter by registration timestamp (created_at) > settlement cutoff
    const expCreatedAt = new Date(exp.created_at).getTime();
    if (expCreatedAt <= cutoff) continue;

    const effPayer = getEffectiveId(exp.paid_by);
    if (!exp.splits || exp.splits.length === 0) continue;

    for (const split of exp.splits) {
      const effDebtor = getEffectiveId(split.user_id);
      const splitAmount = Number(split.amount_owed || 0);

      if (effPayer === effA && effDebtor === effB) {
        // A paid for B -> B owes A
        balance += splitAmount;
      } else if (effPayer === effB && effDebtor === effA) {
        // B paid for A -> A owes B (reduces B's debt to A)
        balance -= splitAmount;
      }
    }
  }

  // 2. Direct Payments: Cash transferred between A and B
  for (const p of payments) {
    if (groupId && p.group_id !== groupId) continue;

    // Filter by registration timestamp (created_at) > settlement cutoff
    const paymentCreatedAt = new Date(p.created_at).getTime();
    if (paymentCreatedAt <= cutoff) continue;

    const effPayer = getEffectiveId(p.paid_by);
    const effReceiver = getEffectiveId(p.paid_to);
    const paymentAmount = Number(p.amount || 0);

    if (effPayer === effB && effReceiver === effA) {
      // B paid money to A -> reduces B's debt to A
      balance -= paymentAmount;
    } else if (effPayer === effA && effReceiver === effB) {
      // A paid money to B -> increases B's debt to A (or covers A's debt)
      balance += paymentAmount;
    }
  }

  return Math.round(balance * 100) / 100;
}

// ============================================================================
// 5. DIRECT BALANCES FOR A GROUP / SYSTEM
// ============================================================================

export function calculateDirectBalances(
  expenses: Expense[],
  payments: Payment[],
  profiles: Profile[],
  groupId?: string,
  settlements?: Settlement[]
): PairwiseBalance[] {
  const { userToSponsor } = buildSponsorshipMap(profiles);
  const profilesMap = new Map<string, Profile>();
  profiles.forEach((p) => profilesMap.set(p.id, p));

  // Determine all effective members involved in this group/scope
  const effectiveMemberIds = new Set<string>();
  for (const p of profiles) {
    const effId = userToSponsor.get(p.id) || p.id;
    effectiveMemberIds.add(effId);
  }

  const memberIdList = Array.from(effectiveMemberIds);
  const pairwiseResults: PairwiseBalance[] = [];

  // Iterate over all unique pairs (i, j)
  for (let i = 0; i < memberIdList.length; i++) {
    for (let j = i + 1; j < memberIdList.length; j++) {
      const userAId = memberIdList[i];
      const userBId = memberIdList[j];

      const balance = calculateDirectPairwiseBalance(
        userAId,
        userBId,
        expenses,
        payments,
        groupId,
        settlements,
        userToSponsor
      );

      if (Math.abs(balance) < 0.01) continue;

      const profileA = profilesMap.get(userAId) || {
        id: userAId,
        full_name: 'Usuario',
        email: '',
        avatar_url: '',
        created_at: new Date().toISOString(),
      };
      const profileB = profilesMap.get(userBId) || {
        id: userBId,
        full_name: 'Usuario',
        email: '',
        avatar_url: '',
        created_at: new Date().toISOString(),
      };

      if (balance > 0) {
        // userB owes userA
        pairwiseResults.push({
          creditor: profileA,
          debtor: profileB,
          amount: Math.round(balance * 100) / 100,
          group_id: groupId,
        });
      } else {
        // userA owes userB
        pairwiseResults.push({
          creditor: profileB,
          debtor: profileA,
          amount: Math.round(Math.abs(balance) * 100) / 100,
          group_id: groupId,
        });
      }
    }
  }

  return pairwiseResults.sort((a, b) => b.amount - a.amount);
}

// ============================================================================
// 6. SIMPLIFIED BALANCES (MIN CASH FLOW ALGORITHM)
// ============================================================================

/**
 * Min Cash Flow simplification:
 * 1. Takes the direct pairwise balances (already filtered by each pair's settlement cutoff).
 * 2. Calculates each individual's total net balance in the group.
 * 3. Matches largest debtors with largest creditors to minimize total number of transactions.
 */
export function calculateSimplifiedBalances(
  expenses: Expense[],
  payments: Payment[],
  profiles: Profile[],
  groupId?: string,
  settlements?: Settlement[]
): PairwiseBalance[] {
  const directBalances = calculateDirectBalances(expenses, payments, profiles, groupId, settlements);

  if (directBalances.length === 0) {
    return [];
  }

  const profilesMap = new Map<string, Profile>();
  profiles.forEach((p) => profilesMap.set(p.id, p));

  // Compute net balance per profile
  const netBalances = new Map<string, number>();

  for (const b of directBalances) {
    const debtorId = b.debtor.id;
    const creditorId = b.creditor.id;

    profilesMap.set(debtorId, b.debtor);
    profilesMap.set(creditorId, b.creditor);

    netBalances.set(debtorId, (netBalances.get(debtorId) || 0) - b.amount);
    netBalances.set(creditorId, (netBalances.get(creditorId) || 0) + b.amount);
  }

  // Separate debtors (net < 0) and creditors (net > 0)
  interface BalanceNode {
    profile: Profile;
    amount: number;
  }

  const debtors: BalanceNode[] = [];
  const creditors: BalanceNode[] = [];

  netBalances.forEach((net, id) => {
    const roundedNet = Math.round(net * 100) / 100;
    const profile = profilesMap.get(id) || {
      id,
      full_name: 'Usuario',
      email: '',
      avatar_url: '',
      created_at: new Date().toISOString(),
    };

    if (roundedNet < -0.009) {
      debtors.push({ profile, amount: -roundedNet });
    } else if (roundedNet > 0.009) {
      creditors.push({ profile, amount: roundedNet });
    }
  });

  const simplified: PairwiseBalance[] = [];

  // Sort descending by amount
  debtors.sort((a, b) => b.amount - a.amount);
  creditors.sort((a, b) => b.amount - a.amount);

  while (debtors.length > 0 && creditors.length > 0) {
    const debtor = debtors[0];
    const creditor = creditors[0];

    const amount = Math.round(Math.min(debtor.amount, creditor.amount) * 100) / 100;

    if (amount > 0.009) {
      simplified.push({
        debtor: debtor.profile,
        creditor: creditor.profile,
        amount,
        group_id: groupId,
      });
    }

    debtor.amount = Math.round((debtor.amount - amount) * 100) / 100;
    creditor.amount = Math.round((creditor.amount - amount) * 100) / 100;

    if (debtor.amount < 0.01) {
      debtors.shift();
    } else {
      debtors.sort((a, b) => b.amount - a.amount);
    }

    if (creditor.amount < 0.01) {
      creditors.shift();
    } else {
      creditors.sort((a, b) => b.amount - a.amount);
    }
  }

  return simplified.sort((a, b) => b.amount - a.amount);
}

// Default export/alias for pairwise calculation
export function calculatePairwiseBalances(
  expenses: Expense[],
  payments: Payment[],
  profiles: Profile[],
  groupId?: string,
  settlements?: Settlement[]
): PairwiseBalance[] {
  return calculateSimplifiedBalances(expenses, payments, profiles, groupId, settlements);
}

// ============================================================================
// 7. USER SUMMARIES (TOTAL PAID, OWED SHARE, NET BALANCE)
// ============================================================================

export function calculateUserSummaries(
  expenses: Expense[],
  payments: Payment[],
  profiles: Profile[],
  groupId?: string,
  settlements?: Settlement[]
): UserSummaryBalance[] {
  const { userToSponsor, sponsorToManaged } = buildSponsorshipMap(profiles);
  const profilesMap = new Map<string, Profile>();
  profiles.forEach((p) => profilesMap.set(p.id, p));

  const directBalances = calculateDirectBalances(expenses, payments, profiles, groupId, settlements);

  // Group direct balances by user
  const netByUserId = new Map<string, number>();
  for (const b of directBalances) {
    netByUserId.set(b.debtor.id, (netByUserId.get(b.debtor.id) || 0) - b.amount);
    netByUserId.set(b.creditor.id, (netByUserId.get(b.creditor.id) || 0) + b.amount);
  }

  // Calculate gross paid and gross consumption per user in active transactions
  const totalPaidMap = new Map<string, number>();
  const totalOwedShareMap = new Map<string, number>();

  for (const exp of expenses) {
    if (groupId && exp.group_id !== groupId) continue;

    const payerId = exp.paid_by;
    const effPayerId = userToSponsor.get(payerId) || payerId;
    totalPaidMap.set(effPayerId, (totalPaidMap.get(effPayerId) || 0) + Number(exp.total_amount || 0));

    if (exp.splits) {
      for (const split of exp.splits) {
        const debtorId = split.user_id;
        const effDebtorId = userToSponsor.get(debtorId) || debtorId;
        totalOwedShareMap.set(
          effDebtorId,
          (totalOwedShareMap.get(effDebtorId) || 0) + Number(split.amount_owed || 0)
        );
      }
    }
  }

  // Generate summaries for all relevant profiles
  const summaries: UserSummaryBalance[] = [];
  const processedEffectiveIds = new Set<string>();

  for (const p of profiles) {
    const isManaged = Boolean(p.managed_by || userToSponsor.has(p.id));
    if (isManaged && userToSponsor.get(p.id) !== p.id) {
      continue; // Handled via sponsor
    }

    if (processedEffectiveIds.has(p.id)) continue;
    processedEffectiveIds.add(p.id);

    const managedIds = sponsorToManaged.get(p.id) || [];
    const managedProfiles = managedIds
      .map((mId) => profilesMap.get(mId))
      .filter((mp): mp is Profile => Boolean(mp));

    const totalPaid = Math.round((totalPaidMap.get(p.id) || 0) * 100) / 100;
    const totalOwedShare = Math.round((totalOwedShareMap.get(p.id) || 0) * 100) / 100;
    const netBalance = Math.round((netByUserId.get(p.id) || 0) * 100) / 100;

    summaries.push({
      user: p,
      totalPaid,
      totalOwedShare,
      netBalance,
      managedUsers: managedProfiles.length > 0 ? managedProfiles : undefined,
    });
  }

  return summaries.sort((a, b) => b.netBalance - a.netBalance);
}

// ============================================================================
// 8. PAIRWISE DEBT DETAIL & EXPLANATION (MODAL JUSTIFICATION VIEW)
// ============================================================================

export interface DebtBreakdownItem {
  expense: Expense;
  originalAmount: number;
  pendingAmount: number;
  isSettled?: boolean;
  isPartial?: boolean;
  splitPaid?: number;
}

export interface ReverseOffsetExpenseItem {
  expense: Expense;
  amount: number;
  isSettled?: boolean;
}

export interface AppliedPaymentItem {
  payment: Payment;
  amountApplied: number;
}

export interface ThirdPartyTriangulation {
  thirdParty: Profile;
  amount: number;
  isDiscount: boolean;
  shortSummary: string;
  explanation: string;
  expenses: { expense: Expense; amount: number }[];
}

export interface PairwiseOptimizationDetail {
  isOptimized?: boolean;
  isDiscount?: boolean;
  totalCompensated?: number;
  explanation?: string;
  triangulations?: ThirdPartyTriangulation[];
}

export interface PairwiseDebtDetail {
  pendingExpenses: DebtBreakdownItem[];
  reverseOffsetExpenses: ReverseOffsetExpenseItem[];
  appliedPayments: AppliedPaymentItem[];
  netDirectBalance: number;
  finalSettlementAmount: number;
  optimizationDetail?: PairwiseOptimizationDetail;
}

/**
 * Reconstructed from scratch:
 * Computes all underlying active transactions (expenses and payments registered after the latest pairwise settlement)
 * between debtorProfile and creditorProfile, and explains any group simplification differences clearly.
 */
export function calculatePairwiseDebtDetail(
  debtorProfile: Profile,
  creditorProfile: Profile,
  expenses: Expense[],
  payments: Payment[],
  profiles: Profile[],
  groups?: Group[],
  isSimplified: boolean = true,
  groupId?: string,
  settlements?: Settlement[]
): PairwiseDebtDetail {
  const { userToSponsor } = buildSponsorshipMap(profiles);
  const profilesMap = new Map<string, Profile>();
  profiles.forEach((p) => profilesMap.set(p.id, p));

  const effDebtorId = userToSponsor.get(debtorProfile.id) || debtorProfile.id;
  const effCreditorId = userToSponsor.get(creditorProfile.id) || creditorProfile.id;

  // Cutoff timestamp for this pair
  const cutoff = getPairwiseLatestSettlementCutoff(settlements, effDebtorId, effCreditorId, groupId);

  const pendingExpenses: DebtBreakdownItem[] = [];
  const reverseOffsetExpenses: ReverseOffsetExpenseItem[] = [];
  const appliedPayments: AppliedPaymentItem[] = [];

  // 1. Find all active expenses between these two users
  for (const exp of expenses) {
    if (groupId && exp.group_id !== groupId) continue;

    const expCreatedAt = new Date(exp.created_at).getTime();
    if (expCreatedAt <= cutoff) continue;

    const effPayer = userToSponsor.get(exp.paid_by) || exp.paid_by;
    if (!exp.splits || exp.splits.length === 0) continue;

    for (const split of exp.splits) {
      const effDebtor = userToSponsor.get(split.user_id) || split.user_id;
      const amountOwed = Number(split.amount_owed || 0);

      if (effPayer === effCreditorId && effDebtor === effDebtorId) {
        // Creditor paid, Debtor consumed
        pendingExpenses.push({
          expense: exp,
          originalAmount: amountOwed,
          pendingAmount: amountOwed,
          isSettled: false,
        });
      } else if (effPayer === effDebtorId && effDebtor === effCreditorId) {
        // Debtor paid, Creditor consumed
        reverseOffsetExpenses.push({
          expense: exp,
          amount: amountOwed,
          isSettled: false,
        });
      }
    }
  }

  // 2. Find all active direct payments between these two users
  for (const p of payments) {
    if (groupId && p.group_id !== groupId) continue;

    const paymentCreatedAt = new Date(p.created_at).getTime();
    if (paymentCreatedAt <= cutoff) continue;

    const effPayer = userToSponsor.get(p.paid_by) || p.paid_by;
    const effReceiver = userToSponsor.get(p.paid_to) || p.paid_to;
    const amount = Number(p.amount || 0);

    if (effPayer === effDebtorId && effReceiver === effCreditorId) {
      // Debtor made payment to Creditor
      appliedPayments.push({
        payment: p,
        amountApplied: amount,
      });
    } else if (effPayer === effCreditorId && effReceiver === effDebtorId) {
      // Creditor made payment to Debtor (acts as reverse offset)
      reverseOffsetExpenses.push({
        expense: {
          id: p.id,
          group_id: p.group_id,
          paid_by: p.paid_by,
          total_amount: p.amount,
          description: `Pago directo: ${p.note || 'Transferencia'}`,
          category: 'other',
          expense_date: p.payment_date,
          source: 'manual',
          created_by: p.paid_by,
          created_at: p.created_at,
        },
        amount,
        isSettled: false,
      });
    }
  }

  // Sort by created_at descending
  pendingExpenses.sort((a, b) => new Date(b.expense.created_at).getTime() - new Date(a.expense.created_at).getTime());
  reverseOffsetExpenses.sort((a, b) => new Date(b.expense.created_at).getTime() - new Date(a.expense.created_at).getTime());
  appliedPayments.sort((a, b) => new Date(b.payment.created_at).getTime() - new Date(a.payment.created_at).getTime());

  const totalDebts = pendingExpenses.reduce((sum, d) => sum + d.pendingAmount, 0);
  const totalReverse = reverseOffsetExpenses.reduce((sum, r) => sum + r.amount, 0) +
    appliedPayments.reduce((sum, p) => sum + p.amountApplied, 0);

  const netDirectBalance = Math.max(0, Math.round((totalDebts - totalReverse) * 100) / 100);

  // 3. Simplified mode calculation and group optimization details
  let finalSettlementAmount = netDirectBalance;
  let optimizationDetail: PairwiseOptimizationDetail | undefined;

  if (isSimplified) {
    const simplifiedBalances = calculateSimplifiedBalances(
      expenses,
      payments,
      profiles,
      groupId,
      settlements
    );

    const simplifiedEdge = simplifiedBalances.find(
      (b) => b.debtor.id === effDebtorId && b.creditor.id === effCreditorId
    );

    const simplifiedAmount = simplifiedEdge ? simplifiedEdge.amount : 0;
    finalSettlementAmount = simplifiedAmount;

    const diff = Math.round((simplifiedAmount - netDirectBalance) * 100) / 100;
    const hasAdjustment = Math.abs(diff) >= 0.01;

    if (hasAdjustment) {
      const isDiscount = diff < 0;
      const totalCompensated = Math.abs(diff);

      const triangulations: ThirdPartyTriangulation[] = [];

      // Identify third parties in group
      for (const p of profiles) {
        const tpId = userToSponsor.get(p.id) || p.id;
        if (tpId === effDebtorId || tpId === effCreditorId) continue;

        const tpProfile = profilesMap.get(tpId) || p;
        const tpName = tpProfile.full_name || 'Integrante';

        // Check if there are simplified edges involving this third party
        const debtorToTp = simplifiedBalances.find((b) => b.debtor.id === effDebtorId && b.creditor.id === tpId);
        const tpToCreditor = simplifiedBalances.find((b) => b.debtor.id === tpId && b.creditor.id === effCreditorId);

        if (debtorToTp || tpToCreditor) {
          const triAmount = debtorToTp ? debtorToTp.amount : tpToCreditor ? tpToCreditor.amount : totalCompensated;
          triangulations.push({
            thirdParty: tpProfile,
            amount: Math.min(totalCompensated, triAmount),
            isDiscount,
            shortSummary: isDiscount
              ? `Compensación directa mediante ${tpName}`
              : `Consolidación de pagos mediante ${tpName}`,
            explanation: isDiscount
              ? `Para optimizar las cuentas del grupo, parte de la deuda con ${creditorProfile.full_name} se transfiere o compensa a través de pagos con ${tpName}.`
              : `Se consolida la deuda grupal con ${creditorProfile.full_name} para reducir la cantidad de transferencias totales del grupo.`,
            expenses: [],
          });
        }
      }

      optimizationDetail = {
        isOptimized: true,
        isDiscount,
        totalCompensated,
        explanation: isDiscount
          ? `Para simplificar las transferencias de todo el grupo, el monto a pagar se reduce de ${formatCurrency(netDirectBalance)} a ${formatCurrency(simplifiedAmount)} mediante compensaciones grupales.`
          : `Para simplificar las transferencias de todo el grupo, se consolidan saldos resultando en ${formatCurrency(simplifiedAmount)}.`,
        triangulations,
      };
    }
  }

  return {
    pendingExpenses,
    reverseOffsetExpenses,
    appliedPayments,
    netDirectBalance,
    finalSettlementAmount,
    optimizationDetail,
  };
}

// Global user balance helper
export function calculateGlobalUserBalance(
  expenses: Expense[],
  payments: Payment[],
  currentUserId: string,
  profiles: Profile[],
  settlements?: Settlement[]
): {
  totalToReceive: number;
  totalToPay: number;
  netGlobal: number;
} {
  const pairwise = calculateSimplifiedBalances(expenses, payments, profiles, undefined, settlements);

  let totalToReceive = 0;
  let totalToPay = 0;

  for (const p of pairwise) {
    if (p.creditor.id === currentUserId) {
      totalToReceive += p.amount;
    } else if (p.debtor.id === currentUserId) {
      totalToPay += p.amount;
    }
  }

  totalToReceive = Math.round(totalToReceive * 100) / 100;
  totalToPay = Math.round(totalToPay * 100) / 100;
  const netGlobal = Math.round((totalToReceive - totalToPay) * 100) / 100;

  return { totalToReceive, totalToPay, netGlobal };
}
