'use client';

import React, { useState, useMemo } from 'react';
import Image from 'next/image';
import {
  Profile,
  Expense,
  Payment,
  Group,
} from '@/lib/types';
import {
  PairwiseDebtDetail,
  ThirdPartyTriangulation,
  ThirdPartyTriangulationExpense,
  formatCurrency,
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
  ArrowRight,
  ArrowLeftRight,
  Receipt,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  ShoppingBag,
  ImageIcon,
  FileText,
  Calendar,
  Clock,
  CheckCircle2,
  Sparkles,
  Layers,
  Calculator,
  Shield,
  TrendingDown,
  TrendingUp,
  UserCheck,
  CreditCard,
  Building2,
} from 'lucide-react';

interface PairwiseSettlementViewProps {
  debtor: Profile;
  creditor: Profile;
  currentProfile: Profile | null;
  debtDetail: PairwiseDebtDetail;
  finalAmount: number;
  isSimplified: boolean;
  currency?: string;
  groupName?: string;
  profiles: Profile[];
  onOpenReceipt: (url: string) => void;
  onOpenSettleModal?: (groupId?: string, debtorId?: string, creditorId?: string, amount?: number) => void;
  groupId?: string;
}

function getInitials(name?: string | null): string {
  if (!name) return 'U';
  const trimmed = name.trim();
  if (!trimmed) return 'U';
  const parts = trimmed.split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return trimmed.substring(0, 2).toUpperCase();
}

function UserAvatar({
  profile,
  size = 'md',
  className = '',
  ringColor = 'ring-white',
}: {
  profile?: Profile | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  ringColor?: string;
}) {
  const sizeClasses = {
    xs: 'w-5 h-5 text-[9px]',
    sm: 'w-6 h-6 text-[10px]',
    md: 'w-8 h-8 text-xs',
    lg: 'w-10 h-10 text-sm font-extrabold',
    xl: 'w-12 h-12 text-base font-black',
  };

  const pxSizes = {
    xs: 20,
    sm: 24,
    md: 32,
    lg: 40,
    xl: 48,
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
        className={`rounded-full object-cover shrink-0 ring-2 ${ringColor} shadow-2xs ${sizeClasses[size]} ${className}`}
        unoptimized
        referrerPolicy="no-referrer"
      />
    );
  }

  return (
    <div
      className={`rounded-full bg-zinc-900 text-white font-bold flex items-center justify-center shrink-0 ring-2 ${ringColor} shadow-2xs ${sizeClasses[size]} ${className}`}
      title={name}
    >
      {initial}
    </div>
  );
}

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

