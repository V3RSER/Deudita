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

    const { data: auditLogs } = await supabase
      .from('expense_audit_logs')
      .select('*')
      .eq('expense_id', id)
      .order('created_at', { ascending: false });

    return NextResponse.json({ ...expense, audit_logs: auditLogs ?? [] });
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

    // Fetch previous expense and splits to calculate audit differences
    const { data: previousExpense, error: prevErr } = await supabase
      .from('expenses')
      .select('*, splits:expense_splits(*)')
      .eq('id', id)
      .maybeSingle();

    if (prevErr || !previousExpense) {
      return NextResponse.json({ error: 'Gasto no encontrado' }, { status: 404 });
    }

    const rawGroupId = expense.group_id && expense.group_id !== 'none' ? expense.group_id : (previousExpense.group_id ?? null);
    const parsedAmount = typeof expense.total_amount === 'number'
      ? expense.total_amount
      : parseFloat(String(expense.total_amount).replace(/[^0-9.]/g, '')) || 0;

    const updatePayload: Record<string, any> = {
      group_id: rawGroupId,
      paid_by: expense.paid_by ?? previousExpense.paid_by,
      total_amount: parsedAmount,
      description: expense.description ?? previousExpense.description,
      expense_date: expense.expense_date ?? previousExpense.expense_date,
      source: expense.source ?? previousExpense.source ?? 'manual',
      receipt_url: expense.receipt_url !== undefined ? expense.receipt_url : previousExpense.receipt_url,
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    };

    if (expense.category !== undefined) updatePayload.category = expense.category;
    if (expense.notes !== undefined) updatePayload.notes = expense.notes;

    let { data: updatedExpense, error: expErr } = await supabase
      .from('expenses')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (expErr && (expErr.code === 'PGRST204' || expErr.code === 'PGRST116' || expErr.message?.includes('category') || expErr.message?.includes('notes') || expErr.message?.includes('updated_at') || expErr.message?.includes('updated_by'))) {
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
      return NextResponse.json({ error: expErr?.message ?? 'Error al actualizar el gasto' }, { status: 500 });
    }

    // Replace items
    await supabase.from('expense_items').delete().eq('expense_id', id);
    if (items && Array.isArray(items) && items.length > 0) {
      const itemsToInsert = items.map((i: any) => ({
        expense_id: id,
        description: i.description,
        amount: typeof i.amount === 'number' ? i.amount : parseFloat(String(i.amount).replace(/[^0-9.]/g, '')) || 0,
      }));
      await supabase.from('expense_items').insert(itemsToInsert);
    }

    // Replace splits
    await supabase.from('expense_splits').delete().eq('expense_id', id);
    if (splits && Array.isArray(splits) && splits.length > 0) {
      const splitsToInsert = splits.map((s: any) => ({
        expense_id: id,
        user_id: s.user_id,
        amount_owed: typeof s.amount_owed === 'number' ? s.amount_owed : parseFloat(String(s.amount_owed).replace(/[^0-9.]/g, '')) || 0,
      }));
      await supabase.from('expense_splits').insert(splitsToInsert);
    }

    // Calculate participant differences for audit trail
    try {
      const prevSplits = (previousExpense?.splits as any[]) ?? [];
      const prevUserIds = prevSplits.map((s: any) => s.user_id);
      const newUserIds = (splits && Array.isArray(splits)) ? splits.map((s: any) => s.user_id) : [];

      const addedUserIds = newUserIds.filter((uid: string) => !prevUserIds.includes(uid));
      const removedUserIds = prevUserIds.filter((uid: string) => !newUserIds.includes(uid));
      const prevCount = prevUserIds.length;
      const newCount = newUserIds.length;

      const allAffectedIds = Array.from(new Set([...addedUserIds, ...removedUserIds]));
      let addedNames: string[] = [];
      let removedNames: string[] = [];

      if (allAffectedIds.length > 0) {
        const { data: profileRecords } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', allAffectedIds);

        const nameMap: Record<string, string> = {};
        (profileRecords ?? []).forEach((p: any) => {
          nameMap[p.id] = p.full_name ?? 'Participante';
        });

        addedNames = addedUserIds.map((uid) => nameMap[uid] ?? 'Nuevo participante');
        removedNames = removedUserIds.map((uid) => nameMap[uid] ?? 'Participante removido');
      }

      const summaryParts: string[] = [];
      if (prevCount !== newCount || addedUserIds.length > 0 || removedUserIds.length > 0) {
        if (prevCount !== newCount) {
          summaryParts.push(`Participantes modificados de ${prevCount} a ${newCount} personas`);
        }
        if (addedNames.length > 0) {
          summaryParts.push(`Añadido(s): ${addedNames.join(', ')}`);
        }
        if (removedNames.length > 0) {
          summaryParts.push(`Removido(s): ${removedNames.join(', ')}`);
        }
      }

      if (previousExpense && Number(previousExpense.total_amount) !== Number(parsedAmount)) {
        summaryParts.push(`Monto modificado de ${previousExpense.total_amount} a ${parsedAmount}`);
      }

      if (previousExpense && previousExpense.description !== expense.description) {
        summaryParts.push(`Descripción cambiada a "${expense.description}"`);
      }

      const summaryText = summaryParts.length > 0 ? summaryParts.join(' | ') : 'Gasto actualizado';

      if (rawGroupId) {
        await supabase.from('expense_audit_logs').insert({
          expense_id: id,
          group_id: rawGroupId,
          user_id: user.id,
          action: 'update',
          changes: {
            summary: summaryText,
            participants_before: prevCount,
            participants_after: newCount,
            added_user_ids: addedUserIds,
            removed_user_ids: removedUserIds,
            added_names: addedNames,
            removed_names: removedNames,
            amount_before: previousExpense?.total_amount,
            amount_after: parsedAmount,
          },
          created_at: new Date().toISOString(),
        });
      }
    } catch (auditErr) {
      console.warn('[API /api/expenses/[id]] Warning recording audit log:', auditErr);
    }

    // Fetch complete updated expense with items and splits to return
    const { data: fullUpdatedExpense } = await supabase
      .from('expenses')
      .select('*, items:expense_items(*), splits:expense_splits(*)')
      .eq('id', id)
      .single();

    return NextResponse.json(fullUpdatedExpense ?? updatedExpense);
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

