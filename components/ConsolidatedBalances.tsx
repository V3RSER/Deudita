'use client';

import React, { useState, useMemo } from 'react';
import Image from 'next/image';
import { useExpense } from '@/lib/expense-context';
import { Payment, PairwiseBalance, Group, Profile, Expense } from '@/lib/types';
import {
  formatCurrency,
  calculateSimplifiedBalances,
  calculateDirectBalances,
  calculatePairwiseDebtDetail,
  PairwiseDebtDetail,
  SimplificationExpenseItem,
} from '@/lib/balance-utils';
import { getCategoryConfig } from '@/lib/expense-category-utils';
import {
  ExpenseParticipantSummary,
  ParticipantSummaryData,
  ParticipantItemBreakdown,
} from '@/components/ExpenseParticipantSummary';
import {
  formatHumanDate,
  getRecordEventDateInfo,
} from '@/lib/transaction-date-utils';
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  ArrowRightLeft,
  CheckCircle2,
  Sparkles,
  Layers,
  Shield,
  UserCheck,
  ChevronDown,
  ChevronUp,
  Receipt,
  Search,
  Calendar,
  Clock,
  ExternalLink,
  Plus,
  Minus,
  Info,
  HandCoins,
  ShoppingBag,
  ImageIcon,
  FileText,
  X,
  Calculator,
  Users,
  ArrowRight,
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

