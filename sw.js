// TECTOS·3D service worker — estrategia NETWORK-FIRST:
// online → siempre sirve la última versión y actualiza la caché;
// offline → sirve la última copia guardada. Así nunca te quedas con una
// versión antigua cuando hay conexión, pero sigue funcionando sin ella.
const CACHE='tectos3d-v2';
self.addEventListener('install',e=>{self.skipWaiting();});
self.addEventListener('activate',e=>{e.waitUntil((async()=>{
  const keys=await caches.keys(); await Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)));  // limpia cachés viejas
  await self.clients.claim();
})());});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  // El DOCUMENTO principal (index.html) se pide SIN caché HTTP del navegador/CDN → siempre la última.
  // Los demás recursos: fetch normal (network-first) con respaldo a caché.
  const isDoc = e.request.mode==='navigate' || e.request.destination==='document';
  const req = isDoc ? new Request(e.request.url, {cache:'no-store'}) : e.request;
  e.respondWith(
    fetch(req).then(r=>{
      try{const c=r.clone();caches.open(CACHE).then(cache=>cache.put(e.request,c));}catch(_){}
      return r;
    }).catch(()=>caches.match(e.request))
  );
});
