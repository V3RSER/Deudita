import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
      source: expense.source || 'manual',
      source_draft_id: expense.source_draft_id,
      created_by: user.id
    })
    .select()
    .single();

  if (expErr) return NextResponse.json({ error: expErr.message }, { status: 500 });

  // Add items if any
  if (items && items.length > 0) {
    const itemsToInsert = items.map((i: any) => ({
      expense_id: newExpense.id,
      description: i.description,
      amount: i.amount
    }));
    await supabase.from('expense_items').insert(itemsToInsert);
  }

  // Add splits
  if (splits && splits.length > 0) {
    const splitsToInsert = splits.map((s: any) => ({
      expense_id: newExpense.id,
      user_id: s.user_id,
      amount_owed: s.amount_owed
    }));
    await supabase.from('expense_splits').insert(splitsToInsert);
  }

  return NextResponse.json(newExpense);
}
