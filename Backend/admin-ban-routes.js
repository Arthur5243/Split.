/**
 * Systeme de ban des utilisateurs.
 *
 * Table users : colonnes ban_until (ISO), ban_reason (TEXT)
 * Table ban_appeals(id, user_id, pseudo, message, created_at, resolved)
 *
 * Endpoints :
 *   PUBLIC  GET  /api/me/ban-status            : headers Authorization (bearer)
 *                                                -> { banned, ban_until, ban_reason }
 *   PUBLIC  POST /api/me/ban-appeal            : { message } (bearer)
 *                                                -> cree un appeal
 *   ADMIN   GET  /api/admin/bans               : liste users bannis
 *   ADMIN   GET  /api/admin/ban-appeals        : liste appeals non resolus
 *   ADMIN   POST /api/admin/ban-user           : { pseudo, until_iso, reason }
 *   ADMIN   POST /api/admin/unban-user         : { pseudo }
 *   ADMIN   POST /api/admin/users-search       : { q } (debug : liste users
 *                                                matchant un texte)
 */

import express from "express";
import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { verifyToken } from "./auth-routes.js";

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

function bearerUserId(req) {
  const h = req.headers.authorization;
  if (!h || !h.startsWith("Bearer ")) return null;
  const p = verifyToken(h.slice(7));
  return p?.sub || null;
}

function ensureSchema(db) {
  try { db.exec("ALTER TABLE users ADD COLUMN ban_until TEXT"); } catch {}
  try { db.exec("ALTER TABLE users ADD COLUMN ban_reason TEXT"); } catch {}
  db.exec(`CREATE TABLE IF NOT EXISTS ban_appeals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    pseudo TEXT,
    message TEXT,
    resolved INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_ban_appeals_resolved ON ban_appeals(resolved)`);
}

// ---------- Public : check ban + appeal ----------
router.get("/api/me/ban-status", (req, res) => {
  const uid = bearerUserId(req);
  if (!uid) return res.status(401).json({ error: "non authentifie" });
  const db = new Database(DB_PATH, { readonly: true });
  try {
    ensureSchema(new Database(DB_PATH));
    const row = db.prepare("SELECT ban_until, ban_reason FROM users WHERE id = ?").get(uid);
    if (!row) { db.close(); return res.json({ banned: false }); }
    const until = row.ban_until ? new Date(row.ban_until).getTime() : null;
    const isActive = until && until > Date.now();
    db.close();
    res.json({
      banned: !!isActive,
      ban_until: isActive ? row.ban_until : null,
      ban_reason: isActive ? row.ban_reason : null,
    });
  } catch (e) { try { db.close(); } catch {} res.status(500).json({ error: e.message }); }
});

router.post("/api/me/ban-appeal", (req, res) => {
  const uid = bearerUserId(req);
  if (!uid) return res.status(401).json({ error: "non authentifie" });
  const msg = (req.body?.message || "").trim();
  if (!msg || msg.length < 5) return res.status(400).json({ error: "message requis (>= 5 car.)" });
  if (msg.length > 2000) return res.status(400).json({ error: "message trop long (max 2000)" });
  const db = new Database(DB_PATH);
  try {
    ensureSchema(db);
    const u = db.prepare("SELECT pseudo FROM users WHERE id = ?").get(uid);
    db.prepare("INSERT INTO ban_appeals (user_id, pseudo, message) VALUES (?, ?, ?)")
      .run(uid, u?.pseudo || "?", msg);
    db.close();
    res.json({ ok: true });
  } catch (e) { try { db.close(); } catch {} res.status(500).json({ error: e.message }); }
});

// ---------- Admin ----------
router.get("/api/admin/bans", (req, res) => {
  if (!checkPwd(req, res)) return;
  const db = new Database(DB_PATH);
  try {
    ensureSchema(db);
    const rows = db.prepare(
      `SELECT id, pseudo, email, ban_until, ban_reason FROM users WHERE ban_until IS NOT NULL
       ORDER BY ban_until DESC LIMIT 200`
    ).all();
    const now = Date.now();
    db.close();
    res.json(rows.map(r => ({ ...r, active: r.ban_until && new Date(r.ban_until).getTime() > now })));
  } catch (e) { try { db.close(); } catch {} res.status(500).json({ error: e.message }); }
});

router.get("/api/admin/ban-appeals", (req, res) => {
  if (!checkPwd(req, res)) return;
  const db = new Database(DB_PATH);
  try {
    ensureSchema(db);
    const includeResolved = req.query.all === "1";
    const sql = includeResolved
      ? "SELECT id, user_id, pseudo, message, resolved, created_at FROM ban_appeals ORDER BY created_at DESC LIMIT 200"
      : "SELECT id, user_id, pseudo, message, resolved, created_at FROM ban_appeals WHERE resolved = 0 ORDER BY created_at DESC LIMIT 200";
    const rows = db.prepare(sql).all();
    db.close();
    res.json(rows);
  } catch (e) { try { db.close(); } catch {} res.status(500).json({ error: e.message }); }
});

