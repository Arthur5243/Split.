import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "matches.db");
const db = new Database(DB_PATH);

db.pragma("journal_mode = WAL");

try { db.exec("ALTER TABLE users ADD COLUMN xp INTEGER DEFAULT 0"); } catch {}

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    pseudo TEXT NOT NULL,
    pseudo_lower TEXT NOT NULL,
    avatar TEXT,
    bio TEXT,
    fav_valo TEXT,
    fav_cs2 TEXT,
    fav_rl TEXT,
    points INTEGER DEFAULT 0,
    points_valo INTEGER DEFAULT 0,
    points_cs2 INTEGER DEFAULT 0,
    points_rl INTEGER DEFAULT 0,
    xp INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_users_pseudo_lower ON users(pseudo_lower);

  CREATE TABLE IF NOT EXISTS follows (
    follower_id TEXT NOT NULL,
    followed_id TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (follower_id, followed_id)
  );
  CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_id);
`);

try { db.exec(`ALTER TABLE users ADD COLUMN points_valo INTEGER DEFAULT 0`); } catch {}
try { db.exec(`ALTER TABLE users ADD COLUMN points_cs2 INTEGER DEFAULT 0`); } catch {}
try { db.exec(`ALTER TABLE users ADD COLUMN points_rl INTEGER DEFAULT 0`); } catch {}
try { db.exec(`ALTER TABLE users ADD COLUMN pseudo_color TEXT`); } catch {}
try { db.exec(`ALTER TABLE users ADD COLUMN equipped_title TEXT`); } catch {}
try { db.exec(`ALTER TABLE users ADD COLUMN equipped_banner TEXT`); } catch {}
try { db.exec(`ALTER TABLE users ADD COLUMN email TEXT`); } catch {}
try { db.exec(`ALTER TABLE users ADD COLUMN password_hash TEXT`); } catch {}
try { db.exec(`ALTER TABLE users ADD COLUMN provider TEXT DEFAULT 'local'`); } catch {}
try { db.exec(`ALTER TABLE users ADD COLUMN profile_ready INTEGER DEFAULT 0`); } catch {}
// Migration: tous les users existants (avant l'ajout de profile_ready) sont
// marqués ready. Sinon le leaderboard perd tout le monde. Ne concerne que
// les users qui ont un signe de profil (avatar/bio/fav/points/xp) — pas
// les comptes auth vides tout juste créés.
try {
  db.exec(`
    UPDATE users SET profile_ready = 1
    WHERE profile_ready = 0
      AND (avatar IS NOT NULL OR bio IS NOT NULL OR fav_valo IS NOT NULL OR fav_cs2 IS NOT NULL OR fav_rl IS NOT NULL OR points > 0 OR xp > 0)
  `);
} catch {}
try { db.exec(`CREATE UNIQUE INDEX idx_users_email ON users(email) WHERE email IS NOT NULL`); } catch {}

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_follows_followed ON follows(followed_id);

  CREATE TABLE IF NOT EXISTS profile_views (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    viewer_id TEXT NOT NULL,
    viewed_id TEXT NOT NULL,
    viewed_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_pv_viewed ON profile_views(viewed_id);
`);

