/**
 * Endpoint generique de bracket auto-decouvert pour Valorant/CS2/RL.
 *
 * Au lieu de hardcoder les tournament IDs d'une competition, on prend juste
 * un `serieId` (ex: 10953 pour VCT Champions 2026) et on auto-decouvre:
 *  - Tous les tournaments enfants via /{game}/series/{id}/tournaments
 *  - Pour chaque tournament, classifie en "groupe" ou "playoffs" par nom
 *  - Fetch les matches + standings
 *
 * Zero API key externe, 100% PandaScore. Cache 10 min memoire.
 *
 * Usage: GET /api/bracket-auto?game=valorant&serieId=10953
 *        GET /api/bracket-auto?game=csgo&serieId=10972
 *        GET /api/bracket-auto?game=rl&serieId=xxxx
 */

const PANDA_KEY = process.env.PANDASCORE_API_KEY || "";
const PANDA_BASE = "https://api.pandascore.co";
const GAME_SLUGS = { valorant: "valorant", valo: "valorant", csgo: "csgo", cs2: "csgo", rl: "rl", rocketleague: "rl" };

const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map(); // key: `${game}:${serieId}` → { data, at }

async function pandaFetch(path) {
  if (!PANDA_KEY) throw new Error("PANDASCORE_API_KEY missing");
  const url = PANDA_BASE + path + (path.includes("?") ? "&" : "?") + "per_page=100";
  const r = await fetch(url, { headers: { Authorization: "Bearer " + PANDA_KEY } });
  if (!r.ok) throw new Error("panda HTTP " + r.status + " for " + path);
  return r.json();
}

// Classifie un tournament en 'groupe' / 'playoffs' / 'play-in' / 'other'
// par parse du nom (Group A/B/C/D, Playoffs, Play-In, Qualifier, etc.)
function classifyTournament(name) {
  const n = (name || "").toLowerCase();
  // Group matches: "Group A", "Groupe A", "Grupo A", etc.
  const groupMatch = n.match(/group\s*([a-d])\b/) || n.match(/groupe\s*([a-d])\b/) || n.match(/grupo\s*([a-d])\b/);
  if (groupMatch) return { type: "group", letter: groupMatch[1].toUpperCase() };
  if (n.includes("playoff")) return { type: "playoffs" };
  if (n.includes("play-in") || n.includes("play in")) return { type: "play-in" };
  if (n.includes("qualif") || n.includes("qualifier")) return { type: "qualifier" };
  if (n.includes("swiss")) return { type: "swiss" };
  if (n.includes("regular season")) return { type: "regular" };
  return { type: "other", raw: name };
}

// Classifie un match par phase (opening/winners/elimination/decider/upper/lower/grand-final)
function classifyPhase(matchName) {
  const n = (matchName || "").toLowerCase();
  if (n.includes("opening") && (n.includes("1") || n.includes("one"))) return "opening1";
  if (n.includes("opening") && (n.includes("2") || n.includes("two"))) return "opening2";
  if (n.includes("opening")) return "opening1";
  if (n.includes("winners") || n.includes("winner")) return "winners";
  if (n.includes("elimination") || n.includes("eliminator")) return "elimination";
  if (n.includes("decider")) return "decider";
  if (n.includes("grand final") || n.includes("grand-final")) return "grand-final";
  if (n.includes("upper final")) return "upper-final";
  if (n.includes("lower final")) return "lower-final";
  if (n.includes("upper semi")) return "upper-semi";
  if (n.includes("lower semi")) return "lower-semi";
  if (n.includes("upper quarter") || n.includes("upper qf")) return "upper-qf";
  if (n.includes("lower round 1")) return "lower-r1";
  if (n.includes("lower round 2")) return "lower-r2";
  if (n.includes("lower round")) return "lower";
  if (n.includes("upper")) return "upper";
  if (n.includes("lower")) return "lower";
  if (n.includes("semifinal") || n.includes("semi-final")) return "semi";
  if (n.includes("quarterfinal") || n.includes("quarter-final") || n.includes("qf")) return "qf";
  if (n.includes("final")) return "final";
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
    phase: classifyPhase(m.name),
    status: m.status,
    beginAt: m.begin_at || m.scheduled_at,
    numberOfGames: m.number_of_games,
    team1: t1 ? { id: t1.id, name: t1.name, acronym: t1.acronym, logo: t1.image_url } : { name: "TBD" },
    team2: t2 ? { id: t2.id, name: t2.name, acronym: t2.acronym, logo: t2.image_url } : { name: "TBD" },
    score: t1 && t2 ? { team1: score1, team2: score2 } : null,
    winnerId: m.winner_id,
  };
}

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
  ranked.forEach((t, i) => {
    t.rank = i + 1;
    t.qualified = i < 2;
    t.eliminated = i >= 2;
  });
  return ranked;
}