router.post("/api/admin/ban-appeals/:id/resolve", (req, res) => {
  if (!checkPwd(req, res)) return;
  const db = new Database(DB_PATH);
  try {
    ensureSchema(db);
    db.prepare("UPDATE ban_appeals SET resolved = 1 WHERE id = ?").run(Number(req.params.id));
    db.close();
    res.json({ ok: true });
  } catch (e) { try { db.close(); } catch {} res.status(500).json({ error: e.message }); }
});

router.post("/api/admin/ban-user", (req, res) => {
  if (!checkPwd(req, res)) return;
  const pseudo = (req.body?.pseudo || "").trim().toLowerCase();
  const reason = (req.body?.reason || "").trim();
  const untilIso = req.body?.until_iso || null;
  const durationHours = Number(req.body?.duration_hours || 0);
  if (!pseudo) return res.status(400).json({ error: "pseudo requis" });
  if (!reason) return res.status(400).json({ error: "reason requise" });

  // Calcule ban_until : si duration_hours fourni, sinon until_iso, sinon ban permanent (10 ans)
  let banUntil;
  if (durationHours > 0) banUntil = new Date(Date.now() + durationHours * 3600_000).toISOString();
  else if (untilIso) banUntil = new Date(untilIso).toISOString();
  else banUntil = new Date(Date.now() + 10 * 365 * 86400_000).toISOString();

  const db = new Database(DB_PATH);
  try {
    ensureSchema(db);
    const row = db.prepare("SELECT id, pseudo FROM users WHERE pseudo_lower = ? OR id = ? LIMIT 1").get(pseudo, pseudo);
    if (!row) { db.close(); return res.status(404).json({ error: "user introuvable" }); }
    db.prepare("UPDATE users SET ban_until = ?, ban_reason = ?, updated_at = datetime('now') WHERE id = ?")
      .run(banUntil, reason, row.id);
    db.close();
    res.json({ ok: true, user: row.pseudo, ban_until: banUntil, reason });
  } catch (e) { try { db.close(); } catch {} res.status(500).json({ error: e.message }); }
});

router.post("/api/admin/unban-user", (req, res) => {
  if (!checkPwd(req, res)) return;
  const pseudo = (req.body?.pseudo || "").trim().toLowerCase();
  if (!pseudo) return res.status(400).json({ error: "pseudo requis" });
  const db = new Database(DB_PATH);
  try {
    ensureSchema(db);
    const row = db.prepare("SELECT id, pseudo FROM users WHERE pseudo_lower = ? OR id = ? LIMIT 1").get(pseudo, pseudo);
    if (!row) { db.close(); return res.status(404).json({ error: "user introuvable" }); }
    db.prepare("UPDATE users SET ban_until = NULL, ban_reason = NULL WHERE id = ?").run(row.id);
    db.close();
    res.json({ ok: true, user: row.pseudo });
  } catch (e) { try { db.close(); } catch {} res.status(500).json({ error: e.message }); }
});

// Debug : liste les users dont le pseudo contient le texte q.
router.get("/api/admin/users-search", (req, res) => {
  if (!checkPwd(req, res)) return;
  const q = String(req.query.q || "").toLowerCase().trim();
  if (!q) return res.json([]);
  const db = new Database(DB_PATH, { readonly: true });
  try {
    const rows = db.prepare(
      `SELECT id, pseudo, pseudo_lower, email, points, xp, ban_until, created_at FROM users
       WHERE pseudo_lower LIKE ? OR id LIKE ? OR email LIKE ? ORDER BY points DESC LIMIT 100`
    ).all("%" + q + "%", "%" + q + "%", "%" + q + "%");
    db.close();
    res.json(rows);
  } catch (e) { try { db.close(); } catch {} res.status(500).json({ error: e.message }); }
});

// Notifications admin (penalites, messages) pour le user authentifie.
router.get("/api/me/admin-notifications", (req, res) => {
  const uid = bearerUserId(req);
  if (!uid) return res.status(401).json({ error: "non authentifie" });
  const db = new Database(DB_PATH);
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS admin_notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL, type TEXT, message TEXT, delta_points INTEGER,
      seen INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now'))
    )`);
    const rows = db.prepare(
      "SELECT id, type, message, delta_points, seen, created_at FROM admin_notifications WHERE user_id = ? AND seen = 0 ORDER BY created_at DESC LIMIT 20"
    ).all(uid);
    if (rows.length > 0) {
      db.prepare("UPDATE admin_notifications SET seen = 1 WHERE user_id = ? AND seen = 0").run(uid);
    }
    db.close();
    res.json(rows);
  } catch (e) { try { db.close(); } catch {} res.status(500).json({ error: e.message }); }
});

export default router;
