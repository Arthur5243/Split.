import { Router } from "express";
import { createPost, getFeed, getUserPosts, getPostById, getPostImage, likePost, unlikePost, isPostLiked, deletePost } from "./posts-store.js";
import { containsBlockedWord, sanitizeMessage } from "./word-filter.js";

const router = Router();

router.post("/api/posts", (req, res) => {
  const { userId, type, content, matchId, matchData, image } = req.body;
  if (!userId) return res.status(400).json({ error: "userId required" });
  if (content && containsBlockedWord(content)) {
    return res.status(400).json({ error: "blocked_content" });
  }
  const safe = sanitizeMessage(content);
  const id = createPost(userId, type || "result", safe, matchId, matchData, image);
  res.json({ id });
});

router.get("/api/posts/feed", (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 30, 100);
  const offset = parseInt(req.query.offset) || 0;
  const userId = req.query.userId;
  const posts = getFeed(limit, offset);
  const enriched = posts.map(p => ({
    ...p,
    liked: userId ? isPostLiked(p.id, userId) : false,
  }));
  res.json(enriched);
});

router.get("/api/posts/user/:userId", (req, res) => {
  res.json(getUserPosts(req.params.userId));
});

router.get("/api/posts/:id/image", (req, res) => {
  const img = getPostImage(parseInt(req.params.id));
  if (!img) return res.status(404).json({ error: "no image" });
  const match = img.match(/^data:(image\/\w+);base64,(.+)$/);
  if (match) {
    const buf = Buffer.from(match[2], "base64");
    res.set("Content-Type", match[1]);
    res.set("Cache-Control", "public, max-age=86400");
    return res.send(buf);
  }
  res.json({ image: img });
});

router.get("/api/posts/:id", (req, res) => {
  const post = getPostById(parseInt(req.params.id));
  if (!post) return res.status(404).json({ error: "not found" });
  res.json(post);
});

router.post("/api/posts/:id/like", (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: "userId required" });
  likePost(parseInt(req.params.id), userId);
  res.json({ ok: true });
});

router.post("/api/posts/:id/unlike", (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: "userId required" });
  unlikePost(parseInt(req.params.id), userId);
  res.json({ ok: true });
});

router.delete("/api/posts/:id", (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: "userId required" });
  const ok = deletePost(parseInt(req.params.id), userId);
  res.json({ ok });
});

export default router;
