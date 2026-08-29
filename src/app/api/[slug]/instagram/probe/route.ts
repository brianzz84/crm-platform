/**
 * GET /api/[slug]/instagram/probe
 *
 * Menjalankan Uji 3–5 dari rencana: identitas, daftar percakapan, dan isi
 * percakapan. Pengiriman (Uji 6) SENGAJA tidak di sini — mengirim DM adalah
 * tindakan keluar yang harus dipicu sadar, bukan efek samping menekan "probe".
 *
 * Nilai utama route ini bukan hijau/merahnya, melainkan **menerjemahkan galat
 * menjadi keputusan**. Kekeliruan yang sudah sekali terjadi: menyimpulkan
 * "Advanced Access wajib" dari galat timeout yang sebenarnya tidak mengatakan
 * apa pun soal tingkat akses. Karena itu tiap kegagalan digolongkan:
 *
 *   akses        → hipotesis terbantah, App Review memang tak terhindarkan
 *   tidak-jelas  → BUKAN jawaban; jangan simpulkan apa pun, laporkan sebagai bug
 *   konfigurasi  → ada yang belum disetel, perbaiki lalu ulangi
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireTenantPermission } from '@/lib/auth'
import { getTenantDb } from '@/lib/tenant'
import {
  bacaArtiGalat, daftarPercakapan, identitas, isiPercakapan,
} from '@/lib/instagram-messaging'

type Ctx = { params: { slug: string } }
type Status = 'ok' | 'gagal' | 'lewati'

interface Cek {
  kunci:  string
  label:  string
  status: Status
  pesan:  string
  arti?:  'akses' | 'tidak-jelas' | 'konfigurasi'
  detail?: string
}

export async function GET(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'configSystem')
  if (error) return error

  const hasil: Cek[] = []

  try {
    const db  = await getTenantDb(params.slug)
    const cfg = await db.metaConfig.findUnique({ where: { tenant_slug: params.slug } })

    if (!cfg?.ig_msg_token) {
      return NextResponse.json({
        success: true,
        hasil: [{
          kunci: 'token', label: 'Token Instagram Messaging', status: 'gagal',
          arti: 'konfigurasi',
          pesan: 'Belum tersambung. Tekan "Hubungkan Instagram" untuk memulai Business Login.',
        }],
      })
    }

    // ── Umur token ───────────────────────────────────────────────────────
    // Ditaruh paling depan karena jalur ini KEDALUWARSA — tidak seperti token
    // lain di tabel yang sama. Sepuluh hari kegagalan senyap bulan lalu terjadi
    // justru karena tanggal kedaluwarsa tidak pernah ditampilkan di mana pun.
    const sisaHari = cfg.ig_msg_expires_at
      ? Math.floor((cfg.ig_msg_expires_at.getTime() - Date.now()) / 86_400_000)
      : null
    hasil.push({
      kunci: 'umur', label: 'Umur token',
      status: sisaHari == null ? 'gagal' : sisaHari > 14 ? 'ok' : 'gagal',
      arti:   sisaHari != null && sisaHari <= 14 ? 'konfigurasi' : undefined,
      pesan:  sisaHari == null
        ? 'Tanggal kedaluwarsa tidak tercatat — sambungkan ulang agar terpantau.'
        : sisaHari > 14
          ? `Berlaku ${sisaHari} hari lagi (kedaluwarsa ${cfg.ig_msg_expires_at!.toISOString().slice(0, 10)}).`
          : `Tersisa ${sisaHari} hari. Segarkan sekarang — jangan menunggu mendekati habis.`,
    })

    // ── Uji 3: identitas ─────────────────────────────────────────────────
    const siapa = await identitas(cfg.ig_msg_token)
    if (!siapa.ok) {
      hasil.push({
        kunci: 'identitas', label: 'Identitas akun', status: 'gagal',
        pesan: siapa.pesan, arti: bacaArtiGalat(siapa.pesan),
      })
      return NextResponse.json({ success: true, hasil })
    }
    hasil.push({
      kunci: 'identitas', label: 'Identitas akun', status: 'ok',
      pesan: `Token melekat pada @${siapa.username} (${siapa.userId}).`,
    })

    // ── Uji 4: daftar percakapan — INI PEMUTUSNYA ────────────────────────
    const percakapan = await daftarPercakapan(cfg.ig_msg_token)
    if (!percakapan.ok) {
      const arti = bacaArtiGalat(percakapan.pesan)
      hasil.push({
        kunci: 'percakapan', label: 'Daftar percakapan', status: 'gagal',
        pesan: percakapan.pesan, arti,
        detail: arti === 'akses'
          ? 'Hipotesis terbantah: jalur ini pun menuntut Advanced Access. App Review tidak terhindarkan.'
          : arti === 'tidak-jelas'
            ? 'Galat ini TIDAK mengatakan apa pun soal tingkat akses. Jangan simpulkan App Review wajib — laporkan sebagai bug ke Meta.'
            : 'Kemungkinan konfigurasi: akun belum ditambahkan di App Dashboard, atau izin belum lengkap.',
      })
      return NextResponse.json({ success: true, hasil })
    }
    hasil.push({
      kunci: 'percakapan', label: 'Daftar percakapan', status: 'ok',
      pesan: `${percakapan.data.length} percakapan terbaca.`,
      detail: 'Baca DM terbuka pada Standard Access — App Review tidak diperlukan untuk membaca.',
    })

    // ── Uji 5: isi percakapan pertama ────────────────────────────────────
    if (percakapan.data.length === 0) {
      hasil.push({
        kunci: 'isi', label: 'Isi percakapan', status: 'lewati',
        pesan: 'Belum ada percakapan. Minta staf mengirim DM ke akun ini, lalu ulangi.',
      })
    } else {
      const isi = await isiPercakapan(cfg.ig_msg_token, percakapan.data[0].id)
      hasil.push(isi.ok
        ? {
            kunci: 'isi', label: 'Isi percakapan', status: 'ok',
            pesan: `${isi.data.length} pesan terbaca dari percakapan terbaru.`,
            // ID pengirim diperlukan untuk Uji 6; isi pesannya sengaja tidak
            // ikut dikembalikan agar percakapan tidak bocor ke layar diagnostik.
            detail: isi.data[0] ? `ID pengirim terakhir: ${isi.data[0].dari}` : undefined,
          }
        : {
            kunci: 'isi', label: 'Isi percakapan', status: 'gagal',
            pesan: isi.pesan, arti: bacaArtiGalat(isi.pesan),
          })
    }

    return NextResponse.json({ success: true, hasil })
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'Server error' },
      { status: 500 },
    )
  }
}
