"""
Import master tindakan RS Keluarga Sehat Sibolga ke tenant DB crm_rkz.
Source: M_TINDAKAN2026.sql

Filter:
  - Buang nama berawalan ZZZ (tidak aktif)
  - Buang hargarj = 0 DAN hargavip = 0 (tidak ada tarif)

Output: INSERT ke crm_rkz.crm_simrs_layanan_library
Fields: kode_barang, nama, kelompok, jenis, aktif
"""

import re, uuid, sys
from collections import defaultdict

SQL_FILE = "M_TINDAKAN2026.sql"

# ── Mapping kategori → (kelompok, jenis) ─────────────────────────────────────
# Prioritas: cek kategori dulu, fallback ke nama/fkelompok

KELOMPOK_RAWAT_INAP    = "Rawat Inap"
KELOMPOK_RAWAT_JALAN   = "Rawat Jalan"
KELOMPOK_PENUNJANG     = "Penunjang"
KELOMPOK_PONDOK_SEHAT  = "Pondok Sehat"
KELOMPOK_HOME_CARE     = "Home Care"
KELOMPOK_ONE_DAY_CARE  = "One Day Care"

KATEGORI_MAP = {
    # ── Penunjang ──────────────────────────────────────────────────────────
    "HEMATOLOGI":          (KELOMPOK_PENUNJANG,    "Laboratorium"),
    "Hematologi":          (KELOMPOK_PENUNJANG,    "Laboratorium"),
    "BIOKIMIA":            (KELOMPOK_PENUNJANG,    "Laboratorium"),
    "Biokimia":            (KELOMPOK_PENUNJANG,    "Laboratorium"),
    "Biokimia-L":          (KELOMPOK_PENUNJANG,    "Laboratorium"),
    "Immunologi":          (KELOMPOK_PENUNJANG,    "Laboratorium"),
    "Serologi":            (KELOMPOK_PENUNJANG,    "Laboratorium"),
    "Mikrobiolo":          (KELOMPOK_PENUNJANG,    "Laboratorium"),
    "Bakt-Mikro":          (KELOMPOK_PENUNJANG,    "Laboratorium"),
    "Kimia Klinik":        (KELOMPOK_PENUNJANG,    "Laboratorium"),
    "LEMAK":               (KELOMPOK_PENUNJANG,    "Laboratorium"),
    "Trans-Eksu":          (KELOMPOK_PENUNJANG,    "Laboratorium"),
    "Liquor-CSF":          (KELOMPOK_PENUNJANG,    "Laboratorium"),
    "Faeces":              (KELOMPOK_PENUNJANG,    "Laboratorium"),
    "PATOLOGI":            (KELOMPOK_PENUNJANG,    "Laboratorium"),
    "Urine":               (KELOMPOK_PENUNJANG,    "Laboratorium"),
    "Urine-Kwan":          (KELOMPOK_PENUNJANG,    "Laboratorium"),
    "Ur-Profil":           (KELOMPOK_PENUNJANG,    "Laboratorium"),
    "FDIGESTIF":           (KELOMPOK_PENUNJANG,    "Laboratorium"),
    "PETANDA TUMOR":       (KELOMPOK_PENUNJANG,    "Laboratorium"),
    "USG":                 (KELOMPOK_PENUNJANG,    "Radiologi"),
    "CT SCAN":             (KELOMPOK_PENUNJANG,    "Radiologi"),
    "MRI":                 (KELOMPOK_PENUNJANG,    "Radiologi"),
    "THORAX":              (KELOMPOK_PENUNJANG,    "Radiologi"),
    "MAMMOGRAFI":          (KELOMPOK_PENUNJANG,    "Radiologi"),
    "BONE DENSI":          (KELOMPOK_PENUNJANG,    "Radiologi"),
    "KONTRAS":             (KELOMPOK_PENUNJANG,    "Radiologi"),
    "ABDOMEN":             (KELOMPOK_PENUNJANG,    "Radiologi"),
    "ABDOMINOPELVIS":      (KELOMPOK_PENUNJANG,    "Radiologi"),
    "SPINE":               (KELOMPOK_PENUNJANG,    "Radiologi"),
    "EXTR.ATAS":           (KELOMPOK_PENUNJANG,    "Radiologi"),
    "EXTR.BAWAH":          (KELOMPOK_PENUNJANG,    "Radiologi"),
    "KEPALA":              (KELOMPOK_PENUNJANG,    "Radiologi"),
    "KEPALA LEHER":        (KELOMPOK_PENUNJANG,    "Radiologi"),
    "GI TRACT":            (KELOMPOK_PENUNJANG,    "Radiologi"),
    "MSK":                 (KELOMPOK_PENUNJANG,    "Radiologi"),
    "CARDIOVASCULAR":      (KELOMPOK_PENUNJANG,    "Radiologi"),
    "TOMOGRAM":            (KELOMPOK_PENUNJANG,    "Radiologi"),
    "TULANG":              (KELOMPOK_PENUNJANG,    "Radiologi"),
    "SG":                  (KELOMPOK_PENUNJANG,    "Radiologi"),
    "EREHAB MEDIS":        (KELOMPOK_PENUNJANG,    "Rehabilitasi Medik"),
    "HAEMODIALI":          (KELOMPOK_PENUNJANG,    "Hemodialisis"),
    "NAKUPUNTUR":          (KELOMPOK_PENUNJANG,    "Akupuntur"),

    # ── Rawat Jalan ────────────────────────────────────────────────────────
    "JANTUNG":             (KELOMPOK_RAWAT_JALAN,  "Jantung"),
    "ECHO":                (KELOMPOK_RAWAT_JALAN,  "Jantung"),
    "MATA":                (KELOMPOK_RAWAT_JALAN,  "Mata"),
    "THT":                 (KELOMPOK_RAWAT_JALAN,  "THT"),
    "PARU":                (KELOMPOK_RAWAT_JALAN,  "Paru"),
    "SARAF":               (KELOMPOK_RAWAT_JALAN,  "Saraf"),
    "ANAK":                (KELOMPOK_RAWAT_JALAN,  "Anak"),
    "DALAM":               (KELOMPOK_RAWAT_JALAN,  "Penyakit Dalam"),
    "KANDUNGAN":           (KELOMPOK_RAWAT_JALAN,  "Kebidanan & Kandungan"),
    "KIA":                 (KELOMPOK_RAWAT_JALAN,  "Kebidanan & Kandungan"),
    "BKIA":                (KELOMPOK_RAWAT_JALAN,  "Kebidanan & Kandungan"),
    "ORTHOPEDI":           (KELOMPOK_RAWAT_JALAN,  "Orthopedi"),
    "RUROLOGI":            (KELOMPOK_RAWAT_JALAN,  "Urologi"),
    "UROLOGI":             (KELOMPOK_RAWAT_JALAN,  "Urologi"),
    "BEDAH":               (KELOMPOK_RAWAT_JALAN,  "Bedah"),
    "IKULIT DAN KOSMETIK": (KELOMPOK_RAWAT_JALAN,  "Kulit & Kosmetik"),
    "PKULIT DAN KOSMETIK": (KELOMPOK_RAWAT_JALAN,  "Kulit & Kosmetik"),
    "GIGI":                (KELOMPOK_RAWAT_JALAN,  "Gigi"),
    "XBEDAH MULUT":        (KELOMPOK_RAWAT_JALAN,  "Gigi"),
    "3GIGI ANAK":          (KELOMPOK_RAWAT_JALAN,  "Gigi"),
    "4PROSTODONSIA":       (KELOMPOK_RAWAT_JALAN,  "Gigi"),
    "5ORTODONTIA":         (KELOMPOK_RAWAT_JALAN,  "Gigi"),
    "ZKONSERVASI GIGI":    (KELOMPOK_RAWAT_JALAN,  "Gigi"),
    "ZKONSERVASIGIGI":     (KELOMPOK_RAWAT_JALAN,  "Gigi"),
    "PERIODONSIA":         (KELOMPOK_RAWAT_JALAN,  "Gigi"),
    "UMUM":                (KELOMPOK_RAWAT_JALAN,  "Umum"),
    "JALAN":               (KELOMPOK_RAWAT_JALAN,  "Umum"),
    "SPESIALIS":           (KELOMPOK_RAWAT_JALAN,  "Umum"),
    "DOKTER":              (KELOMPOK_RAWAT_JALAN,  "Umum"),
    "SORE":                (KELOMPOK_RAWAT_JALAN,  "Umum"),
    "TINDAKAN":            (KELOMPOK_RAWAT_JALAN,  "Umum"),

    # ── Rawat Inap ─────────────────────────────────────────────────────────
    "INAP":                (KELOMPOK_RAWAT_INAP,   "Rawat Inap"),

    # ── Pondok Sehat ───────────────────────────────────────────────────────
    "CHECK UP":            (KELOMPOK_PONDOK_SEHAT, "Check Up"),
    "SCREENING":           (KELOMPOK_PONDOK_SEHAT, "Skrining"),
    "PAKET PROM":          (KELOMPOK_PONDOK_SEHAT, "Paket PROM"),
    "PAKET PROMP":         (KELOMPOK_PONDOK_SEHAT, "Paket PROM"),
    "PAKET":               (KELOMPOK_PONDOK_SEHAT, "Paket"),

    # ── Transportasi ───────────────────────────────────────────────────────
    "AMBULAN":             (KELOMPOK_RAWAT_JALAN,  "Ambulan"),
    "JASA ANTAR":          (KELOMPOK_RAWAT_JALAN,  "Ambulan"),

    # ── Home Care ──────────────────────────────────────────────────────────
    "2HOME CARE":          (KELOMPOK_HOME_CARE,    "Home Care"),
    "2HOMECARE":           (KELOMPOK_HOME_CARE,    "Home Care"),

    # ── One Day Care ───────────────────────────────────────────────────────
    "1ONE DAY CARE":       (KELOMPOK_ONE_DAY_CARE, "One Day Care"),
    "ONE DAY CARE":        (KELOMPOK_ONE_DAY_CARE, "One Day Care"),
}

