/**
 * RL Live Scraper — PandaScore match discovery + Liquipedia game scores.
 *
 * PandaScore discovers live/finished RL matches (reliable API).
 * Liquipedia bracket popups provide per-game goal scores.
 * PandaScore returns 404 for /rl/games/{id}, so Liquipedia is the
 * only source of real goal-per-game data.
 *
 * Flow:
 * 1. Poll PandaScore every ~60s for live + recently finished RL matches
 * 2. Map each match to its Liquipedia tournament page
 * 3. Fetch & cache Liquipedia pages (1 req/30s rate limit, 2min cache)
 * 4. Extract game-by-game goal scores from bracket popups
 * 5. Persist scores for finished matches to survive restarts
 */

import { load } from "cheerio";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PANDASCORE_API_KEY = process.env.PANDASCORE_API_KEY;
const PANDASCORE_BASE = "https://api.pandascore.co";
const WIKI = "rocketleague";
const API_BASE = `https://liquipedia.net/${WIKI}/api.php`;
const USER_AGENT =
  process.env.LIQUIPEDIA_USER_AGENT ||
  "SplitLiveScoresBot/1.0 (contact: arthur.pro.busi@gmail.com)";

const PERSISTED_SCORES_PATH = process.env.RL_SCRAPED_SCORES_PATH ||
  join(existsSync("/data") ? "/data" : __dirname, "rl-scraped-game-scores.json");

const rlScrapedScores = new Map();
const SCRAPED_TTL_MS = 15 * 60 * 1000;
const persistedScores = new Map();

const pageCache = new Map();
const PAGE_CACHE_TTL_MS = 2 * 60 * 1000;
let lastLiquipediaFetch = 0;
const LIQUIPEDIA_MIN_INTERVAL_MS = 32_000;

let consecutiveErrors = 0;
const MAX_BACKOFF_MS = 10 * 60 * 1000;
const BASE_INTERVAL_MS = 60_000;

