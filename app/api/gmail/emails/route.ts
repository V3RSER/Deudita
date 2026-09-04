import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export interface EmailItem {
  id: string;
  subject: string;
  sender: string;
  date: string;
  snippet: string;
  plainBody: string;
  entityName?: string;
}

/**
 * Decodifica cadenas base64 URL-safe de la API de Gmail
 */
function decodeBase64Url(data: string): string {
  try {
    const sanitized = data.replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(sanitized, 'base64').toString('utf-8');
  } catch {
    return '';
  }
}

/**
 * Limpia etiquetas HTML para obtener texto plano legible
 */
function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

interface GmailPart {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailPart[];
}

/**
 * Extrae de forma recursiva el cuerpo en texto plano o HTML limpio de un mensaje de Gmail
 */
function extractBody(payload?: GmailPart): string {
  if (!payload) return '';

  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }

  let plainContent = '';
  let htmlContent = '';

  function traverse(part: GmailPart) {
    if (part.mimeType === 'text/plain' && part.body?.data && !plainContent) {
      plainContent = decodeBase64Url(part.body.data);
    } else if (part.mimeType === 'text/html' && part.body?.data && !htmlContent) {
      htmlContent = stripHtml(decodeBase64Url(part.body.data));
    }
    if (part.parts && Array.isArray(part.parts)) {
      for (const subPart of part.parts) {
        traverse(subPart);
      }
    }
  }

  traverse(payload);

  return plainContent || htmlContent || (payload.body?.data ? decodeBase64Url(payload.body.data) : '');
}

