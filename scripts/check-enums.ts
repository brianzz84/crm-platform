import { Client } from 'pg'
async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
  await c.connect()
  const { rows } = await c.query(`
    SELECT t.typname, e.enumlabel
    FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid
    ORDER BY t.typname, e.enumsortorder
  `)
  rows.forEach(r => console.log(r.typname, '->', r.enumlabel))
  await c.end()
}
main().catch(e => { console.error(e.message); process.exit(1) })
