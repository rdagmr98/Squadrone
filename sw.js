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

// Web Push (inviato da push/notify.mjs nell'Action di squadrone-data): arriva anche ad app chiusa
self.addEventListener("push", e => {
  const d = e.data ? e.data.json() : {};
  e.waitUntil(self.registration.showNotification(d.title || "Squadrone H7", { body: d.body || "", icon: "icons/icon-192.png" }));
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true })
    .then(l => (l[0] ? l[0].focus() : clients.openWindow("./"))));
});
