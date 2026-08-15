import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    // Await params here as required in Next.js 15
    const paramsResolved = await params;
    const groupId = paramsResolved.id;

    if (authError || !user) {
      console.error('[API PUT /api/groups/:id] Unauthorized user:', authError);
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await req.json().catch(() => null);

    if (!body) {
      return NextResponse.json({ error: 'Cuerpo de la petición inválido' }, { status: 400 });
    }

    const { name, category, description, imageUrl, currency } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'El nombre del grupo es requerido' }, { status: 400 });
    }

    // Verify ownership
    const { data: group, error: fetchErr } = await supabase
      .from('groups')
      .select('owner_id')
      .eq('id', groupId)
      .single();

    if (fetchErr || !group) {
      return NextResponse.json({ error: 'Grupo no encontrado' }, { status: 404 });
    }

    if (group.owner_id !== user.id) {
      return NextResponse.json({ error: 'No tienes permiso para editar este grupo' }, { status: 403 });
    }

    // Combine description and optional imageUrl if provided
    let finalDesc = typeof description === 'string' && description.trim().length > 0 ? description.trim() : '';
    if (imageUrl && typeof imageUrl === 'string' && imageUrl.trim().length > 0) {
      finalDesc = finalDesc ? `${finalDesc} [img:${imageUrl.trim()}]` : `[img:${imageUrl.trim()}]`;
    }

    const groupUpdateObj: Record<string, any> = {
      name: name.trim(),
      category: typeof category === 'string' && category.trim().length > 0 ? category.trim() : 'home',
      description: finalDesc ? finalDesc : null,
    };
    if (currency) {
      groupUpdateObj.currency = currency;
    }

    const { data: updatedGroup, error: updateErr } = await supabase
      .from('groups')
      .update(groupUpdateObj)
      .eq('id', groupId)
      .select()
      .single();

    if (updateErr || !updatedGroup) {
      console.error('[API PUT /api/groups/:id] Error updating group:', updateErr);
      return NextResponse.json({ error: updateErr?.message ?? 'Error al actualizar el grupo' }, { status: 500 });
    }

    return NextResponse.json(updatedGroup);
  } catch (err: unknown) {
    console.error('[API PUT /api/groups/:id] Unhandled error:', err);
    const message = err instanceof Error ? err.message : 'Error interno al actualizar el grupo';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
