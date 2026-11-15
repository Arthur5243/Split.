/**
 * Store SQLite pour les matchs ajoutes/edites manuellement via /password.
 *
 * Ces matchs sont INJECTES dans les flux /api/<game>-upcoming|live|results
 * cote serveur (merge avec les matchs PandaScore / Liquipedia / scrapers).
 * Status calcule au vol selon begin_at + end_at + status_override :
 *   - status_override = "finished" | "running" | "not_started" force l'etat.
 *   - sinon : before begin_at -> not_started
 *             entre begin_at et begin_at+duration -> running
 *             apres -> finished (si score1/score2 renseignes) ou canceled.
 *
 * Schema :
 *   custom_matches(
 *     id              TEXT PK,
 *     game            TEXT NOT NULL,         -- valorant / cs2 / rl
 *     team1_name      TEXT,
 *     team2_name      TEXT,
 *     team1_logo      TEXT,
 *     team2_logo      TEXT,
 *     begin_at        TEXT,                  -- ISO
 *     end_at          TEXT,                  -- ISO (optionnel : estime via format sinon)
 *     region          TEXT,
 *     league          TEXT,
 *     phase           TEXT,
 *     format          TEXT,                  -- BO1 / BO3 / BO5
 *     accent_color    TEXT,
 *     stream_url      TEXT,
 *     score1          INTEGER,
 *     score2          INTEGER,
 *     status_override TEXT,                  -- "not_started" | "running" | "finished" | null
 *     map_scores      TEXT,                  -- JSON [{map, score1, score2}]
 *     created_by      TEXT,                  -- "admin" / "code"
 *     created_at      TEXT,
 *     updated_at      TEXT
 *   )
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import Database from "better-sqlite3";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "matches.db");

let initDone = false;
function ensureInit() {
  if (initDone) return;
  const db = new Database(DB_PATH);
  db.exec(`
    CREATE TABLE IF NOT EXISTS custom_matches (
      id TEXT PRIMARY KEY,
      game TEXT NOT NULL,
      team1_name TEXT,
      team2_name TEXT,
      team1_logo TEXT,
      team2_logo TEXT,
      begin_at TEXT,
      end_at TEXT,
      region TEXT,
      league TEXT,
      phase TEXT,
      format TEXT,
      accent_color TEXT,
      stream_url TEXT,
      score1 INTEGER,
      score2 INTEGER,
      status_override TEXT,
      map_scores TEXT,
      created_by TEXT,
      created_at TEXT,
      updated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_custom_matches_game ON custom_matches(game);
    CREATE INDEX IF NOT EXISTS idx_custom_matches_begin ON custom_matches(begin_at);
  `);
  db.close();
  initDone = true;
}

function newId() { return "cust-" + crypto.randomBytes(6).toString("hex"); }

function formatDurationMs(format) {
  // BO1 ~45min, BO3 ~2h30, BO5 ~4h. Enveloppe large pour marge.
  const f = String(format || "").toUpperCase();
  if (f === "BO1") return 60 * 60_000;
  if (f === "BO5") return 5 * 60 * 60_000;
  return 3 * 60 * 60_000; // defaut BO3
}

function computedStatus(m) {
  if (m.status_override) return m.status_override;
  const now = Date.now();
  const begin = m.begin_at ? new Date(m.begin_at).getTime() : null;
  const end = m.end_at
    ? new Date(m.end_at).getTime()
    : (begin ? begin + formatDurationMs(m.format) : null);
  if (begin && now < begin) return "not_started";
  if (begin && end && now >= begin && now <= end) return "running";
  if (end && now > end) {
    const hasResult = m.score1 != null || m.score2 != null;
    return hasResult ? "finished" : "finished";
  }
  return "not_started";
}

function parseMapScores(raw) {
  if (!raw) return null;
  try { const v = JSON.parse(raw); return Array.isArray(v) && v.length ? v : null; } catch { return null; }
}

function rowToMatch(r) {
  const match = {
    id: r.id,
    game: r.game,
    team1_name: r.team1_name,
    team2_name: r.team2_name,
    team1_logo: r.team1_logo,
    team2_logo: r.team2_logo,
    begin_at: r.begin_at,
    end_at: r.end_at,
    region: r.region,
    league: r.league,
    phase: r.phase,
    format: r.format,
    accent_color: r.accent_color,
    stream_url: r.stream_url,
    score1: r.score1,
    score2: r.score2,
    status_override: r.status_override,
    map_scores: parseMapScores(r.map_scores),
    created_by: r.created_by,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
  match.status = computedStatus(match);
  return match;
}

export function listCustomMatches({ game, status, limit = 500 } = {}) {
  ensureInit();
  const db = new Database(DB_PATH, { readonly: true });
  try {
    const where = [];
    const params = [];
    if (game) { where.push("game = ?"); params.push(game); }
    const sql = "SELECT * FROM custom_matches"
              + (where.length ? " WHERE " + where.join(" AND ") : "")
              + " ORDER BY begin_at DESC LIMIT " + Number(limit);
    const rows = db.prepare(sql).all(...params).map(rowToMatch);
    if (status) return rows.filter(r => r.status === status);
    return rows;
  } finally { db.close(); }
}

export function getCustomMatch(id) {
  ensureInit();
  const db = new Database(DB_PATH, { readonly: true });
  try {
    const r = db.prepare("SELECT * FROM custom_matches WHERE id = ?").get(id);
    return r ? rowToMatch(r) : null;
  } finally { db.close(); }
}

export function upsertCustomMatch(data) {
  ensureInit();
  const id = data.id || newId();
  const game = String(data.game || "").toLowerCase();
  if (!["valorant", "cs2", "rl"].includes(game)) throw new Error("game invalide (valorant/cs2/rl)");

  const db = new Database(DB_PATH);
  try {
    const exists = db.prepare("SELECT id FROM custom_matches WHERE id = ?").get(id);
    const payload = {
      id, game,
      team1_name: data.team1_name || null,
      team2_name: data.team2_name || null,
      team1_logo: data.team1_logo || null,
      team2_logo: data.team2_logo || null,
      begin_at: data.begin_at || null,
      end_at: data.end_at || null,
      region: data.region || null,
      league: data.league || null,
      phase: data.phase || null,
      format: data.format || "BO3",
      accent_color: data.accent_color || null,
      stream_url: data.stream_url || null,
      score1: data.score1 == null ? null : Number(data.score1),
      score2: data.score2 == null ? null : Number(data.score2),
      status_override: data.status_override || null,
      map_scores: Array.isArray(data.map_scores) ? JSON.stringify(data.map_scores) : null,
      created_by: data.created_by || "admin",
    };
    if (exists) {
      db.prepare(`UPDATE custom_matches SET
        game=@game, team1_name=@team1_name, team2_name=@team2_name,
        team1_logo=@team1_logo, team2_logo=@team2_logo,
        begin_at=@begin_at, end_at=@end_at, region=@region,
        league=@league, phase=@phase, format=@format,
        accent_color=@accent_color, stream_url=@stream_url,
        score1=@score1, score2=@score2, status_override=@status_override,
        map_scores=@map_scores, updated_at=datetime('now')
        WHERE id=@id`).run(payload);
    } else {
      db.prepare(`INSERT INTO custom_matches
        (id, game, team1_name, team2_name, team1_logo, team2_logo, begin_at, end_at,
         region, league, phase, format, accent_color, stream_url, score1, score2,
         status_override, map_scores, created_by, created_at, updated_at)
        VALUES (@id, @game, @team1_name, @team2_name, @team1_logo, @team2_logo,
                @begin_at, @end_at, @region, @league, @phase, @format,
                @accent_color, @stream_url, @score1, @score2,
                @status_override, @map_scores, @created_by, datetime('now'), datetime('now'))`).run(payload);
    }
    return { id };
  } finally { db.close(); }
}

export function deleteCustomMatch(id) {
  ensureInit();
  const db = new Database(DB_PATH);
  try { return db.prepare("DELETE FROM custom_matches WHERE id = ?").run(id).changes > 0; }
  finally { db.close(); }
}

/**
 * Parse un bloc texte de matchs : 1 match par ligne.
 * Formats supportes :
 *   "2026-11-20 18:00 | VCT EMEA | BO3 | Fnatic vs Team Heretics"
 *   "2026-11-20 18:00 | VCT EMEA | Fnatic vs Team Heretics"
 *   "2026-11-20 | Fnatic vs Team Heretics"
 * Separe par " | ", champs = date, league, format?, "T1 vs T2".
 * Retourne [{begin_at, league, format, team1_name, team2_name, ...}, ...].
 */
