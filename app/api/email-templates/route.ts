import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

type TemplateRow = Record<string, unknown> & { id: string; entity_id: string | null; expense_type_id: string | null };

function getDirectClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error('Supabase URL y Anon Key son requeridos');
  return createSupabaseClient(url, anonKey);
}

async function enrichTemplates(db: any, templates: TemplateRow[]) {
  if (!templates.length) return [];
  const entityIds = [...new Set(templates.map(t => t.entity_id).filter(Boolean))];
  const expenseTypeIds = [...new Set(templates.map(t => t.expense_type_id).filter(Boolean))];
  const [{ data: entities }, { data: patterns }, { data: expenseTypes }] = await Promise.all([
    entityIds.length ? db.from('entities').select('id,name').in('id', entityIds) : { data: [] },
    entityIds.length ? db.from('entity_email_patterns').select('entity_id,pattern').in('entity_id', entityIds).order('created_at', { ascending: true }) : { data: [] },
    expenseTypeIds.length ? db.from('expense_types').select('id,name,label').in('id', expenseTypeIds) : { data: [] },
  ]);
  const entityMap = new Map((entities || []).map((e: any) => [e.id, { id: e.id, name: e.name }]));
  const patternMap = new Map<string, string[]>();
  for (const p of patterns || []) patternMap.set(p.entity_id, [...(patternMap.get(p.entity_id) || []), p.pattern]);
  const expenseMap = new Map((expenseTypes || []).map((e: any) => [e.id, e.label || e.name]));
  return templates.map(t => ({
    ...t,
    entity: t.entity_id ? entityMap.get(t.entity_id) || null : null,
    entity_email_patterns: t.entity_id ? patternMap.get(t.entity_id) || [] : [],
    expense_type_label: t.expense_type_id ? expenseMap.get(t.expense_type_id) || null : null,
  }));
}

async function getTemplates(db: any, userId: string) {
  const { data: disabled } = await db.from('user_template_preferences').select('template_id').eq('user_id', userId).eq('enabled', false);
  const disabledIds = new Set((disabled || []).map((p: any) => p.template_id));
  const { data, error } = await db.from('email_templates').select('*').order('created_at', { ascending: true });
  if (error) throw error;
  return enrichTemplates(db, (data || []).filter((t: TemplateRow) => !disabledIds.has(t.id)));
}

async function resolveEntity(db: any, entityId: string | null, newEntityName: string | null) {
  if (entityId) {
    const { data, error } = await db.from('entities').select('id,name').eq('id', entityId).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('La entidad indicada no existe');
    return data.id;
  }
  if (!newEntityName) throw new Error('entity_id es obligatorio para una plantilla existente; para una entidad nueva se requiere new_entity_name');
  const { data: existing, error: lookupError } = await db.from('entities').select('id,name').ilike('name', newEntityName).limit(1);
  if (lookupError) throw lookupError;
  if (existing?.length) return existing[0].id;
  const { data, error } = await db.from('entities').insert({ name: newEntityName }).select('id').single();
  if (error || !data) throw error || new Error('No se pudo crear la entidad');
  return data.id;
}

async function upsertEntityPattern(db: any, entityId: string, rawPattern: unknown) {
  if (typeof rawPattern !== 'string' || !rawPattern.trim()) return;
  const pattern = rawPattern.trim();
  if (!pattern.includes('@')) throw new Error('entity_email_pattern debe representar un correo/dominio institucional e incluir @');
  try { new RegExp(pattern, 'i'); } catch { throw new Error('entity_email_pattern no es un regex válido'); }
  const { data: existing, error: lookupError } = await db.from('entity_email_patterns').select('id').eq('entity_id', entityId).eq('pattern', pattern).limit(1);
  if (lookupError) throw lookupError;
  if (!existing?.length) {
    const { error } = await db.from('entity_email_patterns').insert({ entity_id: entityId, pattern });
    if (error) throw error;
  }
}

async function ensureEntityHasPattern(db: any, entityId: string, proposedPattern: unknown) {
  await upsertEntityPattern(db, entityId, proposedPattern);
  const { data, error } = await db.from('entity_email_patterns').select('id').eq('entity_id', entityId).limit(1);
  if (error) throw error;
  if (!data?.length) throw new Error('La entidad no tiene entity_email_patterns. Toda plantilla debe pertenecer a una entidad identificable por un patrón de correo.');
}

