/* eslint-disable react-hooks/set-state-in-effect */
'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import Image from 'next/image';
import { useExpense } from '@/lib/expense-context';
import { Expense, ExpenseItem, ExpenseSplit } from '@/lib/types';
import { formatCurrency } from '@/lib/balance-utils';
import { FormattedCurrencyInput } from '@/components/FormattedCurrencyInput';
import {
  X, Plus, Trash2, AlertCircle, Loader2,
  Check, ChevronDown, ShoppingCart, ArrowRight, ArrowLeft,
  CheckCircle2, Camera, FileText, Users, PieChart, ListChecks,
  List, Table, ChevronRight, ChevronUp
} from 'lucide-react';
import { getCategoryConfig, EXPENSE_CATEGORY_GROUPS, DEFAULT_EXPENSE_CATEGORY } from '@/lib/expense-category-utils';
import { ExpenseParticipantSummary, ParticipantSummaryData } from '@/components/ExpenseParticipantSummary';

interface NewExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultGroupId?: string;
  expenseToEdit?: Expense | null;
}

export function NewExpenseModal({ isOpen, onClose, defaultGroupId, expenseToEdit }: NewExpenseModalProps) {
  const { currentProfile, userGroups, members, profiles, addExpense, updateExpense, isMutating } = useExpense();

  const [mode, setMode] = useState<'quick' | 'itemized'>('quick');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form State
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');

  // Categories - default to General
  const [subCategory, setSubCategory] = useState(DEFAULT_EXPENSE_CATEGORY);

  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [paidById, setPaidById] = useState('');
  const [groupId, setGroupId] = useState('none');

  // Notes & Image
  const [showAdditional, setShowAdditional] = useState(false);
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [notes, setNotes] = useState('');
  const [receiptUrl, setReceiptUrl] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Itemized State
  const [items, setItems] = useState<Array<{ id: number; desc: string; quantity: string; amount: string; amountType: 'total' | 'each'; assignedTo: string[]; shares?: Record<string, string> }>>([
    { id: 1, desc: '', quantity: '1', amount: '', amountType: 'each', assignedTo: [] }
  ]);

  // Split State
  const [splitType, setSplitType] = useState<'equal' | 'exact' | 'percentage' | 'shares' | 'itemized'>('equal');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [splits, setSplits] = useState<Record<string, { exact: string; pct: string; shares: string }>>({});
  const [showExactMismatchModal, setShowExactMismatchModal] = useState(false);
  const [mismatchData, setMismatchData] = useState<{ exactSum: number; currentTotal: number; finalSplits: any[] } | null>(null);

  const [step, setStep] = useState(1);
  const [isItemizedVerticalView, setIsItemizedVerticalView] = useState(true);
  const [expandedParticipants, setExpandedParticipants] = useState<string[]>([]);
  const [expandedItems, setExpandedItems] = useState<number[]>([1]);

  // Computed
  const activeGroup = userGroups.find(g => g.id === groupId);
  const currency = activeGroup?.currency ?? currentProfile?.currency ?? 'COP';

  const activeProfiles = useMemo(() => {
    if (!groupId || groupId === 'none') return currentProfile ? [currentProfile] : [];
    const groupMemberIds = members.filter(m => m.group_id === groupId).map(m => m.user_id);
    return profiles.filter(p => groupMemberIds.includes(p.id));
  }, [groupId, members, profiles, currentProfile]);

  const prevIsOpenRef = useRef(false);
  const prevExpenseIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      prevIsOpenRef.current = false;
      prevExpenseIdRef.current = null;
      return;
    }

    const currentExpenseId = expenseToEdit ? expenseToEdit.id : null;
    const isOpening = !prevIsOpenRef.current;
    const isExpenseChanged = currentExpenseId !== prevExpenseIdRef.current;

    if (isOpening || isExpenseChanged) {
      prevIsOpenRef.current = true;
      prevExpenseIdRef.current = currentExpenseId;

      // Always reset view to step 1
      setStep(1);
      setError(null);
      setIsSubmitting(false);
      setIsItemizedVerticalView(true);
      setExpandedParticipants([]);
      setExpandedItems([1]);

      if (expenseToEdit) {
        const isItemized = Boolean(expenseToEdit.items && expenseToEdit.items.length > 0);
        setMode(isItemized ? 'itemized' : 'quick');
        setAmount(expenseToEdit.total_amount ? String(expenseToEdit.total_amount) : '');
        setDescription(expenseToEdit.description ?? '');

        let foundSub = DEFAULT_EXPENSE_CATEGORY;
        if (expenseToEdit.category) {
          for (const [main, subs] of Object.entries(EXPENSE_CATEGORY_GROUPS)) {
            if (subs.includes(expenseToEdit.category)) {
              foundSub = expenseToEdit.category;
              break;
            }
          }
          if (foundSub === DEFAULT_EXPENSE_CATEGORY && expenseToEdit.category !== DEFAULT_EXPENSE_CATEGORY) {
            foundSub = expenseToEdit.category;
          }
        }
        setSubCategory(foundSub);

        setDate(expenseToEdit.expense_date ?? new Date().toISOString().split('T')[0]);
        setPaidById(expenseToEdit.paid_by ?? (currentProfile?.id ?? ''));
        const expGroupId = expenseToEdit.group_id ?? 'none';
        setGroupId(expGroupId);
        setReceiptUrl(expenseToEdit.receipt_url ?? '');
        setNotes(expenseToEdit.notes ?? '');
        setShowNoteInput(Boolean(expenseToEdit.notes));
        setShowAdditional(Boolean(expenseToEdit.notes || expenseToEdit.receipt_url));

        if (isItemized && expenseToEdit.items && expenseToEdit.items.length > 0) {
          setItems(expenseToEdit.items.map((i, idx) => {
            const desc = i.description || '';
            const match = desc.match(/^(\d+(?:\.\d+)?)\s*(?:·|x)\s*(.*)$/);
            return {
              id: idx + 1,
              desc: match ? match[2] : desc,
              quantity: match ? match[1] : '1',
              amount: String(i.amount ?? ''),
              amountType: 'total',
              assignedTo: []
            };
          }));
        } else {
          setItems([{ id: 1, desc: '', quantity: '1', amount: '', amountType: 'each', assignedTo: [] }]);
        }

        if (expenseToEdit.splits && expenseToEdit.splits.length > 0) {
          const selected = expenseToEdit.splits.map(s => s.user_id);
          setSelectedMembers(selected);
          const newSplits: Record<string, { exact: string; pct: string; shares: string }> = {};

          const splitAmounts = expenseToEdit.splits.map(s => {
            const val = typeof s.amount_owed === 'number'
              ? s.amount_owed
              : parseFloat(String(s.amount_owed).replace(/[^0-9.]/g, ''));
            return isNaN(val) ? 0 : val;
          });

          const minAmt = Math.min(...splitAmounts);
          const maxAmt = Math.max(...splitAmounts);
          // Split is considered equal if difference between highest and lowest share is negligible
          const isSplitEqual = splitAmounts.length <= 1 || (maxAmt - minAmt <= 1);

          expenseToEdit.splits.forEach(s => {
            const val = typeof s.amount_owed === 'number'
              ? s.amount_owed
              : parseFloat(String(s.amount_owed).replace(/[^0-9.]/g, ''));
            newSplits[s.user_id] = {
              exact: !isNaN(val) && val > 0 ? String(val) : '',
              pct: '',
              shares: '1'
            };
          });
          setSplits(newSplits);
          setSplitType(isItemized ? 'itemized' : (isSplitEqual ? 'equal' : 'exact'));
        } else {
          const defaultMemberIds = activeProfiles.length > 0 ? activeProfiles.map(p => p.id) : (currentProfile ? [currentProfile.id] : []);
          setSelectedMembers(defaultMemberIds);
          setSplits({});
          setSplitType(isItemized ? 'itemized' : 'equal');
        }
      } else {
        // Reset to brand new expense form
        setMode('quick');
        setAmount('');
        setDescription('');
        setSubCategory(DEFAULT_EXPENSE_CATEGORY);
        setDate(new Date().toISOString().split('T')[0]);

        const initialGroupId = defaultGroupId && userGroups.some(g => g.id === defaultGroupId)
          ? defaultGroupId
          : (userGroups[0]?.id ?? 'none');
        setGroupId(initialGroupId);

        setReceiptUrl('');
        setNotes('');
        setShowAdditional(false);
        setShowNoteInput(false);
        setItems([{ id: 1, desc: '', quantity: '1', amount: '', amountType: 'each', assignedTo: [] }]);
        setSplitType('equal');
        setSplits({});
      }
    }
  }, [isOpen, expenseToEdit, defaultGroupId, userGroups, currentProfile, activeProfiles]);

  // Sync paidById and selectedMembers when changing group
  useEffect(() => {
    if (!isOpen) return;
    if (activeProfiles.length > 0) {
      if (!activeProfiles.some(p => p.id === paidById)) {
        const defaultPayer = currentProfile && activeProfiles.some(p => p.id === currentProfile.id)
          ? currentProfile.id
          : activeProfiles[0].id;
        setPaidById(defaultPayer);
      }
      const stillValidMembers = selectedMembers.filter(id => activeProfiles.some(p => p.id === id));
      if (stillValidMembers.length === 0) {
        setSelectedMembers(activeProfiles.map(p => p.id));
      } else if (stillValidMembers.length !== selectedMembers.length) {
        setSelectedMembers(stillValidMembers);
      }
    } else {
      if (currentProfile) setPaidById(currentProfile.id);
      setSelectedMembers(currentProfile ? [currentProfile.id] : []);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, activeProfiles.length, isOpen]);

  const toFraction = (decimal: number) => {
    if (Number.isInteger(decimal)) return decimal.toString();
    const fractions = [
      { num: 1, den: 2, char: '½' },
      { num: 1, den: 3, char: '⅓' },
      { num: 2, den: 3, char: '⅔' },
      { num: 1, den: 4, char: '¼' },
      { num: 3, den: 4, char: '¾' },
      { num: 1, den: 5, char: '⅕' },
      { num: 2, den: 5, char: '⅖' },
      { num: 3, den: 5, char: '⅗' },
      { num: 4, den: 5, char: '⅘' },
      { num: 1, den: 6, char: '⅙' },
      { num: 5, den: 6, char: '⅚' },
      { num: 1, den: 8, char: '⅛' },
      { num: 3, den: 8, char: '⅜' },
      { num: 5, den: 8, char: '⅝' },
      { num: 7, den: 8, char: '⅞' },
    ];
    const whole = Math.floor(decimal);
    const frac = decimal - whole;
    for (const f of fractions) {
      if (Math.abs(frac - (f.num / f.den)) < 0.05) {
        return (
          <span className="inline-flex items-baseline">
            {whole > 0 && <span className="mr-0.5">{whole}</span>}
            <span className="text-[15px] leading-none">{f.char}</span>
          </span>
        );
      }
    }
    return Number(decimal.toFixed(2)).toString();
  };

  const getItemTotal = (item: any) => {
    const qty = parseFloat(item.quantity) || 1;
    const amt = parseFloat(item.amount) || 0;
    return item.amountType === 'each' ? qty * amt : amt;
  };

  const itemsTotal = items.reduce((acc, i) => acc + getItemTotal(i), 0);
  const totalAmount = mode === 'quick' ? (parseFloat(amount) || 0) : itemsTotal;

  const calculateItemizedShares = React.useCallback(() => {
    const res: Record<string, number> = {};
    activeProfiles.forEach(p => res[p.id] = 0);

    items.forEach(item => {
      const amt = getItemTotal(item);
      let sumShares = 0;
      const parsedShares: Record<string, number> = {};

      selectedMembers.forEach(id => {
        const val = item.shares?.[id] !== undefined ? parseFloat(item.shares[id] as string) || 0 : (item.assignedTo.length === 0 || item.assignedTo.includes(id) ? 1 : 0);
        parsedShares[id] = val;
        sumShares += val;
      });

      if (sumShares > 0 && amt > 0) {
        selectedMembers.forEach(id => {
          res[id] = (res[id] || 0) + (amt * (parsedShares[id] / sumShares));
        });
      }
    });
    return res;
  }, [activeProfiles, items, selectedMembers]);

  const participantSummaryList: ParticipantSummaryData[] = useMemo(() => {
    const sharesMap = calculateItemizedShares();
    return selectedMembers.map(mId => {
      const p = activeProfiles.find(x => x.id === mId);
      const amt = sharesMap[mId] || 0;
      const breakdown: { desc: string; qty: number; cost: number }[] = [];

      items.forEach((item, idx) => {
        const itemAmt = getItemTotal(item);
        const val = item.shares?.[mId] !== undefined ? parseFloat(item.shares[mId] as string) || 0 : (item.assignedTo.length === 0 || item.assignedTo.includes(mId) ? 1 : 0);
        if (val > 0) {
          let sumShares = 0;
          selectedMembers.forEach(id => {
            sumShares += item.shares?.[id] !== undefined ? parseFloat(item.shares[id] as string) || 0 : (item.assignedTo.length === 0 || item.assignedTo.includes(id) ? 1 : 0);
          });
          if (sumShares > 0) {
            const itemTotalQty = parseFloat(item.quantity) || 1;
            const userItemQty = itemTotalQty * (val / sumShares);
            breakdown.push({
              desc: item.desc || `Artículo ${idx + 1}`,
              qty: userItemQty,
              cost: itemAmt * (val / sumShares)
            });
          }
        }
      });

      return {
        userId: mId,
        profile: p,
        amount: amt,
        breakdown
      };
    });
  }, [selectedMembers, activeProfiles, items, calculateItemizedShares]);

  const executeSave = async (amountToSave: number, splitsToSave: any[]) => {
    setIsSubmitting(true);
    try {
      const payload = {
        group_id: (groupId === 'none' ? null : groupId) as any,
        paid_by: paidById,
        total_amount: amountToSave,
        description: description.trim(),
        category: subCategory,
        expense_date: date,
        source: 'manual' as const,
        receipt_url: receiptUrl ? receiptUrl : undefined,
        notes: notes.trim() ? notes.trim() : undefined,
        created_by: currentProfile?.id ?? paidById,
      };

      const finalItems = mode === 'itemized' ? items.map((i, idx) => ({
        id: "tmp_" + idx,
        expense_id: expenseToEdit?.id ?? '',
        description: i.quantity && parseFloat(i.quantity) > 1 ? `${i.quantity} · ${i.desc.trim()}` : i.desc.trim(),
        amount: getItemTotal(i),
        created_at: new Date().toISOString()
      })) : [];

      if (expenseToEdit) {
        await updateExpense(expenseToEdit.id, payload, finalItems, splitsToSave);
      } else {
        await addExpense(payload, finalItems, splitsToSave);
      }
      onClose();
    } catch (err: any) {
      setError(err.message ?? 'Error al guardar el gasto.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    setError(null);

    if (!description.trim()) return setError('Ingresa una descripción.');
    if (!paidById) return setError('Selecciona quién pagó.');
    if (selectedMembers.length === 0) return setError('Selecciona al menos un participante.');

    if (mode === 'itemized') {
      if (items.some(i => !i.desc.trim() || !(parseFloat(i.amount) > 0))) {
        return setError('Completa la descripción y monto de todos los artículos.');
      }
      if (totalAmount <= 0) return setError('El monto total debe ser mayor a 0.');
    }

    let finalSplits: any[] = [];
    if (splitType === 'equal') {
      if (totalAmount <= 0) return setError('El monto total debe ser mayor a 0.');
      const share = totalAmount / selectedMembers.length;
      finalSplits = selectedMembers.map(id => ({ user_id: id, amount_owed: share }));
    } else if (splitType === 'exact') {
      let sum = 0;
      selectedMembers.forEach(id => {
        const val = parseFloat(String(splits[id]?.exact ?? '0').replace(/[^0-9.]/g, '')) || 0;
        sum += val;
      });

      const calculatedSplits = selectedMembers.map(id => ({
        user_id: id,
        amount_owed: parseFloat(String(splits[id]?.exact ?? '0').replace(/[^0-9.]/g, '')) || 0
      }));

      // In simple mode (mode === 'quick'), if exact sum doesn't match total, offer shortcut modal to overwrite total
      if (mode === 'quick' && Math.abs(sum - totalAmount) > 0.05) {
        if (sum > 0) {
          setMismatchData({
            exactSum: sum,
            currentTotal: totalAmount,
            finalSplits: calculatedSplits
          });
          setShowExactMismatchModal(true);
          return;
        } else {
          return setError('Ingresa los montos individuales de cada participante.');
        }
      }

      if (Math.abs(sum - totalAmount) > 0.05) {
        return setError('La suma exacta no coincide con el total.');
      }
      finalSplits = calculatedSplits;
    } else if (splitType === 'percentage') {
      if (totalAmount <= 0) return setError('El monto total debe ser mayor a 0.');
      let sum = 0;
      selectedMembers.forEach(id => {
        const val = parseFloat(String(splits[id]?.pct ?? '0').replace(/[^0-9.]/g, '')) || 0;
        sum += val;
      });
      if (Math.abs(sum - 100) > 0.05) return setError('La suma de porcentajes debe ser 100%.');
      finalSplits = selectedMembers.map(id => {
        const val = parseFloat(String(splits[id]?.pct ?? '0').replace(/[^0-9.]/g, '')) || 0;
        return { user_id: id, amount_owed: totalAmount * (val / 100) };
      });
    } else if (splitType === 'shares') {
      if (totalAmount <= 0) return setError('El monto total debe ser mayor a 0.');
      let sum = 0;
      selectedMembers.forEach(id => {
        const val = parseFloat(String(splits[id]?.shares ?? '1').replace(/[^0-9.]/g, '')) || 1;
        sum += val;
      });
      if (sum <= 0) return setError('La suma de cuotas debe ser mayor a 0.');
      finalSplits = selectedMembers.map(id => {
        const val = parseFloat(String(splits[id]?.shares ?? '1').replace(/[^0-9.]/g, '')) || 1;
        return { user_id: id, amount_owed: totalAmount * (val / sum) };
      });
    } else if (splitType === 'itemized') {
      const shares = calculateItemizedShares();
      finalSplits = selectedMembers.map(id => ({ user_id: id, amount_owed: shares[id] ?? 0 }));
    }

    await executeSave(totalAmount, finalSplits);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setIsUploading(true);
      const fd = new FormData();
      fd.append('file', file);
      fd.append('type', 'expense_receipt');
      fd.append('entityId', Date.now().toString());
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      if (!res.ok) throw new Error('Error al subir');
      const data = await res.json();
      if (data.url) setReceiptUrl(data.url);
    } catch (err: any) {
      setError(err.message || 'No se pudo subir la foto.');
    } finally {
      setIsUploading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 md:p-6 bg-zinc-950/40 backdrop-blur-md overflow-y-auto">
      <div className="bg-white rounded-[24px] sm:rounded-3xl shadow-2xl w-full max-w-lg sm:max-w-xl md:max-w-2xl flex flex-col my-auto max-h-[92vh] sm:max-h-[90vh] overflow-hidden transition-all duration-200">

        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4 border-b border-zinc-100 shrink-0">
          <div className="flex items-center space-x-2 sm:space-x-3">
            <h2 className="text-base sm:text-lg font-bold text-zinc-900 tracking-tight">
              {expenseToEdit ? 'Editar gasto' : 'Nuevo gasto'}
            </h2>
            {!expenseToEdit && (
              <div className="flex p-0.5 bg-zinc-100/90 rounded-xl shadow-inner ml-1 sm:ml-2">
                <button
                  type="button"
                  onClick={() => {
                    setMode('quick');
                    setSplitType('equal');
                    setStep(1);
                  }}
                  className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1 ${mode === 'quick'
                      ? 'bg-white shadow-2xs text-zinc-900'
                      : 'text-zinc-500 hover:text-zinc-900'
                    }`}
                >
                  Simple
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('itemized');
                    setSplitType('itemized');
                    setStep(1);
                  }}
                  className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1 ${mode === 'itemized'
                      ? 'bg-white shadow-2xs text-zinc-900'
                      : 'text-zinc-500 hover:text-zinc-900'
                    }`}
                >
                  Detallado
                </button>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar modal"
            className="p-2 -mr-1 rounded-full hover:bg-zinc-100 text-zinc-500 hover:text-zinc-900 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="bg-rose-50 px-4 sm:px-6 py-2.5 border-b border-rose-100 flex items-center text-xs sm:text-sm font-medium text-rose-700 shrink-0">
            <AlertCircle className="w-4 h-4 mr-2 shrink-0" /> {error}
          </div>
        )}

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-3.5 sm:px-6 py-4 space-y-5 sm:space-y-6">

          {step === 1 && (
            <>
              {/* Amount and Description */}
              <div className="space-y-2.5 sm:space-y-3">
                <div className="flex items-center justify-between px-1">
                  <h3 className="text-xs sm:text-sm font-bold text-zinc-900 flex items-center">
                    <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 text-emerald-600" />
                    Información general
                  </h3>
                </div>
                <div className="flex items-center gap-3 sm:gap-4 bg-white p-3.5 sm:p-4 rounded-2xl border border-zinc-200 shadow-2xs overflow-hidden">
                  {(() => {
                    const catConfig = getCategoryConfig(subCategory);
                    const CategoryIcon = catConfig.icon;
                    return (
                      <div className={`w-11 h-11 sm:w-12 sm:h-12 rounded-2xl ${catConfig.bgClass} flex items-center justify-center shrink-0 border border-black/5`}>
                        <CategoryIcon className={`w-5 h-5 sm:w-6 sm:h-6 ${catConfig.textClass}`} />
                      </div>
                    );
                  })()}

                  <div className="flex-1 flex flex-col gap-1.5 sm:gap-2 min-w-0">
                    <input
                      type="text"
                      value={description}
                      onChange={e => setDescription(e.target.value)}
                      placeholder="Introduce una descripción..."
                      className="w-full text-left text-base sm:text-lg text-zinc-900 bg-transparent border-b border-dashed border-zinc-300 pb-1 focus:outline-none focus:ring-0 placeholder:text-zinc-400 focus:border-zinc-500 transition-colors"
                    />

                    {mode === 'quick' ? (
                      <div className="flex items-center text-base sm:text-lg font-bold text-zinc-900 border-b border-dashed border-zinc-300 pb-1 focus-within:border-zinc-500 transition-colors">
                        <span className="mr-1">{currency === 'COP' ? '$' : currency === 'EUR' ? '€' : '$'}</span>
                        <FormattedCurrencyInput
                          value={amount}
                          onChange={setAmount}
                          currency={currency}
                          hideSymbol
                          className="bg-transparent text-left focus:outline-none w-full placeholder:text-zinc-300 text-base sm:text-lg font-bold text-zinc-900"
                          placeholder="0"
                        />
                      </div>
                    ) : itemsTotal > 0 ? (
                      <div className="flex items-center justify-between text-sm sm:text-base font-bold text-zinc-700 border-b border-dashed border-zinc-200 pb-1">
                        <span className="text-xs text-zinc-400 font-semibold uppercase tracking-wider">Total calculado:</span>
                        <span className="text-emerald-700 font-black">{formatCurrency(itemsTotal, currency)}</span>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              {/* Context Details */}
              <div className="space-y-2.5 sm:space-y-3">
                <div className="flex items-center justify-between px-1">
                  <h3 className="text-xs sm:text-sm font-bold text-zinc-900 flex items-center">
                    <ListChecks className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 text-emerald-600" />
                    Detalles
                  </h3>
                </div>
                <div className="bg-white border border-zinc-200 rounded-2xl p-3 sm:p-3.5 space-y-2.5 shadow-2xs overflow-hidden">
                  <div className="grid grid-cols-2 gap-2 sm:gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider pl-0.5">Grupo</label>
                      <div className="relative shadow-2xs rounded-xl bg-white border border-zinc-200">
                        <select
                          value={groupId}
                          onChange={e => setGroupId(e.target.value)}
                          className="w-full pl-2.5 pr-7 py-2 text-xs font-semibold text-zinc-900 appearance-none bg-transparent focus:outline-none focus:ring-2 focus:ring-emerald-500/20 rounded-xl"
                        >
                          <option value="none">Sin grupo</option>
                          {userGroups.map(g => (
                            <option key={g.id} value={g.id}>{g.name}</option>
                          ))}
                        </select>
                        <ChevronDown className="w-3.5 h-3.5 text-zinc-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider pl-0.5">Pagado por</label>
                      <div className="relative shadow-2xs rounded-xl bg-white border border-zinc-200">
                        <select
                          value={paidById}
                          onChange={e => setPaidById(e.target.value)}
                          className="w-full pl-2.5 pr-7 py-2 text-xs font-semibold text-zinc-900 appearance-none bg-transparent focus:outline-none focus:ring-2 focus:ring-emerald-500/20 rounded-xl"
                        >
                          {activeProfiles.map(p => (
                            <option key={p.id} value={p.id}>{p.full_name?.split(' ')[0] || p.email}</option>
                          ))}
                        </select>
                        <ChevronDown className="w-3.5 h-3.5 text-zinc-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider pl-0.5">Categoría</label>
                      <div className="relative shadow-2xs rounded-xl bg-white border border-zinc-200">
                        <select
                          value={subCategory}
                          onChange={e => setSubCategory(e.target.value)}
                          className="w-full pl-2.5 pr-7 py-2 text-xs font-semibold text-zinc-900 appearance-none bg-transparent focus:outline-none focus:ring-2 focus:ring-emerald-500/20 rounded-xl"
                        >
                          {Object.entries(EXPENSE_CATEGORY_GROUPS).map(([main, subs]) => (
                            <optgroup key={main} label={main}>
                              {subs.map(sub => (
                                <option key={sub} value={sub}>{sub}</option>
                              ))}
                            </optgroup>
                          ))}
                          {!Object.values(EXPENSE_CATEGORY_GROUPS).flat().includes(subCategory) && (
                            <option value={subCategory}>{subCategory}</option>
                          )}
                        </select>
                        <ChevronDown className="w-3.5 h-3.5 text-zinc-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider pl-0.5">Fecha</label>
                      <input
                        type="date"
                        value={date}
                        onChange={e => setDate(e.target.value)}
                        className="w-full pl-2.5 pr-2 py-2 bg-white border border-zinc-200 rounded-xl text-xs font-semibold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 shadow-2xs"
                      />
                    </div>
                  </div>

                  <div className="flex gap-2 pt-2 border-t border-zinc-100">
                    <button
                      type="button"
                      onClick={() => setShowNoteInput(!showNoteInput)}
                      className={`flex-1 flex items-center justify-center space-x-1.5 py-2 text-xs font-bold transition-all rounded-xl ${(showNoteInput || notes)
                          ? 'border border-solid bg-emerald-50 border-emerald-200 text-emerald-700 shadow-2xs'
                          : 'border border-dashed border-zinc-300 text-zinc-500 hover:border-emerald-300 hover:text-emerald-600 bg-zinc-50/50 hover:bg-emerald-50/50'
                        }`}
                    >
                      {(showNoteInput || notes) ? <FileText className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                      <span>{notes ? 'Editar nota' : 'Añadir nota'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      disabled={isUploading}
                      className={`flex-1 flex items-center justify-center space-x-1.5 py-2 text-xs font-bold transition-all rounded-xl ${receiptUrl
                          ? 'border border-solid bg-emerald-50 border-emerald-200 text-emerald-700 shadow-2xs'
                          : 'border border-dashed border-zinc-300 text-zinc-500 hover:border-emerald-300 hover:text-emerald-600 bg-zinc-50/50 hover:bg-emerald-50/50'
                        }`}
                    >
                      {isUploading ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : receiptUrl ? (
                        <Camera className="w-3.5 h-3.5" />
                      ) : (
                        <Plus className="w-3.5 h-3.5" />
                      )}
                      <span>{receiptUrl ? 'Cambiar foto' : 'Añadir foto'}</span>
                    </button>
                    <input type="file" ref={fileRef} onChange={handleUpload} accept="image/*" className="hidden" />
                  </div>

                  {(showNoteInput || notes) && (
                    <div className="animate-in fade-in slide-in-from-top-2 duration-200 pb-1">
                      <textarea
                        value={notes}
                        onChange={e => setNotes(e.target.value)}
                        placeholder="Añade notas o detalles adicionales (opcional)..."
                        className="w-full px-3.5 py-2.5 bg-white border border-zinc-200 rounded-xl text-xs sm:text-sm font-medium text-zinc-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 shadow-2xs min-h-[70px] resize-y"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Itemized list in Step 1 */}
              {mode === 'itemized' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between px-1">
                    <div className="flex items-center space-x-2">
                      <ShoppingCart className="w-4 h-4 text-emerald-600 shrink-0" />
                      <h3 className="text-xs sm:text-sm font-bold text-zinc-900">Ítems del gasto</h3>
                    </div>
                  </div>

                  <div className="bg-white border border-zinc-200 rounded-2xl shadow-2xs overflow-hidden">
                    {/* Desktop Table Header */}
                    <div className="hidden sm:grid sm:grid-cols-[1fr_75px_220px_38px] gap-2 px-3.5 py-2.5 bg-zinc-50/80 border-b border-zinc-200/80 text-[11px] font-bold text-zinc-500 uppercase tracking-wider">
                      <div>Descripción</div>
                      <div className="text-center">Cant.</div>
                      <div className="text-right">Monto</div>
                      <div></div>
                    </div>

                    {/* Table Rows */}
                    <div className="divide-y divide-zinc-100">
                      {items.map((item, idx) => {
                        return (
                          <div
                            key={item.id}
                            className="p-3 sm:px-3.5 sm:py-2.5 transition-colors hover:bg-zinc-50/50 space-y-2 sm:space-y-0"
                          >
                            {/* Desktop Row */}
                            <div className="hidden sm:grid sm:grid-cols-[1fr_75px_220px_38px] gap-2 items-center">
                              {/* Description */}
                              <input
                                type="text"
                                placeholder="Descripción del artículo..."
                                value={item.desc}
                                onChange={e => {
                                  const newItems = [...items];
                                  newItems[idx].desc = e.target.value;
                                  setItems(newItems);
                                }}
                                className="w-full px-2.5 py-1.5 bg-zinc-50 focus:bg-white border border-zinc-200 rounded-xl text-xs sm:text-sm font-semibold text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-colors"
                              />

                              {/* Cantidad */}
                              <input
                                type="number"
                                min="1"
                                placeholder="1"
                                value={item.quantity}
                                onChange={e => {
                                  const newItems = [...items];
                                  newItems[idx].quantity = e.target.value;
                                  setItems(newItems);
                                }}
                                className="w-full px-1.5 py-1.5 bg-zinc-50 focus:bg-white border border-zinc-200 rounded-xl text-center text-xs font-bold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-colors"
                              />

                              {/* Monto & Tipo Integrados */}
                              <div className="flex items-center bg-zinc-50 focus-within:bg-white border border-zinc-200 focus-within:border-emerald-500 rounded-xl p-1 focus-within:ring-2 focus-within:ring-emerald-500/20 transition-all">
                                <span className="pl-1.5 text-zinc-400 font-bold text-xs shrink-0 select-none">
                                  {currency === 'COP' ? '$' : currency === 'EUR' ? '€' : '$'}
                                </span>
                                <FormattedCurrencyInput
                                  value={item.amount}
                                  onChange={val => {
                                    const newItems = [...items];
                                    newItems[idx].amount = val;
                                    setItems(newItems);
                                  }}
                                  currency={currency}
                                  hideSymbol
                                  placeholder="0"
                                  className="w-full min-w-0 px-1.5 py-0.5 bg-transparent border-none text-xs sm:text-sm font-bold text-zinc-900 focus:outline-none text-right"
                                />
                                <div className="flex bg-zinc-200/70 p-0.5 rounded-lg shrink-0 ml-1">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const newItems = [...items];
                                      newItems[idx].amountType = 'each';
                                      setItems(newItems);
                                    }}
                                    className={`px-2 py-0.5 text-[11px] font-bold rounded-md transition-all cursor-pointer ${
                                      item.amountType === 'each'
                                        ? 'bg-white text-zinc-900 shadow-2xs'
                                        : 'text-zinc-500 hover:text-zinc-800'
                                    }`}
                                    title="Precio por unidad (c/u)"
                                  >
                                    c/u
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const newItems = [...items];
                                      newItems[idx].amountType = 'total';
                                      setItems(newItems);
                                    }}
                                    className={`px-2 py-0.5 text-[11px] font-bold rounded-md transition-all cursor-pointer ${
                                      item.amountType === 'total'
                                        ? 'bg-white text-zinc-900 shadow-2xs'
                                        : 'text-zinc-500 hover:text-zinc-800'
                                    }`}
                                    title="Monto total del ítem"
                                  >
                                    total
                                  </button>
                                </div>
                              </div>

                              {/* Delete button */}
                              <div className="flex justify-center">
                                <button
                                  type="button"
                                  onClick={() => setItems(items.filter(i => i.id !== item.id))}
                                  disabled={items.length <= 1}
                                  aria-label="Eliminar artículo"
                                  className={`p-1.5 rounded-xl text-zinc-400 hover:text-rose-600 hover:bg-rose-50 transition-colors ${
                                    items.length > 1 ? 'opacity-100 cursor-pointer' : 'opacity-0 pointer-events-none'
                                  }`}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>

                            {/* Mobile Layout (No # badge) */}
                            <div className="sm:hidden space-y-2">
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  placeholder="Descripción (ej. Panes, Jugo...)"
                                  value={item.desc}
                                  onChange={e => {
                                    const newItems = [...items];
                                    newItems[idx].desc = e.target.value;
                                    setItems(newItems);
                                  }}
                                  className="flex-1 min-w-0 px-3 py-2 bg-zinc-50 focus:bg-white border border-zinc-200 rounded-xl text-xs font-semibold text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                                />
                                <button
                                  type="button"
                                  onClick={() => setItems(items.filter(i => i.id !== item.id))}
                                  disabled={items.length <= 1}
                                  aria-label="Eliminar artículo"
                                  className={`p-2 rounded-xl text-zinc-400 hover:text-rose-600 hover:bg-rose-50 transition-colors shrink-0 ${
                                    items.length > 1 ? 'opacity-100 cursor-pointer' : 'opacity-0 pointer-events-none'
                                  }`}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>

                              <div className="flex items-center gap-2">
                                <div className="flex items-center gap-1 bg-zinc-50 border border-zinc-200 rounded-xl px-2 py-1.5 shrink-0">
                                  <span className="text-[10px] font-bold text-zinc-400 uppercase">Cant:</span>
                                  <input
                                    type="number"
                                    min="1"
                                    placeholder="1"
                                    value={item.quantity}
                                    onChange={e => {
                                      const newItems = [...items];
                                      newItems[idx].quantity = e.target.value;
                                      setItems(newItems);
                                    }}
                                    className="w-10 text-center bg-transparent text-xs font-bold text-zinc-900 focus:outline-none"
                                  />
                                </div>

                                {/* Integrated Monto & Tipo on Mobile */}
                                <div className="flex-1 flex items-center bg-zinc-50 focus-within:bg-white border border-zinc-200 focus-within:border-emerald-500 rounded-xl p-1 focus-within:ring-2 focus-within:ring-emerald-500/20 transition-all">
                                  <span className="pl-1.5 text-zinc-400 font-bold text-xs shrink-0 select-none">
                                    {currency === 'COP' ? '$' : currency === 'EUR' ? '€' : '$'}
                                  </span>
                                  <FormattedCurrencyInput
                                    value={item.amount}
                                    onChange={val => {
                                      const newItems = [...items];
                                      newItems[idx].amount = val;
                                      setItems(newItems);
                                    }}
                                    currency={currency}
                                    hideSymbol
                                    placeholder="0"
                                    className="w-full min-w-0 px-1 py-0.5 bg-transparent border-none text-xs font-bold text-zinc-900 focus:outline-none text-right"
                                  />
                                  <div className="flex bg-zinc-200/70 p-0.5 rounded-lg shrink-0 ml-1">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const newItems = [...items];
                                        newItems[idx].amountType = 'each';
                                        setItems(newItems);
                                      }}
                                      className={`px-2 py-0.5 text-[11px] font-bold rounded-md transition-all cursor-pointer ${
                                        item.amountType === 'each'
                                          ? 'bg-white text-zinc-900 shadow-2xs'
                                          : 'text-zinc-500'
                                      }`}
                                    >
                                      c/u
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const newItems = [...items];
                                        newItems[idx].amountType = 'total';
                                        setItems(newItems);
                                      }}
                                      className={`px-2 py-0.5 text-[11px] font-bold rounded-md transition-all cursor-pointer ${
                                        item.amountType === 'total'
                                          ? 'bg-white text-zinc-900 shadow-2xs'
                                          : 'text-zinc-500'
                                      }`}
                                    >
                                      Total
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Add another item button inside table footer */}
                    <div className="p-2.5 bg-zinc-50/50 border-t border-zinc-100">
                      <button
                        type="button"
                        onClick={() => {
                          const nextId = items.length > 0 ? Math.max(...items.map(i => i.id)) + 1 : 1;
                          setItems([
                            ...items,
                            { id: nextId, desc: '', quantity: '1', amount: '', amountType: 'each', assignedTo: [] }
                          ]);
                        }}
                        className="w-full py-2 border border-dashed border-zinc-300 hover:border-emerald-400 bg-white hover:bg-emerald-50/30 rounded-xl text-xs font-bold text-zinc-600 hover:text-emerald-700 transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs active:scale-[0.99]"
                      >
                        <Plus className="w-4 h-4 text-emerald-600" />
                        <span>Añadir otro artículo</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Unified Split Section (Step 2) */}
          {step === 2 && (
            <div className="space-y-4 sm:space-y-5">

              {/* Participantes Section */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between px-1">
                  <h3 className="text-xs sm:text-sm font-bold text-zinc-900 flex items-center">
                    <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 text-emerald-600" />
                    Participantes
                  </h3>
                  <span className="text-[11px] font-semibold text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded-full">
                    {selectedMembers.length} seleccionados
                  </span>
                </div>

                <div className="bg-white border border-zinc-200 rounded-2xl shadow-2xs overflow-hidden p-2.5 sm:p-3">
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5 sm:gap-2">
                    {activeProfiles.map(p => {
                      const isSelected = selectedMembers.includes(p.id);
                      const toggle = () => {
                        if (isSelected && selectedMembers.length > 1) setSelectedMembers(selectedMembers.filter(id => id !== p.id));
                        else if (!isSelected) setSelectedMembers([...selectedMembers, p.id]);
                      };
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={toggle}
                          className={`flex items-center gap-1.5 p-1.5 rounded-xl border transition-all w-full text-left cursor-pointer ${isSelected
                              ? 'bg-emerald-50/50 border-emerald-300 shadow-2xs text-zinc-900'
                              : 'bg-zinc-50 border-zinc-200 opacity-60 grayscale hover:grayscale-0 hover:opacity-100 text-zinc-500'
                            }`}
                        >
                          {p.avatar_url ? (
                            <Image
                              src={p.avatar_url}
                              alt="avatar"
                              width={24}
                              height={24}
                              className={`rounded-full shrink-0 w-6 h-6 object-cover border transition-all ${isSelected ? 'border-emerald-400' : 'border-transparent'}`}
                              unoptimized
                            />
                          ) : (
                            <div className={`w-6 h-6 shrink-0 rounded-full flex items-center justify-center border transition-all ${isSelected ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-zinc-200 border-transparent text-zinc-500'}`}>
                              <span className="text-[10px] font-bold">{(p.full_name || p.email || 'U').charAt(0).toUpperCase()}</span>
                            </div>
                          )}
                          <span className={`text-xs font-bold truncate flex-1 ${isSelected ? 'text-zinc-900' : 'text-zinc-500'}`}>
                            {p.full_name?.split(' ')[0] || (p.email || 'U').split('@')[0]}
                          </span>
                          {isSelected && <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Cómo se divide Section */}
              <div className="space-y-2.5 sm:space-y-3">
                <div className="flex items-center justify-between px-1">
                  <h3 className="text-xs sm:text-sm font-bold text-zinc-900 flex items-center">
                    <PieChart className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 text-emerald-600" />
                    Dividir gasto
                  </h3>
                  {splitType === 'itemized' && mode === 'itemized' && (
                    <button
                      type="button"
                      onClick={() => setIsItemizedVerticalView(!isItemizedVerticalView)}
                      className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold text-zinc-700 bg-white border border-zinc-200 rounded-xl shadow-2xs hover:bg-zinc-50 transition-colors cursor-pointer"
                    >
                      {isItemizedVerticalView ? (
                        <>
                          <Table className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Vista tabla</span>
                        </>
                      ) : (
                        <>
                          <List className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Vista tarjetas</span>
                        </>
                      )}
                    </button>
                  )}
                </div>

                <div className={`bg-white border border-zinc-200 rounded-2xl shadow-2xs overflow-hidden ${splitType === 'itemized' && mode === 'itemized' && !isItemizedVerticalView ? 'pb-0' : 'p-3'}`}>
                  {/* Split Type Selector Tabs */}
                  <div className={`flex gap-1.5 mb-3 overflow-x-auto no-scrollbar pb-1 ${splitType === 'itemized' && mode === 'itemized' && !isItemizedVerticalView ? 'pt-3 mx-2' : ''}`}>
                    {(mode === 'itemized' ? ['itemized', 'equal', 'exact', 'shares'] : ['equal', 'exact', 'shares']).map(type => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => {
                          if (type === 'exact' && splitType !== 'exact') {
                            const equalShare = totalAmount > 0 && selectedMembers.length > 0 ? (totalAmount / selectedMembers.length) : 0;
                            const roundedShare = Math.round(equalShare * 100) / 100;
                            const updatedSplits = { ...splits };
                            selectedMembers.forEach(id => {
                              updatedSplits[id] = {
                                exact: roundedShare > 0 ? String(roundedShare) : '',
                                pct: updatedSplits[id]?.pct ?? '',
                                shares: updatedSplits[id]?.shares ?? '1'
                              };
                            });
                            setSplits(updatedSplits);
                          }
                          setSplitType(type as any);
                        }}
                        className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all whitespace-nowrap cursor-pointer ${splitType === type
                            ? 'bg-zinc-900 text-white shadow-2xs'
                            : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 hover:text-zinc-900'
                          }`}
                      >
                        {type === 'equal' ? 'Partes iguales' : type === 'exact' ? 'Monto exacto' : type === 'shares' ? 'Por cuotas' : 'Por artículo'}
                      </button>
                    ))}
                  </div>

                  {splitType !== 'itemized' && (
                    <div className="flex flex-col divide-y divide-zinc-100">
                      {selectedMembers.map(mId => {
                        const p = activeProfiles.find(x => x.id === mId);
                        if (!p) return null;

                        let liveAmountShares = 0;
                        if (splitType === 'shares') {
                          const totalShares = selectedMembers.reduce((acc, memId) => acc + (parseFloat(splits[memId]?.shares) || 1), 0);
                          const userShares = parseFloat(splits[p.id]?.shares) || 1;
                          liveAmountShares = totalShares > 0 ? (userShares / totalShares) * totalAmount : 0;
                        }

                        return (
                          <div key={p.id} className="flex items-center justify-between gap-2 py-2">
                            <div className="flex items-center space-x-2 min-w-0 flex-1">
                              {p.avatar_url ? (
                                <Image src={p.avatar_url} alt="avatar" width={24} height={24} className="rounded-full w-6 h-6 object-cover border border-zinc-200 shrink-0" unoptimized />
                              ) : (
                                <div className="w-6 h-6 rounded-full bg-zinc-800 text-white flex items-center justify-center text-[10px] font-bold shadow-2xs shrink-0">
                                  {(p.full_name || p.email || 'U').charAt(0).toUpperCase()}
                                </div>
                              )}
                              <span className="text-xs font-semibold text-zinc-800 truncate">
                                {p.full_name?.split(' ')[0] || p.email}
                                {p.id === currentProfile?.id && <span className="text-zinc-400 font-medium ml-1">(Tú)</span>}
                              </span>
                            </div>

                            {splitType === 'shares' && (
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const cur = parseFloat(splits[p.id]?.shares || '1') || 1;
                                    setSplits({ ...splits, [p.id]: { ...splits[p.id], shares: String(Math.max(1, cur - 1)) } });
                                  }}
                                  className="w-6 h-6 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-700 flex items-center justify-center font-bold text-xs"
                                >
                                  -
                                </button>
                                <input
                                  type="number"
                                  min="1"
                                  placeholder="1"
                                  value={splits[p.id]?.shares || '1'}
                                  onChange={e => setSplits({ ...splits, [p.id]: { ...splits[p.id], shares: e.target.value } })}
                                  className="w-9 h-6 px-1 bg-zinc-50 border border-zinc-200 rounded-lg text-center text-xs font-bold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    const cur = parseFloat(splits[p.id]?.shares || '1') || 1;
                                    setSplits({ ...splits, [p.id]: { ...splits[p.id], shares: String(cur + 1) } });
                                  }}
                                  className="w-6 h-6 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-700 flex items-center justify-center font-bold text-xs"
                                >
                                  +
                                </button>
                                <span className="text-[10px] font-bold text-zinc-400 uppercase hidden sm:inline ml-1">cuotas</span>
                              </div>
                            )}

                            <div className="flex items-center justify-end shrink-0 min-w-[80px]">
                              {splitType === 'exact' && (
                                <div className="flex items-center justify-end">
                                  <FormattedCurrencyInput
                                    value={splits[p.id]?.exact ?? ''}
                                    onChange={val => setSplits({ ...splits, [p.id]: { ...splits[p.id], exact: val } })}
                                    currency={currency}
                                    hideSymbol={false}
                                    className="w-24 sm:w-28 bg-zinc-50 border border-zinc-200 focus:border-emerald-500 rounded-xl text-right text-xs sm:text-sm font-black text-zinc-900 focus:outline-none p-1.5 transition-colors"
                                    placeholder="$ 0"
                                  />
                                </div>
                              )}

                              {(splitType === 'equal' || splitType === 'shares') && (
                                <span className="text-xs sm:text-sm font-black text-zinc-900">
                                  {formatCurrency(splitType === 'equal' ? (totalAmount / selectedMembers.length) : liveAmountShares, currency)}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {splitType === 'itemized' && mode === 'itemized' && (
                    <div>
                      {!isItemizedVerticalView ? (
                        /* Table Matrix View */
                        <div className="overflow-x-auto relative flex-1 pb-2">
                          <table className="w-full text-left border-collapse min-w-max">
                            <thead>
                              <tr>
                                <th rowSpan={2} className="sticky left-0 z-10 px-3.5 pt-3 pb-2 text-[10px] font-bold text-zinc-500 uppercase tracking-wider whitespace-nowrap align-bottom border-r border-zinc-200 bg-zinc-50/90 shadow-2xs">
                                  Ítems
                                </th>
                                <th colSpan={selectedMembers.length} className="px-2 pt-2 pb-1 border-b border-zinc-100 bg-white text-center">
                                  <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider">Participaciones</span>
                                </th>
                              </tr>
                              <tr className="border-b border-zinc-100 bg-white">
                                {selectedMembers.map(mId => {
                                  const p = activeProfiles.find(x => x.id === mId);
                                  return (
                                    <th key={mId} className="w-16 min-w-[64px] px-1 py-1.5 text-[10px] font-bold text-zinc-600 uppercase tracking-wider text-center truncate">
                                      {p?.full_name?.split(' ')[0] || 'User'}
                                    </th>
                                  );
                                })}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-100">
                              {items.map((item, idx) => {
                                const itemQty = parseFloat(item.quantity) || 1;
                                const amt = getItemTotal(item);
                                return (
                                  <tr key={item.id} className="hover:bg-zinc-50/50 transition-colors group">
                                    <td className="sticky left-0 z-10 px-3 py-2 text-xs font-bold text-zinc-900 border-r border-zinc-200 whitespace-nowrap bg-white group-hover:bg-zinc-50/90 shadow-2xs">
                                      <div className="flex flex-col">
                                        <span>{`${itemQty} · ${item.desc || 'Artículo'}`}</span>
                                        <span className="text-[10px] font-semibold text-emerald-700">{formatCurrency(amt, currency)}</span>
                                      </div>
                                    </td>
                                    {selectedMembers.map(mId => {
                                      const val = item.shares?.[mId] !== undefined ? item.shares[mId] : (item.assignedTo.length === 0 || item.assignedTo.includes(mId) ? '1' : '0');
                                      return (
                                        <td key={mId} className="px-1 py-1 text-center">
                                          <input
                                            type="number"
                                            min="0"
                                            placeholder="0"
                                            value={val}
                                            onChange={e => {
                                              const newItems = [...items];
                                              if (!newItems[idx].shares) newItems[idx].shares = {};
                                              newItems[idx].shares![mId] = e.target.value;
                                              setItems(newItems);
                                            }}
                                            className="w-11 mx-auto px-1 py-1 bg-zinc-50 focus:bg-white border border-zinc-200 rounded-lg text-center text-xs font-bold text-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-200 shadow-2xs transition-colors"
                                          />
                                        </td>
                                      );
                                    })}
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        /* Mobile-Optimized Cards View */
                        <div className="flex flex-col space-y-2.5">
                          {items.map((item, idx) => {
                            const itemQty = parseFloat(item.quantity) || 1;
                            const amt = getItemTotal(item);
                            const isExpanded = expandedItems.includes(item.id);

                            let sumShares = 0;
                            let assignedCount = 0;
                            selectedMembers.forEach(id => {
                              const s = item.shares?.[id] !== undefined ? parseFloat(item.shares[id] as string) || 0 : (item.assignedTo.length === 0 || item.assignedTo.includes(id) ? 1 : 0);
                              sumShares += s;
                              if (s > 0) assignedCount += 1;
                            });

                            return (
                              <div
                                key={item.id}
                                className="bg-zinc-50/60 border border-zinc-200/90 rounded-2xl p-2.5 sm:p-3 transition-all"
                              >
                                {/* Header / Trigger */}
                                <div
                                  role="button"
                                  tabIndex={0}
                                  className="flex items-center justify-between cursor-pointer select-none gap-2"
                                  onClick={() => setExpandedItems(isExpanded ? expandedItems.filter(i => i !== item.id) : [...expandedItems, item.id])}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      setExpandedItems(isExpanded ? expandedItems.filter(i => i !== item.id) : [...expandedItems, item.id]);
                                    }
                                  }}
                                >
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-xs sm:text-sm font-bold text-zinc-900 truncate">
                                        {itemQty} · {item.desc || 'Sin nombre'}
                                      </span>
                                    </div>
                                    <span className="text-[10px] font-semibold text-zinc-500 block">
                                      {assignedCount === selectedMembers.length
                                        ? 'Dividido entre todos'
                                        : assignedCount === 0
                                          ? 'Sin asignar'
                                          : `Dividido entre ${assignedCount} persona${assignedCount === 1 ? '' : 's'}`}
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-2 shrink-0">
                                    <span className="text-xs sm:text-sm font-black text-emerald-700">
                                      {formatCurrency(amt, currency)}
                                    </span>
                                    <div className="w-6 h-6 rounded-full bg-white border border-zinc-200 flex items-center justify-center text-zinc-500 shadow-2xs">
                                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                    </div>
                                  </div>
                                </div>

                                {/* Expanded Assign Controls */}
                                {isExpanded && (
                                  <div className="mt-3 pt-2.5 border-t border-zinc-200/80 space-y-2">
                                    {/* Preset Quick Actions */}
                                    <div className="flex items-center justify-between gap-1 pb-1">
                                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Asignación rápida:</span>
                                      <div className="flex gap-1">
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const newItems = [...items];
                                            if (!newItems[idx].shares) newItems[idx].shares = {};
                                            selectedMembers.forEach(mId => {
                                              newItems[idx].shares![mId] = '1';
                                            });
                                            setItems(newItems);
                                          }}
                                          className="px-2 py-0.5 text-[10px] font-bold bg-white hover:bg-zinc-100 border border-zinc-200 rounded-lg text-zinc-700 shadow-2xs transition-colors"
                                        >
                                          Todos
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const newItems = [...items];
                                            if (!newItems[idx].shares) newItems[idx].shares = {};
                                            selectedMembers.forEach(mId => {
                                              newItems[idx].shares![mId] = mId === currentProfile?.id ? '1' : '0';
                                            });
                                            setItems(newItems);
                                          }}
                                          className="px-2 py-0.5 text-[10px] font-bold bg-white hover:bg-zinc-100 border border-zinc-200 rounded-lg text-zinc-700 shadow-2xs transition-colors"
                                        >
                                          Solo yo
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const newItems = [...items];
                                            if (!newItems[idx].shares) newItems[idx].shares = {};
                                            selectedMembers.forEach(mId => {
                                              newItems[idx].shares![mId] = '0';
                                            });
                                            setItems(newItems);
                                          }}
                                          className="px-2 py-0.5 text-[10px] font-bold bg-white hover:bg-zinc-100 border border-zinc-200 rounded-lg text-zinc-500 shadow-2xs transition-colors"
                                        >
                                          Limpiar
                                        </button>
                                      </div>
                                    </div>

                                    {/* Member Row List */}
                                    <div className="flex flex-col divide-y divide-zinc-100 bg-white rounded-xl border border-zinc-200/80 p-1">
                                      {selectedMembers.map(mId => {
                                        const p = activeProfiles.find(x => x.id === mId);
                                        if (!p) return null;

                                        const valStr = item.shares?.[mId] !== undefined ? item.shares[mId] : (item.assignedTo.length === 0 || item.assignedTo.includes(mId) ? '1' : '0');
                                        const valNum = parseFloat(valStr) || 0;
                                        const shareCost = sumShares > 0 ? (amt * (valNum / sumShares)) : 0;

                                        return (
                                          <div key={mId} className="flex items-center justify-between gap-2 py-1.5 px-2 hover:bg-zinc-50 rounded-lg transition-colors">
                                            {/* Avatar + Name */}
                                            <div className="flex items-center gap-2 min-w-0 flex-1">
                                              {p.avatar_url ? (
                                                <Image src={p.avatar_url} alt="avatar" width={22} height={22} className="rounded-full w-5 h-5 object-cover border border-zinc-200 shrink-0" unoptimized />
                                              ) : (
                                                <div className="w-5 h-5 rounded-full bg-zinc-800 text-white flex items-center justify-center text-[9px] font-bold shrink-0">
                                                  {(p.full_name || p.email || 'U').charAt(0).toUpperCase()}
                                                </div>
                                              )}
                                              <span className="text-xs font-bold text-zinc-800 truncate">
                                                {p.full_name?.split(' ')[0] || p.email}
                                                {p.id === currentProfile?.id && <span className="text-emerald-600 font-semibold ml-1">(Tú)</span>}
                                              </span>
                                            </div>

                                            {/* Stepper + Input (Neutral colors, no green) */}
                                            <div className="flex items-center gap-1 shrink-0">
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  const newItems = [...items];
                                                  if (!newItems[idx].shares) newItems[idx].shares = {};
                                                  const currentVal = parseFloat(valStr) || 0;
                                                  newItems[idx].shares![mId] = String(Math.max(0, currentVal - 1));
                                                  setItems(newItems);
                                                }}
                                                className="w-6 h-6 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-700 flex items-center justify-center font-bold text-xs transition-colors"
                                                title="Restar cuota"
                                              >
                                                -
                                              </button>
                                              <input
                                                type="number"
                                                min="0"
                                                placeholder="0"
                                                value={valStr}
                                                onChange={e => {
                                                  const newItems = [...items];
                                                  if (!newItems[idx].shares) newItems[idx].shares = {};
                                                  newItems[idx].shares![mId] = e.target.value;
                                                  setItems(newItems);
                                                }}
                                                className={`w-9 h-6 text-center text-xs font-bold rounded-lg border focus:outline-none transition-colors ${valNum > 0
                                                    ? 'bg-zinc-50 border-zinc-300 text-zinc-900 focus:bg-white focus:ring-2 focus:ring-zinc-200'
                                                    : 'bg-zinc-50 border-zinc-200 text-zinc-400'
                                                  }`}
                                              />
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  const newItems = [...items];
                                                  if (!newItems[idx].shares) newItems[idx].shares = {};
                                                  const currentVal = parseFloat(valStr) || 0;
                                                  newItems[idx].shares![mId] = String(currentVal + 1);
                                                  setItems(newItems);
                                                }}
                                                className="w-6 h-6 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-700 flex items-center justify-center font-bold text-xs transition-colors"
                                                title="Sumar cuota"
                                              >
                                                +
                                              </button>
                                            </div>

                                            {/* Share calculated cost */}
                                            <div className="text-right shrink-0 min-w-[70px]">
                                              <span className={`text-xs font-black block ${valNum > 0 ? 'text-zinc-900' : 'text-zinc-300'}`}>
                                                {formatCurrency(shareCost, currency)}
                                              </span>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Resumen por participante Section */}
              {splitType === 'itemized' && mode === 'itemized' && (
                <div className="pt-1">
                  <ExpenseParticipantSummary
                    participants={participantSummaryList}
                    currency={currency}
                    currentUserId={currentProfile?.id}
                    title="Resumen por participante"
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-5 border-t border-zinc-100 bg-white flex flex-col gap-3 rounded-b-[24px] shrink-0">
          <div className="flex justify-between items-center px-1">
            <span className="text-sm font-bold text-zinc-500">Total gasto</span>
            <span className="text-lg font-black text-emerald-700">{formatCurrency(totalAmount, currency)}</span>
          </div>

          <div className="flex gap-3 mt-1">
            {step > 1 && (
              <button
                onClick={() => setStep(step - 1)}
                className="px-5 py-3.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-sm font-bold rounded-xl transition-all flex items-center justify-center shrink-0 cursor-pointer"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}

            {step === 1 ? (
              <button
                onClick={() => {
                  if (!description.trim()) {
                    setError('Por favor, ingresa una descripción');
                    return;
                  }
                  if (mode === 'quick' && !amount) {
                    setError('Por favor, ingresa un monto');
                    return;
                  }
                  if (mode === 'itemized') {
                    if (items.some(i => !i.desc || !i.amount)) {
                      setError('Completa la descripción y monto de todos los artículos.');
                      return;
                    }
                  }
                  setError(null);
                  setStep(step + 1);
                }}
                className="flex-1 px-8 py-3.5 bg-zinc-900 hover:bg-black text-white text-sm font-bold rounded-xl transition-all shadow-md active:scale-95 flex items-center justify-center cursor-pointer"
              >
                <span>Siguiente</span>
                <ArrowRight className="w-4 h-4 ml-2" />
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={isSubmitting || isMutating}
                className="flex-1 px-8 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl transition-all shadow-md active:scale-95 flex items-center justify-center disabled:opacity-50 cursor-pointer"
              >
                {(isSubmitting || isMutating) ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <CheckCircle2 className="w-5 h-5 mr-2" />}
                <span>{expenseToEdit ? 'Guardar Cambios' : 'Confirmar Gasto'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Modal de confirmación para ajustar total según suma exacta (Solo modo Simple) */}
        {showExactMismatchModal && mismatchData && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-zinc-950/50 backdrop-blur-xs animate-in fade-in duration-150">
            <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-2xl max-w-sm w-full border border-zinc-100 flex flex-col gap-4 animate-in zoom-in-95 duration-150">
              <div>
                <h3 className="text-base font-bold text-zinc-900">¿Actualizar el total del gasto?</h3>
                <p className="text-xs text-zinc-600 mt-1.5 leading-relaxed">
                  La suma de los montos ingresados (<strong className="text-zinc-900 font-bold">{formatCurrency(mismatchData.exactSum, currency)}</strong>) no coincide con el total inicial (<strong className="text-zinc-900 font-bold">{formatCurrency(mismatchData.currentTotal, currency)}</strong>).
                </p>
              </div>

              <div className="flex flex-col gap-2 pt-1">
                <button
                  type="button"
                  onClick={async () => {
                    const updatedSum = mismatchData.exactSum;
                    const splitsToSave = mismatchData.finalSplits;
                    setShowExactMismatchModal(false);
                    setAmount(String(updatedSum));
                    await executeSave(updatedSum, splitsToSave);
                  }}
                  disabled={isSubmitting || isMutating}
                  className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-all shadow-sm active:scale-98 flex items-center justify-center cursor-pointer disabled:opacity-50"
                >
                  {(isSubmitting || isMutating) ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Actualizar total a {formatCurrency(mismatchData.exactSum, currency)} y guardar
                </button>
                <button
                  type="button"
                  onClick={() => setShowExactMismatchModal(false)}
                  className="w-full py-2.5 px-4 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-xs font-bold rounded-xl transition-all cursor-pointer"
                >
                  Volver a editar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
