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
    ciphertext TEXT,
    iv TEXT,
    sender_copy TEXT,
    sender_iv TEXT,
    content TEXT,
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

// Migration: ajoute colonne content pour plain text (remplace E2E chiffrement
// qui causait des bugs 'cle manquante' quand un user etait wipe/supprime).
try { db.exec(`ALTER TABLE dm_messages ADD COLUMN content TEXT`); } catch {}

const stmts = {
  setKey: db.prepare(`INSERT OR REPLACE INTO user_keys (user_id, public_key, updated_at) VALUES (?, ?, datetime('now'))`),
  getKey: db.prepare(`SELECT public_key FROM user_keys WHERE user_id = ?`),

  sendDmPlain: db.prepare(`INSERT INTO dm_messages (sender_id, receiver_id, content) VALUES (?, ?, ?)`),
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

  deleteDm: db.prepare(`DELETE FROM dm_messages WHERE id = ? AND sender_id = ?`),
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

export function sendDmPlain(senderId, receiverId, content) {
  const convKey = [senderId, receiverId].sort();
  stmts.upsertConv.run(convKey[0], convKey[1]);
  const r = stmts.sendDmPlain.run(senderId, receiverId, content);
  return r.lastInsertRowid;
}

export function getDmConversation(userId1, userId2, limit = 50, offset = 0) {
  return stmts.getDmConv.all(userId1, userId2, userId2, userId1, limit, offset);
}

export function getConversations(userId) {
  return stmts.getConversations.all(userId, userId, userId).map(c => {
    const partnerId = c.user1 === userId ? c.user2 : c.user1;
    // Fetch le dernier message plain text pour preview
    let lastMessage = null;
    try {
      const row = db.prepare(`
        SELECT content, sender_id, created_at FROM dm_messages
        WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
        ORDER BY created_at DESC LIMIT 1
      `).get(userId, partnerId, partnerId, userId);
      if (row) {
        lastMessage = {
          content: row.content || "[Message chiffré]",
          fromMe: row.sender_id === userId,
          at: row.created_at,
        };
      }
    } catch {}
    return {
      partnerId,
      pseudo: c.pseudo,
      avatar: c.avatar,
      lastMessageAt: c.last_message_at,
      lastMessage,
    };
  });
}

export function deleteDmMessage(messageId, senderId) {
  const r = stmts.deleteDm.run(messageId, senderId);
  return r.changes > 0;
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
