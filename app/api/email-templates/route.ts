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

type EntityPatternRow = {
  id: string;
  entity_id: string;
  pattern: string;
  created_at?: string;
};

/**
 * Obtiene todos los patrones de entidad agrupados por entity_id.
 * Se usa solo en el fallback del GET para mantener el mismo contrato
 * que entrega el RPC get_email_templates_for_webhook().
 */
async function attachEntityEmailPatterns(
  db: ReturnType<typeof getDirectClient>,
  templates: Array<Record<string, any>>
) {
  if (!templates.length) return templates;

  const entityIds = Array.from(
    new Set(
      templates
        .map((t) => t.entity_id)
        .filter((id): id is string => Boolean(id))
    )
  );

  if (!entityIds.length) {
    return templates.map((t) => ({
      ...t,
      entity_email_patterns: [],
    }));
  }

  const { data: patternRows, error } = await db
    .from('entity_email_patterns')
    .select('id, entity_id, pattern, created_at')
    .in('entity_id', entityIds)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`No se pudieron obtener los patrones de entidad: ${error.message}`);
  }

  const patternsByEntity = new Map<string, string[]>();

  for (const row of (patternRows || []) as EntityPatternRow[]) {
    const current = patternsByEntity.get(row.entity_id) || [];
    current.push(row.pattern);
    patternsByEntity.set(row.entity_id, current);
  }

  return templates.map((template) => ({
    ...template,
    entity_email_patterns: template.entity_id
      ? patternsByEntity.get(template.entity_id) || []
      : [],
  }));
}

/**
 * Inserta un patrón de entidad si todavía no existe.
 * Devuelve el patrón normalizado.
 */
async function ensureEntityEmailPattern(
  supabase: Awaited<ReturnType<typeof createClient>>,
  entityId: string,
  rawPattern: unknown
): Promise<string | null> {
  if (typeof rawPattern !== 'string' || !rawPattern.trim()) {
    return null;
  }

  const pattern = rawPattern.trim();

  const { data: existingPatterns, error: lookupError } = await supabase
    .from('entity_email_patterns')
    .select('id, pattern')
    .eq('entity_id', entityId)
    .eq('pattern', pattern)
    .limit(1);

  if (lookupError) {
    throw new Error(`No se pudo verificar el patrón de correo de la entidad: ${lookupError.message}`);
  }

  if (existingPatterns && existingPatterns.length > 0) {
    return pattern;
  }

  const { error: insertError } = await supabase
    .from('entity_email_patterns')
    .insert({
      entity_id: entityId,
      pattern,
    });

  if (insertError) {
    throw new Error(`No se pudo guardar el patrón de correo de la entidad: ${insertError.message}`);
  }

  return pattern;
}

/**
 * GET /api/email-templates
 *
 * - Con Authorization: Bearer <webhook_token>: devuelve plantillas activas
 *   con entity_email_patterns, incluyendo preferencias del usuario.
 * - Con sesión de Supabase Auth: devuelve las plantillas activas.
 */
