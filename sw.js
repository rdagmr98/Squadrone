// ponytail: network-first sul solo guscio same-origin: aggiornamenti immediati, cache solo come fallback offline.
// I dati (api.github.com) non passano di qui.
const C = "sq-shell";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", e => {
  const r = e.request;
  if (r.method !== "GET" || new URL(r.url).origin !== location.origin) return;
  e.respondWith(fetch(r).then(res => {
    const copy = res.clone();
    caches.open(C).then(c => c.put(r, copy));
    return res;
  }).catch(() => caches.match(r)));
});
