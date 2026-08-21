/**
 * Endpoints Rocket League : /api/rl-upcoming, /api/rl-live, /api/rl-results.
 * PandaScore pour les matchs + scores de série.
 * Liquipedia pour les vrais scores par game (buts).
 * Slug PandaScore : "rl".
 */

import express from "express";
import {
  cachedFetch,
  sleep,
  classifyTeamRegion,
} from "./cs2-scores.js";
import {
  searchTournamentPages,
  getCachedSearch,
  getWikitext,
  getCachedWikitext,
  findMatchInWikitext,
  isRateLimited,
} from "./liquipedia-rl-scores.js";

const RL_SLUG = "rl";

const router = express.Router();

function isFullyUnknown(m) {
  const t1 = m.opponents?.[0]?.opponent;
  const t2 = m.opponents?.[1]?.opponent;
  return !t1 && !t2;
}

const EXCLUDED_TIERS = ["d"];
function isNotableTier(m) {
  const tier = (m.tournament?.tier || "").toLowerCase();
  if (!tier) return true;
  return !EXCLUDED_TIERS.includes(tier);
}

const OCEANIA_CODES = new Set(["AU", "NZ"]);
function classifyTeamRegionRL(location) {
  if (!location) return null;
  const code = String(location).toUpperCase();
  if (OCEANIA_CODES.has(code)) return "OCEANIA";
  return classifyTeamRegion(code);
}

function attachTeamRegions(m) {
  const t1 = m.opponents?.[0]?.opponent;
  const t2 = m.opponents?.[1]?.opponent;
  m.team1_region = t1 ? classifyTeamRegionRL(t1.location) : null;
  m.team2_region = t2 ? classifyTeamRegionRL(t2.location) : null;

  const streams = Array.isArray(m.streams_list) ? m.streams_list : [];
  const bestStream =
    streams.find((s) => s && s.official && s.main) ||
    streams.find((s) => s && s.official) ||
    streams[0] ||
    null;
  m.stream_url = (bestStream && (bestStream.raw_url || bestStream.embed_url)) || null;

  return m;
}

// --- /api/rl-upcoming ---
router.get("/api/rl-upcoming", async (req, res) => {
  try {
    const PER_PAGE = 100;
    const MAX_PAGES = 20;
    let all = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const pageData = await cachedFetch(
        "rl-upcoming-" + page,
        "/" + RL_SLUG + "/matches/upcoming?per_page=" + PER_PAGE + "&page=" + page + "&sort=begin_at"
      );
      if (!pageData || pageData.length === 0) break;
      all = all.concat(pageData);
      if (pageData.length < PER_PAGE) break;
      await sleep(200);
    }
    const seenIds = new Set();
    const deduped = all.filter((m) => {
      if (seenIds.has(m.id)) return false;
      seenIds.add(m.id);
      return true;
    });
    const now = Date.now();
    const data = deduped
      .filter((m) => !isFullyUnknown(m) && isNotableTier(m))
      .filter((m) => {
        if (!m.begin_at) return true;
        const t = new Date(m.begin_at).getTime();
        return Number.isNaN(t) || t > now;
      })
      .map(attachTeamRegions);
    res.json(data);
  } catch (e) {
    console.error("rl-upcoming error:", e.message);
    res.status(502).json({ error: "Impossible de récupérer les matchs RL à venir." });
  }
});

// --- /api/rl-live ---
const ABSOLUTE_HIDE_THRESHOLD_MS = 6 * 60 * 60 * 1000;

router.get("/api/rl-live", async (req, res) => {
  try {
    const data = await cachedFetch("rl-live", "/" + RL_SLUG + "/matches/running?per_page=50");
    const now = Date.now();
    const visible = (data || []).filter((m) => {
      if (!isNotableTier(m)) return false;
      if (m.status !== "running") return true;
      const beginAt = m.begin_at ? new Date(m.begin_at).getTime() : null;
      return !(beginAt && now - beginAt >= ABSOLUTE_HIDE_THRESHOLD_MS);
    });
    res.json(visible.map(attachTeamRegions));
  } catch (e) {
    console.error("rl-live error:", e.message);
    res.status(502).json({ error: "Impossible de récupérer les matchs RL en direct." });
  }
});

// --- /api/rl-results ---
let rlResultsCache = { data: null, at: 0 };
const RL_RESULTS_CACHE_TTL = 5 * 60 * 1000;
let enrichmentRunning = false;

function buildFallbackGameScores(m) {
  const t1 = m.opponents?.[0]?.opponent;
  const t2 = m.opponents?.[1]?.opponent;
  if (!t1 || !t2) return null;
  const games = Array.isArray(m.games) ? m.games : [];
  const played = games
    .filter((g) => g && g.status === "finished" && g.winner)
    .sort((a, b) => (a.position || 0) - (b.position || 0));
  if (played.length === 0) return null;
  return played.map((g, i) => ({
    game: "Game " + (i + 1),
    score1: String(g.winner.id) === String(t1.id) ? 1 : 0,
    score2: String(g.winner.id) === String(t2.id) ? 1 : 0,
  }));
}

function buildSerieQuery(m) {
  const league = m.league?.name || "";
  const serie = m.serie?.full_name || m.serie?.name || "";
  const year = m.begin_at ? m.begin_at.slice(0, 4) : "";
  const parts = [league, serie].filter((n) => n && !/^\d{4}$/.test(n.trim()));
  if (parts.length === 0) return null;
  const q = parts.join(" ") + (year && !parts.some((p) => p.includes(year)) ? " " + year : "");
  return q.trim() || null;
}

