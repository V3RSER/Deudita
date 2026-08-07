'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { useExpense } from '@/lib/expense-context';
import { ExpenseItem, ExpenseSplit } from '@/lib/types';
import { formatCurrency } from '@/lib/balance-utils';
import {
  X,
  Plus,
  Trash2,
  Receipt,
  Users,
  DollarSign,
  Calculator,
  ListPlus,
  AlertCircle,
} from 'lucide-react';

interface NewExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultGroupId?: string;
}

type SplitType = 'equal' | 'exact' | 'percentage';

export function NewExpenseModal({
  isOpen,
  onClose,
  defaultGroupId,
}: NewExpenseModalProps) {
  const { currentProfile, userGroups, members, profiles, addExpense } = useExpense();

  const [groupId, setGroupId] = useState<string>(() => {
    if (defaultGroupId && userGroups.some((g) => g.id === defaultGroupId)) {
      return defaultGroupId;
    }
    if (userGroups.length > 0) {
      return userGroups[0].id;
    }
    return '';
  });

  const activeGroupId =
    groupId && userGroups.some((g) => g.id === groupId)
      ? groupId
      : defaultGroupId && userGroups.some((g) => g.id === defaultGroupId)
      ? defaultGroupId
      : userGroups.length > 0
      ? userGroups[0].id
      : '';

  // Get members of the chosen group
  const groupMembers = members.filter((m) => m.group_id === activeGroupId);
  const memberProfiles = groupMembers
    .map((m) => profiles.find((p) => p.id === m.user_id))
    .filter((p): p is NonNullable<typeof p> => p !== undefined);

  const [description, setDescription] = useState<string>('');
  const [totalAmount, setTotalAmount] = useState<string>('');
  const [paidBy, setPaidBy] = useState<string>(() => {
    if (memberProfiles.length > 0) {
      const currentInGroup = currentProfile && memberProfiles.some((p) => p.id === currentProfile.id);
      if (currentInGroup && currentProfile) {
        return currentProfile.id;
      }
      return memberProfiles[0].id;
    }
    return currentProfile?.id || '';
  });
  const [category, setCategory] = useState<string>('Supermercado');
  const [expenseDate, setExpenseDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );

  // Itemized breakdown toggle
  const [useItems, setUseItems] = useState<boolean>(false);
  const [items, setItems] = useState<Array<{ description: string; amount: string }>>([
    { description: '', amount: '' },
  ]);

  // Split mode
  const [splitType, setSplitType] = useState<SplitType>('equal');
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>(() => {
    return memberProfiles.map((p) => p.id);
  });
  const [customSplits, setCustomSplits] = useState<Record<string, string>>({});

  const handleGroupSelect = (newGroupId: string) => {
    setGroupId(newGroupId);
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
    if (selectedMemberIds.includes(userId)) {
      if (selectedMemberIds.length > 1) {
        setSelectedMemberIds(selectedMemberIds.filter((id) => id !== userId));
      }
    } else {
      setSelectedMemberIds([...selectedMemberIds, userId]);
    }
  };

  const handleCustomSplitChange = (userId: string, val: string) => {
    setCustomSplits((prev) => ({ ...prev, [userId]: val }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const numericTotal = parseFloat(totalAmount);
    if (isNaN(numericTotal) || numericTotal <= 0) {
      alert('Ingresa un monto total válido mayor a 0');
      return;
    }

    if (!description || description.trim().length === 0) {
      alert('Ingresa una descripción para el gasto');
      return;
    }

    const effectiveGroupId = groupId || activeGroupId;
    if (!effectiveGroupId) {
      alert('Selecciona un grupo');
      return;
    }

    if (memberProfiles.length === 0) {
      alert('El grupo seleccionado no tiene integrantes');
      return;
    }

    if (selectedMemberIds.length === 0) {
      alert('Selecciona al menos un integrante para dividir el gasto');
      return;
    }

    const effectivePaidBy =
      paidBy && memberProfiles.some((p) => p.id === paidBy)
        ? paidBy
        : currentProfile && memberProfiles.some((p) => p.id === currentProfile.id)
        ? currentProfile.id
        : memberProfiles[0]?.id;

    if (!effectivePaidBy) {
      alert('Selecciona quién pagó el gasto');
      return;
    }

    // Build items if useItems is true
    const finalItems: ExpenseItem[] = [];
    if (useItems) {
      items.forEach((item, idx) => {
        const amt = parseFloat(item.amount);
        if (item.description.trim().length > 0 && !isNaN(amt) && amt > 0) {
          finalItems.push({
            id: `item_tmp_${idx}`,
            expense_id: '',
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
      let sum = 0;
      selectedMemberIds.forEach((uid) => {
        const rawSplit = customSplits[uid];
        const val = rawSplit ? parseFloat(rawSplit) : 0;
        sum += isNaN(val) ? 0 : val;
        finalSplits.push({
          user_id: uid,
          amount_owed: isNaN(val) ? 0 : val,
        });
      });

      if (Math.abs(sum - numericTotal) > 1) {
        alert(
          `La suma de las partes (${formatCurrency(sum)}) no coincide con el total (${formatCurrency(
            numericTotal
          )})`
        );
        return;
      }
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
    }

    addExpense({
      group_id: effectiveGroupId,
      paid_by: effectivePaidBy,
      total_amount: numericTotal,
      description: description.trim(),
      category,
      expense_date: expenseDate,
      source: 'manual',
      created_by: currentProfile?.id ? currentProfile.id : effectivePaidBy,
      items: finalItems,
      splits: finalSplits as ExpenseSplit[],
    });

    resetAndClose();
  };

  const resetAndClose = () => {
    setDescription('');
    setTotalAmount('');
    setUseItems(false);
    setItems([{ description: '', amount: '' }]);
    setCustomSplits({});
    setSplitType('equal');
    setSelectedMemberIds([]);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/70 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white rounded-[2rem] ring-1 ring-zinc-200 shadow-2xl w-full max-w-2xl overflow-hidden my-8">
        {/* Header */}
        <div className="bg-zinc-900 text-white p-8 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 rounded-2xl bg-zinc-800 ring-1 ring-zinc-700 flex items-center justify-center text-zinc-100 font-bold">
              <Receipt className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-zinc-50">Registrar Nuevo Gasto</h2>
              <p className="text-sm text-zinc-400 mt-1">Ingresa los detalles y el reparto entre miembros</p>
            </div>
          </div>

          <button
            onClick={resetAndClose}
            className="p-2.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-8 space-y-8 max-h-[80vh] overflow-y-auto">
          {/* Group & Category */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">
                Grupo
              </label>
              <select
                value={groupId}
                onChange={(e) => handleGroupSelect(e.target.value)}
                className="w-full px-4 py-3 bg-zinc-50 border-none ring-1 ring-zinc-200 rounded-xl text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900 transition-all"
              >
                {userGroups.map((g, idx) => (
                  <option key={g.id || `ug-${idx}`} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">
                Categoría
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-4 py-3 bg-zinc-50 border-none ring-1 ring-zinc-200 rounded-xl text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900 transition-all"
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
          </div>

          {/* Description & Amount */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <div className="sm:col-span-2">
              <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">
                Descripción
              </label>
              <input
                type="text"
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ej: Boleta de supermercado o cena"
                className="w-full px-4 py-3 bg-zinc-50 border-none ring-1 ring-zinc-200 rounded-xl text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900 transition-all placeholder:text-zinc-400"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">
                Monto Total ($)
              </label>
              <input
                type="number"
                required
                step="any"
                disabled={useItems}
                value={totalAmount}
                onChange={(e) => setTotalAmount(e.target.value)}
                placeholder="15000"
                className="w-full px-4 py-3 bg-zinc-50 border-none ring-1 ring-zinc-200 rounded-xl text-lg font-semibold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900 transition-all disabled:bg-zinc-100 disabled:text-zinc-400 placeholder:text-zinc-400"
              />
            </div>
          </div>

          {/* Paid By & Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">
                ¿Quién Pagó?
              </label>
              <select
                value={paidBy}
                onChange={(e) => setPaidBy(e.target.value)}
                className="w-full px-4 py-3 bg-zinc-50 border-none ring-1 ring-zinc-200 rounded-xl text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900 transition-all"
              >
                {memberProfiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name} {p.id === currentProfile?.id ? '(Tú)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">
                Fecha
              </label>
              <input
                type="date"
                required
                value={expenseDate}
                onChange={(e) => setExpenseDate(e.target.value)}
                className="w-full px-4 py-3 bg-zinc-50 border-none ring-1 ring-zinc-200 rounded-xl text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900 transition-all"
              />
            </div>
          </div>

          {/* Toggle Itemized Breakdown */}
          <div className="border-t border-zinc-200 pt-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <span className="text-sm font-semibold text-zinc-900 block tracking-tight">
                  Desglosar en Ítems Individuales
                </span>
                <span className="text-xs text-zinc-500 mt-0.5 block">
                  Permite detallar varios productos (ej: una boleta con carnes y limpieza).
                </span>
              </div>
              <input
                type="checkbox"
                checked={useItems}
                onChange={(e) => setUseItems(e.target.checked)}
                className="w-5 h-5 accent-zinc-900 rounded cursor-pointer"
              />
            </div>

            {useItems && (
              <div className="bg-zinc-50 p-5 rounded-2xl ring-1 ring-zinc-200 space-y-4 mt-4">
                <div className="flex items-center justify-between text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                  <span>Ítem</span>
                  <span>Monto</span>
                </div>

                {items.map((item, idx) => (
                  <div key={idx} className="flex items-center space-x-3">
                    <input
                      type="text"
                      placeholder="Ej: Frutas y verduras"
                      value={item.description}
                      onChange={(e) => handleItemChange(idx, 'description', e.target.value)}
                      className="flex-1 px-4 py-2 bg-white border-none ring-1 ring-zinc-200 rounded-xl text-sm focus:ring-2 focus:ring-zinc-900 transition-all placeholder:text-zinc-400"
                    />
                    <input
                      type="number"
                      placeholder="8500"
                      value={item.amount}
                      onChange={(e) => handleItemChange(idx, 'amount', e.target.value)}
                      className="w-28 px-4 py-2 bg-white border-none ring-1 ring-zinc-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-zinc-900 transition-all placeholder:text-zinc-400"
                    />
                    {items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveItemRow(idx)}
                        className="p-2 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}

                <button
                  type="button"
                  onClick={handleAddItemRow}
                  className="flex items-center space-x-1.5 text-xs font-medium text-zinc-900 hover:text-zinc-600 pt-2 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  <span>Añadir otro ítem</span>
                </button>
              </div>
            )}
          </div>

          {/* Division Mode */}
          <div className="border-t border-zinc-200 pt-6 space-y-5">
            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
              ¿Cómo se Divide?
            </label>

            <div className="grid grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setSplitType('equal')}
                className={`py-2.5 px-3 rounded-xl text-xs font-medium transition-all ${
                  splitType === 'equal'
                    ? 'bg-zinc-900 text-white shadow-md'
                    : 'bg-zinc-50 text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-100'
                }`}
              >
                Partes Iguales
              </button>

              <button
                type="button"
                onClick={() => setSplitType('exact')}
                className={`py-2.5 px-3 rounded-xl text-xs font-medium transition-all ${
                  splitType === 'exact'
                    ? 'bg-zinc-900 text-white shadow-md'
                    : 'bg-zinc-50 text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-100'
                }`}
              >
                Montos Exactos
              </button>

              <button
                type="button"
                onClick={() => setSplitType('percentage')}
                className={`py-2.5 px-3 rounded-xl text-xs font-medium transition-all ${
                  splitType === 'percentage'
                    ? 'bg-zinc-900 text-white shadow-md'
                    : 'bg-zinc-50 text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-100'
                }`}
              >
                Porcentaje (%)
              </button>
            </div>

            {/* Member list selection */}
            <div className="space-y-3 pt-3">
              <span className="text-xs font-medium text-zinc-500 block">
                Selecciona los miembros incluidos:
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {memberProfiles.map((p) => {
                  const isChecked = selectedMemberIds.includes(p.id);

                  return (
                    <div
                      key={p.id}
                      className={`flex items-center justify-between p-3 rounded-xl ring-1 transition-all ${
                        isChecked
                          ? 'bg-white ring-zinc-300 shadow-sm'
                          : 'bg-zinc-50 ring-zinc-200 opacity-70'
                      }`}
                    >
                      <label className="flex items-center space-x-3 cursor-pointer flex-1">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleMemberSelection(p.id)}
                          className="w-4 h-4 accent-zinc-900 rounded"
                        />
                        {p.avatar_url ? (
                          <Image src={p.avatar_url} alt={p.full_name} width={24} height={24} className="w-6 h-6 rounded-full object-cover" unoptimized referrerPolicy="no-referrer" />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-zinc-800 text-white flex items-center justify-center text-[10px] font-bold">
                            {p.full_name ? p.full_name.charAt(0).toUpperCase() : 'U'}
                          </div>
                        )}
                        <span className={`font-medium tracking-tight text-sm ${isChecked ? 'text-zinc-900' : 'text-zinc-500'}`}>{p.full_name}</span>
                      </label>

                      {isChecked && splitType !== 'equal' && (
                        <input
                          type="number"
                          placeholder={splitType === 'exact' ? '$' : '%'}
                          value={customSplits[p.id] ? customSplits[p.id] : ''}
                          onChange={(e) => handleCustomSplitChange(p.id, e.target.value)}
                          className="w-24 px-3 py-1.5 bg-white border-none ring-1 ring-zinc-200 rounded-lg text-right font-medium text-sm focus:ring-2 focus:ring-zinc-900"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Submit Action */}
          <div className="pt-8 border-t border-zinc-200 flex justify-end space-x-4">
            <button
              type="button"
              onClick={resetAndClose}
              className="px-6 py-3 rounded-full ring-1 ring-zinc-200 text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 text-sm font-medium transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-8 py-3 rounded-full bg-zinc-900 hover:bg-zinc-800 text-white text-sm font-medium shadow-sm transition-all active:scale-95"
            >
              Guardar Gasto
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
