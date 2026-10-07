# Spec technique — Notifications push (PWA Split)

## 1. Faisabilité

Oui, une PWA peut recevoir des notifications push, même app fermée (standard **Web Push** : Push API + Notifications API + service worker).

| Plateforme | Support | Condition |
|---|---|---|
| Android (Chrome, Edge, Samsung Internet, Firefox) | ✅ complet | Permission accordée |
| iOS / iPadOS **16.4+** | ✅ | **Uniquement si Split est ajouté à l'écran d'accueil** (mode standalone) + permission demandée suite à un tap |
| iOS < 16.4 | ❌ | — |
| Desktop Chrome / Edge / Firefox / Safari 16+ | ✅ | Permission accordée |

Bonne nouvelle pour iOS : l'accès navigateur est déjà redirigé vers `/download`, donc les utilisateurs sont en mode installé = éligibles.

Limites à connaître :
- iOS exige qu'**une notification visible soit affichée pour chaque push reçu** (`userVisibleOnly`) ; sinon Safari peut révoquer l'abonnement.
- Pas de garantie à la seconde (le navigateur/OS peut retarder), mais en pratique < quelques secondes.
- La permission ne peut être demandée **qu'après un geste utilisateur** (tap), jamais au chargement.

## 2. Existant

- UI : cloche par match (`toggleMatchNotif`), réglages par jeu/région (`notifGames`, `matchNotifOverrides`) — **stockés seulement en `localStorage`, rien n'est envoyé**.
- Service worker servi : `Frontend/public/sw.js` (cache `split-v10`, réseau d'abord) — **aucun handler `push`**.
- ⚠️ `Frontend/sw.js` (racine, non déployé) importe `3nbf4.com` (régie de pub par push). **Ne pas l'activer** : un seul service worker par scope ; il prendrait la main sur les push et enverrait de la pub à nos utilisateurs.

## 3. Architecture

```
[App (PWA)] --subscribe--> [Backend /api/push/*] --stocke--> SQLite push_subscriptions
                                     |
                         worker 60s (setInterval) lit les matchs déjà en cache
                                     |
                              web-push (VAPID) --> FCM / Apple / Mozilla push service
                                     |
                         [public/sw.js] event "push" --> showNotification()
                                     |  tap
                         notificationclick --> ouvre/focus l'app sur le match
```

### 3.1 Clés VAPID

- Générer une fois : `npx web-push generate-vapid-keys`
- Variables Railway (backend-svc) : `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT=mailto:arthur.pro.busi@gmail.com`
- Ne jamais changer les clés ensuite (tous les abonnements deviendraient invalides).

### 3.2 Backend

Dépendance : `web-push`.

Nouveau fichier `Backend/push-store.js` (ESM, better-sqlite3, même `DB_PATH`) :

```sql
CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint   TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  user_agent TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  last_ok_at TEXT,
  fail_count INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions(user_id);

CREATE TABLE IF NOT EXISTS notif_prefs (
  user_id    TEXT PRIMARY KEY,
  prefs      TEXT NOT NULL DEFAULT '{}',   -- { games:{valorant:{on,regions}}, overrides:{matchId:bool}, kinds:{start,live,result,reminder} }
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS notif_sent (          -- anti-doublon
  user_id  TEXT NOT NULL,
  match_id TEXT NOT NULL,
  kind     TEXT NOT NULL,                        -- start | live | result | reminder
  sent_at  TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, match_id, kind)
);
```

Nouveau fichier `Backend/push-routes.js` (toutes protégées par `authMiddleware` sauf la clé publique) :

| Route | Rôle |
|---|---|
| `GET /api/push/public-key` | renvoie `VAPID_PUBLIC_KEY` |
| `POST /api/push/subscribe` | body = `PushSubscription.toJSON()` → upsert (endpoint unique, rattaché au `req.userId`) |
| `DELETE /api/push/subscribe` | body `{ endpoint }` → supprime (déconnexion, désactivation) |
| `GET/PUT /api/notif-prefs` | lit / écrit les préférences (remplace le `localStorage`, synchro multi-appareils comme les pronos) |
| `POST /api/push/test` | envoie une notif de test à l'utilisateur connecté |

`deleteUser()` doit aussi supprimer ses lignes `push_subscriptions` / `notif_prefs` / `notif_sent`.

### 3.3 Worker d'envoi

`Backend/push-worker.js`, démarré dans `app.listen` comme les autres workers. **Tourne en tâche de fond (setInterval 60 s), jamais dans un handler HTTP** (piège Railway n°1).

À chaque tick :
1. Lire les matchs **déjà en cache** (upcoming/live/results Valo, CS2, RL) — aucun appel PandaScore supplémentaire.
2. Pour chaque utilisateur ayant ≥ 1 abonnement, croiser avec ses prefs (`notif_prefs`) et ses pronos (`user_sync.predictions`).
3. Générer les événements (§4), filtrer ceux déjà dans `notif_sent`, envoyer, insérer dans `notif_sent`.
4. Envoi : `webpush.sendNotification(sub, JSON.stringify(payload), { TTL, urgency })`, concurrence limitée (5 en parallèle).
5. Réponse `404`/`410` → supprimer l'abonnement. Autre erreur → `fail_count++`, suppression au-delà de 10.

Plafond : **max 8 notifs / utilisateur / jour** (hors résultats de ses propres pronos).

### 3.4 Service worker (`Frontend/public/sw.js`)

Ajouter (et passer `CACHE_NAME` à `split-v11` pour forcer la mise à jour) :

```js
self.addEventListener("push", (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch {}
  event.waitUntil(self.registration.showNotification(d.title || "Split", {
    body: d.body || "",
    icon: "/split-logo-192.png",
    badge: "/split-logo-192.png",
    tag: d.tag,               // même tag = remplace la notif précédente du match
    renotify: !!d.renotify,
    data: { url: d.url || "/" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil((async () => {
    const wins = await clients.matchAll({ type: "window", includeUncontrolled: true });
    const win = wins.find((w) => new URL(w.url).origin === location.origin);
    if (win) { await win.focus(); win.postMessage({ type: "open-url", url }); }
    else await clients.openWindow(url);
  })());
});

self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil((async () => {
    const r = await fetch("/api/push/public-key").then((x) => x.json());
    const sub = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: r.key });
    // le token n'est pas accessible ici : l'app re-synchronise l'abonnement au prochain lancement (cf. 3.5)
  })());
});
```

### 3.5 Frontend (`App.jsx`)

- **Demande de permission** uniquement au tap : 1re cloche activée, ou toggle « Notifications » dans Réglages. Avant la demande système, un petit écran Split explique ce qu'on enverra (augmente fortement le taux d'acceptation, et un refus système est quasi définitif).
- Fonction `enablePush()` :
  1. `if (!("serviceWorker" in navigator) || !("PushManager" in window))` → message « non supporté ».
  2. iOS non installé (`!matchMedia("(display-mode: standalone)").matches`) → afficher « Ajoute Split à l'écran d'accueil ».
  3. `await Notification.requestPermission()` → si `denied`, afficher comment réactiver dans les réglages du téléphone.
  4. `reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) })`.
  5. `POST /api/push/subscribe` avec le token du compte.
