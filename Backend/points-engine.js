// Calcul des points côté serveur, 24h/24, à partir des pronos sauvegardés
// (user_sync) et des résultats déjà servis par nos propres routes. Même
// barème que getMatchPointsBreakdown() dans Frontend/App.jsx — à garder
// strictement identique.
import { listUserSyncRows, saveUserMatchPoints } from "./social-store.js";

const POINTS_INTERVAL_MS = 2 * 60 * 1000;

function isMapScoresConsistent(mapScores, score1, score2) {
  if (!Array.isArray(mapScores) || mapScores.length === 0) return false;
  if (score1 == null || score2 == null) return true;
  let w1 = 0, w2 = 0;
  for (const ms of mapScores) {
    if (ms.score1 > ms.score2) w1++;
    else if (ms.score2 > ms.score1) w2++;
  }
  return w1 === score1 && w2 === score2;
}

function bumpFinalScores(mapScores, minWin) {
  return mapScores.map((mp) => {
    if (mp.score1 == null || mp.score2 == null) return mp;
    const hi = Math.max(mp.score1, mp.score2), lo = Math.min(mp.score1, mp.score2);
    if (hi >= minWin && hi - lo >= 2) return mp;
    const target = Math.max(minWin, lo + 2);
    if (mp.score1 > mp.score2) return { ...mp, score1: target };
    if (mp.score2 > mp.score1) return { ...mp, score2: target };
    return mp;
  });
}

// Match brut (forme PandaScore servie par /api/*-results) -> forme du front.
function normalizeMatch(raw, game) {
  const t1 = raw.opponents?.[0]?.opponent;
  const t2 = raw.opponents?.[1]?.opponent;
  const results = raw.results || [];
  const score1 = t1 ? results.find((r) => r.team_id === t1.id)?.score : undefined;
  const score2 = t2 ? results.find((r) => r.team_id === t2.id)?.score : undefined;
  let maps = null;
  if (game === "rl") {
    const gs = raw.game_scores;
    if (Array.isArray(gs) && gs.some((g) => g.score1 > 1 || g.score2 > 1)) maps = gs.map((g) => ({ score1: g.score1, score2: g.score2 }));
  } else if (isMapScoresConsistent(raw.map_scores, score1, score2)) {
    maps = raw.status === "finished" ? bumpFinalScores(raw.map_scores, 13) : raw.map_scores;
  }
  const prefix = game === "valo" ? "ps-" : game === "cs2" ? "cs2-" : "rl-";
  return { id: prefix + raw.id, status: raw.status, score1, score2, map_scores: maps };
}

// Barème — strictement identique à Frontend/App.jsx (POINTS_SERIES_EXACT etc.).
const POINTS_SERIES_EXACT = 150;
const POINTS_RIGHT_WINNER_RATIO = 0.5;
const POINTS_MAP_EXACT = 35;
const POINTS_MAP_1AWAY = 25;
const POINTS_MAP_2AWAY = 10;
function oddsCoef(probability) {
  const p = Math.min(95, Math.max(5, probability != null ? probability : 50));
  return 1 + (50 - p) / 100;
}
function mapBonusBase(diff) {
  if (diff === 0) return POINTS_MAP_EXACT;
  if (diff === 1) return POINTS_MAP_1AWAY;
  if (diff === 2) return POINTS_MAP_2AWAY;
  return 0;
}

export function getMatchPointsBreakdown(match, pred) {
  const none = { score: 0, bonus: 0, total: 0, correct: false, exact: false };
  if (!pred || pred.seriesA === "" || pred.seriesB === "" || pred.seriesA == null || pred.seriesB == null) return none;
  if (match.score1 == null || match.score2 == null) return none;
  const predA = parseInt(pred.seriesA, 10);
  const predB = parseInt(pred.seriesB, 10);
  if (Number.isNaN(predA) || Number.isNaN(predB)) return none;
  const predictedAWins = predA > predB;
  if (predictedAWins !== (match.score1 > match.score2)) return none;

  const raw = predictedAWins ? pred.odds1 : pred.odds2;
  const coef = oddsCoef(raw);
  const exact = predA === match.score1 && predB === match.score2;
  const score = exact
    ? Math.round(POINTS_SERIES_EXACT * coef)
    : Math.round(POINTS_SERIES_EXACT * coef * POINTS_RIGHT_WINNER_RATIO);

  let bonus = 0;
  const games = pred.games || [];
  if (Array.isArray(match.map_scores)) {
    match.map_scores.forEach((mp, i) => {
      const g = games[i];
      if (!g || g.a === "" || g.b === "" || g.a == null || g.b == null) return;
      const gA = parseInt(g.a, 10);
      const gB = parseInt(g.b, 10);
      if ((gA > gB) !== (mp.score1 > mp.score2)) return; // mauvais vainqueur de map
      const diff = Math.max(Math.abs(gA - mp.score1), Math.abs(gB - mp.score2));
      bonus += Math.round(mapBonusBase(diff) * coef);
    });
  }
  return { score, bonus, total: score + bonus, correct: true, exact };
}

async function fetchFinished(base, path, game) {
  try {
    const res = await fetch(base + path);
    if (!res.ok) return [];
    const data = await res.json();
    return (Array.isArray(data) ? data : [])
      .map((m) => normalizeMatch(m, game))
      .filter((m) => m.status === "finished" && m.score1 != null && m.score2 != null);
  } catch {
    return [];
  }
}

export async function runPointsOnce(port) {
  const base = `http://127.0.0.1:${port}`;
  const [valo, cs2, rl] = await Promise.all([
    fetchFinished(base, "/api/valorant-results", "valo"),
    fetchFinished(base, "/api/cs2-results", "cs2"),
    fetchFinished(base, "/api/rl-results", "rl"),
  ]);
  const finished = new Map();
  for (const [game, list] of [["valo", valo], ["cs2", cs2], ["rl", rl]]) {
    for (const m of list) finished.set(m.id, { ...m, game });
  }
  if (finished.size === 0) return;

  let users = 0;
  for (const { userId, predictions, boosted } of listUserSyncRows()) {
    const boostSet = new Set(boosted || []);
    const entries = [];
    for (const [matchId, pred] of Object.entries(predictions)) {
      const match = finished.get(matchId);
      if (!match) continue;
      if (pred.seriesA === "" || pred.seriesB === "" || pred.seriesA == null || pred.seriesB == null) continue;
      const b = getMatchPointsBreakdown(match, pred);
      entries.push({
        matchId, game: match.game,
        points: boostSet.has(matchId) ? b.total * 2 : b.total,
        correct: b.correct, exact: b.exact,
      });
    }
    if (entries.length > 0) {
      saveUserMatchPoints(userId, entries);
      users++;
    }
  }
  if (users > 0) console.log(`[points] ${users} joueur(s) recalculé(s) sur ${finished.size} matchs terminés`);
}

export function startPointsWorker(port) {
  const tick = () => runPointsOnce(port).catch((e) => console.error("[points] erreur:", e.message));
  setTimeout(tick, 30 * 1000);
  setInterval(tick, POINTS_INTERVAL_MS);
}
