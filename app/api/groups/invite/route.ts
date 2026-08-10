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
    const inviterEmail = user.email || '';

    // If name is provided, create a temporary member profile so they immediately join the group
    if (memberName) {
      const tempEmail = targetEmail || `temp_${Date.now()}_${Math.floor(Math.random() * 10000)}@deudita.app`;
      
      let targetUserId: string | null = null;
      
      // Check if profile with email exists
      if (targetEmail) {
        const { data: existingProf } = await supabase
          .from('profiles')
          .select('id')
          .eq('email', targetEmail)
          .maybeSingle();
        if (existingProf) targetUserId = existingProf.id;
      }

      if (!targetUserId) {
        const newUserId = crypto.randomUUID();
        const { error: profInsertErr } = await supabase.from('profiles').insert({
          id: newUserId,
          email: tempEmail,
          full_name: memberName,
          avatar_url: '',
        });

        if (!profInsertErr) {
          targetUserId = newUserId;
        } else {
          // If insert fails due to FK auth.users, fallback to auth admin if available
          const { data: authAdminRes } = await supabase.auth.admin.createUser({
            email: tempEmail,
            email_confirm: true,
            user_metadata: { full_name: memberName },
          }).catch(() => ({ data: null }));
          if (authAdminRes?.user) {
            targetUserId = authAdminRes.user.id;
          }
        }
      }

      if (targetUserId) {
        await supabase.from('group_members').upsert({
          group_id: groupId,
          user_id: targetUserId,
          invited_by: user.id,
          role: 'member',
        }, { onConflict: 'group_id,user_id' });
      }
    }

    // Check if target user is already a member if email is provided
    if (targetEmail) {
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', targetEmail)
        .maybeSingle();

      if (existingProfile) {
        const { data: existingMember } = await supabase
          .from('group_members')
          .select('user_id')
          .eq('group_id', groupId)
          .eq('user_id', existingProfile.id)
          .maybeSingle();

        if (existingMember) {
          return NextResponse.json({ error: 'Esta persona ya es miembro del grupo' }, { status: 400 });
        }
      }
    }

    // Upsert invitation in database
    const inviteEmail = targetEmail || `invite_${Date.now()}@deudita.app`;

    const { data: invite, error: inviteErr } = await supabase
      .from('group_invites')
      .upsert(
        {
          group_id: groupId,
          email: inviteEmail,
          invited_by: user.id,
          status: 'pending',
        },
        { onConflict: 'group_id,email' }
      )
      .select()
      .single();

    if (inviteErr || !invite) {
      console.error('[API /api/groups/invite] Error al insertar invitación:', inviteErr);
      return NextResponse.json({ error: inviteErr?.message || 'Error al crear la invitación' }, { status: 500 });
    }

    // Determine domain / app URL
    const requestOrigin = new URL(req.url).origin;
    const appUrl = process.env.APP_URL && process.env.APP_URL !== 'MY_APP_URL' ? process.env.APP_URL : requestOrigin;
    const inviteUrl = `${appUrl}/join/${invite.id}`;

    // If target email corresponds to a registered user, create an in-app notification
    if (targetEmail) {
      const { data: targetProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', targetEmail)
        .maybeSingle();

      if (targetProfile) {
        await supabase.from('notifications').insert({
          user_id: targetProfile.id,
          type: 'group_invite',
          title: 'Invitación a Grupo',
          message: `${inviterName} te ha invitado a unirte al grupo "${group.name}".`,
          data: {
            invite_id: invite.id,
            group_id: group.id,
            group_name: group.name,
            invited_by_name: inviterName,
            invited_by_email: inviterEmail,
          },
        });
      }

      // Send email
      await sendGroupInviteEmail({
        to: targetEmail,
        inviterName,
        inviterEmail,
        groupName: group.name,
        inviteUrl,
      });
    }

    return NextResponse.json({
      success: true,
      inviteId: invite.id,
      inviteUrl,
      groupName: group.name,
      message: targetEmail
        ? `Invitación enviada por correo a ${targetEmail}`
        : 'Enlace de invitación creado exitosamente',
    });
  } catch (err: unknown) {
    console.error('[API /api/groups/invite] Error no controlado:', err);
    const message = err instanceof Error ? err.message : 'Error interno del servidor';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
