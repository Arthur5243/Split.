/**
 * RL Live Scraper — PandaScore + Liquipedia + Twitch.
 *
 * PandaScore discovers live/finished RL matches (reliable API).
 * Liquipedia provides per-game goal scores (wikitext + HTML bracket).
 * Twitch detects live streams (Rocket Baguette, rocketleague) to
 * boost poll frequency from 60s to 30s during broadcasts.
 *
 * Scores are keyed by team1:team2:date to handle rematches correctly.
 */

import { load } from "cheerio";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { getGameScoresFromLiquipedia } from "./liquipedia-rl-scores.js";

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
const LIVE_INTERVAL_MS = 30_000;

// --- Twitch live detection (Rocket Baguette + official rocketleague) ---
const TWITCH_GQL = "https://gql.twitch.tv/gql";
const TWITCH_CLIENT_ID = "kimne78kx3ncx6brgo4mv6wki5h1ko";
const RL_TWITCH_CHANNELS = ["rocketbaguette", "rocketleague"];
let twitchStreamLive = false;
let lastTwitchCheck = 0;
const TWITCH_CHECK_INTERVAL_MS = 90_000;

async function checkTwitchStreams() {
  if (Date.now() - lastTwitchCheck < TWITCH_CHECK_INTERVAL_MS) return twitchStreamLive;
  lastTwitchCheck = Date.now();
  try {
    const queries = RL_TWITCH_CHANNELS.map(login => ({
      query: `query { user(login: "${login}") { stream { id game { name } } } }`
    }));
    const res = await fetch(TWITCH_GQL, {
      method: "POST",
      headers: { "Client-ID": TWITCH_CLIENT_ID, "Content-Type": "application/json" },
      body: JSON.stringify(queries),
    });
    if (!res.ok) { twitchStreamLive = false; return false; }
    const results = await res.json();
    const live = results.some(r => {
      const stream = r?.data?.user?.stream;
      if (!stream) return false;
      const game = (stream.game?.name || "").toLowerCase();
      return game.includes("rocket league") || game === "";
    });
    if (live !== twitchStreamLive) {
      console.log(`[liquipedia-rl] Twitch RL streams: ${live ? "LIVE → poll 30s" : "offline → poll 60s"}`);
    }
    twitchStreamLive = live;
    return live;
  } catch {
    return twitchStreamLive;
  }
}

