/**
 * Store SQLite pour les calendriers esports editables depuis /password.
 *
 * Table calendar_events :
 *   game       TEXT    (valorant / cs2 / rl)
 *   idx        INTEGER (ordre d'affichage)
 *   key        TEXT    (slug stable pour PK composite)
 *   title      TEXT
 *   start_date TEXT    (YYYY-MM-DD)
 *   end_date   TEXT    (YYYY-MM-DD)
 *   range_txt  TEXT    (texte humain "5 - 16 fev. 2026 . Pologne")
 *   big        INTEGER
 *   detail     TEXT    (JSON array [{region, text}, ...])
 *   enabled    INTEGER
 *   updated_at TEXT
 *
 * PK = (game, key).
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
    CREATE TABLE IF NOT EXISTS calendar_events (
      game TEXT NOT NULL,
      idx INTEGER NOT NULL,
      key TEXT NOT NULL,
      title TEXT,
      start_date TEXT,
      end_date TEXT,
      range_txt TEXT,
      big INTEGER DEFAULT 0,
      detail TEXT,
      enabled INTEGER DEFAULT 1,
      updated_at TEXT,
      PRIMARY KEY (game, key)
    );
  `);
  db.close();
  initDone = true;
}

function parseDetail(txt) {
  if (!txt) return null;
  try {
    const d = JSON.parse(txt);
    return Array.isArray(d) ? d : null;
  } catch { return null; }
}

export function listCalendar(game) {
  ensureInit();
  const db = new Database(DB_PATH, { readonly: true });
  try {
    const rows = db.prepare(
      "SELECT game, idx, key, title, start_date, end_date, range_txt, big, detail, enabled FROM calendar_events WHERE game = ? AND enabled = 1 ORDER BY idx, start_date"
    ).all(game);
    return rows.map(r => ({
      key: r.key,
      title: r.title || "",
      start: r.start_date || "",
      end: r.end_date || "",
      range: r.range_txt || "",
      big: !!r.big,
      detail: parseDetail(r.detail),
      idx: r.idx,
      enabled: r.enabled ? 1 : 0,
    }));
  } finally { db.close(); }
}

export function bulkReplaceCalendar(game, events) {
  ensureInit();
  if (!Array.isArray(events)) throw new Error("events doit etre un array");
  const db = new Database(DB_PATH);
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM calendar_events WHERE game = ?").run(game);
    const stmt = db.prepare(`
      INSERT INTO calendar_events (game, idx, key, title, start_date, end_date, range_txt, big, detail, enabled, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `);
    for (const [i, e] of events.entries()) {
      stmt.run(
        game,
        Number(e.idx ?? i),
        String(e.key || "evt_" + i),
        e.title || null,
        e.start || null,
        e.end || null,
        e.range || null,
        e.big ? 1 : 0,
        e.detail ? JSON.stringify(e.detail) : null,
        e.enabled === 0 ? 0 : 1,
      );
    }
  });
  tx();
  db.close();
}

export function seedRL2026IfEmpty() {
  ensureInit();
  const db = new Database(DB_PATH);
  const n = db.prepare("SELECT COUNT(*) as n FROM calendar_events WHERE game = 'rl'").get()?.n ?? 0;
  if (n > 0) { db.close(); return false; }

  const seed = [
    { key: "open-fall",   title: "Open Qualifiers · Fall",       start: "2026-01-11", end: "2026-02-01", range: "11 janv. - 1 fev. 2026",   big: true,  detail: [{region:"EU",text:"Online"},{region:"NA",text:"Online"},{region:"SAM",text:"Online"},{region:"OCE",text:"Online"},{region:"MENA",text:"Online"},{region:"APAC",text:"Online"}] },
    { key: "rlcs-fall",   title: "RLCS 2026 Fall Major",         start: "2026-03-20", end: "2026-03-29", range: "20 - 29 mars 2026 · Bucarest", big: true, detail: [{region:"GLOBAL",text:"24 equipes qualifiees"}] },
    { key: "open-winter", title: "Open Qualifiers · Winter",     start: "2026-04-05", end: "2026-04-26", range: "5 - 26 avr. 2026",          big: true,  detail: [{region:"EU",text:"Online"},{region:"NA",text:"Online"},{region:"SAM",text:"Online"}] },
    { key: "rlcs-winter", title: "RLCS 2026 Winter Major",       start: "2026-06-05", end: "2026-06-14", range: "5 - 14 juin 2026 · Londres",   big: true, detail: [{region:"GLOBAL",text:"24 equipes"}] },
    { key: "open-spring", title: "Open Qualifiers · Spring",     start: "2026-07-05", end: "2026-07-26", range: "5 - 26 juil. 2026",         big: true,  detail: [{region:"EU",text:"Online"},{region:"NA",text:"Online"}] },
    { key: "rlcs-spring", title: "RLCS 2026 Spring Major",       start: "2026-09-04", end: "2026-09-13", range: "4 - 13 sept. 2026 · Berlin", big: true, detail: [{region:"GLOBAL",text:"24 equipes"}] },
    { key: "worlds",      title: "RLCS 2026 World Championship", start: "2026-11-20", end: "2026-11-29", range: "20 - 29 nov. 2026 · Dallas", big: true, detail: [{region:"GLOBAL",text:"16 equipes - Grand Final"}] },
  ];
  bulkReplaceCalendar("rl", seed);
  db.close();
  console.log(`[calendar-store] RL 2026 seed applique (${seed.length} evenements)`);
  return true;
}
