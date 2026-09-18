import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { getUserByEmail, getUserByPseudo, createAuthUser, getUser, generateUserId } from "./social-store.js";

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

export default router;
