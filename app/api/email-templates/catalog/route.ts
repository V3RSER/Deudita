import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { CatalogEntity, CatalogTemplate } from '@/lib/email-matching';

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json(
        { error: 'No autorizado. Debes iniciar sesión para consultar plantillas.' },
        { status: 401 }
      );
    }

    // 1. Fetch active email templates
    const { data: templatesData, error: templatesErr } = await supabase
      .from('email_templates')
      .select('*')
      .eq('active', true)
      .order('created_at', { ascending: false });

    if (templatesErr) {
      console.error('[email-templates/catalog] Error fetching templates:', templatesErr);
      return NextResponse.json(
        { error: `Error al consultar plantillas: ${templatesErr.message}` },
        { status: 500 }
      );
    }

    // 2. Fetch entities
    const { data: entitiesData, error: entitiesErr } = await supabase
      .from('entities')
      .select('*')
      .order('name', { ascending: true });

    if (entitiesErr) {
      console.warn('[email-templates/catalog] Warning fetching entities:', entitiesErr);
    }

    // 3. Fetch entity email patterns
    const { data: patternsData, error: patternsErr } = await supabase
      .from('entity_email_patterns')
      .select('*')
      .order('created_at', { ascending: true });

    if (patternsErr) {
      console.warn('[email-templates/catalog] Warning fetching entity patterns:', patternsErr);
    }

    // 4. Fetch expense types
    const { data: expenseTypesData, error: expenseTypesErr } = await supabase
      .from('expense_types')
      .select('*')
      .order('label', { ascending: true });

    if (expenseTypesErr) {
      console.warn('[email-templates/catalog] Warning fetching expense types:', expenseTypesErr);
    }

    // Map entities with their patterns
    const entitiesList: CatalogEntity[] = (entitiesData || []).map((ent: { id: string; name: string }) => {
      const patterns = (patternsData || [])
        .filter((p: { entity_id: string; pattern: string }) => p.entity_id === ent.id)
        .map((p: { pattern: string }) => p.pattern);

      return {
        id: ent.id,
        name: ent.name,
        patterns,
      };
    });

    // Also enrich templates with entity names and expense type labels
    const expenseTypeMap = new Map<string, string>();
    for (const et of expenseTypesData || []) {
      expenseTypeMap.set(et.id, et.label || et.name);
    }

    const entityNameMap = new Map<string, string>();
    for (const ent of entitiesData || []) {
      entityNameMap.set(ent.id, ent.name);
    }

    const templatesList: CatalogTemplate[] = (templatesData || []).map((t: CatalogTemplate) => {
      const entityName = t.entity_id ? entityNameMap.get(t.entity_id) || t.entity_name : t.entity_name;
      const expenseTypeLabel = t.expense_type_id ? expenseTypeMap.get(t.expense_type_id) : undefined;
      const entityPatterns = t.entity_id
        ? (patternsData || [])
            .filter((p: { entity_id: string; pattern: string }) => p.entity_id === t.entity_id)
            .map((p: { pattern: string }) => p.pattern)
        : [];

      return {
        ...t,
        entity_name: entityName || null,
        expense_type_label: expenseTypeLabel || null,
        entity_email_patterns: entityPatterns,
      };
    });

    // Query ambiguous templates if RPC is available
    let ambiguousTemplates: Array<{
      entity_id: string;
      subject_pattern: string;
      template_ids: string[];
      template_names: string[];
    }> = [];

    try {
      const { data: ambData } = await supabase.rpc('detect_ambiguous_templates');
      if (ambData && Array.isArray(ambData)) {
        ambiguousTemplates = ambData;
      }
    } catch {
      // RPC might not exist or failed, compute fallback client/server-side
    }

    return NextResponse.json({
      success: true,
      templates: templatesList,
      entities: entitiesList,
      expense_types: expenseTypesData || [],
      ambiguous_templates: ambiguousTemplates,
      total_active_templates: templatesList.length,
      total_entities: entitiesList.length,
    });
  } catch (err: unknown) {
    const errMessage = err instanceof Error ? err.message : String(err);
    console.error('[email-templates/catalog] Unexpected error:', errMessage);
    return NextResponse.json(
      { error: `Error inesperado: ${errMessage}` },
      { status: 500 }
    );
  }
}
