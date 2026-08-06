import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { name, category, description, emails } = await req.json();

  // Create group
  const { data: group, error: groupErr } = await supabase
    .from('groups')
    .insert({
      name,
      owner_id: user.id
    })
    .select()
    .single();

  if (groupErr) return NextResponse.json({ error: groupErr.message }, { status: 500 });

  // Add owner to members
  await supabase.from('group_members').insert({
    group_id: group.id,
    user_id: user.id,
    role: 'owner'
  });

  // Add invites
  if (emails && Array.isArray(emails)) {
    for (const email of emails) {
      if (email !== user.email) {
        await supabase.from('group_invites').insert({
          group_id: group.id,
          email,
          invited_by: user.id,
          status: 'pending'
        });
      }
    }
  }

  return NextResponse.json(group);
}
