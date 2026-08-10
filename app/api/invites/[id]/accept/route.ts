import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const inviteId = resolvedParams.id;

    const supabase = await createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ error: 'Debes iniciar sesión para aceptar la invitación' }, { status: 401 });
    }

    // Fetch the invite
    const { data: invite, error: inviteErr } = await supabase
      .from('group_invites')
      .select('*')
      .eq('id', inviteId)
      .single();

    if (inviteErr || !invite) {
      return NextResponse.json({ error: 'La invitación no existe o no se encontró' }, { status: 404 });
    }

    const groupId = invite.group_id;

    // Add user to group_members
    const { data: existingMember } = await supabase
      .from('group_members')
      .select('group_id')
      .eq('group_id', groupId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!existingMember) {
      const { error: memberErr } = await supabase
        .from('group_members')
        .insert({
          group_id: groupId,
          user_id: user.id,
          invited_by: invite.invited_by,
          role: 'member',
        });

      if (memberErr && memberErr.code !== '23505') {
        console.error('[API /api/invites/[id]/accept] Error al agregar miembro:', memberErr);
        return NextResponse.json({ error: memberErr.message }, { status: 500 });
      }
    }

    // Mark invite status as accepted
    await supabase
      .from('group_invites')
      .update({ status: 'accepted' })
      .eq('id', inviteId);

    // Mark related notifications as read
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', user.id)
      .filter('data->>invite_id', 'eq', inviteId);

    return NextResponse.json({
      success: true,
      groupId: invite.group_id,
      message: 'Te has unido al grupo exitosamente',
    });
  } catch (err: unknown) {
    console.error('[API POST /api/invites/[id]/accept] Error:', err);
    const message = err instanceof Error ? err.message : 'Error al aceptar la invitación';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
