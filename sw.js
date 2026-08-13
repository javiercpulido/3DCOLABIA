// TECTOS·3D service worker — estrategia NETWORK-FIRST:
// online → siempre sirve la última versión y actualiza la caché;
// offline → sirve la última copia guardada. Así nunca te quedas con una
// versión antigua cuando hay conexión, pero sigue funcionando sin ella.
const CACHE='tectos3d-v1';
self.addEventListener('install',e=>{self.skipWaiting();});
self.addEventListener('activate',e=>{e.waitUntil(self.clients.claim());});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  e.respondWith(
    fetch(e.request).then(r=>{
      try{const c=r.clone();caches.open(CACHE).then(cache=>cache.put(e.request,c));}catch(_){}
      return r;
    }).catch(()=>caches.match(e.request))
  );
});
