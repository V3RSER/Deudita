import { SupabaseClient } from '@supabase/supabase-js';
import { formatCurrency } from '@/lib/balance-utils';
import { extractNotesAndConfig } from '@/lib/split-config-utils';

export interface NotificationPayload {
  user_id: string;
  type: string;
  title: string;
  message: string;
  link?: string | null;
  data?: Record<string, any>;
  is_read?: boolean;
}

/**
 * Inserts notifications safely into the Supabase `notifications` table.
 */
export async function sendNotifications(
  supabase: SupabaseClient<any, "public", any>,
  notifications: NotificationPayload[]
) {
  if (!notifications || notifications.length === 0) return;

  try {
    const rows = notifications.map((n) => ({
      user_id: n.user_id,
      type: n.type || 'general',
      title: n.title,
      message: n.message,
      link: n.link ?? null,
      data: n.data ?? {},
      is_read: false,
    }));

    const { error } = await supabase.from('notifications').insert(rows);
    if (error) {
      // If error might be missing link column in older cache, fallback without link column
      if (error.message?.includes('link') || error.code === 'PGRST204') {
        const fallbackRows = rows.map(({ link, ...rest }) => ({
          ...rest,
          data: { ...rest.data, link },
        }));
        await supabase.from('notifications').insert(fallbackRows);
      } else {
        console.warn('[Notifications] Insert error:', error.message);
      }
    }
  } catch (err) {
    console.warn('[Notifications] Exception inserting notifications:', err);
  }
}

/**
 * Retrieves the sponsorship map for a set of user IDs.
 * Looks up both the `managed_users` table and `profiles.managed_user_ids`.
 * Returns a Map: managed_user_id -> sponsor_id
 */