function normalize(s) {
  return (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

function makeKey(team1, team2, dateStr) {
  const t1 = normalize(team1);
  const t2 = normalize(team2);
  const d = dateStr || "";
  return t1 < t2 ? `${t1}:${t2}:${d}` : `${t2}:${t1}:${d}`;
}

function isTeamOrder(team1, team2, keyTeam1) {
  return normalize(team1) <= normalize(team2)
    ? normalize(team1) === normalize(keyTeam1)
    : normalize(team2) === normalize(keyTeam1);
}

// --- Persistence ---

function loadPersistedScores() {
  try {
    if (!existsSync(PERSISTED_SCORES_PATH)) return;
    const raw = readFileSync(PERSISTED_SCORES_PATH, "utf8");
    const entries = JSON.parse(raw);
    for (const e of entries) {
      const key = makeKey(e.t1, e.t2, e.date);
      persistedScores.set(key, { t1: e.t1, t2: e.t2, games: e.games });
    }
    console.log(`[liquipedia-rl] ${persistedScores.size} scores persistés chargés`);
  } catch (e) {
    console.log("[liquipedia-rl] rl-scraped-game-scores.json introuvable ou invalide");
  }
}

function savePersistedScores() {
  try {
    const entries = [];
    for (const [key, data] of persistedScores) {
      const date = key.split(":").pop() || null;
      entries.push({ t1: data.t1, t2: data.t2, date, games: data.games });
    }
    writeFileSync(PERSISTED_SCORES_PATH, JSON.stringify(entries, null, 2), "utf8");
  } catch (e) {
    console.error("[liquipedia-rl] erreur sauvegarde scores persistés:", e.message);
  }
}

function persistScore(team1, team2, games, date) {
  const key = makeKey(team1, team2, date);
  if (persistedScores.has(key)) return;
  persistedScores.set(key, { t1: team1, t2: team2, games });
  savePersistedScores();
  console.log(`[liquipedia-rl] persisté: ${team1} vs ${team2} (${date || "?"}) → ${games.map(g => g.score1 + "-" + g.score2).join(", ")}`);
}

// --- Score lookup (called by rl-routes.js) ---

function getRL_ScrapedScores(team1Name, team2Name, dateHint) {
  const q1 = normalize(team1Name);
  const q2 = normalize(team2Name);
  const now = Date.now();

  // 1. Check live scraped scores (with date preference)
  let bestLive = null;
  for (const [, entry] of rlScrapedScores) {
    if (now - entry.scrapedAt > SCRAPED_TTL_MS) continue;
    const t1 = normalize(entry.team1);
    const t2 = normalize(entry.team2);
    if ((t1 === q1 && t2 === q2) || (t1 === q2 && t2 === q1)) {
      if (dateHint && entry.dateStr === dateHint) {
        const swap = t1 === q2;
        return entry.games.map((g) => ({
          game: g.game,
          score1: swap ? g.score2 : g.score1,
          score2: swap ? g.score1 : g.score2,
        }));
      }
      if (!bestLive) bestLive = entry;
    }
  }

  // 2. Check persisted scores (date-aware key)
  if (dateHint) {
    const exactKey = makeKey(team1Name, team2Name, dateHint);
    const persisted = persistedScores.get(exactKey);
    if (persisted) {
      const swap = normalize(persisted.t1) !== q1;
      return persisted.games.map((g) => ({
        game: g.game,
        score1: swap ? g.score2 : g.score1,
        score2: swap ? g.score1 : g.score2,
      }));
    }
  }

  // 3. Fall back to live scraped without date match
  if (bestLive) {
    const swap = normalize(bestLive.team1) === q2;
    return bestLive.games.map((g) => ({
      game: g.game,
      score1: swap ? g.score2 : g.score1,
      score2: swap ? g.score1 : g.score2,
    }));
  }

  // 4. Fall back to any persisted match (no date)
  for (const [, data] of persistedScores) {
    const t1 = normalize(data.t1);
    const t2 = normalize(data.t2);
    if ((t1 === q1 && t2 === q2) || (t1 === q2 && t2 === q1)) {
      const swap = t1 === q2;
      return data.games.map((g) => ({
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
    id: m.id,
    team1: m.opponents[0].opponent.name,
    team2: m.opponents[1].opponent.name,
    league: m.league,
    serie: m.serie,
    tournament: m.tournament,
    dateStr: m.begin_at ? m.begin_at.slice(0, 10) : null,
    status: m.status,
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

function guessLiquipediaPages(match) {
  const pages = [];
  const leagueSlug = (match.league?.slug || "").toLowerCase();
  const leagueName = (match.league?.name || "").toLowerCase();
  const serieName = match.serie?.full_name || match.serie?.name || "";
  const tournamentName = match.tournament?.name || "";
  const tournSlug = (match.tournament?.slug || "").toLowerCase();
  const serieSlug = (match.serie?.slug || "").toLowerCase();

  const y = (serieName.match(/\d{4}/) || tournamentName.match(/\d{4}/) || [])[0]
    || new Date().getFullYear().toString();

  if (leagueSlug.includes("esports-world-cup") || leagueName.includes("esports world cup") ||
    leagueName.includes("ewc") || tournamentName.toLowerCase().includes("esports world cup")) {
    pages.push(`Esports_World_Cup/${y}/Rocket_League`);
    return pages;
  }

  if (leagueSlug.includes("rlcs") || leagueName.includes("rlcs") ||
    leagueName.includes("rocket league championship") || tournSlug.includes("rlcs")) {

    const tn = tournamentName.toLowerCase();
    const sn = serieName.toLowerCase();

    if (tn.includes("major") || sn.includes("major")) {
      const majorNum = (tn.match(/major\s*(\d)/) || sn.match(/major\s*(\d)/) || [])[1];
      if (majorNum) {
        pages.push(`Rocket_League_Championship_Series/${y}/Major_${majorNum}`);
      }
      pages.push(`Rocket_League_Championship_Series/${y}/Major_1`);
      pages.push(`Rocket_League_Championship_Series/${y}/Major_2`);
    }

    if (tn.includes("world") || sn.includes("world")) {
      pages.push(`Rocket_League_Championship_Series/${y}/World_Championship`);
    }

    const regionMap = {
      "europe": "Europe", "eu": "Europe",
      "north america": "North_America", "na": "North_America",
      "south america": "South_America", "sam": "South_America",
      "middle east": "Middle_East_and_North_Africa", "mena": "Middle_East_and_North_Africa",
      "oceania": "Oceania", "oce": "Oceania",
      "asia": "Asia-Pacific", "apac": "Asia-Pacific",
      "sub-saharan africa": "Sub-Saharan_Africa", "ssa": "Sub-Saharan_Africa",
    };

    for (const [kw, regionSlug] of Object.entries(regionMap)) {
      if (tn.includes(kw) || sn.includes(kw) || tournSlug.includes(kw) || serieSlug.includes(kw)) {
        pages.push(`Rocket_League_Championship_Series/${y}/${regionSlug}`);
        break;
      }
    }

    pages.push(`Rocket_League_Championship_Series/${y}`);
  }

  return pages;
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

// --- Game score extraction from bracket popups (HTML fallback) ---

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
  const key = makeKey(team1, team2, dateStr);
  return persistedScores.has(key);
}

function storeScrapedScore(match, games, label) {
  const scrapedKey = `${normalize(match.team1)}:${normalize(match.team2)}:${match.dateStr || ""}`;
  rlScrapedScores.set(scrapedKey, {
    team1: match.team1,
    team2: match.team2,
    dateStr: match.dateStr,
    games,
    scrapedAt: Date.now(),
  });
  console.log(
    `[liquipedia-rl] [${label}] ${match.team1} vs ${match.team2} (${match.dateStr || "?"}) →`,
    games.map(g => `${g.game}: ${g.score1}-${g.score2}`).join(" | ")
  );
}

async function tryWikitextScores(match) {
  try {
    const tournamentName = match.tournament?.name || match.league?.name || "";
    const serieName = match.serie?.full_name || match.serie?.name || "";
    const games = await getGameScoresFromLiquipedia(
      match.team1, match.team2, tournamentName, match.dateStr, serieName
    );
    return games;
  } catch (err) {
    console.log(`[liquipedia-rl] wikitext fallback erreur: ${err.message}`);
    return null;
  }
}

async function tryHtmlBracketScores(match) {
  const pages = guessLiquipediaPages(match);
  if (pages.length === 0) return null;

  for (const pageName of pages) {
    try {
      const html = await apiParse(pageName);
      const games = getGameScoresFromHtml(html, match.team1, match.team2);
      if (games.length > 0) return games;
    } catch (err) {
      if (err.message.includes("429")) throw err;
      console.log(`[liquipedia-rl] html(${pageName}): ${err.message}`);
    }
  }
  return null;
}

async function scrapeMatch(match, label) {
  // Try HTML bracket popups first (faster, no search needed)
  let games = null;
  try {
    games = await tryHtmlBracketScores(match);
  } catch (err) {
    if (err.message.includes("429")) throw err;
  }

  // Fallback to wikitext parsing (uses Liquipedia search, more reliable)
  if (!games || games.length === 0) {
    games = await tryWikitextScores(match);
  }

  if (games && games.length > 0) {
    storeScrapedScore(match, games, label);
    if (isRealScore(games)) {
      persistScore(match.team1, match.team2, games, match.dateStr);
    }
    return true;
  }
  return false;
}

async function runOnce() {
  await checkTwitchStreams();

  const liveMatches = await findLiveMatches();
  if (liveMatches.length > 0) {
    console.log(`[liquipedia-rl] ${liveMatches.length} match(s) live`);
  }

  for (const match of liveMatches) {
    try {
      await scrapeMatch(match, "live");
    } catch (err) {
      if (err.message.includes("429")) {
        console.log("[liquipedia-rl] rate-limited, arrêt du cycle");
        return;
      }
      console.error(`[liquipedia-rl] live erreur ${match.team1} vs ${match.team2}:`, err.message);
    }
  }

  try {
    const finishedMatches = await findRecentlyFinished();
    const toFetch = finishedMatches.filter(m => !isAlreadyPersisted(m.team1, m.team2, m.dateStr));

    if (toFetch.length > 0) {
      console.log(`[liquipedia-rl] ${toFetch.length} match(s) finis à scraper`);
      for (const match of toFetch) {
        try {
          await scrapeMatch(match, "finished");
        } catch (err) {
          if (err.message.includes("429")) {
            console.log("[liquipedia-rl] rate-limited, arrêt du cycle");
            return;
          }
          console.error(`[liquipedia-rl] finished erreur ${match.team1} vs ${match.team2}:`, err.message);
        }
      }
    }
  } catch (err) {
    console.error("[liquipedia-rl] erreur recently finished:", err.message);
  }

  // Cleanup expired in-memory scores
  const now = Date.now();
  for (const [key, entry] of rlScrapedScores) {
    if (now - entry.scrapedAt > SCRAPED_TTL_MS) {
      rlScrapedScores.delete(key);
    }
  }
}

function getNextInterval() {
  const base = twitchStreamLive ? LIVE_INTERVAL_MS : BASE_INTERVAL_MS;
  if (consecutiveErrors === 0) return base;
  return Math.min(
    base * Math.pow(2, consecutiveErrors),
    MAX_BACKOFF_MS
  );
}

function startRlScraper() {
  loadPersistedScores();
  console.log("[liquipedia-rl] démarrage, PandaScore + Liquipedia + Twitch (poll 30-60s)");

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

function isRlStreamLive() { return twitchStreamLive; }

export { startRlScraper, getRL_ScrapedScores, rlScrapedScores, isRlStreamLive };
