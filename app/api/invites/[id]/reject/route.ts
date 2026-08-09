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
      return NextResponse.json({ error: 'Debes iniciar sesión para rechazar la invitación' }, { status: 401 });
    }

    // Mark invite status as rejected
    const { error: inviteErr } = await supabase
      .from('group_invites')
      .update({ status: 'rejected' })
      .eq('id', inviteId);

    if (inviteErr) {
      console.error('[API /api/invites/[id]/reject] Error al rechazar invitación:', inviteErr);
      return NextResponse.json({ error: inviteErr.message }, { status: 500 });
    }

    // Mark related notifications as read
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', user.id)
      .filter('data->>invite_id', 'eq', inviteId);

    return NextResponse.json({
      success: true,
      message: 'Invitación rechazada',
    });
  } catch (err: unknown) {
    console.error('[API POST /api/invites/[id]/reject] Error:', err);
    const message = err instanceof Error ? err.message : 'Error al rechazar la invitación';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
