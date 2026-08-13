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
import { getCategoryConfig } from '@/lib/expense-category-utils';

interface NewExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultGroupId?: string;
  expenseToEdit?: Expense | null;
}

const CATEGORY_GROUPS: Record<string, string[]> = {
  'Alimentos': ['Supermercado', 'Restaurante', 'Cafetería', 'Delivery', 'Bar'],
  'Hogar': ['Alquiler', 'Servicios', 'Internet', 'Limpieza', 'Mascotas', 'Hogar'],
  'Transporte': ['Gasolina', 'Taxi', 'Uber', 'Transporte público', 'Vuelo', 'Peaje'],
  'Entretenimiento': ['Cine', 'Evento', 'Gimnasio', 'Hotel', 'Entretenimiento'],
  'Salud': ['Salud', 'Farmacia', 'Médico'],
  'Otros': ['Regalo', 'Tienda', 'General', 'Otros']
};

export function NewExpenseModal({ isOpen, onClose, defaultGroupId, expenseToEdit }: NewExpenseModalProps) {
  const { currentProfile, userGroups, members, profiles, addExpense, updateExpense } = useExpense();

  const [mode, setMode] = useState<'quick' | 'itemized'>('quick');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form State
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');

  // Categories
  const [subCategory, setSubCategory] = useState('Supermercado');

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

  const [step, setStep] = useState(1);
  const [isItemizedVerticalView, setIsItemizedVerticalView] = useState(false);
  const [isTableExpanded, setIsTableExpanded] = useState(false);
  const [expandedParticipant, setExpandedParticipant] = useState<string | null>(null);

  // Computed
  const activeGroup = userGroups.find(g => g.id === groupId);
  const currency = activeGroup?.currency || currentProfile?.currency || 'COP';

  const activeProfiles = useMemo(() => {
    if (!groupId || groupId === 'none') return currentProfile ? [currentProfile] : [];
    const groupMemberIds = members.filter(m => m.group_id === groupId).map(m => m.user_id);
    return profiles.filter(p => groupMemberIds.includes(p.id));
  }, [groupId, members, profiles, currentProfile]);

  const [hasInitialized, setHasInitialized] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setHasInitialized(false);
      return;
    }
    if (hasInitialized) return;

    if (expenseToEdit) {
      setMode(expenseToEdit.items && expenseToEdit.items.length > 0 ? 'itemized' : 'quick');
      setAmount(String(expenseToEdit.total_amount || ''));
      setDescription(expenseToEdit.description);

      let foundSub = 'General';
      if (expenseToEdit.category) {
        for (const [main, subs] of Object.entries(CATEGORY_GROUPS)) {
          if (subs.includes(expenseToEdit.category)) {
            foundSub = expenseToEdit.category;
            break;
          }
        }
        if (foundSub === 'General' && expenseToEdit.category !== 'General') foundSub = expenseToEdit.category;
      }
      setSubCategory(foundSub);

      setDate(expenseToEdit.expense_date);
      setPaidById(expenseToEdit.paid_by);
      setGroupId(expenseToEdit.group_id || 'none');
      setReceiptUrl(expenseToEdit.receipt_url || '');
      setNotes(expenseToEdit.notes || '');
      setShowNoteInput(!!expenseToEdit.notes);
      if (expenseToEdit.notes || expenseToEdit.receipt_url) setShowAdditional(true);

      if (expenseToEdit.items && expenseToEdit.items.length > 0) {
        setItems(expenseToEdit.items.map((i, idx) => ({
          id: idx + 1,
          desc: i.description,
          quantity: '1',
          amount: String(i.amount),
          amountType: 'total',
          assignedTo: [] // We don't restore exact complex splits per item in edit mode yet for simplicity
        })));
      }

      if (expenseToEdit.splits && expenseToEdit.splits.length > 0) {
        const selected = expenseToEdit.splits.map(s => s.user_id);
        setSelectedMembers(selected);
        const newSplits: Record<string, any> = {};
        let isExact = false;
        const expected = (expenseToEdit.total_amount || 0) / selected.length;
        expenseToEdit.splits.forEach(s => {
          newSplits[s.user_id] = { exact: String(s.amount_owed), pct: '', shares: '1' };
          if (Math.abs(s.amount_owed - expected) > 0.05) isExact = true;
        });
        setSplits(newSplits);
        setSplitType(expenseToEdit.items && expenseToEdit.items.length > 0 ? 'itemized' : (isExact ? 'exact' : 'equal'));
      }
    } else {
      setMode('quick');
      setAmount('');
      setDescription('');
      setSubCategory('Supermercado');
      setDate(new Date().toISOString().split('T')[0]);
      setGroupId(defaultGroupId && userGroups.some(g => g.id === defaultGroupId) ? defaultGroupId : (userGroups[0]?.id || 'none'));
      setReceiptUrl('');
      setNotes('');
      setShowAdditional(false);
      setShowNoteInput(false);
      setItems([{ id: 1, desc: '', quantity: '1', amount: '', amountType: 'each', assignedTo: [] }]);
      setSplitType('equal');
      setStep(1);
    }
    setError(null);
    setHasInitialized(true);
  }, [isOpen, hasInitialized, expenseToEdit, defaultGroupId, userGroups]);

  useEffect(() => {
    if (!isOpen || expenseToEdit) return;
    if (activeProfiles.length > 0) {
      if (!activeProfiles.find(p => p.id === paidById)) {
        setPaidById(currentProfile && activeProfiles.find(p => p.id === currentProfile.id) ? currentProfile.id : activeProfiles[0].id);
      }
      setSelectedMembers(activeProfiles.map(p => p.id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProfiles, isOpen, expenseToEdit]);

  const getItemTotal = (item: any) => {
    const qty = parseFloat(item.quantity) || 1;
    const amt = parseFloat(item.amount) || 0;
    return item.amountType === 'each' ? qty * amt : amt;
  };

  const itemsTotal = items.reduce((acc, i) => acc + getItemTotal(i), 0);
  const totalAmount = mode === 'quick' ? (parseFloat(amount) || 0) : itemsTotal;

  const calculateItemizedShares = () => {
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
  };

  const handleSubmit = async () => {
    setError(null);

    if (!description.trim()) return setError('Ingresa una descripción.');
    if (totalAmount <= 0) return setError('El monto total debe ser mayor a 0.');
    if (!paidById) return setError('Selecciona quién pagó.');
    if (mode === 'itemized' && items.some(i => !i.desc.trim() || !(parseFloat(i.amount) > 0))) {
      return setError('Completa la descripción y monto de todos los artículos.');
    }
    if (selectedMembers.length === 0) return setError('Selecciona al menos un participante.');

    let finalSplits: any[] = [];
    if (splitType === 'equal') {
      const share = totalAmount / selectedMembers.length;
      finalSplits = selectedMembers.map(id => ({ user_id: id, amount_owed: share }));
    } else if (splitType === 'exact') {
      let sum = 0;
      selectedMembers.forEach(id => sum += parseFloat(splits[id]?.exact || '0'));
      if (Math.abs(sum - totalAmount) > 0.05) return setError('La suma exacta no coincide con el total.');
      finalSplits = selectedMembers.map(id => ({ user_id: id, amount_owed: parseFloat(splits[id]?.exact || '0') }));
    } else if (splitType === 'percentage') {
      let sum = 0;
      selectedMembers.forEach(id => sum += parseFloat(splits[id]?.pct || '0'));
      if (Math.abs(sum - 100) > 0.05) return setError('La suma de porcentajes debe ser 100%.');
      finalSplits = selectedMembers.map(id => ({ user_id: id, amount_owed: totalAmount * (parseFloat(splits[id]?.pct || '0') / 100) }));
    } else if (splitType === 'shares') {
      let sum = 0;
      selectedMembers.forEach(id => sum += parseFloat(splits[id]?.shares || '1'));
      if (sum <= 0) return setError('La suma de cuotas debe ser mayor a 0.');
      finalSplits = selectedMembers.map(id => ({ user_id: id, amount_owed: totalAmount * (parseFloat(splits[id]?.shares || '1') / sum) }));
    } else if (splitType === 'itemized') {
      const shares = calculateItemizedShares();
      finalSplits = selectedMembers.map(id => ({ user_id: id, amount_owed: shares[id] || 0 }));
    }

    setIsSubmitting(true);
    try {
      const payload = {
        group_id: (groupId === 'none' ? null : groupId) as any,
        paid_by: paidById,
        total_amount: totalAmount,
        description: description.trim(),
        category: subCategory,
        expense_date: date,
        source: 'manual' as const,
        receipt_url: receiptUrl || undefined,
        notes: notes.trim() || undefined,
        created_by: currentProfile?.id || paidById,
      };

      const finalItems = mode === 'itemized' ? items.map((i, idx) => ({
        id: "tmp_" + idx,
        expense_id: expenseToEdit?.id || '',
        description: i.quantity && parseFloat(i.quantity) > 1 ? `${i.quantity}x ${i.desc.trim()}` : i.desc.trim(),
        amount: getItemTotal(i),
        created_at: new Date().toISOString()
      })) : [];

      if (expenseToEdit) {
        await updateExpense(expenseToEdit.id, payload, finalItems, finalSplits);
      } else {
        await addExpense(payload, finalItems, finalSplits);
      }
      onClose();
    } catch (err: any) {
      setError(err.message || 'Error al guardar el gasto.');
    } finally {
      setIsSubmitting(false);
    }
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-zinc-950/40 backdrop-blur-md overflow-y-auto">
      <div className={`bg-white rounded-[24px] shadow-2xl w-full flex flex-col my-auto max-h-[95vh] overflow-hidden transition-all duration-300 ${isTableExpanded ? 'max-w-4xl' : 'max-w-md'}`}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 shrink-0">
          <div className="flex items-center space-x-3">
            <h2 className="text-lg font-bold text-zinc-900 tracking-tight">
              {expenseToEdit ? 'Editar gasto' : 'Nuevo gasto'}
            </h2>
            {!expenseToEdit && (
              <div className="flex p-0.5 bg-zinc-100/80 rounded-lg shadow-inner ml-2">
                <button
                  onClick={() => {
                    setMode('quick');
                    setSplitType('equal');
                    setStep(1);
                  }}
                  className={`px-2.5 py-1 text-xs font-bold rounded-md transition-all flex items-center justify-center gap-1.5 ${mode === 'quick' ? 'bg-white shadow-sm text-zinc-900' : 'text-zinc-500 hover:text-zinc-900'}`}
                >
                  Simple
                </button>
                <button
                  onClick={() => {
                    setMode('itemized');
                    setSplitType('itemized');
                    setStep(1);
                  }}
                  className={`px-2.5 py-1 text-xs font-bold rounded-md transition-all flex items-center justify-center gap-1.5 ${mode === 'itemized' ? 'bg-white shadow-sm text-zinc-900' : 'text-zinc-500 hover:text-zinc-900'}`}
                >
                  Detallado
                </button>
              </div>
            )}
          </div>
          <button onClick={onClose} className="p-2 -mr-2 rounded-full hover:bg-zinc-100 text-zinc-500 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="bg-rose-50 px-6 py-3 border-b border-rose-100 flex items-center text-sm font-medium text-rose-700 shrink-0">
            <AlertCircle className="w-4 h-4 mr-2 shrink-0" /> {error}
          </div>
        )}

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">

          {step === 1 && (
            <>
              {/* Amount and Description */}
              <div className="space-y-3">
                <div className="flex items-center justify-between px-1">
                  <h3 className="text-sm font-bold text-zinc-900 flex items-center">
                    <FileText className="w-4 h-4 mr-2 text-emerald-600" />
                    Información general
                  </h3>
                </div>
                <div className="flex items-center gap-4 bg-white p-4 rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
                  {(() => {
                    const catConfig = getCategoryConfig(subCategory);
                    const CategoryIcon = catConfig.icon;
                    return (
                      <div className={`w-12 h-12 rounded-full ${catConfig.bgClass} flex items-center justify-center shrink-0 border border-black/5`}>
                        <CategoryIcon className={`w-6 h-6 ${catConfig.textClass}`} />
                      </div>
                    );
                  })()}

                  <div className="flex-1 flex flex-col gap-2">
                    <input
                      type="text"
                      value={description}
                      onChange={e => setDescription(e.target.value)}
                      placeholder="Introduce una descripción."
                      className="w-full text-left text-lg text-zinc-800 bg-transparent border-b border-dashed border-zinc-300 pb-1 focus:outline-none focus:ring-0 placeholder:text-zinc-400 focus:border-zinc-500 transition-colors"
                    />

                    {mode === 'quick' ? (
                      <div className="flex items-center text-lg font-bold text-zinc-900 border-b border-dashed border-zinc-300 pb-1 focus-within:border-zinc-500 transition-colors">
                        <span className="mr-1">{currency === 'COP' ? '$' : currency === 'EUR' ? '€' : '$'}</span>
                        <FormattedCurrencyInput
                          value={amount}
                          onChange={setAmount}
                          currency={currency}
                          hideSymbol
                          className="bg-transparent text-left focus:outline-none w-full placeholder:text-zinc-300 text-lg font-bold text-zinc-900"
                          placeholder="0"
                          autoFocus
                        />
                      </div>
                    ) : itemsTotal > 0 ? (
                      <div className="flex items-center text-lg font-bold text-zinc-400 border-b border-dashed border-zinc-300 pb-1">
                        <span className="mr-1">{currency === 'COP' ? '$' : currency === 'EUR' ? '€' : '$'}</span>
                        <span>{itemsTotal.toLocaleString('es-CO')}</span>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              {/* Context Details */}
              <div className="space-y-3">
                <div className="flex items-center justify-between px-1">
                  <h3 className="text-sm font-bold text-zinc-900 flex items-center">
                    <ListChecks className="w-4 h-4 mr-2 text-emerald-600" />
                    Detalles
                  </h3>
                </div>
                <div className="bg-white border border-zinc-200 rounded-2xl p-3 space-y-2 shadow-sm overflow-hidden">
                  <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider pl-0.5">Grupo</label>
                      <div className="relative shadow-sm rounded-lg bg-white border border-zinc-200">
                        <select
                          value={groupId}
                          onChange={e => setGroupId(e.target.value)}
                          className="w-full pl-2.5 pr-8 py-1.5 text-xs font-semibold text-zinc-900 appearance-none bg-transparent focus:outline-none focus:ring-2 focus:ring-emerald-500/20 rounded-lg"
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
                      <div className="relative shadow-sm rounded-lg bg-white border border-zinc-200">
                        <select
                          value={paidById}
                          onChange={e => setPaidById(e.target.value)}
                          className="w-full pl-2.5 pr-8 py-1.5 text-xs font-semibold text-zinc-900 appearance-none bg-transparent focus:outline-none focus:ring-2 focus:ring-emerald-500/20 rounded-lg"
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
                      <div className="relative shadow-sm rounded-lg bg-white border border-zinc-200">
                        <select
                          value={subCategory}
                          onChange={e => setSubCategory(e.target.value)}
                          className="w-full pl-2.5 pr-8 py-1.5 text-xs font-semibold text-zinc-900 appearance-none bg-transparent focus:outline-none focus:ring-2 focus:ring-emerald-500/20 rounded-lg"
                        >
                          {Object.entries(CATEGORY_GROUPS).map(([main, subs]) => (
                            <optgroup key={main} label={main}>
                              {subs.map(sub => (
                                <option key={sub} value={sub}>{sub}</option>
                              ))}
                            </optgroup>
                          ))}
                          {!Object.values(CATEGORY_GROUPS).flat().includes(subCategory) && (
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
                        className="w-full pl-2.5 pr-2.5 py-1.5 bg-white border border-zinc-200 rounded-lg text-xs font-semibold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 shadow-sm"
                      />
                    </div>
                  </div>

                  <div className="flex gap-2 pt-2 border-t border-zinc-100 mt-2">
                    <button
                      onClick={() => setShowNoteInput(!showNoteInput)}
                      className={`flex-1 flex items-center justify-center space-x-1.5 py-2 text-xs font-bold transition-all ${(showNoteInput || notes)
                          ? 'border border-solid bg-emerald-50 border-emerald-200 text-emerald-700 rounded-xl shadow-sm'
                          : 'border border-dashed border-zinc-300 rounded-xl text-zinc-500 hover:border-emerald-300 hover:text-emerald-600 bg-zinc-50/50 hover:bg-emerald-50/50'
                        }`}
                    >
                      {(showNoteInput || notes) ? <FileText className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                      <span>{notes ? 'Editar nota' : 'Añadir nota'}</span>
                    </button>
                    <button
                      onClick={() => fileRef.current?.click()}
                      disabled={isUploading}
                      className={`flex-1 flex items-center justify-center space-x-1.5 py-2 text-xs font-bold transition-all ${receiptUrl
                          ? 'border border-solid bg-emerald-50 border-emerald-200 text-emerald-700 rounded-xl shadow-sm'
                          : 'border border-dashed border-zinc-300 rounded-xl text-zinc-500 hover:border-emerald-300 hover:text-emerald-600 bg-zinc-50/50 hover:bg-emerald-50/50'
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
                        className="w-full px-4 py-3 bg-white border border-zinc-200 rounded-xl text-sm font-medium text-zinc-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 shadow-sm min-h-[80px] resize-y"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Itemized list in Step 1 */}
              {mode === 'itemized' && (
                <div className="space-y-3 pt-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-zinc-900 flex items-center">
                      <ShoppingCart className="w-4 h-4 mr-2 text-emerald-600" />
                      Ítems
                    </h3>
                  </div>
                  <div className="bg-white border border-zinc-200 rounded-2xl shadow-sm overflow-hidden">
                    <div className="px-3 pt-3 pb-2 flex items-center gap-2 border-b border-zinc-100">
                      <div className="flex-1 min-w-0 text-[10px] font-bold text-zinc-500 uppercase tracking-wider pl-1">Descripción</div>
                      <div className="w-12 shrink-0 text-[10px] font-bold text-zinc-500 uppercase tracking-wider text-center">Cant.</div>
                      <div className="w-20 shrink-0 text-[10px] font-bold text-zinc-500 uppercase tracking-wider text-right pr-2">Monto</div>
                      <div className="w-14 shrink-0 text-[10px] font-bold text-zinc-500 uppercase tracking-wider text-center">Tipo</div>
                      <div className="w-7 shrink-0"></div>
                    </div>

                    <div className="p-2 space-y-1">
                      {items.map((item, idx) => (
                        <div key={item.id} className="flex items-center gap-2 p-1 border border-transparent hover:border-zinc-100 hover:bg-zinc-50/50 rounded-xl transition-colors group">
                          <input
                            type="text"
                            placeholder="Ej. Pan"
                            value={item.desc}
                            onChange={e => {
                              const newItems = [...items];
                              newItems[idx].desc = e.target.value;
                              setItems(newItems);
                            }}
                            className="flex-1 min-w-0 px-2 py-1.5 bg-zinc-50 border border-zinc-200 focus:bg-white rounded-md text-xs font-semibold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-colors"
                          />
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
                            className="w-12 shrink-0 px-1 py-1.5 bg-zinc-50 border border-zinc-200 focus:bg-white rounded-md text-xs font-bold text-center text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-colors"
                          />
                          <div className="relative w-20 shrink-0">
                            <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-zinc-400 font-bold text-xs">$</span>
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
                              className="w-full pl-4 pr-1 py-1.5 bg-zinc-50 border border-zinc-200 focus:bg-white rounded-md text-xs font-bold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-colors text-right"
                            />
                          </div>
                          <select
                            value={item.amountType}
                            onChange={e => {
                              const newItems = [...items];
                              newItems[idx].amountType = e.target.value as 'each' | 'total';
                              setItems(newItems);
                            }}
                            className="w-14 shrink-0 px-1 py-1.5 bg-zinc-50 border border-zinc-200 focus:bg-white rounded-md text-[10px] font-bold text-zinc-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 appearance-none text-center cursor-pointer"
                          >
                            <option value="each">c/u</option>
                            <option value="total">Tot</option>
                          </select>
                          <div className="w-7 shrink-0 flex items-center justify-center">
                            <button
                              onClick={() => setItems(items.filter(i => i.id !== item.id))}
                              className={`p-1 text-zinc-400 hover:text-rose-500 transition-colors ${items.length > 1 ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                              disabled={items.length <= 1}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                      <div className="px-1 pt-1 pb-1">
                        <button
                          onClick={() => setItems([...items, { id: Date.now(), desc: '', quantity: '1', amount: '', amountType: 'each', assignedTo: [] }])}
                          className="w-full py-2 border border-dashed border-zinc-300 rounded-xl text-xs font-bold text-zinc-500 hover:border-emerald-300 hover:text-emerald-600 transition-colors flex items-center justify-center bg-zinc-50/50 hover:bg-emerald-50/50"
                        >
                          <Plus className="w-3.5 h-3.5 mr-1.5" />
                          Añadir otro artículo
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Unified Split Section (Step 2) */}
          {step === 2 && (
            <div className="space-y-5">

              {/* Participantes Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between px-1">
                  <h3 className="text-sm font-bold text-zinc-900 flex items-center">
                    <Users className="w-4 h-4 mr-2 text-emerald-600" />
                    Participantes
                  </h3>
                </div>
                <div className="bg-white border border-zinc-200 rounded-2xl shadow-sm overflow-hidden p-3">
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {activeProfiles.map(p => {
                      const isSelected = selectedMembers.includes(p.id);
                      const toggle = () => {
                        if (isSelected && selectedMembers.length > 1) setSelectedMembers(selectedMembers.filter(id => id !== p.id));
                        else if (!isSelected) setSelectedMembers([...selectedMembers, p.id]);
                      };
                      return (
                        <button
                          key={p.id}
                          onClick={toggle}
                          className={`flex items-center gap-1.5 p-1 pr-2 rounded-xl border transition-all w-full text-left ${isSelected ? 'bg-white border-zinc-300 shadow-sm' : 'bg-zinc-50 border-zinc-200 opacity-60 grayscale hover:grayscale-0 hover:opacity-100'}`}
                        >
                          {p.avatar_url ? (
                            <Image src={p.avatar_url} alt="avatar" width={24} height={24} className={`rounded-full shrink-0 w-6 h-6 object-cover border transition-all ${isSelected ? 'border-zinc-300' : 'border-transparent'}`} unoptimized />
                          ) : (
                            <div className={`w-6 h-6 shrink-0 rounded-full flex items-center justify-center border transition-all ${isSelected ? 'bg-zinc-100 border-zinc-300 text-zinc-900' : 'bg-zinc-200 border-transparent text-zinc-500'}`}>
                              <span className="text-[10px] font-bold">{(p.full_name || p.email || 'U').charAt(0).toUpperCase()}</span>
                            </div>
                          )}
                          <span className={`text-[11px] font-bold truncate ${isSelected ? 'text-zinc-900' : 'text-zinc-500'}`}>
                            {p.full_name?.split(' ')[0] || (p.email || 'U').split('@')[0]}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Cómo se divide Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between px-1">
                  <h3 className="text-sm font-bold text-zinc-900 flex items-center">
                    <PieChart className="w-4 h-4 mr-2 text-emerald-600" />
                    Dividir gasto
                  </h3>
                </div>

                <div className="flex gap-2 mb-2 px-1">
                  {(mode === 'itemized' ? ['itemized', 'equal', 'exact', 'shares'] : ['equal', 'exact', 'shares']).map(type => (
                    <button
                      key={type}
                      onClick={() => setSplitType(type as any)}
                      className={`flex-1 pb-2 text-xs font-bold border-b-2 transition-all ${splitType === type ? 'border-emerald-500 text-emerald-700' : 'border-transparent text-zinc-500 hover:text-zinc-900 hover:border-zinc-300'}`}
                    >
                      {type === 'equal' ? 'Iguales' : type === 'exact' ? 'Exacto' : type === 'shares' ? 'Cuotas' : 'Por artículo'}
                    </button>
                  ))}
                </div>

                <div className="bg-white border border-zinc-200 rounded-2xl shadow-sm overflow-hidden p-4 space-y-4">
                  {splitType !== 'itemized' && (
                    <div className="space-y-2">
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
                          <div key={p.id} className="flex items-center justify-between px-3 py-2 h-14 rounded-xl border bg-white border-zinc-200 shadow-sm">
                            <div className="flex items-center space-x-3 text-left flex-1 min-w-0">
                              {p.avatar_url ? (
                                <Image src={p.avatar_url} alt="avatar" width={24} height={24} className="rounded-full w-6 h-6 object-cover border border-zinc-200 shrink-0" unoptimized />
                              ) : (
                                <div className="w-6 h-6 rounded-full bg-zinc-800 text-white flex items-center justify-center text-[10px] font-bold shadow-sm shrink-0">
                                  {(p.full_name || p.email || 'U').charAt(0).toUpperCase()}
                                </div>
                              )}
                              <span className="text-sm font-bold text-zinc-900 truncate max-w-[120px]">
                                {p.full_name?.split(' ')[0] || p.email}
                                {p.id === currentProfile?.id && <span className="text-zinc-400 font-medium ml-1">(Tú)</span>}
                              </span>
                            </div>

                            {splitType === 'shares' && (
                              <div className="px-3 flex items-center gap-1.5 h-8 shrink-0">
                                <input
                                  type="number"
                                  min="1"
                                  placeholder="1"
                                  value={splits[p.id]?.shares || '1'}
                                  onChange={e => setSplits({ ...splits, [p.id]: { ...splits[p.id], shares: e.target.value } })}
                                  className="w-12 px-1 h-8 bg-zinc-50 focus:bg-white border border-zinc-200 rounded-lg text-center text-sm font-bold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 shadow-sm transition-colors"
                                />
                                <span className="text-[10px] font-bold text-zinc-500 uppercase leading-none">cuotas</span>
                              </div>
                            )}

                            <div className="shrink-0 flex justify-end items-center">
                              {splitType === 'equal' && (
                                <span className="text-sm font-black text-emerald-700 flex items-center h-8">
                                  {formatCurrency(totalAmount / selectedMembers.length, currency)}
                                </span>
                              )}
                              {splitType === 'exact' && (
                                <div className="relative flex items-center h-8">
                                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 font-bold text-xs">$</span>
                                  <FormattedCurrencyInput
                                    value={splits[p.id]?.exact || ''}
                                    onChange={val => setSplits({ ...splits, [p.id]: { ...splits[p.id], exact: val } })}
                                    currency={currency}
                                    hideSymbol
                                    className="w-24 pl-5 pr-2 py-1 h-8 bg-zinc-50 focus:bg-white border border-zinc-200 rounded-lg text-right text-sm font-bold text-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 shadow-sm transition-colors"
                                    placeholder="0.00"
                                  />
                                </div>
                              )}
                              {splitType === 'shares' && (
                                <span className="text-sm font-black text-emerald-700 flex items-center h-8">
                                  {formatCurrency(liveAmountShares, currency)}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {splitType === 'itemized' && mode === 'itemized' && (
                    <div className="mt-4 flex flex-col space-y-3">
                      <div className="flex justify-end gap-2">
                        {!isItemizedVerticalView && (
                          <button
                            onClick={() => setIsTableExpanded(!isTableExpanded)}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-zinc-600 bg-white border border-zinc-200 rounded-lg shadow-sm hover:bg-zinc-50 transition-colors"
                          >
                            {isTableExpanded ? (
                              <>
                                <ArrowLeft className="w-3.5 h-3.5" />
                                <span>Contraer tabla</span>
                              </>
                            ) : (
                              <>
                                <ArrowRight className="w-3.5 h-3.5" />
                                <span>Expandir tabla</span>
                              </>
                            )}
                          </button>
                        )}
                        <button
                          onClick={() => setIsItemizedVerticalView(!isItemizedVerticalView)}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-zinc-600 bg-white border border-zinc-200 rounded-lg shadow-sm hover:bg-zinc-50 transition-colors"
                        >
                          {isItemizedVerticalView ? (
                            <>
                              <Table className="w-3.5 h-3.5" />
                              <span>Vista tabla</span>
                            </>
                          ) : (
                            <>
                              <List className="w-3.5 h-3.5" />
                              <span>Vista vertical</span>
                            </>
                          )}
                        </button>
                      </div>

                      {!isItemizedVerticalView ? (
                        <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm relative flex-1">
                          <table className="w-full text-left border-collapse min-w-max">
                            <thead>
                              <tr>
                                <th rowSpan={2} className="px-4 pt-3 pb-2 text-[10px] font-bold text-zinc-500 uppercase tracking-wider whitespace-nowrap align-bottom border-r border-zinc-200 bg-zinc-50/50">
                                  Ítems
                                </th>
                                <th colSpan={selectedMembers.length} className="px-2 pt-2 pb-1 border-b border-zinc-100 bg-white">
                                  <div className="flex items-center justify-center relative">
                                    <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider">Participaciones</span>
                                  </div>
                                </th>
                              </tr>
                              <tr className="border-b border-zinc-100 bg-white">
                                {selectedMembers.map(mId => {
                                  const p = activeProfiles.find(x => x.id === mId);
                                  return (
                                    <th key={mId} className="w-16 min-w-[64px] px-1 py-1.5 text-[10px] font-bold text-zinc-500 uppercase tracking-wider text-center truncate">
                                      {p?.full_name?.split(' ')[0] || 'User'}
                                    </th>
                                  );
                                })}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-100">
                              {items.map((item, idx) => {
                                const itemQty = parseFloat(item.quantity) || 1;
                                return (
                                  <tr key={item.id} className="hover:bg-zinc-50/50 transition-colors group">
                                    <td className="px-4 py-2 text-xs font-bold text-zinc-900 border-r border-zinc-200 whitespace-nowrap">
                                      {`${itemQty} · ${item.desc}`}
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
                                            className="w-12 mx-auto px-1 py-1 bg-white border border-zinc-200 rounded text-center text-xs font-bold text-zinc-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 shadow-sm transition-colors"
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
                        <div className="space-y-3">
                          {items.map((item, idx) => {
                            const itemQty = parseFloat(item.quantity) || 1;
                            const amt = getItemTotal(item);
                            return (
                              <div key={item.id} className="bg-white border border-zinc-200 rounded-2xl shadow-sm p-3">
                                <div className="flex items-center justify-between mb-2">
                                  <span className="font-bold text-zinc-900 text-sm truncate pr-2">
                                    {itemQty} · {item.desc || 'Sin nombre'}
                                  </span>
                                  <span className="font-black text-emerald-700 text-sm shrink-0">
                                    {formatCurrency(amt, currency)}
                                  </span>
                                </div>
                                <div className="space-y-1.5 border-t border-zinc-100 pt-2">
                                  {selectedMembers.map(mId => {
                                    const p = activeProfiles.find(x => x.id === mId);
                                    if (!p) return null;
                                    const val = item.shares?.[mId] !== undefined ? item.shares[mId] : (item.assignedTo.length === 0 || item.assignedTo.includes(mId) ? '1' : '0');
                                    
                                    return (
                                      <div key={mId} className="flex items-center justify-between py-1 border-b border-zinc-50 last:border-0">
                                        <div className="flex items-center space-x-2 flex-1 min-w-0 pr-2">
                                          {p.avatar_url ? (
                                            <Image src={p.avatar_url} alt="avatar" width={20} height={20} className="rounded-full w-5 h-5 object-cover border border-zinc-200 shrink-0" unoptimized />
                                          ) : (
                                            <div className="w-5 h-5 rounded-full bg-zinc-800 text-white flex items-center justify-center text-[9px] font-bold shadow-sm shrink-0">
                                              {(p.full_name || p.email || 'U').charAt(0).toUpperCase()}
                                            </div>
                                          )}
                                          <span className="text-xs font-semibold text-zinc-700 truncate">
                                            {p.full_name?.split(' ')[0] || p.email}
                                          </span>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
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
                                            className="w-12 h-7 px-1 bg-zinc-50 border border-zinc-200 rounded text-center text-xs font-bold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                                          />
                                          <span className="text-[10px] font-bold text-zinc-400">cuotas</span>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
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
                <div className="space-y-3 mt-6">
                  <div className="flex items-center justify-between px-1">
                    <h3 className="text-sm font-bold text-zinc-900 flex items-center">
                      <ListChecks className="w-4 h-4 mr-2 text-emerald-600" />
                      Resumen por participante
                    </h3>
                  </div>
                  <div className="bg-white border border-zinc-200 rounded-2xl shadow-sm overflow-hidden p-2 space-y-1">
                    {selectedMembers.map(mId => {
                      const p = activeProfiles.find(x => x.id === mId);
                      if (!p) return null;
                      const sharesMap = calculateItemizedShares();
                      const amt = sharesMap[mId] || 0;

                      const breakdown: { desc: string; qty: number; cost: number; shareQty: number }[] = [];
                      items.forEach((item, idx) => {
                        const itemAmt = getItemTotal(item);
                        const val = item.shares?.[mId] !== undefined ? parseFloat(item.shares[mId] as string) || 0 : (item.assignedTo.length === 0 || item.assignedTo.includes(mId) ? 1 : 0);
                        if (val > 0) {
                          let sumShares = 0;
                          selectedMembers.forEach(id => {
                            sumShares += item.shares?.[id] !== undefined ? parseFloat(item.shares[id] as string) || 0 : (item.assignedTo.length === 0 || item.assignedTo.includes(id) ? 1 : 0);
                          });
                          if (sumShares > 0) {
                            breakdown.push({
                              desc: item.desc || `Art ${idx + 1}`,
                              qty: parseFloat(item.quantity) || 1,
                              shareQty: val,
                              cost: itemAmt * (val / sumShares)
                            });
                          }
                        }
                      });

                      const isExpanded = expandedParticipant === mId;

                      return (
                        <div key={p.id} className="flex flex-col p-2 rounded-xl border border-transparent hover:bg-zinc-50 transition-colors">
                          <div
                            className="flex items-center justify-between cursor-pointer"
                            onClick={() => setExpandedParticipant(isExpanded ? null : mId)}
                          >
                            <div className="flex items-center space-x-3 text-left">
                              {p.avatar_url ? (
                                <Image src={p.avatar_url} alt="avatar" width={24} height={24} className="rounded-full w-6 h-6 object-cover border border-zinc-200 shrink-0" unoptimized />
                              ) : (
                                <div className="w-6 h-6 rounded-full bg-zinc-800 text-white flex items-center justify-center text-[10px] font-bold shadow-sm shrink-0">
                                  {(p.full_name || p.email || 'U').charAt(0).toUpperCase()}
                                </div>
                              )}
                              <span className="text-sm font-bold text-zinc-900 truncate max-w-[120px]">
                                {p.full_name?.split(' ')[0] || p.email}
                                {p.id === currentProfile?.id && <span className="text-zinc-400 font-medium ml-1">(Tú)</span>}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-sm font-black text-emerald-700">
                              {formatCurrency(amt, currency)}
                              {isExpanded ? <ChevronUp className="w-4 h-4 text-zinc-400" /> : <ChevronDown className="w-4 h-4 text-zinc-400" />}
                            </div>
                          </div>

                          {isExpanded && breakdown.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-zinc-100 space-y-2 px-1">
                              {breakdown.map((b, i) => (
                                <div key={i} className="flex items-center justify-between text-xs">
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">{b.shareQty} cuota{b.shareQty > 1 ? 's' : ''}</span>
                                    <span className="font-medium text-zinc-600 truncate max-w-[140px]">{b.qty}x {b.desc}</span>
                                  </div>
                                  <span className="font-bold text-zinc-900">{formatCurrency(b.cost, currency)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-5 border-t border-zinc-100 bg-white flex flex-col gap-3 rounded-b-[24px] shrink-0">
          <div className="flex justify-between items-center px-1">
            <span className="text-sm font-bold text-zinc-500">Total gasto</span>
            <span className="text-lg font-black text-zinc-900">{formatCurrency(totalAmount, currency)}</span>
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
                disabled={isSubmitting}
                className="flex-1 px-8 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl transition-all shadow-md active:scale-95 flex items-center justify-center disabled:opacity-50 cursor-pointer"
              >
                {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <CheckCircle2 className="w-5 h-5 mr-2" />}
                <span>{expenseToEdit ? 'Guardar Cambios' : 'Confirmar Gasto'}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