export function parseBulkMatchesCode(text, game) {
  const lines = String(text || "").split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const out = [];
  for (const line of lines) {
    if (line.startsWith("#") || line.startsWith("//")) continue;
    // Accepte "/" ou "|" comme separateur (le user prefere /, plus naturel
    // sans shift).
    const parts = line.split(/\s*[\/|]\s*/).map(p => p.trim()).filter(Boolean);
    if (parts.length < 2) continue;
    const vsPart = parts[parts.length - 1];
    const m = vsPart.match(/^(.+?)\s+vs\.?\s+(.+?)$/i);
    if (!m) continue;
    const team1 = m[1].trim();
    const team2 = m[2].trim();
    let begin_at = null;
    let league = null;
    let format = "BO3";
    const dateStr = parts[0];
    const dateRe = /^(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{1,2}):(\d{2}))?/;
    const dm = dateStr.match(dateRe);
    if (dm) {
      const d = new Date(Date.UTC(Number(dm[1]), Number(dm[2]) - 1, Number(dm[3]), Number(dm[4] || 0), Number(dm[5] || 0)));
      begin_at = d.toISOString();
    }
    for (let i = 1; i < parts.length - 1; i++) {
      const p = parts[i];
      if (/^BO\d+$/i.test(p)) format = p.toUpperCase();
      else if (!league) league = p;
    }
    out.push({ game, begin_at, league, format, team1_name: team1, team2_name: team2, created_by: "code" });
  }
  return out;
}
