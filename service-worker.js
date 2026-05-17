// ===== Service Worker — تخزين ذكي للأصول =====
// استراتيجية: cache-first للأصول الثابتة، network-first للبيانات الديناميكية
// زيّد الـ VERSION عند كل deploy لإجبار المتصفح على تحديث الكاش

const VERSION = 'v1.0.0';
const STATIC_CACHE = `devastock-static-${VERSION}`;
const RUNTIME_CACHE = `devastock-runtime-${VERSION}`;

// الأصول الأساسية اللي نخزنها فور تثبيت الـ SW
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './css/main.css',
  './css/home.css',
  './css/menu.css',
  './js/main.js',
];

// install — حمّل الـ precache
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(PRECACHE_URLS).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

// activate — احذف الكاشات القديمة
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== STATIC_CACHE && k !== RUNTIME_CACHE)
            .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// fetch — استراتيجية مختلفة حسب نوع الطلب
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // 1) Firebase / Google APIs / Firestore — مرّر مباشرة (network only)
  if (url.hostname.includes('firebase') ||
      url.hostname.includes('googleapis.com') ||
      url.hostname.includes('gstatic.com') ||
      url.hostname.includes('google.com')) {
    return; // لا تتدخل
  }

  // 2) أصول ثابتة (نفس النطاق) — cache-first مع تحديث في الخلفية (stale-while-revalidate)
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then(cached => {
        const networkFetch = fetch(request).then(response => {
          if (response.ok && response.status === 200) {
            const clone = response.clone();
            caches.open(RUNTIME_CACHE).then(cache => cache.put(request, clone));
          }
          return response;
        }).catch(() => cached);
        return cached || networkFetch;
      })
    );
    return;
  }

  // 3) فونتس Google + مكتبات CDN (مثل Phaser) — cache-first طويل الأمد
  if (url.hostname.includes('fonts.gstatic.com') ||
      url.hostname.includes('fonts.googleapis.com') ||
      url.hostname.includes('cdn.jsdelivr.net') ||
      url.hostname.includes('unpkg.com')) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(RUNTIME_CACHE).then(cache => cache.put(request, clone));
          }
          return response;
        }).catch(() => cached);
      })
    );
  }
});

// رسالة للـ client لتحديث الـ SW يدوياً
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
