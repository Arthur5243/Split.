/**
 * Endpoints Rocket League : /api/rl-upcoming, /api/rl-live, /api/rl-results.
 *
 * PandaScore pour les matchs + score de série, Liquipedia pour les scores
 * par game (buts). Pas de "maps" en RL, juste des games.
 *
 * PandaScore slug : "rl" (Rocket League Championship Series / RLCS).
 */

import express from "express";
import {
  cachedFetch,
  sleep,
  classifyTeamRegion,
} from "./cs2-scores.js";
import { searchTournamentPages, getWikitext, findMatchInWikitext, isRateLimited } from "./liquipedia-rl-scores.js";

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

router.get("/api/rl-results", async (req, res) => {
  try {
    if (rlResultsCache.data && Date.now() - rlResultsCache.at < RL_RESULTS_CACHE_TTL) {
      return res.json(rlResultsCache.data);
    }

    const data = await cachedFetch("rl-results", "/" + RL_SLUG + "/matches/past?per_page=50");
    const visible = (data || []).filter((m) => !isFullyUnknown(m) && isNotableTier(m));
    const enriched = visible.map((m) => attachTeamRegions(m));

    const byLeague = new Map();
    for (const m of enriched) {
      const key = m.league?.slug || m.league?.name || "unknown";
      if (!byLeague.has(key)) byLeague.set(key, []);
      byLeague.get(key).push(m);
    }

    const skipLiquipedia = isRateLimited();
    if (skipLiquipedia) console.log("[rl-results] Liquipedia rate-limited, using PandaScore fallback");

    for (const [, matches] of byLeague) {
      let wikitexts = [];

      if (!skipLiquipedia) {
        const sample = matches[0];
        const leagueName = sample.league?.name || "";
        const tournamentName = sample.tournament?.name || "";
        const year = sample.begin_at ? sample.begin_at.slice(0, 4) : "";

        const rawQueries = [
          `${leagueName} ${year} ${tournamentName}`.trim(),
          `${leagueName} ${year}`.trim(),
          leagueName,
        ];
        const queries = [...new Set(rawQueries)].filter((q) => q && q.length > 2 && !/^\d{4}$/.test(q));

        const seen = new Set();
        const pageQueue = [];
        for (const q of queries) {
          if (pageQueue.length >= 5 || isRateLimited()) break;
          try {
            const pages = await searchTournamentPages(q);
            for (const p of pages) {
              if (!seen.has(p)) { seen.add(p); pageQueue.push(p); }
            }
          } catch (e) {
            console.log(`[rl-results] search("${q}") error:`, e.message);
          }
        }

        for (const page of pageQueue.slice(0, 3)) {
          if (isRateLimited()) break;
          try {
            const wt = await getWikitext(page);
            if (wt) wikitexts.push({ title: page, text: wt });
          } catch (e) {
            console.log(`[rl-results] wikitext("${page}") error:`, e.message);
          }
        }
      }

      for (const m of matches) {
        const t1 = m.opponents?.[0]?.opponent;
        const t2 = m.opponents?.[1]?.opponent;
        if (!t1 || !t2) { m.game_scores = null; continue; }
        const dateStr = m.begin_at ? m.begin_at.slice(0, 10) : null;
        let found = null;
        for (const { title, text } of wikitexts) {
          const { games } = findMatchInWikitext(text, t1.name, t2.name, dateStr);
          if (games) {
            console.log(`[rl-results] ${t1.name} vs ${t2.name} → found in "${title}" (${games.length} games)`);
            found = games;
            break;
          }
        }
        m.game_scores = found || buildFallbackGameScores(m);
      }
    }

    rlResultsCache = { data: enriched, at: Date.now() };
    res.json(enriched);
  } catch (e) {
    console.error("rl-results error:", e.message);
    res.status(502).json({ error: "Impossible de récupérer les résultats RL." });
  }
});

export default router;
