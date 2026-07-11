import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getTenantDb } from '@/lib/tenant'

const VAPID_PUBLIC = 'BGQKiAIcCA4kEst0IIOLCACmMOiEz2rcFeVOE04I9PBCddTJfJWeZvmbunHqR9GO6UrbZZbh9gmQzbjZONSCfP8'

export async function GET() {
  const session = await getSession()
  if (!session) {
    return new NextResponse(html('❌ Tidak login', 'Silakan login ke CRM terlebih dahulu.', '{}', VAPID_PUBLIC), {
      headers: { 'Content-Type': 'text/html' },
    })
  }

  const db   = await getTenantDb(session.tenantSlug)
  const subs = await db.pushSubscription.findMany({ where: { tenant_slug: session.tenantSlug } })

  const info = JSON.stringify({ userId: session.userId, tenant: session.tenantSlug, name: session.name, subscriptions: subs.length }, null, 2)

  return new NextResponse(html('🔔 Push Debug', `Login: ${session.name} (${session.tenantSlug})`, info, VAPID_PUBLIC), {
    headers: { 'Content-Type': 'text/html' },
  })
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Tidak login' }, { status: 401 })

  const { endpoint, keys } = await req.json()
  if (!endpoint || !keys?.p256dh || !keys?.auth)
    return NextResponse.json({ error: 'Payload tidak valid', received: { endpoint: !!endpoint, p256dh: !!keys?.p256dh, auth: !!keys?.auth } }, { status: 400 })

  const db = await getTenantDb(session.tenantSlug)
  await db.pushSubscription.upsert({
    where:  { endpoint },
    create: { user_id: session.userId, tenant_slug: session.tenantSlug, endpoint, p256dh: keys.p256dh, auth: keys.auth },
    update: { p256dh: keys.p256dh, auth: keys.auth, user_id: session.userId },
  })

  return NextResponse.json({ success: true, savedFor: session.tenantSlug })
}

function html(title: string, subtitle: string, info: string, vapidKey: string) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Push Debug</title><style>
body{font-family:sans-serif;padding:16px;background:#f5f5f5}
h2{margin:0 0 4px}p{margin:0 0 16px;color:#666}
pre{background:#fff;padding:12px;border-radius:8px;font-size:12px;overflow:auto;white-space:pre-wrap;word-break:break-all}
button{background:#0ea5e9;color:#fff;border:none;padding:12px 20px;border-radius:8px;font-size:15px;width:100%;margin-bottom:8px;cursor:pointer}
button:disabled{background:#aaa}
.log{margin-top:6px;padding:10px;border-radius:8px;font-size:13px;line-height:1.6}
.ok{background:#d1fae5;color:#065f46}.err{background:#fee2e2;color:#991b1b}
</style></head><body>
<h2>${title}</h2><p>${subtitle}</p>
<pre>${info}</pre>
<button onclick="runTest()">▶ Jalankan Subscribe Test</button>
<div id="log"></div>
<script>
const VAPID='${vapidKey}'
function log(msg,ok){const d=document.getElementById('log');d.innerHTML+='<div class="log '+(ok===false?'err':'ok')+'">'+msg+'</div>'}
function b64(s){const p='='.repeat((4-s.length%4)%4);const b=(s+p).replace(/-/g,'+').replace(/_/g,'/');return new Uint8Array([...atob(b)].map(c=>c.charCodeAt(0)))}
async function runTest(){
  document.getElementById('log').innerHTML=''
  const btn=document.querySelector('button');btn.disabled=true
  try{
    log('1. ServiceWorker: '+('serviceWorker' in navigator))
    log('2. PushManager: '+('PushManager' in window))
    log('3. Notification.permission: '+Notification.permission)
    const reg=await navigator.serviceWorker.register('/sw.js')
    log('4. SW registered, active='+!!reg.active+' waiting='+!!reg.waiting+' installing='+!!reg.installing)

    // Paksa SW waiting untuk skip waiting jika ada
    if(reg.waiting){reg.waiting.postMessage({type:'SKIP_WAITING'});log('4b. Kirim SKIP_WAITING ke SW waiting')}
    if(reg.installing){log('4c. SW masih installing, tunggu...')}

    // Tunggu ready dengan timeout 8 detik
    const ready = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((_,reject)=>setTimeout(()=>reject(new Error('serviceWorker.ready timeout 8s — coba reload halaman')),8000))
    ])
    log('5. SW ready: '+ready.scope)
    if(Notification.permission!=='granted'){
      const p=await Notification.requestPermission()
      log('6. Permission: '+p,p==='granted')
      if(p!=='granted'){log('❌ Izin ditolak',false);btn.disabled=false;return}
    }else{log('6. Permission sudah granted ✅')}
    const ex=await ready.pushManager.getSubscription()
    if(ex){await ex.unsubscribe();log('7. Unsubscribe lama ✅')}else{log('7. Tidak ada sub lama')}
    const sub=await ready.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64(VAPID)})
    log('8. Subscribe OK: '+sub.endpoint.slice(0,70)+'...')
    const res=await fetch('/api/push/debug',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(sub.toJSON())})
    const json=await res.json()
    log('9. Simpan ke server: HTTP '+res.status+' → '+JSON.stringify(json),res.ok)
    if(res.ok)log('✅ SELESAI — push notification siap! Kirim WA test sekarang.',true)
    else log('❌ Gagal simpan',false)
  }catch(e){log('❌ ERROR di langkah di atas: '+e.message,false)}
  btn.disabled=false
}
</script></body></html>`
}
