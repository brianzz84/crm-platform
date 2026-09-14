/**
 * POST /api/[slug]/threads/probe
 *
 * Menjawab tiga pertanyaan yang menentukan apakah Threads layak dibangun ke
 * dalam CRM — sebelum satu baris kolektor pun ditulis.
 *
 * ══ MENGAPA PROBE DULU ══
 *
 * Pola yang sama sudah menyelamatkan kita sekali. Pencarian tagar Instagram
 * diprobe lebih dulu dan ternyata terkunci App Review ("Instagram Public Content
 * Access") — kalau kolektornya dibangun duluan, ratusan baris akan ditulis untuk
 * endpoint yang tertutup.
 *
 * Tetapi presedennya berlawanan arah, dan itulah yang membuat probe ini perlu:
 * DM Instagram lewat Instagram Login justru berjalan TANPA App Review, karena
 * CRM hanya melayani akun milik RKZ sendiri. Threads bisa jatuh di mana saja di
 * antara keduanya.
 *
 * ══ TIGA PERTANYAAN, TIGA ARTI KEGAGALAN YANG BERBEDA ══
 *
 *   1. Token ada?          -> belum OAuth, atau akun Threads belum diaktifkan
 *   2. Identitas terbaca?  -> token hidup dan `threads_basic` berlaku
 *   3. keyword_search?     -> INI yang menentukan nasib Sebutan Publik Threads
 *
 * Kegagalan di langkah 3 dibedakan lagi: "terkunci App Review" BUKAN "tertutup".
 * Kekeliruan itu sudah pernah saya tulis pada probe tagar dan harus diperbaiki
 * setelahnya — balasan yang menyebut peninjauan berarti endpointnya ADA dan
 * kasus penggunaannya diakui, hanya menuntut pengajuan.
 *
 * Hanya MEMBACA. Tidak ada yang diterbitkan ke Threads.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireTenantPermission } from '@/lib/auth'
import { getTenantDb } from '@/lib/tenant'
import {
  identitasThreads, cariKataKunciThreads, SCOPE_THREADS,
} from '@/lib/threads-api'

type Ctx = { params: { slug: string } }

type Status = 'ok' | 'gagal' | 'lewati'
interface Cek {
  kunci: string
  label: string
  status: Status
  pesan: string
  detail?: string
}

/** Kata uji bawaan. Dipakai bila pemanggil tidak menyebut kata lain — sama
 *  dengan kata kunci YouTube yang sudah terbukti relevan. */
const KATA_UJI = 'RKZ Surabaya'