# ── Parse SQL ────────────────────────────────────────────────────────────────
with open(SQL_FILE, encoding='latin1') as f:
    content = f.read()

data_start = content.find('VALUES\n')
data = content[data_start+7:]
raw_rows = re.split(r',?\n\t', data)

def parse_row(s):
    s = s.strip().lstrip('(').rstrip(')')
    result = []
    i = 0
    while i < len(s):
        if s[i] == "'":
            j = i + 1
            val = []
            while j < len(s):
                if s[j] == "'" and (j+1 >= len(s) or s[j+1] in (',', ')')):
                    break
                val.append(s[j])
                j += 1
            result.append(''.join(val))
            i = j + 1
            if i < len(s) and s[i] == ',': i += 1
        elif s[i] == ' ':
            i += 1
        else:
            j = i
            while j < len(s) and s[j] != ',': j += 1
            result.append(s[i:j])
            i = j
            if i < len(s) and s[i] == ',': i += 1
    return result

# Field positions (0-based):
# 0=id, 3=kode, 5=kategori, 6=nama, 9=hargarj, 10=hargavip, 32=frawat

rows = []
skipped_zzz = 0
skipped_notarif = 0
skipped_unknown = 0
unknown_cats = defaultdict(int)

for raw in raw_rows:
    try:
        r = parse_row(raw)
        if len(r) < 33: continue

        kode     = r[3].strip()
        kategori = r[5].strip()
        nama     = r[6].strip()
        hargarj  = float(r[9]) if r[9] else 0
        hargavip = float(r[10]) if r[10] else 0
        frawat   = r[32].strip()

        # Filter ZZZ
        if nama.upper().startswith('ZZZ'):
            skipped_zzz += 1
            continue

        # Filter tanpa tarif
        if hargarj == 0 and hargavip == 0:
            skipped_notarif += 1
            continue

        # Rawat inap dari flag frawat
        if frawat == '1' and kategori not in KATEGORI_MAP:
            kelompok, jenis = KELOMPOK_RAWAT_INAP, "Rawat Inap"
        elif kategori in KATEGORI_MAP:
            kelompok, jenis = KATEGORI_MAP[kategori]
        else:
            unknown_cats[kategori] += 1
            skipped_unknown += 1
            continue

        rows.append({
            'id':          str(uuid.uuid4()),
            'kode_barang': kode,
            'nama':        nama.replace("'", "''"),
            'kelompok':    kelompok,
            'jenis':       jenis,
        })
    except Exception as e:
        pass

