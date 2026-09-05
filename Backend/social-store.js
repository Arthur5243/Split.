import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "matches.db");
const db = new Database(DB_PATH);

db.pragma("journal_mode = WAL");

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
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_users_pseudo_lower ON users(pseudo_lower);

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
    INSERT INTO users (id, pseudo, pseudo_lower, avatar, bio, fav_valo, fav_cs2, fav_rl, points, points_valo, points_cs2, points_rl, updated_at)
    VALUES (@id, @pseudo, @pseudo_lower, @avatar, @bio, @fav_valo, @fav_cs2, @fav_rl, @points, @points_valo, @points_cs2, @points_rl, datetime('now'))
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
      updated_at = datetime('now')
  `),
  getUser: db.prepare(`SELECT * FROM users WHERE id = ?`),
  searchUsers: db.prepare(`SELECT id, pseudo, avatar, points FROM users WHERE pseudo_lower LIKE ? AND id != ? LIMIT 20`),
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
  getLeaderboard: db.prepare(`SELECT id, pseudo, avatar, points, points_valo, points_cs2, points_rl FROM users WHERE points > 0 ORDER BY points DESC LIMIT 50`),
};

export function upsertUser({ id, pseudo, avatar, bio, favTeams, points, pointsPerGame }) {
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

export function generateUserId() {
  return crypto.randomUUID();
}
