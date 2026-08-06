import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { draftId, groupId, paidBy, splits } = await req.json();

  // 1. Fetch draft
  const { data: draft } = await supabase.from('expense_drafts').select('*').eq('id', draftId).single();
  if (!draft) return NextResponse.json({ error: 'Draft not found' }, { status: 404 });

  // 2. Create expense
  const { data: newExpense, error: expErr } = await supabase
    .from('expenses')
    .insert({
      group_id: groupId,
      paid_by: paidBy,
      total_amount: draft.detected_amount || 0,
      description: draft.detected_merchant || 'Gasto desde Gmail',
      expense_date: draft.detected_date || new Date().toISOString().split('T')[0],
      source: 'gmail',
      source_draft_id: draft.id,
      created_by: user.id
    })
    .select()
    .single();

  if (expErr) return NextResponse.json({ error: expErr.message }, { status: 500 });

  // 3. Add splits
  if (splits && splits.length > 0) {
    const splitsToInsert = splits.map((s: any) => ({
      expense_id: newExpense.id,
      user_id: s.user_id,
      amount_owed: s.amount_owed
    }));
    await supabase.from('expense_splits').insert(splitsToInsert);
  }

  // 4. Update draft status
  await supabase.from('expense_drafts').update({
    status: 'confirmed',
    confirmed_expense_id: newExpense.id
  }).eq('id', draftId);

  return NextResponse.json(newExpense);
}
