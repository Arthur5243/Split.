import { Router } from "express";
import {
  upsertUser,
  getUser,
  searchUsers,
  followUser,
  unfollowUser,
  getFollowing,
  getFollowers,
  getSocialStats,
  isFollowing,
  addProfileView,
  getRecentViewers,
  getLeaderboard,
  generateUserId,
} from "./social-store.js";

const router = Router();

router.post("/api/social/register", (req, res) => {
  const { id, pseudo, avatar, bio, favTeams, points } = req.body;
  if (!id || !pseudo) return res.status(400).json({ error: "id and pseudo required" });
  upsertUser({ id, pseudo, avatar, bio, favTeams, points });
  res.json({ ok: true });
});

router.get("/api/social/me/:userId", (req, res) => {
  const user = getUser(req.params.userId);
  if (!user) return res.status(404).json({ error: "not found" });
  const stats = getSocialStats(req.params.userId);
  res.json({ ...user, ...stats });
});

router.get("/api/social/search", (req, res) => {
  const { q, userId } = req.query;
  if (!q || q.length < 2) return res.json([]);
  const results = searchUsers(q, userId || "");
  res.json(results);
});

router.get("/api/social/profile/:targetId", (req, res) => {
  const { targetId } = req.params;
  const { viewerId } = req.query;
  const user = getUser(targetId);
  if (!user) return res.status(404).json({ error: "not found" });
  const stats = getSocialStats(targetId);
  const iFollow = viewerId ? isFollowing(viewerId, targetId) : false;
  const followsMe = viewerId ? isFollowing(targetId, viewerId) : false;
  if (viewerId && viewerId !== targetId) {
    addProfileView(viewerId, targetId);
  }
  res.json({ ...user, ...stats, iFollow, followsMe });
});

router.post("/api/social/follow", (req, res) => {
  const { followerId, followedId } = req.body;
  if (!followerId || !followedId) return res.status(400).json({ error: "ids required" });
  followUser(followerId, followedId);
  res.json({ ok: true });
});

router.post("/api/social/unfollow", (req, res) => {
  const { followerId, followedId } = req.body;
  if (!followerId || !followedId) return res.status(400).json({ error: "ids required" });
  unfollowUser(followerId, followedId);
  res.json({ ok: true });
});

router.get("/api/social/following/:userId", (req, res) => {
  res.json(getFollowing(req.params.userId));
});

router.get("/api/social/followers/:userId", (req, res) => {
  res.json(getFollowers(req.params.userId));
});

router.get("/api/social/viewers/:userId", (req, res) => {
  const viewers = getRecentViewers(req.params.userId);
  const stats = getSocialStats(req.params.userId);
  res.json({ total: stats.views, viewers });
});

router.get("/api/social/leaderboard", (_req, res) => {
  res.json(getLeaderboard());
});

router.get("/api/social/generate-id", (_req, res) => {
  res.json({ id: generateUserId() });
});

export default router;
