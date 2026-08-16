import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { claimAndJoinGroupInvite } from '@/lib/invite-utils';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const inviteId = resolvedParams.id;

    if (!inviteId) {
      return NextResponse.json({ error: 'ID o token de invitación requerido' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ error: 'Debes iniciar sesión para unirte al grupo' }, { status: 401 });
    }

    const result = await claimAndJoinGroupInvite(supabase, inviteId, user);

    return NextResponse.json({
      success: true,
      groupId: result.groupId,
      groupName: result.groupName,
      message: result.message ?? 'Te has unido al grupo exitosamente',
    });
  } catch (err: unknown) {
    console.error('[API POST /api/invites/[id]/accept] Error:', err);
    const message = err instanceof Error ? err.message : 'Error al aceptar la invitación';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

