import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError) {
      console.error('[API POST /api/groups] Auth error:', authError);
      return NextResponse.json({ error: authError.message }, { status: 401 });
    }

    if (!user) {
      console.error('[API POST /api/groups] Unauthorized: No active user session');
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await req.json().catch((err) => {
      console.error('[API POST /api/groups] Invalid JSON body:', err);
      return null;
    });

    if (!body) {
      return NextResponse.json({ error: 'Cuerpo de la petición inválido' }, { status: 400 });
    }

    const { name, category, description, emails } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      console.error('[API POST /api/groups] Missing or invalid group name:', name);
      return NextResponse.json({ error: 'El nombre del grupo es requerido' }, { status: 400 });
    }

    // Ensure profile exists in profiles table to prevent foreign key constraint issues
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', user.id)
      .maybeSingle();

    if (!existingProfile) {
      const fullName = user.user_metadata?.full_name ?? user.user_metadata?.name ?? (user.email ? user.email.split('@')[0] : 'Usuario');
      const avatarUrl = user.user_metadata?.avatar_url ?? user.user_metadata?.picture ?? '';

      const { error: profileErr } = await supabase.from('profiles').insert({
        id: user.id,
        email: user.email ?? '',
        full_name: fullName,
        avatar_url: avatarUrl,
      });

      if (profileErr) {
        console.error('[API POST /api/groups] Error inserting user profile:', profileErr);
      }
    }

    // Create group
    const groupPayload: { name: string; category?: string; description?: string | null; owner_id: string } = {
      name: name.trim(),
      description: description ? description.trim() : null,
      owner_id: user.id,
    };

    if (category) {
      groupPayload.category = category;
    }

    let { data: group, error: groupErr } = await supabase
      .from('groups')
      .insert(groupPayload)
      .select()
      .single();

    if (groupErr && (groupErr.code === 'PGRST204' || (groupErr.message && groupErr.message.toLowerCase().includes('category')))) {
      console.warn('[API POST /api/groups] Column category missing from groups schema, retrying insert without category');
      delete groupPayload.category;
      const retryResult = await supabase
        .from('groups')
        .insert(groupPayload)
        .select()
        .single();
      group = retryResult.data;
      groupErr = retryResult.error;
    }

    if (groupErr) {
      console.error('[API POST /api/groups] Error inserting group into Supabase:', groupErr);
      return NextResponse.json({ error: groupErr.message }, { status: 500 });
    }

    // Add owner to members
    const { error: memberErr } = await supabase.from('group_members').insert({
      group_id: group.id,
      user_id: user.id,
      role: 'owner',
    });

    if (memberErr) {
      console.error('[API POST /api/groups] Error inserting owner into group_members:', memberErr);
    }

    // Add invites
    if (emails && Array.isArray(emails)) {
      for (const email of emails) {
        if (typeof email === 'string' && email.trim().length > 0 && email !== user.email) {
          const { error: inviteErr } = await supabase.from('group_invites').insert({
            group_id: group.id,
            email: email.trim().toLowerCase(),
            invited_by: user.id,
            status: 'pending',
          });
          if (inviteErr) {
            console.error('[API POST /api/groups] Error creating invite for email:', email, inviteErr);
          }
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

