import { masterDb } from '../src/lib/tenant'
async function main() {
  const t = await masterDb.tenant.findUnique({ where: { slug: 'rkz' }, select: { database_url: true } })
  console.log('DB URL for rkz:', t?.database_url)
  await masterDb.$disconnect()
}
main()
