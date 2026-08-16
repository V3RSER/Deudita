import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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

    // Look for an existing, non-expired open invite link for this group (email is null, invitee_profile_id is null)
    const { data: existingInvites } = await db
      .from('group_invites')
      .select('id, token, created_at, expires_at, status')
      .eq('group_id', groupId)
      .is('invitee_profile_id', null)
      .is('email', null)
      .order('created_at', { ascending: false })
      .limit(5);

    let activeInvite: any = null;
    const now = Date.now();

    if (existingInvites && existingInvites.length > 0) {
      for (const inv of existingInvites) {
        const expiresAtMs = inv.expires_at
          ? new Date(inv.expires_at).getTime()
          : (inv.created_at ? new Date(inv.created_at).getTime() + 7 * 24 * 60 * 60 * 1000 : 0);

        if (expiresAtMs > now && inv.status !== 'rejected') {
          activeInvite = {
            ...inv,
            computedExpiresAt: new Date(expiresAtMs).toISOString(),
          };
          break;
        }
      }
    }

    const origin = req.headers.get('origin') ?? 'https://deudita.app';

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

    // Attempt insert with expires_at
    const insertPayload: any = {
      group_id: groupId,
      invited_by: user.id,
      email: null,
      invitee_profile_id: null,
      status: 'pending',
      token,
      expires_at: newExpiresAt,
    };

    let newInvite: { id: string; token: string; created_at: string; expires_at?: string } | null = null;
    let insertErr: any = null;

    const initialInsert = await db
      .from('group_invites')
      .insert(insertPayload)
      .select('id, token, created_at, expires_at')
      .single();

    newInvite = initialInsert.data;
    insertErr = initialInsert.error;

    if (insertErr) {
      console.warn('[API /api/groups/[id]/invite-link] Retrying insert without expires_at column in case of schema discrepancy:', insertErr);
      const fallbackPayload = {
        group_id: groupId,
        invited_by: user.id,
        email: null,
        invitee_profile_id: null,
        status: 'pending',
        token,
      };
      const retryResult = await db
        .from('group_invites')
        .insert(fallbackPayload)
        .select('id, token, created_at')
        .single();

      newInvite = retryResult.data;
      insertErr = retryResult.error;
    }

    if (insertErr || !newInvite) {
      console.error('[API /api/groups/[id]/invite-link] Error creating invite link:', insertErr);
      return NextResponse.json({ error: 'No se pudo generar el enlace de invitación' }, { status: 500 });
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
      email: null,
      invitee_profile_id: null,
      status: 'pending',
      token,
      expires_at: newExpiresAt,
    };

    let newInvite: { id: string; token: string; created_at: string; expires_at?: string } | null = null;
    let insertErr: any = null;

    const initialInsert = await db
      .from('group_invites')
      .insert(insertPayload)
      .select('id, token, created_at, expires_at')
      .single();

    newInvite = initialInsert.data;
    insertErr = initialInsert.error;

    if (insertErr) {
      console.warn('[API /api/groups/[id]/invite-link POST] Retrying insert without expires_at column:', insertErr);
      const fallbackPayload = {
        group_id: groupId,
        invited_by: user.id,
        email: null,
        invitee_profile_id: null,
        status: 'pending',
        token,
      };
      const retryResult = await db
        .from('group_invites')
        .insert(fallbackPayload)
        .select('id, token, created_at')
        .single();

      newInvite = retryResult.data;
      insertErr = retryResult.error;
    }

    if (insertErr || !newInvite) {
      console.error('[API /api/groups/[id]/invite-link POST] Error creating invite link:', insertErr);
      return NextResponse.json({ error: 'No se pudo generar el nuevo enlace de invitación' }, { status: 500 });
    }

    const origin = req.headers.get('origin') ?? 'https://deudita.app';
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
