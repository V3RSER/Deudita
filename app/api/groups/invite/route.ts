import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sendGroupInviteEmail } from '@/lib/email';

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();

    if (authErr || !user) {
      console.error('[API /api/groups/invite] Error de autenticación:', authErr);
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

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
    const { data: group, error: groupErr } = await supabase
      .from('groups')
      .select('*')
      .eq('id', groupId)
      .single();

    if (groupErr || !group) {
      return NextResponse.json({ error: 'Grupo no encontrado' }, { status: 404 });
    }

    // Fetch inviter profile
    const { data: inviterProfile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    const inviterName = inviterProfile?.full_name || user.user_metadata?.full_name || 'Un integrante';

    let targetUserId: string | null = null;
    let tempEmail = targetEmail;

    // Handle case where memberId is passed (updating/inviting an existing temporary member)
    if (rawMemberId) {
      const { data: tempProfile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', rawMemberId)
        .maybeSingle();

      if (tempProfile) {
        if (targetEmail) {
          const { data: existingProfile } = await supabase
            .from('profiles')
            .select('*')
            .eq('email', targetEmail)
            .maybeSingle();

          if (existingProfile && existingProfile.id !== rawMemberId) {
            targetUserId = existingProfile.id;

            await supabase.from('group_members').upsert({
              group_id: groupId,
              user_id: existingProfile.id,
              invited_by: user.id,
              role: 'member',
            }, { onConflict: 'group_id,user_id' });

            await supabase.from('expenses').update({ paid_by: existingProfile.id }).eq('group_id', groupId).eq('paid_by', rawMemberId);
            await supabase.from('expense_splits').update({ user_id: existingProfile.id }).eq('user_id', rawMemberId);
            await supabase.from('payments').update({ paid_by: existingProfile.id }).eq('group_id', groupId).eq('paid_by', rawMemberId);
            await supabase.from('payments').update({ paid_to: existingProfile.id }).eq('group_id', groupId).eq('paid_to', rawMemberId);

            await supabase.from('group_members').delete().eq('group_id', groupId).eq('user_id', rawMemberId);

            const { data: remainingMemberships } = await supabase
              .from('group_members')
              .select('group_id')
              .eq('user_id', rawMemberId);

            if (!remainingMemberships || remainingMemberships.length === 0) {
              await supabase.from('profiles').delete().eq('id', rawMemberId);
            }
          } else {
            targetUserId = rawMemberId;
            const updateData: { email: string; full_name?: string } = { email: targetEmail };
            if (memberName) updateData.full_name = memberName;

            await supabase.from('profiles').update(updateData).eq('id', rawMemberId);

            await supabase.from('group_members').upsert({
              group_id: groupId,
              user_id: rawMemberId,
              invited_by: user.id,
              role: 'member',
            }, { onConflict: 'group_id,user_id' });
          }
        } else {
          targetUserId = rawMemberId;
          if (memberName) {
            await supabase.from('profiles').update({ full_name: memberName }).eq('id', rawMemberId);
          }
        }
      }
    }

    // 1. If email is provided and targetUserId was not resolved via memberId
    if (!targetUserId && targetEmail) {
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('*')
        .eq('email', targetEmail)
        .maybeSingle();

      if (existingProfile) {
        targetUserId = existingProfile.id;
      }
    }

    // 2. If no existing profile found, create a new profile for the member
    if (!targetUserId) {
      if (!tempEmail) {
        tempEmail = `temp_${groupId}_${Date.now()}_${Math.floor(Math.random() * 100000)}@deudita.app`;
      }
      const displayName = memberName || (targetEmail ? targetEmail.split('@')[0] : 'Integrante');
      targetUserId = crypto.randomUUID();

      const { error: profErr } = await supabase.from('profiles').upsert({
        id: targetUserId,
        email: tempEmail,
        full_name: displayName,
        avatar_url: '',
      }, { onConflict: 'id' });

      if (profErr) {
        console.error('[API /api/groups/invite] Error upserting profile:', profErr);
        return NextResponse.json({ error: profErr.message || 'Error al crear perfil del integrante' }, { status: 500 });
      }
    }

    // 3. Add to group_members immediately
    const { error: memberInsertErr } = await supabase.from('group_members').upsert({
      group_id: groupId,
      user_id: targetUserId,
      invited_by: user.id,
      role: 'member',
    }, { onConflict: 'group_id,user_id' });

    if (memberInsertErr) {
      console.error('[API /api/groups/invite] Error adding member to group:', memberInsertErr);
      return NextResponse.json({ error: memberInsertErr.message || 'Error al añadir integrante al grupo' }, { status: 500 });
    }

    // 4. Create or update group_invite record if real email is provided or for generating link
    let inviteId: string | null = null;
    const inviteEmailToUse = targetEmail || tempEmail || `temp_${groupId}_${targetUserId}@deudita.app`;

    const { data: existingInvite } = await supabase
      .from('group_invites')
      .select('id')
      .eq('group_id', groupId)
      .eq('email', inviteEmailToUse)
      .maybeSingle();

    if (existingInvite) {
      inviteId = existingInvite.id;
    } else {
      const { data: newInvite } = await supabase
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
