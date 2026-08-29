import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "matches.db");
const db = new Database(DB_PATH);

db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'result',
    content TEXT,
    match_id TEXT,
    match_data TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_posts_user ON posts(user_id);
  CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC);

  CREATE TABLE IF NOT EXISTS post_likes (
    post_id INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (post_id, user_id)
  );
`);

const stmts = {
  create: db.prepare(`INSERT INTO posts (user_id, type, content, match_id, match_data) VALUES (?, ?, ?, ?, ?)`),
  getFeed: db.prepare(`
    SELECT p.*, u.pseudo, u.avatar,
      (SELECT COUNT(*) FROM post_likes WHERE post_id = p.id) as likes
    FROM posts p
    LEFT JOIN users u ON u.id = p.user_id
    ORDER BY p.created_at DESC LIMIT ? OFFSET ?
  `),
  getUserPosts: db.prepare(`
    SELECT p.*,
      (SELECT COUNT(*) FROM post_likes WHERE post_id = p.id) as likes
    FROM posts p WHERE p.user_id = ?
    ORDER BY p.created_at DESC LIMIT 50
  `),
  getById: db.prepare(`
    SELECT p.*, u.pseudo, u.avatar,
      (SELECT COUNT(*) FROM post_likes WHERE post_id = p.id) as likes
    FROM posts p LEFT JOIN users u ON u.id = p.user_id WHERE p.id = ?
  `),
  like: db.prepare(`INSERT OR IGNORE INTO post_likes (post_id, user_id) VALUES (?, ?)`),
  unlike: db.prepare(`DELETE FROM post_likes WHERE post_id = ? AND user_id = ?`),
  isLiked: db.prepare(`SELECT 1 FROM post_likes WHERE post_id = ? AND user_id = ?`),
  delete: db.prepare(`DELETE FROM posts WHERE id = ? AND user_id = ?`),
};

export function createPost(userId, type, content, matchId, matchData) {
  const r = stmts.create.run(userId, type, content || null, matchId || null, matchData ? JSON.stringify(matchData) : null);
  return r.lastInsertRowid;
}

export function getFeed(limit = 30, offset = 0) {
  return stmts.getFeed.all(limit, offset).map(p => ({
    ...p,
    match_data: p.match_data ? JSON.parse(p.match_data) : null,
  }));
}

export function getUserPosts(userId) {
  return stmts.getUserPosts.all(userId).map(p => ({
    ...p,
    match_data: p.match_data ? JSON.parse(p.match_data) : null,
  }));
}

export function getPostById(id) {
  const p = stmts.getById.get(id);
  if (!p) return null;
  return { ...p, match_data: p.match_data ? JSON.parse(p.match_data) : null };
}

export function likePost(postId, userId) {
  stmts.like.run(postId, userId);
}

export function unlikePost(postId, userId) {
  stmts.unlike.run(postId, userId);
}

export function isPostLiked(postId, userId) {
  return !!stmts.isLiked.get(postId, userId);
}

export function deletePost(postId, userId) {
  return stmts.delete.run(postId, userId).changes > 0;
}
