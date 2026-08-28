/**
 * HLTV live scraper — ESM backend worker for CS2 map scores.
 * Same pattern as vlr-live-scraper.js: background polling, in-memory cache,
 * exported getHltvScrapedScores() for enrichment pipeline fallback.
 *
 * WARNING: HLTV uses Cloudflare protection. Datacenter IPs (Railway) will
 * likely get blocked. Works best from residential IPs. On block, the scraper
 * backs off exponentially and retries — it won't crash, just won't produce
 * data until CF lets it through.
 */

import { load } from "cheerio";

const HLTV_BASE = "https://www.hltv.org";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9,fr;q=0.8",
};

const hltvScrapedScores = new Map();
const SCRAPED_TTL_MS = 15 * 60 * 1000;

let consecutiveErrors = 0;
const MAX_BACKOFF_MS = 10 * 60 * 1000;
const BASE_INTERVAL_MS = 90_000;

function normalize(s) {
  return (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

function getHltvScrapedScores(team1Name, team2Name) {
  const now = Date.now();
  for (const [, entry] of hltvScrapedScores) {
    if (now - entry.scrapedAt > SCRAPED_TTL_MS) continue;
    const t1 = normalize(entry.team1);
    const t2 = normalize(entry.team2);
    const q1 = normalize(team1Name);
    const q2 = normalize(team2Name);
    if ((t1 === q1 && t2 === q2) || (t1 === q2 && t2 === q1)) {
      const swap = t1 === q2;
      return entry.maps.map((m) => ({
        map: m.map,
        score1: swap ? m.score2 : m.score1,
        score2: swap ? m.score1 : m.score2,
      }));
    }
  }
  return null;
}

async function fetchHtml(url) {
  const res = await fetch(url, { headers: HEADERS });
  if (res.status === 403 || res.status === 429) {
    consecutiveErrors++;
    throw new Error(`HTTP ${res.status} (rate-limited/blocked)`);
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const html = await res.text();
  if (
    html.includes("Just a moment") ||
    html.includes("cf-browser-verification")
  ) {
    consecutiveErrors++;
    throw new Error("Cloudflare challenge detected");
  }
  consecutiveErrors = Math.max(0, consecutiveErrors - 1);
  return html;
}

async function findLiveMatches() {
  const html = await fetchHtml(`${HLTV_BASE}/matches`);
  const $ = load(html);
  const matches = [];

  $("div.liveMatch-container").each((_, el) => {
    const $el = $(el);
    const link = $el.find("a.match, a.a-reset").first().attr("href");
    const team1 = $el.find(".matchTeamName").eq(0).text().trim();
    const team2 = $el.find(".matchTeamName").eq(1).text().trim();

    if (link) {
      const href = link.startsWith("http")
        ? link
        : `${HLTV_BASE}${link.startsWith("/") ? "" : "/"}${link}`;
      matches.push({ matchUrl: href, team1, team2 });
    }
  });

  return matches;
}

async function scrapeMapScores(matchUrl) {
  const html = await fetchHtml(matchUrl);
  const $ = load(html);
  const maps = [];

  $("div.mapholder").each((i, el) => {
    const $el = $(el);
    const mapName = $el.find(".mapname").first().text().trim();
    if (!mapName) return;

    const scores = $el
      .find(".results-team-score")
      .map((_, s) => $(s).text().trim())
      .get()
      .filter((s) => s !== "");

    if (scores.length >= 2) {
      maps.push({
        map: mapName,
        score1: Number(scores[0]) || 0,
        score2: Number(scores[1]) || 0,
      });
    }
  });

  return maps;
}

async function runOnce() {
  const liveMatches = await findLiveMatches();
  console.log(`[hltv-scraper] ${liveMatches.length} match(s) live`);

  for (const match of liveMatches) {
    try {
      const maps = await scrapeMapScores(match.matchUrl);
      if (maps.length > 0) {
        const key = normalize(match.team1) + ":" + normalize(match.team2);
        hltvScrapedScores.set(key, {
          team1: match.team1,
          team2: match.team2,
          matchUrl: match.matchUrl,
          maps,
          scrapedAt: Date.now(),
        });
        console.log(
          `[hltv-scraper] ${match.team1} vs ${match.team2} →`,
          maps.map((m) => `${m.map}: ${m.score1}-${m.score2}`).join(" | ")
        );
      }
    } catch (err) {
      console.error(`[hltv-scraper] erreur ${match.matchUrl}:`, err.message);
    }
  }

  const now = Date.now();
  for (const [key, entry] of hltvScrapedScores) {
    if (now - entry.scrapedAt > SCRAPED_TTL_MS) {
      hltvScrapedScores.delete(key);
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

function startHltvScraper() {
  console.log(
    "[hltv-scraper] démarrage, poll ~90s (backoff si Cloudflare/rate-limited)"
  );

  async function loop() {
    try {
      await runOnce();
    } catch (err) {
      console.error("[hltv-scraper] erreur générale:", err.message);
      consecutiveErrors++;
    }
    const next = getNextInterval();
    if (next > BASE_INTERVAL_MS) {
      console.log(
        `[hltv-scraper] backoff: prochain poll dans ${Math.round(next / 1000)}s`
      );
    }
    setTimeout(loop, next);
  }

  setTimeout(loop, 8000);
}

export { startHltvScraper, getHltvScrapedScores, hltvScrapedScores };
