import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sendGroupInviteEmail } from '@/lib/email';

async function ensureGroupMember(db: any, groupId: string, userId: string, invitedBy: string) {
  const { data: existing } = await db
    .from('group_members')
    .select('group_id')
    .eq('group_id', groupId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!existing) {
    const { error } = await db
      .from('group_members')
      .insert({
        group_id: groupId,
        user_id: userId,
        invited_by: invitedBy,
        role: 'member',
      });
    if (error && error.code !== '23505') {
      return error;
    }
  }
  return null;
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();

    if (authErr || !user) {
      console.error('[API /api/groups/invite] Error de autenticación:', authErr);
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const db = supabase;

    const body = await req.json().catch(() => null);
    if (!body || !body.groupId) {
      return NextResponse.json({ error: 'Falta la información del grupo' }, { status: 400 });
    }

    const { groupId, email: rawEmail, name: rawName, memberId: rawMemberId } = body;
    const targetEmail = rawEmail ? String(rawEmail).trim().toLowerCase() : null;
    const memberName = rawName ? String(rawName).trim() : '';

    if (!targetEmail && !memberName && !rawMemberId) {
      return NextResponse.json({ error: 'Ingresa al menos un nombre o correo para invitar' }, { status: 400 });
    }

    // Fetch group details
    const { data: group, error: groupErr } = await db
      .from('groups')
      .select('*')
      .eq('id', groupId)
      .single();

    if (groupErr || !group) {
      return NextResponse.json({ error: 'Grupo no encontrado' }, { status: 404 });
    }

    // Fetch inviter profile
    const { data: inviterProfile } = await db
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    const inviterName = inviterProfile?.full_name || user.user_metadata?.full_name || 'Un integrante';

    let targetUserId: string | null = null;

    // 1. If memberId is passed (existing member/profile)
    if (rawMemberId) {
      const { data: existingProf } = await db
        .from('profiles')
        .select('*')
        .eq('id', rawMemberId)
        .maybeSingle();

      if (existingProf) {
        targetUserId = existingProf.id;
        if (targetEmail) {
          await db.from('profiles').update({ email: targetEmail }).eq('id', targetUserId);
        }
        if (memberName && existingProf.is_temp) {
          await db.from('profiles').update({ full_name: memberName }).eq('id', targetUserId);
        }
        await ensureGroupMember(db, groupId, targetUserId!, user.id);
      }
    }

    // 2. If targetUserId not set, but email is provided, check if a real profile exists
    if (!targetUserId && targetEmail) {
      const { data: existingProfile } = await db
        .from('profiles')
        .select('*')
        .eq('email', targetEmail)
        .maybeSingle();

      if (existingProfile) {
        targetUserId = existingProfile.id;
        await ensureGroupMember(db, groupId, targetUserId!, user.id);
      }
    }

    // 3. If no existing profile found, create temporary member profile (email optional/null)
    if (!targetUserId) {
      targetUserId = crypto.randomUUID();
      const displayName = memberName || (targetEmail ? targetEmail.split('@')[0] : 'Integrante');

      const { error: profErr } = await db.from('profiles').insert({
        id: targetUserId,
        full_name: displayName,
        email: targetEmail || null,
        is_temp: true,
      });

      if (profErr) {
        console.error('[API /api/groups/invite] Error creating temp profile:', profErr);
        return NextResponse.json({ error: profErr.message || 'Error al crear perfil del integrante' }, { status: 500 });
      }

      const memberInsertErr = await ensureGroupMember(db, groupId, targetUserId, user.id);
      if (memberInsertErr) {
        console.error('[API /api/groups/invite] Error adding member to group:', memberInsertErr);
        return NextResponse.json({ error: memberInsertErr.message || 'Error al añadir integrante al grupo' }, { status: 500 });
      }
    }

    // 4. Create or fetch group_invites record pointing to invitee_profile_id
    let inviteToken: string | null = null;
    let inviteId: string | null = null;

    // Check if an invite already exists for this group and profile/email
    let inviteQuery = db.from('group_invites').select('id, token').eq('group_id', groupId);
    if (targetUserId) {
      inviteQuery = inviteQuery.eq('invitee_profile_id', targetUserId);
    } else if (targetEmail) {
      inviteQuery = inviteQuery.eq('email', targetEmail);
    }

    const { data: existingInvite } = await inviteQuery.maybeSingle();

    if (existingInvite) {
      inviteId = existingInvite.id;
      inviteToken = existingInvite.token;
      if (targetEmail) {
        await db.from('group_invites').update({ email: targetEmail }).eq('id', inviteId);
      }
    } else {
      const { data: newInvite, error: inviteInsErr } = await db
        .from('group_invites')
        .insert({
          group_id: groupId,
          invitee_profile_id: targetUserId,
          invited_by: user.id,
          email: targetEmail || null,
          status: 'pending',
        })
        .select('id, token')
        .single();

      if (inviteInsErr) {
        console.error('[API /api/groups/invite] Error creating invite:', inviteInsErr);
      } else if (newInvite) {
        inviteId = newInvite.id;
        inviteToken = newInvite.token;
      }
    }

    const origin = req.headers.get('origin') || 'https://deudita.app';
    const inviteUrl = inviteToken
      ? `${origin}/join?token=${inviteToken}`
      : `${origin}/join?group=${groupId}`;

    // 5. Send email if target email provided
    if (targetEmail) {
      try {
        await sendGroupInviteEmail({
          to: targetEmail,
          groupName: group.name,
          inviterName,
          inviterEmail: user.email ?? 'soporte@deudita.app',
          inviteUrl,
        });
      } catch (e) {
        console.error('[API /api/groups/invite] Error enviando correo:', e);
      }
    }

    return NextResponse.json({
      success: true,
      memberId: targetUserId,
      inviteId,
      token: inviteToken,
      inviteUrl,
      message: memberName
        ? `"${memberName}" ha sido añadido al grupo`
        : `Invitación enviada a ${targetEmail}`,
    });
  } catch (err: unknown) {
    console.error('[API POST /api/groups/invite] Error:', err);
    const message = err instanceof Error ? err.message : 'Error al procesar la invitación';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
