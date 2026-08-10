import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      console.error('[API POST /api/groups] Unauthorized user:', authError);
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const db = createAdminClient();
    const body = await req.json().catch(() => null);

    if (!body) {
      return NextResponse.json({ error: 'Cuerpo de la petición inválido' }, { status: 400 });
    }

    const { name, category, description, emails, imageUrl } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'El nombre del grupo es requerido' }, { status: 400 });
    }

    // Combine description and optional imageUrl if provided
    let finalDesc = typeof description === 'string' && description.trim().length > 0 ? description.trim() : '';
    if (imageUrl && typeof imageUrl === 'string' && imageUrl.trim().length > 0) {
      finalDesc = finalDesc ? `${finalDesc} [img:${imageUrl.trim()}]` : `[img:${imageUrl.trim()}]`;
    }

    // Insert group matching database schema: name, category, description, owner_id
    const { data: group, error: groupErr } = await db
      .from('groups')
      .insert({
        name: name.trim(),
        category: typeof category === 'string' && category.trim().length > 0 ? category.trim() : 'home',
        description: finalDesc ? finalDesc : null,
        owner_id: user.id,
      })
      .select()
      .single();

    if (groupErr || !group) {
      console.error('[API POST /api/groups] Error inserting group:', groupErr);
      return NextResponse.json({ error: groupErr?.message || 'Error al crear el grupo' }, { status: 500 });
    }

    // Insert owner membership record in group_members
    const { error: memberErr } = await db.from('group_members').insert({
      group_id: group.id,
      user_id: user.id,
      role: 'owner',
    });

    if (memberErr) {
      console.error('[API POST /api/groups] Error inserting owner in group_members:', memberErr);
    }

    // Insert invites if emails provided
    if (emails && Array.isArray(emails)) {
      const invitesToInsert = emails
        .filter((e): e is string => typeof e === 'string' && e.trim().length > 0 && e.trim().toLowerCase() !== user.email?.toLowerCase())
        .map((e) => ({
          group_id: group.id,
          email: e.trim().toLowerCase(),
          invited_by: user.id,
          status: 'pending',
        }));

      if (invitesToInsert.length > 0) {
        const { error: inviteErr } = await db.from('group_invites').insert(invitesToInsert);
        if (inviteErr) {
          console.error('[API POST /api/groups] Error creating group invites:', inviteErr);
        }
      }
    }

    console.log('[API POST /api/groups] Group created successfully:', group.id, group.name);
    return NextResponse.json(group);
  } catch (err: unknown) {
    console.error('[API POST /api/groups] Unhandled error:', err);
    const message = err instanceof Error ? err.message : 'Error interno al crear el grupo';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}



