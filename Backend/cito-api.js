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
const CITO_API_KEY = process.env.CITO_API_KEY || "";

const POLL_INTERVAL_MS = 3 * 60 * 1000;
const TTL_MS = 5 * 60 * 1000;
const BOOT_DELAY_MS = 10_000;
const MIN_POLL_INTERVAL_MS = 90_000;

// Cache indexed by normalized team1|team2
const cache = new Map();
// Cache indexed by cito matchId → finished maps details (persistent across polls)
const finishedMapsCache = new Map();
let lastPollAt = 0;
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

// Fetch /cs2/matches/{id}/maps → list of finished maps with exact scores.
// Returns array of { map, score1, score2, winnerIsTeam1 } or null on error.
async function fetchMatchMaps(matchId, team1Id) {
  try {
    const res = await fetch(`${CITO_API_BASE}/cs2/matches/${matchId}/maps`, {
      headers: { "x-api-key": CITO_API_KEY, Accept: "application/json" },
    });
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
  if (!CITO_API_KEY) return;
  if (!hasLiveMatches) return;
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
      console.log("[cito-api] 429 rate limit, pause 10 min");
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

      // Build live_map_scores: prefer real /maps data, fallback to approx
      const maps = [];
      if (finishedMaps && finishedMaps.maps.length > 0) {
        // Use exact per-map scores from /maps endpoint
        for (const m of finishedMaps.maps) {
          maps.push({ map: m.map, score1: m.score1, score2: m.score2 });
        }
        // If Cito's currentMap is not yet in the /maps list, append with live rounds
        const currentInList = finishedMaps.maps.some(
          (m) => m.map?.toLowerCase() === (ev.currentMap || "").toLowerCase() && m.status !== "completed"
        );
        if (ev.currentMapScore && !currentInList) {
          maps.push({
            map: mapNameClean(ev.currentMap) || `Map ${maps.length + 1}`,
            score1: ev.currentMapScore.team1 ?? 0,
            score2: ev.currentMapScore.team2 ?? 0,
          });
        } else if (ev.currentMapScore && currentInList) {
          // Overwrite the "live" entry with fresher currentMapScore from /cs2/live
          const idx = maps.findIndex((m) => m.map?.toLowerCase() === mapNameClean(ev.currentMap).toLowerCase());
          if (idx >= 0) {
            maps[idx].score1 = ev.currentMapScore.team1 ?? maps[idx].score1;
            maps[idx].score2 = ev.currentMapScore.team2 ?? maps[idx].score2;
          }
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
    console.log(`[cito-api] refresh → ${events.length} events, ${indexed} indexed, +${extraMapCalls} /maps calls | monthly rem: ${monthlyRem}`);
  } catch (e) {
    console.log(`[cito-api] erreur: ${e.message}`);
  }
  const t = Date.now();
  for (const [k, v] of cache) if (t - v.scrapedAt > TTL_MS) cache.delete(k);
}

export function setCitoHasLiveMatches(flag) {
  hasLiveMatches = !!flag;
}

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
    console.log("[cito-api] CITO_API_KEY absent, worker skipped");
    return;
  }
  console.log(`[cito-api] worker started, poll ${POLL_INTERVAL_MS / 1000}s + /maps calls on series change`);
  async function loop() {
    try { await refreshLive(); } catch (e) { console.error("[cito-api] loop:", e.message); }
    setTimeout(loop, POLL_INTERVAL_MS);
  }
  setTimeout(loop, BOOT_DELAY_MS);
}
