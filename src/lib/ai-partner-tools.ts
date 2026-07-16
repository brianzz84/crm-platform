/**
 * Tools grounding untuk AI Partner — satu-satunya jalan AI dapat/verifikasi
 * kode ICD, kode layanan, dan jumlah pasien. Ini batasan struktural: AI tidak
 * diberi tool lain (tidak ada akses SQL langsung, tidak ada tool baca data
 * pasien individual) — bukan soal rule teks yang bisa ditimpa, tapi soal
 * kemampuan apa yang memang tersedia.
 */
import { getTenantDb } from '@/lib/tenant'
import { runSegmenSearch } from '@/app/api/[slug]/segmen/search/route'
import type { AiTool, AiToolCall } from '@/lib/ai-provider'

export const AI_PARTNER_TOOLS: AiTool[] = [
  {
    name: 'cari_kode_icd',
    description:
      'Cari kode ICD-10 yang cocok dengan istilah diagnosa/penyakit (Indonesia atau Inggris). ' +
      'WAJIB dipakai untuk memverifikasi kode ICD sebelum dipakai di filter — jangan pernah ' +
      'menyebut kode ICD dari ingatan tanpa mengecek lewat tool ini dulu.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Kata kunci penyakit/diagnosa, mis. "diabetes" atau "jantung koroner"' },
      },
      required: ['query'],
    },
  },
  {
    name: 'cari_layanan',
    description:
      'Cari layanan/tindakan medis (kode barang SIMRS) yang cocok dengan kata kunci. ' +
      'Gunakan untuk verifikasi nama layanan sebelum dipakai di filter.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Kata kunci layanan/tindakan' },
      },
      required: ['query'],
    },
  },
  {
    name: 'cari_tag',
    description:
      'Cari tag/kategori yang sudah ditandai ke orang di sistem (mis. "Nakes", "Awam", "Kardiologi", ' +
      '"Parenting"). WAJIB dipakai untuk kategori orang seperti profesi/minat/segmen — JANGAN pakai ' +
      'kata kunci bebas untuk hal ini, karena field teks bebas seperti pekerjaan seringkali kosong di ' +
      'data nyata, sedangkan tag sudah terisi konsisten. Kembalikan tagId yang lalu dipakai di ' +
      'parameter tagIds pada preview_jumlah_pasien.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Kata kunci nama tag, mis. "nakes" atau "jantung"' },
      },
      required: ['query'],
    },
  },
  {
    name: 'preview_jumlah_pasien',
    description:
      'Hitung jumlah pasien/orang yang cocok kriteria filter — bisa gabungan dari kunjungan SIMRS ' +
      '(unit, kode ICD, periode, poli), tag/kategori (tagIds, dari cari_tag), partisipasi kegiatan ' +
      '(jenis kegiatan, nama kegiatan, tahun), dan atribut orang (usia, alamat, pekerjaan). Semua ' +
      'field yang diisi digabung dengan AND (irisan). Kembalikan HANYA jumlah — tidak ada data ' +
      'pasien individual. Pakai ini untuk menunjukkan skala hasil pencarian ke admin sebelum ' +
      'ditawarkan simpan sebagai segmen.\n' +
      'CATATAN KUALITAS DATA (berlaku umum, tingkat keterisian bisa beda tiap RS — jangan asumsikan lengkap):\n' +
      '- pekerjaanContains, alamatContains, usiaMin/usiaMax bergantung pada field teks bebas (pekerjaan, ' +
      'alamat, tanggal_lahir) yang di banyak RS sering tidak konsisten diisi saat entri data. Untuk kategori ' +
      'orang seperti profesi/minat, SELALU coba tagIds (lewat cari_tag) dulu — itu data terstruktur yang ' +
      'admin sengaja tandai, biasanya lebih lengkap daripada field teks bebas.\n' +
      '- Untuk wilayah, pakai kota/kecamatan (field terstruktur) dulu, baru alamatContains sebagai cadangan ' +
      'kalau kota/kecamatan tidak ketemu — alamatContains cuma cocok kata kunci di satu baris teks alamat, ' +
      'jadi gampang meleset.\n' +
      '- Kalau hasil dari filter berbasis teks bebas ini kecil/nol, jangan langsung simpulkan "tidak ada" — ' +
      'sampaikan ke admin bahwa itu bisa jadi karena data sumbernya belum lengkap terisi, bukan berarti ' +
      'benar-benar tidak ada orang yang cocok.',
    inputSchema: {
      type: 'object',
      properties: {
        units:        { type: 'array', items: { type: 'string', enum: ['RAWAT_JALAN', 'RAWAT_INAP', 'PENUNJANG', 'PONDOK_SEHAT', 'ONE_DAY_CARE', 'HOME_CARE'] }, description: 'Unit kunjungan. PONDOK_SEHAT = paket check-up (Check Up Gold, Deteksi Diabetes, dll) — target marketing utama.' },
        icdCodes:     { type: 'array', items: { type: 'string' }, description: 'Kode ICD yang sudah diverifikasi lewat cari_kode_icd' },
        periodeAwal:  { type: 'string', description: 'YYYY-MM-DD — periode kunjungan SIMRS' },
        periodeAkhir: { type: 'string', description: 'YYYY-MM-DD — periode kunjungan SIMRS' },
        poli:         { type: 'string' },
        tagIds:               { type: 'array', items: { type: 'string' }, description: 'ID tag yang sudah diverifikasi lewat cari_tag — cara utama filter kategori orang (profesi, minat, segmen)' },
        pekerjaanContains:    { type: 'string', description: 'Kata kunci pekerjaan, field teks bebas — coba cari_tag dulu untuk kategori profesi sebelum pakai ini' },
        usiaMin:              { type: 'number', description: 'Usia minimum dalam tahun, dihitung dari tanggal lahir' },
        usiaMax:              { type: 'number', description: 'Usia maksimum dalam tahun' },
        kota:                 { type: 'string', description: 'Kata kunci kota/kabupaten — field terstruktur, lebih andal daripada alamatContains' },
        kecamatan:            { type: 'string', description: 'Kata kunci kecamatan — field terstruktur, lebih andal daripada alamatContains' },
        alamatContains:       { type: 'string', description: 'Kata kunci alamat, teks bebas satu baris — pakai kota/kecamatan dulu kalau tujuannya filter wilayah' },
        jenisKegiatan:        { type: 'string', description: 'Jenis kegiatan, mis. "Seminar", "Pelatihan", "Bakti Sosial"' },
        namaKegiatanContains: { type: 'string', description: 'Kata kunci nama kegiatan' },
        kegiatanTahunMulai:   { type: 'number', description: 'Tahun mulai rentang kegiatan, mis. 2026' },
        kegiatanTahunSelesai: { type: 'number', description: 'Tahun akhir rentang kegiatan' },
      },
    },
  },
]

