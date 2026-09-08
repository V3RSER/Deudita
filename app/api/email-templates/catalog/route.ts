import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { CatalogEntity, CatalogTemplate } from '@/lib/email-matching';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: 'No autorizado. Debes iniciar sesión para consultar plantillas.' }, { status: 401 });

    const [{ data: templates, error: templatesErr }, { data: entities }, { data: patterns }, { data: expenseTypes }] = await Promise.all([
      supabase.from('email_templates').select('*').order('created_at', { ascending: false }),
      supabase.from('entities').select('id,name').order('name', { ascending: true }),
      supabase.from('entity_email_patterns').select('entity_id,pattern').order('created_at', { ascending: true }),
      supabase.from('expense_types').select('*').order('label', { ascending: true }),
    ]);
    if (templatesErr) return NextResponse.json({ error: `Error al consultar plantillas: ${templatesErr.message}` }, { status: 500 });

    const entityList: CatalogEntity[] = (entities || []).map((e: any) => ({
      id: e.id, name: e.name, patterns: (patterns || []).filter((p: any) => p.entity_id === e.id).map((p: any) => p.pattern),
    }));
    const entityMap = new Map(entityList.map(e => [e.id, e]));
    const expenseMap = new Map((expenseTypes || []).map((e: any) => [e.id, e.label || e.name]));
    const templateList: CatalogTemplate[] = (templates || []).map((t: any) => ({
      ...t,
      entity: t.entity_id ? entityMap.get(t.entity_id) || null : null,
      entity_email_patterns: t.entity_id ? entityMap.get(t.entity_id)?.patterns || [] : [],
      expense_type_label: t.expense_type_id ? expenseMap.get(t.expense_type_id) || null : null,
    }));

    let ambiguousTemplates: Array<{ entity_id: string; subject_pattern: string; template_ids: string[]; template_names: string[] }> = [];
    try {
      const { data } = await supabase.rpc('detect_ambiguous_templates');
      if (Array.isArray(data)) ambiguousTemplates = data;
    } catch { }

    return NextResponse.json({ success: true, templates: templateList, entities: entityList, expense_types: expenseTypes || [], ambiguous_templates: ambiguousTemplates, total_templates: templateList.length, total_entities: entityList.length });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
