'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  Loader2,
  Calendar as CalendarIcon,
  Check,
  ChevronDown,
  ChevronRight,
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
  Plane,
  Film,
  Beer,
  HeartPulse,
  Gift,
  DollarSign,
  Sparkles,
  Dog,
  PackageCheck,
  Building,
  Ticket,
  Trophy,
  Tag,
  Layers,
  LucideIcon,
  UserPlus,
} from 'lucide-react';

interface NewExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultGroupId?: string;
  expenseToEdit?: Expense | null;
}

type SplitType = 'equal' | 'exact' | 'percentage' | 'shares';
type SidePanelMode = 'none' | 'split' | 'category' | 'items';

interface CategoryGroupItem {
  name: string;
  icon: LucideIcon;
  color: string;
  items: string[];
}

const CATEGORY_GROUPS: CategoryGroupItem[] = [
  {
    name: 'Hogar',
    icon: Home,
    color: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    items: ['Supermercado', 'Abarrotes', 'Limpieza', 'Mascotas'],
  },
  {
    name: 'Comida',
    icon: Utensils,
    color: 'bg-orange-100 text-orange-800 border-orange-200',
    items: ['Restaurante', 'Bares', 'Cafetería', 'Delivery'],
  },
  {
    name: 'Servicios',
    icon: Zap,
    color: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    items: ['Servicios', 'Internet', 'Alojamiento'],
  },
  {
    name: 'Transporte',
    icon: Car,
    color: 'bg-blue-100 text-blue-800 border-blue-200',
    items: ['Combustible', 'Transporte', 'Pasajes'],
  },
  {
    name: 'Entretenimiento',
    icon: Film,
    color: 'bg-purple-100 text-purple-800 border-purple-200',
    items: ['Cine', 'Deportes', 'Compras', 'Salud'],
  },
  {
    name: 'Otros',
    icon: Tag,
    color: 'bg-zinc-100 text-zinc-800 border-zinc-200',
    items: ['General', 'Otros'],
  },
];

