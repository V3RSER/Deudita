import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { cleanEmailBody } from '@/lib/email-cleaning';

export const dynamic = 'force-dynamic';

export interface EmailItem {
  id: string;
  subject: string;
  sender: string;
  date: string;
  snippet: string;
  plainBody: string;
  body: string;
}

interface GmailPart {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailPart[];
}

interface GmailListResponse {
  messages?: Array<{ id: string; threadId: string }>;
  nextPageToken?: string;
  resultSizeEstimate?: number;
}

interface GmailHeader {
  name: string;
  value: string;
}

interface GmailMessage {
  id: string;
  snippet?: string;
  payload?: {
    headers?: GmailHeader[];
    mimeType?: string;
    body?: { data?: string };
    parts?: GmailPart[];
  };
}

function decodeBase64Url(data: string): string {
  try {
    const sanitized = data.replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(sanitized, 'base64').toString('utf-8');
  } catch {
    return '';
  }
}

function extractBody(payload?: GmailPart): string {
  if (!payload) return '';

  let plainText = '';
  let htmlText = '';

  const visit = (part: GmailPart): void => {
    if (part.mimeType === 'text/plain' && part.body?.data) {
      const decoded = decodeBase64Url(part.body.data);
      if (decoded.trim()) plainText += `${plainText ? '\n' : ''}${decoded}`;
    }

    if (part.mimeType === 'text/html' && part.body?.data) {
      const decoded = decodeBase64Url(part.body.data);
      if (decoded.trim()) htmlText += `${htmlText ? '\n' : ''}${decoded}`;
    }

    part.parts?.forEach(visit);
  };

  visit(payload);

  if (plainText.trim()) {
    return plainText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  }

  if (htmlText.trim()) return htmlText;

  return payload.body?.data ? decodeBase64Url(payload.body.data) : '';
}

function getHeader(headers: GmailHeader[], name: string): string {
  return headers.find((header) => header.name.toLowerCase() === name)?.value || '';
}

