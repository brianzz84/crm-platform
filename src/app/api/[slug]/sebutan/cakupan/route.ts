/**
 * Cakupan pemantauan Sebutan Publik — sumber apa yang hidup, dan sejak kapan.
 *
 * ══ MASALAH YANG DIPECAHKAN ══
 *
 * Momen paling berbahaya di modul ini bukan saat layar penuh keluhan. Justru saat
 * layar SEPI.
 *
 * "Tidak ada yang perlu ditinjau" akan dibaca sebagai "tidak ada keluhan".
 * Artinya sebenarnya "tidak ada keluhan YANG TERLIHAT DARI SINI". Dua kalimat itu
 * berjarak sangat jauh, dan yang kedua tidak menenangkan sama sekali.
 *
 * Lebih tajam lagi: **kolektor yang rusak tiga minggu menghasilkan layar yang
 * IDENTIK dengan kolektor sehat yang memang tidak menemukan apa-apa.** Tanpa
 * catatan lari, keduanya mustahil dibedakan — dan yang pertama akan dibiarkan
 * berbulan-bulan.
 *
 * Karena itu yang dilaporkan di sini adalah RIWAYAT LARI, bukan "kapan terakhir
 * ada sebutan ditemukan". Keduanya sering tampak sama, tetapi berbeda persis pada
 * kasus yang kita takutkan: penarik yang berjalan setiap malam tanpa menemukan
 * apa pun itu SEHAT, sementara penarik yang tidak pernah berjalan itu BUTA.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireTenantPermission } from '@/lib/auth'
import { getTenantDb } from '@/lib/tenant'
import { ringkasRiwayat, SUMBER_SEBUTAN, type SumberSnapshot } from '@/lib/snapshot-run'

type Ctx = { params: { slug: string } }

/** Sumber lari -> nilai `Sebutan.sumber` yang dihasilkannya. Dipisahkan karena
 *  keduanya memang dua hal: yang satu nama pekerjaan, yang lain asal barisnya. */
const KE_SUMBER_SEBUTAN: Record<string, string> = {
  SEBUTAN_IG:     'IG_TAG',
  SEBUTAN_YT:     'YOUTUBE',
  SEBUTAN_ULASAN: 'GOOGLE_ULASAN',
  SEBUTAN_KOMENTAR_IG: 'KOMENTAR_IG',
  SEBUTAN_KOMENTAR_FB: 'KOMENTAR_FB',
}

const LABEL: Record<string, string> = {
  SEBUTAN_IG:     'Tandaan Instagram',
  SEBUTAN_YT:     'Pencarian YouTube',
  SEBUTAN_ULASAN: 'Ulasan Google',
  SEBUTAN_KOMENTAR_IG: 'Komentar IG',
  SEBUTAN_KOMENTAR_FB: 'Komentar FB',
}

/** Berapa hari riwayat yang diperiksa untuk mencari hari bolong. */
const HARI_RIWAYAT = 30

export async function GET(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'viewKanalPublik')
  if (error) return error

  try {
    const db = await getTenantDb(params.slug)

    const [riwayat, perSumber] = await Promise.all([
      ringkasRiwayat(params.slug, HARI_RIWAYAT, SUMBER_SEBUTAN as readonly SumberSnapshot[]),
      db.sebutan.groupBy({
        by: ['sumber'], where: { tenant_slug: params.slug }, _count: { _all: true },
      }),
    ])

    const jumlah = new Map<string, number>(
      (perSumber as { sumber: string; _count: { _all: number } }[])
        .map(s => [s.sumber, s._count._all]),
    )

    return NextResponse.json({
      success: true,
      hariRiwayat: HARI_RIWAYAT,
      sumber: riwayat.map(r => ({
        kunci:  r.sumber,
        label:  LABEL[r.sumber] ?? r.sumber,
        // `null` berarti BELUM PERNAH BERJALAN — keadaan yang sepenuhnya berbeda
        // dari "berjalan dan tidak menemukan apa-apa", dan layar harus
        // membedakannya.
        terakhir:   r.terakhir,
        hariBolong: r.hariBolong.length,
        tersimpan:  jumlah.get(KE_SUMBER_SEBUTAN[r.sumber] ?? '') ?? 0,
      })),
    })
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
