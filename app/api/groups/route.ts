import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      console.error('[API GET /api/groups] Unauthorized user:', authError);
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { data: memberships, error: memberErr } = await supabase
      .from('group_members')
      .select('group_id')
      .eq('user_id', user.id);

    console.log(`[API GET /api/groups] memberships select result: ${JSON.stringify({ data: memberships, error: memberErr })}`);

    if (memberErr) {
      console.error('[API GET /api/groups] Error selecting group_members:', memberErr);
      return NextResponse.json({ error: memberErr.message }, { status: 500 });
    }

    const groupIds = Array.from(new Set((memberships || []).map((m) => m.group_id)));

    if (groupIds.length === 0) {
      console.log('[API GET /api/groups] User has no group memberships');
      return NextResponse.json([]);
    }

    const { data: groups, error: groupsErr } = await supabase
      .from('groups')
      .select('*')
      .in('id', groupIds)
      .order('created_at', { ascending: false });

    console.log(`[API GET /api/groups] groups select result: ${JSON.stringify({ data: groups, error: groupsErr })}`);

    if (groupsErr) {
      console.error('[API GET /api/groups] Error selecting groups:', groupsErr);
      return NextResponse.json({ error: groupsErr.message }, { status: 500 });
    }

    return NextResponse.json(groups || []);
  } catch (err: unknown) {
    console.error('[API GET /api/groups] Unhandled error:', err);
    const message = err instanceof Error ? err.message : 'Error interno al obtener grupos';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      console.error('[API POST /api/groups] Unauthorized user:', authError);
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await req.json().catch(() => null);

    if (!body) {
      return NextResponse.json({ error: 'Cuerpo de la petición inválido' }, { status: 400 });
    }

    const { name, category, description, emails, imageUrl, memberIds, currency } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'El nombre del grupo es requerido' }, { status: 400 });
    }

    // Combine description and optional imageUrl if provided
    let finalDesc = typeof description === 'string' && description.trim().length > 0 ? description.trim() : '';
    if (imageUrl && typeof imageUrl === 'string' && imageUrl.trim().length > 0) {
      finalDesc = finalDesc ? `${finalDesc} [img:${imageUrl.trim()}]` : `[img:${imageUrl.trim()}]`;
    }

    const groupInsertObj: Record<string, any> = {
      name: name.trim(),
      category: typeof category === 'string' && category.trim().length > 0 ? category.trim() : 'home',
      description: finalDesc ? finalDesc : null,
      owner_id: user.id,
    };
    if (currency) {
      groupInsertObj.currency = currency;
    }

    // Insert group matching database schema: name, category, description, owner_id
    const { data: group, error: groupErr } = await supabase
      .from('groups')
      .insert(groupInsertObj)
      .select()
      .single();

    if (groupErr || !group) {
      console.error('[API POST /api/groups] Error inserting group:', groupErr);
      return NextResponse.json({ error: groupErr?.message ?? 'Error al crear el grupo' }, { status: 500 });
    }

    // Insert owner membership record in group_members
    const { error: memberErr } = await supabase.from('group_members').insert({
      group_id: group.id,
      user_id: user.id,
      role: 'owner',
    });

    if (memberErr) {
      console.error('[API POST /api/groups] Error inserting owner in group_members:', memberErr);
    }

    // Insert selected friends as group members if memberIds provided
    if (memberIds && Array.isArray(memberIds)) {
      const membersToInsert = memberIds
        .filter((id): id is string => typeof id === 'string' && id.trim().length > 0 && id !== user.id)
        .map((id) => ({
          group_id: group.id,
          user_id: id,
          invited_by: user.id,
          role: 'member',
        }));

      if (membersToInsert.length > 0) {
        const { error: friendsInsertErr } = await supabase
          .from('group_members')
          .upsert(membersToInsert, { onConflict: 'group_id,user_id' });
        if (friendsInsertErr) {
          console.error('[API POST /api/groups] Error inserting memberIds into group_members:', friendsInsertErr);
        }
      }
    }

    // Insert invites if emails provided
    if (emails && Array.isArray(emails)) {
      const userEmailLower = user.email ? user.email.toLowerCase() : null;
      const invitesToInsert = emails
        .filter((e): e is string => typeof e === 'string' && e.trim().length > 0 && e.trim().toLowerCase() !== userEmailLower)
        .map((e) => ({
          group_id: group.id,
          email: e.trim().toLowerCase(),
          invited_by: user.id,
          status: 'pending',
        }));

      if (invitesToInsert.length > 0) {
        const { error: inviteErr } = await supabase.from('group_invites').insert(invitesToInsert);
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



