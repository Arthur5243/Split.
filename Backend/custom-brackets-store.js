/**
 * Stockage des brackets custom crees via /password admin UI.
 *
 * Table custom_brackets :
 *   id              TEXT PK   (uuid court)
 *   game            TEXT      ("valorant", "cs2", "rl")
 *   tournament_name TEXT      (nom affiche ET utilise pour matching matchs)
 *   tournament_name_lower TEXT (pour search insensible a la casse)
 *   structure       TEXT JSON (toute la structure du bracket)
 *   created_at      TEXT ISO
 *   updated_at      TEXT ISO
 *
 * structure JSON format :
 * {
 *   "format": "single_elim" | "double_elim" | "custom",
 *   "groupStage": { "enabled": bool, "groups": [{name, teams:[], matches:[matchId]}] },
 *   "playIn":      { "enabled": bool, "rounds": [...] },
 *   "playoffs": {
 *     "enabled": true,
 *     "upper": [{name, matches:[{id, label, matchId|null}]}],
 *     "lower": [{name, matches:[...]}],
 *     "grandFinal": { enabled, matchId|null, reset:{enabled, matchId} },
 *     "thirdPlace": { enabled, matchId|null }
 *   }
 * }
 */

import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "matches.db");

let _db = null;
function getDb() {
  if (_db) return _db;
  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  _db.exec(`
    CREATE TABLE IF NOT EXISTS custom_brackets (
      id TEXT PRIMARY KEY,
      game TEXT NOT NULL,
      tournament_name TEXT NOT NULL,
      tournament_name_lower TEXT NOT NULL,
      structure TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_cb_game ON custom_brackets(game);
    CREATE INDEX IF NOT EXISTS idx_cb_tname ON custom_brackets(tournament_name_lower);
  `);
  return _db;
}

function genId() {
  return "cb_" + crypto.randomBytes(8).toString("hex");
}

export function listCustomBrackets(game) {
  const db = getDb();
  if (game) {
    return db.prepare("SELECT id, game, tournament_name, created_at, updated_at FROM custom_brackets WHERE game = ? ORDER BY updated_at DESC").all(game);
  }
  return db.prepare("SELECT id, game, tournament_name, created_at, updated_at FROM custom_brackets ORDER BY updated_at DESC").all();
}

export function getCustomBracket(id) {
  const db = getDb();
  const row = db.prepare("SELECT * FROM custom_brackets WHERE id = ?").get(id);
  if (!row) return null;
  try { row.structure = JSON.parse(row.structure); } catch { row.structure = null; }
  return row;
}

export function findCustomBracketsByTournament(game, query) {
  const db = getDb();
  const q = (query || "").toLowerCase().trim();
  if (!q) return [];
  return db.prepare(
    "SELECT id, game, tournament_name, updated_at FROM custom_brackets WHERE game = ? AND tournament_name_lower LIKE ? ORDER BY updated_at DESC LIMIT 20"
  ).all(game, "%" + q + "%");
}

export function upsertCustomBracket({ id, game, tournament_name, structure }) {
  if (!game || !tournament_name || !structure) throw new Error("game, tournament_name, structure required");
  if (!["valorant", "cs2", "rl"].includes(game)) throw new Error("invalid game");
  const db = getDb();
  const tnl = String(tournament_name).toLowerCase().trim();
  const structureJson = typeof structure === "string" ? structure : JSON.stringify(structure);
  // Validation JSON
  try { JSON.parse(structureJson); } catch { throw new Error("structure n'est pas un JSON valide"); }

  if (id) {
    const existing = db.prepare("SELECT id FROM custom_brackets WHERE id = ?").get(id);
    if (existing) {
      db.prepare(
        "UPDATE custom_brackets SET game = ?, tournament_name = ?, tournament_name_lower = ?, structure = ?, updated_at = datetime('now') WHERE id = ?"
      ).run(game, tournament_name, tnl, structureJson, id);
      return getCustomBracket(id);
    }
  }
  const newId = id || genId();
  db.prepare(
    "INSERT INTO custom_brackets (id, game, tournament_name, tournament_name_lower, structure) VALUES (?, ?, ?, ?, ?)"
  ).run(newId, game, tournament_name, tnl, structureJson);
  return getCustomBracket(newId);
}

export function deleteCustomBracket(id) {
  const db = getDb();
  const r = db.prepare("DELETE FROM custom_brackets WHERE id = ?").run(id);
  return r.changes > 0;
}