export async function POST(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'configSystem')
  if (error) return error

  const body = await req.json().catch(() => ({})) as { kata?: unknown }
  const kata = typeof body.kata === 'string' && body.kata.trim()
    ? body.kata.trim().slice(0, 100)
    : KATA_UJI

  const hasil: Cek[] = []

  try {
    const db  = await getTenantDb(params.slug)
    const cfg = await db.metaConfig.findUnique({ where: { tenant_slug: params.slug } })

    // ── 1. Token ──
    if (!cfg?.threads_token) {
      hasil.push({
        kunci: 'token', label: 'Token Threads', status: 'gagal',
        pesan: 'Belum tersambung. Klik "Hubungkan Threads" di Pengaturan → Integrasi Meta. '
             + 'Bila layar izin menolak, kemungkinan akun Instagram RKZ belum pernah '
             + 'mengaktifkan Threads — itu satu kali klik di aplikasi Threads, di luar CRM.',
      })
      return NextResponse.json({ success: false, kata, scope: SCOPE_THREADS, hasil })
    }

    const sisaHari = cfg.threads_expires_at
      ? Math.round((cfg.threads_expires_at.getTime() - Date.now()) / 86_400_000)
      : null
    hasil.push({
      kunci: 'token', label: 'Token Threads', status: sisaHari !== null && sisaHari < 7 ? 'gagal' : 'ok',
      pesan: sisaHari === null
        ? 'Token tersimpan, tetapi masa berlakunya tidak tercatat.'
        : sisaHari < 7
          ? `Token tinggal ${sisaHari} hari lagi — segarkan atau sambungkan ulang sekarang.`
          : `Token tersimpan, berlaku ${sisaHari} hari lagi.`,
    })

    // ── 2. Identitas ──
    const siapa = await identitasThreads(cfg.threads_token)
    if (!siapa.ok) {
      hasil.push({
        kunci: 'identitas', label: 'Identitas Akun', status: 'gagal',
        pesan: `${siapa.pesan}. Token ada tetapi tidak bisa dipakai — kemungkinan kedaluwarsa, `
             + 'dicabut, atau izin `threads_basic` tidak disetujui.',
      })
      return NextResponse.json({ success: false, kata, scope: SCOPE_THREADS, hasil })
    }
    hasil.push({
      kunci: 'identitas', label: 'Identitas Akun', status: 'ok',
      pesan: `Terhubung sebagai @${siapa.username || '(tanpa username)'} (id ${siapa.userId}). `
           + 'Akun Threads AKTIF — ini sekaligus menjawab pertanyaan apakah RKZ punya Threads.',
    })

    // ── 3. Pencarian kata kunci — inti probe ini ──
    const cari = await cariKataKunciThreads(cfg.threads_token, kata, 25)

    if (cari.ok) {
      const contoh = cari.data.slice(0, 5)
        .map(u => `@${u.username ?? '-'}: ${(u.teks ?? '').replace(/\s+/g, ' ').slice(0, 90)}`)
        .join('\n')
      hasil.push({
        kunci: 'keyword_search', label: 'Pencarian Kata Kunci', status: 'ok',
        pesan: cari.data.length
          ? `TERBUKA. "${kata}" mengembalikan ${cari.data.length} unggahan. Threads bisa `
          + 'dijadikan sumber Sebutan Publik — dan ini satu-satunya platform Meta yang '
          + 'memberi pencarian TEKS PENUH, bukan hanya konten yang menandai akun kita.'
          : `TERBUKA, tetapi "${kata}" tidak mengembalikan satu unggahan pun. Endpointnya `
          + 'berfungsi — yang kosong hasilnya. Coba kata lain sebelum menyimpulkan Threads sepi.',
        detail: contoh || undefined,
      })
    } else {
      // Pembedaan yang paling menentukan di seluruh berkas ini.
      const terkunciReview = /Public Content Access|must be reviewed and approved|requires .*review/i
        .test(cari.pesan)
      const izinKurang = /permission|scope|not have/i.test(cari.pesan)

      hasil.push({
        kunci: 'keyword_search', label: 'Pencarian Kata Kunci',
        status: terkunciReview ? 'lewati' : 'gagal',
        pesan: terkunciReview
          ? `TERKUNCI APP REVIEW, bukan tertutup — ${cari.pesan} Endpointnya ada dan kasus `
          + 'penggunaannya diakui; yang dituntut peninjauan. Keputusan mengajukannya perlu '
          + 'ditimbang terpisah, karena pengajuan lalu ditolak karena rekaman layar, bukan '
          + 'karena kasus penggunaannya.'
          : izinKurang
            ? `Izin ditolak — ${cari.pesan} Periksa apakah scope \`threads_keyword_search\` `
            + 'benar-benar disetujui saat penyambungan. Sambungkan ulang bila perlu.'
            : `${cari.pesan}`,
        detail: JSON.stringify(cari.mentah).slice(0, 400),
      })
    }

    // Berhasil bila ketiganya tidak ada yang 'gagal'. 'lewati' tidak dihitung
    // gagal: terkunci peninjauan adalah jawaban yang sah, bukan kerusakan.
    return NextResponse.json({
      success: !hasil.some(h => h.status === 'gagal'),
      kata,
      scope: SCOPE_THREADS,
      hasil,
    })
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'Server error', hasil },
      { status: 500 },
    )
  }
}
