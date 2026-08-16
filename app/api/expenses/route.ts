import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();

    if (authErr || !user) {
      console.error('[API /api/expenses] Auth error:', authErr);
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const adminDb = createAdminClient();
    const { expense, items, splits } = await req.json();

    const rawGroupId = expense.group_id && expense.group_id !== 'none' ? expense.group_id : null;
    const parsedAmount = typeof expense.total_amount === 'number'
      ? expense.total_amount
      : parseFloat(String(expense.total_amount).replace(/[^0-9.]/g, '')) || 0;

    // Build insert payload
    const expenseInsertPayload: Record<string, any> = {
      group_id: rawGroupId,
      paid_by: expense.paid_by,
      total_amount: parsedAmount,
      description: expense.description,
      expense_date: expense.expense_date,
      source: expense.source ?? 'manual',
      source_draft_id: expense.source_draft_id,
      receipt_url: expense.receipt_url,
      created_by: user.id
    };

    if (expense.category) {
      expenseInsertPayload.category = expense.category;
    }
    if (expense.notes) {
      expenseInsertPayload.notes = expense.notes;
    }

    // Try inserting with full payload
    let { data: newExpense, error: expErr } = await adminDb
      .from('expenses')
      .insert(expenseInsertPayload)
      .select()
      .single();

    // Fallback if null group_id violates DB constraint (group_id not null)
    if (expErr && (expErr.message?.includes('group_id') || expErr.code === '23502')) {
      console.warn('[API /api/expenses] group_id is null error, finding or creating Gastos Personales group...');
      let { data: personalGroup } = await adminDb
        .from('groups')
        .select('id')
        .eq('owner_id', user.id)
        .eq('name', 'Gastos Personales')
        .maybeSingle();

      if (!personalGroup) {
        const { data: createdGroup } = await adminDb
          .from('groups')
          .insert({ name: 'Gastos Personales', owner_id: user.id, currency: 'COP' })
          .select('id')
          .single();

        if (createdGroup) {
          personalGroup = createdGroup;
          await adminDb.from('group_members').insert({ group_id: createdGroup.id, user_id: user.id, role: 'admin' });
        }
      }

      if (personalGroup) {
        expenseInsertPayload.group_id = personalGroup.id;
        const retryRes = await adminDb
          .from('expenses')
          .insert(expenseInsertPayload)
          .select()
          .single();
        newExpense = retryRes.data;
        expErr = retryRes.error;
      }
    }

    // Fallback if category or notes column is missing in schema cache
    if (expErr && (expErr.code === 'PGRST204' || expErr.message?.includes('category') || expErr.message?.includes('notes'))) {
      console.warn('[API /api/expenses] Retrying insert without category/notes due to schema error:', expErr.message);
      delete expenseInsertPayload.category;
      delete expenseInsertPayload.notes;

      const fallbackRes = await adminDb
        .from('expenses')
        .insert(expenseInsertPayload)
        .select()
        .single();

      newExpense = fallbackRes.data;
      expErr = fallbackRes.error;
    }

    if (expErr || !newExpense) {
      console.error('[API /api/expenses] Supabase insert expense error:', expErr);
      return NextResponse.json({ error: expErr?.message || 'Error al crear el gasto' }, { status: 500 });
    }

    // Add items if any
    if (items && Array.isArray(items) && items.length > 0) {
      const itemsToInsert = items.map((i: any) => ({
        expense_id: newExpense.id,
        description: i.description,
        amount: typeof i.amount === 'number' ? i.amount : parseFloat(String(i.amount).replace(/[^0-9.]/g, '')) || 0,
      }));
      const { error: itemsErr } = await adminDb.from('expense_items').insert(itemsToInsert);
      if (itemsErr) {
        console.error('[API /api/expenses] Supabase insert items error:', itemsErr);
      }
    }

    // Add splits
    if (splits && Array.isArray(splits) && splits.length > 0) {
      const splitsToInsert = splits.map((s: any) => ({
        expense_id: newExpense.id,
        user_id: s.user_id,
        amount_owed: typeof s.amount_owed === 'number' ? s.amount_owed : parseFloat(String(s.amount_owed).replace(/[^0-9.]/g, '')) || 0,
      }));
      const { error: splitsErr } = await adminDb.from('expense_splits').insert(splitsToInsert);
      if (splitsErr) {
        console.error('[API /api/expenses] Supabase insert splits error:', splitsErr);
      }
    }

    const { data: fullExpense } = await adminDb
      .from('expenses')
      .select('*, items:expense_items(*), splits:expense_splits(*)')
      .eq('id', newExpense.id)
      .single();

    return NextResponse.json(fullExpense || newExpense);
  } catch (err: unknown) {
    console.error('[API /api/expenses] Unhandled error:', err);
    const message = err instanceof Error ? err.message : 'Error interno al guardar gasto';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

