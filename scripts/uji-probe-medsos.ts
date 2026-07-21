/**
 * Uji jalur kode probe medsos TANPA token/Meta asli — global.fetch di-stub.
 * Membuktikan logika status ok/gagal/lewati & deteksi scope kurang.
 *
 * Jalankan: npx tsx scripts/uji-probe-medsos.ts
 */
let lolos = 0, gagal = 0
function periksa(nama: string, syarat: boolean, detail = '') {
  if (syarat) { console.log(`  ✓ ${nama}`); lolos++ }
  else        { console.log(`  ✗ ${nama} ${detail}`); gagal++ }
}

// ── Stub fetch: rutekan berdasar URL ──
function stub(routes: Record<string, { ok?: boolean; status?: number; json: any }>) {
  ;(global as any).fetch = async (url: string) => {
    const key = Object.keys(routes).find(k => url.includes(k))
    const r = key ? routes[key] : { ok: false, status: 404, json: { error: { message: 'not routed' } } }
    return { ok: r.ok ?? true, status: r.status ?? 200, json: async () => r.json }
  }
}

async function main() {
  const { jalankanProbeMedsos } = await import('../src/lib/meta-social-diagnostik')

  // ── Kasus A: tanpa token ──
  const a = await jalankanProbeMedsos('t-a', {})
  periksa('tanpa token → 1 hasil gagal', a.length === 1 && a[0].status === 'gagal', JSON.stringify(a))

  // ── Kasus B: token valid, scope kurang (tanpa ads_read), page ada, ig & ad kosong ──
  stub({
    'me/permissions': { json: { data: [
      { permission: 'pages_show_list', status: 'granted' },
      { permission: 'pages_read_engagement', status: 'granted' },
      { permission: 'read_insights', status: 'granted' },
      { permission: 'instagram_basic', status: 'granted' },
      { permission: 'instagram_manage_insights', status: 'granted' },
      { permission: 'business_management', status: 'granted' },
      // ads_read SENGAJA tidak ada
    ] } },
    'me?fields':                 { json: { id: '123', name: 'RKZ Test' } },
    'insights?metric=page_impressions': { json: { data: [{ name: 'page_impressions' }] } },
    'subscribed_apps':           { json: { data: [{ id: 'app1' }] } },
    '?fields=name,followers_count': { json: { name: 'RKZ Surabaya', followers_count: 1000 } },
  })
  const b = await jalankanProbeMedsos('t-b', { insights_token: 'TKN', page_id: '999' })
  const get = (k: string) => b.find(x => x.kunci === k)!
  periksa('B: token terdeteksi scope kurang (ads_read)', get('token').status === 'gagal' && get('token').pesan.includes('ads_read'), get('token')?.pesan)
  periksa('B: Facebook Page → ok', get('page').status === 'ok', get('page')?.pesan)
  periksa('B: Page Insights → ok', get('page_insights').status === 'ok', get('page_insights')?.pesan)
  periksa('B: Instagram → lewati (id kosong)', get('ig').status === 'lewati')
  periksa('B: Marketing API → lewati (id kosong)', get('ads').status === 'lewati')
  periksa('B: Webhook Page → ok', get('webhook').status === 'ok')

  // ── Kasus C: token mati → berhenti setelah cek token ──
  stub({ 'me?fields': { ok: false, status: 400, json: { error: { message: 'Invalid OAuth access token' } } } })
  const c = await jalankanProbeMedsos('t-c', { insights_token: 'BAD', page_id: '999', ig_business_id: '888' })
  periksa('C: token mati → hanya 1 hasil (berhenti)', c.length === 1 && c[0].status === 'gagal', `len=${c.length}`)

  console.log(`\n${gagal === 0 ? '✅ SEMUA LOLOS' : '❌ ADA YANG GAGAL'} — lolos ${lolos}, gagal ${gagal}`)
  process.exit(gagal > 0 ? 1 : 0)
}

main().catch(e => { console.error('GAGAL:', e.message); process.exit(1) })
