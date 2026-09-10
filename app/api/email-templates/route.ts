import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient, SupabaseClient } from '@supabase/supabase-js';

import type { CatalogEntity, CatalogTemplate } from '@/lib/email-templates/email-matching';

export const dynamic = 'force-dynamic';

type DbClient = SupabaseClient;

type TemplateRow = Record<string, unknown> & {
  id: string;
  entity_id: string | null;
  expense_type_id: string | null;
};

type EntityRow = {
  id: string;
  name: string;
};

type PatternRow = {
  entity_id: string;
  pattern: string;
  created_at?: string;
};

type ExpenseTypeRow = {
  id: string;
  name: string | null;
  label: string | null;
};

type TemplateWriteBody = {
  id?: string;
  name?: string;
  entity_id?: string | null;
  new_entity_name?: string | null;
  new_entity_label?: string | null;
  entity_email_pattern?: string | null;
  subject_pattern?: string | null;
  match_pattern?: string | null;
  amount_regex?: string | null;
  merchant_regex?: string | null;
  date_regex?: string | null;
  date_format?: string | null;
  expense_type_id?: string | null;
  expense_type?: string | null;
  currency_regex?: string | null;
  source_account_regex?: string | null;
  time_regex?: string | null;
  time_format?: string | null;
};

const TEMPLATE_FIELDS = [
  'name',
  'entity_id',
  'subject_pattern',
  'match_pattern',
  'amount_regex',
  'merchant_regex',
  'date_regex',
  'date_format',
  'expense_type_id',
  'currency_regex',
  'source_account_regex',
  'time_regex',
  'time_format',
] as const;

function getDirectClient(): DbClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error('Supabase URL y Anon Key son requeridos');
  }

  return createSupabaseClient(url, anonKey);
}

function trimNullable(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isTemplateWriteBody(value: unknown): value is TemplateWriteBody {
  return typeof value === 'object' && value !== null;
}

function buildTemplatePayload(body: TemplateWriteBody, userId: string, entityId: string, expenseTypeId: string | null) {
  const getString = (key: keyof TemplateWriteBody): string | null =>
    trimNullable(body[key]);

  return {
    name: getString('name')!,
    entity_id: entityId,
    subject_pattern: getString('subject_pattern'),
    match_pattern: getString('match_pattern'),
    amount_regex: getString('amount_regex')!,
    merchant_regex: getString('merchant_regex'),
    date_regex: getString('date_regex'),
    date_format: getString('date_format') || 'DD/MM/YYYY',
    expense_type_id: expenseTypeId,
    currency_regex: getString('currency_regex'),
    source_account_regex: getString('source_account_regex'),
    time_regex: getString('time_regex'),
    time_format: body.time_regex?.trim()
      ? getString('time_format') || 'HH:mm:ss'
      : null,
    created_by: userId,
  };
}

async function enrichTemplates(
  db: DbClient,
  templates: TemplateRow[],
): Promise<CatalogTemplate[]> {
  if (templates.length === 0) return [];

  const entityIds = [...new Set(
    templates.map((template) => template.entity_id).filter(
      (id): id is string => Boolean(id),
    ),
  )];

  const expenseTypeIds = [...new Set(
    templates.map((template) => template.expense_type_id).filter(
      (id): id is string => Boolean(id),
    ),
  )];

  const [
    { data: entities, error: entitiesError },
    { data: patterns, error: patternsError },
    { data: expenseTypes, error: expenseTypesError },
  ] = await Promise.all([
    entityIds.length
      ? db.from('entities').select('id,name').in('id', entityIds)
      : Promise.resolve({ data: [] as EntityRow[], error: null }),
    entityIds.length
      ? db
        .from('entity_email_patterns')
        .select('entity_id,pattern,created_at')
        .in('entity_id', entityIds)
        .order('created_at', { ascending: true })
      : Promise.resolve({ data: [] as PatternRow[], error: null }),
    expenseTypeIds.length
      ? db
        .from('expense_types')
        .select('id,name,label')
        .in('id', expenseTypeIds)
      : Promise.resolve({ data: [] as ExpenseTypeRow[], error: null }),
  ]);

  if (entitiesError) throw entitiesError;
  if (patternsError) throw patternsError;
  if (expenseTypesError) throw expenseTypesError;

  const entityMap = new Map(
    ((entities || []) as EntityRow[]).map((entity) => [
      entity.id,
      { id: entity.id, name: entity.name },
    ]),
  );

  const patternMap = new Map<string, string[]>();

  for (const pattern of (patterns || []) as PatternRow[]) {
    const current = patternMap.get(pattern.entity_id) || [];
    current.push(pattern.pattern);
    patternMap.set(pattern.entity_id, current);
  }

  const expenseMap = new Map(
    ((expenseTypes || []) as ExpenseTypeRow[]).map((expenseType) => [
      expenseType.id,
      expenseType.label || expenseType.name || null,
    ]),
  );

  return templates.map((template) => ({
    ...(template as CatalogTemplate),
    entity: template.entity_id
      ? entityMap.get(template.entity_id) || null
      : null,
    entity_email_patterns: template.entity_id
      ? patternMap.get(template.entity_id) || []
      : [],
    expense_type_label: template.expense_type_id
      ? expenseMap.get(template.expense_type_id) || null
      : null,
  }));
}

async function getTemplates(
  db: DbClient,
  userId: string,
): Promise<CatalogTemplate[]> {
  const { data: disabled, error: disabledError } = await db
    .from('user_template_preferences')
    .select('template_id')
    .eq('user_id', userId)
    .eq('enabled', false);

  if (disabledError) throw disabledError;

  const disabledIds = new Set(
    (disabled || []).map((preference: { template_id: string }) => preference.template_id),
  );

  const { data, error } = await db
    .from('email_templates')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) throw error;

  const activeTemplates = ((data || []) as TemplateRow[]).filter(
    (template) => !disabledIds.has(template.id),
  );

  return enrichTemplates(db, activeTemplates);
}

