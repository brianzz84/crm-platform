/**
 * POST /api/[slug]/sebutan/tarik
 *
 * Menarik sebutan publik sekarang juga, tanpa menunggu penjadwal.
 *
 * Ada karena tanpanya menguji integrasi berarti menunggu sampai jam berikutnya —
 * dan pada saat itu penyebab kegagalan sudah bercampur dengan hal lain. Berguna
 * juga di luar pengujian: penarikan pertama membawa ratusan sebutan lama
 * sekaligus, dan itu harus bisa dipicu sadar.
 *
 * SELURUH SUMBER DITARIK BERSAMA, dan kegagalan salah satunya tidak
 * menggugurkan yang lain. Instagram dan YouTube memakai kredensial yang
 * sepenuhnya terpisah — token Instagram Login dan OAuth Google — sehingga
 * salah satu bisa kedaluwarsa sementara yang lain sehat. Melaporkan
 * "penarikan gagal" karena satu dari dua tumbang akan menyembunyikan
 * ratusan sebutan yang sebenarnya berhasil masuk.
 *
 * Hanya MEMBACA dari Instagram dan YouTube. Tidak ada yang dikirim keluar.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireTenantPermission } from '@/lib/auth'
import { tarikSebutanInstagram } from '@/lib/sebutan-instagram'
import { tarikSebutanYoutube } from '@/lib/sebutan-youtube'
import { tarikSebutanUlasan } from '@/lib/sebutan-ulasan'

type Ctx = { params: { slug: string } }

export async function POST(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'viewKanalPublik')
  if (error) return error

  try {
    // Berurutan, bukan Promise.all: keduanya menulis ke tabel yang sama lewat
    // koneksi tenant yang sama, dan tidak ada yang menunggu hasilnya di layar
    // dalam hitungan detik.
    const ig = await tarikSebutanInstagram(params.slug)
    const yt = await tarikSebutanYoutube(params.slug)
    // Basis-data-ke-basis-data: nol kuota, nol kredensial. Dijalankan terakhir
    // supaya kegagalan jaringan pada dua sumber di atas tidak menghalanginya.
    const ul = await tarikSebutanUlasan(params.slug)

    // Angka dilaporkan apa adanya, termasuk `tuntas`. Peninjau perlu tahu apakah
    // penelusuran sampai habis — karena hanya pada penelusuran tuntas angka
    // "hilang" punya arti.
    const bagianIg = [
      `${ig.ditemukan} sebutan dibaca`,
      `${ig.baru} baru`,
      ig.diperbarui ? `${ig.diperbarui} diperbarui` : '',
      ig.hilang     ? `${ig.hilang} ditandai hilang di sumber` : '',
      ig.kembali    ? `${ig.kembali} muncul kembali` : '',
      ig.tuntas ? '' : 'penelusuran BELUM tuntas — penandaan hilang dilewati',
    ].filter(Boolean).join(', ')

    // `dibuang` SENGAJA ikut dilaporkan. Pencarian YouTube mencocokkan kata
    // secara longgar, jadi bila angka ini mendekati `dibaca`, kata kuncinya
    // terlalu lebar dan perlu dipersempit — itu keterangan yang hanya terlihat
    // di sini.
    const bagianYt = [
      `${yt.dibaca} hasil dibaca dari ${yt.kataKunci} kata kunci`,
      `${yt.cocok} lolos saringan frasa`,
      yt.baru       ? `${yt.baru} baru` : '',
      yt.diperbarui ? `${yt.diperbarui} diperbarui` : '',
      yt.dibuang    ? `${yt.dibuang} dibuang karena frasa tidak muncul utuh` : '',
    ].filter(Boolean).join(', ')

    const bagianUl = [
      `${ul.dibaca} ulasan diperiksa`,
      ul.baru       ? `${ul.baru} disalin` : '',
      ul.diperbarui ? `${ul.diperbarui} diperbarui` : '',
      !ul.baru && !ul.diperbarui ? 'tidak ada yang baru' : '',
    ].filter(Boolean).join(', ')

    const pesan = [
      `Instagram: ${ig.galat ? `gagal — ${ig.galat}` : bagianIg + '.'}`,
      `YouTube: ${yt.galat ? `gagal — ${yt.galat}` : bagianYt + '.'}`,
      `Ulasan Google: ${ul.galat ? `gagal — ${ul.galat}` : bagianUl + '.'}`,
    ].join(' ')

    return NextResponse.json({
      // Berhasil bila SETIDAKNYA satu sumber jalan. Pesannya tetap menyebutkan
      // yang gagal, jadi tidak ada kegagalan yang tersembunyi di balik `true`.
      success: !(ig.galat && yt.galat && ul.galat),
      pesan,
      instagram: ig,
      youtube:   yt,
      ulasan:    ul,
    })
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'Server error' },
      { status: 500 },
    )
  }
}