export async function GET(req: NextRequest) {
  try {
    const authHeader =
      req.headers.get('authorization') ||
      req.headers.get('Authorization');

    const bearerToken = authHeader?.startsWith('Bearer ')
      ? authHeader.substring(7).trim()
      : null;

    // ---------------------------------------------------------
    // 1. Flujo Webhook con Bearer Token
    // ---------------------------------------------------------
    if (bearerToken) {
      const db = getDirectClient();

      // Primero intentamos el RPC oficial.
      try {
        const { data: rpcData, error: rpcErr } = await db.rpc(
          'get_email_templates_for_webhook',
          {
            p_token: bearerToken,
          }
        );

        if (!rpcErr && rpcData) {
          return NextResponse.json(rpcData);
        }

        if (rpcErr) {
          console.warn(
            '[API /api/email-templates] RPC fallback triggered:',
            rpcErr.message
          );
        }
      } catch (rpcEx) {
        console.warn(
          '[API /api/email-templates] RPC fallback triggered:',
          rpcEx
        );
      }

      // Fallback: resolver conexión
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

      await db
        .from('email_ingest_connections')
        .update({
          last_sync_at: new Date().toISOString(),
        })
        .eq('user_id', connection.user_id);

      const { data: disabledPrefs, error: prefsErr } = await db
        .from('user_template_preferences')
        .select('template_id')
        .eq('user_id', connection.user_id)
        .eq('enabled', false);

      if (prefsErr) {
        return NextResponse.json(
          { error: `No se pudieron consultar las preferencias: ${prefsErr.message}` },
          { status: 500 }
        );
      }

      const disabledIds = new Set(
        (disabledPrefs || []).map((p) => p.template_id)
      );

      const { data: templates, error: tmplErr } = await db
        .from('email_templates')
        .select('*')
        .eq('active', true)
        .order('created_at', { ascending: true });

      if (tmplErr) {
        return NextResponse.json(
          { error: tmplErr.message },
          { status: 500 }
        );
      }

      const filteredTemplates = (templates || []).filter(
        (template) => !disabledIds.has(template.id)
      );

      const templatesWithPatterns = await attachEntityEmailPatterns(
        db,
        filteredTemplates
      );

      return NextResponse.json(templatesWithPatterns);
    }

    // ---------------------------------------------------------
    // 2. Flujo con sesión de usuario
    // ---------------------------------------------------------
    const supabase = await createClient();

    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json(
        {
          error:
            'No autorizado. Se requiere Bearer token o sesión activa.',
        },
        { status: 401 }
      );
    }

    const { data: templates, error: fetchErr } = await supabase
      .from('email_templates')
      .select('*')
      .eq('active', true)
      .order('created_at', { ascending: false });

    if (fetchErr) {
      return NextResponse.json(
        { error: fetchErr.message },
        { status: 500 }
      );
    }

    const templatesWithPatterns = await attachEntityEmailPatterns(
      supabase,
      templates || []
    );

    return NextResponse.json(templatesWithPatterns);
  } catch (err: unknown) {
    console.error('[API GET /api/email-templates] Error:', err);

    const message =
      err instanceof Error
        ? err.message
        : 'Error interno al consultar plantillas';

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/email-templates
 *
 * Crea una plantilla y, si corresponde, la entidad y su patrón
 * de correo institucional.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json(
        { error: 'No autorizado' },
        { status: 401 }
      );
    }

    const cookieStore = await cookies();

    const token =
      req.headers.get('x-google-token') ||
      cookieStore.get('google_provider_token')?.value ||
      (user.user_metadata?.google_provider_token as
        | string
        | undefined);

    if (!token) {
      return NextResponse.json(
        {
          error:
            'Acceso restringido: Solo los testers autorizados con Google pueden registrar o modificar plantillas en la base de datos.',
        },
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
      entity_email_pattern,
      expense_type_id,
      expense_type,
      default_currency = 'COP',
      currency_regex,
      source_account_regex,
      time_regex,
    } = body;

    if (!name || !String(name).trim()) {
      return NextResponse.json(
        {
          error:
            'El nombre de la plantilla es obligatorio',
        },
        { status: 400 }
      );
    }

    if (!amount_regex || !String(amount_regex).trim()) {
      return NextResponse.json(
        {
          error:
            'El patrón amount_regex es obligatorio',
        },
        { status: 400 }
      );
    }

    const cleanEntityName =
      typeof entity_name === 'string' && entity_name.trim()
        ? entity_name.trim()
        : null;

    const providedEntityId =
      typeof entity_id === 'string' && entity_id.trim()
        ? entity_id.trim()
        : null;

    // ---------------------------------------------------------
    // 1. Resolver / crear entidad
    // ---------------------------------------------------------
    let resolvedEntityId = providedEntityId;

    if (!resolvedEntityId && cleanEntityName) {
      const { data: foundEntities, error: findEntityError } =
        await supabase
          .from('entities')
          .select('id, name')
          .ilike('name', cleanEntityName);

      if (findEntityError) {
        return NextResponse.json(
          {
            error: `No se pudo buscar la entidad "${cleanEntityName}": ${findEntityError.message}`,
          },
          { status: 500 }
        );
      }

      if (foundEntities && foundEntities.length > 0) {
        resolvedEntityId = foundEntities[0].id;
      } else {
        const { data: newEntity, error: createEntErr } =
          await supabase
            .from('entities')
            .insert({
              name: cleanEntityName,
            })
            .select('id, name')
            .single();

        if (createEntErr || !newEntity) {
          return NextResponse.json(
            {
              error:
                createEntErr?.message ||
                'No se pudo crear la entidad',
            },
            { status: 500 }
          );
        }

        resolvedEntityId = newEntity.id;
      }
    }

    // Si llegó un patrón pero no tenemos entidad, no debemos
    // guardar una plantilla que Apps Script luego no podrá clasificar.
    if (
      typeof entity_email_pattern === 'string' &&
      entity_email_pattern.trim() &&
      !resolvedEntityId
    ) {
      return NextResponse.json(
        {
          error:
            'Se recibió entity_email_pattern pero no se pudo resolver una entidad.',
        },
        { status: 400 }
      );
    }

    // ---------------------------------------------------------
    // 2. Persistir patrón de entidad ANTES de la plantilla
    // ---------------------------------------------------------
    let normalizedEntityEmailPattern: string | null = null;

    try {
      if (resolvedEntityId) {
        normalizedEntityEmailPattern =
          await ensureEntityEmailPattern(
            supabase,
            resolvedEntityId,
            entity_email_pattern
          );
      }
    } catch (patternError: unknown) {
      const message =
        patternError instanceof Error
          ? patternError.message
          : String(patternError);

      return NextResponse.json(
        {
          error: message,
          step: 'entity_email_patterns',
        },
        { status: 500 }
      );
    }

    // ---------------------------------------------------------
    // 3. Resolver tipo de gasto
    // ---------------------------------------------------------
    let resolvedExpenseTypeId =
      typeof expense_type_id === 'string' && expense_type_id.trim()
        ? expense_type_id.trim()
        : null;

    if (
      !resolvedExpenseTypeId &&
      typeof expense_type === 'string' &&
      expense_type.trim()
    ) {
      const { data: expTypes, error: expTypesError } =
        await supabase
          .from('expense_types')
          .select('id, name, label');

      if (expTypesError) {
        return NextResponse.json(
          {
            error: `No se pudieron consultar los tipos de gasto: ${expTypesError.message}`,
          },
          { status: 500 }
        );
      }

      const lower = expense_type.trim().toLowerCase();

      const match = (expTypes || []).find(
        (et: {
          id: string;
          name: string;
          label: string | null;
        }) =>
          et.name.toLowerCase() === lower ||
          (et.label && et.label.toLowerCase() === lower)
      );

      if (match) {
        resolvedExpenseTypeId = match.id;
      }
    }

    // ---------------------------------------------------------
    // 4. Crear plantilla
    // ---------------------------------------------------------
    const templatePayload = {
      name: String(name).trim(),
      sender_pattern:
        typeof sender_pattern === 'string' && sender_pattern.trim()
          ? sender_pattern.trim()
          : null,
      subject_pattern:
        typeof subject_pattern === 'string' &&
        subject_pattern.trim()
          ? subject_pattern.trim()
          : null,
      match_pattern:
        typeof match_pattern === 'string' &&
        match_pattern.trim()
          ? match_pattern.trim()
          : null,
      amount_regex: String(amount_regex).trim(),
      merchant_regex:
        typeof merchant_regex === 'string' &&
        merchant_regex.trim()
          ? merchant_regex.trim()
          : null,
      date_regex:
        typeof date_regex === 'string' && date_regex.trim()
          ? date_regex.trim()
          : null,
      date_format:
        typeof date_format === 'string' && date_format.trim()
          ? date_format.trim()
          : 'DD/MM/YYYY',
      entity_name: cleanEntityName,
      entity_id: resolvedEntityId,
      expense_type_id: resolvedExpenseTypeId,
      default_currency:
        typeof default_currency === 'string' &&
        default_currency.trim()
          ? default_currency.trim()
          : 'COP',
      currency_regex:
        typeof currency_regex === 'string' &&
        currency_regex.trim()
          ? currency_regex.trim()
          : null,
      source_account_regex:
        typeof source_account_regex === 'string' &&
        source_account_regex.trim()
          ? source_account_regex.trim()
          : null,
      time_regex:
        typeof time_regex === 'string' && time_regex.trim()
          ? time_regex.trim()
          : null,
      created_by: user.id,
      active: true,
    };

    const { data: newTemplate, error: insertErr } =
      await supabase
        .from('email_templates')
        .insert(templatePayload)
        .select()
        .single();

    if (insertErr) {
      console.error(
        '[API POST /api/email-templates] Insert error:',
        insertErr
      );

      return NextResponse.json(
        {
          error: insertErr.message,
          step: 'email_templates',
          entity_email_pattern: normalizedEntityEmailPattern,
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        ...newTemplate,
        entity_email_pattern:
          normalizedEntityEmailPattern,
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    console.error('[API POST /api/email-templates] Error:', err);

    const message =
      err instanceof Error
        ? err.message
        : 'Error interno al crear plantilla';

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/email-templates
 *
 * Actualiza una plantilla y, si se proporciona entity_email_pattern,
 * garantiza que quede asociado a la entidad correspondiente.
 */
export async function PUT(req: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json(
        { error: 'No autorizado' },
        { status: 401 }
      );
    }

    const cookieStore = await cookies();

    const token =
      req.headers.get('x-google-token') ||
      cookieStore.get('google_provider_token')?.value ||
      (user.user_metadata?.google_provider_token as
        | string
        | undefined);

    if (!token) {
      return NextResponse.json(
        {
          error:
            'Acceso restringido: Se requiere cuenta conectada con Google.',
        },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json(
        {
          error:
            'El ID de la plantilla es obligatorio',
        },
        { status: 400 }
      );
    }

    // Primero obtenemos la plantilla actual para poder resolver correctamente
    // la entidad anterior/nueva.
    const { data: currentTemplate, error: currentTemplateError } =
      await supabase
        .from('email_templates')
        .select('id, entity_id, entity_name')
        .eq('id', id)
        .single();

    if (currentTemplateError || !currentTemplate) {
      return NextResponse.json(
        {
          error:
            currentTemplateError?.message ||
            'No se encontró la plantilla',
        },
        { status: 404 }
      );
    }

    const updatePayload: Record<string, unknown> = {};

    if (updates.name !== undefined) {
      updatePayload.name =
        typeof updates.name === 'string'
          ? updates.name.trim()
          : updates.name;
    }

    if (updates.sender_pattern !== undefined) {
      updatePayload.sender_pattern =
        typeof updates.sender_pattern === 'string' &&
        updates.sender_pattern.trim()
          ? updates.sender_pattern.trim()
          : null;
    }

    if (updates.subject_pattern !== undefined) {
      updatePayload.subject_pattern =
        typeof updates.subject_pattern === 'string' &&
        updates.subject_pattern.trim()
          ? updates.subject_pattern.trim()
          : null;
    }

    if (updates.match_pattern !== undefined) {
      updatePayload.match_pattern =
        typeof updates.match_pattern === 'string' &&
        updates.match_pattern.trim()
          ? updates.match_pattern.trim()
          : null;
    }

    if (updates.amount_regex !== undefined) {
      updatePayload.amount_regex =
        typeof updates.amount_regex === 'string'
          ? updates.amount_regex.trim()
          : updates.amount_regex;
    }

    if (updates.merchant_regex !== undefined) {
      updatePayload.merchant_regex =
        typeof updates.merchant_regex === 'string' &&
        updates.merchant_regex.trim()
          ? updates.merchant_regex.trim()
          : null;
    }

    if (updates.date_regex !== undefined) {
      updatePayload.date_regex =
        typeof updates.date_regex === 'string' &&
        updates.date_regex.trim()
          ? updates.date_regex.trim()
          : null;
    }

    if (updates.date_format !== undefined) {
      updatePayload.date_format =
        typeof updates.date_format === 'string' &&
        updates.date_format.trim()
          ? updates.date_format.trim()
          : 'DD/MM/YYYY';
    }

    if (updates.entity_name !== undefined) {
      updatePayload.entity_name =
        typeof updates.entity_name === 'string' &&
        updates.entity_name.trim()
          ? updates.entity_name.trim()
          : null;
    }

    if (updates.entity_id !== undefined) {
      updatePayload.entity_id =
        typeof updates.entity_id === 'string' &&
        updates.entity_id.trim()
          ? updates.entity_id.trim()
          : null;
    }

    if (updates.expense_type_id !== undefined) {
      updatePayload.expense_type_id =
        typeof updates.expense_type_id === 'string' &&
        updates.expense_type_id.trim()
          ? updates.expense_type_id.trim()
          : null;
    }

    if (updates.default_currency !== undefined) {
      updatePayload.default_currency =
        typeof updates.default_currency === 'string' &&
        updates.default_currency.trim()
          ? updates.default_currency.trim()
          : 'COP';
    }

    if (updates.currency_regex !== undefined) {
      updatePayload.currency_regex =
        typeof updates.currency_regex === 'string' &&
        updates.currency_regex.trim()
          ? updates.currency_regex.trim()
          : null;
    }

    if (updates.source_account_regex !== undefined) {
      updatePayload.source_account_regex =
        typeof updates.source_account_regex === 'string' &&
        updates.source_account_regex.trim()
          ? updates.source_account_regex.trim()
          : null;
    }

    if (updates.time_regex !== undefined) {
      updatePayload.time_regex =
        typeof updates.time_regex === 'string' &&
        updates.time_regex.trim()
          ? updates.time_regex.trim()
          : null;
    }

    if (updates.active !== undefined) {
      updatePayload.active = Boolean(updates.active);
    }

    // ---------------------------------------------------------
    // Resolver entidad nueva si es necesario
    // ---------------------------------------------------------
    let targetEntityId =
      updates.entity_id !== undefined
        ? typeof updates.entity_id === 'string' &&
          updates.entity_id.trim()
          ? updates.entity_id.trim()
          : null
        : currentTemplate.entity_id;

    const targetEntityName =
      updates.entity_name !== undefined
        ? typeof updates.entity_name === 'string' &&
          updates.entity_name.trim()
          ? updates.entity_name.trim()
          : null
        : currentTemplate.entity_name;

    if (!targetEntityId && targetEntityName) {
      const { data: foundEntities, error: findEntityError } =
        await supabase
          .from('entities')
          .select('id, name')
          .ilike('name', targetEntityName);

      if (findEntityError) {
        return NextResponse.json(
          {
            error: `No se pudo buscar la entidad "${targetEntityName}": ${findEntityError.message}`,
          },
          { status: 500 }
        );
      }

      if (foundEntities && foundEntities.length > 0) {
        targetEntityId = foundEntities[0].id;
      } else {
        const { data: newEntity, error: createEntityError } =
          await supabase
            .from('entities')
            .insert({
              name: targetEntityName,
            })
            .select('id, name')
            .single();

        if (createEntityError || !newEntity) {
          return NextResponse.json(
            {
              error:
                createEntityError?.message ||
                'No se pudo crear la entidad',
            },
            { status: 500 }
          );
        }

        targetEntityId = newEntity.id;
      }

      updatePayload.entity_id = targetEntityId;
      updatePayload.entity_name = targetEntityName;
    }

    // ---------------------------------------------------------
    // Persistir patrón de entidad antes de actualizar plantilla
    // ---------------------------------------------------------
    let normalizedEntityEmailPattern: string | null = null;

    try {
      if (targetEntityId) {
        normalizedEntityEmailPattern =
          await ensureEntityEmailPattern(
            supabase,
            targetEntityId,
            updates.entity_email_pattern
          );
      }
    } catch (patternError: unknown) {
      const message =
        patternError instanceof Error
          ? patternError.message
          : String(patternError);

      return NextResponse.json(
        {
          error: message,
          step: 'entity_email_patterns',
        },
        { status: 500 }
      );
    }

    // Si se solicitó un cambio de entity_id pero no existe la entidad,
    // nunca debemos guardar una referencia inválida.
    if (updates.entity_id !== undefined && updates.entity_id && !targetEntityId) {
      return NextResponse.json(
        {
          error:
            'No se pudo resolver la entidad indicada.',
        },
        { status: 400 }
      );
    }

    // ---------------------------------------------------------
    // Actualizar plantilla
    // ---------------------------------------------------------
    const { data: updatedTemplate, error: updateErr } =
      await supabase
        .from('email_templates')
        .update(updatePayload)
        .eq('id', id)
        .select()
        .single();

    if (updateErr) {
      console.error(
        '[API PUT /api/email-templates] Update error:',
        updateErr
      );

      return NextResponse.json(
        {
          error: updateErr.message,
          step: 'email_templates',
          entity_email_pattern:
            normalizedEntityEmailPattern,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ...updatedTemplate,
      entity_email_pattern:
        normalizedEntityEmailPattern,
    });
  } catch (err: unknown) {
    console.error('[API PUT /api/email-templates] Error:', err);

    const message =
      err instanceof Error
        ? err.message
        : 'Error interno al actualizar plantilla';

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/email-templates?id=...
 */
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json(
        { error: 'No autorizado' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        {
          error: 'ID de plantilla requerido',
        },
        { status: 400 }
      );
    }

    // Intentar hard delete
    const { error: hardDelErr } = await supabase
      .from('email_templates')
      .delete()
      .eq('id', id);

    if (!hardDelErr) {
      return NextResponse.json({
        success: true,
        mode: 'deleted',
      });
    }

    // Si hay dependencias, soft delete
    const { error: softDelErr } = await supabase
      .from('email_templates')
      .update({ active: false })
      .eq('id', id);

    if (softDelErr) {
      console.error(
        '[API DELETE /api/email-templates] Soft delete error:',
        softDelErr
      );

      return NextResponse.json(
        {
          error:
            softDelErr.message ||
            hardDelErr.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      mode: 'deactivated',
    });
  } catch (err: unknown) {
    console.error(
      '[API DELETE /api/email-templates] Error:',
      err
    );

    return NextResponse.json(
      {
        error: 'Error al eliminar plantilla',
      },
      { status: 500 }
    );
  }
}