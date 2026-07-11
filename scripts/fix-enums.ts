import { Client } from 'pg'

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
  await c.connect()
  const enums = [
    `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='MessageDirection') THEN CREATE TYPE "MessageDirection" AS ENUM ('IN','OUT'); END IF; END $$`,
    `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='MessageStatus') THEN CREATE TYPE "MessageStatus" AS ENUM ('PENDING','SENT','DELIVERED','READ','FAILED'); END IF; END $$`,
    `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='ConversationStatus') THEN CREATE TYPE "ConversationStatus" AS ENUM ('OPEN','PENDING','RESOLVED','CLOSED'); END IF; END $$`,
    `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='Channel') THEN CREATE TYPE "Channel" AS ENUM ('WA','IG','FB'); END IF; END $$`,
    `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='CampaignStatus') THEN CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT','SCHEDULED','SENDING','DONE','FAILED','CANCELLED'); END IF; END $$`,
    `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='TagSource') THEN CREATE TYPE "TagSource" AS ENUM ('MANUAL','RULE','IMPORT'); END IF; END $$`,
    `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='SapaanJenis') THEN CREATE TYPE "SapaanJenis" AS ENUM ('ULTAH','HARI_RAYA','KONTROL_REMINDER'); END IF; END $$`,
  ]
  for (const sql of enums) { await c.query(sql); console.log('OK') }
  await c.end()
  console.log('Done!')
}
main().catch(e => { console.error(e.message); process.exit(1) })
