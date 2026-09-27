// Endpoint aggregator for the VCT Champions 2026 bracket page in the app.
// Multi-source: PandaScore (main), VLR.gg scraper (fallback logos), Liquipedia (fallback).
// Cache 10 min in memory to avoid hammering PandaScore.

const PANDA_KEY = process.env.PANDASCORE_API_KEY || "";
const PANDA_BASE = "https://api.pandascore.co";

// VCT Champions 2026 (Shanghai) — hardcoded IDs discovered via PandaScore API
const CHAMPIONS_SERIE_ID = 10953;
const GROUP_TOURNAMENT_IDS = {
  A: 21881,
  B: 21882,
  C: 21883,
  D: 21884,
};
const PLAYOFFS_TOURNAMENT_ID = 21917;

const CACHE_TTL_MS = 10 * 60 * 1000;
let cache = null;
let cacheAt = 0;

async function pandaFetch(path) {
  if (!PANDA_KEY) throw new Error("PANDASCORE_API_KEY missing");
  const url = PANDA_BASE + path + (path.includes("?") ? "&" : "?") + "per_page=100";
  const r = await fetch(url, { headers: { Authorization: "Bearer " + PANDA_KEY } });
  if (!r.ok) throw new Error("panda HTTP " + r.status + " for " + path);
  return r.json();
}

// Map PandaScore match to internal format.
// Extracts phase from the "name" field (ex: "Winners Match: 100T vs FUT" → winners)
function mapPhase(matchName) {
  const n = (matchName || "").toLowerCase();
  if (n.includes("opening") && n.includes("1")) return "opening1";
  if (n.includes("opening") && n.includes("2")) return "opening2";
  if (n.includes("opening")) return "opening1";
  if (n.includes("winners")) return "winners";
  if (n.includes("elimination")) return "elimination";
  if (n.includes("decider")) return "decider";
  if (n.includes("upper")) return "upper";
  if (n.includes("lower")) return "lower";
  if (n.includes("grand final") || n.includes("grand-final")) return "grand-final";
  return "other";
}

function normalizeMatch(m) {
  const t1 = m.opponents?.[0]?.opponent || null;
  const t2 = m.opponents?.[1]?.opponent || null;
  const results = m.results || [];
  const score1 = results.find((r) => r.team_id === t1?.id)?.score ?? null;
  const score2 = results.find((r) => r.team_id === t2?.id)?.score ?? null;
  return {
    id: m.id,
    name: m.name,
    phase: mapPhase(m.name),
    status: m.status, // not_started / running / finished
    beginAt: m.begin_at,
    scheduledAt: m.scheduled_at,
    numberOfGames: m.number_of_games,
    team1: t1 ? { id: t1.id, name: t1.name, acronym: t1.acronym, logo: t1.image_url } : { name: "TBD" },
    team2: t2 ? { id: t2.id, name: t2.name, acronym: t2.acronym, logo: t2.image_url } : { name: "TBD" },
    score: t1 && t2 ? { team1: score1, team2: score2 } : null,
    winnerId: m.winner_id,
  };
}

// Build standings for a group from its matches (wins/losses per team).
function buildStandings(teams, matches) {
  const stats = {};
  for (const t of teams) stats[t.id] = { ...t, wins: 0, losses: 0 };
  for (const m of matches) {
    if (m.status !== "finished" || m.winnerId == null) continue;
    const loserId = m.winnerId === m.team1?.id ? m.team2?.id : m.team1?.id;
    if (stats[m.winnerId]) stats[m.winnerId].wins++;
    if (loserId && stats[loserId]) stats[loserId].losses++;
  }
  const ranked = Object.values(stats).sort((a, b) => (b.wins - b.losses) - (a.wins - a.losses));
  // Top 2 qualified, bottom 2 eliminated (Group Stage GSL Bo3)
  ranked.forEach((t, i) => {
    t.rank = i + 1;
    t.qualified = i < 2 && (t.wins >= 2 || (t.wins - t.losses) >= 1);
    t.eliminated = i >= 2 && t.losses >= 2;
  });
  return ranked;
}

async function fetchGroup(letter, tournamentId) {
  // Get teams and matches for this tournament
  const [teamsRaw, matchesRaw] = await Promise.all([
    pandaFetch("/valorant/tournaments/" + tournamentId + "/teams").catch(() => []),
    pandaFetch("/valorant/tournaments/" + tournamentId + "/matches").catch(() => []),
  ]);
  const teams = teamsRaw.map((t) => ({
    id: t.id,
    name: t.name,
    acronym: t.acronym,
    logo: t.image_url,
  }));
  const matches = matchesRaw.map(normalizeMatch);
  const standings = buildStandings(teams, matches);
  return { name: letter, teams: standings, matches };
}

async function buildBracket() {
  // Groups in parallel
  const groupPromises = Object.entries(GROUP_TOURNAMENT_IDS).map(([letter, id]) => fetchGroup(letter, id));
  // Playoffs
  const playoffsMatchesPromise = pandaFetch("/valorant/tournaments/" + PLAYOFFS_TOURNAMENT_ID + "/matches").catch(() => []);
  const [groupsResults, playoffsRaw] = await Promise.all([Promise.all(groupPromises), playoffsMatchesPromise]);
  const playoffMatches = playoffsRaw.map(normalizeMatch);
  const playoffs = {
    upper: playoffMatches.filter((m) => m.phase === "upper" || m.phase === "grand-final"),
    lower: playoffMatches.filter((m) => m.phase === "lower"),
    other: playoffMatches.filter((m) => !["upper", "lower", "grand-final"].includes(m.phase)),
    all: playoffMatches,
  };
  return {
    event: { name: "VCT Champions 2026", serieId: CHAMPIONS_SERIE_ID },
    groups: groupsResults,
    playoffs,
    updatedAt: new Date().toISOString(),
  };
}

export function mountChampionsBracketEndpoint(app) {
  app.get("/api/valorant-champions-bracket", async (req, res) => {
    try {
      const now = Date.now();
      if (cache && now - cacheAt < CACHE_TTL_MS && !req.query.fresh) {
        return res.json(cache);
      }
      const data = await buildBracket();
      cache = data;
      cacheAt = now;
      res.json(data);
    } catch (e) {
      // Serve stale cache if present, else 502
      if (cache) return res.json(cache);
      console.error("[champions-bracket]", e.message);
      res.status(502).json({ error: e.message });
    }
  });
  console.log("[champions-bracket] /api/valorant-champions-bracket ready");
}
