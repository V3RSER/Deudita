import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';

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

    const db = process.env.SUPABASE_SERVICE_ROLE_KEY ? createAdminClient() : supabase;

    // Fetch the invite by token or by id
    let invite: any = null;

    const { data: inviteByToken } = await db
      .from('group_invites')
      .select('*')
      .eq('token', inviteId)
      .maybeSingle();

    if (inviteByToken) {
      invite = inviteByToken;
    } else {
      const { data: inviteById } = await db
        .from('group_invites')
        .select('*')
        .eq('id', inviteId)
        .maybeSingle();
      invite = inviteById;
    }

    if (!invite) {
      return NextResponse.json({ error: 'La invitación no existe o no se encontró' }, { status: 404 });
    }

    const groupId = invite.group_id;
    const tempProfileId = invite.invitee_profile_id;

    if (tempProfileId && tempProfileId !== user.id) {
      // Reclaim references from tempProfileId to real user.id
      await db.from('group_members').update({ user_id: user.id }).eq('user_id', tempProfileId);
      await db.from('group_members').update({ invited_by: user.id }).eq('invited_by', tempProfileId);
      await db.from('groups').update({ owner_id: user.id }).eq('owner_id', tempProfileId);
      await db.from('expenses').update({ paid_by: user.id }).eq('paid_by', tempProfileId);
      await db.from('expenses').update({ created_by: user.id }).eq('created_by', tempProfileId);
      await db.from('expense_splits').update({ user_id: user.id }).eq('user_id', tempProfileId);
      await db.from('payments').update({ paid_by: user.id }).eq('paid_by', tempProfileId);
      await db.from('payments').update({ paid_to: user.id }).eq('paid_to', tempProfileId);
      await db.from('notifications').update({ user_id: user.id }).eq('user_id', tempProfileId);

      // Ensure user profile is properly upserted
      const fullName = user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'Usuario';
      const avatarUrl = user.user_metadata?.avatar_url || user.user_metadata?.picture || '';

      await db.from('profiles').upsert({
        id: user.id,
        email: user.email,
        full_name: fullName,
        avatar_url: avatarUrl,
        is_temp: false,
      }, { onConflict: 'id' });

      // Delete temporary profile
      await db.from('profiles').delete().eq('id', tempProfileId);
    } else {
      // Standard member insertion
      const { data: existingMember } = await db
        .from('group_members')
        .select('group_id')
        .eq('group_id', groupId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (!existingMember) {
        await db.from('group_members').insert({
          group_id: groupId,
          user_id: user.id,
          invited_by: invite.invited_by,
          role: 'member',
        });
      }
    }

    // Mark invite status as accepted
    await db
      .from('group_invites')
      .update({ status: 'accepted' })
      .eq('id', invite.id);

    // Mark related notifications as read
    await db
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', user.id)
      .filter('data->>invite_id', 'eq', invite.id);

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
