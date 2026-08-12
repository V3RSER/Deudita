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
  const [items, setItems] = useState([{ id: 1, desc: '', total: '', assignedTo: [] as string[] }]);
  
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
            total: String(i.amount),
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
        setItems([{ id: 1, desc: '', total: '', assignedTo: [] }]);
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

  const itemsTotal = items.reduce((acc, i) => acc + (parseFloat(i.total) || 0), 0);
  const totalAmount = mode === 'quick' ? (parseFloat(amount) || 0) : itemsTotal;

  const calculateItemizedShares = () => {
    const res: Record<string, number> = {};
    activeProfiles.forEach(p => res[p.id] = 0);
    items.forEach(item => {
      const amt = parseFloat(item.total) || 0;
      const assigned = item.assignedTo.length > 0 ? item.assignedTo.filter(id => selectedMembers.includes(id)) : selectedMembers;
      if (assigned.length > 0 && amt > 0) {
        const share = amt / assigned.length;
        assigned.forEach(id => res[id] = (res[id] || 0) + share);
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
    if (mode === 'itemized' && items.some(i => !i.desc.trim() || !(parseFloat(i.total) > 0))) {
      return setError('Completa la descripción y total de todos los artículos.');
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
        description: i.desc.trim(),
        amount: parseFloat(i.total) || 0,
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
      <div className="bg-white rounded-[24px] shadow-2xl w-full max-w-lg flex flex-col my-auto max-h-[95vh] overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 shrink-0">
          <div className="flex items-center space-x-3">
            <button onClick={onClose} className="p-2 -ml-2 rounded-full hover:bg-zinc-100 text-zinc-500 transition">
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-lg font-bold text-zinc-900 tracking-tight">
              {expenseToEdit ? 'Editar gasto' : 'Nuevo gasto'}
            </h2>
          </div>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="bg-rose-50 px-6 py-3 border-b border-rose-100 flex items-center text-sm font-medium text-rose-700 shrink-0">
            <AlertCircle className="w-4 h-4 mr-2 shrink-0" /> {error}
          </div>
        )}

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8">
          
          {/* Mode Toggle */}
          {!expenseToEdit && (
            <div className="flex p-1 bg-zinc-100/80 rounded-xl max-w-[300px] mx-auto">
              <button
                onClick={() => {
                  setMode('quick');
                  setSplitType('equal');
                }}
                className={`flex-1 py-1.5 text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${mode === 'quick' ? 'bg-white shadow-sm text-zinc-900' : 'text-zinc-500 hover:text-zinc-900'}`}
              >
                <Wallet className="w-4 h-4" /> Simple
              </button>
              <button
                onClick={() => {
                  setMode('itemized');
                  setSplitType('itemized');
                }}
                className={`flex-1 py-1.5 text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${mode === 'itemized' ? 'bg-white shadow-sm text-zinc-900' : 'text-zinc-500 hover:text-zinc-900'}`}
              >
                <Receipt className="w-4 h-4" /> Detallado
              </button>
            </div>
          )}

          {/* Amount and Description */}
          <div className="space-y-3 flex flex-col items-center">
            {mode === 'quick' ? (
              <div className="text-center w-full">
                <FormattedCurrencyInput
                  value={amount}
                  onChange={setAmount}
                  currency={currency}
                  className="bg-transparent text-center focus:outline-none w-full text-5xl font-black text-zinc-900 placeholder:text-zinc-200"
                  placeholder="0"
                  autoFocus
                />
              </div>
            ) : (
              <div className="text-center bg-emerald-50/50 rounded-2xl p-4 border border-emerald-100 w-full">
                <p className="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-1">Total Calculado</p>
                <div className="text-3xl font-black text-emerald-900">
                  {formatCurrency(itemsTotal, currency)}
                </div>
              </div>
            )}
            
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="¿Qué compraste? (Ej. Cena pizzería)"
              className="w-full text-center text-xl font-bold text-zinc-700 bg-transparent border-none focus:outline-none focus:ring-0 placeholder:text-zinc-300"
            />
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
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowNotes(!showNotes)}
                className={`flex-1 flex items-center justify-center space-x-1.5 border rounded-xl py-2 text-sm font-semibold transition-all shadow-sm ${showNotes || notes ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50'}`}
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

            {/* Notes Input */}
            {showNotes && (
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
                  <div key={item.id} className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Descripción"
                      value={item.desc}
                      onChange={e => {
                        const newItems = [...items];
                        newItems[idx].desc = e.target.value;
                        setItems(newItems);
                      }}
                      className="flex-[2] px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-sm font-semibold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:bg-white transition-colors"
                    />
                    <div className="flex-[1.2] relative">
                       <span className="absolute left-2.5 top-1/2 -translate-y-1/2 mt-0.5 text-zinc-400 font-bold">$</span>
                      <input
                        type="number"
                        placeholder="Total"
                        value={item.total}
                        onChange={e => {
                          const newItems = [...items];
                          newItems[idx].total = e.target.value;
                          setItems(newItems);
                        }}
                        className="w-full pl-6 pr-2 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-sm font-bold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:bg-white transition-colors"
                      />
                    </div>
                    {items.length > 1 && (
                      <button onClick={() => setItems(items.filter(i => i.id !== item.id))} className="p-2 text-zinc-400 hover:text-rose-500 transition-colors shrink-0">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
                <button
                  onClick={() => setItems([...items, { id: Date.now(), desc: '', total: '', assignedTo: [] }])}
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
                {(mode === 'itemized' ? ['itemized', 'equal'] : ['equal', 'exact', 'percentage', 'shares']).map(type => (
                  <button
                    key={type}
                    onClick={() => setSplitType(type as any)}
                    className={`px-3 py-1.5 text-[11px] sm:text-xs font-bold rounded-lg capitalize transition-all ${splitType === type ? 'bg-white shadow-sm text-zinc-900 scale-[1.02]' : 'text-zinc-500 hover:text-zinc-900'}`}
                  >
                    {type === 'equal' ? 'Iguales' : type === 'itemized' ? 'Artículos' : type === 'exact' ? 'Exacto' : type === 'percentage' ? '%' : 'Cuotas'}
                  </button>
                ))}
              </div>
            </div>

            {/* Split Type Content */}
            {splitType === 'itemized' && mode === 'itemized' ? (
              <div className="space-y-3">
                {items.map((item, idx) => {
                  const amt = parseFloat(item.total) || 0;
                  const assigned = item.assignedTo;
                  const isAll = assigned.length === 0;
                  return (
                    <div key={item.id} className="p-3 bg-white border border-zinc-200 shadow-sm rounded-2xl space-y-3 transition-all">
                      <div className="flex justify-between items-center px-1">
                        <p className="text-sm font-bold text-zinc-900">{item.desc || `Artículo ${idx + 1}`}</p>
                        <div className="text-xs font-black text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-100">
                          {formatCurrency(amt / (isAll ? selectedMembers.length : assigned.length), currency)} c/u
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => {
                            const newItems = [...items];
                            newItems[idx].assignedTo = [];
                            setItems(newItems);
                          }}
                          className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all ${isAll ? 'bg-zinc-900 text-white shadow-sm' : 'bg-zinc-50 text-zinc-600 hover:bg-zinc-100 border border-zinc-200'}`}
                        >
                          Todos
                        </button>
                        {activeProfiles.map(p => {
                          const isSel = !isAll && assigned.includes(p.id);
                          return (
                            <button
                              key={p.id}
                              onClick={() => {
                                const newItems = [...items];
                                if (isSel) newItems[idx].assignedTo = assigned.filter(id => id !== p.id);
                                else newItems[idx].assignedTo = [...assigned, p.id];
                                setItems(newItems);
                              }}
                              className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all flex items-center ${isSel ? 'bg-emerald-600 text-white shadow-sm' : 'bg-zinc-50 text-zinc-600 hover:bg-zinc-100 border border-zinc-200'}`}
                            >
                              {p.full_name?.split(' ')[0] || p.email}
                              {isSel && <Check className="w-3 h-3 ml-1" />}
                            </button>
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
                        <div className="ml-3 pl-3 border-l border-zinc-100 shrink-0">
                          {splitType === 'equal' && (
                            <span className="text-sm font-bold text-zinc-900 bg-zinc-100 px-3 py-1.5 rounded-lg inline-block text-center min-w-[70px]">
                              {formatCurrency(totalAmount / selectedMembers.length, currency)}
                            </span>
                          )}
                          {splitType === 'exact' && (
                            <div className="relative">
                              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 font-bold">$</span>
                              <input
                                type="number"
                                placeholder="0.00"
                                value={splits[p.id]?.exact || ''}
                                onChange={e => setSplits({ ...splits, [p.id]: { ...splits[p.id], exact: e.target.value } })}
                                className="w-24 pl-6 pr-2 py-1.5 bg-white border border-zinc-200 rounded-lg text-right text-sm font-bold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 shadow-sm"
                              />
                            </div>
                          )}
                          {splitType === 'percentage' && (
                            <div className="relative flex items-center">
                              <input
                                type="number"
                                placeholder="0"
                                value={splits[p.id]?.pct || ''}
                                onChange={e => setSplits({ ...splits, [p.id]: { ...splits[p.id], pct: e.target.value } })}
                                className="w-16 px-2 py-1.5 bg-white border border-zinc-200 rounded-lg text-center text-sm font-bold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 shadow-sm"
                              />
                              <span className="ml-1.5 text-xs font-bold text-zinc-400">%</span>
                            </div>
                          )}
                          {splitType === 'shares' && (
                            <div className="flex items-center gap-1.5">
                              <input
                                type="number"
                                min="1"
                                placeholder="1"
                                value={splits[p.id]?.shares || '1'}
                                onChange={e => setSplits({ ...splits, [p.id]: { ...splits[p.id], shares: e.target.value } })}
                                className="w-12 px-2 py-1.5 bg-white border border-zinc-200 rounded-lg text-center text-sm font-bold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 shadow-sm"
                              />
                              <span className="text-[10px] font-bold text-zinc-500">cuota(s)</span>
                            </div>
                          )}
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
        <div className="p-5 border-t border-zinc-100 bg-white flex items-center justify-end rounded-b-[24px] shrink-0">
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

