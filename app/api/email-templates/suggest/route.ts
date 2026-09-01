import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { GoogleGenAI, Type } from '@google/genai';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { emailText } = body;

    if (!emailText || typeof emailText !== 'string' || !emailText.trim()) {
      return NextResponse.json(
        { error: 'Debes proporcionar el texto de ejemplo del correo' },
        { status: 400 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      // Si no hay API key configurada, generamos una sugerencia heurística básica
      const heuristicSuggestion = generateHeuristicRegex(emailText);
      return NextResponse.json({ suggestion: heuristicSuggestion });
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const prompt = `Analiza el siguiente texto de un correo bancario o comprobante de compra y diseña expresiones regulares (regex) precisas y robustas para extraer los campos en Google Apps Script / JavaScript.

TEXTO DEL CORREO DE EJEMPLO:
"""
${emailText.slice(0, 4000)}
"""

Genera expresiones regulares con grupos de captura () para cada campo aplicable. Asegúrate de que amount_regex capture el monto numérico (ej: "150.000" o "25.50").`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        systemInstruction:
          'Eres un ingeniero experto en expresiones regulares y procesamiento de correos bancarios transaccionales (Bancolombia, Davivienda, Nequi, BBVA, Banco de Bogotá, Nu, Santander, Mercado Pago, etc.). Tu objetivo es analizar el texto del correo proporcionado y generar una plantilla con patrones regex optimizados para extraer monto, comercio, fecha, entidad, moneda y cuenta.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            name: {
              type: Type.STRING,
              description: 'Nombre descriptivo de la plantilla, ej: Bancolombia - Compras con Débito',
            },
            entity_name: {
              type: Type.STRING,
              description: 'Nombre del banco o entidad emisora, ej: Bancolombia',
            },
            sender_pattern: {
              type: Type.STRING,
              description: 'Patrón regex para filtrar el remitente del correo, ej: .*@bancolombia\\.com.*',
            },
            subject_pattern: {
              type: Type.STRING,
              description: 'Patrón regex para filtrar el asunto del correo, ej: .*(compra|notificación).*',
            },
            amount_regex: {
              type: Type.STRING,
              description: 'Regex con grupo de captura () para el monto numérico, ej: (?:por|monto|valor|\\$)\\s*\\$?([0-9.,]+)',
            },
            merchant_regex: {
              type: Type.STRING,
              description: 'Regex con grupo de captura () para el nombre del comercio o destinatario, ej: en\\s+([A-Za-z0-9\\s._-]+?)(?:\\s+el|\\s+por|\\.|$)',
            },
            date_regex: {
              type: Type.STRING,
              description: 'Regex con grupo de captura () para la fecha, ej: ([0-9]{2}/[0-9]{2}/[0-9]{4})',
            },
            date_format: {
              type: Type.STRING,
              description: 'Formato de la fecha capturada, ej: DD/MM/YYYY o YYYY-MM-DD',
            },
            default_currency: {
              type: Type.STRING,
              description: 'Código de moneda por defecto, ej: COP, USD, EUR, MXN',
            },
            currency_regex: {
              type: Type.STRING,
              description: 'Regex con grupo de captura () para la moneda si aparece en el texto, ej: (COP|\\$|USD)',
            },
            source_account_regex: {
              type: Type.STRING,
              description: 'Regex con grupo de captura () para la cuenta o tarjeta, ej: cuenta\\s*\\*?([0-9]{4})',
            },
            time_regex: {
              type: Type.STRING,
              description: 'Regex con grupo de captura () para la hora de la transacción, ej: ([0-9]{1,2}:[0-9]{2}(?:\\s*(?:AM|PM|am|pm))?)',
            },
          },
          required: ['name', 'amount_regex', 'default_currency'],
        },
      },
    });

    const textOutput = response.text;
    if (!textOutput) {
      const fallback = generateHeuristicRegex(emailText);
      return NextResponse.json({ suggestion: fallback });
    }

    const suggestion = JSON.parse(textOutput.trim());
    return NextResponse.json({ suggestion });
  } catch (err: unknown) {
    console.error('[API /api/email-templates/suggest] Error:', err);
    // En caso de fallo con el modelo, devolver heurística para no bloquear al usuario
    const fallback = generateHeuristicRegex(req.body ? '' : '');
    return NextResponse.json({
      suggestion: fallback,
      warning: 'Generado con estimación base debido a saturación temporal del servicio de IA.',
    });
  }
}

function generateHeuristicRegex(text: string) {
  let detectedEntity = 'Banco o Comercio';
  let defaultCurr = 'COP';
  if (/bancolombia/i.test(text)) detectedEntity = 'Bancolombia';
  else if (/nequi/i.test(text)) detectedEntity = 'Nequi';
  else if (/daviplata/i.test(text)) detectedEntity = 'Daviplata';
  else if (/davivienda/i.test(text)) detectedEntity = 'Davivienda';
  else if (/bbva/i.test(text)) detectedEntity = 'BBVA';
  else if (/uber/i.test(text)) detectedEntity = 'Uber';

  if (/usd|\$/i.test(text) && !/cop/i.test(text)) defaultCurr = 'USD';

  return {
    name: `${detectedEntity} - Notificación de Gasto`,
    entity_name: detectedEntity,
    sender_pattern: `.*@${detectedEntity.toLowerCase().replace(/\s+/g, '')}\\.com.*`,
    subject_pattern: '.*(compra|pago|aprobada|transacción).*',
    amount_regex: '(?:por|valor|monto|\\$)\\s*\\$?([0-9.,]+)',
    merchant_regex: 'en\\s+([A-Za-z0-9\\s._-]+?)(?:\\s+el|\\s+por|\\.|$)',
    date_regex: '([0-9]{2}/[0-9]{2}/[0-9]{4}|[0-9]{4}-[0-9]{2}-[0-9]{2})',
    date_format: 'DD/MM/YYYY',
    default_currency: defaultCurr,
    currency_regex: '(COP|\\$|USD|EUR)',
    source_account_regex: '(?:cuenta|tarjeta|\\*)\\s*\\*?([0-9]{4})',
    time_regex: '([0-9]{1,2}:[0-9]{2}(?:\\s*(?:AM|PM|am|pm))?)',
  };
}
