/**
 * Endpoints Rocket League : /api/rl-upcoming, /api/rl-live, /api/rl-results.
 * PandaScore pour les matchs + scores de série.
 * Scores par game (buts) : fichier local rl-manual-game-scores.json.
 * Slug PandaScore : "rl".
 */

import express from "express";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import {
  cachedFetch,
  pandaFetch,
  sleep,
  classifyTeamRegion,
} from "./cs2-scores.js";
import { getRL_ScrapedScores } from "./liquipedia-rl-scraper.js";

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
  "nipestar": "ninjasinpyjamas",
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
    res.json(visible.map((m) => {
      const enriched = attachTeamRegions(m);
      if (m.status === "running") {
        const t1 = m.opponents?.[0]?.opponent?.name;
        const t2 = m.opponents?.[1]?.opponent?.name;
        if (t1 && t2) {
          const scraped = getRL_ScrapedScores(t1, t2);
          if (scraped) enriched.live_game_scores = scraped;
        }
      }
      return enriched;
    }));
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

      const scraped = t1 && t2 ? getRL_ScrapedScores(t1, t2) : null;
      const manual = scraped || findManualGameScores(t1, t2, dateStr);
      if (!manual && t1 && t2) {
        console.log(`[rl] no scores for "${t1}" vs "${t2}" (${dateStr}) → fallback`);
      }
      m.game_scores = manual || buildFallbackGameScores(m);
    }

    rlResultsCache = { data: enriched, at: Date.now() };
    res.json(enriched);
  } catch (e) {
    console.error("rl-results error:", e.message);
    res.status(502).json({ error: "Impossible de récupérer les résultats RL." });
  }
});

// --- /api/rl-match-history ---
const RL_MATCHES_PATH = join(__dirname, "data", "matches-rl.json");

function toPandaScoreShapeRL(m, index) {
  const id1 = "rlh1_" + (m.match_id ?? index);
  const id2 = "rlh2_" + (m.match_id ?? index);
  const parts = (m.score || "").split("-").map((s) => parseInt(s.trim(), 10));
  const hasScore = parts.length === 2 && !Number.isNaN(parts[0]) && !Number.isNaN(parts[1]);

  return {
    id: m.pandascore_id || "rl_hist_" + m.match_id,
    begin_at: m.date ? m.date + "T00:00:00Z" : null,
    status: "finished",
    tier: m.tier || null,
    tournament: { name: m.tournament_name },
    serie: { full_name: m.tournament_name, name: m.tournament_name },
    league: { name: m.tournament_name || "RLCS" },
    opponents: [
      { opponent: { id: id1, name: m.team1, acronym: null, image_url: null } },
      { opponent: { id: id2, name: m.team2, acronym: null, image_url: null } },
    ],
    results: hasScore
      ? [
          { team_id: id1, score: parts[0] },
          { team_id: id2, score: parts[1] },
        ]
      : [],
  };
}

router.get("/api/rl-match-history", (req, res) => {
  try {
    if (!existsSync(RL_MATCHES_PATH)) {
      return res.json([]);
    }
    const raw = readFileSync(RL_MATCHES_PATH, "utf-8");
    const matches = JSON.parse(raw);
    const usable = matches.filter((m) => m.team1 && m.team2 && m.team1 !== "TBD" && m.team2 !== "TBD");
    res.json(usable.map(toPandaScoreShapeRL));
  } catch (e) {
    console.error("rl-match-history error:", e.message);
    res.status(500).json({ error: "Impossible de lire l'historique RL." });
  }
});

// RL Bracket system — /api/rl-events + /api/rl-bracket/:serieId
// ---------------------------------------------------------------------------

const rlEventsCache = { data: null, at: 0 };
const RL_EVENTS_TTL = 10 * 60 * 1000;

function classifyRLCompetition(leagueName, serieName) {
  const l = (leagueName || "").toLowerCase();
  const s = (serieName || "").toLowerCase();
  const combined = l + " " + s;

  if (combined.includes("major")) return "major";
  if (combined.includes("world") || combined.includes("championship")) return "worlds";
  if (combined.includes("regional") || combined.includes("open")) return "regional";
  if (combined.includes("rlcs")) return "rlcs";
  if (combined.includes("elemental")) return "elemental";
  return null;
}

