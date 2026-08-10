import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ error: 'Debes iniciar sesión para reclamar la invitación' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const token = body.token || body.invite_token || new URL(req.url).searchParams.get('token');

    if (!token) {
      return NextResponse.json({ error: 'Token de invitación no proporcionado' }, { status: 400 });
    }

    const db = process.env.SUPABASE_SERVICE_ROLE_KEY ? createAdminClient() : supabase;

    // Find pending invite by token or by id
    let invite: any = null;

    const { data: inviteByToken } = await db
      .from('group_invites')
      .select('id, group_id, invitee_profile_id, status, invited_by')
      .eq('token', token)
      .eq('status', 'pending')
      .maybeSingle();

    if (inviteByToken) {
      invite = inviteByToken;
    } else {
      const { data: inviteById } = await db
        .from('group_invites')
        .select('id, group_id, invitee_profile_id, status, invited_by')
        .eq('id', token)
        .eq('status', 'pending')
        .maybeSingle();
      invite = inviteById;
    }

    if (!invite) {
      // Check if user is already in group
      const { data: existingMember } = await db
        .from('group_members')
        .select('group_id')
        .eq('user_id', user.id)
        .maybeSingle();

      return NextResponse.json({
        success: true,
        groupId: existingMember?.group_id,
        message: 'La invitación ya fue aceptada o procesada',
      });
    }

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

      // Ensure user profile is properly upserted as non-temp
      const fullName = user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'Usuario';
      const avatarUrl = user.user_metadata?.avatar_url || user.user_metadata?.picture || '';

      await db.from('profiles').upsert({
        id: user.id,
        email: user.email,
        full_name: fullName,
        avatar_url: avatarUrl,
        is_temp: false,
      }, { onConflict: 'id' });

      // Delete the temporary profile
      await db.from('profiles').delete().eq('id', tempProfileId);
    } else {
      // Standard invite: ensure user is in group_members
      const { data: existingMember } = await db
        .from('group_members')
        .select('group_id')
        .eq('group_id', invite.group_id)
        .eq('user_id', user.id)
        .maybeSingle();

      if (!existingMember) {
        await db.from('group_members').insert({
          group_id: invite.group_id,
          user_id: user.id,
          invited_by: invite.invited_by,
          role: 'member',
        });
      }
    }

    // Mark invite as accepted
    await db.from('group_invites').update({ status: 'accepted' }).eq('id', invite.id);

    return NextResponse.json({
      success: true,
      groupId: invite.group_id,
      message: 'Te has unido al grupo exitosamente',
    });
  } catch (err: unknown) {
    console.error('[API /api/invites/claim] Error:', err);
    const message = err instanceof Error ? err.message : 'Error al reclamar la invitación';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
