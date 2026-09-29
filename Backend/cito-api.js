// Cito API CS2 live map scores.
// Free tier: 500 req/mois, 10 req/min, 60s delay on live data.
//
// Strategy:
// 1. Every 3 min, GET /cs2/live → list of currently live CS2 matches.
//    Response gives: score (series), currentMap, currentMapScore, matchId (cito-match-XXXXX).
// 2. For EACH live match, GET /cs2/matches/{id}/maps → per-map exact scores
//    (Map 1 Cache 16-13, Map 2 Anubis 13-2, etc.) — ONLY when the series score
//    changes vs previous cache (indicates a map just ended). Saves quota.
// 3. Build live_map_scores = [finished maps with exact scores] + [current map
//    with live rounds]. Exposed to /api/cs2-live consumers.

const CITO_API_BASE = (process.env.CITO_API_BASE || "https://api.citoapi.com/api/v1").replace(/\/$/, "");
// Support multi-tokens: CITO_API_KEY peut contenir plusieurs tokens separes
// par virgule. Quand le token courant hit 429 (quota epuise), on tourne
// automatiquement sur le suivant. Backward compatible avec un seul token.
const CITO_API_KEYS = (process.env.CITO_API_KEY || "")
  .split(",")
  .map((k) => k.trim())
  .filter((k) => k.length > 0);

const POLL_INTERVAL_MS = 3 * 60 * 1000;
const TTL_MS = 5 * 60 * 1000;
const BOOT_DELAY_MS = 10_000;
const MIN_POLL_INTERVAL_MS = 90_000;

// Cache indexed by normalized team1|team2 (LIVE matches, TTL court)
const cache = new Map();
// Cache indexed by cito matchId → finished maps details (persistent 24h)
const finishedMapsCache = new Map();
// Cache indexed by normalized team1|team2 (FINISHED matches, TTL long 24h)
const finishedByTeamsCache = new Map();
let lastPollAt = 0;
let lastFinishedPollAt = 0;
let hasLiveMatches = false;
const FINISHED_POLL_MS = 10 * 60 * 1000; // Poll les finished toutes les 10 min
const FINISHED_TTL_MS = 24 * 60 * 60 * 1000; // Cache 24h les matchs finis

// Rotation des tokens: index courant + set des tokens epuises (429) qu'on skip
// jusqu'au prochain mois. exhaustedAt[i] = timestamp quand token[i] a hit 429.
let currentKeyIdx = 0;
const exhaustedAt = new Array(CITO_API_KEYS.length).fill(0);
const EXHAUST_COOLDOWN_MS = 24 * 60 * 60 * 1000; // Retry un token exhaust au bout de 24h

function getCurrentKey() {
  if (CITO_API_KEYS.length === 0) return "";
  const now = Date.now();
  // Cherche un token utilisable a partir de currentKeyIdx
  for (let i = 0; i < CITO_API_KEYS.length; i++) {
    const idx = (currentKeyIdx + i) % CITO_API_KEYS.length;
    if (now - exhaustedAt[idx] > EXHAUST_COOLDOWN_MS) {
      if (idx !== currentKeyIdx) {
        console.log(`[cito-api] rotation token #${currentKeyIdx} → #${idx}`);
        currentKeyIdx = idx;
      }
      return CITO_API_KEYS[idx];
    }
  }
  // Tous les tokens exhausts → renvoie le "moins vieux" (le prochain qui va reset)
  return "";
}

function markCurrentKeyExhausted() {
  exhaustedAt[currentKeyIdx] = Date.now();
  console.log(`[cito-api] token #${currentKeyIdx} marque exhausted (quota atteint)`);
}

async function citoFetch(url) {
  const key = getCurrentKey();
  if (!key) throw new Error("all tokens exhausted");
  const res = await fetch(url, {
    headers: { "x-api-key": key, Accept: "application/json" },
  });
  if (res.status === 429) {
    // Quota epuise sur ce token → mark + retry avec le suivant si dispo
    markCurrentKeyExhausted();
    const nextKey = getCurrentKey();
    if (nextKey && nextKey !== key) {
      console.log(`[cito-api] retry avec token suivant`);
      return fetch(url, { headers: { "x-api-key": nextKey, Accept: "application/json" } });
    }
  }
  return res;
}

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

