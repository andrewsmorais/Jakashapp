// Service worker do Jakash. Só guarda arquivos estáticos; nunca dados financeiros, API ou Supabase.
const VERSION = "jakash-v2";
const STATIC = ["/offline.html", "/icon-192.png", "/icon-512.png", "/logo.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(STATIC)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Supabase e outros domínios passam direto
  if (url.pathname.startsWith("/api/")) return;

  // Páginas: rede primeiro; sem internet mostra a página offline.
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match("/offline.html")));
    return;
  }

  // Estáticos do Next e imagens: cache primeiro.
  if (url.pathname.startsWith("/_next/static/") || /\.(png|jpg|jpeg|svg|webp|ico|woff2?)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
        return res;
      }))
    );
  }
});

// ---- Lembretes (push web) ----
// O servidor envia JSON { title, body, url, tag }. Nada financeiro além do resumo do vencimento trafega aqui.
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { body: event.data ? event.data.text() : "" }; }
  event.waitUntil(
    self.registration.showNotification(data.title || "Jakash", {
      body: data.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: data.tag || "jakash",
      data: { url: data.url || "/dashboard" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    // Só abre páginas do próprio Jakash.
    let target = new URL("/dashboard", self.location.origin).href;
    try {
      const u = new URL((event.notification.data && event.notification.data.url) || "/dashboard", self.location.origin);
      if (u.origin === self.location.origin) target = u.href;
    } catch (e) { /* mantém o padrão */ }

    const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of list) {
      if (c.url.startsWith(self.location.origin) && "focus" in c) {
        await c.focus();
        if ("navigate" in c) { try { await c.navigate(target); } catch (e) { /* segue na página atual */ } }
        return;
      }
    }
    await self.clients.openWindow(target);
  })());
});

// O navegador pode trocar a inscrição sozinho: renova e avisa o servidor.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil((async () => {
    try {
      const key = event.oldSubscription && event.oldSubscription.options && event.oldSubscription.options.applicationServerKey;
      if (!key) return;
      const sub = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      await fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify(sub.toJSON()) });
    } catch (e) { /* o usuário pode reativar em Notificações */ }
  })());
});
