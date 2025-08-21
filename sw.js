const CACHE = 'cccg-cache-v6';
const ASSETS = [
  './',
  './index.html',
  './styles/main.css',
  './scripts/main.js',
  './scripts/helpers.js',
  './scripts/storage.js',
  './scripts/users.js',
  './ccccg.pdf',
  // background and other images
  './images/Dark.PNG',
  './images/Light.PNG',
  './images/High Contrast.PNG',
  './images/Forest.PNG',
  './images/Ocean.PNG',
  './images/Mutant.PNG',
  './images/Enhanced Human.PNG',
  './images/Magic User.PNG',
  './images/Alien:Extraterrestrial.PNG',
  './images/Mystical Being.PNG',
  './images/Logo.png'
];
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  const { request } = e;
  if (request.method !== 'GET' || new URL(request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(request)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(cache => cache.put(request, copy));
        return res;
      })
      .catch(() => caches.match(request))
  );
});
