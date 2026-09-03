import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { notifyExpenseCreated } from '@/lib/notifications';
import { normalizeSplitsToTotal } from '@/lib/balance-utils';

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();

    if (authErr || !user) {
      console.error('[API /api/expenses] Auth error:', authErr);
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { expense, items, splits } = await req.json();

    let rawGroupId = expense.group_id && expense.group_id !== 'none' ? expense.group_id : null;
    const parsedAmount = typeof expense.total_amount === 'number'
      ? expense.total_amount
      : parseFloat(String(expense.total_amount).replace(/[^0-9.]/g, '')) || 0;

    // Fallback: if group_id is not provided, ensure a personal group exists for the user
    if (!rawGroupId) {
      let { data: personalGroup } = await supabase
        .from('groups')
        .select('id')
        .eq('owner_id', user.id)
        .eq('name', 'Gastos Personales')
        .maybeSingle();

      if (!personalGroup) {
        const { data: createdGroup } = await supabase
          .from('groups')
          .insert({ name: 'Gastos Personales', owner_id: user.id, currency: 'COP' })
          .select('id')
          .single();

        if (createdGroup) {
          personalGroup = createdGroup;
          await supabase.from('group_members').insert({ group_id: createdGroup.id, user_id: user.id, role: 'admin' });
        }
      }

      if (personalGroup) {
        rawGroupId = personalGroup.id;
      }
    }

    // Build insert payload
    const expenseInsertPayload: Record<string, any> = {
      group_id: rawGroupId,
      paid_by: expense.paid_by ?? user.id,
      total_amount: parsedAmount,
      description: expense.description,
      expense_date: expense.expense_date ?? new Date().toISOString().split('T')[0],
      source: expense.source ?? 'manual',
      source_draft_id: expense.source_draft_id ?? null,
      receipt_url: expense.receipt_url ?? null,
      created_by: user.id
    };

    if (expense.expense_time) {
      expenseInsertPayload.expense_time = expense.expense_time;
    }
    if (expense.category) {
      expenseInsertPayload.category = expense.category;
    }
    if (expense.notes) {
      expenseInsertPayload.notes = expense.notes;
    }

    // Try inserting with full payload
    let { data: newExpense, error: expErr } = await supabase
      .from('expenses')
      .insert(expenseInsertPayload)
      .select()
      .single();

    // Fallback if category, notes or expense_time column is missing in schema
    if (expErr && (expErr.code === 'PGRST204' || expErr.message?.includes('category') || expErr.message?.includes('notes') || expErr.message?.includes('expense_time'))) {
      console.warn('[API /api/expenses] Retrying insert without optional columns due to schema error:', expErr.message);
      delete expenseInsertPayload.category;
      delete expenseInsertPayload.notes;
      delete expenseInsertPayload.expense_time;

      const fallbackRes = await supabase
        .from('expenses')
        .insert(expenseInsertPayload)
        .select()
        .single();

      newExpense = fallbackRes.data;
      expErr = fallbackRes.error;
    }

    if (expErr || !newExpense) {
      console.error('[API /api/expenses] Supabase insert expense error:', expErr);
      return NextResponse.json({ error: expErr?.message ?? 'Error al crear el gasto' }, { status: 500 });
    }

    // Add items if any
    if (items && Array.isArray(items) && items.length > 0) {
      const itemsToInsert = items.map((i: any) => ({
        expense_id: newExpense.id,
        description: i.description,
        amount: typeof i.amount === 'number' ? i.amount : parseFloat(String(i.amount).replace(/[^0-9.]/g, '')) || 0,
      }));
      const { error: itemsErr } = await supabase.from('expense_items').insert(itemsToInsert);
      if (itemsErr) {
        console.error('[API /api/expenses] Supabase insert items error:', itemsErr);
      }
    }

    // Add splits with precision normalization
    let insertedSplits: any[] = [];
    if (splits && Array.isArray(splits) && splits.length > 0) {
      const rawSplits = splits.map((s: any) => ({
        user_id: s.user_id,
        amount_owed: typeof s.amount_owed === 'number' ? s.amount_owed : parseFloat(String(s.amount_owed).replace(/[^0-9.]/g, '')) || 0,
      }));

      // Normalize splits so sum matches parsedAmount down to the cent without drift
      const normalizedSplits = normalizeSplitsToTotal(parsedAmount, rawSplits, expense.paid_by ?? user.id);

      const splitsToInsert = normalizedSplits.map((s) => ({
        expense_id: newExpense.id,
        user_id: s.user_id,
        amount_owed: s.amount_owed,
      }));

      const { error: splitsErr } = await supabase.from('expense_splits').insert(splitsToInsert);
      if (splitsErr) {
        console.error('[API /api/expenses] Supabase insert splits error, rolling back created expense:', splitsErr);
        // Rollback created expense and items to prevent orphan records corrupting balances
        await supabase.from('expense_items').delete().eq('expense_id', newExpense.id);
        await supabase.from('expenses').delete().eq('id', newExpense.id);
        return NextResponse.json({ error: 'Error al registrar la distribución del gasto. Operación cancelada.' }, { status: 500 });
      }
      insertedSplits = splitsToInsert;
    }

    // Trigger notifications for participants and sponsors
    try {
      if (insertedSplits.length > 0) {
        void notifyExpenseCreated(supabase, {
          creatorId: user.id,
          expenseId: newExpense.id,
          description: expense.description || 'Gasto',
          totalAmount: parsedAmount,
          groupId: rawGroupId,
          currency: expense.currency || 'COP',
          splits: insertedSplits.map((s) => ({
            user_id: s.user_id,
            amount_owed: s.amount_owed,
          })),
        });
      }
    } catch (notifErr) {
      console.warn('[API /api/expenses] Warning triggering notifications:', notifErr);
    }

    const { data: fullExpense } = await supabase
      .from('expenses')
      .select('*, items:expense_items(*), splits:expense_splits(*)')
      .eq('id', newExpense.id)
      .single();

    const returnedExpense = fullExpense ?? newExpense;
    return NextResponse.json({ ...returnedExpense, split_config: expense.split_config });
  } catch (err: unknown) {
    console.error('[API /api/expenses] Unhandled error:', err);
    const message = err instanceof Error ? err.message : 'Error interno al guardar gasto';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

