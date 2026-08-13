/**
 * Mini base de données gratuite pour accumuler l'historique des matchs.
 *
 * Pourquoi SQLite + Railway Volume :
 *  - 100% gratuit, inclus dans Railway, aucun compte externe à créer
 *  - persiste entre les redéploiements TANT QU'UN VOLUME EST ATTACHÉ au service
 *  - une seule dépendance npm (better-sqlite3), pas de serveur DB à gérer
 *
 * Mise en place côté Railway :
 *  1. Dans le service backend -> onglet "Volumes" -> "New Volume"
 *     -> mount path : /data
 *  2. Variable d'env DB_PATH = /data/matches.db  (sinon fallback local ./matches.db,
 *     pratique pour tester en local mais PAS persistant sur Railway sans volume)
 *  3. npm install better-sqlite3
 *
 * Alternatives gratuites si tu préfères ne pas gérer de fichier SQLite toi-même :
 *  - Supabase (Postgres gratuit, dashboard web) : supabase.com
 *  - Turso (SQLite distribué, gratuit) : turso.tech
 *  - Neon (Postgres serverless gratuit) : neon.tech
 * Le code ci-dessous reste le plus simple à brancher direct sur Railway.
 */

import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "matches.db");
const db = new Database(DB_PATH);

db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS matches (
    id TEXT PRIMARY KEY,
    team1 TEXT,
    team2 TEXT,
    team1_name TEXT,
    team2_name TEXT,
    score1 INTEGER,
    score2 INTEGER,
    status TEXT,
    region TEXT,
    league TEXT,
    phase TEXT,
    day TEXT,
    time TEXT,
    raw_json TEXT,
    inserted_at TEXT DEFAULT (datetime('now'))
  )
`);

// Migration : ajoute la colonne map_scores si elle n'existe pas encore (base
// créée avant ce correctif). SQLite n'a pas de "ADD COLUMN IF NOT EXISTS",
// donc on tente et on avale l'erreur "duplicate column" si elle existe déjà.
try {
  db.exec(`ALTER TABLE matches ADD COLUMN map_scores TEXT`);
} catch (e) {
  if (!/duplicate column/i.test(e.message)) throw e;
}

// Migration : colonnes de suivi des retentatives quand vlr.gg n'a rien
// renvoyé (souvent parce que le match vient tout juste de se terminer et que
// le report détaillé n'est pas encore publié). Avant ce correctif, un échec
// était enregistré comme `null` définitif dès le 1er essai — d'où des scores
// par map qui restaient bloqués à "0-0" pour de bon sur des matchs comme
// RRQ vs SPE alors que la donnée finissait par arriver sur vlr.gg peu après.
try {
  db.exec(`ALTER TABLE matches ADD COLUMN map_scores_attempts INTEGER DEFAULT 0`);
} catch (e) {
  if (!/duplicate column/i.test(e.message)) throw e;
}
try {
  db.exec(`ALTER TABLE matches ADD COLUMN map_scores_next_retry_at TEXT`);
} catch (e) {
  if (!/duplicate column/i.test(e.message)) throw e;
}

// INSERT OR IGNORE : si le match existe déjà (même id), on ne le retouche pas.
// -> jamais de doublon, jamais de donnée écrasée au hasard.
const upsertStmt = db.prepare(`
  INSERT OR IGNORE INTO matches
    (id, team1, team2, team1_name, team2_name, score1, score2, status, region, league, phase, day, time, raw_json)
  VALUES
    (@id, @team1, @team2, @team1Name, @team2Name, @score1, @score2, @status, @region, @league, @phase, @day, @time, @raw)
`);

const saveMapScoresStmt = db.prepare(`
  UPDATE matches
  SET map_scores = @mapScores, map_scores_attempts = @attempts, map_scores_next_retry_at = @nextRetryAt
  WHERE id = @id
