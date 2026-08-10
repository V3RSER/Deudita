import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const returnTo = searchParams.get('returnTo');
  const token = searchParams.get('token') || searchParams.get('invite_token');

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        const inviteTokenToUse = token || user.user_metadata?.invite_token;
        if (inviteTokenToUse) {
          try {
            const db = createAdminClient();
            const { data: invite } = await db
              .from('group_invites')
              .select('id, group_id, invitee_profile_id')
              .eq('token', inviteTokenToUse)
              .eq('status', 'pending')
              .maybeSingle();

            if (invite?.invitee_profile_id && invite.invitee_profile_id !== user.id) {
              const tempProfileId = invite.invitee_profile_id;
              await db.from('group_members').update({ user_id: user.id }).eq('user_id', tempProfileId);
              await db.from('group_members').update({ invited_by: user.id }).eq('invited_by', tempProfileId);
              await db.from('groups').update({ owner_id: user.id }).eq('owner_id', tempProfileId);
              await db.from('expenses').update({ paid_by: user.id }).eq('paid_by', tempProfileId);
              await db.from('expenses').update({ created_by: user.id }).eq('created_by', tempProfileId);
              await db.from('expense_splits').update({ user_id: user.id }).eq('user_id', tempProfileId);
              await db.from('payments').update({ paid_by: user.id }).eq('paid_by', tempProfileId);
              await db.from('payments').update({ paid_to: user.id }).eq('paid_to', tempProfileId);
              await db.from('notifications').update({ user_id: user.id }).eq('user_id', tempProfileId);

              await db.from('group_invites').update({ status: 'accepted' }).eq('id', invite.id);
              await db.from('profiles').delete().eq('id', tempProfileId);
            }
          } catch (err) {
            console.error('[auth/callback] Error claiming token:', err);
          }
        }
      }

      if (returnTo && returnTo.startsWith('/')) {
        return NextResponse.redirect(`${origin}${returnTo}`);
      }
      return NextResponse.redirect(`${origin}/groups`);
    }
  }

  // Return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/login?error=Ocurrió%20un%20error%20al%20iniciar%20sesión`);
}
