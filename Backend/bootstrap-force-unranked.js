/**
 * Bootstrap one-shot : force l'affichage Unranked pour certains users via
 * env var BOOTSTRAP_FORCE_UNRANKED (CSV de pseudos ou user ids).
 *
 * Ex: BOOTSTRAP_FORCE_UNRANKED="sayzoxrl,derttox"
 *
 * N'affecte PAS les points ni l'historique — pose juste le flag
 * users.force_unranked=1 que le frontend lit via /api/social/me pour
 * surcharger le rang affiche.
 *
 * Idempotent via sentinel /data/.bootstrap-force-unranked-done (hash du
 * payload). BOOTSTRAP_FORCE_UNRANKED_RESET=1 pour remettre a 0 tous les
 * users (reset avant d'appliquer la nouvelle liste).
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import Database from "better-sqlite3";

const DATA_DIR = process.env.DB_PATH ? path.dirname(process.env.DB_PATH) : "/data";
const MAIN_DB = process.env.DB_PATH || path.join(DATA_DIR, "matches.db");
const SENTINEL = path.join(DATA_DIR, ".bootstrap-force-unranked-done");

export function maybeRunBootstrapForceUnranked() {
  const raw = process.env.BOOTSTRAP_FORCE_UNRANKED;
  if (!raw) return;
  const keys = raw.split(",").map(s => s.trim()).filter(Boolean);
  if (!keys.length) return;
  const hash = crypto.createHash("sha256").update(raw + "|" + (process.env.BOOTSTRAP_FORCE_UNRANKED_RESET || "")).digest("hex").slice(0, 16);
  try {
    if (fs.existsSync(SENTINEL) && fs.readFileSync(SENTINEL, "utf8").trim() === hash) {
      console.log("[bootstrap-force-unranked] déjà appliqué, skip");
      return;
    }
  } catch {}

  setTimeout(() => {
    try {
      if (!fs.existsSync(MAIN_DB)) { console.log("[bootstrap-force-unranked] DB absente, skip"); return; }
      const db = new Database(MAIN_DB);
      // Assure que la colonne existe
      try { db.exec(`ALTER TABLE users ADD COLUMN force_unranked INTEGER DEFAULT 0`); } catch {}
      if (process.env.BOOTSTRAP_FORCE_UNRANKED_RESET === "1") {
        const r = db.prepare("UPDATE users SET force_unranked = 0").run();
        console.log(`[bootstrap-force-unranked] reset: ${r.changes} users remis a 0`);
      }
      // MATCH EXACT (le LIKE prefixe matchait "testagain" en cherchant "test").
      const findStmt = db.prepare(
        "SELECT id, pseudo FROM users WHERE pseudo_lower = ? OR id = ? LIMIT 1"
      );
      const updateStmt = db.prepare("UPDATE users SET force_unranked = 1, updated_at = datetime('now') WHERE id = ?");
      const results = [];
      for (const key of keys) {
        const k = key.toLowerCase();
        const row = findStmt.get(k, key);
        if (!row) { results.push({ key, status: "not_found" }); continue; }
        const r = updateStmt.run(row.id);
        results.push({ key, matched: row.pseudo, changed: r.changes });
      }
      db.close();
      for (const r of results) console.log("[bootstrap-force-unranked]", JSON.stringify(r));
      try { fs.writeFileSync(SENTINEL, hash); } catch {}
      console.log("[bootstrap-force-unranked] ✅ terminé");
    } catch (e) {
      console.error("[bootstrap-force-unranked] ❌ échec:", e.message);
    }
  }, 7000);
}
