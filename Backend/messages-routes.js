import { Router } from "express";
import {
  setPublicKey, getPublicKey, sendDm, getDmConversation,
  getConversations, sendCommunityMessage, deleteCommunityMessage, getCommunityMessages, getCommunityAfter
} from "./messages-store.js";
import { containsBlockedWord, sanitizeMessage } from "./word-filter.js";

const router = Router();

router.post("/api/messages/keys", (req, res) => {
  const { userId, publicKey } = req.body;
  if (!userId || !publicKey) return res.status(400).json({ error: "userId and publicKey required" });
  setPublicKey(userId, publicKey);
  res.json({ ok: true });
});

router.get("/api/messages/keys/:userId", (req, res) => {
  const key = getPublicKey(req.params.userId);
  if (!key) return res.status(404).json({ error: "no key" });
  res.json({ publicKey: key });
});

router.post("/api/messages/dm", (req, res) => {
  const { senderId, receiverId, ciphertext, iv, senderCopy, senderIv } = req.body;
  if (!senderId || !receiverId || !ciphertext || !iv || !senderCopy || !senderIv) {
    return res.status(400).json({ error: "missing fields" });
  }
  const id = sendDm(senderId, receiverId, ciphertext, iv, senderCopy, senderIv);
  res.json({ id });
});

router.get("/api/messages/dm/:userId/:partnerId", (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const offset = parseInt(req.query.offset) || 0;
  const msgs = getDmConversation(req.params.userId, req.params.partnerId, limit, offset);
  res.json(msgs);
});

router.get("/api/messages/conversations/:userId", (req, res) => {
  res.json(getConversations(req.params.userId));
});

router.post("/api/messages/community", (req, res) => {
  const { userId, content } = req.body;
  if (!userId || !content) return res.status(400).json({ error: "userId and content required" });
  const isVoice = content.startsWith("[VOICE]");
  if (isVoice) {
    if (content.length > 4 * 1024 * 1024) return res.status(400).json({ error: "voice_too_large" });
    const id = sendCommunityMessage(userId, content);
    return res.json({ id });
  }
  const safe = sanitizeMessage(content);
  if (!safe) return res.status(400).json({ error: "empty" });
  if (containsBlockedWord(safe)) return res.status(400).json({ error: "blocked_content" });
  const id = sendCommunityMessage(userId, safe);
  res.json({ id });
});

router.get("/api/messages/community", (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const offset = parseInt(req.query.offset) || 0;
  res.json(getCommunityMessages(limit, offset));
});

router.delete("/api/messages/community/:id", (req, res) => {
  const { userId } = req.body;
  const id = parseInt(req.params.id);
  if (!userId || !id) return res.status(400).json({ error: "userId and id required" });
  const deleted = deleteCommunityMessage(id, userId);
  if (!deleted) return res.status(403).json({ error: "not_found_or_not_owner" });
  res.json({ ok: true });
});

router.get("/api/messages/community/poll", (req, res) => {
  const lastId = parseInt(req.query.after) || 0;
  res.json(getCommunityAfter(lastId));
});

export default router;
