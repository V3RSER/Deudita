import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function PATCH(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await req.json();
    const {
      full_name,
      avatar_url,
      timezone,
      currency,
      currency_symbol,
      payment_instructions,
      onboarding_completed,
    } = body;

    const updates: Record<string, any> = {};
    if (full_name !== undefined) updates.full_name = full_name;
    if (avatar_url !== undefined) updates.avatar_url = avatar_url;
    if (timezone !== undefined) updates.timezone = timezone;
    if (currency !== undefined) updates.currency = currency;
    if (currency_symbol !== undefined) updates.currency_symbol = currency_symbol;
    if (payment_instructions !== undefined) updates.payment_instructions = payment_instructions;
    if (onboarding_completed !== undefined) updates.onboarding_completed = Boolean(onboarding_completed);

    // 1. Try to update in profiles table
    let updateError: any = null;
    const { error: err1 } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', user.id);

    if (err1) {
      // If error is about payment_instructions or onboarding_completed column not existing in schema cache, retry without them
      if (
        err1.message?.includes('payment_instructions') ||
        err1.message?.includes('onboarding_completed') ||
        err1.message?.includes('schema cache') ||
        err1.message?.includes('column')
      ) {
        const { payment_instructions: _, onboarding_completed: __, ...safeUpdates } = updates;
        if (Object.keys(safeUpdates).length > 0) {
          const { error: err2 } = await supabase
            .from('profiles')
            .update(safeUpdates)
            .eq('id', user.id);
          if (err2) {
            updateError = err2;
          }
        }
      } else {
        updateError = err1;
      }
    }

    if (updateError) {
      console.error('[API /api/profile] Error updating profile:', updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // 2. Also update user_metadata in auth so custom data and onboarding status are safely preserved
    if (
      payment_instructions !== undefined ||
      full_name !== undefined ||
      avatar_url !== undefined ||
      onboarding_completed !== undefined
    ) {
      try {
        await supabase.auth.updateUser({
          data: {
            ...(full_name !== undefined ? { full_name } : {}),
            ...(avatar_url !== undefined ? { avatar_url } : {}),
            ...(payment_instructions !== undefined ? { payment_instructions } : {}),
            ...(onboarding_completed !== undefined ? { onboarding_completed: Boolean(onboarding_completed) } : {}),
          },
        });
      } catch (authMetaErr) {
        console.warn('[API /api/profile] Warning updating user_metadata:', authMetaErr);
      }
    }

    // Fetch updated profile
    const { data: updatedProfile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    const mergedProfile = {
      ...(updatedProfile ?? {}),
      payment_instructions:
        payment_instructions !== undefined
          ? payment_instructions
          : (updatedProfile?.payment_instructions ?? user.user_metadata?.payment_instructions ?? ''),
      onboarding_completed:
        onboarding_completed !== undefined
          ? Boolean(onboarding_completed)
          : (typeof user.user_metadata?.onboarding_completed === 'boolean'
              ? user.user_metadata.onboarding_completed
              : Boolean(updatedProfile?.onboarding_completed ?? false)),
    };

    return NextResponse.json({
      success: true,
      profile: mergedProfile,
    });
  } catch (err: unknown) {
    console.error('[API /api/profile] Unexpected error:', err);
    const message = err instanceof Error ? err.message : 'Error al actualizar perfil';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
