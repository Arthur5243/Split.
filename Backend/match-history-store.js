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

// INSERT OR IGNORE : si le match existe déjà (même id), on ne le retouche pas.
// -> jamais de doublon, jamais de donnée écrasée au hasard.
const upsertStmt = db.prepare(`
  INSERT OR IGNORE INTO matches
    (id, team1, team2, team1_name, team2_name, score1, score2, status, region, league, phase, day, time, raw_json)
  VALUES
    (@id, @team1, @team2, @team1Name, @team2Name, @score1, @score2, @status, @region, @league, @phase, @day, @time, @raw)
`);

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

/** Historique filtré pour une équipe donnée (utile pour du debug/monitoring). */
function getTeamHistory(teamCode, limit = 50) {
  const rows = db
    .prepare(
      `SELECT raw_json FROM matches WHERE team1 = ? OR team2 = ? ORDER BY day DESC, time DESC LIMIT ?`
    )
    .all(teamCode, teamCode, limit);
  return rows.map((r) => JSON.parse(r.raw_json));
}

export { storeFinishedMatches, getFullHistory, getTeamHistory };