async function resolveEntity(
  db: DbClient,
  entityId: string | null,
  newEntityName: string | null,
): Promise<string> {
  if (entityId) {
    const { data, error } = await db
      .from('entities')
      .select('id')
      .eq('id', entityId)
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error('La entidad indicada no existe');

    return data.id;
  }

  if (!newEntityName) {
    throw new Error(
      'entity_id es obligatorio para una plantilla existente; para una entidad nueva se requiere new_entity_name',
    );
  }

  const { data: existing, error: lookupError } = await db
    .from('entities')
    .select('id')
    .ilike('name', newEntityName)
    .limit(1);

  if (lookupError) throw lookupError;
  if (existing?.length) return existing[0].id;

  const { data, error } = await db
    .from('entities')
    .insert({ name: newEntityName })
    .select('id')
    .single();

  if (error || !data) {
    throw error || new Error('No se pudo crear la entidad');
  }

  return data.id;
}

async function ensureEntityHasPattern(
  db: DbClient,
  entityId: string,
  proposedPattern: unknown,
): Promise<void> {
  const pattern = trimNullable(proposedPattern);

  if (pattern) {
    if (!pattern.includes('@')) {
      throw new Error(
        'entity_email_pattern debe representar un correo/dominio institucional e incluir @',
      );
    }

    try {
      new RegExp(pattern, 'i');
    } catch {
      throw new Error('entity_email_pattern no es un regex válido');
    }

    const { data: existing, error: lookupError } = await db
      .from('entity_email_patterns')
      .select('id')
      .eq('entity_id', entityId)
      .eq('pattern', pattern)
      .limit(1);

    if (lookupError) throw lookupError;

    if (!existing?.length) {
      const { error } = await db
        .from('entity_email_patterns')
        .insert({ entity_id: entityId, pattern });

      if (error) throw error;
    }
  }

  const { data, error } = await db
    .from('entity_email_patterns')
    .select('id')
    .eq('entity_id', entityId)
    .limit(1);

  if (error) throw error;

  if (!data?.length) {
    throw new Error(
      'La entidad no tiene entity_email_patterns. Toda plantilla debe pertenecer a una entidad identificable por un patrón de correo.',
    );
  }
}

async function resolveExpenseTypeId(
  db: DbClient,
  expenseTypeId: unknown,
  expenseType: unknown,
): Promise<string | null> {
  const explicitId = trimNullable(expenseTypeId);
  if (explicitId) return explicitId;

  const label = trimNullable(expenseType);
  if (!label) return null;

  const { data, error } = await db
    .from('expense_types')
    .select('id,name,label');

  if (error) throw error;

  const needle = label.toLowerCase();
  const match = (data || []).find((type: ExpenseTypeRow) =>
    type.name?.toLowerCase() === needle ||
    type.label?.toLowerCase() === needle,
  );

  return match?.id || null;
}

