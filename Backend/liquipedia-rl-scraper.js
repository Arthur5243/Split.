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

  // Helper: parse a single .match-info element into a match entry
  function parseMatchInfo($el) {
    // Team names from opponent spans
    const opponents = $el.find(".match-info-header-opponent .name");
    const team1 = opponents.eq(0).text().trim();
    const team2 = opponents.eq(1).text().trim();

    // Score from the scoreholder (e.g. "3 : 1" when completed, "vs" when upcoming)
    const scoreText = $el
      .find(".match-info-header-scoreholder-score")
      .text()
      .trim();

    // Tournament page link
    const pageLink = $el
      .find(".match-info-tournament a[href*='/rocketleague/']")
      .first()
      .attr("href");

    // Detect LIVE from countdown area text
    const countdownText = $el
      .find(".match-info-countdown")
      .text()
      .toUpperCase();
    const isLive = countdownText.includes("LIVE");

    // Check for a completed numeric score like "3 : 1"
    const hasScore = /\d+\s*[:–-]\s*\d+/.test(scoreText);

    return { team1, team2, scoreText, pageLink, isLive, hasScore };
  }

  // Section 1: Upcoming / Live matches (data-toggle-area-content="1" or no toggle wrapper)
  $('[data-toggle-area-content="1"] .match-info, ' +
    '.match-info').each((_, el) => {
    const $el = $(el);
    // Skip if inside the completed section — we handle it separately
    if ($el.closest('[data-toggle-area-content="2"]').length) return;

    const m = parseMatchInfo($el);
    if (!m.isLive || !m.team1 || !m.team2) return;

    const page = m.pageLink
      ? m.pageLink.replace(`/${WIKI}/`, "")
      : null;
    if (page) {
      live.push({ page, team1: m.team1, team2: m.team2 });
    }
  });

  // Section 2: Completed matches (data-toggle-area-content="2")
  $('[data-toggle-area-content="2"] .match-info').each((_, el) => {
    const $el = $(el);
    const m = parseMatchInfo($el);
    if (!m.hasScore || !m.team1 || !m.team2) return;

    const page = m.pageLink
      ? m.pageLink.replace(`/${WIKI}/`, "")
      : null;
    if (page) {
      completed.push({ page, team1: m.team1, team2: m.team2 });
    }
  });

  // Also pick up live matches from the completed section (rare but possible)
  $('[data-toggle-area-content="2"] .match-info').each((_, el) => {
    const $el = $(el);
    const m = parseMatchInfo($el);
    if (!m.isLive || !m.team1 || !m.team2) return;

    const page = m.pageLink
      ? m.pageLink.replace(`/${WIKI}/`, "")
      : null;
    if (page) {
      // Avoid duplicates
      if (!live.some(l => l.page === page && l.team1 === m.team1 && l.team2 === m.team2)) {
        live.push({ page, team1: m.team1, team2: m.team2 });
      }
    }
  });

  // Fallback: if no toggle sections found, scan all .match-info elements
  if (live.length === 0 && completed.length === 0) {
    $(".match-info").each((_, el) => {
      const $el = $(el);
      const m = parseMatchInfo($el);
      if (!m.team1 || !m.team2 || !m.pageLink) return;

      const page = m.pageLink.replace(`/${WIKI}/`, "");

      if (m.isLive) {
        live.push({ page, team1: m.team1, team2: m.team2 });
      } else if (m.hasScore) {
        completed.push({ page, team1: m.team1, team2: m.team2 });
      }
    });
  }

  return { live, completed };
}

async function getGameScores(pageName, team1, team2) {
  const html = await apiParse(pageName);
  const $ = load(html);

  const norm = (s) =>
    (s || "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .trim()
      .toLowerCase();
  const t1 = norm(team1);
  const t2 = norm(team2);

  let bestGames = [];

  $(".brkts-popup").each((_, popup) => {
    const $popup = $(popup);
    const headerOpps = $popup.find(".brkts-popup-header-opponent");
    if (headerOpps.length < 2) return;

    const oppName1 = norm(headerOpps.eq(0).text());
    const oppName2 = norm(headerOpps.eq(1).text());

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

      const leftText = spaced
        .eq(0)
        .clone()
        .children()
        .remove()
        .end()
        .text()
        .trim();
      const rightText = spaced
        .eq(spaced.length - 1)
        .clone()
        .children()
        .remove()
        .end()
        .text()
        .trim();

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
      const games = await getGameScores(match.page, match.team1, match.team2);
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
      const games = await getGameScores(match.page, match.team1, match.team2);
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
