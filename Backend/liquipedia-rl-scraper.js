/**
 * Liquipedia Rocket League scraper — ESM backend worker.
 * Uses the official Liquipedia MediaWiki API (action=parse).
 *
 * STRICT rate limit: 1 parse request per 30 seconds minimum.
 * User-Agent must identify the app + contact.
 * Content licensed CC-BY-SA — attribution required if displayed publicly.
 *
 * Exports getRL_ScrapedScores() for the RL enrichment pipeline.
 *
 * Scores from live matches are persisted to a JSON file on the volume
 * so they survive process restarts. PandaScore does NOT have a game
 * detail endpoint for RL (404 on /rl/games/{id}), so Liquipedia is
 * the only source of real goal-per-game data.
 */

import { load } from "cheerio";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
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

let consecutiveErrors = 0;
const MAX_BACKOFF_MS = 10 * 60 * 1000;
const BASE_INTERVAL_MS = 120_000;

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

function normalize(s) {
  return (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

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

async function apiParse(page) {
  const url = `${API_BASE}?action=parse&page=${encodeURIComponent(
    page
  )}&format=json&prop=text&disabletoc=1`;

  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });
  if (res.status === 429) {
    consecutiveErrors++;
    throw new Error("Liquipedia rate-limited (429)");
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${page}`);
  }
  const data = await res.json();
  if (data.error) {
    throw new Error(`API: ${data.error.info || data.error.code}`);
  }
  consecutiveErrors = Math.max(0, consecutiveErrors - 1);
  return data.parse.text["*"];
}

async function findMatches() {
  const html = await apiParse("Liquipedia:Matches");
  const $ = load(html);
  const live = [];
  const completed = [];

  $(".match, .infobox_matches_content").each((_, el) => {
    const $el = $(el);
    const statusText = $el
      .find(".versus-status, .match-countdown, .timer-object")
      .text()
      .toUpperCase();
    const isLive = statusText.includes("LIVE");

    const scoreText = $el.find(".versus .versus-score, .versus-score").text().trim();
    const hasScore = /\d+\s*[-–:]\s*\d+/.test(scoreText);
    const isCompleted = !isLive && hasScore;

    if (!isLive && !isCompleted) return;

    const team1 = $el
      .find(".team-left, .team-template-text")
      .eq(0)
      .text()
      .trim();
    const team2 = $el
      .find(".team-right, .team-template-text")
      .eq(1)
      .text()
      .trim();
    const pageLink = $el
      .find("a[href*='/rocketleague/']")
      .first()
      .attr("href");

    if (pageLink && team1 && team2) {
      const entry = {
        page: pageLink.replace(`/${WIKI}/`, ""),
        team1,
        team2,
      };
      if (isLive) live.push(entry);
      else completed.push(entry);
    }
  });

  return { live, completed };
}

async function getGameScores(pageName) {
  const html = await apiParse(pageName);
  const $ = load(html);
  const games = [];

  $(".brkts-popup-body-game").each((i, el) => {
    const $el = $(el);
    const scores = $el
      .find(".brkts-popup-body-game-score, .score")
      .map((_, s) => $(s).text().trim())
      .get()
      .filter((s) => s !== "");

    if (scores.length >= 2) {
      games.push({
        game: `Game ${i + 1}`,
        score1: Number(scores[0]) || 0,
        score2: Number(scores[1]) || 0,
      });
    }
  });

  return games;
}

function isRealScore(games) {
  if (!games || games.length === 0) return false;
  return games.some((g) => g.score1 > 1 || g.score2 > 1);
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runOnce() {
  const { live, completed } = await findMatches();
  console.log(`[liquipedia-rl] ${live.length} match(s) live, ${completed.length} match(s) terminé(s)`);

  for (const match of live) {
    try {
      await sleep(30000);
      const games = await getGameScores(match.page);
      if (games.length > 0) {
        const key = normalize(match.team1) + ":" + normalize(match.team2);
        rlScrapedScores.set(key, {
          team1: match.team1,
          team2: match.team2,
          page: match.page,
          games,
          scrapedAt: Date.now(),
        });
        console.log(
          `[liquipedia-rl] ${match.team1} vs ${match.team2} →`,
          games.map((g) => `${g.game}: ${g.score1}-${g.score2}`).join(" | ")
        );
        if (isRealScore(games)) {
          persistScore(match.team1, match.team2, games);
        }
      }
    } catch (err) {
      console.error(`[liquipedia-rl] erreur ${match.page}:`, err.message);
    }
  }

  const alreadyScraped = new Set();
  for (const [key] of persistedScores) alreadyScraped.add(key);

  for (const match of completed) {
    const k1 = normalize(match.team1) + ":" + normalize(match.team2) + ":";
    const k2 = normalize(match.team2) + ":" + normalize(match.team1) + ":";
    let found = false;
    for (const existing of alreadyScraped) {
      if (existing.startsWith(k1) || existing.startsWith(k2)) { found = true; break; }
    }
    if (found) continue;

    try {
      await sleep(30000);
      const games = await getGameScores(match.page);
      if (games.length > 0 && isRealScore(games)) {
        persistScore(match.team1, match.team2, games);
        console.log(
          `[liquipedia-rl] [completed] ${match.team1} vs ${match.team2} →`,
          games.map((g) => `${g.game}: ${g.score1}-${g.score2}`).join(" | ")
        );
      }
    } catch (err) {
      console.error(`[liquipedia-rl] erreur completed ${match.page}:`, err.message);
    }
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
  console.log(
    "[liquipedia-rl] démarrage, poll ~120s (strict rate limit Liquipedia)"
  );

  async function loop() {
    try {
      await runOnce();
    } catch (err) {
      console.error("[liquipedia-rl] erreur générale:", err.message);
      consecutiveErrors++;
    }
    const next = getNextInterval();
    if (next > BASE_INTERVAL_MS) {
      console.log(
        `[liquipedia-rl] backoff: prochain poll dans ${Math.round(next / 1000)}s`
      );
    }
    setTimeout(loop, next);
  }

  setTimeout(loop, 12000);
}

export { startRlScraper, getRL_ScrapedScores, rlScrapedScores };
