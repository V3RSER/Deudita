const { Client } = require('pg');
const fs = require('fs');

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || process.env.NEXT_PUBLIC_SUPABASE_URL });
  await client.connect();
  const sql = fs.readFileSync('supabase/migrations/0006_expense_update_policy.sql', 'utf8');
  await client.query(sql);
  await client.end();
  console.log("Migration applied successfully.");
}
run().catch(err => { console.error(err); process.exit(1); });
