import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { normalizeSplitsToTotal } from '@/lib/balance-utils';

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();

    if (authErr || !user) {
      console.error('[API /api/drafts/confirm] Auth error:', authErr);
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { draftId, groupId, paidBy, splits, description: customDescription, totalAmount: customTotalAmount, expenseDate: customExpenseDate } = await req.json();

    // 1. Fetch draft
    const { data: draft, error: draftErr } = await supabase.from('expense_drafts').select('*').eq('id', draftId).single();
    if (draftErr || !draft) {
      console.error('[API /api/drafts/confirm] Draft not found or error:', draftErr);
      return NextResponse.json({ error: 'Borrador no encontrado' }, { status: 404 });
    }

    const finalAmount = typeof customTotalAmount === 'number' ? customTotalAmount : (draft.detected_amount ?? 0);
    const finalDescription = customDescription && typeof customDescription === 'string' && customDescription.trim() ? customDescription.trim() : (draft.detected_merchant ? draft.detected_merchant : 'Gasto desde Gmail');
    const finalDate = customExpenseDate && typeof customExpenseDate === 'string' && customExpenseDate.trim() ? customExpenseDate.trim() : (draft.detected_date ? draft.detected_date : new Date().toISOString().split('T')[0]);

    // 2. Create expense
    const { data: newExpense, error: expErr } = await supabase
      .from('expenses')
      .insert({
        group_id: groupId,
        paid_by: paidBy,
        total_amount: finalAmount,
        description: finalDescription,
        expense_date: finalDate,
        source: 'gmail',
        source_draft_id: draft.id,
        created_by: user.id
      })
      .select()
      .single();

    if (expErr) {
      console.error('[API /api/drafts/confirm] Supabase insert expense error:', expErr);
      return NextResponse.json({ error: expErr.message }, { status: 500 });
    }

    // 3. Add splits with precision normalization
    if (splits && Array.isArray(splits) && splits.length > 0) {
      const rawSplits = splits.map((s: any) => ({
        user_id: s.user_id,
        amount_owed: typeof s.amount_owed === 'number' ? s.amount_owed : parseFloat(String(s.amount_owed).replace(/[^0-9.]/g, '')) || 0,
      }));

      const normalizedSplits = normalizeSplitsToTotal(finalAmount, rawSplits, paidBy);

      const splitsToInsert = normalizedSplits.map((s) => ({
        expense_id: newExpense.id,
        user_id: s.user_id,
        amount_owed: s.amount_owed,
      }));

      const { error: splitsErr } = await supabase.from('expense_splits').insert(splitsToInsert);
      if (splitsErr) {
        console.error('[API /api/drafts/confirm] Insert splits error, rolling back expense:', splitsErr);
        await supabase.from('expenses').delete().eq('id', newExpense.id);
        return NextResponse.json({ error: 'Error al registrar la distribución del borrador. Operación cancelada.' }, { status: 500 });
      }
    }

    // 4. Update draft status
    const { error: updateErr } = await supabase.from('expense_drafts').update({
      status: 'confirmed',
      confirmed_expense_id: newExpense.id
    }).eq('id', draftId);

    if (updateErr) {
      console.error('[API /api/drafts/confirm] Update draft status error:', updateErr);
    }

    const { data: fullExpense } = await supabase
      .from('expenses')
      .select('*, items:expense_items(*), splits:expense_splits(*)')
      .eq('id', newExpense.id)
      .single();

    return NextResponse.json({
      expense: fullExpense ?? newExpense,
      draftId,
    });
  } catch (err: unknown) {
    console.error('[API /api/drafts/confirm] Unhandled error:', err);
    const message = err instanceof Error ? err.message : 'Error interno al confirmar borrador';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

