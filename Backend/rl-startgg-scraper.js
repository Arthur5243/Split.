/**
 * Scraper Rocket League via l'API GraphQL officielle start.gg.
 *
 * API : https://api.start.gg/gql/alpha
 * Doc : https://developer.start.gg/docs/intro
 *
 * Strategie :
 *  - Toutes les 10 min, on cherche les tournois RL (videogameId=14647)
 *    en cours ou a venir sur start.gg et on recupere leurs sets (matchs),
 *    chaque set contenant une liste de games (maps) avec les scores.
 *  - Cache memoire + persist sur disque /data/startgg-rl-cache.json.
 *  - getStartggRLGameScores(team1, team2, date) retourne [{game, score1, score2}]
 *    comme findManualGameScores / getOctaneRLGameScores.
 *
 * Activation : env STARTGG_RL_ENABLED=1 et STARTGG_API_KEY.
 */

import fs from "node:fs";
import path from "node:path";

const DATA_DIR = process.env.DB_PATH ? path.dirname(process.env.DB_PATH) : "/data";
const CACHE_FILE = path.join(DATA_DIR, "startgg-rl-cache.json");
const API_URL = "https://api.start.gg/gql/alpha";
const RL_VIDEOGAME_ID = 14647;             // Rocket League
const POLL_INTERVAL_MS = 10 * 60 * 1000;
const FETCH_TIMEOUT_MS = 25_000;
const TOURNAMENTS_PER_PAGE = 20;
const SETS_PER_PAGE = 50;
const LOOKBACK_DAYS = 90;
const LOOKAHEAD_DAYS = 60;

let cache = new Map();
let lastRefreshAt = 0;
let refreshInFlight = null;

function loadFromDisk() {
  try {
    if (!fs.existsSync(CACHE_FILE)) return;
    const raw = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
    if (Array.isArray(raw)) {
      cache = new Map(raw);
      console.log(`[startgg-rl] cache: ${cache.size} entrees charges depuis disque`);
    }
  } catch (e) {
    console.log(`[startgg-rl] cache disque illisible: ${e.message}`);
  }
}
function saveToDisk() {
  try {
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify([...cache.entries()]));
  } catch (e) {
    console.log(`[startgg-rl] save disque echec: ${e.message}`);
  }
}

function normName(s) {
  return (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

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

function teamsMatch(a, b) {
  const x = nameKey(a);
  const y = nameKey(b);
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}

async function gqlQuery(query, variables) {
  const key = process.env.STARTGG_API_KEY;
  if (!key) throw new Error("STARTGG_API_KEY absent");
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + key,
      },
      body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (json.errors) throw new Error("GraphQL: " + JSON.stringify(json.errors).slice(0, 200));
    return json.data;
  } finally { clearTimeout(t); }
}

// GraphQL : chope les tournois RL dans la fenetre -90j / +60j
const TOURNAMENTS_QUERY = `
  query ($videogameId: ID!, $afterDate: Timestamp!, $beforeDate: Timestamp!, $page: Int!, $perPage: Int!) {
    tournaments(query: {
      page: $page,
      perPage: $perPage,
      sortBy: "startAt asc",
      filter: {
        videogameIds: [$videogameId],
        afterDate: $afterDate,
        beforeDate: $beforeDate
      }
    }) {
      nodes {
        id
        name
        startAt
        endAt
        events(filter: { videogameId: $videogameId }) {
          id
          name
          startAt
        }
      }
    }
  }
`;

// GraphQL : chope les sets d'un event avec games + scores
const SETS_QUERY = `
  query ($eventId: ID!, $page: Int!, $perPage: Int!) {
    event(id: $eventId) {
      id
      name
      sets(page: $page, perPage: $perPage, sortType: RECENT) {
        nodes {
          id
          startedAt
          completedAt
          state
          fullRoundText
          slots {
            entrant { id name }
            standing { placement stats { score { value } } }
          }
          games {
            orderNum
            entrant1Score
            entrant2Score
            winnerId
          }
        }
      }
    }
  }
`;

function extractGamesFromSet(set) {
  if (!Array.isArray(set.games) || set.games.length === 0) return null;
  const sorted = [...set.games].sort((a, b) => (a.orderNum || 0) - (b.orderNum || 0));
  const games = sorted
    .filter(g => g && (typeof g.entrant1Score === "number" || typeof g.entrant2Score === "number"))
    .map((g, i) => ({
      game: "Game " + (i + 1),
      score1: typeof g.entrant1Score === "number" ? g.entrant1Score : 0,
      score2: typeof g.entrant2Score === "number" ? g.entrant2Score : 0,
    }));
  return games.length ? games : null;
}

