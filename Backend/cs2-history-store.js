/**
 * Mini base de données pour accumuler l'historique des matchs CS2.
 *
 * Copie quasi identique de match-history-store.js (Valorant), mais dans un
 * fichier SQLite À PART (CS2_DB_PATH / cs2-matches.db) : les deux jeux ne
 * partagent jamais la même base, pour ne jamais risquer qu'un match CS2 se
 * glisse dans l'historique Valorant (buildMergedResults) ou l'inverse.
 *
 * Mise en place côté Railway : comme pour matches.db, ajoute la variable
 * d'env CS2_DB_PATH = /data/cs2-matches.db (même volume /data que le reste).
 * Sans cette variable, fallback local ./cs2-matches.db (non persistant sur
 * Railway sans volume monté, pratique seulement pour tester en local).
 */

import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CS2_DB_PATH = process.env.CS2_DB_PATH || path.join(__dirname, "cs2-matches.db");
const db = new Database(CS2_DB_PATH);

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
    team1_region TEXT,
    team2_region TEXT,
    league TEXT,
    phase TEXT,
    day TEXT,
    time TEXT,
    map_scores TEXT,
    map_scores_attempts INTEGER DEFAULT 0,
    map_scores_next_retry_at TEXT,
    raw_json TEXT,
    inserted_at TEXT DEFAULT (datetime('now'))
  )
`);

// Cache PERSISTANT du wikitext Liquipedia (page de tournoi -> contenu).
// Avant, ce cache était une Map() en mémoire dans liquipedia-scores.js,
// donc PERDU à chaque redémarrage du serveur — et comme le serveur
// redémarre à chaque déploiement, chaque page de tournoi devait être
// re-téléchargée à 31s pièce (throttle action=parse de Liquipedia) après
// chaque push. En le persistant ici (même base SQLite/volume que le reste),
// une page déjà récupérée le reste à travers les redémarrages : les matchs
// d'un tournoi déjà vu se résolvent alors en secondes, pas en minutes.
db.exec(`
  CREATE TABLE IF NOT EXISTS wikitext_cache (
    page_title TEXT PRIMARY KEY,
    wikitext TEXT,
    fetched_at INTEGER
  )
`);

const getWikitextCacheStmt = db.prepare(
  `SELECT wikitext, fetched_at FROM wikitext_cache WHERE page_title = ?`
);
const setWikitextCacheStmt = db.prepare(
  `INSERT OR REPLACE INTO wikitext_cache (page_title, wikitext, fetched_at) VALUES (@pageTitle, @wikitext, @fetchedAt)`
);

// TTL 6h : une page de tournoi ne change plus une fois les matchs finis.
const WIKITEXT_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

function getCachedWikitext(pageTitle) {
  const row = getWikitextCacheStmt.get(pageTitle);
  if (!row) return undefined;
  if (Date.now() - row.fetched_at > WIKITEXT_CACHE_TTL_MS) return undefined;
  return row.wikitext;
}

function setCachedWikitext(pageTitle, wikitext) {
  setWikitextCacheStmt.run({ pageTitle, wikitext, fetchedAt: Date.now() });
}

const upsertStmt = db.prepare(`
  INSERT OR IGNORE INTO matches
    (id, team1, team2, team1_name, team2_name, score1, score2, status, team1_region, team2_region, league, phase, day, time, raw_json)
  VALUES
    (@id, @team1, @team2, @team1Name, @team2Name, @score1, @score2, @status, @team1Region, @team2Region, @league, @phase, @day, @time, @raw)
`);

const saveMapScoresStmt = db.prepare(`
  UPDATE matches
  SET map_scores = @mapScores, map_scores_attempts = @attempts, map_scores_next_retry_at = @nextRetryAt
  WHERE id = @id
`);
const getMapScoresRowStmt = db.prepare(
  `SELECT map_scores, map_scores_attempts, map_scores_next_retry_at FROM matches WHERE id = ?`
);

// Paliers de retentative si aucune source (Liquipedia/odds-api.io/
// PandaScore) n'a encore le score par map. Espacés de plus en plus, jusqu'à
// abandon définitif après le dernier palier.
const RETRY_DELAYS_MS = [
  1 * 60 * 1000, // 1er échec -> 1 min
  2 * 60 * 1000, // 2e -> 2 min
  4 * 60 * 1000, // 3e -> 4 min
  5 * 60 * 1000, // 4e -> 5 min
  30 * 60 * 1000, // 5e -> 30 min
  2 * 60 * 60 * 1000, // 6e -> 2h, puis abandon définitif
];

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
        team1Region: m.team1Region || null,
        team2Region: m.team2Region || null,
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

function saveMapScores(id, mapScores) {
  saveMapScoresStmt.run({ id: String(id), mapScores: JSON.stringify(mapScores), attempts: 0, nextRetryAt: null });
}

function saveMapScoresFailure(id) {
  const row = getMapScoresRowStmt.get(String(id));
  // Verrou définitif : si ce match a déjà un VRAI score enregistré (pas
  // juste "null" = abandon), on ne touche plus jamais à cette ligne, quoi
  // qu'il arrive. Protège contre un appel erroné qui écraserait un score
  // déjà trouvé avec succès.
  if (row && row.map_scores != null && row.map_scores !== "null") return;
  const attempts = ((row && row.map_scores_attempts) || 0) + 1;
  const gaveUp = attempts > RETRY_DELAYS_MS.length;
  saveMapScoresStmt.run({
    id: String(id),
    mapScores: gaveUp ? JSON.stringify(null) : null,
    attempts,
    nextRetryAt: gaveUp ? null : new Date(Date.now() + RETRY_DELAYS_MS[attempts - 1]).toISOString(),
  });
}

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
      gaveUp: true,
    };
  }
  return {
    value: undefined,
    attempts: row.map_scores_attempts || 0,
    nextRetryAt: row.map_scores_next_retry_at || null,
    gaveUp: false,
  };
}

function getFullHistoryFlat(limit = 5000) {
  const rows = db
    .prepare(
      `SELECT id, team1, team2, team1_name, team2_name, score1, score2, status, team1_region, team2_region, league, phase, day, time, map_scores
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
    team1Region: r.team1_region,
    team2Region: r.team2_region,
    league: r.league,
    phase: r.phase,
    day: r.day,
    time: r.time,
    map_scores: r.map_scores ? JSON.parse(r.map_scores) : null,
  }));
}

// Remet à zéro (attempts=0, nextRetryAt=NULL, map_scores=NULL) tous les
// matchs marqués "abandon définitif" — même principe que côté Valorant (cf
// match-history-store.js) : sert après avoir élargi/changé RETRY_DELAYS_MS
// ou la source de scores (Liquipedia seul désormais), sinon ces matchs
// restent bloqués pour toujours. Renvoie le nombre de matchs réinitialisés.
const resetAbandonedStmt = db.prepare(
  `UPDATE matches SET map_scores = NULL, map_scores_attempts = 0, map_scores_next_retry_at = NULL
   WHERE map_scores = 'null'`
);
function resetAbandonedMapScores() {
  const result = resetAbandonedStmt.run();
  return result.changes;
}

export {
  storeFinishedMatches,
  getFullHistoryFlat,
  saveMapScores,
  saveMapScoresFailure,
  getMapScoresState,
  resetAbandonedMapScores,
  getCachedWikitext,
  setCachedWikitext,
};
