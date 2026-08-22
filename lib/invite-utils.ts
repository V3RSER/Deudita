import { SupabaseClient, User } from '@supabase/supabase-js';
import { sendGroupInviteEmail } from './email';

export interface ClaimResult {
  success: boolean;
  groupId: string;
  groupName?: string;
  message?: string;
}

/**
 * Unifies all temporary profiles associated with a user (by email, invite records, or specific ID)
 * into the user's real registered profile, reassigns all records (group memberships, expenses, splits, payments, etc.),
 * and permanently deletes the temporary profiles.
 */
export async function claimAllTempProfilesForUser(
  db: SupabaseClient,
  user: User,
  specificTempId?: string | null
): Promise<string[]> {
  if (!user || !user.id) return [];

  const userEmail = user.email ? user.email.toLowerCase().trim() : null;
  const claimedTempIds = new Set<string>();

  if (specificTempId && specificTempId !== user.id) {
    claimedTempIds.add(specificTempId);
  }

  // 1. Find all temporary profiles matching the user's email
  if (userEmail) {
    try {
      const { data: tempProfilesByEmail } = await db
        .from('profiles')
        .select('id, is_temp, email')
        .ilike('email', userEmail);

      if (tempProfilesByEmail) {
        for (const p of tempProfilesByEmail) {
          if (p.id && p.id !== user.id) {
            claimedTempIds.add(p.id);
          }
        }
      }
    } catch (err) {
      console.warn('[claimAllTempProfilesForUser] Error finding temp profiles by email:', err);
    }

    // 2. Find any invites with matching email and an invitee_profile_id
    try {
      const { data: invitesByEmail } = await db
        .from('group_invites')
        .select('invitee_profile_id')
        .ilike('email', userEmail)
        .not('invitee_profile_id', 'is', null);

      if (invitesByEmail) {
        for (const inv of invitesByEmail) {
          if (inv.invitee_profile_id && inv.invitee_profile_id !== user.id) {
            claimedTempIds.add(inv.invitee_profile_id);
          }
        }
      }
    } catch (err) {
      console.warn('[claimAllTempProfilesForUser] Error finding invites by email:', err);
    }
  }

  // 3. For each temporary profile found, migrate records and delete the temporary profile
  const claimedList = Array.from(claimedTempIds);
  for (const tempId of claimedList) {
    if (!tempId || tempId === user.id) continue;

    // A) Try calling RPC first (runs with SECURITY DEFINER to bypass RLS)
    try {
      await db.rpc('claim_temp_profile', {
        temp_id: tempId,
        real_id: user.id,
      });
    } catch (rpcErr) {
      console.warn('[claimAllTempProfilesForUser] RPC claim_temp_profile warning/error:', rpcErr);
    }

    // B) Comprehensive manual migration fallback
    try {
      // Group Members: reassign membership to user.id if not already member, then delete old
      const { data: tempMemberships } = await db
        .from('group_members')
        .select('group_id')
        .eq('user_id', tempId);

      if (tempMemberships && tempMemberships.length > 0) {
        for (const tm of tempMemberships) {
          const { data: realMembership } = await db
            .from('group_members')
            .select('id')
            .eq('group_id', tm.group_id)
            .eq('user_id', user.id)
            .maybeSingle();

          if (!realMembership) {
            await db
              .from('group_members')
              .update({ user_id: user.id })
              .eq('user_id', tempId)
              .eq('group_id', tm.group_id);
          }
        }
      }
      await db.from('group_members').delete().eq('user_id', tempId);

      // Reassign group ownership, invitations, expenses, splits, payments, notifications
      await db.from('group_members').update({ invited_by: user.id }).eq('invited_by', tempId);
      await db.from('groups').update({ owner_id: user.id }).eq('owner_id', tempId);
      await db.from('expenses').update({ paid_by: user.id }).eq('paid_by', tempId);
      await db.from('expenses').update({ created_by: user.id }).eq('created_by', tempId);

      // Expense splits: migrate splits to real user or remove duplicates
      const { data: tempSplits } = await db
        .from('expense_splits')
        .select('id, expense_id, amount_owed')
        .eq('user_id', tempId);

      if (tempSplits && tempSplits.length > 0) {
        for (const split of tempSplits) {
          const { data: realSplit } = await db
            .from('expense_splits')
            .select('id')
            .eq('expense_id', split.expense_id)
            .eq('user_id', user.id)
            .maybeSingle();

          if (!realSplit) {
            await db
              .from('expense_splits')
              .update({ user_id: user.id })
              .eq('id', split.id);
          } else {
            await db.from('expense_splits').delete().eq('id', split.id);
          }
        }
      }
      await db.from('expense_splits').delete().eq('user_id', tempId);

      await db.from('payments').update({ paid_by: user.id }).eq('paid_by', tempId);
      await db.from('payments').update({ paid_to: user.id }).eq('paid_to', tempId);
      await db.from('notifications').update({ user_id: user.id }).eq('user_id', tempId);
      await db.from('group_invites').update({ invitee_profile_id: user.id }).eq('invitee_profile_id', tempId);
      await db.from('group_invites').update({ invited_by: user.id }).eq('invited_by', tempId);

      // C) Delete temporary profile from profiles table
      await db.from('profiles').delete().eq('id', tempId);
    } catch (migErr) {
      console.error('[claimAllTempProfilesForUser] Error in manual fallback migration for tempId:', tempId, migErr);
    }
  }

  // 4. Ensure any remaining temporary profiles matching user email are deleted
  if (userEmail) {
    try {
      await db
        .from('profiles')
        .delete()
        .eq('is_temp', true)
        .ilike('email', userEmail);
    } catch (delErr) {
      console.warn('[claimAllTempProfilesForUser] Error deleting temp profiles by email:', delErr);
    }
  }

  return claimedList;
}

