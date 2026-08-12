'use client';

import React, { useState, useRef, useMemo } from 'react';
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
  Wallet,
  CreditCard,
  ArrowRight,
  ArrowLeft,
  AlertTriangle,
  CheckCircle2,
  ListOrdered,
} from 'lucide-react';

interface NewExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultGroupId?: string;
  expenseToEdit?: Expense | null;
}

type FlowType = 'unselected' | 'expense' | 'invoice';
type SplitType = 'equal' | 'exact' | 'percentage' | 'shares' | 'itemized';

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
  const lower = (catName ? catName : '').toLowerCase();
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

  // Flow State: 'unselected' | 'expense' | 'invoice'
  const [flowType, setFlowType] = useState<FlowType>('unselected');

  // Step state: 1: 'type_select', 2: 'basic_info', 3: 'invoice_items', 4: 'split_summary'
  const [step, setStep] = useState<number>(1);

  // Category Picker Sheet State
  const [showCategoryPicker, setShowCategoryPicker] = useState<boolean>(false);
  const [openCategoryGroup, setOpenCategoryGroup] = useState<string | null>('Hogar');

  // Basic Form States
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

  // Invoice / Itemized breakdown state
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

  // Receipt photo state
  const [receiptUrl, setReceiptUrl] = useState<string>('');
  const [isUploadingReceipt, setIsUploadingReceipt] = useState<boolean>(false);

  // Split options state
  const [splitType, setSplitType] = useState<SplitType>('equal');
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);

  // SEPARATE INDEPENDENT STATES FOR EACH SPLIT MODE
  const [exactSplits, setExactSplits] = useState<Record<string, string>>({});
  const [percentageSplits, setPercentageSplits] = useState<Record<string, string>>({});
  const [sharesSplits, setSharesSplits] = useState<Record<string, string>>({});

  // Additional selected friends for "Sin grupo" personal expense
  const [extraFriendIds, setExtraFriendIds] = useState<string[]>([]);

  // Validation error banner and popup modal
  const [validationError, setValidationError] = useState<string | null>(null);
  const [showDiscrepancyModal, setShowDiscrepancyModal] = useState<boolean>(false);

  // Determine effective group and member profiles
  const isNoGroup = !groupId || groupId === 'none';
  const selectedGroup = userGroups.find((g) => g.id === groupId);
  const currencyCode = selectedGroup?.currency ? selectedGroup.currency : (currentProfile?.currency ? currentProfile.currency : 'COP');

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

  // Modal Initialization / Reset
  const [lastModalState, setLastModalState] = useState<{
    isOpen: boolean;
    expenseId?: string;
  }>({ isOpen: false });

  const currentExpenseId = expenseToEdit ? expenseToEdit.id : 'new';

  if (isOpen && (!lastModalState.isOpen || lastModalState.expenseId !== currentExpenseId)) {
    setLastModalState({ isOpen: true, expenseId: currentExpenseId });
    setValidationError(null);
    setShowDiscrepancyModal(false);
    setShowCategoryPicker(false);

    if (expenseToEdit) {
      setGroupId(expenseToEdit.group_id ? expenseToEdit.group_id : 'none');
      setDescription(expenseToEdit.description ? expenseToEdit.description : '');
      setTotalAmount(expenseToEdit.total_amount ? String(expenseToEdit.total_amount) : '');
      setPaidBy(expenseToEdit.paid_by);
      setCategory(expenseToEdit.category ? expenseToEdit.category : 'General');
      setExpenseDate(expenseToEdit.expense_date ? expenseToEdit.expense_date : new Date().toISOString().split('T')[0]);
      setReceiptUrl(expenseToEdit.receipt_url ? expenseToEdit.receipt_url : '');
      setNotes(expenseToEdit.notes ? expenseToEdit.notes : '');

      if (expenseToEdit.items && expenseToEdit.items.length > 0) {
        setFlowType('invoice');
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
        setFlowType('expense');
        setItems([{ description: '', quantity: '1', unitPrice: '', amount: '', assignedMemberIds: [] }]);
      }
      setItemsTab('items');

      if (expenseToEdit.splits && expenseToEdit.splits.length > 0) {
        const selected = expenseToEdit.splits.map((s) => s.user_id);
        setSelectedMemberIds(selected);

        const newExact: Record<string, string> = {};
        let isExact = false;
        const total = expenseToEdit.total_amount ? expenseToEdit.total_amount : 0;
        const expectedEqual = selected.length > 0 ? total / selected.length : total;

        expenseToEdit.splits.forEach((s) => {
          newExact[s.user_id] = String(s.amount_owed);
          if (Math.abs(s.amount_owed - expectedEqual) > 0.05) {
            isExact = true;
          }
        });

        setExactSplits(newExact);
        if (isExact) {
          setSplitType('exact');
        } else {
          setSplitType('equal');
        }
      } else {
        setSelectedMemberIds(memberProfiles.map((p) => p.id));
        setSplitType('equal');
      }
      setStep(2); // Start at basic info when editing
    } else {
      // New Expense Defaults
      const initGroupId =
        defaultGroupId && userGroups.some((g) => g.id === defaultGroupId)
          ? defaultGroupId
          : userGroups.length > 0
          ? userGroups[0].id
          : 'none';

      setGroupId(initGroupId);
      setFlowType('unselected');
      setStep(1);
      setDescription('');
      setTotalAmount('');
      setReceiptUrl('');
      setNotes('');
      setCategory('General');
      setExpenseDate(new Date().toISOString().split('T')[0]);
      setItems([{ description: '', quantity: '1', unitPrice: '', amount: '', assignedMemberIds: [] }]);
      setItemsTab('items');
      setSplitType('equal');

      setExactSplits({});
      setPercentageSplits({});
      setSharesSplits({});

      if (currentProfile) {
        setPaidBy(currentProfile.id);
      } else if (memberProfiles.length > 0) {
        setPaidBy(memberProfiles[0].id);
      } else {
        setPaidBy('');
      }

      setSelectedMemberIds(memberProfiles.map((p) => p.id));
    }
  } else if (!isOpen && lastModalState.isOpen) {
    setLastModalState({ isOpen: false });
  }

  // Group selection change handler
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
      setPaidBy(currentProfile?.id ? currentProfile.id : '');
    }
  };

  // Direct photo upload handler
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
        const msg = errData.error ? errData.error : 'Error al subir el comprobante';
        throw new Error(msg);
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

  // Item Management (Factura Flow)
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
  };

  const toggleItemMember = (itemIdx: number, userId: string) => {
    setItems((prev) =>
      prev.map((item, idx) => {
        if (idx !== itemIdx) return item;
        const current = item.assignedMemberIds ? item.assignedMemberIds : [];
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

  // Calculate individual member shares based on invoice items
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
      const desc = item.description.trim() ? item.description.trim() : 'Artículo';

      assigned.forEach((id) => {
        if (result[id]) {
          result[id].total += share;
          result[id].items.push(desc);
        }
      });
    });

    return result;
  };

  // Toggle selected member for expense split
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

  // Specific Split Input Handlers (SEPARATE STATES)
  const handleExactSplitChange = (userId: string, val: string) => {
    setValidationError(null);
    setExactSplits((prev) => ({ ...prev, [userId]: val }));
  };

  const handlePercentageSplitChange = (userId: string, val: string) => {
    setValidationError(null);
    setPercentageSplits((prev) => ({ ...prev, [userId]: val }));
  };

  const handleSharesSplitChange = (userId: string, val: string) => {
    setValidationError(null);
    setSharesSplits((prev) => ({ ...prev, [userId]: val }));
  };

  const numericTotal = parseFloat(totalAmount) || 0;
  const itemsSum = items.reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0);
  const equalPerPerson = selectedMemberIds.length > 0 ? numericTotal / selectedMemberIds.length : 0;
  const itemizedShares = calculateItemizedMemberShares();

  // VALIDATION FUNCTION FOR SPLIT OPTIONS (Triggers when clicking "Listo" or submitting)
  const validateSplitOptions = (): boolean => {
    setValidationError(null);

    if (selectedMemberIds.length === 0) {
      setValidationError('Selecciona al menos una persona para repartir el gasto.');
      return false;
    }

    if (isNaN(numericTotal) || numericTotal <= 0) {
      setValidationError('Ingresa un monto total válido mayor a 0 para el gasto.');
      return false;
    }

    if (splitType === 'exact') {
      let sum = 0;
      for (const uid of selectedMemberIds) {
        const val = parseFloat(exactSplits[uid] ? exactSplits[uid] : '0');
        if (isNaN(val) || val < 0) {
          setValidationError('Ingresa un monto exacto válido mayor o igual a 0 para cada persona seleccionada.');
          return false;
        }
        sum += val;
      }

      const diff = Math.abs(sum - numericTotal);
      if (diff > 0.05) {
        setValidationError(
          `La suma de los montos exactos (${formatCurrency(sum, currencyCode)}) no coincide con el total (${formatCurrency(
            numericTotal,
            currencyCode
          )}). Diferencia: ${formatCurrency(diff, currencyCode)}.`
        );
        return false;
      }
    } else if (splitType === 'percentage') {
      let sumPct = 0;
      for (const uid of selectedMemberIds) {
        const pct = parseFloat(percentageSplits[uid] ? percentageSplits[uid] : '0');
        if (isNaN(pct) || pct < 0) {
          setValidationError('Ingresa un porcentaje válido para cada persona seleccionada.');
          return false;
        }
        sumPct += pct;
      }

      if (Math.abs(sumPct - 100) > 0.1) {
        setValidationError(
          `La suma de los porcentajes (${sumPct.toFixed(1)}%) debe ser exactamente 100%. ${
            sumPct < 100
              ? `Falta un ${(100 - sumPct).toFixed(1)}%`
              : `Sobresale un ${(sumPct - 100).toFixed(1)}%`
          }`
        );
        return false;
      }
    } else if (splitType === 'shares') {
      let totalShares = 0;
      for (const uid of selectedMemberIds) {
        const shares = parseFloat(sharesSplits[uid] ? sharesSplits[uid] : '1');
        if (isNaN(shares) || shares <= 0) {
          setValidationError('Ingresa una cantidad de cuotas o peso mayor a 0 para cada participante.');
          return false;
        }
        totalShares += shares;
      }
      if (totalShares <= 0) {
        setValidationError('La suma total de cuotas o proporciones debe ser mayor a 0.');
        return false;
      }
    }

    return true;
  };

  // STEP VALIDATIONS BEFORE MOVING TO NEXT STEP
  const handleNextFromBasicInfo = () => {
    setValidationError(null);

    if (!description || description.trim().length === 0) {
      setValidationError('Por favor, ingresa una descripción para el gasto.');
      return;
    }

    if (isNaN(numericTotal) || numericTotal <= 0) {
      if (flowType === 'invoice') {
        // In invoice flow, total can be 0 initially if they intend to fill items next, but warn them
        if (itemsSum > 0) {
          setTotalAmount(String(itemsSum));
        }
      } else {
        setValidationError('Ingresa un monto total válido mayor a 0.');
        return;
      }
    }

    if (!paidBy) {
      setValidationError('Selecciona quién pagó este gasto.');
      return;
    }

    if (flowType === 'invoice') {
      setStep(3); // Go to items step
    } else {
      setStep(4); // Go straight to split/summary step
    }
  };

  const handleNextFromInvoiceItems = () => {
    setValidationError(null);

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.description || item.description.trim().length === 0) {
        setValidationError(`Ingresa la descripción del artículo #${i + 1}.`);
        return;
      }
      const amt = parseFloat(item.amount);
      if (isNaN(amt) || amt <= 0) {
        setValidationError(`Ingresa un monto válido mayor a 0 para el artículo "${item.description}".`);
        return;
      }
    }

    // Check if items sum matches numericTotal - open modal if discrepancy exists
    if (numericTotal > 0 && Math.abs(itemsSum - numericTotal) > 0.05) {
      setShowDiscrepancyModal(true);
      return;
    }

    if (numericTotal === 0 && itemsSum > 0) {
      setTotalAmount(String(itemsSum));
    }

    setSplitType('itemized');
    setStep(4); // Go to split/summary step
  };

  // SUBMIT HANDLER
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateSplitOptions()) return;

    const effectiveGroupId = isNoGroup ? null : groupId;
    const effectivePaidBy =
      paidBy && memberProfiles.some((p) => p.id === paidBy)
        ? paidBy
        : currentProfile && memberProfiles.some((p) => p.id === currentProfile.id)
        ? currentProfile.id
        : memberProfiles[0]?.id;

    const finalItems: ExpenseItem[] = [];
    if (flowType === 'invoice') {
      items.forEach((item, idx) => {
        const amt = parseFloat(item.amount);
        if (item.description.trim().length > 0 && !isNaN(amt) && amt > 0) {
          finalItems.push({
            id: `item_tmp_${idx}`,
            expense_id: expenseToEdit?.id ? expenseToEdit.id : '',
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
      selectedMemberIds.forEach((uid) => {
        const val = parseFloat(exactSplits[uid] ? exactSplits[uid] : '0');
        finalSplits.push({
          user_id: uid,
          amount_owed: isNaN(val) ? 0 : Math.round(val * 100) / 100,
        });
      });
    } else if (splitType === 'percentage') {
      selectedMemberIds.forEach((uid) => {
        const pct = parseFloat(percentageSplits[uid] ? percentageSplits[uid] : '0');
        const share = (numericTotal * (isNaN(pct) ? 0 : pct)) / 100;
        finalSplits.push({
          user_id: uid,
          amount_owed: Math.round(share * 100) / 100,
        });
      });
    } else if (splitType === 'shares') {
      let totalShares = 0;
      selectedMemberIds.forEach((uid) => {
        const sh = parseFloat(sharesSplits[uid] ? sharesSplits[uid] : '1');
        totalShares += isNaN(sh) ? 0 : sh;
      });

      selectedMemberIds.forEach((uid) => {
        const sh = parseFloat(sharesSplits[uid] ? sharesSplits[uid] : '1');
        const shareAmt = totalShares > 0 ? (numericTotal * sh) / totalShares : 0;
        finalSplits.push({
          user_id: uid,
          amount_owed: Math.round(shareAmt * 100) / 100,
        });
      });
    } else if (splitType === 'itemized') {
      selectedMemberIds.forEach((uid) => {
        const shareAmt = itemizedShares[uid]?.total ? itemizedShares[uid].total : 0;
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
        receipt_url: receiptUrl ? receiptUrl : undefined,
        notes: notes.trim() ? notes.trim() : undefined,
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
    setFlowType('unselected');
    setStep(1);
    setDescription('');
    setTotalAmount('');
    setReceiptUrl('');
    setNotes('');
    setItems([{ description: '', quantity: '1', unitPrice: '', amount: '', assignedMemberIds: [] }]);
    setItemsTab('items');
    setExactSplits({});
    setPercentageSplits({});
    setSharesSplits({});
    setSplitType('equal');
    setSelectedMemberIds([]);
    setShowCategoryPicker(false);
    setValidationError(null);
    onClose();
  };

  if (!isOpen) return null;

  const currentCategoryIcon = getCategoryIcon(category);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-zinc-950/70 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white rounded-[2rem] ring-1 ring-zinc-200 shadow-2xl w-full max-w-2xl transition-all duration-300 overflow-hidden my-4 relative">
        
        {/* TOP HEADER BAR */}
        <div className="bg-gradient-to-r from-emerald-700 via-teal-700 to-emerald-800 text-white p-5 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur-md flex items-center justify-center text-emerald-200 font-bold shrink-0">
              {flowType === 'invoice' ? <FileText className="w-5 h-5" /> : <Receipt className="w-5 h-5" />}
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight text-white flex items-center space-x-2">
                <span>
                  {isEditing
                    ? 'Editar gasto'
                    : flowType === 'unselected'
                    ? 'Añadir gasto o factura'
                    : flowType === 'invoice'
                    ? 'Añadir una Factura'
                    : 'Añadir un Gasto'}
                </span>
              </h2>
              {flowType !== 'unselected' && (
                <p className="text-xs text-emerald-100/90 font-medium mt-0.5">
                  {flowType === 'invoice'
                    ? `Paso ${step === 2 ? '1' : step === 3 ? '2' : '3'} de 3: ${
                        step === 2 ? 'Datos Básicos' : step === 3 ? 'Artículos y Consumo' : 'Reparto y Confirmación'
                      }`
                    : `Paso ${step === 2 ? '1' : '2'} de 2: ${step === 2 ? 'Datos Básicos' : 'Reparto y Confirmación'}`}
                </p>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={resetAndClose}
            className="p-2 text-emerald-100 hover:text-white hover:bg-emerald-600/40 rounded-full transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* STEPPER PROGRESS BAR */}
        {flowType !== 'unselected' && (
          <div className="bg-emerald-50/60 border-b border-emerald-100 px-6 py-2.5 flex items-center justify-between text-xs font-semibold">
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => {
                  if (step > 2) {
                    setStep(step - 1);
                  } else if (!isEditing) {
                    setFlowType('unselected');
                    setStep(1);
                  }
                }}
                className="text-emerald-800 hover:text-emerald-950 flex items-center space-x-1 cursor-pointer font-bold hover:underline"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>{step === 2 && !isEditing ? 'Cambiar tipo' : 'Anterior'}</span>
              </button>
            </div>

            <div className="flex items-center space-x-1.5">
              <span className={`w-2.5 h-2.5 rounded-full ${step >= 2 ? 'bg-emerald-600' : 'bg-zinc-300'}`} />
              {flowType === 'invoice' && (
                <span className={`w-2.5 h-2.5 rounded-full ${step >= 3 ? 'bg-emerald-600' : 'bg-zinc-300'}`} />
              )}
              <span className={`w-2.5 h-2.5 rounded-full ${step >= 4 ? 'bg-emerald-600' : 'bg-zinc-300'}`} />
            </div>
          </div>
        )}

        {/* VALIDATION ALERT BANNER */}
        {validationError && (
          <div className="bg-rose-50 border-b border-rose-200 p-4 px-6 flex items-center space-x-3 text-rose-800 text-sm font-medium animate-fadeIn">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
            <span className="flex-1">{validationError}</span>
            <button
              type="button"
              onClick={() => setValidationError(null)}
              className="text-rose-500 hover:text-rose-800 p-1 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* MAIN BODY CONTAINER */}
        <div className="p-6 sm:p-8 max-h-[75vh] overflow-y-auto">

          {/* STEP 1: CARD SELECTION (Gasto vs Factura) */}
          {flowType === 'unselected' && step === 1 && (
            <div className="space-y-6 animate-fadeIn">
              <div className="text-center max-w-md mx-auto space-y-1.5">
                <h3 className="text-xl font-extrabold text-zinc-900 tracking-tight">
                  ¿Qué deseas registrar?
                </h3>
                <p className="text-xs text-zinc-500 font-medium">
                  Elige el tipo de registro para personalizar la experiencia de reparto
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                {/* CARD 1: GASTO SENCILLO */}
                <button
                  type="button"
                  onClick={() => {
                    setFlowType('expense');
                    setStep(2);
                  }}
                  className="bg-white hover:bg-emerald-50/40 p-6 rounded-2xl border-2 border-zinc-200 hover:border-emerald-500 transition-all text-left group cursor-pointer shadow-2xs hover:shadow-md flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-3">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Wallet className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="text-base font-bold text-zinc-900 group-hover:text-emerald-800 transition-colors">
                        Gasto General
                      </h4>
                      <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
                        Para consumos rápidos donde solo requieres monto total y repartirlo entre los miembros.
                      </p>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-zinc-100 text-xs font-bold text-emerald-700 flex items-center justify-between">
                    <span>Continuar con Gasto</span>
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </div>
                </button>

                {/* CARD 2: FACTURA / CONSUMO DETALLADO */}
                <button
                  type="button"
                  onClick={() => {
                    setFlowType('invoice');
                    setStep(2);
                  }}
                  className="bg-white hover:bg-teal-50/40 p-6 rounded-2xl border-2 border-zinc-200 hover:border-teal-500 transition-all text-left group cursor-pointer shadow-2xs hover:shadow-md flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-3">
                    <div className="w-12 h-12 rounded-2xl bg-teal-100 text-teal-800 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <ShoppingCart className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="text-base font-bold text-zinc-900 group-hover:text-teal-800 transition-colors">
                        Factura o Consumo
                      </h4>
                      <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
                        Desglosa cada artículo o ítem consumido para asignar qué personas consumieron cada producto.
                      </p>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-zinc-100 text-xs font-bold text-teal-700 flex items-center justify-between">
                    <span>Continuar con Factura</span>
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: DATOS BÁSICOS (Mismo diseño para Gasto y Factura) */}
          {flowType !== 'unselected' && step === 2 && (
            <div className="space-y-6 animate-fadeIn">
              
              {/* Category & Description Main Card */}
              <div className="bg-emerald-50/50 rounded-2xl p-5 border border-emerald-100 shadow-2xs space-y-4">
                <div className="flex items-start space-x-4">
                  {/* Category Button */}
                  <button
                    type="button"
                    onClick={() => setShowCategoryPicker(true)}
                    className="w-12 h-12 sm:w-14 sm:h-14 bg-white hover:bg-emerald-100/80 active:scale-95 rounded-2xl border border-emerald-200 shadow-2xs flex flex-col items-center justify-center shrink-0 text-emerald-700 transition-all cursor-pointer group mt-0.5"
                    title="Seleccionar categoría"
                  >
                    {React.createElement(currentCategoryIcon, { className: "w-6 h-6 text-emerald-700 group-hover:scale-110 transition-transform" })}
                  </button>

                  <div className="flex-1 space-y-3">
                    {/* Description field */}
                    <div>
                      <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">
                        Descripción o Nombre
                      </label>
                      <input
                        type="text"
                        required
                        value={description}
                        onChange={(e) => {
                          setDescription(e.target.value);
                          setValidationError(null);
                        }}
                        placeholder={flowType === 'invoice' ? "Ej: Mercado en Supermercado, Almuerzo Grupo" : "Ej: Cena de bienvenida, Uber al centro"}
                        className="w-full bg-white border border-emerald-200 focus:border-emerald-700 rounded-xl px-3.5 py-2 text-sm sm:text-base font-semibold text-zinc-900 placeholder:text-zinc-400 focus:outline-none transition-colors"
                      />
                    </div>

                    {/* Amount Field */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider block">
                          Monto Total
                        </label>
                        {flowType === 'invoice' && (
                          <span className="text-[11px] text-teal-700 font-medium">
                            (Opcional, puedes calcularlo con los artículos)
                          </span>
                        )}
                      </div>
                      <div className="relative bg-white rounded-xl border border-emerald-200 px-3.5 py-1.5 focus-within:border-emerald-700 transition-colors">
                        <FormattedCurrencyInput
                          value={totalAmount}
                          currency={currencyCode}
                          onChange={(val) => {
                            setTotalAmount(val);
                            setValidationError(null);
                          }}
                          placeholder="0"
                          className="w-full bg-transparent text-2xl font-black text-zinc-900 placeholder:text-zinc-300 focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Category Picker Overlay Modal */}
              {showCategoryPicker && (
                <div className="bg-zinc-50 p-4 rounded-2xl border border-zinc-200 space-y-3 animate-fadeIn">
                  <div className="flex items-center justify-between pb-2 border-b border-zinc-200">
                    <span className="text-xs font-bold text-zinc-900 flex items-center space-x-1.5">
                      <Layers className="w-4 h-4 text-emerald-700" />
                      <span>Seleccionar Categoría</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowCategoryPicker(false)}
                      className="text-xs text-zinc-500 hover:text-zinc-800 p-1 cursor-pointer font-bold"
                    >
                      Cerrar
                    </button>
                  </div>

                  <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                    {CATEGORY_GROUPS.map((group) => {
                      const GroupIcon = group.icon;
                      const isOpenGroup = openCategoryGroup === group.name;

                      return (
                        <div key={group.name} className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
                          <button
                            type="button"
                            onClick={() => setOpenCategoryGroup(isOpenGroup ? null : group.name)}
                            className="w-full p-2.5 flex items-center justify-between hover:bg-zinc-50 transition-colors cursor-pointer"
                          >
                            <div className="flex items-center space-x-2">
                              <div className={`p-1.5 rounded-lg border ${group.color}`}>
                                <GroupIcon className="w-3.5 h-3.5" />
                              </div>
                              <span className="text-xs font-bold text-zinc-900">{group.name}</span>
                            </div>
                            <ChevronDown className={`w-3.5 h-3.5 text-zinc-400 transition-transform ${isOpenGroup ? 'rotate-180' : ''}`} />
                          </button>

                          {isOpenGroup && (
                            <div className="p-2 pt-0 border-t border-zinc-100 bg-zinc-50/50 grid grid-cols-2 gap-1">
                              {group.items.map((catItem) => {
                                const ItemIcon = getCategoryIcon(catItem);
                                const isSelected = category === catItem;
                                return (
                                  <button
                                    key={catItem}
                                    type="button"
                                    onClick={() => {
                                      setCategory(catItem);
                                      setShowCategoryPicker(false);
                                    }}
                                    className={`p-2 rounded-lg text-left text-xs font-semibold flex items-center space-x-2 transition-all cursor-pointer ${
                                      isSelected
                                        ? 'bg-emerald-700 text-white shadow-2xs'
                                        : 'bg-white hover:bg-emerald-50 text-zinc-800 border border-zinc-200'
                                    }`}
                                  >
                                    <ItemIcon className={`w-3.5 h-3.5 ${isSelected ? 'text-white' : 'text-emerald-700'}`} />
                                    <span className="truncate">{catItem}</span>
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

              {/* Group & Who Paid Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Grupo Selector */}
                <div>
                  <label className="text-xs font-bold text-zinc-700 flex items-center space-x-1.5 mb-1.5">
                    <Users className="w-3.5 h-3.5 text-emerald-700" />
                    <span>Grupo asignado</span>
                  </label>
                  <select
                    value={groupId}
                    onChange={(e) => handleGroupSelect(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-zinc-200 rounded-xl text-xs font-bold text-zinc-900 focus:outline-none focus:border-emerald-600 cursor-pointer shadow-2xs"
                  >
                    <option value="none">Sin grupo (Gasto personal)</option>
                    {userGroups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Quién Pagó Selector */}
                <div>
                  <label className="text-xs font-bold text-zinc-700 flex items-center space-x-1.5 mb-1.5">
                    <CreditCard className="w-3.5 h-3.5 text-emerald-700" />
                    <span>¿Quién pagó?</span>
                  </label>
                  <select
                    value={paidBy}
                    onChange={(e) => {
                      setPaidBy(e.target.value);
                      setValidationError(null);
                    }}
                    className="w-full px-3.5 py-2.5 bg-white border border-zinc-200 rounded-xl text-xs font-bold text-zinc-900 focus:outline-none focus:border-emerald-600 cursor-pointer shadow-2xs"
                  >
                    {memberProfiles.map((p) => {
                      const isCurrent = p.id === currentProfile?.id;
                      const name = p.full_name ? p.full_name : (p.email ? p.email : 'Usuario');
                      return (
                        <option key={p.id} value={p.id}>
                          {isCurrent ? `Tú (${name})` : name}
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>

              {/* Date & Photo Attachment Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Fecha */}
                <div>
                  <label className="text-xs font-bold text-zinc-700 flex items-center space-x-1.5 mb-1.5">
                    <CalendarIcon className="w-3.5 h-3.5 text-emerald-700" />
                    <span>Fecha del gasto</span>
                  </label>
                  <input
                    type="date"
                    value={expenseDate}
                    onChange={(e) => setExpenseDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-zinc-200 rounded-xl text-xs font-semibold text-zinc-900 focus:outline-none focus:border-emerald-600 cursor-pointer shadow-2xs"
                  />
                </div>

                {/* Foto Recibo / Comprobante */}
                <div>
                  <label className="text-xs font-bold text-zinc-700 flex items-center space-x-1.5 mb-1.5">
                    <ImageIcon className="w-3.5 h-3.5 text-emerald-700" />
                    <span>Comprobante o foto (opcional)</span>
                  </label>

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploadingReceipt}
                    className="w-full px-3.5 py-2.5 bg-white hover:bg-emerald-50/50 border border-zinc-200 text-zinc-700 text-xs font-bold rounded-xl flex items-center justify-center space-x-2 transition-colors cursor-pointer shadow-2xs"
                  >
                    {isUploadingReceipt ? (
                      <Loader2 className="w-4 h-4 animate-spin text-emerald-700" />
                    ) : (
                      <ImageIcon className="w-4 h-4 text-emerald-700" />
                    )}
                    <span>
                      {isUploadingReceipt
                        ? 'Subiendo foto...'
                        : receiptUrl
                        ? 'Cambiar fotografía'
                        : 'Adjuntar comprobante'}
                    </span>
                  </button>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleReceiptFileChange}
                    className="hidden"
                  />
                </div>
              </div>

              {/* Receipt Preview Thumbnail */}
              {receiptUrl && (
                <div className="flex items-center space-x-3 bg-zinc-50 p-2.5 rounded-xl border border-zinc-200">
                  <div className="w-10 h-10 relative rounded-lg overflow-hidden shrink-0 border border-zinc-200">
                    <Image
                      src={receiptUrl}
                      alt="Comprobante"
                      fill
                      className="object-cover"
                      unoptimized
                      referrerPolicy="no-referrer"
                    />
                  </div>
                  <div className="text-xs text-zinc-600 overflow-hidden flex-1">
                    <p className="font-bold text-zinc-900 truncate">Comprobante adjuntado</p>
                    <button
                      type="button"
                      onClick={() => setReceiptUrl('')}
                      className="text-[11px] text-rose-600 hover:underline font-medium cursor-pointer"
                    >
                      Eliminar foto
                    </button>
                  </div>
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="text-xs font-bold text-zinc-700 flex items-center space-x-1.5 mb-1.5">
                  <FileText className="w-3.5 h-3.5 text-zinc-500" />
                  <span>Notas adicionales (opcional)</span>
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Detalles sobre la compra o anotaciones..."
                  className="w-full bg-zinc-50 border border-zinc-200 focus:border-zinc-800 rounded-xl px-3.5 py-2.5 text-xs font-medium text-zinc-900 placeholder:text-zinc-400 focus:outline-none transition-colors"
                />
              </div>

              {/* STEP 2 NEXT BUTTON */}
              <div className="pt-4 border-t border-zinc-100 flex justify-end">
                <button
                  type="button"
                  onClick={handleNextFromBasicInfo}
                  className="px-8 py-3 rounded-full bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold cursor-pointer shadow-md transition-all active:scale-95 flex items-center space-x-2"
                >
                  <span>
                    {flowType === 'invoice' ? 'Siguiente: Cargar artículos →' : 'Siguiente: Repartir gasto →'}
                  </span>
                </button>
              </div>

            </div>
          )}

          {/* STEP 3 (Factura Flow): ARTÍCULOS DE LA FACTURA */}
          {flowType === 'invoice' && step === 3 && (
            <div className="space-y-6 animate-fadeIn">
              
              {/* Header for Items */}
              <div className="flex items-center justify-between bg-zinc-50 p-3.5 rounded-2xl border border-zinc-200">
                <div className="flex items-center space-x-2">
                  <ShoppingCart className="w-4 h-4 text-emerald-700 shrink-0" />
                  <div>
                    <h3 className="text-xs font-bold text-zinc-900">Cargar Artículos de la Factura</h3>
                    <p className="text-[11px] text-zinc-500">
                      Ingresa cada producto con su cantidad y precio
                    </p>
                  </div>
                </div>
                <span className="text-xs font-extrabold text-emerald-800 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
                  Suma: {formatCurrency(itemsSum, currencyCode)}
                </span>
              </div>

              {/* LISTA DE ARTÍCULOS */}
              <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
                {items.map((item, idx) => {
                  return (
                    <div
                      key={idx}
                      className="bg-white p-3.5 rounded-2xl border border-zinc-200 shadow-2xs space-y-3 hover:border-emerald-300 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <input
                          type="text"
                          placeholder={`Artículo #${idx + 1} (ej: Pizza, Bebidas, Postre)`}
                          value={item.description}
                          onChange={(e) => handleItemChange(idx, 'description', e.target.value)}
                          className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 focus:border-emerald-600 focus:bg-white rounded-xl text-xs font-semibold text-zinc-900 placeholder:text-zinc-400 focus:outline-none transition-colors"
                        />
                        {items.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveItemRow(idx)}
                            className="p-1.5 text-zinc-400 hover:text-rose-600 rounded-lg transition-colors cursor-pointer shrink-0"
                            title="Eliminar ítem"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-3 gap-2">
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

                        <div>
                          <label className="text-[10px] font-bold text-zinc-500 block mb-1">
                            Precio unitario
                          </label>
                          <input
                            type="number"
                            step="any"
                            placeholder="0"
                            value={item.unitPrice}
                            onChange={(e) => handleItemChange(idx, 'unitPrice', e.target.value)}
                            className="w-full px-2.5 py-1.5 bg-zinc-50 border border-zinc-200 focus:border-emerald-600 focus:bg-white rounded-xl text-xs font-semibold text-zinc-900 focus:outline-none"
                          />
                        </div>

                        <div>
                          <label className="text-[10px] font-bold text-emerald-800 block mb-1">
                            Precio total
                          </label>
                          <input
                            type="number"
                            step="any"
                            placeholder="0"
                            value={item.amount}
                            onChange={(e) => handleItemChange(idx, 'amount', e.target.value)}
                            className="w-full px-2.5 py-1.5 bg-emerald-50/60 border border-emerald-200 focus:border-emerald-600 focus:bg-white rounded-xl text-xs font-black text-emerald-900 focus:outline-none"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-start pt-1">
                <button
                  type="button"
                  onClick={handleAddItemRow}
                  className="flex items-center space-x-1.5 text-xs font-bold text-emerald-700 hover:text-emerald-800 cursor-pointer bg-white px-3.5 py-2 rounded-xl border border-emerald-200 shadow-2xs hover:bg-emerald-50/50 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Añadir otro artículo</span>
                </button>
              </div>

              {/* STEP 3 NEXT BUTTON */}
              <div className="pt-4 border-t border-zinc-100 flex justify-between items-center">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="px-5 py-2.5 rounded-full border border-zinc-200 bg-white hover:bg-zinc-100 text-zinc-700 text-xs font-bold cursor-pointer"
                >
                  ← Volver a Datos básicos
                </button>

                <button
                  type="button"
                  onClick={handleNextFromInvoiceItems}
                  className="px-8 py-3 rounded-full bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold cursor-pointer shadow-md transition-all active:scale-95 flex items-center space-x-2"
                >
                  <span>Siguiente: Repartir gasto →</span>
                </button>
              </div>

            </div>
          )}

          {/* STEP 4 (Gasto Step 3 / Factura Step 4): REPARTO Y RESUMEN FINAL */}
          {flowType !== 'unselected' && step === 4 && (
            <div className="space-y-6 animate-fadeIn">
              
              {/* Header Info */}
              <div className="bg-zinc-50 p-4 rounded-2xl border border-zinc-200 space-y-1">
                <h3 className="text-sm font-bold text-zinc-900 flex items-center space-x-2">
                  <Users className="w-4 h-4 text-emerald-700" />
                  <span>Elegir Opciones de División</span>
                </h3>
                <p className="text-xs text-zinc-500">
                  Selecciona la estrategia de reparto y verifica los valores asignados a cada integrante.
                </p>
              </div>

              {/* SPLIT MODE TOOLBAR INCLUDING "Asignar por persona" */}
              <div className="grid grid-cols-2 sm:grid-cols-5 bg-zinc-100 rounded-xl p-1.5 border border-zinc-200 shadow-2xs gap-1">
                <button
                  type="button"
                  title="Asignar por persona por artículos"
                  onClick={() => {
                    setSplitType('itemized');
                    setValidationError(null);
                  }}
                  className={`col-span-2 sm:col-span-1 py-2 px-1 rounded-lg text-xs font-extrabold flex items-center justify-center space-x-1 transition-all cursor-pointer ${
                    splitType === 'itemized'
                      ? 'bg-emerald-700 text-white shadow-2xs'
                      : 'text-emerald-900 hover:bg-emerald-100/60 bg-emerald-50/80 border border-emerald-200/60'
                  }`}
                >
                  <Users className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">Asignar por persona</span>
                </button>

                <button
                  type="button"
                  title="A partes iguales"
                  onClick={() => {
                    setSplitType('equal');
                    setValidationError(null);
                  }}
                  className={`py-2 rounded-lg text-xs font-extrabold flex items-center justify-center space-x-1 transition-all cursor-pointer ${
                    splitType === 'equal'
                      ? 'bg-zinc-900 text-white shadow-2xs'
                      : 'text-zinc-600 hover:bg-zinc-200/60'
                  }`}
                >
                  <span>= Iguales</span>
                </button>

                <button
                  type="button"
                  title="Montos exactos"
                  onClick={() => {
                    setSplitType('exact');
                    setValidationError(null);
                  }}
                  className={`py-2 rounded-lg text-xs font-extrabold flex items-center justify-center space-x-1 transition-all cursor-pointer ${
                    splitType === 'exact'
                      ? 'bg-zinc-900 text-white shadow-2xs'
                      : 'text-zinc-600 hover:bg-zinc-200/60'
                  }`}
                >
                  <span>$ Exacto</span>
                </button>

                <button
                  type="button"
                  title="Porcentajes"
                  onClick={() => {
                    setSplitType('percentage');
                    setValidationError(null);
                  }}
                  className={`py-2 rounded-lg text-xs font-extrabold flex items-center justify-center space-x-1 transition-all cursor-pointer ${
                    splitType === 'percentage'
                      ? 'bg-zinc-900 text-white shadow-2xs'
                      : 'text-zinc-600 hover:bg-zinc-200/60'
                  }`}
                >
                  <span>% Porcentaje</span>
                </button>

                <button
                  type="button"
                  title="Por cuotas o peso"
                  onClick={() => {
                    setSplitType('shares');
                    setValidationError(null);
                  }}
                  className={`py-2 rounded-lg text-xs font-extrabold flex items-center justify-center space-x-1 transition-all cursor-pointer ${
                    splitType === 'shares'
                      ? 'bg-zinc-900 text-white shadow-2xs'
                      : 'text-zinc-600 hover:bg-zinc-200/60'
                  }`}
                >
                  <span>≡ Cuotas</span>
                </button>
              </div>

              {/* MODE DESCRIPTION & VALIDATION RULES */}
              <div className="text-xs text-zinc-500 bg-zinc-50 p-3 rounded-xl border border-zinc-200">
                {splitType === 'equal' && 'El monto total se repartirá equitativamente entre los integrantes seleccionados.'}
                {splitType === 'exact' && 'Ingresa el monto exacto para cada integrante. La suma debe coincidir exactamente con el total del gasto.'}
                {splitType === 'percentage' && 'Ingresa el porcentaje (%) correspondiente a cada integrante. La suma debe ser exactamente 100%.'}
                {splitType === 'shares' && 'Asigna un número de cuotas o peso a cada persona. Cada input de cuotas se maneja de forma independiente.'}
                {splitType === 'itemized' && 'Asigna cada producto de la factura a las personas que lo consumieron para calcular su parte.'}
              </div>

              {/* IF ITEMIZED SPLIT: RENDER ITEM ASSIGNMENT DIRECTLY IN STEP 4 */}
              {splitType === 'itemized' && items.length > 0 && (
                <div className="space-y-3 bg-emerald-50/50 p-4 rounded-2xl border border-emerald-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-extrabold text-emerald-900 flex items-center space-x-1.5">
                        <ShoppingCart className="w-4 h-4 text-emerald-700 shrink-0" />
                        <span>Asignar consumo de artículos por persona</span>
                      </h4>
                      <p className="text-[11px] text-zinc-500 mt-0.5">
                        Haz clic en cada participante para incluirlo o excluirlo de un artículo:
                      </p>
                    </div>
                    <span className="text-xs font-extrabold text-emerald-800 bg-white px-2.5 py-1 rounded-lg border border-emerald-200 shadow-2xs">
                      Total: {formatCurrency(itemsSum > 0 ? itemsSum : numericTotal, currencyCode)}
                    </span>
                  </div>

                  <div className="space-y-3 max-h-[260px] overflow-y-auto pr-1">
                    {items.map((item, idx) => {
                      const itemAmt = parseFloat(item.amount) || 0;
                      const assignedIds = item.assignedMemberIds ? item.assignedMemberIds : [];
                      const isAll = assignedIds.length === 0;
                      const activeMembers = selectedMemberIds.length > 0 ? selectedMemberIds : memberProfiles.map((p) => p.id);
                      const effectiveCount = isAll ? activeMembers.length : assignedIds.length;
                      const sharePerPerson = effectiveCount > 0 ? itemAmt / effectiveCount : itemAmt;

                      return (
                        <div
                          key={idx}
                          className="bg-white p-3.5 rounded-2xl border border-zinc-200 shadow-2xs space-y-2.5"
                        >
                          <div className="flex items-center justify-between border-b border-zinc-100 pb-2">
                            <div>
                              <p className="text-xs font-bold text-zinc-900">
                                {item.description.trim() ? item.description.trim() : `Artículo #${idx + 1}`}
                              </p>
                              <p className="text-[11px] text-zinc-500">
                                Total ítem: {formatCurrency(itemAmt, currencyCode)}
                              </p>
                            </div>
                            <span className="text-xs font-extrabold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200/60">
                              {formatCurrency(sharePerPerson, currencyCode)} c/u
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
                              const displayName = p.full_name ? p.full_name : (p.email ? p.email : 'Usuario');
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
                      );
                    })}
                  </div>
                </div>
              )}

              {/* MEMBER LIST WITH INDEPENDENT INPUTS */}
              <div className="space-y-2.5 max-h-[260px] overflow-y-auto pr-1">
                {memberProfiles.map((p) => {
                  const isChecked = selectedMemberIds.includes(p.id);
                  const displayName = p.full_name ? p.full_name : (p.email ? p.email : 'Usuario');

                  // Computed values for current split modes
                  const pctVal = parseFloat(percentageSplits[p.id] ? percentageSplits[p.id] : '0') || 0;
                  const pctAmount = (numericTotal * pctVal) / 100;

                  const totalSharesSum = selectedMemberIds.reduce((sum, id) => {
                    const val = parseFloat(sharesSplits[id] ? sharesSplits[id] : '1');
                    return sum + (isNaN(val) || val <= 0 ? 0 : val);
                  }, 0);
                  const userWeightVal = parseFloat(sharesSplits[p.id] ? sharesSplits[p.id] : '1');
                  const safeWeight = isNaN(userWeightVal) || userWeightVal < 0 ? 0 : userWeightVal;
                  const sharesAmount = totalSharesSum > 0 ? (numericTotal * safeWeight) / totalSharesSum : 0;

                  const itemizedUserAmt = itemizedShares[p.id]?.total ? itemizedShares[p.id].total : 0;

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
                          className="w-4 h-4 accent-emerald-700 rounded cursor-pointer"
                        />
                        
                        {p.avatar_url ? (
                          <Image
                            src={p.avatar_url}
                            alt={displayName}
                            width={28}
                            height={28}
                            className="w-7 h-7 rounded-full object-cover border border-zinc-200 shrink-0"
                            unoptimized
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-emerald-800 text-white flex items-center justify-center text-[10px] font-bold shrink-0">
                            {displayName.charAt(0).toUpperCase()}
                          </div>
                        )}

                        <span className={`text-xs font-semibold ${isChecked ? 'text-zinc-900' : 'text-zinc-500'}`}>
                          {displayName} {p.id === currentProfile?.id ? '(Tú)' : ''}
                        </span>
                      </label>

                      {/* MODE-SPECIFIC INPUT / DISPLAY */}
                      <div className="text-right pl-2">
                        {splitType === 'equal' && isChecked && (
                          <span className="text-xs font-extrabold text-zinc-900">
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
                              value={exactSplits[p.id] !== undefined ? exactSplits[p.id] : ''}
                              onChange={(e) => handleExactSplitChange(p.id, e.target.value)}
                              className="w-24 px-2 py-1 bg-white border border-zinc-300 rounded-lg text-right font-bold text-xs text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-700"
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
                                value={percentageSplits[p.id] !== undefined ? percentageSplits[p.id] : ''}
                                onChange={(e) => handlePercentageSplitChange(p.id, e.target.value)}
                                className="w-16 px-2 py-1 bg-white border border-zinc-300 rounded-lg text-right font-bold text-xs text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-700"
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
                                min="1"
                                placeholder="1"
                                value={sharesSplits[p.id] !== undefined ? sharesSplits[p.id] : '1'}
                                onChange={(e) => handleSharesSplitChange(p.id, e.target.value)}
                                className="w-16 px-2 py-1 bg-white border border-zinc-300 rounded-lg text-right font-bold text-xs text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-700"
                              />
                              <span className="text-[11px] text-zinc-500 font-medium">cuota(s)</span>
                            </div>
                            <span className="text-xs font-bold text-zinc-900 bg-zinc-100 px-2 py-1 rounded-md min-w-[64px] text-right">
                              {formatCurrency(sharesAmount, currencyCode)}
                            </span>
                          </div>
                        )}

                        {splitType === 'itemized' && isChecked && (
                          <span className="text-xs font-extrabold text-teal-900 bg-teal-50 px-2.5 py-1 rounded-md border border-teal-200">
                            {formatCurrency(itemizedUserAmt, currencyCode)}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* FINAL SUMMARY PREVIEW CARD */}
              <div className="bg-emerald-50/60 p-4 rounded-2xl border border-emerald-200 space-y-2">
                <div className="flex justify-between items-center text-xs font-bold text-emerald-900">
                  <span>Resumen Final del Gasto</span>
                  <span className="text-sm font-black text-emerald-800">
                    {formatCurrency(numericTotal, currencyCode)}
                  </span>
                </div>
                <div className="text-[11px] text-zinc-600 space-y-1">
                  <p>• Descripción: <strong>{description}</strong></p>
                  <p>• Categoría: <strong>{category}</strong></p>
                  <p>• Estrategia de reparto: <strong>
                    {splitType === 'equal' && 'A partes iguales'}
                    {splitType === 'exact' && 'Montos exactos'}
                    {splitType === 'percentage' && 'Porcentaje (%)'}
                    {splitType === 'shares' && 'Por cuotas / peso'}
                    {splitType === 'itemized' && 'Consumo individual por artículos'}
                  </strong></p>
                </div>
              </div>

              {/* BOTTOM NAVIGATION / SUBMIT BUTTONS */}
              <div className="pt-4 border-t border-zinc-100 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setStep(flowType === 'invoice' ? 3 : 2)}
                  className="px-5 py-2.5 rounded-full border border-zinc-200 bg-white hover:bg-zinc-100 text-zinc-700 text-xs font-bold cursor-pointer"
                >
                  ← Volver
                </button>

                <button
                  type="button"
                  onClick={handleSubmit}
                  className="px-8 py-3 rounded-full bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold cursor-pointer shadow-md transition-all active:scale-95 flex items-center space-x-2"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{isEditing ? 'Guardar Cambios' : 'Confirmar y Guardar'}</span>
                </button>
              </div>

            </div>
          )}

        </div>
      </div>

      {/* POPUP MODAL: DISCREPANCIA EN MONTOS DE FACTURA VS TOTAL */}
      {showDiscrepancyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/70 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-3xl p-6 ring-1 ring-zinc-200 shadow-2xl max-w-md w-full space-y-5">
            <div className="flex items-center space-x-3 text-amber-600">
              <div className="w-10 h-10 rounded-2xl bg-amber-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-amber-700" />
              </div>
              <div>
                <h3 className="text-base font-bold text-zinc-900">
                  Monto total no coincide
                </h3>
                <p className="text-xs text-zinc-500 font-medium">
                  Verificación de los artículos
                </p>
              </div>
            </div>

            <div className="bg-amber-50/80 border border-amber-200/80 rounded-2xl p-4 text-xs text-amber-900 space-y-1.5 leading-relaxed">
              <p className="font-medium">
                La suma de los artículos (<strong className="font-bold">{formatCurrency(itemsSum, currencyCode)}</strong>) no coincide con el monto total ingresado (<strong className="font-bold">{formatCurrency(numericTotal, currencyCode)}</strong>).
              </p>
            </div>

            <div className="flex flex-col space-y-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setTotalAmount(String(itemsSum));
                  setShowDiscrepancyModal(false);
                  setSplitType('itemized');
                  setStep(4);
                }}
                className="w-full py-3 px-4 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer flex items-center justify-center space-x-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Actualizar total a {formatCurrency(itemsSum, currencyCode)} y continuar</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowDiscrepancyModal(false);
                  setSplitType('itemized');
                  setStep(4);
                }}
                className="w-full py-2.5 px-4 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 font-bold text-xs rounded-xl transition-colors cursor-pointer"
              >
                Mantener total de {formatCurrency(numericTotal, currencyCode)} y continuar
              </button>

              <button
                type="button"
                onClick={() => setShowDiscrepancyModal(false)}
                className="w-full py-2 px-4 text-zinc-500 hover:text-zinc-800 font-bold text-xs transition-colors cursor-pointer"
              >
                Ajustar artículos
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
