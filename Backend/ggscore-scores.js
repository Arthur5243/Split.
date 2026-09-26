/**
 * GGScore v2 API scraper CS2 — l'API JSON officielle payante avec scores map
 * détaillés par match. Aucune protection Cloudflare, réponse propre.
 *
 * Endpoints utilisés (base + /api/v2/...) :
 *   GET /matches/latest?limit=100      → 100 derniers matchs finis avec `games`
 *   GET /matches?page=N&limit=100      → historique paginé
 *   GET /upcoming_matches?limit=100    → matchs à venir
 *   GET /match/{uuid}                  → un match précis
 *
 * Header d'auth : X-API-Key
 *
 * Structure MatchItem (partiel, cf openapi-public.json) :
 *   { id, played_at, team_won: {id,title,image_url},
 *     team_lose: {id,title,image_url}, score_won, score_lose,
 *     games: [{ sequence, played, technical_forfeit, winner_rounds,
 *               loser_rounds, map: {slug,title}, map_winner_team: {id,title} }]
 *   }
 *
 * Le cache est indexé par (normTeam1, normTeam2, date YYYY-MM-DD) pour
 * matcher les noms d'équipes retournés par PandaScore.
 */

const API_BASE = (process.env.GGSCORE_API_BASE || "https://api.ggscore.net").replace(/\/$/, "");
const API_KEY = process.env.GGSCORE_API_KEY || "";

// ⚠️ Plan gratuit ggscore.net = 3 requêtes/jour. Poll toutes les 8h max
// pour ne pas dépasser (24h / 8h = 3 fetches/jour). Passer à 5-10 min quand
// upgrade vers un plan payant.
const POLL_INTERVAL_MS = Number(process.env.GGSCORE_POLL_INTERVAL_MS) || 8 * 60 * 60 * 1000;
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 jours (couvre les matchs vus au dernier fetch)

// key: "team1|team2|YYYY-MM-DD" (normalisés) → { team1, team2, date, seriesScore, mapScores, id, scrapedAt }
const cache = new Map();

// Compte d'erreurs pour backoff en cas de 429 (rate limit) ou 401 (bad key)
let consecutiveErrors = 0;
let disabledUntil = 0;

function normalize(s) {
  // Retire les accents, les suffixes courants (" CS", " Esports", etc.) et
  // tout ce qui n'est pas alphanumérique. Ex: "DENDELE CS" → "dendele",
  // "Team Falcons" → "falcons", "Wildcard Gaming" → "wildcard".
  return (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\b(cs|cs2|csgo|esports?|gaming|team|esport|club|academy)\b/g, "")
    .trim()
    .replace(/[^a-z0-9]/g, "");
}

function keyOf(team1Name, team2Name, dateStr) {
  const a = normalize(team1Name);
  const b = normalize(team2Name);
  const [x, y] = a < b ? [a, b] : [b, a];
  return `${x}|${y}|${dateStr}`;
}

async function fetchJson(path) {
  const url = API_BASE + path;
  const res = await fetch(url, {
    headers: {
      "X-API-Key": API_KEY,
      Accept: "application/json",
      "User-Agent": "Split-Esport-Backend/1.0",
    },
  });
  if (res.status === 401) {
    consecutiveErrors = 999;
    disabledUntil = Date.now() + 60 * 60 * 1000; // 1h avant retry
    throw new Error("ggscore HTTP 401 — clé invalide, désactivé 1h");
  }
  if (res.status === 429) {
    consecutiveErrors++;
    disabledUntil = Date.now() + 10 * 60 * 1000;
    throw new Error("ggscore HTTP 429 — rate limit, désactivé 10min");
  }
  if (!res.ok) throw new Error(`ggscore HTTP ${res.status} for ${path}`);
  consecutiveErrors = 0;
  return res.json();
}

