import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { getUserByEmail, getUserByPseudo, createAuthUser, getUser, generateUserId, getUserCount, updatePseudo, deleteUser, setResetToken, getUserByResetToken, clearResetToken, updatePassword } from "./social-store.js";
import crypto from "crypto";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || "split-secret-change-me";
const TOKEN_EXPIRY = "30d";

function signToken(userId) {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

export function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) return res.status(401).json({ error: "Non authentifié" });
  const payload = verifyToken(header.slice(7));
  if (!payload) return res.status(401).json({ error: "Token invalide" });
  req.userId = payload.sub;
  next();
}

router.post("/api/auth/register", async (req, res) => {
  try {
    const { email, password, pseudo } = req.body;
    if (!email || !password || !pseudo) return res.status(400).json({ error: "Email, mot de passe et pseudo requis" });
    if (password.length < 6) return res.status(400).json({ error: "Mot de passe trop court (6 caractères min)" });
    if (pseudo.length < 2 || pseudo.length > 20) return res.status(400).json({ error: "Pseudo entre 2 et 20 caractères" });

    const existing = getUserByEmail(email.toLowerCase());
    if (existing) return res.status(409).json({ error: "Email déjà utilisé" });

    const existingPseudo = getUserByPseudo(pseudo);
    if (existingPseudo) return res.status(409).json({ error: "Ce pseudo est déjà pris" });

    const id = generateUserId();
    const hash = await bcrypt.hash(password, 10);
    createAuthUser({ id, email: email.toLowerCase(), passwordHash: hash, pseudo, provider: "local" });

    const token = signToken(id);
    res.json({ token, user: { id, pseudo, email: email.toLowerCase() } });
  } catch (e) {
    console.error("[auth] register error:", e.message);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email et mot de passe requis" });

    const user = getUserByEmail(email.toLowerCase());
    if (!user || !user.password_hash) return res.status(401).json({ error: "Identifiants invalides" });

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: "Identifiants invalides" });

    const token = signToken(user.id);
    res.json({ token, user: { id: user.id, pseudo: user.pseudo, email: user.email } });
  } catch (e) {
    console.error("[auth] login error:", e.message);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.post("/api/auth/google", async (req, res) => {
  try {
    const { credential, pseudo } = req.body;
    if (!credential) return res.status(400).json({ error: "Token Google manquant" });

    const gRes = await fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + credential);
    if (!gRes.ok) return res.status(401).json({ error: "Token Google invalide" });
    const gData = await gRes.json();
    const email = gData.email;
    if (!email) return res.status(401).json({ error: "Pas d'email dans le token Google" });

    let user = getUserByEmail(email.toLowerCase());
    if (user) {
      const token = signToken(user.id);
      return res.json({ token, user: { id: user.id, pseudo: user.pseudo, email: user.email } });
    }

    if (!pseudo || pseudo.length < 2) return res.status(400).json({ error: "Pseudo requis (2 caractères min)", needsPseudo: true });

    const existingPseudo = getUserByPseudo(pseudo);
    if (existingPseudo) return res.status(409).json({ error: "Ce pseudo est déjà pris" });

    const id = generateUserId();
    createAuthUser({ id, email: email.toLowerCase(), passwordHash: null, pseudo, provider: "google" });
    const token = signToken(id);
    res.json({ token, user: { id, pseudo, email: email.toLowerCase() } });
  } catch (e) {
    console.error("[auth] google error:", e.message);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.get("/api/auth/me", (req, res) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) return res.status(401).json({ error: "Non authentifié" });
  const payload = verifyToken(header.slice(7));
  if (!payload) return res.status(401).json({ error: "Token invalide" });
  const user = getUser(payload.sub);
  if (!user) return res.status(404).json({ error: "Utilisateur introuvable" });
  res.json({ id: user.id, pseudo: user.pseudo, email: user.email, avatar: user.avatar, provider: user.provider });
});

router.patch("/api/auth/pseudo", authMiddleware, (req, res) => {
  try {
    const { pseudo } = req.body;
    if (!pseudo || pseudo.length < 2 || pseudo.length > 20) return res.status(400).json({ error: "Pseudo entre 2 et 20 caractères" });
    const existing = getUserByPseudo(pseudo);
    if (existing && existing.id !== req.userId) return res.status(409).json({ error: "Ce pseudo est déjà pris" });
    updatePseudo(req.userId, pseudo);
    res.json({ ok: true, pseudo });
  } catch (e) {
    console.error("[auth] pseudo change error:", e.message);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.delete("/api/auth/account", authMiddleware, async (req, res) => {
  try {
    const user = getUser(req.userId);
    if (!user) return res.status(404).json({ error: "Utilisateur introuvable" });
    if (user.password_hash) {
      const { password } = req.body;
      if (!password) return res.status(400).json({ error: "Mot de passe requis pour confirmer" });
      const match = await bcrypt.compare(password, user.password_hash);
      if (!match) return res.status(401).json({ error: "Mot de passe incorrect" });
    }
    deleteUser(req.userId);
    res.json({ ok: true });
  } catch (e) {
    console.error("[auth] delete account error:", e.message);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.post("/api/auth/forgot-password", (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email requis" });
    const user = getUserByEmail(email.toLowerCase());
    if (!user) return res.json({ ok: true });
    if (user.provider === "google") return res.status(400).json({ error: "Ce compte utilise Google. Connecte-toi avec Google." });
    const token = crypto.randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 3600000).toISOString();
    setResetToken(email.toLowerCase(), token, expires);
    const resetUrl = (process.env.FRONTEND_URL || "https://app.splitapp.fr") + "?reset=" + token;
    console.log(`[auth] Password reset for ${email}: ${resetUrl}`);
    res.json({ ok: true, resetUrl });
  } catch (e) {
    console.error("[auth] forgot-password error:", e.message);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.post("/api/auth/reset-password", async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ error: "Token et mot de passe requis" });
    if (password.length < 6) return res.status(400).json({ error: "Mot de passe trop court (6 caractères min)" });
    const user = getUserByResetToken(token);
    if (!user) return res.status(400).json({ error: "Lien expiré ou invalide" });
    const hash = await bcrypt.hash(password, 10);
    updatePassword(user.id, hash);
    clearResetToken(user.id);
    const jwt = signToken(user.id);
    res.json({ ok: true, token: jwt, user: { id: user.id, pseudo: user.pseudo, email: user.email } });
  } catch (e) {
    console.error("[auth] reset-password error:", e.message);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.get("/api/auth/count", (_req, res) => {
  res.json({ count: getUserCount() });
});

export default router;
