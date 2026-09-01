import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/user-template-preferences
 * Devuelve todas las plantillas activas con la bandera `enabled` para el usuario actual.
 * (Modelo por excepción: si no hay fila en user_template_preferences, enabled = true).
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    // 1. Obtener todas las plantillas activas
    const { data: templates, error: tmplErr } = await supabase
      .from('email_templates')
      .select('*')
      .eq('active', true)
      .order('created_at', { ascending: true });

    if (tmplErr) {
      return NextResponse.json({ error: tmplErr.message }, { status: 500 });
    }

    // 2. Obtener las excepciones del usuario en user_template_preferences
    const { data: prefs, error: prefsErr } = await supabase
      .from('user_template_preferences')
      .select('template_id, enabled')
      .eq('user_id', user.id);

    if (prefsErr) {
      console.warn('[API /api/user-template-preferences] Prefs error:', prefsErr);
    }

    const prefMap = new Map<string, boolean>();
    (prefs || []).forEach((p) => {
      prefMap.set(p.template_id, p.enabled);
    });

    // Mapear con enabled por defecto true
    const templatesWithStatus = (templates || []).map((t) => ({
      ...t,
      enabled: prefMap.has(t.id) ? prefMap.get(t.id)! : true,
    }));

    return NextResponse.json({
      templates: templatesWithStatus,
    });
  } catch (err: unknown) {
    console.error('[API GET /api/user-template-preferences] Error:', err);
    const message = err instanceof Error ? err.message : 'Error interno';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PUT /api/user-template-preferences
 * Actualiza el estado enabled de una plantilla para el usuario autenticado.
 * Body: { templateId: string, enabled: boolean }
 */
export async function PUT(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const templateId = body.templateId || body.template_id;
    const enabled = typeof body.enabled === 'boolean' ? body.enabled : true;

    if (!templateId) {
      return NextResponse.json(
        { error: 'templateId es obligatorio' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('user_template_preferences')
      .upsert(
        {
          user_id: user.id,
          template_id: templateId,
          enabled,
        },
        { onConflict: 'user_id,template_id' }
      )
      .select()
      .single();

    if (error) {
      console.error('[API PUT /api/user-template-preferences] Upsert error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      preference: data,
      templateId,
      enabled,
    });
  } catch (err: unknown) {
    console.error('[API PUT /api/user-template-preferences] Error:', err);
    const message = err instanceof Error ? err.message : 'Error interno';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
