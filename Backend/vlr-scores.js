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
const MANUAL_SCORES_PATH = path.join(__dirname, "data", "manual-map-scores.json");
const NAME_OVERRIDES_PATH = path.join(__dirname, "data", "team-name-overrides.json");

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

// Scores par map saisis à la main (Backend/data/manual-map-scores.json) quand
// vlrggapi est bloqué/rate-limité par Cloudflare et ne répond plus de façon
// fiable. Chargé une seule fois au démarrage, zéro appel réseau. Toujours
// vérifié EN PREMIER dans getMapScores() — prioritaire même sur ce qui est
// déjà en base SQLite (donc ça écrase un `null` posé par un précédent échec
// vlr.gg), pour ne jamais dépendre de vlr.gg pour ces matchs-là.
const manualScores = (() => {
  try {
    const raw = JSON.parse(fs.readFileSync(MANUAL_SCORES_PATH, "utf-8"));
    return Array.isArray(raw) ? raw : [];
  } catch (e) {
    return []; // fichier absent -> aucun impact, on retombe sur vlr.gg comme avant
  }
})();

// Bug identifié le 17/08 : pour certains matchs, PandaScore renvoie dans
// `opponent.name` le SIGLE de l'équipe ("FUR", "G2", "C9", "EG") au lieu du
// nom complet ("FURIA Esports", "G2 Esports", "Cloud9", "Evil Geniuses") -
// probablement une incohérence de données côté PandaScore selon le
// tournoi/l'endpoint. Comme team-aliases.json est indexé sur le nom COMPLET
// (celui présent dans matches.json au moment du build), un sigle brut ne
// matche jamais l'alias -> on retombe sur la recherche live vlr.gg avec une
// requête trop courte/ambiguë ("G2", "C9"...) qui échoue ou choisit la
// mauvaise équipe (fallback `teams[0]`).
//
// Fichier Backend/data/team-name-overrides.json : mapping simple
// "sigle PandaScore" -> "nom complet PandaScore" pour les cas identifiés à la
// main (même logique que manual-map-scores.json). Vérifié EN PREMIER, avant
// tout lookup dans teamAliases ou toute requête réseau : si le nom reçu est
// un sigle connu, on le remplace par son nom complet et tout le reste du
// pipeline (alias, recherche live, cache, logs) fonctionne sans y toucher.
const nameOverrides = (() => {
  try {
    const raw = JSON.parse(fs.readFileSync(NAME_OVERRIDES_PATH, "utf-8"));
    const map = new Map();
    for (const [abbrev, fullName] of Object.entries(raw)) {
      map.set(normalize(abbrev), fullName);
    }
    return map;
  } catch (e) {
    return new Map(); // fichier absent -> aucun impact, comportement identique à avant
  }
})();

function resolveCanonicalName(teamName) {
  const full = nameOverrides.get(normalize(teamName));
  return full || teamName;
}

// Sens inverse de nameOverrides (nom complet -> sigle), pour proposer le
// sigle comme candidat de matching quand on compare à l'adversaire (ex:
// vlr.gg peut afficher "G2" dans une liste de matchs alors qu'on cherche
// "G2 Esports" ; sans ça la comparaison stricte ratait ce genre de cas -
// bug identifié le 17/08 sur FURIA vs G2 et Cloud9 vs Evil Geniuses).
const reverseNameOverrides = (() => {
  try {
    const raw = JSON.parse(fs.readFileSync(NAME_OVERRIDES_PATH, "utf-8"));
    const map = new Map();
    for (const [abbrev, fullName] of Object.entries(raw)) {
      map.set(normalize(fullName), abbrev);
    }
    return map;
  } catch (e) {
    return new Map();
  }
})();

function daysBetweenDates(d1, d2) {
  const t1 = new Date(d1 + "T00:00:00").getTime();
  const t2 = new Date(d2 + "T00:00:00").getTime();
  if (Number.isNaN(t1) || Number.isNaN(t2)) return Infinity;
  return Math.abs(t1 - t2) / 86400000;
}

