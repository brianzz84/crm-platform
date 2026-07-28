import { NextRequest, NextResponse } from 'next/server'
import { requireTenantPermission } from '@/lib/auth'
import * as XLSX from 'xlsx'

type Ctx = { params: { slug: string } }

export async function GET(req: NextRequest, { params }: Ctx) {
  const { error } = await requireTenantPermission(req, params.slug, 'importExcel')
  if (error) return error

  // Header kolom sesuai parser import
  const headers = [
    'nama', 'no_hp', 'no_rm', 'email', 'tanggal_lahir',
    'unit', 'poli', 'dokter', 'tanggal_kunjungan',
    'diagnosa_icd', 'diagnosa_nama', 'tindakan', 'tindakan_kode',
    'jenis_pembayaran', 'nama_instansi', 'status_kunjungan',
  ]

  // Baris contoh yang sengaja memperagakan empat pola pemakaian:
  //   1-2  satu pasien dengan DUA kunjungan (no_hp sama, tanggal berbeda)
  //   3    kunjungan non-tunai dengan penjamin
  //   4    baris pasien saja, tanpa riwayat kunjungan
  const contoh = [
    ['Budi Santoso', '081234567890', 'RM-0001', 'budi@email.com', '1985-06-15',
     'Rawat Jalan', 'Umum', 'dr. Ahmad', '2026-01-10',
     'J06.9', 'ISPA', 'Pemeriksaan umum', '',
     'TUNAI', '', 'SELESAI'],
    ['Budi Santoso', '081234567890', 'RM-0001', 'budi@email.com', '1985-06-15',
     'Penunjang', 'Laboratorium', 'dr. Ahmad', '2026-02-14',
     '', '', 'Pemeriksaan darah lengkap', '',
     'TUNAI', '', 'SELESAI'],
    ['Siti Aminah', '082198765432', 'RM-0002', '', '1990-02-20',
     'Rawat Jalan', 'Jantung', 'dr. Rina', '2026-01-11',
     'I10', 'Hipertensi', 'Konsultasi jantung', '',
     'NON_TUNAI', 'BPJS Kesehatan', 'SELESAI'],
    ['Andi Pratama', '085612345678', '', 'andi@email.com', '1998-11-03',
     '', '', '', '',
     '', '', '', '',
     '', '', ''],
  ]

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet([headers, ...contoh])

  // Lebar kolom agar mudah dibaca
  ws['!cols'] = [
    { wch: 25 }, { wch: 18 }, { wch: 12 }, { wch: 25 }, { wch: 14 },
    { wch: 14 }, { wch: 16 }, { wch: 20 }, { wch: 16 },
    { wch: 12 }, { wch: 25 }, { wch: 22 }, { wch: 14 },
    { wch: 16 }, { wch: 20 }, { wch: 16 },
  ]

  XLSX.utils.book_append_sheet(wb, ws, 'Data Pasien')

  // ── Sheet 2 (OPSIONAL): jadwal yang BELUM terjadi — sumber Pengingat Kontrol
  //    & Pengingat Vaksin. Nama sheet harus persis "Rencana Kontrol". ──
  const headerRencana = [
    'no_hp', 'no_rm', 'rencana_id', 'tanggal_rencana', 'jenis',
    'poli', 'unit', 'jenis_vaksin', 'keterangan', 'status',
  ]
  const contohRencana = [
    ['081234567890', 'RM-0001', 'JD-1001', '2026-08-20', 'kontrol',
     'Umum', 'Rawat Jalan', '', 'Kontrol hasil laboratorium', 'terjadwal'],
    ['082198765432', 'RM-0002', 'JD-1002', '2026-08-25', 'kontrol',
     'Jantung', 'Rawat Jalan', '', 'Evaluasi tekanan darah', 'terjadwal'],
    ['085612345678', '', 'JD-1003', '2026-09-01', 'vaksin',
     'Anak', 'Pondok Sehat', 'Hepatitis B dosis 2', 'Mohon bawa buku KIA', 'terjadwal'],
  ]
  const wsRencana = XLSX.utils.aoa_to_sheet([headerRencana, ...contohRencana])
  wsRencana['!cols'] = [
    { wch: 18 }, { wch: 12 }, { wch: 14 }, { wch: 16 }, { wch: 12 },
    { wch: 16 }, { wch: 16 }, { wch: 22 }, { wch: 30 }, { wch: 14 },
  ]
  XLSX.utils.book_append_sheet(wb, wsRencana, 'Rencana Kontrol')

  // ── Sheet Petunjuk — penjelasan tiap kolom untuk staf non-teknis ──
  const petunjuk = [
    ['PANDUAN PENGISIAN TEMPLATE IMPORT'],
    [''],
    ['Berkas ini punya 2 sheet data:'],
    ['  • "Data Pasien"     — biodata pasien + kunjungan yang SUDAH terjadi.'],
    ['  • "Rencana Kontrol" — jadwal yang BELUM terjadi (opsional). Ini sumber data'],
    ['                        Pengingat Kontrol dan Pengingat Vaksin. Boleh dikosongkan'],
    ['                        atau dihapus kalau belum dipakai.'],
    [''],
    ['════ SHEET "DATA PASIEN" ════'],
    ['Kolom', 'Wajib?', 'Penjelasan'],
    ['nama', 'Wajib', 'Nama lengkap pasien.'],
    ['no_hp', 'Wajib', 'Nomor HP aktif — format 08xxx atau +628xxx. Dipakai sebagai kunci utama pencocokan pasien (kalau pasien sudah ada, datanya diperbarui, bukan dibuat dobel).'],
    ['no_rm', 'Opsional', 'Nomor rekam medis dari sistem RS Anda. Kalau diisi, prioritas pencocokan pasien lebih tinggi dari no_hp.'],
    ['email', 'Opsional', 'Alamat email pasien.'],
    ['tanggal_lahir', 'Opsional', 'Format DD/MM/YYYY atau YYYY-MM-DD.'],
    ['unit', 'Opsional', 'Kelompok unit kunjungan, mis. "Rawat Jalan", "Rawat Inap", "Penunjang", "Pondok Sehat". Tulisan bebas diterima & dirapikan otomatis.'],
    ['poli', 'Opsional', 'Nama poli/unit spesifik, mis. "Jantung", "Anak".'],
    ['dokter', 'Opsional', 'Nama dokter yang menangani.'],
    ['tanggal_kunjungan', 'Opsional', 'Isi kolom ini kalau baris ini mewakili SATU kunjungan (bukan cuma data pasien). Kosongkan kalau hanya ingin mendaftarkan/memperbarui data pasien tanpa riwayat kunjungan.'],
    ['diagnosa_icd', 'Opsional', 'Kode ICD-10 diagnosa utama, mis. "J06.9". Isi hanya kalau ada tanggal_kunjungan.'],
    ['diagnosa_nama', 'Opsional', 'Nama diagnosa dalam Bahasa Indonesia.'],
    ['tindakan', 'Opsional', 'Nama layanan/tindakan, mis. "Konsultasi jantung". Sistem akan MENCOBA menautkan otomatis ke pustaka layanan berdasarkan nama persis (case-insensitive) — kalau tidak cocok, nama tetap tersimpan tapi tanpa tautan kode.'],
    ['tindakan_kode', 'Opsional', 'Kode layanan (kode_barang) kalau Anda sudah tahu kodenya di sistem kami — lebih akurat daripada mengandalkan pencocokan nama otomatis.'],
    ['jenis_pembayaran', 'Opsional', 'Cara bayar kunjungan ini. Isi salah satu: "TUNAI" (bayar sendiri/umum) atau "NON_TUNAI" (BPJS/asuransi/dijamin perusahaan). Variasi tulisan seperti "Umum", "Cash", "BPJS", "Asuransi" juga dikenali otomatis.'],
    ['nama_instansi', 'Opsional', 'Nama penjamin kalau jenis_pembayaran = NON_TUNAI, mis. "BPJS Kesehatan", "Prudential", "PT Unilever Indonesia". Kosongkan kalau TUNAI.'],
    ['status_kunjungan', 'Opsional', 'Isi "SELESAI" untuk kunjungan yang benar terjadi. Kalau diisi "BATAL"/"CANCEL"/"DIBATALKAN", baris tetap memperbarui data pasien TAPI kunjungannya TIDAK disimpan sbg riwayat.'],
    [''],
    ['════ SHEET "RENCANA KONTROL" (opsional) ════'],
    ['Kolom', 'Wajib?', 'Penjelasan'],
    ['no_hp', 'Wajib', 'Nomor HP pasien. Pasien HARUS sudah ada di sistem — kalau belum, masukkan dulu lewat sheet "Data Pasien" pada berkas yang sama (sheet Data Pasien selalu diproses lebih dulu).'],
    ['no_rm', 'Opsional', 'Nomor rekam medis; kalau diisi, dipakai lebih dulu untuk mencari pasien.'],
    ['rencana_id', 'Sangat disarankan', 'ID jadwal di sistem RS Anda. Kalau diisi, jadwal ini bisa DIPERBARUI lewat impor ulang — termasuk digeser tanggalnya. Kalau dikosongkan, mengubah tanggal akan membuat jadwal BARU dan jadwal lama harus Anda batalkan sendiri (isi status = batal).'],
    ['tanggal_rencana', 'Wajib', 'Tanggal jadwal, format DD/MM/YYYY atau YYYY-MM-DD. Pengingat hanya terkirim untuk tanggal yang MASIH AKAN DATANG.'],
    ['jenis', 'Opsional', 'Isi "vaksin" untuk jadwal vaksinasi (dapat Pengingat Vaksin H-7, H-3, H-1). Isi "kontrol" atau kosongkan untuk kontrol biasa (dapat Pengingat Kontrol H-3 dan H-1).'],
    ['poli', 'Opsional', 'Poli/unit spesifik tujuan kontrol, mis. "Jantung".'],
    ['unit', 'Opsional', 'Kelompok unit, mis. "Rawat Jalan", "Pondok Sehat".'],
    ['jenis_vaksin', 'Opsional', 'Nama/dosis vaksin — hanya untuk baris ber-jenis vaksin, mis. "Hepatitis B dosis 2". Ikut ditampilkan pada pesan pengingat.'],
    ['keterangan', 'Opsional', 'Catatan dokter untuk pasien, mis. "Mohon bawa buku KIA". Ikut ditampilkan pada pesan pengingat.'],
    ['status', 'Opsional', 'terjadwal (default) | batal | terpenuhi. HANYA yang berstatus "terjadwal" yang akan dikirimi pengingat. Untuk membatalkan jadwal, impor ulang barisnya dengan status = batal.'],
    [''],
    ['CATATAN PENTING'],
    ['1. Satu baris = satu pasien + (opsional) satu kunjungan. Untuk pasien dengan banyak kunjungan, buat beberapa baris memakai no_hp yang sama — lihat baris contoh 1 dan 2 di sheet "Data Pasien". Semuanya akan tersimpan sebagai kunjungan terpisah untuk satu pasien yang sama.'],
    ['2. AMAN DIUNGGAH ULANG. File yang sama boleh diunggah lagi (mis. setelah Anda memperbaiki beberapa baris) tanpa menggandakan data. Kunjungan dianggap sama jika tanggal_kunjungan + poli + tindakan-nya sama. Konsekuensinya: dua kunjungan yang benar-benar berbeda TAPI ketiga isian itu identik akan terhitung satu — bedakan lewat kolom poli atau tindakan bila perlu.'],
    ['3. Kalau satu no_hp muncul di beberapa baris dengan data pribadi berbeda (mis. alamat email berbeda), data dari baris TERAKHIR yang dipakai.'],
    ['4. Baris tanpa nama, tanpa no_hp, atau dengan format no_hp tidak valid akan dilewati dan dilaporkan di hasil akhir.'],
    ['5. Hasil lengkap (baris berhasil/dilewati beserta alasannya) bisa dilihat di halaman Import Excel setelah proses selesai.'],
    ['6. Kolom kunjungan (unit s/d status_kunjungan) hanya diproses bila tanggal_kunjungan diisi. Baris contoh 4 memperagakan pendaftaran pasien tanpa riwayat kunjungan.'],
    ['7. JADWAL TIDAK PERNAH DIBATALKAN OTOMATIS. Jadwal yang sudah tersimpan tetap aktif meskipun tidak ikut disertakan pada impor berikutnya — karena satu berkas Excel hanya memuat sebagian data, bukan gambaran seluruh jadwal. Untuk membatalkan, impor ulang baris jadwal tersebut dengan status = batal.'],
    ['8. Kalau tanggal sebuah jadwal digeser (memakai rencana_id yang sama), catatan "sudah diingatkan" ikut direset supaya pengingat untuk tanggal yang baru tetap terkirim.'],
  ]
  const wsPetunjuk = XLSX.utils.aoa_to_sheet(petunjuk)
  wsPetunjuk['!cols'] = [{ wch: 20 }, { wch: 10 }, { wch: 90 }]
  XLSX.utils.book_append_sheet(wb, wsPetunjuk, 'Petunjuk')

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

  return new NextResponse(buf, {
    headers: {
      'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="template-import-pasien.xlsx"',
    },
  })
}
