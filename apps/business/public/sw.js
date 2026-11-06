// Only the offline shell is cached. Private API responses and stock writes are never cached or queued.
const CACHE='autoparts-shell-v3';
self.addEventListener('install', event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(['/icon.svg','/offline.html','/offline.css','/offline.js']))));
self.addEventListener('activate', event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key))))));
self.addEventListener('fetch', event=>{
 if(event.request.mode==='navigate')event.respondWith(fetch(event.request).catch(()=>caches.match('/offline.html')));
 else if(event.request.method==='GET' && new URL(event.request.url).origin===self.location.origin && ['/icon.svg','/offline.css','/offline.js'].includes(new URL(event.request.url).pathname))event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request)));
});
