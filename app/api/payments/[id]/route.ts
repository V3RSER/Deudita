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

    const { group_id, paid_by, paid_to, amount, payment_date, note, proof_url } = await req.json();

    const updateData: Record<string, any> = {
      group_id,
      paid_by,
      paid_to,
      amount,
      payment_date,
      note,
      proof_url: proof_url !== undefined ? proof_url : null,
    };

    const { data: payment, error } = await supabase
      .from('payments')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

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
