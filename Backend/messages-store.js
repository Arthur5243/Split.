import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "matches.db");
const db = new Database(DB_PATH);

db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS user_keys (
    user_id TEXT PRIMARY KEY,
    public_key TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS dm_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id TEXT NOT NULL,
    receiver_id TEXT NOT NULL,
    ciphertext TEXT NOT NULL,
    iv TEXT NOT NULL,
    sender_copy TEXT NOT NULL,
    sender_iv TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_dm_sender ON dm_messages(sender_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_dm_receiver ON dm_messages(receiver_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_dm_conv ON dm_messages(sender_id, receiver_id);

  CREATE TABLE IF NOT EXISTS community_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_community_created ON community_messages(created_at DESC);

  CREATE TABLE IF NOT EXISTS conversations (
    user1 TEXT NOT NULL,
    user2 TEXT NOT NULL,
    last_message_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (user1, user2)
  );
`);

const stmts = {
  setKey: db.prepare(`INSERT OR REPLACE INTO user_keys (user_id, public_key, updated_at) VALUES (?, ?, datetime('now'))`),
  getKey: db.prepare(`SELECT public_key FROM user_keys WHERE user_id = ?`),

  sendDm: db.prepare(`INSERT INTO dm_messages (sender_id, receiver_id, ciphertext, iv, sender_copy, sender_iv) VALUES (?, ?, ?, ?, ?, ?)`),
  getDmConv: db.prepare(`
    SELECT * FROM dm_messages
    WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
    ORDER BY created_at DESC LIMIT ? OFFSET ?
  `),
  getConversations: db.prepare(`
    SELECT c.*, u.pseudo, u.avatar FROM conversations c
    LEFT JOIN users u ON u.id = CASE WHEN c.user1 = ? THEN c.user2 ELSE c.user1 END
    WHERE c.user1 = ? OR c.user2 = ?
    ORDER BY c.last_message_at DESC LIMIT 50
  `),
  upsertConv: db.prepare(`
    INSERT INTO conversations (user1, user2, last_message_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(user1, user2) DO UPDATE SET last_message_at = datetime('now')
  `),

  deleteCommunity: db.prepare(`DELETE FROM community_messages WHERE id = ? AND user_id = ?`),
  sendCommunity: db.prepare(`INSERT INTO community_messages (user_id, content) VALUES (?, ?)`),
  getCommunity: db.prepare(`
    SELECT cm.*, u.pseudo, u.avatar FROM community_messages cm
    LEFT JOIN users u ON u.id = cm.user_id
    ORDER BY cm.created_at DESC LIMIT ? OFFSET ?
  `),
  getCommunityAfter: db.prepare(`
    SELECT cm.*, u.pseudo, u.avatar FROM community_messages cm
    LEFT JOIN users u ON u.id = cm.user_id
    WHERE cm.id > ?
    ORDER BY cm.created_at ASC LIMIT 100
  `),
};

export function setPublicKey(userId, publicKey) {
  stmts.setKey.run(userId, publicKey);
}

export function getPublicKey(userId) {
  const row = stmts.getKey.get(userId);
  return row ? row.public_key : null;
}

export function sendDm(senderId, receiverId, ciphertext, iv, senderCopy, senderIv) {
  const convKey = [senderId, receiverId].sort();
  stmts.upsertConv.run(convKey[0], convKey[1]);
  const r = stmts.sendDm.run(senderId, receiverId, ciphertext, iv, senderCopy, senderIv);
  return r.lastInsertRowid;
}

export function getDmConversation(userId1, userId2, limit = 50, offset = 0) {
  return stmts.getDmConv.all(userId1, userId2, userId2, userId1, limit, offset);
}

export function getConversations(userId) {
  return stmts.getConversations.all(userId, userId, userId).map(c => ({
    partnerId: c.user1 === userId ? c.user2 : c.user1,
    pseudo: c.pseudo,
    avatar: c.avatar,
    lastMessageAt: c.last_message_at,
  }));
}

export function deleteCommunityMessage(messageId, userId) {
  const r = stmts.deleteCommunity.run(messageId, userId);
  return r.changes > 0;
}

export function sendCommunityMessage(userId, content) {
  const r = stmts.sendCommunity.run(userId, content);
  return r.lastInsertRowid;
}

export function getCommunityMessages(limit = 50, offset = 0) {
  return stmts.getCommunity.all(limit, offset);
}

export function getCommunityAfter(lastId) {
  return stmts.getCommunityAfter.all(lastId);
}
