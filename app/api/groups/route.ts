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

    // Ensure user profile exists in public.profiles table (ignore RLS/conflict errors if trigger created it)
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
        console.log('[API POST /api/groups] Profile check notice:', profileErr.message);
      }
    }

    // Attempt group insertion with optional fields
    const fullGroupPayload: Record<string, unknown> = {
      name: name.trim(),
      owner_id: user.id,
    };
    if (category) fullGroupPayload.category = category;
    if (description && description.trim().length > 0) fullGroupPayload.description = description.trim();

    let { data: group, error: groupErr } = await supabase
      .from('groups')
      .insert(fullGroupPayload)
      .select()
      .single();

    // Fallback if schema does not have optional columns (e.g. category, description)
    if (groupErr && (groupErr.code === 'PGRST204' || groupErr.message?.includes('schema cache') || groupErr.message?.includes('column'))) {
      console.warn('[API POST /api/groups] Schema cache mismatch for optional columns, falling back to minimal group insert');
      const minimalInsert = await supabase
        .from('groups')
        .insert({
          name: name.trim(),
          owner_id: user.id,
        })
        .select()
        .single();

      if (minimalInsert.data) {
        group = {
          category: category ?? 'home',
          description: description ?? null,
          ...minimalInsert.data,
        };
        groupErr = null;
      } else {
        groupErr = minimalInsert.error;
      }
    }

    if (groupErr || !group) {
      console.error('[API POST /api/groups] Error inserting group into Supabase:', groupErr);
      return NextResponse.json({ error: groupErr?.message ?? 'Error al crear el grupo' }, { status: 500 });
    }

    // Add owner to group_members
    let { error: memberErr } = await supabase.from('group_members').insert({
      group_id: group.id,
      user_id: user.id,
      role: 'owner',
    });

    if (memberErr && (memberErr.code === 'PGRST204' || memberErr.message?.includes('column'))) {
      const retryMember = await supabase.from('group_members').insert({
        group_id: group.id,
        user_id: user.id,
      });
      memberErr = retryMember.error;
    }

    if (memberErr) {
      console.error('[API POST /api/groups] Error inserting owner into group_members:', memberErr);
    }

    // Add invitations if any provided
    if (emails && Array.isArray(emails)) {
      for (const email of emails) {
        if (typeof email === 'string' && email.trim().length > 0 && email !== user.email) {
          const cleanEmail = email.trim().toLowerCase();
          let { error: inviteErr } = await supabase.from('group_invites').insert({
            group_id: group.id,
            email: cleanEmail,
            invited_by: user.id,
            status: 'pending',
          });

          if (inviteErr && (inviteErr.code === 'PGRST204' || inviteErr.message?.includes('column'))) {
            const retryInvite = await supabase.from('group_invites').insert({
              group_id: group.id,
              email: cleanEmail,
              invited_by: user.id,
            });
            inviteErr = retryInvite.error;
          }

          if (inviteErr) {
            console.error('[API POST /api/groups] Error creating invite for email:', cleanEmail, inviteErr);
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


