'use client';

import React, { useState, useRef, useMemo, useEffect } from 'react';
import Image from 'next/image';
import { useExpense } from '@/lib/expense-context';
import { Expense, ExpenseItem, ExpenseSplit } from '@/lib/types';
import { formatCurrency } from '@/lib/balance-utils';
import { FormattedCurrencyInput } from '@/components/FormattedCurrencyInput';
import {
  X, Plus, Trash2, Receipt, Users, AlertCircle, Loader2, Calendar as CalendarIcon,
  Check, ChevronDown, FileText, Image as ImageIcon, ShoppingCart, ShoppingBag,
  Utensils, Coffee, Zap, Wifi, Home, Car, Fuel, Plane, Film, Beer, HeartPulse,
  Gift, DollarSign, Sparkles, Dog, PackageCheck, Building, Ticket, Trophy, Tag,
  Layers, Wallet, CreditCard, ArrowRight, ArrowLeft, CheckCircle2, SplitSquareHorizontal,
  ChevronRight, Camera
} from 'lucide-react';

interface NewExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultGroupId?: string;
  expenseToEdit?: Expense | null;
}

const CATEGORIES = [
  { id: 'Comida', icon: Utensils, color: 'bg-orange-50 text-orange-600 border-orange-200' },
  { id: 'Supermercado', icon: ShoppingCart, color: 'bg-emerald-50 text-emerald-600 border-emerald-200' },
  { id: 'Transporte', icon: Car, color: 'bg-blue-50 text-blue-600 border-blue-200' },
  { id: 'Servicios', icon: Zap, color: 'bg-yellow-50 text-yellow-600 border-yellow-200' },
  { id: 'Hogar', icon: Home, color: 'bg-indigo-50 text-indigo-600 border-indigo-200' },
  { id: 'Entretenimiento', icon: Film, color: 'bg-purple-50 text-purple-600 border-purple-200' },
  { id: 'Salud', icon: HeartPulse, color: 'bg-rose-50 text-rose-600 border-rose-200' },
  { id: 'General', icon: Tag, color: 'bg-zinc-100 text-zinc-600 border-zinc-200' },
];

function getCategoryData(catId: string) {
  return CATEGORIES.find(c => c.id === catId) || CATEGORIES[CATEGORIES.length - 1];
}

