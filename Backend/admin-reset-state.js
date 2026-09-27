// Admin endpoints to reset user game state (UPDATE only, no DELETE).
// Auth: query param key=<ADMIN_KEY>
//
// POST /api/admin/reset-all-users-state
//   Reset xp/points/equipped/pseudo_color for all users.
//   Keep id, email, password_hash, pseudo, provider, created_at intact.
//
// POST /api/admin/reset-user-state?userId=X  (or ?email=X)
//   Reset a single user.

import Database from "better-sqlite3";

const DB_PATH = process.env.DB_PATH || "/data/matches.db";

function checkAuth(req, res) {
  const ADMIN_KEY = process.env.ADMIN_KEY;
  if (!ADMIN_KEY) { res.status(500).json({ error: "ADMIN_KEY not configured" }); return false; }
  if (req.query.key !== ADMIN_KEY) { res.status(403).json({ error: "forbidden" }); return false; }
  return true;
}

function resetUserRow(db, whereClause, whereParams) {
  // Only columns that actually exist in the users table schema.
  // Badge/banner_color/badge_emoji are client-side only (localStorage).
  const stmt = db.prepare(
    "UPDATE users SET " +
    "points = 0, " +
    "points_valo = 0, " +
    "points_cs2 = 0, " +
    "points_rl = 0, " +
    "xp = 0, " +
    "pseudo_color = '#ffffff', " +
    "equipped_title = NULL, " +
    "equipped_banner = NULL " +
    "WHERE " + whereClause
  );
  return stmt.run(...whereParams);
}

export function mountAdminResetEndpoints(app) {
  app.post("/api/admin/reset-all-users-state", (req, res) => {
    if (!checkAuth(req, res)) return;
    try {
      const db = new Database(DB_PATH);
      // Optional excludeUserIds=id1,id2 → these users are NOT reset
      const exclude = (req.query.excludeUserIds || "").split(",").map((s) => s.trim()).filter(Boolean);
      const before = db.prepare("SELECT id, pseudo, xp, points FROM users").all();
      let where = "1=1";
      let params = [];
      if (exclude.length > 0) {
        where = "id NOT IN (" + exclude.map(() => "?").join(",") + ")";
        params = exclude;
      }
      const result = resetUserRow(db, where, params);
      const after = db.prepare("SELECT id, pseudo, xp, points FROM users").all();
      db.close();
      res.json({ ok: true, usersReset: result.changes, excluded: exclude, before, after });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Get full user details (created_at, provider, pseudo_last_changed_at, all points, etc.)
  app.get("/api/admin/user-details", (req, res) => {
    if (!checkAuth(req, res)) return;
    const userId = req.query.userId;
    const email = req.query.email;
    const pseudo = req.query.pseudo;
    if (!userId && !email && !pseudo) return res.status(400).json({ error: "userId/email/pseudo required" });
    try {
      const db = new Database(DB_PATH);
      let where, param;
      if (userId) { where = "id = ?"; param = userId; }
      else if (email) { where = "email = ?"; param = email.toLowerCase(); }
      else { where = "pseudo = ?"; param = pseudo; }
      const user = db.prepare("SELECT id, pseudo, email, provider, created_at, xp, points, points_valo, points_cs2, points_rl, pseudo_color, equipped_title, equipped_banner, pseudo_last_changed_at, pseudo_change_credit FROM users WHERE " + where).get(param);
      // Also check for referrals (who invited them, who they invited)
      let referredBy = null, referrals = [];
      try {
        const ref = db.prepare("SELECT referrer_id, at FROM referrals WHERE referred_id = ?").get(user?.id);
        if (ref) referredBy = ref;
        referrals = db.prepare("SELECT referred_id, at FROM referrals WHERE referrer_id = ?").all(user?.id);
      } catch {}
      db.close();
      res.json({ ok: true, user, referredBy, referrals });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // List all users with created_at + provider + pseudo (light query for admin overview)
  app.get("/api/admin/list-users", (req, res) => {
    if (!checkAuth(req, res)) return;
    try {
      const db = new Database(DB_PATH);
      const users = db.prepare("SELECT id, pseudo, email, provider, created_at, xp, points, points_valo, points_cs2, points_rl FROM users ORDER BY created_at DESC").all();
      db.close();
      res.json({ ok: true, count: users.length, users });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/admin/reset-user-state", (req, res) => {
    if (!checkAuth(req, res)) return;
    const userId = req.query.userId;
    const email = req.query.email;
    if (!userId && !email) return res.status(400).json({ error: "userId or email required" });
    try {
      const db = new Database(DB_PATH);
      const where = userId ? "id = ?" : "email = ?";
      const param = userId || email.toLowerCase();
      const result = resetUserRow(db, where, [param]);
      const user = db.prepare("SELECT id, pseudo, email, xp, points FROM users WHERE " + where).get(param);
      db.close();
      res.json({ ok: true, changed: result.changes, user });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  console.log("[admin-reset] endpoints /api/admin/reset-all-users-state + /reset-user-state ready");
}
