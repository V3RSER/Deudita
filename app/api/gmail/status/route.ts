import {NextRequest, NextResponse} from 'next/server';
import {cookies} from 'next/headers';
import {createClient} from '@/lib/supabase/server';
import {verifyGoogleToken} from '@/lib/google-auth';

export const dynamic = 'force-dynamic';

function getGoogleToken(
    req: NextRequest,
    userMetadata: Record<string, unknown>,
): string | null {
    const cookieStore = cookies();
    const headerToken = req.headers.get('x-google-token')?.trim();
    const cookieToken = cookieStore.get('google_provider_token')?.value?.trim();
    const metadataToken =
        typeof userMetadata.google_provider_token === 'string'
            ? userMetadata.google_provider_token.trim()
            : '';

    return headerToken || cookieToken || metadataToken || null;
}

function setGoogleTokenCookie(response: NextResponse, token: string): void {
    response.cookies.set('google_provider_token', token, {
        path: '/',
        httpOnly: false,
        secure: true,
        sameSite: 'lax',
        maxAge: 3600 * 24 * 7,
    });
}

function clearGoogleTokenCookies(response: NextResponse): void {
    response.cookies.delete('google_provider_token');
    response.cookies.delete('google_refresh_token');
}

export async function GET(req: NextRequest) {
    try {
        const supabase = await createClient();
        const {
            data: {user},
            error: authError,
        } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json(
                {authorized: false, error: 'No autenticado'},
                {status: 401},
            );
        }

        const token = getGoogleToken(
            req,
            (user.user_metadata || {}) as Record<string, unknown>,
        );

        if (!token) {
            return NextResponse.json({
                authorized: false,
                requiresToken: true,
                userEmail: user.email,
            });
        }

        const verification = await verifyGoogleToken(token);

        if (!verification.valid) {
            const response = NextResponse.json({
                authorized: false,
                expired: true,
                userEmail: user.email,
                error: verification.error || 'Token de Google no válido',
            });

            response.cookies.delete('google_provider_token');
            return response;
        }

        const profileEmail = verification.email || user.email;

        if (user.user_metadata?.google_provider_token !== token) {
            try {
                await supabase.auth.updateUser({
                    data: {google_provider_token: token},
                });
            } catch (updateError: unknown) {
                console.warn(
                    '[API /api/gmail/status] No se pudo actualizar el token de Google:',
                    updateError,
                );
            }
        }

        const response = NextResponse.json({
            authorized: true,
            email: profileEmail,
            userEmail: user.email,
            gmailApiEnabled: verification.gmailApiEnabled,
            serviceDisabled: verification.serviceDisabled,
            activationUrl: verification.activationUrl,
            projectId: verification.projectId,
        });

        setGoogleTokenCookie(response, token);
        return response;
    } catch (err: unknown) {
        console.error('[API /api/gmail/status GET] Error:', err);
        return NextResponse.json(
            {
                authorized: false,
                error: err instanceof Error ? err.message : 'Error interno',
            },
            {status: 500},
        );
    }
}

export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient();
        const {
            data: {user},
            error: authError,
        } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json(
                {authorized: false, error: 'No autenticado'},
                {status: 401},
            );
        }

        const body: unknown = await req.json().catch(() => ({}));

        if (
            typeof body === 'object' &&
            body !== null &&
            'action' in body &&
            body.action === 'disconnect'
        ) {
            try {
                await supabase.auth.updateUser({
                    data: {google_provider_token: null},
                });
            } catch (updateError: unknown) {
                console.warn(
                    '[API /api/gmail/status] No se pudo eliminar el token de Google:',
                    updateError,
                );
            }

            const response = NextResponse.json({authorized: false});
            clearGoogleTokenCookies(response);
            return response;
        }

        const token =
            typeof body === 'object' &&
            body !== null &&
            'token' in body &&
            typeof body.token === 'string'
                ? body.token.trim()
                : req.headers.get('x-google-token')?.trim() || null;

        if (!token) {
            return NextResponse.json(
                {error: 'Se requiere un token de Google'},
                {status: 400},
            );
        }

        const verification = await verifyGoogleToken(token);

        if (!verification.valid) {
            return NextResponse.json(
                {
                    authorized: false,
                    error: verification.error || 'Token no válido',
                },
                {status: 400},
            );
        }

        const profileEmail = verification.email || user.email;

        try {
            await supabase.auth.updateUser({
                data: {google_provider_token: token},
            });
        } catch (updateError: unknown) {
            console.warn(
                '[API /api/gmail/status] No se pudo guardar el token de Google:',
                updateError,
            );
        }

        const response = NextResponse.json({
            authorized: true,
            email: profileEmail,
            userEmail: user.email,
            gmailApiEnabled: verification.gmailApiEnabled,
            serviceDisabled: verification.serviceDisabled,
            activationUrl: verification.activationUrl,
            projectId: verification.projectId,
        });

        setGoogleTokenCookie(response, token);
        return response;
    } catch (err: unknown) {
        console.error('[API /api/gmail/status POST] Error:', err);
        return NextResponse.json(
            {
                error: err instanceof Error ? err.message : 'Error interno',
            },
            {status: 500},
        );
    }
}
