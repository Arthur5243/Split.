/**
 * Sofascore scraper CS2 — API JSON publique de sofascore.com.
 *
 * Endpoints utilisés (dans l'ordre) :
 *   1. GET /api/v1/sport/esports/events/live
 *      → events e-sports live tous jeux confondus. Souvent vide (Sofascore
 *      considère "live" uniquement les events avec un flux vidéo intégré).
 *   2. GET /api/v1/sport/esports/scheduled-events/{YYYY-MM-DD}
 *      → TOUS les events e-sports du jour (finished, inprogress, notstarted).
 *      Bien plus fiable que /live : on filtre côté nous par category=csgo
 *      et status.type=inprogress pour extraire les matchs CS2 en cours.
 *
 * Structure event CS2 :
 *   {
 *     tournament.category.slug: "csgo",
 *     status.type: "inprogress" | "finished" | "notstarted",
 *     homeTeam.name, awayTeam.name,
 *     homeScore.current (série),
 *     homeScore.period1..5 (score par map),
 *     awayScore idem
 *   }
 *
 * Cloudflare/IP block :
 *   Sofascore renvoie 403 à toute IP datacenter (Railway compris) et à la
 *   plupart des IPs résidentielles sans navigateur réel. On passe donc par
 *   browserless (vrai Chromium avec fingerprint TLS résidentiel) via
 *   BROWSERLESS_URL/_TOKEN. Fallback fetch direct pour dev local uniquement.
 */

const SOFA_LIVE_URL = "https://api.sofascore.com/api/v1/sport/esports/events/live";
const BROWSERLESS_URL = (process.env.BROWSERLESS_URL || "").replace(/\/$/, "");
const BROWSERLESS_TOKEN = process.env.BROWSERLESS_TOKEN || "";

const POLL_INTERVAL_MS = 60_000;
const TTL_MS = 5 * 60 * 1000;

// Cache indexé par (team1|team2 normalisés)
const cache = new Map();

function normalize(s) {
  return (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\b(cs|cs2|csgo|esports?|gaming|team|esport|club|academy)\b/g, "")
    .trim()
    .replace(/[^a-z0-9]/g, "");
}

function todayIsoUtc() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function yesterdayIsoUtc() {
  const d = new Date(Date.now() - 86400000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Fetch JSON via browserless — approche "fetch depuis le contexte du site".
//
// Un appel direct à api.sofascore.com renvoie 403 challenge Cloudflare même
// via browserless (l'API bloque toute requête sans les cookies + JS check
// obtenus en visitant la page principale).
//
// Solution : browserless /function exécute un script Puppeteer qui :
//   1. Visite https://www.sofascore.com/esports (obtient les cookies visitor)
//   2. Depuis le contexte de la page (même origine, cookies présents), fait
//      le fetch de l'API JSON. Cloudflare voit une requête légitime.
//   3. Retourne le JSON parsé.
async function fetchJsonViaBrowserless(url) {
  if (!BROWSERLESS_URL || !BROWSERLESS_TOKEN) {
    // Fallback direct — probablement 403 mais utile en dev local
    const r = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128",
        Origin: "https://www.sofascore.com",
        Referer: "https://www.sofascore.com/",
      },
    });
    if (!r.ok) throw new Error(`sofa direct HTTP ${r.status}`);
    return r.json();
  }

  const endpoint = `${BROWSERLESS_URL}/function?token=${encodeURIComponent(BROWSERLESS_TOKEN)}`;
  // V3: naviguer directement vers l'URL API après avoir chargé les cookies
  // de la home. Chromium émet une vraie requête HTTP avec cookies + UA legit,
  // sans passer par un fetch cross-origin (qui déclenche CORS challenge).
  const fnCode = `
    export default async ({ page, context }) => {
      const { apiUrl } = context;
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36');
      await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });

      // Étape 1: visite la home Sofascore pour laisser Cloudflare poser
      // les cookies visitor (challenge JS peut prendre 2-3s).
      await page.goto('https://www.sofascore.com/esports', {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      await new Promise(r => setTimeout(r, 3500));

      // Étape 2: navigate direct vers l'API. Chromium fait un vrai GET
      // avec cookies + UA legit. Pas de check CORS car c'est une navigation
      // top-level, pas un fetch XHR.
      const resp = await page.goto(apiUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      const status = resp ? resp.status() : 0;
      // Le body JSON est wrappé par Chromium dans <pre>. On récupère le texte brut.
      const bodyText = await page.evaluate(() => {
        const pre = document.querySelector('pre');
        return pre ? pre.textContent : document.body.innerText;
      });
      return { data: { status, body: bodyText }, type: 'application/json' };
    };
  `;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: fnCode, context: { apiUrl: url } }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`browserless /function HTTP ${res.status}: ${t.slice(0, 200)}`);
  }
  const wrap = await res.json();
  const result = wrap?.data || wrap;
  if (!result || result.status !== 200) {
    throw new Error(`sofa navigate HTTP ${result?.status}, body preview: ${String(result?.body).slice(0, 200)}`);
  }
  try {
    return JSON.parse(result.body);
  } catch (e) {
    throw new Error(`sofa JSON parse (navigate) failed: ${e.message}, body preview: ${String(result.body).slice(0, 300)}`);
  }
}