# Dedup by kode_barang — prioritaskan jenis bukan 'Umum' dan 'Rawat Inap'
seen = {}
for r in rows:
    k = r['kode_barang']
    if k not in seen:
        seen[k] = r
    else:
        # Ganti jika yang baru lebih spesifik
        existing_jenis = seen[k]['jenis']
        new_jenis = r['jenis']
        if existing_jenis in ('Umum', 'Rawat Inap') and new_jenis not in ('Umum', 'Rawat Inap'):
            seen[k] = r

rows = list(seen.values())
print(f"  Setelah dedup:    {len(rows):>6,} rows unik")

print(f"✓ Parsed:           {len(rows):>6,} rows akan diimport")
print(f"  Dibuang ZZZ:      {skipped_zzz:>6,}")
print(f"  Dibuang no tarif: {skipped_notarif:>6,}")
print(f"  Kategori unknown: {skipped_unknown:>6,}")
if unknown_cats:
    print("\n  Unknown kategori (tidak ter-mapping):")
    for k, v in sorted(unknown_cats.items(), key=lambda x: -x[1])[:20]:
        print(f"    {v:5d}  {repr(k)}")

# ── Generate SQL ─────────────────────────────────────────────────────────────
out_file = "import-layanan-rkz.sql"
with open(out_file, 'w', encoding='utf-8') as f:
    f.write("-- Import master tindakan RKZ ke crm_simrs_layanan_library\n")
    f.write("-- Generated dari M_TINDAKAN2026.sql\n\n")
    f.write("BEGIN;\n\n")
    f.write("TRUNCATE TABLE crm_simrs_layanan_library;\n\n")
    f.write("INSERT INTO crm_simrs_layanan_library (id, kode_barang, nama, kelompok, jenis, aktif) VALUES\n")

    vals = []
    for r in rows:
        vals.append(
            f"  ('{r['id']}', '{r['kode_barang']}', '{r['nama']}', '{r['kelompok']}', '{r['jenis']}', true)"
        )
    f.write(",\n".join(vals))
    f.write(";\n\nCOMMIT;\n")

print(f"\n✓ SQL ditulis ke: {out_file}")
print(f"  Untuk dijalankan di DB: crm_rkz")

# ── Summary per kelompok/jenis ────────────────────────────────────────────────
print("\n── Distribusi per kelompok ──")
from collections import Counter
kelompok_c = Counter((r['kelompok'], r['jenis']) for r in rows)
cur_kel = None
for (kel, jen), cnt in sorted(kelompok_c.items()):
    if kel != cur_kel:
        print(f"\n  {kel}")
        cur_kel = kel
    print(f"    {cnt:5d}  {jen}")
