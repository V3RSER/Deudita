import { SupabaseClient, User } from '@supabase/supabase-js';
import { sendGroupInviteEmail } from './email';

interface ClaimResult {
  success: boolean;
  groupId: string;
  groupName?: string;
  message?: string;
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

  // 1. Ensure user profile exists in profiles table
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
    .select('id, group_id, email, status, token, invited_by, invitee_profile_id')
    .eq('token', cleanToken)
    .maybeSingle();

  if (inviteByToken) {
    invite = inviteByToken;
  } else {
    // By id
    const { data: inviteById } = await db
      .from('group_invites')
      .select('id, group_id, email, status, token, invited_by, invitee_profile_id')
      .eq('id', cleanToken)
      .maybeSingle();

    if (inviteById) {
      invite = inviteById;
    } else if (userEmailLower) {
      // By email match
      const { data: inviteByEmail } = await db
        .from('group_invites')
        .select('id, group_id, email, status, token, invited_by, invitee_profile_id')
        .eq('email', userEmailLower)
        .eq('status', 'pending')
        .maybeSingle();

      if (inviteByEmail) {
        invite = inviteByEmail;
      }
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

  // 3. If there is a temporary profile linked to this invite, migrate all records to real user.id
  const tempProfileId = invite?.invitee_profile_id;
  if (tempProfileId && tempProfileId !== user.id) {
    // Try calling DB procedure first if available
    try {
      await db.rpc('claim_temp_profile', {
        temp_id: tempProfileId,
        real_id: user.id,
      });
    } catch {
      // Manual fallback migration
    }

    // Direct database migration
    // A) Group Members: reassign membership
    const { data: existingRealMember } = await db
      .from('group_members')
      .select('group_id')
      .eq('group_id', targetGroupId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!existingRealMember) {
      await db
        .from('group_members')
        .update({ user_id: user.id })
        .eq('user_id', tempProfileId)
        .eq('group_id', targetGroupId);
    }
    await db.from('group_members').delete().eq('user_id', tempProfileId);

    // B) Reassign invited_by, group owner, expenses, splits, payments, notifications
    await db.from('group_members').update({ invited_by: user.id }).eq('invited_by', tempProfileId);
    await db.from('groups').update({ owner_id: user.id }).eq('owner_id', tempProfileId);
    await db.from('expenses').update({ paid_by: user.id }).eq('paid_by', tempProfileId);
    await db.from('expenses').update({ created_by: user.id }).eq('created_by', tempProfileId);

    // Expense splits: update user_id or delete duplicates
    await db.from('expense_splits').update({ user_id: user.id }).eq('user_id', tempProfileId);
    await db.from('payments').update({ paid_by: user.id }).eq('paid_by', tempProfileId);
    await db.from('payments').update({ paid_to: user.id }).eq('paid_to', tempProfileId);
    await db.from('notifications').update({ user_id: user.id }).eq('user_id', tempProfileId);

    // C) Delete temporary profile
    await db.from('profiles').delete().eq('id', tempProfileId).eq('is_temp', true);
  }

  // 4. GUARANTEE that user is present in group_members for targetGroupId
  const { data: membershipCheck } = await db
    .from('group_members')
    .select('group_id')
    .eq('group_id', targetGroupId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!membershipCheck) {
    const inviterId = invite?.invited_by ?? user.id;
    await db.from('group_members').insert({
      group_id: targetGroupId,
      user_id: user.id,
      invited_by: inviterId,
      role: 'member',
    });
  }

  // 5. Update group_invites record to accepted
  if (invite?.id) {
    await db
      .from('group_invites')
      .update({
        status: 'accepted',
        invitee_profile_id: user.id,
      })
      .eq('id', invite.id);
  }

  // Also accept any pending invites for this group matching the user email or profile id
  if (userEmailLower) {
    await db
      .from('group_invites')
      .update({
        status: 'accepted',
        invitee_profile_id: user.id,
      })
      .eq('group_id', targetGroupId)
      .eq('email', userEmailLower)
      .eq('status', 'pending');
  }

  // 6. Get group details for notification
  const { data: groupDetails } = await db
    .from('groups')
    .select('name')
    .eq('id', targetGroupId)
    .maybeSingle();

  const groupName = groupDetails?.name ?? 'Grupo';

  // 7. Add notification to user
  await db.from('notifications').insert({
    user_id: user.id,
    type: 'group_invite',
    title: '¡Te has unido al grupo!',
    message: `Te has unido exitosamente al grupo "${groupName}".`,
    data: { group_id: targetGroupId, invite_id: invite?.id },
  });

  return {
    success: true,
    groupId: targetGroupId,
    groupName,
    message: `Te has unido a "${groupName}" exitosamente`,
  };
}
