import { Client } from 'pg'
async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
  await c.connect()
  const { rows } = await c.query(`
    SELECT column_name, data_type, udt_name
    FROM information_schema.columns
    WHERE table_name IN ('crm_messages','crm_conversations')
    ORDER BY table_name, ordinal_position
  `)
  rows.forEach(r => console.log(r.table_name, r.column_name, r.data_type, r.udt_name))
  await c.end()
}
main().catch(e => { console.error(e.message); process.exit(1) })
