# Kontrak Data API SIMRS — Person & Kunjungan

**Pilot: Unit Pondok Sehat** · Versi 1.0 · 21 Juli 2026 · Status: Draf untuk tim IT RKZ

Dokumen ini adalah acuan tunggal field apa saja yang perlu disiapkan tim IT RKZ sebelum
membangun endpoint API SIMRS untuk CRM 360 RKZ. Isinya rangkuman dari kesepakatan yang
sudah dibahas bersama — bukan permintaan baru — supaya kedua sisi punya rujukan yang sama
persis saat pengembangan berjalan.

---

## 1. Ringkasan

CRM 360 RKZ butuh dua jenis data dari SIMRS: **data pasien (Person)** dan **data kunjungan
(Visit)**. Untuk pilot ini, lingkupnya sengaja dibatasi ke **satu unit: Pondok Sehat** —
supaya beban ke sistem SIMRS minimal sambil kedua sisi belajar sebelum diperluas ke unit
lain secara bertahap.

Dua endpoint yang dibutuhkan:

| Endpoint | Kebutuhan | Status |
|---|---|---|
| **Kunjungan** (delta harian) | Feed berkelanjutan — data berubah tiap hari | Perlu API sungguhan |
| **Pasien** (by No. RM) | Data pasien berubah jarang | Untuk pilot, boleh mulai dari **ekspor Excel sekali**, API menyusul |

---

## 2. Autentikasi

- Bearer token dikirim lewat header `Authorization: Bearer <token>`
- Base URL disimpan per rumah sakit (sistem CRM ini multi-tenant), format `https://.../`
- Kredensial (base URL + token) disimpan di database CRM per tenant, tidak pernah di-hardcode

---

## 3. Endpoint Kunjungan (Delta Harian)

```
GET /kunjungan/delta?tanggal=YYYY-MM-DD&page=1&per_page=100&unit=<KODE_PONDOK_SEHAT>
```

> ⚠️ **Perlu diisi tim IT**: kode/nilai parameter `unit` untuk menyaring khusus Pondok
> Sehat di sistem SIMRS — filter ini sebaiknya dilakukan di sisi server SIMRS, bukan kami
> minta semua lalu buang di sisi kami.

**Bentuk respons:**

```json
{
  "data": [ /* array baris kunjungan, lihat tabel field di bawah */ ],
  "meta": { "total": 123, "page": 1, "per_page": 100 }
}
```

> ℹ️ **RAMPING (by design):** endpoint Kunjungan **tidak** memuat demografi pasien
> (nama, HP, NIK, alamat, dst.). Demografi diambil terpisah lewat endpoint Pasien,
> hanya untuk `no_rm` yang datanya baru/berubah — supaya data pasien tidak dikirim
> ulang di tiap baris kunjungan (pasien rutin bisa punya banyak kunjungan). Penghubung
> ke pasien cukup lewat `no_rm`.

**Field per baris kunjungan:**

| Field | Tipe | Wajib? | Contoh | Keterangan |
|---|---|---|---|---|
| `kunjungan_id` | string | **Wajib** | `"KJG-20260320-0042"` | ID unik kunjungan di SIMRS — kunci dedup sync |
| `no_rm` | string | **Wajib** | `"RM123456"` | **Satu-satunya** penghubung ke data Pasien |
| `tanggal` | string (YYYY-MM-DD) | **Wajib** | `"2026-03-20"` | Tanggal kunjungan |
| `tindakan_kode` | string atau null | **Penting** | `"4419"` | **Harus sama persis** dengan kode barang di master layanan kami — dasar pencocokan evaluasi campaign |
| `unit` | string atau null | **Penting** | `"Pondok Sehat"` | Nama kelompok unit |
| `status_kunjungan` | string atau null | **Penting** | `"SELESAI"` | **BATAL sudah difilter** di API SIMRS — field ini tetap diminta sebagai jaring pengaman |
| `jadwal_kontrol` | string (YYYY-MM-DD) atau null | **Penting** | `"2026-04-20"` | Jadwal kontrol berikutnya, kalau ada |
| `poli` | string atau null | Opsional | `"Poli Umum"` | Unit spesifik (lebih detail dari `unit`) |
| `dokter` | string atau null | Opsional | `"dr. Andi Wijaya, Sp.PD"` | |
| `diagnosa_icd` | string atau null | Opsional | `"J06.9"` | Kode ICD-10 diagnosa utama |
| `diagnosa_nama` | string atau null | Opsional | `"ISPA akut"` | |
| `diagnosa_sekunder` | array of string | Opsional | `["I10"]` | Kode ICD-10 tambahan |
| `jenis_pembayaran` | `"TUNAI"` \| `"NON_TUNAI"` atau null | Opsional | `"NON_TUNAI"` | Penjamin — atribut kunjungan ini, **bukan** pasien (satu pasien bisa beda penjamin per kunjungan) |
| `nama_instansi` | string atau null | Opsional | `"BPJS Kesehatan"` | Nama penjamin kunjungan ini |
| `kode_instansi` | string atau null | Opsional | `"BPJS-001"` | Kode master instansi dari SIMRS |

---

## 4. Endpoint Pasien (by No. Rekam Medis)

```
GET /pasien/{no_rm}
```

> ℹ️ **Sumber tunggal demografi.** Dipanggil **selektif** oleh sistem — hanya untuk
> `no_rm` yang baru atau datanya sudah basi (>30 hari), plus tombol "Segarkan dari SIMRS"
> manual per pasien. Penjamin (`jenis_pembayaran`/`nama_instansi`/`kode_instansi`)
> **tidak** di sini — itu atribut per-kunjungan.

