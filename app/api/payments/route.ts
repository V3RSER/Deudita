import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { group_id, paid_by, paid_to, amount, payment_date, note } = await req.json();

  const { data: payment, error } = await supabase
    .from('payments')
    .insert({
      group_id,
      paid_by,
      paid_to,
      amount,
      payment_date,
      note
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(payment);
}
