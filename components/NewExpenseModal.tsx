'use client';

import React, { useState, useEffect, useRef } from 'react';
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
  ChevronRight,
  Paperclip,
  FileText,
  Image as ImageIcon,
  ShoppingCart,
  ShoppingBag,
  Utensils,
  Coffee,
  Zap,
  Wifi,
  Home,
  Car,
  Fuel,
  Film,
  Activity,
  HeartPulse,
  Gift,
  Tag,
  Layers,
  Sparkles,
  DollarSign,
} from 'lucide-react';

interface NewExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultGroupId?: string;
  expenseToEdit?: Expense | null;
}

type SplitType = 'equal' | 'exact' | 'percentage' | 'shares';
type SidePanelMode = 'none' | 'split' | 'category';

// High-level Category Groups
const CATEGORY_GROUPS = [
  {
    name: 'Hogar y Supermercado',
    icon: ShoppingCart,
    color: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    items: ['Supermercado', 'Almacén & Abarrotes', 'Aseo y Limpieza', 'Mascotas'],
  },
  {
    name: 'Comida y Bebida',
    icon: Utensils,
    color: 'bg-orange-100 text-orange-800 border-orange-200',
    items: ['Restaurante', 'Bares y Salidas', 'Cafetería & Snacks', 'Delivery'],
  },
  {
    name: 'Servicios y Vivienda',
    icon: Zap,
    color: 'bg-amber-100 text-amber-800 border-amber-200',
    items: ['Servicios (Luz, Agua, Gas)', 'Internet & Cable', 'Alojamiento & Cabaña'],
  },
  {
    name: 'Transporte y Viajes',
    icon: Car,
    color: 'bg-blue-100 text-blue-800 border-blue-200',
    items: ['Bencina & Combustible', 'Transporte & Peajes', 'Pasajes & Vuelos'],
  },
  {
    name: 'Entretenimiento y Ocio',
    icon: Film,
    color: 'bg-purple-100 text-purple-800 border-purple-200',
    items: ['Cine & Eventos', 'Deportes', 'Regalos & Compras', 'Salud & Farmacia'],
  },
  {
    name: 'Otros',
    icon: DollarSign,
    color: 'bg-zinc-100 text-zinc-800 border-zinc-200',
    items: ['General', 'Varios / Otro'],
  },
];

function getCategoryIcon(catName: string) {
  const lower = (catName || '').toLowerCase();
  if (lower.includes('general') || lower === 'otros' || lower.includes('varios') || lower.includes('otro')) {
    return DollarSign;
  }
  if (lower.includes('supermercado') || lower.includes('abarrotes') || lower.includes('aseo')) {
    return ShoppingCart;
  }
  if (lower.includes('restaurante') || lower.includes('comida') || lower.includes('delivery')) {
    return Utensils;
  }
  if (lower.includes('bar') || lower.includes('café') || lower.includes('cafeteria')) {
    return Coffee;
  }
  if (lower.includes('servicio') || lower.includes('luz') || lower.includes('agua') || lower.includes('gas')) {
    return Zap;
  }
  if (lower.includes('internet') || lower.includes('cable') || lower.includes('net')) {
    return Wifi;
  }
  if (lower.includes('alojamiento') || lower.includes('cabaña') || lower.includes('arriendo')) {
    return Home;
  }
  if (lower.includes('bencina') || lower.includes('combustible') || lower.includes('gasolina')) {
    return Fuel;
  }
  if (lower.includes('transporte') || lower.includes('peaje') || lower.includes('auto') || lower.includes('pasaje')) {
    return Car;
  }
  if (lower.includes('cine') || lower.includes('evento') || lower.includes('entretenimiento')) {
    return Film;
  }
  if (lower.includes('deporte') || lower.includes('salud') || lower.includes('farmacia')) {
    return HeartPulse;
  }
  if (lower.includes('regalo') || lower.includes('compra')) {
    return Gift;
  }
  return DollarSign;
}

