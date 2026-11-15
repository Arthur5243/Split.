/**
 * Store SQLite pour les scores par map saisis MANUELLEMENT via /password.
 *
 * Remplit map_scores pour les matchs ou vlr.gg / Liquipedia / PandaScore
 * n'ont rien trouve (match ancien, tier 4, nom equipe custom, etc.).
 *
 * Table :
 *   manual_map_scores(
 *     match_id      TEXT PK,           -- id interne ("ps-12345", "cs2-67890")
 *     game          TEXT,              -- valorant / cs2 / rl
 *     team1_name    TEXT,
 *     team2_name    TEXT,
 *     day           TEXT,
 *     scores        TEXT,              -- JSON [{map, score1, score2}, ...]
 *     updated_at    TEXT
 *   )
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "matches.db");

let initDone = false;
function ensureInit() {
  if (initDone) return;
  const db = new Database(DB_PATH);
  db.exec(`
    CREATE TABLE IF NOT EXISTS manual_map_scores (
      match_id TEXT PRIMARY KEY,
      game TEXT,
      team1_name TEXT,
      team2_name TEXT,
      day TEXT,
      scores TEXT,
      updated_at TEXT
    );
  `);
  db.close();
  initDone = true;
}

export function getManualMapScores(matchId) {
  ensureInit();
  const db = new Database(DB_PATH, { readonly: true });
  try {
    const row = db.prepare("SELECT scores FROM manual_map_scores WHERE match_id = ?").get(String(matchId));
    if (!row || !row.scores) return null;
    try { return JSON.parse(row.scores); } catch { return null; }
  } finally { db.close(); }
}

export function setManualMapScores({ match_id, game, team1_name, team2_name, day, scores }) {
  ensureInit();
  if (!match_id) throw new Error("match_id requis");
  const db = new Database(DB_PATH);
  try {
    db.prepare(`
      INSERT INTO manual_map_scores (match_id, game, team1_name, team2_name, day, scores, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(match_id) DO UPDATE SET
        game = excluded.game,
        team1_name = excluded.team1_name,
        team2_name = excluded.team2_name,
        day = excluded.day,
        scores = excluded.scores,
        updated_at = excluded.updated_at
    `).run(String(match_id), game || null, team1_name || null, team2_name || null, day || null,
           Array.isArray(scores) ? JSON.stringify(scores) : null);
  } finally { db.close(); }
}

export function deleteManualMapScores(matchId) {
  ensureInit();
  const db = new Database(DB_PATH);
  try {
    const r = db.prepare("DELETE FROM manual_map_scores WHERE match_id = ?").run(String(matchId));
    return r.changes > 0;
  } finally { db.close(); }
}

export function listManualMapScores({ game, limit = 100 } = {}) {
  ensureInit();
  const db = new Database(DB_PATH, { readonly: true });
  try {
    const sql = game
      ? "SELECT match_id, game, team1_name, team2_name, day, scores FROM manual_map_scores WHERE game = ? ORDER BY day DESC LIMIT ?"
      : "SELECT match_id, game, team1_name, team2_name, day, scores FROM manual_map_scores ORDER BY day DESC LIMIT ?";
    const rows = game
      ? db.prepare(sql).all(game, Number(limit))
      : db.prepare(sql).all(Number(limit));
    return rows.map(r => ({
      ...r,
      scores: (() => { try { return JSON.parse(r.scores || "[]"); } catch { return []; } })(),
    }));
  } finally { db.close(); }
}

/**
 * Cherche les matchs qui N'ONT PAS de map_scores (ni auto ni manuel).
 * Sert a l'UI admin : afficher la liste des matchs "a completer".
 */
export function findMatchesMissingScores({ dbPath, matchesTable = "matches", limit = 100 }) {
  ensureInit();
  const db = new Database(dbPath, { readonly: true });
  try {
    const rows = db.prepare(`
      SELECT id, team1_name, team2_name, score1, score2, league, phase, day, status, map_scores
      FROM ${matchesTable}
      WHERE status = 'finished'
        AND (map_scores IS NULL OR map_scores = '' OR map_scores = 'null' OR map_scores = '[]')
      ORDER BY day DESC, id DESC
      LIMIT ?
    `).all(Number(limit));
    db.close();
    // Filtre : enleve ceux qui ont deja une entree manuelle
    const manualDb = new Database(DB_PATH, { readonly: true });
    try {
      const ids = rows.map(r => String(r.id));
      if (ids.length === 0) return [];
      const placeholders = ids.map(() => "?").join(",");
      const manual = new Set(
        manualDb.prepare(`SELECT match_id FROM manual_map_scores WHERE match_id IN (${placeholders})`).all(...ids).map(x => x.match_id)
      );
      return rows.filter(r => !manual.has(String(r.id)));
    } finally { manualDb.close(); }
  } catch (e) {
    try { db.close(); } catch {}
    throw e;
  }
}
