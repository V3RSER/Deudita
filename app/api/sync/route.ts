import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const db = createAdminClient();

    // 1. Current user profile
    const { data: userProfile } = await db
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    // 2. User's group memberships
    const { data: userMemberships } = await db
      .from('group_members')
      .select('group_id')
      .eq('user_id', user.id);

    const userGroupIds = Array.from(new Set((userMemberships || []).map((m) => m.group_id)));

    // 3. Groups
    let groups: any[] = [];
    if (userGroupIds.length > 0) {
      const { data: groupData } = await db
        .from('groups')
        .select('*')
        .in('id', userGroupIds)
        .order('created_at', { ascending: false });
      groups = groupData || [];
    }

    // 4. All members for these groups
    let members: any[] = [];
    if (userGroupIds.length > 0) {
      const { data: memberData } = await db
        .from('group_members')
        .select('*')
        .in('group_id', userGroupIds);
      members = memberData || [];
    }

    // Member user IDs to fetch relevant profiles
    const memberUserIds = Array.from(new Set([user.id, ...members.map((m) => m.user_id)]));

    // 5. Profiles of members
    let profiles: any[] = [];
    if (memberUserIds.length > 0) {
      const { data: profileData } = await db
        .from('profiles')
        .select('*')
        .in('id', memberUserIds);
      profiles = profileData || [];
    }

    // Ensure current profile is present or created
    let profile = userProfile;
    if (!profile) {
      const meta = user.user_metadata ?? {};
      const fullName = meta.full_name ?? meta.name ?? (user.email ? user.email.split('@')[0] : 'Usuario');
      const avatarUrl = meta.avatar_url ?? meta.picture ?? '';
      
      const newProf = {
        id: user.id,
        email: user.email ?? '',
        full_name: fullName,
        avatar_url: avatarUrl,
        is_temp: false,
      };

      await db.from('profiles').upsert(newProf);
      profile = newProf;
      if (!profiles.some((p) => p.id === user.id)) {
        profiles.push(newProf);
      }
    }

    // 6. Expenses
    let expenses: any[] = [];
    if (userGroupIds.length > 0) {
      const { data: expenseData } = await db
        .from('expenses')
        .select('*, items:expense_items(*), splits:expense_splits(*)')
        .in('group_id', userGroupIds)
        .order('created_at', { ascending: false });
      expenses = expenseData || [];
    }

    // 7. Payments
    let payments: any[] = [];
    if (userGroupIds.length > 0) {
      const { data: paymentData } = await db
        .from('payments')
        .select('*')
        .in('group_id', userGroupIds)
        .order('created_at', { ascending: false });
      payments = paymentData || [];
    }

    // 8. Expense Drafts
    const { data: draftsData } = await db
      .from('expense_drafts')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    // 9. Notifications
    const { data: notificationsData } = await db
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    // 10. Pending invites for user (by profile id or email)
    const { data: inviteData } = await db
      .from('group_invites')
      .select('*, groups(name)')
      .or(`invitee_profile_id.eq.${user.id},email.eq.${user.email?.toLowerCase() || ''}`)
      .eq('status', 'pending');

    const pendingInvites = (inviteData || []).map((inv: any) => ({
      ...inv,
      group_name: inv.groups?.name || 'Grupo',
    }));

    return NextResponse.json({
      profile,
      profiles,
      groups,
      members,
      expenses,
      payments,
      drafts: draftsData || [],
      notifications: notificationsData || [],
      pendingInvites,
    });
  } catch (error: any) {
    console.error('[API /api/sync] Error:', error);
    return NextResponse.json({ error: 'Error al sincronizar los datos' }, { status: 500 });
  }
}
