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
  setBetStats,
  pingUser,
  getOnlineStatus,
  getUserSync,
  mergeUserSync,
  getUserPoints,
  getUserHistory,
  getOracleLastUse,
  markOracleUse,
  getCommunityPredictionSplit,
} from "./social-store.js";
import { authMiddleware } from "./auth-routes.js";

const router = Router();

router.get("/api/sync", authMiddleware, (req, res) => {
  res.json({ ...getUserSync(req.userId), points: getUserPoints(req.userId) });
});

router.post("/api/sync", authMiddleware, (req, res) => {
  try {
    res.json({ ...mergeUserSync(req.userId, req.body || {}), points: getUserPoints(req.userId) });
  } catch (e) {
    console.error("[sync] merge error:", e.message);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

const BIO_BLOCKED_SERVER = ["pute","merde","connard","connasse","enculé","fdp","ntm","nique","salope","batard","bâtard","putain","pd","encule","tg","ftg","suce","bite","couille","chier","fuck","shit","dick","cock","pussy","bitch","nigga","nigger","whore","slut","cunt","porn","hentai","sexe","nude","nudes","onlyfans","branlette","branle","sodomie","viol","rape","penis","vagin","prostitut","escort","milf","anal","threesome","gangbang","chatte"];
const BIO_LINK_SERVER = /https?:\/\/|www\.|\.com|\.fr|\.gg|\.tv|\.io|\.net|\.org|discord\.|twitch\.|twitter\.|instagram\.|tiktok\.|telegram\.|t\.me|bit\.ly|linktr\.ee|@[a-zA-Z]/i;

function validateBioServer(text) {
  if (!text || !text.trim()) return true;
  if (BIO_LINK_SERVER.test(text)) return false;
  const lower = text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  return !BIO_BLOCKED_SERVER.some((w) => lower.includes(w));
}

router.post("/api/social/register", (req, res) => {
  const { id, pseudo, avatar, bio, favTeams, points, pointsPerGame, xp, pseudoColor, equippedTitle, equippedBanner, equippedBadge, equippedBadgeEmoji, equippedMatchBg, inventory, claimedTiers } = req.body;
  if (!id || !pseudo) return res.status(400).json({ error: "id and pseudo required" });
  const cleanBio = bio && !validateBioServer(bio) ? "" : bio;
  upsertUser({ id, pseudo, avatar, bio: cleanBio, favTeams, points, pointsPerGame, xp, pseudoColor, equippedTitle, equippedBanner, equippedBadge, equippedBadgeEmoji, equippedMatchBg, inventory, claimedTiers });
  res.json({ ok: true });
});

router.get("/api/social/me/:userId", (req, res) => {
  const user = getUser(req.params.userId);
  if (!user) return res.status(404).json({ error: "not found" });
  const stats = getSocialStats(req.params.userId);
  // Ping le user comme actif a chaque appel /me (frontend polle le profil assez souvent)
  pingUser(req.params.userId);
  res.json({ ...user, ...stats });
});

// Ping explicite (heartbeat). Appeler toutes les ~60s depuis le frontend.
router.post("/api/social/ping", (req, res) => {
  const { userId } = req.body || {};
  if (!userId) return res.status(400).json({ error: "userId required" });
  pingUser(userId);
  res.json({ ok: true });
});

// Statut en ligne de plusieurs users (comma-separated ids).
router.get("/api/social/online", (req, res) => {
  const raw = (req.query.ids || "").toString();
  const ids = raw.split(",").map(s => s.trim()).filter(Boolean).slice(0, 100);
  if (!ids.length) return res.json({});
  res.json(getOnlineStatus(ids));
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

router.get("/api/social/history/:userId", (req, res) => {
  const limit = Math.min(100, Math.max(10, parseInt(req.query.limit, 10) || 50));
  res.json(getUserHistory(req.params.userId, limit));
});

// Pouvoir Oracle : réservé aux titulaires du titre "Oracle" (palier 100).
// Renvoie la répartition des pronos de la communauté sur un match + consomme
// 1 utilisation (quota 1 par 7 jours glissants). Si le user n'a pas le titre
// ou dépasse le quota → 403.
const ORACLE_COOLDOWN_MS = 7 * 24 * 3600 * 1000;
router.post("/api/social/oracle/:matchId", authMiddleware, (req, res) => {
  const userId = req.userId;
  const u = getUser(userId);
  if (!u) return res.status(404).json({ error: "user not found" });
  if ((u.equipped_title || "").toLowerCase() !== "oracle") {
    return res.status(403).json({ error: "Titre Oracle requis (palier 100)" });
  }
  const last = getOracleLastUse(userId);
  if (last) {
    const elapsed = Date.now() - new Date(last).getTime();
    if (elapsed < ORACLE_COOLDOWN_MS) {
      return res.status(429).json({ error: "Oracle déjà utilisé cette semaine", nextAvailableMs: ORACLE_COOLDOWN_MS - elapsed });
    }
  }
  const split = getCommunityPredictionSplit(req.params.matchId);
  markOracleUse(userId);
  res.json({ ...split, usedAt: new Date().toISOString(), nextAvailableMs: ORACLE_COOLDOWN_MS });
});

// Statut Oracle sans consommer : savoir si le bouton doit être grisé.
router.get("/api/social/oracle-status", authMiddleware, (req, res) => {
  const u = getUser(req.userId);
  const hasTitle = !!(u && (u.equipped_title || "").toLowerCase() === "oracle");
  const last = getOracleLastUse(req.userId);
  const elapsed = last ? Date.now() - new Date(last).getTime() : Infinity;
  const available = elapsed >= ORACLE_COOLDOWN_MS;
  res.json({
    hasTitle,
    available,
    nextAvailableMs: available ? 0 : (ORACLE_COOLDOWN_MS - elapsed),
    lastUsedAt: last || null,
  });
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

// Push stats de paris (calcul cote client) pour que les autres users voient
// bons paris / paris exacts / total quand ils visitent un profil.
router.post("/api/social/bet-stats", (req, res) => {
  const { userId, correct, exact, total } = req.body;
  if (!userId) return res.status(400).json({ error: "userId required" });
  setBetStats(userId, correct || 0, exact || 0, total || 0);
  res.json({ ok: true });
});

// Retire: setXpByPseudo("ggez", 99999); boostait un compte test au boot.

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
