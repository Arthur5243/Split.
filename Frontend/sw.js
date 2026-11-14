// Monetag push pub DESACTIVE. Ce fichier existait pour satisfaire la verif
// Monetag ; on garde un stub inerte pour ne pas casser une eventuelle
// requete vers /sw.js en racine. Le vrai service worker de l'app est
// Frontend/public/sw.js (copie dans dist/sw.js au build).
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