// Fetch /cs2/matches/{id}/maps → list of finished maps with exact scores.
// Returns array of { map, score1, score2, winnerIsTeam1 } or null on error.
async function fetchMatchMaps(matchId, team1Id) {
  try {
    const res = await citoFetch(`${CITO_API_BASE}/cs2/matches/${matchId}/maps`);
    if (!res.ok) {
      console.log(`[cito-api] /maps HTTP ${res.status} for ${matchId}`);
      return null;
    }
    const data = await res.json();
    const rawMaps = Array.isArray(data?.data) ? data.data : [];
    // Group by mapNumber, keep only "completed" or "live" status
    const byMap = {};
    for (const m of rawMaps) {
      if (m.entityType !== "cs2_map") continue;
      const key = m.mapNumber;
      if (byMap[key]) continue;
      byMap[key] = m;
    }
    const maps = Object.values(byMap)
      .filter((m) => m.status === "completed" || m.status === "live" || m.status === "in_progress")
      .sort((a, b) => (a.mapNumber || 0) - (b.mapNumber || 0))
      .map((m) => {
        const winnerIsTeam1 = m.winnerTeamId === team1Id;
        return {
          map: m.mapName || `Map ${m.mapNumber}`,
          score1: m.team1Score ?? 0,
          score2: m.team2Score ?? 0,
          status: m.status,
          winnerIsTeam1,
        };
      });
    return maps;
  } catch (e) {
    console.log(`[cito-api] fetchMatchMaps erreur ${matchId}: ${e.message}`);
    return null;
  }
}