export async function GET(req: NextRequest) {
  try {
    const auth = req.headers.get('authorization') || '';
    const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : null;
    if (bearer) {
      const db = getDirectClient();
      const { data, error } = await db.rpc('get_email_templates_for_webhook', { p_token: bearer });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json(data || []);
    }
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'No autorizado. Se requiere Bearer token o sesión activa.' }, { status: 401 });
    return NextResponse.json(await getTemplates(supabase, user.id));
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error interno al consultar plantillas' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    const cookieStore = await cookies();
    const token = req.headers.get('x-google-token') || cookieStore.get('google_provider_token')?.value || (user.user_metadata?.google_provider_token as string | undefined);
    if (!token) return NextResponse.json({ error: 'Acceso restringido: Se requiere cuenta conectada con Google.' }, { status: 403 });

    const body = await req.json();
    const { name, entity_id, new_entity_name, entity_email_pattern, subject_pattern, match_pattern, amount_regex, merchant_regex, date_regex, date_format, expense_type_id, expense_type, currency_regex, source_account_regex, time_regex, time_format } = body;
    if (!name?.trim()) return NextResponse.json({ error: 'El nombre de la plantilla es obligatorio' }, { status: 400 });
    if (!amount_regex?.trim()) return NextResponse.json({ error: 'El patrón amount_regex es obligatorio' }, { status: 400 });

    const resolvedEntityId = await resolveEntity(supabase, entity_id?.trim() || null, new_entity_name?.trim() || null);
    await ensureEntityHasPattern(supabase, resolvedEntityId, entity_email_pattern);

    let resolvedExpenseTypeId = expense_type_id?.trim() || null;
    if (!resolvedExpenseTypeId && typeof expense_type === 'string' && expense_type.trim()) {
      const { data } = await supabase.from('expense_types').select('id,name,label');
      const needle = expense_type.trim().toLowerCase();
      resolvedExpenseTypeId = (data || []).find((e: any) => e.name?.toLowerCase() === needle || e.label?.toLowerCase() === needle)?.id || null;
    }

    const payload = {
      name: name.trim(), entity_id: resolvedEntityId,
      subject_pattern: subject_pattern?.trim() || null,
      match_pattern: match_pattern?.trim() || null,
      amount_regex: amount_regex.trim(), merchant_regex: merchant_regex?.trim() || null,
      date_regex: date_regex?.trim() || null, date_format: date_format?.trim() || 'DD/MM/YYYY',
      expense_type_id: resolvedExpenseTypeId, currency_regex: currency_regex?.trim() || null,
      source_account_regex: source_account_regex?.trim() || null,
      time_regex: time_regex?.trim() || null, time_format: time_format?.trim() || null,
      created_by: user.id,
    };
    const { data, error } = await supabase.from('email_templates').insert(payload).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data, { status: 201 });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error interno al crear plantilla' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    const cookieStore = await cookies();
    const token = req.headers.get('x-google-token') || cookieStore.get('google_provider_token')?.value || (user.user_metadata?.google_provider_token as string | undefined);
    if (!token) return NextResponse.json({ error: 'Acceso restringido: Se requiere cuenta conectada con Google.' }, { status: 403 });

    const { id, ...updates } = await req.json();
    if (!id) return NextResponse.json({ error: 'El ID de la plantilla es obligatorio' }, { status: 400 });
    const allowed = ['name','entity_id','subject_pattern','match_pattern','amount_regex','merchant_regex','date_regex','date_format','expense_type_id','currency_regex','source_account_regex','time_regex','time_format'];
    const payload: Record<string, unknown> = {};
    for (const key of allowed) if (updates[key] !== undefined) payload[key] = typeof updates[key] === 'string' ? updates[key].trim() || null : updates[key];
    if (payload.amount_regex === null) return NextResponse.json({ error: 'amount_regex es obligatorio' }, { status: 400 });
    const { data: current, error: currentError } = await supabase.from('email_templates').select('entity_id').eq('id', id).single();
    if (currentError) return NextResponse.json({ error: currentError.message }, { status: 404 });
    if (payload.entity_id && payload.entity_id !== current.entity_id) {
      const { data: entity } = await supabase.from('entities').select('id').eq('id', payload.entity_id).maybeSingle();
      if (!entity) return NextResponse.json({ error: 'La entidad indicada no existe' }, { status: 400 });
    }
    await ensureEntityHasPattern(supabase, String(payload.entity_id || current.entity_id), updates.entity_email_pattern);
    const { data, error } = await supabase.from('email_templates').update(payload).eq('id', id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error interno al actualizar plantilla' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    const id = new URL(req.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'ID de plantilla requerido' }, { status: 400 });
    const { error } = await supabase.from('email_templates').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, mode: 'deleted' });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error interno al eliminar plantilla' }, { status: 500 });
  }
}