export function NewExpenseModal({ isOpen, onClose, defaultGroupId, expenseToEdit }: NewExpenseModalProps) {
  const { currentProfile, userGroups, members, profiles, addExpense, updateExpense } = useExpense();
  
  const [step, setStep] = useState<1 | 2>(1);
  const [mode, setMode] = useState<'quick' | 'itemized'>('quick');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Form State
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('General');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [paidById, setPaidById] = useState('');
  const [groupId, setGroupId] = useState('none');
  const [receiptUrl, setReceiptUrl] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  
  // Itemized State
  const [items, setItems] = useState([{ id: 1, desc: '', qty: 1, price: '', assignedTo: [] as string[] }]);
  
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
        setCategoryId(expenseToEdit.category || 'General');
        setDate(expenseToEdit.expense_date);
        setPaidById(expenseToEdit.paid_by);
        setGroupId(expenseToEdit.group_id || 'none');
        setReceiptUrl(expenseToEdit.receipt_url || '');
        if (expenseToEdit.items?.length) {
          setItems(expenseToEdit.items.map((i, idx) => ({
            id: idx + 1,
            desc: i.description,
            qty: 1,
            price: String(i.amount),
            assignedTo: []
          })));
        }
        if (expenseToEdit.splits?.length) {
          const selected = expenseToEdit.splits.map(s => s.user_id);
          setSelectedMembers(selected);
          const newSplits: any = {};
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
        setStep(1);
        setMode('quick');
        setAmount('');
        setDescription('');
        setCategoryId('General');
        setDate(new Date().toISOString().split('T')[0]);
        setGroupId(defaultGroupId && userGroups.some(g => g.id === defaultGroupId) ? defaultGroupId : (userGroups[0]?.id || 'none'));
        setReceiptUrl('');
        setItems([{ id: 1, desc: '', qty: 1, price: '', assignedTo: [] }]);
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
  }, [activeProfiles, isOpen, expenseToEdit]);

  const itemsTotal = items.reduce((acc, i) => acc + ((parseFloat(i.price) || 0) * i.qty), 0);
  const totalAmount = mode === 'quick' ? (parseFloat(amount) || 0) : itemsTotal;

  const handleNext = () => {
    setError(null);
    if (!description.trim()) return setError('Ingresa una descripción.');
    if (totalAmount <= 0) return setError('El monto total debe ser mayor a 0.');
    if (!paidById) return setError('Selecciona quién pagó.');
    if (mode === 'itemized' && items.some(i => !i.desc.trim() || !(parseFloat(i.price) > 0))) {
      return setError('Completa la descripción y precio de todos los artículos.');
    }
    if (mode === 'itemized') setSplitType('itemized');
    setStep(2);
  };

  const calculateItemizedShares = () => {
    const res: Record<string, number> = {};
    activeProfiles.forEach(p => res[p.id] = 0);
    items.forEach(item => {
      const amt = (parseFloat(item.price) || 0) * item.qty;
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
        category: categoryId,
        expense_date: date,
        source: 'manual' as const,
        receipt_url: receiptUrl || undefined,
        created_by: currentProfile?.id || paidById,
      };

      const finalItems = mode === 'itemized' ? items.map((i, idx) => ({
        id: "tmp_"+idx,
        expense_id: expenseToEdit?.id || '',
        description: i.desc.trim(),
        amount: (parseFloat(i.price) || 0) * i.qty,
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
      <div className="bg-white rounded-[28px] shadow-2xl w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between p-5 sm:px-6 border-b border-zinc-100">
          <div className="flex items-center space-x-3">
            <button onClick={onClose} className="p-2 -ml-2 rounded-full hover:bg-zinc-100 text-zinc-500 transition">
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-lg font-bold text-zinc-900 tracking-tight">
              {expenseToEdit ? 'Editar gasto' : 'Nuevo gasto'}
            </h2>
          </div>
          {step === 2 && (
            <button onClick={() => setStep(1)} className="text-sm font-semibold text-emerald-600 hover:text-emerald-700 flex items-center transition-colors">
              <ArrowLeft className="w-4 h-4 mr-1" /> Volver
            </button>
          )}
        </div>

        {/* Error Banner */}
        {error && (
          <div className="bg-rose-50 px-6 py-3 border-b border-rose-100 flex items-center text-sm font-medium text-rose-700">
            <AlertCircle className="w-4 h-4 mr-2 shrink-0" /> {error}
          </div>
        )}

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
          {step === 1 ? (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
              {/* Mode Toggle */}
              {!expenseToEdit && (
                <div className="flex p-1 bg-zinc-100/80 rounded-xl">
                  <button
                    onClick={() => setMode('quick')}
                    className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${mode === 'quick' ? 'bg-white shadow-sm text-zinc-900' : 'text-zinc-500 hover:text-zinc-900'}`}
                  >
                    Gasto rápido
                  </button>
                  <button
                    onClick={() => setMode('itemized')}
                    className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${mode === 'itemized' ? 'bg-white shadow-sm text-zinc-900' : 'text-zinc-500 hover:text-zinc-900'}`}
                  >
                    Factura detallada
                  </button>
                </div>
              )}

              {/* Amount Hero (Quick Mode) */}
              {mode === 'quick' && (
                <div className="text-center space-y-2 py-4">
                  <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Monto total</p>
                  <div className="flex items-center justify-center text-5xl font-black text-zinc-900">
                    <span className="text-3xl text-zinc-300 mr-1">$</span>
                    <FormattedCurrencyInput
                      value={amount}
                      onChange={setAmount}
                      currency={currency}
                      className="bg-transparent text-center focus:outline-none w-full max-w-[200px] placeholder:text-zinc-200"
                      placeholder="0"
                      autoFocus
                    />
                  </div>
                </div>
              )}

              {/* Amount Hero (Itemized Mode) */}
              {mode === 'itemized' && (
                <div className="text-center space-y-2 bg-emerald-50/50 rounded-2xl p-6 border border-emerald-100">
                  <p className="text-xs font-bold text-emerald-600 uppercase tracking-wider">Total calculado</p>
                  <div className="text-4xl font-black text-emerald-900">
                    {formatCurrency(itemsTotal, currency)}
                  </div>
                </div>
              )}

              {/* Basic Details */}
              <div className="space-y-5">
                <div>
                  <label className="text-xs font-bold text-zinc-700 mb-1.5 block">Descripción</label>
                  <input
                    type="text"
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="Ej. Cena en pizzería, Uber, Mercado..."
                    className="w-full px-4 py-3 bg-white border border-zinc-200 rounded-xl text-sm font-semibold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all shadow-sm"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-zinc-700 mb-1.5 block">Grupo</label>
                    <div className="relative shadow-sm rounded-xl">
                      <select
                        value={groupId}
                        onChange={e => setGroupId(e.target.value)}
                        className="w-full pl-4 pr-10 py-3 bg-white border border-zinc-200 rounded-xl text-sm font-semibold text-zinc-900 appearance-none focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 cursor-pointer transition-all"
                      >
                        <option value="none">Sin grupo</option>
                        {userGroups.map(g => (
                          <option key={g.id} value={g.id}>{g.name}</option>
                        ))}
                      </select>
                      <ChevronDown className="w-4 h-4 text-zinc-400 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-zinc-700 mb-1.5 block">Pagado por</label>
                    <div className="relative shadow-sm rounded-xl">
                      <select
                        value={paidById}
                        onChange={e => setPaidById(e.target.value)}
                        className="w-full pl-4 pr-10 py-3 bg-white border border-zinc-200 rounded-xl text-sm font-semibold text-zinc-900 appearance-none focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 cursor-pointer transition-all"
                      >
                        {activeProfiles.map(p => (
                          <option key={p.id} value={p.id}>{p.full_name || p.email}</option>
                        ))}
                      </select>
                      <ChevronDown className="w-4 h-4 text-zinc-400 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-zinc-700 mb-1.5 block">Fecha</label>
                    <input
                      type="date"
                      value={date}
                      onChange={e => setDate(e.target.value)}
                      className="w-full px-4 py-3 bg-white border border-zinc-200 rounded-xl text-sm font-semibold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all shadow-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-zinc-700 mb-1.5 block">Comprobante</label>
                    <button
                      onClick={() => fileRef.current?.click()}
                      disabled={isUploading}
                      className="w-full h-[46px] px-4 bg-white border border-zinc-200 hover:bg-zinc-50 rounded-xl text-sm font-semibold text-zinc-700 flex items-center justify-center space-x-2 transition cursor-pointer shadow-sm"
                    >
                      {isUploading ? <Loader2 className="w-4 h-4 animate-spin text-zinc-400" /> : <Camera className="w-4 h-4 text-zinc-400" />}
                      <span className="truncate">{receiptUrl ? 'Cambiar foto' : 'Subir foto'}</span>
                    </button>
                    <input type="file" ref={fileRef} onChange={handleUpload} accept="image/*" className="hidden" />
                  </div>
                </div>

                {/* Categories */}
                <div>
                  <label className="text-xs font-bold text-zinc-700 mb-2 block">Categoría</label>
                  <div className="flex overflow-x-auto pb-4 -mx-1 px-1 space-x-2 snap-x scrollbar-hide">
                    {CATEGORIES.map(cat => {
                      const Icon = cat.icon;
                      const isSelected = categoryId === cat.id;
                      return (
                        <button
                          key={cat.id}
                          onClick={() => setCategoryId(cat.id)}
                          className={`snap-center shrink-0 flex flex-col items-center justify-center w-20 h-20 rounded-[20px] border transition-all cursor-pointer ${isSelected ? 'border-zinc-900 bg-zinc-900 text-white shadow-md scale-105' : 'border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-600 shadow-sm'}`}
                        >
                          <Icon className={`w-6 h-6 mb-2 ${isSelected ? 'text-white' : cat.color.split(' ')[1]}`} />
                          <span className="text-[10px] font-bold tracking-wide">{cat.id}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Itemized Builder */}
              {mode === 'itemized' && (
                <div className="pt-6 border-t border-zinc-100 space-y-4">
                  <h3 className="text-sm font-bold text-zinc-900 flex items-center">
                    <ShoppingCart className="w-4 h-4 mr-2 text-emerald-600" />
                    Artículos de la factura
                  </h3>
                  <div className="space-y-3">
                    {items.map((item, idx) => (
                      <div key={item.id} className="p-4 bg-zinc-50/80 rounded-2xl border border-zinc-200 space-y-3">
                        <div className="flex gap-3">
                          <input
                            type="text"
                            placeholder="Ej. Pizza familiar"
                            value={item.desc}
                            onChange={e => {
                              const newItems = [...items];
                              newItems[idx].desc = e.target.value;
                              setItems(newItems);
                            }}
                            className="flex-1 px-3 py-2 bg-white border border-zinc-200 rounded-lg text-sm font-semibold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 shadow-sm"
                          />
                          {items.length > 1 && (
                            <button onClick={() => setItems(items.filter(i => i.id !== item.id))} className="p-2 text-zinc-400 hover:text-rose-500 bg-white border border-zinc-200 rounded-lg transition-colors shadow-sm">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                        <div className="flex gap-3">
                          <div className="w-20 relative">
                            <label className="absolute -top-1.5 left-2 bg-white px-1 text-[9px] font-bold text-zinc-400 uppercase">Cant.</label>
                            <input
                              type="number"
                              min="1"
                              value={item.qty}
                              onChange={e => {
                                const newItems = [...items];
                                newItems[idx].qty = parseInt(e.target.value) || 1;
                                setItems(newItems);
                              }}
                              className="w-full px-3 pt-3 pb-2 bg-white border border-zinc-200 rounded-lg text-sm font-bold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-center shadow-sm"
                            />
                          </div>
                          <div className="flex-1 relative">
                             <label className="absolute -top-1.5 left-2 bg-white px-1 text-[9px] font-bold text-zinc-400 uppercase">Precio c/u</label>
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 mt-0.5 text-zinc-400 font-bold">$</span>
                            <input
                              type="number"
                              placeholder="0"
                              value={item.price}
                              onChange={e => {
                                const newItems = [...items];
                                newItems[idx].price = e.target.value;
                                setItems(newItems);
                              }}
                              className="w-full pl-7 pr-3 pt-3 pb-2 bg-white border border-zinc-200 rounded-lg text-sm font-bold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 shadow-sm"
                            />
                          </div>
                          <div className="w-28 flex flex-col justify-center items-end bg-emerald-50/50 rounded-lg px-3 border border-emerald-100">
                             <span className="text-[10px] font-bold text-emerald-600 uppercase">Total</span>
                             <span className="font-black text-emerald-800 text-sm">
                               {formatCurrency((parseFloat(item.price) || 0) * item.qty, currency)}
                             </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => setItems([...items, { id: Date.now(), desc: '', qty: 1, price: '', assignedTo: [] }])}
                    className="w-full py-3 border border-dashed border-zinc-300 rounded-2xl text-sm font-bold text-zinc-600 hover:text-emerald-600 hover:border-emerald-300 hover:bg-emerald-50 transition-all flex items-center justify-center cursor-pointer"
                  >
                    <Plus className="w-4 h-4 mr-2" /> Añadir otro artículo
                  </button>
                </div>
              )}
            </div>
          ) : (
            // STEP 2: SPLIT
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="flex items-center justify-between p-5 bg-emerald-50/80 border border-emerald-100 rounded-3xl">
                <div>
                  <p className="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-1">Monto total</p>
                  <p className="text-3xl font-black text-emerald-950">{formatCurrency(totalAmount, currency)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-1">Pagado por</p>
                  <p className="text-sm font-bold text-emerald-950 bg-white px-3 py-1.5 rounded-xl border border-emerald-100 shadow-sm inline-block">
                    {activeProfiles.find(p => p.id === paidById)?.full_name || 'Alguien'}
                  </p>
                </div>
              </div>

              {/* Split Mode Selector */}
              <div>
                <label className="text-xs font-bold text-zinc-700 mb-2 block">¿Cómo se divide?</label>
                <div className="bg-zinc-100/80 p-1 rounded-xl flex flex-wrap shadow-inner">
                  {(mode === 'itemized' ? ['itemized', 'equal'] : ['equal', 'exact', 'percentage', 'shares']).map(type => (
                    <button
                      key={type}
                      onClick={() => setSplitType(type as any)}
                      className={`flex-1 min-w-[80px] py-2.5 text-xs font-bold rounded-lg capitalize transition-all ${splitType === type ? 'bg-white shadow-md text-zinc-900 scale-[1.02]' : 'text-zinc-500 hover:text-zinc-900'}`}
                    >
                      {type === 'equal' ? 'Iguales' : type === 'itemized' ? 'Por artículo' : type === 'exact' ? 'Exacto' : type === 'percentage' ? 'Porcentaje' : 'Cuotas'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Split Content */}
              {splitType === 'itemized' && mode === 'itemized' ? (
                <div className="space-y-4">
                  {items.map((item, idx) => {
                    const amt = (parseFloat(item.price) || 0) * item.qty;
                    const assigned = item.assignedTo;
                    const isAll = assigned.length === 0;
                    return (
                      <div key={item.id} className="p-5 bg-white border border-zinc-200 shadow-sm rounded-[24px] space-y-4 transition-all">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="text-base font-bold text-zinc-900">{item.desc || `Artículo ${idx + 1}`}</p>
                            <p className="text-xs font-medium text-zinc-500">{formatCurrency(amt, currency)} en total</p>
                          </div>
                          <div className="text-xs font-black text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-100">
                            {formatCurrency(amt / (isAll ? selectedMembers.length : assigned.length), currency)} c/u
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2 pt-2 border-t border-zinc-100">
                          <button
                            onClick={() => {
                              const newItems = [...items];
                              newItems[idx].assignedTo = [];
                              setItems(newItems);
                            }}
                            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${isAll ? 'bg-zinc-900 text-white shadow-md' : 'bg-zinc-50 text-zinc-600 hover:bg-zinc-100 border border-zinc-200'}`}
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
                                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center ${isSel ? 'bg-emerald-600 text-white shadow-md' : 'bg-zinc-50 text-zinc-600 hover:bg-zinc-100 border border-zinc-200'}`}
                              >
                                {p.full_name?.split(' ')[0] || p.email}
                                {isSel && <Check className="w-3.5 h-3.5 ml-1.5" />}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-3">
                  {activeProfiles.map(p => {
                    const isSelected = selectedMembers.includes(p.id);
                    const toggle = () => {
                      if (isSelected && selectedMembers.length > 1) setSelectedMembers(selectedMembers.filter(id => id !== p.id));
                      else if (!isSelected) setSelectedMembers([...selectedMembers, p.id]);
                    };
                    return (
                      <div key={p.id} className={`flex items-center p-4 rounded-2xl border transition-all ${isSelected ? 'bg-white border-zinc-200 shadow-sm' : 'bg-zinc-50 border-zinc-100 opacity-50 hover:opacity-100'}`}>
                        <button onClick={toggle} className="flex-1 flex items-center space-x-4 text-left group">
                          <div className={`w-5 h-5 rounded-[6px] flex items-center justify-center border transition-colors ${isSelected ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-white border-zinc-300 group-hover:border-emerald-300'}`}>
                            {isSelected && <Check className="w-3.5 h-3.5" />}
                          </div>
                          {p.avatar_url ? (
                            <Image src={p.avatar_url} alt="avatar" width={40} height={40} className="rounded-full w-10 h-10 object-cover border border-zinc-200" unoptimized />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-zinc-800 text-white flex items-center justify-center text-sm font-bold shadow-sm">
                              {(p.full_name || p.email || 'U').charAt(0).toUpperCase()}
                            </div>
                          )}
                          <span className="text-sm font-bold text-zinc-900">{p.full_name || p.email} {p.id === currentProfile?.id && <span className="text-zinc-400 font-medium ml-1">(Tú)</span>}</span>
                        </button>

                        {isSelected && (
                          <div className="ml-4 pl-4 border-l border-zinc-100">
                            {splitType === 'equal' && (
                              <span className="text-sm font-bold text-zinc-900 bg-zinc-100 px-3 py-1.5 rounded-lg inline-block min-w-[80px] text-center">
                                {formatCurrency(totalAmount / selectedMembers.length, currency)}
                              </span>
                            )}
                            {splitType === 'exact' && (
                              <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 font-bold">$</span>
                                <input
                                  type="number"
                                  placeholder="0.00"
                                  value={splits[p.id]?.exact || ''}
                                  onChange={e => setSplits({ ...splits, [p.id]: { ...splits[p.id], exact: e.target.value } })}
                                  className="w-28 pl-7 pr-3 py-2 bg-white border border-zinc-200 rounded-xl text-right text-sm font-bold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 shadow-sm"
                                />
                              </div>
                            )}
                            {splitType === 'percentage' && (
                              <div className="relative">
                                <input
                                  type="number"
                                  placeholder="0"
                                  value={splits[p.id]?.pct || ''}
                                  onChange={e => setSplits({ ...splits, [p.id]: { ...splits[p.id], pct: e.target.value } })}
                                  className="w-20 pl-3 pr-7 py-2 bg-white border border-zinc-200 rounded-xl text-right text-sm font-bold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 shadow-sm"
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 font-bold">%</span>
                              </div>
                            )}
                            {splitType === 'shares' && (
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  min="1"
                                  placeholder="1"
                                  value={splits[p.id]?.shares || '1'}
                                  onChange={e => setSplits({ ...splits, [p.id]: { ...splits[p.id], shares: e.target.value } })}
                                  className="w-16 px-3 py-2 bg-white border border-zinc-200 rounded-xl text-center text-sm font-bold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 shadow-sm"
                                />
                                <span className="text-xs font-bold text-zinc-500">cuota(s)</span>
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
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-5 sm:px-6 border-t border-zinc-100 bg-zinc-50/80 flex items-center justify-end rounded-b-[28px]">
          {step === 1 ? (
            <button
              onClick={handleNext}
              className="w-full sm:w-auto px-8 py-3.5 bg-zinc-900 hover:bg-zinc-800 text-white text-sm font-bold rounded-xl transition-all shadow-md active:scale-95 flex items-center justify-center cursor-pointer group"
            >
              <span>Continuar</span>
              <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="w-full sm:w-auto px-8 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl transition-all shadow-md active:scale-95 flex items-center justify-center disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
              <span>{expenseToEdit ? 'Guardar Cambios' : 'Confirmar Gasto'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