const stmts = {
  upsertUser: db.prepare(`
    INSERT INTO users (id, pseudo, pseudo_lower, avatar, bio, fav_valo, fav_cs2, fav_rl, points, points_valo, points_cs2, points_rl, xp, pseudo_color, equipped_title, equipped_banner, profile_ready, updated_at)
    VALUES (@id, @pseudo, @pseudo_lower, @avatar, @bio, @fav_valo, @fav_cs2, @fav_rl, @points, @points_valo, @points_cs2, @points_rl, @xp, @pseudo_color, @equipped_title, @equipped_banner, 1, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      pseudo = @pseudo,
      pseudo_lower = @pseudo_lower,
      avatar = @avatar,
      bio = @bio,
      fav_valo = @fav_valo,
      fav_cs2 = @fav_cs2,
      fav_rl = @fav_rl,
      points = @points,
      points_valo = @points_valo,
      points_cs2 = @points_cs2,
      points_rl = @points_rl,
      xp = CASE WHEN @xp > 0 THEN @xp ELSE users.xp END,
      pseudo_color = COALESCE(@pseudo_color, users.pseudo_color),
      equipped_title = COALESCE(@equipped_title, users.equipped_title),
      equipped_banner = COALESCE(@equipped_banner, users.equipped_banner),
      profile_ready = 1,
      updated_at = datetime('now')
  `),
  getUser: db.prepare(`SELECT * FROM users WHERE id = ?`),
  searchUsers: db.prepare(`SELECT id, pseudo, avatar, points FROM users WHERE pseudo_lower LIKE ? AND id != ? AND profile_ready = 1 LIMIT 20`),
  follow: db.prepare(`INSERT OR IGNORE INTO follows (follower_id, followed_id) VALUES (?, ?)`),
  unfollow: db.prepare(`DELETE FROM follows WHERE follower_id = ? AND followed_id = ?`),
  getFollowing: db.prepare(`
    SELECT u.id, u.pseudo, u.avatar, u.points FROM follows f
    JOIN users u ON u.id = f.followed_id
    WHERE f.follower_id = ?
    ORDER BY f.created_at DESC
  `),
  getFollowers: db.prepare(`
    SELECT u.id, u.pseudo, u.avatar, u.points FROM follows f
    JOIN users u ON u.id = f.follower_id
    WHERE f.followed_id = ?
    ORDER BY f.created_at DESC
  `),
  countFollowing: db.prepare(`SELECT COUNT(*) as c FROM follows WHERE follower_id = ?`),
  countFollowers: db.prepare(`SELECT COUNT(*) as c FROM follows WHERE followed_id = ?`),
  isFollowing: db.prepare(`SELECT 1 FROM follows WHERE follower_id = ? AND followed_id = ?`),
  addView: db.prepare(`INSERT INTO profile_views (viewer_id, viewed_id) VALUES (?, ?)`),
  countViews: db.prepare(`SELECT COUNT(*) as c FROM profile_views WHERE viewed_id = ?`),
  recentViewers: db.prepare(`
    SELECT DISTINCT u.id, u.pseudo, u.avatar FROM profile_views pv
    JOIN users u ON u.id = pv.viewer_id
    WHERE pv.viewed_id = ? AND pv.viewer_id != ?
    ORDER BY pv.viewed_at DESC LIMIT 10
  `),
  getLeaderboard: db.prepare(`SELECT id, pseudo, avatar, points, points_valo, points_cs2, points_rl, xp, pseudo_color, equipped_title, equipped_banner FROM users WHERE profile_ready = 1 ORDER BY points DESC, pseudo ASC LIMIT 100`),
  addXp: db.prepare(`UPDATE users SET xp = xp + ? WHERE id = ?`),
  setXp: db.prepare(`UPDATE users SET xp = ? WHERE pseudo_lower = ?`),
};

export function upsertUser({ id, pseudo, avatar, bio, favTeams, points, pointsPerGame, xp, pseudoColor, equippedTitle, equippedBanner }) {
  stmts.upsertUser.run({
    id,
    pseudo: pseudo || "Joueur",
    pseudo_lower: (pseudo || "joueur").toLowerCase(),
    avatar: avatar || null,
    bio: bio || null,
    fav_valo: favTeams?.valo || null,
    fav_cs2: favTeams?.cs2 || null,
    fav_rl: favTeams?.rl || null,
    points: points || 0,
    points_valo: pointsPerGame?.valo || 0,
    points_cs2: pointsPerGame?.cs2 || 0,
    points_rl: pointsPerGame?.rl || 0,
    xp: xp || 0,
    pseudo_color: pseudoColor || null,
    equipped_title: equippedTitle || null,
    equipped_banner: equippedBanner || null,
  });
}

export function getUser(id) {
  return stmts.getUser.get(id);
}

export function searchUsers(query, excludeId) {
  return stmts.searchUsers.all(`%${query.toLowerCase()}%`, excludeId || "");
}

export function followUser(followerId, followedId) {
  if (followerId === followedId) return false;
  stmts.follow.run(followerId, followedId);
  return true;
}

export function unfollowUser(followerId, followedId) {
  stmts.unfollow.run(followerId, followedId);
}

export function getFollowing(userId) {
  return stmts.getFollowing.all(userId);
}

export function getFollowers(userId) {
  return stmts.getFollowers.all(userId);
}

export function getSocialStats(userId) {
  const following = stmts.countFollowing.get(userId)?.c || 0;
  const followers = stmts.countFollowers.get(userId)?.c || 0;
  const views = stmts.countViews.get(userId)?.c || 0;
  return { following, followers, views };
}

export function isFollowing(followerId, followedId) {
  return !!stmts.isFollowing.get(followerId, followedId);
}

export function addProfileView(viewerId, viewedId) {
  if (viewerId === viewedId) return;
  stmts.addView.run(viewerId, viewedId);
}

export function getRecentViewers(userId) {
  return stmts.recentViewers.all(userId, userId);
}

export function getLeaderboard() {
  return stmts.getLeaderboard.all();
}

export function addXp(userId, amount) {
  stmts.addXp.run(amount, userId);
}

export function setXpByPseudo(pseudo, xp) {
  stmts.setXp.run(xp, pseudo.toLowerCase());
}