/**
 * GET /api/gmail/emails
 * Recupera correos reales de la cuenta de Gmail del usuario autenticado
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Sesión no válida. Inicia sesión en la aplicación.' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '10', 10), 1), 50);
    const subjectSearch = (searchParams.get('subject') || searchParams.get('q') || '').trim();
    const entityFilter = (searchParams.get('entity') || 'all').trim();

    // Obtener token de Google desde el encabezado, la cookie de sesión o los metadatos del usuario
    const cookieStore = await cookies();
    const googleToken =
      req.headers.get('x-google-token') ||
      cookieStore.get('google_provider_token')?.value ||
      (user.user_metadata?.google_provider_token as string | undefined);

    // Si no hay token de acceso a Gmail disponible
    if (!googleToken) {
      return NextResponse.json({
        connected: false,
        live: false,
        requiresAuth: true,
        userEmail: user.email,
        emails: [],
        count: 0,
        totalAvailable: 0,
        notice: `Para recuperar los correos de tu cuenta (${user.email}), es necesario autorizar el acceso a Gmail.`,
      });
    }

    // Construir query de búsqueda para Gmail API
    const queryParts: string[] = [];

    if (subjectSearch) {
      queryParts.push(subjectSearch);
    }

    if (entityFilter && entityFilter !== 'all') {
      queryParts.push(entityFilter);
    }

    // Si no hay filtro específico, consultar los correos de la bandeja de entrada
    const gmailQuery = queryParts.length > 0 ? queryParts.join(' ') : 'in:inbox';

    const listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(gmailQuery)}&maxResults=${limit}`;
    const listRes = await fetch(listUrl, {
      headers: {
        Authorization: `Bearer ${googleToken}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
    });

    if (!listRes.ok) {
      const errText = await listRes.text();
      console.error('[API /api/gmail/emails] Error al consultar Gmail API:', listRes.status, errText);

      if (listRes.status === 401 || listRes.status === 403) {
        return NextResponse.json(
          {
            connected: false,
            live: false,
            requiresAuth: true,
            userEmail: user.email,
            emails: [],
            count: 0,
            error: 'AUTH_REQUIRED',
            notice: `El permiso de acceso a Gmail para ${user.email} ha caducado o requiere autorización. Haz clic en Autorizar Gmail para renovarlo.`,
          },
          { status: 401 }
        );
      }

      return NextResponse.json(
        {
          connected: false,
          live: false,
          userEmail: user.email,
          emails: [],
          count: 0,
          error: `Error de Gmail (${listRes.status})`,
          notice: `No se pudo consultar Gmail: ${errText.substring(0, 150)}`,
        },
        { status: listRes.status }
      );
    }

    const listData = await listRes.json();
    const messages: Array<{ id: string; threadId: string }> = listData.messages || [];

    if (messages.length === 0) {
      return NextResponse.json({
        connected: true,
        live: true,
        userEmail: user.email,
        emails: [],
        count: 0,
        totalAvailable: 0,
        notice: `No se encontraron correos en tu bandeja de Gmail (${user.email}) con el filtro actual ("${gmailQuery}").`,
      });
    }

    // Obtener detalles de cada correo en paralelo
    const detailPromises = messages.slice(0, limit).map(async (msg) => {
      try {
        const detailRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
          {
            headers: { Authorization: `Bearer ${googleToken}` },
            cache: 'no-store',
          }
        );
        if (!detailRes.ok) return null;

        const detail = await detailRes.json();
        const headers = detail.payload?.headers || [];
        const subjectHeader =
          headers.find((h: { name: string; value: string }) => h.name.toLowerCase() === 'subject')?.value ||
          '(Sin Asunto)';
        const fromHeader =
          headers.find((h: { name: string; value: string }) => h.name.toLowerCase() === 'from')?.value || '';
        const dateHeader =
          headers.find((h: { name: string; value: string }) => h.name.toLowerCase() === 'date')?.value ||
          new Date().toISOString();

        const plainText = extractBody(detail.payload) || detail.snippet || '';

        const item: EmailItem = {
          id: detail.id,
          subject: subjectHeader,
          sender: fromHeader,
          date: new Date(dateHeader).toISOString(),
          snippet: detail.snippet || plainText.substring(0, 160),
          plainBody: plainText,
        };

        return item;
      } catch (err) {
        console.warn(`[api/gmail/emails] Error cargando mensaje ${msg.id}:`, err);
        return null;
      }
    });

    const results = await Promise.all(detailPromises);
    const fetchedEmails = results.filter((item): item is EmailItem => item !== null);

    return NextResponse.json({
      connected: true,
      live: true,
      userEmail: user.email,
      emails: fetchedEmails,
      count: fetchedEmails.length,
      totalAvailable: listData.resultSizeEstimate || messages.length,
      notice: `Se recuperaron ${fetchedEmails.length} correos reales desde tu cuenta de Gmail (${user.email}).`,
    });
  } catch (err: unknown) {
    console.error('[API GET /api/gmail/emails] Error fatal:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error interno al consultar Gmail' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/gmail/emails
 * Permite guardar o refrescar manualmente el token de Google para la sesión
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { token } = await req.json().catch(() => ({}));
    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'Token de Google requerido' }, { status: 400 });
    }

    // Validar token contra el perfil de Gmail
    const profileRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!profileRes.ok) {
      return NextResponse.json(
        { error: 'El token proporcionado no es válido para acceder a Gmail.' },
        { status: 400 }
      );
    }

    const profileData = await profileRes.json();

    const response = NextResponse.json({
      success: true,
      email: profileData.emailAddress,
      messagesTotal: profileData.messagesTotal,
    });

    try {
      await supabase.auth.updateUser({
        data: {
          is_tester: true,
          google_provider_token: token,
          tester_email: profileData.emailAddress,
        },
      });
    } catch (uErr) {
      console.warn('[API /api/gmail/emails POST] Error updating user metadata:', uErr);
    }

    response.cookies.set('google_provider_token', token, {
      path: '/',
      httpOnly: false,
      secure: true,
      sameSite: 'none',
      maxAge: 3600 * 24 * 7,
    });

    return response;
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error al guardar token' },
      { status: 500 }
    );
  }
}
