import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { data: expense, error } = await supabase
      .from('expenses')
      .select('*, items:expense_items(*), splits:expense_splits(*)')
      .eq('id', id)
      .single();

    if (error || !expense) {
      return NextResponse.json({ error: 'Gasto no encontrado' }, { status: 404 });
    }

    return NextResponse.json(expense);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al obtener detalle del gasto';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

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

    const updatePayload: Record<string, any> = {
      group_id: expense.group_id,
      paid_by: expense.paid_by,
      total_amount: expense.total_amount,
      description: expense.description,
      expense_date: expense.expense_date,
      source: expense.source ?? 'manual',
      receipt_url: expense.receipt_url,
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    };

    if (expense.category) updatePayload.category = expense.category;
    if (expense.notes) updatePayload.notes = expense.notes;

    let { data: updatedExpense, error: expErr } = await supabase
      .from('expenses')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (expErr && (expErr.code === 'PGRST204' || expErr.message?.includes('category') || expErr.message?.includes('notes') || expErr.message?.includes('updated_at'))) {
      delete updatePayload.category;
      delete updatePayload.notes;
      delete updatePayload.updated_at;
      delete updatePayload.updated_by;

      const fallbackRes = await supabase
        .from('expenses')
        .update(updatePayload)
        .eq('id', id)
        .select()
        .single();

      updatedExpense = fallbackRes.data;
      expErr = fallbackRes.error;
    }

    if (expErr || !updatedExpense) {
      console.error('[API /api/expenses/[id]] Update error:', expErr);
      return NextResponse.json({ error: expErr?.message || 'Error al actualizar el gasto' }, { status: 500 });
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

