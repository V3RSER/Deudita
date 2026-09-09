'use client';

import { useMemo, useState } from 'react';
import { useExpense } from '@/lib/expense-context';
import { formatCurrency } from '@/lib/balance-utils';
import { GenericExpenseList } from '@/components/GenericExpenseList';
import { TransactionFilterBar, TransactionFilterState } from '@/components/TransactionFilterBar';
import {
  getEffectiveTransactionDate,
  isDateMatchingFilter,
  getAvailableTransactionMonths,
} from '@/lib/transaction-date-utils';
import { Expense, Payment } from '@/lib/types';
import { Receipt, BarChart3, PieChart as PieChartIcon } from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Rectangle,
} from 'recharts';
import { PageHeader } from '@/components/PageHeader';

interface AllExpensesViewProps {
  readonly onOpenNewExpense: () => void;
  readonly onEditExpense?: (expense: Expense) => void;
  readonly onEditPayment?: (payment: Payment) => void;
}

const CATEGORY_COLORS: Record<string, string> = {
  Comida: '#10b981',
  Transporte: '#3b82f6',
  Hospedaje: '#8b5cf6',
  Entretenimiento: '#f59e0b',
  Servicios: '#06b6d4',
  Supermercado: '#ec4899',
  Varios: '#64748b',
};

