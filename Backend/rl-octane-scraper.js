/**
 * Scraper Rocket League via api.octane.gg (API communautaire RL, structure
 * stable depuis des annees, utilisee par Octane.gg et des dizaines de sites
 * esports RL).
 *
 * Remplace progressivement rl-manual-game-scores.json pour les scores par
 * game. Fallback : si Octane n'a pas le match, on retombe sur le JSON manuel.
 *
 * Endpoint public, pas de cle API requise. Poll toutes les 10 min, cache
 * memoire + persist sur disque sous /data/octane-rl-cache.json pour survivre
 * aux restarts sans re-fetch tout l'historique.
 *
 * Structure Octane :
 *   GET /matches?after=YYYY-MM-DD&before=YYYY-MM-DD&page=N&perPage=50
 *   -> { matches: [{ _id, date, event:{name}, stage:{name},
 *                    blue:{team:{team:{name,image}}, score}, orange:{...},
 *                    games:[{ blue:int, orange:int, duration, map:{name} }] }] }
 *
 * Expose :
 *   getOctaneRLGameScores(team1Name, team2Name, dateIsoYYYYMMDD)
 *   forceOctaneRLRefresh()
 *   getOctaneRLSnapshot()  // pour debug
 */

import fs from "node:fs";
import path from "node:path";

const DATA_DIR = process.env.DB_PATH ? path.dirname(process.env.DB_PATH) : "/data";
const CACHE_FILE = path.join(DATA_DIR, "octane-rl-cache.json");
const OCTANE_BASE = "https://api.octane.gg";
const POLL_INTERVAL_MS = 10 * 60 * 1000;         // 10 min
const LOOKBACK_DAYS = 90;                        // fenetre glissante
const PAGE_SIZE = 100;
const FETCH_TIMEOUT_MS = 20_000;

// cache : Map clefKey -> { games, octaneId, date, event, team1, team2, fetchedAt }
let cache = new Map();
let lastRefreshAt = 0;
let refreshInFlight = null;

function loadFromDisk() {
  try {
    if (!fs.existsSync(CACHE_FILE)) return;
    const raw = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
    if (Array.isArray(raw)) {
      cache = new Map(raw);
      console.log(`[octane-rl] cache: ${cache.size} entrees charges depuis disque`);
    }
  } catch (e) {
    console.log(`[octane-rl] cache disque illisible: ${e.message}`);
  }
}

function saveToDisk() {
  try {
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify([...cache.entries()]));
  } catch (e) {
    console.log(`[octane-rl] save disque echec: ${e.message}`);
  }
}

