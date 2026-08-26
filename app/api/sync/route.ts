import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { claimAllTempProfilesForUser, claimAndJoinGroupInvite } from '@/lib/invite-utils';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const isFullSync = searchParams.get('full') === 'true';

    const supabase = await createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    // Use the authenticated Supabase client (with request cookies and JWT) to respect RLS
    const db = supabase;

    // 0, 0.1, 0.2 Auto-claims are only run on full sync
    if (isFullSync) {
      // 0. Auto-claim from cookie token if present
      try {
        const cookieStore = await cookies();
        const cookieInviteToken = cookieStore.get('deudita_invite_token')?.value;
        if (cookieInviteToken) {
          await claimAndJoinGroupInvite(db, cookieInviteToken, user);
        }
      } catch (cookieClaimErr) {
        console.warn('[API /api/sync] Warning auto-claiming from cookie token:', cookieClaimErr);
      }

      // 0.1 Auto-claim and join any pending invites matching user email
      if (user.email) {
        try {
          const userEmailLower = user.email.toLowerCase().trim();
          const { data: pendingInvites } = await db
            .from('group_invites')
            .select('token, id, group_id')
            .ilike('email', userEmailLower)
            .eq('status', 'pending');

          if (pendingInvites && pendingInvites.length > 0) {
            for (const inv of pendingInvites) {
              const tokenToUse = inv.token || inv.id || inv.group_id;
              if (tokenToUse) {
                await claimAndJoinGroupInvite(db, tokenToUse, user);
              }
            }
          }
        } catch (emailInvErr) {
          console.warn('[API /api/sync] Warning joining pending invites by email:', emailInvErr);
        }
      }

      // 0.2 Auto-claim and unify any temporary profiles created for this user's email
      try {
        await claimAllTempProfilesForUser(db, user);
      } catch (claimErr) {
        console.warn('[API /api/sync] Warning auto-claiming temp profiles:', claimErr);
      }
    }

    // 1. Current user profile
    const { data: userProfile, error: profileErr } = await db
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (profileErr) {
      console.error('[API /api/sync] Error selecting user profile:', profileErr);
    }

    // 2. User's group memberships
    const { data: userMemberships, error: memSelectErr } = await db
      .from('group_members')
      .select('group_id')
      .eq('user_id', user.id);

    console.log('[API /api/sync] group_members select result for user', user.id, ':', { data: userMemberships, error: memSelectErr });

    const userGroupIds = Array.from(new Set((userMemberships || []).map((m) => m.group_id)));

    // 3. Groups
    let groups: any[] = [];
    if (userGroupIds.length > 0) {
      const { data: groupData, error: groupSelectErr } = await db
        .from('groups')
        .select('*')
        .in('id', userGroupIds)
        .order('created_at', { ascending: false });

      console.log('[API /api/sync] groups select result:', { data: groupData, error: groupSelectErr });
      if (groupSelectErr) {
        console.error('[API /api/sync] Error selecting groups:', groupSelectErr);
      }
      groups = groupData || [];
    } else {
      console.log('[API /api/sync] No userGroupIds found for user', user.id);
    }

    // 4. All members for these groups
    let members: any[] = [];
    if (userGroupIds.length > 0) {
      const { data: memberData } = await db
        .from('group_members')
        .select('*')
        .in('group_id', userGroupIds);
      members = memberData || [];
    }

    // Member user IDs and created/invited profiles to fetch
    const profileIdsToFetch = new Set<string>([user.id, ...members.map((m) => m.user_id)]);

    // Fetch standalone profiles created by current user
    const { data: userCreatedProfiles, error: userCreatedProfilesErr } = await db
      .from('profiles')
      .select('id')
      .eq('created_by', user.id);

    if (userCreatedProfilesErr) {
      console.warn('[API /api/sync] Could not fetch profiles by created_by (column might not exist):', userCreatedProfilesErr.message);
    } else if (userCreatedProfiles && userCreatedProfiles.length > 0) {
      userCreatedProfiles.forEach((p) => profileIdsToFetch.add(p.id));
    }

    // Fetch profiles invited by current user in group_invites
    const { data: userInvites } = await db
      .from('group_invites')
      .select('invitee_profile_id')
      .eq('invited_by', user.id);

    if (userInvites && userInvites.length > 0) {
      userInvites.forEach((inv) => {
        if (inv.invitee_profile_id) profileIdsToFetch.add(inv.invitee_profile_id);
      });
    }

    const finalProfileIds = Array.from(profileIdsToFetch);

    // 5. Profiles of members and user's contacts
    let profiles: any[] = [];
    if (finalProfileIds.length > 0) {
      const { data: profileData } = await db
        .from('profiles')
        .select('*')
        .in('id', finalProfileIds);
      profiles = profileData || [];
    }

    // Ensure current profile is present or created
    const isNewUser = !userProfile;
    let profile = userProfile;
    if (!profile) {
      const meta = user.user_metadata ?? {};
      const fullName = meta.full_name ?? meta.name ?? (user.email ? user.email.split('@')[0] : 'Usuario');
      const avatarUrl = meta.avatar_url ?? meta.picture ?? null;
      
      const newProf = {
        id: user.id,
        email: user.email ?? null,
        full_name: fullName,
        avatar_url: avatarUrl,
        timezone: 'America/Bogota',
        currency: 'COP',
        currency_symbol: '$',
        is_temp: false,
      };

      await db.from('profiles').upsert(newProf);
      profile = newProf;
      if (!profiles.some((p) => p.id === user.id)) {
        profiles.push(newProf);
      }
    }

    // Attach payment_instructions and onboarding_completed from user_metadata and database state
    if (profile) {
      const metadataOnboarding = user.user_metadata?.onboarding_completed;
      const profileOnboarding = profile.onboarding_completed;

      let isOnboardingCompleted = false;
      if (typeof metadataOnboarding === 'boolean') {
        isOnboardingCompleted = metadataOnboarding;
      } else if (typeof profileOnboarding === 'boolean') {
        isOnboardingCompleted = profileOnboarding;
      } else {
        // If not explicitly completed in metadata or profile, require onboarding
        isOnboardingCompleted = false;
      }

      let dbManagedIdsForUser: string[] = [];
      try {
        const { data: dbUserManaged } = await db
          .from('managed_users')
          .select('managed_user_id')
          .eq('sponsor_id', user.id);
        if (dbUserManaged) {
          dbManagedIdsForUser = dbUserManaged.map((r: any) => r.managed_user_id);
        }
      } catch (mErr) {
        console.warn('[API /api/sync] Warning fetching user managed_users:', mErr);
      }

      const initialManaged = Array.isArray(profile.managed_user_ids)
        ? profile.managed_user_ids
        : Array.isArray(user.user_metadata?.managed_user_ids)
        ? user.user_metadata.managed_user_ids
        : [];

      const managedUserIds = Array.from(new Set([...initialManaged, ...dbManagedIdsForUser]));

      profile = {
        ...profile,
        payment_instructions:
          profile.payment_instructions ?? user.user_metadata?.payment_instructions ?? '',
        onboarding_completed: isOnboardingCompleted,
        managed_user_ids: managedUserIds,
      };
      profiles = profiles.map((p) =>
        p.id === user.id ? { ...p, payment_instructions: profile.payment_instructions, onboarding_completed: isOnboardingCompleted, managed_user_ids: managedUserIds } : p
      );
    }

    // 5.1 Query managed_users table to populate relationships for loaded profiles
    let allManagedUserRows: any[] = [];
    if (finalProfileIds.length > 0) {
      try {
        const idList = finalProfileIds.join(',');
        const { data: allManaged } = await db
          .from('managed_users')
          .select('*')
          .or(`sponsor_id.in.(${idList}),managed_user_id.in.(${idList})`);
        if (allManaged) {
          allManagedUserRows = allManaged;
        }
      } catch (mAllErr) {
        console.warn('[API /api/sync] Warning fetching managed_users:', mAllErr);
      }
    }

    // Merge database sponsorships into all loaded profiles
    profiles = profiles.map((p) => {
      const dbSponsoredIds = allManagedUserRows
        .filter((r) => r.sponsor_id === p.id)
        .map((r) => r.managed_user_id);
      const sponsorRow = allManagedUserRows.find((r) => r.managed_user_id === p.id);

      const existingManaged = Array.isArray(p.managed_user_ids) ? p.managed_user_ids : [];
      const combinedManaged = Array.from(new Set([...existingManaged, ...dbSponsoredIds]));

      return {
        ...p,
        managed_user_ids: combinedManaged,
        managed_by: sponsorRow ? sponsorRow.sponsor_id : p.managed_by,
      };
    });

    // Deduplicate profiles and remove any duplicate temporary profiles matching registered emails
    const registeredEmails = new Set(
      profiles
        .filter((p) => !p.is_temp && p.email)
        .map((p) => String(p.email).toLowerCase().trim())
    );
    if (user.email) {
      registeredEmails.add(user.email.toLowerCase().trim());
    }

    const uniqueProfilesMap = new Map<string, any>();
    for (const p of profiles) {
      if (!p || !p.id) continue;
      const pEmailLower = p.email ? String(p.email).toLowerCase().trim() : null;
      // If this is a temporary profile but a real user with this email exists, skip the temp profile
      if (p.is_temp && pEmailLower && registeredEmails.has(pEmailLower) && p.id !== user.id) {
        continue;
      }
      uniqueProfilesMap.set(p.id, p);
    }
    profiles = Array.from(uniqueProfilesMap.values());

    // 6. Expenses & Parallel Queries (payments, drafts, notifications, audit logs, personal expenses)
    let expenses: any[] = [];
    const expenseIdsSeen = new Set<string>();

    const [
      { data: paymentData },
      { data: settlementData },
      { data: draftsData },
      { data: notificationsData },
      { data: auditLogsData },
      { data: personalExpenses },
    ] = await Promise.all([
      userGroupIds.length > 0
        ? db
            .from('payments')
            .select('*')
            .in('group_id', userGroupIds)
            .order('created_at', { ascending: false })
        : Promise.resolve({ data: [] }),
      userGroupIds.length > 0
        ? db
            .from('settlements')
            .select('*')
            .in('group_id', userGroupIds)
            .order('settled_at', { ascending: false })
        : Promise.resolve({ data: [] }),
      db
        .from('expense_drafts')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false }),
      db
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false }),
      userGroupIds.length > 0
        ? db
            .from('expense_audit_logs')
            .select('*')
            .in('group_id', userGroupIds)
            .order('created_at', { ascending: false })
        : Promise.resolve({ data: [] }),
      db
        .from('expenses')
        .select('*, items:expense_items(*), splits:expense_splits(*)')
        .or(`created_by.eq.${user.id},paid_by.eq.${user.id}`)
        .order('created_at', { ascending: false }),
    ]);

    if (userGroupIds.length > 0) {
      const { data: expenseData } = await db
        .from('expenses')
        .select('*, items:expense_items(*), splits:expense_splits(*)')
        .in('group_id', userGroupIds)
        .order('created_at', { ascending: false });

      (expenseData || []).forEach((e) => {
        expenseIdsSeen.add(e.id);
        expenses.push(e);
      });
    }

    if (personalExpenses) {
      personalExpenses.forEach((e) => {
        if (!expenseIdsSeen.has(e.id)) {
          expenseIdsSeen.add(e.id);
          expenses.push(e);
        }
      });
    }

    expenses.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    // 7. Payments
    const payments = paymentData || [];

    // 8. Expense Drafts (draftsData)

    // 9. Notifications (notificationsData)

    // 10. Pending invites for user (by profile id or email)
    const userEmailLower = user.email ? user.email.toLowerCase() : null;
    const inviteFilter = userEmailLower
      ? `invitee_profile_id.eq.${user.id},email.eq.${userEmailLower}`
      : `invitee_profile_id.eq.${user.id}`;

    const { data: inviteData } = await db
      .from('group_invites')
      .select('*, groups(name)')
      .or(inviteFilter)
      .eq('status', 'pending');

    const pendingInvites = (inviteData || []).map((inv: any) => ({
      ...inv,
      group_name: inv.groups?.name || 'Grupo',
    }));

    // 11. Expense Audit Logs
    const auditLogs = auditLogsData || [];

    const hiddenFriendIds: string[] = user.user_metadata?.hidden_friend_ids || [];

    return NextResponse.json({
      profile,
      profiles,
      groups,
      members,
      expenses,
      payments,
      settlements: settlementData || [],
      drafts: draftsData || [],
      notifications: notificationsData || [],
      pendingInvites,
      auditLogs,
      hiddenFriendIds,
      isNewUser,
    });
  } catch (error: any) {
    console.error('[API /api/sync] Error:', error);
    return NextResponse.json({ error: 'Error al sincronizar los datos' }, { status: 500 });
  }
}
