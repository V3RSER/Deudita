'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import React, { useState, useRef, useMemo, useEffect } from 'react';
import Image from 'next/image';
import { useExpense } from '@/lib/expense-context';
import { Expense, ExpenseItem, ExpenseSplit } from '@/lib/types';
import { formatCurrency } from '@/lib/balance-utils';
import { FormattedCurrencyInput } from '@/components/FormattedCurrencyInput';
import {
  X, Plus, Trash2, Users, AlertCircle, Loader2,
  Check, ChevronDown, ShoppingCart, ArrowRight, ArrowLeft,
  CheckCircle2, Camera, FileText, Receipt, Wallet
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
  const [showNotes, setShowNotes] = useState(false);
  const [notes, setNotes] = useState('');
  const [receiptUrl, setReceiptUrl] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  
  // Itemized State
  const [items, setItems] = useState<Array<{ id: number; desc: string; quantity: string; amount: string; amountType: 'total' | 'each'; assignedTo: string[]; shares?: Record<string, string> }>>([{ id: 1, desc: '', quantity: '1', amount: '', amountType: 'each', assignedTo: [] }]);
  
  // Split State
  const [splitType, setSplitType] = useState<'equal' | 'exact' | 'percentage' | 'shares' | 'itemized'>('equal');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [splits, setSplits] = useState<Record<string, { exact: string; pct: string; shares: string }>>({});

  // Computed
  const activeGroup = userGroups.find(g => g.id === groupId);
  const currency = activeGroup?.currency || currentProfile?.currency || 'COP';
  
  const activeProfiles = useMemo(() => {
    if (!groupId || groupId === 'none') return currentProfile ? [currentProfile] : [];
    const groupMemberIds = members.filter(m => m.group_id === groupId).map(m => m.user_id);
    return profiles.filter(p => groupMemberIds.includes(p.id));
  }, [groupId, members, profiles, currentProfile]);

  useEffect(() => {
    if (isOpen) {
      if (expenseToEdit) {
        setMode(expenseToEdit.items && expenseToEdit.items.length > 0 ? 'itemized' : 'quick');
        setAmount(String(expenseToEdit.total_amount || ''));
        setDescription(expenseToEdit.description);
        
        // Match category
        let foundSub = 'General';
        if (expenseToEdit.category) {
          for (const [main, subs] of Object.entries(CATEGORY_GROUPS)) {
            if (subs.includes(expenseToEdit.category)) {
              foundSub = expenseToEdit.category;
              break;
            }
          }
          if (foundSub === 'General' && expenseToEdit.category !== 'General') {
             foundSub = expenseToEdit.category; // fallback
          }
        }
        setSubCategory(foundSub);
        
        setDate(expenseToEdit.expense_date);
        setPaidById(expenseToEdit.paid_by);
        setGroupId(expenseToEdit.group_id || 'none');
        setReceiptUrl(expenseToEdit.receipt_url || '');
        setNotes(expenseToEdit.notes || '');
        setShowNotes(!!expenseToEdit.notes);
        
        if (expenseToEdit.items && expenseToEdit.items.length > 0) {
          setItems(expenseToEdit.items.map((i, idx) => ({
            id: idx + 1,
            desc: i.description,
            quantity: '1',
            amount: String(i.amount),
            amountType: 'total',
            assignedTo: []
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
          setSplitType(isExact ? 'exact' : 'equal');
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
        setShowNotes(false);
        setItems([{ id: 1, desc: '', quantity: '1', amount: '', amountType: 'each', assignedTo: [] }]);
        setSplitType('equal');
      }
      setError(null);
    }
  }, [isOpen, expenseToEdit, defaultGroupId, userGroups]);

  // Sync paidById and selectedMembers when group changes
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
      const isAll = item.assignedTo.length === 0;
      const assigned = isAll ? selectedMembers : item.assignedTo.filter(id => selectedMembers.includes(id));
      
      let totalShares = 0;
      assigned.forEach(id => {
        totalShares += parseFloat(item.shares?.[id] ?? '1') || 0;
      });
      
      if (assigned.length > 0 && totalShares > 0 && amt > 0) {
        assigned.forEach(id => {
          const share = parseFloat(item.shares?.[id] ?? '1') || 0;
          res[id] = (res[id] || 0) + (share / totalShares) * amt;
        });
      }
    });
    return res;
  };

  const handleSubmit = async () => {
    setError(null);
    
    // Validation
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
        id: "tmp_"+idx,
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
      <div className="bg-white rounded-[24px] shadow-2xl w-full max-w-md flex flex-col my-auto max-h-[95vh] overflow-hidden">
        
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
                  }}
                  className={`px-2.5 py-1 text-xs font-bold rounded-md transition-all flex items-center justify-center gap-1.5 ${mode === 'quick' ? 'bg-white shadow-sm text-zinc-900' : 'text-zinc-500 hover:text-zinc-900'}`}
                >
                  Simple
                </button>
                <button
                  onClick={() => {
                    setMode('itemized');
                    setSplitType('itemized');
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
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8">
          
          {/* Amount and Description */}
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-zinc-100 flex items-center justify-center shrink-0 border border-zinc-200">
              <span className="text-xl font-black text-zinc-500">{subCategory.charAt(0).toUpperCase()}</span>
            </div>
            
            <div className="flex-1 flex flex-col border-b border-dashed border-zinc-300 pb-1">
              <input
                type="text"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Introduce una descripción."
                className="w-full text-left text-lg text-zinc-800 bg-transparent border-none focus:outline-none focus:ring-0 placeholder:text-zinc-400"
              />
              
              {mode === 'quick' ? (
                <div className="flex items-center text-lg font-bold text-zinc-900 mt-1">
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
              ) : (
                <div className="flex items-center text-lg font-bold text-zinc-400 mt-1">
                  <span className="mr-1">{currency === 'COP' ? '$' : currency === 'EUR' ? '€' : '$'}</span>
                  <span>{itemsTotal.toLocaleString('es-CO')}</span>
                </div>
              )}
            </div>
          </div>

          {/* Context Details (Group, Paid By, Category, Date) */}
          <div className="bg-zinc-50 border border-zinc-100 rounded-2xl p-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              
              {/* Group */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Grupo</label>
                <div className="relative shadow-sm rounded-xl bg-white border border-zinc-200">
                  <select
                    value={groupId}
                    onChange={e => setGroupId(e.target.value)}
                    className="w-full pl-3 pr-8 py-2 text-sm font-semibold text-zinc-900 appearance-none bg-transparent focus:outline-none focus:ring-2 focus:ring-emerald-500/20 rounded-xl"
                  >
                    <option value="none">Sin grupo</option>
                    {userGroups.map(g => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-zinc-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              {/* Paid By */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Pagado por</label>
                <div className="relative shadow-sm rounded-xl bg-white border border-zinc-200">
                  <select
                    value={paidById}
                    onChange={e => setPaidById(e.target.value)}
                    className="w-full pl-3 pr-8 py-2 text-sm font-semibold text-zinc-900 appearance-none bg-transparent focus:outline-none focus:ring-2 focus:ring-emerald-500/20 rounded-xl"
                  >
                    {activeProfiles.map(p => (
                      <option key={p.id} value={p.id}>{p.full_name?.split(' ')[0] || p.email}</option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-zinc-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              {/* Category */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Categoría</label>
                <div className="relative shadow-sm rounded-xl bg-white border border-zinc-200">
                  <select
                    value={subCategory}
                    onChange={e => setSubCategory(e.target.value)}
                    className="w-full pl-3 pr-8 py-2 text-sm font-semibold text-zinc-900 appearance-none bg-transparent focus:outline-none focus:ring-2 focus:ring-emerald-500/20 rounded-xl"
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
                  <ChevronDown className="w-4 h-4 text-zinc-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              {/* Date */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Fecha</label>
                <input
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-xl text-sm font-semibold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 shadow-sm"
                />
              </div>

            </div>

            {/* Attachments Row */}
            <div className="pt-2">
              <button
                onClick={() => setShowNotes(!showNotes)}
                className="text-xs font-bold text-zinc-500 hover:text-emerald-600 transition-colors flex items-center"
              >
                <Plus className={`w-3 h-3 mr-1 transition-transform ${showNotes ? 'rotate-45' : ''}`} />
                {showNotes ? 'Ocultar opciones adicionales' : 'Añadir nota o foto'}
              </button>
            </div>

            {(showNotes || notes || receiptUrl) && (
              <div className="flex gap-3 pt-2 animate-in fade-in slide-in-from-top-2 duration-200">
                <button
                  onClick={() => setShowNotes(true)}
                  className={`flex-1 flex items-center justify-center space-x-1.5 border rounded-xl py-2 text-sm font-semibold transition-all shadow-sm ${notes ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50'}`}
                >
                  <FileText className="w-4 h-4" />
                  <span>Nota</span>
                </button>
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={isUploading}
                  className={`flex-1 flex items-center justify-center space-x-1.5 border rounded-xl py-2 text-sm font-semibold transition-all shadow-sm ${receiptUrl ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50'}`}
                >
                  {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                  <span>Foto</span>
                </button>
                <input type="file" ref={fileRef} onChange={handleUpload} accept="image/*" className="hidden" />
              </div>
            )}

            {/* Notes Input */}
            {(showNotes || notes) && (
              <div className="animate-in fade-in slide-in-from-top-2 duration-200 pt-2">
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Añade notas o detalles adicionales (opcional)..."
                  className="w-full px-4 py-3 bg-white border border-zinc-200 rounded-xl text-sm font-medium text-zinc-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 shadow-sm min-h-[80px] resize-y"
                />
              </div>
            )}
          </div>

          {/* Itemized Builder */}
          {mode === 'itemized' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-zinc-900 flex items-center">
                  <ShoppingCart className="w-4 h-4 mr-2 text-emerald-600" />
                  Artículos
                </h3>
              </div>
              <div className="space-y-3 bg-white border border-zinc-200 rounded-2xl p-3 shadow-sm">
                {items.map((item, idx) => (
                  <div key={item.id} className="flex items-center gap-2 p-2 border border-zinc-100 bg-zinc-50/50 rounded-xl">
                    <input
                      type="text"
                      placeholder="Desc."
                      value={item.desc}
                      onChange={e => {
                        const newItems = [...items];
                        newItems[idx].desc = e.target.value;
                        setItems(newItems);
                      }}
                      className="w-full flex-[2.5] px-2 py-1.5 bg-white border border-zinc-200 rounded-md text-xs font-semibold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-colors"
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
                      className="w-12 px-1 py-1.5 bg-white border border-zinc-200 rounded-md text-xs font-bold text-center text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-colors shrink-0"
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
                        className="w-full pl-4 pr-1 py-1.5 bg-white border border-zinc-200 rounded-md text-xs font-bold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-colors"
                      />
                    </div>
                    <select
                      value={item.amountType}
                      onChange={e => {
                        const newItems = [...items];
                        newItems[idx].amountType = e.target.value as 'each' | 'total';
                        setItems(newItems);
                      }}
                      className="w-14 px-1 py-1.5 bg-white border border-zinc-200 rounded-md text-[10px] font-bold text-zinc-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 appearance-none text-center cursor-pointer shrink-0"
                    >
                      <option value="each">c/u</option>
                      <option value="total">Tot</option>
                    </select>
                    {items.length > 1 && (
                      <button onClick={() => setItems(items.filter(i => i.id !== item.id))} className="p-1 text-zinc-400 hover:text-rose-500 transition-colors shrink-0 ml-1">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
                <button
                  onClick={() => setItems([...items, { id: Date.now(), desc: '', quantity: '1', amount: '', amountType: 'each', assignedTo: [] }])}
                  className="w-full py-2 border border-dashed border-zinc-300 rounded-xl text-sm font-bold text-zinc-600 hover:text-emerald-600 hover:border-emerald-300 hover:bg-emerald-50 transition-all flex items-center justify-center cursor-pointer"
                >
                  <Plus className="w-4 h-4 mr-1.5" /> Añadir otro artículo
                </button>
              </div>
            </div>
          )}

          {/* Split Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-zinc-900">¿Cómo se divide?</h3>
              <div className="bg-zinc-100/80 p-1 rounded-xl flex shadow-inner">
                {(mode === 'itemized' ? ['itemized', 'equal'] : ['equal', 'exact', 'shares']).map(type => (
                  <button
                    key={type}
                    onClick={() => setSplitType(type as any)}
                    className={`px-3 py-1.5 text-[11px] sm:text-xs font-bold rounded-lg capitalize transition-all ${splitType === type ? 'bg-white shadow-sm text-zinc-900 scale-[1.02]' : 'text-zinc-500 hover:text-zinc-900'}`}
                  >
                    {type === 'equal' ? 'Iguales' : type === 'itemized' ? 'Artículos' : type === 'exact' ? 'Exacto' : 'Cuotas'}
                  </button>
                ))}
              </div>
            </div>

            {/* Split Type Content */}
            {splitType === 'itemized' && mode === 'itemized' ? (
              <div className="space-y-3">
                {items.map((item, idx) => {
                  const amt = getItemTotal(item);
                  const itemQty = parseFloat(item.quantity) || 1;
                  const isAll = item.assignedTo.length === 0;
                  const assigned = isAll ? selectedMembers : item.assignedTo.filter(id => selectedMembers.includes(id));
                  
                  let totalShares = 0;
                  assigned.forEach(id => {
                    totalShares += parseFloat(item.shares?.[id] ?? '1') || 0;
                  });

                  return (
                    <div key={item.id} className="p-3 bg-white border border-zinc-200 shadow-sm rounded-2xl space-y-2 transition-all">
                      <div className="flex justify-between items-center px-1 mb-1">
                        <p className="text-sm font-bold text-zinc-900">
                          {itemQty > 1 ? `${itemQty}x ` : ''}{item.desc || `Artículo ${idx + 1}`}
                        </p>
                        <div className="text-xs font-black text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-100">
                          {formatCurrency(amt, currency)}
                        </div>
                      </div>
                      
                      <div className="flex flex-col gap-1.5">
                        {activeProfiles.filter(p => selectedMembers.includes(p.id)).map(p => {
                          const isSel = isAll || item.assignedTo.includes(p.id);
                          const userShareStr = item.shares?.[p.id] ?? '1';
                          const userShareNum = parseFloat(userShareStr) || 0;
                          
                          const unitsConsumed = isSel && totalShares > 0 ? (userShareNum / totalShares) * itemQty : 0;
                          const amountToPay = isSel && totalShares > 0 ? (userShareNum / totalShares) * amt : 0;
                          
                          return (
                            <div key={p.id} className={`flex items-center justify-between p-2 rounded-xl border transition-all ${isSel ? 'bg-zinc-50 border-zinc-200' : 'opacity-50 border-transparent hover:bg-zinc-50 hover:opacity-100'}`}>
                              <button 
                                onClick={() => {
                                  const newItems = [...items];
                                  if (isAll) {
                                    newItems[idx].assignedTo = selectedMembers.filter(id => id !== p.id);
                                  } else {
                                    if (isSel) {
                                       newItems[idx].assignedTo = item.assignedTo.filter(id => id !== p.id);
                                    } else {
                                       newItems[idx].assignedTo = [...item.assignedTo, p.id];
                                    }
                                  }
                                  setItems(newItems);
                                }}
                                className="flex items-center gap-2 flex-1 text-left"
                              >
                                <div className={`w-4 h-4 rounded-[4px] flex items-center justify-center border transition-colors shrink-0 ${isSel ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-white border-zinc-300'}`}>
                                   {isSel && <Check className="w-3 h-3" />}
                                </div>
                                <span className="text-xs font-bold text-zinc-900 truncate">
                                  {p.full_name?.split(' ')[0] || p.email}
                                </span>
                              </button>
                              
                              {isSel && (
                                <div className="flex items-center gap-3 shrink-0 ml-2">
                                   <div className="flex items-center gap-1.5">
                                      <input 
                                        type="number" 
                                        min="0"
                                        step="0.1"
                                        value={item.shares?.[p.id] !== undefined ? item.shares[p.id] : '1'}
                                        onChange={e => {
                                           const newItems = [...items];
                                           if (!newItems[idx].shares) newItems[idx].shares = {};
                                           newItems[idx].shares![p.id] = e.target.value;
                                           setItems(newItems);
                                        }}
                                        className="w-12 px-1 py-1 text-center text-xs font-bold border border-zinc-200 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500/20 bg-white"
                                      />
                                      <div className="text-[10px] font-bold text-zinc-500 flex flex-col leading-tight min-w-[32px]">
                                        <span>unid.</span>
                                        <span className="text-emerald-600">({unitsConsumed % 1 === 0 ? unitsConsumed : unitsConsumed.toFixed(2)})</span>
                                      </div>
                                   </div>
                                   <div className="text-xs font-black text-zinc-900 w-16 text-right">
                                      {formatCurrency(amountToPay, currency)}
                                   </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-2">
                {activeProfiles.map(p => {
                  const isSelected = selectedMembers.includes(p.id);
                  const toggle = () => {
                    if (isSelected && selectedMembers.length > 1) setSelectedMembers(selectedMembers.filter(id => id !== p.id));
                    else if (!isSelected) setSelectedMembers([...selectedMembers, p.id]);
                  };
                  return (
                    <div key={p.id} className={`flex items-center p-3 rounded-2xl border transition-all ${isSelected ? 'bg-white border-zinc-200 shadow-sm' : 'bg-zinc-50 border-zinc-100 opacity-60 hover:opacity-100'}`}>
                      <button onClick={toggle} className="flex-1 flex items-center space-x-3 text-left group">
                        <div className={`w-5 h-5 rounded-[6px] flex items-center justify-center border transition-colors shrink-0 ${isSelected ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-white border-zinc-300 group-hover:border-emerald-300'}`}>
                          {isSelected && <Check className="w-3 h-3" />}
                        </div>
                        {p.avatar_url ? (
                          <Image src={p.avatar_url} alt="avatar" width={32} height={32} className="rounded-full w-8 h-8 object-cover border border-zinc-200 shrink-0" unoptimized />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-zinc-800 text-white flex items-center justify-center text-xs font-bold shadow-sm shrink-0">
                            {(p.full_name || p.email || 'U').charAt(0).toUpperCase()}
                          </div>
                        )}
                        <span className="text-sm font-bold text-zinc-900 truncate">
                          {p.full_name?.split(' ')[0] || p.email}
                          {p.id === currentProfile?.id && <span className="text-zinc-400 font-medium ml-1">(Tú)</span>}
                        </span>
                      </button>

                      {isSelected && (
                        <div className="ml-3 pl-3 border-l border-zinc-100 shrink-0 flex justify-end min-w-[80px]">
                          {splitType === 'equal' && (
                            <span className="text-sm font-bold text-zinc-900">
                              {formatCurrency(totalAmount / selectedMembers.length, currency)}
                            </span>
                          )}
                          {splitType === 'exact' && (
                            <div className="relative">
                              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 font-bold">$</span>
                              <FormattedCurrencyInput
                                value={splits[p.id]?.exact || ''}
                                onChange={val => setSplits({ ...splits, [p.id]: { ...splits[p.id], exact: val } })}
                                currency={currency}
                                hideSymbol
                                className="w-20 pl-6 pr-2 py-1.5 bg-white border border-zinc-200 rounded-lg text-right text-sm font-bold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 shadow-sm"
                                placeholder="0.00"
                              />
                            </div>
                          )}
                          {splitType === 'shares' && (() => {
                            const totalShares = selectedMembers.reduce((acc, mId) => acc + (parseFloat(splits[mId]?.shares) || 1), 0);
                            const userShares = parseFloat(splits[p.id]?.shares) || 1;
                            const liveAmount = totalShares > 0 ? (userShares / totalShares) * totalAmount : 0;
                            return (
                              <div className="flex flex-col items-end gap-1">
                                <div className="flex items-center gap-1.5">
                                  <input
                                    type="number"
                                    min="1"
                                    placeholder="1"
                                    value={splits[p.id]?.shares || '1'}
                                    onChange={e => setSplits({ ...splits, [p.id]: { ...splits[p.id], shares: e.target.value } })}
                                    className="w-12 px-2 py-1 bg-white border border-zinc-200 rounded-lg text-center text-sm font-bold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 shadow-sm"
                                  />
                                  <span className="text-[10px] font-bold text-zinc-500">cuota(s)</span>
                                </div>
                                <span className="text-sm font-bold text-zinc-900">
                                  {formatCurrency(liveAmount, currency)}
                                </span>
                              </div>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-5 border-t border-zinc-100 bg-white flex flex-col gap-3 rounded-b-[24px] shrink-0">
          <div className="flex justify-between items-center px-1">
            <span className="text-sm font-bold text-zinc-500">Total a dividir</span>
            <span className="text-lg font-black text-zinc-900">{formatCurrency(totalAmount, currency)}</span>
          </div>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="w-full px-8 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl transition-all shadow-md active:scale-95 flex items-center justify-center disabled:opacity-50 cursor-pointer"
          >
            {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <CheckCircle2 className="w-5 h-5 mr-2" />}
            <span>{expenseToEdit ? 'Guardar Cambios' : 'Confirmar Gasto'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

