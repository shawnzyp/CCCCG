// Bump cache version whenever the pre-cached asset list changes so clients
// pick up the latest files on next load.
const CACHE = 'cccg-cache-v13';
const ASSETS = [
  './',
  './index.html',
  './styles/main.css',
  './scripts/main.js',
  './scripts/helpers.js',
  './scripts/funTips.js',
  './scripts/storage.js',
  './scripts/faction.js',
  // Additional scripts required for offline operation
  './scripts/characters.js',
  './scripts/modal.js',
  './codex-character.json',
  './codex-gear-class.json',
  './codex-gear-universal.json',
  './ruleshelp.txt',
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
  './images/LOGO.PNG'
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
  if (request.method !== 'GET') return;

  const notifyClient = () => {
    if (e.clientId) {
      self.clients.get(e.clientId).then(client => {
        if (client) client.postMessage('cacheCloudSaves');
      });
    }
  };

  if (request.mode === 'navigate') {
    e.respondWith(
      fetch(request)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(cache => cache.put(request, copy));
          notifyClient();
          return res;
        })
        .catch(() =>
          caches.match(request).then(res => {
            notifyClient();
            return res;
          })
        )
    );
    return;
  }

  if (new URL(request.url).origin !== location.origin) return;
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
