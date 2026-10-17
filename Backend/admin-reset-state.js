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

  // Force wipe of client state for a specific user. Sets wipe_at=now() on the
  // user row. Next /api/auth/me returns it, frontend detects and clears its
  // localStorage split_* + reloads.
  app.post("/api/admin/force-wipe", (req, res) => {
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
      const now = new Date().toISOString();
      const result = db.prepare("UPDATE users SET wipe_at = ? WHERE " + where).run(now, param);
      // Also reset backend state (points/xp/equipped)
      resetUserRow(db, where, [param]);
      const user = db.prepare("SELECT id, pseudo, email, xp, points, wipe_at FROM users WHERE " + where).get(param);
      db.close();
      res.json({ ok: true, wipeSet: result.changes, user });
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

  // DELETE ALL users + toutes leurs donnees rattachees.
  // Vraiment destructif: pseudos redeviennent disponibles, aucun compte ne
  // survit. Les prochaines connexions Google creent un nouveau row propre.
  // Nettoie aussi: follows, referrals, profile_views, posts, post_likes,
  // post_comments, dm_messages, community_messages, conversations, user_keys.
  app.post("/api/admin/delete-all-users", (req, res) => {
    if (!checkAuth(req, res)) return;
    try {
      const db = new Database(DB_PATH);
      const before = db.prepare("SELECT COUNT(*) as n FROM users").get().n;
      // Tables auxiliaires (silencieux si table absente sur cette instance).
      const wipeTables = [
        "follows",
        "referrals",
        "profile_views",
        "post_likes",
        "post_comments",
        "posts",
        "dm_messages",
        "community_messages",
        "conversations",
        "user_keys",
      ];
      const wiped = {};
      for (const t of wipeTables) {
        try {
          const r = db.prepare("DELETE FROM " + t).run();
          wiped[t] = r.changes;
        } catch (e) {
          wiped[t] = "skipped: " + e.message;
        }
      }
      const userDel = db.prepare("DELETE FROM users").run();
      const after = db.prepare("SELECT COUNT(*) as n FROM users").get().n;
      db.close();
      res.json({ ok: true, usersBefore: before, usersDeleted: userDel.changes, usersAfter: after, wiped });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/admin/set-user-prediction?pseudo=X&matchId=ps-123
  //   body JSON: { seriesA, seriesB, games: [{a,b},...] }
  //   Pose/remplace la prédiction dans user_sync (synced au prochain load client).
  app.post("/api/admin/set-user-prediction", (req, res) => {
    if (!checkAuth(req, res)) return;
    const pseudo = req.query.pseudo;
    const userId = req.query.userId;
    const matchId = req.query.matchId;
    const body = req.body || {};
    if (!userId && !pseudo) return res.status(400).json({ error: "userId or pseudo required" });
    if (!matchId) return res.status(400).json({ error: "matchId required" });
    if (body.seriesA == null || body.seriesB == null) return res.status(400).json({ error: "seriesA and seriesB required" });
    try {
      const db = new Database(DB_PATH);
      const u = userId
        ? db.prepare("SELECT id FROM users WHERE id = ?").get(userId)
        : db.prepare("SELECT id FROM users WHERE pseudo = ?").get(pseudo);
      if (!u) { db.close(); return res.status(404).json({ error: "user not found" }); }
      const row = db.prepare("SELECT predictions FROM user_sync WHERE user_id = ?").get(u.id);
      const preds = row ? JSON.parse(row.predictions || "{}") : {};
      preds[matchId] = {
        seriesA: String(body.seriesA),
        seriesB: String(body.seriesB),
        games: Array.isArray(body.games) ? body.games.map((g) => ({ a: String(g.a ?? ""), b: String(g.b ?? "") })) : [],
        placedAt: Date.now(),
      };
      const now = new Date().toISOString();
      if (row) {
        db.prepare("UPDATE user_sync SET predictions = ?, updated_at = ? WHERE user_id = ?").run(JSON.stringify(preds), now, u.id);
      } else {
        db.prepare("INSERT INTO user_sync (user_id, predictions, settled, boosted, updated_at) VALUES (?, ?, '[]', '[]', ?)").run(u.id, JSON.stringify(preds), now);
      }
      db.close();
      res.json({ ok: true, matchId, prediction: preds[matchId] });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/admin/set-user-xp?pseudo=X&xp=N
  app.post("/api/admin/set-user-xp", (req, res) => {
    if (!checkAuth(req, res)) return;
    const userId = req.query.userId;
    const pseudo = req.query.pseudo;
    const xp = Number(req.query.xp);
    if (!userId && !pseudo) return res.status(400).json({ error: "userId or pseudo required" });
    if (!Number.isFinite(xp) || xp < 0) return res.status(400).json({ error: "xp must be a non-negative number" });
    try {
      const db = new Database(DB_PATH);
      const where = userId ? "id = ?" : "pseudo = ?";
      const param = userId || pseudo;
      const result = db.prepare("UPDATE users SET xp = ? WHERE " + where).run(xp, param);
      const user = db.prepare("SELECT id, pseudo, xp FROM users WHERE " + where).get(param);
      db.close();
      res.json({ ok: true, changed: result.changes, user });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/admin/add-points-bonus?pseudo=X&points=N&game=valo
  //   Ajoute un bonus persistant dans user_match_points (match_id fictif
  //   `bonus-manual-<ts>`) + recalcule total users.points. Le worker ne
  //   l'écrase pas car il ne touche pas aux match_id inconnus.
  app.post("/api/admin/add-points-bonus", (req, res) => {
    if (!checkAuth(req, res)) return;
    const pseudo = req.query.pseudo;
    const userId = req.query.userId;
    const points = Number(req.query.points);
    const game = (req.query.game || "valo").toLowerCase();
    if (!userId && !pseudo) return res.status(400).json({ error: "userId or pseudo required" });
    if (!Number.isFinite(points) || points === 0) return res.status(400).json({ error: "points must be a non-zero number" });
    if (!["valo", "cs2", "rl"].includes(game)) return res.status(400).json({ error: "game must be valo|cs2|rl" });
    try {
      const db = new Database(DB_PATH);
      const u = userId
        ? db.prepare("SELECT id FROM users WHERE id = ?").get(userId)
        : db.prepare("SELECT id FROM users WHERE pseudo = ?").get(pseudo);
      if (!u) { db.close(); return res.status(404).json({ error: "user not found" }); }
      const matchId = `bonus-manual-${Date.now()}`;
      const now = new Date().toISOString();
      db.transaction(() => {
        db.prepare(`INSERT INTO user_match_points (user_id, match_id, game, points, correct, exact, updated_at) VALUES (?, ?, ?, ?, 0, 0, ?)`).run(u.id, matchId, game, points, now);
        const rows = db.prepare(`SELECT game, SUM(points) AS pts, COUNT(*) AS n, SUM(correct) AS c, SUM(exact) AS e FROM user_match_points WHERE user_id = ? GROUP BY game`).all(u.id);
        const by = Object.fromEntries(rows.map((r) => [r.game, r]));
        const sum = (k) => rows.reduce((s, r) => s + (r[k] || 0), 0);
        db.prepare(`UPDATE users SET points = ?, points_valo = ?, points_cs2 = ?, points_rl = ?, bets_total = ?, bets_correct = ?, bets_exact = ? WHERE id = ?`).run(sum("pts"), by.valo?.pts || 0, by.cs2?.pts || 0, by.rl?.pts || 0, sum("n"), sum("c"), sum("e"), u.id);
      })();
      const user = db.prepare("SELECT id, pseudo, points, points_valo, points_cs2, points_rl FROM users WHERE id = ?").get(u.id);
      db.close();
      res.json({ ok: true, matchId, user });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/admin/set-user-points?userId=X&points=N
  //   ou  ?pseudo=X&points=N
  //   Overrride direct des points d'un user (sans toucher à XP ou aux breakdowns par jeu).
  app.post("/api/admin/set-user-points", (req, res) => {
    if (!checkAuth(req, res)) return;
    const userId = req.query.userId;
    const pseudo = req.query.pseudo;
    const points = Number(req.query.points);
    if (!userId && !pseudo) return res.status(400).json({ error: "userId or pseudo required" });
    if (!Number.isFinite(points) || points < 0) return res.status(400).json({ error: "points must be a non-negative number" });
    try {
      const db = new Database(DB_PATH);
      const where = userId ? "id = ?" : "pseudo = ?";
      const param = userId || pseudo;
      const result = db.prepare("UPDATE users SET points = ? WHERE " + where).run(points, param);
      const user = db.prepare("SELECT id, pseudo, points FROM users WHERE " + where).get(param);
      db.close();
      res.json({ ok: true, changed: result.changes, user });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  console.log("[admin-reset] endpoints /api/admin/reset-all-users-state + /reset-user-state + /delete-all-users + /set-user-points ready (v3)");
}