function eventToMapScores(ev, requestedTeam1Name) {
  const hs = ev.homeScore || {};
  const as = ev.awayScore || {};
  const homeIsTeam1 =
    normalize(ev.homeTeam?.name || "") === normalize(requestedTeam1Name || "") ||
    normalize(ev.homeTeam?.name || "").includes(normalize(requestedTeam1Name || "")) ||
    normalize(requestedTeam1Name || "").includes(normalize(ev.homeTeam?.name || ""));
  const maps = [];
  for (let i = 1; i <= 5; i++) {
    const h = hs[`period${i}`];
    const a = as[`period${i}`];
    if (h == null && a == null) break;
    // 0-0 après une map jouée = map à venir (TBD), on arrête
    if ((h || 0) === 0 && (a || 0) === 0 && maps.length > 0) break;
    maps.push({
      map: `Map ${i}`,
      score1: homeIsTeam1 ? (h || 0) : (a || 0),
      score2: homeIsTeam1 ? (a || 0) : (h || 0),
    });
  }
  return maps;
}

function isCS2(ev) {
  const cat =
    ev.tournament?.category?.slug ||
    ev.tournament?.uniqueTournament?.category?.slug ||
    ev.tournament?.category?.name?.toLowerCase();
  return cat === "csgo" || cat === "cs2" || cat === "counter-strike" || cat === "counter-strike 2";
}

function isInProgress(ev) {
  const t = ev.status?.type || ev.status?.description?.toLowerCase();
  return t === "inprogress" || t === "in progress" || t === "started" || t === "1st half" || t === "2nd half" || t === "live";
}

function indexEvent(ev) {
  const t1 = ev.homeTeam?.name;
  const t2 = ev.awayTeam?.name;
  if (!t1 || !t2) return;
  const maps = eventToMapScores(ev, t1);
  const key = normalize(t1) + "|" + normalize(t2);
  cache.set(key, {
    team1: t1,
    team2: t2,
    seriesScore: { a: ev.homeScore?.current || 0, b: ev.awayScore?.current || 0 },
    mapScores: maps,
    tournament: ev.tournament?.name,
    status: ev.status?.type,
    scrapedAt: Date.now(),
  });
}

