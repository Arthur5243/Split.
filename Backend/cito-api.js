/**
 * Cito API CS2 — vrais scores round-level en direct (13-x par map).
 *
 * API officielle citoapi.com, Free tier = 500 req/mois, 10 req/min, 60s delay
 * sur live data. Auth: header x-api-key.
 *
 * Structure de la réponse GET /cs2/live :
 *   {
 *     success: true,
 *     data: [{
 *       matchId, status: "live",
 *       team1Name, team2Name,
 *       score: {team1: 1, team2: 0},              // score série
 *       currentMapScore: {team1: 13, team2: 2},    // map en cours (rounds)
 *       currentMap: "de_anubis",
 *       currentRound: 15,
 *       currentScoreCt: 2, currentScoreT: 13,     // par side CT/T
 *       liveDataAvailable: true
 *     }, ...]
 *   }
 *
 * Budget quota : on poll uniquement quand cs2-routes détecte au moins un
 * match live via PandaScore. À 3 min de poll pendant un match ~2h = 40 req.
 * ~10 matchs CS2 significatifs/jour = 400 req/mois ≤ 500 free tier.
 */

const CITO_API_BASE = (process.env.CITO_API_BASE || "https://api.citoapi.com/api/v1").replace(/\/$/, "");
const CITO_API_KEY = process.env.CITO_API_KEY || "";

const POLL_INTERVAL_MS = 3 * 60 * 1000;   // 3 min entre chaque poll (budget)
const TTL_MS = 5 * 60 * 1000;              // Cache 5 min (le poll rafraîchit)
const BOOT_DELAY_MS = 10_000;
const MIN_POLL_INTERVAL_MS = 90_000;       // Garde-fou anti-spam si appel manuel

// Cache indexé par team1|team2 normalisés
const cache = new Map();
let lastPollAt = 0;
// Flag maintenu par cs2-routes.js: true si au moins un match CS2 live détecté
// via PandaScore. Sans matchs live, on skip le poll pour économiser le quota.
let hasLiveMatches = false;

function normalize(s) {
  return (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function mapNameClean(raw) {
  return (raw || "").replace(/^de_/, "").replace(/^\w/, (c) => c.toUpperCase());
}

async function refreshLive() {
  if (!CITO_API_KEY) {
    console.log("[cito-api] CITO_API_KEY non définie, worker inactif");
    return;
  }
  if (!hasLiveMatches) {
    // Rien à poller : pas de match live → économise le quota Free plan
    return;
  }
  const now = Date.now();
  if (now - lastPollAt < MIN_POLL_INTERVAL_MS) return;
  lastPollAt = now;

  try {
    const res = await fetch(`${CITO_API_BASE}/cs2/live`, {
      headers: { "x-api-key": CITO_API_KEY, Accept: "application/json" },
    });
    if (res.status === 503) {
      const body = await res.json().catch(() => ({}));
      console.log(`[cito-api] 503 warmup: ${body?.error?.message || "delayed data"}`);
      return;
    }
    if (res.status === 429) {
      console.log("[cito-api] 429 rate limit atteint, pause 10 min");
      lastPollAt = Date.now() + 10 * 60 * 1000;
      return;
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.log(`[cito-api] HTTP ${res.status}: ${body.slice(0, 200)}`);
      return;
    }
    const data = await res.json();
    const events = Array.isArray(data?.data) ? data.data : [];
    let indexed = 0;
    for (const ev of events) {
      const t1 = ev.team1Name;
      const t2 = ev.team2Name;
      if (!t1 || !t2) continue;

      // Reconstitue les mapScores : maps terminées (série remontée dans score)
      // + map en cours (currentMapScore). L'API ne renvoie pas l'historique
      // détaillé par map dans /live — pour ça il faut /cs2/live/{id}/state
      // (coût 1 req supplémentaire par match). On se contente du live actuel.
      const s1 = ev.score?.team1 ?? 0;
      const s2 = ev.score?.team2 ?? 0;
      const maps = [];
      // Reconstitue les maps déjà finies (13-x approximatif pour rester
      // simple : le point clé est que la MAP EN COURS a le vrai score exact)
      for (let i = 0; i < s1 + s2; i++) {
        if (i < s1) maps.push({ map: `Map ${i + 1}`, score1: 13, score2: 0 });
        else maps.push({ map: `Map ${i + 1}`, score1: 0, score2: 13 });
      }
      // Ajoute la map en cours avec son vrai score
      if (ev.currentMapScore) {
        maps.push({
          map: mapNameClean(ev.currentMap) || `Map ${maps.length + 1}`,
          score1: ev.currentMapScore.team1 ?? 0,
          score2: ev.currentMapScore.team2 ?? 0,
        });
      }

      const key = normalize(t1) + "|" + normalize(t2);
      cache.set(key, {
        team1: t1, team2: t2,
        seriesScore: { a: s1, b: s2 },
        mapScores: maps,
        currentMap: ev.currentMap,
        currentRound: ev.currentRound,
        scrapedAt: Date.now(),
      });
      indexed++;
    }
    // Rate-limit header check
    const monthlyRem = res.headers.get("x-ratelimit-monthly-remaining");
    console.log(`[cito-api] refresh → ${events.length} events, ${indexed} indexed | monthly remaining: ${monthlyRem}`);
  } catch (e) {
    console.log(`[cito-api] erreur: ${e.message}`);
  }
  // Purge stale
  const t = Date.now();
  for (const [k, v] of cache) if (t - v.scrapedAt > TTL_MS) cache.delete(k);
}

/**
 * Signal depuis cs2-routes : true = au moins un match CS2 running, false = aucun.
 * Contrôle si le worker doit consommer du quota Cito.
 */
export function setCitoHasLiveMatches(flag) {
  hasLiveMatches = !!flag;
}

/**
 * Cherche un match dans le cache Cito. Renvoie {mapScores, seriesScore,
 * currentMap, source: "cito-api"} ou null. Fuzzy match sur noms d'équipes.
 */
export function getCitoApiMatch(team1Name, team2Name) {
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
        seriesScore: swap ? { a: entry.seriesScore.b, b: entry.seriesScore.a } : entry.seriesScore,
        currentMap: entry.currentMap,
        currentRound: entry.currentRound,
        source: "cito-api",
      };
    }
  }
  return null;
}

export function startCitoApiWorker() {
  if (!CITO_API_KEY) {
    console.log("ℹ️  CITO_API_KEY absente, cito-api worker skippé");
    return;
  }
  console.log(`[cito-api] worker démarré, poll ${POLL_INTERVAL_MS / 1000}s (gated par matchs live PandaScore)`);
  async function loop() {
    try { await refreshLive(); } catch (e) { console.error("[cito-api] loop:", e.message); }
    setTimeout(loop, POLL_INTERVAL_MS);
  }
  setTimeout(loop, BOOT_DELAY_MS);
}
