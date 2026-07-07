import { getTenantDb } from '@/lib/tenant'
async function main() {
  const db = await getTenantDb('rkz')
  const list = await db.kegiatan.findMany({ 
    where: { status: 'aktif' }, 
    select: { id: true, nama: true },
    take: 3
  })
  list.forEach(k => console.log(k.id, '|', k.nama.slice(0, 60)))
}
main().catch(console.error)
