import { SupabaseClient } from '@supabase/supabase-js';
import { formatCurrency } from '@/lib/balance-utils';

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
    removedUserIds = [],
    previousDescription,
  }: {
    updaterId: string;
    expenseId: string;
    description: string;
    totalAmount: number;
    groupId?: string | null;
    currency?: string;
    newSplits: Array<{ user_id: string; amount_owed: number }>;
    removedUserIds?: string[];
    previousDescription?: string;
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

    const allUserIds = Array.from(new Set([...newSplits.map((s) => s.user_id), ...removedUserIds]));
    const sponsorshipMap = await getSponsorshipMapForUsers(supabase, allUserIds);

    const { data: participantProfiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', allUserIds);

    const nameMap = new Map<string, string>();
    (participantProfiles || []).forEach((p) => {
      nameMap.set(p.id, p.full_name ?? 'Participante');
    });

    const notifications: NotificationPayload[] = [];
    const link = groupId ? `/groups/${groupId}?expenseId=${expenseId}` : `/my-expenses?expenseId=${expenseId}`;

    // 1. Notify current active splits
    for (const split of newSplits) {
      const pId = split.user_id;
      const amount = typeof split.amount_owed === 'number' ? split.amount_owed : parseFloat(String(split.amount_owed)) || 0;
      const formattedAmount = formatCurrency(amount, currency);
      const participantName = nameMap.get(pId) ?? 'un participante';

      if (pId !== updaterId) {
        notifications.push({
          user_id: pId,
          type: 'expense_updated',
          title: 'Gasto modificado',
          message: `${updaterName} editó el gasto "${description}" en ${groupName} (tu parte actualizada: ${formattedAmount}).`,
          link,
          data: {
            expense_id: expenseId,
            group_id: groupId,
            amount,
            currency,
            actor_id: updaterId,
            actor_name: updaterName,
          },
        });
      }

      const sponsorId = sponsorshipMap.get(pId);
      if (sponsorId && sponsorId !== updaterId && sponsorId !== pId) {
        notifications.push({
          user_id: sponsorId,
          type: 'expense_assigned',
          title: 'Gasto modificado (persona vinculada)',
          message: `${updaterName} actualizó el gasto "${description}" que incluye a ${participantName} (persona vinculada a ti) con un monto de ${formattedAmount}.`,
          link,
          data: {
            expense_id: expenseId,
            group_id: groupId,
            amount,
            currency,
            actor_id: updaterId,
            actor_name: updaterName,
            managed_user_id: pId,
            managed_user_name: participantName,
          },
        });
      }
    }

    // 2. Notify removed participants
    for (const rId of removedUserIds) {
      if (rId !== updaterId) {
        const removedName = nameMap.get(rId) ?? 'un participante';
        const targetDesc = previousDescription || description;
        notifications.push({
          user_id: rId,
          type: 'expense_updated',
          title: 'Gasto modificado',
          message: `${updaterName} te retiró de la división del gasto "${targetDesc}" en ${groupName}.`,
          link: groupId ? `/groups/${groupId}` : `/my-expenses`,
          data: {
            expense_id: expenseId,
            group_id: groupId,
            actor_id: updaterId,
            actor_name: updaterName,
          },
        });

        const sponsorId = sponsorshipMap.get(rId);
        if (sponsorId && sponsorId !== updaterId && sponsorId !== rId) {
          notifications.push({
            user_id: sponsorId,
            type: 'expense_assigned',
            title: 'Participante retirado de gasto',
            message: `${updaterName} retiró a ${removedName} (persona vinculada a ti) del gasto "${targetDesc}" en ${groupName}.`,
            link: groupId ? `/groups/${groupId}` : `/my-expenses`,
            data: {
              expense_id: expenseId,
              group_id: groupId,
              actor_id: updaterId,
              actor_name: updaterName,
              managed_user_id: rId,
            },
          });
        }
      }
    }

    if (notifications.length > 0) {
      await sendNotifications(supabase, notifications);
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