function normalize(s) {
  return (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

// --- Persistence ---

function loadPersistedScores() {
  try {
    if (!existsSync(PERSISTED_SCORES_PATH)) return;
    const raw = readFileSync(PERSISTED_SCORES_PATH, "utf8");
    const entries = JSON.parse(raw);
    for (const e of entries) {
      const key = normalize(e.t1) + ":" + normalize(e.t2) + ":" + (e.date || "");
      persistedScores.set(key, e.games);
    }
    console.log(`[liquipedia-rl] ${persistedScores.size} scores persistés chargés`);
  } catch (e) {
    console.log("[liquipedia-rl] rl-scraped-game-scores.json introuvable ou invalide");
  }
}

function savePersistedScores() {
  try {
    const entries = [];
    for (const [key, games] of persistedScores) {
      const parts = key.split(":");
      entries.push({ t1: parts[0], t2: parts[1], date: parts[2] || null, games });
    }
    writeFileSync(PERSISTED_SCORES_PATH, JSON.stringify(entries, null, 2), "utf8");
  } catch (e) {
    console.error("[liquipedia-rl] erreur sauvegarde scores persistés:", e.message);
  }
}

function persistScore(team1, team2, games, date) {
  const key = normalize(team1) + ":" + normalize(team2) + ":" + (date || "");
  if (persistedScores.has(key)) return;
  persistedScores.set(key, games);
  savePersistedScores();
  console.log(`[liquipedia-rl] persisté: ${team1} vs ${team2} → ${games.map(g => g.score1 + "-" + g.score2).join(", ")}`);
}

// --- Score lookup (called by rl-routes.js) ---

function getRL_ScrapedScores(team1Name, team2Name, dateHint) {
  const q1 = normalize(team1Name);
  const q2 = normalize(team2Name);

  const now = Date.now();
  for (const [, entry] of rlScrapedScores) {
    if (now - entry.scrapedAt > SCRAPED_TTL_MS) continue;
    const t1 = normalize(entry.team1);
    const t2 = normalize(entry.team2);
    if ((t1 === q1 && t2 === q2) || (t1 === q2 && t2 === q1)) {
      const swap = t1 === q2;
      return entry.games.map((g) => ({
        game: g.game,
        score1: swap ? g.score2 : g.score1,
        score2: swap ? g.score1 : g.score2,
      }));
    }
  }

  for (const [key, games] of persistedScores) {
    const parts = key.split(":");
    const t1 = parts[0];
    const t2 = parts[1];
    if ((t1 === q1 && t2 === q2) || (t1 === q2 && t2 === q1)) {
      const swap = t1 === q2;
      return games.map((g) => ({
        game: g.game,
        score1: swap ? g.score2 : g.score1,
        score2: swap ? g.score1 : g.score2,
      }));
    }
  }

  return null;
}

// --- PandaScore match discovery ---

async function pandaFetch(path, attempt = 0) {
  const res = await fetch(PANDASCORE_BASE + path, {
    headers: { Authorization: "Bearer " + PANDASCORE_API_KEY },
  });
  if (res.status === 429 && attempt < 3) {
    await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
    return pandaFetch(path, attempt + 1);
  }
  if (!res.ok) throw new Error("PandaScore HTTP " + res.status);
  return res.json();
}

function extractMatch(m) {
  return {
    team1: m.opponents[0].opponent.name,
    team2: m.opponents[1].opponent.name,
    league: m.league,
    serie: m.serie,
    tournament: m.tournament,
    dateStr: m.begin_at ? m.begin_at.slice(0, 10) : null,
  };
}

async function findLiveMatches() {
  const data = await pandaFetch("/rl/matches/running?per_page=50");
  return (data || [])
    .filter(m => m.opponents?.length >= 2 && m.opponents[0]?.opponent && m.opponents[1]?.opponent)
    .map(extractMatch);
}

async function findRecentlyFinished() {
  const data = await pandaFetch("/rl/matches/past?per_page=50&sort=-end_at");
  return (data || [])
    .filter(m => m.status === "finished" && m.opponents?.length >= 2 &&
      m.opponents[0]?.opponent && m.opponents[1]?.opponent)
    .map(extractMatch);
}

// --- Tournament → Liquipedia page mapping ---

function guessLiquipediaPage(match) {
  const leagueSlug = (match.league?.slug || "").toLowerCase();
  const leagueName = (match.league?.name || "").toLowerCase();
  const serieName = match.serie?.full_name || match.serie?.name || "";
  const tournamentName = match.tournament?.name || "";

  if (leagueSlug.includes("rlcs") || leagueName.includes("rlcs") ||
    leagueName.includes("rocket league championship")) {
    const y = (serieName.match(/\d{4}/) || tournamentName.match(/\d{4}/) || [])[0]
      || new Date().getFullYear().toString();
    return `Rocket_League_Championship_Series/${y}`;
  }

  if (leagueSlug.includes("esports-world-cup") || leagueName.includes("esports world cup") ||
    leagueName.includes("ewc") || tournamentName.toLowerCase().includes("esports world cup")) {
    const y = (serieName.match(/\d{4}/) || tournamentName.match(/\d{4}/) || [])[0]
      || new Date().getFullYear().toString();
    return `Esports_World_Cup/${y}/Rocket_League`;
  }

  const tournSlug = (match.tournament?.slug || "").toLowerCase();
  if (tournSlug.includes("rlcs")) {
    const y = (tournSlug.match(/\d{4}/) || [])[0] || new Date().getFullYear().toString();
    return `Rocket_League_Championship_Series/${y}`;
  }

  return null;
}

// --- Liquipedia API with rate limiting + cache ---

async function apiParse(pageName) {
  const cached = pageCache.get(pageName);
  if (cached && Date.now() - cached.fetchedAt < PAGE_CACHE_TTL_MS) {
    return cached.html;
  }

  const elapsed = Date.now() - lastLiquipediaFetch;
  if (elapsed < LIQUIPEDIA_MIN_INTERVAL_MS) {
    await new Promise(r => setTimeout(r, LIQUIPEDIA_MIN_INTERVAL_MS - elapsed));
  }

  const url = `${API_BASE}?action=parse&page=${encodeURIComponent(pageName)}&format=json&prop=text&disabletoc=1`;
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });
  lastLiquipediaFetch = Date.now();

  if (res.status === 429) {
    consecutiveErrors++;
    throw new Error("Liquipedia rate-limited (429)");
  }
  if (!res.ok) throw new Error(`Liquipedia HTTP ${res.status} for ${pageName}`);

  const data = await res.json();
  if (data.error) throw new Error(`API: ${data.error.info || data.error.code}`);

  const html = data.parse.text["*"];
  pageCache.set(pageName, { html, fetchedAt: Date.now() });
  consecutiveErrors = Math.max(0, consecutiveErrors - 1);
  return html;
}

// --- Game score extraction from bracket popups ---

