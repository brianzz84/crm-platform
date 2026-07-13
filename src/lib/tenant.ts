/**
 * CRM Platform — Tenant Database Helper
 * WAJIB digunakan untuk semua akses DB per-tenant.
 * Tidak boleh ada Prisma query langsung tanpa melewati getTenantDb().
 */
import { PrismaClient } from '../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

// Cache koneksi per slug untuk menghindari connection pool exhausted
const connectionCache = new Map<string, PrismaClient>()

function createClient(connectionString: string): PrismaClient {
  const adapter = new PrismaPg({ connectionString })
  return new PrismaClient({ adapter })
}

/**
 * Ambil Prisma client untuk tenant tertentu.
 * Selalu gunakan fungsi ini — jangan buat PrismaClient langsung di mana pun.
 */
export async function getTenantDb(slug: string): Promise<PrismaClient> {
  if (connectionCache.has(slug)) {
    const cached = connectionCache.get(slug)!
    try {
      await cached.$queryRaw`SELECT 1`
      return cached
    } catch {
      // Koneksi mati — buang cache, buat ulang
      connectionCache.delete(slug)
    }
  }

  const tenant = await masterDb.tenant.findUnique({
    where: { slug },
    select: { database_url: true },
  })

  if (!tenant) {
    throw new Error(`Tenant tidak ditemukan: ${slug}`)
  }

  const client = createClient(tenant.database_url)
  connectionCache.set(slug, client)
  return client
}

/**
 * Master DB — hanya untuk lookup tenant.
 * Tidak boleh digunakan untuk query data bisnis per-tenant.
 */
let _masterDb: PrismaClient = createClient(process.env.DATABASE_URL!)

export const masterDb: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    return (...args: any[]) => {
      const fn = (_masterDb as any)[prop]
      if (typeof fn !== 'function') return fn
      return fn.apply(_masterDb, args).catch(async (err: any) => {
        if (err?.message?.includes('Connection terminated') || err?.message?.includes('ECONNRESET')) {
          _masterDb = createClient(process.env.DATABASE_URL!)
          return (_masterDb as any)[prop].apply(_masterDb, args)
        }
        throw err
      })
    }
  },
})

export async function getMasterDb(): Promise<PrismaClient> {
  return _masterDb
}

/**
 * Jalankan ini setelah membuat tenant baru.
 * Copy ICD library global ke DB tenant.
 */
export async function copyGlobalToTenant(tenantId: string): Promise<void> {
  const tenantDb = await getTenantDbById(tenantId)

  const icdEntries = await masterDb.icdLibraryGlobal.findMany({ where: { aktif: true } })
  await tenantDb.icdLibrary.createMany({
    data: icdEntries.map(({ id: _id, ...rest }) => rest),
    skipDuplicates: true,
  })
}

async function getTenantDbById(tenantId: string): Promise<PrismaClient> {
  const tenant = await masterDb.tenant.findUnique({
    where: { id: tenantId },
    select: { slug: true },
  })
  if (!tenant) throw new Error(`Tenant ID tidak ditemukan: ${tenantId}`)
  return getTenantDb(tenant.slug)
}