`);
const getMapScoresStmt = db.prepare(`SELECT map_scores FROM matches WHERE id = ?`);
const getMapScoresRowStmt = db.prepare(
  `SELECT map_scores, map_scores_attempts, map_scores_next_retry_at FROM matches WHERE id = ?`
);

// Paliers de délai avant de retenter un match dont le score par map n'a pas
// été trouvé sur vlr.gg. Croissants pour ne pas marteler l'API sur des
// matchs qui ne seront peut-être jamais couverts, tout en laissant le temps
// à vlr.gg de publier le report pour les matchs tout juste terminés (le cas
// RRQ vs SPE : requête faite trop tôt -> null -> on retente plus tard au
// lieu d'enregistrer ce null pour de bon).
// Après le dernier palier, on abandonne définitivement pour ce match-là.
const RETRY_DELAYS_MS = [
  5 * 60 * 1000, // 1er échec -> retente dans 5 min
  15 * 60 * 1000, // 2e -> 15 min
  60 * 60 * 1000, // 3e -> 1h
  3 * 60 * 60 * 1000, // 4e -> 3h
  12 * 60 * 60 * 1000, // 5e -> 12h
  24 * 60 * 60 * 1000, // 6e -> 24h, puis abandon définitif
];

/**
 * À appeler à chaque fois que /api/valorant-results (ou live/upcoming en statut
 * "finished") renvoie des matchs depuis PandaScore. N'insère que les matchs
 * TERMINÉS avec un score connu — pas de match en cours, jamais de placeholder.
 */
function storeFinishedMatches(matches) {
  const insertMany = db.transaction((rows) => {
    for (const m of rows) {
      if (m.status !== "finished" || m.score1 == null || m.score2 == null) continue;
      upsertStmt.run({
        id: m.id,
        team1: m.team1,
        team2: m.team2,
        team1Name: m.team1Name || null,
        team2Name: m.team2Name || null,
        score1: m.score1,
        score2: m.score2,
        status: m.status,
        region: m.region,
        league: m.league || null,
        phase: m.phase || null,
        day: m.day || null,
        time: m.time || null,
        raw: JSON.stringify(m),
      });
    }
  });
  insertMany(matches);
}

/**
 * Renvoie les scores par map déjà connus pour un match (persistés en base),
 * ou null si jamais trouvés / pas encore essayé. Permet à enrichWithMapScores
 * de sauter complètement l'appel à vlr.gg pour un match déjà résolu, même
 * après un redémarrage/redeploy du backend (le cache mémoire, lui, repart à
 * zéro à chaque redeploy — pas la base SQLite tant qu'un volume est monté).
 */
function getStoredMapScores(id) {
  const row = getMapScoresStmt.get(String(id));
  if (!row || row.map_scores == null) return undefined; // jamais essayé / pas en base
  try {
    return JSON.parse(row.map_scores); // peut être `null` si on a définitivement abandonné
  } catch (e) {
    return undefined;
  }
}

/**
 * Persiste les scores par map une fois trouvés sur vlr.gg, pour ne plus
 * jamais avoir à refaire la requête. N'écrit que si le match existe déjà en
 * base (toujours le cas ici : storeFinishedMatches tourne avant l'enrichissement).
 * Réinitialise aussi le compteur de retentatives (un succès n'a plus besoin
 * d'être retenté).
 */
function saveMapScores(id, mapScores) {
  saveMapScoresStmt.run({ id: String(id), mapScores: JSON.stringify(mapScores), attempts: 0, nextRetryAt: null });
}

/**
 * Persiste un ÉCHEC de récupération (vlr.gg n'a rien renvoyé pour ce match).
 * Au lieu d'écrire `null` définitivement dès le 1er essai, on programme une
 * retentative selon RETRY_DELAYS_MS. On n'abandonne pour de bon (map_scores
 * fixé à `null`) qu'après avoir épuisé tous les paliers.
 */
function saveMapScoresFailure(id) {
  const row = getMapScoresRowStmt.get(String(id));
  const attempts = ((row && row.map_scores_attempts) || 0) + 1;
  const gaveUp = attempts > RETRY_DELAYS_MS.length;
  saveMapScoresStmt.run({
    id: String(id),
    // Tant qu'on retente encore : on laisse `map_scores` à NULL en base (pas
    // de JSON écrit) pour bien le distinguer d'un abandon définitif.
    mapScores: gaveUp ? JSON.stringify(null) : null,
    attempts,
    nextRetryAt: gaveUp ? null : new Date(Date.now() + RETRY_DELAYS_MS[attempts - 1]).toISOString(),
  });
}

/**
 * État complet de la résolution des scores par map pour un match :
 *  - value: array (résolu), null (abandon définitif), undefined (pas encore
 *    résolu — jamais tenté, ou en attente de retentative)
 *  - attempts / nextRetryAt / gaveUp : pour savoir si/quand retenter
 * Renvoie undefined si le match n'est même pas encore en base.
 */
function getMapScoresState(id) {
  const row = getMapScoresRowStmt.get(String(id));
  if (!row) return undefined;
  if (row.map_scores != null) {
    let parsed;
    try {
      parsed = JSON.parse(row.map_scores);
    } catch (e) {
      parsed = null;
    }
    return {
      value: parsed,
      attempts: row.map_scores_attempts || 0,
      nextRetryAt: row.map_scores_next_retry_at || null,
      gaveUp: true, // un `map_scores` non-null en base = succès OU abandon définitif, plus rien à retenter
    };
  }
  return {
    value: undefined,
    attempts: row.map_scores_attempts || 0,
    nextRetryAt: row.map_scores_next_retry_at || null,
    gaveUp: false,
  };
}

/**
 * Renvoie tout l'historique accumulé (le plus récent d'abord), au format déjà
 * compatible avec transformMatch() côté frontend (structure PandaScore-like
 * reconstruite depuis raw_json).
 */
function getFullHistory(limit = 5000) {
  const rows = db
    .prepare(`SELECT raw_json FROM matches ORDER BY day DESC, time DESC LIMIT ?`)
    .all(limit);
  return rows.map((r) => JSON.parse(r.raw_json));
}

/**
 * Comme getFullHistory, mais renvoie les champs à plat (pas raw_json) et
 * inclut map_scores (parsé). Sert à reconstituer, côté server.js, le format
 * "PandaScore-like" attendu par le front pour les matchs qui sont tombés
 * hors de la fenêtre des 50 derniers matchs renvoyés par PandaScore (tous
 * jeux/régions confondus) mais qu'on a déjà vus et stockés nous-mêmes.
 */
function getFullHistoryFlat(limit = 5000) {
  const rows = db
    .prepare(
      `SELECT id, team1, team2, team1_name, team2_name, score1, score2, status, region, league, phase, day, time, map_scores
       FROM matches ORDER BY day DESC, time DESC LIMIT ?`
    )
    .all(limit);
  return rows.map((r) => ({
    id: r.id,
    team1: r.team1,
    team2: r.team2,
    team1Name: r.team1_name,
    team2Name: r.team2_name,
    score1: r.score1,
    score2: r.score2,
    status: r.status,
    region: r.region,
    league: r.league,
    phase: r.phase,
    day: r.day,
    time: r.time,
    map_scores: r.map_scores ? JSON.parse(r.map_scores) : null,
  }));
}

/** Historique filtré pour une équipe donnée (utile pour du debug/monitoring). */
function getTeamHistory(teamCode, limit = 50) {
  const rows = db
    .prepare(
      `SELECT raw_json FROM matches WHERE team1 = ? OR team2 = ? ORDER BY day DESC, time DESC LIMIT ?`
    )
    .all(teamCode, teamCode, limit);
  return rows.map((r) => JSON.parse(r.raw_json));
}

export {
  storeFinishedMatches,
  getFullHistory,
  getFullHistoryFlat,
  getTeamHistory,
  getStoredMapScores,
  saveMapScores,
  saveMapScoresFailure,
  getMapScoresState,
};
