import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getDirectClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error('Supabase URL y Anon Key son requeridos');
  }
  return createSupabaseClient(url, anonKey);
}

/**
 * GET /api/email-templates
 * - Con Authorization: Bearer <webhook_token>: devuelve plantillas activas excluyendo las desactivadas por el usuario.
 * - Con sesión de Supabase Auth: devuelve las plantillas activas.
 */
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7).trim() : null;

    // 1. Flujo Webhook con Bearer Token (Google Apps Script)
    if (bearerToken) {
      const db = getDirectClient();

      // Intentar primero vía RPC segura con SECURITY DEFINER
      try {
        const { data: rpcData, error: rpcErr } = await db.rpc('get_email_templates_for_webhook', {
          p_token: bearerToken,
        });

        if (!rpcErr && rpcData) {
          return NextResponse.json(rpcData);
        }
      } catch (rpcEx) {
        console.warn('[API /api/email-templates] RPC fallback triggered:', rpcEx);
      }

      // Fallback: consulta directa a email_ingest_connections
      const { data: connection, error: connErr } = await db
        .from('email_ingest_connections')
        .select('user_id, status')
        .eq('webhook_token', bearerToken)
        .eq('status', 'active')
        .maybeSingle();

      if (connErr || !connection) {
        return NextResponse.json(
          { error: 'Token de webhook inválido o inactivo' },
          { status: 401 }
        );
      }

      // Actualizar last_sync_at
      await db
        .from('email_ingest_connections')
        .update({ last_sync_at: new Date().toISOString() })
        .eq('user_id', connection.user_id);

      // Obtener preferencias desactivadas
      const { data: disabledPrefs } = await db
        .from('user_template_preferences')
        .select('template_id')
        .eq('user_id', connection.user_id)
        .eq('enabled', false);

      const disabledIds = new Set((disabledPrefs || []).map((p) => p.template_id));

      // Obtener plantillas activas
      const { data: templates, error: tmplErr } = await db
        .from('email_templates')
        .select('*')
        .eq('active', true)
        .order('created_at', { ascending: true });

      if (tmplErr) {
        return NextResponse.json({ error: tmplErr.message }, { status: 500 });
      }

      const filteredTemplates = (templates || []).filter((t) => !disabledIds.has(t.id));
      return NextResponse.json(filteredTemplates);
    }

    // 2. Flujo con Sesión de Usuario (Supabase Auth)
    const supabase = await createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json(
        { error: 'No autorizado. Se requiere Bearer token o sesión activa.' },
        { status: 401 }
      );
    }

    const { data: templates, error: fetchErr } = await supabase
      .from('email_templates')
      .select('*')
      .eq('active', true)
      .order('created_at', { ascending: false });

    if (fetchErr) {
      return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    }

    return NextResponse.json(templates || []);
  } catch (err: unknown) {
    console.error('[API GET /api/email-templates] Error:', err);
    const message = err instanceof Error ? err.message : 'Error interno al consultar plantillas';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/email-templates
 * Crea una plantilla de forma manual o tras asistente de IA.
 * Requiere sesión de usuario normal.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    // Verificar que el usuario tenga autorización de tester con Google
    const cookieStore = await cookies();
    const token =
      req.headers.get('x-google-token') ||
      cookieStore.get('google_provider_token')?.value ||
      (user.user_metadata?.google_provider_token as string | undefined);

    const isAuthorizedTester = Boolean(
      token ||
      user.user_metadata?.is_tester ||
      user.email === 'wizdeiko@gmail.com'
    );

    if (!isAuthorizedTester) {
      return NextResponse.json(
        { error: 'Acceso restringido: Solo los testers autorizados con Google pueden registrar o modificar plantillas en la base de datos.' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const {
      name,
      sender_pattern,
      subject_pattern,
      match_pattern,
      amount_regex,
      merchant_regex,
      date_regex,
      date_format,
      entity_name,
      entity_id,
      expense_type_id,
      default_currency = 'COP',
      currency_regex,
      source_account_regex,
      time_regex,
    } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'El nombre de la plantilla es obligatorio' }, { status: 400 });
    }

    if (!amount_regex || !amount_regex.trim()) {
      return NextResponse.json({ error: 'El patrón amount_regex es obligatorio' }, { status: 400 });
    }

    const templatePayload = {
      name: name.trim(),
      sender_pattern: sender_pattern?.trim() || null,
      subject_pattern: subject_pattern?.trim() || null,
      match_pattern: match_pattern?.trim() || null,
      amount_regex: amount_regex.trim(),
      merchant_regex: merchant_regex?.trim() || null,
      date_regex: date_regex?.trim() || null,
      date_format: date_format?.trim() || 'DD/MM/YYYY',
      entity_name: entity_name?.trim() || null,
      entity_id: entity_id?.trim() || null,
      expense_type_id: expense_type_id?.trim() || null,
      default_currency: default_currency?.trim() || 'COP',
      currency_regex: currency_regex?.trim() || null,
      source_account_regex: source_account_regex?.trim() || null,
      time_regex: time_regex?.trim() || null,
      created_by: user.id,
      active: true,
    };

    const { data: newTemplate, error: insertErr } = await supabase
      .from('email_templates')
      .insert(templatePayload)
      .select()
      .single();

    if (insertErr) {
      console.error('[API POST /api/email-templates] Insert error:', insertErr);
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    return NextResponse.json(newTemplate, { status: 201 });
  } catch (err: unknown) {
    console.error('[API POST /api/email-templates] Error:', err);
    const message = err instanceof Error ? err.message : 'Error interno al crear plantilla';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