// Transforme un MatchItem GGScore en scores map compatibles avec cs2-routes
function extractMapScores(match, requestedTeam1Name) {
  if (!Array.isArray(match.games)) return null;
  const t1 = match.team_won;
  const t2 = match.team_lose;
  if (!t1 || !t2) return null;

  // Détermine si le "team_won" côté GGScore correspond à requestedTeam1Name
  // (pour retourner les scores dans l'ordre team1/team2 attendu par le front)
  const wonIsTeam1 = normalize(t1.title || "") === normalize(requestedTeam1Name || "") ||
    normalize(t1.title || "").includes(normalize(requestedTeam1Name || "")) ||
    normalize(requestedTeam1Name || "").includes(normalize(t1.title || ""));

  const maps = [];
  for (const g of match.games) {
    if (!g.played || g.technical_forfeit) continue;
    if (g.winner_rounds == null || g.loser_rounds == null) continue;
    const mapName = g.map?.title || g.map?.slug || `Map ${g.sequence}`;
    // map_winner_team dit qui a gagné cette map précisément
    const mwt = g.map_winner_team;
    const mwtIsTeam1 = mwt && (
      normalize(mwt.title || "") === normalize(requestedTeam1Name || "") ||
      normalize(mwt.title || "").includes(normalize(requestedTeam1Name || "")) ||
      normalize(requestedTeam1Name || "").includes(normalize(mwt.title || ""))
    );
    const score1 = mwtIsTeam1 ? g.winner_rounds : g.loser_rounds;
    const score2 = mwtIsTeam1 ? g.loser_rounds : g.winner_rounds;
    maps.push({ map: mapName, score1, score2 });
  }
  return maps.length > 0 ? maps : null;
}

async function refreshFromLatest() {
  if (!API_KEY) return;
  if (Date.now() < disabledUntil) return;
  try {
    const json = await fetchJson("/api/v2/matches/latest?limit=100");
    const rows = json?.data || json?.items || (Array.isArray(json) ? json : []);
    let stored = 0;
    for (const m of rows) {
      const t1 = m.team_won;
      const t2 = m.team_lose;
      if (!t1 || !t2 || !m.played_at) continue;
      const date = String(m.played_at).slice(0, 10);
      const k = keyOf(t1.title || "", t2.title || "", date);
      const maps = extractMapScores(m, t1.title);
      if (!maps || maps.length === 0) continue;
      cache.set(k, {
        id: m.id,
        team1: t1.title,
        team2: t2.title,
        date,
        seriesScore: { a: m.score_won, b: m.score_lose },
        mapScores: maps,
        scrapedAt: Date.now(),
      });
      stored++;
    }
    console.log(`[ggscore] refresh /matches/latest → ${rows.length} matchs, ${stored} avec map scores mis en cache (total cache: ${cache.size})`);
  } catch (e) {
    console.log(`[ggscore] erreur refresh: ${e.message}`);
  }
}

// Purge des entrées expirées
function cleanupCache() {
  const now = Date.now();
  for (const [k, v] of cache) {
    if (now - v.scrapedAt > TTL_MS) cache.delete(k);
  }
}

/**
 * Cherche les scores map d'un match donné dans le cache GGScore.
 * Renvoie { mapScores, seriesScore, id, url } ou null.
 * Matching partiel accepté (les noms GGScore peuvent différer légèrement).
 */
export function getGGScoreMatch(team1Name, team2Name, dateStr) {
  if (!API_KEY) return null;
  if (!dateStr) return null;
  const q1 = normalize(team1Name);
  const q2 = normalize(team2Name);
  const dateShort = dateStr.slice(0, 10);

  // Essaie d'abord la clé exacte
  const k = keyOf(team1Name, team2Name, dateShort);
  if (cache.has(k)) {
    const entry = cache.get(k);
    return {
      mapScores: entry.mapScores,
      seriesScore: entry.seriesScore,
      id: entry.id,
      source: "ggscore",
    };
  }

  // Fallback : scan du cache pour matching partiel
  for (const entry of cache.values()) {
    if (entry.date !== dateShort) continue;
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
        id: entry.id,
        source: "ggscore",
      };
    }
  }
  return null;
}

export function startGGScoreWorker() {
  if (!API_KEY) {
    console.log("[ggscore] GGSCORE_API_KEY non définie → worker désactivé");
    return;
  }
  console.log(`[ggscore] worker démarré, poll /matches/latest toutes les ${POLL_INTERVAL_MS / 1000}s (base=${API_BASE})`);
  async function loop() {
    try {
      cleanupCache();
      await refreshFromLatest();
    } catch (e) {
      console.error("[ggscore] erreur loop:", e.message);
    }
    setTimeout(loop, POLL_INTERVAL_MS);
  }
  setTimeout(loop, 5_000);
}
