import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sendGroupInviteEmail } from '@/lib/email';

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const memberId = resolvedParams.id;

    const supabase = await createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { name, email, groupId } = body;

    if (!name && !email) {
      return NextResponse.json({ error: 'Proporciona al menos un nombre o correo para actualizar' }, { status: 400 });
    }

    // Verify permissions: only self or temporary profile (is_temp = true) can be edited
    if (memberId !== user.id) {
      const { data: targetProf } = await supabase
        .from('profiles')
        .select('is_temp, email')
        .eq('id', memberId)
        .maybeSingle();

      const isTemp = Boolean(targetProf?.is_temp) || Boolean(targetProf?.email?.startsWith('temp_')) || Boolean(targetProf?.email?.endsWith('@deudita.app'));
      if (!targetProf || !isTemp) {
        return NextResponse.json(
          { error: 'Solo puedes modificar tu propio perfil o perfiles temporales de invitados.' },
          { status: 403 }
        );
      }
    }

    const updates: { full_name?: string; email?: string } = {};
    if (name && typeof name === 'string' && name.trim()) {
      updates.full_name = name.trim();
    }
    if (email && typeof email === 'string' && email.trim()) {
      updates.email = email.trim().toLowerCase();
    }

    // Update profile
    const { data: updatedProfile, error: updateErr } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', memberId)
      .select('*')
      .single();

    if (updateErr) {
      console.error('[API PATCH /api/members/[id]] Error al actualizar perfil:', updateErr);
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    let inviteSent = false;
    let inviteUrl = '';

    // If email is provided and groupId is provided, create/update invite and send email
    if (updates.email && groupId && !updates.email.startsWith('temp_') && updates.email.includes('@')) {
      const { data: group } = await supabase
        .from('groups')
        .select('name')
        .eq('id', groupId)
        .maybeSingle();

      const groupName = group?.name ?? 'Grupo';

      const { data: inviterProfile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .maybeSingle();

      const inviterName = inviterProfile?.full_name ?? user.user_metadata?.full_name ?? 'Un integrante';

      // Check for existing invite for this member in this group
      const { data: existingInvite } = await supabase
        .from('group_invites')
        .select('id, token')
        .eq('group_id', groupId)
        .eq('invitee_profile_id', memberId)
        .maybeSingle();

      let token = existingInvite?.token;

      if (existingInvite) {
        await supabase
          .from('group_invites')
          .update({
            email: updates.email,
            status: 'pending',
            invited_by: user.id,
          })
          .eq('id', existingInvite.id);
      } else {
        const { data: newInvite } = await supabase
          .from('group_invites')
          .insert({
            group_id: groupId,
            invitee_profile_id: memberId,
            invited_by: user.id,
            email: updates.email,
            status: 'pending',
          })
          .select('id, token')
          .single();

        token = newInvite?.token;
      }

      const origin = req.headers.get('origin') ?? 'https://deudita.app';
      inviteUrl = token ? `${origin}/join?token=${token}` : `${origin}/join?group=${groupId}`;

      try {
        await sendGroupInviteEmail({
          to: updates.email,
          groupName,
          inviterName,
          inviterEmail: user.email ?? 'soporte@deudita.app',
          inviteUrl,
        });
        inviteSent = true;
      } catch (e) {
        console.error('[API PATCH /api/members/[id]] Error enviando correo:', e);
      }
    }

    return NextResponse.json({
      success: true,
      profile: updatedProfile,
      inviteSent,
      inviteUrl,
      message: inviteSent
        ? `Invitación enviada por correo a ${updates.email}`
        : 'Perfil actualizado correctamente',
    });
  } catch (err: unknown) {
    console.error('[API PATCH /api/members/[id]] Error:', err);
    const message = err instanceof Error ? err.message : 'Error al actualizar integrante';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}


export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const memberId = resolvedParams.id;

    const supabase = await createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const groupId = searchParams.get('groupId');

    if (!groupId) {
      return NextResponse.json({ error: 'Falta el ID del grupo' }, { status: 400 });
    }

    // Delete from group_members
    const { error: delErr } = await supabase
      .from('group_members')
      .delete()
      .eq('group_id', groupId)
      .eq('user_id', memberId);

    if (delErr) {
      console.error('[API DELETE /api/members/[id]] Error al eliminar de grupo:', delErr);
      return NextResponse.json({ error: delErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Integrante eliminado del grupo' });
  } catch (err: unknown) {
    console.error('[API DELETE /api/members/[id]] Error:', err);
    const message = err instanceof Error ? err.message : 'Error al eliminar integrante';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
