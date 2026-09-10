import {NextRequest, NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase/server';
import {GoogleGenAI, Type} from '@google/genai';

import {buildTemplatePrompt, cleanEmailBody, parseAITemplateResponse,} from '@/lib/email-templates/email-cleaning';

export const dynamic = 'force-dynamic';

interface PromptEntity {
    id: string;
    name: string;
    patterns: string[];
}

interface SuggestionRequest {
    emailText?: string;
    sender?: string;
    subject?: string;
    body?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function loadPromptEntities(
    supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<PromptEntity[]> {
    const [
        {data: entities, error: entitiesError},
        {data: patterns, error: patternsError},
    ] = await Promise.all([
        supabase
            .from('entities')
            .select('id,name')
            .order('name', {ascending: true}),
        supabase
            .from('entity_email_patterns')
            .select('entity_id,pattern')
            .order('created_at', {ascending: true}),
    ]);

    if (entitiesError) throw entitiesError;
    if (patternsError) throw patternsError;

    const patternsByEntity = new Map<string, string[]>();

    for (const row of patterns ?? []) {
        const values = patternsByEntity.get(row.entity_id) ?? [];
        if (typeof row.pattern === 'string' && row.pattern.trim()) {
            values.push(row.pattern);
        }
        patternsByEntity.set(row.entity_id, values);
    }

    return (entities ?? []).map((entity) => ({
        id: entity.id,
        name: entity.name,
        patterns: patternsByEntity.get(entity.id) ?? [],
    }));
}

function buildSuggestionSchema(expenseTypes: Array<{ name: string; label?: string }> = []) {
    const expenseTypeDescription = expenseTypes.length > 0
        ? `Naturaleza de la operación según el vocabulario del sistema registrado en la base de datos: ${expenseTypes.map((t) => `"${t.name}"${t.label && t.label.toLowerCase() !== t.name.toLowerCase() ? ` (${t.label})` : ''}`).join(', ')}.`
        : 'Naturaleza de la operación según el vocabulario del sistema registrado en la base de datos.';

    return {
        type: Type.OBJECT,
        properties: {
            name: {
                type: Type.STRING,
                description: 'Nombre corto y descriptivo basado en entidad y tipo de notificación.',
            },
            entity_label: {
                type: Type.STRING,
                description: 'Nombre exacto de la entidad emisora.',
            },
            is_new_entity: {
                type: Type.BOOLEAN,
                description: 'true únicamente cuando la entidad emisora no corresponde a una entidad registrada.',
            },
            entity_email_pattern: {
                type: Type.STRING,
                description: 'Regex reutilizable para reconocer el correo institucional de la entidad, incluyendo @, o null si no hay información suficiente.',
            },
            subject_pattern: {
                type: Type.STRING,
                description: 'Regex estable que identifica la clase de notificación por asunto/cuerpo, o null si no aplica.',
            },
            match_pattern: {
                type: Type.STRING,
                description: 'Regex mínimo y estable que discrimina esta clase frente a otras de la misma entidad. Nunca null.',
            },
            amount_regex: {
                type: Type.STRING,
                description: 'Regex JavaScript con exactamente un grupo de captura para el importe.',
            },
            merchant_regex: {
                type: Type.STRING,
                description: 'Regex JavaScript con exactamente un grupo de captura para comercio/beneficiario, o null si no existe.',
            },
            date_regex: {
                type: Type.STRING,
                description: 'Regex JavaScript con exactamente un grupo de captura para la fecha, o null si no existe.',
            },
            date_format: {
                type: Type.STRING,
                description: 'Formato original de la fecha, por ejemplo DD/MM/YYYY.',
            },
            time_regex: {
                type: Type.STRING,
                description: 'Regex JavaScript con exactamente un grupo de captura para la hora, o null si no existe.',
            },
            time_format: {
                type: Type.STRING,
                description: 'Formato original de la hora, o null si no existe.',
            },
            currency_regex: {
                type: Type.STRING,
                description: 'Regex JavaScript con exactamente un grupo de captura para moneda ISO 4217, o null si no existe.',
            },
            source_account_regex: {
                type: Type.STRING,
                description: 'Regex JavaScript con exactamente un grupo de captura para cuenta de origen, o null si no existe.',
            },
            expense_type: {
                type: Type.STRING,
                description: expenseTypeDescription,
                ...(expenseTypes.length > 0 ? {enum: expenseTypes.map((t) => t.name)} : {}),
            },
        },
        required: [
            'name',
            'entity_label',
            'is_new_entity',
            'entity_email_pattern',
            'subject_pattern',
            'match_pattern',
            'amount_regex',
            'merchant_regex',
            'date_regex',
            'date_format',
            'time_regex',
            'time_format',
            'currency_regex',
            'source_account_regex',
            'expense_type',
        ],
    };
}

function extractRequestData(rawBody: unknown): {
    sender: string;
    subject: string;
    body: string;
} | null {
    if (!isRecord(rawBody)) return null;

    const body = rawBody as SuggestionRequest;

    if (typeof body.emailText === 'string' && body.emailText.trim()) {
        const emailText = body.emailText.trim();
        const subjectMatch = /^Asunto:\s*(.*)$/im.exec(emailText);
        const senderMatch = /^Remitente:\s*(.*)$/im.exec(emailText);
        const marker = /\n\n/.exec(emailText);

        return {
            sender: senderMatch?.[1]?.trim() || '',
            subject: subjectMatch?.[1]?.trim() || '',
            body: marker ? emailText.slice(marker.index + marker[0].length).trim() : emailText,
        };
    }

    if (typeof body.sender !== 'string' || typeof body.subject !== 'string' || typeof body.body !== 'string') {
        return null;
    }

    if (!body.body.trim() && !body.subject.trim() && !body.sender.trim()) {
        return null;
    }

    return {
        sender: body.sender.trim(),
        subject: body.subject.trim(),
        body: body.body,
    };
}

export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient();

        const {
            data: {user},
            error: authError,
        } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({error: 'No autorizado'}, {status: 401});
        }

        const rawBody: unknown = await req.json().catch(() => null);
        const requestData = extractRequestData(rawBody);

        if (!requestData) {
            return NextResponse.json(
                {
                    error:
                        'Debes proporcionar el remitente, asunto y cuerpo de un correo de ejemplo.',
                },
                {status: 400},
            );
        }

        const apiKey = process.env.GEMINI_API_KEY;

        if (!apiKey) {
            return NextResponse.json(
                {error: 'GEMINI_API_KEY no está configurada en el servidor.'},
                {status: 503},
            );
        }

        const cleanBody = cleanEmailBody(requestData.body);
        const [existingEntities, expenseTypesRes] = await Promise.all([
            loadPromptEntities(supabase),
            supabase
                .from('expense_types')
                .select('name, label')
                .order('label', {ascending: true}),
        ]);

        const availableExpenseTypes: Array<{
            name: string;
            label?: string
        }> = (expenseTypesRes.data || []).map((t) => ({
            name: t.name,
            label: t.label || t.name,
        }));

        const prompt = buildTemplatePrompt(
            requestData.sender,
            requestData.subject,
            cleanBody,
            existingEntities,
            availableExpenseTypes,
        );

        const ai = new GoogleGenAI({
            apiKey,
            httpOptions: {
                headers: {
                    'User-Agent': 'deudita-email-template-generator',
                },
            },
        });

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                systemInstruction:
                    'Genera únicamente la plantilla JSON solicitada por las instrucciones del prompt. La fuente de verdad para limpieza, estructura, entidad, match_pattern y regex es el prompt proporcionado; no introduzcas campos adicionales ni inventes datos.',
                responseMimeType: 'application/json',
                responseSchema: buildSuggestionSchema(availableExpenseTypes),
            },
        });

        const textOutput = response.text?.trim();

        if (!textOutput) {
            return NextResponse.json(
                {error: 'La IA no devolvió una plantilla.'},
                {status: 502},
            );
        }

        const parsed = parseAITemplateResponse(textOutput);

        if (!parsed.success || !parsed.data) {
            return NextResponse.json(
                {
                    error:
                        parsed.error ||
                        'La IA devolvió una plantilla que no cumple la estructura esperada.',
                    warnings: parsed.warnings,
                },
                {status: 422},
            );
        }

        return NextResponse.json({
            suggestion: parsed.data,
            warnings: parsed.warnings,
        });
    } catch (err: unknown) {
        console.error('[API /api/email-templates/suggest] Error:', err);

        return NextResponse.json(
            {
                error:
                    err instanceof Error
                        ? err.message
                        : 'No se pudo generar la plantilla con IA.',
            },
            {status: 500},
        );
    }
}
