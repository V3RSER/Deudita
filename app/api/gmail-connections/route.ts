import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

function generateWebhookToken(): string {
  return crypto.randomBytes(24).toString('hex');
}

function getBaseAppsScriptUrl(): string {
  const envUrl = process.env.GOOGLE_APPS_SCRIPT_URL || process.env.GMAIL_APPS_SCRIPT_URL;
  if (envUrl && envUrl.trim()) {
    return envUrl.trim();
  }

  const scriptId = process.env.GOOGLE_APPS_SCRIPT_ID || process.env.GMAIL_APPS_SCRIPT_ID || 'AKfycbz_GMAIL_INTEGRATION_SCRIPT_ID';
  return `https://script.google.com/macros/s/${scriptId}/exec`;
}

/**
 * GET /api/gmail-connections
 * Consulta la conexión actual del usuario.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { data: connection } = await supabase
      .from('email_ingest_connections')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://deudita.app';
    const baseScriptUrl = getBaseAppsScriptUrl();

    if (!connection) {
      return NextResponse.json({
        connected: false,
        connection: null,
      });
    }

    const appsScriptUrl = `${baseScriptUrl}?token=${connection.webhook_token}`;

    return NextResponse.json({
      connected: connection.status === 'active',
      connection: {
        ...connection,
        apps_script_url: appsScriptUrl,
        templates_url: `${appUrl}/api/email-templates`,
        webhook_url: `${appUrl}/api/expense-candidate`,
      },
    });
  } catch (err: unknown) {
    console.error('[API GET /api/gmail-connections] Error:', err);
    const message = err instanceof Error ? err.message : 'Error interno';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/gmail-connections
 * Activa la integración de Gmail para el usuario generando o reutilizando su webhook_token,
 * y devuelve la URL completa del Apps Script Web App con el parámetro ?token=<webhook_token>.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const shouldRotate = Boolean(body.regenerateToken);

    // 1. Verificar si ya existe conexión
    const { data: existingConn } = await supabase
      .from('email_ingest_connections')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    let webhookToken = existingConn?.webhook_token;

    if (!webhookToken || shouldRotate) {
      webhookToken = generateWebhookToken();
    }

    const upsertData = {
      user_id: user.id,
      webhook_token: webhookToken,
      status: 'active',
      last_sync_at: existingConn?.last_sync_at || null,
    };

    const { data: connection, error: upsertErr } = await supabase
      .from('email_ingest_connections')
      .upsert(upsertData, { onConflict: 'user_id' })
      .select()
      .single();

    if (upsertErr) {
      console.error('[API POST /api/gmail-connections] Upsert error:', upsertErr);
      return NextResponse.json({ error: upsertErr.message }, { status: 500 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://deudita.app';
    const baseScriptUrl = getBaseAppsScriptUrl();
    const appsScriptUrl = `${baseScriptUrl}?token=${webhookToken}`;

    return NextResponse.json({
      success: true,
      connected: true,
      webhook_token: webhookToken,
      apps_script_url: appsScriptUrl,
      webhook_url: `${appUrl}/api/expense-candidate`,
      templates_url: `${appUrl}/api/email-templates`,
      connection,
    });
  } catch (err: unknown) {
    console.error('[API POST /api/gmail-connections] Error:', err);
    const message = err instanceof Error ? err.message : 'Error interno al conectar Gmail';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/gmail-connections
 * Desactiva la integración de Gmail para el usuario.
 */
export async function DELETE() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { error: updateErr } = await supabase
      .from('email_ingest_connections')
      .update({ status: 'inactive' })
      .eq('user_id', user.id);

    if (updateErr) {
      console.error('[API DELETE /api/gmail-connections] Update error:', updateErr);
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      connected: false,
      message: 'Conexión con Gmail desactivada con éxito',
    });
  } catch (err: unknown) {
    console.error('[API DELETE /api/gmail-connections] Error:', err);
    const message = err instanceof Error ? err.message : 'Error interno al desactivar Gmail';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