export async function claimAndJoinGroupInvite(
  db: SupabaseClient,
  inviteTokenOrId: string,
  user: User
): Promise<ClaimResult> {
  if (!inviteTokenOrId || !user) {
    throw new Error('Información de invitación o usuario no válida');
  }

  const cleanToken = String(inviteTokenOrId).trim();
  const userEmailLower = user.email ? user.email.toLowerCase().trim() : null;

  // 1. Ensure user profile exists in profiles table as a real registered profile (is_temp = false)
  const meta = user.user_metadata ?? {};
  const fullName = meta.full_name ?? meta.name ?? (userEmailLower ? userEmailLower.split('@')[0] : 'Usuario');
  const avatarUrl = meta.avatar_url ?? meta.picture ?? null;

  await db.from('profiles').upsert(
    {
      id: user.id,
      email: user.email ?? null,
      full_name: fullName,
      avatar_url: avatarUrl,
      is_temp: false,
    },
    { onConflict: 'id' }
  );

  // 2. Look up the invite by token, by id, or by email
  let invite: any = null;

  // By token
  const { data: inviteByToken } = await db
    .from('group_invites')
    .select('id, group_id, email, status, token, invited_by, invitee_profile_id, created_at')
    .eq('token', cleanToken)
    .maybeSingle();

  if (inviteByToken) {
    invite = inviteByToken;
  } else {
    // By id
    const { data: inviteById } = await db
      .from('group_invites')
      .select('id, group_id, email, status, token, invited_by, invitee_profile_id, created_at')
      .eq('id', cleanToken)
      .maybeSingle();

    if (inviteById) {
      invite = inviteById;
    } else if (userEmailLower) {
      // By email match
      const { data: inviteByEmail } = await db
        .from('group_invites')
        .select('id, group_id, email, status, token, invited_by, invitee_profile_id, created_at')
        .ilike('email', userEmailLower)
        .eq('status', 'pending')
        .maybeSingle();

      if (inviteByEmail) {
        invite = inviteByEmail;
      }
    }
  }

  // Check expiration if invite record was found
  if (invite) {
    const createdAtMs = invite.created_at ? new Date(invite.created_at).getTime() : Date.now();
    const isExpired = createdAtMs + 7 * 24 * 60 * 60 * 1000 < Date.now();

    if (isExpired) {
      throw new Error('El enlace de invitación ha caducado. Los enlaces tienen una validez de 7 días.');
    }
  }

  let targetGroupId: string | null = invite?.group_id ?? null;

  // If still not found, check if the token itself is a valid group_id
  if (!targetGroupId) {
    const { data: directGroup } = await db
      .from('groups')
      .select('id, name')
      .eq('id', cleanToken)
      .maybeSingle();

    if (directGroup) {
      targetGroupId = directGroup.id;
    }
  }

  // 3. Unify and claim ALL temporary profiles for this user (including invitee_profile_id and email matches)
  const tempProfileId = invite?.invitee_profile_id;
  await claimAllTempProfilesForUser(db, user, tempProfileId);

  if (!targetGroupId) {
    // Check if user is already a member of any group matching
    const { data: existingMembership } = await db
      .from('group_members')
      .select('group_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (existingMembership) {
      return {
        success: true,
        groupId: existingMembership.group_id,
        message: 'Ya formas parte de este grupo',
      };
    }

    throw new Error('Invitación no encontrada o expirada');
  }

  // 4. GUARANTEE that user is present in group_members for targetGroupId
  const { data: alreadyMember } = await db
    .from('group_members')
    .select('group_id')
    .eq('group_id', targetGroupId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!alreadyMember) {
    const inviterId = invite?.invited_by ?? user.id;
    await db.from('group_members').insert({
      group_id: targetGroupId,
      user_id: user.id,
      invited_by: inviterId,
      role: 'member',
    });
  }

  // 5. Update group_invites record if it was an individual invite (with specific email or designated profile)
  const isDedicatedInvite = Boolean(invite?.invitee_profile_id || (invite?.email && invite.email !== 'invite@link.deudita.app'));
  if (invite?.id && isDedicatedInvite) {
    await db
      .from('group_invites')
      .update({
        status: 'accepted',
        invitee_profile_id: user.id,
      })
      .eq('id', invite.id);
  }

  // Also accept any pending individual invites for this group matching the user email
  if (userEmailLower) {
    await db
      .from('group_invites')
      .update({
        status: 'accepted',
        invitee_profile_id: user.id,
      })
      .eq('group_id', targetGroupId)
      .ilike('email', userEmailLower)
      .eq('status', 'pending');
  }

  // 6. Get group details for response and notification
  const { data: groupDetails } = await db
    .from('groups')
    .select('name')
    .eq('id', targetGroupId)
    .maybeSingle();

  const groupName = groupDetails?.name ?? 'Grupo';

  // 7. Add notification to user
  try {
    await db.from('notifications').insert({
      user_id: user.id,
      type: 'group_invite',
      title: '¡Te has unido al grupo!',
      message: `Te has unido exitosamente al grupo "${groupName}".`,
      data: { group_id: targetGroupId, invite_id: invite?.id },
    });
  } catch (notifErr) {
    console.warn('[claimAndJoinGroupInvite] Could not create notification:', notifErr);
  }

  return {
    success: true,
    groupId: targetGroupId,
    groupName,
    message: `Te has unido a "${groupName}" exitosamente`,
  };
}
