import {NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase/server';
import type {CatalogEntity, CatalogTemplate} from '@/lib/email-templates/email-matching';

type TemplateRow = CatalogTemplate & {
    expense_type_id: string | null;
};

type EntityRow = {
    id: string;
    name: string;
};

type EntityPatternRow = {
    entity_id: string;
    pattern: string;
};

type ExpenseTypeRow = {
    id: string;
    name: string | null;
    label: string | null;
};

type AmbiguousTemplate = {
    entity_id: string;
    subject_pattern: string;
    template_ids: string[];
    template_names: string[];
};

function buildEntityCatalog(
    entities: EntityRow[],
    patterns: EntityPatternRow[],
): CatalogEntity[] {
    const patternsByEntity = new Map<string, string[]>();

    for (const pattern of patterns) {
        const entityPatterns = patternsByEntity.get(pattern.entity_id) || [];
        entityPatterns.push(pattern.pattern);
        patternsByEntity.set(pattern.entity_id, entityPatterns);
    }

    return entities.map((entity) => ({
        id: entity.id,
        name: entity.name,
        patterns: patternsByEntity.get(entity.id) || [],
    }));
}

function enrichTemplates(
    templates: TemplateRow[],
    entities: CatalogEntity[],
    expenseTypes: ExpenseTypeRow[],
): CatalogTemplate[] {
    const entityMap = new Map(entities.map((entity) => [entity.id, entity]));
    const expenseTypeMap = new Map(
        expenseTypes.map((expenseType) => [
            expenseType.id,
            expenseType.label || expenseType.name || null,
        ]),
    );

    return templates.map((template) => ({
        ...template,
        entity: template.entity_id
            ? entityMap.get(template.entity_id) || null
            : null,
        entity_email_patterns: template.entity_id
            ? entityMap.get(template.entity_id)?.patterns || []
            : [],
        expense_type_label: template.expense_type_id
            ? expenseTypeMap.get(template.expense_type_id) || null
            : null,
    }));
}

export async function GET() {
    try {
        const supabase = await createClient();
        const {
            data: {user},
            error: authError,
        } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json(
                {
                    error:
                        'No autorizado. Debes iniciar sesión para consultar plantillas.',
                },
                {status: 401},
            );
        }

        const [
            {data: templateRows, error: templatesError},
            {data: entityRows, error: entitiesError},
            {data: patternRows, error: patternsError},
            {data: expenseTypeRows, error: expenseTypesError},
        ] = await Promise.all([
            supabase
                .from('email_templates')
                .select('*')
                .order('created_at', {ascending: false}),
            supabase
                .from('entities')
                .select('id,name')
                .order('name', {ascending: true}),
            supabase
                .from('entity_email_patterns')
                .select('entity_id,pattern')
                .order('created_at', {ascending: true}),
            supabase
                .from('expense_types')
                .select('id,name,label')
                .order('label', {ascending: true}),
        ]);

        if (templatesError) {
            return NextResponse.json(
                {error: `Error al consultar plantillas: ${templatesError.message}`},
                {status: 500},
            );
        }

        if (entitiesError || patternsError || expenseTypesError) {
            const error =
                entitiesError?.message ||
                patternsError?.message ||
                expenseTypesError?.message ||
                'No se pudo completar la carga del catálogo.';

            return NextResponse.json({error}, {status: 500});
        }

        const entities = buildEntityCatalog(
            (entityRows || []) as EntityRow[],
            (patternRows || []) as EntityPatternRow[],
        );

        const expenseTypes = (expenseTypeRows || []) as ExpenseTypeRow[];
        const templates = enrichTemplates(
            (templateRows || []) as TemplateRow[],
            entities,
            expenseTypes,
        );

        let ambiguousTemplates: AmbiguousTemplate[] = [];

        const {data: ambiguityData, error: ambiguityError} = await supabase.rpc(
            'detect_ambiguous_templates',
        );

        if (ambiguityError) {
            console.warn(
                '[API /api/email-templates/catalog] No se pudo calcular las ambigüedades:',
                ambiguityError,
            );
        } else if (Array.isArray(ambiguityData)) {
            ambiguousTemplates = ambiguityData as AmbiguousTemplate[];
        }

        return NextResponse.json({
            success: true,
            templates,
            entities,
            expense_types: expenseTypes,
            ambiguous_templates: ambiguousTemplates,
            total_templates: templates.length,
            total_entities: entities.length,
        });
    } catch (err: unknown) {
        return NextResponse.json(
            {
                error:
                    err instanceof Error
                        ? err.message
                        : 'Error interno al consultar el catálogo de plantillas.',
            },
            {status: 500},
        );
    }
}
