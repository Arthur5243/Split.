/**
 * Sofascore scraper CS2 — utilise l'API JSON publique de sofascore.com.
 *
 * Endpoint clé:
 *   GET https://api.sofascore.com/api/v1/sport/esports/events/live
 *   → renvoie tous les events e-sports live, tous jeux confondus.
 *   Filtrage: tournament.category.slug === "csgo" pour CS2.
 *
 * Structure event CS2:
 *   {
 *     id, bestOf, status.description,
 *     homeTeam.name, awayTeam.name,
 *     homeScore.current (série),
 *     homeScore.period1, period2, period3, period4, period5 (score par map),
 *     awayScore idem
 *   }
 *
 * Rate limit: sofascore bloque les IPs datacenter (Railway = 403 direct).
 * Solution: passer par le service browserless du projet Railway (vrai
 * Chromium sur une session TLS "propre"). Fallback fetch direct pour dev
 * local uniquement.
 */

const SOFA_LIVE_URL = "https://api.sofascore.com/api/v1/sport/esports/events/live";
const BROWSERLESS_URL = (process.env.BROWSERLESS_URL || "").replace(/\/$/, "");
const BROWSERLESS_TOKEN = process.env.BROWSERLESS_TOKEN || "";

const POLL_INTERVAL_MS = 60_000; // 60s : bien couvert vu qu'un match CS2 dure ~30-45min par map
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

// Fetch JSON via browserless (bypass block IP datacenter).
// Browserless /content POST { url } charge la page/URL et retourne le HTML/body.
// Pour une API JSON, le body de <pre> contient le JSON brut.
async function fetchJsonViaBrowserless(url) {
  if (!BROWSERLESS_URL || !BROWSERLESS_TOKEN) {
    // Fallback direct — probablement 403 en prod Railway mais utile en dev
    const r = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128",
        Origin: "https://www.sofascore.com",
        Referer: "https://www.sofascore.com/",
      },
    });
    if (!r.ok) throw new Error(`sofa HTTP ${r.status}`);
    return r.json();
  }
  const endpoint = `${BROWSERLESS_URL}/content?token=${encodeURIComponent(BROWSERLESS_TOKEN)}`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      gotoOptions: { waitUntil: "domcontentloaded", timeout: 45000 },
      waitForTimeout: 2000,
      bestAttempt: true,
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`browserless HTTP ${res.status} for sofa: ${t.slice(0, 200)}`);
  }
  const html = await res.text();
  // Chromium enveloppe les JSON dans <html><body><pre>...</pre></body></html>.
  // On extrait le contenu du <pre>.
  const preMatch = html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
  const raw = preMatch ? preMatch[1] : html;
  // Décodage minimal des entités HTML les plus courantes
  const decoded = raw.replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&#34;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  try {
    return JSON.parse(decoded);
  } catch (e) {
    throw new Error(`sofa: JSON parse failed (${e.message}), preview: ${decoded.slice(0, 200)}`);
  }
}

function eventToMapScores(ev, requestedTeam1Name) {
  const hs = ev.homeScore || {};
  const as = ev.awayScore || {};
  const homeIsTeam1 = normalize(ev.homeTeam?.name || "") === normalize(requestedTeam1Name || "") ||
    normalize(ev.homeTeam?.name || "").includes(normalize(requestedTeam1Name || "")) ||
    normalize(requestedTeam1Name || "").includes(normalize(ev.homeTeam?.name || ""));
  const maps = [];
  for (let i = 1; i <= 5; i++) {
    const h = hs[`period${i}`];
    const a = as[`period${i}`];
    if (h == null && a == null) break;
    // Ignore les maps où les 2 scores sont 0 ET qui viennent après une map jouée
    // (indique une map non encore jouée / prévue mais TBD). Garde 0-0 pour la
    // map en cours si c'est la 1ère.
    if ((h || 0) === 0 && (a || 0) === 0 && maps.length > 0) break;
    maps.push({
      map: `Map ${i}`,
      score1: homeIsTeam1 ? (h || 0) : (a || 0),
      score2: homeIsTeam1 ? (a || 0) : (h || 0),
    });
  }
  return maps;
}

async function refreshLive() {
  try {
    const data = await fetchJsonViaBrowserless(SOFA_LIVE_URL);
    const events = data?.events || [];
    let cs2Count = 0;
    for (const ev of events) {
      const cat = ev.tournament?.category?.slug || ev.tournament?.uniqueTournament?.category?.slug;
      if (cat !== "csgo") continue;
      cs2Count++;
      const t1 = ev.homeTeam?.name;
      const t2 = ev.awayTeam?.name;
      if (!t1 || !t2) continue;
      const maps = eventToMapScores(ev, t1);
      const key = normalize(t1) + "|" + normalize(t2);
      cache.set(key, {
        team1: t1,
        team2: t2,
        seriesScore: { a: ev.homeScore?.current || 0, b: ev.awayScore?.current || 0 },
        mapScores: maps,
        tournament: ev.tournament?.name,
        scrapedAt: Date.now(),
      });
    }
    console.log(`[sofascore] refresh → ${events.length} events, ${cs2Count} CS2 (cache: ${cache.size})`);
  } catch (e) {
    console.log(`[sofascore] erreur: ${e.message}`);
  }
  // Purge stale
  const now = Date.now();
  for (const [k, v] of cache) if (now - v.scrapedAt > TTL_MS) cache.delete(k);
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
  console.log(`[sofascore] worker démarré, poll ${POLL_INTERVAL_MS / 1000}s via ${BROWSERLESS_URL ? "browserless" : "fetch direct"}`);
  async function loop() {
    try { await refreshLive(); } catch (e) { console.error("[sofascore] loop:", e.message); }
    setTimeout(loop, POLL_INTERVAL_MS);
  }
  setTimeout(loop, 8_000);
}
