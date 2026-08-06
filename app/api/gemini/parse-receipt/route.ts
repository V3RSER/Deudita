import { GoogleGenAI, Type } from '@google/genai';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Clave GEMINI_API_KEY no configurada' },
        { status: 500 }
      );
    }

    const body = await req.json();
    const { text, imageBase64, mimeType } = body;

    if (!text && !imageBase64) {
      return NextResponse.json(
        { error: 'Se requiere texto o imagen para procesar el comprobante' },
        { status: 400 }
      );
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const parts: Array<{ text?: string; inlineData?: { data: string; mimeType: string } }> = [];

    if (text) {
      parts.push({
        text: `Analiza el siguiente texto de correo o comprobante de gasto y extrae la información requerida:\n\n${text}`,
      });
    }

    if (imageBase64) {
      parts.push({
        inlineData: {
          data: imageBase64,
          mimeType: mimeType ? mimeType : 'image/jpeg',
        },
      });
      parts.push({
        text: 'Analiza este ticket o comprobante físico de compra y extrae sus datos.',
      });
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: { parts },
      config: {
        systemInstruction:
          'Eres un asistente contable experto en detectar gastos en correos electrónicos y boletas. Extrae de forma precisa el comercio/proveedor (merchant), el monto total (detected_amount) como número, la fecha estimada YYYY-MM-DD (detected_date), una estimación de confianza entre 0.50 y 0.99 (confidence), y el desglose de ítems detectados con descripción y monto si están disponibles.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            detected_merchant: {
              type: Type.STRING,
              description: 'Nombre del comercio o proveedor',
            },
            detected_amount: {
              type: Type.NUMBER,
              description: 'Monto total numérico del gasto',
            },
            detected_date: {
              type: Type.STRING,
              description: 'Fecha del gasto en formato YYYY-MM-DD',
            },
            confidence: {
              type: Type.NUMBER,
              description: 'Nivel de confianza entre 0.0 y 1.0',
            },
            raw_snippet: {
              type: Type.STRING,
              description: 'Resumen o extracto relevante del gasto',
            },
            extracted_items: {
              type: Type.ARRAY,
              description: 'Lista de ítems individuales del comprobante si existen',
              items: {
                type: Type.OBJECT,
                properties: {
                  description: { type: Type.STRING },
                  amount: { type: Type.NUMBER },
                },
                required: ['description', 'amount'],
              },
            },
          },
          required: ['detected_merchant', 'detected_amount', 'detected_date', 'confidence', 'raw_snippet'],
        },
      },
    });

    const textOutput = response.text;
    if (!textOutput) {
      return NextResponse.json(
        { error: 'No se obtuvo respuesta del modelo AI' },
        { status: 500 }
      );
    }

    const result = JSON.parse(textOutput.trim());

    return NextResponse.json({
      success: true,
      draft: {
        detected_merchant: result.detected_merchant,
        detected_amount: Number(result.detected_amount),
        detected_date: result.detected_date,
        confidence: Number(result.confidence),
        raw_snippet: result.raw_snippet,
        extracted_items: Array.isArray(result.extracted_items) ? result.extracted_items : [],
      },
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Error interno al procesar gasto';
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
