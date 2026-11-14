/**
 * Bootstrap one-shot : applique des points à des users au démarrage.
 * Utile quand on n'a pas de shell direct pour curl l'endpoint admin.
 *
 * Config via env var BOOTSTRAP_POINTS (JSON) :
 *   {"sayzoxrl": 1276, "derttox": 897}
 *
 * Les clés sont des pseudos (insensible à la casse) OU des user ids.
 * Matching :
 *   - D'abord exact pseudo_lower = key.lower()
 *   - Puis LIKE "key%" (préfixe) pour "sayzoxrl" / "sayzox"
 *   - Puis id = key
 *
 * Idempotent via sentinel /data/.bootstrap-points-done (contient le hash
 * de BOOTSTRAP_POINTS). Change le JSON → nouveau hash → re-applique.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import Database from "better-sqlite3";

const DATA_DIR = process.env.DB_PATH ? path.dirname(process.env.DB_PATH) : "/data";
const MAIN_DB = process.env.DB_PATH || path.join(DATA_DIR, "matches.db");
const SENTINEL = path.join(DATA_DIR, ".bootstrap-points-done");

export function maybeRunBootstrapPoints() {
  const raw = process.env.BOOTSTRAP_POINTS;
  if (!raw) return;
  let payload;
  try { payload = JSON.parse(raw); }
  catch { console.log("[bootstrap-points] BOOTSTRAP_POINTS invalide JSON, skip"); return; }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return;

  const hash = crypto.createHash("sha256").update(raw).digest("hex").slice(0, 16);
  try {
    if (fs.existsSync(SENTINEL) && fs.readFileSync(SENTINEL, "utf8").trim() === hash) {
      console.log("[bootstrap-points] déjà appliqué pour ce payload (hash match), skip");
      return;
    }
  } catch {}

  setTimeout(() => {
    try {
      if (!fs.existsSync(MAIN_DB)) { console.log("[bootstrap-points] DB absente, skip"); return; }
      const db = new Database(MAIN_DB);
      const findStmt = db.prepare(
        "SELECT id, pseudo, points FROM users WHERE pseudo_lower = ? OR pseudo_lower LIKE ? OR id = ? LIMIT 1"
      );
      const updateStmt = db.prepare("UPDATE users SET points = ?, updated_at = datetime('now') WHERE id = ?");
      const results = [];
      for (const [key, pts] of Object.entries(payload)) {
        const k = String(key).toLowerCase();
        const row = findStmt.get(k, k + "%", key);
        if (!row) { results.push({ key, status: "not_found" }); continue; }
        const points = Math.max(0, Math.floor(Number(pts) || 0));
        const r = updateStmt.run(points, row.id);
        results.push({ key, matchedPseudo: row.pseudo, oldPoints: row.points, newPoints: points, changed: r.changes });
      }
      db.close();
      for (const r of results) console.log("[bootstrap-points]", JSON.stringify(r));
      try { fs.writeFileSync(SENTINEL, hash); } catch {}
      console.log("[bootstrap-points] ✅ terminé");
    } catch (e) {
      console.error("[bootstrap-points] ❌ échec:", e.message);
    }
  }, 5000);
}
