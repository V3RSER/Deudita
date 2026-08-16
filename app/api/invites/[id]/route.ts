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
      return NextResponse.json({ error: 'ID o Token de invitación no proporcionado' }, { status: 400 });
    }

    const supabase = await createClient();
    const db = supabase;

    // Try finding invite by token first, then by id
    let invite: any = null;

    const { data: inviteByToken } = await db
      .from('group_invites')
      .select('id, group_id, email, status, token, created_at, invited_by, invitee_profile_id')
      .eq('token', inviteId)
      .maybeSingle();

    if (inviteByToken) {
      invite = inviteByToken;
    } else {
      const { data: inviteById } = await db
        .from('group_invites')
        .select('id, group_id, email, status, token, created_at, invited_by, invitee_profile_id')
        .eq('id', inviteId)
        .maybeSingle();
      invite = inviteById;
    }

    if (!invite) {
      return NextResponse.json({ error: 'Invitación no encontrada o no válida' }, { status: 404 });
    }

    // Calculate expiration (7 days from creation)
    const createdAtMs = invite.created_at ? new Date(invite.created_at).getTime() : Date.now();
    const computedExpiresAt = new Date(createdAtMs + 7 * 24 * 60 * 60 * 1000).toISOString();

    const isExpired = new Date(computedExpiresAt).getTime() < Date.now();

    if (isExpired) {
      return NextResponse.json(
        {
          error: 'Este enlace de invitación ha caducado. Los enlaces tienen una validez de 7 días.',
          isExpired: true,
          expiresAt: computedExpiresAt,
        },
        { status: 410 }
      );
    }

    // Fetch group details
    const { data: group } = await db
      .from('groups')
      .select('id, name, category, description, image_url')
      .eq('id', invite.group_id)
      .maybeSingle();

    // Fetch inviter profile
    const { data: inviter } = await db
      .from('profiles')
      .select('id, full_name, email, avatar_url')
      .eq('id', invite.invited_by)
      .maybeSingle();

    // Fetch invitee profile if present
    let inviteeProfile = null;
    if (invite.invitee_profile_id) {
      const { data: invitee } = await db
        .from('profiles')
        .select('id, full_name, email')
        .eq('id', invite.invitee_profile_id)
        .maybeSingle();
      inviteeProfile = invitee;
    }

    const isGeneralLink = !invite.invitee_profile_id && (!invite.email || invite.email === 'invite@link.deudita.app');

    return NextResponse.json({
      invite: {
        id: invite.id,
        token: invite.token,
        status: invite.status,
        email: invite.email,
        inviteeProfileId: invite.invitee_profile_id,
        createdAt: invite.created_at,
        expiresAt: computedExpiresAt,
        isExpired: false,
        isGeneralLink,
      },
      group: group ?? { name: 'Grupo' },
      inviter: inviter ?? { full_name: 'Un integrante' },
      invitee: inviteeProfile,
    });
  } catch (err: unknown) {
    console.error('[API GET /api/invites/[id]] Error:', err);
    const message = err instanceof Error ? err.message : 'Error al obtener la invitación';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
