import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getBaseUrl } from '@/lib/utils';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const groupId = resolvedParams.id;

    if (!groupId) {
      return NextResponse.json({ error: 'ID de grupo requerido' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const db = supabase;

    // Check if user is a member or owner of the group
    const { data: membership } = await db
      .from('group_members')
      .select('role')
      .eq('group_id', groupId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!membership) {
      const { data: groupCheck } = await db
        .from('groups')
        .select('owner_id')
        .eq('id', groupId)
        .maybeSingle();

      if (!groupCheck || groupCheck.owner_id !== user.id) {
        return NextResponse.json({ error: 'No tienes permiso para generar enlaces de este grupo' }, { status: 403 });
      }
    }

    // Look for an existing, non-expired open invite link for this group
    const { data: existingInvites } = await db
      .from('group_invites')
      .select('id, token, created_at, status, email, invitee_profile_id')
      .eq('group_id', groupId)
      .order('created_at', { ascending: false })
      .limit(10);

    let activeInvite: any = null;
    const now = Date.now();

    if (existingInvites && existingInvites.length > 0) {
      for (const inv of existingInvites) {
        const isGeneral = !inv.invitee_profile_id && (!inv.email || inv.email === 'invite@link.deudita.app');
        if (!isGeneral) continue;

        const createdAtMs = inv.created_at ? new Date(inv.created_at).getTime() : now;
        const expiresAtMs = createdAtMs + 7 * 24 * 60 * 60 * 1000;

        if (expiresAtMs > now && inv.status !== 'rejected') {
          activeInvite = {
            ...inv,
            computedExpiresAt: new Date(expiresAtMs).toISOString(),
          };
          break;
        }
      }
    }

    const origin = getBaseUrl(req);

    if (activeInvite) {
      const inviteUrl = `${origin}/join?token=${activeInvite.token}`;
      return NextResponse.json({
        success: true,
        inviteId: activeInvite.id,
        token: activeInvite.token,
        inviteUrl,
        expiresAt: activeInvite.computedExpiresAt,
        isNew: false,
      });
    }

    // If no active link exists or it expired, create a new 7-day invite link
    const newExpiresAt = new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString();
    const token = crypto.randomUUID();

    // Use email 'invite@link.deudita.app' to safely satisfy any 'email_or_profile_check' database constraints
    const insertPayload: any = {
      group_id: groupId,
      invited_by: user.id,
      email: 'invite@link.deudita.app',
      invitee_profile_id: null,
      status: 'pending',
      token,
    };

    const { data: newInvite, error: insertErr } = await db
      .from('group_invites')
      .insert(insertPayload)
      .select('id, token, created_at')
      .single();

    if (insertErr || !newInvite) {
      console.warn('[API /api/groups/[id]/invite-link] Warning creating invite link row, using group fallback:', insertErr);
      const fallbackUrl = `${origin}/join?group=${groupId}`;
      return NextResponse.json({
        success: true,
        inviteId: groupId,
        token: groupId,
        inviteUrl: fallbackUrl,
        expiresAt: newExpiresAt,
        isNew: true,
      });
    }

    const inviteUrl = `${origin}/join?token=${newInvite.token}`;

    return NextResponse.json({
      success: true,
      inviteId: newInvite.id,
      token: newInvite.token,
      inviteUrl,
      expiresAt: newExpiresAt,
      isNew: true,
    });
  } catch (err: unknown) {
    console.error('[API GET /api/groups/[id]/invite-link] Error:', err);
    const message = err instanceof Error ? err.message : 'Error al obtener el enlace de invitación';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const groupId = resolvedParams.id;

    if (!groupId) {
      return NextResponse.json({ error: 'ID de grupo requerido' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const db = supabase;

    // Check membership or ownership
    const { data: membership } = await db
      .from('group_members')
      .select('role')
      .eq('group_id', groupId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!membership) {
      const { data: groupCheck } = await db
        .from('groups')
        .select('owner_id')
        .eq('id', groupId)
        .maybeSingle();

      if (!groupCheck || groupCheck.owner_id !== user.id) {
        return NextResponse.json({ error: 'No tienes permiso para generar enlaces de este grupo' }, { status: 403 });
      }
    }

    // Generate a fresh 7-day invite link
    const now = Date.now();
    const newExpiresAt = new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString();
    const token = crypto.randomUUID();

    const insertPayload: any = {
      group_id: groupId,
      invited_by: user.id,
      email: 'invite@link.deudita.app',
      invitee_profile_id: null,
      status: 'pending',
      token,
    };

    const { data: newInvite, error: insertErr } = await db
      .from('group_invites')
      .insert(insertPayload)
      .select('id, token, created_at')
      .single();

    if (insertErr || !newInvite) {
      console.warn('[API /api/groups/[id]/invite-link POST] Warning creating invite link, using fallback:', insertErr);
      const origin = getBaseUrl(req);
      const fallbackUrl = `${origin}/join?group=${groupId}`;

      return NextResponse.json({
        success: true,
        inviteId: groupId,
        token: groupId,
        inviteUrl: fallbackUrl,
        expiresAt: newExpiresAt,
        isNew: true,
        message: 'Enlace de invitación actualizado',
      });
    }

    const origin = getBaseUrl(req);
    const inviteUrl = `${origin}/join?token=${newInvite.token}`;

    return NextResponse.json({
      success: true,
      inviteId: newInvite.id,
      token: newInvite.token,
      inviteUrl,
      expiresAt: newExpiresAt,
      isNew: true,
      message: 'Nuevo enlace de invitación generado con éxito',
    });
  } catch (err: unknown) {
    console.error('[API POST /api/groups/[id]/invite-link] Error:', err);
    const message = err instanceof Error ? err.message : 'Error al generar el enlace de invitación';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