export function AllExpensesView(props: AllExpensesViewProps) {
  const { currentProfile, expenses, payments, userGroups, profiles, deleteExpense, deletePayment } =
    useExpense();

  const [filters, setFilters] = useState<TransactionFilterState>({
    scope: 'all',
    dateMode: 'expense_date',
    datePreset: 'all',
    customStartDate: '',
    customEndDate: '',
    groupId: 'all',
    category: 'all',
    searchTerm: '',
  });

  const handleFilterChange = (updates: Partial<TransactionFilterState>) => {
    setFilters((prev) => ({ ...prev, ...updates }));
  };

  const userGroupIds = useMemo(() => new Set(userGroups.map((group) => group.id)), [userGroups]);

  const myExpenses = useMemo(
    () => expenses.filter((expense) => userGroupIds.has(expense.group_id)),
    [expenses, userGroupIds],
  );

  const myPayments = useMemo(
    () => payments.filter((payment) => userGroupIds.has(payment.group_id)),
    [payments, userGroupIds],
  );

  const profilesById = useMemo(
    () => new Map(profiles.map((profile) => [profile.id, profile])),
    [profiles],
  );

  const groupsById = useMemo(
    () => new Map(userGroups.map((group) => [group.id, group])),
    [userGroups],
  );

  const categories = useMemo(
    () => Array.from(new Set(myExpenses.map((expense) => expense.category || 'Varios'))),
    [myExpenses],
  );

  const availableMonths = useMemo(
    () => getAvailableTransactionMonths([...myExpenses, ...myPayments], filters.dateMode),
    [myExpenses, myPayments, filters.dateMode],
  );

  const totalTransactionsCount = myExpenses.length + myPayments.length;

  const myInteractionsCount = useMemo(() => {
    const currentProfileId = currentProfile?.id;

    const myExpCount = myExpenses.filter((expense) => {
      const isPayer = expense.paid_by === currentProfileId;
      const isParticipant = Boolean(
        expense.splits?.some(
          (split) => split.user_id === currentProfileId && split.amount_owed > 0,
        ),
      );

      return isPayer || isParticipant;
    }).length;

    const myPayCount = myPayments.filter(
      (payment) => payment.paid_by === currentProfileId || payment.paid_to === currentProfileId,
    ).length;

    return myExpCount + myPayCount;
  }, [myExpenses, myPayments, currentProfile?.id]);

  const searchTerm = filters.searchTerm.trim().toLowerCase();

  const matchesSearch = useMemo(
    () => (values: Array<string | undefined>) =>
      !searchTerm || values.some((value) => value?.toLowerCase().includes(searchTerm)),
    [searchTerm],
  );

  const dateFilterOptions = useMemo(
    () => ({
      start: filters.customStartDate,
      end: filters.customEndDate,
    }),
    [filters.customEndDate, filters.customStartDate],
  );

  const filteredExpenses = useMemo(
    () =>
      myExpenses.filter((expense) => {
        const group = groupsById.get(expense.group_id);
        const paidBy = profilesById.get(expense.paid_by);

        if (
          !matchesSearch([
            expense.description,
            group?.name,
            paidBy?.full_name,
          ])
        ) {
          return false;
        }

        if (filters.groupId !== 'all' && expense.group_id !== filters.groupId) return false;
        if (filters.category !== 'all' && (expense.category || 'Varios') !== filters.category) {
          return false;
        }

        if (filters.scope === 'mine') {
          const currentProfileId = currentProfile?.id;
          const isPayer = expense.paid_by === currentProfileId;
          const isParticipant = Boolean(
            expense.splits?.some(
              (split) => split.user_id === currentProfileId && split.amount_owed > 0,
            ),
          );

          if (!isPayer && !isParticipant) return false;
        }

        const { dateObj } = getEffectiveTransactionDate(expense, filters.dateMode);
        return isDateMatchingFilter(dateObj, filters.datePreset, dateFilterOptions);
      }),
    [
      myExpenses,
      groupsById,
      profilesById,
      matchesSearch,
      filters.groupId,
      filters.category,
      filters.scope,
      currentProfile?.id,
      filters.dateMode,
      filters.datePreset,
      dateFilterOptions,
    ],
  );

  const filteredPayments = useMemo(
    () =>
      myPayments.filter((payment) => {
        const group = groupsById.get(payment.group_id);
        const payer = profilesById.get(payment.paid_by);
        const receiver = profilesById.get(payment.paid_to);

        if (!matchesSearch([payment.note, group?.name, payer?.full_name, receiver?.full_name])) {
          return false;
        }

        if (filters.groupId !== 'all' && payment.group_id !== filters.groupId) return false;

        if (filters.scope === 'mine') {
          const currentProfileId = currentProfile?.id;
          const isInteracted =
            payment.paid_by === currentProfileId || payment.paid_to === currentProfileId;

          if (!isInteracted) return false;
        }

        const { dateObj } = getEffectiveTransactionDate(payment, filters.dateMode);
        return isDateMatchingFilter(dateObj, filters.datePreset, dateFilterOptions);
      }),
    [
      myPayments,
      groupsById,
      profilesById,
      matchesSearch,
      filters.groupId,
      filters.scope,
      currentProfile?.id,
      filters.dateMode,
      filters.datePreset,
      dateFilterOptions,
    ],
  );

  const categoryStats = useMemo(() => {
    const totals: Record<string, number> = {};

    filteredExpenses.forEach((expense) => {
      const category = expense.category || 'Varios';
      totals[category] = (totals[category] || 0) + expense.total_amount;
    });

    return Object.entries(totals).map(([name, value]) => ({
      name,
      value,
      color: CATEGORY_COLORS[name] || CATEGORY_COLORS.Varios,
    }));
  }, [filteredExpenses]);

  const totalFilteredSpent = useMemo(
    () => filteredExpenses.reduce((acc, expense) => acc + expense.total_amount, 0),
    [filteredExpenses],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <PageHeader
          title="Historial de Gastos y Movimientos"
          subtitle="Revisa, filtra por fecha, y gestiona tus gastos confirmados y detectados por correo."
          icon={<Receipt className="w-5 h-5" />}
        />
      </div>

      {filteredExpenses.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-1 bg-zinc-900 text-white p-6 rounded-[2rem] shadow-sm flex flex-col justify-between space-y-6">
            <div>
              <div className="flex items-center space-x-2 text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-2">
                <BarChart3 className="w-4 h-4 text-emerald-400" />
                <span>Resumen de Gastos</span>
              </div>
              <p className="text-3xl font-black text-white tracking-tight">
                {formatCurrency(totalFilteredSpent, currentProfile?.currency || 'COP')}
              </p>
              <p className="text-xs text-zinc-400 mt-1">
                Suma total de {filteredExpenses.length} gastos filtrados
              </p>
            </div>

            <div className="pt-4 border-t border-zinc-800 space-y-2">
              <div className="flex justify-between text-xs text-zinc-300">
                <span>Gastos registrados:</span>
                <span className="font-bold text-white">{filteredExpenses.length}</span>
              </div>
              <div className="flex justify-between text-xs text-zinc-300">
                <span>Pagos de deuda registrados:</span>
                <span className="font-bold text-emerald-400">{filteredPayments.length}</span>
              </div>
            </div>
          </div>

          <div className="lg:col-span-2 bg-white p-6 rounded-[2rem] ring-1 ring-zinc-200 shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-zinc-900 text-sm flex items-center space-x-2">
                <PieChartIcon className="w-4 h-4 text-emerald-600" />
                <span>Distribución por Categoría</span>
              </h3>
              <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-widest">
                Visualización
              </span>
            </div>

            <div className="h-44 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={categoryStats}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#71717a' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#71717a' }} />
                  <Tooltip
                    formatter={(val) =>
                      formatCurrency(Number(val) || 0, currentProfile?.currency || 'COP')
                    }
                    contentStyle={{
                      backgroundColor: '#18181b',
                      borderRadius: '12px',
                      color: '#fff',
                      fontSize: '12px',
                      border: 'none',
                    }}
                  />
                  <Bar
                    dataKey="value"
                    radius={[8, 8, 0, 0]}
                    shape={({ x, y, width, height, payload }) => (
                      <Rectangle
                        x={x}
                        y={y}
                        width={width}
                        height={height}
                        radius={8}
                        fill={payload?.color || CATEGORY_COLORS.Varios}
                      />
                    )}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      <TransactionFilterBar
        filters={filters}
        onFilterChange={handleFilterChange}
        availableMonths={availableMonths}
        categories={categories}
        userGroups={userGroups}
        showGroupFilter={true}
        showCategoryFilter={true}
        showSearch={true}
        totalCount={totalTransactionsCount}
        myCount={myInteractionsCount}
      />

      <GenericExpenseList
        expenses={filteredExpenses}
        payments={filteredPayments}
        profiles={profiles}
        userGroups={userGroups}
        currentProfile={currentProfile}
        dateFilterMode={filters.dateMode}
        onEditExpense={props.onEditExpense}
        onDeleteExpense={deleteExpense}
        onEditPayment={props.onEditPayment}
        onDeletePayment={deletePayment}
        showGroupBadge={true}
      />
    </div>
  );
}
