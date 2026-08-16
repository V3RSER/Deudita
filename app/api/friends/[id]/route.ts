import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const friendId = resolvedParams.id;

    const supabase = await createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    if (!friendId) {
      return NextResponse.json({ error: 'Falta el ID del amigo' }, { status: 400 });
    }

    const db = supabase;

    // 1. Get all group IDs where current user is a member or owner
    const { data: userMemberships } = await db
      .from('group_members')
      .select('group_id')
      .eq('user_id', user.id);

    const { data: userOwnedGroups } = await db
      .from('groups')
      .select('id')
      .eq('owner_id', user.id);

    const groupIdsSet = new Set<string>();
    if (userMemberships) userMemberships.forEach((m) => groupIdsSet.add(m.group_id));
    if (userOwnedGroups) userOwnedGroups.forEach((g) => groupIdsSet.add(g.id));

    const groupIds = Array.from(groupIdsSet);

    // 2. Remove friend from shared groups
    if (groupIds.length > 0) {
      await db
        .from('group_members')
        .delete()
        .eq('user_id', friendId)
        .in('group_id', groupIds);
    }

    // Also remove friend where invited_by = user.id
    await db
      .from('group_members')
      .delete()
      .eq('user_id', friendId)
      .eq('invited_by', user.id);

    // Also remove pending invitations for this friend invited by current user
    await db
      .from('group_invites')
      .delete()
      .eq('invitee_profile_id', friendId)
      .eq('invited_by', user.id);

    // 3. If friend is a temporary profile and has no remaining memberships, clean up profile
    const { data: friendProfile } = await db
      .from('profiles')
      .select('email, is_temp')
      .eq('id', friendId)
      .maybeSingle();

    if (friendProfile) {
      const isTemp = Boolean(
        friendProfile.is_temp ||
        (friendProfile.email && (friendProfile.email.startsWith('temp_') || friendProfile.email.includes('@deudita.app')))
      );

      if (isTemp) {
        const { data: remainingMemberships } = await db
          .from('group_members')
          .select('group_id')
          .eq('user_id', friendId);

        if (!remainingMemberships || remainingMemberships.length === 0) {
          await db.from('profiles').delete().eq('id', friendId);
        }
      }
    }

    return NextResponse.json({ success: true, message: 'Amigo eliminado correctamente' });
  } catch (err: unknown) {
    console.error('[API DELETE /api/friends/[id]] Error:', err);
    const message = err instanceof Error ? err.message : 'Error al eliminar amigo';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