async function refreshLive() {
  const t0 = Date.now();
  let liveCount = 0;
  let dayCount = 0;
  let indexedCS2 = 0;

  // 1) /live — souvent vide mais gratuit à essayer
  try {
    const data = await fetchJsonViaBrowserless(SOFA_LIVE_URL);
    const events = Array.isArray(data?.events) ? data.events : [];
    liveCount = events.length;
    for (const ev of events) {
      if (!isCS2(ev)) continue;
      indexEvent(ev);
      indexedCS2++;
    }
  } catch (e) {
    console.log(`[sofascore] /live erreur: ${e.message}`);
  }

  // 2) /scheduled-events/{today} — bien plus fiable, contient TOUS les events du jour
  const today = todayIsoUtc();
  try {
    const url = `https://api.sofascore.com/api/v1/sport/esports/scheduled-events/${today}`;
    const data = await fetchJsonViaBrowserless(url);
    const events = Array.isArray(data?.events) ? data.events : [];
    dayCount = events.length;
    let cs2Today = 0;
    for (const ev of events) {
      if (!isCS2(ev)) continue;
      cs2Today++;
      if (isInProgress(ev) || isCS2Recent(ev)) {
        indexEvent(ev);
        indexedCS2++;
      }
    }
    // Log détaillé: structure du JSON reçu quand 0 events (aide à savoir si
    // Sofascore renvoie un vrai {events:[]}, un {code:403}, ou une page HTML).
    if (dayCount === 0) {
      const keys = data && typeof data === "object" ? Object.keys(data).slice(0, 10).join(",") : "non-objet";
      const preview = JSON.stringify(data).slice(0, 300);
      console.log(`[sofascore] scheduled-events/${today} → 0 events. Keys reçues: [${keys}]. JSON preview: ${preview}`);
    } else {
      console.log(`[sofascore] scheduled-events/${today} → ${dayCount} events, ${cs2Today} CS2 total`);
    }
  } catch (e) {
    console.log(`[sofascore] /scheduled-events/${today} erreur: ${e.message}`);
  }

  // 3) fallback : /scheduled-events/{hier} pour matchs qui débordent minuit UTC
  const yesterday = yesterdayIsoUtc();
  try {
    const url = `https://api.sofascore.com/api/v1/sport/esports/scheduled-events/${yesterday}`;
    const data = await fetchJsonViaBrowserless(url);
    const events = Array.isArray(data?.events) ? data.events : [];
    for (const ev of events) {
      if (!isCS2(ev)) continue;
      if (isInProgress(ev)) {
        indexEvent(ev);
        indexedCS2++;
      }
    }
  } catch {}

  console.log(
    `[sofascore] refresh → /live=${liveCount}, /day=${dayCount}, CS2 indexés=${indexedCS2}, cache=${cache.size} (${Date.now() - t0}ms)`
  );

  // Purge stale
  const now = Date.now();
  for (const [k, v] of cache) if (now - v.scrapedAt > TTL_MS) cache.delete(k);
}

// Un event CS2 qui vient de finir dans les 15 dernières minutes → on l'indexe
// aussi (utile pour /api/cs2-results qui rappelle sofascore juste après la fin).
function isCS2Recent(ev) {
  const endMs = ev.endTimestamp ? ev.endTimestamp * 1000 : null;
  if (!endMs) return false;
  return Date.now() - endMs < 15 * 60 * 1000;
}

/**
 * Cherche un match CS2 dans le cache sofascore.
 * Renvoie { mapScores, seriesScore, source: "sofascore" } ou null.
 */
export function getSofascoreMatch(team1Name, team2Name) {
  const q1 = normalize(team1Name);
  const q2 = normalize(team2Name);
  for (const entry of cache.values()) {
    const t1 = normalize(entry.team1);
    const t2 = normalize(entry.team2);
    const match1 = t1 === q1 || t1.includes(q1) || q1.includes(t1);
    const match2 = t2 === q2 || t2.includes(q2) || q2.includes(t2);
    const swap1 = t1 === q2 || t1.includes(q2) || q2.includes(t1);
    const swap2 = t2 === q1 || t2.includes(q1) || q1.includes(t2);
    if ((match1 && match2) || (swap1 && swap2)) {
      const swap = swap1 && swap2;
      return {
        mapScores: entry.mapScores.map((mp) =>
          swap ? { map: mp.map, score1: mp.score2, score2: mp.score1 } : mp
        ),
        seriesScore: swap
          ? { a: entry.seriesScore.b, b: entry.seriesScore.a }
          : entry.seriesScore,
        source: "sofascore",
      };
    }
  }
  return null;
}

export function startSofascoreWorker() {
  console.log(
    `[sofascore] worker démarré, poll ${POLL_INTERVAL_MS / 1000}s via ${BROWSERLESS_URL ? "browserless" : "fetch direct"}`
  );
  async function loop() {
    try { await refreshLive(); } catch (e) { console.error("[sofascore] loop:", e.message); }
    setTimeout(loop, POLL_INTERVAL_MS);
  }
  setTimeout(loop, 8_000);
}