function ingestSet(set, tournamentStartAt) {
  const slots = Array.isArray(set.slots) ? set.slots : [];
  if (slots.length < 2) return false;
  const t1 = slots[0]?.entrant?.name;
  const t2 = slots[1]?.entrant?.name;
  if (!t1 || !t2) return false;
  const games = extractGamesFromSet(set);
  if (!games) return false;
  const ts = set.completedAt || set.startedAt || tournamentStartAt;
  const date = ts ? new Date(ts * 1000).toISOString().slice(0, 10) : null;
  const key = cacheKey(t1, t2, date);
  cache.set(key, { games, team1: t1, team2: t2, date, setId: set.id });
  const keyNoDate = cacheKey(t1, t2, null);
  if (!cache.has(keyNoDate)) cache.set(keyNoDate, { games, team1: t1, team2: t2, date, setId: set.id, fallback: true });
  return true;
}

async function refreshAll() {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const now = Date.now();
    const afterDate = Math.floor((now - LOOKBACK_DAYS * 86400_000) / 1000);
    const beforeDate = Math.floor((now + LOOKAHEAD_DAYS * 86400_000) / 1000);
    let totalIngested = 0, eventsProcessed = 0;
    try {
      let page = 1;
      while (page <= 5) {
        const data = await gqlQuery(TOURNAMENTS_QUERY, {
          videogameId: RL_VIDEOGAME_ID,
          afterDate, beforeDate,
          page, perPage: TOURNAMENTS_PER_PAGE,
        });
        const tournaments = data?.tournaments?.nodes || [];
        if (!tournaments.length) break;
        for (const t of tournaments) {
          const events = t.events || [];
          for (const ev of events) {
            try {
              let setsPage = 1;
              while (setsPage <= 4) {
                const d2 = await gqlQuery(SETS_QUERY, {
                  eventId: ev.id, page: setsPage, perPage: SETS_PER_PAGE,
                });
                const nodes = d2?.event?.sets?.nodes || [];
                if (!nodes.length) break;
                for (const s of nodes) if (ingestSet(s, t.startAt)) totalIngested++;
                eventsProcessed++;
                if (nodes.length < SETS_PER_PAGE) break;
                setsPage++;
                await new Promise(r => setTimeout(r, 600));
              }
            } catch (e) {
              console.log(`[startgg-rl] event ${ev.id} echec: ${e.message}`);
            }
            await new Promise(r => setTimeout(r, 400));
          }
        }
        if (tournaments.length < TOURNAMENTS_PER_PAGE) break;
        page++;
      }
      lastRefreshAt = Date.now();
      saveToDisk();
      console.log(`[startgg-rl] refresh OK : ${totalIngested} sets ingeres (${eventsProcessed} events), cache=${cache.size}`);
    } catch (e) {
      console.log(`[startgg-rl] refresh echec: ${e.message}`);
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

export function getStartggRLGameScores(team1Name, team2Name, dateIsoYYYYMMDD) {
  const key = cacheKey(team1Name, team2Name, dateIsoYYYYMMDD);
  let entry = cache.get(key);
  if (!entry) entry = cache.get(cacheKey(team1Name, team2Name, null));
  if (!entry) return null;
  if (teamsMatch(team1Name, entry.team1) && teamsMatch(team2Name, entry.team2)) {
    return entry.games;
  }
  if (teamsMatch(team1Name, entry.team2) && teamsMatch(team2Name, entry.team1)) {
    return entry.games.map(g => ({ game: g.game, score1: g.score2, score2: g.score1 }));
  }
  return entry.games;
}

export async function forceStartggRLRefresh() {
  return refreshAll();
}

export function getStartggRLSnapshot() {
  return {
    size: cache.size,
    lastRefreshAt,
    sample: [...cache.entries()].slice(0, 5).map(([k, v]) => ({ key: k, team1: v.team1, team2: v.team2, games: v.games.length })),
  };
}

if (process.env.STARTGG_RL_ENABLED === "1" && process.env.STARTGG_API_KEY) {
  loadFromDisk();
  setTimeout(() => {
    refreshAll().catch(() => {});
    setInterval(() => refreshAll().catch(() => {}), POLL_INTERVAL_MS);
  }, 20000);
  console.log("[startgg-rl] active (polling toutes les 10 min, Rocket League)");
} else {
  console.log("[startgg-rl] inactif (set STARTGG_RL_ENABLED=1 et STARTGG_API_KEY)");
}
