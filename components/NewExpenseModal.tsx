'use client';

import React, { useState, useEffect } from 'react';
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
  const { currentProfile, groups, members, profiles, addExpense } = useExpense();

  const [groupId, setGroupId] = useState<string>(() => {
    if (defaultGroupId && groups.some((g) => g.id === defaultGroupId)) {
      return defaultGroupId;
    }
    if (groups.length > 0) {
      return groups[0].id;
    }
    return '';
  });
  const [description, setDescription] = useState<string>('');
  const [totalAmount, setTotalAmount] = useState<string>('');
  const [paidBy, setPaidBy] = useState<string>(currentProfile.id);
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
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [customSplits, setCustomSplits] = useState<Record<string, string>>({});

  const activeGroupId =
    groupId && groups.some((g) => g.id === groupId)
      ? groupId
      : defaultGroupId && groups.some((g) => g.id === defaultGroupId)
      ? defaultGroupId
      : groups.length > 0
      ? groups[0].id
      : '';

  // Get members of the chosen group
  const groupMembers = members.filter((m) => m.group_id === activeGroupId);
  const memberProfiles = groupMembers
    .map((m) => profiles.find((p) => p.id === m.user_id))
    .filter((p): p is NonNullable<typeof p> => p !== undefined);

  const handleGroupSelect = (newGroupId: string) => {
    setGroupId(newGroupId);
    const newGroupMembers = members.filter((m) => m.group_id === newGroupId);
    const newProfiles = newGroupMembers
      .map((m) => profiles.find((p) => p.id === m.user_id))
      .filter((p): p is NonNullable<typeof p> => p !== undefined);

    if (newProfiles.length > 0) {
      setSelectedMemberIds(newProfiles.map((p) => p.id));
      if (!newGroupMembers.some((m) => m.user_id === paidBy)) {
        setPaidBy(newProfiles[0].id);
      }
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
      alert('Ingresa un monto total válido');
      return;
    }

    if (!description || description.trim().length === 0) {
      alert('Ingresa una descripción para el gasto');
      return;
    }

    if (!groupId) {
      alert('Selecciona un grupo');
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
      const share = numericTotal / selectedMemberIds.length;
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
      group_id: activeGroupId,
      paid_by: paidBy,
      total_amount: numericTotal,
      description: description.trim(),
      category,
      expense_date: expenseDate,
      source: 'manual',
      created_by: currentProfile.id,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-2xl overflow-hidden my-8">
        {/* Header */}
        <div className="bg-slate-900 text-white p-6 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center text-slate-950 font-bold">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Registrar Nuevo Gasto</h2>
              <p className="text-xs text-slate-400">Ingresa los detalles y el reparto entre miembros</p>
            </div>
          </div>

          <button
            onClick={resetAndClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
          {/* Group & Category */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Grupo
              </label>
              <select
                value={groupId}
                onChange={(e) => handleGroupSelect(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              >
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Categoría
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Descripción
              </label>
              <input
                type="text"
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ej: Boleta de supermercado o cena"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
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
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 disabled:bg-slate-100"
              />
            </div>
          </div>

          {/* Paid By & Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                ¿Quién Pagó?
              </label>
              <select
                value={paidBy}
                onChange={(e) => setPaidBy(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              >
                {memberProfiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name} {p.id === currentProfile.id ? '(Tú)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Fecha
              </label>
              <input
                type="date"
                required
                value={expenseDate}
                onChange={(e) => setExpenseDate(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
          </div>

          {/* Toggle Itemized Breakdown */}
          <div className="border-t border-slate-100 pt-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <span className="text-sm font-bold text-slate-900 block">
                  Desglosar en Ítems Individuales
                </span>
                <span className="text-xs text-slate-500">
                  Permite detallar varios productos (ej: una boleta con carnes y limpieza).
                </span>
              </div>
              <input
                type="checkbox"
                checked={useItems}
                onChange={(e) => setUseItems(e.target.checked)}
                className="w-5 h-5 accent-emerald-500 rounded cursor-pointer"
              />
            </div>

            {useItems && (
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3 mt-3">
                <div className="flex items-center justify-between text-xs font-bold text-slate-500 uppercase">
                  <span>Ítem</span>
                  <span>Monto</span>
                </div>

                {items.map((item, idx) => (
                  <div key={idx} className="flex items-center space-x-2">
                    <input
                      type="text"
                      placeholder="Ej: Frutas y verduras"
                      value={item.description}
                      onChange={(e) => handleItemChange(idx, 'description', e.target.value)}
                      className="flex-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                    />
                    <input
                      type="number"
                      placeholder="8500"
                      value={item.amount}
                      onChange={(e) => handleItemChange(idx, 'amount', e.target.value)}
                      className="w-28 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold"
                    />
                    {items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveItemRow(idx)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}

                <button
                  type="button"
                  onClick={handleAddItemRow}
                  className="flex items-center space-x-1 text-xs font-bold text-emerald-600 hover:text-emerald-700 pt-1"
                >
                  <Plus className="w-4 h-4" />
                  <span>Añadir otro ítem</span>
                </button>
              </div>
            )}
          </div>

          {/* Division Mode */}
          <div className="border-t border-slate-100 pt-4 space-y-3">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              ¿Cómo se Divide?
            </label>

            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setSplitType('equal')}
                className={`py-2 px-3 rounded-xl text-xs font-bold transition border ${
                  splitType === 'equal'
                    ? 'bg-emerald-500 text-slate-950 border-emerald-500'
                    : 'bg-slate-50 text-slate-600 border-slate-200'
                }`}
              >
                Partes Iguales
              </button>

              <button
                type="button"
                onClick={() => setSplitType('exact')}
                className={`py-2 px-3 rounded-xl text-xs font-bold transition border ${
                  splitType === 'exact'
                    ? 'bg-emerald-500 text-slate-950 border-emerald-500'
                    : 'bg-slate-50 text-slate-600 border-slate-200'
                }`}
              >
                Montos Exactos
              </button>

              <button
                type="button"
                onClick={() => setSplitType('percentage')}
                className={`py-2 px-3 rounded-xl text-xs font-bold transition border ${
                  splitType === 'percentage'
                    ? 'bg-emerald-500 text-slate-950 border-emerald-500'
                    : 'bg-slate-50 text-slate-600 border-slate-200'
                }`}
              >
                Porcentaje (%)
              </button>
            </div>

            {/* Member list selection */}
            <div className="space-y-2 pt-2">
              <span className="text-xs font-semibold text-slate-500 block">
                Selecciona los miembros incluidos:
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {memberProfiles.map((p) => {
                  const isChecked = selectedMemberIds.includes(p.id);

                  return (
                    <div
                      key={p.id}
                      className={`flex items-center justify-between p-2.5 rounded-xl border text-xs transition ${
                        isChecked
                          ? 'bg-emerald-50/60 border-emerald-300'
                          : 'bg-slate-50 border-slate-200 opacity-60'
                      }`}
                    >
                      <label className="flex items-center space-x-2 cursor-pointer flex-1">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleMemberSelection(p.id)}
                          className="w-4 h-4 accent-indigo-600 rounded"
                        />
                        <img src={p.avatar_url} alt={p.full_name} className="w-5 h-5 rounded-full" />
                        <span className="font-semibold text-slate-800">{p.full_name}</span>
                      </label>

                      {isChecked && splitType !== 'equal' && (
                        <input
                          type="number"
                          placeholder={splitType === 'exact' ? '$' : '%'}
                          value={customSplits[p.id] ? customSplits[p.id] : ''}
                          onChange={(e) => handleCustomSplitChange(p.id, e.target.value)}
                          className="w-20 px-2 py-1 bg-white border border-slate-300 rounded text-right font-bold"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Submit Action */}
          <div className="pt-4 border-t border-slate-100 flex justify-end space-x-3">
            <button
              type="button"
              onClick={resetAndClose}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-semibold transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold shadow-sm transition"
            >
              Guardar Gasto
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
