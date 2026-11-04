// Only the offline shell is cached. Private API responses and stock writes are never cached or queued.
const CACHE='autoparts-shell-v2';
self.addEventListener('install', event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(['/icon.svg','/offline.html','/offline.css','/offline.js']))));
self.addEventListener('activate', event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key))))));
self.addEventListener('fetch', event=>{if(event.request.mode==='navigate') event.respondWith(fetch(event.request).catch(()=>caches.match('/offline.html')));});
