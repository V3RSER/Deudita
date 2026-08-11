import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();

    if (authErr || !user) {
      console.error('[API /api/payments] Auth error:', authErr);
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { group_id, paid_by, paid_to, amount, payment_date, note, proof_url } = await req.json();

    const insertData: Record<string, any> = {
      group_id,
      paid_by,
      paid_to,
      amount,
      payment_date,
      note,
    };
    if (proof_url) {
      insertData.proof_url = proof_url;
    }

    const { data: payment, error } = await supabase
      .from('payments')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('[API /api/payments] Supabase insert payment error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(payment);
  } catch (err: unknown) {
    console.error('[API /api/payments] Unhandled error:', err);
    const message = err instanceof Error ? err.message : 'Error interno al registrar pago';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