async function refreshLive() {
  if (CITO_API_KEYS.length === 0) return;
  if (!hasLiveMatches) return;
  const now = Date.now();
  if (now - lastPollAt < MIN_POLL_INTERVAL_MS) return;
  lastPollAt = now;

  try {
    const res = await citoFetch(`${CITO_API_BASE}/cs2/live`);
    if (res.status === 503) {
      const body = await res.json().catch(() => ({}));
      console.log(`[cito-api] 503 warmup: ${body?.error?.message || "delayed data"}`);
      return;
    }
    if (res.status === 429) {
      console.log("[cito-api] 429 tous tokens epuises, pause 10 min");
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
    let extraMapCalls = 0;

    for (const ev of events) {
      const t1 = ev.team1Name;
      const t2 = ev.team2Name;
      if (!t1 || !t2) continue;

      const s1 = ev.score?.team1 ?? 0;
      const s2 = ev.score?.team2 ?? 0;
      const totalMapsFinished = s1 + s2;
      const matchId = ev.matchId;
      const team1Id = ev.team1Id;

      // Fetch /maps ONLY when:
      // (a) we've never fetched this match, OR
      // (b) the series score changed (a map just ended)
      let finishedMaps = finishedMapsCache.get(matchId);
      const cachedSeries = finishedMaps?.seriesTotal;
      if (matchId && (cachedSeries == null || cachedSeries !== totalMapsFinished)) {
        const maps = await fetchMatchMaps(matchId, team1Id);
        if (maps) {
          finishedMapsCache.set(matchId, { maps, seriesTotal: totalMapsFinished, at: Date.now() });
          finishedMaps = finishedMapsCache.get(matchId);
          extraMapCalls++;
        }
      }

      // Build live_map_scores: prefer real /maps data, fallback to approx.
      // IMPORTANT: dedupe by clean map name. mapName from /maps est deja propre
      // ("Cache"), mais ev.currentMap est brut ("de_cache") → mapNameClean(both).
      const maps = [];
      if (finishedMaps && finishedMaps.maps.length > 0) {
        const currentClean = mapNameClean(ev.currentMap || "").toLowerCase();
        for (const m of finishedMaps.maps) {
          const mClean = mapNameClean(m.map).toLowerCase();
          // Si c'est la map EN COURS, on prefere le score frais de /cs2/live
          // (evite '0-0' fige quand /maps a mis en cache avant que la map demarre)
          if (mClean === currentClean && ev.currentMapScore) {
            maps.push({
              map: mapNameClean(m.map),
              score1: ev.currentMapScore.team1 ?? m.score1 ?? 0,
              score2: ev.currentMapScore.team2 ?? m.score2 ?? 0,
            });
          } else {
            maps.push({ map: mapNameClean(m.map), score1: m.score1, score2: m.score2 });
          }
        }
        // Ajoute la map en cours SEULEMENT si elle n'est pas deja dans /maps
        const alreadyInList = finishedMaps.maps.some(
          (m) => mapNameClean(m.map).toLowerCase() === currentClean
        );
        if (ev.currentMapScore && !alreadyInList && currentClean) {
          maps.push({
            map: mapNameClean(ev.currentMap),
            score1: ev.currentMapScore.team1 ?? 0,
            score2: ev.currentMapScore.team2 ?? 0,
          });
        }
      } else {
        // Fallback: 13-0 approx for finished maps + real currentMapScore
        for (let i = 0; i < totalMapsFinished; i++) {
          if (i < s1) maps.push({ map: `Map ${i + 1}`, score1: 13, score2: 0 });
          else maps.push({ map: `Map ${i + 1}`, score1: 0, score2: 13 });
        }
        if (ev.currentMapScore) {
          maps.push({
            map: mapNameClean(ev.currentMap) || `Map ${maps.length + 1}`,
            score1: ev.currentMapScore.team1 ?? 0,
            score2: ev.currentMapScore.team2 ?? 0,
          });
        }
      }

      const key = normalize(t1) + "|" + normalize(t2);
      cache.set(key, {
        team1: t1, team2: t2,
        seriesScore: { a: s1, b: s2 },
        mapScores: maps,
        currentMap: ev.currentMap,
        currentRound: ev.currentRound,
        matchId,
        scrapedAt: Date.now(),
      });
      indexed++;
    }
    const monthlyRem = res.headers.get("x-ratelimit-monthly-remaining");
    const activeToken = currentKeyIdx + 1;
    const totalTokens = CITO_API_KEYS.length;
    console.log(`[cito-api] refresh → ${events.length} events, ${indexed} indexed, +${extraMapCalls} /maps calls | token ${activeToken}/${totalTokens} rem: ${monthlyRem}`);
  } catch (e) {
    console.log(`[cito-api] erreur: ${e.message}`);
  }
  const t = Date.now();
  for (const [k, v] of cache) if (t - v.scrapedAt > TTL_MS) cache.delete(k);
}

export function setCitoHasLiveMatches(flag) {
  hasLiveMatches = !!flag;
}

// Refresh les matchs CS2 finis recemment (24h) pour les avoir en cache
// et pouvoir servir les scores map dans /api/cs2-results sans polling
// individuel par match.
async function refreshRecentFinished() {
  if (CITO_API_KEYS.length === 0) return;
  const now = Date.now();
  if (now - lastFinishedPollAt < FINISHED_POLL_MS) return;
  lastFinishedPollAt = now;
  try {
    const yesterday = new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 10);
    // Cito API sort: 'sort=startsAt&order=desc' pour les plus recents en premier
    const url = `${CITO_API_BASE}/cs2/matches?status=completed&from=${yesterday}&limit=50&sort=startsAt&order=desc`;
    const res = await citoFetch(url);
    if (!res.ok) {
      console.log(`[cito-api] /cs2/matches?completed HTTP ${res.status}`);
      return;
    }
    const data = await res.json();
    const rows = Array.isArray(data?.data) ? data.data : [];
    let indexed = 0;
    for (const m of rows) {
      const t1 = m.team1Name;
      const t2 = m.team2Name;
      const matchId = m.matchId || m.id;
      if (!t1 || !t2 || !matchId) continue;
      // Fetch /maps pour ce match (si pas deja en cache)
      if (!finishedMapsCache.has(matchId)) {
        const maps = await fetchMatchMaps(matchId, m.team1Id);
        if (maps) finishedMapsCache.set(matchId, { maps, seriesTotal: (m.team1Score || 0) + (m.team2Score || 0), at: Date.now() });
      }
      const finishedMaps = finishedMapsCache.get(matchId);
      if (!finishedMaps || finishedMaps.maps.length === 0) continue;
      const key = normalize(t1) + "|" + normalize(t2);
      finishedByTeamsCache.set(key, {
        team1: t1, team2: t2,
        seriesScore: { a: m.team1Score ?? 0, b: m.team2Score ?? 0 },
        mapScores: finishedMaps.maps.map((mp) => ({ map: mapNameClean(mp.map), score1: mp.score1, score2: mp.score2 })),
        matchId,
        scrapedAt: Date.now(),
      });
      indexed++;
    }
    // Purge finished cache > 24h
    for (const [k, v] of finishedByTeamsCache) {
      if (Date.now() - v.scrapedAt > FINISHED_TTL_MS) finishedByTeamsCache.delete(k);
    }
    console.log(`[cito-api] finished refresh → ${rows.length} recent, ${indexed} indexed | cache size: ${finishedByTeamsCache.size}`);
  } catch (e) {
    console.log(`[cito-api] finished refresh erreur: ${e.message}`);
  }
}

