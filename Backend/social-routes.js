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
  addXp,
  setXpByPseudo,
  ensureReferralCode,
  getUserByReferralCode,
  applyReferral,
  getReferralCount,
  getReferrals,
  cleanupOldAccounts,
} from "./social-store.js";

const router = Router();

const BIO_BLOCKED_SERVER = ["pute","merde","connard","connasse","enculé","fdp","ntm","nique","salope","batard","bâtard","putain","pd","encule","tg","ftg","suce","bite","couille","chier","fuck","shit","dick","cock","pussy","bitch","nigga","nigger","whore","slut","cunt","porn","hentai","sexe","nude","nudes","onlyfans","branlette","branle","sodomie","viol","rape","penis","vagin","prostitut","escort","milf","anal","threesome","gangbang","chatte"];
const BIO_LINK_SERVER = /https?:\/\/|www\.|\.com|\.fr|\.gg|\.tv|\.io|\.net|\.org|discord\.|twitch\.|twitter\.|instagram\.|tiktok\.|telegram\.|t\.me|bit\.ly|linktr\.ee|@[a-zA-Z]/i;

function validateBioServer(text) {
  if (!text || !text.trim()) return true;
  if (BIO_LINK_SERVER.test(text)) return false;
  const lower = text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  return !BIO_BLOCKED_SERVER.some((w) => lower.includes(w));
}

router.post("/api/social/register", (req, res) => {
  const { id, pseudo, avatar, bio, favTeams, points, pointsPerGame, xp, pseudoColor, equippedTitle, equippedBanner } = req.body;
  if (!id || !pseudo) return res.status(400).json({ error: "id and pseudo required" });
  const cleanBio = bio && !validateBioServer(bio) ? "" : bio;
  upsertUser({ id, pseudo, avatar, bio: cleanBio, favTeams, points, pointsPerGame, xp, pseudoColor, equippedTitle, equippedBanner });
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

router.post("/api/social/xp", (req, res) => {
  const { userId, amount } = req.body;
  if (!userId || !amount) return res.status(400).json({ error: "userId and amount required" });
  addXp(userId, amount);
  const user = getUser(userId);
  res.json({ ok: true, xp: user?.xp || 0 });
});

setXpByPseudo("ggez", 99999);

router.get("/api/referral/:userId", (req, res) => {
  const code = ensureReferralCode(req.params.userId);
  const count = getReferralCount(req.params.userId);
  const list = getReferrals(req.params.userId);
  res.json({ code, count, referrals: list });
});

router.post("/api/referral/apply", (req, res) => {
  const { code, userId } = req.body;
  if (!code || !userId) return res.status(400).json({ error: "Code et userId requis" });
  const referrer = getUserByReferralCode(code.toUpperCase());
  if (!referrer) return res.status(404).json({ error: "Code invalide" });
  const ok = applyReferral(referrer.id, userId);
  if (!ok) return res.status(409).json({ error: "Parrainage déjà appliqué" });
  res.json({ ok: true, xpGained: 200 });
});

router.post("/api/admin/cleanup-accounts", (req, res) => {
  const { secret } = req.body;
  if (secret !== (process.env.ADMIN_SECRET || "split-admin-2024")) {
    return res.status(403).json({ error: "Unauthorized" });
  }
  const deleted = cleanupOldAccounts(["AGZGZEGEZ"]);
  res.json({ ok: true, deleted });
});

export default router;
