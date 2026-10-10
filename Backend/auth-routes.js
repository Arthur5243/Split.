import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { getUserByEmail, getUserByPseudo, createAuthUser, getUser, generateUserId, getUserCount, updatePseudo, deleteUser, mergeDuplicatesForEmail, canChangePseudo, consumePseudoChange, linkGoogleToUser, getUserBySupabaseId, linkSupabaseUser } from "./social-store.js";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || "split-secret-change-me";
const TOKEN_EXPIRY = "30d";

// Supabase Auth garde les emails/mots de passe. La clé publishable est
// publique par nature (elle est aussi dans le front).
const SUPABASE_URL = (process.env.SUPABASE_URL || "https://raonwislmntafqjfdgcg.supabase.co").replace(/\/+$/, "");
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || "sb_publishable_5x2JNoyFn15iX8ZL_8MilQ_Dmq5Prmj";

async function getSupabaseUser(accessToken) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${accessToken}` } });
  if (!r.ok) return null;
  return r.json();
}

async function checkSupabasePassword(email, password) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return r.ok;
}

// Un email "confirmé" chez Supabase ne prouve la possession de la boîte mail
// que si Supabase exige la confirmation (mailer_autoconfirm = false).
let supabaseSettings = { at: 0, autoconfirm: true };
async function supabaseRequiresEmailConfirm() {
  if (Date.now() - supabaseSettings.at > 10 * 60 * 1000) {
    try {
      const r = await fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: SUPABASE_KEY } });
      if (r.ok) supabaseSettings = { at: Date.now(), autoconfirm: (await r.json()).mailer_autoconfirm !== false };
    } catch {}
  }
  return !supabaseSettings.autoconfirm;
}

function bearerUserId(req) {
  const h = req.headers.authorization;
  if (!h || !h.startsWith("Bearer ")) return null;
  return verifyToken(h.slice(7))?.sub || null;
}

function publicUser(u, email) {
  return { id: u.id, pseudo: u.pseudo, email: email ?? u.email, provider: u.provider };
}

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

// Inscription email/mot de passe : faite côté app via Supabase Auth, puis
// échangée ici contre le token Split (/api/auth/supabase).
router.post("/api/auth/register", (_req, res) => {
  res.status(410).json({ error: "Mets à jour l'app (recharge la page) pour t'inscrire" });
});

// Ancien login (hash bcrypt local) : sert uniquement aux comptes pas encore
// passés sur Supabase. L'app crée alors le compte Supabase avec le même mot
// de passe ; le hash local est effacé dès la 1re connexion via Supabase.
router.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email et mot de passe requis" });

    const user = getUserByEmail(email.toLowerCase());
    if (!user || !user.password_hash) return res.status(401).json({ error: "Identifiants invalides" });

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: "Identifiants invalides" });

    const token = signToken(user.id);
    res.json({ token, user: publicUser(user), legacy: true });
  } catch (e) {
    console.error("[auth] login error:", e.message);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// Échange un access token Supabase contre le token Split. Retrouve le compte
// par supabase_id puis par email (comptes existants), sinon le crée.
router.post("/api/auth/supabase", async (req, res) => {
  try {
    const { access_token, pseudo } = req.body || {};
    if (!access_token) return res.status(400).json({ error: "Token manquant" });
    const sUser = await getSupabaseUser(access_token);
    if (!sUser || !sUser.id) return res.status(401).json({ error: "Session invalide, reconnecte-toi" });
    const email = sUser.email ? sUser.email.toLowerCase() : null;

    const linked = getUserBySupabaseId(sUser.id);
    if (linked) return res.json({ token: signToken(linked.id), user: publicUser(linked, email) });

    const byEmail = email ? getUserByEmail(email) : null;
    if (byEmail) {
      const proven = bearerUserId(req) === byEmail.id || (!!sUser.email_confirmed_at && await supabaseRequiresEmailConfirm());
      if (!proven || (byEmail.supabase_id && byEmail.supabase_id !== sUser.id)) {
        return res.status(409).json({ error: "Cet email a déjà un compte Split : connecte-toi avec ton ancien mot de passe ou avec Google" });
      }
      linkSupabaseUser(byEmail.id, sUser.id, email);
      return res.json({ token: signToken(byEmail.id), user: publicUser(byEmail, email) });
    }

    const wanted = (pseudo || sUser.user_metadata?.pseudo || "").trim();
    if (wanted.length < 2 || wanted.length > 20) return res.status(400).json({ error: "Choisis un pseudo (2 à 20 caractères)", needsPseudo: true });
    if (getUserByPseudo(wanted)) return res.status(409).json({ error: "Ce pseudo est déjà pris", needsPseudo: true });

    const id = generateUserId();
    createAuthUser({ id, email, passwordHash: null, pseudo: wanted, provider: "local" });
    linkSupabaseUser(id, sUser.id, email);
    res.json({ token: signToken(id), user: { id, pseudo: wanted, email, provider: "local" } });
  } catch (e) {
    console.error("[auth] supabase exchange error:", e.message);
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
    const allowedAud = [process.env.GOOGLE_CLIENT_ID, "623522920430-hsuokum2g502peet9q65vdm561indi1t.apps.googleusercontent.com"].filter(Boolean);
    if (!allowedAud.includes(gData.aud)) return res.status(401).json({ error: "Token Google invalide" });
    if (gData.email_verified === false || gData.email_verified === "false") return res.status(401).json({ error: "Email Google non vérifié" });
    const email = gData.email;
    if (!email) return res.status(401).json({ error: "Pas d'email dans le token Google" });

    let user = getUserByEmail(email.toLowerCase());
    if (user) {
      const token = signToken(user.id);
      return res.json({ token, user: { id: user.id, pseudo: user.pseudo, email: user.email } });
    }

    if (!pseudo || pseudo.length < 2) return res.status(400).json({ error: "Pseudo requis (2 caractères min)", needsPseudo: true });

    const existingPseudo = getUserByPseudo(pseudo);
    if (existingPseudo) {
      if (!existingPseudo.email) {
        linkGoogleToUser(existingPseudo.id, email.toLowerCase());
        const token = signToken(existingPseudo.id);
        return res.json({ token, user: { id: existingPseudo.id, pseudo: existingPseudo.pseudo, email: email.toLowerCase() } });
      }
      return res.status(409).json({ error: "Ce pseudo est déjà pris" });
    }

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
  res.json({ id: user.id, pseudo: user.pseudo, email: user.email, avatar: user.avatar, provider: user.provider, wipe_at: user.wipe_at || null, xp: user.xp || 0, points: user.points || 0, created_at: user.created_at || null });
});

router.patch("/api/auth/pseudo", authMiddleware, (req, res) => {
  try {
    const { pseudo } = req.body;
    if (!pseudo || pseudo.length < 2 || pseudo.length > 20) return res.status(400).json({ error: "Pseudo entre 2 et 20 caractères" });
    // Cooldown 15 jours (1 crédit gratuit à l'inscription)
    const check = canChangePseudo(req.userId);
    if (!check.allowed) return res.status(429).json({ error: check.reason, daysLeft: check.daysLeft });
    const existing = getUserByPseudo(pseudo);
    if (existing && existing.id !== req.userId) return res.status(409).json({ error: "Ce pseudo est déjà pris" });
    updatePseudo(req.userId, pseudo);
    consumePseudoChange(req.userId);
    res.json({ ok: true, pseudo });
  } catch (e) {
    console.error("[auth] pseudo change error:", e.message);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// Statut du crédit/cooldown pseudo (utilisé côté frontend pour afficher
// "1 changement gratuit dispo" ou "attends N jour(s)").
router.get("/api/auth/pseudo-status", authMiddleware, (req, res) => {
  res.json(canChangePseudo(req.userId));
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
    } else if (user.supabase_id && user.email && user.provider !== "google") {
      const { password } = req.body;
      if (!password) return res.status(400).json({ error: "Mot de passe requis pour confirmer" });
      if (!(await checkSupabasePassword(user.email, password))) return res.status(401).json({ error: "Mot de passe incorrect" });
    }
    deleteUser(req.userId);
    res.json({ ok: true });
  } catch (e) {
    console.error("[auth] delete account error:", e.message);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// Mot de passe oublié : géré par Supabase Auth (email envoyé par Supabase).

router.get("/api/auth/count", (_req, res) => {
  res.json({ count: getUserCount() });
});

// Admin: fusionne les comptes dupliqués pour un email donné.
// Ex: POST /api/admin/merge-account?key=<ADMIN_KEY>  { "email": "user@example.com" }
// Garde le compte "canonique" (celui avec email dans users.email) et transfère
// les points/xp/badges des doublons avec le même pseudo.
router.post("/api/admin/merge-account", (req, res) => {
  const ADMIN_KEY = process.env.ADMIN_KEY;
  if (!ADMIN_KEY || req.query.key !== ADMIN_KEY) {
    return res.status(403).json({ error: "Accès refusé" });
  }
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: "Email requis" });
  try {
    const result = mergeDuplicatesForEmail(email);
    res.json({ ok: true, ...result });
  } catch (e) {
    console.error("[admin] merge-account error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// Auto-appel au démarrage : fusionne les comptes de arthur.cambin@gmail.com
// (bug historique — l'user avait 138 points sur un compte unranked séparé).
try {
  const r = mergeDuplicatesForEmail("arthur.cambin@gmail.com");
  if (r.merged && r.merged.length > 0) {
    console.log(`[merge-boot] arthur.cambin@gmail.com: ${r.merged.length} doublon(s) fusionné(s), ${r.totalPointsMerged} pts transférés vers ${r.kept?.id}`);
  }
} catch (e) {
  console.log("[merge-boot] arthur.cambin skip:", e.message);
}

// Grant one-shot : donne 1 crédit de changement de pseudo au compte test
// "portable" après qu'un bug lui a bouffé son crédit. Guard par un fichier
// marker sur le volume Railway pour ne tourner qu'une fois.
try {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const dataDir = process.env.DB_PATH ? path.dirname(process.env.DB_PATH) : "/data";
  const marker = path.join(dataDir, ".pseudo_credit_portable_v1");
  if (!fs.existsSync(marker)) {
    const { grantPseudoChangeCredit } = await import("./social-store.js");
    const n = grantPseudoChangeCredit("portable.coffee%");
    try { fs.writeFileSync(marker, new Date().toISOString()); } catch {}
    console.log(`[grant-boot] portable.coffee*: ${n} compte(s) ont retrouvé un crédit pseudo (one-shot)`);
  }
} catch (e) {
  console.log("[grant-boot] portable skip:", e.message);
}

export default router;
