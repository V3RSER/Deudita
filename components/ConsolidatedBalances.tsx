'use client';

import React, { useState, useMemo } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useExpense } from '@/lib/expense-context';
import { Payment, PairwiseBalance, Group, Profile, Expense } from '@/lib/types';
import {
  formatCurrency,
  calculateSimplifiedBalances,
  calculateDirectBalances,
  calculatePairwiseDebtDetail,
  DebtBreakdownItem,
  PairwiseDebtDetail,
} from '@/lib/balance-utils';
import { getCategoryConfig } from '@/lib/expense-category-utils';
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  ArrowRightLeft,
  Users,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  Layers,
  Shield,
  UserCheck,
  ChevronDown,
  ChevronUp,
  Receipt,
  Search,
  Calendar,
  ArrowUpRight,
  ExternalLink,
  Plus,
  Minus,
  Info,
  Check,
  HandCoins,
  History,
  Filter,
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';

interface ConsolidatedBalancesProps {
  onOpenSettleModal: (groupId?: string, debtorId?: string, creditorId?: string, amount?: number) => void;
  onEditPayment?: (payment: Payment) => void;
}

function getInitials(name?: string): string {
  if (!name) return 'U';
  const trimmed = name.trim();
  if (!trimmed) return 'U';
  return trimmed.charAt(0).toUpperCase();
}

type FilterType = 'all' | 'mine' | 'to_receive' | 'to_pay' | 'third_party';

interface BalanceCardProps {
  pairwise: PairwiseBalance;
  currentProfile: Profile | null;
  isSimplified: boolean;
  expenses: Expense[];
  payments: Payment[];
  profiles: Profile[];
  groups: Group[];
  isExpanded: boolean;
  onToggleExpand: () => void;
  onOpenSettleModal: (groupId?: string, debtorId?: string, creditorId?: string, amount?: number) => void;
}

