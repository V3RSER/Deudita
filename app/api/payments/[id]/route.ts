import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { group_id, paid_by, paid_to, amount, payment_date, payment_time, note, proof_url } = await req.json();

    const updateData: Record<string, any> = {
      group_id,
      paid_by,
      paid_to,
      amount,
      payment_date,
      note,
      proof_url: proof_url !== undefined ? proof_url : null,
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    };
    if (payment_time !== undefined) {
      updateData.payment_time = payment_time;
    }

    let { data: payment, error } = await supabase
      .from('payments')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error && (error.code === 'PGRST204' || error.message?.includes('payment_time') || error.message?.includes('updated_at') || error.message?.includes('updated_by') || error.message?.includes('proof_url'))) {
      delete updateData.payment_time;
      delete updateData.updated_at;
      delete updateData.updated_by;
      delete updateData.proof_url;
      const retry = await supabase
        .from('payments')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();
      payment = retry.data;
      error = retry.error;
    }

    if (error) {
      console.error('[API /api/payments/[id]] Update payment error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(payment);
  } catch (err: unknown) {
    console.error('[API /api/payments/[id]] Unhandled error:', err);
    const message = err instanceof Error ? err.message : 'Error al actualizar el pago';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { error } = await supabase
      .from('payments')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[API /api/payments/[id]] Delete payment error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error('[API /api/payments/[id]] Unhandled error:', err);
    const message = err instanceof Error ? err.message : 'Error al eliminar el pago';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
