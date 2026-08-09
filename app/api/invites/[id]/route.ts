import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const inviteId = resolvedParams.id;

    if (!inviteId) {
      return NextResponse.json({ error: 'ID de invitación no proporcionado' }, { status: 400 });
    }

    const supabase = await createClient();

    // Fetch invite with group and inviter details
    const { data: invite, error: inviteErr } = await supabase
      .from('group_invites')
      .select('id, group_id, email, status, created_at, invited_by')
      .eq('id', inviteId)
      .maybeSingle();

    if (inviteErr || !invite) {
      return NextResponse.json({ error: 'Invitación no encontrada o expirada' }, { status: 404 });
    }

    // Fetch group details
    const { data: group } = await supabase
      .from('groups')
      .select('id, name, category, description')
      .eq('id', invite.group_id)
      .single();

    // Fetch inviter profile
    const { data: inviter } = await supabase
      .from('profiles')
      .select('id, full_name, email, avatar_url')
      .eq('id', invite.invited_by)
      .single();

    return NextResponse.json({
      invite: {
        id: invite.id,
        status: invite.status,
        email: invite.email,
        createdAt: invite.created_at,
      },
      group: group || { name: 'Grupo' },
      inviter: inviter || { full_name: 'Un integrante' },
    });
  } catch (err: unknown) {
    console.error('[API GET /api/invites/[id]] Error:', err);
    const message = err instanceof Error ? err.message : 'Error al obtener la invitación';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
