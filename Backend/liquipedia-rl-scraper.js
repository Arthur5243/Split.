/**
 * Liquipedia Rocket League live scraper — ESM backend worker.
 * Uses the official Liquipedia MediaWiki API (action=parse).
 *
 * STRICT rate limit: 1 parse request per 30 seconds minimum.
 * User-Agent must identify the app + contact.
 * Content licensed CC-BY-SA — attribution required if displayed publicly.
 *
 * Exports getRL_ScrapedScores() for the RL enrichment pipeline.
 */

import { load } from "cheerio";

const WIKI = "rocketleague";
const API_BASE = `https://liquipedia.net/${WIKI}/api.php`;
const USER_AGENT =
  process.env.LIQUIPEDIA_USER_AGENT ||
  "SplitLiveScoresBot/1.0 (contact: arthur.pro.busi@gmail.com)";

const rlScrapedScores = new Map();
const SCRAPED_TTL_MS = 15 * 60 * 1000;

let consecutiveErrors = 0;
const MAX_BACKOFF_MS = 10 * 60 * 1000;
const BASE_INTERVAL_MS = 120_000;

function normalize(s) {
  return (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

function getRL_ScrapedScores(team1Name, team2Name) {
  const now = Date.now();
  for (const [, entry] of rlScrapedScores) {
    if (now - entry.scrapedAt > SCRAPED_TTL_MS) continue;
    const t1 = normalize(entry.team1);
    const t2 = normalize(entry.team2);
    const q1 = normalize(team1Name);
    const q2 = normalize(team2Name);
    if ((t1 === q1 && t2 === q2) || (t1 === q2 && t2 === q1)) {
      const swap = t1 === q2;
      return entry.games.map((g) => ({
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

async function findLiveMatches() {
  const html = await apiParse("Liquipedia:Matches");
  const $ = load(html);
  const matches = [];

  $(".match, .infobox_matches_content").each((_, el) => {
    const $el = $(el);
    const isLive = $el
      .find(".versus-status, .match-countdown")
      .text()
      .toUpperCase()
      .includes("LIVE");
    if (!isLive) return;

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

    if (pageLink) {
      matches.push({
        page: pageLink.replace(`/${WIKI}/`, ""),
        team1,
        team2,
      });
    }
  });

  return matches;
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

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runOnce() {
  const liveMatches = await findLiveMatches();
  console.log(`[liquipedia-rl] ${liveMatches.length} match(s) live`);

  for (const match of liveMatches) {
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
      }
    } catch (err) {
      console.error(`[liquipedia-rl] erreur ${match.page}:`, err.message);
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