router.get("/api/rl-events", async (req, res) => {
  try {
    if (rlEventsCache.data && Date.now() - rlEventsCache.at < RL_EVENTS_TTL) {
      return res.json(rlEventsCache.data);
    }

    const all = await pandaFetch("/" + RL_SLUG + "/series?sort=-begin_at&per_page=100");
    const deduped = all || [];

    const result = { rlcs: [], major: [], worlds: [], regional: [] };

    for (const s of deduped) {
      const leagueName = s.league?.name || "";
      const serieName = s.full_name || s.name || "";
      const comp = classifyRLCompetition(leagueName, serieName);
      if (!comp) continue;

      const bucket = comp === "rlcs" || comp === "elemental" ? "rlcs" :
        comp === "major" ? "major" :
        comp === "worlds" ? "worlds" :
        comp === "regional" ? "regional" : null;
      if (!bucket) continue;

      const info = {
        serie_id: s.id,
        title: serieName || leagueName,
        league: leagueName,
        status: s.status || "unknown",
        begin_at: s.begin_at,
        end_at: s.end_at,
        tier: (s.tier || "").toLowerCase(),
        type: comp,
        year: s.year,
      };

      result[bucket].push(info);
    }

    for (const key of Object.keys(result)) {
      result[key].sort((a, b) => {
        if (a.status === "running" && b.status !== "running") return -1;
        if (b.status === "running" && a.status !== "running") return 1;
        return (b.begin_at || "").localeCompare(a.begin_at || "");
      });
    }

    rlEventsCache.data = result;
    rlEventsCache.at = Date.now();
    res.json(result);
  } catch (e) {
    console.error("rl-events error:", e.message);
    res.status(502).json({ error: "Impossible de récupérer les events RL." });
  }
});

const rlBracketCache = new Map();
const RL_BRACKET_TTL = 5 * 60 * 1000;

function classifyRLMatchRound(series) {
  const s = (series || "").toLowerCase().trim();
  if (s.includes("grand final")) return { bracket: "grand_final", round: s, sort: 100 };
  if (s.includes("upper") && s.includes("quarter")) return { bracket: "upper", round: s, sort: 10 };
  if (s.includes("upper") && s.includes("semi")) return { bracket: "upper", round: s, sort: 20 };
  if (s.includes("upper") && s.includes("final")) return { bracket: "upper", round: s, sort: 30 };
  if (s.includes("upper") || s.includes("winners")) return { bracket: "upper", round: s, sort: 25 };
  if (s.includes("lower") && s.includes("quarter")) return { bracket: "lower", round: s, sort: 10 };
  if (s.includes("lower") && s.includes("semi")) return { bracket: "lower", round: s, sort: 20 };
  if (s.includes("lower") && s.includes("final")) return { bracket: "lower", round: s, sort: 30 };
  if (s.includes("lower") || s.includes("losers")) return { bracket: "lower", round: s, sort: 25 };
  if (s.includes("decider") || s.includes("consolidation")) return { bracket: "lower", round: s, sort: 35 };
  if (s.includes("semifinal") || s.includes("semi-final")) return { bracket: "upper", round: s, sort: 45 };
  if (s.includes("quarterfinal") || s.includes("quarter-final")) return { bracket: "upper", round: s, sort: 40 };
  if (s.includes("final")) return { bracket: "grand_final", round: s, sort: 100 };
  return { bracket: "upper", round: s, sort: 5 };
}

function roundDisplayNameRL(bracket, sort) {
  if (bracket === "grand_final") return "Grand Final";
  const p = bracket === "upper" ? "Upper Bracket" : "Lower Bracket";
  if (sort === 5) return p + " Round 1";
  if (sort === 10) return p + " Quarterfinals";
  if (sort === 20) return p + " Semifinals";
  if (sort === 25) return p;
  if (sort === 30) return p + " Final";
  if (sort === 35) return p + " Decider";
  if (sort === 40) return "Quarterfinals";
  if (sort === 45) return "Semifinals";
  return p;
}

function buildRLBracket(matches) {
  const rounds = {};
  for (const m of matches) {
    const key = m.bracket + ":" + m.sort;
    if (!rounds[key]) rounds[key] = { name: roundDisplayNameRL(m.bracket, m.sort), bracket: m.bracket, sort: m.sort, matches: [] };
    rounds[key].matches.push(m);
  }
  for (const r of Object.values(rounds)) {
    r.matches.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  }
  const upper = Object.values(rounds).filter((r) => r.bracket === "upper").sort((a, b) => a.sort - b.sort);
  const lower = Object.values(rounds).filter((r) => r.bracket === "lower").sort((a, b) => a.sort - b.sort);
  const grandFinal = Object.values(rounds).filter((r) => r.bracket === "grand_final").sort((a, b) => a.sort - b.sort);
  return { upper, lower, grand_final: grandFinal };
}