export function NewExpenseModal({
  isOpen,
  onClose,
  defaultGroupId,
  expenseToEdit,
}: NewExpenseModalProps) {
  const { currentProfile, userGroups, members, profiles, addExpense, updateExpense } = useExpense();

  const isEditing = Boolean(expenseToEdit);

  // Active side panel state ('none' | 'split' | 'category')
  const [activeSidePanel, setActiveSidePanel] = useState<SidePanelMode>('none');
  const [openCategoryGroup, setOpenCategoryGroup] = useState<string | null>('Hogar y Supermercado');

  // Form states
  const [groupId, setGroupId] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [totalAmount, setTotalAmount] = useState<string>('');
  const [paidBy, setPaidBy] = useState<string>('');
  const [category, setCategory] = useState<string>('General');
  const [notes, setNotes] = useState<string>('');
  const [expenseDate, setExpenseDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );

  // File input reference for direct image upload
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Itemized breakdown state
  const [useItems, setUseItems] = useState<boolean>(false);
  const [items, setItems] = useState<
    Array<{ description: string; amount: string; assignedMemberIds: string[] }>
  >([{ description: '', amount: '', assignedMemberIds: [] }]);
  const [expandedItemMemberIndex, setExpandedItemMemberIndex] = useState<number | null>(null);

  // Receipt photo state
  const [receiptUrl, setReceiptUrl] = useState<string>('');
  const [isUploadingReceipt, setIsUploadingReceipt] = useState<boolean>(false);

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
    setActiveSidePanel('none');

    if (expenseToEdit) {
      setGroupId(expenseToEdit.group_id);
      setDescription(expenseToEdit.description || '');
      setTotalAmount(expenseToEdit.total_amount ? String(expenseToEdit.total_amount) : '');
      setPaidBy(expenseToEdit.paid_by);
      setCategory(expenseToEdit.category || 'Supermercado');
      setExpenseDate(expenseToEdit.expense_date || new Date().toISOString().split('T')[0]);
      setReceiptUrl(expenseToEdit.receipt_url || '');
      setNotes(expenseToEdit.notes || '');

      if (expenseToEdit.items && expenseToEdit.items.length > 0) {
        setUseItems(true);
        setItems(
          expenseToEdit.items.map((i) => ({
            description: i.description,
            amount: String(i.amount),
            assignedMemberIds: [],
          }))
        );
      } else {
        setUseItems(false);
        setItems([{ description: '', amount: '', assignedMemberIds: [] }]);
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
      setNotes('');
      setCategory('General');
      setExpenseDate(new Date().toISOString().split('T')[0]);
      setUseItems(false);
      setItems([{ description: '', amount: '', assignedMemberIds: [] }]);
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
      setSplitType('equal');
      const otherProfiles = memberProfiles.filter((p) => p.id !== myId);
      if (otherProfiles.length > 0) {
        setSelectedMemberIds(otherProfiles.map((p) => p.id));
      } else {
        setSelectedMemberIds(memberProfiles.map((p) => p.id));
      }
    } else {
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
    setItems((prev) => [...prev, { description: '', amount: '', assignedMemberIds: [] }]);
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

  // Toggle member assignment for a specific item row
  const toggleItemMember = (itemIdx: number, userId: string) => {
    setItems((prev) =>
      prev.map((item, idx) => {
        if (idx !== itemIdx) return item;
        const current = item.assignedMemberIds || [];
        const exists = current.includes(userId);
        const updated = exists ? current.filter((id) => id !== userId) : [...current, userId];
        return { ...item, assignedMemberIds: updated };
      })
    );
  };

  const setItemMembersAll = (itemIdx: number) => {
    setItems((prev) =>
      prev.map((item, idx) => {
        if (idx !== itemIdx) return item;
        return { ...item, assignedMemberIds: [] };
      })
    );
  };

  // Calculate total owed by each active member based on item assignments
  const calculateItemizedMemberShares = () => {
    const result: Record<string, { total: number; items: string[] }> = {};
    const activeMembers = selectedMemberIds.length > 0 ? selectedMemberIds : memberProfiles.map((p) => p.id);

    activeMembers.forEach((id) => {
      result[id] = { total: 0, items: [] };
    });

    items.forEach((item) => {
      const amt = parseFloat(item.amount) || 0;
      if (amt <= 0) return;

      const assigned =
        item.assignedMemberIds && item.assignedMemberIds.length > 0
          ? item.assignedMemberIds.filter((id) => activeMembers.includes(id))
          : activeMembers;

      if (assigned.length === 0) return;

      const share = amt / assigned.length;
      const desc = item.description.trim() || 'Ítem sin nombre';

      assigned.forEach((id) => {
        if (result[id]) {
          result[id].total += share;
          result[id].items.push(desc);
        }
      });
    });

    return result;
  };

  const handleApplyItemizedSplits = () => {
    const shares = calculateItemizedMemberShares();
    const newCustomSplits: Record<string, string> = {};

    Object.keys(shares).forEach((uid) => {
      newCustomSplits[uid] = String(Math.round(shares[uid].total * 100) / 100);
    });

    setCustomSplits(newCustomSplits);
    setSplitType('exact');
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

  const numericTotal = parseFloat(totalAmount) || 0;
  const equalPerPerson = selectedMemberIds.length > 0 ? numericTotal / selectedMemberIds.length : 0;

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

    if (splitType === 'exact') {
      if (useItems) {
        const shares = calculateItemizedMemberShares();
        const autoSplits: Record<string, string> = {};
        selectedMemberIds.forEach((uid) => {
          const val = customSplits[uid] !== undefined ? parseFloat(customSplits[uid]) : (shares[uid]?.total || 0);
          autoSplits[uid] = String(Math.round((isNaN(val) ? (shares[uid]?.total || 0) : val) * 100) / 100);
        });
        setCustomSplits(autoSplits);
      } else {
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
      const shares = useItems ? calculateItemizedMemberShares() : {};
      selectedMemberIds.forEach((uid) => {
        const rawSplit = customSplits[uid];
        const val = rawSplit ? parseFloat(rawSplit) : (useItems ? (shares[uid]?.total || 0) : 0);
        finalSplits.push({
          user_id: uid,
          amount_owed: isNaN(val) ? 0 : Math.round(val * 100) / 100,
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
        notes: notes.trim() || undefined,
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
    setNotes('');
    setUseItems(false);
    setItems([{ description: '', amount: '', assignedMemberIds: [] }]);
    setCustomSplits({});
    setSplitType('equal');
    setSelectedMemberIds([]);
    setActiveSidePanel('none');
    setValidationError(null);
    onClose();
  };

  if (!isOpen) return null;

  const currentCategoryIcon = getCategoryIcon(category);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-zinc-950/70 backdrop-blur-sm overflow-y-auto">
      <div
        className={`bg-white rounded-[2rem] ring-1 ring-zinc-200 shadow-2xl w-full transition-all duration-300 overflow-hidden my-4 ${
          activeSidePanel !== 'none' ? 'max-w-4xl' : 'max-w-xl'
        }`}
      >
        {/* Top Header Bar */}
        <div className="bg-[#3da88a] text-white p-4 sm:p-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight text-white flex items-center space-x-2">
            <Receipt className="w-5 h-5 text-teal-100" />
            <span>{isEditing ? 'Editar gasto' : 'Añadir un gasto'}</span>
          </h2>
          <button
            onClick={resetAndClose}
            className="p-2 text-teal-100 hover:text-white hover:bg-teal-700/50 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
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

          <div className={`grid grid-cols-1 ${activeSidePanel !== 'none' ? 'md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-zinc-200' : ''}`}>
            
            {/* LEFT COLUMN: Main Expense Information */}
            <div className="p-6 sm:p-8 space-y-6">

              {/* Main Card: Dynamic Category Icon Box + Description + Big Amount */}
              <div className="bg-zinc-50 rounded-2xl p-5 border border-zinc-200 shadow-xs space-y-4">
                <div className="flex items-center space-x-4">
                  {/* Category Icon Box (Clicking opens Category Menu - SVG only, no text below) */}
                  <button
                    type="button"
                    onClick={() => setActiveSidePanel(activeSidePanel === 'category' ? 'none' : 'category')}
                    className="w-12 h-12 sm:w-14 sm:h-14 bg-emerald-50 hover:bg-emerald-100/80 active:scale-95 rounded-2xl border border-emerald-200/80 shadow-2xs flex items-center justify-center shrink-0 text-emerald-700 transition-all cursor-pointer group"
                    title="Haz clic para elegir categoría"
                  >
                    {React.createElement(currentCategoryIcon, { className: "w-6 h-6 text-emerald-700 group-hover:scale-110 transition-transform" })}
                  </button>

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

                {/* Sub-line: Integrated Who paid and split button inline */}
                <div className="text-xs text-zinc-600 flex items-center flex-wrap gap-1.5 pt-3 border-t border-zinc-200/80 leading-relaxed">
                  <span className="font-medium text-zinc-500">Pagado por</span>
                  
                  {/* Payer Selector Pill */}
                  <div className="relative inline-flex items-center">
                    <select
                      value={paidBy}
                      onChange={(e) => setPaidBy(e.target.value)}
                      className="bg-zinc-200/80 hover:bg-zinc-300 text-zinc-900 font-bold px-2.5 py-1 rounded-lg text-xs cursor-pointer border-none focus:outline-none appearance-none pr-5 transition-colors"
                    >
                      {memberProfiles.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.id === currentProfile?.id ? 'ti' : (p.full_name || p.email || 'Usuario').split(' ')[0]}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="w-3 h-3 text-zinc-500 absolute right-1.5 pointer-events-none" />
                  </div>

                  <span className="font-medium text-zinc-500">y dividido</span>

                  {/* Interactive Split Button */}
                  <button
                    type="button"
                    onClick={() => setActiveSidePanel(activeSidePanel === 'split' ? 'none' : 'split')}
                    className={`font-bold px-2.5 py-1 rounded-lg text-xs transition-all flex items-center space-x-1 cursor-pointer active:scale-95 border ${
                      activeSidePanel === 'split'
                        ? 'bg-[#3da88a] text-white border-[#3da88a] shadow-2xs'
                        : 'bg-emerald-100/90 hover:bg-emerald-200 text-emerald-900 border-emerald-200'
                    }`}
                  >
                    <span>
                      {splitType === 'equal'
                        ? 'a partes iguales'
                        : splitType === 'exact'
                        ? 'por montos exactos'
                        : splitType === 'percentage'
                        ? 'por porcentajes'
                        : 'por cuotas'}
                    </span>
                    <ChevronRight
                      className={`w-3.5 h-3.5 transition-transform ${
                        activeSidePanel === 'split' ? 'rotate-90 text-white' : 'text-emerald-700'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Notes Input Section */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-600 flex items-center space-x-1.5 pl-0.5">
                  <FileText className="w-3.5 h-3.5 text-zinc-500" />
                  <span>Nota / Información útil (opcional)</span>
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Escribe una nota o detalles sobre el gasto..."
                  className="w-full bg-zinc-50 border border-zinc-200 focus:border-zinc-800 rounded-xl px-3.5 py-2.5 text-xs font-medium text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-800 transition-colors"
                />
              </div>

              {/* Action Pills Row: Group, Date, Direct Image Upload, Category */}
              <div className="flex items-center gap-2 flex-wrap text-xs">
                {/* Group Selector Pill */}
                <div className="relative inline-flex items-center bg-zinc-100 hover:bg-zinc-200 px-3 py-1.5 rounded-full border border-zinc-200 text-zinc-700 text-xs font-semibold transition-colors">
                  <Users className="w-3.5 h-3.5 text-zinc-500 mr-1.5 shrink-0" />
                  <select
                    value={groupId || activeGroupId}
                    onChange={(e) => handleGroupSelect(e.target.value)}
                    className="bg-transparent text-xs font-semibold text-zinc-800 focus:outline-none cursor-pointer pr-4 appearance-none"
                  >
                    {userGroups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 text-zinc-500 absolute right-2.5 pointer-events-none" />
                </div>

                {/* Date Pill */}
                <label className="flex items-center space-x-1.5 bg-zinc-100 hover:bg-zinc-200 px-3 py-1.5 rounded-full border border-zinc-200 text-zinc-700 cursor-pointer transition-colors font-semibold">
                  <CalendarIcon className="w-3.5 h-3.5 text-zinc-500" />
                  <input
                    type="date"
                    value={expenseDate}
                    onChange={(e) => setExpenseDate(e.target.value)}
                    className="bg-transparent text-xs font-semibold focus:outline-none cursor-pointer"
                  />
                </label>

                {/* Direct Image Upload Button */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploadingReceipt}
                  className="flex items-center space-x-1.5 bg-zinc-100 hover:bg-zinc-200 px-3 py-1.5 rounded-full border border-zinc-200 text-zinc-700 font-semibold cursor-pointer transition-colors active:scale-95 disabled:opacity-50"
                >
                  {isUploadingReceipt ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-600" />
                  ) : (
                    <ImageIcon className="w-3.5 h-3.5 text-zinc-500" />
                  )}
                  <span>
                    {isUploadingReceipt
                      ? 'Subiendo...'
                      : receiptUrl
                      ? 'Cambiar imagen'
                      : 'Añadir imagen'}
                  </span>
                </button>

                {/* Category Button Pill */}
                <button
                  type="button"
                  onClick={() => setActiveSidePanel(activeSidePanel === 'category' ? 'none' : 'category')}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold transition-colors cursor-pointer ${
                    activeSidePanel === 'category'
                      ? 'bg-zinc-900 text-white border-zinc-900'
                      : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border-zinc-200'
                  }`}
                >
                  {React.createElement(currentCategoryIcon, { className: "w-3.5 h-3.5" })}
                  <span>{category}</span>
                </button>
              </div>

              {/* Hidden File Input for Direct Upload */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleReceiptFileChange}
                disabled={isUploadingReceipt}
                className="hidden"
              />

              {/* Receipt Preview Box */}
              {(receiptUrl || isUploadingReceipt) && (
                <div className="bg-zinc-50 p-3.5 rounded-2xl border border-zinc-200 space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold text-zinc-700">
                    <span>Comprobante adjunto</span>
                    {receiptUrl && (
                      <button
                        type="button"
                        onClick={() => setReceiptUrl('')}
                        className="text-rose-600 hover:text-rose-700 font-medium text-xs cursor-pointer"
                      >
                        Quitar
                      </button>
                    )}
                  </div>

                  {isUploadingReceipt ? (
                    <div className="flex items-center space-x-2 py-2 text-xs text-zinc-600">
                      <Loader2 className="w-4 h-4 animate-spin text-zinc-800" />
                      <span>Subiendo imagen del comprobante...</span>
                    </div>
                  ) : receiptUrl ? (
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
                      <div className="text-xs text-zinc-600 overflow-hidden flex-1">
                        <p className="font-semibold text-zinc-900 truncate">Foto cargada exitosamente</p>
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="text-[11px] text-emerald-700 hover:underline font-medium mt-0.5 cursor-pointer"
                        >
                          Cambiar foto
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              )}

              {/* Itemized breakdown toggle */}
              <div className="pt-2 border-t border-zinc-200 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="flex items-center space-x-2 cursor-pointer text-xs font-semibold text-zinc-800">
                    <input
                      type="checkbox"
                      checked={useItems}
                      onChange={(e) => setUseItems(e.target.checked)}
                      className="w-4 h-4 accent-emerald-600 rounded cursor-pointer"
                    />
                    <span>Desglosar en Ítems / Productos</span>
                  </label>
                </div>

                {useItems && (
                  <div className="bg-zinc-50/80 p-3.5 sm:p-4 rounded-2xl border border-zinc-200 space-y-3.5">
                    <div className="flex items-center justify-between text-[11px] font-bold text-zinc-500">
                      <span>LISTA DE ÍTEMS Y ASIGNACIÓN DE PERSONAS</span>
                      <span className="text-[10px] text-zinc-400 font-normal hidden sm:inline">
                        Toca las personas para asignar cada producto
                      </span>
                    </div>

                    {items.map((item, idx) => {
                      const itemAmt = parseFloat(item.amount) || 0;
                      const assignedIds = item.assignedMemberIds || [];
                      const isAll = assignedIds.length === 0;
                      const activeMembers =
                        selectedMemberIds.length > 0 ? selectedMemberIds : memberProfiles.map((p) => p.id);
                      const effectiveCount = isAll ? activeMembers.length : assignedIds.length;
                      const sharePerPerson = effectiveCount > 0 ? itemAmt / effectiveCount : itemAmt;

                      return (
                        <div
                          key={idx}
                          className="bg-white p-3 rounded-xl border border-zinc-200/90 shadow-2xs space-y-2.5 transition-all hover:border-zinc-300"
                        >
                          {/* Row 1: Item Name & Price & Delete */}
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              placeholder="Ej: Cervezas, Carnes, Ensalada..."
                              value={item.description}
                              onChange={(e) => handleItemChange(idx, 'description', e.target.value)}
                              className="flex-1 px-3 py-1.5 bg-zinc-50 border border-zinc-200 focus:border-zinc-800 focus:bg-white rounded-lg text-xs font-medium text-zinc-900 placeholder:text-zinc-400 focus:outline-none transition-colors"
                            />
                            <div className="relative shrink-0">
                              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-zinc-400 font-semibold">
                                $
                              </span>
                              <input
                                type="number"
                                placeholder="0"
                                value={item.amount}
                                onChange={(e) => handleItemChange(idx, 'amount', e.target.value)}
                                className="w-24 pl-6 pr-2.5 py-1.5 bg-zinc-50 border border-zinc-200 focus:border-zinc-800 focus:bg-white rounded-lg text-xs font-semibold text-zinc-900 focus:outline-none transition-colors"
                              />
                            </div>
                            {items.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveItemRow(idx)}
                                className="p-1.5 text-zinc-400 hover:text-rose-600 rounded-lg transition-colors cursor-pointer"
                                title="Eliminar ítem"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>

                          {/* Row 2: Collapsible Repartir Entre Bar */}
                          <div className="pt-2 border-t border-zinc-100 space-y-2">
                            <div className="flex items-center justify-between text-xs flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => setExpandedItemMemberIndex(expandedItemMemberIndex === idx ? null : idx)}
                                className="flex items-center space-x-1.5 px-3 py-1 bg-zinc-100 hover:bg-zinc-200/90 text-zinc-800 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                              >
                                <Users className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                                <span>
                                  Repartir entre:{' '}
                                  <strong className="text-zinc-900">
                                    {isAll
                                      ? `Todos (${activeMembers.length})`
                                      : assignedIds
                                          .map((id) => {
                                            const p = memberProfiles.find((m) => m.id === id);
                                            return p ? (p.full_name || p.email || 'U').split(' ')[0] : '';
                                          })
                                          .filter(Boolean)
                                          .join(', ')}
                                  </strong>
                                </span>
                                <ChevronDown
                                  className={`w-3.5 h-3.5 text-zinc-500 transition-transform ${
                                    expandedItemMemberIndex === idx ? 'rotate-180' : ''
                                  }`}
                                />
                              </button>

                              {itemAmt > 0 && (
                                <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-100 shrink-0">
                                  ${Math.round(sharePerPerson).toLocaleString()} c/u ({effectiveCount})
                                </span>
                              )}
                            </div>

                            {/* Expandable Member Selection Chips */}
                            {expandedItemMemberIndex === idx && (
                              <div className="mt-2 p-3 bg-zinc-50 rounded-xl border border-zinc-200/80 space-y-2 animate-fadeIn">
                                <div className="flex items-center justify-between text-[11px] font-semibold text-zinc-500">
                                  <span>Personas asignadas a este producto:</span>
                                  <button
                                    type="button"
                                    onClick={() => setExpandedItemMemberIndex(null)}
                                    className="text-xs text-emerald-700 font-bold hover:underline cursor-pointer"
                                  >
                                    Listo
                                  </button>
                                </div>

                                <div className="flex items-center space-x-1.5 flex-wrap gap-y-1.5">
                                  {/* Todos Pill */}
                                  <button
                                    type="button"
                                    onClick={() => setItemMembersAll(idx)}
                                    className={`px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                                      isAll
                                        ? 'bg-zinc-900 text-white shadow-2xs'
                                        : 'bg-white text-zinc-700 hover:bg-zinc-100 border border-zinc-200'
                                    }`}
                                  >
                                    Todos ({activeMembers.length})
                                  </button>

                                  {/* Individual Member Chips */}
                                  {memberProfiles.map((p) => {
                                    const isSelected = !isAll && assignedIds.includes(p.id);
                                    const displayName = p.full_name || p.email || 'Usuario';
                                    const firstName = displayName.split(' ')[0];
                                    return (
                                      <button
                                        key={p.id}
                                        type="button"
                                        onClick={() => toggleItemMember(idx, p.id)}
                                        className={`flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                                          isSelected
                                            ? 'bg-emerald-600 text-white shadow-2xs ring-1 ring-emerald-600/50'
                                            : 'bg-white text-zinc-700 hover:bg-zinc-100 border border-zinc-200'
                                        }`}
                                      >
                                        <span className="w-3.5 h-3.5 rounded-full bg-black/10 text-[9px] flex items-center justify-center uppercase font-bold shrink-0">
                                          {firstName.charAt(0)}
                                        </span>
                                        <span>{firstName}</span>
                                        {isSelected && <Check className="w-3 h-3 text-white ml-0.5" />}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    <div className="flex items-center justify-between pt-1 flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={handleAddItemRow}
                        className="flex items-center space-x-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-800 cursor-pointer bg-white px-3 py-1.5 rounded-xl border border-zinc-200 shadow-2xs transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Añadir otro ítem</span>
                      </button>

                      {items.some((i) => (parseFloat(i.amount) || 0) > 0) && (
                        <button
                          type="button"
                          onClick={handleApplyItemizedSplits}
                          className="flex items-center space-x-1 text-xs font-semibold text-zinc-800 hover:text-zinc-900 bg-emerald-100/70 hover:bg-emerald-200/80 px-3 py-1.5 rounded-xl transition-colors cursor-pointer"
                        >
                          <Sparkles className="w-3.5 h-3.5 text-emerald-700" />
                          <span>Aplicar reparto por ítem a la cuenta</span>
                        </button>
                      )}
                    </div>

                    {/* Live Itemized Breakdown Summary */}
                    {items.some((i) => (parseFloat(i.amount) || 0) > 0) && (
                      <div className="mt-3 pt-3 border-t border-zinc-200/80 space-y-2">
                        <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider block">
                          Resumen de total calculado por integrante
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {Object.entries(calculateItemizedMemberShares()).map(([uid, data]) => {
                            const member = memberProfiles.find((m) => m.id === uid);
                            if (!member || data.total <= 0) return null;
                            const mDisplayName = member.full_name || member.email || 'Usuario';
                            const mFirstName = mDisplayName.split(' ')[0];
                            return (
                              <div
                                key={uid}
                                className="flex items-center justify-between bg-white p-2.5 rounded-xl border border-zinc-200/80 text-xs"
                              >
                                <div className="flex items-center space-x-2 overflow-hidden">
                                  <div className="w-6 h-6 rounded-full bg-zinc-900 text-white font-bold text-[10px] flex items-center justify-center shrink-0">
                                    {mFirstName.charAt(0)}
                                  </div>
                                  <div className="truncate">
                                    <p className="font-semibold text-zinc-900 truncate">{mFirstName}</p>
                                    <p className="text-[10px] text-zinc-500 truncate">
                                      {data.items.length} {data.items.length === 1 ? 'ítem' : 'ítems'}: {data.items.join(', ')}
                                    </p>
                                  </div>
                                </div>
                                <span className="font-bold text-emerald-700 shrink-0 ml-2">
                                  ${Math.round(data.total).toLocaleString()}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT COLUMN: Rendered conditionally when a side panel is active */}
            {activeSidePanel === 'split' && (
              <div className="p-6 sm:p-8 space-y-6 bg-zinc-50/50 animate-fadeIn">
                <div className="flex items-center justify-between pb-3 border-b border-zinc-200">
                  <div className="flex items-center space-x-2">
                    <Users className="w-5 h-5 text-emerald-700" />
                    <h3 className="text-base font-semibold text-zinc-900 tracking-tight">
                      Elegir opciones de división
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveSidePanel('none')}
                    className="p-1 text-zinc-400 hover:text-zinc-700 rounded-lg"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Quick Presets */}
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => applyQuickPreset('split')}
                    className={`w-full py-2.5 px-4 rounded-full text-xs font-semibold transition-all border ${
                      quickPreset === 'split'
                        ? 'bg-[#3da88a] text-white border-[#3da88a] shadow-2xs'
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
                        ? 'bg-[#3da88a] text-white border-[#3da88a] shadow-2xs'
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
                        ? 'bg-[#3da88a] text-white border-[#3da88a] shadow-2xs'
                        : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-100'
                    }`}
                  >
                    Ellos deben la cantidad total
                  </button>
                </div>

                {/* Split Mode Toolbar */}
                <div>
                  <div className="inline-flex bg-white rounded-xl p-1 border border-zinc-200 shadow-2xs w-full justify-between">
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
                          ? 'bg-zinc-900 text-white shadow-2xs'
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
                          ? 'bg-zinc-900 text-white shadow-2xs'
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
                          ? 'bg-zinc-900 text-white shadow-2xs'
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
                          ? 'bg-zinc-900 text-white shadow-2xs'
                          : 'text-zinc-600 hover:bg-zinc-100'
                      }`}
                    >
                      ≡
                    </button>
                  </div>
                </div>

                {/* Description */}
                <div>
                  <h4 className="text-sm font-semibold text-zinc-900">
                    {splitType === 'equal' && 'Dividir a partes iguales'}
                    {splitType === 'exact' && 'Dividir por montos exactos'}
                    {splitType === 'percentage' && 'Dividir por porcentaje'}
                    {splitType === 'shares' && 'Dividir por cuotas'}
                  </h4>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {splitType === 'equal' && 'El total se distribuye equitativamente entre los seleccionados.'}
                    {splitType === 'exact' && 'Ingresa el monto específico para cada integrante.'}
                    {splitType === 'percentage' && 'Asigna un porcentaje (%) a cada integrante (suma 100%).'}
                    {splitType === 'shares' && 'Asigna la cantidad de partes/cuotas a cada integrante.'}
                  </p>
                </div>

                {/* Member Selection List */}
                <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
                  {memberProfiles.map((p) => {
                    const isChecked = selectedMemberIds.includes(p.id);

                    return (
                      <div
                        key={p.id}
                        className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                          isChecked
                            ? 'bg-white border-zinc-200 shadow-2xs'
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

                          <span className={`text-xs font-medium ${isChecked ? 'text-zinc-900' : 'text-zinc-500'}`}>
                            {p.full_name} {p.id === currentProfile?.id ? '(Tú)' : ''}
                          </span>
                        </label>

                        {/* Display or edit inputs */}
                        <div className="text-right pl-2">
                          {splitType === 'equal' && isChecked && (
                            <span className="text-xs font-semibold text-zinc-800">
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
                                className="w-20 px-2 py-1 bg-white border border-zinc-200 rounded-lg text-right font-semibold text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
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
                              <span className="text-xs text-zinc-500 font-medium">cuota</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setActiveSidePanel('none')}
                    className="px-5 py-2 rounded-full bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-semibold"
                  >
                    Listo
                  </button>
                </div>
              </div>
            )}

            {activeSidePanel === 'category' && (
              <div className="p-6 sm:p-8 space-y-5 bg-zinc-50/50 animate-fadeIn">
                <div className="flex items-center justify-between pb-3 border-b border-zinc-200">
                  <div className="flex items-center space-x-2">
                    <Layers className="w-5 h-5 text-emerald-700" />
                    <h3 className="text-base font-semibold text-zinc-900 tracking-tight">
                      Elegir Categoría
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveSidePanel('none')}
                    className="p-1 text-zinc-400 hover:text-zinc-700 rounded-lg"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <p className="text-xs text-zinc-500">
                  Selecciona la categoría más adecuada para organizar este gasto:
                </p>

                {/* Grouped Accordion / Category List */}
                <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
                  {CATEGORY_GROUPS.map((group) => {
                    const GroupIcon = group.icon;
                    const isOpenGroup = openCategoryGroup === group.name;

                    return (
                      <div
                        key={group.name}
                        className="bg-white rounded-2xl border border-zinc-200/90 shadow-2xs overflow-hidden"
                      >
                        <button
                          type="button"
                          onClick={() =>
                            setOpenCategoryGroup(isOpenGroup ? null : group.name)
                          }
                          className="w-full p-3.5 flex items-center justify-between text-left hover:bg-zinc-50 transition-colors"
                        >
                          <div className="flex items-center space-x-3">
                            <div className={`p-2 rounded-xl border ${group.color}`}>
                              <GroupIcon className="w-4 h-4" />
                            </div>
                            <span className="text-xs font-bold text-zinc-900">
                              {group.name}
                            </span>
                          </div>
                          <ChevronDown
                            className={`w-4 h-4 text-zinc-400 transition-transform ${
                              isOpenGroup ? 'rotate-180' : ''
                            }`}
                          />
                        </button>

                        {isOpenGroup && (
                          <div className="p-2 pt-0 border-t border-zinc-100 bg-zinc-50/50 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                            {group.items.map((catItem) => {
                              const ItemIcon = getCategoryIcon(catItem);
                              const isSelected = category === catItem;

                              return (
                                <button
                                  key={catItem}
                                  type="button"
                                  onClick={() => {
                                    setCategory(catItem);
                                    setActiveSidePanel('none');
                                  }}
                                  className={`p-2.5 rounded-xl text-left text-xs font-medium flex items-center space-x-2.5 transition-all ${
                                    isSelected
                                      ? 'bg-emerald-600 text-white font-semibold shadow-2xs'
                                      : 'bg-white hover:bg-emerald-50 text-zinc-800 border border-zinc-200/80 hover:border-emerald-300'
                                  }`}
                                >
                                  <ItemIcon className={`w-3.5 h-3.5 ${isSelected ? 'text-white' : 'text-emerald-700'}`} />
                                  <span className="truncate">{catItem}</span>
                                  {isSelected && <Check className="w-3.5 h-3.5 ml-auto text-white shrink-0" />}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setActiveSidePanel('none')}
                    className="px-5 py-2 rounded-full bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-semibold"
                  >
                    Listo
                  </button>
                </div>
              </div>
            )}

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
              className="px-8 py-2.5 rounded-full bg-[#3da88a] hover:bg-[#349378] text-white text-xs font-semibold shadow-2xs transition-all active:scale-95"
            >
              {isEditing ? 'Guardar Cambios' : 'Guardar'}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}
