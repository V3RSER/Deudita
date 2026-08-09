'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { useExpense } from '@/lib/expense-context';
import { Expense, ExpenseItem, ExpenseSplit } from '@/lib/types';
import { formatCurrency } from '@/lib/balance-utils';
import {
  X,
  Plus,
  Trash2,
  Receipt,
  Users,
  AlertCircle,
  UploadCloud,
  Loader2,
  Calendar as CalendarIcon,
  Check,
  ChevronDown,
  Paperclip,
  Percent,
  Equal,
  Hash,
  Sliders,
  Sparkles,
} from 'lucide-react';

interface NewExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultGroupId?: string;
  expenseToEdit?: Expense | null;
}

type SplitType = 'equal' | 'exact' | 'percentage' | 'shares';

export function NewExpenseModal({
  isOpen,
  onClose,
  defaultGroupId,
  expenseToEdit,
}: NewExpenseModalProps) {
  const { currentProfile, userGroups, members, profiles, addExpense, updateExpense } = useExpense();

  const isEditing = Boolean(expenseToEdit);

  // Group selection
  const [groupId, setGroupId] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [totalAmount, setTotalAmount] = useState<string>('');
  const [paidBy, setPaidBy] = useState<string>('');
  const [category, setCategory] = useState<string>('Supermercado');
  const [expenseDate, setExpenseDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );

  // Itemized breakdown state
  const [useItems, setUseItems] = useState<boolean>(false);
  const [items, setItems] = useState<Array<{ description: string; amount: string }>>([
    { description: '', amount: '' },
  ]);

  // Receipt photo / notes state
  const [receiptUrl, setReceiptUrl] = useState<string>('');
  const [isUploadingReceipt, setIsUploadingReceipt] = useState<boolean>(false);
  const [showImageUploadPill, setShowImageUploadPill] = useState<boolean>(false);

  // Split options state
  const [splitType, setSplitType] = useState<SplitType>('equal');
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [customSplits, setCustomSplits] = useState<Record<string, string>>({});

  // Quick preset state: 'split' | 'i_owe_all' | 'they_owe_all'
  const [quickPreset, setQuickPreset] = useState<'split' | 'i_owe_all' | 'they_owe_all'>('split');

  // Validation error banner
  const [validationError, setValidationError] = useState<string | null>(null);

  // Determine active group and member profiles
  const activeGroupId =
    groupId && userGroups.some((g) => g.id === groupId)
      ? groupId
      : defaultGroupId && userGroups.some((g) => g.id === defaultGroupId)
      ? defaultGroupId
      : userGroups.length > 0
      ? userGroups[0].id
      : '';

  const groupMembers = members.filter((m) => m.group_id === activeGroupId);
  const memberProfiles = groupMembers
    .map((m) => profiles.find((p) => p.id === m.user_id))
    .filter((p): p is NonNullable<typeof p> => p !== undefined);

  const selectedGroup = userGroups.find((g) => g.id === activeGroupId);

  // Track last modal state to synchronize form values synchronously during render
  const [lastModalState, setLastModalState] = useState<{
    isOpen: boolean;
    expenseId?: string;
  }>({ isOpen: false });

  const currentExpenseId = expenseToEdit ? expenseToEdit.id : 'new';

  if (isOpen && (!lastModalState.isOpen || lastModalState.expenseId !== currentExpenseId)) {
    setLastModalState({ isOpen: true, expenseId: currentExpenseId });
    setValidationError(null);

    if (expenseToEdit) {
      setGroupId(expenseToEdit.group_id);
      setDescription(expenseToEdit.description || '');
      setTotalAmount(expenseToEdit.total_amount ? String(expenseToEdit.total_amount) : '');
      setPaidBy(expenseToEdit.paid_by);
      setCategory(expenseToEdit.category || 'Supermercado');
      setExpenseDate(expenseToEdit.expense_date || new Date().toISOString().split('T')[0]);
      setReceiptUrl(expenseToEdit.receipt_url || '');

      if (expenseToEdit.items && expenseToEdit.items.length > 0) {
        setUseItems(true);
        setItems(
          expenseToEdit.items.map((i) => ({
            description: i.description,
            amount: String(i.amount),
          }))
        );
      } else {
        setUseItems(false);
        setItems([{ description: '', amount: '' }]);
      }

      if (expenseToEdit.splits && expenseToEdit.splits.length > 0) {
        const selected = expenseToEdit.splits.map((s) => s.user_id);
        setSelectedMemberIds(selected);

        const splitsMap: Record<string, string> = {};
        let isExact = false;
        const total = expenseToEdit.total_amount || 0;
        const expectedEqual = selected.length > 0 ? total / selected.length : total;

        expenseToEdit.splits.forEach((s) => {
          splitsMap[s.user_id] = String(s.amount_owed);
          if (Math.abs(s.amount_owed - expectedEqual) > 0.05) {
            isExact = true;
          }
        });

        setCustomSplits(splitsMap);
        if (isExact) {
          setSplitType('exact');
        } else {
          setSplitType('equal');
        }
      } else {
        const allIds = memberProfiles.map((p) => p.id);
        setSelectedMemberIds(allIds);
        setSplitType('equal');
        setCustomSplits({});
      }
    } else {
      // New Expense Defaults
      const initGroupId =
        defaultGroupId && userGroups.some((g) => g.id === defaultGroupId)
          ? defaultGroupId
          : userGroups.length > 0
          ? userGroups[0].id
          : '';

      setGroupId(initGroupId);
      setDescription('');
      setTotalAmount('');
      setReceiptUrl('');
      setCategory('Supermercado');
      setExpenseDate(new Date().toISOString().split('T')[0]);
      setUseItems(false);
      setItems([{ description: '', amount: '' }]);
      setSplitType('equal');
      setQuickPreset('split');

      const currentInGroup = currentProfile && memberProfiles.some((p) => p.id === currentProfile.id);
      if (currentInGroup && currentProfile) {
        setPaidBy(currentProfile.id);
      } else if (memberProfiles.length > 0) {
        setPaidBy(memberProfiles[0].id);
      } else {
        setPaidBy('');
      }

      setSelectedMemberIds(memberProfiles.map((p) => p.id));
      setCustomSplits({});
    }
  } else if (!isOpen && lastModalState.isOpen) {
    setLastModalState({ isOpen: false });
  }

  // Sync member selections when group changes
  const handleGroupSelect = (newGroupId: string) => {
    setGroupId(newGroupId);
    setValidationError(null);

    const newGroupMembers = members.filter((m) => m.group_id === newGroupId);
    const newProfiles = newGroupMembers
      .map((m) => profiles.find((p) => p.id === m.user_id))
      .filter((p): p is NonNullable<typeof p> => p !== undefined);

    if (newProfiles.length > 0) {
      setSelectedMemberIds(newProfiles.map((p) => p.id));
      const currentInGroup = currentProfile && newProfiles.some((p) => p.id === currentProfile.id);
      if (currentInGroup && currentProfile) {
        setPaidBy(currentProfile.id);
      } else {
        setPaidBy(newProfiles[0].id);
      }
    } else {
      setSelectedMemberIds([]);
      setPaidBy('');
    }
  };

  // Quick Presets: 'split' | 'i_owe_all' | 'they_owe_all'
  const applyQuickPreset = (preset: 'split' | 'i_owe_all' | 'they_owe_all') => {
    setQuickPreset(preset);
    setValidationError(null);

    const myId = currentProfile?.id || paidBy;
    const numericTotal = parseFloat(totalAmount) || 0;

    if (preset === 'i_owe_all') {
      // I owe 100% of the total amount
      setSplitType('exact');
      if (myId) {
        setSelectedMemberIds([myId]);
        const splitsMap: Record<string, string> = {};
        memberProfiles.forEach((p) => {
          splitsMap[p.id] = p.id === myId ? String(numericTotal) : '0';
        });
        setCustomSplits(splitsMap);
      }
    } else if (preset === 'they_owe_all') {
      // Others owe the full amount (excluding me)
      setSplitType('equal');
      const otherProfiles = memberProfiles.filter((p) => p.id !== myId);
      if (otherProfiles.length > 0) {
        setSelectedMemberIds(otherProfiles.map((p) => p.id));
      } else {
        setSelectedMemberIds(memberProfiles.map((p) => p.id));
      }
    } else {
      // Standard split among all
      setSplitType('equal');
      setSelectedMemberIds(memberProfiles.map((p) => p.id));
      setCustomSplits({});
    }
  };

  const handleReceiptFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploadingReceipt(true);
      setValidationError(null);

      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', 'expense_receipt');

      const numericId = Math.floor(1000000000 + Math.random() * 9000000000).toString();
      formData.append('entityId', numericId);

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Error al subir el comprobante');
      }

      const data = await res.json();
      if (data.url) {
        setReceiptUrl(data.url);
      }
    } catch (err: unknown) {
      console.error('Error al subir el recibo:', err);
      setValidationError(err instanceof Error ? err.message : 'No se pudo subir la foto del recibo');
    } finally {
      setIsUploadingReceipt(false);
    }
  };

  const handleAddItemRow = () => {
    setItems((prev) => [...prev, { description: '', amount: '' }]);
  };

  const handleRemoveItemRow = (index: number) => {
    setItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleItemChange = (index: number, field: 'description' | 'amount', value: string) => {
    const updated = items.map((item, idx) => (idx === index ? { ...item, [field]: value } : item));
    setItems(updated);

    if (useItems) {
      const sum = updated.reduce((acc, curr) => {
        const val = parseFloat(curr.amount);
        return acc + (isNaN(val) ? 0 : val);
      }, 0);
      if (sum > 0) {
        setTotalAmount(sum.toString());
      }
    }
  };

  const toggleMemberSelection = (userId: string) => {
    setValidationError(null);

    if (selectedMemberIds.includes(userId)) {
      if (selectedMemberIds.length > 1) {
        setSelectedMemberIds(selectedMemberIds.filter((id) => id !== userId));
      }
    } else {
      setSelectedMemberIds([...selectedMemberIds, userId]);
    }
  };

  const handleCustomSplitChange = (userId: string, val: string) => {
    setValidationError(null);
    setCustomSplits((prev) => ({ ...prev, [userId]: val }));
  };

  // Calculated per-person share display for 'equal'
  const numericTotal = parseFloat(totalAmount) || 0;
  const equalPerPerson = selectedMemberIds.length > 0 ? numericTotal / selectedMemberIds.length : 0;

  // Perform Form Validations before submission
  const validateForm = (): boolean => {
    setValidationError(null);

    if (!description || description.trim().length === 0) {
      setValidationError('Por favor, ingresa una descripción para el gasto.');
      return false;
    }

    if (isNaN(numericTotal) || numericTotal <= 0) {
      setValidationError('Ingresa un monto total válido mayor a 0.');
      return false;
    }

    const effectiveGroupId = groupId || activeGroupId;
    if (!effectiveGroupId) {
      setValidationError('Selecciona un grupo para asociar este gasto.');
      return false;
    }

    if (memberProfiles.length === 0) {
      setValidationError('El grupo seleccionado no tiene integrantes registrados.');
      return false;
    }

    if (selectedMemberIds.length === 0) {
      setValidationError('Selecciona al menos un integrante para dividir el gasto.');
      return false;
    }

    if (!paidBy) {
      setValidationError('Selecciona quién pagó este gasto.');
      return false;
    }

    // Split-specific validations
    if (splitType === 'exact') {
      let sum = 0;
      for (const uid of selectedMemberIds) {
        const val = parseFloat(customSplits[uid] || '0');
        if (isNaN(val) || val < 0) {
          setValidationError(`Ingresa un monto exacto válido para cada miembro.`);
          return false;
        }
        sum += val;
      }

      const diff = Math.abs(sum - numericTotal);
      if (diff > 0.05) {
        setValidationError(
          `La suma de los montos (${formatCurrency(sum)}) no coincide con el total (${formatCurrency(
            numericTotal
          )}). Diferencia: ${formatCurrency(Math.abs(sum - numericTotal))}`
        );
        return false;
      }
    } else if (splitType === 'percentage') {
      let sumPct = 0;
      for (const uid of selectedMemberIds) {
        const pct = parseFloat(customSplits[uid] || '0');
        if (isNaN(pct) || pct < 0) {
          setValidationError(`Ingresa un porcentaje válido para cada miembro.`);
          return false;
        }
        sumPct += pct;
      }

      if (Math.abs(sumPct - 100) > 0.1) {
        setValidationError(
          `La suma de los porcentajes (${sumPct.toFixed(1)}%) debe ser exactamente 100%. ${
            sumPct < 100 ? `Falta un ${(100 - sumPct).toFixed(1)}%` : `Sobresale un ${(sumPct - 100).toFixed(1)}%`
          }`
        );
        return false;
      }
    } else if (splitType === 'shares') {
      let totalShares = 0;
      for (const uid of selectedMemberIds) {
        const shares = parseFloat(customSplits[uid] || '1');
        if (isNaN(shares) || shares <= 0) {
          setValidationError(`Ingresa una cantidad de cuotas válida (> 0) para cada participante.`);
          return false;
        }
        totalShares += shares;
      }
      if (totalShares <= 0) {
        setValidationError('La suma total de cuotas debe ser mayor a 0.');
        return false;
      }
    }

    // Validate Itemized breakdown if enabled
    if (useItems) {
      let itemsSum = 0;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (!item.description || item.description.trim().length === 0) {
          setValidationError(`Ingresa la descripción para el ítem #${i + 1}.`);
          return false;
        }
        const amt = parseFloat(item.amount);
        if (isNaN(amt) || amt <= 0) {
          setValidationError(`Ingresa un monto válido mayor a 0 para el ítem "${item.description}".`);
          return false;
        }
        itemsSum += amt;
      }

      if (Math.abs(itemsSum - numericTotal) > 0.05) {
        setValidationError(
          `La suma de los ítems (${formatCurrency(itemsSum)}) no coincide con el total (${formatCurrency(
            numericTotal
          )}).`
        );
        return false;
      }
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    const effectiveGroupId = groupId || activeGroupId;
    const effectivePaidBy =
      paidBy && memberProfiles.some((p) => p.id === paidBy)
        ? paidBy
        : currentProfile && memberProfiles.some((p) => p.id === currentProfile.id)
        ? currentProfile.id
        : memberProfiles[0]?.id;

    // Build items if useItems is true
    const finalItems: ExpenseItem[] = [];
    if (useItems) {
      items.forEach((item, idx) => {
        const amt = parseFloat(item.amount);
        if (item.description.trim().length > 0 && !isNaN(amt) && amt > 0) {
          finalItems.push({
            id: `item_tmp_${idx}`,
            expense_id: expenseToEdit?.id || '',
            description: item.description.trim(),
            amount: amt,
            created_at: new Date().toISOString(),
          });
        }
      });
    }

    // Build splits
    const finalSplits: Omit<ExpenseSplit, 'id' | 'created_at' | 'expense_id'>[] = [];

    if (splitType === 'equal') {
      const count = selectedMemberIds.length;
      const share = count > 0 ? numericTotal / count : numericTotal;
      selectedMemberIds.forEach((uid) => {
        finalSplits.push({
          user_id: uid,
          amount_owed: Math.round(share * 100) / 100,
        });
      });
    } else if (splitType === 'exact') {
      selectedMemberIds.forEach((uid) => {
        const rawSplit = customSplits[uid];
        const val = rawSplit ? parseFloat(rawSplit) : 0;
        finalSplits.push({
          user_id: uid,
          amount_owed: isNaN(val) ? 0 : val,
        });
      });
    } else if (splitType === 'percentage') {
      selectedMemberIds.forEach((uid) => {
        const rawSplit = customSplits[uid];
        const pct = rawSplit ? parseFloat(rawSplit) : 0;
        const share = (numericTotal * (isNaN(pct) ? 0 : pct)) / 100;
        finalSplits.push({
          user_id: uid,
          amount_owed: Math.round(share * 100) / 100,
        });
      });
    } else if (splitType === 'shares') {
      let totalShares = 0;
      selectedMemberIds.forEach((uid) => {
        const sh = parseFloat(customSplits[uid] || '1');
        totalShares += isNaN(sh) ? 0 : sh;
      });

      selectedMemberIds.forEach((uid) => {
        const sh = parseFloat(customSplits[uid] || '1');
        const shareAmt = totalShares > 0 ? (numericTotal * sh) / totalShares : 0;
        finalSplits.push({
          user_id: uid,
          amount_owed: Math.round(shareAmt * 100) / 100,
        });
      });
    }

    try {
      const payload = {
        group_id: effectiveGroupId,
        paid_by: effectivePaidBy,
        total_amount: numericTotal,
        description: description.trim(),
        category,
        expense_date: expenseDate,
        source: 'manual' as const,
        receipt_url: receiptUrl || undefined,
        created_by: currentProfile?.id ? currentProfile.id : effectivePaidBy,
      };

      if (isEditing && expenseToEdit) {
        await updateExpense(expenseToEdit.id, payload, finalItems, finalSplits);
      } else {
        await addExpense(payload, finalItems, finalSplits);
      }

      resetAndClose();
    } catch (err: unknown) {
      console.error('Error guardando gasto:', err);
      setValidationError(err instanceof Error ? err.message : 'Error al guardar el gasto.');
    }
  };

  const resetAndClose = () => {
    setDescription('');
    setTotalAmount('');
    setReceiptUrl('');
    setUseItems(false);
    setItems([{ description: '', amount: '' }]);
    setCustomSplits({});
    setSplitType('equal');
    setSelectedMemberIds([]);
    setValidationError(null);
    onClose();
  };

  if (!isOpen) return null;

  const paidByProfile = profiles.find((p) => p.id === paidBy);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-zinc-950/70 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white rounded-[2rem] ring-1 ring-zinc-200 shadow-2xl w-full max-w-4xl overflow-hidden my-4">
        
        {/* Top Header Bar (Splitwise Green/Teal Aesthetic: #3da88a) */}
        <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-teal-600/30 bg-[#3da88a] text-white">
          <div className="p-4 sm:p-5 flex items-center justify-between">
            <h2 className="text-lg font-semibold tracking-tight text-white flex items-center space-x-2">
              <Receipt className="w-5 h-5 text-teal-100" />
              <span>{isEditing ? 'Editar gasto' : 'Añadir un gasto'}</span>
            </h2>
            <button
              onClick={resetAndClose}
              className="p-2 text-teal-100 hover:text-white hover:bg-teal-700/50 rounded-full transition-colors md:hidden"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-4 sm:p-5 hidden md:flex items-center justify-between">
            <h2 className="text-lg font-semibold tracking-tight text-white flex items-center space-x-2">
              <Users className="w-5 h-5 text-teal-100" />
              <span>Elegir opciones de división</span>
            </h2>
            <button
              onClick={resetAndClose}
              className="p-2 text-teal-100 hover:text-white hover:bg-teal-700/50 rounded-full transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Form Container */}
        <form onSubmit={handleSubmit} className="max-h-[82vh] overflow-y-auto">
          {/* Validation Alert Banner */}
          {validationError && (
            <div className="bg-rose-50 border-b border-rose-200 p-4 px-6 flex items-center space-x-3 text-rose-800 text-sm font-medium animate-fadeIn">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
              <span>{validationError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-zinc-200">
            
            {/* LEFT COLUMN: Main Expense Information */}
            <div className="p-6 sm:p-8 space-y-6">
              
              {/* Row 1: Participant / Group Badge */}
              <div className="flex items-center space-x-2 text-sm text-zinc-600 flex-wrap gap-y-2">
                <span className="font-semibold text-zinc-800">Con tú y:</span>
                
                {/* Group Selector Badge */}
                <div className="relative inline-block">
                  <select
                    value={groupId}
                    onChange={(e) => handleGroupSelect(e.target.value)}
                    className="appearance-none bg-emerald-50 text-emerald-800 hover:bg-emerald-100 font-medium px-3 py-1.5 pr-7 rounded-full text-xs border border-emerald-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {userGroups.map((g) => (
                      <option key={g.id} value={g.id}>
                        Todos los de {g.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 text-emerald-700 absolute right-2.5 top-2.5 pointer-events-none" />
                </div>
              </div>

              {/* Main Card: Ticket Icon + Description + Big Amount */}
              <div className="bg-zinc-50 rounded-2xl p-5 border border-zinc-200 shadow-sm space-y-4">
                <div className="flex items-center space-x-4">
                  {/* Ticket / Receipt Icon Box */}
                  <div className="w-14 h-14 bg-white rounded-2xl border border-zinc-200 shadow-sm flex items-center justify-center shrink-0 text-zinc-500">
                    <Receipt className="w-7 h-7 text-zinc-600" />
                  </div>

                  <div className="flex-1 space-y-2">
                    {/* Description field */}
                    <input
                      type="text"
                      required
                      value={description}
                      onChange={(e) => {
                        setDescription(e.target.value);
                        setValidationError(null);
                      }}
                      placeholder="Introduce una descripción"
                      className="w-full bg-transparent border-b border-dashed border-zinc-300 focus:border-zinc-800 py-1 text-base sm:text-lg font-medium text-zinc-900 placeholder:text-zinc-400 focus:outline-none transition-colors"
                    />

                    {/* Big Amount Field ($ 0.00) without spin buttons */}
                    <div className="flex items-center space-x-1 border-b border-dashed border-zinc-300 focus-within:border-zinc-800 py-1">
                      <span className="text-2xl sm:text-3xl font-bold text-zinc-400">$</span>
                      <input
                        type="number"
                        required
                        step="any"
                        disabled={useItems}
                        value={totalAmount}
                        onChange={(e) => {
                          setTotalAmount(e.target.value);
                          setValidationError(null);
                        }}
                        placeholder="0.00"
                        className="w-full bg-transparent text-2xl sm:text-3xl font-bold text-zinc-900 placeholder:text-zinc-300 focus:outline-none disabled:text-zinc-400"
                      />
                    </div>
                  </div>
                </div>

                {/* Sub-line: Who paid and split summary */}
                <div className="text-xs text-zinc-600 flex items-center justify-between pt-2 border-t border-zinc-200/80 flex-wrap gap-2">
                  <div className="flex items-center space-x-1.5 flex-wrap">
                    <span>Pagado por</span>
                    
                    {/* Payer Selector Pill */}
                    <select
                      value={paidBy}
                      onChange={(e) => setPaidBy(e.target.value)}
                      className="bg-zinc-200/80 hover:bg-zinc-300 text-zinc-800 font-semibold px-2.5 py-0.5 rounded-full text-xs cursor-pointer border-none focus:outline-none"
                    >
                      {memberProfiles.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.id === currentProfile?.id ? 'ti' : p.full_name}
                        </option>
                      ))}
                    </select>

                    <span>y dividido</span>

                    <span className="bg-emerald-100 text-emerald-800 font-semibold px-2.5 py-0.5 rounded-full text-xs">
                      {splitType === 'equal'
                        ? 'a partes iguales'
                        : splitType === 'exact'
                        ? 'por montos exactos'
                        : splitType === 'percentage'
                        ? 'por porcentajes'
                        : 'por cuotas'}
                    </span>
                  </div>

                  <span className="text-zinc-500 font-medium font-mono text-[11px]">
                    ({formatCurrency(equalPerPerson)}/persona)
                  </span>
                </div>
              </div>

              {/* Action Pills Row: Date, Image/Notes, Group Pill */}
              <div className="flex items-center gap-2 flex-wrap text-xs">
                {/* Date Pill */}
                <label className="flex items-center space-x-1.5 bg-zinc-100 hover:bg-zinc-200 px-3.5 py-2 rounded-full border border-zinc-200 text-zinc-700 cursor-pointer transition-colors">
                  <CalendarIcon className="w-3.5 h-3.5 text-zinc-500" />
                  <input
                    type="date"
                    value={expenseDate}
                    onChange={(e) => setExpenseDate(e.target.value)}
                    className="bg-transparent text-xs font-medium focus:outline-none cursor-pointer"
                  />
                </label>

                {/* Attach Receipt / Notes Pill */}
                <button
                  type="button"
                  onClick={() => setShowImageUploadPill((prev) => !prev)}
                  className="flex items-center space-x-1.5 bg-zinc-100 hover:bg-zinc-200 px-3.5 py-2 rounded-full border border-zinc-200 text-zinc-700 transition-colors"
                >
                  <Paperclip className="w-3.5 h-3.5 text-zinc-500" />
                  <span>{receiptUrl ? 'Comprobante listo' : 'Añadir imagen/notas'}</span>
                </button>

                {/* Group Tag Pill */}
                <span className="bg-zinc-100 px-3.5 py-2 rounded-full border border-zinc-200 text-zinc-600 font-medium">
                  {selectedGroup ? selectedGroup.name : 'Grupo'}
                </span>
              </div>

              {/* Expandable Image Upload Box */}
              {(showImageUploadPill || receiptUrl) && (
                <div className="bg-zinc-50 p-4 rounded-2xl border border-zinc-200 space-y-3">
                  <div className="flex items-center justify-between text-xs font-semibold text-zinc-700">
                    <span>Foto de Comprobante / Recibo</span>
                    {receiptUrl && (
                      <button
                        type="button"
                        onClick={() => setReceiptUrl('')}
                        className="text-rose-600 hover:text-rose-700 font-medium"
                      >
                        Quitar
                      </button>
                    )}
                  </div>

                  {receiptUrl ? (
                    <div className="flex items-center space-x-3 bg-white p-2.5 rounded-xl border border-zinc-200">
                      <div className="w-12 h-12 relative rounded-lg overflow-hidden shrink-0 border border-zinc-200">
                        <Image
                          src={receiptUrl}
                          alt="Recibo"
                          fill
                          className="object-cover"
                          unoptimized
                          referrerPolicy="no-referrer"
                        />
                      </div>
                      <div className="text-xs text-zinc-600 overflow-hidden">
                        <p className="font-semibold text-zinc-900 truncate">Comprobante adjuntado</p>
                        <p className="text-[10px] text-emerald-600 font-mono truncate">{receiptUrl}</p>
                      </div>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center p-3 bg-white border border-dashed border-zinc-300 hover:border-zinc-500 rounded-xl cursor-pointer transition-colors">
                      {isUploadingReceipt ? (
                        <div className="flex items-center space-x-2 text-zinc-600 text-xs font-medium">
                          <Loader2 className="w-4 h-4 animate-spin text-zinc-900" />
                          <span>Subiendo archivo...</span>
                        </div>
                      ) : (
                        <div className="flex items-center space-x-2 text-zinc-600 text-xs font-medium">
                          <UploadCloud className="w-4 h-4 text-zinc-500" />
                          <span>Adjuntar foto de boleta o factura</span>
                        </div>
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleReceiptFileChange}
                        disabled={isUploadingReceipt}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>
              )}

              {/* Category & Desglose de ítems */}
              <div className="pt-4 border-t border-zinc-200 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">
                      Categoría
                    </label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900"
                    >
                      <option value="Supermercado">Supermercado & Abarrotes</option>
                      <option value="Servicios">Servicios (Luz, Agua, Gas, Net)</option>
                      <option value="Restaurante">Restaurante & Salidas</option>
                      <option value="Alojamiento">Alojamiento & Cabaña</option>
                      <option value="Transporte">Transporte & Bencina</option>
                      <option value="Comida & Bebida">Comida & Bebida</option>
                      <option value="Entretenimiento">Entretenimiento</option>
                      <option value="Otro">Otro</option>
                    </select>
                  </div>

                  <div className="flex items-center justify-between self-end pb-2">
                    <label className="flex items-center space-x-2 cursor-pointer text-xs font-semibold text-zinc-800">
                      <input
                        type="checkbox"
                        checked={useItems}
                        onChange={(e) => setUseItems(e.target.checked)}
                        className="w-4 h-4 accent-emerald-600 rounded cursor-pointer"
                      />
                      <span>Desglosar en Ítems</span>
                    </label>
                  </div>
                </div>

                {/* Itemized list if enabled */}
                {useItems && (
                  <div className="bg-zinc-50 p-4 rounded-2xl border border-zinc-200 space-y-3">
                    <div className="flex items-center justify-between text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                      <span>Producto / Ítem</span>
                      <span>Monto ($)</span>
                    </div>

                    {items.map((item, idx) => (
                      <div key={idx} className="flex items-center space-x-2">
                        <input
                          type="text"
                          placeholder="Ej: Carnes o verduras"
                          value={item.description}
                          onChange={(e) => handleItemChange(idx, 'description', e.target.value)}
                          className="flex-1 px-3 py-1.5 bg-white border border-zinc-200 rounded-lg text-xs focus:ring-1 focus:ring-zinc-900"
                        />
                        <input
                          type="number"
                          placeholder="0"
                          value={item.amount}
                          onChange={(e) => handleItemChange(idx, 'amount', e.target.value)}
                          className="w-24 px-3 py-1.5 bg-white border border-zinc-200 rounded-lg text-xs font-medium focus:ring-1 focus:ring-zinc-900"
                        />
                        {items.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveItemRow(idx)}
                            className="p-1.5 text-zinc-400 hover:text-rose-600 rounded"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}

                    <button
                      type="button"
                      onClick={handleAddItemRow}
                      className="flex items-center space-x-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800 pt-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Añadir ítem</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT COLUMN: Division Options ("Elegir opciones de división") */}
            <div className="p-6 sm:p-8 space-y-6 bg-zinc-50/50">
              
              {/* Quick Preset Buttons */}
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => applyQuickPreset('split')}
                  className={`w-full py-2.5 px-4 rounded-full text-xs font-semibold transition-all border ${
                    quickPreset === 'split'
                      ? 'bg-[#3da88a] text-white border-[#3da88a] shadow-sm'
                      : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-100'
                  }`}
                >
                  Dividir el gasto
                </button>

                <button
                  type="button"
                  onClick={() => applyQuickPreset('i_owe_all')}
                  className={`w-full py-2.5 px-4 rounded-full text-xs font-semibold transition-all border ${
                    quickPreset === 'i_owe_all'
                      ? 'bg-[#3da88a] text-white border-[#3da88a] shadow-sm'
                      : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-100'
                  }`}
                >
                  Debes la cantidad total
                </button>

                <button
                  type="button"
                  onClick={() => applyQuickPreset('they_owe_all')}
                  className={`w-full py-2.5 px-4 rounded-full text-xs font-semibold transition-all border ${
                    quickPreset === 'they_owe_all'
                      ? 'bg-[#3da88a] text-white border-[#3da88a] shadow-sm'
                      : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-100'
                  }`}
                >
                  Ellos deben la cantidad total
                </button>
              </div>

              {/* Split Mode Toolbar Buttons (=, 1.23, %, ≡, +/-) */}
              <div className="pt-2">
                <div className="inline-flex bg-white rounded-xl p-1 border border-zinc-200 shadow-sm w-full justify-between">
                  <button
                    type="button"
                    title="A partes iguales"
                    onClick={() => {
                      setSplitType('equal');
                      setQuickPreset('split');
                      setValidationError(null);
                    }}
                    className={`flex-1 py-2 rounded-lg text-sm font-bold flex items-center justify-center transition-all ${
                      splitType === 'equal'
                        ? 'bg-zinc-900 text-white shadow-xs'
                        : 'text-zinc-600 hover:bg-zinc-100'
                    }`}
                  >
                    =
                  </button>

                  <button
                    type="button"
                    title="Montos exactos"
                    onClick={() => {
                      setSplitType('exact');
                      setQuickPreset('split');
                      setValidationError(null);
                    }}
                    className={`flex-1 py-2 rounded-lg text-xs font-bold flex items-center justify-center transition-all ${
                      splitType === 'exact'
                        ? 'bg-zinc-900 text-white shadow-xs'
                        : 'text-zinc-600 hover:bg-zinc-100'
                    }`}
                  >
                    1.23
                  </button>

                  <button
                    type="button"
                    title="Porcentajes"
                    onClick={() => {
                      setSplitType('percentage');
                      setQuickPreset('split');
                      setValidationError(null);
                    }}
                    className={`flex-1 py-2 rounded-lg text-sm font-bold flex items-center justify-center transition-all ${
                      splitType === 'percentage'
                        ? 'bg-zinc-900 text-white shadow-xs'
                        : 'text-zinc-600 hover:bg-zinc-100'
                    }`}
                  >
                    %
                  </button>

                  <button
                    type="button"
                    title="Por cuotas/partes"
                    onClick={() => {
                      setSplitType('shares');
                      setQuickPreset('split');
                      setValidationError(null);
                    }}
                    className={`flex-1 py-2 rounded-lg text-sm font-bold flex items-center justify-center transition-all ${
                      splitType === 'shares'
                        ? 'bg-zinc-900 text-white shadow-xs'
                        : 'text-zinc-600 hover:bg-zinc-100'
                    }`}
                  >
                    ≡
                  </button>
                </div>
              </div>

              {/* Title for current mode */}
              <div>
                <h3 className="text-base font-semibold text-zinc-900 tracking-tight">
                  {splitType === 'equal' && 'Dividir a partes iguales'}
                  {splitType === 'exact' && 'Dividir por montos exactos'}
                  {splitType === 'percentage' && 'Dividir por porcentaje'}
                  {splitType === 'shares' && 'Dividir por cuotas'}
                </h3>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {splitType === 'equal' && 'El total se distribuye equitativamente.'}
                  {splitType === 'exact' && 'Ingresa el monto específico para cada integrante.'}
                  {splitType === 'percentage' && 'Asigna un porcentaje (%) a cada integrante (debe sumar 100%).'}
                  {splitType === 'shares' && 'Asigna la cantidad de partes/cuotas a cada integrante.'}
                </p>
              </div>

              {/* Member Selection List */}
              <div className="space-y-3">
                {memberProfiles.map((p) => {
                  const isChecked = selectedMemberIds.includes(p.id);

                  return (
                    <div
                      key={p.id}
                      className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                        isChecked
                          ? 'bg-white border-zinc-200 shadow-xs'
                          : 'bg-zinc-100/60 border-zinc-200/60 opacity-60'
                      }`}
                    >
                      <label className="flex items-center space-x-3 cursor-pointer flex-1">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleMemberSelection(p.id)}
                          className="w-4 h-4 accent-[#3da88a] rounded cursor-pointer"
                        />
                        
                        {p.avatar_url ? (
                          <Image
                            src={p.avatar_url}
                            alt={p.full_name}
                            width={28}
                            height={28}
                            className="w-7 h-7 rounded-full object-cover border border-zinc-200"
                            unoptimized
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-zinc-700 text-white flex items-center justify-center text-[10px] font-bold">
                            {p.full_name ? p.full_name.charAt(0).toUpperCase() : 'U'}
                          </div>
                        )}

                        <span className={`text-sm font-medium ${isChecked ? 'text-zinc-900' : 'text-zinc-500'}`}>
                          {p.full_name} {p.id === currentProfile?.id ? '(Tú)' : ''}
                        </span>
                      </label>

                      {/* Display or edit inputs for individual member shares */}
                      <div className="text-right pl-2">
                        {splitType === 'equal' && isChecked && (
                          <span className="text-sm font-semibold text-zinc-800">
                            {formatCurrency(equalPerPerson)}
                          </span>
                        )}

                        {splitType === 'exact' && isChecked && (
                          <div className="flex items-center space-x-1">
                            <span className="text-xs text-zinc-400 font-semibold">$</span>
                            <input
                              type="number"
                              step="any"
                              placeholder="0.00"
                              value={customSplits[p.id] !== undefined ? customSplits[p.id] : ''}
                              onChange={(e) => handleCustomSplitChange(p.id, e.target.value)}
                              className="w-24 px-2.5 py-1 bg-white border border-zinc-200 rounded-lg text-right font-semibold text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                            />
                          </div>
                        )}

                        {splitType === 'percentage' && isChecked && (
                          <div className="flex items-center space-x-1">
                            <input
                              type="number"
                              step="any"
                              placeholder="0"
                              value={customSplits[p.id] !== undefined ? customSplits[p.id] : ''}
                              onChange={(e) => handleCustomSplitChange(p.id, e.target.value)}
                              className="w-16 px-2 py-1 bg-white border border-zinc-200 rounded-lg text-right font-semibold text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                            />
                            <span className="text-xs text-zinc-500 font-bold">%</span>
                          </div>
                        )}

                        {splitType === 'shares' && isChecked && (
                          <div className="flex items-center space-x-1">
                            <input
                              type="number"
                              step="1"
                              placeholder="1"
                              value={customSplits[p.id] !== undefined ? customSplits[p.id] : '1'}
                              onChange={(e) => handleCustomSplitChange(p.id, e.target.value)}
                              className="w-16 px-2 py-1 bg-white border border-zinc-200 rounded-lg text-right font-semibold text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                            />
                            <span className="text-xs text-zinc-500 font-medium">partes</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

            </div>

          </div>

          {/* Bottom Action Footer */}
          <div className="p-6 bg-zinc-50 border-t border-zinc-200 flex items-center justify-end space-x-3">
            <button
              type="button"
              onClick={resetAndClose}
              className="px-6 py-2.5 rounded-full border border-zinc-300 bg-white hover:bg-zinc-100 text-zinc-700 text-xs font-semibold transition-colors"
            >
              Cancelar
            </button>

            <button
              type="submit"
              className="px-8 py-2.5 rounded-full bg-[#3da88a] hover:bg-[#349378] text-white text-xs font-semibold shadow-sm transition-all active:scale-95"
            >
              {isEditing ? 'Guardar Cambios' : 'Guardar'}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}
