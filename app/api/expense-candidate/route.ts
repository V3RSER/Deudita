import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

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
 * POST /api/expense-candidate
 * Ingesta un candidato a gasto desde el Google Apps Script del usuario.
 * Recibe Authorization: Bearer <webhook_token> o sesión de usuario activa.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7).trim() : null;

    let authenticatedUserId: string | null = null;
    if (!bearerToken) {
      const userSupabase = await createClient();
      const { data: { user } } = await userSupabase.auth.getUser();
      if (!user) {
        return NextResponse.json(
          { error: 'Encabezado de autorización Bearer <webhook_token> o sesión de usuario activa requerida' },
          { status: 401 }
        );
      }
      authenticatedUserId = user.id;
    }

    const body = await req.json().catch(() => ({}));
    const {
      gmail_message_id,
      gmailMessageId,
      template_id,
      templateId,
      amount,
      currency = 'COP',
      merchant,
      entity,
      sourceAccount,
      source_account,
      date,
      time,
      received_at,
      receivedAt,
    } = body;

    const finalMessageId = String(gmail_message_id || gmailMessageId || '').trim();
    if (!finalMessageId) {
      return NextResponse.json(
        { error: 'gmail_message_id es obligatorio' },
        { status: 400 }
      );
    }

    const finalTemplateId = template_id || templateId || null;
    const finalSourceAccount = sourceAccount || source_account || null;
    const finalReceivedAt = received_at || receivedAt || new Date().toISOString();
    const finalCurrency = currency || 'COP';

    // Parse amount to number
    let numericAmount = 0;
    if (typeof amount === 'number') {
      numericAmount = amount;
    } else if (typeof amount === 'string') {
      // Remove symbols and handle commas/dots
      const cleanStr = amount.replace(/[^0-9.,]/g, '').replace(/,/g, '');
      numericAmount = parseFloat(cleanStr) || 0;
    }

    const db = getDirectClient();

    // If authenticated via user session (from in-app tester simulation)
    if (authenticatedUserId) {
      const rawSnippet = `${entity || 'Simulación'}: ${merchant || 'Gasto'} por ${finalCurrency} ${numericAmount}`;

      const { data: insertedDraft, error: insertErr } = await db
        .from('expense_drafts')
        .insert({
          user_id: authenticatedUserId,
          source_type: 'gmail_ingest',
          status: 'pending',
          detected_amount: numericAmount,
          currency: finalCurrency,
          detected_merchant: merchant || null,
          concept: merchant || entity || 'Gasto detectado',
          entity: entity || null,
          source_account: finalSourceAccount,
          transaction_date: date || new Date().toISOString().split('T')[0],
          transaction_time: time || null,
          email_template_id: finalTemplateId,
          gmail_message_id: finalMessageId,
          raw_snippet: rawSnippet,
          received_at: finalReceivedAt,
        })
        .select()
        .single();

      if (insertErr) {
        console.error('[API /api/expense-candidate] Insert error for user session:', insertErr);
        return NextResponse.json({ error: insertErr.message }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        candidate_id: insertedDraft.id,
        status: insertedDraft.status,
        message: 'Borrador creado exitosamente desde la simulación',
      });
    }

    // 1. Intentar primero vía RPC segura de Postgres (SECURITY DEFINER)
    try {
      const { data: rpcData, error: rpcErr } = await db.rpc('insert_expense_candidate_for_webhook', {
        p_token: bearerToken,
        p_gmail_message_id: finalMessageId,
        p_template_id: finalTemplateId,
        p_amount: numericAmount,
        p_currency: finalCurrency,
        p_merchant: merchant || null,
        p_entity: entity || null,
        p_source_account: finalSourceAccount,
        p_date: date || new Date().toISOString().split('T')[0],
        p_time: time || null,
        p_received_at: finalReceivedAt,
      });

      if (!rpcErr && rpcData) {
        return NextResponse.json(rpcData);
      }
    } catch (rpcEx) {
      console.warn('[API /api/expense-candidate] RPC fallback triggered:', rpcEx);
    }

    // 2. Fallback: Resolución directa en email_ingest_connections
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

    const rawSnippet = `${entity || 'Notificación'}: ${merchant || 'Compra'} por ${finalCurrency} ${numericAmount}`;

    const draftData = {
      user_id: connection.user_id,
      gmail_message_id: finalMessageId,
      template_id: finalTemplateId,
      detected_amount: numericAmount,
      currency: finalCurrency,
      detected_merchant: merchant || 'Comercio no especificado',
      entity: entity || null,
      source_account: finalSourceAccount,
      detected_date: date || new Date().toISOString().split('T')[0],
      detected_time: time || null,
      raw_snippet: rawSnippet,
      confidence: 0.95,
      status: 'pending',
      created_at: finalReceivedAt,
    };

    const { data: inserted, error: draftErr } = await db
      .from('expense_drafts')
      .upsert(draftData, { onConflict: 'gmail_message_id', ignoreDuplicates: true })
      .select()
      .maybeSingle();

    if (draftErr) {
      console.error('[API /api/expense-candidate] Insert error:', draftErr);
      return NextResponse.json({ error: draftErr.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      inserted: Boolean(inserted),
      draft: inserted || draftData,
      message: 'Borrador procesado exitosamente',
    });
  } catch (err: unknown) {
    console.error('[API POST /api/expense-candidate] Error:', err);
    const message = err instanceof Error ? err.message : 'Error interno al procesar candidato de gasto';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
