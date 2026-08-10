import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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

    // If email was updated and groupId is provided, update or insert invite
    if (updates.email && groupId && !updates.email.startsWith('temp_')) {
      await supabase.from('group_invites').upsert({
        group_id: groupId,
        email: updates.email,
        invited_by: user.id,
        status: 'pending',
      }, { onConflict: 'group_id,email' });
    }

    return NextResponse.json({ success: true, profile: updatedProfile });
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