**Field:**

| Field | Tipe | Wajib? | Contoh | Keterangan |
|---|---|---|---|---|
| `no_rm` | string | **Wajib** | `"RM123456"` | |
| `nama` | string | **Wajib** | `"Budi Santoso"` | |
| `no_hp` | string atau null | **Penting** | `"081234567890"` | Nomor HP utama pasien |
| `nik` | string atau null | **Penting** (tersedia) | `"3578012345678901"` | Dikonfirmasi tersedia di SIMRS — dipakai deteksi pasien duplikat |
| `tanggal_lahir` | string (YYYY-MM-DD) atau null | Opsional | `"1985-06-15"` | |
| `jenis_kelamin` | `"L"` \| `"P"` atau null | Opsional | `"L"` | |
| `no_hp_alternatif` | string atau null | Opsional | `"081298765432"` | Nomor HP kedua (mis. milik keluarga/wali) |
| `agama` | string atau null | Opsional | `"Islam"` | |
| `alamat` | string atau null | Opsional | `"Jl. Contoh No. 1"` | Alamat bebas — **terpisah** dari `kota`/`kecamatan` di bawah |
| `kota` | string atau null | Opsional | `"Surabaya"` | Kota/kabupaten — field terstruktur sendiri, dipakai segmentasi wilayah |
| `kecamatan` | string atau null | Opsional | `"Tenggilis Mejoyo"` | Field terstruktur sendiri, dipakai segmentasi wilayah |
| `no_bpjs` | string atau null | Opsional | `"0001234567890"` | |

> **Untuk pilot**: endpoint ini boleh belum ada dulu. Data Person bisa dikirim **sekali**
> lewat ekspor Excel (format akan diselaraskan terpisah), sementara endpoint Kunjungan
> di atas yang jadi prioritas karena perlu jadi feed berkelanjutan.
>
> **Versi terkini dari dokumen ini bisa dilihat & disesuaikan langsung di aplikasi:**
> Pengaturan → Integrasi SIMRS → Dokumentasi Kontrak API (khusus Admin IT).

---

## 5. Aturan Non-Fungsional

| Aspek | Kesepakatan / Asumsi | Status |
|---|---|---|
| Ukuran halaman | Maks **100 baris** per panggilan | Dikonfirmasi |
| Batas frekuensi panggilan | — | ❓ **Terbuka** — apakah 100 baris itu cuma batas per halaman, atau juga ada batas jumlah panggilan per menit/jam? Menentukan berapa lama backfill data historis akan makan waktu |
| Paginasi | Wajib ada untuk endpoint Kunjungan (`page`, `per_page`, `meta.total`) | Sudah di kontrak |
| Zona waktu | WIB, format tanggal `YYYY-MM-DD` | Asumsi, mohon dikonfirmasi |
| Format nomor HP | — | ❓ **Terbuka** — dengan/tanpa awalan `0`, atau format `+62`? Kami normalisasi ke awalan `0` di sisi kami, tapi perlu tahu format aslinya |
| Kunjungan batal | Sudah difilter di sisi API SIMRS | Dikonfirmasi — `status_kunjungan` tetap diminta terkirim sebagai jaring pengaman |
| Sandbox / lingkungan uji | Belum tersedia | Dikonfirmasi. Pengujian awal akan memakai 1–2 No. RM sungguhan yang ditunjuk tim IT, bukan lingkungan terpisah |

---

## 6. Kesepakatan yang Sudah Dikonfirmasi

Dicatat di sini supaya tidak perlu ditanyakan ulang:

- ✅ `tindakan_kode` di SIMRS **sama persis** dengan kode barang di master layanan kami — tidak perlu tabel pemetaan
- ✅ Pondok Sehat adalah **satu** kode unit (bukan gabungan beberapa poli/kode layanan)
- ✅ Kunjungan berstatus **BATAL sudah difilter** oleh API SIMRS sebelum sampai ke kami
- ✅ **NIK tersedia** di data pasien SIMRS
- ✅ Belum ada sistem yang menandai "data pasien ini berubah" — diakali dari sisi kami: setiap kali No. RM muncul di feed Kunjungan, data Pasiennya otomatis disegarkan. **Tidak perlu tim IT membangun apa pun tambahan untuk ini.**
- ✅ Sandbox/staging belum tersedia — pengujian dilakukan bertahap dengan No. RM sungguhan yang ditunjuk tim IT

---

## 7. Kalau Kontrak Ini Berubah

Karena belum ada sistem otomatis yang memberi tahu perubahan data di kedua sisi, **perubahan
nama field, tipe data, atau struktur endpoint wajib dikomunikasikan manual** sebelum
dideploy ke pengguna sungguhan.

Di sisi CRM, sudah tersedia **tools diagnostik** (menu Pengaturan → Integrasi SIMRS, khusus
role Admin IT/Super Admin) untuk menguji endpoint dan memvalidasi field secara instan —
bisa dipakai bersama saat ada perubahan untuk memastikan kontrak masih cocok, tanpa perlu
menunggu sync otomatis berjalan dulu.

---

## 8. Pertanyaan Terbuka

1. Apa kode/nilai parameter `unit` untuk Pondok Sehat di sistem SIMRS?
2. Batas 100 baris itu cuma per halaman, atau juga ada batas jumlah panggilan per menit/jam?
3. Format nomor HP yang dikirim — dengan awalan `0`, atau `+62`?

---

## Riwayat Dokumen

| Versi | Tanggal | Perubahan |
|---|---|---|
| 1.0 | 21 Juli 2026 | Draf awal, disusun dari kesepakatan diskusi dengan tim IT RKZ |
