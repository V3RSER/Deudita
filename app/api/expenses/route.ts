import {NextRequest, NextResponse} from 'next/server';
import {createClient as createSupabaseClient} from '@supabase/supabase-js';
import {createClient} from '@/lib/supabase/server';
import {notifyExpenseCreated} from '@/lib/notifications';
import {normalizeSplitsToTotal} from '@/lib/balance-utils';

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
 * POST /api/expenses
 * Endpoint unificado para la creación de gastos:
 * - Creación manual desde la aplicación web (sesión de usuario)
 * - Ingesta automática desde Google Apps Script (Bearer <webhook_token>)
 * - Creación de gastos en modo borrador ("sin grupo" / pendientes de asignación)
 * - Soporta gastos sencillos o facturas desglosadas (items)
 */
export async function POST(req: NextRequest) {
    try {
        const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');
        const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7).trim() : null;

        let targetUserId: string | null = null;
        let isWebhookAuth = false;
        let clientSupabase: any = null;

        if (bearerToken) {
            // 1. Autenticación por webhook_token (Google Apps Script)
            const directClient = getDirectClient();
            const {data: connection, error: connErr} = await directClient
                .from('email_ingest_connections')
                .select('user_id, status')
                .eq('webhook_token', bearerToken)
                .eq('status', 'active')
                .maybeSingle();

            if (connErr || !connection) {
                return NextResponse.json(
                    {error: 'Token de webhook inválido o inactivo'},
                    {status: 401}
                );
            }

            targetUserId = connection.user_id;
            isWebhookAuth = true;
            clientSupabase = directClient;

            // Actualizar timestamp de última sincronización
            await directClient
                .from('email_ingest_connections')
                .update({last_sync_at: new Date().toISOString()})
                .eq('user_id', connection.user_id);
        } else {
            // 2. Autenticación por sesión activa de usuario
            const serverClient = await createClient();
            const {data: {user}, error: authErr} = await serverClient.auth.getUser();

            if (authErr || !user) {
                console.error('[API /api/expenses] Auth error:', authErr);
                return NextResponse.json({error: 'No autorizado'}, {status: 401});
            }

            targetUserId = user.id;
            clientSupabase = serverClient;
        }

        if (!targetUserId) {
            return NextResponse.json({error: 'Usuario no identificado'}, {status: 401});
        }

        const body = await req.json().catch(() => ({}));
        const rawExpense = body.expense || body;
        const rawItems = Array.isArray(body.items) ? body.items : (Array.isArray(rawExpense.items) ? rawExpense.items : []);
        const rawSplits = Array.isArray(body.splits) ? body.splits : (Array.isArray(rawExpense.splits) ? rawExpense.splits : []);

        const gmailMessageId = String(
            rawExpense.gmail_message_id || body.gmail_message_id || body.gmailMessageId || ''
        ).trim() || null;

        const templateId = rawExpense.template_id || body.template_id || body.templateId || null;
        const sourceAccount = rawExpense.source_account || rawExpense.sourceAccount || body.source_account || body.sourceAccount || null;
        const entity = rawExpense.entity || body.entity || null;
        const expenseType = rawExpense.expense_type || rawExpense.expenseType || body.expense_type || body.expenseType || null;
        const currency = rawExpense.currency || body.currency || 'COP';
        const receiptUrl = rawExpense.receipt_url || body.receipt_url || null;
        const category = rawExpense.category || body.category || null;
        const notes = rawExpense.notes || body.notes || null;

        // Prevención de duplicados si viene con gmail_message_id
        if (gmailMessageId) {
            const {data: existingExpense} = await clientSupabase
                .from('expenses')
                .select('*, items:expense_items(*), splits:expense_splits(*)')
                .eq('gmail_message_id', gmailMessageId)
                .maybeSingle();

            if (existingExpense) {
                return NextResponse.json({
                    success: true,
                    inserted: false,
                    expense_id: existingExpense.id,
                    id: existingExpense.id,
                    expense: existingExpense,
                    is_draft: existingExpense.is_draft,
                    message: 'Gasto ya registrado previamente',
                });
            }
        }

        // Parsing del monto
        const rawAmount = rawExpense.total_amount ?? rawExpense.amount ?? body.total_amount ?? body.amount ?? 0;
        let parsedAmount = 0;
        if (typeof rawAmount === 'number') {
            parsedAmount = rawAmount;
        } else if (typeof rawAmount === 'string') {
            const cleanStr = rawAmount.replace(/[^0-9.,]/g, '').replace(/,/g, '');
            parsedAmount = parseFloat(cleanStr) || 0;
        }

        // Descripción / Concepto / Comercio
        const description = String(
            rawExpense.description || body.description || rawExpense.merchant || body.merchant || rawExpense.concept || body.concept || entity || 'Gasto'
        ).trim();

        // Fecha y hora
        const expenseDate = rawExpense.expense_date || body.expense_date || body.date || new Date().toISOString().split('T')[0];
        const expenseTime = rawExpense.expense_time || body.expense_time || body.time || null;

        // Grupo
        let rawGroupId = rawExpense.group_id !== undefined ? rawExpense.group_id : (body.group_id !== undefined ? body.group_id : null);
        if (rawGroupId === 'none' || rawGroupId === '') rawGroupId = null;

        // Modo borrador:
        // Si viene de script o no tiene grupo o se solicita explícitamente is_draft
        const isDraft = typeof rawExpense.is_draft === 'boolean'
            ? rawExpense.is_draft
            : (typeof body.is_draft === 'boolean'
                ? body.is_draft
                : (isWebhookAuth || Boolean(gmailMessageId) || !rawGroupId));

        const source = rawExpense.source || body.source || (gmailMessageId ? 'gmail' : 'manual');
        const paidBy = rawExpense.paid_by || body.paid_by || targetUserId;
        const createdBy = targetUserId;
        const receivedAt = body.received_at || body.receivedAt || new Date().toISOString();
        const rawSnippet = body.raw_snippet || `${entity || 'Notificación'}: ${description} por ${currency} ${parsedAmount}`;

        // Si es una llamada desde el webhook y queremos usar la función Postgres optimizada
        if (isWebhookAuth && bearerToken) {
            const {data: rpcData, error: rpcErr} = await clientSupabase.rpc('insert_expense_for_webhook', {
                p_token: bearerToken,
                p_gmail_message_id: gmailMessageId,
                p_template_id: templateId,
                p_amount: parsedAmount,
                p_currency: currency,
                p_merchant: description,
                p_entity: entity,
                p_source_account: sourceAccount,
                p_date: expenseDate,
                p_time: expenseTime,
                p_concept: description,
                p_received_at: receivedAt,
                p_expense_type: expenseType,
                p_items: rawItems,
            });

            if (!rpcErr && rpcData) {
                const expenseId = rpcData.expense_id || rpcData.id;
                const {data: fullExpense} = await clientSupabase
                    .from('expenses')
                    .select('*, items:expense_items(*), splits:expense_splits(*)')
                    .eq('id', expenseId)
                    .maybeSingle();

                return NextResponse.json({
                    ...rpcData,
                    id: expenseId,
                    expense: fullExpense,
                });
            }
            console.warn('[API /api/expenses] Webhook RPC fallback a inserción directa:', rpcErr?.message);
        }

        // Parseo de ítems
        const parsedItems = Array.isArray(rawItems) && rawItems.length > 0
            ? rawItems.map((it: any, index: number) => ({
                id: index + 1,
                description: String(it.description || it.desc || `Artículo ${index + 1}`).trim(),
                amount: typeof it.amount === 'number'
                    ? it.amount
                    : parseFloat(String(it.amount || 0).replace(/[^0-9.]/g, '')) || 0,
            }))
            : [];

        const isItemized = parsedItems.length > 0;
        const splitConfig = rawExpense.split_config || (isItemized
            ? {
                version: 1,
                splitType: 'itemized',
                mode: 'itemized',
                items: parsedItems.map((it) => ({
                    id: it.id,
                    desc: it.description,
                    quantity: '1',
                    amount: String(it.amount),
                    amountType: 'total',
                    assignedTo: [paidBy],
                })),
            }
            : {
                version: 1,
                splitType: 'equal',
                mode: 'quick',
            });

        // Fallback: si no es borrador pero no tiene grupo, asociar a Gastos Personales
        if (!rawGroupId && !isDraft) {
            let {data: personalGroup} = await clientSupabase
                .from('groups')
                .select('id')
                .eq('owner_id', targetUserId)
                .eq('name', 'Gastos Personales')
                .maybeSingle();

            if (!personalGroup) {
                const {data: createdGroup} = await clientSupabase
                    .from('groups')
                    .insert({name: 'Gastos Personales', owner_id: targetUserId, currency: currency || 'COP'})
                    .select('id')
                    .single();

                if (createdGroup) {
                    personalGroup = createdGroup;
                    await clientSupabase.from('group_members').insert({
                        group_id: createdGroup.id,
                        user_id: targetUserId,
                        role: 'admin'
                    });
                }
            }

            if (personalGroup) {
                rawGroupId = personalGroup.id;
            }
        }

        // Construcción del payload de inserción para expenses
        const expenseInsertPayload: Record<string, any> = {
            group_id: rawGroupId,
            paid_by: paidBy,
            total_amount: parsedAmount,
            description,
            expense_date: expenseDate,
            source,
            receipt_url: receiptUrl,
            created_by: createdBy,
            is_draft: isDraft,
            source_account: sourceAccount,
            entity,
            currency,
            expense_type: expenseType,
            gmail_message_id: gmailMessageId,
            template_id: templateId,
            raw_snippet: rawSnippet,
            split_config: splitConfig,
        };

        if (expenseTime) expenseInsertPayload.expense_time = expenseTime;
        if (category) expenseInsertPayload.category = category;
        if (notes) expenseInsertPayload.notes = notes;

        let {data: newExpense, error: expErr} = await clientSupabase
            .from('expenses')
            .insert(expenseInsertPayload)
            .select()
            .single();

        // Fallback si alguna columna opcional no existe
        if (expErr && (expErr.code === 'PGRST204' || expErr.message?.includes('category') || expErr.message?.includes('notes') || expErr.message?.includes('expense_time'))) {
            console.warn('[API /api/expenses] Reintentando inserción sin columnas opcionales:', expErr.message);
            delete expenseInsertPayload.category;
            delete expenseInsertPayload.notes;
            delete expenseInsertPayload.expense_time;

            const fallbackRes = await clientSupabase
                .from('expenses')
                .insert(expenseInsertPayload)
                .select()
                .single();

            newExpense = fallbackRes.data;
            expErr = fallbackRes.error;
        }

        if (expErr || !newExpense) {
            console.error('[API /api/expenses] Supabase insert expense error:', expErr);
            return NextResponse.json({error: expErr?.message ?? 'Error al crear el gasto'}, {status: 500});
        }

        // Insertar ítems desglosados si existen
        if (parsedItems.length > 0) {
            const itemsToInsert = parsedItems.map((i: any) => ({
                expense_id: newExpense.id,
                description: i.description,
                amount: i.amount,
            }));
            const {error: itemsErr} = await clientSupabase.from('expense_items').insert(itemsToInsert);
            if (itemsErr) {
                console.error('[API /api/expenses] Supabase insert items error:', itemsErr);
            }
        }

        // Insertar divisiones (splits)
        let insertedSplits: any[] = [];
        if (rawSplits.length > 0) {
            const normalizedSplits = normalizeSplitsToTotal(
                parsedAmount,
                rawSplits.map((s: any) => ({
                    user_id: s.user_id,
                    amount_owed: typeof s.amount_owed === 'number' ? s.amount_owed : parseFloat(String(s.amount_owed).replace(/[^0-9.]/g, '')) || 0,
                })),
                paidBy
            );

            const splitsToInsert = normalizedSplits.map((s) => ({
                expense_id: newExpense.id,
                user_id: s.user_id,
                amount_owed: s.amount_owed,
            }));

            const {error: splitsErr} = await clientSupabase.from('expense_splits').insert(splitsToInsert);
            if (splitsErr) {
                console.error('[API /api/expenses] Error al insertar splits:', splitsErr);
                if (!isDraft && rawGroupId) {
                    await clientSupabase.from('expense_items').delete().eq('expense_id', newExpense.id);
                    await clientSupabase.from('expenses').delete().eq('id', newExpense.id);
                    return NextResponse.json({error: 'Error al registrar la distribución del gasto'}, {status: 500});
                }
            } else {
                insertedSplits = splitsToInsert;
            }
        }

        // Notificaciones solo para gastos confirmados asignados a un grupo
        if (!isDraft && rawGroupId && insertedSplits.length > 0) {
            try {
                void notifyExpenseCreated(clientSupabase, {
                    creatorId: createdBy,
                    expenseId: newExpense.id,
                    description: newExpense.description || 'Gasto',
                    totalAmount: parsedAmount,
                    groupId: rawGroupId,
                    currency,
                    splits: insertedSplits.map((s) => ({
                        user_id: s.user_id,
                        amount_owed: s.amount_owed,
                    })),
                });
            } catch (notifErr) {
                console.warn('[API /api/expenses] Warning triggering notifications:', notifErr);
            }
        }

        const {data: fullExpense} = await clientSupabase
            .from('expenses')
            .select('*, items:expense_items(*), splits:expense_splits(*)')
            .eq('id', newExpense.id)
            .single();

        const returnedExpense = fullExpense ?? newExpense;
        return NextResponse.json({
            success: true,
            inserted: true,
            id: newExpense.id,
            expense_id: newExpense.id,
            ...returnedExpense,
            expense: returnedExpense,
            split_config: splitConfig,
            is_draft: isDraft,
        });
    } catch (err: unknown) {
        console.error('[API /api/expenses] Unhandled error:', err);
        const message = err instanceof Error ? err.message : 'Error interno al guardar gasto';
        return NextResponse.json({error: message}, {status: 500});
    }
}
