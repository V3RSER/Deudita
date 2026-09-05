import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { verifyGoogleToken } from '@/lib/google-auth';

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
      cookieStore.get('google_provider_token')?.value ||
      (user.user_metadata?.google_provider_token as string | undefined);

    const isExplicitTester = Boolean(
      user.user_metadata?.is_tester ||
      user.email === 'wizdeiko@gmail.com'
    );

    if (!token) {
      return NextResponse.json({
        authorized: isExplicitTester,
        authenticated: isExplicitTester,
        isTester: isExplicitTester,
        requiresToken: true,
        userEmail: user.email,
      });
    }

    // Verificar token y estado de Gmail API
    const verification = await verifyGoogleToken(token);

    if (!verification.valid) {
      // Si el token falló pero el usuario es tester registrado, no bloquearlo por completo
      return NextResponse.json({
        authorized: isExplicitTester,
        isTester: isExplicitTester,
        expired: true,
        userEmail: user.email,
        error: verification.error,
      });
    }

    const profileEmail = verification.email || user.email;

    // Actualizar metadata en background
    if (!user.user_metadata?.is_tester || user.user_metadata?.google_provider_token !== token) {
      try {
        await supabase.auth.updateUser({
          data: {
            is_tester: true,
            google_provider_token: token,
            tester_email: profileEmail,
          },
        });
      } catch (uErr) {
        console.warn('[API /api/gmail/status] Could not update user metadata:', uErr);
      }
    }

    const response = NextResponse.json({
      authorized: true,
      authenticated: true,
      isTester: true,
      email: profileEmail,
      userEmail: user.email,
      gmailApiEnabled: verification.gmailApiEnabled,
      serviceDisabled: verification.serviceDisabled,
      activationUrl: verification.activationUrl,
      projectId: verification.projectId,
    });

    response.cookies.set('google_provider_token', token, {
      path: '/',
      httpOnly: false,
      secure: true,
      sameSite: 'lax',
      maxAge: 3600 * 24 * 7,
    });

    return response;
  } catch (err) {
    console.error('[API /api/gmail/status] Error:', err);
    return NextResponse.json({ authorized: false }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ authorized: false, error: 'No autenticado' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    if (body.action === 'disconnect') {
      try {
        await supabase.auth.updateUser({
          data: {
            is_tester: false,
            google_provider_token: null,
          },
        });
      } catch (uErr) {
        console.warn('[API /api/gmail/status] Error clearing user metadata on disconnect:', uErr);
      }

      const response = NextResponse.json({ authorized: false });
      response.cookies.delete('google_provider_token');
      response.cookies.delete('google_refresh_token');
      return response;
    }

    // Validar y registrar token enviado directamente
    const token = body.token || req.headers.get('x-google-token');
    if (token) {
      const verification = await verifyGoogleToken(token);

      if (!verification.valid) {
        return NextResponse.json(
          { authorized: false, error: verification.error || 'Token no válido' },
          { status: 400 }
        );
      }

      const profileEmail = verification.email || user.email;

      try {
        await supabase.auth.updateUser({
          data: {
            is_tester: true,
            google_provider_token: token,
            tester_email: profileEmail,
          },
        });
      } catch (uErr) {
        console.warn('[API /api/gmail/status] Error updating user metadata:', uErr);
      }

      const response = NextResponse.json({
        authorized: true,
        isTester: true,
        email: profileEmail,
        userEmail: user.email,
        gmailApiEnabled: verification.gmailApiEnabled,
        serviceDisabled: verification.serviceDisabled,
        activationUrl: verification.activationUrl,
        projectId: verification.projectId,
      });

      response.cookies.set('google_provider_token', token, {
        path: '/',
        httpOnly: false,
        secure: true,
        sameSite: 'lax',
        maxAge: 3600 * 24 * 7,
      });

      return response;
    }

    return NextResponse.json({ error: 'Se requiere un token de Google' }, { status: 400 });
  } catch (err) {
    console.error('[API /api/gmail/status POST] Error:', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