function UserAvatar({
  profile,
  size = 'md',
  className = '',
}: {
  profile?: Profile | null;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const sizeClasses = {
    xs: 'w-5 h-5 text-[9px]',
    sm: 'w-6 h-6 text-[10px]',
    md: 'w-8 h-8 text-xs',
    lg: 'w-10 h-10 text-sm',
  };

  const pxSizes = {
    xs: 20,
    sm: 24,
    md: 32,
    lg: 40,
  };

  const name = profile?.full_name || 'Usuario';
  const initial = getInitials(name);

  if (profile?.avatar_url) {
    return (
      <Image
        src={profile.avatar_url}
        alt={name}
        width={pxSizes[size]}
        height={pxSizes[size]}
        className={`rounded-full object-cover shrink-0 ring-1.5 ring-white shadow-2xs ${sizeClasses[size]} ${className}`}
        unoptimized
        referrerPolicy="no-referrer"
      />
    );
  }

  return (
    <div
      className={`rounded-full bg-zinc-800 text-white font-bold flex items-center justify-center shrink-0 ring-1.5 ring-white shadow-2xs ${sizeClasses[size]} ${className}`}
      title={name}
    >
      {initial}
    </div>
  );
}

type FilterType = 'all' | 'mine' | 'to_receive' | 'to_pay' | 'third_party';

const MONTH_ABBR_ES = [
  'ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN',
  'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'
];

function parseExpenseDate(dateInput?: string | null) {
  if (!dateInput) {
    return { monthAbbr: 'EXP', dayStr: '--' };
  }
  const d = new Date(dateInput);
  if (!isNaN(d.getTime())) {
    const monthIndex = d.getMonth();
    const dayNum = d.getDate();
    const dayStr = dayNum < 10 ? `0${dayNum}` : `${dayNum}`;
    const monthAbbr = MONTH_ABBR_ES[monthIndex] || 'EXP';
    return { monthAbbr, dayStr };
  }
  return { monthAbbr: 'EXP', dayStr: '--' };
}

function formatFullDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const dateFormatted = d.toLocaleDateString('es-CO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const timeFormatted = d.toLocaleTimeString('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return `${dateFormatted}, ${timeFormatted}`;
}

interface BalanceExpenseItemProps {
  expense: Expense;
  relevantAmount: number;
  originalAmount?: number;
  paidAmount?: number;
  isPartiallyPaid?: boolean;
  amountType: 'debt' | 'offset' | 'simplification';
  debtorProfile: Profile;
  creditorProfile: Profile;
  currentProfile: Profile | null;
  groupName?: string;
  groupCurrency?: string;
  profiles: Profile[];
  onOpenReceipt: (url: string) => void;
  customExplanation?: string;
  simplificationRole?: 'debtor_owes_third_party' | 'creditor_paid_third_party';
}

function BalanceExpenseItem({
  expense,
  relevantAmount,
  originalAmount,
  paidAmount,
  isPartiallyPaid,
  amountType,
  debtorProfile,
  creditorProfile,
  currentProfile,
  groupName,
  groupCurrency,
  profiles,
  onOpenReceipt,
  customExplanation,
  simplificationRole,
}: BalanceExpenseItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const catConfig = getCategoryConfig(expense.category);
  const CategoryIcon = catConfig.icon;
  const currency = groupCurrency || currentProfile?.currency || 'COP';
  const dateParsed = parseExpenseDate(expense.expense_date || expense.created_at);

  const paidByProfile = profiles.find((p) => p.id === expense.paid_by);
  const createdByProfile = profiles.find((p) => p.id === expense.created_by);
  const payerName = paidByProfile?.full_name || 'Usuario';

  // Always use the real names, never "Tú"
  const debtorName = debtorProfile.full_name || 'Deudor';
  const creditorName = creditorProfile.full_name || 'Acreedor';

  // Build participant summary breakdown for expanded view
  const participantSummaryList: ParticipantSummaryData[] = useMemo(() => {
    return (expense.splits || []).map((split) => {
      const profile = profiles.find((p) => p.id === split.user_id);
      const userAmt = split.amount_owed;
      const breakdown: ParticipantItemBreakdown[] = [];

      if (expense.items && expense.items.length > 0 && expense.total_amount > 0) {
        expense.items.forEach((item) => {
          const match = item.description.match(/^(\d+(?:\.\d+)?)\s*(?:·|x)\s*(.*)$/);
          const totalQty = match ? parseFloat(match[1]) || 1 : 1;
          const cleanDesc = match ? match[2].trim() : item.description;
          const ratio = expense.total_amount > 0 ? userAmt / expense.total_amount : 0;
          const userItemQty = totalQty * ratio;
          const userItemCost = item.amount * ratio;

          breakdown.push({
            desc: cleanDesc,
            qty: userItemQty,
            cost: userItemCost,
          });
        });
      }

      return {
        userId: split.user_id,
        profile,
        amount: userAmt,
        breakdown: breakdown.length > 0 ? breakdown : undefined,
      };
    });
  }, [expense.splits, expense.items, expense.total_amount, profiles]);

  const hasItems = Boolean(expense.items && expense.items.length > 0);
  const hasNotes = Boolean(expense.notes && expense.notes.trim().length > 0);
  const hasReceipt = Boolean(expense.receipt_url);
  const hasSecondaryDetails = hasItems || hasNotes || hasReceipt;

  const eventInfo = getRecordEventDateInfo(expense);

  // Directly display the exact relevant amount and who owes or recovers
  let primaryAmountText = '';
  let primaryAmountColorClass = '';
  let detailRoleText = '';
  let detailRoleColorClass = '';

  if (amountType === 'debt') {
    primaryAmountText = `+${formatCurrency(relevantAmount, currency)}`;
    primaryAmountColorClass = 'text-rose-600';
    if (isPartiallyPaid && paidAmount && paidAmount > 0.009) {
      detailRoleText = `${debtorName} debe (abono de ${formatCurrency(paidAmount, currency)})`;
    } else {
      detailRoleText = `${debtorName} debe`;
    }
    detailRoleColorClass = 'text-rose-700 font-bold';
  } else if (amountType === 'offset') {
    primaryAmountText = `-${formatCurrency(relevantAmount, currency)}`;
    primaryAmountColorClass = 'text-emerald-700';
    detailRoleText = `${debtorName} recupera`;
    detailRoleColorClass = 'text-emerald-700 font-bold';
  } else {
    // simplification
    if (simplificationRole === 'debtor_owes_third_party') {
      primaryAmountText = `+${formatCurrency(relevantAmount, currency)}`;
      primaryAmountColorClass = 'text-rose-600';
      detailRoleText = `${debtorName} debe`;
      detailRoleColorClass = 'text-rose-700 font-bold';
    } else {
      primaryAmountText = formatCurrency(relevantAmount, currency);
      primaryAmountColorClass = 'text-emerald-700';
      detailRoleText = `pagó ${payerName}`;
      detailRoleColorClass = 'text-emerald-700 font-bold';
    }
  }

  return (
    <div
      className={`bg-white rounded-2xl border transition-all overflow-hidden ${
        isExpanded
          ? 'border-indigo-300 ring-2 ring-indigo-500/10 shadow-xs'
          : 'border-zinc-200/80 shadow-2xs hover:border-zinc-300'
      }`}
    >
      {/* Unexpanded Main Header Row */}
      <div
        className={`p-3 sm:p-3.5 flex items-center justify-between gap-3 min-w-0 cursor-pointer select-none transition-colors ${
          isExpanded ? 'bg-zinc-50/90 border-b border-zinc-200/70' : 'hover:bg-zinc-50/70'
        }`}
        onClick={() => setIsExpanded(!isExpanded)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsExpanded(!isExpanded);
          }
        }}
      >
        <div className="flex items-center space-x-2.5 sm:space-x-3 min-w-0 flex-1">
          {/* Date Badge */}
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-zinc-100 border border-zinc-200/90 text-zinc-900 flex flex-col items-center justify-center shrink-0 text-center shadow-2xs">
            <span className="text-[8px] font-black uppercase tracking-wider text-zinc-500 leading-none">
              {dateParsed.monthAbbr}
            </span>
            <span className="text-xs sm:text-sm font-black leading-none mt-0.5">
              {dateParsed.dayStr}
            </span>
          </div>

          {/* Category Icon */}
          <div
            className={`w-8 h-8 rounded-xl border border-black/5 ${catConfig.bgClass} ${catConfig.textClass} flex items-center justify-center shrink-0 shadow-2xs`}
          >
            <CategoryIcon className="w-4 h-4" />
          </div>

          {/* Group Badge, Title & Payer */}
          <div className="min-w-0 flex-1 space-y-0.5">
            {/* Group Badge & Title */}
            <div className="flex items-center space-x-1.5 flex-wrap">
              {groupName ? (
                <span className="inline-flex items-center text-[10px] font-extrabold bg-zinc-100 text-zinc-800 px-2 py-0.5 rounded-md border border-zinc-200 shadow-2xs shrink-0">
                  {groupName}
                </span>
              ) : (
                <span className="inline-flex items-center text-[10px] font-extrabold bg-zinc-100 text-zinc-600 px-1.5 py-0.5 rounded-md border border-zinc-200 shadow-2xs shrink-0">
                  Gasto
                </span>
              )}
              <h4 className="font-extrabold text-zinc-900 text-xs sm:text-sm truncate">
                {expense.description}
              </h4>
            </div>

            {/* Payer text only (no redundant information afterwards) */}
            <div className="text-[11px] text-zinc-500 font-medium truncate">
              Pagó <strong className="text-zinc-700 font-semibold">{payerName}</strong>
            </div>
          </div>
        </div>

        {/* Right: Direct Relevant Amount & Debtor/Creditor detail */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <div className="flex flex-col items-end justify-center text-right">
            <span className={`text-xs sm:text-sm font-black leading-tight ${primaryAmountColorClass}`}>
              {primaryAmountText}
            </span>
            {isPartiallyPaid && originalAmount ? (
              <span className="text-[9.5px] text-zinc-400 font-medium leading-tight">
                de {formatCurrency(originalAmount, currency)}
              </span>
            ) : null}
            <span className={`text-[10.5px] leading-tight mt-0.5 ${detailRoleColorClass}`}>
              {detailRoleText}
            </span>
          </div>

          {/* Expand toggle chevron */}
          <div
            className={`p-1.5 rounded-xl border transition-all ${
              isExpanded
                ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                : 'bg-zinc-100/80 border-zinc-200/80 text-zinc-500'
            }`}
          >
            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </div>
        </div>
      </div>

      {/* Expanded Content (In-place breakdown without page navigation) */}
      {isExpanded && (
        <div className="bg-zinc-50/50 p-3 sm:p-4 space-y-3">
          {hasSecondaryDetails ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
              {/* Left col: Resumen por participante */}
              <ExpenseParticipantSummary
                participants={participantSummaryList}
                currency={currency}
                currentUserId={currentProfile?.id}
                title="Desglose por participantes"
                defaultExpanded={true}
              />

              {/* Right col: Items, receipt and notes */}
              <div className="space-y-2.5">
                {hasItems && (
                  <div className="bg-white rounded-2xl border border-zinc-200/90 shadow-2xs overflow-hidden">
                    <div className="px-3 py-2 bg-zinc-50/80 border-b border-zinc-200/70 flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <ShoppingBag className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                        <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-600">
                          Artículos ({expense.items?.length || 0})
                        </span>
                      </div>
                    </div>
                    <div className="divide-y divide-zinc-100 max-h-48 overflow-y-auto">
                      {expense.items?.map((item, idx) => (
                        <div
                          key={item.id || idx}
                          className="flex items-center justify-between text-xs py-2 px-3 hover:bg-zinc-50/50 transition-colors"
                        >
                          <div className="flex items-center space-x-2 min-w-0 pr-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
                            <span className="font-medium text-zinc-800 truncate">{item.description}</span>
                          </div>
                          <span className="text-zinc-900 font-bold shrink-0 text-xs">
                            {formatCurrency(item.amount, currency)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {hasReceipt && (
                  <div className="bg-white rounded-2xl border border-zinc-200/90 shadow-2xs overflow-hidden">
                    <div className="px-3 py-2 bg-zinc-50/80 border-b border-zinc-200/70 flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <ImageIcon className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                        <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-600">
                          Comprobante de pago
                        </span>
                      </div>
                    </div>
                    <div className="p-3">
                      <div
                        onClick={() => onOpenReceipt(expense.receipt_url!)}
                        className="group/img relative w-24 h-24 rounded-xl overflow-hidden border border-zinc-200 cursor-pointer bg-zinc-100 hover:border-indigo-500 transition-all shadow-2xs"
                      >
                        <Image
                          src={expense.receipt_url!}
                          alt="Comprobante"
                          fill
                          className="object-cover group-hover/img:scale-105 transition-transform"
                          unoptimized
                          referrerPolicy="no-referrer"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center text-white text-[11px] font-semibold gap-1">
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>Ver</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {hasNotes && (
                  <div className="bg-white rounded-2xl border border-zinc-200/90 shadow-2xs overflow-hidden">
                    <div className="px-3 py-2 bg-zinc-50/80 border-b border-zinc-200/70 flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                      <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-600">
                        Notas
                      </span>
                    </div>
                    <div className="p-3">
                      <p className="text-xs text-zinc-700 whitespace-pre-wrap leading-relaxed">
                        {expense.notes}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <ExpenseParticipantSummary
              participants={participantSummaryList}
              currency={currency}
              currentUserId={currentProfile?.id}
              title="Desglose por participantes"
              defaultExpanded={true}
            />
          )}

          {/* Timestamp & Metadata Footer */}
          <div className="pt-2.5 border-t border-zinc-200/70 text-[11px] text-zinc-500 space-y-1 bg-white/70 p-2.5 rounded-xl">
            <div className="flex items-center space-x-2 flex-wrap">
              <Calendar className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
              <span>
                Fecha del gasto:{' '}
                <strong className="font-semibold text-zinc-700">
                  {formatHumanDate(eventInfo.dateObj, { includeTime: Boolean(expense.expense_time) })}
                </strong>
              </span>
            </div>

            <div className="flex items-center space-x-2 flex-wrap">
              <Clock className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
              <span>
                Registrado por{' '}
                <strong className="font-semibold text-zinc-700">
                  {createdByProfile ? createdByProfile.full_name : 'Usuario'}
                </strong>{' '}
                el {formatFullDateTime(expense.created_at)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface GroupOptimizationSectionProps {
  simplifiedDiff: number;
  debtorProfile: Profile;
  creditorProfile: Profile;
  directBalance: number;
  simplificationExpenses: SimplificationExpenseItem[];
  currency: string;
  onOpenReceipt: (url: string) => void;
}

function GroupOptimizationSection({
  simplifiedDiff,
  debtorProfile,
  creditorProfile,
  directBalance,
  simplificationExpenses,
  currency,
  onOpenReceipt,
}: GroupOptimizationSectionProps) {
  const [isExpensesExpanded, setIsExpensesExpanded] = useState(false);
  const debtorName = debtorProfile.full_name || 'Deudor';
  const creditorName = creditorProfile.full_name || 'Acreedor';

  return (
    <div className="space-y-2.5 pt-1">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h4 className="text-xs sm:text-sm font-black text-zinc-900 uppercase tracking-wider flex items-center gap-1.5">
          <Sparkles className="w-4 h-4 text-violet-600 shrink-0" />
          <span>Ajuste por optimización grupal</span>
        </h4>

        <span className="text-xs font-black text-violet-900 bg-violet-100/90 px-2.5 py-0.5 rounded-lg border border-violet-200">
          {simplifiedDiff > 0 ? '+' : ''}
          {formatCurrency(simplifiedDiff, currency)}
        </span>
      </div>

      {/* Explanatory summary card */}
      <div className="bg-violet-50/80 border border-violet-200/80 rounded-xl p-3.5 space-y-1.5 text-xs text-violet-950 shadow-2xs">
        <p className="leading-relaxed">
          {simplifiedDiff > 0 ? (
            <>
              La cuenta directa 1 a 1 entre <strong>{debtorName}</strong> y <strong>{creditorName}</strong> es de{' '}
              <strong className="text-zinc-900">{formatCurrency(directBalance, currency)}</strong>. Para liquidar las
              deudas del grupo con el menor número de pagos posibles, se añaden{' '}
              <strong className="text-violet-900 font-black">+{formatCurrency(simplifiedDiff, currency)}</strong> a esta
              transferencia directa, consolidando saldos de otros integrantes en un solo pago.
            </>
          ) : (
            <>
              La cuenta directa 1 a 1 entre <strong>{debtorName}</strong> y <strong>{creditorName}</strong> es de{' '}
              <strong className="text-zinc-900">{formatCurrency(directBalance, currency)}</strong>. Para optimizar las
              cuentas del grupo, se descuentan{' '}
              <strong className="text-violet-900 font-black">-{formatCurrency(Math.abs(simplifiedDiff), currency)}</strong> de
              esta transferencia porque se compensan con pagos directos hacia otros integrantes.
            </>
          )}
        </p>
      </div>

      {/* Collapsible list of participating group expenses (Collapsed by default) */}
      {simplificationExpenses.length > 0 && (
        <div className="space-y-1.5 pt-0.5">
          <button
            type="button"
            onClick={() => setIsExpensesExpanded((prev) => !prev)}
            className="w-full flex items-center justify-between p-2.5 rounded-xl border border-violet-200/90 bg-white hover:bg-violet-50/70 text-violet-950 font-bold text-xs transition-colors cursor-pointer shadow-2xs"
          >
            <span className="flex items-center gap-1.5">
              <Receipt className="w-3.5 h-3.5 text-violet-600 shrink-0" />
              <span>
                {isExpensesExpanded
                  ? 'Ocultar gastos del grupo vinculados'
                  : `Ver gastos del grupo vinculados (${simplificationExpenses.length})`}
              </span>
            </span>
            {isExpensesExpanded ? (
              <ChevronUp className="w-4 h-4 text-violet-600 shrink-0" />
            ) : (
              <ChevronDown className="w-4 h-4 text-violet-600 shrink-0" />
            )}
          </button>

          {isExpensesExpanded && (
            <div className="divide-y divide-zinc-200/70 rounded-xl border border-zinc-200/80 bg-white overflow-hidden shadow-2xs">
              {simplificationExpenses.map((item, idx) => {
                const payerName = item.payerProfile?.full_name || 'Participante';
                const participantName = item.participantProfile?.full_name || 'Participante';
                const itemDate = item.expense.expense_date
                  ? formatHumanDate(new Date(item.expense.expense_date + 'T12:00:00'))
                  : 'Fecha no especificada';

                return (
                  <div
                    key={item.expense.id + ':' + (item.split?.user_id || idx)}
                    className="p-3 flex items-center justify-between gap-3 hover:bg-zinc-50/80 transition-colors text-xs"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {item.groupName && (
                          <span className="text-[10px] font-bold bg-zinc-100 text-zinc-700 px-1.5 py-0.5 rounded-md border border-zinc-200">
                            {item.groupName}
                          </span>
                        )}
                        <span className="font-extrabold text-zinc-900 truncate">{item.expense.description}</span>
                        {item.expense.receipt_url && (
                          <button
                            type="button"
                            onClick={() => item.expense.receipt_url && onOpenReceipt(item.expense.receipt_url)}
                            className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200 cursor-pointer"
                          >
                            <Receipt className="w-3 h-3" />
                            Comprobante
                          </button>
                        )}
                      </div>
                      <div className="text-[11px] text-zinc-500 font-medium">
                        Pagó <strong className="text-zinc-700">{payerName}</strong> • Consumo de{' '}
                        <strong className="text-zinc-700">{participantName}</strong> • {itemDate}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="font-bold text-zinc-800 text-xs sm:text-sm block">
                        {formatCurrency(item.relevantAmount, item.currency || currency)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

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
  onOpenReceipt: (url: string) => void;
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
  onOpenReceipt,
}: BalanceCardProps) {
  const isDebtor =
    pairwise.debtor.id === currentProfile?.id ||
    (!isSimplified && pairwise.debtorSponsor?.id === currentProfile?.id);

  const isCreditor =
    pairwise.creditor.id === currentProfile?.id ||
    (!isSimplified && pairwise.creditorSponsor?.id === currentProfile?.id);

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

  const debtorName = pairwise.debtor.full_name || 'Usuario';
  const creditorName = pairwise.creditor.full_name || 'Usuario';

  // Direct and simplified arithmetic calculations
  const directBalance = debtDetail.netDirectBalance;
  const simplifiedDiff = pairwise.amount - directBalance;
  const cardCurrency = currentProfile?.currency || 'COP';
  const hasSimplifiedAdjustment = isSimplified && Math.abs(simplifiedDiff) > 0.01;

  // Determine card type styling
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

                <span className="text-[11px] font-bold text-zinc-500 bg-zinc-100/90 px-2 py-0.5 rounded-full border border-zinc-200/60">
                  {debtDetail.pendingExpenses.length}{' '}
                  {debtDetail.pendingExpenses.length === 1 ? 'gasto pendiente' : 'gastos pendientes'}
                </span>
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
                    <span className="text-zinc-500 font-medium">le debe a</span>
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
                      <span>{b.isSelf ? (isDebtor ? 'Tu consumo' : b.profile.full_name) : b.profile.full_name}:</span>
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
                ? 'Ocultar desglose de cuentas'
                : 'Ver desglose detallado de cuentas'}
            </span>
            {isExpanded ? (
              <ChevronUp className="w-3.5 h-3.5 text-zinc-500" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
            )}
          </button>

          <span className="text-[11px] text-zinc-400 font-medium hidden sm:inline-block">
            {isExpanded ? 'Expande cada gasto para ver sus artículos' : 'Cuentas claras paso a paso'}
          </span>
        </div>
      </div>

      {/* Expanded Auditable Detail */}
      {isExpanded && (
        <div className="border-t border-zinc-200/90 bg-zinc-50/70 p-4 sm:p-5 space-y-5">
          {/* GASTOS PAGADOS POR EL ACREEDOR (CONSUMOS DEL DEUDOR PENDIENTES) */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h4 className="text-xs sm:text-sm font-black text-zinc-900 uppercase tracking-wider flex items-center space-x-2">
                <span>Pagado por {creditorName} • {debtorName} debe</span>
              </h4>

              <span className="text-xs font-black text-rose-600 bg-rose-50 px-2.5 py-0.5 rounded-lg border border-rose-200">
                +{formatCurrency(debtDetail.totalOriginalDebt)}
              </span>
            </div>

            {debtDetail.pendingExpenses.length === 0 ? (
              <div className="p-3.5 bg-white rounded-xl border border-zinc-200/70 text-center text-xs text-zinc-500 font-medium">
                No hay consumos pendientes de {debtorName} pagados por {creditorName}.
              </div>
            ) : (
              <div className="space-y-1.5">
                {debtDetail.pendingExpenses.map((item, idx) => (
                  <BalanceExpenseItem
                    key={item.expense.id + idx}
                    expense={item.expense}
                    relevantAmount={item.pendingAmount}
                    originalAmount={item.originalAmount}
                    paidAmount={item.paidAmount}
                    isPartiallyPaid={item.isPartiallyPaid}
                    amountType="debt"
                    debtorProfile={pairwise.debtor}
                    creditorProfile={pairwise.creditor}
                    currentProfile={currentProfile}
                    groupName={item.groupName}
                    groupCurrency={item.currency}
                    profiles={profiles}
                    onOpenReceipt={onOpenReceipt}
                  />
                ))}
              </div>
            )}
          </div>

          {/* ABONOS DE DEUDA (TRANSFERENCIAS DIRECTAS) - ONLY IF EXISTS */}
          {debtDetail.totalPaymentsApplied > 0 && (
            <div className="space-y-2.5 pt-1">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h4 className="text-xs sm:text-sm font-black text-zinc-900 uppercase tracking-wider flex items-center space-x-2">
                  <span>Abonos de deuda • Transferencias directas</span>
                </h4>

                <span className="text-xs font-black text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-lg border border-emerald-200">
                  -{formatCurrency(debtDetail.totalPaymentsApplied)}
                </span>
              </div>

              <div className="divide-y divide-zinc-200/70 rounded-xl border border-zinc-200/80 bg-white overflow-hidden shadow-2xs">
                {debtDetail.appliedPayments.map((payItem, pIdx) => (
                  <div
                    key={payItem.payment.id || pIdx}
                    className="p-3 flex items-center justify-between text-xs hover:bg-zinc-50/80 transition-colors gap-3"
                  >
                    <div className="flex items-center space-x-2.5 min-w-0">
                      <div className="w-6 h-6 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold text-xs shrink-0 border border-emerald-200/80">
                        ✓
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center space-x-1.5 flex-wrap">
                          {payItem.groupName && (
                            <span className="text-[10px] font-bold bg-zinc-100 text-zinc-700 px-1.5 py-0.5 rounded-md border border-zinc-200">
                              {payItem.groupName}
                            </span>
                          )}
                          <span className="font-extrabold text-zinc-900 truncate">
                            Transferencia {payItem.payment.note ? `• ${payItem.payment.note}` : ''}
                          </span>
                        </div>
                        <span className="text-[10.5px] text-zinc-500 font-medium block">
                          Fecha: {payItem.payment.payment_date}
                        </span>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="font-black text-emerald-700 text-xs sm:text-sm block">
                        -{formatCurrency(payItem.amountApplied)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* GASTOS PAGADOS POR EL DEUDOR (CONSUMOS DEL ACREEDOR - RECUPERA) - ONLY IF EXISTS */}
          {debtDetail.totalReverseOffsets > 0 && (
            <div className="space-y-2.5 pt-1">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h4 className="text-xs sm:text-sm font-black text-zinc-900 uppercase tracking-wider flex items-center space-x-2">
                  <span>Pagado por {debtorName} • {debtorName} recupera</span>
                </h4>

                <span className="text-xs font-black text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-lg border border-emerald-200">
                  -{formatCurrency(debtDetail.totalReverseOffsets)}
                </span>
              </div>

              <div className="space-y-1.5">
                {debtDetail.reverseOffsetExpenses.map((revItem, revIdx) => (
                  <BalanceExpenseItem
                    key={revItem.expense.id + revIdx}
                    expense={revItem.expense}
                    relevantAmount={revItem.amount}
                    amountType="offset"
                    debtorProfile={pairwise.debtor}
                    creditorProfile={pairwise.creditor}
                    currentProfile={currentProfile}
                    groupName={revItem.groupName}
                    profiles={profiles}
                    onOpenReceipt={onOpenReceipt}
                  />
                ))}
              </div>
            </div>
          )}

          {/* AJUSTE POR OPTIMIZACIÓN GRUPAL - ONLY IF SIMPLIFIED AND DIFF != 0 */}
          {isSimplified && Math.abs(simplifiedDiff) >= 0.01 && (
            <GroupOptimizationSection
              simplifiedDiff={simplifiedDiff}
              debtorProfile={pairwise.debtor}
              creditorProfile={pairwise.creditor}
              directBalance={directBalance}
              simplificationExpenses={debtDetail.simplificationExpenses}
              currency={cardCurrency}
              onOpenReceipt={onOpenReceipt}
            />
          )}

          {/* CÁLCULO DEL SALDO A LIQUIDAR (ECUACIÓN DIRECTA) */}
          <div className="bg-white rounded-2xl p-4 border border-zinc-200/90 shadow-2xs space-y-3 pt-3">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-2">
              <span className="text-xs font-black text-zinc-900 uppercase tracking-wider flex items-center gap-1.5">
                <Calculator className="w-3.5 h-3.5 text-indigo-600" />
                <span>Cálculo del saldo a liquidar</span>
              </span>

              <span className="text-[10.5px] font-bold text-zinc-400">
                {isSimplified ? 'Modo Simplificado' : 'Modo Directo'}
              </span>
            </div>

            {/* Arithmetic Breakdown - Direct calculation */}
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between py-1 border-b border-zinc-100">
                <span className="text-zinc-600">
                  Consumos de {debtorName} (Pagó {creditorName})
                </span>
                <strong className="text-rose-600 font-bold">+{formatCurrency(debtDetail.totalOriginalDebt)}</strong>
              </div>

              {debtDetail.totalPaymentsApplied > 0 && (
                <div className="flex items-center justify-between py-1 border-b border-zinc-100">
                  <span className="text-zinc-600">Abonos y transferencias directas</span>
                  <strong className="text-emerald-700 font-bold">-{formatCurrency(debtDetail.totalPaymentsApplied)}</strong>
                </div>
              )}

              {debtDetail.totalReverseOffsets > 0 && (
                <div className="flex items-center justify-between py-1 border-b border-zinc-100">
                  <span className="text-zinc-600">
                    Gastos pagados por {debtorName} ({debtorName} recupera)
                  </span>
                  <strong className="text-emerald-700 font-bold">-{formatCurrency(debtDetail.totalReverseOffsets)}</strong>
                </div>
              )}

              {isSimplified && Math.abs(simplifiedDiff) >= 0.01 && (
                <div className="flex items-center justify-between py-1.5 bg-violet-50/80 px-2.5 rounded-lg border border-violet-200 font-bold text-violet-950">
                  <span className="text-violet-800 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-violet-600" />
                    <span>Ajuste por optimización grupal</span>
                  </span>
                  <span className="text-violet-900 font-extrabold">
                    {simplifiedDiff > 0 ? '+' : ''}
                    {formatCurrency(simplifiedDiff)}
                  </span>
                </div>
              )}

              <div className="flex items-center justify-between py-2 bg-zinc-900 text-white px-3 rounded-xl font-black text-sm shadow-xs mt-1">
                <span>= Saldo a liquidar</span>
                <span className="text-base text-emerald-400">{formatCurrency(pairwise.amount)}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function ConsolidatedBalances({ onOpenSettleModal }: ConsolidatedBalancesProps) {
  const { currentProfile, expenses, payments, profiles, userGroups } = useExpense();
  const [isSimplified, setIsSimplified] = useState(true);
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCardKeys, setExpandedCardKeys] = useState<Set<string>>(new Set());
  const [selectedProofUrl, setSelectedProofUrl] = useState<string | null>(null);

  const toggleCardExpand = (cardKey: string) => {
    setExpandedCardKeys((prev) => {
      const next = new Set(prev);
      if (next.has(cardKey)) {
        next.delete(cardKey);
      } else {
        next.add(cardKey);
      }
      return next;
    });
  };

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
              + Te deben
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
              - Debes
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

      {/* UNIFIED BALANCES SECTION */}
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
            {filteredPairwiseList.map((pairwise) => {
              const cardKey = `${pairwise.debtor.id}->${pairwise.creditor.id}`;
              const isExpanded = expandedCardKeys.has(cardKey);

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
                  onToggleExpand={() => toggleCardExpand(cardKey)}
                  onOpenSettleModal={onOpenSettleModal}
                  onOpenReceipt={(url) => setSelectedProofUrl(url)}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Proof/Receipt Modal */}
      {selectedProofUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={() => setSelectedProofUrl(null)}
        >
          <div
            className="relative max-w-3xl max-h-[90vh] w-full bg-zinc-950 rounded-2xl overflow-hidden shadow-2xl border border-zinc-800 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-3 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-300">Comprobante de gasto</span>
              <button
                onClick={() => setSelectedProofUrl(null)}
                className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="relative w-full h-[70vh] bg-zinc-900">
              <Image
                src={selectedProofUrl}
                alt="Comprobante"
                fill
                className="object-contain"
                unoptimized
                referrerPolicy="no-referrer"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
