import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL || process.env.SUPABASE_DB_URL, { ssl: 'require' });

try {
  await sql`
    alter table public.group_invites alter column expires_at set default (now() + interval '7 days');
    alter table public.group_invites drop constraint if exists group_invites_email_or_profile_check;
  `;
  console.log("Migration for group_invites 7 days applied successfully");
} catch (err) {
  console.error("Migration error:", err);
}
process.exit(0);

