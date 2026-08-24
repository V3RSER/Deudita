import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    const resolvedParams = await params;
    const groupId = resolvedParams.id;

    if (authErr || !user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    if (!groupId) {
      return NextResponse.json({ error: 'ID de grupo requerido' }, { status: 400 });
    }

    // Verify user is a member or owner of the group
    const { data: member, error: memberErr } = await supabase
      .from('group_members')
      .select('group_id')
      .eq('group_id', groupId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (memberErr || !member) {
      // Check if user is the group owner
      const { data: group, error: groupErr } = await supabase
        .from('groups')
        .select('owner_id')
        .eq('id', groupId)
        .maybeSingle();

      if (groupErr || !group || group.owner_id !== user.id) {
        return NextResponse.json({ error: 'No tienes acceso a este grupo' }, { status: 403 });
      }
    }

    const { searchParams } = new URL(req.url);
    const limit = Math.min(Math.max(1, parseInt(searchParams.get('limit') || '20', 10)), 100);
    const offset = Math.max(0, parseInt(searchParams.get('offset') || '0', 10));
    const category = searchParams.get('category');
    const search = searchParams.get('search');

    let query = supabase
      .from('expenses')
      .select('*, items:expense_items(*), splits:expense_splits(*)', { count: 'exact' })
      .eq('group_id', groupId)
      .order('expense_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (category && category !== 'all') {
      query = query.eq('category', category);
    }

    if (search && search.trim().length > 0) {
      query = query.ilike('description', `%${search.trim()}%`);
    }

    const { data: expenses, count, error: fetchErr } = await query.range(offset, offset + limit - 1);

    if (fetchErr) {
      console.error('[API GET /api/groups/:id/expenses] Error querying expenses:', fetchErr);
      return NextResponse.json({ error: fetchErr.message || 'Error al obtener gastos' }, { status: 500 });
    }

    const totalCount = count ?? 0;
    const hasMore = offset + (expenses?.length || 0) < totalCount;
    const nextOffset = offset + (expenses?.length || 0);

    return NextResponse.json({
      expenses: expenses || [],
      totalCount,
      hasMore,
      nextOffset,
      limit,
      offset,
    });
  } catch (err: unknown) {
    console.error('[API GET /api/groups/:id/expenses] Unhandled error:', err);
    const msg = err instanceof Error ? err.message : 'Error interno del servidor';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
