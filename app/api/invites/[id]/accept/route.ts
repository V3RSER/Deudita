import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const inviteId = resolvedParams.id;

    const supabase = await createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ error: 'Debes iniciar sesión para aceptar la invitación' }, { status: 401 });
    }

    // Fetch the invite
    const { data: invite, error: inviteErr } = await supabase
      .from('group_invites')
      .select('*')
      .eq('id', inviteId)
      .single();

    if (inviteErr || !invite) {
      return NextResponse.json({ error: 'La invitación no existe o no se encontró' }, { status: 404 });
    }

    const groupId = invite.group_id;

    // Check if there is a temporary profile in this group matching the invite email or user email
    const { data: groupMembersWithProfiles } = await supabase
      .from('group_members')
      .select('user_id, profiles(id, email)')
      .eq('group_id', groupId);

    const targetInviteEmail = invite.email ? invite.email.toLowerCase() : '';
    const realUserEmail = user.email ? user.email.toLowerCase() : '';

    let tempUserIdToMerge: string | null = null;

    if (groupMembersWithProfiles) {
      for (const gm of groupMembersWithProfiles) {
        const prof = Array.isArray(gm.profiles) ? gm.profiles[0] : gm.profiles;
        if (!prof || prof.id === user.id) continue;

        const pEmail = prof.email ? prof.email.toLowerCase() : '';
        if (
          (targetInviteEmail && pEmail === targetInviteEmail) ||
          (realUserEmail && pEmail === realUserEmail) ||
          pEmail.includes(`temp_${groupId}`)
        ) {
          tempUserIdToMerge = prof.id;
          break;
        }
      }
    }

    // Merge temporary member if found
    if (tempUserIdToMerge && tempUserIdToMerge !== user.id) {
      // Fetch expense IDs for this group
      const { data: groupExpenses } = await supabase
        .from('expenses')
        .select('id')
        .eq('group_id', groupId);

      const groupExpenseIds = (groupExpenses || []).map((e) => e.id);

      // Reassign paid_by & created_by
      await supabase
        .from('expenses')
        .update({ paid_by: user.id })
        .eq('group_id', groupId)
        .eq('paid_by', tempUserIdToMerge);

      await supabase
        .from('expenses')
        .update({ created_by: user.id })
        .eq('group_id', groupId)
        .eq('created_by', tempUserIdToMerge);

      // Reassign expense splits
      if (groupExpenseIds.length > 0) {
        await supabase
          .from('expense_splits')
          .update({ user_id: user.id })
          .in('expense_id', groupExpenseIds)
          .eq('user_id', tempUserIdToMerge);
      }

      // Reassign payments
      await supabase
        .from('payments')
        .update({ payer_id: user.id })
        .eq('group_id', groupId)
        .eq('payer_id', tempUserIdToMerge);

      await supabase
        .from('payments')
        .update({ payee_id: user.id })
        .eq('group_id', groupId)
        .eq('payee_id', tempUserIdToMerge);

      // Remove temp user from group_members
      await supabase
        .from('group_members')
        .delete()
        .eq('group_id', groupId)
        .eq('user_id', tempUserIdToMerge);
    }

    // Add user to group_members
    const { error: memberErr } = await supabase
      .from('group_members')
      .upsert(
        {
          group_id: groupId,
          user_id: user.id,
          invited_by: invite.invited_by,
          role: 'member',
        },
        { onConflict: 'group_id,user_id' }
      );

    if (memberErr) {
      console.error('[API /api/invites/[id]/accept] Error al agregar miembro:', memberErr);
      return NextResponse.json({ error: memberErr.message }, { status: 500 });
    }

    // Mark invite status as accepted
    await supabase
      .from('group_invites')
      .update({ status: 'accepted' })
      .eq('id', inviteId);

    // Mark related notifications as read
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', user.id)
      .filter('data->>invite_id', 'eq', inviteId);

    return NextResponse.json({
      success: true,
      groupId: invite.group_id,
      message: 'Te has unido al grupo exitosamente',
    });
  } catch (err: unknown) {
    console.error('[API POST /api/invites/[id]/accept] Error:', err);
    const message = err instanceof Error ? err.message : 'Error al aceptar la invitación';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
