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
    const { data: { user } } = await supabase.auth.getUser();

    // 1. Try finding invite by token or id
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
      // Check if the id is a direct group id
      const { data: directGroup } = await db
        .from('groups')
        .select('id, name, category, description, image_url, owner_id')
        .eq('id', inviteId)
        .maybeSingle();

      if (directGroup) {
        let inviterProfile = null;
        if (directGroup.owner_id) {
          const { data: inviter } = await db
            .from('profiles')
            .select('id, full_name, email, avatar_url')
            .eq('id', directGroup.owner_id)
            .maybeSingle();
          inviterProfile = inviter;
        }

        let isAlreadyMember = false;
        if (user && directGroup.id) {
          const { data: memberRecord } = await db
            .from('group_members')
            .select('group_id')
            .eq('group_id', directGroup.id)
            .eq('user_id', user.id)
            .maybeSingle();
          if (memberRecord) {
            isAlreadyMember = true;
          }
        }

        return NextResponse.json({
          invite: {
            id: directGroup.id,
            token: directGroup.id,
            status: 'pending',
            isExpired: false,
            isGeneralLink: true,
          },
          group: directGroup,
          inviter: inviterProfile ?? { full_name: 'Administrador' },
          invitee: null,
          isAlreadyMember,
        });
      }

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
    let inviter = null;
    if (invite.invited_by) {
      const { data: inviterData } = await db
        .from('profiles')
        .select('id, full_name, email, avatar_url')
        .eq('id', invite.invited_by)
        .maybeSingle();
      inviter = inviterData;
    }

    // Fetch invitee profile if present
    let inviteeProfile = null;
    if (invite.invitee_profile_id) {
      const { data: inviteeData } = await db
        .from('profiles')
        .select('id, full_name, email')
        .eq('id', invite.invitee_profile_id)
        .maybeSingle();
      inviteeProfile = inviteeData;
    }

    // Check if requesting user is already a member of the group
    let isAlreadyMember = false;
    const targetGroupId = invite.group_id;
    if (user && targetGroupId) {
      const { data: memberRecord } = await db
        .from('group_members')
        .select('group_id')
        .eq('group_id', targetGroupId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (memberRecord) {
        isAlreadyMember = true;
      }
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
      group: group ?? { id: invite.group_id, name: 'Grupo' },
      inviter: inviter ?? { full_name: 'Un integrante' },
      invitee: inviteeProfile,
      isAlreadyMember,
    });
  } catch (err: unknown) {
    console.error('[API GET /api/invites/[id]] Error:', err);
    const message = err instanceof Error ? err.message : 'Error al obtener la invitación';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
