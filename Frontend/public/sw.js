const CACHE_NAME = "split-v7";

const OFFLINE_PAGE = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no">
<title>Split — Hors connexion</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{height:100%;background:#060607;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#fff}
body{display:flex;align-items:center;justify-content:center;text-align:center;padding:24px}
.wrap{max-width:320px}
.icon{font-size:48px;margin-bottom:24px;opacity:0.6}
h1{font-size:20px;font-weight:700;margin-bottom:12px}
p{font-size:14px;color:#888;line-height:1.5;margin-bottom:24px}
button{background:#C5F90F;color:#060607;border:none;border-radius:12px;padding:14px 32px;font-size:15px;font-weight:700;cursor:pointer}
button:active{opacity:0.8}
</style>
</head>
<body>
<div class="wrap">
<div class="icon">📡</div>
<h1>Pas de connexion</h1>
<p>Active ton réseau mobile ou connecte-toi à un Wi-Fi pour utiliser Split.</p>
<button onclick="location.reload()">Réessayer</button>
</div>
</body>
</html>`;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.put(new Request("/_offline"), new Response(OFFLINE_PAGE, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      }))
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  if (request.url.includes("/api/")) {
    event.respondWith(
      fetch(request).catch(() =>
        new Response(JSON.stringify({ error: "offline" }), {
          headers: { "Content-Type": "application/json" },
        })
      )
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/_offline")));
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});
