import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { claimAndJoinGroupInvite, claimAllTempProfilesForUser } from '@/lib/invite-utils';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const cookieStore = await cookies();
  const cookieReturnTo = cookieStore.get('auth_return_to')?.value;
  const pendingTesterAuth = cookieStore.get('pending_tester_auth')?.value === 'true';
  const paramReturnTo = searchParams.get('returnTo');
  const returnTo = paramReturnTo || cookieReturnTo || (pendingTesterAuth ? '/email-templates?tab=create-test' : null);

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

      const providerToken = sessionData?.session?.provider_token;
      const providerRefreshToken = sessionData?.session?.provider_refresh_token;

      // Check if the token has active Gmail permissions
      let hasGmailScope = false;
      let profileEmail: string | null = null;

      if (providerToken) {
        try {
          const profileRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
            headers: { Authorization: `Bearer ${providerToken}` },
            cache: 'no-store',
          });
          if (profileRes.ok) {
            hasGmailScope = true;
            const profile = await profileRes.json();
            profileEmail = profile.emailAddress;
          }
        } catch (e) {
          console.warn('[auth/callback] Error verifying Gmail scope:', e);
        }
      }

      // If user came from tester auth flow or got Gmail scope, mark metadata
      if (user && (hasGmailScope || pendingTesterAuth || providerToken)) {
        try {
          const metaUpdates: Record<string, unknown> = {
            is_tester: true,
            gmail_authorized_at: new Date().toISOString(),
          };
          if (providerToken) {
            metaUpdates.google_provider_token = providerToken;
          }
          if (profileEmail) {
            metaUpdates.tester_email = profileEmail;
          }
          await supabase.auth.updateUser({ data: metaUpdates });
        } catch (metaErr) {
          console.warn('[auth/callback] Error updating user metadata for tester:', metaErr);
        }
      }

      const isEmailTemplatesReturn = Boolean(
        (returnTo && (returnTo.includes('/email-templates') || returnTo.includes('/drafts'))) ||
        pendingTesterAuth ||
        hasGmailScope
      );

      let redirectUrl = `${origin}/groups`;
      if (returnTo && returnTo.startsWith('/') && !returnTo.startsWith('/join')) {
        redirectUrl = `${origin}${returnTo}`;
      } else if (hasGmailScope || pendingTesterAuth) {
        redirectUrl = `${origin}/email-templates?tab=create-test`;
      } else if (joinedGroupId) {
        redirectUrl = `${origin}/groups/${joinedGroupId}`;
      }

      // If redirecting to email-templates or user is tester, append tester tokens/params so client captures them immediately
      if (isEmailTemplatesReturn || hasGmailScope) {
        const sep = redirectUrl.includes('?') ? '&' : '?';
        const params = new URLSearchParams();
        params.set('tester_authorized', 'true');
        params.set('tab', 'create-test');
        if (providerToken) {
          params.set('tester_token', providerToken);
        }
        redirectUrl = `${redirectUrl}${sep}${params.toString()}`;
      }

      const response = NextResponse.redirect(redirectUrl);
      response.cookies.delete('deudita_invite_token');
      response.cookies.delete('auth_return_to');
      response.cookies.delete('pending_tester_auth');

      // Ensure all Supabase session cookies from cookieStore are transferred to response
      cookieStore.getAll().forEach((c) => {
        response.cookies.set(c.name, c.value, {
          path: '/',
          secure: true,
          sameSite: 'lax',
        });
      });

      if (providerToken) {
        response.cookies.set('google_provider_token', providerToken, {
          path: '/',
          httpOnly: false,
          secure: true,
          sameSite: 'lax',
          maxAge: 3600 * 24 * 7,
        });
      }

      if (providerRefreshToken) {
        response.cookies.set('google_refresh_token', providerRefreshToken, {
          path: '/',
          httpOnly: true,
          secure: true,
          sameSite: 'lax',
          maxAge: 3600 * 24 * 30,
        });
      }

      return response;
    }
  }

  // Return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/login?error=Ocurrió%20un%20error%20al%20iniciar%20sesión`);
}