export function generateUserId() {
  return crypto.randomUUID();
}

export function getUserCount() {
  const row = db.prepare(`SELECT COUNT(*) as count FROM users`).get();
  return row ? row.count : 0;
}

export function getUserByEmail(email) {
  return db.prepare(`SELECT * FROM users WHERE email = ?`).get(email);
}

export function getUserByPseudo(pseudo) {
  return db.prepare(`SELECT * FROM users WHERE pseudo_lower = ?`).get(pseudo.toLowerCase());
}

export function createAuthUser({ id, email, passwordHash, pseudo, provider }) {
  db.prepare(`
    INSERT INTO users (id, pseudo, pseudo_lower, email, password_hash, provider, points, xp)
    VALUES (?, ?, ?, ?, ?, ?, 0, 0)
  `).run(id, pseudo, pseudo.toLowerCase(), email, passwordHash || null, provider || "local");
}

export function linkGoogleToUser(userId, email) {
  db.prepare(`UPDATE users SET email = ?, provider = 'google' WHERE id = ?`).run(email, userId);
}

/**
 * Fusionne les comptes dupliqués d'un même email : garde le compte
 * "canonique" (qui a l'email set), transfère les points/xp/badges des
 * autres comptes dupliqués (matchés par pseudo similaire), puis supprime
 * les doublons. Sert à réparer les cas où un user s'est inscrit ET a
 * eu un compte social créé indépendamment (bug corrigé côté frontend).
 * Renvoie { kept, merged: [{id, pseudo, points, xp}] }.
 */
export function mergeDuplicatesForEmail(email) {
  const canonical = getUserByEmail(email.toLowerCase());
  if (!canonical) return { kept: null, merged: [] };
  // Cherche tous les autres users avec le même pseudo (case insensitive)
  const dupes = db.prepare(`
    SELECT id, pseudo, points, points_valo, points_cs2, points_rl, xp, avatar, bio, fav_valo, fav_cs2, fav_rl
    FROM users
    WHERE pseudo_lower = ? AND id != ?
  `).all(canonical.pseudo_lower, canonical.id);
  if (dupes.length === 0) return { kept: canonical, merged: [] };

  const totalPoints = dupes.reduce((s, u) => s + (u.points || 0), 0);
  const totalPointsValo = dupes.reduce((s, u) => s + (u.points_valo || 0), 0);
  const totalPointsCs2 = dupes.reduce((s, u) => s + (u.points_cs2 || 0), 0);
  const totalPointsRl = dupes.reduce((s, u) => s + (u.points_rl || 0), 0);
  const maxXp = dupes.reduce((m, u) => Math.max(m, u.xp || 0), 0);

  // Récupère avatar/bio/fav depuis un dupliqué si le canonique n'en a pas
  const enrich = dupes.find((u) => u.avatar || u.bio || u.fav_valo || u.fav_cs2 || u.fav_rl) || {};

  db.prepare(`
    UPDATE users SET
      points = points + ?,
      points_valo = points_valo + ?,
      points_cs2 = points_cs2 + ?,
      points_rl = points_rl + ?,
      xp = CASE WHEN xp < ? THEN ? ELSE xp END,
      avatar = COALESCE(avatar, ?),
      bio = COALESCE(bio, ?),
      fav_valo = COALESCE(fav_valo, ?),
      fav_cs2 = COALESCE(fav_cs2, ?),
      fav_rl = COALESCE(fav_rl, ?),
      profile_ready = 1,
      updated_at = datetime('now')
    WHERE id = ?
  `).run(
    totalPoints, totalPointsValo, totalPointsCs2, totalPointsRl,
    maxXp, maxXp,
    enrich.avatar || null, enrich.bio || null,
    enrich.fav_valo || null, enrich.fav_cs2 || null, enrich.fav_rl || null,
    canonical.id
  );

  // Transfère follows / posts / messages avant delete
  for (const d of dupes) {
    try { db.prepare(`UPDATE OR IGNORE follows SET follower_id = ? WHERE follower_id = ?`).run(canonical.id, d.id); } catch {}
    try { db.prepare(`UPDATE OR IGNORE follows SET followed_id = ? WHERE followed_id = ?`).run(canonical.id, d.id); } catch {}
    try { db.prepare(`DELETE FROM follows WHERE follower_id = ?`).run(d.id); } catch {}
    try { db.prepare(`DELETE FROM follows WHERE followed_id = ?`).run(d.id); } catch {}
    try { db.prepare(`DELETE FROM users WHERE id = ?`).run(d.id); } catch {}
  }

  return {
    kept: { id: canonical.id, pseudo: canonical.pseudo, email: canonical.email },
    merged: dupes.map((d) => ({ id: d.id, pseudo: d.pseudo, points: d.points, xp: d.xp })),
    totalPointsMerged: totalPoints,
  };
}