// Normalisation "large" pour le matching tolérant : en plus de normalize()
// (accents, casse, espaces de bord), on retire tirets/points/apostrophes et
// le "s" final de chaque mot (pluriel simple), pour absorber les petits
// écarts de nom entre PandaScore et notre saisie manuelle (ex: "Sharper
// Esport" vs "Sharper Esports") sans jamais confondre deux équipes
// différentes (comparaison toujours sur le nom complet, jamais un sous-mot).
function looseNormalize(s) {
  return normalize(s)
    .replace(/[-.'’]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((w) => (w.endsWith("s") && w.length > 3 ? w.slice(0, -1) : w))
    .join(" ");
}

/**
 * Cherche un match dans manual-map-scores.json par équipes + date (tolérance
 * ±1 jour, mêmes règles que le matching vlr.gg). Renvoie les scores par map
 * réorientés pour correspondre à l'ordre (team1Name, team2Name) demandé -
 * même si le fichier manuel les a dans l'autre sens.
 */
function findManualMapScores(team1Name, team2Name, dateStr) {
  if (manualScores.length === 0) return null;
  // Comme pour le matching vlr.gg : on compare via buildNameCandidates plutôt
  // qu'une égalité stricte, pour que ça marche même quand PandaScore renvoie
  // un sigle brut ("FUR", "G2", "C9", "EG") au lieu du nom complet utilisé
  // dans manual-map-scores.json — bug identifié le 17/08 sur FURIA vs G2 et
  // Cloud9 vs Evil Geniuses, qui empêchait aussi la saisie manuelle de
  // matcher tant que ce fichier gardait une comparaison stricte.
  const c1 = buildNameCandidates(team1Name);
  const c2 = buildNameCandidates(team2Name);
  const overlaps = (setA, setB) => {
    for (const v of setA) if (setB.has(v)) return true;
    return false;
  };

  for (const entry of manualScores) {
    if (dateStr && daysBetweenDates(entry.date, dateStr) > 1) continue;
    const ce1 = buildNameCandidates(entry.team1);
    const ce2 = buildNameCandidates(entry.team2);

    if (overlaps(ce1, c1) && overlaps(ce2, c2)) {
      return entry.maps.map((m) => ({ map: m.map, score1: m.score1, score2: m.score2 }));
    }
    if (overlaps(ce1, c2) && overlaps(ce2, c1)) {
      // Même match mais équipes dans l'ordre inverse -> on retourne les scores.
      return entry.maps.map((m) => ({ map: m.map, score1: m.score2, score2: m.score1 }));
    }
  }
  return null;
}

// Valide qu'une séquence de scores par map est mathématiquement possible.
// Cas concret : série Bo3 qui finit 2-1 (donc exactement 3 maps jouées). La
// même équipe ne peut PAS avoir gagné les 2 premières maps : si elle l'avait
// fait, la série se serait terminée 2-0 et la 3e map n'aurait jamais existé.
// Donc sur maps[0] et maps[1], le gagnant doit forcément être différent à
// chaque fois (1-1 avant la belle) — peu importe l'équipe, peu importe le
// match : règle générique appliquée à tout le monde.
// Sert à détecter une erreur de matching/scrape (mauvais match_id, maps
// dupliquées, etc.) plutôt qu'à juger un vrai résultat — dans ce cas on
// préfère renvoyer null (et laisser la retry logic réessayer / laisser la
// place à une saisie manuelle) plutôt que d'afficher une donnée impossible.
function isPlausibleMapSequence(maps) {
  if (!Array.isArray(maps) || maps.length !== 3) return true; // rien à valider hors Bo3 en 2-1
  const winnerOf = (m) => (m.score1 > m.score2 ? 1 : m.score2 > m.score1 ? 2 : null);
  const w1 = winnerOf(maps[0]);
  const w2 = winnerOf(maps[1]);
  if (w1 === null || w2 === null) return true; // score de map incomplet/égalité -> pas notre rôle de bloquer
  return w1 !== w2;
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
 * Résout le nom "officiel" vlr.gg d'une équipe à partir de son nom brut
 * PandaScore, via le fichier d'alias (ex: "TEC Esports" -> "Titan Esports
 * Club"). Si l'équipe n'est pas dans le fichier, renvoie le nom PandaScore
 * tel quel (comportement identique à avant pour les équipes non
 * répertoriées — pas de régression).
 *
 * Sert à comparer des noms d'équipe entre les deux sources sur un terrain
 * commun : findTeamId() ne matche que le nom de départ, pas celui de
 * l'adversaire dans la liste des matchs renvoyée par vlr.gg (qui, elle,
 * utilise toujours le nom vlr.gg).
 */
function resolveVlrName(teamName) {
  teamName = resolveCanonicalName(teamName);
  const alias = teamAliases.get(normalize(teamName));
  return alias ? alias.vlr_name : teamName;
}

/**
 * Cherche l'ID vlr.gg d'une équipe par son nom (via /v2/search).
 * Renvoie null si rien trouvé.
 */
async function findTeamId(teamName) {
  // 0) Sigle connu ("FUR", "G2", "C9"...) -> nom complet PandaScore, AVANT
  // tout le reste. Voir le commentaire au-dessus de nameOverrides plus haut.
  teamName = resolveCanonicalName(teamName);

  // 1) Fichier d'alias construit à l'avance : instantané, zéro requête réseau,
  // zéro faux positif possible (rempli uniquement avec des matchs exacts).
  const alias = teamAliases.get(normalize(teamName));
  if (alias) {
    console.log(`[vlr-scores] ${teamName} → alias connu, id=${alias.vlr_id}`);
    return alias.vlr_id;
  }

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
    console.log(`[vlr-scores] ${teamName} → recherche live: ${match ? `${match.name} (#${id})` : "AUCUN RÉSULTAT"}`);
    setCached(cacheKey, id);
    logUnmatched(teamName, match ? `${match.name} (#${match.id})` : null);
    return id;
  } catch (e) {
    console.log(`[vlr-scores] ${teamName} → erreur recherche:`, e.message);
    logUnmatched(teamName, null);
    return null;
  }
}

// Construit l'ensemble des façons plausibles dont vlr.gg peut désigner une
// équipe dans une liste de matchs : nom complet, nom vlr.gg connu (alias),
// sigle connu (via nameOverrides inversé), et nom sans le suffixe
// "Esports"/"Esport" (très fréquent : "G2 Esports" -> "G2",
// "2Game Esports" -> "2Game"). Sert de base commune de comparaison au lieu
// d'une égalité stricte sur un seul nom, qui ratait des matchs valides
// (ex: FURIA vs G2, Cloud9 vs Evil Geniuses).
function buildNameCandidates(teamName) {
  const candidates = new Set();
  const add = (s) => {
    if (!s) return;
    candidates.add(normalize(s));
    candidates.add(looseNormalize(s));
  };
  add(teamName);
  const vlrName = resolveVlrName(teamName);
  if (vlrName) add(vlrName);
  const abbrev = reverseNameOverrides.get(normalize(teamName));
  if (abbrev) add(abbrev);
  const stripped = teamName.replace(/\s+e-?sports?$/i, "").trim();
  if (stripped && stripped !== teamName) add(stripped);
  return candidates;
}

// Extrait les candidats de nom pour UN côté (team1 ou team2) d'un match tel
// que renvoyé par vlr.gg : le champ `name` ET le champ `tag` (sigle, ex
// "G2", "C9") s'il existe — le tag n'était auparavant jamais comparé alors
// qu'il correspond exactement au format le plus court utilisé par
// nameOverrides.
function matchSideCandidates(side) {
  const candidates = new Set();
  if (!side) return candidates;
  if (side.name) {
    candidates.add(normalize(side.name));
    candidates.add(looseNormalize(side.name));
  }
  if (side.tag) candidates.add(normalize(side.tag));
  return candidates;
}

function hasOverlap(setA, setB) {
  for (const v of setA) {
    if (v && setB.has(v)) return true;
  }
  return false;
}

/**
 * Parmi les matchs récents d'une équipe (vlr.gg), trouve celui qui oppose
 * team1 à team2 à une date donnée (tolérance de +/- 1 jour pour les fuseaux
 * horaires / heures de publication différentes entre les 2 sources).
 */
async function findMatchId(team1Name, team2Name, dateStr) {
  // Sigle -> nom complet AVANT de construire la cacheKey, sinon "FUR vs G2"
  // et "FURIA Esports vs G2 Esports" seraient traités comme deux matchs
  // différents en cache (et seul le 2e aurait une vraie chance de matcher).
  team1Name = resolveCanonicalName(team1Name);
  team2Name = resolveCanonicalName(team2Name);

  const cacheKey = "match-id:" + normalize(team1Name) + ":" + normalize(team2Name) + ":" + dateStr;
  const cached = getCached(cacheKey);
  if (cached !== undefined) return cached;

  try {
    const teamId = await findTeamId(team1Name);
    if (!teamId) {
      setCached(cacheKey, null);
      return null;
    }
    // Bug historique : comparer directement le nom PandaScore brut de
    // l'adversaire (ex: "TEC Esports") au nom affiché par vlr.gg dans la
    // liste des matchs (ex: "Titan Esports Club") ne matche jamais quand
    // les deux noms diffèrent. On construit maintenant un ENSEMBLE de noms
    // plausibles pour l'adversaire (nom complet, nom vlr.gg, sigle connu,
    // nom sans "Esports") et on le compare à la fois au champ `name` ET au
    // champ `tag` renvoyé par vlr.gg pour chaque équipe du match — une
    // égalité stricte sur un seul nom ratait des matchs valides comme
    // FURIA vs G2 ou Cloud9 vs Evil Geniuses (bug identifié le 17/08).
    const opponentCandidates = buildNameCandidates(team2Name);
    const targetDate = new Date(dateStr + "T00:00:00");

    // page=1 seule ratait parfois le match si l'équipe a rejoué depuis
    // (le match cherché poussé hors de la 1ère page) : on essaie la page 2
    // en repli, seulement si rien n'est trouvé sur la page 1.
    let best = null;
    let totalChecked = 0;
    for (const page of [1, 2]) {
      const json = await vlrFetch("/v2/team?id=" + teamId + "&q=matches&page=" + page);
      // L'API renvoie la liste sous "segments", pas "matches".
      const matches = (json && json.data && json.data.segments) || [];
      if (matches.length === 0) break; // page vide -> pas la peine d'aller plus loin
      totalChecked += matches.length;

      let closestOffDate = null; // filet de sécurité si aucune date ne matche à ±1j
      for (const m of matches) {
        // team1/team2 sont des objets {name, tag, logo} au niveau racine du
        // match, pas sous une clé "teams".
        const side1 = matchSideCandidates(m.team1);
        const side2 = matchSideCandidates(m.team2);
        const opponentInMatch = hasOverlap(opponentCandidates, side1) || hasOverlap(opponentCandidates, side2);
        if (!opponentInMatch) continue;

        const matchDate = m.date ? new Date(m.date) : null;
        if (!matchDate) continue;
        const diffDays = Math.abs((matchDate - targetDate) / 86400000);
        if (diffDays <= 1) {
          best = m.match_id;
          break;
        }
        // Garde le candidat le plus proche en date au cas où aucun ne rentre
        // dans la tolérance stricte (ex: décalage horaire de publication).
        if (!closestOffDate || diffDays < closestOffDate.diffDays) {
          closestOffDate = { matchId: m.match_id, diffDays };
        }
      }
      if (best) break;
      // Filet de sécurité : un seul adversaire correspondant trouvé sur
      // toute la page mais hors tolérance stricte -> on l'accepte quand
      // même si l'écart reste raisonnable (< 3 jours), plutôt que de
      // renvoyer null pour un match qui existe bel et bien.
      if (!best && closestOffDate && closestOffDate.diffDays < 3) {
        best = closestOffDate.matchId;
        console.log(`[vlr-scores] ${team1Name} vs ${team2Name} (${dateStr}) → match retenu hors tolérance stricte (écart ${closestOffDate.diffDays.toFixed(1)}j)`);
        break;
      }
    }
    console.log(`[vlr-scores] match ${team1Name} vs ${team2Name} (${dateStr}) → ${best ? "match_id " + best : "AUCUN MATCH TROUVÉ parmi " + totalChecked}`);
    setCached(cacheKey, best);
    return best;
  } catch (e) {
    console.log(`[vlr-scores] findMatchId erreur:`, e.message);
    return null;
  }
}

/**
 * Renvoie le détail des scores par manche pour un match, au format simple :
 *   [{ map: "Ascent", score1: 13, score2: 9 }, ...]
 * ou null si introuvable / API indisponible.
 */
async function getMapScores(team1Name, team2Name, dateStr) {
  // 0. Sigle -> nom complet AVANT même la saisie manuelle, pour que tout le
  // reste de la fonction (logs inclus) travaille avec des noms cohérents.
  team1Name = resolveCanonicalName(team1Name);
  team2Name = resolveCanonicalName(team2Name);

  // 1. Saisie manuelle en premier : instantané, jamais bloqué par Cloudflare,
  // et prioritaire même si vlr.gg a déjà été tenté sans succès pour ce match.
  const manual = findManualMapScores(team1Name, team2Name, dateStr);
  if (manual) {
    if (!isPlausibleMapSequence(manual)) {
      console.log(
        `[vlr-scores] ${team1Name} vs ${team2Name} (${dateStr}) → saisie manuelle REJETÉE (séquence de maps impossible, à corriger dans manual-map-scores.json):`,
        JSON.stringify(manual)
      );
    } else {
      console.log(`[vlr-scores] ${team1Name} vs ${team2Name} (${dateStr}) → trouvé en saisie manuelle`);
      return manual;
    }
  }

  try {
    const matchId = await findMatchId(team1Name, team2Name, dateStr);
    if (!matchId) return null;

    const cacheKey = "maps:" + matchId;
    const cached = getCached(cacheKey);
    if (cached !== undefined) return cached;

    const json = await vlrFetch("/v2/match/details?match_id=" + matchId);
    // Les maps sont dans data.segments[0].maps, pas data.maps directement.
    const segment = (json && json.data && json.data.segments && json.data.segments[0]) || null;
    const maps = (segment && segment.maps) || [];
    const result = maps
      // score.team1 / score.team2 sont déjà des nombres (ex: 13, 4), pas des
      // objets avec un champ .total.
      .filter((m) => m.score && Number.isFinite(m.score.team1) && Number.isFinite(m.score.team2))
      .map((m) => ({
        // vlrggapi colle parfois un badge "PICK"/"BAN" directement au nom de
        // la map sans espace (ex: "BreezePICK") — on le retire. Aucune map
        // Valorant ne se termine par ces mots, donc pas de faux positif.
        map: (m.map_name || "").replace(/\s*(PICK|BAN)\s*$/i, "").trim(),
        score1: m.score.team1,
        score2: m.score.team2,
      }));
    let finalResult = result.length > 0 ? result : null;
    if (finalResult && !isPlausibleMapSequence(finalResult)) {
      console.log(
        `[vlr-scores] ${team1Name} vs ${team2Name} (${dateStr}) → résultat vlr.gg REJETÉ (séquence de maps impossible, probable erreur de matching):`,
        JSON.stringify(finalResult)
      );
      finalResult = null; // on préfère null (retry / saisie manuelle) qu'une donnée impossible
    }
    setCached(cacheKey, finalResult);
    return finalResult;
  } catch (e) {
    return null;
  }
}

/**
 * Liste les prochains matchs (date >= aujourd'hui) d'une équipe sur vlr.gg,
 * tels quels (adversaire, date, tournoi). Sert uniquement au diagnostic pour
 * savoir si vlr.gg a déjà connaissance de matchs à venir qu'on n'a pas encore
 * côté PandaScore (ex: Playoffs Americas pas encore créés côté PandaScore).
 */
async function getUpcomingMatchesForTeam(teamName) {
  teamName = resolveCanonicalName(teamName);
  const teamId = await findTeamId(teamName);
  if (!teamId) return { team: teamName, found_on_vlr: false, matches: [] };

  const json = await vlrFetch("/v2/team?id=" + teamId + "&q=matches&page=1");
  const matches = (json && json.data && json.data.segments) || [];
  const now = Date.now();
  const upcoming = matches
    .filter((m) => m.date && new Date(m.date).getTime() >= now - 86400000)
    .map((m) => ({
      opponent: (m.team1 && normalize(m.team1.name) === normalize(teamName) ? m.team2 : m.team1)?.name || null,
      date: m.date,
      tournament: m.tournament_name || m.event || null,
      match_id: m.match_id,
    }));
  return { team: teamName, vlr_id: teamId, found_on_vlr: true, upcoming_matches: upcoming };
}

export { getMapScores, findTeamId, findMatchId, findManualMapScores, getUpcomingMatchesForTeam };
