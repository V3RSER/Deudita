import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { calculatePairwiseBalances } from '@/lib/balance-utils';

export async function GET(
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

    // 1. Fetch friend profile
    const { data: friendProfile, error: profileErr } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', friendId)
      .single();

    if (profileErr || !friendProfile) {
      return NextResponse.json({ error: 'Perfil de amigo no encontrado' }, { status: 404 });
    }

    // 2. Fetch current user groups and members
    const { data: userMemberships } = await supabase
      .from('group_members')
      .select('group_id, role')
      .eq('user_id', user.id);

    const userGroupIds = userMemberships ? userMemberships.map((m) => m.group_id) : [];

    // 3. Find shared group IDs
    const { data: friendMemberships } = await supabase
      .from('group_members')
      .select('group_id, role')
      .eq('user_id', friendId)
      .in('group_id', userGroupIds.length > 0 ? userGroupIds : ['none']);

    const sharedGroupIds = friendMemberships ? friendMemberships.map((m) => m.group_id) : [];

    // Fetch shared group details
    let sharedGroups: any[] = [];
    if (sharedGroupIds.length > 0) {
      const { data: groupsData } = await supabase
        .from('groups')
        .select('*')
        .in('id', sharedGroupIds);

      const { data: allMembersData } = await supabase
        .from('group_members')
        .select('group_id')
        .in('group_id', sharedGroupIds);

      sharedGroups = (groupsData || []).map((g) => {
        const count = (allMembersData || []).filter((m) => m.group_id === g.id).length;
        return {
          ...g,
          member_count: count,
        };
      });
    }

    // 4. Fetch expenses and payments in shared groups
    let sharedExpenses: any[] = [];
    let sharedPayments: any[] = [];
    let sharedSettlements: any[] = [];

    if (sharedGroupIds.length > 0) {
      const { data: expensesData } = await supabase
        .from('expenses')
        .select('*, items:expense_items(*), splits:expense_splits(*)')
        .in('group_id', sharedGroupIds)
        .order('created_at', { ascending: false });

      const { data: paymentsData } = await supabase
        .from('payments')
        .select('*')
        .in('group_id', sharedGroupIds)
        .order('created_at', { ascending: false });

      const { data: settlementsData } = await supabase
        .from('settlements')
        .select('*')
        .in('group_id', sharedGroupIds)
        .order('settled_at', { ascending: false });

      sharedExpenses = expensesData || [];
      sharedPayments = paymentsData || [];
      sharedSettlements = settlementsData || [];
    }

    // 5. Calculate pairwise balance with this friend
    const { data: profiles } = await supabase.from('profiles').select('*');
    const pairwise = calculatePairwiseBalances(
      sharedExpenses,
      sharedPayments,
      profiles || [],
      undefined,
      sharedSettlements
    );

    const friendOwesMe = pairwise.find(
      (b) => b.debtor.id === friendId && b.creditor.id === user.id
    );
    const iOweFriend = pairwise.find(
      (b) => b.debtor.id === user.id && b.creditor.id === friendId
    );

    let netBalance = 0;
    if (friendOwesMe) netBalance += friendOwesMe.amount;
    if (iOweFriend) netBalance -= iOweFriend.amount;

    return NextResponse.json({
      friendProfile,
      netBalance,
      sharedGroups,
      expensesCount: sharedExpenses.length,
      recentExpenses: sharedExpenses.slice(0, 10),
    });
  } catch (err: unknown) {
    console.error('[API GET /api/friends/[id]/summary] Error:', err);
    const message = err instanceof Error ? err.message : 'Error al obtener resumen de amigo';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
