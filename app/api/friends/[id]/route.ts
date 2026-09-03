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

    // IMPORTANT: Deleting a friend only removes them from the 1:1 friends list.
    // It MUST NEVER remove the user from group memberships (group_members) or delete group expenses/balances!

    // Check if the friend is part of any group memberships
    const { data: friendMemberships } = await db
      .from('group_members')
      .select('group_id')
      .eq('user_id', friendId);

    const hasGroupMemberships = Boolean(friendMemberships && friendMemberships.length > 0);

    // Check if friend has any associated expense splits, expenses or payments
    const { data: friendSplits } = await db
      .from('expense_splits')
      .select('id')
      .eq('user_id', friendId)
      .limit(1);

    const { data: friendExpenses } = await db
      .from('expenses')
      .select('id')
      .eq('paid_by', friendId)
      .limit(1);

    const { data: friendPayments } = await db
      .from('payments')
      .select('id')
      .or(`paid_by.eq.${friendId},paid_to.eq.${friendId}`)
      .limit(1);

    const hasFinancialRecords = Boolean(
      (friendSplits && friendSplits.length > 0) ||
      (friendExpenses && friendExpenses.length > 0) ||
      (friendPayments && friendPayments.length > 0)
    );

    // Check if the friend profile is a temporary standalone profile created by current user
    const { data: friendProfile } = await db
      .from('profiles')
      .select('id, email, is_temp, created_by')
      .eq('id', friendId)
      .maybeSingle();

    const isTempCreatedByMe = Boolean(
      friendProfile?.is_temp &&
      (friendProfile?.created_by === user.id || !friendProfile?.created_by)
    );

    // If it is an isolated temporary profile with NO group memberships and NO financial records, delete the orphan profile
    if (isTempCreatedByMe && !hasGroupMemberships && !hasFinancialRecords) {
      await db
        .from('group_invites')
        .delete()
        .eq('invitee_profile_id', friendId)
        .eq('invited_by', user.id);

      await db
        .from('managed_users')
        .delete()
        .or(`sponsor_id.eq.${friendId},managed_user_id.eq.${friendId}`);

      await db.from('profiles').delete().eq('id', friendId);
    }

    // Always add to current user's hidden_friend_ids in auth metadata so they are removed from 1:1 friends list
    const currentHidden: string[] = user.user_metadata?.hidden_friend_ids || [];
    if (!currentHidden.includes(friendId)) {
      const newHidden = [...currentHidden, friendId];
      try {
        await supabase.auth.updateUser({
          data: {
            ...user.user_metadata,
            hidden_friend_ids: newHidden,
          },
        });
      } catch (metaErr) {
        console.warn('[API DELETE /api/friends/[id]] Warning updating user_metadata:', metaErr);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Amigo eliminado de la lista de amigos correctamente',
    });
  } catch (err: unknown) {
    console.error('[API DELETE /api/friends/[id]] Error:', err);
    const message = err instanceof Error ? err.message : 'Error al eliminar amigo';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