function buildGmailListUrl(
  query: string,
  limit: number,
  pageToken: string | null,
): string {
  const params = new URLSearchParams({
    q: query,
    maxResults: String(limit),
  });

  if (pageToken) params.set('pageToken', pageToken);

  return `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params.toString()}`;
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Sesión no válida. Inicia sesión en la aplicación.' },
        { status: 401 },
      );
    }

    const { searchParams } = new URL(req.url);
    const parsedLimit = Number.parseInt(searchParams.get('limit') || '25', 10);
    const limit = Math.min(Math.max(Number.isNaN(parsedLimit) ? 25 : parsedLimit, 1), 50);
    const pageToken = searchParams.get('pageToken')?.trim() || null;
    const subjectSearch = (searchParams.get('subject') || searchParams.get('q') || '').trim();
    const entityFilter = (searchParams.get('entity') || 'all').trim();

    const cookieStore = await cookies();
    const googleToken =
      req.headers.get('x-google-token') ||
      cookieStore.get('google_provider_token')?.value ||
      (user.user_metadata?.google_provider_token as string | undefined);

    if (!googleToken) {
      return NextResponse.json({
        connected: false,
        live: false,
        requiresAuth: true,
        userEmail: user.email,
        emails: [],
        count: 0,
        totalAvailable: 0,
        nextPageToken: null,
        notice: `Para recuperar los correos de tu cuenta (${user.email}), es necesario autorizar el acceso a Gmail.`,
      });
    }

    const queryParts = [
      subjectSearch,
      entityFilter !== 'all' ? entityFilter : '',
    ].filter(Boolean);
    const gmailQuery = queryParts.length > 0 ? queryParts.join(' ') : 'in:inbox';

    const listRes = await fetch(buildGmailListUrl(gmailQuery, limit, pageToken), {
      headers: {
        Authorization: `Bearer ${googleToken}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
    });

    if (!listRes.ok) {
      const errText = await listRes.text();
      console.error('[API /api/gmail/emails] Error al consultar Gmail API:', listRes.status, errText);

      if (
        errText.includes('SERVICE_DISABLED') ||
        errText.includes('Gmail API has not been used in project') ||
        errText.includes('is disabled')
      ) {
        const match = errText.match(/project (\d+)/i) || errText.match(/project=(\d+)/i);
        const projectId = match ? match[1] : '50652631364';
        const activationUrl = `https://console.developers.google.com/apis/api/gmail.googleapis.com/overview?project=${projectId}`;

        return NextResponse.json({
          connected: true,
          live: false,
          requiresAuth: false,
          serviceDisabled: true,
          activationUrl,
          projectId,
          userEmail: user.email,
          emails: [],
          count: 0,
          totalAvailable: 0,
          nextPageToken: null,
          notice: `Tu cuenta de Google (${user.email}) está autorizada, pero Gmail API está desactivada en tu proyecto de Google Cloud (${projectId}).`,
        });
      }

      if (listRes.status === 401) {
        const response = NextResponse.json(
          {
            connected: false,
            live: false,
            requiresAuth: true,
            userEmail: user.email,
            emails: [],
            count: 0,
            totalAvailable: 0,
            nextPageToken: null,
            error: 'AUTH_REQUIRED',
            notice: `El permiso de acceso a Gmail para ${user.email} ha caducado. Renueva el acceso para continuar.`,
          },
          { status: 401 },
        );
        response.cookies.delete('google_provider_token');
        return response;
      }

      return NextResponse.json(
        {
          connected: false,
          live: false,
          userEmail: user.email,
          emails: [],
          count: 0,
          totalAvailable: 0,
          nextPageToken: null,
          error: `Error de Gmail (${listRes.status})`,
          notice: `No se pudo consultar Gmail: ${errText.substring(0, 150)}`,
        },
        { status: listRes.status },
      );
    }

    const listData = await listRes.json() as GmailListResponse;
    const messages = listData.messages || [];

    if (messages.length === 0) {
      return NextResponse.json({
        connected: true,
        live: true,
        userEmail: user.email,
        emails: [],
        count: 0,
        totalAvailable: listData.resultSizeEstimate || 0,
        nextPageToken: null,
        notice: `No se encontraron correos en tu bandeja de Gmail (${user.email}) con el filtro actual ("${gmailQuery}").`,
      });
    }

    const results = await Promise.all(
      messages.map(async ({ id }) => {
        try {
          const detailRes = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`,
            {
              headers: { Authorization: `Bearer ${googleToken}` },
              cache: 'no-store',
            },
          );

          if (!detailRes.ok) return null;

          const detail = await detailRes.json() as GmailMessage;
          const headers = detail.payload?.headers || [];
          const subject = getHeader(headers, 'subject') || '(Sin asunto)';
          const sender = getHeader(headers, 'from');
          const dateHeader = getHeader(headers, 'date');
          const rawBody = extractBody(detail.payload) || detail.snippet || '';
          const body = cleanEmailBody(rawBody);

          const parsedDate = dateHeader ? new Date(dateHeader) : new Date();
          const date = Number.isNaN(parsedDate.getTime()) ? new Date().toISOString() : parsedDate.toISOString();

          const item: EmailItem = {
            id: detail.id,
            subject,
            sender,
            date,
            snippet: body.slice(0, 160) || detail.snippet || '',
            plainBody: body,
            body,
          };

          return item;
        } catch (err: unknown) {
          console.warn(`[api/gmail/emails] Error cargando mensaje ${id}:`, err);
          return null;
        }
      }),
    );

    const emails = results.filter((item): item is EmailItem => item !== null);

    return NextResponse.json({
      connected: true,
      live: true,
      userEmail: user.email,
      emails,
      count: emails.length,
      totalAvailable: listData.resultSizeEstimate || emails.length,
      nextPageToken: listData.nextPageToken || null,
      notice: `Se recuperaron ${emails.length} correos reales desde tu cuenta de Gmail (${user.email}).`,
    });
  } catch (err: unknown) {
    console.error('[API GET /api/gmail/emails] Error fatal:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error interno al consultar Gmail' },
      { status: 500 },
    );
  }
}