export async function executeAiPartnerTool(slug: string, call: AiToolCall): Promise<string> {
  const db = await getTenantDb(slug)

  if (call.name === 'cari_kode_icd') {
    const q = String(call.input?.query ?? '').trim()
    if (q.length < 2) return JSON.stringify({ error: 'Kata kunci terlalu pendek' })
    const results = await db.icdLibrary.findMany({
      where: {
        aktif: true,
        versi: 'ICD10',
        OR: [
          { kode:    { startsWith: q.toUpperCase() } },
          { nama_id: { contains: q, mode: 'insensitive' } },
          { nama:    { contains: q, mode: 'insensitive' } },
        ],
      },
      select: { kode: true, nama_id: true, nama: true },
      take: 15,
    })
    return JSON.stringify({ results })
  }

  if (call.name === 'cari_layanan') {
    const q = String(call.input?.query ?? '').trim()
    if (q.length < 2) return JSON.stringify({ error: 'Kata kunci terlalu pendek' })
    const results = await db.simrsLayananLibrary.findMany({
      where: {
        aktif: true,
        OR: [
          { kode_barang:  { contains: q, mode: 'insensitive' } },
          { nama:         { contains: q, mode: 'insensitive' } },
          { nama_generik: { contains: q, mode: 'insensitive' } },
        ],
      },
      select: { kode_barang: true, nama: true, nama_generik: true, kelompok: true, jenis: true },
      take: 15,
    })
    return JSON.stringify({ results })
  }

  if (call.name === 'cari_tag') {
    const q = String(call.input?.query ?? '').trim()
    if (q.length < 2) return JSON.stringify({ error: 'Kata kunci terlalu pendek' })
    const results = await db.tag.findMany({
      where: { tenant_slug: slug, aktif: true, name: { contains: q, mode: 'insensitive' } },
      select: { id: true, name: true, kategori: true, _count: { select: { person_tags: { where: { aktif: true } } } } },
      take: 10,
    })
    return JSON.stringify({
      results: results.map((r: any) => ({ tagId: r.id, name: r.name, kategori: r.kategori, jumlah_orang: r._count.person_tags })),
    })
  }

  if (call.name === 'preview_jumlah_pasien') {
    const result = await runSegmenSearch(db, slug, {
      units:                call.input?.units,
      icdCodes:             call.input?.icdCodes,
      periodeAwal:          call.input?.periodeAwal,
      periodeAkhir:         call.input?.periodeAkhir,
      poli:                 call.input?.poli,
      tagIds:               call.input?.tagIds,
      pekerjaanContains:    call.input?.pekerjaanContains,
      usiaMin:              call.input?.usiaMin,
      usiaMax:              call.input?.usiaMax,
      alamatContains:       call.input?.alamatContains,
      kota:                 call.input?.kota,
      kecamatan:            call.input?.kecamatan,
      jenisKegiatan:        call.input?.jenisKegiatan,
      namaKegiatanContains: call.input?.namaKegiatanContains,
      kegiatanTahunMulai:   call.input?.kegiatanTahunMulai,
      kegiatanTahunSelesai: call.input?.kegiatanTahunSelesai,
    })
    return JSON.stringify({ total_pasien: result.total })
  }

  return JSON.stringify({ error: `Tool tidak dikenal: ${call.name}` })
}