export async function GET(req: NextRequest) {
  try {
    const authorization = req.headers.get('authorization') || '';
    const bearerToken = authorization.startsWith('Bearer ')
      ? authorization.slice(7).trim()
      : null;

    if (bearerToken) {
      const db = getDirectClient();
      const { data, error } = await db.rpc(
        'get_email_templates_for_webhook',
        { p_token: bearerToken },
      );

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json(data || []);
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'No autorizado. Se requiere Bearer token o sesión activa.' },
        { status: 401 },
      );
    }

    return NextResponse.json(await getTemplates(supabase, user.id));
  } catch (err: unknown) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : 'Error interno al consultar plantillas',
      },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const rawBody: unknown = await req.json();
    if (!isTemplateWriteBody(rawBody)) {
      return NextResponse.json(
        { error: 'El cuerpo de la solicitud no es válido.' },
        { status: 400 },
      );
    }

    const body = rawBody;
    const name = trimNullable(body.name);
    const amountRegex = trimNullable(body.amount_regex);
    const entityId = trimNullable(body.entity_id);
    const newEntityName =
      trimNullable(body.new_entity_name) ||
      trimNullable(body.new_entity_label);

    if (!name) {
      return NextResponse.json(
        { error: 'El nombre de la plantilla es obligatorio' },
        { status: 400 },
      );
    }

    if (!amountRegex) {
      return NextResponse.json(
        { error: 'El patrón amount_regex es obligatorio' },
        { status: 400 },
      );
    }

    if (!entityId && !newEntityName) {
      return NextResponse.json(
        {
          error:
            'Se requiere entity_id o el nombre de la entidad (new_entity_name).',
        },
        { status: 400 },
      );
    }

    const resolvedEntityId = await resolveEntity(
      supabase,
      entityId,
      newEntityName,
    );

    await ensureEntityHasPattern(
      supabase,
      resolvedEntityId,
      body.entity_email_pattern,
    );

    const resolvedExpenseTypeId = await resolveExpenseTypeId(
      supabase,
      body.expense_type_id,
      body.expense_type,
    );

    const payload = {
      ...buildTemplatePayload(
        body,
        user.id,
        resolvedEntityId,
        resolvedExpenseTypeId,
      ),
      name,
      amount_regex: amountRegex,
    };

    const { data, error } = await supabase
      .from('email_templates')
      .insert(payload)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (err: unknown) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : 'Error interno al crear plantilla',
      },
      { status: 500 },
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const rawBody: unknown = await req.json();
    if (!isTemplateWriteBody(rawBody)) {
      return NextResponse.json(
        { error: 'El cuerpo de la solicitud no es válido.' },
        { status: 400 },
      );
    }

    const body = rawBody;
    const id = trimNullable(body.id);

    if (!id) {
      return NextResponse.json(
        { error: 'El ID de la plantilla es obligatorio' },
        { status: 400 },
      );
    }

    const payload: Record<string, unknown> = {};

    for (const key of TEMPLATE_FIELDS) {
      const value = body[key];

      if (value === undefined) continue;

      payload[key] =
        typeof value === 'string'
          ? value.trim() || null
          : value;
    }

    if (body.expense_type !== undefined || body.expense_type_id !== undefined) {
      payload.expense_type_id = await resolveExpenseTypeId(
        supabase,
        body.expense_type_id,
        body.expense_type,
      );
    }

    if (payload.amount_regex === null) {
      return NextResponse.json(
        { error: 'amount_regex es obligatorio' },
        { status: 400 },
      );
    }

    const newEntityName =
      trimNullable(body.new_entity_name) ||
      trimNullable(body.new_entity_label);

    if (!payload.entity_id && newEntityName) {
      payload.entity_id = await resolveEntity(
        supabase,
        null,
        newEntityName,
      );
    }

    const { data: current, error: currentError } = await supabase
      .from('email_templates')
      .select('entity_id')
      .eq('id', id)
      .single();

    if (currentError) {
      return NextResponse.json(
        { error: currentError.message },
        { status: 404 },
      );
    }

    const targetEntityId = String(
      payload.entity_id || current.entity_id || '',
    );

    if (!targetEntityId) {
      return NextResponse.json(
        { error: 'La plantilla debe pertenecer a una entidad.' },
        { status: 400 },
      );
    }

    if (payload.entity_id && payload.entity_id !== current.entity_id) {
      const { data: entity, error: entityError } = await supabase
        .from('entities')
        .select('id')
        .eq('id', payload.entity_id)
        .maybeSingle();

      if (entityError) throw entityError;

      if (!entity) {
        return NextResponse.json(
          { error: 'La entidad indicada no existe' },
          { status: 400 },
        );
      }
    }

    await ensureEntityHasPattern(
      supabase,
      targetEntityId,
      body.entity_email_pattern,
    );

    const { data, error } = await supabase
      .from('email_templates')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err: unknown) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : 'Error interno al actualizar plantilla',
      },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const id = new URL(req.url).searchParams.get('id')?.trim();

    if (!id) {
      return NextResponse.json(
        { error: 'ID de plantilla requerido' },
        { status: 400 },
      );
    }

    const { error } = await supabase
      .from('email_templates')
      .delete()
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : 'Error interno al eliminar plantilla',
      },
      { status: 500 },
    );
  }
}