function lookupInCache(cacheMap, team1Name, team2Name) {
  const q1 = normalize(team1Name);
  const q2 = normalize(team2Name);
  for (const entry of cacheMap.values()) {
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

export function getCitoApiMatch(team1Name, team2Name) {
  // Chercher d'abord dans le cache LIVE (plus frais), puis dans FINISHED (24h)
  return lookupInCache(cache, team1Name, team2Name) || lookupInCache(finishedByTeamsCache, team1Name, team2Name);
}

// Bulk import: fetch Cito API pour les N derniers jours (paginé), remplit
// finishedByTeamsCache avec tous les matchs trouves + leurs maps. Utilisable
// via un endpoint admin one-shot pour rattraper l'historique CS2.
export async function bulkImportCitoFinished({ days = 30, maxPages = 20 } = {}) {
  if (CITO_API_KEYS.length === 0) return { ok: false, error: "CITO_API_KEY absent" };
  const from = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString().slice(0, 10);
  let totalFetched = 0;
  let totalIndexed = 0;
  const results = [];
  for (let page = 0; page < maxPages; page++) {
    const skip = page * 50;
    const url = `${CITO_API_BASE}/cs2/matches?status=completed&from=${from}&limit=50&skip=${skip}&sort=startsAt&order=desc`;
    const res = await citoFetch(url);
    if (!res.ok) {
      results.push({ page, error: `HTTP ${res.status}` });
      break;
    }
    const data = await res.json();
    const rows = Array.isArray(data?.data) ? data.data : [];
    if (rows.length === 0) break;
    totalFetched += rows.length;
    for (const m of rows) {
      const t1 = m.team1Name;
      const t2 = m.team2Name;
      const matchId = m.matchId || m.id;
      if (!t1 || !t2 || !matchId) continue;
      if (!finishedMapsCache.has(matchId)) {
        const maps = await fetchMatchMaps(matchId, m.team1Id);
        if (maps) finishedMapsCache.set(matchId, { maps, seriesTotal: (m.team1Score || 0) + (m.team2Score || 0), at: Date.now() });
        // Petit sleep pour ne pas hammer l'API
        await new Promise((r) => setTimeout(r, 250));
      }
      const finishedMaps = finishedMapsCache.get(matchId);
      if (!finishedMaps || finishedMaps.maps.length === 0) continue;
      const key = normalize(t1) + "|" + normalize(t2);
      finishedByTeamsCache.set(key, {
        team1: t1, team2: t2,
        seriesScore: { a: m.team1Score ?? 0, b: m.team2Score ?? 0 },
        mapScores: finishedMaps.maps.map((mp) => ({ map: mapNameClean(mp.map), score1: mp.score1, score2: mp.score2 })),
        matchId,
        scrapedAt: Date.now(),
      });
      totalIndexed++;
    }
    results.push({ page, fetched: rows.length, cumulative_indexed: totalIndexed });
    if (rows.length < 50) break;
  }
  return { ok: true, days, totalFetched, totalIndexed, cacheSize: finishedByTeamsCache.size, pages: results };
}

// Expose l'entierete du cache pour matching cote appelant
export function getAllCachedFinished() {
  return Array.from(finishedByTeamsCache.values());
}

export function startCitoApiWorker() {
  if (CITO_API_KEYS.length === 0) {
    console.log("[cito-api] CITO_API_KEY absent, worker skipped");
    return;
  }
  console.log(`[cito-api] worker started, poll ${POLL_INTERVAL_MS / 1000}s live + ${FINISHED_POLL_MS / 60000}min finished | ${CITO_API_KEYS.length} token(s) en rotation`);
  async function loop() {
    try { await refreshLive(); } catch (e) { console.error("[cito-api] live loop:", e.message); }
    try { await refreshRecentFinished(); } catch (e) { console.error("[cito-api] finished loop:", e.message); }
    setTimeout(loop, POLL_INTERVAL_MS);
  }
  setTimeout(loop, BOOT_DELAY_MS);
}