function getGameScoresFromHtml(html, team1, team2) {
  const $ = load(html);
  const t1 = normalize(team1);
  const t2 = normalize(team2);

  let bestGames = [];

  $(".brkts-popup").each((_, popup) => {
    const $popup = $(popup);
    const headerOpps = $popup.find(".brkts-popup-header-opponent");
    if (headerOpps.length < 2) return;

    const oppName1 = normalize(headerOpps.eq(0).text());
    const oppName2 = normalize(headerOpps.eq(1).text());

    const match12 =
      (oppName1.includes(t1) || t1.includes(oppName1)) &&
      (oppName2.includes(t2) || t2.includes(oppName2));
    const match21 =
      (oppName1.includes(t2) || t2.includes(oppName1)) &&
      (oppName2.includes(t1) || t1.includes(oppName2));
    if (!match12 && !match21) return;

    const swap = match21;
    const games = [];

    $popup.find(".brkts-popup-body-game").each((i, el) => {
      const $el = $(el);
      const spaced = $el.find(".brkts-popup-spaced");
      if (spaced.length < 2) return;

      const leftText = spaced.eq(0).clone().children().remove().end().text().trim();
      const rightText = spaced.eq(spaced.length - 1).clone().children().remove().end().text().trim();

      const left = parseInt(leftText, 10);
      const right = parseInt(rightText, 10);

      if (!isNaN(left) && !isNaN(right)) {
        games.push({
          game: `Game ${i + 1}`,
          score1: swap ? right : left,
          score2: swap ? left : right,
        });
      }
    });

    if (games.length > 0) bestGames = games;
  });

  return bestGames;
}

// --- Main loop ---

function isRealScore(games) {
  if (!games || games.length === 0) return false;
  return games.some((g) => g.score1 > 1 || g.score2 > 1);
}

function isAlreadyPersisted(team1, team2, dateStr) {
  const k1 = normalize(team1) + ":" + normalize(team2) + ":" + (dateStr || "");
  const k2 = normalize(team2) + ":" + normalize(team1) + ":" + (dateStr || "");
  if (persistedScores.has(k1) || persistedScores.has(k2)) return true;
  for (const existing of persistedScores.keys()) {
    if (existing.startsWith(normalize(team1) + ":" + normalize(team2) + ":") ||
      existing.startsWith(normalize(team2) + ":" + normalize(team1) + ":")) return true;
  }
  return false;
}

async function scrapeMatchGroup(pageMatches, label) {
  for (const [pageName, matches] of pageMatches) {
    try {
      const html = await apiParse(pageName);
      for (const match of matches) {
        const games = getGameScoresFromHtml(html, match.team1, match.team2);
        if (games.length > 0) {
          const key = normalize(match.team1) + ":" + normalize(match.team2);
          rlScrapedScores.set(key, {
            team1: match.team1,
            team2: match.team2,
            page: pageName,
            games,
            scrapedAt: Date.now(),
          });
          console.log(
            `[liquipedia-rl] [${label}] ${match.team1} vs ${match.team2} →`,
            games.map(g => `${g.game}: ${g.score1}-${g.score2}`).join(" | ")
          );
          if (isRealScore(games)) {
            persistScore(match.team1, match.team2, games, match.dateStr);
          }
        }
      }
    } catch (err) {
      console.error(`[liquipedia-rl] erreur ${pageName}:`, err.message);
    }
  }
}

function groupByPage(matches) {
  const grouped = new Map();
  for (const match of matches) {
    const page = guessLiquipediaPage(match);
    if (!page) continue;
    if (!grouped.has(page)) grouped.set(page, []);
    grouped.get(page).push(match);
  }
  return grouped;
}

async function runOnce() {
  const liveMatches = await findLiveMatches();
  console.log(`[liquipedia-rl] ${liveMatches.length} match(s) live`);

  if (liveMatches.length > 0) {
    await scrapeMatchGroup(groupByPage(liveMatches), "live");
  }

  try {
    const finishedMatches = await findRecentlyFinished();
    const toFetch = finishedMatches.filter(m => !isAlreadyPersisted(m.team1, m.team2, m.dateStr));

    if (toFetch.length > 0) {
      console.log(`[liquipedia-rl] ${toFetch.length} match(s) finis à scraper`);
      await scrapeMatchGroup(groupByPage(toFetch), "finished");
    }
  } catch (err) {
    console.error("[liquipedia-rl] erreur recently finished:", err.message);
  }

  const now = Date.now();
  for (const [key, entry] of rlScrapedScores) {
    if (now - entry.scrapedAt > SCRAPED_TTL_MS) {
      rlScrapedScores.delete(key);
    }
  }
}

function getNextInterval() {
  if (consecutiveErrors === 0) return BASE_INTERVAL_MS;
  return Math.min(
    BASE_INTERVAL_MS * Math.pow(2, consecutiveErrors),
    MAX_BACKOFF_MS
  );
}

function startRlScraper() {
  loadPersistedScores();
  console.log("[liquipedia-rl] démarrage, PandaScore + Liquipedia (poll ~60s)");

  async function loop() {
    try {
      await runOnce();
    } catch (err) {
      console.error("[liquipedia-rl] erreur générale:", err.message);
      consecutiveErrors++;
    }
    const next = getNextInterval();
    if (next > BASE_INTERVAL_MS) {
      console.log(`[liquipedia-rl] backoff: prochain poll dans ${Math.round(next / 1000)}s`);
    }
    setTimeout(loop, next);
  }

  setTimeout(loop, 12000);
}

export { startRlScraper, getRL_ScrapedScores, rlScrapedScores };
