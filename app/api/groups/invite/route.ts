import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
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

    const db = createAdminClient();

    const body = await req.json().catch(() => null);
    if (!body || !body.groupId) {
      return NextResponse.json({ error: 'Falta la información del grupo' }, { status: 400 });
    }

    const { groupId, email: rawEmail, name: rawName, memberId: rawMemberId } = body;
    const targetEmail = rawEmail ? String(rawEmail).trim().toLowerCase() : '';
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
    let tempEmail = targetEmail;

    // Handle case where memberId is passed (updating/inviting an existing temporary member)
    if (rawMemberId) {
      const { data: tempProfile } = await db
        .from('profiles')
        .select('*')
        .eq('id', rawMemberId)
        .maybeSingle();

      if (tempProfile) {
        if (targetEmail) {
          const { data: existingProfile } = await db
            .from('profiles')
            .select('*')
            .eq('email', targetEmail)
            .maybeSingle();

          if (existingProfile && existingProfile.id !== rawMemberId) {
            targetUserId = existingProfile.id;
            await ensureGroupMember(db, groupId, existingProfile.id, user.id);
          } else {
            targetUserId = rawMemberId;
            const updateData: { email: string; full_name?: string; is_temp?: boolean } = {
              email: targetEmail,
              is_temp: true,
            };
            if (memberName) updateData.full_name = memberName;

            await db.from('profiles').update(updateData).eq('id', rawMemberId);
            await ensureGroupMember(db, groupId, rawMemberId, user.id);
          }
        } else {
          targetUserId = rawMemberId;
          if (memberName) {
            await db.from('profiles').update({ full_name: memberName, is_temp: true }).eq('id', rawMemberId);
          }
        }
      }
    }

    // 1. If email is provided and targetUserId was not resolved via memberId
    if (!targetUserId && targetEmail) {
      const { data: existingProfile } = await db
        .from('profiles')
        .select('*')
        .eq('email', targetEmail)
        .maybeSingle();

      if (existingProfile) {
        targetUserId = existingProfile.id;
      }
    }

    // 2. If no existing profile found, create a new profile for the member with is_temp: true
    if (!targetUserId) {
      if (!tempEmail) {
        tempEmail = `temp_${groupId}_${Date.now()}_${Math.floor(Math.random() * 100000)}@deudita.app`;
      }
      const displayName = memberName || (targetEmail ? targetEmail.split('@')[0] : 'Integrante');
      targetUserId = crypto.randomUUID();

      const { error: profErr } = await db.from('profiles').upsert({
        id: targetUserId,
        email: tempEmail,
        full_name: displayName,
        avatar_url: '',
        is_temp: true,
      }, { onConflict: 'id' });

      if (profErr) {
        console.error('[API /api/groups/invite] Error upserting profile:', profErr);
        return NextResponse.json({ error: profErr.message || 'Error al crear perfil del integrante' }, { status: 500 });
      }
    }

    // 3. Add to group_members immediately
    const memberInsertErr = await ensureGroupMember(db, groupId, targetUserId, user.id);

    if (memberInsertErr) {
      console.error('[API /api/groups/invite] Error adding member to group:', memberInsertErr);
      return NextResponse.json({ error: memberInsertErr.message || 'Error al añadir integrante al grupo' }, { status: 500 });
    }

    // 4. Create or update group_invite record if real email is provided or for generating link
    let inviteId: string | null = null;
    const inviteEmailToUse = targetEmail || tempEmail || `temp_${groupId}_${targetUserId}@deudita.app`;

    const { data: existingInvite } = await db
      .from('group_invites')
      .select('id')
      .eq('group_id', groupId)
      .eq('email', inviteEmailToUse)
      .maybeSingle();

    if (existingInvite) {
      inviteId = existingInvite.id;
    } else {
      const { data: newInvite } = await db
        .from('group_invites')
        .insert({
          group_id: groupId,
          email: inviteEmailToUse,
          invited_by: user.id,
          status: 'pending',
        })
        .select('id')
        .single();

      if (newInvite) inviteId = newInvite.id;
    }

    const origin = req.headers.get('origin') || 'https://deudita.app';
    const inviteUrl = inviteId
      ? `${origin}/join?invite=${inviteId}`
      : `${origin}/join?group=${groupId}`;

    // 5. Send email if real target email was provided
    if (targetEmail && !targetEmail.startsWith('temp_')) {
      try {
        await sendGroupInviteEmail({
          to: targetEmail,
          groupName: group.name,
          inviterName,
          inviterEmail: user.email || '',
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
