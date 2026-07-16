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
    name: 'daftar_kegiatan',
    description:
      'Daftar kegiatan/event yang pernah diadakan, lengkap dengan jenis, tanggal, penyelenggara, ' +
      'lokasi, dan jumlah peserta. Pakai ini SEBELUM memfilter kegiatan — jangan menebak nama atau ' +
      'jenis kegiatan, dan jangan minta daftarnya ke admin: ambil sendiri lewat tool ini. ' +
      'Tanpa argumen = semua kegiatan.',
    inputSchema: {
      type: 'object',
      properties: {
        tahun:  { type: 'number', description: 'Saring per tahun kegiatan (opsional)' },
        cari:   { type: 'string', description: 'Kata kunci nama/jenis/penyelenggara (opsional)' },
      },
    },
  },
  {
    name: 'daftar_nilai_dimensi',
    description:
      'Lihat nilai NYATA yang tersedia pada sebuah dimensi beserta jumlah datanya. WAJIB dipakai ' +
      'sebelum memfilter dimensi bernilai teks (jenis kegiatan, penyelenggara, lokasi, poli, kota, ' +
      'dokter) — supaya kamu memakai nilai yang benar-benar ada, bukan tebakan. Contoh: jenis kegiatan ' +
      'di sistem bisa tertulis "Seminar / Webinar", bukan sekadar "Seminar".',
    inputSchema: {
      type: 'object',
      properties: {
        dimensi: {
          type: 'string',
          enum: ['jenis_kegiatan', 'penyelenggara', 'lokasi_kegiatan', 'poli', 'unit', 'dokter', 'kota', 'kecamatan', 'pekerjaan', 'penjamin'],
          description: 'Dimensi yang ingin dilihat nilai-nilainya',
        },
      },
      required: ['dimensi'],
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
      'Hitung jumlah pasien/orang yang cocok kriteria filter. Bisa menggabungkan banyak sumber sekaligus: ' +
      'kunjungan SIMRS (unit, ICD, layanan, periode, poli, dokter, penjamin), frekuensi (minKunjunganSimrs / ' +
      'minKegiatanDiikuti), tag/kategori (tagIds), partisipasi kegiatan (jenis, nama, penyelenggara, lokasi, ' +
      'tahun), dan atribut orang (usia, jenis kelamin, kota, kecamatan, pekerjaan). Semua field yang diisi ' +
      'digabung dengan AND (irisan). Kembalikan HANYA jumlah — tidak ada data pasien individual. Pakai untuk ' +
      'menunjukkan skala hasil ke admin sebelum ditawarkan simpan sebagai segmen.\n' +
      'CARA PAKAI YANG BENAR:\n' +
      '- PENTING soal cara AND bekerja: kriteria kunjungan (units, icdCodes, tindakanKodes, poli, dokter, ' +
      'namaInstansi, periode) harus terpenuhi pada SATU kunjungan yang sama. Jadi ' +
      '{units:["PONDOK_SEHAT"], namaInstansi:"Prudential"} berarti "kunjungan check-up YANG DIBAYAR ' +
      'Prudential" — bukan "orang yang pernah check-up dan kebetulan punya Prudential di kunjungan lain". ' +
      'Kalau maksud admin yang kedua, cari terpisah lalu jelaskan bedanya. Sebaliknya, kriteria antar-sumber ' +
      '(kunjungan vs kegiatan vs tag vs atribut orang) digabung di tingkat ORANG.\n' +
      '- Untuk dimensi teks (jenis kegiatan, penyelenggara, lokasi, poli, dokter, kota), panggil ' +
      'daftar_nilai_dimensi dulu supaya memakai nilai yang benar-benar ada — jangan menebak.\n' +
      '- Untuk kategori orang (profesi/minat/segmen), utamakan tagIds lewat cari_tag, bukan pekerjaanContains.\n' +
      '- Untuk kode ICD dan layanan, wajib lewat cari_kode_icd / cari_layanan dulu.\n' +
      'CATATAN KUALITAS DATA (keterisian beda-beda tiap RS — jangan asumsikan lengkap):\n' +
      '- pekerjaanContains, alamatContains, usiaMin/usiaMax bergantung field teks bebas yang sering tidak ' +
      'konsisten diisi saat entri data.\n' +
      '- Untuk wilayah, pakai kota/kecamatan (terstruktur) dulu, alamatContains hanya cadangan.\n' +
      '- Kalau hasilnya kecil/nol, jangan langsung simpulkan "tidak ada" — sampaikan bahwa bisa jadi data ' +
      'sumbernya belum lengkap terisi.',
    inputSchema: {
      type: 'object',
      properties: {
        units:         { type: 'array', items: { type: 'string', enum: ['RAWAT_JALAN', 'RAWAT_INAP', 'PENUNJANG', 'PONDOK_SEHAT', 'ONE_DAY_CARE', 'HOME_CARE'] }, description: 'Unit kunjungan. PONDOK_SEHAT = paket check-up (Check Up Gold, Deteksi Diabetes, dll) — target marketing utama.' },
        icdCodes:      { type: 'array', items: { type: 'string' }, description: 'Kode ICD yang sudah diverifikasi lewat cari_kode_icd' },
        tindakanKodes: { type: 'array', items: { type: 'string' }, description: 'Kode layanan/tindakan (kode_barang) hasil cari_layanan' },
        periodeAwal:   { type: 'string', description: 'YYYY-MM-DD — periode kunjungan SIMRS' },
        periodeAkhir:  { type: 'string', description: 'YYYY-MM-DD — periode kunjungan SIMRS' },
        poli:          { type: 'string', description: 'Nama poli — cek dulu lewat daftar_nilai_dimensi' },
        dokter:        { type: 'string', description: 'Nama dokter — cek dulu lewat daftar_nilai_dimensi' },
        namaInstansi:  { type: 'string', description: 'Penjamin, mis. "BPJS Kesehatan" atau asuransi swasta ("Prudential"). Asuransi swasta biasanya segmen bernilai tinggi.' },
        minKunjunganSimrs:  { type: 'number', description: 'Minimal berapa kali berkunjung (mengikuti kriteria kunjungan lain yang diisi). Mis. 5 = pasien loyal.' },
        minKegiatanDiikuti: { type: 'number', description: 'Minimal berapa kali ikut kegiatan. Mis. 2 = pernah ikut lebih dari 1x.' },
        tagIds:               { type: 'array', items: { type: 'string' }, description: 'ID tag hasil cari_tag — cara utama filter kategori orang (profesi, minat, segmen)' },
        pekerjaanContains:    { type: 'string', description: 'Kata kunci pekerjaan, field teks bebas — coba cari_tag dulu untuk kategori profesi' },
        jenisKelamin:         { type: 'string', enum: ['L', 'P'], description: 'L = laki-laki, P = perempuan' },
        usiaMin:              { type: 'number', description: 'Usia minimum dalam tahun, dihitung dari tanggal lahir' },
        usiaMax:              { type: 'number', description: 'Usia maksimum dalam tahun' },
        kota:                 { type: 'string', description: 'Kata kunci kota/kabupaten — field terstruktur, lebih andal daripada alamatContains' },
        kecamatan:            { type: 'string', description: 'Kata kunci kecamatan — field terstruktur, lebih andal daripada alamatContains' },
        alamatContains:       { type: 'string', description: 'Kata kunci alamat, teks bebas satu baris — pakai kota/kecamatan dulu kalau tujuannya filter wilayah' },
        jenisKegiatan:        { type: 'string', description: 'Jenis kegiatan — cek nilai nyatanya lewat daftar_nilai_dimensi (bisa majemuk, mis. "Seminar / Webinar")' },
        namaKegiatanContains: { type: 'string', description: 'Kata kunci nama kegiatan — lihat daftar_kegiatan dulu' },
        penyelenggara:        { type: 'string', description: 'Penyelenggara kegiatan, mis. "ATC", "RKZ Surabaya", atau mitra seperti "Prudential"' },
        lokasiKegiatan:       { type: 'string', description: 'Lokasi kegiatan. "Zoom" = kegiatan daring — membedakan audiens online vs offline.' },
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

  if (call.name === 'daftar_kegiatan') {
    const where: any = { tenant_slug: slug }
    const tahun = call.input?.tahun
    if (tahun) {
      where.tanggal_mulai = { gte: new Date(`${tahun}-01-01`), lte: new Date(`${tahun}-12-31`) }
    }
    const cari = String(call.input?.cari ?? '').trim()
    if (cari.length >= 2) {
      where.OR = [
        { nama:          { contains: cari, mode: 'insensitive' } },
        { jenis:         { contains: cari, mode: 'insensitive' } },
        { penyelenggara: { contains: cari, mode: 'insensitive' } },
      ]
    }

    const rows = await db.kegiatan.findMany({
      where,
      select: {
        nama: true, jenis: true, tanggal_mulai: true, lokasi: true, penyelenggara: true,
        _count: { select: { peserta: { where: { hadir: true } } } },
      },
      orderBy: { tanggal_mulai: 'desc' },
      take: 40,
    })
    return JSON.stringify({
      results: rows.map((k: any) => ({
        nama: k.nama,
        jenis: k.jenis,
        tanggal: k.tanggal_mulai?.toISOString().slice(0, 10),
        lokasi: k.lokasi,
        penyelenggara: k.penyelenggara,
        jumlah_peserta: k._count.peserta,
      })),
    })
  }

  if (call.name === 'daftar_nilai_dimensi') {
    const dimensi = String(call.input?.dimensi ?? '')

    // Tiap dimensi: dari tabel mana, kolom apa. Hanya kolom non-PII.
    // `by` di-cast karena nama kolom datang sebagai string dari peta di bawah,
    // bukan literal — nilainya sudah dibatasi enum di inputSchema.
    const dariKegiatan = (kolom: string) => async () => {
      const rows = await db.kegiatan.groupBy({ by: [kolom] as any, where: { tenant_slug: slug }, _count: { _all: true } })
      return rows.map((r: any) => ({ nilai: r[kolom], jumlah_kegiatan: r._count._all }))
    }
    const dariVisit = (kolom: string) => async () => {
      const rows = await db.simrsVisit.groupBy({
        by: [kolom] as any,
        where: { aktif: true, person: { tenant_slug: slug, aktif: true } },
        _count: { _all: true },
      })
      return rows.map((r: any) => ({ nilai: r[kolom], jumlah_kunjungan: r._count._all }))
    }
    const dariPerson = (kolom: string) => async () => {
      const rows = await db.person.groupBy({
        by: [kolom] as any,
        where: { tenant_slug: slug, aktif: true },
        _count: { _all: true },
      })
      return rows.map((r: any) => ({ nilai: r[kolom], jumlah_orang: r._count._all }))
    }

    const peta: Record<string, () => Promise<any[]>> = {
      jenis_kegiatan:  dariKegiatan('jenis'),
      penyelenggara:   dariKegiatan('penyelenggara'),
      lokasi_kegiatan: dariKegiatan('lokasi'),
      poli:            dariVisit('poli'),
      unit:            dariVisit('unit'),
      dokter:          dariVisit('dokter'),
      penjamin:        dariVisit('nama_instansi'),
      kota:            dariPerson('kota'),
      kecamatan:       dariPerson('kecamatan'),
      pekerjaan:       dariPerson('pekerjaan'),
    }

    const fn = peta[dimensi]
    if (!fn) return JSON.stringify({ error: `Dimensi tidak dikenal: ${dimensi}` })

    const hasil = (await fn())
      .filter((r: any) => r.nilai != null && r.nilai !== '')
      .sort((a: any, b: any) => (b.jumlah_kegiatan ?? b.jumlah_kunjungan ?? b.jumlah_orang) - (a.jumlah_kegiatan ?? a.jumlah_kunjungan ?? a.jumlah_orang))
      .slice(0, 40)

    return JSON.stringify({ dimensi, nilai_tersedia: hasil })
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
    const i = call.input ?? {}
    const result = await runSegmenSearch(db, slug, {
      units:                i.units,
      icdCodes:             i.icdCodes,
      tindakanKodes:        i.tindakanKodes,
      periodeAwal:          i.periodeAwal,
      periodeAkhir:         i.periodeAkhir,
      poli:                 i.poli,
      dokter:               i.dokter,
      namaInstansi:         i.namaInstansi,
      minKunjunganSimrs:    i.minKunjunganSimrs,
      minKegiatanDiikuti:   i.minKegiatanDiikuti,
      tagIds:               i.tagIds,
      pekerjaanContains:    i.pekerjaanContains,
      jenisKelamin:         i.jenisKelamin,
      usiaMin:              i.usiaMin,
      usiaMax:              i.usiaMax,
      alamatContains:       i.alamatContains,
      kota:                 i.kota,
      kecamatan:            i.kecamatan,
      jenisKegiatan:        i.jenisKegiatan,
      namaKegiatanContains: i.namaKegiatanContains,
      penyelenggara:        i.penyelenggara,
      lokasiKegiatan:       i.lokasiKegiatan,
      kegiatanTahunMulai:   i.kegiatanTahunMulai,
      kegiatanTahunSelesai: i.kegiatanTahunSelesai,
    })
    return JSON.stringify({ total_pasien: result.total })
  }

  return JSON.stringify({ error: `Tool tidak dikenal: ${call.name}` })
}
