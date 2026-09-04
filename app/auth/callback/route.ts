import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { claimAndJoinGroupInvite, claimAllTempProfilesForUser } from '@/lib/invite-utils';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const returnTo = searchParams.get('returnTo');
  const cookieStore = await cookies();
  const cookieToken = cookieStore.get('deudita_invite_token')?.value;
  const token = searchParams.get('token') ?? searchParams.get('invite_token') ?? cookieToken;

  if (code) {
    const supabase = await createClient();
    const { data: sessionData, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const { data: { user } } = await supabase.auth.getUser();

      let joinedGroupId: string | null = null;

      if (user) {
        const inviteTokenToUse = token ?? user.user_metadata?.invite_token;
        if (inviteTokenToUse) {
          try {
            const claimResult = await claimAndJoinGroupInvite(supabase, inviteTokenToUse, user);
            if (claimResult?.groupId) {
              joinedGroupId = claimResult.groupId;
            }
          } catch (err) {
            console.error('[auth/callback] Error claiming token:', err);
          }
        } else {
          try {
            await claimAllTempProfilesForUser(supabase, user);
          } catch (claimErr) {
            console.warn('[auth/callback] Warning claiming temp profiles:', claimErr);
          }
        }
      }

      let redirectUrl = `${origin}/groups`;
      if (returnTo && returnTo.startsWith('/') && !returnTo.startsWith('/join')) {
        redirectUrl = `${origin}${returnTo}`;
      } else if (joinedGroupId) {
        redirectUrl = `${origin}/groups/${joinedGroupId}`;
      }

      const isEmailTemplatesReturn = Boolean(returnTo && returnTo.includes('/email-templates'));

      // If user came from tester auth flow, mark as tester in user metadata
      if (user && (isEmailTemplatesReturn || sessionData?.session?.provider_token)) {
        try {
          const metaUpdates: Record<string, unknown> = { is_tester: true };
          if (sessionData?.session?.provider_token) {
            metaUpdates.google_provider_token = sessionData.session.provider_token;
          }
          await supabase.auth.updateUser({ data: metaUpdates });
        } catch (metaErr) {
          console.warn('[auth/callback] Error updating user metadata for tester:', metaErr);
        }
      }

      // If redirecting to email-templates, append tester tokens/params so client captures them
      if (isEmailTemplatesReturn) {
        const sep = redirectUrl.includes('?') ? '&' : '?';
        const params = new URLSearchParams();
        params.set('tester_authorized', 'true');
        if (sessionData?.session?.provider_token) {
          params.set('tester_token', sessionData.session.provider_token);
        }
        redirectUrl = `${redirectUrl}${sep}${params.toString()}`;
      }

      const response = NextResponse.redirect(redirectUrl);
      response.cookies.delete('deudita_invite_token');

      // Ensure all Supabase session cookies from cookieStore are transferred to response
      cookieStore.getAll().forEach((c) => {
        response.cookies.set(c.name, c.value, {
          path: '/',
          secure: true,
          sameSite: 'none',
        });
      });

      if (sessionData?.session?.provider_token) {
        response.cookies.set('google_provider_token', sessionData.session.provider_token, {
          path: '/',
          httpOnly: false,
          secure: true,
          sameSite: 'none',
          maxAge: 3600 * 24 * 7,
        });
      }

      if (sessionData?.session?.provider_refresh_token) {
        response.cookies.set('google_refresh_token', sessionData.session.provider_refresh_token, {
          path: '/',
          httpOnly: true,
          secure: true,
          sameSite: 'none',
          maxAge: 3600 * 24 * 30,
        });
      }

      return response;
    }
  }

  // Return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/login?error=Ocurrió%20un%20error%20al%20iniciar%20sesión`);
}

