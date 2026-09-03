import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  notifyExpenseUpdated,
  notifyExpenseDeleted,
  calculateExpenseChangeDetails,
} from '@/lib/notifications';
import { normalizeSplitsToTotal } from '@/lib/balance-utils';

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
      .select('*, items:expense_items(*), splits:expense_splits(*)')
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

    if (expense.expense_time !== undefined) updatePayload.expense_time = expense.expense_time;
    if (expense.category !== undefined) updatePayload.category = expense.category;
    if (expense.notes !== undefined) updatePayload.notes = expense.notes;

    // 1. Update main expense record
    let { data: updatedExpense, error: expErr } = await supabase
      .from('expenses')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (expErr && (expErr.code === 'PGRST204' || expErr.code === 'PGRST116' || expErr.message?.includes('category') || expErr.message?.includes('notes') || expErr.message?.includes('expense_time') || expErr.message?.includes('updated_at') || expErr.message?.includes('updated_by'))) {
      delete updatePayload.category;
      delete updatePayload.notes;
      delete updatePayload.expense_time;
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

    // 2. Prepare target splits & items with precision normalization
    const expenseTotalAmt = typeof updatePayload.total_amount === 'number'
      ? updatePayload.total_amount
      : (typeof previousExpense.total_amount === 'number' ? previousExpense.total_amount : 0);

    const rawSplits = (splits && Array.isArray(splits)) ? splits.map((s: any) => ({
      user_id: s.user_id,
      amount_owed: typeof s.amount_owed === 'number' ? s.amount_owed : parseFloat(String(s.amount_owed).replace(/[^0-9.]/g, '')) || 0,
    })) : [];

    const normalizedSplits = rawSplits.length > 0 && expenseTotalAmt > 0
      ? normalizeSplitsToTotal(expenseTotalAmt, rawSplits, updatePayload.paid_by ?? previousExpense.paid_by)
      : rawSplits;

    const targetSplits = normalizedSplits.map((s) => ({
      expense_id: id,
      user_id: s.user_id,
      amount_owed: s.amount_owed,
    }));

    const targetItems = (items && Array.isArray(items)) ? items.map((i: any) => ({
      expense_id: id,
      description: i.description,
      amount: typeof i.amount === 'number' ? i.amount : parseFloat(String(i.amount).replace(/[^0-9.]/g, '')) || 0,
    })) : [];

    // 3. Update splits directly (update existing, insert new, delete removed)
    const { data: currentSplits } = await supabase
      .from('expense_splits')
      .select('*')
      .eq('expense_id', id);

    const currentSplitsList = currentSplits || [];
    const currentUserIdSet = new Set(currentSplitsList.map((s: any) => s.user_id));
    const targetUserIdSet = new Set(targetSplits.map((s: any) => s.user_id));

    // A) Update existing splits
    for (const s of targetSplits) {
      if (currentUserIdSet.has(s.user_id)) {
        await supabase
          .from('expense_splits')
          .update({ amount_owed: s.amount_owed })
          .eq('expense_id', id)
          .eq('user_id', s.user_id);
      }
    }

    // B) Insert newly added splits
    const newSplitsToInsert = targetSplits.filter((s: any) => !currentUserIdSet.has(s.user_id));
    if (newSplitsToInsert.length > 0) {
      await supabase.from('expense_splits').insert(newSplitsToInsert);
    }

    // C) Delete removed splits
    const removedUserIds = currentSplitsList
      .filter((s: any) => !targetUserIdSet.has(s.user_id))
      .map((s: any) => s.user_id);

    if (removedUserIds.length > 0) {
      await supabase
        .from('expense_splits')
        .delete()
        .eq('expense_id', id)
        .in('user_id', removedUserIds);
    }

    // 4. Update items
    await supabase.from('expense_items').delete().eq('expense_id', id);
    if (targetItems.length > 0) {
      await supabase.from('expense_items').insert(targetItems);
    }

    // 5. Verify if splits were updated correctly or if RLS blocked modification
    const { data: verifiedSplits } = await supabase
      .from('expense_splits')
      .select('*')
      .eq('expense_id', id);

    const verifiedList = verifiedSplits || [];
    const verifiedUserIds = new Set(verifiedList.map((s: any) => s.user_id));
    const isSplitsMismatch = targetSplits.length !== verifiedList.length ||
      targetSplits.some((ts: any) => !verifiedUserIds.has(ts.user_id));

    // If RLS blocked split update/delete, execute cascade recreation with identical expense ID
    if (isSplitsMismatch && targetSplits.length > 0) {
      console.log('[API /api/expenses/[id]] Splits mismatch detected, using cascade recreation for expense', id);
      try {
        // Unlink draft if needed to avoid RESTRICT constraint
        await supabase
          .from('expense_drafts')
          .update({ confirmed_expense_id: null })
          .eq('confirmed_expense_id', id);

        // Cascade delete parent expense
        const { error: delExpErr } = await supabase
          .from('expenses')
          .delete()
          .eq('id', id);

        if (!delExpErr) {
          // Re-insert expense with same ID
          const reInsertPayload = {
            id,
            ...updatePayload,
            created_by: previousExpense.created_by,
            created_at: previousExpense.created_at,
          };

          const { data: reInsertedExp, error: reInsErr } = await supabase
            .from('expenses')
            .insert(reInsertPayload)
            .select()
            .single();

          if (reInsertedExp && !reInsErr) {
            updatedExpense = reInsertedExp;

            // Re-insert items
            if (targetItems.length > 0) {
              await supabase.from('expense_items').insert(targetItems);
            }

            // Re-insert splits
            await supabase.from('expense_splits').insert(targetSplits);

            // Relink draft if was linked
            if (previousExpense.source_draft_id) {
              await supabase
                .from('expense_drafts')
                .update({ confirmed_expense_id: id })
                .eq('id', previousExpense.source_draft_id);
            }
          }
        }
      } catch (cascadeErr) {
        console.warn('[API /api/expenses/[id]] Cascade recreation error:', cascadeErr);
      }
    }

    // Calculate rich participant differences and unified change details for audit trail and notifications
    try {
      const prevSplits = (previousExpense?.splits as any[]) ?? [];
      const prevUserIds = prevSplits.map((s: any) => s.user_id);
      const newUserIds = targetSplits.map((s: any) => s.user_id);

      const addedUserIds = newUserIds.filter((uid: string) => !prevUserIds.includes(uid));
      const removedUserIds = prevUserIds.filter((uid: string) => !newUserIds.includes(uid));

      const allAffectedIds = Array.from(new Set([
        ...addedUserIds,
        ...removedUserIds,
        ...newUserIds,
        ...prevUserIds,
        updatePayload.paid_by,
        previousExpense.paid_by,
        user.id,
      ].filter(Boolean)));

      const nameMap = new Map<string, string>();
      if (allAffectedIds.length > 0) {
        const { data: profileRecords } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', allAffectedIds);

        (profileRecords ?? []).forEach((p: any) => {
          nameMap.set(p.id, p.full_name ?? 'Participante');
        });
      }

      const effectiveCurrency = expense.currency ?? previousExpense.currency ?? 'COP';

      const changeDetails = calculateExpenseChangeDetails({
        previousExpense: {
          description: previousExpense.description,
          total_amount: previousExpense.total_amount,
          paid_by: previousExpense.paid_by,
          expense_date: previousExpense.expense_date,
          category: previousExpense.category,
          notes: previousExpense.notes,
          split_config: previousExpense.split_config,
          splits: prevSplits,
        },
        newExpense: {
          description: updatePayload.description,
          total_amount: parsedAmount,
          paid_by: updatePayload.paid_by,
          expense_date: updatePayload.expense_date,
          category: updatePayload.category,
          notes: updatePayload.notes,
          split_config: expense.split_config,
          splits: targetSplits,
        },
        currency: effectiveCurrency,
        nameMap,
      });

      // Synchronize with expense_audit_logs:
      // If the Postgres trigger already recorded an update log within the last 15 seconds,
      // enrich it with our full change details to prevent duplicate entries in group activity.
      if (rawGroupId) {
        const { data: recentTriggerLogs } = await supabase
          .from('expense_audit_logs')
          .select('id, changes, created_at')
          .eq('expense_id', id)
          .eq('action', 'update')
          .order('created_at', { ascending: false })
          .limit(1);

        const recentLog = recentTriggerLogs?.[0];
        const isRecentTriggerLog = recentLog &&
          (new Date().getTime() - new Date(recentLog.created_at).getTime() < 15000);

        const mergedChanges = {
          ...(recentLog?.changes ?? {}),
          old: recentLog?.changes?.old ?? previousExpense,
          new: recentLog?.changes?.new ?? updatePayload,
          summary: changeDetails.summaryText,
          details: changeDetails.changeTags,
          amount_before: previousExpense?.total_amount,
          amount_after: parsedAmount,
          payer_before: previousExpense?.paid_by,
          payer_after: updatePayload.paid_by,
          payer_name_before: changeDetails.previousPayerName,
          payer_name_after: changeDetails.newPayerName,
          description_before: previousExpense?.description,
          description_after: updatePayload.description,
          added_user_ids: changeDetails.addedUserIds,
          removed_user_ids: changeDetails.removedUserIds,
          added_names: changeDetails.addedNames,
          removed_names: changeDetails.removedNames,
          split_changes: changeDetails.splitChanges,
        };

        if (isRecentTriggerLog) {
          await supabase
            .from('expense_audit_logs')
            .update({
              changes: mergedChanges,
              user_id: user.id,
            })
            .eq('id', recentLog.id);
        } else {
          await supabase.from('expense_audit_logs').insert({
            expense_id: id,
            group_id: rawGroupId,
            user_id: user.id,
            action: 'update',
            changes: mergedChanges,
            created_at: new Date().toISOString(),
          });
        }
      }

      // Trigger unified update notifications
      void notifyExpenseUpdated(supabase, {
        updaterId: user.id,
        expenseId: id,
        description: updatePayload.description ?? 'Gasto',
        previousDescription: previousExpense.description,
        totalAmount: parsedAmount,
        previousTotalAmount: previousExpense.total_amount,
        groupId: rawGroupId,
        currency: effectiveCurrency,
        newSplits: targetSplits,
        previousSplits: prevSplits,
        removedUserIds,
        paidBy: updatePayload.paid_by,
        previousPaidBy: previousExpense.paid_by,
        createdBy: previousExpense.created_by,
        category: updatePayload.category,
        previousCategory: previousExpense.category,
        expenseDate: updatePayload.expense_date,
        previousExpenseDate: previousExpense.expense_date,
        notes: updatePayload.notes,
        previousNotes: previousExpense.notes,
      });
    } catch (auditErr) {
      console.warn('[API /api/expenses/[id]] Warning recording audit log or notification:', auditErr);
    }

    // Fetch complete updated expense with items and splits to return
    const { data: fullUpdatedExpense } = await supabase
      .from('expenses')
      .select('*, items:expense_items(*), splits:expense_splits(*)')
      .eq('id', id)
      .single();

    const finalExpense = fullUpdatedExpense ?? updatedExpense;
    return NextResponse.json({ ...finalExpense, split_config: expense.split_config });
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

    // Fetch expense and its splits before deletion to notify participants
    const { data: expToDelete } = await supabase
      .from('expenses')
      .select('*, splits:expense_splits(*)')
      .eq('id', id)
      .maybeSingle();

    const { error } = await supabase
      .from('expenses')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[API /api/expenses/[id]] Delete error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (expToDelete) {
      try {
        void notifyExpenseDeleted(supabase, {
          deleterId: user.id,
          description: expToDelete.description ?? 'Gasto',
          groupId: expToDelete.group_id,
          splits: (expToDelete.splits || []).map((s: any) => ({
            user_id: s.user_id,
            amount_owed: s.amount_owed,
          })),
        });
      } catch (delNotifErr) {
        console.warn('[API /api/expenses/[id]] Delete notification warning:', delNotifErr);
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error('[API /api/expenses/[id]] Unhandled error:', err);
    const message = err instanceof Error ? err.message : 'Error interno al eliminar gasto';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