function UnifiedBalanceCard({
  pairwise,
  currentProfile,
  isSimplified,
  expenses,
  payments,
  profiles,
  groups,
  isExpanded,
  onToggleExpand,
  onOpenSettleModal,
}: BalanceCardProps) {
  const router = useRouter();
  const [showAllMovements, setShowAllMovements] = useState(false);

  const isDebtor =
    pairwise.debtor.id === currentProfile?.id ||
    (!isSimplified && pairwise.debtorSponsor?.id === currentProfile?.id);

  const isCreditor =
    pairwise.creditor.id === currentProfile?.id ||
    (!isSimplified && pairwise.creditorSponsor?.id === currentProfile?.id);

  const isThirdParty = !isDebtor && !isCreditor;

  const isDebtorMyDependent = !isSimplified && pairwise.debtorSponsor?.id === currentProfile?.id;
  const isCreditorMyDependent = !isSimplified && pairwise.creditorSponsor?.id === currentProfile?.id;

  // Calculate detailed debt breakdown
  const debtDetail: PairwiseDebtDetail = useMemo(() => {
    return calculatePairwiseDebtDetail(
      pairwise.debtor,
      pairwise.creditor,
      expenses,
      payments,
      profiles,
      groups,
      isSimplified,
      pairwise.group_id
    );
  }, [pairwise.debtor, pairwise.creditor, expenses, payments, profiles, groups, isSimplified, pairwise.group_id]);

  const pendingCount = debtDetail.pendingExpenses.length;
  const displayedExpenses = showAllMovements ? debtDetail.allExpenses : debtDetail.pendingExpenses;

  // Determine card type styling
  // 1. Creditor = SUMA (+) -> Green/Emerald
  // 2. Debtor = RESTA (-) -> Red/Rose
  // 3. Third Party = Neutral/Zinc
  const cardTheme = isCreditor
    ? {
        borderClass: 'border-emerald-200/90 hover:border-emerald-300',
        bgGradient: 'bg-gradient-to-r from-emerald-500/5 via-white to-white',
        badgeClass: 'bg-emerald-100 text-emerald-900 border-emerald-200/80',
        badgeText: '+ Por cobrar',
        amountClass: 'text-emerald-700',
        sign: '+',
        btnClass: 'bg-emerald-600 hover:bg-emerald-700 text-white',
        btnText: 'Registrar pago',
        ringClass: 'ring-emerald-200',
      }
    : isDebtor
    ? {
        borderClass: 'border-rose-200/90 hover:border-rose-300',
        bgGradient: 'bg-gradient-to-r from-rose-500/5 via-white to-white',
        badgeClass: 'bg-rose-100 text-rose-900 border-rose-200/80',
        badgeText: '- Por pagar',
        amountClass: 'text-rose-600',
        sign: '-',
        btnClass: 'bg-zinc-900 hover:bg-zinc-800 text-white',
        btnText: 'Pagar',
        ringClass: 'ring-rose-200',
      }
    : {
        borderClass: 'border-zinc-200/90 hover:border-zinc-300',
        bgGradient: 'bg-white',
        badgeClass: 'bg-zinc-100 text-zinc-700 border-zinc-200/80',
        badgeText: 'Entre integrantes',
        amountClass: 'text-zinc-900',
        sign: '',
        btnClass: 'bg-zinc-100 hover:bg-zinc-200 text-zinc-900',
        btnText: 'Saldar',
        ringClass: 'ring-zinc-200',
      };

  return (
    <div
      className={`rounded-3xl border ${cardTheme.borderClass} ${cardTheme.bgGradient} shadow-2xs hover:shadow-md transition-all overflow-hidden flex flex-col`}
    >
      {/* Top Header Card */}
      <div className="p-4 sm:p-5 flex flex-col gap-3.5">
        <div className="flex items-start justify-between gap-3 flex-wrap sm:flex-nowrap">
          {/* Profiles & Relationship */}
          <div className="flex items-start space-x-3 min-w-0 flex-1">
            {/* Avatars */}
            <div className="flex items-center -space-x-2 shrink-0 pt-0.5">
              {pairwise.debtor.avatar_url ? (
                <Image
                  src={pairwise.debtor.avatar_url}
                  alt={pairwise.debtor.full_name || 'Deudor'}
                  width={40}
                  height={40}
                  className={`w-10 h-10 rounded-full object-cover ring-2 ${cardTheme.ringClass} shrink-0`}
                  unoptimized
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div
                  className={`w-10 h-10 rounded-full ring-2 ${cardTheme.ringClass} bg-zinc-900 text-white flex items-center justify-center text-xs font-bold shrink-0`}
                >
                  {getInitials(pairwise.debtor.full_name)}
                </div>
              )}

              {pairwise.creditor.avatar_url ? (
                <Image
                  src={pairwise.creditor.avatar_url}
                  alt={pairwise.creditor.full_name || 'Acreedor'}
                  width={40}
                  height={40}
                  className="w-10 h-10 rounded-full object-cover ring-2 ring-white shrink-0"
                  unoptimized
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-10 h-10 rounded-full ring-2 ring-white bg-zinc-700 text-white flex items-center justify-center text-xs font-bold shrink-0">
                  {getInitials(pairwise.creditor.full_name)}
                </div>
              )}
            </div>

            {/* Names & Narrative */}
            <div className="min-w-0 space-y-1">
              <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                <span
                  className={`inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-black border tracking-wide uppercase ${cardTheme.badgeClass}`}
                >
                  {cardTheme.badgeText}
                </span>

                {pendingCount > 0 && (
                  <span className="text-[11px] font-bold text-zinc-500 bg-zinc-100/90 px-2 py-0.5 rounded-full border border-zinc-200/60">
                    {pendingCount === 1 ? '1 gasto pendiente' : `${pendingCount} gastos pendientes`}
                  </span>
                )}
              </div>

              {/* Relationship description */}
              <div className="text-sm font-extrabold text-zinc-900 tracking-tight flex items-center space-x-1.5 flex-wrap">
                {isCreditor ? (
                  <>
                    <span className="text-zinc-900 font-black">
                      {pairwise.debtor.full_name || 'Usuario'}
                    </span>
                    <span className="text-zinc-500 font-medium">te debe dinero</span>
                  </>
                ) : isDebtor ? (
                  <>
                    <span className="text-zinc-500 font-medium">Le debes a</span>
                    <span className="text-zinc-900 font-black">
                      {pairwise.creditor.full_name || 'Usuario'}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-zinc-900 font-bold">
                      {pairwise.debtor.full_name || 'Usuario'}
                    </span>
                    <ArrowRight className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                    <span className="text-zinc-900 font-bold">
                      {pairwise.creditor.full_name || 'Usuario'}
                    </span>
                  </>
                )}
              </div>

              {/* Sponsor context in direct view */}
              {!isSimplified && (pairwise.debtorSponsor || pairwise.creditorSponsor) && (
                <div className="flex items-center space-x-1 text-[10px] text-indigo-700 font-semibold pt-0.5">
                  <Shield className="w-3 h-3 shrink-0" />
                  <span>
                    {isDebtorMyDependent && 'Deuda de persona vinculada a ti'}
                    {isCreditorMyDependent && 'Cobro de persona vinculada a ti'}
                    {!isDebtorMyDependent &&
                      !isCreditorMyDependent &&
                      pairwise.debtorSponsor &&
                      `Deudor vinculado a ${pairwise.debtorSponsor.full_name}`}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Amount and Action Button */}
          <div className="flex items-center sm:items-end justify-between sm:justify-end gap-3 w-full sm:w-auto pt-1 sm:pt-0 border-t sm:border-t-0 border-zinc-100">
            <div className="text-left sm:text-right">
              <span className="text-[10px] font-black uppercase text-zinc-400 tracking-wider block">
                {isCreditor ? 'A tu favor' : isDebtor ? 'Total a pagar' : 'Saldo total'}
              </span>
              <span className={`text-xl sm:text-2xl font-black tracking-tight ${cardTheme.amountClass} block`}>
                {cardTheme.sign}
                {formatCurrency(pairwise.amount)}
              </span>
            </div>

            <button
              onClick={() =>
                onOpenSettleModal(pairwise.group_id, pairwise.debtor.id, pairwise.creditor.id, pairwise.amount)
              }
              className={`px-4 py-2.5 rounded-2xl text-xs font-extrabold transition-all shadow-xs active:scale-95 cursor-pointer shrink-0 ${cardTheme.btnClass}`}
            >
              {cardTheme.btnText}
            </button>
          </div>
        </div>

        {/* Simplified breakdown tags if present */}
        {isSimplified &&
          (pairwise.includedDebtors ||
            pairwise.debtorBreakdown ||
            pairwise.includedCreditors ||
            pairwise.creditorBreakdown) && (
            <div className="pt-2 border-t border-zinc-100 text-[11px] text-zinc-500 space-y-1">
              {pairwise.debtorBreakdown && pairwise.debtorBreakdown.length > 1 ? (
                <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
                  <span className="font-semibold text-zinc-700 flex items-center space-x-1">
                    <UserCheck className="w-3 h-3 text-indigo-600" />
                    <span>Desglose por personas:</span>
                  </span>
                  {pairwise.debtorBreakdown.map((b, bIdx) => (
                    <span
                      key={bIdx}
                      className="inline-flex items-center space-x-1 bg-white px-2 py-0.5 rounded-md border border-zinc-200 text-zinc-700 font-medium shadow-2xs"
                    >
                      <span>{b.isSelf ? 'Titular' : b.profile.full_name}:</span>
                      <strong className="text-zinc-900">{formatCurrency(b.amount)}</strong>
                    </span>
                  ))}
                </div>
              ) : pairwise.includedDebtors && pairwise.includedDebtors.length > 0 ? (
                <div className="flex items-center space-x-1.5 text-zinc-600">
                  <Shield className="w-3 h-3 text-indigo-600 shrink-0" />
                  <span>
                    Incluye consumo de personas vinculadas:{' '}
                    <strong>{pairwise.includedDebtors.map((d) => d.full_name).join(', ')}</strong>
                  </span>
                </div>
              ) : null}
            </div>
          )}

        {/* Toggle Expand Trigger Button */}
        <div className="pt-2 border-t border-zinc-100/90 flex items-center justify-between">
          <button
            type="button"
            onClick={onToggleExpand}
            className="inline-flex items-center space-x-1.5 text-xs font-bold text-zinc-700 hover:text-zinc-900 py-1 cursor-pointer transition-colors group"
          >
            <Receipt className="w-3.5 h-3.5 text-zinc-400 group-hover:text-zinc-600" />
            <span>
              {isExpanded
                ? 'Ocultar desglose de gastos'
                : `Ver detalle (${pendingCount} ${pendingCount === 1 ? 'gasto pendiente' : 'gastos pendientes'})`}
            </span>
            {isExpanded ? (
              <ChevronUp className="w-3.5 h-3.5 text-zinc-500" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
            )}
          </button>

          <span className="text-[11px] text-zinc-400 font-medium">
            {isExpanded ? 'Clic en cualquier gasto para abrirlo' : 'Explicación auditable'}
          </span>
        </div>
      </div>

      {/* Expanded Auditable Detail */}
      {isExpanded && (
        <div className="border-t border-zinc-200/90 bg-zinc-50/70 p-4 sm:p-5 space-y-4">
          {/* Arithmetic Equation Box (Sumas y Restas / Cuentas Claras) */}
          <div className="bg-white rounded-2xl p-4 border border-zinc-200/80 shadow-2xs space-y-3">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-2">
              <span className="text-xs font-extrabold text-zinc-900 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                <span>Auditoría de Cuenta (Sumas y Restas)</span>
              </span>

              <div className="flex items-center space-x-1 text-[11px]">
                <button
                  type="button"
                  onClick={() => setShowAllMovements(false)}
                  className={`px-2 py-0.5 rounded-md font-bold transition-all cursor-pointer ${
                    !showAllMovements
                      ? 'bg-zinc-900 text-white shadow-2xs'
                      : 'text-zinc-500 hover:text-zinc-800'
                  }`}
                >
                  Solo pendientes ({debtDetail.pendingExpenses.length})
                </button>
                <button
                  type="button"
                  onClick={() => setShowAllMovements(true)}
                  className={`px-2 py-0.5 rounded-md font-bold transition-all cursor-pointer ${
                    showAllMovements
                      ? 'bg-zinc-900 text-white shadow-2xs'
                      : 'text-zinc-500 hover:text-zinc-800'
                  }`}
                >
                  Todos ({debtDetail.allExpenses.length})
                </button>
              </div>
            </div>

            {/* Arithmetic Formula Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
              <div className="p-2.5 rounded-xl bg-zinc-50 border border-zinc-200/60">
                <span className="text-[10px] text-zinc-500 font-bold block uppercase">Gastos generados</span>
                <span className="font-extrabold text-zinc-900 text-sm mt-0.5 block">
                  +{formatCurrency(debtDetail.totalOriginalDebt)}
                </span>
              </div>

              <div className="p-2.5 rounded-xl bg-zinc-50 border border-zinc-200/60">
                <span className="text-[10px] text-zinc-500 font-bold block uppercase">Pagos aplicados</span>
                <span className="font-extrabold text-emerald-700 text-sm mt-0.5 block">
                  -{formatCurrency(debtDetail.totalPaymentsApplied)}
                </span>
              </div>

              {debtDetail.totalReverseOffsets > 0 && (
                <div className="p-2.5 rounded-xl bg-zinc-50 border border-zinc-200/60">
                  <span className="text-[10px] text-zinc-500 font-bold block uppercase">Gastos cruzados</span>
                  <span className="font-extrabold text-indigo-700 text-sm mt-0.5 block">
                    -{formatCurrency(debtDetail.totalReverseOffsets)}
                  </span>
                </div>
              )}

              <div className="p-2.5 rounded-xl bg-zinc-900 text-white shadow-xs">
                <span className="text-[10px] text-zinc-400 font-bold block uppercase">Saldo adeudado</span>
                <span className="font-black text-white text-sm mt-0.5 block">
                  {formatCurrency(pairwise.amount)}
                </span>
              </div>
            </div>
          </div>

          {/* List of Pending Expenses that explain the debt */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-black text-zinc-700 uppercase tracking-wider flex items-center space-x-1.5">
                <Receipt className="w-3.5 h-3.5 text-zinc-500" />
                <span>
                  {showAllMovements
                    ? `Todos los gastos involucrados (${debtDetail.allExpenses.length})`
                    : `Gastos pendientes de pago (${debtDetail.pendingExpenses.length})`}
                </span>
              </h4>
              <span className="text-[11px] text-zinc-500 font-medium">
                Haz clic en cualquier gasto para ver su detalle completo
              </span>
            </div>

            {displayedExpenses.length === 0 ? (
              <div className="p-6 bg-white rounded-2xl border border-zinc-200/80 text-center space-y-1">
                <CheckCircle2 className="w-6 h-6 text-emerald-600 mx-auto" />
                <p className="text-xs font-bold text-zinc-900">No hay gastos pendientes en este filtro</p>
                <p className="text-[11px] text-zinc-500">
                  Los pagos registrados han cubierto la totalidad de los gastos anteriores.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-zinc-200/70 rounded-2xl border border-zinc-200/90 overflow-hidden bg-white shadow-2xs">
                {displayedExpenses.map((item, idx) => {
                  const catConfig = getCategoryConfig(item.expense.category);
                  const IconComponent = catConfig.icon;
                  const isFullyPaid = item.isFullyPaid;
                  const isPartiallyPaid = item.isPartiallyPaid;

                  return (
                    <div
                      key={item.expense.id + idx}
                      onClick={() => router.push(`/expenses/${item.expense.id}`)}
                      className="p-3 sm:p-4 flex items-center justify-between gap-3 hover:bg-zinc-50/90 transition-all cursor-pointer group"
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          router.push(`/expenses/${item.expense.id}`);
                        }
                      }}
                    >
                      {/* Left: Icon & Info */}
                      <div className="flex items-center space-x-3 min-w-0">
                        <div
                          className={`p-2.5 rounded-xl ${catConfig.bgClass} ${catConfig.textClass} shrink-0 border border-zinc-200/60 shadow-2xs group-hover:scale-105 transition-transform`}
                        >
                          <IconComponent className="w-4 h-4" />
                        </div>

                        <div className="min-w-0 space-y-0.5">
                          <div className="flex items-center space-x-1.5 flex-wrap">
                            <span className="font-extrabold text-zinc-900 text-xs sm:text-sm truncate group-hover:text-indigo-700 transition-colors">
                              {item.expense.description}
                            </span>
                            {item.groupName && (
                              <span className="text-[10px] font-bold bg-zinc-100 text-zinc-600 px-2 py-0.5 rounded-md border border-zinc-200/60">
                                {item.groupName}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center space-x-2 text-[11px] text-zinc-500 font-medium flex-wrap">
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3 text-zinc-400" />
                              <span>{item.expense.expense_date}</span>
                            </span>

                            {item.participantProfile &&
                              item.participantProfile.id !== pairwise.debtor.id && (
                                <span className="text-indigo-700 font-bold flex items-center gap-1">
                                  <Shield className="w-2.5 h-2.5" />
                                  <span>Por: {item.participantProfile.full_name}</span>
                                </span>
                              )}
                          </div>
                        </div>
                      </div>

                      {/* Right: Amounts & Status */}
                      <div className="flex items-center space-x-3 shrink-0 text-right">
                        <div>
                          {isFullyPaid ? (
                            <div>
                              <span className="text-xs font-bold text-zinc-400 line-through block">
                                {formatCurrency(item.originalAmount)}
                              </span>
                              <span className="text-[10px] font-black text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                                Saldado
                              </span>
                            </div>
                          ) : isPartiallyPaid ? (
                            <div>
                              <span className="text-xs font-black text-rose-600 block">
                                Pendiente: {formatCurrency(item.pendingAmount)}
                              </span>
                              <span className="text-[10px] text-zinc-400 font-medium block">
                                (de {formatCurrency(item.originalAmount)} • Abonado: {formatCurrency(item.paidAmount)})
                              </span>
                            </div>
                          ) : (
                            <div>
                              <span
                                className={`text-xs sm:text-sm font-black block ${
                                  isCreditor ? 'text-emerald-700' : isDebtor ? 'text-rose-600' : 'text-zinc-900'
                                }`}
                              >
                                {formatCurrency(item.pendingAmount)}
                              </span>
                              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                                Pendiente
                              </span>
                            </div>
                          )}
                        </div>

                        <div className="w-6 h-6 rounded-full bg-zinc-100 group-hover:bg-zinc-900 group-hover:text-white flex items-center justify-center text-zinc-400 transition-all">
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Applied Payments History Section if any */}
          {debtDetail.appliedPayments.length > 0 && (
            <div className="space-y-2 pt-2">
              <h4 className="text-xs font-bold text-zinc-600 uppercase tracking-wider flex items-center space-x-1.5">
                <HandCoins className="w-3.5 h-3.5 text-emerald-600" />
                <span>Abonos y pagos registrados ({debtDetail.appliedPayments.length})</span>
              </h4>

              <div className="divide-y divide-zinc-200/70 rounded-2xl border border-zinc-200/80 bg-white overflow-hidden shadow-2xs">
                {debtDetail.appliedPayments.map((payItem, pIdx) => (
                  <div
                    key={payItem.payment.id || pIdx}
                    className="p-3 flex items-center justify-between text-xs hover:bg-zinc-50/80 transition-colors"
                  >
                    <div className="flex items-center space-x-2">
                      <div className="w-6 h-6 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
                        ✓
                      </div>
                      <div>
                        <span className="font-bold text-zinc-900 block">
                          Pago registrado {payItem.payment.note ? `• ${payItem.payment.note}` : ''}
                        </span>
                        <span className="text-[11px] text-zinc-400 font-medium">
                          {payItem.payment.payment_date}
                        </span>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="font-extrabold text-emerald-700 block">
                        -{formatCurrency(payItem.amountApplied)}
                      </span>
                      <span className="text-[10px] text-zinc-400 font-medium">Abono aplicado</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ConsolidatedBalances({ onOpenSettleModal }: ConsolidatedBalancesProps) {
  const { currentProfile, expenses, payments, profiles, userGroups, sponsorshipMap } = useExpense();
  const [isSimplified, setIsSimplified] = useState(true);
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCardKey, setExpandedCardKey] = useState<string | null>(null);

  const userGroupIds = useMemo(() => new Set(userGroups.map((g) => g.id)), [userGroups]);
  const userExpenses = useMemo(() => expenses.filter((e) => userGroupIds.has(e.group_id)), [expenses, userGroupIds]);
  const userPayments = useMemo(() => payments.filter((s) => userGroupIds.has(s.group_id)), [payments, userGroupIds]);

  // Compute both simplified and direct pairwise balances
  const simplifiedPairwise = useMemo(
    () => calculateSimplifiedBalances(userExpenses, userPayments, profiles),
    [userExpenses, userPayments, profiles]
  );
  const directPairwise = useMemo(
    () => calculateDirectBalances(userExpenses, userPayments, profiles),
    [userExpenses, userPayments, profiles]
  );

  const activePairwise = isSimplified ? simplifiedPairwise : directPairwise;

  // Filter into categories for count badges and KPI summaries
  const myOwedToMe = useMemo(() => {
    return activePairwise.filter((p) => {
      if (isSimplified) {
        return p.creditor.id === currentProfile?.id;
      }
      return p.creditor.id === currentProfile?.id || p.creditorSponsor?.id === currentProfile?.id;
    });
  }, [activePairwise, isSimplified, currentProfile]);

  const myIOwe = useMemo(() => {
    return activePairwise.filter((p) => {
      if (isSimplified) {
        return p.debtor.id === currentProfile?.id;
      }
      return p.debtor.id === currentProfile?.id || p.debtorSponsor?.id === currentProfile?.id;
    });
  }, [activePairwise, isSimplified, currentProfile]);

  const otherPairwise = useMemo(() => {
    return activePairwise.filter((p) => {
      if (isSimplified) {
        return p.creditor.id !== currentProfile?.id && p.debtor.id !== currentProfile?.id;
      }
      const isCreditorMeOrMine =
        p.creditor.id === currentProfile?.id || p.creditorSponsor?.id === currentProfile?.id;
      const isDebtorMeOrMine =
        p.debtor.id === currentProfile?.id || p.debtorSponsor?.id === currentProfile?.id;
      return !isCreditorMeOrMine && !isDebtorMeOrMine;
    });
  }, [activePairwise, isSimplified, currentProfile]);

  const totalOwedToMe = useMemo(() => myOwedToMe.reduce((acc, curr) => acc + curr.amount, 0), [myOwedToMe]);
  const totalIOwe = useMemo(() => myIOwe.reduce((acc, curr) => acc + curr.amount, 0), [myIOwe]);
  const netConsolidated = totalOwedToMe - totalIOwe;

  const directTransactionsCount = directPairwise.length;
  const simplifiedTransactionsCount = simplifiedPairwise.length;

  // Unified List Filtering (Filter pills + Search)
  const filteredPairwiseList = useMemo(() => {
    let list = activePairwise;

    // Filter by type
    if (activeFilter === 'mine') {
      list = list.filter((p) => {
        const isCreditor =
          p.creditor.id === currentProfile?.id ||
          (!isSimplified && p.creditorSponsor?.id === currentProfile?.id);
        const isDebtor =
          p.debtor.id === currentProfile?.id ||
          (!isSimplified && p.debtorSponsor?.id === currentProfile?.id);
        return isCreditor || isDebtor;
      });
    } else if (activeFilter === 'to_receive') {
      list = myOwedToMe;
    } else if (activeFilter === 'to_pay') {
      list = myIOwe;
    } else if (activeFilter === 'third_party') {
      list = otherPairwise;
    }

    // Filter by search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((p) => {
        const debtorName = (p.debtor.full_name || '').toLowerCase();
        const creditorName = (p.creditor.full_name || '').toLowerCase();
        const debtorEmail = (p.debtor.email || '').toLowerCase();
        const creditorEmail = (p.creditor.email || '').toLowerCase();
        return (
          debtorName.includes(q) ||
          creditorName.includes(q) ||
          debtorEmail.includes(q) ||
          creditorEmail.includes(q)
        );
      });
    }

    // Sort order: My debts & credits first (higher urgency), then highest amount
    return [...list].sort((a, b) => {
      const aIsMine =
        a.creditor.id === currentProfile?.id || a.debtor.id === currentProfile?.id;
      const bIsMine =
        b.creditor.id === currentProfile?.id || b.debtor.id === currentProfile?.id;

      if (aIsMine && !bIsMine) return -1;
      if (!aIsMine && bIsMine) return 1;
      return b.amount - a.amount;
    });
  }, [
    activePairwise,
    activeFilter,
    searchQuery,
    myOwedToMe,
    myIOwe,
    otherPairwise,
    currentProfile,
    isSimplified,
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Balances & Pagos"
        subtitle="Vista unificada de cuentas claras: quién le debe a quién, sumas a tu favor, deudas y liquidación auditable."
        icon={<Wallet className="w-5 h-5" />}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <div className="inline-flex items-center p-0.5 bg-zinc-100/90 rounded-xl border border-zinc-200/80 shrink-0 shadow-2xs">
              <button
                type="button"
                onClick={() => setIsSimplified(true)}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  isSimplified
                    ? 'bg-white text-zinc-900 shadow-2xs'
                    : 'text-zinc-500 hover:text-zinc-800'
                }`}
              >
                <Sparkles className={`w-3.5 h-3.5 ${isSimplified ? 'text-emerald-600' : 'text-zinc-400'}`} />
                <span>Simplificado</span>
                <span className="text-[10px] opacity-60 font-bold">({simplifiedTransactionsCount})</span>
              </button>

              <button
                type="button"
                onClick={() => setIsSimplified(false)}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  !isSimplified
                    ? 'bg-white text-zinc-900 shadow-2xs'
                    : 'text-zinc-500 hover:text-zinc-800'
                }`}
              >
                <Layers className={`w-3.5 h-3.5 ${!isSimplified ? 'text-zinc-900' : 'text-zinc-400'}`} />
                <span>Directo</span>
                <span className="text-[10px] opacity-60 font-bold">({directTransactionsCount})</span>
              </button>
            </div>
          </div>
        }
      />

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Por cobrar (Suma +) */}
        <div
          onClick={() => setActiveFilter('to_receive')}
          className={`rounded-3xl p-5 border shadow-xs relative overflow-hidden transition-all cursor-pointer hover:shadow-md ${
            activeFilter === 'to_receive'
              ? 'ring-2 ring-emerald-500 bg-emerald-50/80 border-emerald-300'
              : 'bg-gradient-to-br from-emerald-500/10 via-white to-emerald-500/5 border-emerald-200/80'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-emerald-800 uppercase tracking-wider">
              + Te deben (Suma)
            </span>
            <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl sm:text-3xl font-black text-emerald-700 tracking-tight block">
              +{formatCurrency(totalOwedToMe)}
            </span>
            <p className="text-xs text-emerald-800/80 font-medium mt-1">
              {myOwedToMe.length === 1
                ? '1 cobro pendiente'
                : `${myOwedToMe.length} cobros pendientes`}
            </p>
          </div>
        </div>

        {/* Por pagar (Resta -) */}
        <div
          onClick={() => setActiveFilter('to_pay')}
          className={`rounded-3xl p-5 border shadow-xs relative overflow-hidden transition-all cursor-pointer hover:shadow-md ${
            activeFilter === 'to_pay'
              ? 'ring-2 ring-rose-500 bg-rose-50/80 border-rose-300'
              : 'bg-gradient-to-br from-rose-500/10 via-white to-rose-500/5 border-rose-200/80'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-rose-800 uppercase tracking-wider">
              - Debes (Resta)
            </span>
            <div className="w-10 h-10 rounded-2xl bg-rose-500 text-white flex items-center justify-center shadow-xs">
              <TrendingDown className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl sm:text-3xl font-black text-rose-600 tracking-tight block">
              -{formatCurrency(totalIOwe)}
            </span>
            <p className="text-xs text-rose-800/80 font-medium mt-1">
              {myIOwe.length === 1 ? '1 pago pendiente' : `${myIOwe.length} pagos pendientes`}
            </p>
          </div>
        </div>

        {/* Balance neto */}
        <div
          onClick={() => setActiveFilter('mine')}
          className={`rounded-3xl p-5 border shadow-xs relative overflow-hidden transition-all cursor-pointer hover:shadow-md ${
            activeFilter === 'mine'
              ? 'ring-2 ring-zinc-900 bg-zinc-100/90 border-zinc-400'
              : 'bg-gradient-to-br from-zinc-100/90 via-white to-zinc-50 border-zinc-200/90'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-zinc-600 uppercase tracking-wider">
              = Tu balance neto
            </span>
            <div className="w-10 h-10 rounded-2xl bg-zinc-900 text-white flex items-center justify-center shadow-xs">
              <ArrowRightLeft className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <span
              className={`text-2xl sm:text-3xl font-black tracking-tight block ${
                netConsolidated > 0
                  ? 'text-emerald-700'
                  : netConsolidated < 0
                  ? 'text-rose-600'
                  : 'text-zinc-900'
              }`}
            >
              {netConsolidated > 0 ? '+' : ''}
              {formatCurrency(netConsolidated)}
            </span>
            <p className="text-xs text-zinc-500 font-medium mt-1">
              {netConsolidated > 0
                ? 'Balance a tu favor'
                : netConsolidated < 0
                ? 'Balance total por pagar'
                : 'Cuentas perfectamente al día'}
            </p>
          </div>
        </div>
      </div>

      {/* UNIFIED BALANCES SECTION (Replaces the 3 separated sections) */}
      <div className="space-y-4">
        {/* Controls & Filter Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-3xl border border-zinc-200/80 shadow-2xs">
          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
            <button
              type="button"
              onClick={() => setActiveFilter('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold whitespace-nowrap transition-all cursor-pointer flex items-center space-x-1.5 ${
                activeFilter === 'all'
                  ? 'bg-zinc-900 text-white shadow-xs'
                  : 'bg-zinc-100/80 text-zinc-600 hover:bg-zinc-200/70'
              }`}
            >
              <span>Todos los saldos</span>
              <span className="text-[10px] opacity-70">({activePairwise.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveFilter('mine')}
              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold whitespace-nowrap transition-all cursor-pointer flex items-center space-x-1.5 ${
                activeFilter === 'mine'
                  ? 'bg-zinc-900 text-white shadow-xs'
                  : 'bg-zinc-100/80 text-zinc-600 hover:bg-zinc-200/70'
              }`}
            >
              <span>Mis saldos</span>
              <span className="text-[10px] opacity-70">({myOwedToMe.length + myIOwe.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveFilter('to_receive')}
              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold whitespace-nowrap transition-all cursor-pointer flex items-center space-x-1.5 ${
                activeFilter === 'to_receive'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100/80 border border-emerald-200/60'
              }`}
            >
              <span>+ Por cobrar</span>
              <span className="text-[10px] opacity-80">({myOwedToMe.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveFilter('to_pay')}
              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold whitespace-nowrap transition-all cursor-pointer flex items-center space-x-1.5 ${
                activeFilter === 'to_pay'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'bg-rose-50 text-rose-800 hover:bg-rose-100/80 border border-rose-200/60'
              }`}
            >
              <span>- Por pagar</span>
              <span className="text-[10px] opacity-80">({myIOwe.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveFilter('third_party')}
              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold whitespace-nowrap transition-all cursor-pointer flex items-center space-x-1.5 ${
                activeFilter === 'third_party'
                  ? 'bg-zinc-700 text-white shadow-xs'
                  : 'bg-zinc-100/80 text-zinc-600 hover:bg-zinc-200/70'
              }`}
            >
              <span>Entre otros</span>
              <span className="text-[10px] opacity-70">({otherPairwise.length})</span>
            </button>
          </div>

          {/* Search Input */}
          <div className="relative shrink-0 sm:w-60">
            <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por integrante..."
              className="w-full bg-zinc-50 border border-zinc-200/80 rounded-xl pl-8 pr-3 py-1.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:outline-hidden focus:ring-2 focus:ring-zinc-900 transition-all"
            />
          </div>
        </div>

        {/* List of Unified Cards */}
        {filteredPairwiseList.length === 0 ? (
          <div className="bg-white rounded-3xl p-10 border border-zinc-200/80 text-center space-y-3 shadow-2xs">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto ring-1 ring-emerald-200/60 shadow-xs">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h3 className="font-black text-zinc-900 text-base">
              {searchQuery ? 'No se encontraron resultados' : '¡Todas las cuentas están al día!'}
            </h3>
            <p className="text-zinc-500 text-xs max-w-md mx-auto">
              {searchQuery
                ? `No hay deudas registradas que coincidan con "${searchQuery}".`
                : 'No hay deudas pendientes en este filtro. Todos los integrantes están en paz y salvo.'}
            </p>
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="text-xs font-bold text-indigo-700 hover:underline cursor-pointer"
              >
                Limpiar búsqueda
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {filteredPairwiseList.map((pairwise, idx) => {
              const cardKey = `${pairwise.debtor.id}->${pairwise.creditor.id}`;
              const isExpanded = expandedCardKey === cardKey;

              return (
                <UnifiedBalanceCard
                  key={cardKey}
                  pairwise={pairwise}
                  currentProfile={currentProfile}
                  isSimplified={isSimplified}
                  expenses={userExpenses}
                  payments={userPayments}
                  profiles={profiles}
                  groups={userGroups}
                  isExpanded={isExpanded}
                  onToggleExpand={() => {
                    setExpandedCardKey(isExpanded ? null : cardKey);
                  }}
                  onOpenSettleModal={onOpenSettleModal}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
