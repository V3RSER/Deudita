import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ authorized: false, error: 'No autenticado' }, { status: 401 });
    }

    const cookieStore = await cookies();
    const token =
      req.headers.get('x-google-token') ||
      cookieStore.get('google_provider_token')?.value;

    if (!token) {
      return NextResponse.json({
        authorized: false,
        userEmail: user.email,
      });
    }

    // Verificar si el token sigue vigente contra la API de Gmail
    const profileRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });

    if (!profileRes.ok) {
      return NextResponse.json({
        authorized: false,
        expired: true,
        userEmail: user.email,
      });
    }

    const profile = await profileRes.json();

    return NextResponse.json({
      authorized: true,
      email: profile.emailAddress,
      userEmail: user.email,
    });
  } catch (err) {
    console.error('[API /api/gmail/status] Error:', err);
    return NextResponse.json({ authorized: false }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    if (body.action === 'disconnect') {
      const response = NextResponse.json({ authorized: false });
      response.cookies.delete('google_provider_token');
      response.cookies.delete('google_refresh_token');
      return response;
    }
    return NextResponse.json({ error: 'Acción no reconocida' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
