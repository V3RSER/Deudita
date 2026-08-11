'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import Image from 'next/image';
import { useExpense } from '@/lib/expense-context';
import { Expense, ExpenseItem, ExpenseSplit } from '@/lib/types';
import { formatCurrency } from '@/lib/balance-utils';
import { FormattedCurrencyInput } from '@/components/FormattedCurrencyInput';
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
  Wallet,
  CreditCard,
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
  const [itemsTab, setItemsTab] = useState<'items' | 'assignment'>('items');
  const [items, setItems] = useState<
    Array<{
      description: string;
      quantity: string;
      unitPrice: string;
      amount: string;
      assignedMemberIds: string[];
    }>
  >([{ description: '', quantity: '1', unitPrice: '', amount: '', assignedMemberIds: [] }]);
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
            quantity: '1',
            unitPrice: String(i.amount),
            amount: String(i.amount),
            assignedMemberIds: [],
          }))
        );
      } else {
        setUseItems(false);
        setItems([{ description: '', quantity: '1', unitPrice: '', amount: '', assignedMemberIds: [] }]);
      }
      setItemsTab('items');

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
      setItems([{ description: '', quantity: '1', unitPrice: '', amount: '', assignedMemberIds: [] }]);
      setItemsTab('items');
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
    setItems((prev) => [
      ...prev,
      { description: '', quantity: '1', unitPrice: '', amount: '', assignedMemberIds: [] },
    ]);
  };

  const handleRemoveItemRow = (index: number) => {
    setItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleItemChange = (
    index: number,
    field: 'description' | 'quantity' | 'unitPrice' | 'amount',
    value: string
  ) => {
    const updated = items.map((item, idx) => {
      if (idx !== index) return item;

      const newItem = { ...item, [field]: value };

      if (field === 'quantity') {
        const q = parseFloat(value) || 1;
        const u = parseFloat(item.unitPrice) || 0;
        if (u > 0) {
          newItem.amount = (q * u).toFixed(2).replace(/\.00$/, '');
        } else if (item.amount) {
          const a = parseFloat(item.amount) || 0;
          newItem.unitPrice = a > 0 ? (a / q).toFixed(2).replace(/\.00$/, '') : '';
        }
      } else if (field === 'unitPrice') {
        const q = parseFloat(item.quantity) || 1;
        const u = parseFloat(value) || 0;
        newItem.amount = u > 0 ? (q * u).toFixed(2).replace(/\.00$/, '') : '';
      } else if (field === 'amount') {
        const q = parseFloat(item.quantity) || 1;
        const a = parseFloat(value) || 0;
        if (a > 0 && q > 0) {
          newItem.unitPrice = (a / q).toFixed(2).replace(/\.00$/, '');
        }
      }

      return newItem;
    });

    setItems(updated);

    if (useItems) {
      const sum = updated.reduce((acc, curr) => {
        const val = parseFloat(curr.amount);
        return acc + (isNaN(val) ? 0 : val);
      }, 0);
      if (sum >= 0) {
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
    setItems([{ description: '', quantity: '1', unitPrice: '', amount: '', assignedMemberIds: [] }]);
    setItemsTab('items');
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
        <div className="bg-gradient-to-r from-emerald-700 via-teal-700 to-emerald-800 text-white p-4 sm:p-5 flex items-center justify-between">
          <h2 className="text-lg font-bold tracking-tight text-white flex items-center space-x-2">
            <Receipt className="w-5 h-5 text-emerald-200" />
            <span>{isEditing ? 'Editar gasto' : 'Añadir un gasto'}</span>
          </h2>
          <button
            type="button"
            onClick={resetAndClose}
            className="p-2 text-emerald-100 hover:text-white hover:bg-emerald-600/40 rounded-full transition-all cursor-pointer"
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

              {/* Mode Switcher Tabs: Gasto sencillo vs Desglosar en artículos */}
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
                      : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200/50'
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
                      ? 'bg-emerald-700 text-white shadow-2xs'
                      : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200/50'
                  }`}
                >
                  <Receipt className="w-3.5 h-3.5" />
                  <span>Desglosar en artículos</span>
                </button>
              </div>

              {/* Main Card: Dynamic Category Icon Box + Description + Amount */}
              <div className="bg-emerald-50/40 rounded-2xl p-5 border border-emerald-100/80 shadow-2xs space-y-4">
                <div className="flex items-start space-x-4">
                  {/* Category Icon Box (Clicking opens Category Menu) */}
                  <button
                    type="button"
                    onClick={() => setActiveSidePanel(activeSidePanel === 'category' ? 'none' : 'category')}
                    className="w-12 h-12 sm:w-14 sm:h-14 bg-white hover:bg-emerald-100/90 active:scale-95 rounded-2xl border border-emerald-200 shadow-2xs flex items-center justify-center shrink-0 text-emerald-700 transition-all cursor-pointer group mt-0.5"
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
                      placeholder="Descripción"
                      className="w-full bg-transparent border-b border-emerald-200 focus:border-emerald-700 py-1 text-base sm:text-lg font-semibold text-zinc-900 placeholder:text-zinc-400 focus:outline-none transition-colors"
                    />

                    {/* Amount Field */}
                    <div className="space-y-1">
                      <div className="flex items-center space-x-1 border-b border-emerald-200 focus-within:border-emerald-700 py-1">
                        <FormattedCurrencyInput
                          required
                          disabled={useItems}
                          value={totalAmount}
                          currency={currencyCode}
                          onChange={(val) => {
                            setTotalAmount(val);
                            setValidationError(null);
                          }}
                          placeholder="0"
                          className="w-full bg-transparent text-2xl sm:text-3xl font-black text-zinc-900 placeholder:text-zinc-300 focus:outline-none disabled:text-zinc-400"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Group & Action Controls Row */}
              <div className="flex items-center gap-2 flex-wrap text-xs">
                {/* Group Selector Dropdown */}
                <div className="relative inline-flex items-center bg-white hover:bg-emerald-50/70 px-3 py-1.5 rounded-full border border-zinc-200 text-zinc-800 text-xs font-semibold transition-all cursor-pointer shadow-2xs">
                  <Users className="w-3.5 h-3.5 text-emerald-700 mr-1.5 shrink-0" />
                  <select
                    value={groupId}
                    onChange={(e) => handleGroupSelect(e.target.value)}
                    className="bg-transparent text-xs font-bold text-zinc-900 focus:outline-none cursor-pointer pr-5 appearance-none"
                  >
                    <option value="none">Sin grupo</option>
                    {userGroups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 text-zinc-500 absolute right-2.5 pointer-events-none" />
                </div>

                {/* Quién Pagó Selector Dropdown (at same level) */}
                <div className="relative inline-flex items-center bg-white hover:bg-emerald-50/70 px-3 py-1.5 rounded-full border border-zinc-200 text-zinc-800 text-xs font-semibold transition-all cursor-pointer shadow-2xs">
                  <CreditCard className="w-3.5 h-3.5 text-emerald-700 mr-1.5 shrink-0" />
                  <span className="text-zinc-500 mr-1 font-medium">Pagó:</span>
                  <select
                    value={paidBy}
                    onChange={(e) => {
                      setPaidBy(e.target.value);
                      setValidationError(null);
                    }}
                    className="bg-transparent text-xs font-bold text-zinc-900 focus:outline-none cursor-pointer pr-5 appearance-none"
                  >
                    {memberProfiles.map((p) => {
                      const isCurrent = p.id === currentProfile?.id;
                      const displayName = p.full_name ? p.full_name.split(' ')[0] : (p.email ? p.email.split('@')[0] : 'Usuario');
                      return (
                        <option key={p.id} value={p.id}>
                          {isCurrent ? `Tú` : displayName}
                        </option>
                      );
                    })}
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 text-zinc-500 absolute right-2.5 pointer-events-none" />
                </div>

                {/* Category Button Pill */}
                <button
                  type="button"
                  onClick={() => setActiveSidePanel(activeSidePanel === 'category' ? 'none' : 'category')}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold transition-colors cursor-pointer shadow-2xs ${
                    activeSidePanel === 'category'
                      ? 'bg-zinc-900 text-white border-zinc-900'
                      : 'bg-white hover:bg-emerald-50/70 text-zinc-700 border-zinc-200'
                  }`}
                >
                  {React.createElement(currentCategoryIcon, { className: "w-3.5 h-3.5 text-emerald-700" })}
                  <span>{category}</span>
                </button>

                {/* Date Pill */}
                <label className="flex items-center space-x-1.5 bg-white hover:bg-emerald-50/70 px-3 py-1.5 rounded-full border border-zinc-200 text-zinc-700 cursor-pointer transition-colors font-semibold shadow-2xs">
                  <CalendarIcon className="w-3.5 h-3.5 text-emerald-700" />
                  <input
                    type="date"
                    value={expenseDate}
                    onChange={(e) => setExpenseDate(e.target.value)}
                    className="bg-transparent text-xs font-semibold text-zinc-900 focus:outline-none cursor-pointer"
                  />
                </label>

                {/* Direct Image Upload Button */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploadingReceipt}
                  className="flex items-center space-x-1.5 bg-white hover:bg-emerald-50/70 px-3 py-1.5 rounded-full border border-zinc-200 text-zinc-700 font-semibold cursor-pointer transition-colors active:scale-95 disabled:opacity-50 shadow-2xs"
                >
                  {isUploadingReceipt ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-700" />
                  ) : (
                    <ImageIcon className="w-3.5 h-3.5 text-emerald-700" />
                  )}
                  <span>
                    {isUploadingReceipt
                      ? 'Subiendo...'
                      : receiptUrl
                      ? 'Cambiar foto'
                      : 'Añadir foto'}
                  </span>
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
                        detailText = `${shareData.items.length} ${shareData.items.length === 1 ? 'artículo' : 'artículos'}: ${shareData.items.join(', ')}`;
                      } else {
                        detailText = 'Sin artículos asignados';
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
                            ? 'bg-white border-zinc-200/90 shadow-2xs hover:border-emerald-200'
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
                            <div className="w-8 h-8 rounded-full bg-emerald-800 text-white font-bold text-xs flex items-center justify-center shrink-0">
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
              <div className="p-6 sm:p-8 space-y-5 bg-zinc-50/80 animate-fadeIn">
                {/* Itemized Panel Header with Sub-tabs */}
                <div className="space-y-3 pb-3 border-b border-zinc-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Receipt className="w-5 h-5 text-emerald-700" />
                      <h3 className="text-base font-bold text-zinc-900 tracking-tight">
                        Desglosar en artículos
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveSidePanel('none')}
                      className="p-1 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-200/60 rounded-lg cursor-pointer transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* 2 Step Tabs */}
                  <div className="flex items-center bg-zinc-200/70 p-1 rounded-xl text-xs font-semibold">
                    <button
                      type="button"
                      onClick={() => setItemsTab('items')}
                      className={`flex-1 py-1.5 px-2 rounded-lg transition-all flex items-center justify-center space-x-1.5 cursor-pointer ${
                        itemsTab === 'items'
                          ? 'bg-white text-zinc-900 shadow-2xs font-bold'
                          : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200/50'
                      }`}
                    >
                      <ShoppingCart className="w-3.5 h-3.5 text-emerald-700" />
                      <span>1. Artículos</span>
                      <span className="bg-emerald-100 text-emerald-800 text-[10px] px-1.5 py-0.2 rounded-full font-bold">
                        {items.length}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setItemsTab('assignment')}
                      className={`flex-1 py-1.5 px-2 rounded-lg transition-all flex items-center justify-center space-x-1.5 cursor-pointer ${
                        itemsTab === 'assignment'
                          ? 'bg-emerald-700 text-white shadow-2xs font-bold'
                          : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200/50'
                      }`}
                    >
                      <Users className="w-3.5 h-3.5" />
                      <span>2. Asignación</span>
                    </button>
                  </div>
                </div>

                {/* TAB 1: CARGAR ARTÍCULOS */}
                {itemsTab === 'items' && (
                  <div className="space-y-4 animate-fadeIn">
                    <p className="text-xs text-zinc-500 font-medium">
                      Paso 1: Ingresa los artículos de la factura con sus cantidades y precios:
                    </p>

                    <div className="space-y-3 max-h-[340px] overflow-y-auto pr-1">
                      {items.map((item, idx) => {
                        const q = parseFloat(item.quantity) || 1;
                        const u = parseFloat(item.unitPrice) || 0;
                        const totalVal = parseFloat(item.amount) || 0;

                        return (
                          <div
                            key={idx}
                            className="bg-white p-3.5 rounded-2xl border border-zinc-200 shadow-2xs space-y-3 hover:border-emerald-300 transition-colors"
                          >
                            {/* Descripción del artículo */}
                            <div className="flex items-center justify-between gap-2">
                              <input
                                type="text"
                                placeholder={`Artículo #${idx + 1} (ej: Pizza, Bebidas, Postre...)`}
                                value={item.description}
                                onChange={(e) => handleItemChange(idx, 'description', e.target.value)}
                                className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 focus:border-emerald-600 focus:bg-white rounded-xl text-xs font-semibold text-zinc-900 placeholder:text-zinc-400 focus:outline-none transition-colors"
                              />
                              {items.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveItemRow(idx)}
                                  className="p-1.5 text-zinc-400 hover:text-rose-600 rounded-lg transition-colors cursor-pointer shrink-0"
                                  title="Eliminar artículo"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>

                            {/* Grid: Cantidad | Precio c/u | Total */}
                            <div className="grid grid-cols-3 gap-2 pt-1 border-t border-zinc-100">
                              {/* Cantidad */}
                              <div>
                                <label className="text-[10px] font-bold text-zinc-500 block mb-1">
                                  Cantidad
                                </label>
                                <input
                                  type="number"
                                  min="1"
                                  step="any"
                                  placeholder="1"
                                  value={item.quantity}
                                  onChange={(e) => handleItemChange(idx, 'quantity', e.target.value)}
                                  className="w-full px-2.5 py-1.5 bg-zinc-50 border border-zinc-200 focus:border-emerald-600 focus:bg-white rounded-xl text-xs font-bold text-zinc-900 focus:outline-none"
                                />
                              </div>

                              {/* Precio c/u */}
                              <div>
                                <label className="text-[10px] font-bold text-zinc-500 block mb-1">
                                  Precio unit.
                                </label>
                                <div className="relative">
                                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-zinc-400 font-bold">
                                    $
                                  </span>
                                  <input
                                    type="number"
                                    step="any"
                                    placeholder="0"
                                    value={item.unitPrice}
                                    onChange={(e) => handleItemChange(idx, 'unitPrice', e.target.value)}
                                    className="w-full pl-5 pr-2 py-1.5 bg-zinc-50 border border-zinc-200 focus:border-emerald-600 focus:bg-white rounded-xl text-xs font-semibold text-zinc-900 focus:outline-none"
                                  />
                                </div>
                              </div>

                              {/* Precio Total */}
                              <div>
                                <label className="text-[10px] font-bold text-emerald-700 block mb-1">
                                  Precio total
                                </label>
                                <div className="relative">
                                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-emerald-700 font-bold">
                                    $
                                  </span>
                                  <input
                                    type="number"
                                    step="any"
                                    placeholder="0"
                                    value={item.amount}
                                    onChange={(e) => handleItemChange(idx, 'amount', e.target.value)}
                                    className="w-full pl-5 pr-2 py-1.5 bg-emerald-50/60 border border-emerald-200 focus:border-emerald-600 focus:bg-white rounded-xl text-xs font-bold text-emerald-900 focus:outline-none"
                                  />
                                </div>
                              </div>
                            </div>

                            {/* Quick summary line for item */}
                            {totalVal > 0 && (
                              <div className="text-[11px] text-zinc-500 font-medium pt-1 flex items-center justify-between border-t border-zinc-100/80">
                                <span>
                                  {q > 1 ? `${q} unid. × ${formatCurrency(u, currencyCode)}` : '1 unidad'}
                                </span>
                                <span className="font-bold text-emerald-800">
                                  Total: {formatCurrency(totalVal, currencyCode)}
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Bottom Controls for Tab 1 */}
                    <div className="space-y-3 pt-2">
                      <div className="flex items-center justify-between">
                        <button
                          type="button"
                          onClick={handleAddItemRow}
                          className="flex items-center space-x-1.5 text-xs font-bold text-emerald-700 hover:text-emerald-800 cursor-pointer bg-white px-3.5 py-2 rounded-xl border border-emerald-200 shadow-2xs hover:bg-emerald-50/50 transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Añadir otro artículo</span>
                        </button>

                        <div className="text-right">
                          <span className="text-[10px] text-zinc-400 font-bold block uppercase tracking-wider">
                            Total Factura
                          </span>
                          <span className="text-base font-black text-emerald-800">
                            {formatCurrency(parseFloat(totalAmount) || 0, currencyCode)}
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setItemsTab('assignment')}
                        className="w-full py-2.5 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold cursor-pointer shadow-2xs transition-all flex items-center justify-center space-x-2 active:scale-98"
                      >
                        <span>Continuar a asignar personas (Paso 2)</span>
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                {/* TAB 2: ASIGNAR PERSONAS */}
                {itemsTab === 'assignment' && (
                  <div className="space-y-4 animate-fadeIn">
                    <p className="text-xs text-zinc-500 font-medium">
                      Paso 2: Selecciona quiénes consumieron o participan en cada artículo:
                    </p>

                    <div className="space-y-3.5 max-h-[340px] overflow-y-auto pr-1">
                      {items.map((item, idx) => {
                        const itemAmt = parseFloat(item.amount) || 0;
                        const q = parseFloat(item.quantity) || 1;
                        const assignedIds = item.assignedMemberIds || [];
                        const isAll = assignedIds.length === 0;
                        const activeMembers =
                          selectedMemberIds.length > 0 ? selectedMemberIds : memberProfiles.map((p) => p.id);
                        const effectiveCount = isAll ? activeMembers.length : assignedIds.length;
                        const sharePerPerson = effectiveCount > 0 ? itemAmt / effectiveCount : itemAmt;

                        return (
                          <div
                            key={idx}
                            className="bg-white p-3.5 rounded-2xl border border-zinc-200/90 shadow-2xs space-y-3 hover:border-emerald-200 transition-colors"
                          >
                            {/* Header: Article name and total price */}
                            <div className="flex items-center justify-between border-b border-zinc-100 pb-2">
                              <div>
                                <p className="text-xs font-bold text-zinc-900">
                                  {item.description.trim() || `Artículo #${idx + 1}`}
                                </p>
                                <p className="text-[11px] text-zinc-500">
                                  {q > 1 ? `${q} unidades` : '1 unidad'} · Total: {formatCurrency(itemAmt, currencyCode)}
                                </p>
                              </div>

                              {itemAmt > 0 && (
                                <div className="text-right">
                                  <span className="text-xs font-extrabold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200/60 inline-block">
                                    {formatCurrency(sharePerPerson, currencyCode)} c/u
                                  </span>
                                </div>
                              )}
                            </div>

                            {/* Member selector pills */}
                            <div className="space-y-2">
                              <div className="flex items-center justify-between text-[11px] font-bold text-zinc-500">
                                <span>Repartir entre:</span>
                                <span className="text-emerald-700">
                                  {isAll ? 'Todos los integrantes' : `${assignedIds.length} persona(s)`}
                                </span>
                              </div>

                              <div className="flex items-center space-x-1.5 flex-wrap gap-y-1.5">
                                <button
                                  type="button"
                                  onClick={() => setItemMembersAll(idx)}
                                  className={`px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                                    isAll
                                      ? 'bg-emerald-700 text-white shadow-2xs font-bold'
                                      : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 border border-zinc-200'
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
                                      className={`flex items-center space-x-1 px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                                        isSelected
                                          ? 'bg-emerald-600 text-white shadow-2xs font-bold'
                                          : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 border border-zinc-200'
                                      }`}
                                    >
                                      <span>{firstName}</span>
                                      {isSelected && <Check className="w-3 h-3 text-white ml-0.5" />}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Bottom Buttons for Tab 2 */}
                    <div className="flex items-center justify-between pt-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setItemsTab('items')}
                        className="px-3.5 py-2 rounded-xl bg-white hover:bg-zinc-100 border border-zinc-200 text-zinc-700 text-xs font-bold cursor-pointer transition-colors"
                      >
                        ← Volver a artículos
                      </button>

                      <button
                        type="button"
                        onClick={handleApplyItemizedSplits}
                        className="px-5 py-2.5 rounded-full bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold cursor-pointer shadow-2xs transition-all active:scale-95"
                      >
                        Aplicar reparto
                      </button>
                    </div>
                  </div>
                )}
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
