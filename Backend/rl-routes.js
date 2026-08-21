/**
 * Endpoints Rocket League : /api/rl-upcoming, /api/rl-live, /api/rl-results.
 * PandaScore pour les matchs + scores de série.
 * Scores par game (buts) : fichier local rl-manual-game-scores.json.
 * Slug PandaScore : "rl".
 */

import express from "express";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import {
  cachedFetch,
  sleep,
  classifyTeamRegion,
} from "./cs2-scores.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RL_SLUG = "rl";

const router = express.Router();

// --- Manual game scores (from Liquipedia, pre-fetched) ---
let manualGameScores = [];
try {
  const raw = readFileSync(join(__dirname, "rl-manual-game-scores.json"), "utf8");
  manualGameScores = JSON.parse(raw);
  console.log(`[rl] ${manualGameScores.length} entrée(s) chargée(s) depuis rl-manual-game-scores.json`);
} catch (e) {
  console.log("[rl] rl-manual-game-scores.json introuvable ou invalide");
}

function normalizeTeamName(name) {
  return (name || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const TEAM_ALIASES = {
  "nipesar": "ninjasinpyjamas",
  "nip": "ninjasinpyjamas",
  "vit": "teamvitality",
  "vitality": "teamvitality",
  "flcn": "teamfalcons",
  "falcons": "teamfalcons",
  "ssg": "spacestationgaming",
  "kc": "karminecore",
  "karminecore": "karminecorp",
  "nrgesports": "nrg",
  "furiaesports": "furia",
  "gentlemates": "gentlemates",
  "gm": "gentlemates",
};

function teamMatch(pandaName, manualName) {
  const a = normalizeTeamName(pandaName);
  const b = normalizeTeamName(manualName);
  if (!a || !b) return false;
  if (a === b || a.includes(b) || b.includes(a)) return true;
  const aa = TEAM_ALIASES[a] || a;
  const bb = TEAM_ALIASES[b] || b;
  return aa === bb || aa.includes(bb) || bb.includes(aa);
}

function findManualGameScores(team1Name, team2Name, dateStr) {
  for (const entry of manualGameScores) {
    const dateMatch = !dateStr || !entry.date || entry.date === dateStr;
    if (!dateMatch) continue;
    if (teamMatch(team1Name, entry.t1) && teamMatch(team2Name, entry.t2)) {
      return entry.games.map((g, i) => ({
        game: "Game " + (i + 1),
        score1: g.s1,
        score2: g.s2,
      }));
    }
    if (teamMatch(team1Name, entry.t2) && teamMatch(team2Name, entry.t1)) {
      return entry.games.map((g, i) => ({
        game: "Game " + (i + 1),
        score1: g.s2,
        score2: g.s1,
      }));
    }
  }
  return null;
}

// --- Helpers ---
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

    for (const m of enriched) {
      const t1 = m.opponents?.[0]?.opponent?.name;
      const t2 = m.opponents?.[1]?.opponent?.name;
      const dateStr = m.begin_at ? m.begin_at.slice(0, 10) : null;

      m.game_scores = findManualGameScores(t1, t2, dateStr) || buildFallbackGameScores(m);
    }

    rlResultsCache = { data: enriched, at: Date.now() };
    res.json(enriched);
  } catch (e) {
    console.error("rl-results error:", e.message);
    res.status(502).json({ error: "Impossible de récupérer les résultats RL." });
  }
});

export default router;