export async function getSponsorshipMapForUsers(
  supabase: SupabaseClient<any, "public", any>,
  userIds: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!userIds || userIds.length === 0) return map;

  // 1. Try querying `managed_users` table
  try {
    const { data: dbManaged } = await supabase
      .from('managed_users')
      .select('sponsor_id, managed_user_id')
      .in('managed_user_id', userIds);

    if (dbManaged) {
      for (const row of dbManaged) {
        if (row.managed_user_id && row.sponsor_id) {
          map.set(row.managed_user_id, row.sponsor_id);
        }
      }
    }
  } catch (err) {
    console.warn('[Notifications] Warning querying managed_users table:', err);
  }

  // 2. Fallback / supplementary check on `profiles.managed_user_ids`
  try {
    const { data: sponsorProfiles } = await supabase
      .from('profiles')
      .select('id, managed_user_ids')
      .not('managed_user_ids', 'is', null);

    if (sponsorProfiles) {
      for (const sp of sponsorProfiles) {
        if (Array.isArray(sp.managed_user_ids)) {
          for (const mId of sp.managed_user_ids) {
            if (userIds.includes(mId) && !map.has(mId)) {
              map.set(mId, sp.id);
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn('[Notifications] Warning checking sponsor profiles:', err);
  }

  return map;
}

/**
 * Triggers notifications when a new expense is created.
 */
export async function notifyExpenseCreated(
  supabase: SupabaseClient<any, "public", any>,
  {
    creatorId,
    expenseId,
    description,
    totalAmount,
    groupId,
    currency = 'COP',
    splits = [],
  }: {
    creatorId: string;
    expenseId: string;
    description: string;
    totalAmount: number;
    groupId?: string | null;
    currency?: string;
    splits: Array<{ user_id: string; amount_owed: number }>;
  }
) {
  try {
    if (!splits || splits.length === 0) return;

    // Fetch creator profile
    const { data: creator } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('id', creatorId)
      .maybeSingle();

    const creatorName = creator?.full_name ?? 'Un integrante';

    // Fetch group if any
    let groupName = 'el grupo';
    if (groupId) {
      const { data: group } = await supabase
        .from('groups')
        .select('name, currency')
        .eq('id', groupId)
        .maybeSingle();
      if (group?.name) groupName = `"${group.name}"`;
      if (group?.currency) currency = group.currency;
    }

    const participantIds = splits.map((s) => s.user_id);
    const sponsorshipMap = await getSponsorshipMapForUsers(supabase, participantIds);

    // Fetch names of participants
    const { data: participantProfiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', participantIds);

    const nameMap = new Map<string, string>();
    (participantProfiles || []).forEach((p) => {
      nameMap.set(p.id, p.full_name ?? 'Participante');
    });

    const notifications: NotificationPayload[] = [];
    const link = groupId ? `/groups/${groupId}?expenseId=${expenseId}` : `/my-expenses?expenseId=${expenseId}`;

    for (const split of splits) {
      const pId = split.user_id;
      const amount = typeof split.amount_owed === 'number' ? split.amount_owed : parseFloat(String(split.amount_owed)) || 0;
      const formattedAmount = formatCurrency(amount, currency);
      const participantName = nameMap.get(pId) ?? 'un participante';

      // 1. Notify participant directly (if not creator)
      if (pId !== creatorId) {
        notifications.push({
          user_id: pId,
          type: 'expense_added',
          title: 'Nuevo gasto registrado',
          message: `${creatorName} te incluyó en el gasto "${description}" por ${formattedAmount} en ${groupName}.`,
          link,
          data: {
            expense_id: expenseId,
            group_id: groupId,
            amount,
            currency,
            actor_id: creatorId,
            actor_name: creatorName,
          },
        });
      }

      // 2. Notify sponsor if participant is managed by someone else (and sponsor is not the creator)
      const sponsorId = sponsorshipMap.get(pId);
      if (sponsorId && sponsorId !== creatorId && sponsorId !== pId) {
        notifications.push({
          user_id: sponsorId,
          type: 'expense_assigned',
          title: 'Gasto asignado a persona vinculada',
          message: `${creatorName} asignó un gasto a ${participantName} (persona vinculada a ti) en "${description}" por ${formattedAmount} en ${groupName}.`,
          link,
          data: {
            expense_id: expenseId,
            group_id: groupId,
            amount,
            currency,
            actor_id: creatorId,
            actor_name: creatorName,
            managed_user_id: pId,
            managed_user_name: participantName,
          },
        });
      }
    }

    if (notifications.length > 0) {
      await sendNotifications(supabase, notifications);
    }
  } catch (err) {
    console.warn('[Notifications] Error in notifyExpenseCreated:', err);
  }
}

export interface ExpenseChangeSummary {
  summaryText: string;
  changeTags: string[];
  amountChanged: boolean;
  previousAmount: number;
  newAmount: number;
  descriptionChanged: boolean;
  previousDescription?: string;
  newDescription: string;
  payerChanged: boolean;
  previousPaidBy?: string;
  newPaidBy?: string;
  previousPayerName?: string;
  newPayerName?: string;
  addedUserIds: string[];
  addedNames: string[];
  removedUserIds: string[];
  removedNames: string[];
  splitChanges: Array<{
    userId: string;
    userName: string;
    previousAmount: number;
    newAmount: number;
    diff: number;
  }>;
  categoryChanged: boolean;
  previousCategory?: string;
  newCategory?: string;
  dateChanged: boolean;
  notesChanged: boolean;
}

/**
 * Calculates a comprehensive diff between an expense's previous state and its updated state.
 * Returns unified change tags, a human-friendly summary, and structured change data.
 */
export function calculateExpenseChangeDetails({
  previousExpense,
  newExpense,
  currency = 'COP',
  nameMap = new Map(),
}: {
  previousExpense: {
    description?: string;
    total_amount?: number;
    paid_by?: string;
    expense_date?: string;
    category?: string;
    notes?: string;
    split_config?: any;
    splits?: Array<{ user_id: string; amount_owed: number }>;
  };
  newExpense: {
    description?: string;
    total_amount?: number;
    paid_by?: string;
    expense_date?: string;
    category?: string;
    notes?: string;
    split_config?: any;
    splits?: Array<{ user_id: string; amount_owed: number }>;
  };
  currency?: string;
  nameMap?: Map<string, string>;
}): ExpenseChangeSummary {
  const changeTags: string[] = [];

  // 1. Total amount
  const prevAmt = Number(previousExpense.total_amount) || 0;
  const newAmt = Number(newExpense.total_amount) || 0;
  const amountChanged = Math.abs(prevAmt - newAmt) > 0.01;
  if (amountChanged) {
    changeTags.push(
      `Monto: ${formatCurrency(prevAmt, currency)} → ${formatCurrency(newAmt, currency)}`
    );
  }

  // 2. Description
  const prevDesc = previousExpense.description?.trim();
  const newDesc = newExpense.description?.trim() || 'Gasto';
  const descriptionChanged = Boolean(prevDesc && newDesc && prevDesc !== newDesc);
  if (descriptionChanged) {
    changeTags.push(`Nombre: "${prevDesc}" → "${newDesc}"`);
  }

  // 3. Payer
  const prevPayer = previousExpense.paid_by;
  const newPayer = newExpense.paid_by;
  const payerChanged = Boolean(prevPayer && newPayer && prevPayer !== newPayer);
  const previousPayerName = prevPayer ? (nameMap.get(prevPayer) ?? 'Usuario anterior') : undefined;
  const newPayerName = newPayer ? (nameMap.get(newPayer) ?? 'Nuevo pagador') : undefined;
  if (payerChanged && previousPayerName && newPayerName) {
    changeTags.push(`Pagador: ${previousPayerName} → ${newPayerName}`);
  }

  // 4. Splits & Participants
  const prevSplits = previousExpense.splits ?? [];
  const newSplits = newExpense.splits ?? [];

  const prevSplitMap = new Map<string, number>();
  for (const s of prevSplits) {
    const amt = typeof s.amount_owed === 'number' ? s.amount_owed : parseFloat(String(s.amount_owed)) || 0;
    prevSplitMap.set(s.user_id, amt);
  }

  const newSplitMap = new Map<string, number>();
  for (const s of newSplits) {
    const amt = typeof s.amount_owed === 'number' ? s.amount_owed : parseFloat(String(s.amount_owed)) || 0;
    newSplitMap.set(s.user_id, amt);
  }

  const prevUserIds = Array.from(prevSplitMap.keys());
  const newUserIds = Array.from(newSplitMap.keys());

  const addedUserIds = newUserIds.filter((uid) => !prevSplitMap.has(uid));
  const removedUserIds = prevUserIds.filter((uid) => !newSplitMap.has(uid));

  const addedNames = addedUserIds.map((uid) => nameMap.get(uid) ?? 'Nuevo participante');
  const removedNames = removedUserIds.map((uid) => nameMap.get(uid) ?? 'Participante retirado');

  if (addedNames.length > 0) {
    changeTags.push(`Añadido(s): ${addedNames.join(', ')}`);
  }
  if (removedNames.length > 0) {
    changeTags.push(`Removido(s): ${removedNames.join(', ')}`);
  }

  // Split quota modifications for continuing participants
  const splitChanges: ExpenseChangeSummary['splitChanges'] = [];
  for (const [uid, nextQuota] of newSplitMap.entries()) {
    if (prevSplitMap.has(uid)) {
      const prevQuota = prevSplitMap.get(uid)!;
      if (Math.abs(nextQuota - prevQuota) > 0.01) {
        const uName = nameMap.get(uid) ?? 'Participante';
        splitChanges.push({
          userId: uid,
          userName: uName,
          previousAmount: prevQuota,
          newAmount: nextQuota,
          diff: nextQuota - prevQuota,
        });
      }
    }
  }

  if (splitChanges.length > 0) {
    if (splitChanges.length === 1) {
      const chg = splitChanges[0];
      changeTags.push(
        `Cuota de ${chg.userName}: ${formatCurrency(chg.previousAmount, currency)} → ${formatCurrency(chg.newAmount, currency)}`
      );
    } else {
      changeTags.push(`Cuotas modificadas (${splitChanges.length} personas)`);
    }
  }

  // 5. Category
  const prevCat = previousExpense.category?.trim();
  const newCat = newExpense.category?.trim();
  const categoryChanged = Boolean(prevCat && newCat && prevCat !== newCat);
  if (categoryChanged) {
    changeTags.push(`Categoría actualizada`);
  }

  // 6. Date
  const prevDate = previousExpense.expense_date?.trim();
  const newDate = newExpense.expense_date?.trim();
  const dateChanged = Boolean(prevDate && newDate && prevDate !== newDate);
  if (dateChanged) {
    changeTags.push(`Fecha modificada`);
  }

  // 7. Notes
  const prevParsedNotes = extractNotesAndConfig(previousExpense.notes);
  const nextParsedNotes = extractNotesAndConfig(newExpense.notes);
  const prevNotes = prevParsedNotes.userNote.trim();
  const nextNotes = nextParsedNotes.userNote.trim();
  const notesChanged = prevNotes !== nextNotes;
  if (notesChanged) {
    changeTags.push(`Notas modificadas`);
  }

  // 8. Split configuration method
  const prevConfig = previousExpense.split_config || prevParsedNotes.splitConfig;
  const nextConfig = newExpense.split_config || nextParsedNotes.splitConfig;
  if (prevConfig?.splitType && nextConfig?.splitType && prevConfig.splitType !== nextConfig.splitType) {
    const labelMap: Record<string, string> = {
      equal: 'Partes iguales',
      exact: 'Monto exacto',
      shares: 'Por cuotas',
      percentage: 'Porcentaje',
      itemized: 'Por artículo',
    };
    const prevLabel = labelMap[prevConfig.splitType] || prevConfig.splitType;
    const nextLabel = labelMap[nextConfig.splitType] || nextConfig.splitType;
    changeTags.push(`Método de división: ${prevLabel} → ${nextLabel}`);
  }

  const summaryText = changeTags.length > 0 ? changeTags.join(' | ') : 'Gasto actualizado';

  return {
    summaryText,
    changeTags,
    amountChanged,
    previousAmount: prevAmt,
    newAmount: newAmt,
    descriptionChanged,
    previousDescription: prevDesc,
    newDescription: newDesc,
    payerChanged,
    previousPaidBy: prevPayer,
    newPaidBy: newPayer,
    previousPayerName,
    newPayerName,
    addedUserIds,
    addedNames,
    removedUserIds,
    removedNames,
    splitChanges,
    categoryChanged,
    previousCategory: prevCat,
    newCategory: newCat,
    dateChanged,
    notesChanged,
  };
}

/**
 * Triggers notifications when an existing expense is updated.
 */
export async function notifyExpenseUpdated(
  supabase: SupabaseClient<any, "public", any>,
  {
    updaterId,
    expenseId,
    description,
    totalAmount,
    groupId,
    currency = 'COP',
    newSplits = [],
    previousSplits = [],
    removedUserIds = [],
    previousDescription,
    previousTotalAmount,
    paidBy,
    previousPaidBy,
    createdBy,
    category,
    previousCategory,
    expenseDate,
    previousExpenseDate,
    notes,
    previousNotes,
  }: {
    updaterId: string;
    expenseId: string;
    description: string;
    totalAmount: number;
    groupId?: string | null;
    currency?: string;
    newSplits: Array<{ user_id: string; amount_owed: number }>;
    previousSplits?: Array<{ user_id: string; amount_owed: number }>;
    removedUserIds?: string[];
    previousDescription?: string;
    previousTotalAmount?: number;
    paidBy?: string;
    previousPaidBy?: string;
    createdBy?: string;
    category?: string;
    previousCategory?: string;
    expenseDate?: string;
    previousExpenseDate?: string;
    notes?: string;
    previousNotes?: string;
  }
) {
  try {
    // Fetch updater profile
    const { data: updater } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('id', updaterId)
      .maybeSingle();

    const updaterName = updater?.full_name ?? 'Un integrante';

    // Fetch group if any
    let groupName = 'el grupo';
    if (groupId) {
      const { data: group } = await supabase
        .from('groups')
        .select('name, currency')
        .eq('id', groupId)
        .maybeSingle();
      if (group?.name) groupName = `"${group.name}"`;
      if (group?.currency) currency = group.currency;
    }

    // Collect all candidate user IDs for names & sponsorships
    const candidateIds = new Set<string>([
      updaterId,
      ...newSplits.map((s) => s.user_id),
      ...previousSplits.map((s) => s.user_id),
      ...removedUserIds,
    ]);
    if (paidBy) candidateIds.add(paidBy);
    if (previousPaidBy) candidateIds.add(previousPaidBy);
    if (createdBy) candidateIds.add(createdBy);

    const allUserIds = Array.from(candidateIds);
    const sponsorshipMap = await getSponsorshipMapForUsers(supabase, allUserIds);

    const { data: participantProfiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', allUserIds);

    const nameMap = new Map<string, string>();
    (participantProfiles || []).forEach((p) => {
      nameMap.set(p.id, p.full_name ?? 'Participante');
    });

    // Compute standardized change diff
    const changeDetails = calculateExpenseChangeDetails({
      previousExpense: {
        description: previousDescription || description,
        total_amount: previousTotalAmount !== undefined ? previousTotalAmount : totalAmount,
        paid_by: previousPaidBy || paidBy,
        expense_date: previousExpenseDate || expenseDate,
        category: previousCategory || category,
        notes: previousNotes || notes,
        splits: previousSplits,
      },
      newExpense: {
        description,
        total_amount: totalAmount,
        paid_by: paidBy || previousPaidBy,
        expense_date: expenseDate,
        category,
        notes,
        splits: newSplits,
      },
      currency,
      nameMap,
    });

    const previousSplitMap = new Map<string, number>();
    for (const s of previousSplits) {
      const amt = typeof s.amount_owed === 'number' ? s.amount_owed : parseFloat(String(s.amount_owed)) || 0;
      previousSplitMap.set(s.user_id, amt);
    }

    const previousUserIdsSet = new Set(previousSplits.map((s) => s.user_id));
    const effectiveRemovedIds = new Set([
      ...removedUserIds,
      ...previousSplits.filter((s) => !newSplits.some((ns) => ns.user_id === s.user_id)).map((s) => s.user_id),
    ]);

    const notificationsMap = new Map<string, NotificationPayload>();
    const link = groupId ? `/groups/${groupId}?expenseId=${expenseId}` : `/my-expenses?expenseId=${expenseId}`;

    const totalPhrase = changeDetails.amountChanged
      ? ` (el total cambió de ${formatCurrency(changeDetails.previousAmount, currency)} a ${formatCurrency(changeDetails.newAmount, currency)})`
      : '';

    const namePhrase = changeDetails.descriptionChanged
      ? ` (antes "${previousDescription}")`
      : '';

    // 1. Notify current active splits
    for (const split of newSplits) {
      const pId = split.user_id;
      const amount = typeof split.amount_owed === 'number' ? split.amount_owed : parseFloat(String(split.amount_owed)) || 0;
      const formattedAmount = formatCurrency(amount, currency);
      const participantName = nameMap.get(pId) ?? 'un participante';

      const wasInPreviousSplits = previousUserIdsSet.has(pId);
      const prevQuota = previousSplitMap.get(pId);

      if (pId !== updaterId) {
        if (!wasInPreviousSplits) {
          // Newly added participant
          notificationsMap.set(pId, {
            user_id: pId,
            type: 'expense_added',
            title: 'Te agregaron a un gasto',
            message: `${updaterName} te incluyó en el gasto "${description}" en ${groupName} con una cuota de ${formattedAmount}.`,
            link,
            data: {
              expense_id: expenseId,
              group_id: groupId,
              amount,
              currency,
              actor_id: updaterId,
              actor_name: updaterName,
              change_tags: changeDetails.changeTags,
              changes_summary: changeDetails.summaryText,
              is_new_participant: true,
              total_amount: totalAmount,
              previous_total_amount: previousTotalAmount,
            },
          });
        } else {
          // Existing participant
          const quotaChanged = prevQuota !== undefined && Math.abs(prevQuota - amount) > 0.01;
          const message = quotaChanged
            ? `${updaterName} editó el gasto "${description}"${namePhrase} en ${groupName}. Tu cuota cambió de ${formatCurrency(prevQuota!, currency)} a ${formattedAmount}${totalPhrase}.`
            : `${updaterName} editó el gasto "${description}"${namePhrase} en ${groupName} (tu cuota se mantiene en ${formattedAmount})${totalPhrase}.`;

          notificationsMap.set(pId, {
            user_id: pId,
            type: 'expense_updated',
            title: 'Gasto modificado',
            message,
            link,
            data: {
              expense_id: expenseId,
              group_id: groupId,
              amount,
              previous_amount: prevQuota,
              currency,
              actor_id: updaterId,
              actor_name: updaterName,
              change_tags: changeDetails.changeTags,
              changes_summary: changeDetails.summaryText,
              total_amount: totalAmount,
              previous_total_amount: previousTotalAmount,
            },
          });
        }
      }

      // Sponsor notification for managed active participant
      const sponsorId = sponsorshipMap.get(pId);
      if (sponsorId && sponsorId !== updaterId && sponsorId !== pId) {
        let sponsorTitle = 'Gasto modificado (persona vinculada)';
        let sponsorMsg = '';

        if (!wasInPreviousSplits) {
          sponsorTitle = 'Persona vinculada agregada a gasto';
          sponsorMsg = `${updaterName} incluyó a ${participantName} (persona vinculada a ti) en el gasto "${description}" en ${groupName} con una cuota de ${formattedAmount}.`;
        } else if (prevQuota !== undefined && Math.abs(prevQuota - amount) > 0.01) {
          sponsorTitle = 'Cuota modificada (persona vinculada)';
          sponsorMsg = `${updaterName} modificó el gasto "${description}" en ${groupName}: la cuota de ${participantName} cambió de ${formatCurrency(prevQuota, currency)} a ${formattedAmount}${totalPhrase}.`;
        } else {
          sponsorMsg = `${updaterName} actualizó el gasto "${description}" que incluye a ${participantName} (persona vinculada a ti) en ${groupName}.`;
        }

        notificationsMap.set(`sponsor-${pId}`, {
          user_id: sponsorId,
          type: 'expense_assigned',
          title: sponsorTitle,
          message: sponsorMsg,
          link,
          data: {
            expense_id: expenseId,
            group_id: groupId,
            amount,
            previous_amount: prevQuota,
            currency,
            actor_id: updaterId,
            actor_name: updaterName,
            managed_user_id: pId,
            managed_user_name: participantName,
            change_tags: changeDetails.changeTags,
            changes_summary: changeDetails.summaryText,
          },
        });
      }
    }

    // 2. Notify removed participants
    for (const rId of Array.from(effectiveRemovedIds)) {
      if (rId !== updaterId && !notificationsMap.has(rId)) {
        const removedName = nameMap.get(rId) ?? 'un participante';
        const targetDesc = previousDescription || description;
        notificationsMap.set(rId, {
          user_id: rId,
          type: 'expense_updated',
          title: 'Retirado de un gasto',
          message: `${updaterName} te retiró de la división del gasto "${targetDesc}" en ${groupName}.`,
          link: groupId ? `/groups/${groupId}` : `/my-expenses`,
          data: {
            expense_id: expenseId,
            group_id: groupId,
            actor_id: updaterId,
            actor_name: updaterName,
            change_tags: changeDetails.changeTags,
            changes_summary: changeDetails.summaryText,
            is_removed: true,
          },
        });

        const sponsorId = sponsorshipMap.get(rId);
        if (sponsorId && sponsorId !== updaterId && sponsorId !== rId) {
          notificationsMap.set(`sponsor-removed-${rId}`, {
            user_id: sponsorId,
            type: 'expense_assigned',
            title: 'Persona vinculada retirada de gasto',
            message: `${updaterName} retiró a ${removedName} (persona vinculada a ti) del gasto "${targetDesc}" en ${groupName}.`,
            link: groupId ? `/groups/${groupId}` : `/my-expenses`,
            data: {
              expense_id: expenseId,
              group_id: groupId,
              actor_id: updaterId,
              actor_name: updaterName,
              managed_user_id: rId,
              managed_user_name: removedName,
              change_tags: changeDetails.changeTags,
              changes_summary: changeDetails.summaryText,
            },
          });
        }
      }
    }

    // 3. Notify previous payer if payer changed
    if (
      changeDetails.payerChanged &&
      previousPaidBy &&
      previousPaidBy !== updaterId &&
      !notificationsMap.has(previousPaidBy)
    ) {
      notificationsMap.set(previousPaidBy, {
        user_id: previousPaidBy,
        type: 'expense_updated',
        title: 'Cambio de pagador en gasto',
        message: `${updaterName} modificó el gasto "${description}" en ${groupName}: el pagador cambió a ${changeDetails.newPayerName ?? 'otro integrante'}.`,
        link,
        data: {
          expense_id: expenseId,
          group_id: groupId,
          actor_id: updaterId,
          actor_name: updaterName,
          change_tags: changeDetails.changeTags,
          changes_summary: changeDetails.summaryText,
          payer_changed: true,
        },
      });
    }

    // 4. Notify new payer if payer changed and wasn't previously the payer
    if (
      changeDetails.payerChanged &&
      paidBy &&
      paidBy !== updaterId &&
      paidBy !== previousPaidBy
    ) {
      const existingNotif = notificationsMap.get(paidBy);
      const payerPhrase = ` Te asignó como pagador del gasto (total: ${formatCurrency(totalAmount, currency)}).`;
      if (existingNotif) {
        existingNotif.message += payerPhrase;
        existingNotif.title = 'Asignado como pagador y gasto modificado';
      } else {
        notificationsMap.set(paidBy, {
          user_id: paidBy,
          type: 'expense_updated',
          title: 'Asignado como pagador',
          message: `${updaterName} te asignó como pagador del gasto "${description}" en ${groupName} por un total de ${formatCurrency(totalAmount, currency)}.`,
          link,
          data: {
            expense_id: expenseId,
            group_id: groupId,
            amount: totalAmount,
            currency,
            actor_id: updaterId,
            actor_name: updaterName,
            change_tags: changeDetails.changeTags,
            changes_summary: changeDetails.summaryText,
            payer_changed: true,
          },
        });
      }
    }

    // 5. Notify creator if someone else edited their registered expense and they aren't already notified
    if (createdBy && createdBy !== updaterId && !notificationsMap.has(createdBy)) {
      notificationsMap.set(createdBy, {
        user_id: createdBy,
        type: 'expense_updated',
        title: 'Gasto modificado',
        message: `${updaterName} editó el gasto "${description}" que registraste en ${groupName}.${totalPhrase}`,
        link,
        data: {
          expense_id: expenseId,
          group_id: groupId,
          actor_id: updaterId,
          actor_name: updaterName,
          change_tags: changeDetails.changeTags,
          changes_summary: changeDetails.summaryText,
          is_creator_update: true,
        },
      });
    }

    const notificationsToSend = Array.from(notificationsMap.values());
    if (notificationsToSend.length > 0) {
      await sendNotifications(supabase, notificationsToSend);
    }
  } catch (err) {
    console.warn('[Notifications] Error in notifyExpenseUpdated:', err);
  }
}

/**
 * Triggers notifications when an expense is deleted.
 */
export async function notifyExpenseDeleted(
  supabase: SupabaseClient<any, "public", any>,
  {
    deleterId,
    description,
    groupId,
    splits = [],
  }: {
    deleterId: string;
    description: string;
    groupId?: string | null;
    splits: Array<{ user_id: string; amount_owed: number }>;
  }
) {
  try {
    const { data: deleter } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('id', deleterId)
      .maybeSingle();

    const deleterName = deleter?.full_name ?? 'Un integrante';

    let groupName = 'el grupo';
    if (groupId) {
      const { data: group } = await supabase
        .from('groups')
        .select('name')
        .eq('id', groupId)
        .maybeSingle();
      if (group?.name) groupName = `"${group.name}"`;
    }

    const participantIds = splits.map((s) => s.user_id);
    const sponsorshipMap = await getSponsorshipMapForUsers(supabase, participantIds);

    const { data: participantProfiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', participantIds);

    const nameMap = new Map<string, string>();
    (participantProfiles || []).forEach((p) => {
      nameMap.set(p.id, p.full_name ?? 'Participante');
    });

    const notifications: NotificationPayload[] = [];
    const link = groupId ? `/groups/${groupId}` : `/my-expenses`;

    for (const split of splits) {
      const pId = split.user_id;
      const participantName = nameMap.get(pId) ?? 'un participante';

      if (pId !== deleterId) {
        notifications.push({
          user_id: pId,
          type: 'expense_deleted',
          title: 'Gasto eliminado',
          message: `${deleterName} eliminó el gasto "${description}" en ${groupName}.`,
          link,
          data: {
            group_id: groupId,
            actor_id: deleterId,
            actor_name: deleterName,
          },
        });
      }

      const sponsorId = sponsorshipMap.get(pId);
      if (sponsorId && sponsorId !== deleterId && sponsorId !== pId) {
        notifications.push({
          user_id: sponsorId,
          type: 'expense_deleted',
          title: 'Gasto eliminado (persona vinculada)',
          message: `${deleterName} eliminó el gasto "${description}" en ${groupName} que incluía a ${participantName} (persona vinculada a ti).`,
          link,
          data: {
            group_id: groupId,
            actor_id: deleterId,
            actor_name: deleterName,
            managed_user_id: pId,
            managed_user_name: participantName,
          },
        });
      }
    }

    if (notifications.length > 0) {
      await sendNotifications(supabase, notifications);
    }
  } catch (err) {
    console.warn('[Notifications] Error in notifyExpenseDeleted:', err);
  }
}

/**
 * Triggers notifications when a payment is registered.
 */
export async function notifyPaymentCreated(
  supabase: SupabaseClient<any, "public", any>,
  {
    paymentId,
    payerId,
    receiverId,
    amount,
    groupId,
    currency = 'COP',
    note,
  }: {
    paymentId: string;
    payerId: string;
    receiverId: string;
    amount: number;
    groupId: string;
    currency?: string;
    note?: string | null;
  }
) {
  try {
    if (!paymentId || !payerId || !receiverId) return;

    // Fetch payer and receiver profiles
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', [payerId, receiverId]);

    const payerName = profiles?.find((p) => p.id === payerId)?.full_name ?? 'Un integrante';
    const receiverName = profiles?.find((p) => p.id === receiverId)?.full_name ?? 'un integrante';

    let groupName = 'el grupo';
    if (groupId) {
      const { data: group } = await supabase
        .from('groups')
        .select('name, currency')
        .eq('id', groupId)
        .maybeSingle();
      if (group?.name) groupName = `"${group.name}"`;
      if (group?.currency) currency = group.currency;
    }

    const formattedAmount = formatCurrency(amount, currency);
    const link = `/groups/${groupId}?tab=balances`;
    const notifications: NotificationPayload[] = [];

    // 1. Notify receiver
    notifications.push({
      user_id: receiverId,
      type: 'payment_received',
      title: 'Pago registrado',
      message: `${payerName} registró un pago de ${formattedAmount} a tu favor en ${groupName}.${note ? ` ("${note}")` : ''}`,
      link,
      data: {
        payment_id: paymentId,
        group_id: groupId,
        amount,
        currency,
        actor_id: payerId,
        actor_name: payerName,
      },
    });

    // 2. Sponsorship notifications
    const sponsorshipMap = await getSponsorshipMapForUsers(supabase, [receiverId, payerId]);

    // Sponsor of receiver
    const receiverSponsorId = sponsorshipMap.get(receiverId);
    if (receiverSponsorId && receiverSponsorId !== payerId && receiverSponsorId !== receiverId) {
      notifications.push({
        user_id: receiverSponsorId,
        type: 'payment_received',
        title: 'Pago recibido (persona vinculada)',
        message: `${payerName} registró un pago de ${formattedAmount} a favor de ${receiverName} (persona vinculada a ti) en ${groupName}.`,
        link,
        data: {
          payment_id: paymentId,
          group_id: groupId,
          amount,
          currency,
          actor_id: payerId,
          managed_user_id: receiverId,
          managed_user_name: receiverName,
        },
      });
    }

    // Sponsor of payer
    const payerSponsorId = sponsorshipMap.get(payerId);
    if (payerSponsorId && payerSponsorId !== payerId && payerSponsorId !== receiverId) {
      notifications.push({
        user_id: payerSponsorId,
        type: 'payment_received',
        title: 'Pago registrado (persona vinculada)',
        message: `${payerName} (persona vinculada a ti) registró un pago de ${formattedAmount} a favor de ${receiverName} en ${groupName}.`,
        link,
        data: {
          payment_id: paymentId,
          group_id: groupId,
          amount,
          currency,
          actor_id: payerId,
          managed_user_id: payerId,
          managed_user_name: payerName,
        },
      });
    }

    if (notifications.length > 0) {
      await sendNotifications(supabase, notifications);
    }
  } catch (err) {
    console.warn('[Notifications] Error in notifyPaymentCreated:', err);
  }
}

/**
 * Triggers notifications when a payment is deleted or cancelled.
 */
export async function notifyPaymentDeleted(
  supabase: SupabaseClient<any, "public", any>,
  {
    deleterId,
    payerId,
    receiverId,
    amount,
    groupId,
    currency = 'COP',
  }: {
    deleterId: string;
    payerId: string;
    receiverId: string;
    amount: number;
    groupId: string;
    currency?: string;
  }
) {
  try {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', [deleterId, payerId, receiverId]);

    const deleterName = profiles?.find((p) => p.id === deleterId)?.full_name ?? 'Un integrante';

    let groupName = 'el grupo';
    if (groupId) {
      const { data: group } = await supabase
        .from('groups')
        .select('name, currency')
        .eq('id', groupId)
        .maybeSingle();
      if (group?.name) groupName = `"${group.name}"`;
      if (group?.currency) currency = group.currency;
    }

    const formattedAmount = formatCurrency(amount, currency);
    const link = `/groups/${groupId}?tab=balances`;
    const notifications: NotificationPayload[] = [];

    const notifyTarget = (targetId: string, roleDesc: string) => {
      if (targetId && targetId !== deleterId) {
        notifications.push({
          user_id: targetId,
          type: 'payment_deleted',
          title: 'Pago eliminado',
          message: `${deleterName} eliminó el registro del pago de ${formattedAmount} (${roleDesc}) en ${groupName}.`,
          link,
          data: {
            group_id: groupId,
            amount,
            currency,
            actor_id: deleterId,
          },
        });
      }
    };

    notifyTarget(receiverId, 'a tu favor');
    notifyTarget(payerId, 'realizado por ti');

    if (notifications.length > 0) {
      await sendNotifications(supabase, notifications);
    }
  } catch (err) {
    console.warn('[Notifications] Error in notifyPaymentDeleted:', err);
  }
}

