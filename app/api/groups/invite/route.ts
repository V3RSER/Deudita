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

    const { groupId, email: rawEmail, name: rawName } = body;
    const targetEmail = rawEmail ? String(rawEmail).trim().toLowerCase() : '';
    const memberName = rawName ? String(rawName).trim() : '';

    if (!targetEmail && !memberName) {
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

    // 1. If email is provided, check if profile exists
    if (targetEmail) {
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('*')
        .eq('email', targetEmail)
        .maybeSingle();

      if (existingProfile) {
        targetUserId = existingProfile.id;
      }
    }

    // 2. If no existing profile found, create a new profile (temporary or with provided email/name)
    if (!targetUserId) {
      if (!tempEmail) {
        tempEmail = `temp_${Date.now()}_${Math.floor(Math.random() * 100000)}@deudita.app`;
      }
      const displayName = memberName || targetEmail.split('@')[0];
      const tempPassword = crypto.randomUUID() + 'aA1!';

      // Create auth user so ID is valid in auth.users
      const { data: signUpData } = await supabase.auth.signUp({
        email: tempEmail,
        password: tempPassword,
        options: {
          data: { full_name: displayName },
        },
      }).catch(() => ({ data: null }));

      if (signUpData?.user?.id) {
        targetUserId = signUpData.user.id;
      } else {
        // Fallback to admin or uuid
        const { data: adminData } = await supabase.auth.admin.createUser({
          email: tempEmail,
          password: tempPassword,
          email_confirm: true,
          user_metadata: { full_name: displayName },
        }).catch(() => ({ data: null }));

        if (adminData?.user?.id) {
          targetUserId = adminData.user.id;
        } else {
          targetUserId = crypto.randomUUID();
        }
      }

      // Upsert profile record
      await supabase.from('profiles').upsert({
        id: targetUserId,
        email: tempEmail,
        full_name: displayName,
        avatar_url: '',
      }, { onConflict: 'id' });
    }

    // 3. Add to group_members immediately!
    const { error: memberInsertErr } = await supabase.from('group_members').upsert({
      group_id: groupId,
      user_id: targetUserId,
      invited_by: user.id,
      role: 'member',
    }, { onConflict: 'group_id,user_id' });

    if (memberInsertErr) {
      console.error('[API /api/groups/invite] Error adding member to group:', memberInsertErr);
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
