import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();

    if (authErr || !user) {
      console.error('[API /api/expenses/[id]] Auth error:', authErr);
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { expense, items, splits } = await request.json();

    const { data: updatedExpense, error: expErr } = await supabase
      .from('expenses')
      .update({
        group_id: expense.group_id,
        paid_by: expense.paid_by,
        total_amount: expense.total_amount,
        description: expense.description,
        category: expense.category,
        expense_date: expense.expense_date,
        source: expense.source ?? 'manual',
        receipt_url: expense.receipt_url,
      })
      .eq('id', id)
      .select()
      .single();

    if (expErr) {
      console.error('[API /api/expenses/[id]] Update error:', expErr);
      return NextResponse.json({ error: expErr.message }, { status: 500 });
    }

    // Replace items
    await supabase.from('expense_items').delete().eq('expense_id', id);
    if (items && Array.isArray(items) && items.length > 0) {
      const itemsToInsert = items.map((i: any) => ({
        expense_id: id,
        description: i.description,
        amount: i.amount,
      }));
      await supabase.from('expense_items').insert(itemsToInsert);
    }

    // Replace splits
    await supabase.from('expense_splits').delete().eq('expense_id', id);
    if (splits && Array.isArray(splits) && splits.length > 0) {
      const splitsToInsert = splits.map((s: any) => ({
        expense_id: id,
        user_id: s.user_id,
        amount_owed: s.amount_owed,
      }));
      await supabase.from('expense_splits').insert(splitsToInsert);
    }

    return NextResponse.json(updatedExpense);
  } catch (err: unknown) {
    console.error('[API /api/expenses/[id]] Unhandled PUT error:', err);
    const message = err instanceof Error ? err.message : 'Error interno al actualizar gasto';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();

    if (authErr || !user) {
      console.error('[API /api/expenses/[id]] Auth error:', authErr);
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { error } = await supabase
      .from('expenses')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[API /api/expenses/[id]] Delete error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error('[API /api/expenses/[id]] Unhandled error:', err);
    const message = err instanceof Error ? err.message : 'Error interno al eliminar gasto';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