function normName(s) {
  return (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

// Alias noms d'equipes (PandaScore <-> Octane differ parfois)
const TEAM_ALIASES = {
  teamvitality: "vitality", vit: "vitality",
  teamfalcons: "falcons", flcn: "falcons",
  spacestationgaming: "ssg", ssg: "spacestationgaming",
  karminecorp: "karminecore", kc: "karminecore",
  gentlemates: "gentlemates", gm: "gentlemates",
  ninjasinpyjamas: "nip", nipestar: "nip",
  furiaesports: "furia",
  nrgesports: "nrg",
};

function nameKey(name) {
  const n = normName(name);
  return TEAM_ALIASES[n] || n;
}

function cacheKey(t1, t2, date) {
  const a = nameKey(t1);
  const b = nameKey(t2);
  const pair = [a, b].sort().join("::");
  return `${date || "nodate"}::${pair}`;
}

function teamsMatch(pandaName, octaneName) {
  const a = nameKey(pandaName);
  const b = nameKey(octaneName);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

async function fetchJson(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "SplitApp/1.0 (+https://splitapp.fr)" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

function extractGames(m) {
  if (!Array.isArray(m.games)) return null;
  const games = m.games
    .filter(g => g && (typeof g.blue === "number" || typeof g.orange === "number"))
    .map((g, i) => ({
      game: g.map?.name ? g.map.name : `Game ${i + 1}`,
      score1: typeof g.blue === "number" ? g.blue : 0,
      score2: typeof g.orange === "number" ? g.orange : 0,
    }));
  return games.length ? games : null;
}

function extractTeamName(side) {
  return side?.team?.team?.name || side?.team?.name || null;
}

function ingestMatch(m) {
  const t1 = extractTeamName(m.blue);
  const t2 = extractTeamName(m.orange);
  const date = typeof m.date === "string" ? m.date.slice(0, 10) : null;
  const games = extractGames(m);
  if (!t1 || !t2 || !games) return false;
  const key = cacheKey(t1, t2, date);
  cache.set(key, {
    games,
    octaneId: m._id,
    date,
    event: m.event?.name || null,
    team1: t1,
    team2: t2,
    fetchedAt: Date.now(),
  });
  // Variante sans date pour fallback en cas de mismatch date UTC/local
  const keyNoDate = cacheKey(t1, t2, null);
  if (!cache.has(keyNoDate)) {
    cache.set(keyNoDate, { ...cache.get(key), fallback: true });
  }
  return true;
}

async function refreshAll({ full = false } = {}) {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const now = new Date();
    const after = new Date(now.getTime() - LOOKBACK_DAYS * 86400_000);
    const afterIso = after.toISOString().slice(0, 10);
    let totalIngested = 0;
    let page = 1;
    try {
      while (page <= 20) {
        const url = `${OCTANE_BASE}/matches?after=${afterIso}&page=${page}&perPage=${PAGE_SIZE}`;
        const data = await fetchJson(url);
        const list = Array.isArray(data.matches) ? data.matches : [];
        if (!list.length) break;
        for (const m of list) if (ingestMatch(m)) totalIngested++;
        if (list.length < PAGE_SIZE) break;
        page++;
        await new Promise(r => setTimeout(r, 500)); // politesse
      }
      lastRefreshAt = Date.now();
      saveToDisk();
      console.log(`[octane-rl] refresh OK : ${totalIngested} matchs ingères, cache=${cache.size}`);
    } catch (e) {
      console.log(`[octane-rl] refresh echec: ${e.message}`);
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

/**
 * Cherche les game scores pour un match PandaScore donne.
 * Retourne [{game, score1, score2}] dans l'ordre team1=score1 / team2=score2
 * (orientation inversee si Octane a blue/orange inverses).
 */
export function getOctaneRLGameScores(team1Name, team2Name, dateIsoYYYYMMDD) {
  const key = cacheKey(team1Name, team2Name, dateIsoYYYYMMDD);
  let entry = cache.get(key);
  if (!entry) {
    const keyNoDate = cacheKey(team1Name, team2Name, null);
    entry = cache.get(keyNoDate);
  }
  if (!entry) return null;
  // Oriente : si team1 correspond a blue de Octane, score1=blue.
  // ingestMatch stocke team1=blue, team2=orange cote Octane. Si l'appelant a
  // team1=orange en realite, on retourne inverse.
  if (teamsMatch(team1Name, entry.team1) && teamsMatch(team2Name, entry.team2)) {
    return entry.games;
  }
  if (teamsMatch(team1Name, entry.team2) && teamsMatch(team2Name, entry.team1)) {
    return entry.games.map(g => ({ game: g.game, score1: g.score2, score2: g.score1 }));
  }
  // Fallback best-effort : les 2 noms sont dans l'entry mais non reconnus ->
  // rend tel quel sans garantie d'orientation.
  return entry.games;
}

export async function forceOctaneRLRefresh() {
  return refreshAll({ full: true });
}

export function getOctaneRLSnapshot() {
  return {
    size: cache.size,
    lastRefreshAt,
    sample: [...cache.entries()].slice(0, 5).map(([k, v]) => ({ key: k, team1: v.team1, team2: v.team2, games: v.games.length })),
  };
}

// Demarrage auto si env var OCTANE_RL_ENABLED=1 (opt-in pour pas casser le
// deploiement si l'API etait HS).
if (process.env.OCTANE_RL_ENABLED === "1") {
  loadFromDisk();
  // Delai au boot pour laisser le reste du serveur demarrer
  setTimeout(() => {
    refreshAll().catch(() => {});
    setInterval(() => refreshAll().catch(() => {}), POLL_INTERVAL_MS);
  }, 15000);
  console.log("[octane-rl] active (polling toutes les 10 min)");
} else {
  console.log("[octane-rl] inactif (set OCTANE_RL_ENABLED=1 pour activer)");
}