function enrichFromCache(matches, groups) {
  let found = false;
  for (const [, group] of groups) {
    if (!group.query) continue;
    const cachedTitles = getCachedSearch(group.query);
    if (!cachedTitles) continue;
    const validPages = cachedTitles.filter(
      (t) => !/((^|\/)([a-e]|s)-tier tournaments|qualifier tournaments|tier tournaments)/i.test(t)
    );
    for (const pageTitle of validPages.slice(0, 2)) {
      const wikitext = getCachedWikitext(pageTitle);
      if (!wikitext) continue;
      for (const m of group.matches) {
        if (m._liquipediaScores) continue;
        const t1 = m.opponents?.[0]?.opponent?.name;
        const t2 = m.opponents?.[1]?.opponent?.name;
        if (!t1 || !t2) continue;
        const dateStr = m.begin_at ? m.begin_at.slice(0, 10) : null;
        const { games } = findMatchInWikitext(wikitext, t1, t2, dateStr);
        if (games && games.length > 0) {
          m.game_scores = games;
          m._liquipediaScores = true;
          found = true;
        }
      }
    }
  }
  return found;
}

async function enrichWithLiquipedia(matches) {
  const groups = new Map();
  for (const m of matches) {
    const serieId = m.serie?.id || m.league?.id || "unknown";
    if (!groups.has(serieId)) groups.set(serieId, { matches: [], query: buildSerieQuery(m) });
    groups.get(serieId).matches.push(m);
  }

  if (enrichFromCache(matches, groups)) {
    console.log("[rl-liquipedia] enriched from cache (no API calls)");
    return true;
  }

  if (isRateLimited()) {
    console.log("[rl-liquipedia] rate-limited, skipping API enrichment");
    return false;
  }

  await sleep(5000);

  if (isRateLimited()) {
    console.log("[rl-liquipedia] rate-limited after delay, skipping");
    return false;
  }

  let enriched = false;
  for (const [, group] of groups) {
    if (!group.query || isRateLimited()) continue;

    let pageTitles;
    try {
      pageTitles = await searchTournamentPages(group.query);
    } catch (e) {
      console.log(`[rl-liquipedia] search("${group.query}") error:`, e.message);
      continue;
    }

    const validPages = (pageTitles || []).filter(
      (t) => !/((^|\/)([a-e]|s)-tier tournaments|qualifier tournaments|tier tournaments)/i.test(t)
    );
    if (validPages.length === 0) continue;

    for (const pageTitle of validPages.slice(0, 2)) {
      if (isRateLimited()) break;
      let wikitext;
      try {
        wikitext = await getWikitext(pageTitle);
      } catch (e) {
        console.log(`[rl-liquipedia] wikitext("${pageTitle}") error:`, e.message);
        continue;
      }
      if (!wikitext) continue;

      for (const m of group.matches) {
        if (m._liquipediaScores) continue;
        const t1 = m.opponents?.[0]?.opponent?.name;
        const t2 = m.opponents?.[1]?.opponent?.name;
        if (!t1 || !t2) continue;
        const dateStr = m.begin_at ? m.begin_at.slice(0, 10) : null;
        const { games } = findMatchInWikitext(wikitext, t1, t2, dateStr);
        if (games && games.length > 0) {
          m.game_scores = games;
          m._liquipediaScores = true;
          enriched = true;
          console.log(`[rl-liquipedia] ${t1} vs ${t2} → ${games.length} games from "${pageTitle}"`);
        }
      }
    }
  }
  return enriched;
}

function runBackgroundEnrichment(matches) {
  if (enrichmentRunning) return;
  enrichmentRunning = true;
  enrichWithLiquipedia(matches)
    .then((didEnrich) => {
      if (didEnrich) {
        rlResultsCache = { data: matches, at: Date.now() };
        console.log("[rl-liquipedia] background enrichment done, cache updated");
      } else {
        console.log("[rl-liquipedia] background enrichment: no new scores found");
      }
    })
    .catch((e) => console.log("[rl-liquipedia] background enrichment error:", e.message))
    .finally(() => { enrichmentRunning = false; });
}

router.get("/api/rl-results", async (req, res) => {
  try {
    if (rlResultsCache.data && Date.now() - rlResultsCache.at < RL_RESULTS_CACHE_TTL) {
      return res.json(rlResultsCache.data);
    }

    const data = await cachedFetch("rl-results", "/" + RL_SLUG + "/matches/past?per_page=50");
    const visible = (data || []).filter((m) => !isFullyUnknown(m) && isNotableTier(m));
    const enriched = visible.map((m) => attachTeamRegions(m));

    for (const m of enriched) {
      m.game_scores = buildFallbackGameScores(m);
    }

    const groups = new Map();
    for (const m of enriched) {
      const serieId = m.serie?.id || m.league?.id || "unknown";
      if (!groups.has(serieId)) groups.set(serieId, { matches: [], query: buildSerieQuery(m) });
      groups.get(serieId).matches.push(m);
    }
    if (enrichFromCache(enriched, groups)) {
      console.log("[rl-liquipedia] sync enrichment from cache succeeded");
    }

    rlResultsCache = { data: enriched, at: Date.now() };
    res.json(enriched);

    if (!enriched.some((m) => m._liquipediaScores)) {
      runBackgroundEnrichment(enriched);
    }
  } catch (e) {
    console.error("rl-results error:", e.message);
    res.status(502).json({ error: "Impossible de récupérer les résultats RL." });
  }
});

export default router;
