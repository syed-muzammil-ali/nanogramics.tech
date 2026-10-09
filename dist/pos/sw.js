const CACHE_NAME = 'nanogramics-pos-v3';
const ASSET_VERSION = '3';
const APP_SHELL = [
  '/pos/',
  '/pos/index.html',
  '/pos/manifest.webmanifest',
  '/pos/css/style.css',
  '/pos/css/professional.css',
  '/pos/css/branding.css',
  '/pos/css/riders.css',
  '/pos/js/utils.js',
  '/pos/js/thermalReceipt.js',
  '/pos/js/barcode.js',
  '/pos/js/api.js',
  '/pos/js/auth.js',
  '/pos/js/inventory.js',
  '/pos/js/shop.js',
  '/pos/js/riders.js',
  '/pos/js/sales.js',
  '/pos/js/wholesale.js',
  '/pos/js/reports.js',
  '/pos/js/online.js',
  '/pos/js/returns.js',
  '/pos/js/exchange.js',
  '/pos/js/audit.js',
  '/pos/js/settings.js',
  '/pos/js/ui.js',
  '/pos/js/app.js',
  '/pos/assets/branding/nanogramics-icon.png',
  '/pos/assets/branding/nanogramics-mask.png'
];

self.addEventListener('install', event => {
  const versionedShell = APP_SHELL.map(url => /\.(?:css|js)$/.test(url) ? `${url}?v=${ASSET_VERSION}` : url);
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(versionedShell)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then(response => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put('/pos/index.html', copy));
      return response;
    }).catch(() => caches.match('/pos/index.html')));
    return;
  }
  event.respondWith(fetch(request).then(response => {
    if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
    return response;
  }).catch(() => caches.match(request)));
});
