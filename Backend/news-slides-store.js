/**
 * Store SQLite pour les 3 slides News affichees dans le NewsCarousel de
 * l'app. Modifiables via /password + API.
 *
 * Schema :
 *   news_slides(
 *     idx          INTEGER PRIMARY KEY,         -- 0, 1 ou 2
 *     title        TEXT,
 *     subtitle     TEXT,
 *     badge        TEXT,
 *     image_url    TEXT,
 *     accent_color TEXT,                        -- hex ou rgba
 *     enabled      INTEGER DEFAULT 1,
 *     updated_at   TEXT
 *   );
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
    CREATE TABLE IF NOT EXISTS news_slides (
      idx INTEGER PRIMARY KEY,
      title TEXT,
      subtitle TEXT,
      badge TEXT,
      image_url TEXT,
      accent_color TEXT,
      enabled INTEGER DEFAULT 1,
      updated_at TEXT
    );
  `);
  db.close();
  initDone = true;
}

export function listNewsSlides() {
  ensureInit();
  const db = new Database(DB_PATH, { readonly: true });
  try {
    const rows = db.prepare("SELECT idx, title, subtitle, badge, image_url, accent_color, enabled FROM news_slides ORDER BY idx").all();
    return rows.map(r => ({
      idx: r.idx,
      title: r.title || "",
      subtitle: r.subtitle || "",
      badge: r.badge || "",
      image_url: r.image_url || "",
      accent_color: r.accent_color || "",
      enabled: r.enabled ? 1 : 0,
    }));
  } finally { db.close(); }
}

export function upsertNewsSlide({ idx, title, subtitle, badge, image_url, accent_color, enabled }) {
  ensureInit();
  if (idx == null || Number.isNaN(Number(idx))) throw new Error("idx requis");
  const db = new Database(DB_PATH);
  try {
    db.prepare(`
      INSERT INTO news_slides (idx, title, subtitle, badge, image_url, accent_color, enabled, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(idx) DO UPDATE SET
        title=excluded.title,
        subtitle=excluded.subtitle,
        badge=excluded.badge,
        image_url=excluded.image_url,
        accent_color=excluded.accent_color,
        enabled=excluded.enabled,
        updated_at=excluded.updated_at
    `).run(Number(idx), title || null, subtitle || null, badge || null, image_url || null, accent_color || null, enabled ? 1 : 0);
  } finally { db.close(); }
}

export function bulkReplaceNewsSlides(slides) {
  ensureInit();
  if (!Array.isArray(slides)) throw new Error("slides doit etre un array");
  const db = new Database(DB_PATH);
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM news_slides").run();
    const stmt = db.prepare(`
      INSERT INTO news_slides (idx, title, subtitle, badge, image_url, accent_color, enabled, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `);
    for (const [i, s] of slides.entries()) {
      stmt.run(
        Number(s.idx ?? i),
        s.title || null,
        s.subtitle || null,
        s.badge || null,
        s.image_url || null,
        s.accent_color || null,
        s.enabled === 0 ? 0 : 1,
      );
    }
  });
  tx();
  db.close();
}
