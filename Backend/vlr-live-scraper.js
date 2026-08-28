/**
 * Scraper direct VLR.gg pour les scores par map des matchs LIVE Valorant.
 *
 * Intégré comme worker dans le backend (setInterval) — pas de process séparé.
 * Scrape la home VLR.gg pour trouver les matchs live, ouvre chaque page match
 * et lit les scores par map depuis le HTML (via cheerio).
 *
 * Les scores sont stockés dans un cache mémoire (liveScrapedScores) que
 * server.js consulte pour enrichir les matchs live/recently finished AVANT
 * que vlrggapi (ou PandaScore) n'ait le score — gain de temps de 5-15 min.
 */

import { load } from "cheerio";

const VLR_BASE_URL = "https://www.vlr.gg";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (compatible; SplitScoreBot/1.0; +https://github.com/Arthur5243/Split)",
  Accept: "text/html",
};

const liveScrapedScores = new Map();
const SCRAPED_TTL_MS = 15 * 60 * 1000;

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

function getScrapedScores(team1Name, team2Name) {
  const now = Date.now();
  for (const [, entry] of liveScrapedScores) {
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
    throw new Error(`HTTP ${res.status} (rate-limited)`);
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  consecutiveErrors = Math.max(0, consecutiveErrors - 1);
  return res.text();
}

async function findLiveMatches() {
  const html = await fetchHtml(VLR_BASE_URL);
  const $ = load(html);

  const liveMatches = [];

  $(".js-home-matches-upcoming a.wf-module-item").each((_, el) => {
    const $item = $(el);
    const isLive = $item.find(".h-match-eta.mod-live").length > 0;
    if (!isLive) return;

    const href = ($item.attr("href") || "").trim();
    const matchUrl = href.startsWith("http") ? href : `${VLR_BASE_URL}${href.startsWith("/") ? "" : "/"}${href}`;

    const teams = $item
      .find(".h-match-team-name")
      .map((__, t) => $(t).text().trim())
      .get();

    liveMatches.push({
      matchUrl,
      team1: teams[0] || "TBD",
      team2: teams[1] || "TBD",
    });
  });

  return liveMatches;
}

async function scrapeMapScores(matchUrl) {
  const html = await fetchHtml(matchUrl);
  const $ = load(html);

  const maps = [];

  $("div.vm-stats-game").each((_, gameEl) => {
    const $game = $(gameEl);
    if ($game.attr("data-game-id") === "all") return;

    const header = $game.find(".vm-stats-game-header");

    const $mapContainer = header.find(".map").first();
    let mapName = "";
    $mapContainer.find("span").each((__, sp) => {
      if (mapName) return;
      const txt = $(sp).text().trim();
      if (txt && !txt.toLowerCase().startsWith("pick")) {
        mapName = txt;
      }
    });
    if (!mapName) {
      mapName = $mapContainer.text().trim().split("\n")[0].trim();
      mapName = mapName.replace(/\s*\d{1,2}:\d{2}(:\d{2})?\s*$/, "").trim();
    }
    mapName = mapName.replace(/\s*(PICK|BAN|DECIDER)\s*$/i, "").trim();

    const scoreSpans = header.find(".team .score");
    const score1 = scoreSpans.eq(0).text().trim();
    const score2 = scoreSpans.eq(1).text().trim();

    if (!score1 && !score2) return;

    maps.push({
      map: mapName || `Map ${maps.length + 1}`,
      score1: Number(score1) || 0,
      score2: Number(score2) || 0,
    });
  });

  return maps;
}

async function runOnce() {
  const liveMatches = await findLiveMatches();
  console.log(
    `[vlr-scraper] ${liveMatches.length} match(s) live`
  );

  for (const match of liveMatches) {
    try {
      const maps = await scrapeMapScores(match.matchUrl);

      if (maps.length > 0) {
        const key = normalize(match.team1) + ":" + normalize(match.team2);
        liveScrapedScores.set(key, {
          team1: match.team1,
          team2: match.team2,
          matchUrl: match.matchUrl,
          maps,
          scrapedAt: Date.now(),
        });

        console.log(
          `[vlr-scraper] ${match.team1} vs ${match.team2} →`,
          maps
            .map((m) => `${m.map}: ${m.score1}-${m.score2}`)
            .join(" | ")
        );
      }
    } catch (err) {
      console.error(
        `[vlr-scraper] erreur ${match.matchUrl}:`,
        err.message
      );
    }
  }

  const now = Date.now();
  for (const [key, entry] of liveScrapedScores) {
    if (now - entry.scrapedAt > SCRAPED_TTL_MS) {
      liveScrapedScores.delete(key);
    }
  }
}

function getNextInterval() {
  if (consecutiveErrors === 0) return BASE_INTERVAL_MS;
  const backoff = Math.min(
    BASE_INTERVAL_MS * Math.pow(2, consecutiveErrors),
    MAX_BACKOFF_MS
  );
  return backoff;
}

function startScraper() {
  console.log("[vlr-scraper] démarrage, poll ~60s (backoff si rate-limited)");

  async function loop() {
    try {
      await runOnce();
    } catch (err) {
      console.error("[vlr-scraper] erreur générale:", err.message);
      consecutiveErrors++;
    }
    const next = getNextInterval();
    if (next > BASE_INTERVAL_MS) {
      console.log(
        `[vlr-scraper] backoff: prochain poll dans ${Math.round(next / 1000)}s`
      );
    }
    setTimeout(loop, next);
  }

  setTimeout(loop, 5000);
}

export { startScraper, getScrapedScores, liveScrapedScores };
