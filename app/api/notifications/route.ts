import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ notifications: [], pendingInvites: [] });
    }

    // Fetch user notifications
    const { data: notifications } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    // Fetch pending group invites for user email
    let pendingInvites: any[] = [];
    if (user.email) {
      const { data: invites } = await supabase
        .from('group_invites')
        .select('*, group:groups(*), inviter:profiles!group_invites_invited_by_fkey(*)')
        .eq('email', user.email.toLowerCase())
        .eq('status', 'pending');

      if (invites) {
        pendingInvites = invites;
      }
    }

    return NextResponse.json({
      notifications: notifications || [],
      pendingInvites,
    });
  } catch (err: unknown) {
    console.error('[API GET /api/notifications] Error:', err);
    return NextResponse.json({ notifications: [], pendingInvites: [] });
  }
}

export async function PATCH(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { notificationId, markAll } = await req.json().catch(() => ({}));

    if (markAll) {
      await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', user.id);
    } else if (notificationId) {
      await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', notificationId)
        .eq('user_id', user.id);
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error('[API PATCH /api/notifications] Error:', err);
    const message = err instanceof Error ? err.message : 'Error al actualizar notificaciones';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
