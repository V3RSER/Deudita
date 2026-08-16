import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { claimAndJoinGroupInvite } from '@/lib/invite-utils';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const returnTo = searchParams.get('returnTo');
  const token = searchParams.get('token') ?? searchParams.get('invite_token');

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

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
        }
      }

      if (returnTo && returnTo.startsWith('/')) {
        return NextResponse.redirect(`${origin}${returnTo}`);
      }

      if (joinedGroupId) {
        return NextResponse.redirect(`${origin}/groups/${joinedGroupId}`);
      }

      return NextResponse.redirect(`${origin}/groups`);
    }
  }

  // Return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/login?error=Ocurrió%20un%20error%20al%20iniciar%20sesión`);
}