function getCategoryIcon(catName: string): LucideIcon {
  const lower = (catName || '').toLowerCase();
  if (lower.includes('super') || lower.includes('mercado') || lower.includes('almacen')) {
    return ShoppingCart;
  }
  if (lower.includes('abarrote') || lower.includes('despensa')) {
    return ShoppingBag;
  }
  if (lower.includes('limpieza') || lower.includes('aseo')) {
    return Sparkles;
  }
  if (lower.includes('mascota') || lower.includes('perro') || lower.includes('gato') || lower.includes('vet')) {
    return Dog;
  }
  if (lower.includes('hogar') || lower.includes('vivienda') || lower.includes('arriendo')) {
    return Home;
  }
  if (lower.includes('restaurante') || lower.includes('comida') || lower.includes('almuerzo') || lower.includes('cena')) {
    return Utensils;
  }
  if (lower.includes('delivery') || lower.includes('pedidos') || lower.includes('rappi')) {
    return PackageCheck;
  }
  if (lower.includes('cafe') || lower.includes('cafeteria') || lower.includes('snack')) {
    return Coffee;
  }
  if (lower.includes('bar') || lower.includes('cerveza') || lower.includes('trago') || lower.includes('fiesta')) {
    return Beer;
  }
  if (lower.includes('servicio') || lower.includes('luz') || lower.includes('agua') || lower.includes('gas')) {
    return Zap;
  }
  if (lower.includes('internet') || lower.includes('cable') || lower.includes('wifi')) {
    return Wifi;
  }
  if (lower.includes('alojamiento') || lower.includes('hotel') || lower.includes('airbnb')) {
    return Building;
  }
  if (lower.includes('combustible') || lower.includes('bencina') || lower.includes('gasolina')) {
    return Fuel;
  }
  if (lower.includes('pasaje') || lower.includes('vuelo') || lower.includes('avion')) {
    return Plane;
  }
  if (lower.includes('peaje') || lower.includes('ticket')) {
    return Ticket;
  }
  if (lower.includes('transporte') || lower.includes('auto') || lower.includes('taxi') || lower.includes('uber')) {
    return Car;
  }
  if (lower.includes('cine') || lower.includes('entretenimiento') || lower.includes('evento')) {
    return Film;
  }
  if (lower.includes('deporte') || lower.includes('gimnasio') || lower.includes('gym')) {
    return Trophy;
  }
  if (lower.includes('salud') || lower.includes('farmacia') || lower.includes('medico')) {
    return HeartPulse;
  }
  if (lower.includes('regalo') || lower.includes('compra') || lower.includes('tienda')) {
    return Gift;
  }
  if (lower.includes('general') || lower.includes('otros') || lower.includes('varios')) {
    return Tag;
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

  // Active side panel state ('none' | 'split' | 'category' | 'items')
  const [activeSidePanel, setActiveSidePanel] = useState<SidePanelMode>('none');
  const [openCategoryGroup, setOpenCategoryGroup] = useState<string | null>('Hogar');

  // Form states
  const [groupId, setGroupId] = useState<string>('none');
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

  // Itemized breakdown state (Gasto tipo factura)
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

  // Additional selected friends for "Sin grupo" personal expense
  const [extraFriendIds, setExtraFriendIds] = useState<string[]>([]);

  // Validation error banner
  const [validationError, setValidationError] = useState<string | null>(null);

  // Determine effective group and member profiles
  const isNoGroup = !groupId || groupId === 'none';
  const selectedGroup = userGroups.find((g) => g.id === groupId);
  const currencyCode = selectedGroup?.currency || currentProfile?.currency || 'COP';

  const memberProfiles = useMemo(() => {
    if (isNoGroup) {
      const base = currentProfile ? [currentProfile] : [];
      const extra = extraFriendIds
        .map((id) => profiles.find((p) => p.id === id))
        .filter((p): p is NonNullable<typeof p> => p !== undefined && p.id !== currentProfile?.id);
      return [...base, ...extra];
    }
    const groupMembers = members.filter((m) => m.group_id === groupId);
    const profs = groupMembers
      .map((m) => profiles.find((p) => p.id === m.user_id))
      .filter((p): p is NonNullable<typeof p> => p !== undefined);
    return profs.length > 0 ? profs : (currentProfile ? [currentProfile] : []);
  }, [isNoGroup, groupId, members, profiles, currentProfile, extraFriendIds]);

  // Track last modal state
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
      setGroupId(expenseToEdit.group_id || 'none');
      setDescription(expenseToEdit.description || '');
      setTotalAmount(expenseToEdit.total_amount ? String(expenseToEdit.total_amount) : '');
      setPaidBy(expenseToEdit.paid_by);
      setCategory(expenseToEdit.category || 'General');
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
        setSelectedMemberIds(memberProfiles.map((p) => p.id));
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
          : 'none';

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

      if (currentProfile) {
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

    let newProfiles: typeof profiles = [];
    if (!newGroupId || newGroupId === 'none') {
      newProfiles = currentProfile ? [currentProfile] : [];
    } else {
      const newGroupMembers = members.filter((m) => m.group_id === newGroupId);
      newProfiles = newGroupMembers
        .map((m) => profiles.find((p) => p.id === m.user_id))
        .filter((p): p is NonNullable<typeof p> => p !== undefined);
    }

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
      setPaidBy(currentProfile?.id || '');
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
      const desc = item.description.trim() || 'Ítem';

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
    setActiveSidePanel('none');
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

    if (memberProfiles.length === 0) {
      setValidationError('Ingresa al menos un integrante o mantén tu perfil.');
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
            `La suma de los montos (${formatCurrency(sum, currencyCode)}) no coincide con el total (${formatCurrency(
              numericTotal,
              currencyCode
            )}). Diferencia: ${formatCurrency(Math.abs(sum - numericTotal), currencyCode)}`
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
          setValidationError(`Ingresa una cantidad de cuotas o pesos válida (> 0).`);
          return false;
        }
        totalShares += shares;
      }
      if (totalShares <= 0) {
        setValidationError('La suma total de proporciones debe ser mayor a 0.');
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
          `La suma de los ítems (${formatCurrency(itemsSum, currencyCode)}) no coincide con el total (${formatCurrency(
            numericTotal,
            currencyCode
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

    const effectiveGroupId = isNoGroup ? null : groupId;
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
        group_id: effectiveGroupId as any,
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
  const itemizedShares = calculateItemizedMemberShares();

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
            type="button"
            onClick={resetAndClose}
            className="p-2 text-teal-100 hover:text-white hover:bg-teal-700/50 rounded-full transition-colors cursor-pointer"
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
            
            {/* MAIN / LEFT COLUMN */}
            <div className="p-6 sm:p-8 space-y-6">

              {/* Mode Switcher Tabs: Gasto sencillo vs Gasto tipo factura */}
              <div className="flex items-center space-x-2 bg-zinc-100 p-1.5 rounded-2xl border border-zinc-200">
                <button
                  type="button"
                  onClick={() => {
                    setUseItems(false);
                    if (activeSidePanel === 'items') setActiveSidePanel('none');
                  }}
                  className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    !useItems
                      ? 'bg-white text-zinc-900 shadow-2xs'
                      : 'text-zinc-500 hover:text-zinc-900'
                  }`}
                >
                  Gasto sencillo
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setUseItems(true);
                    setActiveSidePanel('items');
                  }}
                  className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-1.5 cursor-pointer ${
                    useItems
                      ? 'bg-zinc-900 text-white shadow-2xs'
                      : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  <Receipt className="w-3.5 h-3.5" />
                  <span>Desglosar en Ítems / Productos</span>
                </button>
              </div>

              {/* Main Card: Dynamic Category Icon Box + Description + Big Amount */}
              <div className="bg-zinc-50/80 rounded-2xl p-5 border border-zinc-200 shadow-2xs space-y-4">
                <div className="flex items-start space-x-4">
                  {/* Category Icon Box (Clicking opens Category Menu) */}
                  <button
                    type="button"
                    onClick={() => setActiveSidePanel(activeSidePanel === 'category' ? 'none' : 'category')}
                    className="w-12 h-12 sm:w-14 sm:h-14 bg-emerald-50 hover:bg-emerald-100/80 active:scale-95 rounded-2xl border border-emerald-200/80 shadow-2xs flex items-center justify-center shrink-0 text-emerald-700 transition-all cursor-pointer group mt-0.5"
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
                      placeholder="Descripción del gasto (ej: Cena, Supermercado...)"
                      className="w-full bg-transparent border-b border-zinc-200 focus:border-zinc-800 py-1 text-base sm:text-lg font-semibold text-zinc-900 placeholder:text-zinc-400 focus:outline-none transition-colors"
                    />

                    {/* Amount Field with Live Formatted Currency Badge */}
                    <div className="space-y-1">
                      <div className="flex items-center space-x-1 border-b border-zinc-200 focus-within:border-zinc-800 py-1">
                        <span className="text-2xl sm:text-3xl font-black text-zinc-400">$</span>
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
                          placeholder="0"
                          className="w-full bg-transparent text-2xl sm:text-3xl font-black text-zinc-900 placeholder:text-zinc-300 focus:outline-none disabled:text-zinc-400"
                        />
                      </div>

                      {/* Currency Format Convention Preview Badge */}
                      {numericTotal > 0 && (
                        <div className="flex items-center space-x-2 text-xs font-semibold text-emerald-700">
                          <span className="bg-emerald-100/80 text-emerald-900 px-2.5 py-0.5 rounded-md font-bold">
                            {formatCurrency(numericTotal, currencyCode)}
                          </span>
                          {useItems && <span className="text-[11px] text-zinc-500">(Suma total de ítems)</span>}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Sub-line: Integrated Who paid and split button inline */}
                <div className="text-xs text-zinc-600 flex items-center flex-wrap gap-1.5 pt-3 border-t border-zinc-200/80 leading-relaxed">
                  <span className="font-semibold text-zinc-500">Pagado por</span>
                  
                  {/* Payer Selector Pill */}
                  <div className="relative inline-flex items-center">
                    <select
                      value={paidBy}
                      onChange={(e) => setPaidBy(e.target.value)}
                      className="bg-zinc-100 hover:bg-zinc-200 text-zinc-900 font-bold px-2.5 py-1 rounded-lg text-xs cursor-pointer border border-zinc-200/90 focus:outline-none appearance-none pr-6 transition-colors shadow-2xs"
                    >
                      {memberProfiles.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.id === currentProfile?.id ? 'ti' : (p.full_name || p.email || 'Usuario').split(' ')[0]}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="w-3 h-3 text-zinc-500 absolute right-1.5 pointer-events-none" />
                  </div>

                  <span className="font-semibold text-zinc-500">y dividido</span>

                  {/* Interactive Split Button */}
                  <button
                    type="button"
                    onClick={() => setActiveSidePanel(activeSidePanel === 'split' ? 'none' : 'split')}
                    className={`font-bold px-2.5 py-1 rounded-lg text-xs transition-all flex items-center space-x-1 cursor-pointer active:scale-95 border ${
                      activeSidePanel === 'split'
                        ? 'bg-zinc-900 text-white border-zinc-900 shadow-2xs'
                        : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-900 border-zinc-200'
                    }`}
                  >
                    <span>
                      {splitType === 'equal'
                        ? 'a partes iguales'
                        : splitType === 'exact'
                        ? 'por montos exactos'
                        : splitType === 'percentage'
                        ? 'por porcentajes'
                        : 'por peso'}
                    </span>
                    <ChevronRight
                      className={`w-3.5 h-3.5 transition-transform ${
                        activeSidePanel === 'split' ? 'rotate-90 text-white' : 'text-zinc-600'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Group & Action Controls Row */}
              <div className="flex items-center gap-2 flex-wrap text-xs">
                {/* Themed Group Selector Dropdown */}
                <div className="relative inline-flex items-center bg-zinc-100 hover:bg-zinc-200/80 px-3 py-1.5 rounded-full border border-zinc-200 text-zinc-800 text-xs font-semibold transition-all">
                  <Users className="w-3.5 h-3.5 text-emerald-700 mr-1.5 shrink-0" />
                  <select
                    value={groupId}
                    onChange={(e) => handleGroupSelect(e.target.value)}
                    className="bg-transparent text-xs font-bold text-zinc-900 focus:outline-none cursor-pointer pr-5 appearance-none"
                  >
                    <option value="none">Sin grupo (Gasto personal / Historial)</option>
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

              {/* Hidden File Input */}
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

              {/* Notes Input Section */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-600 flex items-center space-x-1.5 pl-0.5">
                  <FileText className="w-3.5 h-3.5 text-zinc-500" />
                  <span>Nota o detalles (opcional)</span>
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Detalles sobre la compra o anotaciones..."
                  className="w-full bg-zinc-50 border border-zinc-200 focus:border-zinc-800 rounded-xl px-3.5 py-2.5 text-xs font-medium text-zinc-900 placeholder:text-zinc-400 focus:outline-none transition-colors"
                />
              </div>

              {/* UNIFIED MEMBER SPLIT DISPLAY SECTION (ALWAYS IN MAIN MENU ABOVE SAVE BUTTON) */}
              <div className="bg-zinc-50/90 rounded-2xl p-4 sm:p-5 border border-zinc-200/90 space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-zinc-200">
                  <div className="flex items-center space-x-2">
                    <Users className="w-4 h-4 text-emerald-700" />
                    <span className="text-xs font-bold text-zinc-900 uppercase tracking-wider">
                      Reparto entre personas
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setActiveSidePanel(activeSidePanel === 'split' ? 'none' : 'split')}
                    className="text-xs font-bold text-emerald-700 hover:text-emerald-800 flex items-center space-x-1 cursor-pointer hover:underline"
                  >
                    <span>Opciones de división</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Render Member Breakdown Cards */}
                <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                  {memberProfiles.map((p) => {
                    const isSelected = selectedMemberIds.includes(p.id);
                    const displayName = p.full_name || p.email || 'Usuario';
                    const isCurrent = p.id === currentProfile?.id;

                    // Calculate display amount for this member
                    let amountOwed = 0;
                    let detailText = '';

                    if (useItems) {
                      const shareData = itemizedShares[p.id];
                      amountOwed = shareData?.total || 0;
                      if (shareData && shareData.items.length > 0) {
                        detailText = `${shareData.items.length} ${shareData.items.length === 1 ? 'ítem' : 'ítems'}: ${shareData.items.join(', ')}`;
                      } else {
                        detailText = 'Sin ítems asignados';
                      }
                    } else if (splitType === 'equal') {
                      amountOwed = isSelected ? equalPerPerson : 0;
                      detailText = isSelected ? 'A partes iguales' : 'No participa';
                    } else if (splitType === 'exact') {
                      amountOwed = parseFloat(customSplits[p.id] || '0') || 0;
                      detailText = 'Monto exacto asignado';
                    } else if (splitType === 'percentage') {
                      const pct = parseFloat(customSplits[p.id] || '0') || 0;
                      amountOwed = (numericTotal * pct) / 100;
                      detailText = `${pct}% del total`;
                    } else if (splitType === 'shares') {
                      const totalSharesSum = selectedMemberIds.reduce((sum, id) => {
                        const val = parseFloat(customSplits[id] || '1');
                        return sum + (isNaN(val) || val <= 0 ? 0 : val);
                      }, 0);
                      const weight = parseFloat(customSplits[p.id] || '1') || 0;
                      amountOwed = totalSharesSum > 0 ? (numericTotal * weight) / totalSharesSum : 0;
                      detailText = `${weight} ${weight === 1 ? 'peso' : 'pesos'}`;
                    }

                    return (
                      <div
                        key={p.id}
                        className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                          isSelected
                            ? 'bg-white border-zinc-200/90 shadow-2xs'
                            : 'bg-zinc-100/50 border-zinc-200/50 opacity-60'
                        }`}
                      >
                        <div className="flex items-center space-x-3 overflow-hidden">
                          {p.avatar_url ? (
                            <Image
                              src={p.avatar_url}
                              alt={displayName}
                              width={32}
                              height={32}
                              className="w-8 h-8 rounded-full object-cover border border-zinc-200 shrink-0"
                              unoptimized
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-zinc-900 text-white font-bold text-xs flex items-center justify-center shrink-0">
                              {displayName.charAt(0).toUpperCase()}
                            </div>
                          )}

                          <div className="truncate">
                            <p className="text-xs font-bold text-zinc-900 truncate">
                              {displayName} {isCurrent ? '(Tú)' : ''}
                            </p>
                            <p className="text-[11px] text-zinc-500 truncate">{detailText}</p>
                          </div>
                        </div>

                        <div className="text-right shrink-0 ml-3">
                          <span className="text-sm font-extrabold text-zinc-900 block tracking-tight">
                            {formatCurrency(amountOwed, currencyCode)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>

            {/* RIGHT COLUMN SIDE PANELS */}
            {activeSidePanel === 'items' && (
              <div className="p-6 sm:p-8 space-y-5 bg-zinc-50/50 animate-fadeIn">
                <div className="flex items-center justify-between pb-3 border-b border-zinc-200">
                  <div className="flex items-center space-x-2">
                    <Receipt className="w-5 h-5 text-emerald-700" />
                    <h3 className="text-base font-semibold text-zinc-900 tracking-tight">
                      Desglosar en Ítems / Productos
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveSidePanel('none')}
                    className="p-1 text-zinc-400 hover:text-zinc-700 rounded-lg cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <p className="text-xs text-zinc-500">
                  Agrega cada producto de la factura y selecciona quiénes lo consumieron para calcular la división exacta:
                </p>

                <div className="space-y-3.5 max-h-[380px] overflow-y-auto pr-1">
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
                        className="bg-white p-3.5 rounded-2xl border border-zinc-200/90 shadow-2xs space-y-3"
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            placeholder="Nombre del producto o ítem..."
                            value={item.description}
                            onChange={(e) => handleItemChange(idx, 'description', e.target.value)}
                            className="flex-1 px-3 py-2 bg-zinc-50 border border-zinc-200 focus:border-zinc-800 focus:bg-white rounded-xl text-xs font-medium text-zinc-900 placeholder:text-zinc-400 focus:outline-none transition-colors"
                          />
                          <div className="relative shrink-0">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-zinc-400 font-bold">
                              $
                            </span>
                            <input
                              type="number"
                              placeholder="0"
                              value={item.amount}
                              onChange={(e) => handleItemChange(idx, 'amount', e.target.value)}
                              className="w-28 pl-7 pr-3 py-2 bg-zinc-50 border border-zinc-200 focus:border-zinc-800 focus:bg-white rounded-xl text-xs font-bold text-zinc-900 focus:outline-none transition-colors"
                            />
                          </div>
                          {items.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveItemRow(idx)}
                              className="p-2 text-zinc-400 hover:text-rose-600 rounded-lg transition-colors cursor-pointer"
                              title="Eliminar ítem"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>

                        {/* Member assignment pill for this item */}
                        <div className="pt-2 border-t border-zinc-100 space-y-2">
                          <div className="flex items-center justify-between text-xs flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => setExpandedItemMemberIndex(expandedItemMemberIndex === idx ? null : idx)}
                              className="flex items-center space-x-1.5 px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200/90 text-zinc-800 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                            >
                              <Users className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                              <span>
                                Asignado a:{' '}
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
                              <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-100 shrink-0">
                                {formatCurrency(sharePerPerson, currencyCode)} c/u
                              </span>
                            )}
                          </div>

                          {expandedItemMemberIndex === idx && (
                            <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200/80 space-y-2 animate-fadeIn">
                              <div className="flex items-center justify-between text-[11px] font-bold text-zinc-500">
                                <span>Selecciona quiénes consumieron este ítem:</span>
                                <button
                                  type="button"
                                  onClick={() => setExpandedItemMemberIndex(null)}
                                  className="text-xs text-emerald-700 font-bold hover:underline cursor-pointer"
                                >
                                  Listo
                                </button>
                              </div>

                              <div className="flex items-center space-x-1.5 flex-wrap gap-y-1.5">
                                <button
                                  type="button"
                                  onClick={() => setItemMembersAll(idx)}
                                  className={`px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                                    isAll
                                      ? 'bg-zinc-900 text-white shadow-2xs'
                                      : 'bg-white text-zinc-700 hover:bg-zinc-100 border border-zinc-200'
                                  }`}
                                >
                                  Todos
                                </button>

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
                                          ? 'bg-emerald-600 text-white shadow-2xs'
                                          : 'bg-white text-zinc-700 hover:bg-zinc-100 border border-zinc-200'
                                      }`}
                                    >
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
                </div>

                <div className="flex items-center justify-between pt-2 flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleAddItemRow}
                    className="flex items-center space-x-1.5 text-xs font-bold text-emerald-700 hover:text-emerald-800 cursor-pointer bg-white px-3.5 py-2 rounded-xl border border-zinc-200 shadow-2xs transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Añadir otro ítem</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleApplyItemizedSplits}
                    className="px-5 py-2 rounded-full bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-semibold cursor-pointer"
                  >
                    Aplicar reparto
                  </button>
                </div>
              </div>
            )}

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
                    className="p-1 text-zinc-400 hover:text-zinc-700 rounded-lg cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Quick Presets */}
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => applyQuickPreset('split')}
                    className={`w-full py-2.5 px-4 rounded-full text-xs font-semibold transition-all border cursor-pointer ${
                      quickPreset === 'split'
                        ? 'bg-zinc-900 text-white border-zinc-900 shadow-2xs'
                        : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-100'
                    }`}
                  >
                    Dividir el gasto
                  </button>

                  <button
                    type="button"
                    onClick={() => applyQuickPreset('i_owe_all')}
                    className={`w-full py-2.5 px-4 rounded-full text-xs font-semibold transition-all border cursor-pointer ${
                      quickPreset === 'i_owe_all'
                        ? 'bg-zinc-900 text-white border-zinc-900 shadow-2xs'
                        : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-100'
                    }`}
                  >
                    Debes la cantidad total
                  </button>

                  <button
                    type="button"
                    onClick={() => applyQuickPreset('they_owe_all')}
                    className={`w-full py-2.5 px-4 rounded-full text-xs font-semibold transition-all border cursor-pointer ${
                      quickPreset === 'they_owe_all'
                        ? 'bg-zinc-900 text-white border-zinc-900 shadow-2xs'
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
                      className={`flex-1 py-2 rounded-lg text-sm font-bold flex items-center justify-center transition-all cursor-pointer ${
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
                      className={`flex-1 py-2 rounded-lg text-xs font-bold flex items-center justify-center transition-all cursor-pointer ${
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
                      className={`flex-1 py-2 rounded-lg text-sm font-bold flex items-center justify-center transition-all cursor-pointer ${
                        splitType === 'percentage'
                          ? 'bg-zinc-900 text-white shadow-2xs'
                          : 'text-zinc-600 hover:bg-zinc-100'
                      }`}
                    >
                      %
                    </button>

                    <button
                      type="button"
                      title="Por peso"
                      onClick={() => {
                        setSplitType('shares');
                        setQuickPreset('split');
                        setValidationError(null);
                      }}
                      className={`flex-1 py-2 rounded-lg text-sm font-bold flex items-center justify-center transition-all cursor-pointer ${
                        splitType === 'shares'
                          ? 'bg-zinc-900 text-white shadow-2xs'
                          : 'text-zinc-600 hover:bg-zinc-100'
                      }`}
                    >
                      ≡
                    </button>
                  </div>
                </div>

                {/* Mode Description */}
                <div>
                  <h4 className="text-sm font-semibold text-zinc-900">
                    {splitType === 'equal' && 'Dividir a partes iguales'}
                    {splitType === 'exact' && 'Dividir por montos exactos'}
                    {splitType === 'percentage' && 'Dividir por porcentaje'}
                    {splitType === 'shares' && 'Dividir por peso / cuotas'}
                  </h4>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {splitType === 'equal' && 'El total se distribuye equitativamente entre los seleccionados.'}
                    {splitType === 'exact' && 'Ingresa el monto específico para cada integrante.'}
                    {splitType === 'percentage' && 'Asigna un porcentaje (%) a cada integrante (suma 100%).'}
                    {splitType === 'shares' && 'Asigna una proporción o peso a cada participante.'}
                  </p>
                </div>

                {/* Member Selection List */}
                <div className="space-y-2.5 max-h-[280px] overflow-y-auto pr-1">
                  {memberProfiles.map((p) => {
                    const isChecked = selectedMemberIds.includes(p.id);

                    const pctVal = parseFloat(customSplits[p.id] || '0') || 0;
                    const pctAmount = (numericTotal * pctVal) / 100;

                    const totalSharesSum = selectedMemberIds.reduce((sum, id) => {
                      const val = parseFloat(customSplits[id] || '1');
                      return sum + (isNaN(val) || val <= 0 ? 0 : val);
                    }, 0);
                    const userWeightVal = parseFloat(customSplits[p.id] || '1');
                    const safeWeight = isNaN(userWeightVal) || userWeightVal < 0 ? 0 : userWeightVal;
                    const sharesAmount = totalSharesSum > 0 ? (numericTotal * safeWeight) / totalSharesSum : 0;

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
                            className="w-4 h-4 accent-zinc-900 rounded cursor-pointer"
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

                        <div className="text-right pl-2">
                          {splitType === 'equal' && isChecked && (
                            <span className="text-xs font-bold text-zinc-800">
                              {formatCurrency(equalPerPerson, currencyCode)}
                            </span>
                          )}

                          {splitType === 'exact' && isChecked && (
                            <div className="flex items-center space-x-1">
                              <span className="text-xs text-zinc-400 font-bold">$</span>
                              <input
                                type="number"
                                step="any"
                                placeholder="0"
                                value={customSplits[p.id] !== undefined ? customSplits[p.id] : ''}
                                onChange={(e) => handleCustomSplitChange(p.id, e.target.value)}
                                className="w-20 px-2 py-1 bg-white border border-zinc-200 rounded-lg text-right font-bold text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                              />
                            </div>
                          )}

                          {splitType === 'percentage' && isChecked && (
                            <div className="flex items-center space-x-2">
                              <div className="flex items-center space-x-1">
                                <input
                                  type="number"
                                  step="any"
                                  placeholder="0"
                                  value={customSplits[p.id] !== undefined ? customSplits[p.id] : ''}
                                  onChange={(e) => handleCustomSplitChange(p.id, e.target.value)}
                                  className="w-16 px-2 py-1 bg-white border border-zinc-200 rounded-lg text-right font-bold text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                                />
                                <span className="text-xs text-zinc-500 font-bold">%</span>
                              </div>
                              <span className="text-xs font-bold text-zinc-900 bg-zinc-100 px-2 py-1 rounded-md min-w-[64px] text-right">
                                {formatCurrency(pctAmount, currencyCode)}
                              </span>
                            </div>
                          )}

                          {splitType === 'shares' && isChecked && (
                            <div className="flex items-center space-x-2">
                              <div className="flex items-center space-x-1">
                                <input
                                  type="number"
                                  step="1"
                                  placeholder="1"
                                  value={customSplits[p.id] !== undefined ? customSplits[p.id] : '1'}
                                  onChange={(e) => handleCustomSplitChange(p.id, e.target.value)}
                                  className="w-16 px-2 py-1 bg-white border border-zinc-200 rounded-lg text-right font-bold text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                                />
                                <span className="text-xs text-zinc-500 font-medium">peso</span>
                              </div>
                              <span className="text-xs font-bold text-zinc-900 bg-zinc-100 px-2 py-1 rounded-md min-w-[64px] text-right">
                                {formatCurrency(sharesAmount, currencyCode)}
                              </span>
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
                    className="px-5 py-2 rounded-full bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-semibold cursor-pointer"
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
                    className="p-1 text-zinc-400 hover:text-zinc-700 rounded-lg cursor-pointer"
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
                          className="w-full p-3.5 flex items-center justify-between text-left hover:bg-zinc-50 transition-colors cursor-pointer"
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
                                  className={`p-2.5 rounded-xl text-left text-xs font-semibold flex items-center space-x-2.5 transition-all cursor-pointer ${
                                    isSelected
                                      ? 'bg-emerald-600 text-white shadow-2xs'
                                      : 'bg-white hover:bg-emerald-50 text-zinc-800 border border-zinc-200/80 hover:border-emerald-300'
                                  }`}
                                >
                                  <ItemIcon className={`w-4 h-4 ${isSelected ? 'text-white' : 'text-emerald-700'}`} />
                                  <span className="truncate">{catItem}</span>
                                  {isSelected && <Check className="w-4 h-4 ml-auto text-white shrink-0" />}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

          </div>

          {/* Bottom Action Footer */}
          <div className="p-6 bg-zinc-50 border-t border-zinc-200 flex items-center justify-end space-x-3">
            <button
              type="button"
              onClick={resetAndClose}
              className="px-6 py-2.5 rounded-full border border-zinc-300 bg-white hover:bg-zinc-100 text-zinc-700 text-xs font-semibold transition-colors cursor-pointer"
            >
              Cancelar
            </button>

            <button
              type="submit"
              className="px-8 py-2.5 rounded-full bg-[#3da88a] hover:bg-[#349378] text-white text-xs font-semibold shadow-2xs transition-all active:scale-95 cursor-pointer"
            >
              {isEditing ? 'Guardar Cambios' : 'Guardar'}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}
