import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sendNotifications } from '@/lib/notifications';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { data: managedUsers, error } = await supabase
      .from('managed_users')
      .select('*');

    if (error) {
      console.warn('[API /api/managed-users] Query warning:', error.message);
      return NextResponse.json({ managedUsers: [] });
    }

    return NextResponse.json({ managedUsers: managedUsers || [] });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al obtener personas a cargo';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await req.json();
    const { targetUserId, shouldManage } = body;

    if (!targetUserId || targetUserId === user.id) {
      return NextResponse.json({ error: 'ID de usuario no válido' }, { status: 400 });
    }

    if (shouldManage) {
      // 1. Insert into managed_users table
      try {
        const { error: insErr } = await supabase
          .from('managed_users')
          .upsert(
            { sponsor_id: user.id, managed_user_id: targetUserId },
            { onConflict: 'managed_user_id' }
          );

        if (insErr) {
          console.warn('[API /api/managed-users] Upsert error in managed_users table:', insErr.message);
        }
      } catch (dbErr) {
        console.warn('[API /api/managed-users] DB exception inserting managed_user:', dbErr);
      }

      // 2. Fetch current sponsor profile & target profile
      const { data: sponsorProfile } = await supabase
        .from('profiles')
        .select('id, full_name, managed_user_ids')
        .eq('id', user.id)
        .maybeSingle();

      const { data: targetProfile } = await supabase
        .from('profiles')
        .select('id, full_name, is_temp')
        .eq('id', targetUserId)
        .maybeSingle();

      // 3. Keep profiles.managed_user_ids in sync for redundancy
      const currentList = Array.isArray(sponsorProfile?.managed_user_ids) ? sponsorProfile.managed_user_ids : [];
      const updatedList = Array.from(new Set([...currentList, targetUserId]));

      try {
        await supabase
          .from('profiles')
          .update({ managed_user_ids: updatedList })
          .eq('id', user.id);
      } catch (syncErr) {
        console.warn('[API /api/managed-users] Error updating profile managed_user_ids:', syncErr);
      }

      // 4. Send notification to target user if they are a real registered profile
      if (targetProfile && !targetProfile.is_temp) {
        const sponsorName = sponsorProfile?.full_name ?? 'Un usuario';
        await sendNotifications(supabase, [
          {
            user_id: targetUserId,
            type: 'managed_user_assigned',
            title: 'Asignación de cuenta',
            message: `${sponsorName} ahora se hace cargo de cubrir tus cuentas y balances en Deudita.`,
            link: '/balances',
            data: {
              sponsor_id: user.id,
              sponsor_name: sponsorName,
            },
          },
        ]);
      }

      return NextResponse.json({
        success: true,
        action: 'added',
        targetUserId,
        managedUserIds: updatedList,
      });
    } else {
      // shouldManage === false: remove sponsorship
      try {
        await supabase
          .from('managed_users')
          .delete()
          .eq('sponsor_id', user.id)
          .eq('managed_user_id', targetUserId);
      } catch (delErr) {
        console.warn('[API /api/managed-users] Delete error from managed_users table:', delErr);
      }

      // Keep profiles.managed_user_ids in sync
      const { data: sponsorProfile } = await supabase
        .from('profiles')
        .select('id, managed_user_ids')
        .eq('id', user.id)
        .maybeSingle();

      const currentList = Array.isArray(sponsorProfile?.managed_user_ids) ? sponsorProfile.managed_user_ids : [];
      const updatedList = currentList.filter((id: string) => id !== targetUserId);

      try {
        await supabase
          .from('profiles')
          .update({ managed_user_ids: updatedList })
          .eq('id', user.id);
      } catch (syncErr) {
        console.warn('[API /api/managed-users] Error updating profile managed_user_ids on delete:', syncErr);
      }

      return NextResponse.json({
        success: true,
        action: 'removed',
        targetUserId,
        managedUserIds: updatedList,
      });
    }
  } catch (err: unknown) {
    console.error('[API /api/managed-users] Error:', err);
    const message = err instanceof Error ? err.message : 'Error al actualizar persona a cargo';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