// ----------------------------------------------------------------------
// 1. RESUMEN SUPERIOR: ÚNICA TARJETA DE RESUMEN
// ----------------------------------------------------------------------
function TopSummaryCard({
  debtor,
  creditor,
  debtAmount,
  recoveryAmount,
  triangulationDiff,
  finalAmount,
  currency = 'COP',
  isSimplified,
}: {
  debtor: Profile;
  creditor: Profile;
  debtAmount: number;
  recoveryAmount: number;
  triangulationDiff: number;
  finalAmount: number;
  currency?: string;
  isSimplified: boolean;
}) {
  const debtorName = debtor.full_name || 'Deudor';
  const creditorName = creditor.full_name || 'Acreedor';
  const hasTriangulation = isSimplified && Math.abs(triangulationDiff) > 0.01;

  return (
    <div
      id="settlement-summary-card"
      className="bg-white rounded-2xl border border-zinc-200/90 shadow-2xs overflow-hidden"
    >
      {/* Visual Flow Header: [Pagador] → [Saldo final] → [Receptor] */}
      <div className="p-4 sm:p-5 bg-gradient-to-b from-zinc-50/90 to-white border-b border-zinc-100">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 sm:gap-6">
          {/* Pagador */}
          <div className="flex items-center space-x-3 w-full md:w-auto justify-start md:justify-start">
            <UserAvatar profile={debtor} size="lg" ringColor="ring-rose-200" />
            <div className="min-w-0">
              <span className="text-[10px] font-black uppercase tracking-wider text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200 block w-fit">
                Pagador
              </span>
              <span className="text-sm font-extrabold text-zinc-900 truncate block mt-0.5">
                {debtorName}
              </span>
            </div>
          </div>

          {/* Central Arrow & Saldo Final */}
          <div className="flex-1 flex flex-col items-center justify-center space-y-1.5 w-full">
            <div className="w-full flex items-center justify-center gap-2">
              <div className="h-[1.5px] bg-zinc-200 flex-1" />
              <div className="flex items-center space-x-2 bg-zinc-900 text-white px-4 py-2 rounded-2xl shadow-xs">
                <span className="text-[11px] font-bold text-zinc-300">Paga finalmente</span>
                <span className="text-base sm:text-lg font-black text-emerald-400">
                  {formatCurrency(finalAmount, currency)}
                </span>
                <ArrowRight className="w-4 h-4 text-zinc-400" />
              </div>
              <div className="h-[1.5px] bg-zinc-200 flex-1" />
            </div>
          </div>

          {/* Receptor */}
          <div className="flex items-center space-x-3 w-full md:w-auto justify-start md:justify-end">
            <div className="min-w-0 text-left md:text-right">
              <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200 block w-fit md:ml-auto">
                Receptor
              </span>
              <span className="text-sm font-extrabold text-zinc-900 truncate block mt-0.5">
                {creditorName}
              </span>
            </div>
            <UserAvatar profile={creditor} size="lg" ringColor="ring-emerald-200" />
          </div>
        </div>
      </div>

      {/* Arithmetic Summary Bar: Deuda generada +$X | Recuperaciones -$X | Triangulaciones -$X | Saldo final =$X */}
      <div className="p-3 sm:p-4 bg-zinc-50/50">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-2.5">
          {/* Deuda generada */}
          <div className="bg-white p-3 rounded-xl border border-zinc-200/80 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                Deuda generada
              </span>
              <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
            </div>
            <span className="text-sm sm:text-base font-black text-rose-600 block mt-1">
              +{formatCurrency(debtAmount, currency)}
            </span>
          </div>

          {/* Recuperaciones */}
          <div className="bg-white p-3 rounded-xl border border-zinc-200/80 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                Recuperaciones
              </span>
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
            </div>
            <span className="text-sm sm:text-base font-black text-emerald-700 block mt-1">
              -{formatCurrency(recoveryAmount, currency)}
            </span>
          </div>

          {/* Triangulaciones */}
          <div
            className={`p-3 rounded-xl border shadow-2xs ${
              hasTriangulation
                ? 'bg-violet-50/80 border-violet-200'
                : 'bg-white border-zinc-200/80'
            }`}
          >
            <div className="flex items-center justify-between">
              <span
                className={`text-[10px] font-bold uppercase tracking-wider ${
                  hasTriangulation ? 'text-violet-700' : 'text-zinc-500'
                }`}
              >
                Triangulaciones
              </span>
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  hasTriangulation ? 'bg-violet-600' : 'bg-zinc-300'
                }`}
              />
            </div>
            <span
              className={`text-sm sm:text-base font-black block mt-1 ${
                hasTriangulation
                  ? triangulationDiff < 0
                    ? 'text-violet-900'
                    : 'text-indigo-900'
                  : 'text-zinc-400'
              }`}
            >
              {hasTriangulation
                ? `${triangulationDiff > 0 ? '+' : '-'}${formatCurrency(
                    Math.abs(triangulationDiff),
                    currency
                  )}`
                : formatCurrency(0, currency)}
            </span>
          </div>

          {/* Saldo final (Destacado) */}
          <div className="bg-zinc-900 text-white p-3 rounded-xl shadow-xs border border-zinc-900">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-400">
                Saldo final
              </span>
              <span className="text-[10px] font-black text-zinc-400">=</span>
            </div>
            <span className="text-base sm:text-lg font-black text-emerald-400 block mt-0.5">
              ={formatCurrency(finalAmount, currency)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------
// 2. GASTOS QUE GENERAN LA DEUDA: Fila individual de gasto
// ----------------------------------------------------------------------
function DebtExpenseRow({
  expense,
  relevantAmount,
  originalAmount,
  paidAmount,
  isPartiallyPaid,
  debtorProfile,
  creditorProfile,
  currentProfile,
  groupName,
  currency = 'COP',
  profiles,
  onOpenReceipt,
}: {
  expense: Expense;
  relevantAmount: number;
  originalAmount?: number;
  paidAmount?: number;
  isPartiallyPaid?: boolean;
  debtorProfile: Profile;
  creditorProfile: Profile;
  currentProfile: Profile | null;
  groupName?: string;
  currency?: string;
  profiles: Profile[];
  onOpenReceipt: (url: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  const catConfig = getCategoryConfig(expense.category);
  const CategoryIcon = catConfig.icon;
  const dateParsed = parseExpenseDate(expense.expense_date || expense.created_at);

  const paidByProfile = profiles.find((p) => p.id === expense.paid_by);
  const payerName = paidByProfile?.full_name || creditorProfile.full_name || 'Usuario';
  const debtorName = debtorProfile.full_name || 'Deudor';

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

  // Participant profiles for avatars list
  const splitProfiles = useMemo(() => {
    return (expense.splits || [])
      .map((s) => profiles.find((p) => p.id === s.user_id))
      .filter((p): p is Profile => Boolean(p));
  }, [expense.splits, profiles]);

  return (
    <div
      className={`bg-white rounded-2xl border transition-all overflow-hidden ${
        isExpanded
          ? 'border-indigo-300 ring-2 ring-indigo-500/10 shadow-xs'
          : 'border-zinc-200/80 shadow-2xs hover:border-zinc-300'
      }`}
    >
      {/* Unexpanded Main Row */}
      <div
        className={`p-3.5 sm:p-4 flex items-center justify-between gap-3 min-w-0 cursor-pointer select-none transition-colors ${
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
        <div className="flex items-center space-x-3 min-w-0 flex-1">
          {/* Date Badge */}
          <div className="w-10 h-10 rounded-xl bg-zinc-100 border border-zinc-200/90 text-zinc-900 flex flex-col items-center justify-center shrink-0 text-center shadow-2xs">
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

          {/* Description, Payer, Participants */}
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center space-x-1.5 flex-wrap">
              {groupName && (
                <span className="inline-flex items-center text-[10px] font-extrabold bg-zinc-100 text-zinc-800 px-2 py-0.5 rounded-md border border-zinc-200 shrink-0">
                  {groupName}
                </span>
              )}
              <h4 className="font-extrabold text-zinc-900 text-xs sm:text-sm truncate">
                {expense.description}
              </h4>
            </div>

            <div className="flex items-center space-x-2 text-[11px] text-zinc-500 font-medium flex-wrap gap-y-1">
              <span>
                Pagó <strong className="text-zinc-700 font-semibold">{payerName}</strong>
              </span>
              <span className="text-zinc-300">•</span>
              <span>
                Total: <strong className="text-zinc-800">{formatCurrency(expense.total_amount, currency)}</strong>
              </span>

              {/* Mini participant avatars */}
              {splitProfiles.length > 0 && (
                <>
                  <span className="text-zinc-300">•</span>
                  <div className="flex items-center -space-x-1 shrink-0">
                    {splitProfiles.slice(0, 4).map((p, pIdx) => (
                      <UserAvatar key={p.id || pIdx} profile={p} size="xs" />
                    ))}
                    {splitProfiles.length > 4 && (
                      <span className="text-[9px] font-bold text-zinc-500 pl-1">
                        +{splitProfiles.length - 4}
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right side: Debtor's share & Effect on this debt (+ $X) */}
        <div className="flex items-center gap-2.5 sm:gap-3.5 shrink-0 text-right">
          <div>
            <span className="text-xs sm:text-sm font-black text-rose-600 block leading-tight">
              +{formatCurrency(relevantAmount, currency)}
            </span>
            <span className="text-[10px] text-zinc-500 font-medium block leading-tight mt-0.5">
              Parte de {debtorName}
            </span>
            {isPartiallyPaid && paidAmount && paidAmount > 0.009 ? (
              <span className="text-[9px] text-zinc-400 font-normal block">
                Abono {formatCurrency(paidAmount, currency)}
              </span>
            ) : null}
          </div>

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

      {/* Expanded Breakdown */}
      {isExpanded && (
        <div className="bg-zinc-50/50 p-3.5 sm:p-4 space-y-3">
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
                          Comprobante
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

          {/* Footer Metadata */}
          <div className="pt-2 border-t border-zinc-200/70 text-[11px] text-zinc-500 flex items-center space-x-2 flex-wrap bg-white/70 p-2.5 rounded-xl">
            <Calendar className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
            <span>
              Fecha del gasto:{' '}
              <strong className="font-semibold text-zinc-700">
                {formatHumanDate(eventInfo.dateObj, { includeTime: Boolean(expense.expense_time) })}
              </strong>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------
// 3. GASTOS QUE GENERAN RECUPERACIÓN: Fila individual de gasto pagado por el deudor
// ----------------------------------------------------------------------
function RecoveryExpenseRow({
  expense,
  relevantAmount,
  debtorProfile,
  creditorProfile,
  currentProfile,
  groupName,
  currency = 'COP',
  profiles,
  onOpenReceipt,
}: {
  expense: Expense;
  relevantAmount: number;
  debtorProfile: Profile;
  creditorProfile: Profile;
  currentProfile: Profile | null;
  groupName?: string;
  currency?: string;
  profiles: Profile[];
  onOpenReceipt: (url: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  const catConfig = getCategoryConfig(expense.category);
  const CategoryIcon = catConfig.icon;
  const dateParsed = parseExpenseDate(expense.expense_date || expense.created_at);

  const debtorName = debtorProfile.full_name || 'Deudor';

  // Extract individual debts from splits (excluding debtor/payer)
  const pendingDebtorSplits = useMemo(() => {
    return (expense.splits || [])
      .filter((s) => s.user_id !== expense.paid_by && s.amount_owed > 0)
      .map((s) => {
        const profile = profiles.find((p) => p.id === s.user_id);
        return {
          userId: s.user_id,
          profile,
          name: profile?.full_name || 'Integrante',
          amount: s.amount_owed,
        };
      });
  }, [expense.splits, expense.paid_by, profiles]);

  // Participant summary for expanded view
  const participantSummaryList: ParticipantSummaryData[] = useMemo(() => {
    return (expense.splits || []).map((split) => {
      const profile = profiles.find((p) => p.id === split.user_id);
      return {
        userId: split.user_id,
        profile,
        amount: split.amount_owed,
      };
    });
  }, [expense.splits, profiles]);

  return (
    <div
      className={`bg-white rounded-2xl border transition-all overflow-hidden ${
        isExpanded
          ? 'border-emerald-300 ring-2 ring-emerald-500/10 shadow-xs'
          : 'border-zinc-200/80 shadow-2xs hover:border-zinc-300'
      }`}
    >
      {/* Main Row */}
      <div
        className={`p-3.5 sm:p-4 flex items-center justify-between gap-3 min-w-0 cursor-pointer select-none transition-colors ${
          isExpanded ? 'bg-emerald-50/40 border-b border-emerald-100' : 'hover:bg-zinc-50/70'
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
        <div className="flex items-center space-x-3 min-w-0 flex-1">
          {/* Date Badge */}
          <div className="w-10 h-10 rounded-xl bg-zinc-100 border border-zinc-200/90 text-zinc-900 flex flex-col items-center justify-center shrink-0 text-center shadow-2xs">
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

          {/* Expense title, payer and individual debtors */}
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center space-x-1.5 flex-wrap">
              {groupName && (
                <span className="inline-flex items-center text-[10px] font-extrabold bg-zinc-100 text-zinc-800 px-2 py-0.5 rounded-md border border-zinc-200 shrink-0">
                  {groupName}
                </span>
              )}
              <h4 className="font-extrabold text-zinc-900 text-xs sm:text-sm truncate">
                {expense.description}
              </h4>
            </div>

            <div className="text-[11px] text-zinc-500 font-medium">
              Pagó <strong className="text-zinc-700 font-semibold">{debtorName}</strong> • Total:{' '}
              <strong className="text-zinc-800">{formatCurrency(expense.total_amount, currency)}</strong>
            </div>

            {/* Individual debtors list: [Avatar] Integrante debe $X */}
            {pendingDebtorSplits.length > 0 && (
              <div className="flex items-center space-x-2 flex-wrap gap-y-1 pt-0.5">
                {pendingDebtorSplits.map((splitItem) => (
                  <span
                    key={splitItem.userId}
                    className="inline-flex items-center space-x-1.5 bg-zinc-100/90 text-zinc-800 px-2 py-0.5 rounded-lg border border-zinc-200 text-[10.5px] font-medium shadow-2xs"
                  >
                    <UserAvatar profile={splitItem.profile} size="xs" />
                    <span>{splitItem.name}:</span>
                    <strong className="text-zinc-900 font-bold">
                      {formatCurrency(splitItem.amount, currency)}
                    </strong>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right side: Amount to recover (-$X) */}
        <div className="flex items-center gap-2.5 sm:gap-3.5 shrink-0 text-right">
          <div>
            <span className="text-xs sm:text-sm font-black text-emerald-700 block leading-tight">
              -{formatCurrency(relevantAmount, currency)}
            </span>
            <span className="text-[10px] text-emerald-700 font-semibold block leading-tight mt-0.5">
              {debtorName} recupera
            </span>
          </div>

          <div
            className={`p-1.5 rounded-xl border transition-all ${
              isExpanded
                ? 'bg-emerald-100 border-emerald-200 text-emerald-800'
                : 'bg-zinc-100/80 border-zinc-200/80 text-zinc-500'
            }`}
          >
            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </div>
        </div>
      </div>

      {/* Expanded Breakdown */}
      {isExpanded && (
        <div className="bg-zinc-50/50 p-3.5 sm:p-4 space-y-3">
          <ExpenseParticipantSummary
            participants={participantSummaryList}
            currency={currency}
            currentUserId={currentProfile?.id}
            title="Desglose por participantes"
            defaultExpanded={true}
          />
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------
// 4 & 5. TRIANGULACIONES APLICADAS Y DETALLE INTERNO
// ----------------------------------------------------------------------
function TriangulationCard({
  triangulation,
  debtor,
  creditor,
  currency = 'COP',
  onOpenReceipt,
}: {
  triangulation: ThirdPartyTriangulation;
  debtor: Profile;
  creditor: Profile;
  currency?: string;
  onOpenReceipt: (url: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  const tp = triangulation.thirdParty;
  const tpName = triangulation.thirdPartyName || tp.full_name || 'Tercero';
  const debtorName = debtor.full_name || 'Deudor';
  const creditorName = creditor.full_name || 'Acreedor';

  const expenses = triangulation.expenses || [];
  const isDiscount = triangulation.isDiscount;

  return (
    <div
      id={`triangulation-card-${tp.id}`}
      className="bg-white rounded-2xl border border-violet-200/90 shadow-2xs overflow-hidden transition-all"
    >
      {/* Triangulation Card Header */}
      <div className="p-4 sm:p-5 space-y-3 bg-gradient-to-br from-violet-50/40 via-white to-white">
        <div className="flex items-start justify-between gap-3 flex-wrap sm:flex-nowrap">
          {/* Third party profile & badge */}
          <div className="flex items-center space-x-3 min-w-0">
            <UserAvatar profile={tp} size="lg" ringColor="ring-violet-200" />
            <div className="min-w-0 space-y-0.5">
              <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                <span className="inline-flex items-center text-[10px] font-black uppercase tracking-wider bg-violet-100 text-violet-900 px-2.5 py-0.5 rounded-full border border-violet-200">
                  {isDiscount ? 'Compensación aplicada' : 'Consolidación de deuda'}
                </span>
                <span className="text-[11px] font-bold text-zinc-500">
                  {expenses.length} {expenses.length === 1 ? 'gasto vinculado' : 'gastos vinculados'}
                </span>
              </div>
              <h4 className="text-sm sm:text-base font-extrabold text-zinc-900 truncate">
                {tpName}
              </h4>
            </div>
          </div>

          {/* Amount */}
          <div className="text-left sm:text-right shrink-0">
            <span className="text-[10px] font-black uppercase tracking-wider text-violet-700 block">
              {isDiscount ? 'Descuento compensado' : 'Consolidado'}
            </span>
            <span className="text-base sm:text-lg font-black text-violet-950 block">
              {isDiscount ? '-' : '+'}{formatCurrency(triangulation.amount, currency)}
            </span>
          </div>
        </div>

        {/* Visual Flow Diagram: [Wiz] ─── $42.146 ───> [Luis] ───> [Mari] */}
        <div className="bg-zinc-50/90 rounded-xl p-3 border border-zinc-200/80">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 text-xs">
            {/* Step 1: Debtor */}
            <div className="flex items-center space-x-2 bg-white px-2.5 py-1.5 rounded-lg border border-zinc-200 shadow-2xs shrink-0">
              <UserAvatar profile={debtor} size="xs" />
              <span className="font-bold text-zinc-900">{debtorName}</span>
            </div>

            {/* Connecting Arrow with Amount */}
            <div className="flex-1 flex items-center justify-center space-x-1.5 w-full">
              <div className="h-[1px] bg-violet-200 flex-1" />
              <span className="bg-violet-600 text-white font-extrabold text-[10.5px] px-2.5 py-0.5 rounded-full shadow-2xs whitespace-nowrap">
                {formatCurrency(triangulation.amount, currency)}
              </span>
              <ArrowRight className="w-3.5 h-3.5 text-violet-500 shrink-0" />
              <div className="h-[1px] bg-violet-200 flex-1" />
            </div>

            {/* Step 2: Third Party */}
            <div className="flex items-center space-x-2 bg-violet-100/80 px-2.5 py-1.5 rounded-lg border border-violet-200 shadow-2xs shrink-0">
              <UserAvatar profile={tp} size="xs" ringColor="ring-violet-300" />
              <span className="font-extrabold text-violet-950">{tpName}</span>
            </div>

            {/* Connecting Arrow 2 */}
            <div className="flex items-center space-x-1 shrink-0 text-violet-400">
              <div className="w-4 h-[1px] bg-violet-200 hidden sm:block" />
              <ArrowRight className="w-3.5 h-3.5" />
            </div>

            {/* Step 3: Creditor */}
            <div className="flex items-center space-x-2 bg-white px-2.5 py-1.5 rounded-lg border border-zinc-200 shadow-2xs shrink-0">
              <UserAvatar profile={creditor} size="xs" />
              <span className="font-bold text-zinc-900">{creditorName}</span>
            </div>
          </div>

          <div className="pt-2 text-center sm:text-left">
            <span className="text-[11px] font-medium text-zinc-500">
              {isDiscount ? 'Reduce la transferencia directa' : 'Consolida transferencias del grupo'}
            </span>
          </div>
        </div>

        {/* Toggle Expand Trigger */}
        <div className="pt-1 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-xs font-bold text-violet-700 hover:text-violet-900 inline-flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <span>
              {isExpanded
                ? `Ocultar ${expenses.length} gastos vinculados`
                : `Ver ${expenses.length} gastos vinculados →`}
            </span>
            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Internal Detail of the Triangulation */}
      {isExpanded && (
        <div className="border-t border-violet-200/70 bg-zinc-50/70 p-3.5 sm:p-4 space-y-3">
          <div className="text-xs font-bold text-zinc-700 uppercase tracking-wider">
            Gastos que producen esta compensación
          </div>

          <div className="space-y-2">
            {expenses.map((expItem, idx) => {
              const catConfig = getCategoryConfig(expItem.expense.category);
              const CategoryIcon = catConfig.icon;
              const dateParsed = parseExpenseDate(expItem.date);

              return (
                <div
                  key={expItem.expense.id + idx}
                  className="bg-white rounded-xl border border-zinc-200/80 p-3 shadow-2xs space-y-2"
                >
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="flex items-center space-x-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-zinc-100 border border-zinc-200 text-zinc-900 flex flex-col items-center justify-center shrink-0 text-center">
                        <span className="text-[7.5px] font-black uppercase text-zinc-500 leading-none">
                          {dateParsed.monthAbbr}
                        </span>
                        <span className="text-xs font-black leading-none mt-0.5">
                          {dateParsed.dayStr}
                        </span>
                      </div>

                      <div className="min-w-0 space-y-0.5">
                        <div className="flex items-center space-x-1.5">
                          {expItem.groupName && (
                            <span className="text-[9.5px] font-bold bg-zinc-100 text-zinc-700 px-1.5 py-0.2 rounded border border-zinc-200">
                              {expItem.groupName}
                            </span>
                          )}
                          <span className="text-xs font-extrabold text-zinc-900 truncate">
                            {expItem.description}
                          </span>
                        </div>
                        <div className="text-[11px] text-zinc-500 font-medium flex items-center space-x-2 flex-wrap gap-y-0.5">
                          <span>
                            Pagó <strong className="text-zinc-800">{expItem.payerName}</strong>
                          </span>
                          <span className="text-zinc-300">•</span>
                          <span>
                            Consume <strong className="text-zinc-800">{expItem.participantName}</strong>
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Receipt thumbnail if available */}
                    {expItem.receiptUrl && (
                      <button
                        type="button"
                        onClick={() => onOpenReceipt(expItem.receiptUrl!)}
                        className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 shrink-0 bg-indigo-50 px-2 py-1 rounded-md border border-indigo-100 cursor-pointer"
                      >
                        <ImageIcon className="w-3 h-3" />
                        <span>Ver recibo</span>
                      </button>
                    )}
                  </div>

                  {/* Financial Columns: Total, Cuota, Aporte a la compensación */}
                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-zinc-100 text-center">
                    <div className="bg-zinc-50 rounded-lg p-1.5 border border-zinc-200/60">
                      <span className="text-[9.5px] font-bold uppercase text-zinc-400 block">
                        Total
                      </span>
                      <span className="text-xs font-bold text-zinc-800 block">
                        {formatCurrency(expItem.totalExpenseAmount, currency)}
                      </span>
                    </div>

                    <div className="bg-zinc-50 rounded-lg p-1.5 border border-zinc-200/60">
                      <span className="text-[9.5px] font-bold uppercase text-zinc-400 block">
                        Cuota
                      </span>
                      <span className="text-xs font-bold text-zinc-800 block">
                        {formatCurrency(expItem.originalDebtAmount, currency)}
                      </span>
                    </div>

                    {/* Aporte a compensación (SOLO EN ESTE CONTEXTO) */}
                    <div className="bg-violet-50 rounded-lg p-1.5 border border-violet-200">
                      <span className="text-[9.5px] font-black uppercase text-violet-700 block">
                        Aporte a compensación
                      </span>
                      <span className="text-xs font-black text-violet-950 block">
                        {formatCurrency(expItem.allocatedDiscountAmount, currency)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* End of triangulation card: Total compensado */}
          <div className="p-3 bg-violet-100/70 rounded-xl border border-violet-200 flex items-center justify-between font-black text-xs text-violet-950">
            <span>Total compensado con {tpName}</span>
            <span className="text-sm">
              {isDiscount ? '-' : '+'}{formatCurrency(triangulation.amount, currency)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------
// 6. CÁLCULO FINAL: ECUACIÓN DIRECTA Y VISUAL
// ----------------------------------------------------------------------
function FinalCalculationSection({
  debtAmount,
  recoveryAmount,
  paymentsApplied,
  triangulationDiff,
  finalAmount,
  currency = 'COP',
  isSimplified,
}: {
  debtAmount: number;
  recoveryAmount: number;
  paymentsApplied: number;
  triangulationDiff: number;
  finalAmount: number;
  currency?: string;
  isSimplified: boolean;
}) {
  const hasTriangulation = isSimplified && Math.abs(triangulationDiff) > 0.01;

  return (
    <div
      id="settlement-final-calculation"
      className="bg-white rounded-2xl p-4 sm:p-5 border border-zinc-200/90 shadow-2xs space-y-3.5"
    >
      <div className="flex items-center justify-between border-b border-zinc-100 pb-2.5">
        <div className="flex items-center space-x-2">
          <div className="w-7 h-7 rounded-xl bg-zinc-900 text-white flex items-center justify-center">
            <Calculator className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs sm:text-sm font-black text-zinc-900 uppercase tracking-wider">
              Cálculo final del saldo
            </h4>
            <p className="text-[11px] text-zinc-500 font-medium">
              Ecuación exacta paso a paso
            </p>
          </div>
        </div>

        <span className="text-[10.5px] font-bold text-zinc-400 bg-zinc-100 px-2 py-0.5 rounded-full border border-zinc-200">
          {isSimplified ? 'Modo Simplificado' : 'Modo Directo'}
        </span>
      </div>

      {/* Arithmetic steps */}
      <div className="space-y-2 text-xs">
        {/* Step 1: Deuda generada */}
        <div className="flex items-center justify-between py-1.5 border-b border-zinc-100">
          <span className="text-zinc-600 font-medium">Deuda generada</span>
          <strong className="text-rose-600 font-black text-xs sm:text-sm">
            +{formatCurrency(debtAmount, currency)}
          </strong>
        </div>

        {/* Step 2: Abonos directos si existen */}
        {paymentsApplied > 0 && (
          <div className="flex items-center justify-between py-1.5 border-b border-zinc-100">
            <span className="text-zinc-600 font-medium">Abonos y transferencias directas</span>
            <strong className="text-emerald-700 font-black text-xs sm:text-sm">
              -{formatCurrency(paymentsApplied, currency)}
            </strong>
          </div>
        )}

        {/* Step 3: Recuperaciones */}
        {recoveryAmount > 0 && (
          <div className="flex items-center justify-between py-1.5 border-b border-zinc-100">
            <span className="text-zinc-600 font-medium">Recuperaciones</span>
            <strong className="text-emerald-700 font-black text-xs sm:text-sm">
              -{formatCurrency(recoveryAmount, currency)}
            </strong>
          </div>
        )}

        {/* Step 4: Triangulaciones */}
        {hasTriangulation && (
          <div className="flex items-center justify-between py-1.5 bg-violet-50/80 px-3 rounded-xl border border-violet-200 font-bold text-violet-950">
            <span className="text-violet-800 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-violet-600" />
              <span>Triangulaciones aplicadas</span>
            </span>
            <span className="text-violet-900 font-black text-xs sm:text-sm">
              {triangulationDiff < 0 ? '-' : '+'}
              {formatCurrency(Math.abs(triangulationDiff), currency)}
            </span>
          </div>
        )}

        {/* Step 5: Saldo final / Saldo a liquidar */}
        <div className="flex items-center justify-between py-3 bg-zinc-900 text-white px-4 rounded-xl font-black text-sm shadow-xs mt-2">
          <span className="uppercase tracking-wide text-xs sm:text-sm">Saldo a liquidar</span>
          <span className="text-base sm:text-lg text-emerald-400">
            {formatCurrency(finalAmount, currency)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------
// MAIN COMPONENT: PairwiseSettlementView
// ----------------------------------------------------------------------
export function PairwiseSettlementView({
  debtor,
  creditor,
  currentProfile,
  debtDetail,
  finalAmount,
  isSimplified,
  currency = 'COP',
  groupName,
  profiles,
  onOpenReceipt,
  onOpenSettleModal,
  groupId,
}: PairwiseSettlementViewProps) {
  const debtorName = debtor.full_name || 'Deudor';
  const creditorName = creditor.full_name || 'Acreedor';

  const debtAmount = debtDetail.totalOriginalDebt;
  const paymentsApplied = debtDetail.totalPaymentsApplied;
  const recoveryAmount = debtDetail.totalReverseOffsets;
  const directBalance = debtDetail.netDirectBalance;
  const triangulationDiff = isSimplified ? finalAmount - directBalance : 0;

  const pendingDebtExpenses = debtDetail.pendingExpenses || [];
  const reverseRecoveryExpenses = debtDetail.reverseOffsetExpenses || [];
  const appliedPaymentsList = debtDetail.appliedPayments || [];
  const triangulationsList = debtDetail.optimizationDetail?.triangulations || [];

  return (
    <div className="space-y-6 pt-1">
      {/* 1. RESUMEN SUPERIOR */}
      <TopSummaryCard
        debtor={debtor}
        creditor={creditor}
        debtAmount={debtAmount}
        recoveryAmount={recoveryAmount + paymentsApplied}
        triangulationDiff={triangulationDiff}
        finalAmount={finalAmount}
        currency={currency}
        isSimplified={isSimplified}
      />

      {/* 2. GASTOS QUE GENERAN LA DEUDA */}
      <div id="section-debt-expenses" className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="text-xs sm:text-sm font-black text-zinc-900 uppercase tracking-wider">
              Gastos que generan la deuda
            </h3>
            <p className="text-[11px] text-zinc-500 font-medium">
              Pagados por {creditorName}
            </p>
          </div>

          <span className="text-xs font-black text-rose-600 bg-rose-50 px-2.5 py-1 rounded-xl border border-rose-200">
            +{formatCurrency(debtAmount, currency)}
          </span>
        </div>

        {pendingDebtExpenses.length === 0 ? (
          <div className="p-4 bg-white rounded-2xl border border-zinc-200/80 text-center text-xs text-zinc-500 font-medium">
            No hay consumos pendientes de {debtorName} pagados por {creditorName}.
          </div>
        ) : (
          <div className="space-y-2">
            {pendingDebtExpenses.map((item, idx) => (
              <DebtExpenseRow
                key={item.expense.id + idx}
                expense={item.expense}
                relevantAmount={item.pendingAmount}
                originalAmount={item.originalAmount}
                paidAmount={item.paidAmount}
                isPartiallyPaid={item.isPartiallyPaid}
                debtorProfile={debtor}
                creditorProfile={creditor}
                currentProfile={currentProfile}
                groupName={item.groupName || groupName}
                currency={item.currency || currency}
                profiles={profiles}
                onOpenReceipt={onOpenReceipt}
              />
            ))}
          </div>
        )}

        {/* Abonos directos si aplican */}
        {appliedPaymentsList.length > 0 && (
          <div className="pt-2 space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-zinc-700">
              <span>Abonos directos de deuda</span>
              <span className="text-emerald-700 font-black">
                -{formatCurrency(paymentsApplied, currency)}
              </span>
            </div>

            <div className="divide-y divide-zinc-100 rounded-xl border border-zinc-200/80 bg-white overflow-hidden shadow-2xs">
              {appliedPaymentsList.map((payItem, pIdx) => (
                <div
                  key={payItem.payment.id || pIdx}
                  className="p-3 flex items-center justify-between text-xs hover:bg-zinc-50/80 transition-colors gap-3"
                >
                  <div className="flex items-center space-x-2.5 min-w-0">
                    <div className="w-6 h-6 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold text-xs shrink-0 border border-emerald-200/80">
                      ✓
                    </div>
                    <div className="min-w-0">
                      <span className="font-extrabold text-zinc-900 truncate block">
                        Transferencia {payItem.payment.note ? `• ${payItem.payment.note}` : ''}
                      </span>
                      <span className="text-[10.5px] text-zinc-500 font-medium block">
                        Fecha: {payItem.payment.payment_date}
                      </span>
                    </div>
                  </div>
                  <span className="font-black text-emerald-700 text-xs sm:text-sm shrink-0">
                    -{formatCurrency(payItem.amountApplied, currency)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Total generado por estos gastos */}
        <div className="p-3 bg-rose-50/70 rounded-xl border border-rose-200/80 flex items-center justify-between font-black text-xs text-rose-900">
          <span>Total generado por estos gastos</span>
          <span className="text-sm sm:text-base">+{formatCurrency(debtAmount, currency)}</span>
        </div>
      </div>

      {/* 3. GASTOS QUE GENERAN RECUPERACIÓN */}
      <div id="section-recovery-expenses" className="space-y-3 pt-1">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="text-xs sm:text-sm font-black text-zinc-900 uppercase tracking-wider">
              Gastos pagados por {debtorName}
            </h3>
            <p className="text-[11px] text-zinc-500 font-medium">
              Importes que otros integrantes deben recuperar
            </p>
          </div>

          <span className="text-xs font-black text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-xl border border-emerald-200">
            -{formatCurrency(recoveryAmount, currency)}
          </span>
        </div>

        {reverseRecoveryExpenses.length === 0 ? (
          <div className="p-4 bg-white rounded-2xl border border-zinc-200/80 text-center text-xs text-zinc-500 font-medium">
            No hay gastos pagados por {debtorName} que reduzcan esta deuda directa.
          </div>
        ) : (
          <div className="space-y-2">
            {reverseRecoveryExpenses.map((revItem, revIdx) => (
              <RecoveryExpenseRow
                key={revItem.expense.id + revIdx}
                expense={revItem.expense}
                relevantAmount={revItem.amount}
                debtorProfile={debtor}
                creditorProfile={creditor}
                currentProfile={currentProfile}
                groupName={revItem.groupName || groupName}
                currency={currency}
                profiles={profiles}
                onOpenReceipt={onOpenReceipt}
              />
            ))}
          </div>
        )}

        {/* Total a recuperar */}
        <div className="p-3 bg-emerald-50/70 rounded-xl border border-emerald-200/80 flex items-center justify-between font-black text-xs text-emerald-900">
          <span>Total a recuperar</span>
          <span className="text-sm sm:text-base">-{formatCurrency(recoveryAmount, currency)}</span>
        </div>
      </div>

      {/* 4 & 5. TRIANGULACIONES APLICADAS (SI EXISTEN) */}
      {isSimplified && triangulationsList.length > 0 && Math.abs(triangulationDiff) > 0.01 && (
        <div id="section-triangulations" className="space-y-3 pt-1">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 className="text-xs sm:text-sm font-black text-zinc-900 uppercase tracking-wider">
                Triangulaciones aplicadas
              </h3>
              <p className="text-[11px] text-zinc-500 font-medium">
                Compensaciones entre integrantes
              </p>
            </div>

            <span className="text-xs font-black text-violet-900 bg-violet-100 px-2.5 py-1 rounded-xl border border-violet-200">
              {triangulationDiff < 0 ? '-' : '+'}
              {formatCurrency(Math.abs(triangulationDiff), currency)}
            </span>
          </div>

          <div className="space-y-3">
            {triangulationsList.map((t) => (
              <TriangulationCard
                key={t.thirdParty.id}
                triangulation={t}
                debtor={debtor}
                creditor={creditor}
                currency={currency}
                onOpenReceipt={onOpenReceipt}
              />
            ))}
          </div>
        </div>
      )}

      {/* 6. CÁLCULO FINAL */}
      <FinalCalculationSection
        debtAmount={debtAmount}
        recoveryAmount={recoveryAmount}
        paymentsApplied={paymentsApplied}
        triangulationDiff={triangulationDiff}
        finalAmount={finalAmount}
        currency={currency}
        isSimplified={isSimplified}
      />
    </div>
  );
}