try {
  db.exec(`ALTER TABLE users ADD COLUMN referral_code TEXT`);
} catch {}
try {
  db.exec(`CREATE UNIQUE INDEX idx_users_referral ON users(referral_code) WHERE referral_code IS NOT NULL`);
} catch {}
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS referrals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      referrer_id TEXT NOT NULL,
      referred_id TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(referred_id)
    );
    CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_id);
  `);
} catch {}

const REFERRAL_XP_REWARD = 200;

export function ensureReferralCode(userId) {
  const user = db.prepare(`SELECT referral_code FROM users WHERE id = ?`).get(userId);
  if (user?.referral_code) return user.referral_code;
  const code = userId.slice(0, 8).toUpperCase();
  db.prepare(`UPDATE users SET referral_code = ? WHERE id = ?`).run(code, userId);
  return code;
}

export function getUserByReferralCode(code) {
  return db.prepare(`SELECT * FROM users WHERE referral_code = ?`).get(code);
}

export function applyReferral(referrerId, referredId) {
  const existing = db.prepare(`SELECT 1 FROM referrals WHERE referred_id = ?`).get(referredId);
  if (existing) return false;
  if (referrerId === referredId) return false;
  db.prepare(`INSERT INTO referrals (referrer_id, referred_id) VALUES (?, ?)`).run(referrerId, referredId);
  db.prepare(`UPDATE users SET xp = xp + ? WHERE id = ?`).run(REFERRAL_XP_REWARD, referrerId);
  db.prepare(`UPDATE users SET xp = xp + ? WHERE id = ?`).run(REFERRAL_XP_REWARD, referredId);
  return true;
}

export function getReferralCount(userId) {
  const row = db.prepare(`SELECT COUNT(*) as c FROM referrals WHERE referrer_id = ?`).get(userId);
  return row?.c || 0;
}

export function getReferrals(userId) {
  return db.prepare(`
    SELECT u.id, u.pseudo, u.avatar, r.created_at FROM referrals r
    JOIN users u ON u.id = r.referred_id
    WHERE r.referrer_id = ? ORDER BY r.created_at DESC
  `).all(userId);
}

export function updatePseudo(userId, newPseudo) {
  db.prepare(`UPDATE users SET pseudo = ?, pseudo_lower = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(newPseudo, newPseudo.toLowerCase(), userId);
}

export function deleteUser(userId) {
  db.prepare(`DELETE FROM follows WHERE follower_id = ? OR followed_id = ?`).run(userId, userId);
  db.prepare(`DELETE FROM profile_views WHERE viewer_id = ? OR viewed_id = ?`).run(userId, userId);
  db.prepare(`DELETE FROM referrals WHERE referrer_id = ? OR referred_id = ?`).run(userId, userId);
  try { db.prepare(`DELETE FROM post_likes WHERE user_id = ?`).run(userId); } catch {}
  try { db.prepare(`DELETE FROM post_comments WHERE user_id = ?`).run(userId); } catch {}
  try { db.prepare(`DELETE FROM posts WHERE user_id = ?`).run(userId); } catch {}
  db.prepare(`DELETE FROM users WHERE id = ?`).run(userId);
}

try { db.exec(`ALTER TABLE users ADD COLUMN reset_token TEXT`); } catch {}
try { db.exec(`ALTER TABLE users ADD COLUMN reset_token_expires TEXT`); } catch {}

export function setResetToken(email, token, expiresAt) {
  db.prepare(`UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE email = ?`)
    .run(token, expiresAt, email);
}

export function getUserByResetToken(token) {
  return db.prepare(`SELECT * FROM users WHERE reset_token = ? AND reset_token_expires > datetime('now')`).get(token);
}

export function clearResetToken(userId) {
  db.prepare(`UPDATE users SET reset_token = NULL, reset_token_expires = NULL WHERE id = ?`).run(userId);
}

export function updatePassword(userId, passwordHash) {
  db.prepare(`UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(passwordHash, userId);
}

export function cleanupOldAccounts(keepPseudos = []) {
  const today = new Date().toISOString().slice(0, 10);
  const placeholders = keepPseudos.map(() => "?").join(",");
  const keepClause = keepPseudos.length > 0 ? `AND pseudo_lower NOT IN (${placeholders})` : "";
  const staleUsers = db.prepare(
    `SELECT id FROM users WHERE date(updated_at) < ? ${keepClause}`
  ).all(today, ...keepPseudos.map(p => p.toLowerCase()));
  let deleted = 0;
  for (const u of staleUsers) {
    deleteUser(u.id);
    deleted++;
  }
  return deleted;
}