router.get("/api/rl-bracket/:serieId", async (req, res) => {
  const { serieId } = req.params;
  if (!/^\d+$/.test(serieId)) return res.status(400).json({ error: "serieId invalide" });

  try {
    const cacheKey = "rl-bracket:" + serieId;
    const cached = rlBracketCache.get(cacheKey);
    if (cached && Date.now() - cached.at < RL_BRACKET_TTL) {
      return res.json(cached.data);
    }

    let serie, tournamentsRaw;
    try {
      [serie, tournamentsRaw] = await Promise.all([
        pandaFetch("/" + RL_SLUG + "/series/" + serieId),
        pandaFetch("/" + RL_SLUG + "/series/" + serieId + "/tournaments"),
      ]);
    } catch (e1) {
      [serie, tournamentsRaw] = await Promise.all([
        pandaFetch("/series/" + serieId),
        pandaFetch("/series/" + serieId + "/tournaments"),
      ]);
    }
    const tournaments = Array.isArray(tournamentsRaw) && tournamentsRaw.length > 0
      ? tournamentsRaw
      : (serie.tournaments || []);

    const phases = [];
    const allTeams = new Set();

    for (let ti = 0; ti < tournaments.length; ti++) {
      const t = tournaments[ti];
      const tName = t.name || "";
      const tId = t.id;

      let matches = [];
      try {
        if (ti > 0) await sleep(300);
        try {
          matches = await pandaFetch("/" + RL_SLUG + "/tournaments/" + tId + "/matches?per_page=100&sort=scheduled_at");
        } catch (e2) {
          matches = await pandaFetch("/tournaments/" + tId + "/matches?per_page=100&sort=scheduled_at");
        }
      } catch (e) {
        console.warn("rl-bracket: skip tournament", tId, e.message);
        continue;
      }

      const allParsed = [];

      for (const m of matches) {
        const t1 = m.opponents?.[0]?.opponent;
        const t2 = m.opponents?.[1]?.opponent;
        if (t1?.name) allTeams.add(t1.name);
        if (t2?.name) allTeams.add(t2.name);

        const results = m.results || [];
        const r1 = t1 ? results.find((r) => r.team_id === t1.id) : null;
        const r2 = t2 ? results.find((r) => r.team_id === t2.id) : null;

        const roundName = m.name || tName;
        const cl = classifyRLMatchRound(roundName);

        allParsed.push({
          match_id: m.id,
          date: m.begin_at || m.scheduled_at,
          status: m.status,
          round: roundName,
          round_normalized: cl.round,
          bracket: cl.bracket,
          sort: cl.sort,
          team1: {
            name: t1?.name || "TBD",
            score: r1?.score != null ? String(r1.score) : "–",
            is_winner: m.winner_id && t1 && m.winner_id === t1.id,
            image_url: t1?.image_url || null,
          },
          team2: {
            name: t2?.name || "TBD",
            score: r2?.score != null ? String(r2.score) : "–",
            is_winner: m.winner_id && t2 && m.winner_id === t2.id,
            image_url: t2?.image_url || null,
          },
        });
      }

      const standings = {};
      const standingsAll = {};
      for (const m of allParsed) {
        for (const team of [m.team1, m.team2]) {
          const name = team.name || "TBD";
          if (name === "TBD") continue;
          if (!standingsAll[name]) standingsAll[name] = { wins: 0, losses: 0, maps_won: 0, maps_lost: 0 };
          const completed = (m.status || "").toLowerCase() === "finished";
          if (completed) {
            if (team.is_winner) standingsAll[name].wins++;
            else standingsAll[name].losses++;
            const score = parseInt(team.score, 10) || 0;
            standingsAll[name].maps_won += score;
            const other = team === m.team1 ? m.team2 : m.team1;
            standingsAll[name].maps_lost += parseInt(other.score, 10) || 0;
          }
        }
      }
      if (Object.keys(standingsAll).length > 0) {
        standings[tName] = Object.entries(standingsAll)
          .map(([name, s]) => ({ name, ...s, points: s.wins * 3 }))
          .sort((a, b) => b.points - a.points || (b.maps_won - b.maps_lost) - (a.maps_won - a.maps_lost));
      }

      phases.push({
        tournament_id: tId,
        name: tName,
        group_stage: { matches: allParsed, standings },
        playoffs: { bracket: buildRLBracket(allParsed) },
        total_matches: matches.length,
      });
    }

    const serieInfo = {
      id: serie.id,
      title: serie.full_name || serie.name || "",
      league: serie.league?.name || "",
      status: serie.status,
      begin_at: serie.begin_at,
      end_at: serie.end_at,
    };

    const result = {
      serie: serieInfo,
      phases,
      teams: [...allTeams].sort(),
    };

    rlBracketCache.set(cacheKey, { data: result, at: Date.now() });
    res.json(result);
  } catch (e) {
    console.error("rl-bracket error:", e.message);
    res.status(502).json({ error: "Impossible de récupérer le bracket RL." });
  }
});

export default router;
