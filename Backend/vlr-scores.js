/**
 * Va chercher les scores détaillés par manche (ex: 13-9) sur vlr.gg, via
 * notre propre instance auto-hébergée sur Railway (vlrggapi), pour un match
 * donné identifié par ses 2 noms d'équipe + sa date.
 *
 * Pourquoi ce détour : PandaScore donne le score de série (2-0, 2-1...) mais
 * verrouille le score par manche (13-9) derrière un plan payant. vlr.gg a
 * cette donnée gratuitement, donc on la récupère là-bas et on la "colle" sur
 * le match PandaScore correspondant.
 *
 * Tout ici est défensif : si quoi que ce soit rate (équipe introuvable, match
 * introuvable, API down), on renvoie simplement `null` — jamais de crash,
 * jamais de donnée inventée. Le reste de l'app continue de fonctionner
 * normalement avec juste le score de série PandaScore dans ce cas.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ALIASES_PATH = path.join(__dirname, "data", "team-aliases.json");
const UNMATCHED_PATH = path.join(__dirname, "data", "unmatched-teams.log");

const VLR_API_BASE = process.env.VLR_API_BASE || "https://vlrggapi-production-b3a0.up.railway.app";

// Fichier d'alias équipe PandaScore -> équipe vlr.gg, construit à l'avance
// par scripts/build-team-aliases.js. Chargé une seule fois au démarrage :
// zéro appel réseau pour toutes les équipes déjà connues.
// Clé = nom PandaScore normalisé, valeur = { vlr_name, vlr_id }.
const teamAliases = (() => {
  try {
    const raw = JSON.parse(fs.readFileSync(ALIASES_PATH, "utf-8"));
    const map = new Map();
    for (const [name, info] of Object.entries(raw)) {
      map.set(normalize(name), info);
    }
    return map;
  } catch (e) {
    return new Map(); // fichier absent ou invalide -> on retombe sur le live pour tout
  }
})();

// Loggue les équipes qui passent par la recherche live (donc absentes du
// fichier d'alias) pour pouvoir enrichir team-aliases.json plus tard, à la
// main ou via un prochain run de build-team-aliases.js.
function logUnmatched(teamName, resolved) {
  try {
    const stamp = new Date().toISOString().slice(0, 10);
    const status = resolved ? `trouvé en live: ${resolved}` : "introuvable";
    fs.appendFileSync(UNMATCHED_PATH, `${stamp} — ${teamName} (${status})\n`);
  } catch (e) {
    // best-effort, jamais bloquant
  }
}

// Petit cache mémoire pour ne pas re-taper l'API à chaque requête (les scores
// d'un match terminé ne changent jamais une fois publiés).
const cache = new Map();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h

function getCached(key) {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key);
    return undefined;
  }
  return hit.value;
}
function setCached(key, value) {
  cache.set(key, { value, at: Date.now() });
}

function normalize(s) {
  return (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// vlrggapi a son propre rate-limiter interne (plus strict sur les routes
// "coûteuses" comme /v2/team, qui scrapent vraiment vlr.gg). On retente une
// fois en cas de 429, avec une petite pause, avant d'abandonner.
async function vlrFetch(path, attempt = 0) {
  const res = await fetch(VLR_API_BASE + path);
  if (res.status === 429 && attempt < 2) {
    await sleep(700 * (attempt + 1));
    return vlrFetch(path, attempt + 1);
  }
  if (!res.ok) throw new Error("vlr-api HTTP " + res.status);
  return res.json();
}

/**
 * Cherche l'ID vlr.gg d'une équipe par son nom (via /v2/search).
 * Renvoie null si rien trouvé.
 */
async function findTeamId(teamName) {
  // 1) Fichier d'alias construit à l'avance : instantané, zéro requête réseau,
  // zéro faux positif possible (rempli uniquement avec des matchs exacts).
  const alias = teamAliases.get(normalize(teamName));
  if (alias) return alias.vlr_id;

  // 2) Fallback : recherche live comme avant, pour les équipes pas encore
  // dans le fichier. On loggue le cas pour pouvoir enrichir le fichier.
  const cacheKey = "team-id:" + normalize(teamName);
  const cached = getCached(cacheKey);
  if (cached !== undefined) return cached;

  try {
    const json = await vlrFetch("/v2/search?q=" + encodeURIComponent(teamName));
    const teams =
      (json && json.data && json.data.segments && json.data.segments.results && json.data.segments.results.teams) ||
      [];
    const target = normalize(teamName);
    const match = teams.find((t) => normalize(t.name) === target) || teams[0] || null;
    const id = match ? match.id : null;
    setCached(cacheKey, id);
    logUnmatched(teamName, match ? `${match.name} (#${match.id})` : null);
    return id;
  } catch (e) {
    logUnmatched(teamName, null);
    return null;
  }
}

/**
 * Parmi les matchs récents d'une équipe (vlr.gg), trouve celui qui oppose
 * team1 à team2 à une date donnée (tolérance de +/- 1 jour pour les fuseaux
 * horaires / heures de publication différentes entre les 2 sources).
 */
async function findMatchId(team1Name, team2Name, dateStr) {
  const cacheKey = "match-id:" + normalize(team1Name) + ":" + normalize(team2Name) + ":" + dateStr;
  const cached = getCached(cacheKey);
  if (cached !== undefined) return cached;

  try {
    const teamId = await findTeamId(team1Name);
    if (!teamId) {
      setCached(cacheKey, null);
      return null;
    }
    const json = await vlrFetch("/v2/team?id=" + teamId + "&q=matches&page=1");
    const matches = (json && json.data && json.data.matches) || [];
    const targetOpponent = normalize(team2Name);
    const targetDate = new Date(dateStr + "T00:00:00");

    let best = null;
    for (const m of matches) {
      const opponentName = normalize(m.teams && (m.teams.team1 === team1Name ? m.teams.team2 : m.teams.team1));
      // fallback si teams.team1/team2 ne matche pas exactement team1Name
      const teamsInMatch = [normalize(m.teams && m.teams.team1), normalize(m.teams && m.teams.team2)];
      if (!teamsInMatch.includes(targetOpponent)) continue;

      const matchDate = m.date ? new Date(m.date) : null;
      if (!matchDate) continue;
      const diffDays = Math.abs((matchDate - targetDate) / 86400000);
      if (diffDays <= 1) {
        best = m.match_id;
        break;
      }
    }
    setCached(cacheKey, best);
    return best;
  } catch (e) {
    return null;
  }
}

/**
 * Renvoie le détail des scores par manche pour un match, au format simple :
 *   [{ map: "Ascent", score1: 13, score2: 9 }, ...]
 * ou null si introuvable / API indisponible.
 */
async function getMapScores(team1Name, team2Name, dateStr) {
  try {
    const matchId = await findMatchId(team1Name, team2Name, dateStr);
    if (!matchId) return null;

    const cacheKey = "maps:" + matchId;
    const cached = getCached(cacheKey);
    if (cached !== undefined) return cached;

    const json = await vlrFetch("/v2/match/details?match_id=" + matchId);
    const maps = (json && json.data && json.data.maps) || [];
    const result = maps
      .filter((m) => m.score && m.score.team1 && m.score.team2)
      .map((m) => ({
        map: m.map_name,
        score1: m.score.team1.total,
        score2: m.score.team2.total,
      }));
    const finalResult = result.length > 0 ? result : null;
    setCached(cacheKey, finalResult);
    return finalResult;
  } catch (e) {
    return null;
  }
}

export { getMapScores };

