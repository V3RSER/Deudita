import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();

    if (authErr || !user) {
      console.error('[API /api/expenses] Auth error:', authErr);
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { expense, items, splits } = await req.json();

    // Create expense
    const { data: newExpense, error: expErr } = await supabase
      .from('expenses')
      .insert({
        group_id: expense.group_id,
        paid_by: expense.paid_by,
        total_amount: expense.total_amount,
        description: expense.description,
        expense_date: expense.expense_date,
        source: expense.source ?? 'manual',
        source_draft_id: expense.source_draft_id,
        created_by: user.id
      })
      .select()
      .single();

    if (expErr) {
      console.error('[API /api/expenses] Supabase insert expense error:', expErr);
      return NextResponse.json({ error: expErr.message }, { status: 500 });
    }

    // Add items if any
    if (items && Array.isArray(items) && items.length > 0) {
      const itemsToInsert = items.map((i: any) => ({
        expense_id: newExpense.id,
        description: i.description,
        amount: i.amount
      }));
      const { error: itemsErr } = await supabase.from('expense_items').insert(itemsToInsert);
      if (itemsErr) {
        console.error('[API /api/expenses] Supabase insert items error:', itemsErr);
      }
    }

    // Add splits
    if (splits && Array.isArray(splits) && splits.length > 0) {
      const splitsToInsert = splits.map((s: any) => ({
        expense_id: newExpense.id,
        user_id: s.user_id,
        amount_owed: s.amount_owed
      }));
      const { error: splitsErr } = await supabase.from('expense_splits').insert(splitsToInsert);
      if (splitsErr) {
        console.error('[API /api/expenses] Supabase insert splits error:', splitsErr);
      }
    }

    return NextResponse.json(newExpense);
  } catch (err: unknown) {
    console.error('[API /api/expenses] Unhandled error:', err);
    const message = err instanceof Error ? err.message : 'Error interno al guardar gasto';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

