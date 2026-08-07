import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();

    if (authErr || !user) {
      console.error('[API /api/groups/invite] Auth error:', authErr);
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { groupId, email } = await req.json();

    if (!groupId || !email) {
      return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 });
    }

    const { error } = await supabase.from('group_invites').insert({
      group_id: groupId,
      email: email.trim().toLowerCase(),
      invited_by: user.id,
      status: 'pending'
    });

    if (error) {
      console.error('[API /api/groups/invite] Supabase insert invite error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error('[API /api/groups/invite] Unhandled error:', err);
    const message = err instanceof Error ? err.message : 'Error interno';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

