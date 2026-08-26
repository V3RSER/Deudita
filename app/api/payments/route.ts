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

    const { group_id, paid_by, paid_to, amount, payment_date, payment_time, note, proof_url } = await req.json();

    const insertData: Record<string, any> = {
      group_id,
      paid_by,
      paid_to,
      amount,
      payment_date: payment_date ?? new Date().toISOString().split('T')[0],
      note,
    };
    if (payment_time) {
      insertData.payment_time = payment_time;
    }
    if (proof_url) {
      insertData.proof_url = proof_url;
    }

    let { data: payment, error } = await supabase
      .from('payments')
      .insert(insertData)
      .select()
      .single();

    if (error && (error.code === 'PGRST204' || error.message?.includes('payment_time') || error.message?.includes('proof_url'))) {
      delete insertData.payment_time;
      delete insertData.proof_url;
      const retry = await supabase
        .from('payments')
        .insert(insertData)
        .select()
        .single();
      payment = retry.data;
      error = retry.error;
    }

    if (error) {
      console.error('[API /api/payments] Supabase insert payment error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Auto-create settlement if the pairwise net balance reaches exactly 0
    if (payment && group_id && paid_by && paid_to) {
      try {
        const { data: latestSettlements } = await supabase
          .from('settlements')
          .select('settled_at')
          .eq('group_id', group_id)
          .or(`and(user_a.eq.${paid_by},user_b.eq.${paid_to}),and(user_a.eq.${paid_to},user_b.eq.${paid_by})`)
          .order('settled_at', { ascending: false })
          .limit(1);

        const cutoff =
          latestSettlements && latestSettlements.length > 0
            ? latestSettlements[0].settled_at
            : '1970-01-01T00:00:00Z';

        const { data: recentExpenses } = await supabase
          .from('expenses')
          .select('id, paid_by, created_at, splits:expense_splits(user_id, amount_owed)')
          .eq('group_id', group_id)
          .gt('created_at', cutoff);

        const { data: recentPayments } = await supabase
          .from('payments')
          .select('id, paid_by, paid_to, amount, created_at')
          .eq('group_id', group_id)
          .or(`and(paid_by.eq.${paid_by},paid_to.eq.${paid_to}),and(paid_by.eq.${paid_to},paid_to.eq.${paid_by})`)
          .gt('created_at', cutoff);

        let balance = 0; // Positive = paid_to owes paid_by, Negative = paid_by owes paid_to

        for (const exp of recentExpenses || []) {
          if (!exp.splits) continue;
          for (const split of exp.splits) {
            if (exp.paid_by === paid_by && split.user_id === paid_to) {
              balance += Number(split.amount_owed || 0);
            } else if (exp.paid_by === paid_to && split.user_id === paid_by) {
              balance -= Number(split.amount_owed || 0);
            }
          }
        }

        for (const p of recentPayments || []) {
          if (p.paid_by === paid_to && p.paid_to === paid_by) {
            balance -= Number(p.amount || 0);
          } else if (p.paid_by === paid_by && p.paid_to === paid_to) {
            balance += Number(p.amount || 0);
          }
        }

        if (Math.abs(balance) < 0.01) {
          await supabase.from('settlements').insert({
            group_id,
            user_a: paid_by,
            user_b: paid_to,
            settled_at: new Date().toISOString(),
            created_by: user.id,
          });
        }
      } catch (settleErr) {
        console.warn('[API /api/payments] Error during auto-settlement evaluation:', settleErr);
      }
    }

    return NextResponse.json(payment);
  } catch (err: unknown) {
    console.error('[API /api/payments] Unhandled error:', err);
    const message = err instanceof Error ? err.message : 'Error interno al registrar pago';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