- Au lancement (si permission `granted` et utilisateur connecté) : `getSubscription()` → re-POST (couvre les changements d'abonnement et les changements de compte).
- Déconnexion : `DELETE /api/push/subscribe` puis `subscription.unsubscribe()`.
- Préférences : `notifGames` / `matchNotifOverrides` passent par `/api/notif-prefs` (le serveur doit les connaître pour décider d'envoyer).
- Deep link : écouter `navigator.serviceWorker.onmessage` (`open-url`) et lire `?match=<id>&tab=<valorant|csgo|rocketleague>` au démarrage → ouvrir l'onglet et déplier la carte du match.

## 4. Catalogue des notifications (v1)

| Kind | Déclencheur | Destinataires | Exemple | TTL | tag |
|---|---|---|---|---|---|
| `start` | `begin_at - now ≤ 15 min` | cloche active sur le match **ou** prono posé | « NRG vs T1 commence dans 15 min — ton prono : 2-1 » | 15 min | `m-<id>` |
| `live` | statut passe à `running` | cloche active | « 🔴 NRG vs T1 est en LIVE » | 30 min | `m-<id>` |
| `result` | match `finished` + score série connu | utilisateurs avec un prono sur le match | « NRG 2-0 T1 — viens voir tes points » | 24 h | `r-<id>` |
| `reminder` (opt-in) | match dans 1 h, slots dispo, aucun prono | prefs `reminder` activée | « PR vs LOUD dans 1 h — il te reste 3 pronos » | 1 h | `p-<id>` |

Textes FR/EN via la langue enregistrée de l'utilisateur (à ajouter dans `notif_prefs`).

Pour `result`, ne jamais annoncer de points calculés côté serveur en v1 (le barème vit côté client) : renvoyer vers l'app.

## 5. Sécurité / vie privée

- L'endpoint d'abonnement est un secret : ne jamais le logger en clair.
- Abonnements rattachés au compte via le token (pas d'`userId` fourni par le client).
- Consentement = permission système + interrupteur dans Réglages pour tout couper.
- Suppression de compte → suppression des abonnements.

## 6. Plan d'implémentation

1. Clés VAPID + variables Railway.
2. `push-store.js`, `push-routes.js`, branchement dans `server.js`, `npm i web-push`.
3. `public/sw.js` : handlers `push` / `notificationclick` / `pushsubscriptionchange`, cache `split-v11`.
4. Frontend : `enablePush()`, écran d'explication, synchro des prefs, deep link, déconnexion.
5. `POST /api/push/test` → valider sur Android Chrome, iPhone (PWA installée, iOS 17+), desktop.
6. `push-worker.js` avec `start` + `live` + `result`, puis `reminder` en opt-in.

## 7. Tests

- Android Chrome : app fermée → notif reçue, tap → ouvre le bon match.
- iPhone PWA installée : demande au tap, notif reçue verrouillé, tap → bon match.
- iPhone dans Safari (non installé) → message « Ajoute à l'écran d'accueil », aucune demande système.
- Permission refusée → message de réactivation, aucune erreur.
- Deux appareils sur le même compte → les deux reçoivent ; déconnexion d'un seul → il ne reçoit plus.
- Abonnement expiré (410) → supprimé en base au premier envoi.
- Pas de doublon après redémarrage du backend (table `notif_sent`).
