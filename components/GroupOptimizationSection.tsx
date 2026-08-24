'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import {
  Profile,
  Expense,
} from '@/lib/types';
import {
  GroupOptimizationDetail,
  ThirdPartyTriangulation,
  formatCurrency,
} from '@/lib/balance-utils';
import { getCategoryConfig } from '@/lib/expense-category-utils';
import {
  Sparkles,
  ArrowRight,
  Receipt,
  ChevronDown,
  ChevronUp,
  Info,
  CheckCircle2,
  Calendar,
  Layers,
  ArrowLeftRight,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';

interface GroupOptimizationSectionProps {
  optimizationDetail?: GroupOptimizationDetail;
  simplifiedDiff: number;
  debtorProfile: Profile;
  creditorProfile: Profile;
  directBalance: number;
  currency?: string;
  onOpenReceipt: (url: string) => void;
}

export function GroupOptimizationSection({
  optimizationDetail,
  simplifiedDiff,
  debtorProfile,
  creditorProfile,
  directBalance,
  currency = 'COP',
  onOpenReceipt,
}: GroupOptimizationSectionProps) {
  const [showFlowDiagram, setShowFlowDiagram] = useState(true);
  const [expandedThirdPartyIds, setExpandedThirdPartyIds] = useState<Set<string>>(
    new Set(optimizationDetail?.triangulations.map((t) => t.thirdParty.id) || [])
  );

  const debtorName = debtorProfile.full_name || 'Deudor';
  const creditorName = creditorProfile.full_name || 'Acreedor';
  const isDiscount = simplifiedDiff < 0;
  const totalAdjustment = Math.abs(simplifiedDiff);
  const finalSimplifiedAmount = Math.max(0, directBalance + simplifiedDiff);

  const toggleThirdParty = (tpId: string) => {
    setExpandedThirdPartyIds((prev) => {
      const next = new Set(prev);
      if (next.has(tpId)) {
        next.delete(tpId);
      } else {
        next.add(tpId);
      }
      return next;
    });
  };

  const triangulations = optimizationDetail?.triangulations || [];

  return (
    <div className="space-y-4 pt-1">
      {/* Header with Title & Badge */}
      <div className="flex items-center justify-between flex-wrap gap-2.5">
        <div className="flex items-center space-x-2">
          <div className="w-7 h-7 rounded-xl bg-violet-600/10 text-violet-600 flex items-center justify-center border border-violet-200">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs sm:text-sm font-black text-zinc-900 uppercase tracking-wider">
              Ajuste por optimización grupal
            </h4>
            <p className="text-[11px] text-zinc-500 font-medium">
              Simplificación y triangulación de saldos del grupo
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <span
            className={`text-xs sm:text-sm font-black px-3 py-1 rounded-xl border flex items-center gap-1 ${
              isDiscount
                ? 'bg-violet-50 text-violet-900 border-violet-200'
                : 'bg-indigo-50 text-indigo-900 border-indigo-200'
            }`}
          >
            {isDiscount ? <TrendingDown className="w-3.5 h-3.5 text-violet-600" /> : <TrendingUp className="w-3.5 h-3.5 text-indigo-600" />}
            <span>
              {simplifiedDiff > 0 ? '+' : '-'} {formatCurrency(totalAdjustment, currency)}
            </span>
          </span>
        </div>
      </div>

      {/* Main Narrative Card */}
      <div className="bg-gradient-to-br from-violet-50/90 via-purple-50/50 to-white border border-violet-200/90 rounded-2xl p-4 sm:p-5 shadow-2xs space-y-3.5 text-xs text-violet-950">
        <div className="flex items-start gap-2.5">
          <Info className="w-4 h-4 text-violet-600 shrink-0 mt-0.5" />
          <div className="space-y-1.5 leading-relaxed">
            <p>
              La cuenta directa 1 a 1 entre <strong>{debtorName}</strong> y <strong>{creditorName}</strong> es de{' '}
              <strong className="text-zinc-900 font-bold">{formatCurrency(directBalance, currency)}</strong>.
            </p>
            <p className="text-zinc-700">
              {isDiscount ? (
                <>
                  Para evitar transferencias circulares y que el dinero dé vueltas en el grupo, se descuentan{' '}
                  <strong className="text-violet-950 font-black">-{formatCurrency(totalAdjustment, currency)}</strong> de
                  este pago porque se compensan directamente con{' '}
                  <strong>
                    {triangulations.length === 1
                      ? triangulations[0].thirdPartyName
                      : `${triangulations.length} integrantes del grupo`}
                  </strong>
                  .
                </>
              ) : (
                <>
                  Para unificar transferencias del grupo en un solo pago, se consolidan{' '}
                  <strong className="text-indigo-950 font-black">+{formatCurrency(totalAdjustment, currency)}</strong> en
                  esta transferencia, cubriendo deudas de otros integrantes hacia {creditorName}.
                </>
              )}
            </p>
          </div>
        </div>

        {/* Step-by-step arithmetic equation */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 border-t border-violet-200/60 text-center">
          <div className="bg-white/80 border border-violet-100 rounded-xl p-2.5">
            <span className="text-[10px] font-bold uppercase text-zinc-400 block tracking-wider">
              Cuenta Directa 1 a 1
            </span>
            <span className="text-xs sm:text-sm font-extrabold text-zinc-900 block mt-0.5">
              +{formatCurrency(directBalance, currency)}
            </span>
          </div>

          <div className="bg-violet-100/70 border border-violet-200 rounded-xl p-2.5">
            <span className="text-[10px] font-bold uppercase text-violet-700 block tracking-wider">
              {isDiscount ? 'Descuento Triangulado' : 'Consolidación Grupal'}
            </span>
            <span className="text-xs sm:text-sm font-black text-violet-950 block mt-0.5">
              {isDiscount ? '-' : '+'}
              {formatCurrency(totalAdjustment, currency)}
            </span>
          </div>

          <div className="bg-zinc-900 text-white rounded-xl p-2.5 shadow-xs">
            <span className="text-[10px] font-bold uppercase text-emerald-300 block tracking-wider">
              Transferencia Final
            </span>
            <span className="text-xs sm:text-sm font-black text-white block mt-0.5">
              = {formatCurrency(finalSimplifiedAmount, currency)}
            </span>
          </div>
        </div>
      </div>

      {/* Visual Triangulation Flowchart */}
      <div className="bg-white rounded-2xl border border-zinc-200/90 p-4 shadow-2xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Layers className="w-4 h-4 text-violet-600" />
            <span className="text-xs font-black text-zinc-900 uppercase tracking-wider">
              Esquema visual de la triangulación
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowFlowDiagram((prev) => !prev)}
            className="text-[11px] font-bold text-violet-700 hover:text-violet-900 flex items-center gap-1 cursor-pointer"
          >
            <span>{showFlowDiagram ? 'Ocultar diagrama' : 'Mostrar diagrama'}</span>
            {showFlowDiagram ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>

        {showFlowDiagram && (
          <div className="pt-2">
            <div className="bg-zinc-50/80 rounded-2xl p-4 sm:p-5 border border-zinc-200/70 space-y-4">
              <div className="flex flex-col md:flex-row items-center justify-between gap-4 sm:gap-6">
                {/* Node 1: Debtor */}
                <div className="bg-white rounded-2xl p-3.5 border border-rose-200 shadow-2xs text-center w-full md:w-44 shrink-0 space-y-1.5">
                  <span className="text-[10px] font-black uppercase tracking-wider text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                    Deudor
                  </span>
                  <div className="font-extrabold text-zinc-900 text-xs sm:text-sm truncate">
                    {debtorName}
                  </div>
                  <div className="text-[11px] font-bold text-zinc-600">
                    Paga finalmente: <strong className="text-zinc-900">{formatCurrency(finalSimplifiedAmount, currency)}</strong>
                  </div>
                </div>

                {/* Center Triangulation Flow Connectors */}
                <div className="flex-1 flex flex-col items-center justify-center space-y-2 w-full">
                  {/* Direct debt label with strike-through or reduction */}
                  <div className="flex items-center space-x-2 text-xs text-zinc-500 font-medium bg-white px-3 py-1 rounded-full border border-zinc-200">
                    <span>Deuda 1 a 1 original:</span>
                    <span className="font-bold text-zinc-900 line-through">
                      {formatCurrency(directBalance, currency)}
                    </span>
                    <ArrowRight className="w-3.5 h-3.5 text-zinc-400" />
                    <span className="font-black text-emerald-700">
                      {formatCurrency(finalSimplifiedAmount, currency)}
                    </span>
                  </div>

                  {/* Triangulation Offset badge */}
                  <div className="w-full flex items-center justify-center gap-2">
                    <div className="h-[1px] bg-violet-200 flex-1" />
                    <div className="bg-violet-600 text-white px-3 py-1 rounded-full text-[11px] font-black flex items-center gap-1.5 shadow-2xs">
                      <ArrowLeftRight className="w-3 h-3 text-violet-200" />
                      <span>
                        Compensación: {isDiscount ? '-' : '+'}
                        {formatCurrency(totalAdjustment, currency)}
                      </span>
                    </div>
                    <div className="h-[1px] bg-violet-200 flex-1" />
                  </div>

                  {/* Third party avatars stack */}
                  <div className="flex items-center space-x-1.5 text-[11px] text-violet-900 font-semibold bg-violet-50 px-3 py-1 rounded-xl border border-violet-200">
                    <span>Compensado con:</span>
                    <strong className="text-violet-950 font-black">
                      {triangulations.map((t) => t.thirdPartyName).join(', ')}
                    </strong>
                  </div>
                </div>

                {/* Node 2: Creditor */}
                <div className="bg-white rounded-2xl p-3.5 border border-emerald-200 shadow-2xs text-center w-full md:w-44 shrink-0 space-y-1.5">
                  <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                    Acreedor
                  </span>
                  <div className="font-extrabold text-zinc-900 text-xs sm:text-sm truncate">
                    {creditorName}
                  </div>
                  <div className="text-[11px] font-bold text-zinc-600">
                    Recibe de {debtorName}: <strong className="text-emerald-700">{formatCurrency(finalSimplifiedAmount, currency)}</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Breakdown by Third Party with Coherent Matching Expenses */}
      {triangulations.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h5 className="text-xs font-black text-zinc-900 uppercase tracking-wider flex items-center gap-1.5">
              <Receipt className="w-3.5 h-3.5 text-violet-600" />
              <span>
                Desglose por integrante y gastos que componen el ajuste ({triangulations.length})
              </span>
            </h5>
            <span className="text-[11px] text-zinc-400 font-medium">
              Suma exacta: {isDiscount ? '-' : '+'}
              {formatCurrency(totalAdjustment, currency)}
            </span>
          </div>

          <div className="space-y-3">
            {triangulations.map((t) => {
              const isExpanded = expandedThirdPartyIds.has(t.thirdParty.id);
              const totalAllocatedInExpenses = t.expenses.reduce(
                (sum, e) => sum + e.allocatedDiscountAmount,
                0
              );

              return (
                <div
                  key={t.thirdParty.id}
                  className="bg-white rounded-2xl border border-zinc-200/90 shadow-2xs overflow-hidden transition-all"
                >
                  {/* Third party header button */}
                  <div
                    onClick={() => toggleThirdParty(t.thirdParty.id)}
                    className="p-4 flex items-center justify-between gap-3 hover:bg-zinc-50/80 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center space-x-3 min-w-0">
                      {t.thirdParty.avatar_url ? (
                        <Image
                          src={t.thirdParty.avatar_url}
                          alt={t.thirdPartyName}
                          width={36}
                          height={36}
                          className="w-9 h-9 rounded-full object-cover ring-2 ring-violet-200 shrink-0"
                          unoptimized
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-violet-100 text-violet-900 border border-violet-300 flex items-center justify-center text-xs font-bold shrink-0">
                          {t.thirdPartyName.charAt(0).toUpperCase()}
                        </div>
                      )}

                      <div className="min-w-0 space-y-0.5">
                        <div className="flex items-center space-x-2 flex-wrap">
                          <span className="font-extrabold text-zinc-900 text-xs sm:text-sm truncate">
                            {t.thirdPartyName}
                          </span>
                          <span className="text-[10px] font-bold bg-violet-100 text-violet-900 px-2 py-0.5 rounded-md border border-violet-200">
                            {t.shortSummary}
                          </span>
                        </div>
                        <p className="text-[11px] text-zinc-500 font-medium leading-snug line-clamp-1">
                          {t.explanation}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-3 shrink-0 text-right">
                      <div>
                        <span className="text-xs sm:text-sm font-black text-violet-950 block">
                          {isDiscount ? '-' : '+'}
                          {formatCurrency(t.amount, currency)}
                        </span>
                        <span className="text-[10px] text-zinc-400 font-medium block">
                          {t.expenses.length} {t.expenses.length === 1 ? 'gasto vinculado' : 'gastos vinculados'}
                        </span>
                      </div>
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-zinc-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-zinc-400" />
                      )}
                    </div>
                  </div>

                  {/* Expanded expenses list for this third party */}
                  {isExpanded && (
                    <div className="border-t border-zinc-100 bg-zinc-50/60 p-3.5 sm:p-4 space-y-3">
                      <div className="bg-white p-3 rounded-xl border border-violet-200/80 text-[11.5px] text-violet-950 leading-relaxed space-y-1">
                        <div className="font-bold flex items-center gap-1.5 text-violet-900">
                          <Info className="w-3.5 h-3.5" />
                          <span>¿Cómo se originó esta compensación?</span>
                        </div>
                        <p className="text-zinc-600">{t.explanation}</p>
                      </div>

                      {t.expenses.length === 0 ? (
                        <div className="p-3 bg-white rounded-xl border border-zinc-200 text-center text-xs text-zinc-500 font-medium">
                          No hay gastos individuales detallados para este participante.
                        </div>
                      ) : (
                        <div className="divide-y divide-zinc-200/70 rounded-xl border border-zinc-200/90 bg-white overflow-hidden shadow-2xs">
                          {t.expenses.map((expItem, expIdx) => {
                            const catConfig = getCategoryConfig(expItem.expense.category);
                            const IconComponent = catConfig.icon;

                            // Calculate percentage of this expense contributing to the discount
                            const totalAmount = expItem.totalExpenseAmount || expItem.originalDebtAmount || 1;
                            const sharePercentage = Math.min(
                              100,
                              Math.round((expItem.allocatedDiscountAmount / totalAmount) * 100)
                            );

                            return (
                              <div
                                key={expItem.expense.id + ':' + expIdx}
                                className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-zinc-50/80 transition-colors text-xs"
                              >
                                <div className="flex items-start space-x-3 min-w-0">
                                  <div
                                    className={`p-2 rounded-xl ${catConfig.bgClass} ${catConfig.textClass} shrink-0 border border-zinc-200/60 mt-0.5`}
                                  >
                                    <IconComponent className="w-3.5 h-3.5" />
                                  </div>

                                  <div className="min-w-0 space-y-1">
                                    <div className="flex items-center space-x-1.5 flex-wrap">
                                      {expItem.groupName && (
                                        <span className="text-[10px] font-bold bg-zinc-100 text-zinc-700 px-1.5 py-0.5 rounded-md border border-zinc-200">
                                          {expItem.groupName}
                                        </span>
                                      )}
                                      <span className="font-extrabold text-zinc-900 truncate">
                                        {expItem.description}
                                      </span>
                                      {expItem.receiptUrl && (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            if (expItem.receiptUrl) onOpenReceipt(expItem.receiptUrl);
                                          }}
                                          className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200 cursor-pointer"
                                        >
                                          <Receipt className="w-3 h-3" />
                                          Comprobante
                                        </button>
                                      )}
                                    </div>

                                    <div className="text-[11px] text-zinc-500 font-medium space-x-1.5">
                                      <span>
                                        Pagó <strong className="text-zinc-800">{expItem.payerName}</strong>
                                      </span>
                                      <span>•</span>
                                      <span>
                                        Consumo de <strong className="text-zinc-800">{expItem.participantName}</strong>
                                      </span>
                                      <span>•</span>
                                      <span className="inline-flex items-center gap-1 text-zinc-400">
                                        <Calendar className="w-2.5 h-2.5" />
                                        {expItem.date}
                                      </span>
                                    </div>

                                    <div className="text-[11px] text-zinc-400 font-medium">
                                      Gasto total: {formatCurrency(expItem.totalExpenseAmount, expItem.currency || currency)}
                                      {expItem.originalDebtAmount !== expItem.totalExpenseAmount && (
                                        <span> (Cuota de {expItem.participantName}: {formatCurrency(expItem.originalDebtAmount, expItem.currency || currency)})</span>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                <div className="sm:text-right shrink-0 bg-violet-50/60 sm:bg-transparent p-2 sm:p-0 rounded-lg border sm:border-0 border-violet-200/60 space-y-1">
                                  <span className="text-[10.5px] font-bold uppercase text-violet-700 block tracking-wider">
                                    Aporte al descuento
                                  </span>
                                  <span className="text-xs sm:text-sm font-black text-violet-950 block">
                                    {formatCurrency(expItem.allocatedDiscountAmount, expItem.currency || currency)}
                                  </span>
                                  {sharePercentage > 0 && sharePercentage < 100 && (
                                    <span className="text-[9.5px] font-bold text-zinc-400 block">
                                      ({sharePercentage}% del gasto)
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Subtotal validation badge */}
                      <div className="flex items-center justify-between text-xs bg-white px-3 py-2 rounded-xl border border-violet-200/80 text-violet-950 font-bold">
                        <span className="flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Total compensado con {t.thirdPartyName}:</span>
                        </span>
                        <span className="font-black text-violet-900">
                          {isDiscount ? '-' : '+'}
                          {formatCurrency(t.amount, currency)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