async function fetchTournamentData(gameSlug, tournamentId) {
  const [teamsRaw, matchesRaw] = await Promise.all([
    pandaFetch(`/${gameSlug}/tournaments/${tournamentId}/teams`).catch(() => []),
    pandaFetch(`/${gameSlug}/tournaments/${tournamentId}/matches`).catch(() => []),
  ]);
  const teams = (teamsRaw || []).map((t) => ({ id: t.id, name: t.name, acronym: t.acronym, logo: t.image_url }));
  const matches = (matchesRaw || []).map(normalizeMatch);
  return { teams, matches };
}

async function buildBracket(gameSlug, serieId) {
  // Auto-decouvre tous les tournaments de la serie
  const tournaments = await pandaFetch(`/${gameSlug}/series/${serieId}/tournaments`);
  const groups = [];
  const playoffsTournaments = [];
  const otherStages = [];
  for (const tn of (tournaments || [])) {
    const cls = classifyTournament(tn.name);
    if (cls.type === "group") {
      const data = await fetchTournamentData(gameSlug, tn.id);
      groups.push({ letter: cls.letter, tournamentId: tn.id, tournamentName: tn.name, teams: buildStandings(data.teams, data.matches), matches: data.matches });
    } else if (cls.type === "playoffs") {
      const data = await fetchTournamentData(gameSlug, tn.id);
      playoffsTournaments.push({ tournamentId: tn.id, tournamentName: tn.name, teams: data.teams, matches: data.matches });
    } else {
      otherStages.push({ tournamentId: tn.id, tournamentName: tn.name, type: cls.type });
    }
  }
  // Sort groups par lettre A/B/C/D
  groups.sort((a, b) => (a.letter || "").localeCompare(b.letter || ""));

  // Playoffs: agrege tous les matches des tournaments playoffs
  const playoffsMatches = playoffsTournaments.flatMap((t) => t.matches);
  const playoffs = {
    upper: playoffsMatches.filter((m) => m.phase.startsWith("upper")),
    lower: playoffsMatches.filter((m) => m.phase.startsWith("lower")),
    grandFinal: playoffsMatches.filter((m) => m.phase === "grand-final"),
    other: playoffsMatches.filter((m) => !m.phase.startsWith("upper") && !m.phase.startsWith("lower") && m.phase !== "grand-final"),
    all: playoffsMatches,
  };

  return {
    game: gameSlug,
    serieId,
    groups,
    playoffs,
    otherStages,
    updatedAt: new Date().toISOString(),
  };
}

export function mountGenericBracketEndpoint(app) {
  app.get("/api/bracket-auto", async (req, res) => {
    try {
      const game = (req.query.game || "valorant").toLowerCase();
      const serieId = parseInt(req.query.serieId, 10);
      if (!serieId) return res.status(400).json({ error: "serieId query param required" });
      const gameSlug = GAME_SLUGS[game];
      if (!gameSlug) return res.status(400).json({ error: `game '${game}' not supported (use: valorant, csgo, rl)` });
      const cacheKey = `${gameSlug}:${serieId}`;
      const now = Date.now();
      const hit = cache.get(cacheKey);
      if (hit && now - hit.at < CACHE_TTL_MS && !req.query.fresh) return res.json(hit.data);
      const data = await buildBracket(gameSlug, serieId);
      cache.set(cacheKey, { data, at: now });
      res.json(data);
    } catch (e) {
      console.error("[bracket-auto]", e.message);
      res.status(502).json({ error: e.message });
    }
  });
  console.log("[bracket-auto] /api/bracket-auto?game=X&serieId=Y ready");
}
