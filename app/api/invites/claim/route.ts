import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { claimAndJoinGroupInvite } from '@/lib/invite-utils';

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

    const result = await claimAndJoinGroupInvite(supabase, token, user);

    return NextResponse.json({
      success: true,
      groupId: result.groupId,
      groupName: result.groupName,
      message: result.message ?? 'Te has unido al grupo exitosamente',
    });
  } catch (err: unknown) {
    console.error('[API /api/invites/claim] Error:', err);
    const message = err instanceof Error ? err.message : 'Error al reclamar la invitación';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

