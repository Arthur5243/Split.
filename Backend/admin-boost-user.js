/**
 * Endpoint admin : boost un user par pseudo.
 *
 * POST /api/admin/boost-user
 *   body: { pseudo, points?, tier_level?, wipe_history? }
 *   headers: x-bracket-admin ou ?key=
 *
 * - points : set users.points directement (wipe_history=1 vide aussi
 *   user_match_points pour empecher le re-calcul par points-engine)
 * - tier_level : index 0-5 dans RANK_TIERS cote frontend.
 *     Stocke dans users.force_tier_level ; le frontend lit ca via
 *     profile.forceTierLevel et override le rang affiche.
 *     Passer -1 ou null pour clear.
 */

import express from "express";
import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "matches.db");

const router = express.Router();

function adminPassword() {
  return process.env.BRACKET_ADMIN_PASSWORD || process.env.ADMIN_KEY || null;
}
function checkPwd(req, res) {
  const pwd = adminPassword();
  if (!pwd) { res.status(500).json({ error: "BRACKET_ADMIN_PASSWORD non configure" }); return false; }
  const provided = req.headers["x-bracket-admin"] || req.query.key || req.body?.password;
  if (provided !== pwd) { res.status(403).json({ error: "forbidden" }); return false; }
  return true;
}

function ensureColumn(db) {
  try { db.exec("ALTER TABLE users ADD COLUMN force_tier_level INTEGER DEFAULT NULL"); } catch {}
}

router.post("/api/admin/boost-user", (req, res) => {
  if (!checkPwd(req, res)) return;
  const pseudo = (req.body?.pseudo || "").trim().toLowerCase();
  if (!pseudo) return res.status(400).json({ error: "pseudo requis" });

  const db = new Database(DB_PATH);
  try {
    ensureColumn(db);

    // MATCH EXACT (le LIKE prefixe matchait "testagain" en cherchant "test").
    const row = db.prepare(
      "SELECT id, pseudo, points, force_tier_level FROM users WHERE pseudo_lower = ? OR id = ? LIMIT 1"
    ).get(pseudo, pseudo);
    if (!row) { db.close(); return res.status(404).json({ error: "user introuvable" }); }

    const before = { points: row.points, force_tier_level: row.force_tier_level };
    const changes = { pseudo: row.pseudo };

    const hasPoints = Object.prototype.hasOwnProperty.call(req.body || {}, "points");
    const hasTier = Object.prototype.hasOwnProperty.call(req.body || {}, "tier_level");

    if (hasPoints) {
      const pts = Number(req.body.points);
      if (!Number.isFinite(pts)) { db.close(); return res.status(400).json({ error: "points invalide" }); }
      // Delta (ex: -100 pour penalite) ou absolu selon `delta=true`
      const applyDelta = req.body.delta === true || req.body.delta === 1 || req.body.delta === "1";
      let finalPoints = applyDelta ? ((row.points || 0) + pts) : pts;
      if (req.body.wipe_history) {
        db.prepare("DELETE FROM user_match_points WHERE user_id = ?").run(row.id);
        changes.history_wiped = true;
      }
      db.prepare(
        `UPDATE users SET points = ?, updated_at = datetime('now') WHERE id = ?`
      ).run(finalPoints, row.id);
      changes.points = finalPoints;
      changes.applied_delta = applyDelta ? pts : null;

      // Message optionnel (penalite affichee au user). Stocke dans
      // admin_notifications (table creee si pas existante).
      const reason = (req.body.reason || "").trim();
      if (reason) {
        try {
          db.exec(`CREATE TABLE IF NOT EXISTS admin_notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            type TEXT,
            message TEXT,
            delta_points INTEGER,
            seen INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now'))
          )`);
          db.prepare(
            "INSERT INTO admin_notifications (user_id, type, message, delta_points) VALUES (?, ?, ?, ?)"
          ).run(row.id, applyDelta ? "penalty" : "adjustment", reason, applyDelta ? pts : null);
          changes.notification_sent = true;
        } catch (e) { console.log("[boost] admin_notifications echec:", e.message); }
      }
    }

    if (hasTier) {
      const t = req.body.tier_level;
      if (t === null || t === -1 || t === "") {
        db.prepare("UPDATE users SET force_tier_level = NULL, updated_at = datetime('now') WHERE id = ?").run(row.id);
        changes.force_tier_level = null;
      } else {
        const tier = Number(t);
        if (!Number.isInteger(tier) || tier < 0 || tier > 10) { db.close(); return res.status(400).json({ error: "tier_level invalide (0-10 ou null)" }); }
        db.prepare("UPDATE users SET force_tier_level = ?, updated_at = datetime('now') WHERE id = ?").run(tier, row.id);
        changes.force_tier_level = tier;
      }
    }

    db.close();
    res.json({ ok: true, user: row.pseudo, before, changes });
  } catch (e) {
    try { db.close(); } catch {}
    res.status(500).json({ error: e.message });
  }
});

export default router;
