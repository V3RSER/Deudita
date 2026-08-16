import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const db = supabase;
    const body = await req.json().catch(() => null);

    if (!body || !body.fullName || typeof body.fullName !== 'string' || !body.fullName.trim()) {
      return NextResponse.json({ error: 'El nombre del amigo es obligatorio' }, { status: 400 });
    }

    const fullName = body.fullName.trim();
    const rawEmail = body.email ? String(body.email).trim().toLowerCase() : null;
    const email = rawEmail && rawEmail.length > 0 ? rawEmail : null;

    const newId = crypto.randomUUID();

    const profilePayload: Record<string, any> = {
      id: newId,
      full_name: fullName,
      email,
      is_temp: true,
      created_by: user.id,
    };

    let { data: newProfile, error } = await db
      .from('profiles')
      .insert(profilePayload)
      .select('*')
      .single();

    // Fallback if created_by column does not exist in schema
    if (error && error.message?.includes('created_by')) {
      delete profilePayload.created_by;
      const retryResult = await db
        .from('profiles')
        .insert(profilePayload)
        .select('*')
        .single();
      newProfile = retryResult.data;
      error = retryResult.error;
    }

    if (error || !newProfile) {
      console.error('[API POST /api/friends] Error creating profile:', error);
      return NextResponse.json({ error: error?.message ?? 'Error al agregar el amigo' }, { status: 500 });
    }

    return NextResponse.json({ profile: newProfile });
  } catch (err: unknown) {
    console.error('[API POST /api/friends] Error:', err);
    const message = err instanceof Error ? err.message : 'Error al procesar la solicitud';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
