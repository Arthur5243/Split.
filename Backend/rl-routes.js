/**
 * Endpoints Rocket League : /api/rl-upcoming, /api/rl-live, /api/rl-results.
 * PandaScore pour tout : matchs, scores de série, et scores par game (buts)
 * via /rl/games/{id}. Slug : "rl".
 */

import express from "express";
import {
  pandaFetch,
  cachedFetch,
  mapWithConcurrency,
  sleep,
  classifyTeamRegion,
} from "./cs2-scores.js";
// Liquipedia RL désactivé temporairement (rate limit 429)
// import { searchTournamentPages, getWikitext, findMatchInWikitext, isRateLimited } from "./liquipedia-rl-scores.js";

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

async function fetchRlGameScore(gameId, team1Id, team2Id) {
  let game;
  try {
    game = await pandaFetch("/" + RL_SLUG + "/games/" + gameId);
  } catch (e) {
    return null;
  }
  if (!game || game.finished !== true) return null;

  const teams = Array.isArray(game.teams) ? game.teams : [];
  const r1 = teams.find((t) => t && String(t.team_id) === String(team1Id));
  const r2 = teams.find((t) => t && String(t.team_id) === String(team2Id));
  if (!r1 || !r2 || r1.score == null || r2.score == null) return null;

  return { score1: r1.score, score2: r2.score };
}

async function getGameScoresForMatch(m) {
  const t1 = m.opponents?.[0]?.opponent;
  const t2 = m.opponents?.[1]?.opponent;
  if (!t1 || !t2) return null;
  const games = Array.isArray(m.games) ? m.games : [];
  const played = games
    .filter((g) => g && g.status === "finished" && g.winner)
    .sort((a, b) => (a.position || 0) - (b.position || 0));
  if (played.length === 0) return null;

  const results = new Array(played.length).fill(null);
  await mapWithConcurrency(played, 3, async (g) => {
    const idx = played.indexOf(g);
    results[idx] = await fetchRlGameScore(g.id, t1.id, t2.id);
  });

  const scores = results
    .filter((r) => r !== null)
    .map((r, i) => ({ game: "Game " + (i + 1), score1: r.score1, score2: r.score2 }));
  return scores.length > 0 ? scores : null;
}

router.get("/api/rl-results", async (req, res) => {
  try {
    if (rlResultsCache.data && Date.now() - rlResultsCache.at < RL_RESULTS_CACHE_TTL) {
      return res.json(rlResultsCache.data);
    }

    const data = await cachedFetch("rl-results", "/" + RL_SLUG + "/matches/past?per_page=50");
    const visible = (data || []).filter((m) => !isFullyUnknown(m) && isNotableTier(m));
    const enriched = visible.map((m) => attachTeamRegions(m));

    await mapWithConcurrency(enriched, 3, async (m) => {
      m.game_scores = await getGameScoresForMatch(m);
    });

    rlResultsCache = { data: enriched, at: Date.now() };
    res.json(enriched);
  } catch (e) {
    console.error("rl-results error:", e.message);
    res.status(502).json({ error: "Impossible de récupérer les résultats RL." });
  }
});

export default router;
